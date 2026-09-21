# Zoodoku

Three animals arrive at once, one of each colour, and each may only be settled
in a land of its own colour. That alone leaves them dozens of squares to choose
between. What settles it is what they say — *I'm next to the tree*, *I'm in
the biggest Meadow*, *I'm not on the board's top edge*, *I'm next to the
fish and the lion* — and every deal is built so that exactly one arrangement of
the three can be true, and can be found without a single guess.

Deals keep coming until every land has its animal. Levels get harder as you go.

**Play:** https://keremreboot.github.io/zoodoku/

## Rules

- An animal is settled in a land of its own colour. Nothing else will take it.
- A land holds one animal and no more. Once it has one, the rest of the land is
  crossed out.
- Nothing stands on a landmark — the 🌳 tree, the ⛺ tent and the rest.
- Every clue on the three cards must end up true.
- A wrong square costs a strike, and the animal stays in hand. Five strikes and
  the level starts over — the same level, not a new one.

Every placement is judged the moment it lands. That is fair only because of how
deals are built: all three cards are on the table before anything is placed,
and every deal can be solved from them by elimination alone, so every wrong
square could have been ruled out before you committed to it. A strike is never
bad luck.

Squares the board greys out — the wrong colour, a land that already has its
animal, or a landmark — are not wrong answers. Dropping on one is refused and
costs nothing.
Nothing wrong ever lands, so an animal locks the moment it is placed, and there
is no undo: the only thing it could take back is a strike.

## Levels

Levels are curated. Each one was generated in the level editor, looked at by a
person, playtested and locked in — the game never makes up a board of its own.
They are played in order, and each opens once the one before it is finished.

They are arranged as a funnel. The first are small, every card is one short,
positive fact — *I'm in a corner of the board*, *I'm next to the tent* — and
every animal can be placed from its own card. Then "not" arrives, still one
fact to a card; then two facts to a card; then animals start to lean on one
another, first one at a time, then all together, while the clues widen to rows,
columns and distances. One thing changes at a time where possible, and spare
clues are taken away just before something new arrives, so each level is either
a new idea or the same idea with less help.

Progress is kept by level id, not position, so levels added or moved later never
hand anyone credit for the wrong one.

## What the animals can say

This is the whole list. An animal never says anything else, and the game's Key
shows the same list word for word:

| The animal says | It means exactly |
| --- | --- |
| I'm (not) next to the fox. | Our squares share a side. Squares touching only at their corners don't count. |
| I'm (not) diagonal to the fox. | Our squares touch only at their corners. |
| I'm (not) in the fox's row (column). | Same row (column), any distance apart. |
| I'm above (below) the fox. | Anywhere in a higher (lower) row. Columns don't matter. |
| I'm left (right) of the fox. | Anywhere in a column further left (right). Rows don't matter. |
| I'm 3 steps from the fox. | Count moves up, down, left or right. A diagonal neighbour is 2 steps. |
| My land borders the fox's land. | A square of my land shares a side with a square of the fox's. |
| I'm next to the 🌳 tree. | Anything said about an animal can be said about a landmark, and means the same. |
| I'm (not) on the board's edge. | The board's outer ring of squares. A land's edges never count. |
| I'm (not) on the board's top edge. | The board's top row (and likewise right, bottom, left). A corner of the board is on two edges. |
| I'm on the board's edge, but not the top one. | Both of the above at once. |
| I'm (not) in a corner of the board. | One of the board's four corners — or *a bottom corner*, *the board's top-left corner*. A land's corners never count. |
| I'm in the board's top half. | On an odd board the middle row (column) is in neither half. |
| I'm next to another land. | A side-neighbour is in a different land. The board's edge doesn't count. |
| I'm surrounded by my own land. | All four side-neighbours are in my land, so I'm not on the board's edge. |
| I'm (not) next to Desert. | A side-neighbour is (none is) in a Desert land. Only other colours are named. |
| I'm in the biggest (smallest) Meadow. | More (fewer) squares than any other Meadow, landmarks counted. Or *not the biggest*. |
| I'm in row 3 (column 3). | Counted from 1 at the top or left. Off unless a level asks for it. |

