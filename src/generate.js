// Building a level that can be solved without a single guess.
//
// This runs in the level editor, not in the game: the game only ever plays
// levels that were generated here, looked at by a person, and locked in. So the
// generator's job is to meet a spec exactly or say it could not -- it never
// quietly loosens a setting to get a board out, because then the editor's
// sliders would stop meaning what they say.
//
// The rule every deal is built to is stronger than having one answer: it must
// be solvable by elimination (deduce.js) at the tier the spec allows, which is
// how much the animals of a deal may lean on each other. One answer comes free
// with that, because the answer always survives elimination -- every clue is
// true of it.
//
// The order of work is: cut the lands, decide where every animal ends up, set
// down the landmarks, and only then work out what the animals are allowed to
// say. Choosing the answer first is what makes the guarantee cheap -- every clue
// in the pool is a true statement about the finished board by construction, so
// adding clues can only ever narrow the player's options towards the answer
// and never away from it.

import {
  BINARY,
  BOARD_FACTS,
  FAMILY,
  LANDMARK_KINDS,
  RANK,
  UNARY,
  boardContext,
  holds,
  kindsFor,
  ideas,
  longestList,
  sentenceCount,
  sizeLead,
  zoneRim,
} from './clues.js';
import { footholds, groupClues, isSolved, narrow, openness, sentenceReach } from './deduce.js';
import { LANDMARKS, pickLands, readAnimal } from './habitats.js';
import { evenSizes, makeZones, variedSizes } from './zones.js';
import { manhattan, neighbours, range, shuffle } from './util.js';

/** Colours on a board: every level draws three lands from the pool. */
const COLOURS = 3;

/** Most animals one deal can bring. */
export const MAX_DEAL = 4;

/** Most lands a board can have -- each colour has six animals to cast. */
const MAX_LANDS = 18;

/** Smallest and largest board the editor offers. */
export const SIZES = { min: 5, max: 9 };

/** Most landmarks a level can have. */
export const MAX_LANDMARKS = 3;

/**
 * How many lands a board of side N can be cut into, for deals of `size`
 * animals: a whole number of deals, at least one land of each colour, and no
 * land smaller than four squares on average -- below that, a land is barely a
 * place.
 */
export function landOptions(N, size = 3) {
  const out = [];
  const most = Math.min(MAX_LANDS, Math.floor((N * N) / 4));
  for (let n = size; n <= most; n += size) if (n >= COLOURS) out.push(n);
  return out;
}

/**
 * The size of each deal, in order. A deal brings one to four animals: one at a
 * time is the gentlest way in -- a single card, a single place to find -- and
 * four at once is the most to hold in the head. Lands that do not split evenly
 * leave the last deal smaller.
 */
export function dealSizes(spec) {
  const size = Math.max(1, Math.min(MAX_DEAL, spec.dealSize ?? 3));
  const out = [];
  for (let left = spec.lands; left > 0; left -= size) out.push(Math.min(size, left));
  return out;
}

/** A spec the editor starts from, and the shape every spec has. */
export const DEFAULT_SPEC = {
  N: 6, // board side
  lands: 6, // how many lands; one animal each
  tier: 0, // how much a deal's animals may lean on each other -- see deduce.js
  vocab: 0, // how far along VOCABULARY the clues may reach -- 0 is one plain fact at a time
  spare: 1, // clues per deal beyond the minimum, as confirmation
  perCard: 2, // most sentences any one card may carry
  landmarks: 2, // most fixed things on the board; any no clue mentions are taken away
  varied: true, // lands of clearly different sizes, so one can be "the biggest"
  coords: false, // allow "I'm in row 3" -- plain, but it hands the answer over
  dealSize: 3, // animals a deal brings at once, 1 to 4 -- see dealSizes
  depth: 1, // fewest squares any one sentence may leave an animal -- see chooseClues
  pairs: 0, // swaps that give two deals each two animals of one colour -- see dealColours
  footholds: null, // animals per deal their own card places, exactly -- a number, or one per deal; null for any -- see footholdsAt
};

/**
 * How many starting points deal `round` should have, or null for any. A level
 * can give one number for every deal, or a list, one per deal (the last
 * repeating) -- so its last deal can be its hardest: [1, 1, 0, 0] is a level
 * whose first two deals each offer one animal to start from and whose last
 * two offer none. Standing alone, every animal is a starting point anyway.
 */
export function footholdsAt(spec, round) {
  const f = spec.footholds;
  if (spec.tier === 0 || f == null) return null;
  if (Array.isArray(f)) return f.length ? f[Math.min(round, f.length - 1)] : null;
  return f;
}

/**
 * The kinds a level may say. On an odd board the middle row is in neither
 * half, which is exact but not something the first two rungs should lean on,
 * so halves wait for Lines there.
 */
function allowedKinds(spec) {
  const halves = ['top', 'bottom', 'left', 'right'];
  const kinds = kindsFor(spec.vocab, spec.coords);
  return spec.N % 2 === 1 && spec.vocab < 2 ? kinds.filter((k) => !halves.includes(k)) : kinds;
}

/**
 * Most swaps a level can take: each one needs two deals of three of its own.
 * Deals of four bring two of a colour anyway -- there are only three colours --
 * and deals of one or two are kept to one of each.
 */
export const maxPairs = (lands, size = 3) => (size === 3 ? Math.floor(lands / 3 / 2) : 0);

/** Kinds that read the same both ways round, so one of the pair is redundant. */
const MIRROR = {
  touch: 'touch',
  notTouch: 'notTouch',
  corners: 'corners',
  notCorners: 'notCorners',
  sameRow: 'sameRow',
  notSameRow: 'notSameRow',
  sameCol: 'sameCol',
  notSameCol: 'notSameCol',
  steps: 'steps',
  zoneTouch: 'zoneTouch',
  above: 'below',
  below: 'above',
  leftOf: 'rightOf',
  rightOf: 'leftOf',
};

const landmarkOf = (cl) => (cl.m != null && cl.m >= 0 ? cl.m : -1);

const secondOf = (cl) => (cl.m2 != null && cl.m2 >= 0 ? `m${cl.m2}` : cl.b2 != null && cl.b2 >= 0 ? `a${cl.b2}` : '');

const sameClue = (x, y) =>
  x.k === y.k &&
  x.a === y.a &&
  x.b === y.b &&
  x.n === y.n &&
  landmarkOf(x) === landmarkOf(y) &&
  secondOf(x) === secondOf(y);

