// The lands, their colours and the animals that live in them.
//
// Every puzzle draws three lands from this pool. Colour is load-bearing here in
// a way it never was in Categorydoku: an animal may only be settled in a land
// of its own colour, so the three colours on a board have to be tellable apart
// at a glance and under a thumb. pickLands enforces that by refusing any trio
// whose hues sit close together -- which is why each entry carries its hue as a
// number rather than leaving it implied by the hex.
//
// Every glyph is Unicode 12 or older. Windows 10 ships an emoji font that stops
// there, and a missing glyph draws as an empty box -- an unreadable animal, not
// a cosmetic problem. Check any replacement on the oldest target you care about.
//
// No animal appears in two lands. A puzzle names its animals out loud ("I touch
// the fox"), so a fox in both Forest and Mountain would make that sentence
// point at two different squares.

import { shuffle } from './util.js';

export const LANDS = [
  {
    name: 'Savanna',
    hue: 40,
    ink: '#9a6a13',
    tint: '#f3e3ba',
    animals: ['🦁 lion', '🦒 giraffe', '🐘 elephant', '🦓 zebra', '🐆 leopard', '🦏 rhino'],
  },
  {
    name: 'Forest',
    hue: 25,
    ink: '#7a4a28',
    tint: '#e9d5c1',
    animals: ['🐻 bear', '🦌 deer', '🐗 boar', '🦊 fox', '🦉 owl', '🐿️ squirrel'],
  },
  {
    name: 'Ocean',
    hue: 205,
    ink: '#245f86',
    tint: '#cbdeec',
    animals: ['🐟 fish', '🐬 dolphin', '🐋 whale', '🦈 shark', '🐙 octopus', '🦀 crab'],
  },
  {
    name: 'Meadow',
    hue: 110,
    ink: '#3f7a37',
    tint: '#d6e8cb',
    animals: ['🐄 cow', '🐑 sheep', '🐖 pig', '🐓 rooster', '🐐 goat', '🐇 rabbit'],
  },
  {
    name: 'Mountain',
    hue: 268,
    ink: '#5d4a8c',
    tint: '#ded5ee',
    animals: ['🦅 eagle', '🐺 wolf', '🦙 llama', '🦡 badger', '🐼 panda', '🦍 gorilla'],
  },
  {
    name: 'Desert',
    hue: 12,
    ink: '#a3402a',
    tint: '#f4d1c4',
    animals: ['🐫 camel', '🦎 lizard', '🐍 snake', '🦩 flamingo', '🐢 turtle', '🦗 cricket'],
  },
];

/** "🦁 lion" -> { icon: '🦁', name: 'lion' } */
export function readAnimal(entry) {
  const at = entry.indexOf(' ');
  return { icon: entry.slice(0, at), name: entry.slice(at + 1) };
}

const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

/**
 * Three lands whose colours no one will confuse. The pool holds three warm
 * hues that sit within 30 degrees of each other, so a blind draw would
 * regularly deal gold beside brown beside clay. Requiring a gap keeps at most
 * one of those in any board; the separation is relaxed only if a draw somehow
 * cannot be made, which the current pool never needs.
 */
export function pickLands(rng, n = 3, gap = 60) {
  for (let relax = 0; relax < 6; relax++) {
    const want = gap - relax * 8;
    for (let attempt = 0; attempt < 40; attempt++) {
      const bag = shuffle([...LANDS.keys()], rng);
      const taken = [];
      for (const i of bag) {
        if (taken.every((j) => hueGap(LANDS[i].hue, LANDS[j].hue) >= want)) taken.push(i);
        if (taken.length === n) return taken.map((k) => LANDS[k]);
      }
    }
  }
  return LANDS.slice(0, n);
}

/**
 * Fixed things on the board. A landmark is there from the first deal and never
 * moves, so anything an animal says about one -- "I'm next to the tree" -- can
 * be read on its own, before any other animal is placed. That makes them the
 * main source of variety for levels where every animal must stand alone.
 *
 * Nothing stands on a landmark. Each is Unicode 12 or older, like the animals,
 * and none shares a name with an animal or a land.
 */
export const LANDMARKS = ['🌳 tree', '⛺ tent', '🌵 cactus', '🍄 mushroom', '🌻 sunflower', '⛲ fountain'];
