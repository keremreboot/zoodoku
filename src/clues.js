// What an animal can say about where it is standing.
//
// A clue is a plain fact that is true of the finished board, written in the
// first person because that is how the animal announces it: "I'm next to the
// fish." Every clue depends only on its own square and, at most, one other
// fixed thing it names -- another animal, or a landmark. Never on a count of
// how many animals are nearby, and never on the board as a whole.
//
// That restriction is the whole reason the game holds together. Animals arrive
// in threes over several deals, so anything phrased as a tally ("nothing is
// next to me") would be true when it was dealt and false three deals later once
// a neighbour turned up. A fact about fixed squares can never go stale, so
// every clue a player has been shown is still true at the end. Lands and
// landmarks never move, so facts about them are fixed too -- "I'm in the
// biggest Meadow" is as permanent as "I'm in a corner".
//
// Three things live side by side here on purpose: what each clue means to the
// game (holds), how it is said (wording), and what the player is told it means
// (GLOSSARY). A sentence with two fair readings is a guess of its own, however
// sound the logic behind it, so the three have to agree -- and keeping them in
// one file is the cheapest way to keep them agreeing.
//
// A clue is { k, a, b, n, m }: its kind, the animal saying it, the animal it
// names (or -1), a number where the kind needs one (which edge, which colour,
// how many steps), and the landmark it names (absent, or -1, when it names none).
//
// holds() returns null rather than false when a square the clue depends on is
// still empty, so "not yet known" is never shown as "broken".

import { chebyshev, manhattan, neighbours } from './util.js';

/** Facts about the animal's own square that need no number. */
export const UNARY = [
  'rim',
  'inland',
  'corner',
  'notCorner',
  'top',
  'bottom',
  'left',
  'right',
  'zoneEdge',
  'zoneCore',
  'biggest',
  'smallest',
  'notBiggest',
];

/**
 * Facts about the animal's own square that carry a number: which edge, which
 * land colour, which row or column. Built separately because each has several
 * versions.
 */
export const NUMBERED = ['side', 'notSide', 'nearLand', 'notNearLand', 'inRow', 'inColumn'];

/**
 * Facts that name something else: another animal, or a landmark. `steps`
 * carries a distance and is built separately.
 */
export const BINARY = [
  'touch',
  'notTouch',
  'corners',
  'notCorners',
  'sameRow',
  'notSameRow',
  'sameCol',
  'notSameCol',
  'above',
  'below',
  'leftOf',
  'rightOf',
  'zoneTouch',
];

/** What can be said about a landmark: everything said of an animal, bar whose land it is in. */
export const LANDMARK_KINDS = [...BINARY.filter((k) => k !== 'zoneTouch'), 'steps'];

export const ALL_KINDS = [...UNARY, ...NUMBERED, ...BINARY, 'steps'];

/** Bare coordinates. Plain, but they hand over the answer rather than pose it. */
export const COORDS = ['inRow', 'inColumn'];

/**
 * The clue vocabulary, in the order a player meets it. Each step includes the
 * ones before it. The editor's vocabulary slider picks how far along to go.
 *
 * Plain is everything you can check by looking at the squares around an
 * animal: edges, corners, what it is next to, which land is biggest. Lines
 * adds relationships along rows and columns, which ask you to trace across the
 * board. Counting adds step distances and bordering lands, which ask you to
 * count or to think about a whole land at once.
 */
export const VOCABULARY = [
  {
    name: 'Plain',
    blurb: 'edges, corners, what an animal is next to, the biggest land',
    kinds: [
      'corner',
      'notCorner',
      'side',
      'notSide',
      'rim',
      'inland',
      'nearLand',
      'notNearLand',
      'zoneEdge',
      'zoneCore',
      'biggest',
      'smallest',
      'notBiggest',
      'touch',
      'notTouch',
    ],
  },
  {
    name: 'Lines',
    blurb: 'adds rows, columns, above/below, left/right, halves, diagonals',
    kinds: [
      'sameRow',
      'notSameRow',
      'sameCol',
      'notSameCol',
      'above',
      'below',
      'leftOf',
      'rightOf',
      'corners',
      'notCorners',
      'top',
      'bottom',
      'left',
      'right',
    ],
  },
  {
    name: 'Counting',
    blurb: 'adds step distances and bordering lands',
    kinds: ['steps', 'zoneTouch'],
  },
];