/** Would showing both of these just say one thing twice? */
function echoes(x, y) {
  if (sameClue(x, y)) return true;
  if (landmarkOf(x) >= 0 || landmarkOf(y) >= 0) return false;
  return MIRROR[x.k] === y.k && x.a === y.b && x.b === y.a && x.n === y.n;
}

/**
 * Would a clue tell the player nothing that what is already shown does not?
 * "I'm in a corner" already says "I'm on an edge"; "I'm next to the flamingo"
 * already says "I'm next to Desert" when the flamingo can only stand in
 * Desert; and "I'm in a corner" with "I'm not on the top edge" already says
 * "I'm on the bottom edge", though neither says it alone. A card that adds
 * such a clue reads like it is padding.
 *
 * Only the shown clues about this clue's own animals can imply it, so the test
 * walks those animals' squares: if every square where all of them hold is one
 * where this clue holds too, it has nothing to add. Animals from earlier deals
 * are fixed, so a clue about one of them is really about the animal alone.
 */
function impliedBy(shown, cl, cand, ctx, work, subs) {
  const own = (c) => [c.a, c.b].filter((id) => subs.includes(id));
  const scope = own(cl);
  const relevant = shown.filter((c) => own(c).every((id) => scope.includes(id)));
  if (!relevant.length) return false;
  const all = () => relevant.every((c) => holds(c, ctx, work) === true);

  const ai = subs.indexOf(cl.a);
  const bi = cl.b >= 0 ? subs.indexOf(cl.b) : -1;
  if (bi < 0) {
    for (const cell of cand[ai]) {
      work[cl.a] = cell;
      if (all() && holds(cl, ctx, work) !== true) return false;
    }
    return true;
  }
  for (const ca of cand[ai]) {
    work[cl.a] = ca;
    for (const cb of cand[bi]) {
      work[cl.b] = cb;
      if (all() && holds(cl, ctx, work) !== true) return false;
    }
  }
  return true;
}

/**
 * Which land gets which colour. Every colour gets the same number of lands, so
 * each deal can offer one animal of each right up to the last -- pairs swap
 * animals between deals and keep that count (see dealColours). When sizes
 * vary, the lands are taken three at a time from biggest to smallest and the
 * colours shared out within each three -- so each colour gets a big land and
 * a small one, and "the biggest Meadow" is a thing a board can have.
 */
function colourLands(zones, count, rng) {
  const bySize = shuffle(range(count), rng).sort(
    (x, y) => zones.zoneCells[y].length - zones.zoneCells[x].length
  );
  const zoneLand = new Int8Array(count);
  for (let k = 0; k < count; k += COLOURS) {
    const colours = shuffle(range(COLOURS), rng);
    for (let c = 0; c < COLOURS && k + c < count; c++) zoneLand[bySize[k + c]] = colours[c];
  }
  return zoneLand;
}

/**
 * The colours of each deal's animals. A deal of up to three is one of each; a
 * deal of four has to double one. A pair swaps one animal between two deals of
 * three: one gives up its Ocean for a second
 * Meadow and the other takes that Ocean for its Meadow, so each colour still
 * has as many lands as animals, and both deals now hold two animals of one
 * colour.
 *
 * Two animals of one colour is a way to be vague at first and exact in the
 * end. Each could stand in either land of their colour, so neither card has to
 * say which -- but a land takes one animal, so the moment one of them is
 * confined to a land, the other is shut out of it.
 */
function dealColours(sizes, counts, pairs, rng) {
  // One of each where the deal has room, drawing on whichever colour has the
  // most lands still to deal, so the last deals are not left with a pile of
  // one colour. A deal of four always doubles one.
  const left = counts.slice();
  const deals = sizes.map((size) => {
    const cols = [];
    for (let k = 0; k < size; k++) {
      const order = shuffle(range(COLOURS), rng).sort((x, y) => left[y] - left[x]);
      const fresh = order.filter((h) => left[h] > 0 && !cols.includes(h));
      const h = fresh.length ? fresh[0] : order.find((h) => left[h] > 0);
      cols.push(h);
      left[h]--;
    }
    return cols;
  });
  if (pairs) {
    const plain = shuffle(range(deals.length), rng).filter((r) => deals[r].length === 3 && new Set(deals[r]).size === 3);
    for (let p = 0; p < pairs && 2 * p + 1 < plain.length; p++) {
      const [gets, gives] = [deals[plain[2 * p]], deals[plain[2 * p + 1]]];
      const [twice, moved] = shuffle(range(COLOURS), rng);
      gets[gets.indexOf(moved)] = twice;
      gives[gives.indexOf(twice)] = moved;
    }
  }
  return deals.map((cols) => cols.sort((x, y) => x - y));
}

/**
 * Which lands are dealt together. Pairing lands that share a border is what
 * puts a deal's animals within reach of each other, so that "I'm next to the
 * fish and the lion" is a sentence this game can produce.
 */
function groupRounds(zones, byLand, sizes, pairs, rng) {
  let best = null;
  let bestScore = -Infinity;
  const counts = byLand.map((list) => list.length);
  for (let t = 0; t < 60; t++) {
    const lists = byLand.map((list) => shuffle([...list], rng));
    const groups = dealColours(sizes, counts, pairs, rng).map((cols) => cols.map((h) => lists[h].pop()));
    let score = 0;
    for (const g of groups) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) if (zones.zoneAdj[g[i]].has(g[j])) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = groups;
    }
  }
  return best;
}

/**
 * Where in its land each of a deal's animals ends up. For a deal whose
 * animals may lean on each other, they are stood near each other, which is
 * what gives them something to say about each other. For a deal where each
 * stands alone, anywhere will do: the landmarks are set down near them
 * afterwards, which gives even a square in the middle of a land something to
 * be described by. (Steering them to edges and corners instead, where a square
 * is easiest to describe on its own, is what made the first levels say "I'm on
 * the ___ edge" in every other sentence.)
 */
