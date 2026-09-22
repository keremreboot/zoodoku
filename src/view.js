// 2D canvas presentation layer: a coloured map on newsprint.
//
// The board is the only thing on this canvas. The animals waiting to be placed
// live in the DOM below it, because each one carries a sentence and text is the
// one thing a canvas is bad at -- wrapping, resizing and reading it aloud all
// come free in markup and all cost real work here.
//
// Colour is the rule, so it has to survive a colourblind player: every land
// also writes its name across itself, the way a map does. That label is the
// fallback, not decoration.

import { neighbours } from './util.js';

export const PALETTE = {
  table: '#e9e4d8',
  paper: '#faf8f2',
  ink: '#16130e',
  red: '#a5312a',
  muted: '#6b6355',
};

const SERIF = 'Georgia, "Times New Roman", Times, serif';
const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color",sans-serif';

const SPRITE = 112;
const spriteCache = new Map();

/** Emoji are the only expensive thing on screen, so each is drawn once and blitted after. */
function iconSprite(icon) {
  let cv = spriteCache.get(icon);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = SPRITE;
  const c = cv.getContext('2d');
  c.font = `${Math.round(SPRITE * 0.72)}px ${EMOJI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(icon, SPRITE / 2, SPRITE * 0.55);
  spriteCache.set(icon, cv);
  return cv;
}

function paperTile(color, amount = 18) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = color;
  c.fillRect(0, 0, S, S);
  const img = c.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
  c.fillStyle = 'rgba(60,50,35,0.08)';
  for (let i = 0; i < S * 1.2; i++) c.fillRect(Math.random() * S, Math.random() * S, 1, 1);
  return cv;
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.S = 40;
    this.ox = 0;
    this.oy = 0;

    this.tablePat = this.ctx.createPattern(paperTile(PALETTE.table, 16), 'repeat');
    this.paperPat = this.ctx.createPattern(paperTile(PALETTE.paper, 14), 'repeat');

    this.game = null;
    this.carry = null;
    this.hover = -1;
    this.spotlight = new Set();
    this.tokens = [];
    this.misses = []; // { cell, t } squares that just cost a strike, fading from 1 to 0
    this.crossOut = true; // mark squares no animal can ever take; the editor turns it off
    this.circled = new Set(); // squares the player marked by hand -- owned by main.js
  }

  setPuzzle(game) {
    this.game = game;
    this.R = game.R;
    this.carry = null;
    this.hover = -1;
    this.spotlight = new Set();
    this.spotlightMarks = new Set();
    this.tokens = game.animals.map(() => ({ s: 0 }));
    this.misses = [];
    this.labels = this.placeLabels(game);
    this.resize();
  }

  /**
   * Where each land's name goes: the squares of the land, best first -- nearest
   * its middle, and avoiding squares with a border on two sides so the text has
   * room to sit without straddling a heavy line. The name takes the best one no
   * animal is standing on.
   */
  placeLabels(game) {
    const R = game.R;
    const out = [];
    for (let z = 0; z < game.zones.count; z++) {
      const cells = game.zones.zoneCells[z];
      let mr = 0;
      let mc = 0;
      for (const i of cells) {
        mr += R.row(i);
        mc += R.col(i);
      }
      mr /= cells.length;
      mc /= cells.length;
      // Every square is ranked, not just the best kept: an animal may come to
      // stand on the first choice, and the name must then move, never vanish.
      const marked = new Set(game.landmarks.map((l) => l.cell));
      const places = cells
        .filter((i) => !marked.has(i))
        .map((i) => {
          const open = neighbours(R, i).filter((n) => game.zones.zoneOf[n] === z).length;
          return { i, d: Math.hypot(R.row(i) - mr, R.col(i) - mc) + (4 - open) * 0.45 };
        })
        .sort((x, y) => x.d - y.d)
        .map((p) => p.i);
      out.push({ zone: z, places });
    }
    return out;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, Math.round(rect.width));
    this.cssH = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    if (!this.game) return;
    const N = this.R.N;
    const margin = 6;
    this.S = Math.max(1, Math.min((this.cssW - 2 * margin) / N, (this.cssH - 2 * margin) / N));
    this.ox = (this.cssW - N * this.S) / 2;
    this.oy = (this.cssH - N * this.S) / 2;
  }

  setCarry(id) {
    this.carry = id;
  }

  setHover(cell) {
    this.hover = cell;
  }

  /** Animals and landmarks a clue is talking about, ringed so the sentence has something to point at. */
  setSpotlight(ids, marks = []) {
    this.spotlight = new Set(ids);
    this.spotlightMarks = new Set(marks);
  }

  /** Flash a square red: something was dropped there and it was wrong. */
  miss(cell) {
    this.misses = this.misses.filter((m) => m.cell !== cell);
    this.misses.push({ cell, t: 1 });
  }

  update(dt) {
    if (!this.game) return false;
    const k = 1 - Math.pow(0.0007, dt);
    let moving = false;
    this.game.animals.forEach((a, i) => {
      const want = this.game.pos[a.id] >= 0 ? 1 : 0;
      const tok = this.tokens[i];
      const d = want - tok.s;
      if (Math.abs(d) > 0.002) {
        tok.s += d * k;
        moving = true;
      } else {
        tok.s = want;
      }
    });
    for (const m of this.misses) m.t -= dt / 0.9;
    this.misses = this.misses.filter((m) => m.t > 0);
    return moving || this.misses.length > 0;
  }

  // --- geometry ------------------------------------------------------------

  px(c) {
    return this.ox + c * this.S;
  }
  py(r) {
    return this.oy + r * this.S;
  }

  /** Cell index under a client point, or -1 when the point is off the board. */
  cellAt(clientX, clientY) {
    if (!this.game) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const c = Math.floor((clientX - rect.left - this.ox) / this.S);
    const r = Math.floor((clientY - rect.top - this.oy) / this.S);
    const N = this.R.N;
    if (r < 0 || c < 0 || r >= N || c >= N) return -1;
    return this.R.idx(r, c);
  }

  landOfZone(z) {
    return this.game.puzzle.lands[this.game.puzzle.zoneLand[z]];
  }

  /** Could the carried animal legally stand here? Drives the dimming and the ghost. */
  isOpen(cell) {
    return this.carry != null && this.game.canPlace(this.carry, cell);
  }

  // --- drawing -------------------------------------------------------------

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.tablePat;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!this.game) return;

    this.drawLands(ctx);
    this.drawGrid(ctx);
    if (this.crossOut) this.drawDead(ctx);
    this.drawCircles(ctx);
    this.drawLabels(ctx);
    this.drawLandmarks(ctx);
    this.drawHover(ctx);
    this.drawMisses(ctx);
    this.drawTokens(ctx);
  }

  drawLands(ctx) {
    const R = this.R;
    const S = this.S;
    const side = R.N * S;

    ctx.save();
    ctx.shadowColor = 'rgba(28,24,17,0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = this.paperPat;
    ctx.fillRect(this.px(0), this.py(0), side, side);
    ctx.restore();

    const zoneOf = this.game.zones.zoneOf;
    for (let i = 0; i < R.cells; i++) {
      ctx.fillStyle = this.landOfZone(zoneOf[i]).tint;
      ctx.fillRect(this.px(R.col(i)), this.py(R.row(i)), S, S);
    }

    // While an animal is in hand, everything it cannot reach steps back: the
    // wrong colour, and its own colour where a land is already taken.
    if (this.carry != null) {
      ctx.save();
      ctx.fillStyle = PALETTE.table;
      ctx.globalAlpha = 0.72;
      for (let i = 0; i < R.cells; i++) {
        if (!this.isOpen(i)) ctx.fillRect(this.px(R.col(i)), this.py(R.row(i)), S, S);
      }
      ctx.restore();
    }
  }

  drawGrid(ctx) {
    const R = this.R;
    const N = R.N;
    const S = this.S;
    const x0 = this.px(0);
    const y0 = this.py(0);
    const side = N * S;

    ctx.strokeStyle = PALETTE.ink;
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(1, S * 0.016);
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (let k = 1; k < N; k++) {
      ctx.moveTo(x0 + k * S, y0);
      ctx.lineTo(x0 + k * S, y0 + side);
      ctx.moveTo(x0, y0 + k * S);
      ctx.lineTo(x0 + side, y0 + k * S);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Heavy strokes wherever two lands meet. Walking the shared edges rather
    // than column indices is what lets a ragged land draw itself with the same
    // code as a tidy rectangle would.
    const zoneOf = this.game.zones.zoneOf;
    ctx.lineWidth = Math.max(2, S * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < R.cells; i++) {
      const r = R.row(i);
      const c = R.col(i);
      if (c < N - 1 && zoneOf[i] !== zoneOf[i + 1]) {
        ctx.moveTo(x0 + (c + 1) * S, y0 + r * S);
        ctx.lineTo(x0 + (c + 1) * S, y0 + (r + 1) * S);
      }
      if (r < N - 1 && zoneOf[i] !== zoneOf[i + N]) {
        ctx.moveTo(x0 + c * S, y0 + (r + 1) * S);
        ctx.lineTo(x0 + (c + 1) * S, y0 + (r + 1) * S);
      }
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(2, S * 0.05);
    ctx.strokeRect(x0, y0, side, side);
  }

  /**
   * A land writes its name across itself, the way a map does -- which is also
   * the colourblind fallback, so it has to stay inside its own borders. A name
   * is wider than one square, so it is fitted to the unbroken run of its own
   * squares through the label's row and shrunk if it still will not go. Left to
   * sit at a fixed size and centred on its square it spills over a heavy border
   * and reads as if it belonged to the land next door.
   */
  //
  // A land keeps its name after it has its animal. It is finished, but its
  // colour is not: a later animal may say "I'm next to Desert", and on a
  // crossed-out land the name is the only way a colourblind player can tell
  // which colour it was. So a taken land's name is drawn over its crosses, on
  // a small plate of the land's own colour so the lines do not cut the letters
  // -- and the same goes for a name sitting on a square the player circled.
  drawLabels(ctx) {
    const R = this.R;
    const S = this.S;
    const zoneOf = this.game.zones.zoneOf;
    const base = Math.max(7, Math.min(13, S * 0.26));

    const taken = new Set();
    if (this.crossOut) for (const p of this.game.pos) if (p >= 0) taken.add(zoneOf[p]);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // A name spreads along the free squares of its row -- never under an
    // animal or a landmark, which would hide half of it. Of the land's squares,
    // best first, it takes the first with room for at least two squares of
    // text; failing that, whichever has the most.
    const blocked = (i) => this.game.pos.includes(i) || this.game.landmarkAt(i) != null;
    const runAt = (i, zone) => {
      const r = R.row(i);
      let left = R.col(i);
      let right = left;
      while (left > 0 && zoneOf[R.idx(r, left - 1)] === zone && !blocked(R.idx(r, left - 1))) left--;
      while (right < R.N - 1 && zoneOf[R.idx(r, right + 1)] === zone && !blocked(R.idx(r, right + 1))) right++;
      return { r, left, len: right - left + 1 };
    };

    for (const { zone, places } of this.labels) {
      let spot = null;
      for (const i of places) {
        if (blocked(i)) continue;
        const run = runAt(i, zone);
        if (!spot || run.len > spot.len) spot = run;
        if (run.len >= 2) break;
      }
      if (!spot) continue; // every square of the land is covered
      const land = this.landOfZone(zone);
      const text = land.name.toUpperCase();
      const { r, left } = spot;
      const run = spot.len * S;

      ctx.letterSpacing = `${(base * 0.16).toFixed(1)}px`;
      ctx.font = `600 ${base}px ${SERIF}`;
      const wide = ctx.measureText(text).width;
      const size = Math.max(6, Math.min(base, (base * run * 0.9) / wide));
      if (size < base) {
        ctx.letterSpacing = `${(size * 0.1).toFixed(1)}px`;
        ctx.font = `600 ${size}px ${SERIF}`;
      }

      const cx = this.px(left) + run / 2;
      const cy = this.py(r) + S / 2;
      let covered = taken.has(zone);
      for (let c = left; c < left + spot.len && !covered; c++) covered = this.circled.has(R.idx(r, c));
      if (covered) {
        const w = Math.min(ctx.measureText(text).width + size * 0.9, run - 4);
        const h = size * 1.55;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = land.tint;
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      }
      ctx.fillStyle = land.ink;
      // never faded while an animal is carried: that is exactly when "I'm next
      // to Desert" is being read, and the land itself is already dimmed
      ctx.globalAlpha = 0.55;
      ctx.fillText(text, cx, cy);
    }
    ctx.restore();
  }

  /**
   * A land takes one animal, so the moment one lands every other square of that
   * land is dead -- nothing will ever stand there. Crossing them out does
   * nothing the rules do not already do; it just stops the player having to
   * hold it in their head, which on a board of twelve lands is most of what
   * there is to hold.
   */
  drawDead(ctx) {
    const R = this.R;
    const S = this.S;
    const zoneOf = this.game.zones.zoneOf;
    const taken = new Set();
    for (const p of this.game.pos) if (p >= 0) taken.add(zoneOf[p]);
    if (!taken.size) return;

    const inset = S * 0.3;
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < R.cells; i++) {
      if (!taken.has(zoneOf[i]) || this.game.pos.includes(i) || this.game.landmarkAt(i)) continue;
      const x = this.px(R.col(i));
      const y = this.py(R.row(i));
      ctx.moveTo(x + inset, y + inset);
      ctx.lineTo(x + S - inset, y + S - inset);
      ctx.moveTo(x + S - inset, y + inset);
      ctx.lineTo(x + inset, y + S - inset);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The player's own marks, which have to read as a different thing from the
   * board's crosses at a glance: the board's can never be taken back, these
   * can. So they differ in shape as well as weight -- the board's are faint,
   * thin, ruler-straight crosses, like print, and these are bold circles,
   * drawn like a pen does one: a touch oval, tilted, the stroke running a
   * little past where it started. Tilt and shape are fixed by the square, so a
   * circle does not wobble from one frame to the next.
   */
  drawCircles(ctx) {
    if (!this.circled.size) return;
    const R = this.R;
    const S = this.S;
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(2, S * 0.07);
    ctx.lineCap = 'round';
    for (const i of this.circled) {
      const cx = this.px(R.col(i)) + S / 2;
      const cy = this.py(R.row(i)) + S / 2;
      const tilt = ((((i * 7919) % 11) / 10) - 0.5) * 0.9;
      const squash = 0.86 + (((i * 104729) % 7) / 6) * 0.1;
      const start = (((i * 4099) % 12) / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, S * 0.29, S * 0.29 * squash, tilt, start, start + Math.PI * 2.12);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Animals sit on white discs; landmarks stand bare on the land, with only a
   * faint shadow at their foot, so a glance tells the two apart: one is
   * scenery, the other is the puzzle. They used to sit on a white square
   * plaque, and a white backing of any shape read as one more animal.
   */
  drawLandmarks(ctx) {
    const S = this.S;
    for (const [m, mark] of this.game.landmarks.entries()) {
      const x = this.px(this.R.col(mark.cell));
      const y = this.py(this.R.row(mark.cell));
      const inset = S * 0.024;
      ctx.save();
      if (this.spotlightMarks.has(m)) {
        ctx.fillStyle = PALETTE.ink;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x + inset, y + inset, S - inset * 2, S - inset * 2);
      }
      ctx.fillStyle = PALETTE.ink;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.ellipse(x + S / 2, y + S * 0.8, S * 0.26, S * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const size = S * 0.78;
      ctx.drawImage(iconSprite(mark.icon), x + (S - size) / 2, y + (S - size) / 2 - S * 0.04, size, size);
      ctx.restore();
    }
  }

  drawHover(ctx) {
    if (this.carry == null || this.hover < 0) return;
    const S = this.S;
    const x = this.px(this.R.col(this.hover));
    const y = this.py(this.R.row(this.hover));
    const ok = this.isOpen(this.hover);

    ctx.save();
    if (!ok) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(x, y, S, S);
      ctx.restore();
      return;
    }
    const animal = this.game.animals[this.carry];
    this.token(ctx, animal, x, y, S, { alpha: 0.55, dashed: true });
    ctx.restore();
  }

  // Every animal on the board is on its own square -- a wrong drop never lands --
  // so they are all drawn as settled. The dashed ring is kept for the ghost.
  drawTokens(ctx) {
    const S = this.S;
    for (const a of this.game.animals) {
      const cell = this.game.pos[a.id];
      if (cell < 0) continue;
      const grow = this.tokens[a.id].s;
      this.token(ctx, a, this.px(this.R.col(cell)), this.py(this.R.row(cell)), S, {
        scale: 0.6 + 0.4 * grow,
        ringed: this.spotlight.has(a.id),
      });
    }
  }

  /**
   * A struck square flashes red and fades. The animal itself never lands there,
   * so without this the only sign of a wrong drop would be off the board, in
   * the strike count -- and the square you just tried is the thing to remember.
   */
  drawMisses(ctx) {
    const S = this.S;
    for (const m of this.misses) {
      const x = this.px(this.R.col(m.cell));
      const y = this.py(this.R.row(m.cell));
      const inset = S * 0.2;
      ctx.save();
      ctx.globalAlpha = 0.45 * m.t;
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(x, y, S, S);
      ctx.globalAlpha = Math.min(1, 1.6 * m.t);
      ctx.strokeStyle = PALETTE.red;
      ctx.lineWidth = Math.max(2, S * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + inset, y + inset);
      ctx.lineTo(x + S - inset, y + S - inset);
      ctx.moveTo(x + S - inset, y + inset);
      ctx.lineTo(x + inset, y + S - inset);
      ctx.stroke();
      ctx.restore();
    }
  }

  token(ctx, animal, x, y, S, opts = {}) {
    const { alpha = 1, scale = 1, dashed = false, ringed = false } = opts;
    const land = this.game.puzzle.lands[animal.land];
    const cx = x + S / 2;
    const cy = y + S / 2;
    const rad = S * 0.42 * scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (ringed) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 1.32, 0, Math.PI * 2);
      ctx.fillStyle = land.ink;
      ctx.globalAlpha = alpha * 0.22;
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.paper;
    ctx.shadowColor = 'rgba(28,24,17,0.28)';
    ctx.shadowBlur = S * 0.14;
    ctx.shadowOffsetY = S * 0.045;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.lineWidth = Math.max(1.6, S * 0.055);
    ctx.strokeStyle = land.ink;
    if (dashed) ctx.setLineDash([S * 0.13, S * 0.1]);
    ctx.stroke();
    ctx.setLineDash([]);

    const size = rad * 1.42;
    ctx.drawImage(iconSprite(animal.icon), cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }
}
