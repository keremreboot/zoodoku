// Independent audit of the levels, and of the generator that makes them.
//
// The game makes promises, and this checks them without trusting any of the
// code that made them:
//
//   - every deal can be solved without a guess, at the tier its level promises
//     (alone / in turn / together), by a solver written separately from the
//     generator's own, so a bug in one cannot hide behind the same bug in the
//     other;
//   - every deal has exactly one answer, by trying every arrangement;
//   - no idea, read on its own, pins an animal down further than the level's
//     depth allows, and each deal has exactly the number of starting points
//     -- animals their own card places -- that the level promises;
//   - every clue is true of the answer, and is a kind the key explains;
//   - every land is whole and a fair size, one animal to a land, right colour;
//   - no animal and no other landmark stands on a landmark, and every
//     landmark is mentioned by some clue -- one nobody mentions is clutter.
//
// It audits two things. levels/levels.json, because those are the levels
// players actually get -- locked, so a generator change cannot fix or break
// them, and only this catches it if one was ever wrong. And a sweep of fresh
// boards along the difficulty funnel, because the editor makes new levels with
// today's generator.
//
//   node tools/audit.mjs [boards-per-funnel-step] [--sample]
//
// Exits non-zero if anything fails, so it can gate a commit or a CI run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLevel } from '../src/generate.js';
import { FUNNEL } from '../src/funnel.js';
import { ALL_KINDS, GLOSSARY, holds, ideas, phrase } from '../src/clues.js';
import { TIERS } from '../src/deduce.js';
import { puzzleFromLevel, LEVEL_FILE } from '../src/levels.js';
import { makeRules, mulberry32, neighbours } from '../src/util.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
 * Can this deal be worked out by elimination alone, leaning on the other
 * animals of the deal no more than `tier` allows?
 *
 * Every animal starts with every square it could legally take. Everything said
 * about one animal is read together, and so is everything said about the same
 * two animals. A square is crossed off when it breaks what is said about its
 * animal, or -- for a pair -- when no square still open to the other animal
 * fits with it. At tier 0 ("alone") pair facts between two animals of this deal
 * are no help at all; at tier 1 ("in turn") one is used only once the other
 * animal is down to a single square; at tier 2 ("together") always. Animals
 * from earlier deals are on the board, so facts about them count at every
 * tier. Nothing is ever supposed.
 *
 * Two animals of one colour in a deal can't share a land, and that is leaned
 * on like a pair fact: never alone; in turn, once one is down to a single
 * square its land is closed to the other; together, once every square left to
 * one lies in a single land.
 */
function deducible(p, deal, cand, tier) {
  const open = eliminate(p, deal, cand, tier, deal.clues);
  return deal.animals.every((id) => open.get(id).size === 1);
}

