// Building a board that can be solved without a single guess.
//
// That is the rule, and it is stronger than having one answer. A deal can have
// exactly one arrangement its clues allow and still only be findable by
// supposing an animal is somewhere and following it through -- and with a
// strike on every wrong square, that supposition is a paid guess. So a deal is
// only accepted once deduce.js, working by elimination alone, gets every animal
// down to one square. One answer comes free with that: the answer always
// survives elimination, because every clue is true of it.
//
// The order of work is: cut the lands, decide where every animal ends up, and
// only then work out what they are allowed to say. Choosing the answer first is
// what makes the guarantee cheap -- every clue in the pool is a true statement
// about the finished board by construction, so adding clues can only ever
// narrow the player's options towards the answer and never away from it.
//
// The generator cannot fail. Row and column clues are always available at the
// last resort, and a row plus a column pins a square outright, with no
// reasoning between animals needed at all -- so elimination can always be
// carried to the end. What can fail is doing it *tidily* -- inside the clue
// budget, using only the readable kinds -- and that is what the retries and the
// escalating budget are for.

import { ALL_KINDS, BINARY, RANK, SIMPLE_KINDS, UNARY, holds } from './clues.js';
import { groupClues, isSolved, narrow, openness } from './deduce.js';
import { pickLands, readAnimal } from './habitats.js';
import { makeZones } from './zones.js';
import { manhattan, range, shuffle } from './util.js';

/**
 * How wordy a board has to be is decided by its area alone, and nothing else
 * can be done about it. In the first deal every square of a colour is in play,
 * which is a third of the board however the lands are cut, so the field is
 * (N^2/3)^3 deals wide: about 1,700 at 6 x 6 and 20,000 at 9 x 9, both of which
 * three or four facts can close. A 12 x 12 board is 110,000 wide and needs six
 * or seven -- cards nobody wants to read, for no gain over 9 x 9, which is why
 * there is no larger board here. Cutting it into more lands does not help: the
 * count of lands never enters that sum.
 *
 * `budget` is how many clues a deal may take before the layout is thrown away
 * and another one tried.
 */
export const BOARDS = {
  small: { N: 6, zones: 6, budget: 3, name: 'six lands, two deals' },
  standard: { N: 9, zones: 9, budget: 3, name: 'nine lands, three deals' },
  dense: { N: 9, zones: 12, budget: 3, name: 'twelve lands, four deals' },
};

/**
 * Difficulty is about what is said, not how much is needed to say it. Every
 * level pins its deals with a minimal set; gentle sticks to plain kinds of fact
 * and adds confirmation on top, sharp shows the minimum and nothing else --
 * take one clue away and the deal can no longer be worked out. No level ever
 * needs a guess.
 */
export const LEVELS = {
  gentle: { extra: 2, kinds: SIMPLE_KINDS, name: 'gentle' },
  standard: { extra: 1, kinds: ALL_KINDS, name: 'standard' },
  sharp: { extra: 0, kinds: ALL_KINDS, name: 'sharp' },
};

const LANDS_PER_DEAL = 3;

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
 * Does x leave y with nothing to say? "I stand in a corner" already tells you
 * "I stand against the rim", and a board that says both reads like it is
 * padding. Two clues can only stand in that relation when they are about the
 * same animals, so the test walks just those animals' squares rather than the
 * whole field -- which is both cheaper and exactly as conclusive.
 */