/** Every kind allowed at a vocabulary step, plus coordinates if asked for. */
export function kindsFor(vocab, coords = false) {
  const kinds = VOCABULARY.slice(0, vocab + 1).flatMap((v) => v.kinds);
  return coords ? [...kinds, ...COORDS] : kinds;
}

/**
 * How keen the generator is to use a kind -- low is keener. Readable, local
 * facts come first; distances and coordinates are there when nothing else will
 * separate two squares.
 */
export const RANK = {
  touch: 0,
  corner: 0,
  side: 0,
  nearLand: 0,
  biggest: 1,
  smallest: 1,
  rim: 1,
  notCorner: 2,
  notSide: 2,
  notBiggest: 2,
  corners: 2,
  inland: 2,
  notNearLand: 2,
  zoneCore: 2,
  sameRow: 2,
  sameCol: 2,
  notTouch: 3,
  notSameRow: 3,
  notSameCol: 3,
  notCorners: 3,
  zoneEdge: 3,
  above: 3,
  below: 3,
  leftOf: 3,
  rightOf: 3,
  top: 4,
  bottom: 4,
  left: 4,
  right: 4,
  zoneTouch: 5,
  steps: 8,
  inRow: 12,
  inColumn: 12,
};

/**
 * The board as clues see it. Built the same way for a fresh board and for a
 * locked level, so a clue can never mean one thing in the editor and another
 * in the game.
 */
export function boardContext({ R, zones, zoneLand, lands, animals, landmarks = [] }) {
  return {
    R,
    zoneOf: zones.zoneOf,
    zoneAdj: zones.zoneAdj,
    zoneSize: zones.zoneCells.map((cells) => cells.length),
    zoneLand,
    lands,
    animals,
    landmarks,
  };
}

/** The other lands of the same colour, by size. */
const rivals = (ctx, z) =>
  ctx.zoneSize.filter((_, y) => y !== z && ctx.zoneLand[y] === ctx.zoneLand[z]);

/**
 * How clearly a land is the biggest or smallest of its colour: the gap to the
 * nearest rival, in squares (0 or less means it is not). The generator only
 * lets an animal say "biggest" when the gap is plain to see; the meaning, in
 * holds(), is simply "more squares than any other".
 */
export function sizeLead(ctx, z) {
  const others = rivals(ctx, z);
  if (!others.length) return { big: 0, small: 0 };
  return {
    big: ctx.zoneSize[z] - Math.max(...others),
    small: Math.min(...others) - ctx.zoneSize[z],
  };
}

/** The square of whatever a clue names: another animal, or a landmark. */
function otherSquare(cl, ctx, pos) {
  if (cl.m != null && cl.m >= 0) return ctx.landmarks[cl.m].cell;
  return pos[cl.b];
}

