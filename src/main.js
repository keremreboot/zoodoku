// Glue: puzzle -> state -> view, plus the cards, the pointer and the sheets.
//
// An animal is carried rather than dragged. Pressing a card picks it up and it
// stays up until it lands somewhere legal, which means the same code serves a
// drag across the board and a tap here followed by a tap there -- the second
// being the only one that works well with a thumb on a phone, where the finger
// covers the very square it is aiming at.

import { BOARDS, LEVELS, makePuzzle } from './generate.js';
import { chunks } from './clues.js';
import { Game } from './state.js';
import { View } from './view.js';
import { makeRules, mulberry32 } from './util.js';

const canvas = document.getElementById('stage');
const view = new View(canvas);

const ui = {};
for (const id of [
  'seed', 'blurb', 'status', 'note', 'banner', 'deal', 'legend',
  'board', 'level', 'newGame', 'undo', 'clear', 'reveal',
  'keyBtn', 'moreBtn', 'keySheet', 'moreSheet', 'scrim',
]) {
  ui[id] = document.getElementById(id);
}

let game = null;
let carry = null; // animal id in hand, or null
let carryFrom = -1; // where it was standing when picked up, so Esc can put it back
let press = null; // { x, y, moved, from } for the pointer gesture in progress
let flash = '';
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

function setFlash(msg) {
  flash = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash = '';
    refresh();
  }, 2200);
}

// --- game lifecycle --------------------------------------------------------

function newGame(seed = (Math.random() * 1e9) | 0) {
  const board = BOARDS[ui.board.value] ?? BOARDS.standard;
  const level = LEVELS[ui.level.value] ?? LEVELS.standard;
  const R = makeRules(board.N);

  let used = seed >>> 0;
  let puzzle = null;
  for (let bump = 0; bump < 8 && !puzzle; bump++) {
    used = (seed + bump * 7919) >>> 0;
    puzzle = makePuzzle(R, mulberry32(used), board, level);
  }
  if (!puzzle) {
    ui.note.textContent = 'could not build that board';
    ui.note.className = 'warn';
    return;
  }

  game = new Game(puzzle);
  carry = null;
  carryFrom = -1;
  flash = '';
  view.setPuzzle(game);
  ui.seed.textContent = `No. ${String(used).slice(-6).padStart(6, '0')}`;
  ui.blurb.textContent = puzzle.lands.map((l) => l.name).join(' · ');
  ui.banner.classList.remove('show');
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

function refresh() {
  if (!game) return;

  for (const el of ui.deal.children) {
    const id = Number(el.dataset.id);
    el.classList.toggle('carry', carry === id);
    el.classList.toggle('placed', game.pos[id] >= 0);
    el._bits.forEach((span, k) => {
      const states = el._chunks[k].clues.map((cl) => game.clueState(cl));
      const state = states.includes('broken')
        ? 'broken'
        : states.every((s) => s === 'ok')
          ? 'ok'
          : 'pending';
      span.className = `bit ${state}`;
    });
  }

  const total = game.animals.length;
  ui.status.textContent = game.isSolved()
    ? `all ${total} lands settled`
    : `deal ${game.round + 1} of ${game.rounds} · ${game.settledCount()} of ${total} settled`;

  const broken = game.brokenClues().length;
  if (flash) {
    ui.note.textContent = flash;
    ui.note.className = 'good';
  } else if (game.isSolved()) {
    ui.note.textContent = 'nothing left to place';
    ui.note.className = 'good';
  } else if (broken) {
    ui.note.textContent = `${broken} rule${broken === 1 ? '' : 's'} broken`;
    ui.note.className = 'warn';
  } else {
    const left = game.deal.animals.length - game.handPlaced();
    ui.note.textContent = left ? `${left} still in hand` : 'checking…';
    ui.note.className = '';
  }

  ui.undo.disabled = game.undoStack.length === 0;
  ui.banner.classList.toggle('show', game.isSolved());

  if (carry == null) view.setHover(-1);
  view.setCarry(carry);
  view.setSpotlight(spotlightFor(carry));
  mark();
}

/**
 * Take an animal into hand. Lifting is deliberately not recorded: picking a
 * piece up is not a move, and recording it would make undo need two presses to
 * walk back one decision. The square it came from is remembered instead, so the
 * move can be recorded whole when it lands -- and so putting it down again is
 * possible at all.
 */
function pickUp(id) {
  releaseCarry();
  carryFrom = game.pos[id];
  game.lift(id, false);
  carry = id;
}

/** Put the carried animal back where it was found. */
function releaseCarry() {
  if (carry != null && carryFrom >= 0) game.place(carry, carryFrom, false);
  carry = null;
  carryFrom = -1;
}

function tryPlace(cell) {
  if (carry == null || cell < 0 || !game.canPlace(carry, cell)) return false;
  game.undoStack.push({ id: carry, from: carryFrom });
  game.place(carry, cell, false);
  carry = null;
  carryFrom = -1;
  if (game.settle()) {
    setFlash(game.isSolved() ? 'the last land is settled' : 'that deal is settled');
    buildDeal();
  }
  refresh();
  return true;
}

// --- pointer ---------------------------------------------------------------

ui.deal.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest?.('.card');
  if (!el || !game) return;
  ev.preventDefault();
  const id = Number(el.dataset.id);
  if (game.isLocked(id)) return;
  pickUp(id);
  press = { x: ev.clientX, y: ev.clientY, moved: false, from: 'card' };
  view.setHover(-1);
  refresh();
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!game || ev.button !== 0) return;
  ev.preventDefault();
  const cell = view.cellAt(ev.clientX, ev.clientY);
  if (cell < 0) return;

  if (carry != null) {
    if (!tryPlace(cell)) {
      view.setHover(cell);
      mark();
    }
    return;
  }
  // lifting a not-yet-settled animal back off the board
  const id = game.animalAt(cell);
  if (id >= 0 && game.isInHand(id)) {
    pickUp(id);
    press = { x: ev.clientX, y: ev.clientY, moved: false, from: 'board' };
    view.setHover(cell);
    refresh();
  }
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
  // A press on the board that never moved was a pick-up, not a drop -- placing
  // on release would put the animal straight back where it came from.
  if (gesture.from === 'board' && !gesture.moved) return;
  tryPlace(view.cellAt(ev.clientX, ev.clientY));
});

addEventListener('pointercancel', () => {
  press = null;
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  releaseCarry();
  refresh();
});

addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLInputElement) return;
  const k = ev.key.toLowerCase();
  if (k === 'escape') {
    if (carry != null) {
      releaseCarry();
      refresh();
    } else {
      closeSheets();
    }
  } else if (k === 'u' || (k === 'z' && (ev.ctrlKey || ev.metaKey))) {
    doUndo();
  } else if (k === 'n') {
    newGame();
  }
});

// --- ui --------------------------------------------------------------------

function doUndo() {
  if (!game) return;
  releaseCarry(); // an animal in hand is mid-decision, not part of the history
  if (!game.undo()) {
    refresh();
    return;
  }
  refresh();
}

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
ui.undo.addEventListener('click', doUndo);

ui.board.addEventListener('change', () => {
  saveSettings();
  newGame();
});
ui.level.addEventListener('change', () => {
  saveSettings();
  newGame();
});

ui.clear.addEventListener('click', () => {
  carry = null;
  carryFrom = -1;
  game.clearHand();
  refresh();
  closeSheets();
});
ui.reveal.addEventListener('click', () => {
  carry = null;
  carryFrom = -1;
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
