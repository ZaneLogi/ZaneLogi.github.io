# Frogger — Architecture & Design Spec

A faithful-feeling Frogger clone. **This document is the blueprint the code
follows, and it is self-contained**: everything needed to understand the port's
design — the game's rules, the render model, the classes, the decisions — lives
here. No other document is required to read it.

---

## 1. Goal & governing principles

- **Faithful-*feeling* Frogger, as an educational clone.** The target is the
  classic arcade Frogger experience — a recognizable frog hopping across road and
  river toward five homes, against a timer — not a byte-exact copy of any one
  machine.
- **Idiomatic object-oriented code.** One object per game entity; behavior in
  methods. We do **not** mirror any original's memory layout or routine structure.
- **Governing test — faithful to what the player observes, free with the rest.**
  The game's *rules, timing, and feel* are the standard we hold to. The
  *implementation* — how pixels reach the screen, how collision is computed — is
  ours to choose for clarity. We have a real framebuffer and real object
  instances, and we use them directly.
- **Look = arcade, rendered at 224×256** (§4).

---

## 2. The game — the rules the design implements

The game in five rules — the standard this port is faithful to:

1. **Move** the frog up / down / left / right — one hop per press.
2. **Reach a home bay** within the time limit (60 timer beats).
3. **Cross the road** without being run over, and **cross the river** without falling in.
4. **Avoid** the traffic, snakes, otters, crocodiles, and diving turtles.
5. **Score** — 10 per safe hop · 50 for reaching home · 10 per timer beat saved · 200 for
   escorting a lady-frog home · 200 for eating an insect · 1000 for filling all five homes.

Stated as the rules our classes enforce (this is the whole game; the design in §6
exists to serve them):

- The player is a **frog** that **hops one grid cell per input** (up/down/left/
  right — one press, one hop). It spawns at the **bottom** and must reach one of
  **five home bays at the top**.
- On screen, top to bottom:
  - **Home row (top):** five bays. Landing squarely in an **empty** bay scores and
    fills it. Missing (hitting a divider) or landing in a **filled** bay kills the
    frog. A **bonus insect** appears in a bay **on a fixed timer** (eat it for points);
    from level 2 a **crocodile** takes a bay as a hazard on the same schedule (§3.4).
  - **River band:** several lanes of **logs and turtles drifting horizontally**.
    The frog is safe **only while riding** an object and is **carried at its
    speed**. **Open water drowns** it; **diving turtles submerge** on a cycle and
    drown a rider; being **carried off the screen edge** kills it. An **otter** roams
    the log lanes (lethal on contact), and a **cyan lady-frog** rides a lane — carry
    her home for a bonus.
  - **Median:** a safe strip between river and road (a snake patrols it from level 2).
  - **Road band:** several lanes of **vehicles moving horizontally**. Any contact
    **kills** (squash).
  - **Start row (bottom):** safe grass where the frog spawns.
- A **countdown timer** runs each life; reaching zero kills the frog. **Remaining
  time is a bonus** when a home is reached.
- **Scoring:** points for each **forward hop to a new furthest row** (never for
  backtracking), for **reaching a home** (plus the remaining-time bonus), and for
  the **bonus insect / lady-frog** bonus. An **extra life** is granted at a score threshold.
- **Filling all five homes clears the level;** difficulty then ramps — objects
  move **faster** and the **lane layout varies**. The frog has a stock of **lives**;
  losing the last one ends the game.

---

## 3. Playfield construction

The play area is **five road lanes + a median + five river lanes**, framed by the
home row at the top and the start row at the bottom — the arcade arrangement, at
its 224×256 size. Each lane is a `Lane` (§6) holding a row of `Mover`s of one
object type; the frog crosses ten lanes to reach the homes.

### 3.1 The lanes, top → bottom

