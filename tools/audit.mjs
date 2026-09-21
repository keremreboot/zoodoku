// Independent audit of the generator.
//
// The generator promises that every deal has exactly one answer. This checks
// that promise without trusting any of the machinery that made it: the field of
// legal deals is rebuilt from scratch and brute-forced, clue by clue. Run it
// after any change to generate.js, clues.js or zones.js -- a new clue kind that
// is worded one way and evaluated another is exactly the bug this catches.
//
//   node tools/audit.mjs [board|all] [level|all] [boards-per-combo]
//
// Exits non-zero if any board fails, so it can gate a commit or a CI run.

import { BOARDS, LEVELS, makePuzzle } from '../src/generate.js';
import { ALL_KINDS, BINARY, GLOSSARY, UNARY, holds, phrase } from '../src/clues.js';
import { makeRules, mulberry32, neighbours } from '../src/util.js';

function connected(R, cells) {
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    for (const n of neighbours(R, i)) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === set.size;
}

/**
 * Can this deal be worked out by elimination alone?
 *
 * Unique is not enough. A deal can have exactly one answer and still only be
 * findable by supposing an animal is somewhere and following it through -- and
 * with a strike on every wrong square, that supposition is a paid guess. The
 * rule is that nobody should ever have to make one.
 *
 * So this plays the deal the way a player does. Every animal starts with every
 * square it could legally take. Everything said about one animal is read
 * together, and so is everything said about the same two animals -- "I share a
 * row with the rooster" and "the rooster is exactly 5 steps away" are one fact
 * about where the rooster is, and anyone reading the card takes them that way.
 * A square is crossed off when it breaks what is said about its animal, or when
 * no square still open to the other animal of a pair fits with it. That repeats
 * until nothing more falls. If each animal is left with one square, the deal
 * can be solved without a guess.
 *
 * What it will not do is suppose. Chaining "if the crab were here, the rooster
 * would have to be there, and then the owl could not..." across all three is
 * exactly the guessing the rule forbids, so a deal that needs it fails.
 *
 * Written separately from the generator's own solver on purpose, so that a bug
 * in one cannot hide behind the same bug in the other.
 */
function deducible(p, deal, cand) {
  const inDeal = new Set(deal.animals);
  const pos = Int32Array.from(p.animals, (a) => (a.round < deal.round ? a.cell : -1));

  // clues keyed by the animals of this deal they are about: one, or a pair
  const about = new Map();
  for (const cl of deal.clues) {
    const ids = [cl.a, cl.b].filter((id) => inDeal.has(id)).sort((x, y) => x - y);
    const key = ids.join(',');
    if (!about.has(key)) about.set(key, { ids, clues: [] });
    about.get(key).clues.push(cl);
  }
  const open = new Map(deal.animals.map((id, k) => [id, new Set(cand[k])]));
  const allTrue = (clues) => clues.every((cl) => holds(cl, p.ctx, pos) === true);

  let changed = true;
  while (changed) {
    changed = false;
    for (const { ids, clues } of about.values()) {
      const turns = ids.length === 1 ? [[ids[0], null]] : [ids, [ids[1], ids[0]]];
      for (const [me, other] of turns) {
        for (const x of [...open.get(me)]) {
          pos[me] = x;
          const fits = other == null
            ? allTrue(clues)
            : [...open.get(other)].some((y) => {
                pos[other] = y;
                return allTrue(clues);
              });
          if (other != null) pos[other] = -1;
          if (!fits) {
            open.get(me).delete(x);
            changed = true;
          }
        }
        pos[me] = -1;
      }
    }
  }
  return deal.animals.every((id) => open.get(id).size === 1);
}

function auditPuzzle(p) {
  const R = p.R;
  const problems = [];

  // --- lands ---------------------------------------------------------------
  const sizes = p.zones.zoneCells.map((c) => c.length);
  if (sizes.reduce((a, b) => a + b, 0) !== R.cells) problems.push('lands do not tile the board');
  if (Math.max(...sizes) - Math.min(...sizes) > 1) problems.push(`ragged land sizes ${sizes}`);
  for (let z = 0; z < p.zones.count; z++) {
    if (!connected(R, p.zones.zoneCells[z])) problems.push(`land ${z} is in pieces`);
  }
  const perLand = p.lands.map(() => 0);
  for (let z = 0; z < p.zones.count; z++) perLand[p.zoneLand[z]]++;
  if (new Set(perLand).size !== 1) problems.push(`colours share out unevenly ${perLand}`);

  // --- one animal per land, right colour -----------------------------------
  const claimed = new Set();
  for (const a of p.animals) {
    if (p.zones.zoneOf[a.cell] !== a.zone) problems.push(`${a.name} is not in its own land`);
    if (p.zoneLand[a.zone] !== a.land) problems.push(`${a.name} is in the wrong colour`);
    if (claimed.has(a.zone)) problems.push(`land ${a.zone} takes two animals`);
    claimed.add(a.zone);
  }

  // --- every clue is true of the finished board ----------------------------
  const solution = Int32Array.from(p.animals, (a) => a.cell);
  for (const deal of p.deals) {
    for (const cl of deal.clues) {
      if (holds(cl, p.ctx, solution) !== true) {
        problems.push(`deal ${deal.round + 1}: "${phrase([cl], p.ctx)}" is false on the answer`);
      }
    }
  }

  // --- and exactly one deal satisfies them ---------------------------------
  const stats = [];
  for (const deal of p.deals) {
    const r = deal.round;
    const cand = deal.animals.map((id) => {
      const out = [];
      for (let z = 0; z < p.zones.count; z++) {
        if (p.zoneLand[z] === p.animals[id].land && p.zoneRound[z] >= r) {
          out.push(...p.zones.zoneCells[z]);
        }
      }
      return out;
    });

    const work = Int32Array.from(solution);
    // animals from deals not yet played must not leak into the check
    for (const a of p.animals) if (a.round >= r) work[a.id] = -1;

    let wins = 0;
    for (const c0 of cand[0]) {
      for (const c1 of cand[1]) {
        for (const c2 of cand[2]) {
          work[deal.animals[0]] = c0;
          work[deal.animals[1]] = c1;
          work[deal.animals[2]] = c2;
          if (deal.clues.every((cl) => holds(cl, p.ctx, work) === true)) wins++;
        }
      }
    }
    if (wins !== 1) problems.push(`deal ${r + 1}: ${wins} arrangements satisfy the clues, want 1`);
    const fair = deducible(p, deal, cand);
    if (!fair) problems.push(`deal ${r + 1}: unique, but needs a guess -- elimination alone stalls`);
    stats.push({
      guess: !fair,
      clues: deal.clues.length,
      coords: deal.clues.some((cl) => cl.k === 'inRow' || cl.k === 'inColumn'),
    });
  }

  return { problems, stats };
}

