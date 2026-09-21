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
} from './clues.js';
import { groupClues, isSolved, narrow, openness, sentenceReach } from './deduce.js';
import { LANDMARKS, pickLands, readAnimal } from './habitats.js';
import { evenSizes, makeZones, variedSizes } from './zones.js';
import { manhattan, neighbours, range, shuffle } from './util.js';

const LANDS_PER_DEAL = 3;

/** Smallest and largest board the editor offers. */
export const SIZES = { min: 5, max: 9 };

/** Most landmarks a level can have. */
export const MAX_LANDMARKS = 3;

/**
 * How many lands a board of side N can be cut into: a multiple of three, since
 * every deal is three animals and each colour gets the same number of lands,
 * and no land smaller than four squares on average -- below that, a land is
 * barely a place.
 */
export function landOptions(N) {
  const out = [];
  for (let n = LANDS_PER_DEAL; n <= Math.floor((N * N) / 4); n += LANDS_PER_DEAL) out.push(n);
  return out;
}

/** A spec the editor starts from, and the shape every spec has. */
export const DEFAULT_SPEC = {
  N: 6, // board side
  lands: 6, // how many lands; one animal each, three per deal
  tier: 0, // how much a deal's animals may lean on each other -- see deduce.js
  vocab: 0, // how far along VOCABULARY the clues may reach -- 0 is one plain fact at a time
  spare: 1, // clues per deal beyond the minimum, as confirmation
  perCard: 2, // most sentences any one card may carry
  landmarks: 2, // most fixed things on the board; any no clue mentions are taken away
  varied: true, // lands of clearly different sizes, so one can be "the biggest"
  coords: false, // allow "I'm in row 3" -- plain, but it hands the answer over
  depth: 1, // fewest squares any one sentence may leave an animal -- see chooseClues
  pairs: 0, // swaps that give two deals each two animals of one colour -- see dealColours
};

/**
 * Most swaps a level can take: each one needs two deals of its own.
 */
export const maxPairs = (lands) => Math.floor(lands / LANDS_PER_DEAL / 2);

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

const sameClue = (x, y) =>
  x.k === y.k && x.a === y.a && x.b === y.b && x.n === y.n && landmarkOf(x) === landmarkOf(y);

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
  for (let k = 0; k < count; k += LANDS_PER_DEAL) {
    const colours = shuffle(range(LANDS_PER_DEAL), rng);
    for (let c = 0; c < LANDS_PER_DEAL; c++) zoneLand[bySize[k + c]] = colours[c];
  }
  return zoneLand;
}

/**
 * The colours of each deal's three animals. Most deals are one of each. A
 * pair swaps one animal between two deals: one gives up its Ocean for a second
 * Meadow and the other takes that Ocean for its Meadow, so each colour still
 * has as many lands as animals, and both deals now hold two animals of one
 * colour.
 *
 * Two animals of one colour is a way to be vague at first and exact in the
 * end. Each could stand in either land of their colour, so neither card has to
 * say which -- but a land takes one animal, so the moment one of them is
 * confined to a land, the other is shut out of it.
 */
function dealColours(rounds, pairs, rng) {
  const deals = range(rounds).map(() => range(LANDS_PER_DEAL));
  if (!pairs) return deals;
  const order = shuffle(range(rounds), rng);
  for (let p = 0; p < pairs; p++) {
    const [gets, gives] = [deals[order[2 * p]], deals[order[2 * p + 1]]];
    const [twice, moved] = shuffle(range(LANDS_PER_DEAL), rng);
    gets[gets.indexOf(moved)] = twice;
    gives[gives.indexOf(twice)] = moved;
  }
  return deals.map((cols) => cols.sort((x, y) => x - y));
}

/**
 * Which lands are dealt together. Pairing lands that share a border is what
 * puts a deal's animals within reach of each other, so that "I'm next to the
 * fish and the lion" is a sentence this game can produce.
 */
