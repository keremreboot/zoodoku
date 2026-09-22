// Solving a deal the way a player does: by elimination, never by supposing.
//
// This is the rule every deal is built to: it must be solvable without a
// guess. Unique is not enough -- a deal can have exactly one answer and still
// only be findable by supposing an animal is somewhere and following it
// through, and with a strike on every wrong square that supposition is a paid
// guess.
//
// So each animal starts with every square it could legally take, and squares
// are crossed off until nothing more falls. How much the animals of a deal may
// lean on each other while that happens is the TIER, and it is the main dial of
// difficulty:
//
//   0  alone     Each animal is placed from its own card. Anything said about
//                an animal already on the board counts -- that animal is not
//                going anywhere -- but what one animal of this deal says about
//                another of this deal is no help until then.
//   1  in turn   Place one, and it becomes a fixed point for the others: "I'm
//                next to the fish" is used as soon as the fish is placed.
//   2  together  Animals pin each other while neither is placed yet: the fish
//                can only be here or here, so the bear, being next to it, can
//                only be there.
//
// At every tier, everything said about one animal is read together, and so is
// everything said about the same two animals -- "I'm in the rooster's row" and
// "I'm 5 steps from the rooster" are one fact about where the rooster stands.
// What no tier ever does is suppose: chaining "if the crab were here, the
// rooster would be there, and then the owl could not..." through all three is
// the guessing the rule forbids.
//
// A deal can hold two animals of one colour, and then the rule that a land
// takes one animal is something to reason with, not just something the board
// enforces. It leans on the other animal, so it follows the tier like any fact
// about two animals: in turn, a placed animal's land is closed to its twin --
// exactly what the board shows by crossing that land out -- and together, an
// animal whose every open square lies in one land closes that land to its twin
// before either is placed. "The goat can only be in the big Meadow, so the
// sheep is in the other one."

import { holds } from './clues.js';

export const TIERS = [
  { name: 'Alone', blurb: 'every animal can be placed from its own card' },
  { name: 'In turn', blurb: 'placing one animal tells you where the next goes' },
  { name: 'Together', blurb: 'animals pin each other before any is placed' },
];

/**
 * Sort a deal's clues by who they are about.
 * @param subs the deal's three animal ids
 * @returns [{ a, b, clues }] with a and b indexes into subs, b = -1 for one animal
 */
export function groupClues(clues, subs) {
  const groups = new Map();
  for (const cl of clues) {
    const x = subs.indexOf(cl.a);
    const y = cl.b >= 0 ? subs.indexOf(cl.b) : -1;
    const [a, b] = y < 0 ? [x, -1] : [Math.min(x, y), Math.max(x, y)];
    const key = `${a},${b}`;
    if (!groups.has(key)) groups.set(key, { a, b, clues: [] });
    groups.get(key).clues.push(cl);
  }
  return [...groups.values()];
}

/**
 * Cross off squares until nothing more falls.
 *
 * @param open  one array of candidate squares per animal of the deal
 * @param pos   scratch positions for every animal; earlier deals already filled in
 * @param tier  how much the deal's animals may lean on each other (see TIERS)
 * @param oneLand  use "a land takes one animal" between animals of one colour
 * @returns the narrowed candidate lists (the input is left alone)
 */
export function narrow(open, groups, ctx, pos, subs, tier = 2, oneLand = true) {
  const dom = open.map((cells) => cells.slice());
  const fits = (clues) => clues.every((cl) => holds(cl, ctx, pos) === true);
  const twins = oneLand && tier > 0 ? sameColour(ctx, subs) : [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const [me, other] of twins) {
      // in turn, only a placed twin closes its land; together, a confined one does
      if (tier === 1 && dom[other].length !== 1) continue;
      const zone = ctx.zoneOf[dom[other][0]];
      if (!dom[other].every((y) => ctx.zoneOf[y] === zone)) continue;
      const kept = dom[me].filter((x) => ctx.zoneOf[x] !== zone);
      if (kept.length < dom[me].length) {
        dom[me] = kept;
        changed = true;
      }
    }
    for (const g of groups) {
      if (g.b >= 0 && tier === 0) continue; // about two of this deal: no help alone
      const turns = g.b < 0 ? [[g.a, -1]] : [[g.a, g.b], [g.b, g.a]];
      for (const [m, o] of turns) {
        // in turn: the other animal has to be settled -- down to one square -- first
        if (o >= 0 && tier === 1 && dom[o].length !== 1) continue;
        const me = subs[m];
        const kept = dom[m].filter((x) => {
          pos[me] = x;
          if (o < 0) return fits(g.clues);
          const other = subs[o];
          return dom[o].some((y) => {
            pos[other] = y;
            return fits(g.clues);
          });
        });
        if (kept.length < dom[m].length) {
          dom[m] = kept;
          changed = true;
        }
      }
    }
  }
  return dom;
}

/** Ordered pairs [m, o] of a deal's animals (indexes into subs) that share a colour. */
export function sameColour(ctx, subs) {
  const out = [];
  subs.forEach((a, m) =>
    subs.forEach((b, o) => {
      if (m !== o && ctx.animals[a].land === ctx.animals[b].land) out.push([m, o]);
    })
  );
  return out;
}