function placeTrio(R, zones, group, tier, rng) {
  const lists = group.map((z) => zones.zoneCells[z]);
  if (tier === 0 || lists.length === 1) return lists.map((cells) => cells[(rng() * cells.length) | 0]);
  const score = (cells) => {
    let v = 0;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const d = manhattan(R, cells[i], cells[j]);
        v += (d === 1) * 6 + (d === 2) * 2 - d * 0.25;
      }
    }
    return v;
  };
  // every seating for up to three animals; for four, too many to list, a sample
  const seatings = [];
  if (lists.length <= 3) {
    const walk = (k, acc) => {
      if (k === lists.length) return void seatings.push(acc);
      for (const i of lists[k]) walk(k + 1, [...acc, i]);
    };
    walk(0, []);
  } else {
    for (let t = 0; t < 4000; t++) seatings.push(lists.map((cells) => cells[(rng() * cells.length) | 0]));
  }
  const scored = seatings.map((cells) => ({ cells, score: score(cells) })).sort((x, y) => y.score - x.score);
  const shortlist = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.15)));
  return shortlist[(rng() * shortlist.length) | 0].cells;
}

/**
 * A square of these, as close as the land allows to one of the given squares --
 * right beside one if it can, since at the plainer rungs "I'm next to the fox"
 * is the only way to lean on another animal at all.
 */
function besideAny(R, cells, near, rng) {
  const dist = (i) => Math.min(...near.map((j) => manhattan(R, i, j)));
  const closest = Math.min(...cells.map(dist));
  const top = cells.filter((i) => dist(i) <= Math.max(closest, 1));
  return top[(rng() * top.length) | 0];
}

/**
 * Where the animals go on a level meant to be read one fact at a time.
 *
 * The first levels ask each animal to be found from one short, positive fact
 * -- "I'm in a corner of the board", "I'm next to the tree". Placing animals
 * at random and hoping such a fact exists almost never works: on a 6 x 6 board
 * a random square is picked out by no single fact at all. So it is done the
 * other way round. Each animal either goes on a square that one board fact
 * already picks out among every square its colour could take -- the only
 * corner, the only square beside Desert -- or anywhere, with a note that a
 * landmark should be set down beside it so that "I'm next to the tree" does
 * the picking.
 *
 * Which kind of fact picks out each animal is chosen to spread them across the
 * level: the kind used least so far wins. With one fact to a card and only a
 * handful of kinds to choose from, leaving it to chance puts "I'm in a corner
 * of the board" on two cards of three.
 *
 * With depth, the same is done with two facts instead of one: the animal goes
 * where two facts meet, each of which alone leaves it at least `depth` squares
 * -- "I'm on the board's top edge" and "I'm next to Ocean", true together of
 * one square only. One of the two may be a landmark still to be set down,
 * beside several of the animal's squares but only one the other fact allows.
 */
function placeSimply(R, zones, zoneLand, zoneRound, group, round, rng, wants, plan, allow, depth = 1) {
  // the board as clues see it, before any landmark is set down -- which is why
  // only BOARD_FACTS are asked of it
  const quick = {
    R,
    zoneOf: zones.zoneOf,
    zoneAdj: zones.zoneAdj,
    zoneLand,
    zoneSize: zones.zoneCells.map((cells) => cells.length),
    zoneRim: zoneRim(R, zones),
    landmarks: [],
  };
  const pos = new Int32Array(1);
  const truth = (fact, i) => {
    pos[0] = i;
    return holds(fact, quick, pos) === true;
  };
  const colours = [...new Set(zoneLand)];
  return group.map((z) => {
    const h = zoneLand[z];
    const cands = [];
    for (let y = 0; y < zones.count; y++) {
      if (zoneLand[y] === h && zoneRound[y] >= round) cands.push(...zones.zoneCells[y]);
    }
    // every fact about a square alone that this level may say
    const facts = [];
    for (const k of BOARD_FACTS) {
      if (!allow.has(k)) continue;
      if (['biggest', 'smallest', 'notBiggest'].includes(k) && !sizeFair(k, quick, z)) continue;
      if (k === 'side' || k === 'notSide') for (let n = 0; n < 4; n++) facts.push({ k, n });
      else if (k === 'nearLand' || k === 'notNearLand' || k === 'landBorders') {
        for (const n of colours) if (n !== h) facts.push({ k, n });
      } else if (k === 'landsAround') for (const n of [2, 3]) facts.push({ k, n });
      else if (k === 'landSize') for (const n of new Set(cands.map((i) => quick.zoneSize[zones.zoneOf[i]]))) facts.push({ k, n });
      else facts.push({ k, n: 0 });
    }
    for (const fact of facts) Object.assign(fact, { a: 0, b: -1 });
    // every square of this land that one fact picks out -- or, with depth, two
    // broad ones together -- by the kinds of fact that do it, and how broad
    // the sharper of the two is there
    const byKind = new Map();
    const note = (kinds, i, partner = null, broad = 1) => {
      const key = kinds.join('|');
      if (!byKind.has(key)) byKind.set(key, { kinds, cells: [], partner: new Map(), broad: new Map() });
      const way = byKind.get(key);
      if (!way.broad.has(i)) way.cells.push(i);
      if (broad >= (way.broad.get(i) ?? 0)) {
        way.broad.set(i, broad);
        if (partner) way.partner.set(i, partner);
        else way.partner.delete(i);
      }
    };
    if (depth <= 1) {
      for (const i of zones.zoneCells[z]) {
        for (const fact of facts) {
          if (truth(fact, i) && cands.every((j) => j === i || !truth(fact, j))) note([fact.k], i);
        }
      }
    } else {
      const floor = Math.min(depth, Math.max(1, cands.length - 1));
      const broad = facts
        .map((fact) => ({ fact, where: new Set(cands.filter((j) => truth(fact, j))) }))
        .filter((f) => f.where.size >= floor && f.where.size < cands.length);
      for (const i of zones.zoneCells[z]) {
        const mine = broad.filter((f) => f.where.has(i));
        for (let x = 0; x < mine.length; x++) {
          for (let y = x + 1; y < mine.length; y++) {
            const [f, g] = [mine[x], mine[y]];
            if (sentenceCount([f.fact, g.fact]) !== 2) continue; // would fold into one sharp sentence
            if ([...f.where].some((j) => j !== i && g.where.has(j))) continue;
            note([f.fact.k, g.fact.k].sort(), i, null, Math.min(f.where.size, g.where.size));
          }
        }
      }
      // Or one board fact and a landmark still to be set down: beside the
      // animal and beside at least `floor` of its squares, but beside no other
      // square the board fact allows. Without this, nearly every pair of simple
      // facts that meet is "I'm next to <colour>" and something.
      if (plan.landmarksLeft > 0 && allow.has('touch')) {
        for (const i of zones.zoneCells[z]) {
          for (const f of broad) {
            if (!f.where.has(i)) continue;
            let spot = 0;
            for (const L of neighbours(R, i)) {
              const near = cands.filter((j) => manhattan(R, j, L) === 1);
              if (near.length >= floor && near.every((j) => j === i || !f.where.has(j))) spot = Math.max(spot, near.length);
            }
            if (spot) note(['touch', f.fact.k].sort(), i, { floor, where: f.where }, Math.min(spot, f.where.size));
          }
        }
      }
      // Or a board fact and "the tree is in my land": a landmark set down in
      // this land, which then points at every square of it, and a fact true
      // of just one of them.
      if (plan.landmarksLeft > 0 && allow.has('markInLand') && zones.zoneCells[z].length >= Math.max(4, floor + 1)) {
        const land = zones.zoneCells[z];
        for (const i of land) {
          for (const f of broad) {
            if (!f.where.has(i) || land.some((j) => j !== i && f.where.has(j))) continue;
            note(['markInLand', f.fact.k].sort(), i, { inLand: z }, Math.min(land.length - 1, f.where.size));
          }
        }
      }
    }
    // Which way: the kinds said least so far across the level, then the
    // broadest -- a meet of two facts that each leave four squares is worth a
    // repeated kind, and the whole point of depth.
    const used = (k) => plan.usage.get(FAMILY[k] ?? k) || 0;
    const ways = [...byKind.values()];
    if (depth <= 1 && plan.landmarksLeft > 0 && allow.has('touch')) ways.push({ kinds: ['touch'], cells: null });
    const broadest = (way) => (way.cells ? Math.max(...way.cells.map((i) => way.broad.get(i))) : 1);
    const cost = (way) => way.kinds.reduce((s, k) => s + used(k), 0) - (depth > 1 ? 1.5 * Math.log2(broadest(way)) : 0);
    const least = Math.min(...ways.map(cost));
    const fresh = ways.filter((way) => cost(way) <= least + 1e-9);
    const way = fresh.length ? fresh[(rng() * fresh.length) | 0] : null;
    for (const k of way?.kinds ?? []) plan.usage.set(FAMILY[k] ?? k, used(k) + 1);
    const kind = way?.cells ? 'board' : way ? 'touch' : null;

    if (kind === 'board') {
      const top = broadest(way);
      const best = way.cells.filter((i) => way.broad.get(i) === top);
      const cell = best[(rng() * best.length) | 0];
      const partner = way.partner.get(cell);
      if (partner) {
        plan.landmarksLeft--;
        wants.push({ cell, cands, ...partner });
      }
      return cell;
    }
    // a landmark will do the picking -- or, with none left, chance will
    const cells = zones.zoneCells[z];
    const cell = cells[(rng() * cells.length) | 0];
    if (kind === 'touch') {
      plan.landmarksLeft--;
      wants.push({ cell, cands });
    }
    return cell;
  });
}