function groupRounds(zones, byLand, rounds, pairs, rng) {
  let best = null;
  let bestScore = -Infinity;
  for (let t = 0; t < 60; t++) {
    const lists = byLand.map((list) => shuffle([...list], rng));
    const groups = dealColours(rounds, pairs, rng).map((cols) => cols.map((h) => lists[h].pop()));
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
 * Where in its land each of a deal's three animals ends up. For a deal whose
 * animals may lean on each other, they are stood near each other, which is
 * what gives them something to say about each other. For a deal where each
 * stands alone, anywhere will do: the landmarks are set down near them
 * afterwards, which gives even a square in the middle of a land something to
 * be described by. (Steering them to edges and corners instead, where a square
 * is easiest to describe on its own, is what made the first levels say "I'm on
 * the ___ edge" in every other sentence.)
 */
function placeTrio(R, zones, group, tier, rng) {
  const [A, B, C] = group.map((z) => zones.zoneCells[z]);
  if (tier === 0) return [A, B, C].map((cells) => cells[(rng() * cells.length) | 0]);
  const scored = [];
  for (const a of A) {
    for (const b of B) {
      for (const c of C) {
        const ab = manhattan(R, a, b);
        const ac = manhattan(R, a, c);
        const bc = manhattan(R, b, c);
        const touching = (ab === 1) + (ac === 1) + (bc === 1);
        const close = (ab === 2) + (ac === 2) + (bc === 2);
        scored.push({ cells: [a, b, c], score: touching * 6 + close * 2 - (ab + ac + bc) * 0.25 });
      }
    }
  }
  scored.sort((x, y) => y.score - x.score);
  const shortlist = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.15)));
  return shortlist[(rng() * shortlist.length) | 0].cells;
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
  const quick = {
    R,
    zoneOf: zones.zoneOf,
    zoneLand,
    zoneSize: zones.zoneCells.map((cells) => cells.length),
  };
  const pos = new Int32Array(1);
  const truth = (fact, i) => {
    pos[0] = i;
    return holds(fact, quick, pos) === true;
  };
  return group.map((z) => {
    const h = zoneLand[z];
    // every fact about a square alone that this level may say
    const facts = [];
    for (const k of UNARY) {
      if (!allow.has(k)) continue;
      if (['biggest', 'smallest', 'notBiggest'].includes(k) && !sizeFair(k, quick, z)) continue;
      facts.push({ k, n: 0 });
    }
    for (let n = 0; n < 4; n++) {
      if (allow.has('side')) facts.push({ k: 'side', n });
      if (allow.has('notSide')) facts.push({ k: 'notSide', n });
    }
    for (let n = 0; n < LANDS_PER_DEAL; n++) {
      if (n === h) continue;
      if (allow.has('nearLand')) facts.push({ k: 'nearLand', n });
      if (allow.has('notNearLand')) facts.push({ k: 'notNearLand', n });
    }
    for (const fact of facts) Object.assign(fact, { a: 0, b: -1 });
    const cands = [];
    for (let y = 0; y < zones.count; y++) {
      if (zoneLand[y] === h && zoneRound[y] >= round) cands.push(...zones.zoneCells[y]);
    }
    // every square of this land that one fact picks out -- or, with depth, two
    // broad ones together -- by the kinds of fact that do it
    const byKind = new Map();
    const note = (kinds, i, partner = null) => {
      const key = kinds.join('|');
      if (!byKind.has(key)) byKind.set(key, { kinds, cells: [], partner: new Map() });
      byKind.get(key).cells.push(i);
      if (partner) byKind.get(key).partner.set(i, partner);
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
            note([f.fact.k, g.fact.k].sort(), i);
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
            const spot = neighbours(R, i).some((L) => {
              const near = cands.filter((j) => manhattan(R, j, L) === 1);
              return near.length >= floor && near.every((j) => j === i || !f.where.has(j));
            });
            if (spot) note(['touch', f.fact.k].sort(), i, { floor, where: f.where });
          }
        }
      }
    }
    const used = (k) => plan.usage.get(k) || 0;
    const ways = [...byKind.values()];
    if (depth <= 1 && plan.landmarksLeft > 0 && allow.has('touch')) ways.push({ kinds: ['touch'], cells: null });
    const cost = (way) => way.kinds.reduce((s, k) => s + used(k), 0);
    const least = Math.min(...ways.map(cost));
    const fresh = ways.filter((way) => cost(way) === least);
    const way = fresh.length ? fresh[(rng() * fresh.length) | 0] : null;
    for (const k of way?.kinds ?? []) plan.usage.set(k, used(k) + 1);
    const kind = way?.cells ? 'board' : way ? 'touch' : null;

    if (kind === 'board') {
      const cell = way.cells[(rng() * way.cells.length) | 0];
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
      if (manhattan(R, i, want.cell) !== 1) continue;
      if (answers.has(i) || used.has(z) || zones.zoneCells[z].length < 4) continue;
      if (placed.some((l) => manhattan(R, l.cell, i) < 2)) continue;
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
    }
    push({ k: 'inRow', a, b: -1, n: ctx.R.row(solution[a]) });
    push({ k: 'inColumn', a, b: -1, n: ctx.R.col(solution[a]) });

    // Landmarks are fixed from the first deal, so everything said about one is
    // a fact the animal's own card can stand on.
    ctx.landmarks.forEach((mark, m) => {
      for (const k of LANDMARK_KINDS) {
        if (k !== 'steps') push({ k, a, b: -1, n: 0, m });
      }
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
function chooseClues(cand, pool, ctx, work, subs, spec, spent, rng) {
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
  const sharp = new Map();
  const tooSharp = (sentence) => {
    const key = sentence.map((cl) => index.get(cl)).sort((x, y) => x - y).join(',');
    if (!sharp.has(key)) {
      const reach = sentenceReach(sentence, cand, ctx, work, subs);
      sharp.set(key, reach.some((n, k) => n < floor[k]));
    }
    return sharp.get(key);
  };
  // every idea a card holds -- folding can join two fine facts into one sharp sentence
  const deep = depth > 1 ? (card) => ideas(card).every((s) => !tooSharp(s)) : () => true;
  // a fact too sharp on its own is only sharper folded into a sentence with another
  if (depth > 1) pool = pool.filter((cl) => !tooSharp([cl]));

  const cardFits = (cl, shown) => {
    const card = [...shown.filter((c) => c.a === cl.a), cl];
    const fits = oneByOne
      ? card.length <= perCard && sentenceCount(card) === card.length
      : sentenceCount(card) <= perCard && longestList(card) <= 2;
    return fits && deep(card);
  };
  const leans = (cl) => cl.b >= 0 && subs.includes(cl.b);
  const usedAlready = (cl, shown) =>
    shown.filter((c) => c.k === cl.k && c.a !== cl.a).length + (spent.get(cl.k) || 0);

  // Kinds the deal and the level have said already, weighed as below.
  const weight = (cl, shown) => {
    const inDeal = shown.filter((c) => c.k === cl.k && c.a !== cl.a).length;
    return 0.12 * (RANK[cl.k] ?? 6) + 1.5 * inDeal + 0.6 * (spent.get(cl.k) || 0);
  };

  // Standing alone with depth, every card is a small puzzle of its own, and
  // choosing its facts one at a time goes wrong in a particular way: greedy
  // takes the sharpest fact first -- an edge, leaving two squares side by side
  // -- and then needs whatever tells two neighbours apart, which is nearly
  // always "I'm next to <colour>". So each card's facts are chosen as a set:
  // every pair that together leaves the animal one square is weighed, by how
  // plain its facts are and how often the deal and level have said those kinds
  // already, and the lightest is kept.
  const cardByCard = () => {
    const out = [];
    for (const m of shuffle(range(subs.length), rng)) {
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
        const cost = set.reduce((s, cl) => s + weight(cl, out), 0) + rng() * 0.3;
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

  let open = cand;
  const standalone = tier === 0 && depth > 1;
  const chosen = standalone ? cardByCard() : [];
  if (!chosen) return null;
  if (standalone && !isSolved(narrow(cand, groupClues(chosen, subs), ctx, work, subs, tier))) return null;

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
      const repeat = folds ? 0.85 : 1 + 1.5 * inDeal + 0.6 * (spent.get(cl.k) || 0);
      const lean = leans(cl) ? 1.5 : 0;
      const score = n * (1 + 0.12 * ((RANK[cl.k] ?? 6) + lean)) * repeat;
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

  for (const cl of [...kept, ...extras]) spent.set(cl.k, (spent.get(cl.k) || 0) + 1);
  return { clues: [...kept, ...extras], spare: extras.length };
}

// --- one whole level -------------------------------------------------------

function attempt(R, rng, spec) {
  const sizes = spec.varied
    ? variedSizes(R.cells, spec.lands, rng)
    : evenSizes(R.cells, spec.lands, rng);
  const zones = makeZones(R, spec.lands, rng, sizes);
  const lands = pickLands(rng, LANDS_PER_DEAL);
  const rounds = spec.lands / LANDS_PER_DEAL;

  const zoneLand = colourLands(zones, spec.lands, rng);
  const byLand = lands.map((_, h) => range(spec.lands).filter((z) => zoneLand[z] === h));

  const groups = groupRounds(zones, byLand, rounds, spec.pairs ?? 0, rng);
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
  const allowed = new Set(kindsFor(spec.vocab, spec.coords));
  const wants = []; // animals a landmark should pick out
  const plan = { usage: new Map(), landmarksLeft: spec.landmarks ?? 0 };
  groups.forEach((group, r) => {
    const seats = planned
      ? placeSimply(R, zones, zoneLand, zoneRound, group, r, rng, wants, plan, allowed, spec.perCard === 1 ? 1 : depth)
      : placeTrio(R, zones, group, spec.tier, rng);
    group.forEach((z, k) => {
      const h = zoneLand[z];
      const { icon, name } = readAnimal(cast[h][castNext[h]++]);
      const id = animals.length;
      animals.push({ id, icon, name, land: h, landName: lands[h].name, zone: z, round: r, cell: seats[k] });
      byRound[r].push(id);
    });
  });

  const landmarks = placeLandmarks(R, zones, animals, spec.landmarks ?? 0, rng, wants);
  const blocked = new Set(landmarks.map((l) => l.cell));
  const ctx = boardContext({ R, zones, zoneLand, lands, animals, landmarks });
  const solution = Int32Array.from(animals, (a) => a.cell);
  const kinds = kindsFor(spec.vocab, spec.coords);

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
    const chosen = chooseClues(cand, pool, ctx, Int32Array.from(solution), subs, spec, spent, rng);
    if (!chosen) return null;
    deals.push({ round: r, animals: subs, clues: chosen.clues, spare: chosen.spare });
  }

  const kept = dropUnmentioned(landmarks, deals, ctx, spec.tier, solution, candidatesAt);
  if (!kept) return null;

  return { R, spec, zones, lands, zoneLand, zoneRound, animals, landmarks: kept, deals, ctx, rounds };
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
  const mentioned = new Set(deals.flatMap((d) => d.clues.filter(named).map((cl) => cl.m)));
  if (mentioned.size === landmarks.length) return landmarks;

  const keep = landmarks.map((_, m) => m).filter((m) => mentioned.has(m));
  const renumber = new Map(keep.map((m, k) => [m, k]));
  const kept = keep.map((m) => landmarks[m]);
  const open = new Set(kept.map((l) => l.cell));
  ctx.landmarks = kept;
  for (const d of deals) for (const cl of d.clues) if (named(cl)) cl.m = renumber.get(cl.m);

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
