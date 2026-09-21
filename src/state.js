// Board state and rule checking. No rendering in here.
//
// Two rules bind every placement, and they are the mechanical ones the game
// enforces for you rather than the ones you have to think about: an animal only
// goes in a land of its own colour, and a land takes one animal and no more.
// A drop that breaks either is simply refused -- the board shows those squares
// as unavailable, so trying one is a slip of the hand, not a wrong answer.
//
// Everything else is judged, and judged at once. A drop on a legal square that
// is not the animal's own costs a strike and the animal stays in hand. That is
// only fair because of what the generator guarantees: every deal has exactly one
// arrangement its clues allow, and all three cards are on the table before
// anything is placed. So a wrong square is never bad luck -- the information to
// rule it out was there -- and comparing against the answer is the same test as
// checking the clues, just without the wait for the third animal.
//
// It also means every animal on the board is exactly where it belongs, so a
// placed animal is locked the moment it lands, and there is nothing to undo.

import { holds } from './clues.js';

export const NOWHERE = -1;
export const MAX_STRIKES = 5;

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
    this.strikes = 0;
  }

  get deal() {
    return this.puzzle.deals[this.round] ?? null;
  }

  /** The three animals of the current deal, in a stable colour order. */
  get hand() {
    const deal = this.deal;
    return deal ? deal.animals.map((id) => this.animals[id]) : [];
  }

  isPlaced(id) {
    return this.pos[id] !== NOWHERE;
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

  /** Allowed by the mechanical rules -- right colour, free land. Says nothing about right or wrong. */
  canPlace(id, cell) {
    if (cell < 0 || cell >= this.R.cells) return false;
    if (!this.isInHand(id) || this.isPlaced(id)) return false;
    const zone = this.zones.zoneOf[cell];
    if (this.puzzle.zoneLand[zone] !== this.animals[id].land) return false;
    return this.occupantOfZone(zone) === NOWHERE;
  }

  /**
   * Try to put an animal down.
   * @returns {'placed'|'wrong'|'illegal'} illegal costs nothing and changes nothing
   */
  attempt(id, cell) {
    if (this.isLost() || !this.canPlace(id, cell)) return 'illegal';
    if (cell !== this.animals[id].cell) {
      this.strikes++;
      return 'wrong';
    }
    this.pos[id] = cell;
    return 'placed';
  }

  /** 'ok' | 'pending' -- a clue lights up once every square it names is filled. */
  clueState(cl) {
    return holds(cl, this.ctx, this.pos) === null ? 'pending' : 'ok';
  }

  handPlaced() {
    return this.hand.filter((a) => this.isPlaced(a.id)).length;
  }

  /** Move on to the next deal once all three are down. Returns whether it did. */
  settle() {
    if (!this.deal || this.handPlaced() < this.deal.animals.length) return false;
    this.round++;
    return true;
  }

  settledCount() {
    let n = 0;
    for (const p of this.pos) if (p !== NOWHERE) n++;
    return n;
  }

  strikesLeft() {
    return Math.max(0, MAX_STRIKES - this.strikes);
  }

  isLost() {
    return this.strikes >= MAX_STRIKES;
  }

  isSolved() {
    return this.round >= this.rounds;
  }

  reveal() {
    for (const a of this.animals) this.pos[a.id] = a.cell;
    this.round = this.rounds;
  }
}
