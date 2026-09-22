// Rebuild the starter levels: one per funnel step, overwriting levels/levels.json.
//
// The levels named on the command line are copied from the current file
// untouched, at the same position -- same boards, same ids -- and only
// re-measured; the rest are rebuilt. For each step
// it generates up to thirty candidates, keeps only those that need the step's
// tier (a step introducing "in turn" must actually need it), prefers ones whose
// two-of-a-colour deals actually need both lands, doesn't dip below the previous
// level's difficulty or climb more than half again above it (if it can help
// it), then picks the most varied: fewest repeats of any one kind of sentence,
// then the fewest "not"s, then the most kinds. Deterministic seeds, so a
// rerun gives the same levels until the generator changes.
//
// THIS OVERWRITES levels/levels.json. Use it only while the levels are still the
// generated starter set -- once levels have been curated in the editor, don't.
// Level ids are random, so a rebuilt level gets a new id, and players lose their
// progress on it (progress is kept by id).
//
//   node tools/starter-levels.mjs [keep]      e.g. 1-4 (the default), 4-14, 6-13:7
import fs from 'node:fs';
import { makeLevel, readingOrder } from '../src/generate.js';
import { FUNNEL } from '../src/funnel.js';
import { candidates, serializeLevel, formatBook, emptyBook, measure, puzzleFromLevel } from '../src/levels.js';
import { chunks, VOCABULARY } from '../src/clues.js';
import { makeRules, mulberry32 } from '../src/util.js';

// Which levels to keep, as new position -> old position: "1-4" keeps levels 1-4
// where they are, "6-13:7" puts old levels 7-14 at 6-13.
const KEEP = new Map(
  (process.argv[2] ?? '1-4').split(',').flatMap((part) => {
    const [range, from] = part.split(':');
    const [a, b = a] = range.split('-').map(Number);
    const start = from ? Number(from) : a;
    return Array.from({ length: b - a + 1 }, (_, k) => [a + k, start + k]);
  })
);
const file = new URL('../levels/levels.json', import.meta.url);
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : emptyBook();
const book = emptyBook();
let floor = 0;
FUNNEL.forEach((spec, step) => {
  const source = old.levels[(KEEP.get(step + 1) ?? 0) - 1];
  if (KEEP.has(step + 1) && source) {
    // same board, same id; only the sentences on each card put broadest first
    const p = puzzleFromLevel(source);
    const pos = Int32Array.from(p.animals, (a) => a.cell);
    const deals = source.deals.map((d, r) => ({
      ...d,
      clues: readingOrder(d.clues, candidates(p, p.deals[r]), p.ctx, pos, d.animals),
    }));
    const lv = { ...source, deals };
    lv.stats = measure(puzzleFromLevel(lv));
    book.levels.push(lv);
    floor = lv.stats.difficulty;
    console.log(`level ${String(step + 1).padStart(2)}: kept, was level ${KEEP.get(step + 1)} (difficulty ${lv.stats.difficulty})`);
    return;
  }
  const built = [];
  for (let s = 0; built.length < 30 && s < 120; s++) {
    const seed = 20260923 + step * 1000 + s;
    const p = makeLevel(makeRules(spec.N), spec, mulberry32(seed));
    if (!p) continue;
    const lv = serializeLevel(p, { seed });
    if (!lv.stats.coords) built.push(lv);
  }
  // no easier than the level before, if it can help it -- a step that goes back
  // to cards standing alone after one where they leaned may not be able to,
  // and then the hardest of what was built is the smallest dip
  const up = built.filter((lv) => lv.stats.difficulty >= floor);
  if (up.length) built.splice(0, built.length, ...up);
  else built.sort((x, y) => y.stats.difficulty - x.stats.difficulty).splice(3);
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
  // A step up, not a leap: players said the difficulty jumped, so keep to
  // candidates within half again of the level before, if there are any -- and
  // failing that, the gentlest there are.
  const gentle = built.filter((lv) => lv.stats.difficulty <= Math.max(floor * 1.5, floor + 3));
  if (gentle.length) built.splice(0, built.length, ...gentle);
  else built.sort((x, y) => x.stats.difficulty - y.stats.difficulty).splice(3);
  built.sort(
    (x, y) =>
      x.stats.repeats.most.uses - y.stats.repeats.most.uses ||
      x.stats.nots - y.stats.nots ||
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
fs.writeFileSync(file, formatBook(book));
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
