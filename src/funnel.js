// The difficulty funnel: suggested settings for each level, in play order.
//
// The editor offers these as a starting point for the level being made -- a
// person still generates, looks, rerolls and locks in. Difficulty has several
// sides and the funnel turns each up slowly, one at a time: how much the
// animals lean on each other (the tier), how quickly a clue can be read (the
// vocabulary), how much any one sentence gives away (the depth), how many
// animals per deal the player can find straight from their own card (the
// footholds), and how many animals arrive at once (the deal size). Players said the difficulty jumped when several of those moved
// at once, so the shape is deliberate:
//
//   - from the very first level, every card is two short, positive facts,
//     neither of which says where the animal is on its own: the first leaves
//     several squares, the second cuts them to one -- "I'm in the board's top
//     half. I'm in the middle of the board." Players said one-fact cards were
//     corners and edges pointing at single squares, with nothing to work out;
//   - the first level deals one card at a time; then two at a time; then two
//     where one card leans on the other -- "I'm next to the fox" -- the whole
//     idea of the game in its smallest form; then three at a time, each
//     standing alone again; then vaguer, with "not" and whole-land facts;
//   - "in turn": two animals a deal still found from their own card, the third
//     through one of them -- the first deal of that level gentler still -- then
//     rows and columns on a bigger board;
//   - then deals that bring two animals of one colour, where a land taking
//     one animal becomes something to reason with, then a third deal;
//   - then fewer starting points, one deal at a time; then "together", where
//     animals pin each other before any is placed, with every sentence leaving
//     at least four squares; then counting words; then the big board; then
//     four cards at a time -- with three colours, always two of one -- and
//     last a level whose final deal has no starting point at all;
//   - a level may give each deal its own number of starting points, so its
//     last deal is its hardest and the next level starts where it ended;
//   - landmarks carry the early levels: fixed from the start, they give a
//     standalone card something to say besides edges and corners;
//   - one thing changes at a time where possible, and spare clues are taken
//     away just before something new is added, so each step is either a new
//     idea or the same idea with less help, never both.
//
// Every entry has been checked to build reliably; plain clues cannot describe
// the middle of a big board in two sentences, which is why the vocabulary
// widens as the board does.

import { DEFAULT_SPEC } from './generate.js';

export const FUNNEL = [
  { N: 6, lands: 3, dealSize: 1, tier: 0, vocab: 0, perCard: 2, spare: 0, landmarks: 2, depth: 2 },
  { N: 6, lands: 4, dealSize: 2, tier: 0, vocab: 0, perCard: 2, spare: 0, landmarks: 2, depth: 2 },
  { N: 6, lands: 4, dealSize: 2, tier: 1, vocab: 0, perCard: 2, spare: 0, landmarks: 2, depth: 2, footholds: 1 },
  { N: 6, lands: 6, tier: 0, vocab: 0, perCard: 2, spare: 0, landmarks: 3, depth: 2 },
  { N: 6, lands: 6, tier: 0, vocab: 1, perCard: 2, spare: 0, landmarks: 2, depth: 3 },
  { N: 6, lands: 6, tier: 1, vocab: 1, perCard: 2, spare: 1, landmarks: 2, depth: 3, footholds: [3, 2] },
  { N: 7, lands: 6, tier: 1, vocab: 2, perCard: 2, spare: 1, landmarks: 2, depth: 3, footholds: 2 },
  { N: 7, lands: 6, tier: 1, vocab: 2, perCard: 2, spare: 1, landmarks: 2, depth: 3, footholds: 2, pairs: 1 },
  { N: 7, lands: 9, tier: 1, vocab: 2, perCard: 2, spare: 0, landmarks: 2, depth: 3, footholds: 2, pairs: 1 },
  { N: 7, lands: 9, tier: 1, vocab: 2, perCard: 2, spare: 1, landmarks: 2, depth: 3, footholds: [2, 1, 1], pairs: 1 },
  { N: 8, lands: 9, tier: 2, vocab: 2, perCard: 2, spare: 1, landmarks: 1, depth: 4, footholds: 1, pairs: 1 },
  { N: 8, lands: 9, tier: 2, vocab: 3, perCard: 2, spare: 0, landmarks: 1, depth: 4, footholds: 1, pairs: 1 },
  { N: 9, lands: 12, tier: 2, vocab: 3, perCard: 2, spare: 0, landmarks: 1, depth: 4, footholds: 1, pairs: 1 },
  { N: 9, lands: 12, dealSize: 4, tier: 2, vocab: 3, perCard: 2, spare: 0, landmarks: 1, depth: 4, footholds: 1 },
  { N: 9, lands: 12, dealSize: 4, tier: 2, vocab: 3, perCard: 2, spare: 0, landmarks: 1, depth: 4, footholds: [1, 1, 0] },
].map((step) => ({ ...DEFAULT_SPEC, ...step }));

/** Settings for the level at this position (0-based); past the end, the hardest. */
export const suggestSpec = (index) => ({ ...FUNNEL[Math.min(index, FUNNEL.length - 1)] });
