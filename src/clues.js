// What an animal can say about where it is standing.
//
// A clue is a plain fact that is true of the finished board, written in the
// first person because that is how the animal announces it: "I'm next to the
// fish." Every clue depends only on its own square, the lands and landmarks,
// and at most two other things it names -- and of those, at most one is an
// animal still to be placed. Never on a count of how many animals are nearby.
//
// That restriction is the whole reason the game holds together. Animals arrive
// in threes over several deals, so anything phrased as a tally of animals
// ("nothing is next to me") would be true when it was dealt and false three
// deals later once a neighbour turned up. A fact about fixed squares can never
// go stale, so every clue a player has been shown is still true at the end.
// Lands and landmarks never move, so facts about them are fixed too -- "I'm in
// the biggest Meadow", "My land has 9 squares" and "No landmark is in my land"
// are as permanent as "I'm in a corner".
//
// Three things live side by side here on purpose: what each clue means to the
// game (holds), how it is said (wording), and what the player is told it means
// (GLOSSARY). A sentence with two fair readings is a guess of its own, however
// sound the logic behind it, so the three have to agree -- and keeping them in
// one file is the cheapest way to keep them agreeing.
//
// A clue is { k, a, b, n, m }: its kind, the animal saying it, the animal it
// names (or -1), a number where the kind needs one (which edge, which colour,
// how many steps, how many squares), and the landmark it names (absent, or -1,
// when it names none). A clue that names two things -- "closer to the cactus
// than to the tree" -- carries the second as m2 (a landmark) or b2 (an animal
// from an earlier deal, already placed).
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
  'middle',
  'diagonal',
  'landRim',
  'landInland',
  'noMarkInLand',
];

/**
 * Facts about the animal's own square that carry a number: which edge, which
 * land colour, which row or column, how many lands around it, how big its land
 * is. Built separately because each has several versions.
 */
export const NUMBERED = [
  'side',
  'notSide',
  'nearLand',
  'notNearLand',
  'inRow',
  'inColumn',
  'landsAround',
  'landBorders',
  'landSize',
];

/** A fact that can only name a landmark: "the tree is in my land". An animal's land never holds another animal. */
export const MARK_ONLY = ['markInLand'];

/**
 * Facts that name two things -- "I'm closer to the cactus than to the tree",
 * "I'm next to the fountain or the shark". The second is always something
 * fixed, a landmark or an animal from an earlier deal, so the fact still ties
 * the animal to at most one other animal still in play.
 */
export const TWO_REF = ['closer', 'eitherTouch'];

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

export const ALL_KINDS = [...UNARY, ...NUMBERED, ...BINARY, 'steps', ...MARK_ONLY, ...TWO_REF];

/**
 * Facts about the board alone -- no landmark, no other animal -- which is what
 * the generator can plan an animal's square around before any landmark is set
 * down.
 */
export const BOARD_FACTS = [...UNARY.filter((k) => k !== 'noMarkInLand'), 'side', 'notSide', 'nearLand', 'notNearLand', 'landsAround', 'landBorders', 'landSize'];

/** Bare coordinates. Plain, but they hand over the answer rather than pose it. */
export const COORDS = ['inRow', 'inColumn'];

/**
 * The clue vocabulary, in the order a player meets it. Each step includes the
 * ones before it. The editor's vocabulary slider picks how far along to go.
 *
 * How hard a clue is has two sides. One is how much it leans on other animals,
 * which is the tier (deduce.js). The other is how fast it can be read and
 * understood, and that is what this ladder is for.
 *
 * Simple is one plain, positive fact you can see: a corner, edge or half of
 * the board, the block at its centre, what the animal is next to, a landmark standing
 * in its land. (Halves only on even boards at the first two rungs: on an odd
 * board the middle row belongs to neither half, which is exact but not
 * something a first level should ask anyone to know.) No "not", no comparing,
 * nothing that has to be held in the head while something else is checked.
 * Plain adds the negatives and whole-land facts (biggest, surrounded, what the
 * land borders, whether it reaches the board's edge) -- still one fact to a
 * sentence: at these two rungs a card is
 * limited in facts, and nothing is folded into a compound. Lines adds
 * relationships along rows and columns, which ask you to trace across the
 * board, "or", and lets facts fold together ("on the board's edge, but not the
 * top one"). Counting adds step distances, comparing two distances, the size
 * of a land and bordering lands, which ask you to count or to think about two
 * whole lands at once.
 *
 * Many of the newer kinds are broad on purpose: "The tree is in my land" or "My
 * land borders Ocean" leaves an animal a good handful of squares, which is
 * what a level with depth needs -- facts that each draw a region, and meet.
 */
