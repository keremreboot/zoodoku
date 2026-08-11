// Board state and rule checking. No rendering in here.
//
// Two rules bind every placement, and they are the mechanical ones the game
// enforces for you rather than the ones you have to think about: an animal only
// goes in a land of its own colour, and a land takes one animal and no more.
// The clues are the part left to the player, so nothing here stops you playing
// a deal that breaks one -- it just refuses to settle.
//
// Settling is the whole trick. Because the generator guarantees exactly one
// deal satisfies the clues, a trio that satisfies them cannot be anything other
// than the answer, so "all clues hold" is a proof of correctness and not merely
// an encouraging sign. That is why the round locks itself the moment it is
// consistent, with nothing to press and no way to be told you were right about
// a board you were wrong about.

import { holds } from './clues.js';

export const NOWHERE = -1;

export class Game {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.R = puzzle.R;
    this.ctx = puzzle.ctx;
    this.animals = puzzle.animals;
    this.zones = puzzle.zones;
    this.rounds = puzzle.rounds;

    this.pos = new Int32Array(this.animals.length).fill(NOWHERE);
    this.round = 0;
    this.undoStack = [];
  }

  get deal() {
    return this.puzzle.deals[this.round] ?? null;
  }

  /** The three animals waiting to be placed, in a stable colour order. */
  get hand() {
    const deal = this.deal;
    return deal ? deal.animals.map((id) => this.animals[id]) : [];
  }

  isLocked(id) {
    return this.animals[id].round < this.round;
  }

  isInHand(id) {
    return this.animals[id].round === this.round;
  }

  animalAt(cell) {
    for (let a = 0; a < this.pos.length; a++) if (this.pos[a] === cell) return a;
    return NOWHERE;
  }

  occupantOfZone(zone) {
    for (let a = 0; a < this.pos.length; a++) {
      if (this.pos[a] >= 0 && this.zones.zoneOf[this.pos[a]] === zone) return a;
    }
    return NOWHERE;
  }

  canPlace(id, cell) {
    if (cell < 0 || cell >= this.R.cells) return false;
    if (!this.isInHand(id)) return false;
    const zone = this.zones.zoneOf[cell];
    if (this.puzzle.zoneLand[zone] !== this.animals[id].land) return false;
    const sitting = this.occupantOfZone(zone);
    return sitting === NOWHERE || sitting === id;
  }

  place(id, cell, record = true) {
    if (!this.canPlace(id, cell)) return false;
    if (record) this.undoStack.push({ id, from: this.pos[id] });
    this.pos[id] = cell;
    return true;
  }

  lift(id, record = true) {
    if (this.pos[id] === NOWHERE || this.isLocked(id)) return false;
    if (record) this.undoStack.push({ id, from: this.pos[id] });
    this.pos[id] = NOWHERE;
    return true;
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return false;
    this.pos[step.id] = step.from;
    return true;
  }

  /** 'ok' | 'broken' | 'pending' -- pending while a square the clue names is empty. */
  clueState(cl) {
    const verdict = holds(cl, this.ctx, this.pos);
    if (verdict === null) return 'pending';
    return verdict ? 'ok' : 'broken';
  }

  brokenClues() {
    const deal = this.deal;
    if (!deal) return [];
    return deal.clues.filter((cl) => this.clueState(cl) === 'broken');
  }

  handPlaced() {
    return this.hand.filter((a) => this.pos[a.id] !== NOWHERE).length;
  }

  dealComplete() {
    return this.deal ? this.handPlaced() === this.deal.animals.length : false;
  }

  /**
   * Lock the round in if it is finished and consistent. Safe to call after
   * every placement -- it is a no-op until the trio is whole and clean.
   */
  settle() {
    if (!this.dealComplete()) return false;
    if (this.deal.clues.some((cl) => this.clueState(cl) !== 'ok')) return false;
    this.round++;
    this.undoStack.length = 0;
    return true;
  }

  settledCount() {
    let n = 0;
    for (const p of this.pos) if (p !== NOWHERE) n++;
    return n;
  }

  isSolved() {
    return this.round >= this.rounds;
  }

  reveal() {
    for (const a of this.animals) this.pos[a.id] = a.cell;
    this.round = this.rounds;
    this.undoStack.length = 0;
  }

  /** Clear the current round only -- settled rounds are proven and stay put. */
  clearHand() {
    for (const a of this.hand) this.pos[a.id] = NOWHERE;
    this.undoStack.length = 0;
  }
}
