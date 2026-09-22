// Glue: level -> state -> view, plus the cards, the pointer and the sheets.
//
// The game plays curated levels, in order, from levels/levels.json. It never
// generates a board itself: every level was made in the editor, looked at by a
// person and locked in, and the audit checks each one can be solved without a
// guess. Every level is open from the start; finishing one ticks it off.
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
//
// The marker is the other thing a hand can hold. With it up, a press on the
// board circles a square, or clears it if it was circled, and dragging on
// carries the same stroke across every square passed over. Holding an animal
// and holding the marker are one hand, so picking up either puts the other
// down. The player's circles are notes, not rules -- a circled square still
// takes an animal, or doesn't -- and they are wiped each time an animal lands:
// a circle does not say which animal it was about, so after a placement there
// is no telling which still count. The board's own crosses, on lands that
// already have their animal, are facts, and the marker cannot touch them.

import { GLOSSARY, chunks } from './clues.js';
import { TIERS } from './deduce.js';
import { PLAYTEST_KEY, loadLevels, puzzleFromLevel } from './levels.js';
import { Game, MAX_STRIKES } from './state.js';
import { View } from './view.js';

const canvas = document.getElementById('stage');
const view = new View(canvas);

const ui = {};
for (const id of [
  'levelNo', 'blurb', 'status', 'note', 'strikes', 'banner', 'bannerTitle', 'bannerNote',
  'nextBtn', 'lost', 'retry', 'deal', 'legend', 'glossary', 'reveal', 'levelList',
  'levelsBtn', 'keyBtn', 'moreBtn', 'markBtn', 'keySheet', 'moreSheet', 'levelsSheet', 'scrim',
]) {
  ui[id] = document.getElementById(id);
}

let book = { levels: [] };
let index = 0; // position in book.levels of the level being played
let level = null; // the level being played
let playtest = false; // a candidate sent over from the editor, not a real level
let revealed = false; // the answer was shown, so finishing does not count
let game = null;
let carry = null; // animal id in hand, or null
let marking = false; // the marker is in hand instead of an animal
const circled = new Set(); // squares the player marked; the view draws them
view.circled = circled;
let press = null; // { x, y, moved, from } for the pointer gesture in progress
let flash = null; // { text, tone } shown in place of the usual note for a moment
let flashTimer = 0;
let dirty = true;

const mark = () => {
  dirty = true;
};

// --- progress ----------------------------------------------------------------
//
// Kept by level id rather than position, so levels the editor moves around or
// inserts later do not hand a player credit for the wrong one.

const PROGRESS_KEY = 'zoodoku.progress';

let solved = new Set();

function loadProgress() {
  try {
    solved = new Set(JSON.parse(localStorage.getItem(PROGRESS_KEY))?.solved ?? []);
  } catch {
    solved = new Set();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ solved: [...solved] }));
  } catch {
    /* private mode -- progress just does not persist */
  }
}

const isSolvedLevel = (k) => solved.has(book.levels[k]?.id);

/** Where to pick up: the first level not yet finished, or the last one. */
function resumeAt() {
  const k = book.levels.findIndex((_, i) => !isSolvedLevel(i));
  return k < 0 ? book.levels.length - 1 : k;
}

function setFlash(text, tone = 'good') {
  flash = { text, tone };
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash = null;
    refresh();
  }, 2200);
}

// --- playing a level ---------------------------------------------------------

function startLevel(k) {
  if (!book.levels[k]) return;
  index = k;
  playtest = false;
  history.replaceState(null, '', `#${k + 1}`);
  play(book.levels[k], `Level ${k + 1}`);
}

function play(lv, label) {
  level = lv;
  revealed = false;
  game = new Game(puzzleFromLevel(lv));
  carry = null;
  marking = false;
  circled.clear();
  press = null;
  flash = null;
  view.setPuzzle(game);
  ui.levelNo.textContent = label;
  ui.blurb.textContent = game.puzzle.lands.map((l) => l.name).join(' · ');
  buildLegend();
  buildDeal();
  buildLevelList();
  refresh();
}

function restart() {
  play(level, ui.levelNo.textContent);
}

function onSolved() {
  if (playtest) {
    ui.bannerTitle.textContent = 'Playtest solved';
    ui.bannerNote.textContent = 'Back to the editor to lock it in.';
    ui.nextBtn.hidden = true;
    return;
  }
  if (!revealed) {
    solved.add(level.id);
    saveProgress();
    buildLevelList();
  }
  const last = index >= book.levels.length - 1;
  ui.bannerTitle.textContent = revealed ? 'The answer' : `Level ${index + 1} complete`;
  ui.bannerNote.textContent = revealed
    ? 'Shown, not solved — it stays unticked in the list.'
    : last
      ? 'That was the last level, for now.'
      : 'Each animal exactly where its own words put it.';
  ui.nextBtn.hidden = last;
}

