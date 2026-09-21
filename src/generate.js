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
// The order of work is: cut the lands, decide where every animal ends up, and
// only then work out what they are allowed to say. Choosing the answer first is
// what makes the guarantee cheap -- every clue in the pool is a true statement
// about the finished board by construction, so adding clues can only ever
// narrow the player's options towards the answer and never away from it.

import { BINARY, RANK, UNARY, holds, kindsFor, sentenceCount } from './clues.js';
import { groupClues, isSolved, narrow, openness } from './deduce.js';
import { pickLands, readAnimal } from './habitats.js';
import { makeZones } from './zones.js';
import { manhattan, range, shuffle } from './util.js';

const LANDS_PER_DEAL = 3;

/** Smallest and largest board the editor offers. */
export const SIZES = { min: 5, max: 9 };

/**
 * How many lands a board of side N can be cut into: a multiple of three, since
 * every deal is one animal of each colour, and no land smaller than four
 * squares -- below that, a land is barely a place.
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
  vocab: 0, // how far along VOCABULARY the clues may reach
  spare: 1, // clues per deal beyond the minimum, as confirmation
  perCard: 2, // most sentences any one card may carry
  coords: false, // allow "I'm in row 3" -- plain, but it hands the answer over
};

/** Kinds that read the same both ways round, so one of the pair is redundant. */
const MIRROR = {
  touch: 'touch',
  notTouch: 'notTouch',
  corners: 'corners',
  sameRow: 'sameRow',
  sameCol: 'sameCol',
  steps: 'steps',
  zoneTouch: 'zoneTouch',
  above: 'below',
  below: 'above',
  leftOf: 'rightOf',
  rightOf: 'leftOf',
};

const sameClue = (x, y) => x.k === y.k && x.a === y.a && x.b === y.b && x.n === y.n;

/** Would showing both of these just say one thing twice? */
function echoes(x, y) {
  if (sameClue(x, y)) return true;
  return MIRROR[x.k] === y.k && x.a === y.b && x.b === y.a && x.n === y.n;
}

/** Which animals a clue is about, as a key -- two clues about the same ones can be compared. */
const scopeOf = (cl) => (cl.b >= 0 ? [cl.a, cl.b].sort((x, y) => x - y).join(',') : String(cl.a));

/**
 * Does x leave y with nothing to say? "I'm in a corner" already tells you "I'm
 * on an edge", and "I'm next to the flamingo" already tells you "I'm next to
 * Desert" when the flamingo can only stand in Desert. A card that says both
 * reads like it is padding. x can only imply y if y is about no animal x is not
 * also about, so the test walks just x's animals' squares.
 */
function subsumes(x, y, cand, ctx, work, subs) {
  const xs = scopeOf(x).split(',');
  if (!scopeOf(y).split(',').every((id) => xs.includes(id))) return false;
  const ai = subs.indexOf(x.a);
  const bi = x.b >= 0 ? subs.indexOf(x.b) : -1;
  if (ai < 0) return false;

  if (bi < 0) {
    for (const cell of cand[ai]) {
      work[x.a] = cell;
      if (holds(x, ctx, work) === true && holds(y, ctx, work) !== true) return false;
    }
    return true;
  }
  for (const ca of cand[ai]) {
    work[x.a] = ca;
    for (const cb of cand[bi]) {
      work[x.b] = cb;
      if (holds(x, ctx, work) === true && holds(y, ctx, work) !== true) return false;
    }
  }
  return true;
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
 * must stand alone that is beside the point, so they are spread instead:
 * corners and edges are where a square is easiest to describe on its own.
 */
function placeTrio(R, zones, group, tier, rng) {
  const [A, B, C] = group.map((z) => zones.zoneCells[z]);
  const edgeness = (i) => {
    const r = R.row(i);
    const c = R.col(i);
    return (r === 0 || r === R.N - 1 ? 1 : 0) + (c === 0 || c === R.N - 1 ? 1 : 0);
  };
  const scored = [];
  for (const a of A) {
    for (const b of B) {
      for (const c of C) {
        let score;
        if (tier === 0) {
          score = edgeness(a) + edgeness(b) + edgeness(c) + rng() * 1.5;
        } else {
          const ab = manhattan(R, a, b);
          const ac = manhattan(R, a, c);
          const bc = manhattan(R, b, c);
          const touching = (ab === 1) + (ac === 1) + (bc === 1);
          const close = (ab === 2) + (ac === 2) + (bc === 2);
          score = touching * 6 + close * 2 - (ab + ac + bc) * 0.25;
        }
        scored.push({ cells: [a, b, c], score });
      }
    }
  }
  scored.sort((x, y) => y.score - x.score);
  const shortlist = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.15)));
  return shortlist[(rng() * shortlist.length) | 0].cells;
}

// --- what the animals are allowed to say -----------------------------------

