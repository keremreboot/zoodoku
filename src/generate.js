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
  longestList,
  sentenceCount,
  sizeLead,
} from './clues.js';
import { groupClues, isSolved, narrow, openness } from './deduce.js';
import { LANDMARKS, pickLands, readAnimal } from './habitats.js';
import { evenSizes, makeZones, variedSizes } from './zones.js';
import { manhattan, range, shuffle } from './util.js';

const LANDS_PER_DEAL = 3;

/** Smallest and largest board the editor offers. */
export const SIZES = { min: 5, max: 9 };

/** Most landmarks a level can have. */
export const MAX_LANDMARKS = 3;

/**
 * How many lands a board of side N can be cut into: a multiple of three, since
 * every deal is one animal of each colour, and no land smaller than four
 * squares on average -- below that, a land is barely a place.
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
  landmarks: 2, // fixed things on the board that animals can mention
  varied: true, // lands of clearly different sizes, so one can be "the biggest"
  coords: false, // allow "I'm in row 3" -- plain, but it hands the answer over
};

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
 * Which land gets which colour. Every colour needs the same number of lands, so
 * each deal can offer one animal of each right up to the last. When sizes
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
 * Which land of each colour is dealt alongside which. Pairing lands that share
 * a border is what puts a deal's animals within reach of each other, so that
 * "I'm next to the fish and the lion" is a sentence this game can produce.
 */
function groupRounds(zones, byLand, rounds, rng) {
  let best = null;
  let bestScore = -Infinity;
  for (let t = 0; t < 60; t++) {
    const lists = byLand.map((list) => shuffle([...list], rng));
    const groups = range(rounds).map((r) => lists.map((list) => list[r]));
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
 */
function placeSimply(R, zones, zoneLand, zoneRound, group, round, rng, wants, plan, allow) {
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
  return group.map((z, h) => {
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
    // every square of this land that some one fact picks out, by kind of fact
    const byKind = new Map();
    for (const i of zones.zoneCells[z]) {
      for (const fact of facts) {
        if (!truth(fact, i) || !cands.every((j) => j === i || !truth(fact, j))) continue;
        if (!byKind.has(fact.k)) byKind.set(fact.k, []);
        byKind.get(fact.k).push(i);
      }
    }
    const kinds = [...byKind.keys()];
    if (plan.landmarksLeft > 0 && allow.has('touch')) kinds.push('touch');
    const used = (k) => plan.usage.get(k) || 0;
    const least = Math.min(...kinds.map(used));
    const fresh = kinds.filter((k) => used(k) === least);
    const kind = fresh.length ? fresh[(rng() * fresh.length) | 0] : null;
    plan.usage.set(kind, used(kind) + 1);

    if (kind && kind !== 'touch') {
      const cells = byKind.get(kind);
      return cells[(rng() * cells.length) | 0];
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
  // could take, makes "I'm next to the tree" name exactly one square.
  for (const want of shuffle([...wants], rng)) {
    if (placed.length >= names.length) break;
    const used = new Set(placed.map((l) => zones.zoneOf[l.cell]));
    const options = [];
    for (let i = 0; i < R.cells; i++) {
      const z = zones.zoneOf[i];
      if (manhattan(R, i, want.cell) !== 1) continue;
      if (answers.has(i) || used.has(z) || zones.zoneCells[z].length < 4) continue;
      if (placed.some((l) => manhattan(R, l.cell, i) < 2)) continue;
      if (want.cands.some((j) => j !== want.cell && manhattan(R, i, j) === 1)) continue;
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
  const cardFits = (cl, shown) => {
    const card = [...shown.filter((c) => c.a === cl.a), cl];
    if (!oneByOne) return sentenceCount(card) <= perCard && longestList(card) <= 2;
    return card.length <= perCard && sentenceCount(card) === card.length;
  };
  const leans = (cl) => cl.b >= 0 && subs.includes(cl.b);
  const usedAlready = (cl, shown) =>
    shown.filter((c) => c.k === cl.k && c.a !== cl.a).length + (spent.get(cl.k) || 0);

  let open = cand;
  const chosen = [];

  while (!isSolved(open)) {
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

  const groups = groupRounds(zones, byLand, rounds, rng);
  const zoneRound = new Int8Array(spec.lands);
  groups.forEach((g, r) => g.forEach((z) => (zoneRound[z] = r)));

  const animals = [];
  const byRound = range(rounds).map(() => []);
  const cast = lands.map((land) => shuffle([...land.animals], rng).slice(0, rounds));
  // One fact to a card, each animal standing alone: place animals where one
  // fact can find them (see placeSimply), or such a level almost never builds.
  const oneFact = spec.tier === 0 && spec.perCard === 1;
  const allowed = new Set(kindsFor(spec.vocab, spec.coords));
  const wants = []; // animals a landmark should pick out
  const plan = { usage: new Map(), landmarksLeft: spec.landmarks ?? 0 };
  groups.forEach((group, r) => {
    const seats = oneFact
      ? placeSimply(R, zones, zoneLand, zoneRound, group, r, rng, wants, plan, allowed)
      : placeTrio(R, zones, group, spec.tier, rng);
    group.forEach((z, h) => {
      const { icon, name } = readAnimal(cast[h][r]);
      const id = animals.length;
      animals.push({ id, icon, name, land: h, landName: lands[h].name, zone: z, round: r, cell: seats[h] });
      byRound[r].push(id);
    });
  });

  const landmarks = placeLandmarks(R, zones, animals, spec.landmarks ?? 0, rng, wants);
  const blocked = new Set(landmarks.map((l) => l.cell));
  const ctx = boardContext({ R, zones, zoneLand, lands, animals, landmarks });
  const solution = Int32Array.from(animals, (a) => a.cell);
  const kinds = kindsFor(spec.vocab, spec.coords);

  const deals = [];
  const spent = new Map(); // kinds already said, across the whole level
  for (let r = 0; r < rounds; r++) {
    const subs = byRound[r];
    const cand = subs.map((a) => {
      const out = [];
      for (let z = 0; z < spec.lands; z++) {
        if (zoneLand[z] !== animals[a].land || zoneRound[z] < r) continue;
        for (const i of zones.zoneCells[z]) if (!blocked.has(i)) out.push(i);
      }
      return out;
    });
    const earlier = animals.filter((a) => a.round < r).map((a) => a.id);
    const pool = buildPool(ctx, subs, earlier, kinds, solution);
    const chosen = chooseClues(cand, pool, ctx, Int32Array.from(solution), subs, spec, spent, rng);
    if (!chosen) return null;
    deals.push({ round: r, animals: subs, clues: chosen.clues, spare: chosen.spare });
  }

  return { R, spec, zones, lands, zoneLand, zoneRound, animals, landmarks, deals, ctx, rounds };
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
