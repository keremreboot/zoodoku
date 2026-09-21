// Rebuild the starter levels: one per funnel step, overwriting levels/levels.json.
//
// For each step it generates up to thirty candidates, keeps only those that need the
// step's tier (a step introducing "in turn" must actually need it), prefers ones
// whose two-of-a-colour deals actually need both lands, never dips below the
// previous level's difficulty, then picks the most varied: fewest
// repeats of any one kind of sentence, then the most kinds. Deterministic seeds,
// so a rerun gives the same levels until the generator changes.
//
// THIS OVERWRITES levels/levels.json. Use it only while the levels are still the
// generated starter set -- once levels have been curated in the editor, don't.
// Level ids are random, so even an identical rebuild gets new ids, and players
// lose their progress on every level (progress is kept by id).
//
//   node tools/starter-levels.mjs
import fs from 'node:fs';
import { makeLevel } from '../src/generate.js';
import { FUNNEL } from '../src/funnel.js';
import { serializeLevel, formatBook, emptyBook, puzzleFromLevel } from '../src/levels.js';
import { chunks, VOCABULARY } from '../src/clues.js';
import { makeRules, mulberry32 } from '../src/util.js';

const book = emptyBook();
let floor = 0;
FUNNEL.forEach((spec, step) => {
  const built = [];
  for (let s = 0; built.length < 30 && s < 120; s++) {
    const seed = 20260923 + step * 1000 + s;
    const p = makeLevel(makeRules(spec.N), spec, mulberry32(seed));
    if (!p) continue;
    const lv = serializeLevel(p, { seed });
    if (!lv.stats.coords && lv.stats.difficulty >= floor) built.push(lv);
  }
  // a step that introduces a tier must actually need it, or it teaches nothing
  const needing = built.filter((lv) => lv.stats.tier === spec.tier);
  if (needing.length) built.splice(0, built.length, ...needing);
  // and two of a colour should matter: every such deal needing "a land takes
  // one" if possible, at least one if not
  if (spec.pairs) {
    const every = built.filter((lv) => lv.stats.pairsUsed === lv.stats.pairDeals);
    const some = built.filter((lv) => lv.stats.pairsUsed > 0);
    const keep = every.length ? every : some;
    if (keep.length) built.splice(0, built.length, ...keep);
  }
  built.sort(
    (x, y) =>
      x.stats.repeats.most.uses - y.stats.repeats.most.uses ||
      y.stats.repeats.kinds - x.stats.repeats.kinds
  );
  const pick = built[0];
  if (!pick) {
    console.log(`step ${step + 1}: NOTHING BUILT`);
    process.exit(1);
  }
  floor = pick.stats.difficulty;
  book.levels.push(pick);
  console.log(
    `level ${String(step + 1).padStart(2)}: ${pick.N}x${pick.N} ${pick.stats.tierName.padEnd(8)} ${VOCABULARY[spec.vocab].name.padEnd(8)}` +
      ` difficulty ${String(pick.stats.difficulty).padStart(2)}, most repeated x${pick.stats.repeats.most.uses}`
  );
});
fs.writeFileSync(new URL('../levels/levels.json', import.meta.url), formatBook(book));
console.log(`wrote ${book.levels.length} levels\n`);

book.levels.slice(0, 3).forEach((lv, k) => {
  const p = puzzleFromLevel(lv);
  const lines = [];
  for (const deal of p.deals) {
    for (const id of deal.animals) {
      const a = p.animals[id];
      lines.push(`${a.icon} ${chunks(deal.clues.filter((c) => c.a === id), p.ctx).map((c) => c.text).join(' ')}`);
    }
  }
  console.log(`Level ${k + 1}:\n   ${lines.join('\n   ')}`);
});
