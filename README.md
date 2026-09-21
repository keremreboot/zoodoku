# Zoodoku

Three animals arrive at once, one of each colour, and each may only be settled
in a land of its own colour. That alone leaves them dozens of squares to choose
between. What settles it is what they say — *I'm in a corner*, *I'm next to
Desert*, *I'm next to the fish and the lion* — and every deal is built so that
exactly one arrangement of the three can be true, and can be found without a
single guess.

Deals keep coming until every land has its animal. Levels get harder as you go.

**Play:** https://keremreboot.github.io/zoodoku/

## Rules

- An animal is settled in a land of its own colour. Nothing else will take it.
- A land holds one animal and no more. Once it has one, the rest of the land is
  crossed out.
- Every clue on the three cards must end up true.
- A wrong square costs a strike, and the animal stays in hand. Five strikes and
  the level starts over — the same level, not a new one.

Every placement is judged the moment it lands. That is fair only because of how
deals are built: all three cards are on the table before anything is placed,
and every deal can be solved from them by elimination alone, so every wrong
square could have been ruled out before you committed to it. A strike is never
bad luck.

Squares the board greys out — the wrong colour, or a land that already has its
animal — are not wrong answers. Dropping on one is refused and costs nothing.
Nothing wrong ever lands, so an animal locks the moment it is placed, and there
is no undo: the only thing it could take back is a strike.

## Levels

Levels are curated. Each one was generated in the level editor, looked at by a
person, playtested and locked in — the game never makes up a board of its own.
They are played in order, and each opens once the one before it is finished.

They are arranged as a funnel. The first are small, and every animal can be
placed from its own card. Then boards grow, and animals start to lean on one
another: first one at a time, then all together. One thing changes at a time
where possible, and spare clues are taken away just before something new
arrives, so each level is either a new idea or the same idea with less help.

Progress is kept by level id, not position, so levels added or moved later never
hand anyone credit for the wrong one.

## What the animals can say

This is the whole list. An animal never says anything else, and the game's Key
shows the same list word for word:

| The animal says | It means exactly |
| --- | --- |
| I'm next to the fox. | Our squares share a side. Touching only at a corner doesn't count. |
| I'm not next to the fox. | Our squares don't share a side. We may still be diagonal. |
| I'm diagonal to the fox. | Our squares touch at one corner and nothing else. |
| I'm in the fox's row (column). | Same row (column), any distance apart. |
| I'm above (below) the fox. | Anywhere in a higher (lower) row. Columns don't matter. |
| I'm left (right) of the fox. | Anywhere in a column further left (right). Rows don't matter. |
| I'm 3 steps from the fox. | Count moves up, down, left or right. A diagonal neighbour is 2 steps. |
| My land borders the fox's land. | A square of my land shares a side with a square of the fox's. |
| I'm (not) on an edge. | The edge is the outer ring of squares. |
| I'm on the top edge. | The top row (and likewise right, bottom, left). A corner is on two edges. |
| I'm in a corner. | One of the four corners — or *a bottom corner*, *the top-left corner*. |
| I'm in the top half. | On an odd board the middle row (column) is in neither half. |
| I'm next to another land. | A side-neighbour is in a different land. The board's edge doesn't count. |
| I'm surrounded by my own land. | All four side-neighbours are in my land, so I'm not on an edge. |
| I'm (not) next to Desert. | A side-neighbour is (none is) in a Desert land. Only other colours are named. |
| I'm in row 3 (column 3). | Counted from 1 at the top or left. Off unless a level asks for it. |

Clues are short on purpose, and a card never carries more than a set number of
sentences. Short words can be read two ways more easily than long ones, which is
what the list is for: every sentence has one exact meaning, written against the
code that checks it. A sentence with two fair readings is a guess of its own,
however sound the logic behind it — so the meanings live in `src/clues.js`,
beside the code that evaluates each clue, and the audit fails if any kind of
clue is missing from the list.

Several clues from one animal fold into one sentence: *I'm next to the fish and
the lion*, *I'm in a bottom corner*.

Clues are only ever about one or two fixed squares — never a tally of who is
nearby. Animals arrive over several deals, so "nothing is next to me" would be
true when it was dealt and false three deals later. A fact about two fixed
squares can never go stale, so every clue you have been shown is still true at
the end.

## How much the clues lean on each other

The main dial of difficulty is how much a deal's three animals depend on one
another's cards:

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
- **Clue vocabulary** — *Plain* (edges, corners, what an animal is next to),
  *Lines* (adds rows, columns, above and below, halves, diagonals) or
  *Counting* (adds step distances and bordering lands).
- **Most sentences on a card** — keeps cards short.
- **Spare clues per deal** — true facts the deal didn't need, as help.
- **Row and column clues** — off unless you want them.

**Funnel settings** fills the sliders with the suggestion for the level being
made. **Generate** builds a level that meets the settings exactly or says it
couldn't, and what to loosen. It never quietly loosens a setting itself, so
the sliders always mean what they say. Plain clues can't describe the middle
of a big board in two sentences, for instance, and the editor says so rather
than handing back something wordier.

The preview shows the answers and every card, deal by deal, with what each
deal actually demands. **Playtest** opens it in the game in a new tab.
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
plain kinds, away from repeating itself, and away from leaning on another animal
when a fact that stands alone would do as well — and stops once every animal is
on its square. A clue elimination can't use yet makes no progress, so it is
never picked for that. Then each chosen clue is dropped if the others can do its
work, and spare clues are added only if nothing already shown implies them.
One answer comes free: the answer always survives elimination, because every
clue is true of it.

For deals that should stand alone, the animals are placed where a square is
easy to describe on its own — along edges and in corners. For deals that lean,
lands sharing a border are dealt together and the animals are stood near one
another, which is what gives them something to say about each other.

### Lands

Growing lands outward from scattered seeds does not work: they landlock each
other before they are full and most attempts are thrown away. So the board
starts from a valid layout and is disturbed. Cutting the boustrophedon ordering
of the squares into runs gives connected lands of exactly the right sizes,
because consecutive squares in that ordering are always neighbours. Those runs
are ribbons, so squares are then traded across borders to fatten them — one each
way, which leaves both sizes untouched, kept only if both lands are still in one
piece and the board's total border did not grow.

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
- `src/habitats.js` — the lands, their colours and the animals in them
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