/** The key lists only the animals this level cast, in dealing order. */
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
    }),
    ...(game.landmarks.length ? [landmarkRow()] : [])
  );
}

function landmarkRow() {
  const row = document.createElement('div');
  row.className = 'legend-row landmarks';
  const name = document.createElement('span');
  name.className = 'legend-name';
  name.textContent = 'Landmarks';
  const list = document.createElement('span');
  list.className = 'legend-cast';
  list.textContent = game.landmarks.map((l) => `${l.icon} ${l.name}`).join('   ');
  row.append(name, list);
  return row;
}

/**
 * The full list of clues, straight from clues.js, which is also where each one
 * is evaluated -- so what the player is told a sentence means and what the game
 * checks can only disagree if someone edits one line and not the one beside it.
 */
function buildGlossary() {
  ui.glossary.replaceChildren(
    ...GLOSSARY.flatMap((entry) => {
      const say = document.createElement('dt');
      say.textContent = entry.say;
      const means = document.createElement('dd');
      means.textContent = entry.means;
      return [say, means];
    })
  );
}

function buildLevelList() {
  ui.levelList.replaceChildren(
    ...book.levels.map((lv, k) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-row';
      btn.classList.toggle('current', !playtest && k === index);
      btn.classList.toggle('done', isSolvedLevel(k));

      const num = document.createElement('span');
      num.className = 'level-num';
      num.textContent = String(k + 1);
      const what = document.createElement('span');
      what.className = 'level-what';
      what.textContent = `${lv.N} × ${lv.N} · ${lv.deals.length} deal${lv.deals.length === 1 ? '' : 's'} · ${TIERS[lv.spec.tier].name.toLowerCase()}`;
      const tick = document.createElement('span');
      tick.className = 'level-mark';
      tick.textContent = isSolvedLevel(k) ? '✓' : '';

      btn.append(num, what, tick);
      btn.addEventListener('click', () => {
        startLevel(k);
        closeSheets();
      });
      li.append(btn);
      return li;
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
    quiet.textContent = 'I say nothing — the others place me.';
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

/** Animals and landmarks the carried one is talking about, so the sentence has something to point at. */
function spotlightFor(id) {
  const animals = new Set();
  const marks = new Set();
  if (id == null || !game.deal) return { animals: [], marks: [] };
  for (const cl of game.deal.clues) {
    if (cl.a === id && cl.b >= 0) animals.add(cl.b);
    if (cl.a === id && cl.m != null && cl.m >= 0) marks.add(cl.m);
    if (cl.b === id) animals.add(cl.a);
  }
  return { animals: [...animals], marks: [...marks] };
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

  const over = game.isSolved() || game.isLost();
  if (over) marking = false;
  ui.markBtn.disabled = over;
  ui.markBtn.setAttribute('aria-pressed', String(marking));
  canvas.classList.toggle('marking', marking);

  if (carry == null) view.setHover(-1);
  view.setCarry(carry);
  const lit = spotlightFor(carry);
  view.setSpotlight(lit.animals, lit.marks);
  mark();
}

/**
 * Why a square refused the animal, said as a hint rather than a telling-off.
 * Kept short: the note shares one line with the deal count and the strike
 * pips, and on a phone a longer one wraps -- which shrinks the board under the
 * player's thumb at the exact moment they are aiming.
 */
function refusal(id, cell) {
  const animal = game.animals[id];
  const mark = game.landmarkAt(cell);
  if (mark) return `the ${mark.name} is there`;
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

  circled.clear();
  if (game.settle()) {
    if (game.isSolved()) {
      setFlash('the last land is settled');
      onSolved();
    } else {
      setFlash('that deal is settled');
    }
    buildDeal();
  }
  refresh();
}

// --- the marker --------------------------------------------------------------

/** Squares the marker can touch: on the board, not a landmark, and not already crossed out by the board. */
const markable = (cell) => cell >= 0 && !game.landmarkAt(cell) && !game.isSpent(cell);

function setMarking(on) {
  if (!game || game.isSolved() || game.isLost()) on = false;
  marking = on;
  if (marking) carry = null;
  refresh();
}

function setCircle(cell, on) {
  if (on) circled.add(cell);
  else circled.delete(cell);
  mark();
}

/** A press with the marker up: circle or clear the square, and say why when it will not take either. */
function startStroke(ev) {
  const cell = view.cellAt(ev.clientX, ev.clientY);
  if (cell < 0) return;
  if (!markable(cell)) {
    const landmark = game.landmarkAt(cell);
    if (landmark) setFlash(`the ${landmark.name} is there`, '');
    else if (game.animalAt(cell) < 0) setFlash('that land is taken', ''); // the board's cross, not the player's
    refresh();
    return;
  }
  // the first square decides the stroke: circling, or clearing
  const paint = !circled.has(cell);
  press = { x: ev.clientX, y: ev.clientY, moved: false, from: 'marker', paint, last: cell };
  setCircle(cell, paint);
}

// --- pointer -----------------------------------------------------------------

ui.deal.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest?.('.card');
  if (!el || !game || game.isLost()) return;
  ev.preventDefault();
  const id = Number(el.dataset.id);
  if (game.isPlaced(id)) return; // it is where it belongs, and stays there
  marking = false;
  carry = id;
  press = { x: ev.clientX, y: ev.clientY, moved: false, from: 'card' };
  view.setHover(-1);
  refresh();
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!game || ev.button !== 0 || game.isLost()) return;
  if (marking) {
    ev.preventDefault();
    startStroke(ev);
    return;
  }
  if (carry == null) return;
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
  if (press?.from === 'marker') {
    const cell = view.cellAt(ev.clientX, ev.clientY);
    if (cell !== press.last) {
      press.last = cell;
      if (markable(cell)) setCircle(cell, press.paint);
    }
    return;
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

function nextLevel() {
  if (playtest || !game?.isSolved()) return;
  if (index + 1 < book.levels.length) startLevel(index + 1);
}

addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLInputElement) return;
  const k = ev.key.toLowerCase();
  if (k === 'escape') {
    if (carry != null) {
      carry = null;
      refresh();
    } else if (marking) {
      setMarking(false);
    } else {
      closeSheets();
    }
  } else if (k === 'n') {
    nextLevel();
  } else if (k === 'm') {
    setMarking(!marking);
  }
});