Clues are short on purpose, and a card never carries more than a set number of
sentences. Short words can be read two ways more easily than long ones, which is
what the list is for: every sentence has one exact meaning, written against the
code that checks it. A sentence with two fair readings is a guess of its own,
however sound the logic behind it — so the meanings live in `src/clues.js`,
beside the code that evaluates each clue, and the audit fails if any kind of
clue is missing from the list.

From the Lines rung up, several clues from one animal fold into one sentence:
*I'm next to the fish and the tree*, *I'm in a bottom corner of the board*,
*I'm on the board's edge, but not the right one*. No sentence ever lists more
than two things.

Every edge, corner and half is the board's, and says so — the short way, "the
board's top edge" rather than "the top edge of the board". Lands have edges and
corners too, and "I'm on an edge" said by an animal standing in a land is a fair
question — whose? Clues about an animal's own land say "land" instead: *I'm next
to another land*, *I'm surrounded by my own land*.

### Landmarks

Two or three fixed things on the board — 🌳 tree, ⛺ tent, 🌵 cactus, 🍄
mushroom, 🌻 sunflower, ⛲ fountain. They are there from the first deal and never
move, so anything an animal says about one can be read on its own card, before
any other animal is placed. That makes them the main source of variety in the
early levels, where every animal must stand alone and would otherwise have
little to describe itself by but edges and corners.

### Saying it once

A level that says the same kind of thing over and over is a level with one idea
in it. The generator weighs repetition heavily when it picks clues — most of all
within a deal, where repeats sit side by side — and the editor shows what each
level says most often, so a repetitive one can be rerolled before it is locked
in. No starter level uses any kind of sentence more than twice.

Clues are only ever about one or two fixed squares — never a tally of who is
nearby. Animals arrive over several deals, so "nothing is next to me" would be
true when it was dealt and false three deals later. A fact about two fixed
squares can never go stale, so every clue you have been shown is still true at
the end.

## How easy the clues are to read

Difficulty has two sides, and the first is how quickly a clue can be read and
understood. Clues come in four rungs, each adding to the one before:

- **Simple** — one plain, positive fact you can see: a corner or edge of the
  board, or what the animal is next to. *I'm in a corner of the board. I'm next
  to the tent.* No "not", nothing to compare.
- **Plain** — adds "not", the biggest or smallest land, and being surrounded by
  your own land. Still one fact to a sentence.
- **Lines** — adds rows, columns, above and below, left and right, halves and
  diagonals, and lets two facts share a sentence.
- **Counting** — adds step distances and bordering lands.

At the first two rungs a card is limited in facts, not sentences, and nothing is
folded into a compound: the first levels carry one fact per card, averaging
under six words. For those levels the animals are placed where one such fact
picks them out — the only corner of their colour, the only square beside
Desert — or beside a landmark placed so that "I'm next to the tree" does.

## How much the clues lean on each other

The other side is how much a deal's three animals depend on one another's
cards:

- **Alone** — each animal can be placed from its own card. It may mention an
  animal already on the board, since that one is not going anywhere.
- **In turn** — place one, and its position tells you where the next goes.
- **Together** — animals pin each other before any of them is placed.

## You never have to guess

This is the rule every deal is built to, and it is stronger than having one
answer. A deal can have exactly one answer and still only be findable by
supposing an animal is somewhere and following it through — with a strike on
every wrong square, a paid guess.

So every deal has to be solvable by elimination alone:

1. Each animal starts with every square it could legally take.
2. Everything said about one animal is read together, and any square that breaks
   it is crossed off.
3. Everything said about the same two animals is read together too — *I'm in
   the rooster's row* and *I'm 5 steps from the rooster* are one fact about
   where the rooster stands. A square is crossed off when no square still open
   to the other animal fits with it. At *Alone* this step is not needed at all;
   at *In turn* it is used only once the other animal is down to one square.
