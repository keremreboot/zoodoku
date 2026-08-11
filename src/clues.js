// What an animal can say about where it is standing.
//
// A clue is a plain fact that is true of the finished board, written in the
// first person because that is how the animal announces it: "I touch the fish."
// Every clue here depends only on its own square and on the square of one
// animal it names -- never on a count of how many animals are nearby, and never
// on the board as a whole.
//
// That restriction is the whole reason the game holds together. Animals arrive
// in threes over several rounds, so anything phrased as a tally ("nothing
// touches me") would be true when it was dealt and false three rounds later
// once a neighbour turned up. A fact about two fixed squares can never go stale,
// so every clue a player has been shown is still true at the end.
//
// holds() returns null rather than false when a named animal has not been
// placed yet: the view needs to tell "not yet known" apart from "broken", and
// collapsing the two would paint a clue red before the player had a chance.

import { chebyshev, manhattan, neighbours } from './util.js';

/** Clues about the animal's own square alone. */
export const UNARY = [
  'rim',
  'inland',
  'corner',
  'top',
  'bottom',
  'left',
  'right',
  'zoneEdge',
  'zoneCore',
];

/** Clues that name another animal. `steps` is generated separately -- it carries a distance. */
export const BINARY = [
  'touch',
  'notTouch',
  'corners',
  'sameRow',
  'sameCol',
  'above',
  'below',
  'leftOf',
  'rightOf',
  'zoneTouch',
];

/**
 * How reluctant the generator should be to use a kind, low is keener. Bare
 * coordinates sit far out at 24 so they are only ever reached for when nothing
 * else will separate two candidate squares -- but they are always in the pool,
 * and that is deliberate. Row plus column pins any square outright, so their
 * presence is what guarantees a deal can always be made unique, and the
 * generator therefore never has to fail.
 */
export const RANK = {
  touch: 0,
  corner: 0,
  rim: 1,
  corners: 1,
  sameRow: 2,
  sameCol: 2,
  zoneTouch: 2,
  zoneCore: 2,
  notTouch: 3,
  zoneEdge: 3,
  above: 4,
  below: 4,
  leftOf: 4,
  rightOf: 4,
  steps: 10,
  top: 5,
  bottom: 5,
  left: 5,
  right: 5,
  inRow: 160,
  inColumn: 160,
};

/**
 * What the gentle level restricts itself to: facts you can check by looking,
 * without counting anything or working out where the middle of the board is.
 *
 * It is a wide list on purpose. A narrow one sounds kinder and is not -- with
 * too few things the animals are allowed to say, the generator cannot pin a
 * deal at all and ends up falling back on bare coordinates, which is the least
 * gentle clue in the game. Only counting steps and naming halves are held back.
 */
export const SIMPLE_KINDS = [
  'touch',
  'notTouch',
  'corners',
  'rim',
  'corner',
  'sameRow',
  'sameCol',
  'zoneTouch',
  'zoneEdge',
  'zoneCore',
  'above',
  'below',
  'leftOf',
  'rightOf',
  'inRow',
  'inColumn',
];

export const ALL_KINDS = [...SIMPLE_KINDS, 'top', 'bottom', 'left', 'right', 'steps'];

/**
 * Is this clue true, given where everyone is standing?
 *
 * ctx carries the board: { R, zoneOf, zoneAdj }. pos maps animal id -> square,
 * with -1 for an animal not yet placed.
 *
 * @returns {boolean|null} null when a square the clue depends on is unknown
 */