/**
 * Set down the landmarks: never on an animal's square, never two in one land,
 * spread apart, and only in lands big enough to lose a square. A landmark is
 * only worth having if some animal can mention it, so they are drawn to
 * squares near the animals -- close enough that "I'm next to the tree" or
 * "I'm in the tent's row" has a chance of being true, and of being useful.
 */
function placeLandmarks(R, zones, animals, count, rng, wants = []) {
  const answers = new Set(animals.map((a) => a.cell));
  const placed = [];
  const names = shuffle([...LANDMARKS], rng).slice(0, count);

  // First, animals waiting on a landmark to pick them out (see placeSimply): a
  // landmark right beside the animal, and beside no other square its colour
  // could take, makes "I'm next to the tree" name exactly one square. With
  // depth it is the other way about: beside several of its squares, so the
  // sentence stays broad, and beside no other square the board fact it is
  // paired with allows, so the two meet on one.
  for (const want of shuffle([...wants], rng)) {
    if (placed.length >= names.length) break;
    const used = new Set(placed.map((l) => zones.zoneOf[l.cell]));
    const options = [];
    for (let i = 0; i < R.cells; i++) {
      const z = zones.zoneOf[i];
      if (answers.has(i) || used.has(z) || zones.zoneCells[z].length < 4) continue;
      if (placed.some((l) => manhattan(R, l.cell, i) < 2)) continue;
      // "the tree is in my land": anywhere in the animal's land but its own square
      if (want.inLand != null) {
        if (z === want.inLand) options.push(i);
        continue;
      }
      if (manhattan(R, i, want.cell) !== 1) continue;
      const near = want.cands.filter((j) => j !== want.cell && manhattan(R, i, j) === 1);
      if (want.where) {
        if (near.length + 1 < want.floor || near.some((j) => want.where.has(j))) continue;
      } else if (near.length) continue;
      options.push(i);
    }
    if (!options.length) continue;
    const { icon, name } = readAnimal(names[placed.length]);
    placed.push({ icon, name, cell: options[(rng() * options.length) | 0] });
  }

  for (const entry of names.slice(placed.length)) {
    const used = new Set(placed.map((l) => zones.zoneOf[l.cell]));
    const options = [];
    for (let i = 0; i < R.cells; i++) {
      const z = zones.zoneOf[i];
      if (answers.has(i) || used.has(z) || zones.zoneCells[z].length < 4) continue;
      if (placed.some((l) => manhattan(R, l.cell, i) < 3)) continue;
      const near = animals.filter((a) => manhattan(R, a.cell, i) <= 2).length;
      options.push({ i, score: near + rng() * 1.5 });
    }
    if (!options.length) break;
    options.sort((x, y) => y.score - x.score);
    const top = options.slice(0, Math.max(1, Math.ceil(options.length * 0.25)));
    const { icon, name } = readAnimal(entry);
    placed.push({ icon, name, cell: top[(rng() * top.length) | 0].i });
  }
  return placed;
}

// --- what the animals are allowed to say -----------------------------------

/**
 * "I'm in the biggest Meadow" is only fair when you can see it: the land has
 * to beat every other Meadow by two squares or more. A one-square lead is
 * still true, but it asks the player to count squares carefully rather than
 * to look.
 */
const PLAIN_LEAD = 2;

function sizeFair(k, ctx, zone) {
  const lead = sizeLead(ctx, zone);
  if (k === 'biggest') return lead.big >= PLAIN_LEAD;
  if (k === 'smallest') return lead.small >= PLAIN_LEAD;
  // "not the biggest": fair only if there is a plain biggest, and this is not it
  const colour = ctx.zoneLand[zone];
  return ctx.zoneSize.some(
    (_, y) => y !== zone && ctx.zoneLand[y] === colour && sizeLead(ctx, y).big >= PLAIN_LEAD
  );
}

