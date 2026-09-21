// The level editor: set the sliders, generate, look, playtest, lock in.
//
// Nothing here is typed by hand. The sliders make a spec, the generator builds
// a level that meets it exactly -- or says it could not -- and a person decides
// whether it is good enough to keep. Locking in writes the whole level into
// levels/levels.json, so later changes to the generator cannot touch it.
//
// Saving goes through the local dev server (npm start). Opened any other way,
// the editor still works, and offers the file as a download instead.

import { DEFAULT_SPEC, landOptions, makeLevel } from './generate.js';
import { VOCABULARY, chunks } from './clues.js';
import { TIERS } from './deduce.js';
import { FUNNEL, suggestSpec } from './funnel.js';
import {
  PLAYTEST_KEY,
  emptyBook,
  formatBook,
  loadLevels,
  measure,
  puzzleFromLevel,
  serializeLevel,
} from './levels.js';
import { Game } from './state.js';
import { View } from './view.js';
import { makeRules, mulberry32 } from './util.js';

const ui = {};
for (const id of [
  'slot', 'suggest', 'N', 'NOut', 'lands', 'landsOut', 'tier', 'tierOut', 'tierHint',
  'vocab', 'vocabOut', 'vocabHint', 'perCard', 'perCardOut', 'spare', 'spareOut', 'coords',
  'landmarks', 'landmarksOut', 'varied',
  'generate', 'playtest', 'lock', 'genStatus', 'previewTitle', 'answers', 'stage', 'stats',
  'deals', 'count', 'funnel', 'book', 'saveStatus', 'download',
]) {
  ui[id] = document.getElementById(id);
}

/** Short names for kinds of sentence, for the "most said" figure. */
const SAID = {
  touch: 'next to', notTouch: 'not next to', corners: 'diagonal', notCorners: 'not diagonal',
  sameRow: 'same row', notSameRow: 'not same row', sameCol: 'same column', notSameCol: 'not same column',
  above: 'above', below: 'below', leftOf: 'left of', rightOf: 'right of', steps: 'steps',
  zoneTouch: 'lands border', rim: 'board edge', inland: 'not on the board edge',
  corner: 'board corner', notCorner: 'not in a board corner', side: 'board edge',
  notSide: 'not on a board edge', top: 'half of the board', bottom: 'half of the board',
  left: 'half of the board', right: 'half of the board', zoneEdge: 'next to another land',
  zoneCore: 'surrounded', nearLand: 'next to a colour', notNearLand: 'not next to a colour',
  biggest: 'biggest', smallest: 'smallest', notBiggest: 'not biggest', inRow: 'row', inColumn: 'column',
};

const view = new View(ui.stage);
view.crossOut = false; // answers are shown all at once; crossing out would bury them

let book = emptyBook();
let candidate = null; // generated, not yet locked in
let showing = null; // { level, at } -- at is 'candidate' or a position in the book
let job = 0;

// --- the sliders -------------------------------------------------------------

function landChoices() {
  return landOptions(Number(ui.N.value));
}

function readSpec() {
  return {
    ...DEFAULT_SPEC,
    N: Number(ui.N.value),
    lands: landChoices()[Number(ui.lands.value)],
    tier: Number(ui.tier.value),
    vocab: Number(ui.vocab.value),
    perCard: Number(ui.perCard.value),
    spare: Number(ui.spare.value),
    landmarks: Number(ui.landmarks.value),
    varied: ui.varied.checked,
    coords: ui.coords.checked,
  };
}

function writeSliders(spec) {
  ui.N.value = String(spec.N);
  syncLandSlider(spec.lands);
  ui.tier.value = String(spec.tier);
  ui.vocab.value = String(spec.vocab);
  ui.perCard.value = String(spec.perCard);
  ui.spare.value = String(spec.spare);
  ui.landmarks.value = String(spec.landmarks ?? 0);
  ui.varied.checked = !!spec.varied;
  ui.coords.checked = !!spec.coords;
  syncLabels();
}

/** The lands slider runs over the counts this board size allows; keep the nearest. */
function syncLandSlider(want) {
  const options = landChoices();
  ui.lands.max = String(options.length - 1);
  let best = 0;
  options.forEach((n, k) => {
    if (Math.abs(n - want) < Math.abs(options[best] - want)) best = k;
  });
  ui.lands.value = String(best);
}