export function holds(cl, ctx, pos) {
  const R = ctx.R;
  const i = pos[cl.a];
  if (i < 0) return null;
  const N = R.N;
  const r = R.row(i);
  const c = R.col(i);

  switch (cl.k) {
    case 'rim':
      return r === 0 || c === 0 || r === N - 1 || c === N - 1;
    case 'inland':
      return r > 0 && c > 0 && r < N - 1 && c < N - 1;
    case 'corner':
      return (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
    // On an odd board the middle row and column belong to neither half, which
    // is what keeps "upper half" a fact rather than a rounding convention.
    case 'top':
      return r * 2 < N - 1;
    case 'bottom':
      return r * 2 > N - 1;
    case 'left':
      return c * 2 < N - 1;
    case 'right':
      return c * 2 > N - 1;
    case 'inRow':
      return r === cl.n;
    case 'inColumn':
      return c === cl.n;
    case 'zoneEdge':
      return neighbours(R, i).some((n) => ctx.zoneOf[n] !== ctx.zoneOf[i]);
    case 'zoneCore': {
      const ns = neighbours(R, i);
      return ns.length === 4 && ns.every((n) => ctx.zoneOf[n] === ctx.zoneOf[i]);
    }
    default:
      break;
  }

  const j = pos[cl.b];
  if (j < 0) return null;

  switch (cl.k) {
    case 'touch':
      return manhattan(R, i, j) === 1;
    case 'notTouch':
      return manhattan(R, i, j) !== 1;
    case 'corners':
      return chebyshev(R, i, j) === 1 && manhattan(R, i, j) === 2;
    case 'sameRow':
      return r === R.row(j);
    case 'sameCol':
      return c === R.col(j);
    case 'above':
      return r < R.row(j);
    case 'below':
      return r > R.row(j);
    case 'leftOf':
      return c < R.col(j);
    case 'rightOf':
      return c > R.col(j);
    case 'steps':
      return manhattan(R, i, j) === cl.n;
    case 'zoneTouch':
      return ctx.zoneAdj[ctx.zoneOf[i]].has(ctx.zoneOf[j]);
    default:
      return null;
  }
}

// --- wording ---------------------------------------------------------------

const naming = (ctx, id) => {
  const a = ctx.animals[id];
  return `${a.icon} ${a.name}`;
};

/** "the fox and the owl" / "the fox, the owl and the bear" */
function series(parts) {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Kinds an animal can say more than once, and how to say them together. Two
 * touches want to be "I touch both the fish and the lion" -- one sentence, one
 * idea -- not two statements that happen to share a verb.
 */
const GROUPABLE = {
  touch: {
    1: (n) => `I touch ${n[0]}.`,
    2: (n) => `I touch both ${n[0]} and ${n[1]}.`,
    n: (n) => `I touch every one of ${series(n)}.`,
  },
  notTouch: {
    1: (n) => `I do not touch ${n[0]}.`,
    2: (n) => `I touch neither ${n[0]} nor ${n[1]}.`,
    n: (n) => `I touch none of ${series(n)}.`,
  },
  corners: {
    1: (n) => `I meet ${n[0]} corner to corner.`,
    2: (n) => `I meet both ${n[0]} and ${n[1]} corner to corner.`,
    n: (n) => `I meet each of ${series(n)} corner to corner.`,
  },
  sameRow: {
    1: (n) => `I share a row with ${n[0]}.`,
    2: (n) => `I share a row with both ${n[0]} and ${n[1]}.`,
    n: (n) => `I share a row with ${series(n)}.`,
  },
  sameCol: {
    1: (n) => `I share a column with ${n[0]}.`,
    2: (n) => `I share a column with both ${n[0]} and ${n[1]}.`,
    n: (n) => `I share a column with ${series(n)}.`,
  },
  zoneTouch: {
    1: (n) => `My land borders ${n[0]}'s land.`,
    2: (n) => `My land borders the lands of both ${n[0]} and ${n[1]}.`,
    n: (n) => `My land borders the lands of ${series(n)}.`,
  },
};

const say = (kind, names) => GROUPABLE[kind][names.length === 1 ? 1 : names.length === 2 ? 2 : 'n'](names);

function one(cl, ctx) {
  const other = cl.b >= 0 ? `the ${naming(ctx, cl.b)}` : '';
  if (GROUPABLE[cl.k]) return say(cl.k, [other]);
  switch (cl.k) {
    case 'rim':
      return 'I stand against the rim of the board.';
    case 'inland':
      return 'I keep clear of the rim of the board.';
    case 'corner':
      return 'I stand in a corner of the board.';
    case 'top':
      return 'I am in the upper half of the board.';
    case 'bottom':
      return 'I am in the lower half of the board.';
    case 'left':
      return 'I am in the left half of the board.';
    case 'right':
      return 'I am in the right half of the board.';
    case 'inRow':
      return `I am in row ${cl.n + 1}, counting from the top.`;
    case 'inColumn':
      return `I am in column ${cl.n + 1}, counting from the left.`;
    case 'zoneEdge':
      return 'A square beside me belongs to another land.';
    case 'zoneCore':
      return 'Every square beside me belongs to my own land.';
    case 'above':
      return `I am higher up the board than ${other}.`;
    case 'below':
      return `I am lower down the board than ${other}.`;
    case 'leftOf':
      return `I am further left than ${other}.`;
    case 'rightOf':
      return `I am further right than ${other}.`;
    case 'steps':
      return `${capital(other)} is exactly ${cl.n} steps away.`;
    default:
      return '';
  }
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One animal's clues, folded into the fewest sentences that still say all of
 * it. Repeats of a kind are gathered -- two touches become "I touch both the
 * fish and the lion" rather than two flat statements, which is how anyone
 * would actually say it.
 *
 * Each sentence comes back paired with the clues it speaks for, because the
 * view marks a sentence wrong the moment one of its clues is broken and needs
 * to know which those are. Folding without that pairing would force the whole
 * card to go red over a single mistake.
 */
export function chunks(clues, ctx) {
  const out = [];
  const spoken = new Set();
  for (const cl of clues) {
    if (spoken.has(cl)) continue;
    if (!GROUPABLE[cl.k]) {
      spoken.add(cl);
      out.push({ clues: [cl], text: one(cl, ctx) });
      continue;
    }
    const together = clues.filter((c) => c.k === cl.k && !spoken.has(c));
    together.forEach((c) => spoken.add(c));
    out.push({
      clues: together,
      text: say(cl.k, together.map((c) => `the ${naming(ctx, c.b)}`)),
    });
  }
  return out;
}

export function phrase(clues, ctx) {
  return chunks(clues, ctx)
    .map((c) => c.text)
    .join(' ');
}
