// Glue: puzzle -> state -> view, plus the cards, the pointer and the sheets.
//
// An animal is carried rather than dragged. Pressing a card picks it up and it
// stays up until it lands, which means the same code serves a drag across the
// board and a tap here followed by a tap there -- the second being the only one
// that works well with a thumb on a phone, where the finger covers the very
// square it is aiming at.
//
// A drop commits when the pointer lifts, never when it lands. With a strike on
// every wrong square that matters: a thumb can come down a square off, see the
// ghost under it, and slide across before letting go -- or slide off the board
// entirely, which puts nothing down and costs nothing.

import { BOARDS, LEVELS, makePuzzle } from './generate.js';
import { chunks } from './clues.js';
import { Game, MAX_STRIKES } from './state.js';
import { View } from './view.js';
import { makeRules, mulberry32 } from './util.js';

const canvas = document.getElementById('stage');
const view = new View(canvas);

const ui = {};
for (const id of [
  'seed', 'blurb', 'status', 'note', 'strikes', 'banner', 'lost', 'retry', 'deal',
  'legend', 'board', 'level', 'newGame', 'reveal',
  'keyBtn', 'moreBtn', 'keySheet', 'moreSheet', 'scrim',
]) {
  ui[id] = document.getElementById(id);
}

let game = null;
let seed = 0; // of the board in play, so losing can deal the very same one again
let carry = null; // animal id in hand, or null
let press = null; // { x, y, moved, from } for the pointer gesture in progress
let flash = null; // { text, tone } shown in place of the usual note for a moment
let flashTimer = 0;
let dirty = true;

const mark = () => {
  dirty = true;
};

// --- settings --------------------------------------------------------------

const SETTINGS_KEY = 'zoodoku.settings';

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    saved = {};
  }
  if (saved.board && BOARDS[saved.board]) ui.board.value = saved.board;
  if (saved.level && LEVELS[saved.level]) ui.level.value = saved.level;
}

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ board: ui.board.value, level: ui.level.value })
    );
  } catch {
    /* private mode -- settings just do not persist */
  }
}

function setFlash(text, tone = 'good') {
  flash = { text, tone };
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash = null;
    refresh();
  }, 2200);
}

// --- game lifecycle --------------------------------------------------------

function newGame(want = (Math.random() * 1e9) | 0) {
  const board = BOARDS[ui.board.value] ?? BOARDS.standard;
  const level = LEVELS[ui.level.value] ?? LEVELS.standard;
  const R = makeRules(board.N);

  let used = want >>> 0;
  let puzzle = null;
  for (let bump = 0; bump < 8 && !puzzle; bump++) {
    used = (want + bump * 7919) >>> 0;
    puzzle = makePuzzle(R, mulberry32(used), board, level);
  }
  if (!puzzle) {
    ui.note.textContent = 'could not build that board';
    ui.note.className = 'warn';
    return;
  }

  game = new Game(puzzle);
  seed = used;
  carry = null;
  press = null;
  flash = null;
  view.setPuzzle(game);
  ui.seed.textContent = `No. ${String(used).slice(-6).padStart(6, '0')}`;
  ui.blurb.textContent = puzzle.lands.map((l) => l.name).join(' · ');
  history.replaceState(null, '', `#${used}`);
  buildLegend();
  buildDeal();
  refresh();
}

/** The key lists only the animals this board actually cast, in dealing order. */
function buildLegend() {
  ui.legend.replaceChildren(
    ...game.puzzle.lands.map((land, h) => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.style.setProperty('--band', land.ink);
      row.style.setProperty('--wash', land.tint);

      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = land.name;

      const cast = document.createElement('span');
      cast.className = 'legend-cast';
      cast.textContent = game.animals
        .filter((a) => a.land === h)
        .sort((x, y) => x.round - y.round)
        .map((a) => `${a.icon} ${a.name}`)
        .join('   ');

      row.append(name, cast);
      return row;
    })
  );
}

function buildDeal() {
  if (!game.deal) {
    ui.deal.replaceChildren();
    return;
  }
  ui.deal.replaceChildren(...game.hand.map(cardFor));
}

