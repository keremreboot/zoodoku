# Zoodoku

Three animals arrive at once, one of each colour, and each may only be settled
in a land of its own colour. That alone leaves them dozens of squares to choose
between. What settles it is what they say about each other — *I touch both the
fish and the lion* — and the lands are cut so that exactly one arrangement of
the three can be true.

Deals keep coming until every land has its animal.

**Play:** https://keremreboot.github.io/zoodoku/

## Rules

- An animal is settled in a land of its own colour. Nothing else will take it.
- A land holds one animal and no more, so the places a colour can still go run
  out as the board fills.
- Every clue on the three cards must end up true.

A deal has exactly one arrangement its clues allow. So the moment your three sit
consistently they are right, and the board settles them itself — there is
nothing to submit, and no way to be told you were right about a board you were
wrong about. Settled animals lock, because they were proved rather than guessed.

## What the animals can say

Clues are facts about two squares, or about one square and the board. Never a
tally of who is nearby.

That restriction is what holds the game together rather than a stylistic
preference. Animals arrive over several deals, so a clue like "nothing touches
me" would be true when it was dealt and false three deals later once a
neighbour turned up. A fact about two fixed squares can never go stale, so every
clue you have been shown is still true at the end.

| | |
| --- | --- |
| touch | the two squares share an edge; corners are said as *corner to corner* |
| steps | moves up, down, left or right — a diagonal neighbour is two steps |
| my land | the coloured area an animal stands in, not the colour itself |
| halves | on an odd board the middle row belongs to neither half |

## Difficulty

Every level pins its deals with the same minimal set of clues. **Gentle** keeps
to facts you can check by looking, and adds a clue or two more than the deal
needs. **Sharp** shows the minimum and nothing else: take one clue away and the
deal would have two answers.

Gentle being the *wordier* setting is not a mistake. Fewer clues means a tighter
line of reasoning, not an easier one.

## How a board is built

The answer is chosen first — the lands are cut, and every animal is given its
square — and only then is it worked out what they are allowed to say. Choosing
the answer first is what makes the guarantee cheap: every clue in the pool is a
true statement about the finished board by construction, so adding one can only
narrow the field towards the answer and never away from it. Pinning a deal is
then a set-cover problem over the deals you could otherwise have played, and
greedy is more than good enough for it.

The generator cannot fail. Row and column clues are always available at the last
resort, and two different candidate deals must differ in some animal's row or
column, so there is always a clue left that makes progress. What can fail is
doing it *tidily* — inside the clue budget, using only the readable kinds — and
that is what the retries are for. Concessions are made in order: a clue more,
then a clue more again, then the level's choosiness about what may be said, and
only at the very end a bare coordinate. Across 675 deals audited, the last rung
was never reached.

### Why there is no bigger board

In the first deal every square of a colour is in play, which is a third of the
board however the lands are cut. The field is therefore `(N²/3)³` deals wide —
about 1,700 at 6 × 6 and 20,000 at 9 × 9, both of which three or four facts can
close. A 12 × 12 board is 110,000 wide and needs six or seven, which is cards
nobody wants to read for no gain over 9 × 9. Cutting a big board into more lands
does not help: the number of lands never enters that sum.

### Why the lands are paired up before the animals are placed

Left to chance, the three lands in a deal are strewn across the board, and then
no animal can say anything about touching another — the best it can manage is a
distance, which is arithmetic rather than a puzzle. Lands that share a border
are deliberately dealt together, and the animals are then stood near each other
inside them. That is what makes *I touch both the fish and the lion* a sentence
this game can produce.

### Lands

Growing lands outward from scattered seeds does not work: they landlock each
other before they are full and most attempts are thrown away. So the board
starts from a valid layout and is disturbed. Cutting the boustrophedon ordering
of the squares into runs gives connected lands of exactly the right sizes,
because consecutive squares in that ordering are always neighbours. Those runs
are ribbons, so squares are then traded across borders to fatten them — one each
way, which leaves both sizes untouched, kept only if both lands are still in one
piece and the board's total border did not grow.

## Controls

Tap an animal, then tap a square — or drag it straight across. On a phone
tap-then-tap is the one that works, because a fingertip covers the very square
it is aiming at.

| Key | Action |
| --- | --- |
| `Esc` | put the carried animal back |
| `U` | undo |
| `N` | new board |

Puzzles are seeded — the URL hash is the seed, so a link reproduces the exact
board.

## Running it locally

No build step and no dependencies; plain ES modules, so it needs to be served
over http rather than opened from the filesystem. Node is only used for the
tools below. The game itself runs on anything that serves files.

```bash
npm start
```

That serves the game on http://localhost:8137 (`python -m http.server 8137`
works just as well).

## Checking the generator

```bash
npm run audit
```

The one promise this game makes is that every deal has exactly one answer, so
that is what gets checked, and without trusting any of the code that made the
promise. The audit rebuilds the field of legal deals from scratch for 180
boards across every size and level and brute-forces each deal against its
clues. It also checks that every clue is true of the answer and that every land
is whole and fairly sized. It exits non-zero on any failure.

Run it after touching `generate.js`, `clues.js` or `zones.js`. A new kind of
clue worded one way and evaluated another is exactly the bug it exists to catch.
`npm run audit:quick` checks one board size and prints a sample board, so you
can read the clues as a player would.

## Layout

- `src/habitats.js` — the lands, their colours and the animals in them
- `src/zones.js` — cutting the grid into connected lands of equal size
- `src/clues.js` — what an animal can say, and how it is worded
- `src/generate.js` — choosing the answer, then the clues that pin it
- `src/state.js` — board state, placement, rule checking, undo
- `src/view.js` — 2D canvas renderer
- `src/main.js` — cards, pointer and panel handling
- `src/util.js` — seeded random, shuffling, grid neighbours
- `tools/audit.mjs` — the independent uniqueness check
- `tools/serve.mjs` — local server; `POST /snap?name=x` saves a canvas render
  to `tools/snaps/`, which is how a board gets out of a headless browser for review

Colour is the rule here, so it has to survive a colourblind player: every land
also writes its name across itself, the way a map does. That label is the
fallback, not decoration — which is why it is fitted to the land's own squares
rather than left to spill across a border and read as if it belonged to the land
next door. Lands are drawn three at a time from a pool of six, and a trio is
refused unless its hues are far enough apart, so gold never turns up beside
brown beside clay.

Every icon is Unicode 12 or older. Windows 10's emoji font stops there, and a
missing glyph draws as an empty box — an unreadable animal, not a cosmetic
problem. No animal appears in two lands, because a puzzle names its animals out
loud and a fox in both Forest and Dusk would make that sentence point at two
different squares.

Built on the seeded-generation and canvas work of Categorydoku, but the mechanic
is the other way round: there, you read pictures to find where a piece came
from; here, the animals tell you where they belong and you work out where that
can possibly be.
