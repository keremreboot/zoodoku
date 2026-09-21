// Builds levels for the editor off the main thread. A spec the generator
// struggles with can take the better part of a second to give up on, and the
// editor's sliders should not freeze while it does.

import { makeLevel } from './generate.js';
import { serializeLevel } from './levels.js';
import { makeRules, mulberry32 } from './util.js';

self.onmessage = ({ data }) => {
  const { job, spec, seed } = data;
  const t0 = performance.now();
  const puzzle = makeLevel(makeRules(spec.N), spec, mulberry32(seed));
  self.postMessage({
    job,
    ms: Math.round(performance.now() - t0),
    level: puzzle ? serializeLevel(puzzle, { seed }) : null,
  });
};