/**
 * Is this clue true, given where everyone is standing?
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
  const zone = ctx.zoneOf[i];

  switch (cl.k) {
    case 'rim':
      return r === 0 || c === 0 || r === N - 1 || c === N - 1;
    case 'inland':
      return r > 0 && c > 0 && r < N - 1 && c < N - 1;
    case 'corner':
      return (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
    case 'notCorner':
      return !((r === 0 || r === N - 1) && (c === 0 || c === N - 1));
    case 'side':
      return [r === 0, c === N - 1, r === N - 1, c === 0][cl.n];
    case 'notSide':
      return ![r === 0, c === N - 1, r === N - 1, c === 0][cl.n];
    // On an odd board the middle row and column belong to neither half, which
    // is what keeps "top half" a fact rather than a rounding convention.
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
      return neighbours(R, i).some((n) => ctx.zoneOf[n] !== zone);
    case 'zoneCore': {
      const ns = neighbours(R, i);
      return ns.length === 4 && ns.every((n) => ctx.zoneOf[n] === zone);
    }
    case 'nearLand':
      return neighbours(R, i).some((n) => ctx.zoneLand[ctx.zoneOf[n]] === cl.n);
    case 'notNearLand':
      return !neighbours(R, i).some((n) => ctx.zoneLand[ctx.zoneOf[n]] === cl.n);
    case 'biggest':
      return rivals(ctx, zone).every((s) => ctx.zoneSize[zone] > s);
    case 'smallest':
      return rivals(ctx, zone).every((s) => ctx.zoneSize[zone] < s);
    case 'notBiggest':
      return !rivals(ctx, zone).every((s) => ctx.zoneSize[zone] > s);
    default:
      break;
  }

  const j = otherSquare(cl, ctx, pos);
  if (j == null || j < 0) return null;
  const diagonal = chebyshev(R, i, j) === 1 && manhattan(R, i, j) === 2;

  switch (cl.k) {
    case 'touch':
      return manhattan(R, i, j) === 1;
    case 'notTouch':
      return manhattan(R, i, j) !== 1;
    case 'corners':
      return diagonal;
    case 'notCorners':
      return !diagonal;
    case 'sameRow':
      return r === R.row(j);
    case 'notSameRow':
      return r !== R.row(j);
    case 'sameCol':
      return c === R.col(j);
    case 'notSameCol':
      return c !== R.col(j);
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
      return ctx.zoneAdj[zone].has(ctx.zoneOf[j]);
    default:
      return null;
  }
}

// --- wording ---------------------------------------------------------------
//
// Short, first person, plain words. "Next to" rather than "touch", "above"
// rather than "in a higher row than". Short words can be read two ways more
// easily than long ones, which is what GLOSSARY is for: every short sentence
// has one exact meaning written down, and the key shows it.

const SIDES = ['top', 'right', 'bottom', 'left'];

/** What a clue points at: an animal, a landmark, a land colour or an edge. */
function target(cl, ctx) {
  if (cl.k === 'nearLand' || cl.k === 'notNearLand') return ctx.lands[cl.n].name;
  if (cl.k === 'notSide') return SIDES[cl.n];
  const thing = cl.m != null && cl.m >= 0 ? ctx.landmarks[cl.m] : ctx.animals[cl.b];
  return `the ${thing.icon} ${thing.name}`;
}

const ownLand = (cl, ctx) => ctx.lands[ctx.animals[cl.a].land].name;

const and = (xs) =>
  xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const or = (xs) =>
  xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;

/**
 * Kinds an animal can say about several things at once, and how to say them
 * together. Two touches become "I'm next to the fish and the tree" -- one
 * sentence, one idea -- rather than two that happen to share a verb.
 */
const GROUPABLE = {
  touch: (xs) => `I'm next to ${and(xs)}.`,
  notTouch: (xs) => `I'm not next to ${or(xs)}.`,
  corners: (xs) => `I'm diagonal to ${and(xs)}.`,
  notCorners: (xs) => `I'm not diagonal to ${or(xs)}.`,
  sameRow: (xs) => (xs.length === 1 ? `I'm in ${xs[0]}'s row.` : `I'm in the same row as ${and(xs)}.`),
  notSameRow: (xs) =>
    xs.length === 1 ? `I'm not in ${xs[0]}'s row.` : `I'm not in the same row as ${or(xs)}.`,
  sameCol: (xs) =>
    xs.length === 1 ? `I'm in ${xs[0]}'s column.` : `I'm in the same column as ${and(xs)}.`,
  notSameCol: (xs) =>
    xs.length === 1 ? `I'm not in ${xs[0]}'s column.` : `I'm not in the same column as ${or(xs)}.`,
  above: (xs) => `I'm above ${and(xs)}.`,
  below: (xs) => `I'm below ${and(xs)}.`,
  leftOf: (xs) => `I'm left of ${and(xs)}.`,
  rightOf: (xs) => `I'm right of ${and(xs)}.`,
  zoneTouch: (xs) =>
    xs.length === 1 ? `My land borders ${xs[0]}'s land.` : `My land borders the lands of ${and(xs)}.`,
  nearLand: (xs) => `I'm next to ${and(xs)}.`,
  notNearLand: (xs) => `I'm not next to ${or(xs)}.`,
  notSide: (xs) => `I'm not on the ${or(xs)} edge.`,
};