function subsumes(x, y, cand, ctx, work, subs) {
  if (scopeOf(x) !== scopeOf(y)) return false;
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
 * Which land of each colour is dealt alongside which.
 *
 * Left to chance the three lands in a deal are usually strewn across the board,
 * and then no animal can say anything about touching another -- the best it can
 * manage is a distance, which is arithmetic rather than a puzzle. Pairing lands
 * that share a border is what puts the animals within reach of each other and
 * makes "I touch both the fish and the lion" a sentence this game can produce.
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
 * Where in its land each of a deal's three animals ends up. Bordering lands are
 * only an opportunity; the animals still have to be stood near the border for
 * anything to come of it. Scoring every arrangement and drawing from the best
 * of them keeps them in each other's company without freezing on one answer.
 */
function placeTrio(R, zones, group, rng) {
  const [A, B, C] = group.map((z) => zones.zoneCells[z]);
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

// --- what the animals are allowed to say -----------------------------------

function buildPool(ctx, subs, earlier, kinds, solution, coords) {
  const pool = [];
  const allow = new Set(kinds);
  const push = (cl) => {
    if (!allow.has(cl.k)) return;
    if (holds(cl, ctx, solution) === true) pool.push(cl);
  };

  for (const a of subs) {
    for (const k of UNARY) push({ k, a, b: -1, n: 0 });
    // Bare coordinates give the answer away rather than pose it, so they are
    // held back until a deal has been shown to need them. Row plus column pins
    // any square outright, with no reasoning between animals needed, so once
    // they are in the pool elimination can always finish a deal -- which is
    // what leaves the generator with no way to fail.
    if (coords) {
      pool.push({ k: 'inRow', a, b: -1, n: ctx.R.row(solution[a]) });
      pool.push({ k: 'inColumn', a, b: -1, n: ctx.R.col(solution[a]) });
    }

    // Naming a distant animal from an earlier round is technically true and
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
 * Choose what a deal's animals say: enough for elimination alone to put every
 * animal on its square, and as little more as possible.
 *
 * Greedy takes the clue after which elimination leaves the fewest options
 * open, nudged by how readable its kind is and by how often that kind has
 * already been used -- a deal whose three clues are three different sorts of
 * fact is a better puzzle than one that lists three distances. A clue that
 * would only help someone willing to suppose -- one elimination cannot use yet
 * -- makes no progress here and is passed over, which is the whole point.
 * Greedy overshoots, so every chosen clue is then tested for whether the
 * others can already do its work, and dropped if they can.
 */
function chooseClues(cand, pool, ctx, work, subs, level, maxClues, spent, rng) {
  let open = cand;
  const chosen = [];

  while (!isSolved(open)) {
    const total = openness(open);
    let best = null;
    let bestScore = Infinity;
    let bestOpen = null;

    for (const cl of pool) {
      if (chosen.some((c) => sameClue(c, cl))) continue;
      // Elimination only ever removes, so starting from what the clues so far
      // already left open reaches the same end as starting over, for less work.
      const next = narrow(open, groupClues([...chosen, cl], subs), ctx, work, subs);
      const n = openness(next);
      if (n >= total) continue; // nothing elimination can do with it yet
      // Three different sorts of fact beat three distances, and a board that
      // opens every deal the same way has one idea in it -- so repeating a kind
      // costs, and leaning on it all game costs a little more.
      //
      // Repeating a kind on the *same* animal is the exception, and is paid a
      // bonus instead: two touches by one animal fold into a single sentence,
      // "I touch both the fish and the lion", which is one thing to read and
      // the most satisfying shape this game makes. Keeping a deal's clues in
      // few mouths is worth something on its own, so sharing a speaker earns a
      // smaller discount of the same sort.
      const folds = chosen.some((c) => c.a === cl.a && c.k === cl.k);
      const speaks = chosen.some((c) => c.a === cl.a);
      const elsewhere = chosen.filter((c) => c.k === cl.k && c.a !== cl.a).length;
      const tired =
        (folds ? -2 : speaks ? -0.8 : 0) + 2 * elsewhere + 0.8 * (spent.get(cl.k) || 0);
      const score = n * (1 + 0.12 * ((RANK[cl.k] ?? 6) + tired));
      if (score < bestScore) {
        bestScore = score;
        best = cl;
        bestOpen = next;
      }
    }
    // Stalled: nothing left in the pool that elimination can use. Never happens
    // once row and column clues are in the pool; before that, the caller moves
    // on to another layout rather than accept a deal that needs a guess.
    if (!best) return null;
    open = bestOpen;
    chosen.push(best);
    if (chosen.length > maxClues + 3) return null;
  }

  let kept = chosen;
  for (const cl of shuffle([...chosen], rng)) {
    if (kept.length < 2) break;
    const trial = kept.filter((c) => c !== cl);
    if (isSolved(narrow(cand, groupClues(trial, subs), ctx, work, subs))) kept = trial;
  }
  if (kept.length > maxClues) return null;

  // Confirmation for the gentler levels: true things that were not needed. They
  // cannot open a second answer or make a guess necessary -- every clue in the
  // pool holds for the answer, so an extra one only ever crosses off more --
  // they just save the player from having to find the one line of reasoning
  // that works.
  //
  // An extra has to earn its line, though. Anything an already-shown clue
  // implies is not help, it is padding, and a card that says "I stand in a
  // corner" and then "I stand against the rim" reads like the board is stalling.
  const extras = [];
  if (level.extra > 0) {
    const load = new Map(subs.map((a) => [a, kept.filter((c) => c.a === a).length]));
    const bag = shuffle(
      pool.filter((cl) => (RANK[cl.k] ?? 9) <= 5 && !kept.some((c) => echoes(c, cl))),
      rng
    );
    bag.sort((x, y) => load.get(x.a) - load.get(y.a) || (RANK[x.k] ?? 9) - (RANK[y.k] ?? 9));
    for (const cl of bag) {
      if (extras.length >= level.extra) break;
      const shown = [...kept, ...extras];
      if (shown.some((c) => echoes(c, cl) || subsumes(c, cl, cand, ctx, work, subs))) continue;
      extras.push(cl);
      load.set(cl.a, load.get(cl.a) + 1);
    }
  }

  for (const cl of [...kept, ...extras]) spent.set(cl.k, (spent.get(cl.k) || 0) + 1);
  return [...kept, ...extras];
}

// --- one whole board -------------------------------------------------------

/** What a deal may draw on, in the order it is allowed to reach for them. */
const VOCABULARIES = [
  { kinds: null, coords: false }, // whatever the level asked for
  { kinds: ALL_KINDS, coords: false },
  { kinds: ALL_KINDS, coords: true },
];

function attempt(R, rng, board, level, maxClues, tier) {
  const zones = makeZones(R, board.zones, rng);
  const lands = pickLands(rng, LANDS_PER_DEAL);
  const rounds = board.zones / LANDS_PER_DEAL;

  // every land gets the same number of territories, so each deal can offer one
  // animal of each colour right up to the last round
  const bag = shuffle(range(board.zones), rng);
  const zoneLand = new Int8Array(board.zones);
  const byLand = lands.map(() => []);
  bag.forEach((z, k) => {
    const h = (k / rounds) | 0;
    zoneLand[z] = h;
    byLand[h].push(z);
  });

  const groups = groupRounds(zones, byLand, rounds, rng);
  const zoneRound = new Int8Array(board.zones);
  groups.forEach((g, r) => g.forEach((z) => (zoneRound[z] = r)));

  const animals = [];
  const byRound = range(rounds).map(() => []);
  const cast = lands.map((land) => shuffle([...land.animals], rng).slice(0, rounds));
  groups.forEach((group, r) => {
    const seats = placeTrio(R, zones, group, rng);
    group.forEach((z, h) => {
      const { icon, name } = readAnimal(cast[h][r]);
      const id = animals.length;
      animals.push({
        id,
        icon,
        name,
        land: h,
        landName: lands[h].name,
        zone: z,
        round: r,
        cell: seats[h],
      });
      byRound[r].push(id);
    });
  });

  const ctx = { R, zoneOf: zones.zoneOf, zoneAdj: zones.zoneAdj, animals };
  const solution = Int32Array.from(animals, (a) => a.cell);

  const deals = [];
  const spent = new Map(); // kinds already leaned on, across the whole board
  for (let r = 0; r < rounds; r++) {
    const subs = byRound[r];
    const cand = subs.map((a) => {
      const out = [];
      for (let z = 0; z < board.zones; z++) {
        if (zoneLand[z] === animals[a].land && zoneRound[z] >= r) out.push(...zones.zoneCells[z]);
      }
      return out;
    });

    const earlier = animals.filter((a) => a.round < r).map((a) => a.id);
    // Concessions, worst last, and made one deal at a time so a single awkward
    // deal never coarsens the rest of the board. Widening the vocabulary is a
    // small thing to give up -- a gentle board saying "higher up than the fox"
    // is still a gentle board. Naming a row outright is not, so it goes last.
    let clues = null;
    for (const vocab of VOCABULARIES.slice(0, tier + 1)) {
      const pool = buildPool(ctx, subs, earlier, vocab.kinds ?? level.kinds, solution, vocab.coords);
      const work = Int32Array.from(solution);
      clues = chooseClues(cand, pool, ctx, work, subs, level, maxClues, spent, rng);
      if (clues) break;
    }
    if (!clues) return null;
    deals.push({ round: r, animals: subs, clues });
  }

  return { R, board, level, zones, lands, zoneLand, zoneRound, animals, deals, ctx, rounds };
}

export function makePuzzle(R, rng, board, level) {
  // Widen the budget rather than give up: a board that needs four clues to pin
  // a deal is still a fine board, and refusing it would only mean handing the
  // player a different layout that happens to need three.
  // Give up the cheap things first: a clue more, then a clue more again, then
  // the level's choosiness about what may be said. Bare coordinates are the
  // last rung, and by the time it is reached some seventy layouts have been
  // tried and thrown away without them. Its only job is to make failure
  // impossible, and reaching it at all is rare.
  const ladder = [
    [board.budget, 0],
    [board.budget + 1, 0],
    [board.budget + 3, 0],
    [board.budget + 3, 1],
    [99, 2],
  ];
  for (const [budget, tier] of ladder) {
    for (let tries = 0; tries < 18; tries++) {
      const puzzle = attempt(R, rng, board, level, budget, tier);
      if (puzzle) return puzzle;
    }
  }
  return null;
}