const pickAll = (arg, table) => (!arg || arg === 'all' ? Object.keys(table) : [arg]);
const boards = pickAll(process.argv[2], BOARDS);
const levels = pickAll(process.argv[3], LEVELS);
const runs = Number(process.argv[4] || 20);

for (const key of [...boards.filter((b) => !BOARDS[b]), ...levels.filter((l) => !LEVELS[l])]) {
  console.error(`unknown board or level "${key}"`);
  process.exit(2);
}

let failed = 0;

// Every kind of clue has to be explained to the player, or reading it is a
// guess. The key shows GLOSSARY word for word, so it must cover them all.
{
  const kinds = [...new Set([...UNARY, ...BINARY, 'steps', 'inRow', 'inColumn', ...ALL_KINDS])];
  const explained = new Set(GLOSSARY.flatMap((g) => g.kinds));
  const unexplained = kinds.filter((k) => !explained.has(k));
  if (unexplained.length) {
    console.log(`  FAIL the key never explains: ${unexplained.join(', ')}`);
    failed++;
  }
}
let audited = 0;
let deals = 0;
let coordDeals = 0;
let guessDeals = 0;
const allClues = [];
const allTimes = [];

for (const bk of boards) {
  for (const lk of levels) {
    const board = BOARDS[bk];
    const level = LEVELS[lk];
    const R = makeRules(board.N);
    const clues = [];
    const times = [];
    let coords = 0;
    let guesses = 0;
    let count = 0;

    for (let s = 0; s < runs; s++) {
      const seed = 1000 + s * 3571;
      const t0 = performance.now();
      const p = makePuzzle(R, mulberry32(seed), board, level);
      times.push(performance.now() - t0);
      if (!p) {
        console.log(`  FAIL ${bk}/${lk} seed ${seed}: no board produced`);
        failed++;
        continue;
      }
      const { problems, stats } = auditPuzzle(p);
      audited++;
      for (const s2 of stats) {
        clues.push(s2.clues);
        count++;
        if (s2.coords) coords++;
        if (s2.guess) guesses++;
      }
      if (problems.length) {
        failed++;
        console.log(`  FAIL ${bk}/${lk} seed ${seed}`);
        for (const msg of problems.slice(0, 4)) console.log(`        ${msg}`);
      }
    }
    deals += count;
    coordDeals += coords;
    guessDeals += guesses;
    allClues.push(...clues);
    allTimes.push(...times);
    console.log(
      `${bk.padEnd(9)} ${lk.padEnd(9)} ${runs} boards, slowest ${Math.max(...times).toFixed(0).padStart(4)}ms,` +
        ` clues/deal max ${Math.max(...clues)}, needs a guess ${guesses}/${count},` +
        ` coordinate fallback ${coords}/${count}`
    );
  }
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(
  `\n${audited} boards audited, ${failed} failed.` +
    ` Clues per deal: min ${Math.min(...allClues)}, avg ${avg(allClues).toFixed(2)}, max ${Math.max(...allClues)}.` +
    ` Build: avg ${avg(allTimes).toFixed(0)}ms, worst ${Math.max(...allTimes).toFixed(0)}ms.` +
    ` Needs a guess: ${guessDeals} of ${deals} deals. Coordinate fallback: ${coordDeals} of ${deals}.`
);

if (process.argv.includes('--sample')) {
  const demo = makePuzzle(makeRules(9), mulberry32(4242), BOARDS.standard, LEVELS.standard);
  console.log(`\nSample board: ${demo.lands.map((l) => l.name).join(', ')}`);
  for (const deal of demo.deals) {
    console.log(`\n  Deal ${deal.round + 1}`);
    for (const id of deal.animals) {
      const a = demo.animals[id];
      const mine = deal.clues.filter((cl) => cl.a === id);
      const at = `(r${demo.R.row(a.cell) + 1},c${demo.R.col(a.cell) + 1})`;
      console.log(`    ${a.icon} ${a.name.padEnd(9)} ${a.landName.padEnd(8)} ${at.padEnd(9)} ${phrase(mine, demo.ctx) || '-'}`);
    }
  }
}

process.exit(failed ? 1 : 0);