function buildPool(ctx, subs, earlier, kinds, solution) {
  const pool = [];
  const allow = new Set(kinds);
  const push = (cl) => {
    if (!allow.has(cl.k)) return;
    if (holds(cl, ctx, solution) === true) pool.push(cl);
  };
  const SIZE = new Set(['biggest', 'smallest', 'notBiggest']);

  for (const a of subs) {
    const zone = ctx.zoneOf[solution[a]];
    for (const k of UNARY) {
      if (SIZE.has(k) && !sizeFair(k, ctx, zone)) continue;
      push({ k, a, b: -1, n: 0 });
    }
    for (let side = 0; side < 4; side++) {
      push({ k: 'side', a, b: -1, n: side });
      push({ k: 'notSide', a, b: -1, n: side });
    }
    // only other colours are named: "I'm next to Savanna" said from inside
    // Savanna would be true of half the land and read like a riddle
    for (let h = 0; h < ctx.lands.length; h++) {
      if (h === ctx.animals[a].land) continue;
      push({ k: 'nearLand', a, b: -1, n: h });
      push({ k: 'notNearLand', a, b: -1, n: h });
      push({ k: 'landBorders', a, b: -1, n: h });
    }
    for (const n of [2, 3]) push({ k: 'landsAround', a, b: -1, n });
    push({ k: 'landSize', a, b: -1, n: ctx.zoneSize[zone] });
    push({ k: 'inRow', a, b: -1, n: ctx.R.row(solution[a]) });
    push({ k: 'inColumn', a, b: -1, n: ctx.R.col(solution[a]) });

    // Landmarks are fixed from the first deal, so everything said about one is
    // a fact the animal's own card can stand on.
    ctx.landmarks.forEach((mark, m) => {
      for (const k of LANDMARK_KINDS) {
        if (k !== 'steps') push({ k, a, b: -1, n: 0, m });
      }
      push({ k: 'markInLand', a, b: -1, n: 0, m });
      const d = manhattan(ctx.R, solution[a], mark.cell);
      if (d >= 2 && d <= 5) push({ k: 'steps', a, b: -1, n: d, m });
    });

    // Naming a distant animal from an earlier deal is technically true and
    // practically useless -- the player cannot see the relationship. Keep to
    // the near ones, which also holds the pool down to a size worth scanning.
    const near = [...earlier]
      .sort((x, y) => manhattan(ctx.R, solution[a], solution[x]) - manhattan(ctx.R, solution[a], solution[y]))
      .slice(0, 4);

    for (const b of [...subs, ...near]) {
      if (b === a) continue;
      for (const k of BINARY) push({ k, a, b, n: 0 });
      const d = manhattan(ctx.R, solution[a], solution[b]);
      if (d >= 2 && d <= 5) push({ k: 'steps', a, b, n: d });
    }

    // Facts that name two things. The second is always fixed -- a landmark or
    // an animal already placed -- so the fact still ties this animal to at most
    // one animal of its own deal, which is all the solver reads together.
    const fixed = [...ctx.landmarks.map((_, m) => ({ m })), ...near.map((b) => ({ b }))];
    const first = [...fixed, ...subs.filter((b) => b !== a).map((b) => ({ b }))];
    for (const one of first) {
      for (const two of fixed) {
        if (one === two) continue;
        const ref = { a, b: one.b ?? -1, n: 0, ...(one.m != null ? { m: one.m } : {}) };
        const second = two.m != null ? { m2: two.m } : { b2: two.b };
        push({ k: 'closer', ...ref, ...second });
        // "next to this or that" reads the same both ways round, so only one order
        if (!(fixed.includes(one) && fixed.indexOf(one) > fixed.indexOf(two))) push({ k: 'eitherTouch', ...ref, ...second });
      }
    }
  }
  return pool;
}

/**
 * Choose what a deal's animals say: enough for elimination at the spec's tier
 * to put every animal on its square, and as little more as possible.
 *
 * Greedy takes the clue after which elimination leaves the fewest options
 * open, weighed against three things: how readable its kind is, whether a fact
 * that stands alone would do as well as leaning on another animal of the deal,
 * and whether the level has said this kind of thing already. That last weight
 * is heavy on purpose -- a board where three animals each say "I'm in a
 * corner" is a board with one idea in it -- and heaviest within a deal, where
 * the repeats sit side by side. Greedy overshoots, so every chosen clue is
 * then tested for whether the others can already do its work, and dropped if
 * they can.
 *
 * Depth is a limit on how much any one sentence may give away. Left to itself,
 * greedy reaches for the sharpest fact there is, and the sharpest fact names
 * a square outright -- "I'm in the board's top-left corner" -- which leaves
 * nothing to put together. At depth d no sentence, read on its own against
 * every square the animal could take, may leave it fewer than d: each one
 * draws a region, and the square is where the regions cross. (An animal with
 * only a few squares to begin with need only be left one fewer than it had.)
 * Everything a card says about one other animal or landmark counts as one
 * sentence here, the way the solver reads it: "I'm next to the tent. I'm right
 * of the tent." is one square said in two halves, not two facts that meet.
 */