| Band | Contents | Dir | Sprite(s) | Behavior |
|---|---|:---:|---|---|
| **Home row** | 5 bays in a hedge; a **bonus insect** and (from level 2) a separate **crocodile head** each take a bay on fixed schedules (§3.4) | — | `hedge_*`, `frog_home_0/1`, `bonus`, `crochead_0/1` | empty bay = score; divider / occupied / croc-head-up = death (§6 `Homes`) |
| River 1 | **logs**; a **crocodile** replaces one from level 2 | → | `log_0/1/2`, `croc_0/1` | ride the log/croc **back**; the croc's open **mouth** kills |
| River 2 | **turtles** (one group **dives**) | ← | `turtle_0/1/2`, `turtle_dive_*` | ride while surfaced; a **submerged** diver drowns its rider |
| River 3 | **logs** (long) | → | `log_*` | ride; drifts right |
| River 4 | **logs** | → | `log_*` | ride; drifts right |
| River 5 | **turtles** (one group **dives**) | ← | `turtle_*`, `turtle_dive_*` | as River 2 |
| **Median** | safe strip; a **snake** patrols from level 2 | ← | `snake_0/1/2` | safe to stand; the snake kills on contact |
| Road 1 | **trucks** | ← | `truck` | kills on contact |
| Road 2 | **race cars** | → | `car_green` | kills |
| Road 3 | **cars** | ← | `car_pink` | kills |
| Road 4 | **bulldozers** | → | `dozer` | kills |
| Road 5 | **race cars** (fastest lane) | ← | `car_red` | kills |
| **Start row** | safe grass; the frog spawns centered | — | — | safe |

Lane direction is **constrained by sprite orientation**: the turtle sprite's head faces
**left** (there is no right-facing variant), so every **turtle** lane drifts left; **logs**
are symmetric (rounded left end / tree-ring right end, no "front") and take the opposite drift,
**right**. Lanes therefore mostly alternate direction, the one exception being the two adjacent
log lanes (River 3 · 4), which both drift right. Each log lane has **one log size** (different
lanes differ — see §3.2); a lane never mixes sizes. The per-lane object, direction, and sprite
are **constants** (`constants.js`); the table is the default (arcade) arrangement. The **home-row hedge** is static background: `hedge_0` is a bay
unit (green hedge framing one bay opening), `hedge_1` the narrow filler between them —
tiled across the top into a continuous hedge with the five bay openings. The **median**
and **start-row** safe strips tile `bg_block` as their background.

### 3.2 Per-lane composition & motion

**Each lane is a fixed conveyor, seeded deterministically — no RNG.** At stage load
a lane is filled from fixed constants and plays out identically every time. A lane
is defined by: **count `N`**, object **size `W`** (px), drift **speed `V`**
(px/frame), **direction**, a **phase `φ`** (a per-lane start offset), a shared
**wrap length `L = 240`** (a little wider than the 224 px field, for a seamless
off-screen wrap), and the derived **period `P = L / N`** (centre-to-centre spacing).

- **Where objects start:** evenly spaced from the lane's phase — object *i* begins
  at **`x_i = (φ + i·P) mod L`** (*i* = 0…N−1). The **spacing** between objects is
  `P`; the visible **gap** is `P−W`. `φ` **staggers the lanes** so their objects
  don't form a vertical column at stage load — a per-lane constant (like the
  speeds), not a random roll. The `Start x_i` column below shows the base pattern
  (`φ = 0`); each lane's real start adds its own `φ`. `φ` is **fixed across all
  levels** — it is cosmetic, so difficulty rides on speed and count, never on `φ`.
  Default rule: **`φ = laneIndex × 20 px`** top→bottom (0, 20, 40, … 200).
- **Motion:** each frame object *i* is at `(x_i + dir·V·t) mod L`, drawn when on
  screen — leaving one edge re-enters the other. Nothing is spawned or destroyed
  mid-life, and there is no acceleration within a lane.

A **tile = 16 px** (a car, or one log/turtle segment); logs are 2–4 tiles, turtle
groups 2–3 turtles. These are the **level-1 constants** (`constants.js`) — figures
tuned by feel, the *model* fixed.

