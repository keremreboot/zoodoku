// Solving a deal the way a player does: by elimination, never by supposing.
//
// This is the rule every deal is built to: it must be solvable without a
// guess. Unique is not enough -- a deal can have exactly one answer and still
// only be findable by supposing an animal is somewhere and following it
// through, and with a strike on every wrong square that supposition is a paid
// guess.
//
// So each animal starts with every square it could legally take, and squares
// are crossed off until nothing more falls:
//
//   - everything said about one animal is read together, and a square that
//     breaks any of it goes;
//   - everything said about the same two animals is read together too -- "I
//     share a row with the rooster" and "the rooster is exactly 5 steps away"
//     are one fact about where the rooster stands -- and a square goes when no
//     square still open to the other animal fits with it.
//
// A deal passes when every animal is down to one square. What this never does
// is suppose: chaining "if the crab were here, the rooster would be there, and
// then the owl could not..." through all three animals is the guessing the rule
// forbids, so a deal that needs it is not a deal this game will deal.
//
// Animals from earlier deals are already on the board, so anything said about
// one of them is, to the player, a fact about a fixed square -- it is read as
// part of what is said about the animal in the current deal.

import { holds } from './clues.js';

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
 * @returns the narrowed candidate lists (the input is left alone)
 */
export function narrow(open, groups, ctx, pos, subs) {
  const dom = open.map((cells) => cells.slice());
  const fits = (clues) => clues.every((cl) => holds(cl, ctx, pos) === true);

  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groups) {
      const turns = g.b < 0 ? [[g.a, -1]] : [[g.a, g.b], [g.b, g.a]];
      for (const [m, o] of turns) {
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

export const isSolved = (dom) => dom.every((cells) => cells.length === 1);

/** How much is still open, as the number of arrangements the lists allow. */
export const openness = (dom) => dom.reduce((n, cells) => n * cells.length, 1);
