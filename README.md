# Zoodoku

Animals arrive a few at a time — one, two, three or four — and each may only be
settled in a land of its own colour. That alone leaves them dozens of squares
to choose between. What settles it is what they say — *I'm next to the tree*,
*I'm in the biggest Meadow*, *I'm not on the board's top edge*, *I'm next to the
fish and the lion* — and every deal is built so that exactly one arrangement of
its animals can be true, and can be found without a single guess.

Deals keep coming until every land has its animal. Levels get harder as you go.

**Play:** https://keremreboot.github.io/zoodoku/

## Rules

- An animal is settled in a land of its own colour. Nothing else will take it.
- A land holds one animal and no more. Once it has one, the rest of the land is
  crossed out.
- Nothing stands on a landmark — the 🌳 tree, the ⛺ tent and the rest.
- Every clue on the deal's cards must end up true.
- A wrong square costs a strike, and the animal stays in hand. Five strikes and
  the level starts over — the same level, not a new one.

Every placement is judged the moment it lands. That is fair only because of how
deals are built: all of a deal's cards are on the table before anything is placed,
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
Every level is open from the start; they are meant to be played in order, and
the level list ticks off the ones finished.

There are sixteen, arranged as a funnel. The first four are small and every
card is one short, positive fact — *I'm in a corner of the board*, *I'm next to
the tent*. The very first deals one card at a time: read one sentence, place
one animal. The second deals two at a time, and the third two where one card
leans on the other — *I'm next to the shark* — the whole idea of the game in
its smallest form. The fourth deals three, each standing alone. Then depth arrives:
two facts to a card, neither of which says where the animal is by itself —
*I'm on the board's edge. I'm next to Ocean.* — first in the same simple words,
then vaguer ones. Then animals start to lean on one another: two of a deal
still found from their own card and the third through them, then deals that
bring two animals of one colour, then fewer starting points, then all together,
while the clues widen to rows, columns and distances and each sentence gives
away less. The last two levels deal four at a time — with three colours, always
two of one — and the last one's final deal has no starting point at all.

### How many at a time

A deal can bring one, two, three or four animals, and that is a dial of its
own. One card is nothing to hold in the head but itself; four is four
sentences, leaning on each other, all at once. Early levels keep deals small so
a new player meets one idea at a time; the last levels make them big. A deal
of up to three is one animal of each colour; a deal of four doubles one colour,
so "a land takes one animal" always has something to say in it.

Players said the difficulty jumped too suddenly, so the funnel turns one dial
at a time and is checked with numbers (see *Measuring difficulty*): no level
is more than about half again as hard as the one before. Spare clues are taken
away just before something new arrives, so each level is either a new idea or
the same idea with less help.

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
| I'm next to the 🌳 tree or the fox. | Next to at least one of the two — maybe both. |
| I'm closer to the 🌳 tree than to the fox. | Fewer steps to the first than the second. The same number of steps is not closer. |
| I'm in the middle of the board. | Two or more squares in from every edge — the middle four of a 6 × 6. |
| I'm on one of the board's diagonals. | The two corner-to-corner lines. |
| I'm next to two (three) other lands. | Side-neighbours lie in exactly two (three) lands besides mine. |
| The 🌳 tree is in my land. | The landmark stands inside my land's heavy lines. Or *no landmark is in my land*. |
| My land borders Ocean. | A square of my land shares a side with an Ocean land. Only other colours are named. |
| My land touches the board's edge. | Some square of my land is on the outer ring. Or *doesn't touch*. |
| I'm in the biggest (smallest) Meadow. | More (fewer) squares than any other Meadow, landmarks counted. Or *not the biggest*. |
| My land has 9 squares. | Landmarks counted. |
| I'm in row 3 (column 3). | Counted from 1 at the top or left. Off unless a level asks for it. |

Many of these are vague on purpose. "The tree is in my land" or "My land
borders Ocean" leaves an animal a good handful of squares — which is what depth
needs: facts that each draw a region, and meet. The land facts also ask the
player to look at a whole land rather than a square, which the older clues
never did.

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

Every landmark on a board is mentioned by some clue. One nobody mentions is
clutter — something to look at, wonder about, and never need — so once a
level's clues are chosen, any landmark they don't mention is taken away. That
is checked, not assumed: nothing stands on a landmark, so even an unmentioned
one blocks a square, and that blocked square may be what let a deal be solved.
Every deal is solved again with the square open, and if any would now need a
guess, the whole level is thrown away and another built. The audit fails any
level with a landmark no clue mentions.

### Saying it once