function one(cl, ctx) {
  if (GROUPABLE[cl.k]) return GROUPABLE[cl.k]([target(cl, ctx)]);
  switch (cl.k) {
    case 'rim':
      return "I'm on an edge.";
    case 'inland':
      return "I'm not on an edge.";
    case 'corner':
      return "I'm in a corner.";
    case 'notCorner':
      return "I'm not in a corner.";
    case 'side':
      return `I'm on the ${SIDES[cl.n]} edge.`;
    case 'top':
    case 'bottom':
    case 'left':
    case 'right':
      return `I'm in the ${cl.k} half.`;
    case 'zoneEdge':
      return "I'm next to another land.";
    case 'zoneCore':
      return "I'm surrounded by my own land.";
    case 'biggest':
      return `I'm in the biggest ${ownLand(cl, ctx)}.`;
    case 'smallest':
      return `I'm in the smallest ${ownLand(cl, ctx)}.`;
    case 'notBiggest':
      return `I'm not in the biggest ${ownLand(cl, ctx)}.`;
    case 'inRow':
      return `I'm in row ${cl.n + 1}.`;
    case 'inColumn':
      return `I'm in column ${cl.n + 1}.`;
    case 'steps':
      return `I'm ${cl.n} steps from ${target(cl, ctx)}.`;
    default:
      return '';
  }
}

/**
 * Which of one animal's clues are said together. Repeats of a groupable kind
 * fold into one sentence, and so do a corner and an edge -- "I'm in a corner.
 * I'm on the bottom edge." is one fact, a bottom corner, and is said as one.
 * Two edges at right angles are a corner too, whether or not "corner" was
 * among the clues. "I'm on an edge" with "I'm not on the top edge" becomes
 * "I'm on an edge, but not the top one".
 *
 * This is the single source for what makes a sentence: the card's wording
 * and the generator's count of sentences per card both come from here, so the
 * limit the editor sets is the limit the player sees.
 */
function fold(clues) {
  const out = [];
  const spoken = new Set();

  const sides = clues.filter((c) => c.k === 'side');
  const corner = clues.find((c) => c.k === 'corner');
  const upDown = sides.find((c) => c.n === 0 || c.n === 2);
  const leftRight = sides.find((c) => c.n === 1 || c.n === 3);
  if (upDown && leftRight) {
    const group = corner ? [upDown, leftRight, corner] : [upDown, leftRight];
    group.forEach((c) => spoken.add(c));
    out.push({ as: 'namedCorner', clues: group });
  } else if (corner && sides.length === 1) {
    spoken.add(corner);
    spoken.add(sides[0]);
    out.push({ as: 'sideCorner', clues: [corner, sides[0]] });
  }

  const rim = clues.find((c) => c.k === 'rim');
  const notSides = clues.filter((c) => c.k === 'notSide');
  if (rim && notSides.length) {
    const group = [rim, ...notSides];
    group.forEach((c) => spoken.add(c));
    out.push({ as: 'edgeBut', clues: group });
  }

  for (const cl of clues) {
    if (spoken.has(cl)) continue;
    if (!GROUPABLE[cl.k]) {
      spoken.add(cl);
      out.push({ as: cl.k, clues: [cl] });
      continue;
    }
    const together = clues.filter((c) => c.k === cl.k && !spoken.has(c));
    together.forEach((c) => spoken.add(c));
    out.push({ as: cl.k, clues: together });
  }
  return out;
}

function say(group, ctx) {
  const [first] = group.clues;
  if (group.as === 'namedCorner') {
    const [upDown, leftRight] = group.clues;
    return `I'm in the ${SIDES[upDown.n]}-${SIDES[leftRight.n]} corner.`;
  }
  if (group.as === 'sideCorner') {
    const side = group.clues[1];
    return side.n === 0 || side.n === 2
      ? `I'm in a ${SIDES[side.n]} corner.`
      : `I'm in a corner on the ${SIDES[side.n]}.`;
  }
  if (group.as === 'edgeBut') {
    return `I'm on an edge, but not the ${or(group.clues.slice(1).map((c) => SIDES[c.n]))} one.`;
  }
  if (GROUPABLE[first.k]) return GROUPABLE[first.k](group.clues.map((c) => target(c, ctx)));
  return one(first, ctx);
}