export const VOCABULARY = [
  {
    name: 'Simple',
    blurb: 'one plain fact: a corner, edge or half of the board or the block at its centre, what an animal is next to, a landmark in its land',
    kinds: ['corner', 'side', 'rim', 'nearLand', 'touch', 'zoneEdge', 'markInLand', 'middle', 'top', 'bottom', 'left', 'right'],
  },
  {
    name: 'Plain',
    blurb: "adds “not” and whole-land facts: the biggest, surrounded, what it borders, whether it reaches the board's edge -- still one fact to a sentence",
    kinds: [
      'notCorner',
      'notSide',
      'inland',
      'notNearLand',
      'zoneCore',
      'biggest',
      'smallest',
      'notBiggest',
      'notTouch',
      'landsAround',
      'landBorders',
      'landRim',
      'landInland',
      'noMarkInLand',
    ],
  },
  {
    name: 'Lines',
    blurb: 'adds rows, columns, above/below, left/right, diagonals, “or”, and sentences that combine facts',
    kinds: [
      'diagonal',
      'eitherTouch',
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
    ],
  },
  {
    name: 'Counting',
    blurb: 'adds step distances, which of two things is closer, land sizes and bordering lands',
    kinds: ['steps', 'zoneTouch', 'closer', 'landSize'],
  },
];

/**
 * Kinds that read as the same sort of thing to a player. "I'm on the board's
 * edge", "I'm on the board's top edge" and "I'm in a corner of the board" are
 * three kinds to the solver and one idea to the reader -- where the animal
 * sits against the board's rim -- and a level that says them one after
 * another reads as the same sentence three times. The generator weighs
 * repetition by family as well as by kind.
 */
export const FAMILY = {
  rim: 'edge', inland: 'edge', corner: 'edge', notCorner: 'edge', side: 'edge', notSide: 'edge',
  touch: 'next', notTouch: 'next', nearLand: 'next', notNearLand: 'next', eitherTouch: 'next',
  zoneEdge: 'next', landsAround: 'next', corners: 'next', notCorners: 'next',
  markInLand: 'land', noMarkInLand: 'land', landBorders: 'land', landRim: 'land', landInland: 'land',
  landSize: 'land', biggest: 'land', smallest: 'land', notBiggest: 'land', zoneCore: 'land', zoneTouch: 'land',
  middle: 'area', diagonal: 'area', top: 'area', bottom: 'area', left: 'area', right: 'area',
  sameRow: 'line', notSameRow: 'line', sameCol: 'line', notSameCol: 'line',
  above: 'line', below: 'line', leftOf: 'line', rightOf: 'line', inRow: 'line', inColumn: 'line',
  steps: 'distance', closer: 'distance',
};

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
  markInLand: 0,
  middle: 1,
  biggest: 1,
  smallest: 1,
  rim: 1,
  landBorders: 1,
  landsAround: 2,
  landRim: 2,
  landInland: 2,
  noMarkInLand: 3,
  diagonal: 3,
  eitherTouch: 4,
  landSize: 4,
  closer: 5,
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
    zoneRim: zoneRim(R, zones),
    zoneLand,
    lands,
    animals,
    landmarks,
  };
}