function syncLabels() {
  const spec = readSpec();
  const cells = spec.N * spec.N;
  const deals = spec.lands / 3;
  ui.NOut.textContent = `${spec.N} × ${spec.N}`;
  ui.landsOut.textContent = `${spec.lands} · ${deals} deal${deals === 1 ? '' : 's'} · ~${Math.round(cells / spec.lands)} squares each`;
  ui.tierOut.textContent = TIERS[spec.tier].name;
  ui.tierHint.textContent = `${TIERS[spec.tier].blurb[0].toUpperCase()}${TIERS[spec.tier].blurb.slice(1)}.`;
  ui.vocabOut.textContent = VOCABULARY[spec.vocab].name;
  ui.vocabHint.textContent = `${VOCABULARY[spec.vocab].blurb[0].toUpperCase()}${VOCABULARY[spec.vocab].blurb.slice(1)}.`;
  ui.perCardOut.textContent = String(spec.perCard);
  ui.spareOut.textContent = String(spec.spare);
  ui.landmarksOut.textContent = String(spec.landmarks);
}

for (const el of [ui.lands, ui.tier, ui.vocab, ui.perCard, ui.spare, ui.landmarks, ui.varied, ui.coords]) {
  el.addEventListener('input', syncLabels);
}
ui.N.addEventListener('input', () => {
  // keep roughly the same land size as the board grows or shrinks
  const before = readSpec();
  syncLandSlider(before.lands);
  syncLabels();
});

ui.suggest.addEventListener('click', () => {
  writeSliders(suggestSpec(Number(ui.slot.value)));
  setStatus(ui.genStatus, `Funnel settings for level ${Number(ui.slot.value) + 1}.`);
});

// --- generating --------------------------------------------------------------

let worker = null;
try {
  worker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.job === job) received(data);
  };
  worker.onerror = () => {
    worker = null; // fall back to building on this thread
  };
} catch {
  worker = null;
}

function generate() {
  const spec = readSpec();
  const seed = (Math.random() * 2 ** 31) | 0;
  const mine = ++job;
  ui.generate.disabled = true;
  setStatus(ui.genStatus, 'Building…');
  if (worker) {
    worker.postMessage({ job: mine, spec, seed });
    return;
  }
  setTimeout(() => {
    const t0 = performance.now();
    const puzzle = makeLevel(makeRules(spec.N), spec, mulberry32(seed));
    received({
      job: mine,
      ms: Math.round(performance.now() - t0),
      level: puzzle ? serializeLevel(puzzle, { seed }) : null,
    });
  }, 20);
}

function received({ level, ms }) {
  ui.generate.disabled = false;
  if (!level) {
    setStatus(ui.genStatus, advice(readSpec()), 'warn');
    return;
  }
  candidate = level;
  ui.lock.disabled = false;
  show(level, 'candidate');
  const s = level.stats;
  setStatus(
    ui.genStatus,
    `Built in ${ms} ms. Difficulty ${s.difficulty}${s.coords ? ' — uses a row/column clue' : ''}.`,
    s.coords ? 'warn' : 'good'
  );
}

/** What to loosen when nothing fits -- in the order most likely to help. */
function advice(spec) {
  const tips = [];
  if (spec.vocab === 0 && spec.N >= 7) {
    tips.push('a wider vocabulary (plain clues can’t pin the middle of a big board)');
  }
  if (spec.tier === 0 && spec.landmarks < 3) tips.push('more landmarks');
  if (spec.perCard < 3) tips.push('more sentences per card');
  if (spec.tier < 2) tips.push('letting clues lean on each other more');
  if (spec.vocab < 2 && !tips[0]?.startsWith('a wider')) tips.push('a wider vocabulary');
  if (spec.N > 5) tips.push('a smaller board');
  return `Nothing fits these settings in 80 tries. Try ${tips.slice(0, 3).join(', or ')}.`;
}

ui.generate.addEventListener('click', generate);

// --- the preview -------------------------------------------------------------