A level that says the same kind of thing over and over is a level with one idea
in it. The generator weighs repetition heavily when it picks clues — most of all
within a deal, where repeats sit side by side — and the editor shows what each
level says most often, so a repetitive one can be rerolled before it is locked
in. No starter level uses any kind of sentence more than twice, bar level 5:
twelve sentences made from the five simple kinds must repeat one of them three
times.

Clues are only ever about one or two fixed squares — never a tally of who is
nearby. Animals arrive over several deals, so "nothing is next to me" would be
true when it was dealt and false three deals later. A fact about two fixed
squares can never go stale, so every clue you have been shown is still true at
the end.

## How easy the clues are to read

Difficulty has several sides, and the first is how quickly a clue can be read
and understood. Clues come in four rungs, each adding to the one before:

- **Simple** — one plain, positive fact you can see: a corner, edge or the
  middle of the board, what the animal is next to, a landmark standing in its
  land. *I'm in a corner of the board. The tree is in my land.* No "not",
  nothing to compare.
- **Plain** — adds "not" and whole-land facts: the biggest or smallest land,
  being surrounded by your own land, how many lands you're next to, what your
  land borders, whether it reaches the board's edge. Still one fact to a
  sentence.
- **Lines** — adds rows, columns, above and below, left and right, halves and
  diagonals, "this or that", and lets two facts share a sentence.
- **Counting** — adds step distances, which of two things is closer, land
  sizes and bordering lands.

At the first two rungs a card is limited in facts, not sentences, and nothing is
folded into a compound: the first levels carry one fact per card, averaging
under six words. For those levels the animals are placed where one such fact
picks them out — the only corner of their colour, the only square beside
Desert — or beside a landmark placed so that "I'm next to the tree" does. When
animals stand alone with depth, the same is done with two facts: each animal
goes where two broad ones meet — the one square on the board's right edge that
is also next to Ocean.

## How much the clues lean on each other

The second side is how much a deal's animals depend on one another's
cards:

- **Alone** — each animal can be placed from its own card. It may mention an
  animal already on the board, since that one is not going anywhere.
- **In turn** — place one, and its position tells you where the next goes.
- **Together** — animals pin each other before any of them is placed.

### Two of one colour

Most deals are one animal of each colour. From the middle levels on, some
bring two of one — and then "a land takes one animal" stops being a rule the
board enforces and becomes something to reason with. The goat's card fits only
the big Meadow; the sheep's fits both Meadows; so the sheep is in the small one.
Neither card had to say which land, and neither could have been placed from its
own card alone.

It leans on the other animal, so it follows the leaning like any fact about two
animals: never *Alone*; *In turn*, once one is placed its land is closed to the
other — exactly what the board shows by crossing that land out; *Together*,
once every square left to one lies in a single land, that land is closed to
the other before either is placed.

They come two deals at a time. A level keeps as many lands of each colour as
there are animals of it, so a deal that takes a second Meadow gives up its
Ocean to another deal, which then has two Oceans.

## How much one sentence gives away

The third side of difficulty is depth. Left to itself, the generator reaches
for the sharpest fact there is, and the sharpest fact names a square outright —
*I'm in the board's top-left corner* — which leaves nothing to put together.
The early levels want exactly that. After them, it gets in the way: each card
turns into a set of directions rather than a puzzle.

So from level 5, a level has a depth: no sentence, read on its own against
every square the animal could take, may leave it fewer than that many squares.
Each sentence draws a region; the animal is where the regions cross — two facts
on its own card, a fact and where another animal turned out to be, or a fact
and a land its twin has taken. Everything a card says about the same animal or
landmark counts as one sentence here: *I'm next to the tent. I'm right of the
tent.* is one square said in two halves, not two facts that meet. (An animal
with only a few squares to begin with need only lose one.)

Depth 2 arrives with two facts to a card at level 5, depth 3 at level 6, depth
4 with "together". But depth is only a floor, and a floor alone leaves every
sentence sitting right on it — on the early levels each still left about two
squares, which reads as pointing at a tile. So the generator aims for vague
facts, not just allows them. Animals standing alone, and the starting animals
of later deals, are placed where two *broad* facts meet, and among the sets of
facts that pin an animal, the one whose sharper fact leaves the most squares is
preferred. The new land and landmark clues are what make that possible: with
them, far more squares have two vague facts meeting on them. On average an
animal's sharpest sentence leaves about 3 squares at level 5, 5 by level 9 and
9 on the last levels.

### Starting points

The other thing that made later levels feel like a cliff was losing every
starting point at once. A starting point is an animal the player can place
straight from its own card, before anything else is known: the way in. A deal
with none has no obvious first move.

So a level says how many each deal has, and the generator builds to it
exactly: the starting animals are chosen first, placed where their own facts
meet, and given a card that pins them; every other card is kept from placing
its own animal, so it has to be found through them. A level can give each deal
its own number — the last level runs 1, 1, 0, 0 — so a level's last deal is its
hardest and the next level starts where it ended.