function cardFor(animal) {
  const land = game.puzzle.lands[animal.land];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card';
  el.dataset.id = String(animal.id);
  el.style.setProperty('--band', land.ink);
  el.style.setProperty('--wash', land.tint);

  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = animal.icon;

  const who = document.createElement('span');
  who.className = 'who';
  const where = document.createElement('em');
  where.textContent = land.name;
  who.append(`${animal.name} `, where);

  const rule = document.createElement('span');
  rule.className = 'rule';
  const mine = game.deal.clues.filter((cl) => cl.a === animal.id);
  el._chunks = chunks(mine, game.ctx);
  el._bits = el._chunks.map((part) => {
    const span = document.createElement('span');
    span.className = 'bit';
    span.textContent = part.text;
    return span;
  });
  if (!el._bits.length) {
    const quiet = document.createElement('span');
    quiet.className = 'silent';
    quiet.textContent = 'I say nothing — place me by what the others say.';
    rule.append(quiet);
  } else {
    el._bits.forEach((span, k) => {
      if (k) rule.append(' ');
      rule.append(span);
    });
  }

  const body = document.createElement('span');
  body.className = 'body';
  body.append(who, rule);
  el.append(chip, body);
  return el;
}

/** Animals the carried one is talking about, so the sentence has something to point at. */
function spotlightFor(id) {
  if (id == null || !game.deal) return [];
  const out = new Set();
  for (const cl of game.deal.clues) {
    if (cl.a === id && cl.b >= 0) out.add(cl.b);
    if (cl.b === id) out.add(cl.a);
  }
  return [...out];
}

function drawStrikes() {
  const pips = [];
  for (let k = 0; k < MAX_STRIKES; k++) {
    const pip = document.createElement('i');
    pip.className = k < game.strikes ? 'pip used' : 'pip';
    pips.push(pip);
  }
  ui.strikes.replaceChildren(...pips);
  ui.strikes.setAttribute('aria-label', `${game.strikes} of ${MAX_STRIKES} strikes used`);
}

function refresh() {
  if (!game) return;

  for (const el of ui.deal.children) {
    const id = Number(el.dataset.id);
    el.classList.toggle('carry', carry === id);
    el.classList.toggle('settled', game.isPlaced(id));
    el._bits.forEach((span, k) => {
      const ready = el._chunks[k].clues.every((cl) => game.clueState(cl) === 'ok');
      span.className = ready ? 'bit ok' : 'bit';
    });
  }

  const total = game.animals.length;
  ui.status.textContent = game.isSolved()
    ? `all ${total} lands settled`
    : `deal ${game.round + 1} of ${game.rounds} · ${game.settledCount()}/${total} settled`;

  if (flash) {
    ui.note.textContent = flash.text;
    ui.note.className = flash.tone;
  } else if (game.isLost()) {
    ui.note.textContent = 'out of strikes';
    ui.note.className = 'warn';
  } else if (game.isSolved()) {
    ui.note.textContent = 'nothing left to place';
    ui.note.className = 'good';
  } else {
    const left = game.deal.animals.length - game.handPlaced();
    ui.note.textContent = `${left} still in hand`;
    ui.note.className = '';
  }

  drawStrikes();
  ui.banner.classList.toggle('show', game.isSolved());
  ui.lost.hidden = !game.isLost();

  if (carry == null) view.setHover(-1);
  view.setCarry(carry);
  view.setSpotlight(spotlightFor(carry));
  mark();
}

/**
 * Why a square refused the animal, said as a hint rather than a telling-off.
 * Kept short on purpose: the note shares one line with the deal count and the
 * strike pips, and on a phone a longer one wraps -- which shrinks the board
 * under the player's thumb at the exact moment they are aiming.
 */
function refusal(id, cell) {
  const animal = game.animals[id];
  if (game.puzzle.zoneLand[game.zones.zoneOf[cell]] !== animal.land) {
    return `only in ${game.puzzle.lands[animal.land].name}`;
  }
  return 'that land is taken';
}