function chooseClues(cand, pool, ctx, work, subs, spec, spent, rng, want = null, planned = null) {
  const { tier, perCard } = spec;
  // At the two easiest rungs a card is limited in facts, not sentences, and no
  // two facts may fold into one compound sentence: "I'm on the board's edge,
  // but not the left one" is one sentence but two things to hold at once, and
  // the early levels should ask for one thing at a time. From Lines up, folding
  // is allowed and the limit counts sentences -- but no sentence lists more
  // than two things: "I'm next to the fountain, the goat and the bat" is three
  // facts to hold at once, which is a lot to ask in one breath at any level.
  const oneByOne = spec.vocab <= 1;

  const depth = spec.depth ?? 1;
  const floor = cand.map((cells) => Math.min(depth, Math.max(1, cells.length - 1)));
  const index = new Map(pool.map((cl, i) => [cl, i]));
  const reaches = new Map();
  const reachOf = (sentence) => {
    const key = sentence.map((cl) => index.get(cl)).sort((x, y) => x - y).join(',');
    if (!reaches.has(key)) reaches.set(key, sentenceReach(sentence, cand, ctx, work, subs));
    return reaches.get(key);
  };
  const tooSharp = (sentence) => reachOf(sentence).some((n, k) => n < floor[k]);
  // How many squares a fact leaves the animals it narrows, read alone -- a fact
  // that narrows nothing alone (it needs another animal placed first) counts
  // as leaving all of them.
  const broadness = (cl) => {
    let least = Math.max(...cand.map((cells) => cells.length));
    reachOf([cl]).forEach((n, k) => {
      if (n < cand[k].length) least = Math.min(least, n);
    });
    return least;
  };
  // every idea a card holds -- folding can join two fine facts into one sharp sentence
  const deep = depth > 1 ? (card) => ideas(card).every((s) => !tooSharp(s)) : () => true;
  // a fact too sharp on its own is only sharper folded into a sentence with another
  if (depth > 1) pool = pool.filter((cl) => !tooSharp([cl]));

  // Starting points. With animals leaning on each other, a deal can say exactly
  // how many of them the player may find straight from their own card -- the
  // anchors, chosen first and card by card -- and every other card is kept
  // from placing its own animal alone, so it has to be found through another.
  // At depth that is also what decides how many facts each takes: an anchor
  // is two facts that meet, anything else is at least its own fact plus the
  // two that found what it leans on.
  const target = tier > 0 && want != null ? Math.min(want, subs.length) : null;
  const anchors =
    target == null
      ? []
      : planned
        ? planned.map((a) => subs.indexOf(a))
        : shuffle(range(subs.length), rng).slice(0, target);
  const anchored = new Set(anchors.map((m) => subs[m]));
  const pinsAlone = (card, a) => {
    const m = subs.indexOf(a);
    return narrow(cand, groupClues(card, subs), ctx, work, subs, 0)[m].length === 1;
  };

  const cardFits = (cl, shown) => {
    const card = [...shown.filter((c) => c.a === cl.a), cl];
    const fits = oneByOne
      ? card.length <= perCard && sentenceCount(card) === card.length
      : sentenceCount(card) <= perCard && longestList(card) <= 2;
    if (!fits || !deep(card)) return false;
    return target == null || anchored.has(cl.a) || !pinsAlone(card, cl.a);
  };
  const leans = (cl) => cl.b >= 0 && subs.includes(cl.b);
  const usedAlready = (cl, shown) =>
    shown.filter((c) => c.k === cl.k && c.a !== cl.a).length + (spent.get(cl.k) || 0) + kin(cl, shown);
  // The same family said again -- "I'm on the board's edge" after "I'm in a
  // corner of the board" -- costs less than the same kind, but it costs:
  // most within the deal, on the same card most of all, and a little for
  // every time the level has said it before.
  const kin = (cl, shown) => {
    const fam = FAMILY[cl.k];
    const near = shown.filter((c) => FAMILY[c.k] === fam && c.k !== cl.k);
    const sameCard = near.filter((c) => c.a === cl.a).length;
    return 0.9 * near.length + 0.9 * sameCard + 0.35 * (spent.get(`family:${fam}`) || 0);
  };

  // Kinds the deal and the level have said already, weighed as below.
  const weight = (cl, shown) => {
    const inDeal = shown.filter((c) => c.k === cl.k && c.a !== cl.a).length;
    return 0.12 * (RANK[cl.k] ?? 6) + 1.5 * inDeal + 0.6 * (spent.get(cl.k) || 0) + kin(cl, shown);
  };

  // Standing alone with depth, every card is a small puzzle of its own, and
  // choosing its facts one at a time goes wrong in a particular way: greedy
  // takes the sharpest fact first -- an edge, leaving two squares side by side
  // -- and then needs whatever tells two neighbours apart, which is nearly
  // always "I'm next to <colour>". So each card's facts are chosen as a set:
  // every pair that together leaves the animal one square is weighed, by how
  // plain its facts are and how often the deal and level have said those kinds
  // already, and the lightest is kept.
  const cardByCard = (which) => {
    const out = [];
    for (const m of shuffle([...which], rng)) {
      const a = subs[m];
      const where = new Map();
      for (const cl of pool) {
        if (cl.a !== a || leans(cl)) continue;
        where.set(cl, new Set(cand[m].filter((x) => {
          work[a] = x;
          return holds(cl, ctx, work) === true;
        })));
      }
      const own = [...where.keys()];
      let best = null;
      let bestCost = Infinity;
      const consider = (set) => {
        const card = [];
        for (const cl of set) {
          if (!cardFits(cl, card)) return;
          card.push(cl);
        }
        // plain and fresh first, then broad: the sharper fact of the set
        // leaving more squares is worth about as much as a repeated kind
        // and the first fact read should leave several squares, not just enough
        const sizes = set.map((cl) => where.get(cl).size);
        const broad = Math.min(...sizes);
        const first = Math.max(...sizes);
        const shown = [...out];
        const cost =
          set.reduce((s, cl) => {
            const w = weight(cl, shown);
            shown.push(cl);
            return s + w;
          }, 0) -
          1.2 * Math.log2(broad) -
          0.5 * Math.log2(first) +
          rng() * 0.3;
        if (cost < bestCost) {
          bestCost = cost;
          best = set;
        }
      };
      for (let x = 0; x < own.length; x++) {
        const one = where.get(own[x]);
        if (one.size === 1) consider([own[x]]);
        if (perCard < 2) continue;
        for (let y = x + 1; y < own.length; y++) {
          const two = where.get(own[y]);
          let both = 0;
          for (const s of one) if (two.has(s) && ++both > 1) break;
          if (both === 1) consider([own[x], own[y]]);
        }
      }
      if (!best) return null;
      out.push(...best);
    }
    return out;
  };

  const standalone = tier === 0 && depth > 1;
  const chosen = standalone ? cardByCard(range(subs.length)) : cardByCard(anchors);
  if (!chosen) return null;
  let open = narrow(cand, groupClues(chosen, subs), ctx, work, subs, tier);
  if (standalone && !isSolved(open)) return null;

  while (!standalone && !isSolved(open)) {
    const total = openness(open);
    let best = null;
    let bestScore = Infinity;
    let bestOpen = null;

    for (const cl of pool) {
      if (chosen.some((c) => sameClue(c, cl)) || !cardFits(cl, chosen)) continue;
      // Elimination only ever removes, so starting from what the clues so far
      // already left open reaches the same end as starting over, for less work.
      const next = narrow(open, groupClues([...chosen, cl], subs), ctx, work, subs, tier);
      const n = openness(next);
      if (n >= total) continue; // nothing elimination can do with it yet
      // Repeating a kind on the same animal folds into one sentence ("I'm next
      // to the fish and the tree"), so that earns a little; repeating it on
      // another animal of this deal costs a lot, and earlier in the level less.
      const folds = chosen.some((c) => c.a === cl.a && c.k === cl.k);
      const inDeal = chosen.filter((c) => c.k === cl.k && c.a !== cl.a).length;
      const repeat = folds ? 0.85 : 1 + 1.5 * inDeal + 0.6 * (spent.get(cl.k) || 0) + 0.7 * kin(cl, chosen);
      const lean = leans(cl) ? 1.5 : 0;
      // with depth, a broad fact is worth a little more progress than a sharp one
      const broad = depth > 1 ? Math.pow(broadness(cl), -0.6) : 1;
      const score = n * (1 + 0.12 * ((RANK[cl.k] ?? 6) + lean)) * repeat * broad;
      if (score < bestScore) {
        bestScore = score;
        best = cl;
        bestOpen = next;
      }
    }
    // Stalled: nothing left that elimination can use at this tier, within the
    // card limit. The caller tries another layout.
    if (!best) return null;
    open = bestOpen;
    chosen.push(best);
  }

  let kept = chosen;
  for (const cl of shuffle([...chosen], rng)) {
    if (kept.length < 2) break;
    const trial = kept.filter((c) => c !== cl);
    // taking a fact off a card can refold what is left into a sharper sentence
    if (!deep(trial.filter((c) => c.a === cl.a))) continue;
    // nor may it take away a starting point the deal is meant to have
    if (target != null && anchored.has(cl.a) && !pinsAlone(trial.filter((c) => c.a === cl.a), cl.a)) continue;
    if (isSolved(narrow(cand, groupClues(trial, subs), ctx, work, subs, tier))) kept = trial;
  }

  // Spare clues: true things that were not needed. They can only cross off
  // more, so they never make a guess necessary -- they save the player from
  // having to find the one line of reasoning that works. Anything a shown clue
  // already implies is padding, not help, and is skipped. When a deal is meant
  // to be solved animal by animal, a spare that leans on another animal of the
  // deal would undercut that, so it is skipped too. Fresh kinds of fact are
  // preferred, for the same reason as above.
  const extras = [];
  if (spec.spare > 0) {
    const load = new Map(subs.map((a) => [a, kept.filter((c) => c.a === a).length]));
    const bag = shuffle(
      pool.filter((cl) => (RANK[cl.k] ?? 9) <= 5 && !(tier === 0 && leans(cl))),
      rng
    );
    const shownNow = () => [...kept, ...extras];
    bag.sort(
      (x, y) =>
        load.get(x.a) - load.get(y.a) ||
        usedAlready(x, shownNow()) - usedAlready(y, shownNow()) ||
        (RANK[x.k] ?? 9) - (RANK[y.k] ?? 9)
    );
    for (const cl of bag) {
      if (extras.length >= spec.spare) break;
      const shown = shownNow();
      if (!cardFits(cl, shown)) continue;
      if (shown.some((c) => echoes(c, cl)) || impliedBy(shown, cl, cand, ctx, work, subs)) continue;
      extras.push(cl);
      load.set(cl.a, load.get(cl.a) + 1);
    }
  }

  for (const cl of [...kept, ...extras]) {
    spent.set(cl.k, (spent.get(cl.k) || 0) + 1);
    const fam = `family:${FAMILY[cl.k]}`;
    spent.set(fam, (spent.get(fam) || 0) + 1);
  }
  return { clues: readingOrder([...kept, ...extras], cand, ctx, work, subs), spare: extras.length };
}