4. Repeat until nothing more falls. Each animal must be left with one square.

What that never allows is supposing: "if the crab were here, the rooster would
be there, and then the owl could not…" chained through all three animals is the
guessing the rule forbids. A deal that would need it is never built.

## Making levels

```bash
npm start
```

then open http://localhost:8137/editor.html.

Nothing is typed by hand. The sliders set:

- **Board** — 5 × 5 up to 9 × 9.
- **Lands** — a multiple of three (one deal takes one land of each colour); it
  decides how many deals the level has and how big each land is.
- **Clues lean on each other** — Alone, In turn or Together, as above.
- **How easy clues are to read** — *Simple*, *Plain*, *Lines* or *Counting*,
  as above.
- **Most facts (or sentences) on a card** — keeps cards short. At Simple and
  Plain it counts facts; from Lines up, sentences.
- **Landmarks** — 0 to 3 fixed things animals can mention.
- **Varied land sizes** — lands of clearly different sizes, so one can be *the
  biggest Meadow*. Off, every land is within a square of the others.
- **Spare clues per deal** — true facts the deal didn't need, as help.
- **Row and column clues** — off unless you want them.

**Funnel settings** fills the sliders with the suggestion for the level being
made. **Generate** builds a level that meets the settings exactly or says it
couldn't, and what to loosen. It never quietly loosens a setting itself, so
the sliders always mean what they say. Plain clues can't describe the middle
of a big board in two sentences, for instance, and the editor says so rather
than handing back something wordier.

The preview shows the answers and every card, deal by deal, with what each
deal actually demands and what the level says most often. **Playtest** opens it in the game in a new tab.
**Lock in** puts it in the level list at the position chosen, and saves.

Above the list is the funnel: one bar per level, as tall as its difficulty. A
level easier than the one before it shows red — maybe a deliberate breather,
maybe a mistake, but either way a decision. Levels can be moved and deleted
from the list.

Saving goes through the local server into `levels/levels.json`. Opened any other
way, the editor still works and offers the file as a download instead.

### Why a locked level is stored whole

A locked level stores the whole board — lands, animals, answers and every
clue — not the seed and settings that made it. The generator will keep
changing, and a level someone approved must never quietly become a different
level because the code that once made it has moved on. The settings and seed
are kept too, as a record.

What can still change is wording: clues are stored as facts, and turned into
sentences when shown, so a clearer phrasing reaches every level at once.

## How a level is built

The answer is chosen first — the lands are cut, and every animal is given its
square — and only then is it worked out what they are allowed to say. Every
clue in the pool is therefore a true statement about the finished board, so
adding one can only narrow the player's options towards the answer.

Clues are then chosen greedily. At each step the generator adds whichever clue
lets elimination, at the level's leaning, cross off the most — nudged towards
plain kinds, strongly away from repeating a kind the level has already used, and
away from leaning on another animal when a fact that stands alone would do as
well — and stops once every animal is on its square. A clue elimination can't
use yet makes no progress, so it is never picked for that. Then each chosen
clue is dropped if the others can do its work, and a spare clue is added only if
the card, taken as a whole, does not already say it — "I'm in a corner of the
board" and "I'm not on the top edge" together already mean "I'm on the bottom
edge". One answer
comes free: the answer always survives elimination, because every clue is true
of it.

For deals that lean on each other, lands sharing a border are dealt together
and the animals stood near one another, which is what gives them something to
say about each other. For deals that stand alone the animals go anywhere, and
the landmarks are set down near them afterwards — never on an animal's square,
never two in one land — so that even a square in the middle of a land has
something to be described by. "I'm in the biggest Meadow" is only said when the
land beats every other Meadow by two squares or more: a one-square lead is true,
but it asks the player to count carefully rather than to look.

### Lands