/** For each land: does any square of it lie on the board's outer ring? */
export function zoneRim(R, zones) {
  const N = R.N;
  return zones.zoneCells.map((cells) =>
    cells.some((i) => {
      const r = R.row(i);
      const c = R.col(i);
      return r === 0 || c === 0 || r === N - 1 || c === N - 1;
    })
  );
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

/** The second thing a two-thing clue names -- always a landmark (m2) or a placed animal (b2). */
function secondSquare(cl, ctx, pos) {
  if (cl.m2 != null && cl.m2 >= 0) return ctx.landmarks[cl.m2].cell;
  return cl.b2 != null && cl.b2 >= 0 ? pos[cl.b2] : -1;
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
    // two or more squares in from every edge: the middle four of a 6 x 6
    case 'middle':
      return r >= 2 && c >= 2 && r <= N - 3 && c <= N - 3;
    // the two corner-to-corner lines
    case 'diagonal':
      return r === c || r + c === N - 1;
    case 'landRim':
      return ctx.zoneRim[zone];
    case 'landInland':
      return !ctx.zoneRim[zone];
    case 'noMarkInLand':
      return !ctx.landmarks.some((l) => ctx.zoneOf[l.cell] === zone);
    // exactly n lands besides mine have a square beside mine
    case 'landsAround':
      return new Set(neighbours(R, i).map((n) => ctx.zoneOf[n]).filter((z) => z !== zone)).size === cl.n;
    case 'landBorders':
      return [...ctx.zoneAdj[zone]].some((y) => ctx.zoneLand[y] === cl.n);
    case 'landSize':
      return ctx.zoneSize[zone] === cl.n;
    default:
      break;
  }

  const j = otherSquare(cl, ctx, pos);
  if (j == null || j < 0) return null;
  const diagonal = chebyshev(R, i, j) === 1 && manhattan(R, i, j) === 2;

  if (cl.k === 'closer' || cl.k === 'eitherTouch') {
    const k = secondSquare(cl, ctx, pos);
    if (k < 0) return null;
    if (cl.k === 'closer') return manhattan(R, i, j) < manhattan(R, i, k);
    return manhattan(R, i, j) === 1 || manhattan(R, i, k) === 1;
  }

  switch (cl.k) {
    case 'markInLand':
      return ctx.zoneOf[j] === zone;
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
//
// Every edge, corner and half names the board: a land has edges and corners
// too, and "I'm on an edge" said by an animal standing in a land is a fair
// question -- whose edge? It is said the short way, "the board's bottom edge",
// not "the bottom edge of the board": two words fewer on every card, which on
// the first levels is most of the card. Clues about the animal's land say
// "land" instead ("I'm next to another land"), so no sentence leaves the
// player to guess which one is meant.

const SIDES = ['top', 'right', 'bottom', 'left'];

/** What a clue points at: an animal, a landmark, a land colour or an edge. */
function target(cl, ctx) {
  if (cl.k === 'nearLand' || cl.k === 'notNearLand' || cl.k === 'landBorders') return ctx.lands[cl.n].name;
  if (cl.k === 'notSide') return SIDES[cl.n];
  const thing = cl.m != null && cl.m >= 0 ? ctx.landmarks[cl.m] : ctx.animals[cl.b];
  return `the ${thing.icon} ${thing.name}`;
}

/** The second thing a two-thing clue names. */
function secondTarget(cl, ctx) {
  const thing = cl.m2 != null && cl.m2 >= 0 ? ctx.landmarks[cl.m2] : ctx.animals[cl.b2];
  return `the ${thing.icon} ${thing.name}`;
}

const ownLand = (cl, ctx) => ctx.lands[ctx.animals[cl.a].land].name;
const capital = (s) => s[0].toUpperCase() + s.slice(1);
const NUMBER = ['no', 'one', 'two', 'three', 'four'];

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
  notSide: (xs) => `I'm not on the board's ${or(xs)} edge.`,
  markInLand: (xs) => (xs.length === 1 ? `${capital(xs[0])} is in my land.` : `${capital(and(xs))} are in my land.`),
  landBorders: (xs) => `My land borders ${and(xs)}.`,
};

function one(cl, ctx) {
  if (GROUPABLE[cl.k]) return GROUPABLE[cl.k]([target(cl, ctx)]);
  switch (cl.k) {
    case 'rim':
      return "I'm on the board's edge.";
    case 'inland':
      return "I'm not on the board's edge.";
    case 'corner':
      return "I'm in a corner of the board.";
    case 'notCorner':
      return "I'm not in a corner of the board.";
    case 'side':
      return `I'm on the board's ${SIDES[cl.n]} edge.`;
    case 'top':
    case 'bottom':
    case 'left':
    case 'right':
      return `I'm in the board's ${cl.k} half.`;
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
    // Named by its size, not "the middle": players read "middle" as the middle
    // row, or as something the board's halves split, and "I'm in the middle of
    // the board. I'm in the board's bottom half." as a contradiction.
    case 'middle': {
      const side = ctx.R.N - 4;
      return side <= 1 ? "I'm in the board's centre square." : `I'm in the board's centre ${side} × ${side}.`;
    }
    case 'diagonal':
      return "I'm on one of the board's diagonals.";
    case 'landRim':
      return "My land touches the board's edge.";
    case 'landInland':
      return "My land doesn't touch the board's edge.";
    case 'noMarkInLand':
      return 'No landmark is in my land.';
    case 'landsAround':
      return `I'm next to ${NUMBER[cl.n]} other lands.`;
    case 'landSize':
      return `My land has ${cl.n} squares.`;
    case 'closer':
      return `I'm closer to ${target(cl, ctx)} than to ${secondTarget(cl, ctx)}.`;
    case 'eitherTouch':
      return `I'm next to ${target(cl, ctx)} or ${secondTarget(cl, ctx)}.`;
    default:
      return '';
  }
}

/**
 * Which of one animal's clues are said together. Repeats of a groupable kind
 * fold into one sentence, and so do a corner and an edge -- "I'm in a corner of
 * the board. I'm on the bottom edge of the board." is one fact, a bottom
 * corner, and is said as one. Two edges at right angles are a corner too,
 * whether or not "corner" was among the clues. "I'm on the board's edge" with
 * "I'm not on the board's top edge" becomes "I'm on the board's edge, but not
 * the top one", and a corner with it becomes "I'm in a corner of the board, but
 * not a top one" -- naming the board twice in two sentences is the kind of
 * weight the short style exists to avoid.
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
  } else if (corner && !spoken.has(corner) && notSides.length) {
    const group = [corner, ...notSides];
    group.forEach((c) => spoken.add(c));
    out.push({ as: 'cornerBut', clues: group });
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
    return `I'm in the board's ${SIDES[upDown.n]}-${SIDES[leftRight.n]} corner.`;
  }
  if (group.as === 'sideCorner') {
    return `I'm in a ${SIDES[group.clues[1].n]} corner of the board.`;
  }
  if (group.as === 'cornerBut') {
    return `I'm in a corner of the board, but not a ${or(group.clues.slice(1).map((c) => SIDES[c.n]))} one.`;
  }
  if (group.as === 'edgeBut') {
    return `I'm on the board's edge, but not the ${or(group.clues.slice(1).map((c) => SIDES[c.n]))} one.`;
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

/** The clues each sentence on a card speaks for, as the card will fold them. */
export const sentences = (clues) => fold(clues).map((group) => group.clues);

/** What a clue names besides its own animal: other animals and landmarks, if any. */
const namesOf = (cl) => [
  ...(cl.m != null && cl.m >= 0 ? [`m${cl.m}`] : cl.b >= 0 ? [`a${cl.b}`] : []),
  ...(cl.m2 != null && cl.m2 >= 0 ? [`m${cl.m2}`] : cl.b2 != null && cl.b2 >= 0 ? [`a${cl.b2}`] : []),
];

/**
 * A card's sentences, with every sentence about the same other animal or
 * landmark joined into one: "I'm next to the tent. I'm right of the tent." is
 * one idea -- which square beside the tent -- said in two halves.
 */
export function ideas(clues) {
  const out = sentences(clues).map((s) => ({ clues: [...s], names: new Set(s.flatMap(namesOf)) }));
  const share = (x, y) => [...y.names].some((n) => x.names.has(n));
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      const j = out.findIndex((y, k) => k > i && share(out[i], y));
      if (j < 0) continue;
      out[i].clues.push(...out[j].clues);
      for (const n of out[j].names) out[i].names.add(n);
      out.splice(j, 1);
      merged = true;
    }
  }
  return out.map((idea) => idea.clues);
}

