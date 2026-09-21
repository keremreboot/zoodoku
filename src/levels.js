// Locked levels: how a generated board is written down, read back and measured.
//
// A locked level stores the whole board -- lands, colours, animals, answers and
// every clue -- not the seed and settings that produced it. That is the point
// of locking: the generator will keep changing, and a level someone looked at
// and approved must never quietly become a different level because the code
// that once made it has moved on. The spec and seed are kept alongside, but
// only as a record of how it was made.
//
// Levels live in levels/levels.json, in play order. The editor writes that
// file; the game only reads it.

import { LANDS } from './habitats.js';
import { describeZones } from './zones.js';
import { COORDS, boardContext, chunks, ideas, sentenceCount } from './clues.js';
import { TIERS, groupClues, isSolved, narrow, sentenceReach, tierNeeded } from './deduce.js';
import { makeRules } from './util.js';

export const LEVEL_FILE = 'levels/levels.json';

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
 * `difficulty` puts the two together: bits, weighted up by half again for each
 * tier of leaning, summed over the deals, less a little for every spare clue
 * (which is help, not work), and scaled so a first tutorial board lands around
 * 2 and a hard 9 x 9 in the thirties. It is a guide for ordering
 * levels, not a law -- the editor shows it so the funnel can be checked at a
 * glance, and a person decides the order.
 *
 * `reach` is the depth a deal actually has: the fewest squares any one idea on
 * a card leaves an animal it talks about, read alone (1 means some sentence
 * names a square outright). `pair` marks a deal with two animals of a colour,
 * and `pairUsed` one that could not be solved at its tier without the rule that
 * they need two different lands.
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
    let reach = Infinity;
    for (const id of deal.animals) {
      for (const idea of ideas(deal.clues.filter((cl) => cl.a === id))) {
        const left = sentenceReach(idea, cand, puzzle.ctx, pos, deal.animals);
        left.forEach((n, k) => {
          if (n < cand[k].length) reach = Math.min(reach, n); // only animals it narrows
        });
      }
    }
    const colours = deal.animals.map((id) => puzzle.animals[id].land);
    const pair = new Set(colours).size < colours.length;
    // does the pair matter -- would the deal stall if a land could take both?
    const groups = groupClues(deal.clues, deal.animals);
    const pairUsed =
      pair && !isSolved(narrow(cand, groups, puzzle.ctx, pos, deal.animals, puzzle.spec?.tier ?? 2, false));
    return {
      bits: Math.round(bits * 10) / 10,
      tier,
      clues: deal.clues.length,
      sentences,
      spare: deal.spare ?? 0,
      coords: deal.clues.some((cl) => COORDS.includes(cl.k)),
      reach: Number.isFinite(reach) ? reach : null,
      pair,
      pairUsed,
    };
  });
  const weight = deals.reduce((s, d) => s + d.bits * (1 + 0.5 * Math.max(0, d.tier)) - 4 * d.spare, 0);
  return {
    deals,
    repeats: repetition(puzzle),
    landmarks: puzzle.landmarks.length,
    tier: Math.max(...deals.map((d) => d.tier)),
    tierName: TIERS[Math.max(...deals.map((d) => d.tier))]?.name ?? 'unsolvable',
    sentences: deals.reduce((s, d) => s + d.sentences, 0),
    coords: deals.some((d) => d.coords),
    reach: deals.some((d) => d.reach != null) ? Math.min(...deals.map((d) => d.reach ?? Infinity)) : null,
    pairDeals: deals.filter((d) => d.pair).length,
    pairsUsed: deals.filter((d) => d.pairUsed).length,
    difficulty: Math.round(weight / 3),
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
      clues: d.clues.map(({ k, a, b, n, m }) => (m != null && m >= 0 ? { k, a, b, n, m } : { k, a, b, n })),
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

/** An empty level list, the shape levels.json always has. */
export const emptyBook = () => ({ format: FORMAT, levels: [] });

/** Fetch the level list. A missing file is an empty list, not an error. */
export async function loadLevels(url = LEVEL_FILE) {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return emptyBook();
  if (!res.ok) throw new Error(`could not load ${url}: HTTP ${res.status}`);
  const book = await res.json();
  if (book.format !== FORMAT) throw new Error(`${url} is format ${book.format}, expected ${FORMAT}`);
  return book;
}

/**
 * levels.json as text: one line per level. A level is a few hundred numbers
 * nobody edits by hand, so pretty-printing it only buries the one thing a diff
 * should show -- which levels were added, removed or moved.
 */
export function formatBook(book) {
  const lines = book.levels.map((lv) => `    ${JSON.stringify(lv)}`);
  return `{\n  "format": ${FORMAT},\n  "levels": [\n${lines.join(',\n')}${lines.length ? '\n' : ''}  ]\n}\n`;
}
