// How the grid divides into the lands that each take exactly one animal.
//
// Two properties have to hold or the puzzle stops making sense: every land is
// one connected piece, and the lands are near enough the same size that no
// single one dominates the board. Growing lands outward from scattered seeds
// satisfies neither reliably -- the lands landlock each other before they are
// full and most attempts have to be thrown away.
//
// So we start from a layout that is already valid and disturb it. Cutting the
// boustrophedon ordering of the squares into runs gives connected lands of
// exactly the sizes asked for, because consecutive squares in that ordering are
// always neighbours. The runs are ribbons, though, so the second pass trades
// squares across borders to fatten them: a swap moves one square each way,
// which leaves both sizes untouched, and is kept only if both lands are still
// in one piece and the board's total border did not grow. Nothing can fail --
// the worst case is that few swaps are accepted and the lands stay ribbons.

import { neighbours, range, shuffle } from './util.js';

function connected(R, cells) {
  const first = cells.values().next();
  if (first.done) return true;
  const seen = new Set([first.value]);
  const stack = [first.value];
  while (stack.length) {
    const i = stack.pop();
    for (const n of neighbours(R, i)) {
      if (cells.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === cells.size;
}

/** Border edges touching one square: how much of its outline faces another land. */
function edgeCost(R, zoneOf, i) {
  let n = 0;
  for (const m of neighbours(R, i)) if (zoneOf[m] !== zoneOf[i]) n++;
  return n;
}

function snakeOrder(R) {
  const order = [];
  for (let r = 0; r < R.N; r++) {
    for (let k = 0; k < R.N; k++) {
      order.push(R.idx(r, r % 2 === 0 ? k : R.N - 1 - k));
    }
  }
  return order;
}

/** Land sizes as even as the squares allow: a square or two either way. */
export function evenSizes(cells, count, rng) {
  const base = Math.floor(cells / count);
  const spare = cells % count;
  // whoever gets the odd square out is a coin toss, not always the first lands
  return shuffle(range(count).map((z) => base + (z < spare ? 1 : 0)), rng);
}

/**
 * Land sizes spread out on purpose, so one land can plainly be the biggest of
 * its colour. Around the even size, the spread is about a third of it either
 * way -- enough to see at a glance, never so much that a land shrinks to a
 * sliver: none goes below three squares. The sizes still add up to the board.
 */
export function variedSizes(cells, count, rng) {
  const base = cells / count;
  const reach = Math.max(1, Math.round(base * 0.35));
  const sizes = range(count).map((k) => {
    const t = count === 1 ? 0 : (k / (count - 1)) * 2 - 1; // -1 .. 1, evenly
    return Math.max(3, Math.round(base + t * reach));
  });
  // settle the rounding against the board, taking from the biggest and giving
  // to the smallest so the spread survives
  let diff = cells - sizes.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const order = sizes.map((n, k) => [n, k]).sort((x, y) => x[0] - y[0]);
    const [, k] = diff > 0 ? order[0] : order[order.length - 1];
    if (diff < 0 && sizes[k] <= 3) break;
    sizes[k] += Math.sign(diff);
    diff -= Math.sign(diff);
  }
  return shuffle(sizes, rng);
}

/**
 * @param {number} count how many lands to cut the board into
 * @param {number[]} [sizes] how big each should be; even if left out
 * @param {number} rounds swap attempts per square; more means rounder lands
 */
export function makeZones(R, count, rng, sizes = evenSizes(R.cells, count, rng), rounds = 90) {
  const zoneOf = new Int8Array(R.cells);
  const order = snakeOrder(R);
  let at = 0;
  for (let z = 0; z < count; z++) {
    for (let k = 0; k < sizes[z]; k++) zoneOf[order[at++]] = z;
  }

  const cells = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < R.cells; i++) cells[zoneOf[i]].add(i);

  const tries = rounds * R.cells;
  for (let t = 0; t < tries; t++) {
    const i = (rng() * R.cells) | 0;
    const a = zoneOf[i];
    const across = neighbours(R, i).filter((n) => zoneOf[n] !== a);
    if (!across.length) continue;
    const b = zoneOf[across[(rng() * across.length) | 0]];

    // any square of b that touches a -- which is as far as a can reach
    const border = [];
    for (const cand of cells[b]) {
      if (neighbours(R, cand).some((n) => zoneOf[n] === a)) border.push(cand);
    }
    if (!border.length) continue;
    const j = border[(rng() * border.length) | 0];

    // Picking the two squares independently rather than as an adjacent pair
    // matters: swapping neighbours strands the arriving square, because the
    // square it was clinging to is the very one that just left.
    const before = edgeCost(R, zoneOf, i) + edgeCost(R, zoneOf, j);
    zoneOf[i] = b;
    zoneOf[j] = a;
    const after = edgeCost(R, zoneOf, i) + edgeCost(R, zoneOf, j);

    cells[a].delete(i);
    cells[a].add(j);
    cells[b].delete(j);
    cells[b].add(i);

    // downhill on total border, with a little uphill allowed so the shapes do
    // not freeze into the first local minimum they fall into
    const keep =
      (after <= before || rng() < 0.12) && connected(R, cells[a]) && connected(R, cells[b]);
    if (!keep) {
      zoneOf[i] = a;
      zoneOf[j] = b;
      cells[a].add(i);
      cells[a].delete(j);
      cells[b].add(j);
      cells[b].delete(i);
    }
  }

  return describeZones(R, zoneOf, count);
}

/**
 * Everything else the game asks about lands, worked out from which land each
 * square is in. Shared by fresh boards and by locked levels, which store only
 * that one array.
 */
export function describeZones(R, zoneOf, count) {
  const zoneCells = Array.from({ length: count }, () => []);
  for (let i = 0; i < R.cells; i++) zoneCells[zoneOf[i]].push(i);

  const zoneAdj = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < R.cells; i++) {
    for (const n of neighbours(R, i)) {
      if (zoneOf[n] !== zoneOf[i]) zoneAdj[zoneOf[i]].add(zoneOf[n]);
    }
  }

  return { zoneOf, zoneCells, zoneAdj, count };
}