/**
 * The most things any one sentence on the card lists -- "I'm next to the fish
 * and the tree" lists two. A named corner is one idea however many facts it
 * folds, so only the lists count.
 */
export const longestList = (clues) =>
  Math.max(0, ...fold(clues).filter((g) => GROUPABLE[g.as]).map((g) => g.clues.length));

/**
 * Every clue the game can say, and exactly what it means -- shown in the key
 * word for word. Each meaning is written against holds() above, not against
 * the sentence. tools/audit.mjs fails if any kind is missing from this list.
 */
export const GLOSSARY = [
  {
    kinds: ['touch', 'notTouch'],
    say: "I'm next to the fox. (Or not next to it.)",
    means: "Our squares share a side. Squares touching only at their corners don't count.",
  },
  {
    kinds: ['corners', 'notCorners'],
    say: "I'm diagonal to the fox. (Or not diagonal to it.)",
    means: 'Our squares touch only at their corners.',
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
    say: "I'm on the board's edge. (Or not.)",
    means: "The board's outer ring of squares. The edges of lands never count.",
  },
  {
    kinds: ['side', 'notSide'],
    say: "I'm on the board's top edge. (Or right, bottom, left; or not.)",
    means: "The board's top row (or right column, and so on). A corner of the board is on two of its edges.",
  },
  {
    kinds: ['corner', 'notCorner'],
    say: "I'm in a corner of the board. (Or a bottom corner, the board's top-left corner; or not.)",
    means: "One of the board's four corner squares — or the two along that edge, or exactly that one. The corners of lands never count.",
  },
  {
    kinds: ['top', 'bottom', 'left', 'right'],
    say: "I'm in the board's top half. (Or bottom, left, right.)",
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
    means: "All four squares sharing a side with mine are in my land. So I'm not on the board's edge.",
  },
  {
    kinds: ['nearLand', 'notNearLand'],
    say: "I'm next to Desert. (Or not next to Desert.)",
    means: 'A square sharing a side with mine is (or none is) in a Desert land. Only other colours are named.',
  },
  {
    kinds: ['eitherTouch'],
    say: "I'm next to the 🌳 tree or the fox.",
    means: 'My square shares a side with at least one of the two — maybe both.',
  },
  {
    kinds: ['closer'],
    say: "I'm closer to the 🌳 tree than to the fox.",
    means: 'Fewer steps to the first than to the second, counting moves up, down, left or right. The same number of steps is not closer.',
  },
  {
    kinds: ['middle'],
    say: "I'm in the board's centre 2 × 2. (Or 3 × 3, and so on.)",
    means: "The block of squares at the very centre of the board, two or more squares in from every edge: 2 × 2 on a 6 × 6 board, 3 × 3 on a 7 × 7, and so on. On a 5 × 5 board, the one centre square.",
  },
  {
    kinds: ['diagonal'],
    say: "I'm on one of the board's diagonals.",
    means: 'On one of the two lines of squares that run from corner to corner of the board.',
  },
  {
    kinds: ['landsAround'],
    say: "I'm next to two other lands. (Or three.)",
    means: 'The squares sharing a side with mine lie in exactly two (or three) lands besides my own.',
  },
  {
    kinds: ['markInLand', 'noMarkInLand'],
    say: 'The 🌳 tree is in my land. (Or: no landmark is in my land.)',
    means: "The landmark stands inside my land's heavy lines (or no landmark does).",
  },
  {
    kinds: ['landBorders'],
    say: 'My land borders Ocean.',
    means: 'A square of my land shares a side with a square of an Ocean land. Only other colours are named.',
  },
  {
    kinds: ['landRim', 'landInland'],
    say: "My land touches the board's edge. (Or doesn't.)",
    means: "At least one square of my land is on the board's outer ring (or none is).",
  },
  {
    kinds: ['landSize'],
    say: 'My land has 9 squares.',
    means: 'Count every square inside its heavy lines, landmarks too.',
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