At depth this also decides how many facts an animal takes. A starting animal is
two facts that meet. Any other one is at least its own fact plus the two that
found what it leans on.

### Measuring difficulty

The editor stores, and shows, what each level actually asks — measured by the
solver, not assumed from the settings:

- **Vagueness** — per animal, how many squares its sharpest sentence leaves.
- **Facts per animal** — the fewest sentences, from any card, that have to be
  put together to pin it.
- **Rounds** — how many waves of deduction a deal takes: finding the fish
  before the bear, and the bear before the owl, is three.
- **Starting points** — as above.
- **"Not"** — the share of sentences that say it. Readability is the other
  half of difficulty.

The difficulty score puts these together per deal: its size, weighted up for
every extra fact an animal needs, every extra round, every missing starting
point and each step of leaning. The old score grew only with the board, so on
paper the last levels were harder while in play the reasoning had stopped
growing at level 9. The sixteen levels score 2, 3, 6, 5, 6, 6, 7, 11, 13, 19,
21, 31, 33, 44, 60 and 66 — no step more than about half again the one before,
bar level 3, where the first card that leans on another scores above the
three standing-alone cards of level 4 — and the starter script refuses to jump
further than that when it can help it.

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
4. Two animals of one colour can't share a land: once every square left to one
   of them is in the same land, that land is crossed off for the other (at *In
   turn*, only once it is down to one square).
5. Repeat until nothing more falls. Each animal must be left with one square.

What that never allows is supposing: "if the crab were here, the rooster would
be there, and then the owl could not…" chained through all the animals is the
guessing the rule forbids. A deal that would need it is never built.

## Making levels

```bash
npm start
```

then open http://localhost:8137/editor.html.

Nothing is typed by hand. The sliders set:

- **Board** — 5 × 5 up to 9 × 9.
- **Animals per deal** — one to four cards at a time.
- **Lands** — a whole number of deals' worth; it decides how many deals the
  level has and how big each land is.
- **Clues lean on each other** — Alone, In turn or Together, as above.
- **How easy clues are to read** — *Simple*, *Plain*, *Lines* or *Counting*,
  as above.
- **Most facts (or sentences) on a card** — keeps cards short. At Simple and
  Plain it counts facts; from Lines up, sentences.
- **Depth** — off, or the fewest squares any one sentence may leave an animal,
  as above.
- **Two of one colour** — how many deals bring two animals of one colour, two
  deals at a time.
- **Starting points per deal** — how many animals each deal lets the player
  place from their own card, exactly, or *any*. Only when clues lean on each
  other. The funnel can set a list, one per deal, which the slider keeps until
  it is moved.
- **Landmarks** — up to 3 fixed things animals can mention. Any the level's
  clues don't mention are taken away, so a level may end up with fewer.
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
deal actually demands — its leaning, depth, starting points and rounds — and
the level's measures (see *Measuring difficulty*) and what it says most often.
**Playtest** opens it in the game in a new tab.
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
use yet makes no progress, so it is never picked for that. At a level with
depth, a clue that would make any sentence on its card too sharp is never
offered, so greedy cannot reach for the one fact that names the square. Then each chosen
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

The marker is for the player's own working. Pick it up and a tap circles a
square; a tap on a circled square clears it; a drag carries whichever it
started as across every square it passes. It is held in the same hand as an
animal, so picking up one puts the other down. A circle is a note, not a rule —
it means whatever the player wants it to, and an animal can still be dropped on
it.

Two kinds of mark share the board, and they have to be told apart at a glance,
because only one kind can be taken back. The board's own crosses — every square
of a land that already has its animal — are facts: faint, thin, ruler-straight,
and out of the marker's reach. The player's are circles, bold and drawn the way
a pen draws one, so they differ in shape as well as weight. They are wiped each
time an animal lands. A circle doesn't record which animal it was about, so
after a placement there is no telling which still count — and keeping ones that
no longer do is how a fair board starts to feel like a guess.

| Key | Action |
| --- | --- |
| `M` | pick up or put down the marker |
| `Esc` | put down the carried animal, or the marker |
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
- tries every arrangement of the deal's animals and fails any deal with more
  than one answer;
- checks every clue is true of the answer and is a kind the key explains, and
  every land is whole and fairly sized;
- brute-forces depth: no sentence, or everything one card says about the same
  thing, leaves an animal fewer squares than the level promises;
- counts each deal's starting points — animals their own card places, with its
  own solver again — against what the level promises.

It exits non-zero on any failure. `npm run depth` prints how often a single
sentence places an animal, level by level. Run it after touching `generate.js`,
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