/**
 * How many squares one sentence leaves each animal of the deal, read on its
 * own: nothing else on the cards, and no other rule but the colours. An animal
 * the sentence does not mention keeps all its squares. A 1 means that
 * sentence alone says where the animal goes -- the "too focused" clue that
 * depth is about.
 */
export function sentenceReach(clues, open, ctx, pos, subs) {
  return narrow(open, groupClues(clues, subs), ctx, pos, subs, 2, false).map((cells) => cells.length);
}

export const isSolved = (dom) => dom.every((cells) => cells.length === 1);

/** How much is still open, as the number of arrangements the lists allow. */
export const openness = (dom) => dom.reduce((n, cells) => n * cells.length, 1);

/**
 * The least a deal asks of the player: the lowest tier that solves it, or -1
 * if even "together" stalls -- which, for a deal built by the generator, would
 * be a bug.
 */
export function tierNeeded(open, clues, ctx, pos, subs) {
  const groups = groupClues(clues, subs);
  for (let t = 0; t < TIERS.length; t++) {
    if (isSolved(narrow(open, groups, ctx, pos, subs, t))) return t;
  }
  return -1;
}

// --- how hard a deal is to work through --------------------------------------
//
// The tier says what kind of reasoning a deal allows. These say how much of it
// the deal actually asks for, in the terms a player feels:
//
//   footholds    how many animals can be placed straight from their own card,
//                before anything else is known -- a deal with none has no
//                obvious first move, which is what makes a jump in difficulty
//                feel like a cliff;
//   facts        per animal, the fewest ideas (a sentence, or everything one
//                card says about the same thing) that have to be put together
//                to pin it, from any card -- 1 is "the card says where", 3 is
//                three regions that only meet on one square;
//   rounds       how many waves of deduction the deal takes, when each wave can
//                only use what the waves before it found: finding the fish
//                before the bear, and the bear before the owl, is 3.

/** How many of a deal's animals their own card places, before anything else is known. */
export function footholds(open, clues, ctx, pos, subs) {
  return subs.filter((a, m) => {
    if (open[m].length === 1) return true;
    const own = clues.filter((cl) => cl.a === a);
    return narrow(open, groupClues(own, subs), ctx, pos, subs, 0)[m].length === 1;
  }).length;
}

/** Every way to pick k of n things, as index lists. */
function* choose(n, k, from = 0, acc = []) {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = from; i <= n - (k - acc.length); i++) yield* choose(n, k, i + 1, [...acc, i]);
}

/**
 * Per animal, the fewest ideas that together pin it at the tier -- or cap + 1
 * when no set that small does. `ideas` is every card's ideas, as clue lists.
 */
export function factsNeeded(open, ideas, ctx, pos, subs, tier, cap = 4) {
  const need = subs.map((_, m) => (open[m].length === 1 ? 0 : cap + 1));
  for (let k = 1; k <= Math.min(cap, ideas.length); k++) {
    if (need.every((v) => v <= k)) break;
    for (const set of choose(ideas.length, k)) {
      const clues = set.flatMap((i) => ideas[i]);
      narrow(open, groupClues(clues, subs), ctx, pos, subs, tier).forEach((cells, m) => {
        if (cells.length === 1 && need[m] > k) need[m] = k;
      });
    }
  }
  return need;
}

/**
 * Waves of deduction. In one wave every group of facts, and the one-land rule,
 * is applied to what was open at the START of the wave, so a fact that only
 * works once another animal is found waits for the next one. Infinity if the
 * deal never finishes at this tier.
 */
export function rounds(open, clues, ctx, pos, subs, tier) {
  const groups = groupClues(clues, subs);
  const twins = tier > 0 ? sameColour(ctx, subs) : [];
  const fits = (list) => list.every((cl) => holds(cl, ctx, pos) === true);
  let dom = open.map((cells) => cells.slice());
  for (let wave = 1; wave <= 30; wave++) {
    if (isSolved(dom)) return wave - 1;
    const was = dom;
    const next = was.map((cells) => new Set(cells));
    for (const g of groups) {
      if (g.b >= 0 && tier === 0) continue;
      const turns = g.b < 0 ? [[g.a, -1]] : [[g.a, g.b], [g.b, g.a]];
      for (const [m, o] of turns) {
        if (o >= 0 && tier === 1 && was[o].length !== 1) continue;
        for (const x of was[m]) {
          pos[subs[m]] = x;
          const ok =
            o < 0
              ? fits(g.clues)
              : was[o].some((y) => {
                  pos[subs[o]] = y;
                  return fits(g.clues);
                });
          if (!ok) next[m].delete(x);
        }
      }
    }
    for (const [m, o] of twins) {
      if (tier === 1 && was[o].length !== 1) continue;
      const zone = ctx.zoneOf[was[o][0]];
      if (!was[o].every((y) => ctx.zoneOf[y] === zone)) continue;
      for (const x of was[m]) if (ctx.zoneOf[x] === zone) next[m].delete(x);
    }
    dom = next.map((s) => [...s]);
    if (dom.every((cells, k) => cells.length === was[k].length)) return Infinity;
  }
  return Infinity;
}