/**
 * The order a card's sentences are read in: broadest first. A card that says
 * "I'm on the board's edge. I'm next to Ocean." reads the way the player
 * works -- several squares, then the one of them that fits -- where the other
 * way round names the answer and then confirms it. Only the order changes,
 * never what is said.
 */
export function readingOrder(clues, cand, ctx, work, subs) {
  return subs.flatMap((a, k) =>
    ideas(clues.filter((cl) => cl.a === a))
      .map((idea) => ({ idea, left: sentenceReach(idea, cand, ctx, work, subs)[k] }))
      .sort((x, y) => y.left - x.left)
      .flatMap((x) => x.idea)
  );
}

// --- one whole level -------------------------------------------------------

function attempt(R, rng, spec) {
  const landSizes = spec.varied
    ? variedSizes(R.cells, spec.lands, rng)
    : evenSizes(R.cells, spec.lands, rng);
  const zones = makeZones(R, spec.lands, rng, landSizes);
  const lands = pickLands(rng, COLOURS);
  const dealt = dealSizes(spec);
  const rounds = dealt.length;

  const zoneLand = colourLands(zones, spec.lands, rng);
  const byLand = lands.map((_, h) => range(spec.lands).filter((z) => zoneLand[z] === h));

  const groups = groupRounds(zones, byLand, dealt, spec.pairs ?? 0, rng);
  const zoneRound = new Int8Array(spec.lands);
  groups.forEach((g, r) => g.forEach((z) => (zoneRound[z] = r)));

  const animals = [];
  const byRound = range(rounds).map(() => []);
  const cast = lands.map((land, h) => shuffle([...land.animals], rng).slice(0, byLand[h].length));
  const castNext = lands.map(() => 0);
  // Each animal standing alone, from one fact or two that meet: place animals
  // where those facts can find them (see placeSimply), or such a level almost
  // never builds.
  const depth = spec.depth ?? 1;
  const planned = spec.tier === 0 && (spec.perCard === 1 || depth > 1);
  const allowed = new Set(allowedKinds(spec));
  const wants = []; // animals a landmark should pick out
  const plan = { usage: new Map(), landmarksLeft: spec.landmarks ?? 0 };
  // With animals leaning on each other and a set number of starting points,
  // the starting animals are placed the way standing-alone ones are -- where
  // their own facts can meet -- and the rest beside them, where facts about
  // each other have something to say.
  const anchorIds = new Set();
  groups.forEach((group, r) => {
    let seats;
    let anchorsHere = [];
    const anchorCount = Math.min(footholdsAt(spec, r) ?? 0, group.length);
    if (planned) {
      seats = placeSimply(R, zones, zoneLand, zoneRound, group, r, rng, wants, plan, allowed, spec.perCard === 1 ? 1 : depth);
    } else if (anchorCount > 0) {
      const order = shuffle(range(group.length), rng);
      anchorsHere = order.slice(0, anchorCount);
      const fixed = placeSimply(R, zones, zoneLand, zoneRound, anchorsHere.map((k) => group[k]), r, rng, wants, plan, allowed, depth);
      seats = [];
      anchorsHere.forEach((k, j) => (seats[k] = fixed[j]));
      for (const k of order.slice(anchorCount)) seats[k] = besideAny(R, zones.zoneCells[group[k]], fixed, rng);
    } else {
      seats = placeTrio(R, zones, group, spec.tier, rng);
    }
    group.forEach((z, k) => {
      const h = zoneLand[z];
      const { icon, name } = readAnimal(cast[h][castNext[h]++]);
      const id = animals.length;
      animals.push({ id, icon, name, land: h, landName: lands[h].name, zone: z, round: r, cell: seats[k] });
      byRound[r].push(id);
      if (anchorsHere.includes(k)) anchorIds.add(id);
    });
  });

  const landmarks = placeLandmarks(R, zones, animals, spec.landmarks ?? 0, rng, wants);
  const blocked = new Set(landmarks.map((l) => l.cell));
  const ctx = boardContext({ R, zones, zoneLand, lands, animals, landmarks });
  const solution = Int32Array.from(animals, (a) => a.cell);
  const kinds = allowedKinds(spec);

  // what each animal of deal r could legally take, with these squares blocked
  const candidatesAt = (r, subs, blockedCells) =>
    subs.map((a) => {
      const out = [];
      for (let z = 0; z < spec.lands; z++) {
        if (zoneLand[z] !== animals[a].land || zoneRound[z] < r) continue;
        for (const i of zones.zoneCells[z]) if (!blockedCells.has(i)) out.push(i);
      }
      return out;
    });

  const deals = [];
  const spent = new Map(); // kinds already said, across the whole level
  for (let r = 0; r < rounds; r++) {
    const subs = byRound[r];
    const cand = candidatesAt(r, subs, blocked);
    const earlier = animals.filter((a) => a.round < r).map((a) => a.id);
    const pool = buildPool(ctx, subs, earlier, kinds, solution);
    const want = footholdsAt(spec, r);
    const anchors = want != null ? subs.filter((a) => anchorIds.has(a)) : null;
    const chosen = chooseClues(cand, pool, ctx, Int32Array.from(solution), subs, spec, spent, rng, want, anchors);
    if (!chosen) return null;
    deals.push({ round: r, animals: subs, clues: chosen.clues, spare: chosen.spare });
  }

  const kept = dropUnmentioned(landmarks, deals, ctx, spec.tier, solution, candidatesAt);
  if (!kept) return null;
  if (!shapeFits(spec, deals, ctx, solution, candidatesAt, kept)) return null;

  return { R, spec, zones, lands, zoneLand, zoneRound, animals, landmarks: kept, deals, ctx, rounds };
}