| Lane | Object | `W` | `N` | `P` | `V` (L1) | Dir | Start `x_i` | Notes |
|---|---|:-:|:-:|:-:|:-:|:-:|---|---|
| River 1 | log | 48 | 3 | 80 | 0.35 | → | 0, 80, 160 | croc replaces one from L2 |
| River 2 | turtle group | 48 | 3 | 80 | 0.30 | ← | 0, 80, 160 | one group dives |
| River 3 | log | 64 | 2 | 120 | 0.20 | → | 0, 120 | |
| River 4 | log | 32 | 4 | 60 | 0.45 | → | 0, 60, 120, 180 | |
| River 5 | turtle group | 32 | 4 | 60 | 0.30 | ← | 0, 60, 120, 180 | one group dives |
| Median | snake | 16 | 1 | — | 0.25 | ← | enters at edge | from L2; safe otherwise |
| Road 1 | truck | 32 | 2 | 120 | 0.20 | ← | 0, 120 | |
| Road 2 | car | 16 | 3 | 80 | 0.30 | → | 0, 80, 160 | race car |
| Road 3 | car | 16 | 3 | 80 | 0.25 | ← | 0, 80, 160 | sedan |
| Road 4 | dozer | 16 | 3 | 80 | 0.20 | → | 0, 80, 160 | bulldozer (slow) |
| Road 5 | car | 16 | 2 | 120 | 0.45 | ← | 0, 120 | race car (fastest) |