function show(level, at) {
  showing = { level, at };
  const puzzle = puzzleFromLevel(level);
  const game = new Game(puzzle);
  if (ui.answers.checked) game.reveal();
  view.setPuzzle(game);
  ui.playtest.disabled = false;
  ui.previewTitle.textContent = at === 'candidate' ? 'New level' : `Level ${at + 1}`;

  const s = level.stats;
  const spare = s.deals.reduce((n, d) => n + (d.spare ?? 0), 0);
  ui.stats.replaceChildren();
  const bits = [
    ['Difficulty', s.difficulty],
    ['', `${level.N} × ${level.N}`],
    ['', `${level.deals.length} deal${level.deals.length === 1 ? '' : 's'}`],
    ['Leaning', s.tierName],
    ['Words', VOCABULARY[level.spec.vocab].name],
    ['Sentences', s.sentences],
    ['Spare', spare],
    ['Landmarks', s.landmarks],
    ['Most said', s.repeats?.most.kind ? `“${SAID[s.repeats.most.kind] ?? s.repeats.most.kind}” ×${s.repeats.most.uses}` : '–'],
  ];
  bits.forEach(([label, value], k) => {
    if (k) ui.stats.append(' · ');
    if (label) ui.stats.append(`${label} `);
    const b = document.createElement('b');
    b.textContent = String(value);
    ui.stats.append(b);
  });
  if (s.coords) {
    const w = document.createElement('span');
    w.className = 'warn';
    w.textContent = ' · uses a row/column clue';
    ui.stats.append(w);
  }

  ui.deals.replaceChildren(
    ...puzzle.deals.map((deal, r) => {
      const card = document.createElement('div');
      card.className = 'deal-card';
      const h = document.createElement('h3');
      const d = s.deals[r];
      h.textContent = `Deal ${r + 1} · ${TIERS[d.tier]?.name ?? '?'} · ${d.sentences} sentences`;
      const ul = document.createElement('ul');
      for (const id of deal.animals) {
        const a = puzzle.animals[id];
        const li = document.createElement('li');
        li.style.setProperty('--band', puzzle.lands[a.land].ink);
        const said = chunks(deal.clues.filter((cl) => cl.a === id), puzzle.ctx)
          .map((c) => c.text)
          .join(' ');
        li.append(`${a.icon} ${a.name} — `);
        const text = document.createElement('span');
        text.textContent = said || 'says nothing';
        if (!said) text.className = 'silent';
        li.append(text);
        ul.append(li);
      }
      card.append(h, ul);
      return card;
    })
  );
  drawBook();
}

ui.answers.addEventListener('change', () => {
  if (showing) show(showing.level, showing.at);
});

ui.playtest.addEventListener('click', () => {
  if (!showing) return;
  try {
    localStorage.setItem(PLAYTEST_KEY, JSON.stringify(showing.level));
    window.open('./index.html#playtest', '_blank');
  } catch (e) {
    setStatus(ui.genStatus, `Could not hand the level to the game: ${e.message}`, 'warn');
  }
});

// --- the level list ----------------------------------------------------------

ui.lock.addEventListener('click', () => {
  if (!candidate) return;
  const at = Math.min(Number(ui.slot.value), book.levels.length);
  book.levels.splice(at, 0, candidate);
  const locked = candidate;
  candidate = null;
  ui.lock.disabled = true;
  show(locked, at);
  drawSlots(at + 1);
  save();
  setStatus(ui.genStatus, `Locked in as level ${at + 1}.`, 'good');
});

function move(from, to) {
  if (to < 0 || to >= book.levels.length) return;
  const [lv] = book.levels.splice(from, 1);
  book.levels.splice(to, 0, lv);
  if (showing && showing.at === from) showing.at = to;
  drawBook();
  drawSlots();
  save();
}

function remove(k) {
  if (!confirm(`Delete level ${k + 1}? Players who finished it keep nothing for it.`)) return;
  book.levels.splice(k, 1);
  if (showing && showing.at === k) showing = null;
  drawBook();
  drawSlots();
  save();
}

/** "Making level" picks where a new level goes: any position, or the end. */
function drawSlots(select) {
  const n = book.levels.length;
  const keep = select ?? Math.min(Number(ui.slot.value || n), n);
  ui.slot.replaceChildren(
    ...Array.from({ length: n + 1 }, (_, k) => {
      const opt = document.createElement('option');
      opt.value = String(k);
      opt.textContent = k === n ? `${k + 1} (the end)` : `${k + 1} (before the current ${k + 1})`;
      return opt;
    })
  );
  ui.slot.value = String(Math.min(keep, n));
}

