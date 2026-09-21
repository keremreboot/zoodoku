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
