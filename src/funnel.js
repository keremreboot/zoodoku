// The difficulty funnel: suggested settings for each level, in play order.
//
// The editor offers these as a starting point for the level being made -- a
// person still generates, looks, rerolls and locks in. Difficulty has two
// sides and the funnel turns both up slowly: how much the animals lean on each
// other (the tier), and how quickly a clue can be read (the vocabulary). The
// shape is deliberate:
//
//   - the first levels are small, and every card is one short, positive fact
//     -- "I'm in a corner of the board", "I'm next to the tree" -- with every
//     animal standing alone, so the rules can be learned without reading
//     anything twice or reasoning between animals at all;
//   - the board grows, then a second deal arrives, still one fact to a card;
//   - "not" and whole-land facts come next, still one fact to a card; then
//     two facts to a card, with a spare to help; then "in turn" -- placing
//     one animal tells you where the next goes -- then rows and columns, and
//     sentences that combine two facts;
//   - "together", where animals pin each other before any is placed, comes
//     last, and only on boards big enough to need it;
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
  { N: 5, lands: 3, tier: 0, vocab: 0, perCard: 1, spare: 0, landmarks: 2 },
  { N: 5, lands: 3, tier: 0, vocab: 0, perCard: 1, spare: 0, landmarks: 1 },
  { N: 6, lands: 3, tier: 0, vocab: 0, perCard: 1, spare: 0, landmarks: 2 },
  { N: 6, lands: 6, tier: 0, vocab: 0, perCard: 1, spare: 0, landmarks: 2 },
  { N: 6, lands: 6, tier: 0, vocab: 1, perCard: 1, spare: 0, landmarks: 2 },
  { N: 6, lands: 6, tier: 0, vocab: 1, perCard: 2, spare: 1, landmarks: 2 },
  { N: 6, lands: 6, tier: 1, vocab: 1, perCard: 2, spare: 1, landmarks: 2 },
  { N: 7, lands: 6, tier: 1, vocab: 2, perCard: 2, spare: 1, landmarks: 2 },
  { N: 7, lands: 9, tier: 1, vocab: 2, perCard: 2, spare: 0, landmarks: 2 },
  { N: 8, lands: 9, tier: 2, vocab: 2, perCard: 2, spare: 1, landmarks: 1 },
  { N: 8, lands: 9, tier: 2, vocab: 3, perCard: 2, spare: 0, landmarks: 1 },
  { N: 9, lands: 12, tier: 2, vocab: 3, perCard: 2, spare: 0, landmarks: 1 },
].map((step) => ({ ...DEFAULT_SPEC, ...step }));

/** Settings for the level at this position (0-based); past the end, the hardest. */
export const suggestSpec = (index) => ({ ...FUNNEL[Math.min(index, FUNNEL.length - 1)] });
