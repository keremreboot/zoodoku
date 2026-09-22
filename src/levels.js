// Locked levels: how a generated board is written down, read back and measured.
//
// A locked level stores the whole board -- lands, colours, animals, answers and
// every clue -- not the seed and settings that produced it. That is the point
// of locking: the generator will keep changing, and a level someone looked at
// and approved must never quietly become a different level because the code
// that once made it has moved on. The spec and seed are kept alongside, but
// only as a record of how it was made.
//
// Levels live in levels/, one file each -- 01.json, 02.json, ... in play order
// -- with levels/index.json listing them, since a static site cannot list a
// folder. The editor writes them (through the dev server); the game only reads.

import { LANDS } from './habitats.js';
import { describeZones } from './zones.js';
import { COORDS, boardContext, chunks, ideas, sentenceCount } from './clues.js';
import { TIERS, factsNeeded, footholds, groupClues, isSolved, narrow, rounds, sentenceReach, tierNeeded } from './deduce.js';
import { makeRules } from './util.js';

export const LEVEL_DIR = 'levels';

/** Where the editor leaves a candidate for the game to open at #playtest. */
export const PLAYTEST_KEY = 'zoodoku.playtest';
export const FORMAT = 1;

const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/**
 * Squares each animal of a deal could legally take: its colour, in a land
 * still empty, and not under a landmark.
 */
export function candidates(puzzle, deal) {
  const blocked = new Set(puzzle.landmarks.map((l) => l.cell));
  return deal.animals.map((id) => {
    const out = [];
    for (let z = 0; z < puzzle.zones.count; z++) {
      if (puzzle.zoneLand[z] !== puzzle.animals[id].land || puzzle.zoneRound[z] < deal.round) continue;
      for (const i of puzzle.zones.zoneCells[z]) if (!blocked.has(i)) out.push(i);
    }
    return out;
  });
}

/**
 * What a level repeats itself on: the kind of sentence said most often, and
 * how many times. A folded corner ("I'm in a bottom corner") counts as a
 * corner. The editor shows this so a level that says one thing over and over
 * can be spotted before it is locked in.
 */
function repetition(puzzle) {
  const uses = new Map();
  for (const deal of puzzle.deals) {
    for (const id of deal.animals) {
      for (const part of chunks(deal.clues.filter((cl) => cl.a === id), puzzle.ctx)) {
        const kinds = part.clues.map((cl) => cl.k);
        const shape = kinds.includes('corner') || (kinds.length > 1 && kinds.every((k) => k === 'side'))
          ? 'corner'
          : kinds[0];
        uses.set(shape, (uses.get(shape) || 0) + 1);
      }
    }
  }
  let most = { kind: null, uses: 0 };
  for (const [kind, n] of uses) if (n > most.uses) most = { kind, uses: n };
  return { kinds: uses.size, most };
}

/**
 * How demanding a level is, deal by deal.
 *
 * `bits` is how much a deal asks the player to rule out: the base-2 log of the
 * arrangements its animals could take before any clue is read. `tier` is how
 * much the animals lean on each other (see deduce.js), measured -- the lowest
 * tier that actually solves the deal, which can be lower than the spec allowed.
 *
 * `reach` is the depth a deal actually has: the fewest squares any one idea on
 * a card leaves an animal it talks about, read alone (1 means some sentence
 * names a square outright). `broad` is the same per animal, averaged: how
 * vague its sharpest idea is. `pair` marks a deal with two animals of a colour,
 * and `pairUsed` one that could not be solved at its tier without the rule that
 * they need two different lands.
 *
 * `facts`, `rounds` and `footholds` are the measures in deduce.js: per animal,
 * how many ideas have to be put together to pin it; how many waves of
 * deduction the deal takes; how many animals their own card places. `nots` is
 * how many sentences say "not".
 *
 * `difficulty` puts them together, per deal: bits, weighted up for every extra
 * fact an animal needs on average, every extra round, the share of animals
 * with no card of their own to start from, and each tier of leaning -- pinning
 * animals together before any is placed is harder than the rounds alone
 * show; summed over the deals, less
 * a little for every spare clue (help, not work). A first tutorial board lands
 * around 2 and the last 9 x 9 around 50. The old score grew only with the board;
 * this one grows with what players said makes a level hard. It is a guide for
 * ordering levels, not a law -- the editor shows it so the funnel can be
 * checked at a glance, and a person decides the order.
 */