**Motion rules:**
- **Carry (river only).** The frame a river lane advances, a frog standing in it is
  carried the same pixels/direction (the `Lane`'s carry, tick step §7). Carried off
  an edge = death. Road lanes never carry — contact is a squash.
- **Diving turtles.** In each turtle lane, one **fixed group** cycles
  *surfaced (safe) → submerged (drown) → surfaced* on a fixed timer (§3.4). A frog on
  that group while it is under drowns.
- **Crocodile (from level 2).** Replaces one log in **River 1** (the lane just below
  the homes); its back rides like a log, but its **mouth is lethal while open** (a
  fixed cycle, §3.4). The **median snake** (from level 2) kills on contact.
- **Timed bay/river extras.** The **bonus-insect / crocodile bay item**, the
  **lady-frog** escort (River 4), and the roaming **otter** appear on **fixed timers**
  (§3.4) — not fixed lane objects.

### 3.3 Difficulty across levels — how the parameters change

Clearing all five homes advances the **level**. Every per-lane number in §3.2
changes by a **fixed, level-indexed rule** (still no RNG):

- **Speed** — the whole board accelerates: `V(level) = V₁ × (1 + 0.10·(level−1))`,
  capped at **2×** (reached ~level 11). Nothing else about speed changes.
- **Count → spacing** — the **river thins** and the **road thickens**, one notch
  every couple of levels, to floors/caps. Because `P = L/N`, changing `N`
  **re-derives the spacing and start positions automatically**: fewer river logs =
  wider gaps (harder crossings); more road cars = tighter traffic. Example schedule
  (`N` per lane):

  | Lane | L1 | L2 | L3 | L4 | L5 | L6+ |
  |---|:-:|:-:|:-:|:-:|:-:|:-:|
  | River 4 logs | 4 | 4 | 3 | 3 | 2 | 2 |
  | River 1 logs | 3 | 3 | 3 | 2 | 2 | 2 |
  | Road 2 cars | 3 | 3 | 4 | 4 | 5 | 5 |
  | Road 5 cars | 2 | 2 | 3 | 3 | 3 | 3 |

- **Hazards switch on by level** — the **crocodile** (River 1) and **median snake**
  from **level 2**; a **second diving turtle group** per turtle lane from **level 3**.

The **timer** length, **lives**, and the single **extra-life** threshold do **not**
change across levels — rising speed and thinning platforms are the whole ramp.

### 3.4 Timed events — all on fixed timers (no RNG)

These extras appear on a schedule instead of living permanently in a lane. Each runs
off the frame counter with a fixed period, phase, and sequence — as deterministic as
the conveyors:

- **Diving turtles.** In each turtle lane, one **fixed group** (a set index) runs a
  `T_dive`-frame cycle (default **240**): **submerged during the last quarter**
  (frames 180–239), safe otherwise, then repeats. A fixed per-lane phase keeps the
  two turtle lanes from diving in unison.
- **River-crocodile mouth (River 1, from level 2).** The river crocodile's mouth runs
  a `T_mouth`-frame cycle (default **120**): **open during the last third** (frames
  80–119), closed otherwise. Its **back always rides** like a log; its **front tile
  is lethal only while the mouth is open** (`croc_0` = closed, `croc_1` = open).
- **Home-bay items — the bonus insect, and from level 2 the crocodile head.** Up to
  two items occupy the home row at once, always in **different** bays and never on a
  filled one. The **bonus insect** (`bonus`) sits in one bay and steps to the next on
  a `T_bay`-frame timer (default **256**) through a fixed bay order (`2, 0, 3, 1, 4`),
  skipping filled bays; landing on it fills the home **and** scores a bonus. From
  **level 2** a **crocodile head** takes a second bay — a **bobbing head** that cycles
  `crochead_0` (head down: an emerging sliver, the bay **safe** and fillable) ↔
  `crochead_1` (head up: **lethal**) on a `T_baycroc`-frame cycle (default **120**),
  reared up during its last third. Landing on the croc bay **kills while the head is
  up**; while it is down the frog fills the home normally (no bonus).
- **Lady-frog (river escort, River 4).** Every `T_lady` frames (default **512**) a
  **cyan lady-frog** (the player frog recoloured cyan, §5.1) boards **River 4** at its
  edge and rides along; hop onto her and carry her home for a bonus. Uncollected, she
  rides off-screen and the timer repeats.
- **Otter (roaming river hazard).** A single lethal **otter** roams the three log
  lanes — **River 1 → 3 → 4**, in that fixed order. Every `T_otter` frames (default
  **256**) it enters the next lane and swims across in that lane's direction **faster
  than the lane's logs**. When it catches up to a log ahead it **dismisses**; but a
  frog on the **trailing edge of that log** when the otter arrives is **caught and
  killed**. It cannot be ridden. Present from level 1. Frames: `otter_0` swimming,
  `otter_1` on the catch (§3.5).

Every period, phase, and order is a constant (`constants.js`); the sequence is
identical on every playthrough — nothing here rolls dice.

### 3.5 Animation

Two kinds of frame-cycling, both deterministic (driven by the frame counter, never
random):

- **Cosmetic loops** — a sprite cycles its frames at a fixed rate (default every ~8
  frames) purely for looks; they never touch collision:

  | Object | Frames |
  |---|---|
  | snake | `snake_0/1/2` |
  | turtle (surfaced swim) | `turtle_0/1/2` |
  | logs · cars · trucks · bonus insect | **static** — no animation, they only move |

- **State-driven frames** — the frame *is* a gameplay state, so it is set by the
  object's state (timed in §3.4 or driven in §6), never a free loop:

  | Object | Frame ↔ state |
  |---|---|
  | diving turtle | `turtle_0/1/2` surfaced (safe) ↔ `turtle_dive_*` submerged (drowns) — §3.4 dive timer |
  | river crocodile | `croc_0` mouth closed (front safe) ↔ `croc_1` mouth open (front lethal) — §3.4 mouth timer |
  | bay crocodile | `crochead_0` head down (**safe**) ↔ `crochead_1` head up (**lethal**) — §3.4 bay-croc duration |
  | otter | `otter_0` swimming ↔ `otter_1` on the catch (kill) — §3.4 otter |
  | frog | `frog_0…7` by **facing** (4 dirs) × **rest / hop** — set by the frog's state (§6) |
  | frog death | the 7-frame explosion `death_0 → death_5 → skull` — during `Death` mode |
  | lady-frog | the player frog recoloured cyan (§5.1) — a rest frame while riding |

Frame rates and the frame↔state windows are constants (`constants.js`).

---

## 4. Render & coordinate model

- **Backbuffer: 224×256 pixels** (arcade-native, portrait). *All* gameplay math is
  in these pixels. The backbuffer is **integer-scaled** to the display with
  nearest-neighbor (`image-rendering: pixelated`); the page never sub-pixel-scales.
- **Screen layout (top→bottom):** score/HUD · five home bays · river lanes ·
  median · road lanes · start row · bottom HUD. **Score at top, lives + timer at bottom.**
  The bands are **tile-aligned and sum to 256 px**: score **24** · home hedge **24**
  (y 24–47) · five river lanes 16 (48–127) · median 16
  (128–143) · five road lanes 16 (144–223) · start row 16 (224–239) · bottom HUD 16
  (240–255). Only the home hedge is 24 px; the ten moving lanes **and** both `bg_block`
  safe strips (median, start) are **16 px**. Every playfield row below the hedge is 16 px,
  so the frog hops a **uniform 16 px** per press (row-indexed: `y = 224 − row·16`).
- **Sprites are 16×16**, drawn at any pixel coordinate. Every game object — each
  vehicle, log, turtle, and the frog — is an independent instance rendered with a
  single `drawImage`, and any number may be on screen at once. The playfield reads
  as an ~8px grid.
- **One canvas** holds the backbuffer. Each frame: draw the background bands, then
  the objects, the frog, and the HUD text. Background bands change rarely, so they
  may be cached to an offscreen canvas and blitted — an optional optimization, not
  a requirement.

### 4.1 HUD layout

Score at the **top**, lives and the timer at the **bottom** (the arcade
arrangement); all text uses the monospace font (§5). Positions in px for the
224×256 screen (tunable constants):

**Top strip** (y 0–23):

| Element | Text | Position |
|---|---|---|
| Player label / score | `1-UP` / digits | `(16, 1)` / `(16, 9)` |
| Hi-score label / value | `HI-SCORE` / digits | `(88, 1)` / `(88, 9)` |

**Bottom strip** (y 240–255) — lives, timer, and level in the 16 px band below the start row.
The `blk_*` HUD tiles are **8×8**. Positions are provisional — finalized when the HUD is built
(step 5):

| Element | Position |
|---|---|
| **Lives** — one `blk_0` frog icon per reserve life | from `(8, 240)`, left→right |
| **Timer bar** — shrinks as time drains; green normally, red in the warning phase (below) | `(8 … 184, 248)`; `TIME` label at `(188, 248)` |
| **Level** — `blk_1` markers, one per level | right side, near `(216, 240)` |

The **timer bar** is a row of 8 px tiles: full green `blk_2` for the beats remaining, its
draining end tile stepping `blk_3` → `blk_5` (narrowing) for the sub-tile fraction; in the
warning phase the whole bar switches to the red set — `blk_6` (full) → `blk_9` (sliver).

The play area (home bays → start row) fills the space between, **y 24–239**.

---

## 5. Asset layer

The game loads two asset families, each a data module with a thin API — **graphics** (§5.1)
and **audio** (§5.2).

### 5.1 Graphics

Art is **one atlas PNG** plus a generated **manifest module** that exports:

- `SPRITES` — `{ name: {x,y,w,h} }` rectangles into the atlas (frog frames,
  vehicles, logs, turtles, river + bay crocodiles, otters, snakes, the bonus insect,
  the death-explosion frames + skull, home graphics, bonus numbers).
- `GLYPHS` + `GLYPH_W` / `GLYPH_H` — a **monospace** bitmap font (uniform cells).
- `PALETTE` — the color list.
- `FROG_RECOLOR` — palette remaps of the frog; the **cyan** map is the lady-frog (a
  recoloured player frog), `red` is spare.

Draw API (owned by the renderer):

- **`drawSprite(name, x, y)`** — `drawImage` of the atlas rect. **Black is
  transparent** (the atlas keys it out).
- **`drawText(str, x, y, color)`** — monospace: advance `x += GLYPH_W` per
  character; the white glyphs are **tinted** to `color` via a cached source-in
  fill. Fixed-width, so numeric HUD fields never jitter.
- **`recolor(map)`** — frog only: a **palette remap** (swap each source color for a
  target), *not* a flat tint, because the frog is multi-color. Cached; used for the
  **cyan lady-frog**.

Rule of thumb: object color is **baked into each sprite**; only the single-color
**font tints**, and only the multi-color **frog palette-remaps**.

### 5.2 Audio

Audio reproduces the arcade Frogger sound — a **PSG** (programmable sound generator) with
**3 pulse (tone) voices + 1 noise voice** — in Web Audio. Its data is `assets/dat_sfx.js`
(the note/effect streams for the theme and each sound), the audio counterpart of the sprite
atlas. This section fixes **where every sound fires**.

**`Audio` service (§6).** A small Web Audio "PSG" — the pulse + noise voices above — plus a
data-driven sequencer that plays the streams in `dat_sfx.js`. The API the rest of the game
calls:

- `request(id)` — raise a sound (the event sites below call this).
- `tick()` — advance every active sound one frame → voice params (§7 step 6).
- `isPlaying(id)` — hold a screen until its jingle finishes (below).
- `playMusic()` / `stopMusic()` — the looping theme.

**Where each sound fires** — sound → the point in the class design (§6/§10) that raises it:

| Sound | Kind | Fires from | When |
|---|---|---|---|
| Main theme | music loop | `Play.enter` → `playMusic`; `Play.exit` → `stopMusic` | background of play |
| Hop | SFX | `Frog.beginHop` (tick step 2) | each hop starts |
| Plunk / drown | SFX | `Collision` → drown → `Death.enter` | open water, off a log, submerged turtle, carried off-edge |
| Squash | SFX | `Collision` → squash → `Death.enter` | vehicle contact |
| Hurry-up | SFX | `Timer` when units ≤ warning threshold | time running low |
| Time-out | SFX | `Timer` at 0 → `Death.enter` | timer expires |
| Reach home | SFX | `Homes.land` (empty bay) | a bay fills |
| Insect / lady-frog bonus | SFX | `Homes` bonus pickup or lady-frog escorted home | bonus collected |
| Extra life | SFX | `Score` crosses the extra-life threshold | score threshold |
| Level complete | jingle | `RoundClear.enter` | all five homes filled |
| Start | SFX | `Attract` → Start → `Play` | game begins |
| Game over | jingle | `GameOver.enter` | game ends |

`isPlaying(id)` exists for a jingle-timed screen — `RoundClear` or `GameOver` — to hold
until the tune ends rather than a fixed §10 frame count.

---

## 6. Object-oriented decomposition

One object per entity; behavior in methods. The classes and their jobs:

**Shell / flow**
- **`main`** — the pump: a **fixed-timestep loop** (one logic tick per frame at
  ~60 Hz) plus a render call. Owns nothing game-specific.
- **`Game`** — owns session state (score, lives, level, and the **frame counter**
  that §3.4/§3.5 read) and the subsystems; exposes `setMode`, `tick`, `render`.
- **`Mode`** — the contract `enter / update / render / exit`. `update` and
  `render` stay **separate** (the loop may run 0/1/2 updates per repaint).
- **`Flow`** — the mode graph as data; decides transitions **centrally**, so modes
  never import one another.

**Modes** — `Attract` (title / high-score) · `Play` (one life) ·
`Death` (the death explosion plays, then decrement a life) · `RoundClear` (all homes filled
→ next level) · `GameOver` (→ back to Attract).

**Gameplay**
- **`Frog`** — the player. A **hop** glides it one **16 px cell** (a column
  horizontally, or one lane vertically — lanes are 16 px tall) as a **smooth 8-frame
  slide at 2 px/frame**, *not* a teleport. Input is **locked for the hop's duration**
  (one hop per press); the hop frame shows during the slide, the rest frame on
  landing. The frog is **in transit** while hopping — collision resolves **when it
  lands** (§7). Plus facing and river-carry (once landed). It **spawns** on the start
  row, horizontally **centred** (sprite left `x = 104`), **facing up**. (The
  `8 frames` / `2 px` hop values are tunable constants.)
- **`Mover`** — a base moving object: position, per-lane velocity/step, edge wrap.
- **`Lane`** — one row: its object type, direction, speed, and its set of `Mover`s;
  knows whether it **carries** a rider (river) or **kills** on contact (road).
- **`Playfield`** — owns the ten `Lane`s and the `Homes`; **builds them for the
  current level** from `constants.js` (per-lane `N/W/V/P/φ` + the §3.3 schedule),
  advances the lanes each tick, and is the surface `Collision` and `Play` query.
- **`Collision`** — the rules: for the frog's current row, decide **safe / ride /
  drown / squash / home / pickup** by **span overlap** against that row's objects.
  Skipped for the single frame a hop is in progress.
- **`Homes`** — the five bays (at fixed X): occupancy, the landing test — the frog's
  centre must fall within **±6 px** of a bay centre **and** the bay be empty, else it
  hit a divider or a filled bay and **dies**. A filled bay shows the **smiling** frog
  (`frog_home_0`); on the win `RoundClear` redraws all five as the **laughing** frog
  (`frog_home_1`, §10). Also owns the bonus insect, the crocodile-head bay hazard, the
  escorted lady-frog's arrival, and the win check.
- **`Timer`** — a per-life countdown. Starts at **60 beats**, losing one every
  **30 frames** (~30 s per full timer); the bar (§4.1) shows beats left, turns
  **warning-coloured at ≤ 12**, and at **0 triggers the time-out death**. Reaching a
  home adds **remaining beats × 10** to the score (the time bonus). Values tunable.
  (The bar renders green normally, red in the warning phase — §4.1.)
- **`Score`** — the running total (displayed as ≥ 5 digits, top-left). Awards:
  **+10** per forward hop to a new furthest row; **+50** for reaching a home (plus
  the time bonus above); **+200** for the bonus insect or the lady-frog escort; **+1000** for
  filling all five homes. A single **extra life at 20000**. All values tunable.

**Presentation**
- **`Renderer`** — the 224×256 backbuffer + `drawSprite`/`drawText`; owns the atlas.
- **`Sprites`** — the atlas image + manifest lookups (the asset layer, §5).
- **`Hud`** — score / hi-score / lives / level, drawn with the monospace font.
- **`Input`** — keys/joystick → hop intents, **edge-triggered** (one hop per press).
- **`Audio`** — the sound service (§5.2): a small Web Audio "PSG" (pulse + noise voices) and
  a data-driven sequencer over the sound data (`dat_sfx.js`). `request(id)` at the event
  sites, `tick()` per frame, `isPlaying(id)`, `playMusic`/`stopMusic`.

| Class | Responsibility | Collaborators |
|---|---|---|
| `Frog` | hop, ride, facing, spawn, death | `Lane`, `Collision`, `Input` |
| `Mover` | move + wrap one object | `Lane` |
| `Lane` | a row of movers; carry-vs-kill | `Mover` |
| `Playfield` | build + own lanes & homes per level | `Lane`, `Homes`, `constants` |
| `Collision` | safe/ride/drown/squash/home per row | `Frog`, `Playfield` |
| `Homes` | 5 bays, bonus, win | `Score` |
| `Timer` | countdown, time bonus, time-out | `Score`, `Frog` |
| `Score` | awards, extra life | — |
| `Play`/`Death`/… | drive a phase | `Game`, gameplay classes |
| `Renderer`/`Sprites`/`Hud` | draw | atlas + manifest |
| `Audio` | SFX + theme; request/tick/isPlaying | (event sites, §5.2) |

---

## 7. Per-frame tick order

One fixed-timestep logic tick per frame; render after. In `Play`, the order is a
**design invariant**:

1. **Input** → the frog's pending hop (if any).
2. **Frog update** — begin a hop, or advance the current one **2 px** (of its 16 px);
   apply last frame's ride carry while landed.
3. **Collision** — only while the frog is **landed** (skipped mid-hop): resolve its
   cell against **last frame's** object positions → safe / ride / drown / squash /
   home. A hop that **lands this frame** is resolved at its target cell.
4. **Objects move** — each `Lane` advances its `Mover`s; a riding frog is carried.
5. **Timer** tick; level / difficulty bookkeeping.
6. **Audio** — advance active sounds one frame and start any requested during steps 2-5
   (`Audio.tick()`; §5.2).
7. **Render** — background bands, objects, frog, HUD.

So within a frame: **collide (against the drawn positions) → move → render.** Never
reorder to move-then-collide.

---

## 8. Design decisions

Deliberate choices for this port (design calls, not fidelity claims):

| Decision | Ruling | Rationale |
|---|---|---|
| Collision method | **Span-overlap arithmetic**, ours | With real object instances, collision is a direct software span test — only the *rules* matter |
| Lane count | **5 road + 5 river** | The recognizable arcade shape |
| Screen layout | **Arcade** — score top, timer bottom | Matches the arcade art the port uses |
| Extra life | **Single, at a threshold** (tunable constant) | Arcade-like; trivial to retune |
| Difficulty ramp | **Speed-up + layout variation together** | The richer behavior |
| Frog states | one green frog set; **death = a 7-frame explosion** (`death_0…5 → skull`); the **lady-frog is the frog recoloured cyan** (`FROG_RECOLOR`) | The recolor is used for the lady-frog; death is the arcade explosion, not just a skull |
| Movement | **discrete one-cell hops**; river rows carry, road rows don't | Canonical Frogger feel |
| Scoring | **forward-progress-only** hop points (furthest-row gate) + home time bonus | Canonical; prevents farming |
| Randomness | **None — fully deterministic (no RNG)** | Classic Frogger is a fixed-pattern game (learnable, speedrunnable); all variety is fixed tables driven by frame-counter timers. Reproducible, faithful, simpler — never reach for `Math.random()` |
| Players | **Single-player only** | No two-player alternation. The HUD keeps the arcade `1-UP` score label, but there is no `2-UP` |
| Attract | **Title + high-score only — no demo** | No self-playing demo mode; the attract screen shows the title and the high score until Start |

---

## 9. Module / file layout

No build step; ES modules load directly in the browser. Entry points at the root,
everything else under `src/`:

```
frogger/
  index.html          boots ./main.js
  main.js             fixed-timestep pump + render
  src/
    game.js  mode.js  flow.js
    frog.js  lane.js  mover.js  playfield.js  collision.js  homes.js  timer.js  score.js
    renderer.js  sprites.js  hud.js  input.js  audio.js  constants.js
    modes/  attract.js  play.js  death.js  round_clear.js  game_over.js
  assets/  frogger_atlas.png  dat_sprites.js  dat_sfx.js
  demo/    sprite_viewer.html  sprite_viewer.js  sound_test.html  sound_test.js
  docs/    architecture.md
```

---

## 10. Modes — graph & construction

```
Attract ──start──▶ Play
   Play ──die──────▶ Death ──lives>0──▶ Play
                          └─lives=0───▶ GameOver ──▶ Attract
   Play ──5 homes filled─▶ RoundClear ──next level─▶ Play
```

`Flow` decides every transition centrally; modes hold no references to each other.
Each mode `enter`s, runs `update`/`render`, then `exit`s. The non-`Play` modes are
simple screens or timed interludes — what each shows and how it leaves:

| Mode | Renders | Leaves → when |
|---|---|---|
| **Attract** | title + `HI-SCORE` and the high score | **Start** pressed → `Play` (fresh game: score 0, lives reset, level 1) |
| **Play** | the live playfield + HUD (§4.1) | frog dies → `Death`; 5 homes filled → `RoundClear` |
| **Death** | the death explosion (`death_0…5 → skull`) at the frog's spot | after the animation → `Play` (lives remain) or `GameOver` |
| **RoundClear** | the playfield still runs (no input); the **laughing** frog (`frog_home_1`) fills the five bays one-by-one, over the level-complete music | when the music ends (`isPlaying`, §5.2) — or a fixed duration covering the sweep — → `Play` (next level, bays cleared) |
| **GameOver** | `GAME OVER` text over the field | after **~180 frames** → `Attract` |

Durations are constants; every transition fires on a **timer expiry or a fixed
input** — deterministic, no rolls. The exact on-screen layout of the Attract and
GameOver text is left to implementation (they are just centred monospace strings).