// --- ui ----------------------------------------------------------------------

function openSheet(sheet) {
  closeSheets();
  sheet.hidden = false;
  ui.scrim.hidden = false;
}

function closeSheets() {
  ui.keySheet.hidden = true;
  ui.moreSheet.hidden = true;
  ui.levelsSheet.hidden = true;
  ui.scrim.hidden = true;
}

ui.scrim.addEventListener('click', closeSheets);
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', closeSheets);
}
ui.keyBtn.addEventListener('click', () => openSheet(ui.keySheet));
ui.moreBtn.addEventListener('click', () => openSheet(ui.moreSheet));
ui.levelsBtn.addEventListener('click', () => openSheet(ui.levelsSheet));
ui.nextBtn.addEventListener('click', nextLevel);
ui.retry.addEventListener('click', restart);
ui.markBtn.addEventListener('click', () => setMarking(!marking));

ui.reveal.addEventListener('click', () => {
  if (!game) return;
  carry = null;
  circled.clear();
  revealed = true;
  game.reveal();
  onSolved();
  buildDeal();
  refresh();
  closeSheets();
});

new ResizeObserver(() => {
  view.resize();
  mark();
}).observe(canvas);

// --- loop --------------------------------------------------------------------

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

function showEmpty(message) {
  ui.levelNo.textContent = 'Zoodoku';
  ui.blurb.textContent = '';
  ui.status.textContent = message;
  ui.note.textContent = '';
  ui.deal.replaceChildren();
}

async function boot() {
  buildGlossary();
  loadProgress();

  // The editor hands a candidate over through localStorage and opens #playtest.
  if (location.hash === '#playtest') {
    try {
      const candidate = JSON.parse(localStorage.getItem(PLAYTEST_KEY));
      if (candidate) {
        playtest = true;
        play(candidate, 'Playtest');
        return;
      }
    } catch {
      /* fall through to the real levels */
    }
  }

  try {
    book = await loadLevels();
  } catch (e) {
    showEmpty(`could not load the levels: ${e.message}`);
    return;
  }
  if (!book.levels.length) {
    showEmpty('no levels yet — make some in the level editor');
    return;
  }
  const asked = parseInt(location.hash.slice(1), 10) - 1;
  startLevel(Number.isFinite(asked) && book.levels[asked] ? asked : resumeAt());
}

boot();
requestAnimationFrame(frame);

// handy while prototyping: zoodoku.game / .view from the console
window.zoodoku = {
  get game() {
    return game;
  },
  get book() {
    return book;
  },
  view,
  startLevel,
};