function buildPool(ctx, subs, earlier, kinds, solution) {
  const pool = [];
  const allow = new Set(kinds);
  const push = (cl) => {
    if (!allow.has(cl.k)) return;
    if (holds(cl, ctx, solution) === true) pool.push(cl);
  };

  for (const a of subs) {
    for (const k of UNARY) push({ k, a, b: -1, n: 0 });
    for (let side = 0; side < 4; side++) push({ k: 'side', a, b: -1, n: side });
    // only other colours are named: "I'm next to Savanna" said from inside
    // Savanna would be true of half the land and read like a riddle
    for (let h = 0; h < ctx.lands.length; h++) {
      if (h === ctx.animals[a].land) continue;
      push({ k: 'nearLand', a, b: -1, n: h });
      push({ k: 'notNearLand', a, b: -1, n: h });
    }
    push({ k: 'inRow', a, b: -1, n: ctx.R.row(solution[a]) });
    push({ k: 'inColumn', a, b: -1, n: ctx.R.col(solution[a]) });

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
 * open, nudged by how readable its kind is, by how often that kind has already
 * been used, and against leaning on another animal of the same deal when a
 * fact that stands alone would do as well. A clue elimination cannot use at
 * this tier makes no progress and is passed over. Greedy overshoots, so every
 * chosen clue is then tested for whether the others can already do its work,
 * and dropped if they can.
 */
function chooseClues(cand, pool, ctx, work, subs, spec, spent, rng) {
  const { tier, perCard } = spec;
  const cardFits = (cl, shown) =>
    sentenceCount([...shown.filter((c) => c.a === cl.a), cl]) <= perCard;
  const leans = (cl) => cl.b >= 0 && subs.includes(cl.b);

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
      // to the fish and the lion") and is paid a bonus; repeating it on another
      // animal, or leaning on it all game, costs.
      const folds = chosen.some((c) => c.a === cl.a && c.k === cl.k);
      const elsewhere = chosen.filter((c) => c.k === cl.k && c.a !== cl.a).length;
      const tired = (folds ? -2 : 0) + 2 * elsewhere + 0.8 * (spent.get(cl.k) || 0);
      const lean = leans(cl) ? 1.5 : 0;
      const score = n * (1 + 0.12 * ((RANK[cl.k] ?? 6) + tired + lean));
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
  // deal would undercut that, so it is skipped too.
  const extras = [];
  if (spec.spare > 0) {
    const load = new Map(subs.map((a) => [a, kept.filter((c) => c.a === a).length]));
    const bag = shuffle(
      pool.filter((cl) => (RANK[cl.k] ?? 9) <= 5 && !(tier === 0 && leans(cl))),
      rng
    );
    bag.sort((x, y) => load.get(x.a) - load.get(y.a) || (RANK[x.k] ?? 9) - (RANK[y.k] ?? 9));
    for (const cl of bag) {
      if (extras.length >= spec.spare) break;
      const shown = [...kept, ...extras];
      if (!cardFits(cl, shown)) continue;
      if (shown.some((c) => echoes(c, cl) || subsumes(c, cl, cand, ctx, work, subs))) continue;
      extras.push(cl);
      load.set(cl.a, load.get(cl.a) + 1);
    }
  }

  for (const cl of [...kept, ...extras]) spent.set(cl.k, (spent.get(cl.k) || 0) + 1);
  return { clues: [...kept, ...extras], spare: extras.length };
}

// --- one whole level -------------------------------------------------------

function attempt(R, rng, spec) {
  const zones = makeZones(R, spec.lands, rng);
  const lands = pickLands(rng, LANDS_PER_DEAL);
  const rounds = spec.lands / LANDS_PER_DEAL;

  // every colour gets the same number of lands, so each deal can offer one
  // animal of each colour right up to the last
  const bag = shuffle(range(spec.lands), rng);
  const zoneLand = new Int8Array(spec.lands);
  const byLand = lands.map(() => []);
  bag.forEach((z, k) => {
    const h = (k / rounds) | 0;
    zoneLand[z] = h;
    byLand[h].push(z);
  });

  const groups = groupRounds(zones, byLand, rounds, rng);
  const zoneRound = new Int8Array(spec.lands);
  groups.forEach((g, r) => g.forEach((z) => (zoneRound[z] = r)));

  const animals = [];
  const byRound = range(rounds).map(() => []);
  const cast = lands.map((land) => shuffle([...land.animals], rng).slice(0, rounds));
  groups.forEach((group, r) => {
    const seats = placeTrio(R, zones, group, spec.tier, rng);
    group.forEach((z, h) => {
      const { icon, name } = readAnimal(cast[h][r]);
      const id = animals.length;
      animals.push({ id, icon, name, land: h, landName: lands[h].name, zone: z, round: r, cell: seats[h] });
      byRound[r].push(id);
    });
  });

  const ctx = { R, zoneOf: zones.zoneOf, zoneAdj: zones.zoneAdj, zoneLand, lands, animals };
  const solution = Int32Array.from(animals, (a) => a.cell);
  const kinds = kindsFor(spec.vocab, spec.coords);

  const deals = [];
  const spent = new Map(); // kinds already leaned on, across the whole level
  for (let r = 0; r < rounds; r++) {
    const subs = byRound[r];
    const cand = subs.map((a) => {
      const out = [];
      for (let z = 0; z < spec.lands; z++) {
        if (zoneLand[z] === animals[a].land && zoneRound[z] >= r) out.push(...zones.zoneCells[z]);
      }
      return out;
    });
    const earlier = animals.filter((a) => a.round < r).map((a) => a.id);
    const pool = buildPool(ctx, subs, earlier, kinds, solution);
    const chosen = chooseClues(cand, pool, ctx, Int32Array.from(solution), subs, spec, spent, rng);
    if (!chosen) return null;
    deals.push({ round: r, animals: subs, clues: chosen.clues, spare: chosen.spare });
  }

  return { R, spec, zones, lands, zoneLand, zoneRound, animals, deals, ctx, rounds };
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