function tryPlace(cell) {
  if (carry == null || cell < 0) return;
  const id = carry;
  const verdict = game.attempt(id, cell);

  if (verdict === 'illegal') {
    // costs nothing: the board was already showing that square as unavailable
    setFlash(refusal(id, cell), '');
    refresh();
    return;
  }

  carry = null;
  if (verdict === 'wrong') {
    view.miss(cell);
    ui.strikes.classList.remove('hit');
    void ui.strikes.offsetWidth; // restart the shake if two strikes land close together
    ui.strikes.classList.add('hit');
    if (game.isLost()) {
      clearTimeout(flashTimer);
      flash = null;
    } else {
      setFlash(`not there — ${game.strikesLeft()} left`, 'warn');
    }
    refresh();
    return;
  }

  if (game.settle()) {
    setFlash(game.isSolved() ? 'the last land is settled' : 'that deal is settled');
    buildDeal();
  }
  refresh();
}

// --- pointer ---------------------------------------------------------------

ui.deal.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest?.('.card');
  if (!el || !game || game.isLost()) return;
  ev.preventDefault();
  const id = Number(el.dataset.id);
  if (game.isPlaced(id)) return; // it is where it belongs, and stays there
  carry = id;
  press = { x: ev.clientX, y: ev.clientY, moved: false, from: 'card' };
  view.setHover(-1);
  refresh();
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!game || ev.button !== 0 || carry == null || game.isLost()) return;
  ev.preventDefault();
  // aim only -- the drop itself waits for the pointer to lift
  press = { x: ev.clientX, y: ev.clientY, moved: false, from: 'board' };
  view.setHover(view.cellAt(ev.clientX, ev.clientY));
  mark();
});

addEventListener('pointermove', (ev) => {
  if (press && Math.abs(ev.clientX - press.x) + Math.abs(ev.clientY - press.y) > 8) {
    press.moved = true;
  }
  if (carry == null) return;
  const cell = view.cellAt(ev.clientX, ev.clientY);
  if (cell !== view.hover) {
    view.setHover(cell);
    mark();
  }
});

addEventListener('pointerup', (ev) => {
  const gesture = press;
  press = null;
  if (!gesture || carry == null) return;
  // Off the board -- or still on the card that was just tapped -- puts nothing
  // down. The animal stays in hand, and the next press on the board aims it.
  tryPlace(view.cellAt(ev.clientX, ev.clientY));
});

addEventListener('pointercancel', () => {
  press = null;
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  carry = null;
  refresh();
});

addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLInputElement) return;
  const k = ev.key.toLowerCase();
  if (k === 'escape') {
    if (carry != null) {
      carry = null;
      refresh();
    } else {
      closeSheets();
    }
  } else if (k === 'n') {
    newGame();
  }
});

// --- ui --------------------------------------------------------------------

function openSheet(sheet) {
  closeSheets();
  sheet.hidden = false;
  ui.scrim.hidden = false;
}

function closeSheets() {
  ui.keySheet.hidden = true;
  ui.moreSheet.hidden = true;
  ui.scrim.hidden = true;
}

ui.scrim.addEventListener('click', closeSheets);
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', closeSheets);
}
ui.keyBtn.addEventListener('click', () => openSheet(ui.keySheet));
ui.moreBtn.addEventListener('click', () => openSheet(ui.moreSheet));

ui.newGame.addEventListener('click', () => newGame());
// same seed, so "back to the start" means this board again, not a fresh one
ui.retry.addEventListener('click', () => newGame(seed));

ui.board.addEventListener('change', () => {
  saveSettings();
  newGame();
});
ui.level.addEventListener('change', () => {
  saveSettings();
  newGame();
});

ui.reveal.addEventListener('click', () => {
  carry = null;
  game.reveal();
  buildDeal();
  refresh();
  closeSheets();
});

new ResizeObserver(() => {
  view.resize();
  mark();
}).observe(canvas);

// --- loop ------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const moving = view.update(dt);
  if (moving || dirty) {
    view.render();
    dirty = false;
  }
  requestAnimationFrame(frame);
}

loadSettings();
const fromHash = parseInt(location.hash.slice(1), 10);
newGame(Number.isFinite(fromHash) ? fromHash : undefined);
requestAnimationFrame(frame);

// handy while prototyping: zoodoku.game / .view from the console
window.zoodoku = {
  get game() {
    return game;
  },
  view,
  newGame,
};
