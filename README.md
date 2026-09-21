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
- A wrong square costs a strike, and the animal stays in hand. Five strikes on a
  board and it starts over from the first deal — the same board, not a new one.

A deal has exactly one arrangement its clues allow, so every placement is judged
the moment it lands, against the answer. That is fair only because of how the
deals are built: all three cards are on the table before anything is placed, so
every wrong square could have been ruled out before you committed to it. A
strike is never bad luck.

Squares the board greys out — the wrong colour, or a land that already has its
animal — are not wrong answers. Dropping on one is refused and costs nothing.

Since nothing wrong ever lands, every animal on the board is exactly where it
belongs. It locks the moment it is placed, and a deal moves on as soon as its
third animal is down. There is no undo: the only thing it could take back is a
strike.

## What the animals can say

Clues are facts about two squares, or about one square and the board. Never a
tally of who is nearby.

That restriction is what holds the game together rather than a stylistic
preference. Animals arrive over several deals, so a clue like "nothing touches
me" would be true when it was dealt and false three deals later once a
neighbour turned up. A fact about two fixed squares can never go stale, so every
clue you have been shown is still true at the end.

This is the whole list. An animal never says anything else, and the game's Key
shows the same list word for word:

| The animal says | It means exactly |
| --- | --- |
| I touch the fox. | Our squares share an edge. Squares that meet only at a corner do not touch. |
| I do not touch the fox. | Our squares do not share an edge. We may still meet corner to corner. |
| I meet the fox corner to corner. | Diagonal neighbours: our squares share a corner and nothing else. |
| I share a row (column) with the fox. | Same row (column), however far apart. |
| I am in a higher (lower) row than the fox. | My row is nearer the top (bottom). We need not share a column. |
| I am in a column further left (right) than the fox. | My column is nearer that edge. We need not share a row. |
| The fox is exactly 3 steps away. | Moves up, down, left or right. A diagonal neighbour is 2 steps. |
| My land borders the fox's land. | Some square of my land shares an edge with some square of the fox's. |
| I am (not) on the rim of the board. | The rim is the outermost ring: top and bottom rows, left and right columns. |
| I am in a corner of the board. | One of the four corner squares. |
| I am in the top (bottom, left, right) half. | On an odd board the middle row (column) is in neither half. |
| I touch a square of another land. | A square sharing an edge with mine is outside my land. The board's edge does not count. |
| I touch four squares, all of them in my own land. | Not on the rim, and all four edge-neighbours are in my land. |
| I am in row 4, counting from the top. | The last-resort clue. Across every audit so far it has never been needed. |

Several clues about the same animal fold into one sentence, so "I touch the
fish" and "I touch the lion" become *I touch both the fish and the lion*.

Every meaning was written against the code that checks the clue, not against the
sentence. A clue with two fair readings forces a guess however sound the logic
behind it, so ambiguous wording breaks the no-guessing rule just as surely as a
badly built deal does. The definitions live in `src/clues.js` beside the code
that evaluates each clue, and the audit fails if any kind of clue is missing
from the list.

## Difficulty

Every level pins its deals with a minimal set of clues. **Gentle** keeps to
facts you can check by looking, and adds a clue or two more than the deal needs.
**Sharp** shows the minimum and nothing else: take one clue away and the deal
could no longer be worked out. No level ever needs a guess.

Gentle being the *wordier* setting is not a mistake. Fewer clues means a tighter
line of reasoning, not an easier one.

## You never have to guess

This is the rule every deal is built to, and it is stronger than having one
answer. A deal can have exactly one arrangement its clues allow and still only
be findable by supposing an animal is somewhere and following it through. With
a strike on every wrong square, that supposition is a paid guess.

So every deal has to be solvable by elimination alone:

1. Each animal starts with every square it could legally take.
2. Everything said about one animal is read together, and any square that breaks
   it is crossed off.
3. Everything said about the same two animals is read together too — *I share a
   row with the rooster* and *the rooster is exactly 5 steps away* are one fact
   about where the rooster stands. A square is crossed off when no square still
   open to the other animal fits with it.
4. Repeat until nothing more falls. Each animal must be left with one square.

What that never allows is supposing: "if the crab were here, the rooster would
be there, and then the owl could not…" chained through all three animals is the
guessing the rule forbids. A deal that would need it is never dealt.

## How a board is built

The answer is chosen first — the lands are cut, and every animal is given its
square — and only then is it worked out what they are allowed to say. Choosing
the answer first is what makes the guarantee cheap: every clue in the pool is a
true statement about the finished board by construction, so adding one can only
narrow the player's options towards the answer and never away from it.

Clues are then chosen greedily. At each step the generator adds whichever clue
lets elimination cross off the most, nudged towards readable kinds and away from
repeating itself, and stops once elimination puts every animal on its square.
A clue that would only help someone willing to suppose makes no progress by that
measure, so it is never picked for that reason. Then each chosen clue is tested
for whether the others can already do its work, and dropped if they can. One
answer comes free: the answer always survives elimination, because every clue
is true of it.

The generator cannot fail. Row and column clues are available at the last
resort, and a row plus a column pins a square outright with no reasoning between
animals needed, so elimination can always be carried to the end. What can fail
is doing it *tidily* — inside the clue budget, using only the readable kinds —
and that is what the retries are for. Concessions are made in order: a clue
more, then a clue more again, then the level's choosiness about what may be
said, and only at the very end a bare coordinate. In every audit so far, the
last rung has never been reached.

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

An animal lands when you let go, not when you press. With a strike riding on
every drop that matters: a thumb that comes down a square off can slide across
before lifting, and one that slides off the board entirely puts nothing down and
costs nothing.

| Key | Action |
| --- | --- |
| `Esc` | put the carried animal back |
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

The audit checks the promises this game makes, without trusting any of the code
that made them. For 180 boards across every size and level it:

- solves every deal by elimination with its **own** solver, separate from the
  generator's, and fails any deal that would need a guess;
- brute-forces every arrangement of the three animals and fails any deal with
  more than one answer;
- checks every clue is true of the answer, every land is whole and fairly sized,
  and every kind of clue is explained in the key.

It exits non-zero on any failure. Run it after touching `generate.js`,
`deduce.js`, `clues.js` or `zones.js`. A new kind of clue worded one way and
evaluated another is exactly the bug it exists to catch.
`npm run audit:quick` checks one board size and prints a sample board, so you
can read the clues as a player would.

## Layout

- `src/habitats.js` — the lands, their colours and the animals in them
- `src/zones.js` — cutting the grid into connected lands of equal size
- `src/clues.js` — what an animal can say, and how it is worded
- `src/generate.js` — choosing the answer, then the clues that pin it
- `src/deduce.js` — solving a deal by elimination, the no-guessing rule itself
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