/**
 * Starting points and depth, checked again on the finished deals. chooseClues
 * builds each deal to both, but pruning the landmarks afterwards reopens
 * squares. A reopened square can take an anchor's card from one square to
 * two; and for an animal with only a few squares, one more can raise what
 * depth asks of it (all but one of its squares, up to the level's depth)
 * above what a sentence leaves. A deal with nowhere to start is where players
 * said the difficulty jumped, and depth is a promise the audit checks, so
 * neither is left to chance.
 */
function shapeFits(spec, deals, ctx, solution, candidatesAt, landmarks) {
  const blocked = new Set(landmarks.map((l) => l.cell));
  const depth = spec.depth ?? 1;
  return deals.every((d) => {
    const cand = candidatesAt(d.round, d.animals, blocked);
    const work = Int32Array.from(solution);
    if (depth > 1) {
      const floor = cand.map((cells) => Math.min(depth, Math.max(1, cells.length - 1)));
      for (const a of d.animals) {
        for (const idea of ideas(d.clues.filter((cl) => cl.a === a))) {
          if (sentenceReach(idea, cand, ctx, work, d.animals).some((n, k) => n < floor[k])) return false;
        }
      }
    }
    const at = footholdsAt(spec, d.round);
    if (at == null) return true;
    const want = Math.min(at, d.animals.length);
    return footholds(cand, d.clues, ctx, work, d.animals) === want;
  });
}

/**
 * A landmark no clue mentions is clutter: something on the board the player
 * looks at, wonders about, and never needs. So once the clues are chosen,
 * every landmark nothing mentions is taken away.
 *
 * That is not free. Nothing stands on a landmark, so even one nobody mentions
 * was doing a job -- blocking a square -- and that blocked square may be what
 * let elimination finish a deal. Taking the landmark away opens the square
 * again. So every deal is solved again with it open, at the level's tier, and
 * if any deal now needs a guess the whole level is thrown away and another
 * built: it only worked because of something it never said.
 *
 * Clues name landmarks by position in the list, so the kept ones are
 * renumbered. Returns the kept landmarks, or null if the level must go.
 */
function dropUnmentioned(landmarks, deals, ctx, tier, solution, candidatesAt) {
  const named = (cl) => cl.m != null && cl.m >= 0;
  const namedSecond = (cl) => cl.m2 != null && cl.m2 >= 0;
  const mentioned = new Set(
    deals.flatMap((d) => [
      ...d.clues.filter(named).map((cl) => cl.m),
      ...d.clues.filter(namedSecond).map((cl) => cl.m2),
    ])
  );
  if (mentioned.size === landmarks.length) return landmarks;

  const keep = landmarks.map((_, m) => m).filter((m) => mentioned.has(m));
  const renumber = new Map(keep.map((m, k) => [m, k]));
  const kept = keep.map((m) => landmarks[m]);
  const open = new Set(kept.map((l) => l.cell));
  ctx.landmarks = kept;
  for (const d of deals) {
    for (const cl of d.clues) {
      if (named(cl)) cl.m = renumber.get(cl.m);
      if (namedSecond(cl)) cl.m2 = renumber.get(cl.m2);
    }
  }

  for (const d of deals) {
    const cand = candidatesAt(d.round, d.animals, open);
    const work = Int32Array.from(solution);
    const left = narrow(cand, groupClues(d.clues, d.animals), ctx, work, d.animals, tier);
    if (!isSolved(left)) return null;
  }
  return kept;
}

/**
 * Build a level to the spec, or return null if none of the layouts tried can
 * be clued within it -- the editor then says so and suggests what to loosen.
 */
export function makeLevel(R, spec, rng, tries = 80) {
  for (let t = 0; t < tries; t++) {
    const puzzle = attempt(R, rng, spec);
    if (puzzle) return puzzle;
  }
  return null;
}