/**
 * One animal's clues as the sentences on its card, each paired with the clues
 * it speaks for -- the card lights a sentence up once every square it depends
 * on is filled, and needs to know which those are.
 */
export function chunks(clues, ctx) {
  return fold(clues).map((group) => ({ clues: group.clues, text: say(group, ctx) }));
}

export function phrase(clues, ctx) {
  return chunks(clues, ctx)
    .map((c) => c.text)
    .join(' ');
}

/** How many sentences these clues make on a card. */
export const sentenceCount = (clues) => fold(clues).length;

/**
 * Every clue the game can say, and exactly what it means -- shown in the key
 * word for word. Each meaning is written against holds() above, not against
 * the sentence. tools/audit.mjs fails if any kind is missing from this list.
 */
export const GLOSSARY = [
  {
    kinds: ['touch', 'notTouch'],
    say: "I'm next to the fox. (Or not next to it.)",
    means: "Our squares share a side. Touching only at a corner doesn't count.",
  },
  {
    kinds: ['corners', 'notCorners'],
    say: "I'm diagonal to the fox. (Or not diagonal to it.)",
    means: 'Our squares touch at one corner and nothing else.',
  },
  {
    kinds: ['sameRow', 'notSameRow', 'sameCol', 'notSameCol'],
    say: "I'm in the fox's row. (Or column; or not in it.)",
    means: 'Same row (or column), any distance apart.',
  },
  {
    kinds: ['above', 'below'],
    say: "I'm above the fox. (Or below.)",
    means: "Anywhere in a higher (or lower) row. Columns don't matter.",
  },
  {
    kinds: ['leftOf', 'rightOf'],
    say: "I'm left of the fox. (Or right of.)",
    means: "Anywhere in a column further left (or right). Rows don't matter.",
  },
  {
    kinds: ['steps'],
    say: "I'm 3 steps from the fox.",
    means: 'Count moves up, down, left or right. A diagonal neighbour is 2 steps.',
  },
  {
    kinds: ['zoneTouch'],
    say: "My land borders the fox's land.",
    means: "A square of my land shares a side with a square of the fox's land.",
  },
  {
    kinds: [],
    say: "I'm next to the 🌳 tree.",
    means:
      'Landmarks are fixed from the start, and anything said about an animal can be said about one, meaning exactly the same. Nothing stands on a landmark.',
  },
  {
    kinds: ['rim', 'inland'],
    say: "I'm on an edge. (Or not on an edge.)",
    means: 'The edge is the outer ring of squares.',
  },
  {
    kinds: ['side', 'notSide'],
    say: "I'm on the top edge. (Or not on it.)",
    means: 'The top row (or right column, and so on). A corner is on two edges.',
  },
  {
    kinds: ['corner', 'notCorner'],
    say: "I'm in a corner. (Or a bottom corner, the top-left corner, or not in a corner.)",
    means: 'One of the four corner squares — or the two along that edge, or exactly that one.',
  },
  {
    kinds: ['top', 'bottom', 'left', 'right'],
    say: "I'm in the top half. (Or bottom, left, right.)",
    means:
      'If the board has an odd number of rows, the middle row is in neither half. The same goes for columns.',
  },
  {
    kinds: ['zoneEdge'],
    say: "I'm next to another land.",
    means: "A square sharing a side with mine is in a different land. The board's edge doesn't count.",
  },
  {
    kinds: ['zoneCore'],
    say: "I'm surrounded by my own land.",
    means: "All four squares sharing a side with mine are in my land. So I'm not on an edge.",
  },
  {
    kinds: ['nearLand', 'notNearLand'],
    say: "I'm next to Desert. (Or not next to Desert.)",
    means: 'A square sharing a side with mine is (or none is) in a Desert land. Only other colours are named.',
  },
  {
    kinds: ['biggest', 'smallest', 'notBiggest'],
    say: "I'm in the biggest Meadow. (Or the smallest; or not the biggest.)",
    means:
      'My land has more (or fewer) squares than any other land of my colour. Count every square inside its heavy lines, landmarks too.',
  },
  {
    kinds: ['inRow', 'inColumn'],
    say: "I'm in row 3. (Or column 3.)",
    means: 'Rows count from 1 at the top, columns from 1 at the left.',
  },
];