/**
 * The list, and above it the funnel: one bar per level, as tall as its
 * difficulty. A bar shorter than the one before it is red -- a level easier
 * than its predecessor is a dip in the funnel, which may be a deliberate
 * breather or may be a mistake, and either way should be a decision.
 */
function drawBook() {
  const levels = book.levels;
  ui.count.textContent = `(${levels.length})`;
  const top = Math.max(1, ...levels.map((lv) => lv.stats.difficulty));

  ui.funnel.replaceChildren(
    ...levels.map((lv, k) => {
      const bar = document.createElement('i');
      bar.style.height = `${Math.max(6, (lv.stats.difficulty / top) * 100)}%`;
      bar.title = `Level ${k + 1}: difficulty ${lv.stats.difficulty}`;
      if (k && lv.stats.difficulty < levels[k - 1].stats.difficulty) bar.classList.add('drop');
      if (showing && showing.at === k) bar.classList.add('sel');
      return bar;
    })
  );

  ui.book.replaceChildren(
    ...levels.map((lv, k) => {
      const li = document.createElement('li');
      li.className = 'book-row';
      if (showing && showing.at === k) li.classList.add('sel');

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(k + 1);

      const desc = document.createElement('span');
      desc.className = 'desc';
      const title = document.createElement('b');
      title.textContent = `${lv.N}×${lv.N} · ${lv.deals.length} deal${lv.deals.length === 1 ? '' : 's'} · ${lv.stats.tierName}`;
      const dip = k && lv.stats.difficulty < levels[k - 1].stats.difficulty;
      const line = document.createElement('span');
      line.textContent = ` difficulty ${lv.stats.difficulty}${dip ? ' — easier than the one before' : ''}`;
      if (dip) line.className = 'drop';
      desc.append(title, document.createElement('br'), `${VOCABULARY[lv.spec.vocab].name} words ·`, line);

      const ops = document.createElement('span');
      ops.className = 'ops';
      for (const [label, hint, fn] of [
        ['↑', 'Move up', () => move(k, k - 1)],
        ['↓', 'Move down', () => move(k, k + 1)],
        ['✕', 'Delete', () => remove(k)],
      ]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = hint;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          fn();
        });
        ops.append(b);
      }

      li.append(num, desc, ops);
      li.addEventListener('click', () => show(lv, k));
      return li;
    })
  );
}

// --- saving ------------------------------------------------------------------

async function save() {
  try {
    const res = await fetch('./levels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(book),
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus(ui.saveStatus, `Saved ${book.levels.length} levels to levels/levels.json.`, 'good');
    ui.download.hidden = true;
  } catch {
    setStatus(
      ui.saveStatus,
      'Not saved to disk — the editor saves through `npm start`. Download the file and put it in levels/ instead.',
      'warn'
    );
    ui.download.hidden = false;
  }
}

ui.download.addEventListener('click', () => {
  const blob = new Blob([formatBook(book)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'levels.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

function setStatus(el, text, tone = '') {
  el.textContent = text;
  el.className = `status ${tone}`;
}

// --- drawing -----------------------------------------------------------------

new ResizeObserver(() => {
  view.resize();
}).observe(ui.stage);

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  view.update(dt);
  view.render();
  requestAnimationFrame(frame);
}

async function boot() {
  try {
    book = await loadLevels();
  } catch (e) {
    setStatus(ui.saveStatus, `Could not read the levels: ${e.message}`, 'warn');
    book = emptyBook();
  }
  // A level's board and clues are locked, but how it is measured and worded
  // can improve -- so the numbers shown are worked out afresh, never trusted
  // from the file.
  for (const lv of book.levels) lv.stats = measure(puzzleFromLevel(lv));
  drawSlots(book.levels.length);
  writeSliders(suggestSpec(book.levels.length));
  drawBook();
  setStatus(
    ui.saveStatus,
    book.levels.length
      ? `${book.levels.length} levels loaded. The funnel suggests settings for up to level ${FUNNEL.length}.`
      : 'No levels yet.'
  );
  generate();
}

boot();
requestAnimationFrame(frame);

// handy while working on it: zoodoku.editor.book / .candidate from the console
window.zoodokuEditor = {
  get book() {
    return book;
  },
  get candidate() {
    return candidate;
  },
  view,
  generate,
};