Growing lands outward from scattered seeds does not work: they landlock each
other before they are full and most attempts are thrown away. So the board
starts from a valid layout and is disturbed. Cutting the boustrophedon ordering
of the squares into runs gives connected lands of exactly the right sizes,
because consecutive squares in that ordering are always neighbours. Those runs
are ribbons, so squares are then traded across borders to fatten them — one each
way, which leaves both sizes untouched, kept only if both lands are still in one
piece and the board's total border did not grow.

Because the sizes are set before the cutting starts, varied lands cost nothing
extra: the sizes are spread about a third either side of even (never below three
squares), and colours are handed out three lands at a time from biggest to
smallest, so every colour gets a big land and a small one.

### Why 9 × 9 is the largest board

In the first deal every square of a colour is in play, a third of the board
however the lands are cut, so the options open are `(N²/3)³`: about 1,700 at
6 × 6 and 20,000 at 9 × 9, which a few facts can close. A 12 × 12 board is
110,000 and needs cards nobody wants to read.

## Controls

Tap an animal, then tap a square — or drag it straight across. On a phone
tap-then-tap is the one that works, because a fingertip covers the very square
it is aiming at.

An animal lands when you let go, not when you press. With a strike riding on
every drop that matters: a thumb that comes down a square off can slide across
before lifting, and one that slides off the board puts nothing down.

| Key | Action |
| --- | --- |
| `Esc` | put the carried animal back |
| `N` | next level, once this one is done |

## Running it locally

No build step and no dependencies; plain ES modules, so it needs to be served
over http rather than opened from the filesystem. Node is only needed for the
tools.

```bash
npm start
```

serves the game on http://localhost:8137 and the editor at `/editor.html`. The
server listens on this machine only, because the editor saves through it.

## Checking the levels

```bash
npm run audit
```

The audit checks the promises the game makes, without trusting any of the code
that made them. For every level in `levels/levels.json`, and for fresh boards
along every step of the funnel, it:

- solves every deal by elimination at its level's leaning, with its **own**
  solver, separate from the generator's, and fails any deal that would need a
  guess;
- tries every arrangement of the three animals and fails any deal with more
  than one answer;
- checks every clue is true of the answer and is a kind the key explains, and
  every land is whole and fairly sized.

It exits non-zero on any failure. Run it after touching `generate.js`,
`deduce.js`, `clues.js` or `zones.js`. `npm run audit:quick` is a shorter run
that also prints a sample level, so you can read the clues as a player would.

## Layout

- `index.html`, `src/main.js` — the game: levels, cards, pointer and panels
- `editor.html`, `src/editor.js` — the level editor
- `levels/levels.json` — the locked levels, in play order, one per line
- `src/clues.js` — what an animal can say: meaning, wording and the key
- `src/deduce.js` — solving a deal by elimination, the no-guessing rule itself
- `src/generate.js` — building a level to a spec: the answer, then the clues
- `src/funnel.js` — suggested settings for each level
- `src/levels.js` — writing levels down, reading them back, measuring them
- `src/gen-worker.js` — runs the generator off the editor's main thread
- `src/habitats.js` — the lands, their colours, the animals and the landmarks
- `src/zones.js` — cutting the grid into connected lands of equal size
- `src/state.js` — board state, placement and strikes
- `src/view.js` — 2D canvas renderer
- `src/util.js` — seeded random, shuffling, grid neighbours
- `tools/audit.mjs` — the independent check
- `tools/serve.mjs` — local server; saves levels, and `POST /snap?name=x` saves
  a canvas render to `tools/snaps/` for review

Colour is the rule here, so it has to survive a colourblind player: every land
also writes its name across itself, the way a map does, fitted to the land's own
squares. Lands are drawn three at a time from a pool of six, and a trio is
refused unless its hues are far enough apart.

Every icon is Unicode 12 or older. Windows 10's emoji font stops there, and a
missing glyph draws as an empty box. No animal appears in two lands, because
clues name animals out loud and a fox in two lands would make that sentence
point at two different squares.

Built on the seeded-generation and canvas work of Categorydoku, but the mechanic
is the other way round: there, you read pictures to find where a piece came
from; here, the animals tell you where they belong and you work out where that
can possibly be.
