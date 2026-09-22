// How focused are the clues? A measurement, not a check.
//
// Kerem's complaint about depth: a clue "almost always points at a specific
// tile", where the fun is in several clues that each leave a few squares open
// and only pin one when put together. This measures exactly that, per sentence
// as the player reads it (a folded "I'm in the board's bottom-left corner" is
// one sentence, and it pins):
//
//   pinned   animals that some single sentence puts on one square by itself --
//            read alone, against every square the animal could legally take
//   reach    for each animal, the fewest squares any one sentence leaves it;
//            averaged. 1 means one sentence was enough.
//
//   node tools/depth.mjs [boards-per-funnel-step]
//
// Reads the level files in levels/ and a sweep of fresh boards along the funnel.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLevel } from '../src/generate.js';
import { FUNNEL } from '../src/funnel.js';
import { chunks } from '../src/clues.js';
import { sentenceReach } from '../src/deduce.js';
import { candidates, puzzleFromLevel } from '../src/levels.js';
import { readBook } from './book.mjs';
import { makeRules, mulberry32 } from '../src/util.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Per animal: the fewest squares any one sentence (from any card) leaves it. */
function focus(p) {
  const solution = Int32Array.from(p.animals, (a) => a.cell);
  const out = [];
  for (const deal of p.deals) {
    const cand = candidates(p, deal);
    const sentences = deal.animals.flatMap((id) =>
      chunks(deal.clues.filter((cl) => cl.a === id), p.ctx).map((c) => c.clues)
    );
    const best = deal.animals.map((_, k) => cand[k].length);
    for (const s of sentences) {
      const r = sentenceReach(s, cand, p.ctx, Int32Array.from(solution), deal.animals);
      r.forEach((n, k) => (best[k] = Math.min(best[k], n)));
    }
    out.push(...best);
  }
  return out;
}

const summary = (reaches) => {
  const pinned = reaches.filter((n) => n === 1).length;
  const avg = reaches.reduce((s, n) => s + n, 0) / reaches.length;
  return `${String(pinned).padStart(3)}/${String(reaches.length).padEnd(3)} pinned by one sentence (${String(Math.round((100 * pinned) / reaches.length)).padStart(3)}%), mean reach ${avg.toFixed(1)}`;
};

const book = readBook(root);
if (book.levels.length) {
  console.log('levels/');
  book.levels.forEach((lv, k) => {
    console.log(`  level ${String(k + 1).padStart(2)}  ${summary(focus(puzzleFromLevel(lv)))}`);
  });
}

const runs = Number(process.argv.find((a) => /^\d+$/.test(a)) || 6);
console.log(`\nfresh boards, ${runs} per funnel step`);
FUNNEL.forEach((spec, step) => {
  const all = [];
  for (let s = 0; s < runs; s++) {
    const p = makeLevel(makeRules(spec.N), spec, mulberry32(1000 + s * 3571 + step * 17));
    if (p) all.push(...focus(p));
  }
  const depth = spec.depth ? `  depth ${spec.depth}` : '';
  console.log(`  step ${String(step + 1).padStart(2)}  ${summary(all)}${depth}`);
});