/** What is still open to each animal once these clues have crossed off all they can. */
function eliminate(p, deal, cand, tier, given) {
  const inDeal = new Set(deal.animals);
  const pos = Int32Array.from(p.animals, (a) => (a.round < deal.round ? a.cell : -1));

  const about = new Map();
  for (const cl of given) {
    const ids = [cl.a, cl.b].filter((id) => inDeal.has(id)).sort((x, y) => x - y);
    const key = ids.join(',');
    if (!about.has(key)) about.set(key, { ids, clues: [] });
    about.get(key).clues.push(cl);
  }
  const open = new Map(deal.animals.map((id, k) => [id, new Set(cand[k])]));
  const allTrue = (clues) => clues.every((cl) => holds(cl, p.ctx, pos) === true);

  const zoneOf = p.zones.zoneOf;
  const colour = (id) => p.animals[id].land;

  let changed = true;
  while (changed) {
    changed = false;
    if (tier > 0) {
      for (const me of deal.animals) {
        for (const other of deal.animals) {
          if (me === other || colour(me) !== colour(other)) continue;
          const theirs = open.get(other);
          if (tier === 1 && theirs.size !== 1) continue;
          const lands = new Set([...theirs].map((y) => zoneOf[y]));
          if (lands.size !== 1) continue;
          for (const x of [...open.get(me)]) {
            if (lands.has(zoneOf[x])) {
              open.get(me).delete(x);
              changed = true;
            }
          }
        }
      }
    }
    for (const { ids, clues } of about.values()) {
      if (ids.length === 2 && tier === 0) continue;
      const turns = ids.length === 1 ? [[ids[0], null]] : [ids, [ids[1], ids[0]]];
      for (const [me, other] of turns) {
        if (other != null && tier === 1 && open.get(other).size !== 1) continue;
        for (const x of [...open.get(me)]) {
          pos[me] = x;
          const fits =
            other == null
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
  return open;
}

function auditPuzzle(p, tier) {
  const R = p.R;
  const problems = [];
  const known = new Set(ALL_KINDS);

  // --- lands ---------------------------------------------------------------
  // Even lands are within a square of each other; varied ones are meant to
  // differ, but none may shrink below three squares.
  const sizes = p.zones.zoneCells.map((c) => c.length);
  if (sizes.reduce((a, b) => a + b, 0) !== R.cells) problems.push('lands do not tile the board');
  if (p.spec?.varied) {
    if (Math.min(...sizes) < 3) problems.push(`a land of ${Math.min(...sizes)} squares`);
  } else if (Math.max(...sizes) - Math.min(...sizes) > 1) {
    problems.push(`ragged land sizes ${sizes}`);
  }
  for (let z = 0; z < p.zones.count; z++) {
    if (!connected(R, p.zones.zoneCells[z])) problems.push(`land ${z} is in pieces`);
  }
  const perLand = p.lands.map(() => 0);
  for (let z = 0; z < p.zones.count; z++) perLand[p.zoneLand[z]]++;
  if (new Set(perLand).size !== 1) problems.push(`colours share out unevenly ${perLand}`);

  // --- landmarks: on the board, never under an animal or each other --------
  const marked = new Set();
  for (const mark of p.landmarks ?? []) {
    if (mark.cell < 0 || mark.cell >= R.cells) problems.push(`the ${mark.name} is off the board`);
    if (marked.has(mark.cell)) problems.push(`two landmarks on one square`);
    marked.add(mark.cell);
  }
  for (const a of p.animals) {
    if (marked.has(a.cell)) problems.push(`${a.name}'s square is under a landmark`);
  }
  (p.landmarks ?? []).forEach((mark, m) => {
    if (!p.deals.some((d) => d.clues.some((cl) => cl.m === m || cl.m2 === m))) {
      problems.push(`the ${mark.name} is never mentioned`);
    }
  });

  // --- one animal per land, right colour -----------------------------------
  const claimed = new Set();
  for (const a of p.animals) {
    if (p.zones.zoneOf[a.cell] !== a.zone) problems.push(`${a.name} is not in its own land`);
    if (p.zoneLand[a.zone] !== a.land) problems.push(`${a.name} is in the wrong colour`);
    if (claimed.has(a.zone)) problems.push(`land ${a.zone} takes two animals`);
    claimed.add(a.zone);
  }

  // --- every clue is a known kind, and true of the finished board ----------
  const solution = Int32Array.from(p.animals, (a) => a.cell);
  for (const deal of p.deals) {
    for (const cl of deal.clues) {
      if (!known.has(cl.k)) {
        problems.push(`deal ${deal.round + 1}: unknown kind of clue "${cl.k}"`);
      } else if (holds(cl, p.ctx, solution) !== true) {
        problems.push(`deal ${deal.round + 1}: "${phrase([cl], p.ctx)}" is false on the answer`);
      }
    }
  }
  if (problems.length) return { problems, stats: [] };

  // --- one answer, reachable without a guess at the promised tier ----------
  const stats = [];
  for (const deal of p.deals) {
    const r = deal.round;
    // what the player may legally try: own colour, land still empty, no landmark
    const cand = deal.animals.map((id) => {
      const out = [];
      for (let z = 0; z < p.zones.count; z++) {
        if (p.zoneLand[z] !== p.animals[id].land || p.zoneRound[z] < r) continue;
        for (const i of p.zones.zoneCells[z]) if (!marked.has(i)) out.push(i);
      }
      return out;
    });

    const work = Int32Array.from(solution);
    for (const a of p.animals) if (a.round >= r) work[a.id] = -1; // later deals must not leak in
    let wins = 0;
    const zoneOf = p.zones.zoneOf;
    for (const c0 of cand[0]) {
      for (const c1 of cand[1]) {
        for (const c2 of cand[2]) {
          // a land takes one animal -- only ever in question when two share a colour
          if (zoneOf[c0] === zoneOf[c1] || zoneOf[c0] === zoneOf[c2] || zoneOf[c1] === zoneOf[c2]) continue;
          work[deal.animals[0]] = c0;
          work[deal.animals[1]] = c1;
          work[deal.animals[2]] = c2;
          if (deal.clues.every((cl) => holds(cl, p.ctx, work) === true)) wins++;
        }
      }
    }
    if (wins !== 1) problems.push(`deal ${r + 1}: ${wins} arrangements satisfy the clues, want 1`);

    const fair = deducible(p, deal, cand, tier);
    if (!fair) {
      problems.push(`deal ${r + 1}: cannot be solved at "${TIERS[tier].name}" without a guess`);
    }

    // Depth: each idea alone -- a sentence, or everything one card says about
    // the same animal or landmark -- against every square each animal could
    // take, must leave the animals it mentions at least `depth` squares (or,
    // for one that had few to begin with, all but one). Counted by brute force:
    // a square survives if some squares for the other animals of the deal
    // make every fact in the idea true.
    const depth = p.spec?.depth ?? 1;
    if (depth > 1) {
      for (const id of deal.animals) {
        for (const idea of ideas(deal.clues.filter((cl) => cl.a === id))) {
          const part = { clues: idea, text: phrase(idea, p.ctx) };
          const trial = Int32Array.from(work);
          const named = new Set(part.clues.flatMap((cl) => [cl.a, cl.b]));
          const mentioned = deal.animals.map((a) => named.has(a));
          const survivors = cand.map((cells, k) =>
            !mentioned[k] ? cells.length : cells.filter((x) => {
              // an animal the sentence never names is never read, so any square will do
              const rest = cand.map((c, j) => (j === k ? [x] : mentioned[j] ? c : [c[0]]));
              for (const y0 of rest[0]) {
                for (const y1 of rest[1]) {
                  for (const y2 of rest[2]) {
                    trial[deal.animals[0]] = y0;
                    trial[deal.animals[1]] = y1;
                    trial[deal.animals[2]] = y2;
                    if (part.clues.every((cl) => holds(cl, p.ctx, trial) === true)) return true;
                  }
                }
              }
              return false;
            }).length
          );
          survivors.forEach((n, k) => {
            const least = Math.min(depth, Math.max(1, cand[k].length - 1));
            if (n < least) {
              problems.push(`deal ${r + 1}: "${part.text}" leaves ${p.animals[deal.animals[k]].name} ${n} square${n === 1 ? '' : 's'}, depth ${depth}`);
            }
          });
        }
      }
    }
    // Starting points: exactly as many animals as the level promises can be
    // placed from their own card alone, before anything else is known.
    const promised = p.spec?.footholds;
    const at = Array.isArray(promised) ? promised[Math.min(r, promised.length - 1)] : promised;
    if (tier > 0 && at != null) {
      const want = Math.min(at, deal.animals.length);
      const got = deal.animals.filter(
        (id) => eliminate(p, deal, cand, 0, deal.clues.filter((cl) => cl.a === id)).get(id).size === 1
      ).length;
      if (got !== want) problems.push(`deal ${r + 1}: ${got} animals can be placed from their own card, want ${want}`);
    }
    stats.push({ clues: deal.clues.length, guess: !fair });
  }
  return { problems, stats };
}

let failed = 0;

// --- the key explains every kind of clue -----------------------------------
{
  const explained = new Set(GLOSSARY.flatMap((g) => g.kinds));
  const unexplained = ALL_KINDS.filter((k) => !explained.has(k));
  if (unexplained.length) {
    console.log(`FAIL the key never explains: ${unexplained.join(', ')}`);
    failed++;
  }
}

// --- the locked levels -----------------------------------------------------
{
  const file = path.join(root, LEVEL_FILE);
  if (!fs.existsSync(file)) {
    console.log(`${LEVEL_FILE}: none yet`);
  } else {
    const book = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = new Set();
    let bad = 0;
    book.levels.forEach((level, k) => {
      const label = `level ${k + 1} (${level.id})`;
      if (ids.has(level.id)) {
        console.log(`  FAIL ${label}: id used twice`);
        bad++;
      }
      ids.add(level.id);
      let p;
      try {
        p = puzzleFromLevel(level);
      } catch (e) {
        console.log(`  FAIL ${label}: ${e.message}`);
        bad++;
        return;
      }
      const { problems } = auditPuzzle(p, level.spec.tier);
      if (problems.length) {
        bad++;
        console.log(`  FAIL ${label}`);
        for (const msg of problems.slice(0, 4)) console.log(`        ${msg}`);
      }
    });
    failed += bad;
    console.log(`${LEVEL_FILE}: ${book.levels.length} levels, ${bad} failed`);
  }
}

// --- fresh boards along the funnel -----------------------------------------
const runs = Number(process.argv.find((a) => /^\d+$/.test(a)) || 10);
let deals = 0;
let guesses = 0;
let unbuilt = 0;
const times = [];

FUNNEL.forEach((spec, step) => {
  const R = makeRules(spec.N);
  let worst = 0;
  let maxClues = 0;
  for (let s = 0; s < runs; s++) {
    const seed = 1000 + s * 3571 + step * 17;
    const t0 = performance.now();
    const p = makeLevel(R, spec, mulberry32(seed));
    const dt = performance.now() - t0;
    times.push(dt);
    worst = Math.max(worst, dt);
    if (!p) {
      unbuilt++;
      console.log(`  NOTE step ${step + 1} seed ${seed}: no board built within the tries`);
      continue;
    }
    const { problems, stats } = auditPuzzle(p, spec.tier);
    for (const st of stats) {
      deals++;
      if (st.guess) guesses++;
      maxClues = Math.max(maxClues, st.clues);
    }
    if (problems.length) {
      failed++;
      console.log(`  FAIL step ${step + 1} seed ${seed}`);
      for (const msg of problems.slice(0, 4)) console.log(`        ${msg}`);
    }
  }
  console.log(
    `step ${String(step + 1).padStart(2)}  ${spec.N}x${spec.N} ${String(spec.lands).padStart(2)} lands` +
      `  ${TIERS[spec.tier].name.padEnd(8)}  ${runs} boards, slowest ${worst.toFixed(0).padStart(4)}ms,` +
      ` most clues in a deal ${maxClues}`
  );
});

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(
  `\nFunnel sweep: ${deals} deals, ${guesses} need a guess, ${unbuilt} boards not built.` +
    ` Build avg ${avg(times).toFixed(0)}ms, worst ${Math.max(...times).toFixed(0)}ms.` +
    `\n${failed ? `${failed} FAILED` : 'All checks passed.'}`
);

if (process.argv.includes('--sample')) {
  const spec = FUNNEL[5];
  const demo = makeLevel(makeRules(spec.N), spec, mulberry32(4242));
  console.log(`\nSample, funnel step 6: ${demo.lands.map((l) => l.name).join(', ')}`);
  for (const deal of demo.deals) {
    console.log(`\n  Deal ${deal.round + 1}`);
    for (const id of deal.animals) {
      const a = demo.animals[id];
      const mine = deal.clues.filter((cl) => cl.a === id);
      console.log(`    ${a.icon} ${a.name.padEnd(9)} ${phrase(mine, demo.ctx) || '-'}`);
    }
  }
}

process.exit(failed ? 1 : 0);
