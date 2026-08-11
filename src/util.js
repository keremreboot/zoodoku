// Small shared helpers. Lives apart from the rest so zones.js, clues.js and
// generate.js can all use it without importing each other.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const range = (n) => Array.from({ length: n }, (_, k) => k);

export const pick = (arr, rng) => arr[(rng() * arr.length) | 0];

/** Everything the rest of the game needs to know about a square grid. */
export function makeRules(N) {
  return {
    N,
    cells: N * N,
    idx: (r, c) => r * N + c,
    row: (i) => (i / N) | 0,
    col: (i) => i % N,
  };
}

/** Orthogonal neighbours of a cell index, clipped to the grid. */
export function neighbours(R, i) {
  const r = R.row(i);
  const c = R.col(i);
  const out = [];
  if (r > 0) out.push(i - R.N);
  if (r < R.N - 1) out.push(i + R.N);
  if (c > 0) out.push(i - 1);
  if (c < R.N - 1) out.push(i + 1);
  return out;
}

/** Moves up, down, left or right between two squares. Diagonals cost two. */
export function manhattan(R, i, j) {
  return Math.abs(R.row(i) - R.row(j)) + Math.abs(R.col(i) - R.col(j));
}

/** Moves if diagonals were free -- 1 means the two squares are touching or corner to corner. */
export function chebyshev(R, i, j) {
  return Math.max(Math.abs(R.row(i) - R.row(j)), Math.abs(R.col(i) - R.col(j)));
}