export function measure(puzzle) {
  const solution = Int32Array.from(puzzle.animals, (a) => a.cell);
  const deals = puzzle.deals.map((deal) => {
    const cand = candidates(puzzle, deal);
    const pos = Int32Array.from(solution);
    const bits = Math.log2(cand.reduce((n, c) => n * c.length, 1));
    const tier = tierNeeded(cand, deal.clues, puzzle.ctx, pos, deal.animals);
    const sentences = deal.animals.reduce(
      (n, id) => n + sentenceCount(deal.clues.filter((cl) => cl.a === id)),
      0
    );
    const all = deal.animals.flatMap((id) => ideas(deal.clues.filter((cl) => cl.a === id)));
    let reach = Infinity;
    const sharpest = cand.map((cells) => cells.length);
    for (const idea of all) {
      sentenceReach(idea, cand, puzzle.ctx, pos, deal.animals).forEach((n, k) => {
        if (n < cand[k].length) reach = Math.min(reach, n); // only animals it narrows
        sharpest[k] = Math.min(sharpest[k], n);
      });
    }
    const colours = deal.animals.map((id) => puzzle.animals[id].land);
    const pair = new Set(colours).size < colours.length;
    // does the pair matter -- would the deal stall if a land could take both?
    const groups = groupClues(deal.clues, deal.animals);
    const level = puzzle.spec?.tier ?? 2;
    const pairUsed = pair && !isSolved(narrow(cand, groups, puzzle.ctx, pos, deal.animals, level, false));
    const texts = deal.animals.flatMap((id) => chunks(deal.clues.filter((cl) => cl.a === id), puzzle.ctx));
    return {
      bits: Math.round(bits * 10) / 10,
      tier,
      clues: deal.clues.length,
      sentences,
      spare: deal.spare ?? 0,
      coords: deal.clues.some((cl) => COORDS.includes(cl.k)),
      reach: Number.isFinite(reach) ? reach : null,
      broad: Math.round((10 * sharpest.reduce((s, n) => s + n, 0)) / sharpest.length) / 10,
      pair,
      pairUsed,
      facts: factsNeeded(cand, all, puzzle.ctx, pos, deal.animals, level, 4),
      rounds: rounds(cand, deal.clues, puzzle.ctx, pos, deal.animals, level),
      footholds: footholds(cand, deal.clues, puzzle.ctx, pos, deal.animals),
      animals: deal.animals.length,
      words: texts.reduce((n, t) => n + t.text.split(' ').length, 0),
      nots: texts.filter((t) => /\bnot\b|n't\b/.test(t.text)).length,
    };
  });
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const weight = deals.reduce((s, d) => {
    const extraFacts = Math.max(0, mean(d.facts) - 1);
    const extraRounds = Math.max(0, (Number.isFinite(d.rounds) ? d.rounds : 6) - 1);
    const noStart = 1 - d.footholds / d.animals;
    const leaning = 1 + 0.2 * Math.max(0, d.tier);
    return s + (d.bits / 4) * (1 + 0.35 * extraFacts) * (1 + 0.25 * extraRounds) * (1 + 0.5 * noStart) * leaning - d.spare;
  }, 0);
  const facts = deals.flatMap((d) => d.facts);
  const animals = deals.reduce((s, d) => s + d.animals, 0);
  return {
    deals,
    repeats: repetition(puzzle),
    landmarks: puzzle.landmarks.length,
    tier: Math.max(...deals.map((d) => d.tier)),
    tierName: TIERS[Math.max(...deals.map((d) => d.tier))]?.name ?? 'unsolvable',
    sentences: deals.reduce((s, d) => s + d.sentences, 0),
    coords: deals.some((d) => d.coords),
    reach: deals.some((d) => d.reach != null) ? Math.min(...deals.map((d) => d.reach ?? Infinity)) : null,
    broad: Math.round(10 * mean(deals.map((d) => d.broad))) / 10,
    pairDeals: deals.filter((d) => d.pair).length,
    pairsUsed: deals.filter((d) => d.pairUsed).length,
    facts: Math.round(10 * mean(facts)) / 10,
    factsMost: Math.max(...facts),
    rounds: Math.max(...deals.map((d) => d.rounds)),
    footholds: Math.min(...deals.map((d) => d.footholds)),
    words: Math.round((10 * deals.reduce((s, d) => s + d.words, 0)) / animals) / 10,
    nots: Math.round((100 * deals.reduce((s, d) => s + d.nots, 0)) / Math.max(1, deals.reduce((s, d) => s + d.sentences, 0))),
    difficulty: Math.round(weight),
  };
}

/** Write a generated board down as a level. */
export function serializeLevel(puzzle, meta = {}) {
  return {
    id: meta.id ?? newId(),
    name: meta.name ?? '',
    seed: meta.seed ?? null,
    spec: { ...puzzle.spec },
    N: puzzle.R.N,
    zoneOf: Array.from(puzzle.zones.zoneOf),
    lands: puzzle.lands.map((l) => l.name),
    zoneLand: Array.from(puzzle.zoneLand),
    animals: puzzle.animals.map((a) => ({
      icon: a.icon,
      name: a.name,
      land: a.land,
      cell: a.cell,
      round: a.round,
    })),
    landmarks: puzzle.landmarks.map(({ icon, name, cell }) => ({ icon, name, cell })),
    deals: puzzle.deals.map((d) => ({
      animals: [...d.animals],
      spare: d.spare ?? 0,
      // only the fields a clue uses: most name one thing or nothing
      clues: d.clues.map(({ k, a, b, n, m, m2, b2 }) => ({
        k,
        a,
        b,
        n,
        ...(m != null && m >= 0 ? { m } : {}),
        ...(m2 != null && m2 >= 0 ? { m2 } : {}),
        ...(b2 != null && b2 >= 0 ? { b2 } : {}),
      })),
    })),
    stats: measure(puzzle),
  };
}

/** Read a level back into the same shape the generator produces, ready to play. */
export function puzzleFromLevel(level) {
  const R = makeRules(level.N);
  const zoneOf = Int8Array.from(level.zoneOf);
  const count = level.zoneLand.length;
  const zones = describeZones(R, zoneOf, count);

  const lands = level.lands.map((name) => {
    const land = LANDS.find((l) => l.name === name);
    if (!land) throw new Error(`level ${level.id}: no land called ${name}`);
    return land;
  });
  const zoneLand = Int8Array.from(level.zoneLand);
  const animals = level.animals.map((a, id) => ({
    id,
    icon: a.icon,
    name: a.name,
    land: a.land,
    landName: lands[a.land].name,
    zone: zoneOf[a.cell],
    round: a.round,
    cell: a.cell,
  }));
  const zoneRound = new Int8Array(count);
  for (const a of animals) zoneRound[a.zone] = a.round;
  const deals = level.deals.map((d, round) => ({
    round,
    animals: d.animals,
    clues: d.clues,
    spare: d.spare ?? 0,
  }));
  // levels locked before landmarks existed simply have none
  const landmarks = (level.landmarks ?? []).map(({ icon, name, cell }) => ({ icon, name, cell }));
  const ctx = boardContext({ R, zones, zoneLand, lands, animals, landmarks });

  return {
    id: level.id,
    name: level.name,
    R,
    spec: level.spec,
    zones,
    lands,
    zoneLand,
    zoneRound,
    animals,
    landmarks,
    deals,
    ctx,
    rounds: deals.length,
  };
}

/** An empty level list: the shape a book of levels always has in memory. */
export const emptyBook = () => ({ format: FORMAT, levels: [] });

/** The file a level lives in, by its place in the order: level 5 is 05.json. */
export const levelFileName = (k) => `${String(k + 1).padStart(2, '0')}.json`;

/**
 * Fetch the levels: the index first, for the order, then every level file at
 * once. A missing index is an empty list, not an error.
 */
export async function loadLevels(dir = LEVEL_DIR) {
  const res = await fetch(`${dir}/index.json`, { cache: 'no-store' });
  if (res.status === 404) return emptyBook();
  if (!res.ok) throw new Error(`could not load ${dir}/index.json: HTTP ${res.status}`);
  const index = await res.json();
  if (index.format !== FORMAT) throw new Error(`${dir}/index.json is format ${index.format}, expected ${FORMAT}`);
  const levels = await Promise.all(
    index.levels.map(async (name) => {
      const file = await fetch(`${dir}/${name}`, { cache: 'no-store' });
      if (!file.ok) throw new Error(`could not load ${dir}/${name}: HTTP ${file.status}`);
      return file.json();
    })
  );
  return { format: FORMAT, levels };
}

/**
 * One level as the text of its own file. Nobody edits a level by hand, but
 * people do open one to look at it, and diff it: so every field sits on its
 * own line, lists of things (animals, deals) one to a line, and the land map
 * laid out as the board it is -- N rows of N -- so which land is where can be
 * seen at a glance. It is still plain JSON: the line breaks are whitespace.
 */
export function formatLevel(lv) {
  const field = ([key, value]) => {
    const name = JSON.stringify(key);
    if (key === 'zoneOf' && Array.isArray(value) && lv.N) {
      const wide = String(Math.max(...value)).length;
      const rows = [];
      for (let r = 0; r < value.length; r += lv.N) {
        rows.push(`    ${value.slice(r, r + lv.N).map((z) => String(z).padStart(wide)).join(', ')}`);
      }
      return `  ${name}: [\n${rows.join(',\n')}\n  ]`;
    }
    if (Array.isArray(value) && value.length && value.every((v) => v && typeof v === 'object')) {
      return `  ${name}: [\n${value.map((v) => `    ${JSON.stringify(v)}`).join(',\n')}\n  ]`;
    }
    return `  ${name}: ${JSON.stringify(value)}`;
  };
  return `{\n${Object.entries(lv).map(field).join(',\n')}\n}\n`;
}

/**
 * A book of levels as the files that hold it: one per level, named by its
 * place in the order, and the index that gives the order. Moving a level in
 * the editor renumbers the files after it.
 */
export function splitBook(book) {
  const names = book.levels.map((_, k) => levelFileName(k));
  const index = `{\n  "format": ${FORMAT},\n  "levels": [\n${names.map((n) => `    "${n}"`).join(',\n')}${names.length ? '\n' : ''}  ]\n}\n`;
  return { index, files: book.levels.map((lv, k) => [names[k], formatLevel(lv)]) };
}

/**
 * The whole book as one file -- only for carrying it somewhere, as the editor's
 * download does when there is no dev server to save through;
 * `npm run levels:import` splits it back into levels/.
 */
export const formatBook = (book) => `${JSON.stringify({ format: FORMAT, levels: book.levels })}\n`;
