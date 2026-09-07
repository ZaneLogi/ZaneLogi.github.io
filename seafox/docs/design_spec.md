# Seafox — Game Design & Implementation Specification

A complete, self-contained specification for a real-time submarine action game: its
rules, its simulation, its data formats and its conformance criteria.

**Status:** complete. All twenty chapters written — the contract, the substrate, the data
layer, the full simulation, the shell, and the verification oracles. Every constant,
table and rule the implementation needs is inlined.

**How to read this document:** it is the sole authority for the implementation. It
assumes no prior familiarity with the game — this chapter introduces it from nothing —
and no access to any other material. Every data table, enum value and constant the
implementation needs is inlined here or in this document's accompanying data files.
Every chapter is written; there are no stubs.

`docs/porting_decisions.md` records *why* the design is shaped this way. It is not
required reading to implement, and nothing here depends on it.

---

## Table of contents

**Part 0 — Contract**

1. [Scope & conformance contract](#1-scope--conformance-contract) ✅

**Part I — Substrate**

2. [Coordinates & timing](#2-coordinates--timing) ✅
3. [The two buffers](#3-the-two-buffers) ✅
4. [The entity list](#4-the-entity-list) ✅
5. [Randomness](#5-randomness) ✅

**Part II — Data**

6. [Sprite assets & the bake pipeline](#6-sprite-assets--the-bake-pipeline) ✅
7. [The type tables](#7-the-type-tables) ✅
8. [Difficulty](#8-difficulty) ✅

**Part III — Simulation**

9. [The tick](#9-the-tick) ✅
10. [Screen flow & the session state machine](#10-screen-flow--the-session-state-machine) ✅
11. [Round lifecycle & win/loss](#11-round-lifecycle--winloss) ✅
12. [The five spawners](#12-the-five-spawners) ✅
13. [The entity catalogue](#13-the-entity-catalogue) ✅
14. [Collision & responses](#14-collision--responses) ✅
15. [Effects](#15-effects) ✅
16. [Scoring, fuel & the supply chain](#16-scoring-fuel--the-supply-chain) ✅

**Part IV — Shell**

17. [Renderer](#17-renderer) ✅
18. [Audio](#18-audio) ✅
19. [Input & HUD](#19-input--hud) ✅

**Part V — Verification**

20. [Oracles](#20-oracles) ✅

---

# 1. Scope & conformance contract

## 1.1 Purpose and audience

This document specifies one game completely enough to build it twice and get the same
game both times.

It is written for someone implementing from scratch, with no other material open. Where
it states a number, that number is normative. Where it states a rule, an implementation
that produces different observable behaviour is wrong, not merely different.

It is not a description of any particular existing implementation, and it does not
assume the reader has seen one.

## 1.2 The game in brief

You pilot a submarine in a side-on view of a single screen of ocean. The surface runs
across the top; you move freely in the water below it, in all four directions, and you
cannot surface or reach the sea floor — your depth is bounded above and below.

**The objective of a mission is to sink ten merchant vessels.** They ride the surface
from left to right, in lanes your submarine **can never reach** — you are clamped to the
water well below them, and no manoeuvre closes that gap.

**Only the vertical torpedo, fired upward, can touch a target.** The horizontal torpedo
misses the surface lanes by a few pixels of clamp and cannot reach anything up there at
all; it exists to defend you, not to score. That division — one weapon that scores and
one that survives, and a set of targets you can shoot but never visit — is the shape of
the whole game.

The mission ends the moment the tenth merchant goes down, or the moment you die, or the
moment your tanks run dry.

Working against you:

- **Escorts.** A destroyer crosses the surface **right to left** — against the traffic —
  dropping depth charges that arc out and then sink toward your depth. An enemy
  submarine hunts you at your own level and carries both a torpedo and a magnetic mine;
  it is the only thing in the game that can enter from either side.
- **A hospital ship.** It crosses like a merchant, left to right, it is not a target, and
  torpedoes deflect off it rather than sinking it.
- **The avenger.** Under conditions given in Chapter 13, something arrives that cannot
  be destroyed, cannot be outrun and cannot be prevented.

Working for you:

- **Resupply.** A supply submarine crosses periodically carrying a payload escorted by a
  dolphin. Reaching the payload refills fuel and torpedoes together. A giant clam races
  you for it and takes it if it gets there first.

**The game is five missions long.** Clearing one advances you to the next, which is
harder in specified ways. You begin with three submarines and gain no more, ever.
Losing one — to a kill or to an empty tank — costs a submarine and replays the same
mission. Losing the last one ends the game.

**Clearing mission five ends the game too, and it is not celebrated.** There is no
victory screen; § 11 specifies exactly what the winning frame looks like, and it is
almost identical to the losing one. An implementation that adds a victory sequence is
wrong.

Between games the title screen runs a demo of the game playing itself, which is not a
recording and not a separate program — § 10.

## 1.3 The conformance contract

### Normative — simulation behaviour

An implementation must reproduce all of the following exactly. These are observable, and
changing any of them changes the game.

- **The entity model.** Thirty-two slots, a dense array, allocation by append and
  removal by swap-with-last. Walk order determines collision resolution order and the
  order in which slots are reused; both are observable. Chapter 4.
- **Two-phase removal.** Removal is requested on one tick and confirmed by the entity's
  own type handler. Collapsing the two phases leaks the population caps. Chapter 4.
- **Population counters per class, held separately from the live entity count**, each
  incremented at its spawn site and decremented by its own type's removal path.
  Chapter 4.
- **The per-entity update-rate divider.** Every entity carries a divider and is skipped
  entirely on ticks when its countdown has not expired. **Speed is step ÷ divider, never
  step**, and the two are specified at different points in this document for every
  entity. Reading one without the other yields a wrong answer that still looks
  plausible. Chapters 4 and 13.
- **The random number generator, bit-exact**, including its initial state, which is
  never reseeded. Every spawn interval, spawn depth, entity variant and the demo's
  auto-fire descends from it. Chapter 5.
- **Decimal scoring semantics.** Score is held and arithmetic is performed in
  binary-coded decimal; the sentinel and multiplier rules in Chapter 16 only mean
  anything in decimal.
- **Tick order.** Spawners run before the entity walk, so an entity created on a tick is
  walked and drawn on that same tick. Chapter 9.
- **One engine, two modes.** The title-screen demo and a live mission are the same loop
  with the same spawners, the same entity list and the same dispatch table. The
  difference is a single counter and the seven rules its zero value suspends.
  Chapter 10.
- **The three round-exit guards and the outro's classification of them**, including the
  order in which the outro tests them. Chapter 11.
- **The shared supply-chain state.** The escort and the clam derive their position from
  the payload's on every tick. That coupling is the resupply mechanic, not an
  optimisation. Chapter 16.
- **The dispatch model.** An entity's type byte resolves into two static tables —
  behaviour in one, data in the other. Chapter 7.
- **Collision geometry.** Broad phase, then an inclusive box test whose extents derive
  from the sprite's stored byte width, then a pixel-accurate confirm. Chapter 14.
- **The control seam and its two models.** All input reaches the simulation as one pair
  of per-axis velocities, each ∈ {−2, 0, +2}, written by exactly one source at a time.
  Keyboard control is **latched** — a direction persists until replaced, which is why
  there is a dedicated stop key. Analogue control is **hold-to-move** — both axes are
  written every tick, zero included. The two feel different and both are normative.
  Chapter 19.

### Normative — presentation

- **Screen geometry.** 280 × 192 pixels, with the fixed world-to-screen mapping of § 2.
- **Object colour.** Each object appears in the specific colour given for it in
  Chapter 6, drawn from the six-entry palette specified there. The ten merchant vessels
  occupy four distinct hues, and that distinction is normative — collapsing them is a
  conformance failure.
- **Sound content.** The eighteen sequences of Chapter 18, as exact (pitch, duration)
  pair lists, played one pair per tick through a queue that never pre-empts.

### Free

An implementation may choose these however it likes.

- Window size, scaling, filtering and aspect presentation.
- The rendering path, provided the pixel output matches.
- The wall-clock rate at which ticks are issued, provided it is fixed. Every "N ticks"
  quantity in this document is normative; its conversion to seconds is not.
- Audio device, buffer sizes and the synthesis path, provided pitches and durations
  match.
- Source layout, language idiom and naming.

### Not reproduced

The following exist in the original because of the machine it ran on. They are
deliberately absent, and their absence is specified rather than accidental.

- **Pre-shifted sprite storage.** Sprites occupy their true bounding box.
- **Coordinate lookup tables and sentinel-based clipping.** Placement is arithmetic and
  clipping is a rectangle test.
- **Page-flipping bookkeeping and the dirty-bit incremental redraw.**
- **The screen-pixel pre-filter ahead of collision**, which rejected candidates and
  affected nothing else.
- **Rate variation with population.** The original ran faster with more entities on
  screen; § 2.6 fixes the rate instead.
- **Colour as an artifact of pixel position.** Object colour is a property of the object,
  specified in Chapter 6.
- **Blocking audio.** Playing a sound costs no tick time.

Four consequences of the above are player-observable and accepted. They are listed in
`docs/porting_decisions.md`; an implementation is not required to reproduce them.

## 1.4 Where the line runs

The test throughout this document is **whether a player can observe it**.

Rules, quantities, timing, ordering and content are specified because a player
experiences them. Storage layout, draw strategy, and anything whose only effect is on
how fast the original's processor could finish a frame, are not.

The failure mode this guards against is admiring a mechanism and mistaking cleverness
for design. A packed multi-state flag byte becomes a state enum and a timer; an indirect
jump through a pointer table becomes a switch on the state it was dispatching. Behaviour
identical, shape ours.

## 1.5 Layer scope

Three layers, defined by **what may depend on what**. This is an architectural
constraint, not a directory layout — § 1.3 leaves source organisation free.

| layer | responsibility |
|---|---|
| **core** | the simulation: deterministic, integer-only, no I/O, no rendering, no floats |
| **presentation** | colour buffer, palette, sprite compositing, speaker synthesis |
| **platform** | window and canvas, input polling, audio device, wall clock |

**The rule, and the only normative part of this section: `core` depends on neither of
the other two.** Not by import, not by callback, not by reaching for a clock or a canvas
through a global. Dependencies run inward only — presentation and platform may read core
state; core may not know they exist.

The reason is checkability. A core that runs headless can be stepped against the oracles
of Chapter 20 — a known generator sequence, a fixed demo trajectory, exact spawn
cadences — which tests it against the specification. A core entangled with a renderer can
only be tested against the implementer's own reading of the specification, which is the
thing that most needs checking.

`core` owns the entity array, the effects allocator, the two per-type tables, the random
number generator, the spawners, collision resolution, the session state machine, the
stencil buffer (§ 3) and the sound *queue*. It does not own the colour buffer, the
canvas, a sample buffer or a clock. Note where the sound boundary falls: **the queue and
its discipline are simulation; the synthesis is not.**

### 1.5.1 How this project realises it

Not normative — this is one arrangement that satisfies the rule, and the one this
repository uses.

```
seafox/
  index.html          boots main.js
  main.js             wiring: hands platform and presentation to core
  src/
    core/             the simulation
    presentation/     colour buffer, palette, compositing, speaker synthesis
    platform/         canvas, input polling, audio device, clock
  assets/             generated by tools/, never hand-edited
  tools/              the generators
  demos/              standalone harnesses
  docs/               this document
```

Layers as subdirectories rather than as a naming convention, so that a dependency
violation appears as a wrong import path instead of requiring someone to notice it.

## 1.6 Determinism

The core is fully deterministic. Given an initial state and a sequence of per-tick
inputs, it produces one and only one sequence of states.

This requires:

- Integer arithmetic throughout. No floating point anywhere in `core/`.
- No wall-clock reads. The core advances only when handed a tick.
- No iteration over unordered collections. Every walk in this document has a specified
  order, and that order is normative.
- The generator of Chapter 5 as the sole source of randomness, never reseeded from a
  clock.

**Determinism is the foundation of the conformance oracles.** The whole game is
reproducible from cold boot until the first keypress, which is what makes the fixed
attract-demo trajectory of Chapter 20 a genuine test rather than an approximation.

## 1.7 Target platform

ES6 modules, loaded directly by the browser. No build step, no package manager, no
runtime dependencies — consistent with the rest of the repository this project sits in.

A single `index.html` at the project root boots `main.js`.

The first rendering path is a byte-per-pixel indexed buffer presented through a palette
lookup onto a 2D canvas. An indexed-texture GPU path is an optimisation that changes
nothing in this document — § 3 specifies the buffers so that both consume the same
state.

---

# 2. Coordinates & timing

## 2.1 Conventions

All positions, velocities and extents are **integers**. No quantity in this chapter or
any chapter it feeds is fractional, and no implementation of `core/` may introduce a
fractional one (§ 1.6).

- **X increases to the right, Y increases downward.** Row 0 is the top of the screen.
- A **tick** is one advance of the simulation. Every duration in this document is a tick
  count. Chapter 9 specifies what happens within one.
- An entity's **position is the top-left corner of its sprite**, not its centre.
- Notation: `[a, b]` is inclusive at both ends.

## 2.2 The screen

The display is **280 × 192 pixels**, fixed. There is no scrolling, no camera and no
level larger than the screen: the whole game happens on one screenful of ocean.

## 2.3 World coordinates

Entity X is a **16-bit world coordinate**; entity Y is the screen row directly.

```
screen_x = world_x − 28
screen_y = world_y
```

The 28-pixel offset gives objects room to exist off the left edge while approaching.

| world X | meaning |
|---|---|
| `[0, 27]` | off-screen left — drawable coordinates, nothing appears |
| `[28, 307]` | visible, mapping to screen columns `[0, 279]` |
| `≥ 308` | **not drawable** — an object here produces no pixels at all |

The `≥ 308` cutoff is normative, not an artifact of clipping arithmetic: one spawn in
the game deliberately places an object at 308 and relies on its first tick being
invisible (Chapter 13).

Clipping is an ordinary rectangle test against the 280 × 192 screen, applied per pixel.
An object may hang off any edge and draws only the part that lands inside.

## 2.4 Landmarks

| landmark | row | notes |
|---|---|---|
| **the waterline** | 38 | the sea surface. Repainted every tick (§ 3.5) |
| **the HUD line** | 185 | score, fuel and torpedo readouts (Chapter 19) |

Nothing in the game reaches the HUD line: the lowest object that exists is the supply
submarine, occupying rows 177–183.

### 2.4.1 The vertical map

The screen divides into a surface region above the waterline and a water region below
it, and **no object crosses between them except weapons**. This table is the whole
vertical geometry of the game, and several rules elsewhere in this document are
consequences of it rather than separate decisions.

**Read the column heading carefully.** A mover's Y *coordinate* is the top row of its
sprite, so its **occupied band runs `height − 1` rows further down** than its clamp
suggests. The two are given separately here because confusing them produces exactly the
wrong answer about which objects can meet.

| Y coordinate | height | rows occupied | occupant | direction |
|---|---:|---|---|---|
| 10 | 7 | 10–16 | merchant ships — the targets | → left to right |
| 20 | 7 | 20–26 | hospital ship | → left to right |
| 30 | 7 | 30–36 | Destroyer | ← right to left |
| **38** | 1 | **38** | **the waterline**, full width (§ 3.5) | — |
| 42–171 | 3 | 42–173 | enemy torpedo | ← right to left |
| 43–170 | 7 | 43–176 | enemy submarine | either side |
| 45–178 | 3 | 45–180 | horizontal torpedo | — |
| 46–175 | 6 | 46–180 | magnetic mine | homes on the player |
| **50–175** | **6** | **50–180** | **the player** | — |
| 50–175 | 5 | 50–179 | the payload | — |
| 50–175 | 6 | 50–180 | vertical torpedo | rises |
| 50–175 | 7 | 50–181 | the avenger | → left to right |
| 177 | 7 | 177–183 | supply submarine | → left to right |
| 185 | — | 185 | the HUD | — |

Heights are the sprite heights of § 6.6. Every entity's exit is given in § 13.11.

**The player's ceiling of row 50 is twelve rows below the waterline and thirty-four
below the lowest target lane.** The three surface classes are therefore unreachable by
the submarine itself, and — because the horizontal torpedo stops at row 45 — reachable
by exactly one weapon in the game. § 1.2 states what that means for play; Chapter 13
specifies the clamps that produce it.

### 2.4.2 The one overlap at the bottom of the map

The player's occupied band reaches row 180, and the supply submarine sits at 177–183.
**They overlap by up to four rows**, for any player Y in 172–175, and the supply
submarine crosses the full width — so the two meet routinely.

**This is intended and is harmless.** The contact is detected normally and dispatches to
both parties, and both independently decline to do damage: the player's response
exempts the supply submarine, and the supply submarine's response exempts the player.
The two pass through one another.

The whole resupply convoy behaves this way. The supply submarine, the dolphin and the
Giant Clam are all harmless to the player; the payload is not exempt but triggers the
refuel rather than damage. **Nothing in the convoy can kill you** — Chapter 14 gives the
full response tables.

## 2.5 Player bounds

The player is clamped on both axes, and **whichever clamp is hit zeroes that axis's
velocity** — the sub stops against a wall rather than sliding along it.

| bound | value | notes |
|---|---|---|
| min X | 28 | the left screen edge. Relaxed to **0** during the mission fly-in (§ 11) |
| max X | 280 | Raised to **306** during the outro, which is how the sub leaves (§ 11) |
| min Y | 50 | twelve rows below the waterline — the player can never reach the surface |
| max Y | 175 | ten rows above the HUD line |

**The clamps are strict inequalities.** A step that would carry the sub *past* a bound
is the one that clamps and zeroes the axis; a step that lands *exactly on* a bound does
neither, and the sub carries on until the following update takes it past. The difference
is observable and Chapter 20's demo-trajectory oracle is what pins it down — testing
`≥` instead of `>` moves the demo's horizontal bounces to 254 / 506 / 758 against
§ 20.4's 256 / 510 / 764.

**The player's X is always even.** It spawns at 100 and every X step is ±2, so parity is
preserved for the life of the sub. This is normative because Chapter 13 has an object
that spawns at a fixed offset from the player and depends on the resulting parity.

## 2.6 The tick

**The simulation advances at a fixed rate.** § 1.3 makes the wall-clock rate free and
the tick counts normative; this section fixes a default.

**Default: 30 Hz.**

This is not arbitrary. Derived durations land where the design clearly intends them at
30 Hz and nowhere else:

| quantity | ticks | at 30 Hz |
|---|---:|---|
| a destroyer crossing the screen | ~770 | 25.7 s |
| fuel endurance, a full tank untouched | 2160 | 72 s |
| a merchant ship crossing the screen | ~1075 | 36 s |
| the player's death sound | 32 | 1.1 s |

An implementation may choose another rate. It may not choose a *varying* one: the
original's rate rose with the number of live entities, which is not reproduced (§ 1.3),
and a variable-rate implementation makes every duration above meaningless.

## 2.7 The update-rate divider

**This is the speed system, and it is the single easiest thing in this document to
implement wrongly.** Read this section together with every velocity in Chapter 13; a
velocity without its divider is not a speed.

Every entity carries two values:

| field | meaning |
|---|---|
| `updateCountdown` | ticks remaining until this entity's next update |
| `updatePeriod` | the value the countdown reloads to |

In the entity walk (Chapter 9), each entity's countdown is decremented. **If the result
is non-zero, the entity is skipped entirely for that tick** — no movement, no handler,
no animation advance, no collision test. When it reaches zero the entity's handler runs,
and the handler reloads the countdown from `updatePeriod` before returning.

So an entity with `updatePeriod = 7` acts on one tick in seven.

### 2.7.1 The periods

| period | entities |
|---:|---|
| 1 | enemy submarine · supply submarine · **enemy torpedo** · depth charge · payload · dolphin · Giant Clam · avenger · vertical torpedo |
| 2 | **the player** · horizontal torpedo |
| 3 | hospital ship |
| 4 | **any entity playing a death animation**, whatever its type |
| 5 | Destroyer |
| 7 | merchant ship |
| 9 | **the magnetic mine**, while the player is alive |
| 32 | a merchant ship's floating score value, during its final animation frame only |

Two of these invite specific mistakes:

- **The magnetic mine's period is 9, not 1** — it is the slowest-moving object in the
  game while it is hunting. It drops to **1** only once the player is already dead, at
  which point it abandons homing and runs straight; so the mine becomes nine times
  faster at the moment it stops mattering. A mine that steps every tick during play is
  nine times too fast, and turns the slowest threat in the game into one of the quickest.
- **Period 32 is not the death-animation rate.** Death frames advance on period 4. The
  32 governs how long a merchant ship's floating score value lingers on screen before
  it is removed.

**The mine and the enemy torpedo are easy to transpose**, because the enemy submarine
launches both, their spawn code sits back to back, and each carries the other's
plausible-looking numbers. The mine is the slow homing one (period 9, step 2); the
torpedo is the fast blind one (period 1, step 3). Take each type's numbers from its own
entry in Chapter 13, identified by type number, never by reading adjacent code.

### 2.7.2 Resolved speeds

**Every speed in the game is a step divided by a period**, and the two are specified in
different chapters. This table is the resolved result and is normative; where Chapter 13
gives a step, this table gives what it means.

| entity | step | period | px / tick |
|---|---:|---:|---:|
| magnetic mine, hunting | 2 | 9 | **0.22** |
| magnetic mine, after the player dies | 2 | 1 | 2.00 |
| merchant ship | 2 | 7 | **0.29** |
| Destroyer | 2 | 5 | 0.40 |
| hospital ship | 2 | 3 | 0.67 |
| player | 2 | 2 | 1.00 |
| **vertical torpedo** | **1** | 1 | **1.00** — upward; the only step of 1 in the game |
| horizontal torpedo | 4 | 2 | **2.00** |
| enemy submarine · supply submarine · payload · dolphin · depth charge | 2 | 1 | 2.00 |
| enemy torpedo | 3 | 1 | 3.00 |
| avenger | 4 | 1 | 4.00 |
| Giant Clam | 5 | 1 | **5.00** |

The horizontal torpedo is the trap: it carries the largest step of any weapon and is
still slower than the enemy torpedo, because its period halves it.

The shape of the table is the design. Surface traffic is the slowest thing on screen
because it is cargo, not threat; the three fastest objects in the game are all
consequences of something the player did.

### 2.7.3 The player's period is load-bearing

The player acts every **second** tick, and the clamps of § 2.5 live inside the player's
handler — so a clamp is applied every second tick too, not every tick.

The title-screen demo drives the player by watching for a clamped (zeroed) velocity and
reversing it (Chapter 10). That test runs **every** tick while the clamp that feeds it
runs every second tick, which puts the demo's entire cadence at twice what a
move-every-tick model predicts. Chapter 20's demo-trajectory oracle detects exactly this
mistake.

## 2.8 Normative and free — summary

**Normative:** the 280 × 192 screen · the world-to-screen mapping and the `≥ 308`
cutoff · the waterline and HUD rows · the player clamps and the stop-on-clamp rule ·
player X parity · every tick count in this document · the divider mechanism · every
period in § 2.7.1 · every resolved speed in § 2.7.2.

**Free:** the wall-clock tick rate, provided it is fixed · window size and scaling ·
how clipping is implemented.

---

# 3. The two buffers

## 3.1 The model

Rendering and collision read two separate byte-per-pixel buffers, both 280 × 192.

| buffer | cell contents | owner | read by |
|---|---|---|---|
| `color` | palette index, § 3.4 | `presentation/` | the display path only |
| `stencil` | `0` empty · `1…32` occupying entity's slot + 1 | **`core/`** | collision, Chapter 14 |

They are written from **different halves of the same sprite** and their footprints are
not the same shape:

- `stencil` is written from the sprite's **ink mask** — the true pixel silhouette.
- `color` is written from the sprite's **colour bitmap**, which shares the ink's
  bounding box but is not the same shape inside it: a chroma cell fills the gaps
  **between** isolated pixels, so colour appears where ink is 0 (§ 6.3 specifies why).

**Collision uses the ink. The display uses the colour.** Using either for the other's
job is a conformance failure, and a quiet one — the game remains playable and hitboxes
are wrong by a pixel.

## 3.2 Why the stencil carries identity

Collision needs to ask *"does this object's silhouette touch anything that is not
itself?"*. A buffer that records only whether a pixel is occupied cannot answer that,
because the subject is in the buffer too.

Recording the occupying slot answers it directly, as a read-only test:

```
touching = ∃ p ∈ subject footprint :  ink[p]  ∧  stencil[p] ∉ { 0, subjectSlot }
```

No erase, no redraw, no mutation of any buffer. Chapter 14 specifies the surrounding
sweep.

## 3.3 Maintenance

**`stencil` is maintained incrementally, inside the entity walk.** When an entity's
handler runs (i.e. on the ticks its divider permits, § 2.7), that entity's previous
footprint is cleared to `0` and its new footprint written with its slot + 1.

An entity skipped by its divider is **not** rewritten and **remains in the stencil at
its existing position**. This is required, not incidental: a skipped entity is still
physically present and still collidable.

**Do not rebuild the whole stencil at the top of a tick.** Rebuilding places entities
later in the walk at their new positions when earlier entities test against them,
shifting every contact by up to one step per entity. The incremental discipline
reproduces the intended ordering, in which entities later in the walk are still at
their previous positions.

**The confirm runs between the clear and the write, and the order is not negotiable.**
Within one entity's turn the sequence is: clear its old footprint · run its handler ·
**run its collision** · write its new footprint. Writing before the confirm leaves every
pixel of the subject's own footprint holding the subject's own id, so § 3.2's test —
which asks for an id that is neither `0` nor the subject's — is false by construction and
**nothing in the game can ever collide**. The failure is silent: the game runs, animates
and looks correct.

**A swap-with-last must carry the moved entity's footprint with it.** § 4.6 moves the
last entity into a freed slot, and this buffer stores *slot + 1*, so that entity's
footprint is left holding its old id. Both halves then break — the moved entity reads its
own pixels as foreign and confirms a contact against itself, and whichever entity now
holds the stale id reads those pixels as its own. Re-write the footprint under the new id
as part of the swap. § 20.6's stencil invariant is what catches this.

**A response that moves an entity must carry its footprint too.** A collision response
runs inside whatever entity the walk is currently on (§ 14.4 dispatches both sides), so a
handler can relocate the *other* party long after that party's own clear-and-write for
this tick has finished — or before its turn has come at all. Its next clear then blanks
the new position and strands the old pixels under its id, permanently. Only one response
in the game does this — the hospital ship's deflection (§ 13.6.2), which moves the shot
and swaps its sprite — and the rule is the same as for the swap and for § 7.4.2's death
re-anchor: clear the old footprint first, while the record still says where those pixels
are and which bitmap drew them, then move, then write. § 20.6's stencil invariant is what
catches this too.

Clearing is masked by the sprite's ink, not by its bounding box. Two overlapping
entities therefore behave as follows: the later writer owns the shared pixels in
`stencil`, and when it moves away it clears only what it wrote — which can leave the
earlier entity's shared pixels cleared until that entity next redraws. Chapter 14
specifies why this is harmless for the collision test as defined.

**"Clears only what it wrote" is a test on the buffer, not a figure of speech.** An
entity clearing its footprint must write `0` only where the buffer already holds *its
own* id. Blanking every pixel under its ink instead erases whatever else occupies the
overlap — which is precisely the other party to a contact, removed from the buffer at the
one moment it matters. The two entities then pass through each other while touching, and
nothing anywhere reports a problem.

## 3.4 The palette

Six entries. Index 0 is the background and is the only transparent value in a sprite's
colour bitmap.

| index | name | RGB | used by |
|---:|---|---|---|
| 0 | background | `#000000` | open water, and transparency in sprites |
| 1 | violet | `#D030D0` | |
| 2 | green | `#30D030` | |
| 3 | blue | `#3060F0` | |
| 4 | orange | `#F08020` | |
| 5 | white | `#FFFFFF` | most objects; all text and HUD |

Indices 1–4 form two pairs — violet/green and blue/orange — and Chapter 6 specifies
which objects take which. The four hues are what distinguish the ten merchant vessels
from one another (§ 1.3), so the palette is normative in its *distinctions*; the exact
RGB values above are reference values an implementation may tune for its display.

## 3.5 Scenery — the waterline

The waterline is the sea surface, and it is the only scenery in the game.

| | |
|---|---|
| row | **38**, and only 38 — it is **one pixel tall** |
| extent | the full width, screen columns 0–279 |
| colour | **blue** (palette index 3) |
| appearance | a solid, continuous line |

**Its source form is dotted, and it renders solid.** The stored pattern lights every
even column and no odd one — 140 lit pixels across the 280. Every one of those is an
isolated lit pixel, so the bake of § 6.3 gives each a two-pixel chroma cell, the gaps
fill, and the row reads as one unbroken blue line. This is the clearest instance of the
rule § 6.3 states in the abstract, and an implementation that renders the dots literally
will produce a visibly wrong surface.

**It is redrawn in full every tick**, before entities are composited. The original
refreshed only a tenth of the row per tick on a rotating cursor, which left a visible
gap wherever something had crossed the surface until the cursor came back round; that
gap is an artifact of incremental repair and is not reproduced (§ 1.3).

**It is not written into `stencil`.** It is decoration, not an object, and it cannot
register as contact — § 1.3 lists this among the deliberate differences. Slot value
`255` is reserved for scenery should a later chapter need collidable terrain; nothing
uses it.

The HUD (Chapter 19) likewise writes `color` only.

## 3.6 Presentation

`color` reaches the display through a palette lookup, once per rendered frame. Nothing
in `core/` reads it, and nothing outside `presentation/` writes it.

The buffers are specified separately precisely so that swapping the display path — a 2D
canvas today, an indexed texture uploaded to the GPU later — changes nothing else.
`color` is already the exact texture an indexed-texture path wants.

## 3.7 Normative and free — summary

**Normative:** the ink/colour split and which drives collision · the stencil's identity
semantics and the touching test of § 3.2 · incremental maintenance and the
skipped-entity rule · scenery's absence from the stencil · the six palette entries as
distinct colours.

**Free:** buffer storage layout · the display path · exact RGB values · whether `color`
is double-buffered.

---

# 4. The entity list

## 4.1 The array

Everything that moves is a slot in one array of **32 entities**. It is dense: live
entities occupy `[0, liveCount)` with no holes and no tombstones.

A slot **is** an index. There is no handle, no generation counter and no free list.
Chapter 15 specifies a second, separate allocator for visual effects, which shares this
discipline but not this array.

## 4.2 The record

Each entity carries two groups of fields. They are specified separately because the
second group's meaning depends on the entity's type.

**Identity and position** — the same for every type:

| field | meaning |
|---|---|
| `type` | 0–20, selecting both tables of Chapter 7 |
| `sprite` | the sprite currently being drawn |
| `x` | 16-bit world X (§ 2.3) |
| `y` | screen row |
| `flags` | § 4.3 |
| `updateCountdown` | § 2.7 |

**Per-type state** — only three fields mean the same thing for every type:

| field | meaning |
|---|---|
| `updatePeriod` | the countdown's reload value (§ 2.7) |
| `animFrame` | current animation frame |
| `animLastFrame` | final animation frame |
| *four further fields* | scratch, defined per type in Chapter 13 |

**The four scratch fields do not mean the same thing for different types, and reading
them as though they did produces speeds that are wrong by an order of magnitude.** Most
moving types keep their step in the first scratch field; the Destroyer does not — that
field holds an unrelated cadence for it, and its step of 2 sits in the next one along.
Take every scratch field's meaning from the type's own entry in Chapter 13, never from
another type's.

**The entity record has no velocity field.** Motion is decided fresh each update by the
handler the type dispatches to. This is the structural difference between an entity and
an effect (Chapter 15), whose record *is* a velocity and which therefore needs no
dispatch at all.

## 4.3 Flags

| flag | meaning |
|---|---|
| `stateChangePending` | a transition is due: play the type's sound, emit debris, begin the death animation |
| `dying` | playing a death animation — **skip the handler and skip collision response** |
| `removalRequested` | § 4.5 |
| `removalConfirmed` | § 4.5 |
| `active` | set at every creation |
| `paletteFlip` | selects which colour pair this entity draws in (Chapter 6) |

## 4.4 Allocation

Allocation is an **append**:

```
slot = liveCount
liveCount += 1
```

There is **no bounds check** and no failure path. Overflow is prevented upstream, by the
per-class caps of § 4.7 — and § 4.7.1 records how little margin that leaves.

## 4.5 Removal is two-phase

Removal takes two updates of the entity being removed.

1. **Requested.** Anything may set `removalRequested` — a collision response, a finished
   animation, leaving the screen.
2. **Confirmed.** On its next update the entity's *own type handler* sees the request,
   clears it, sets `removalConfirmed`, and performs whatever bookkeeping its type owns —
   above all, decrementing its class counter (§ 4.7).
3. The walk then frees the slot (§ 4.6).

**Collapsing these two phases leaks the population caps.** Only a type's own handler
knows which class counter to decrement, so a slot freed in the same step that requested
it is recycled while its class still counts it as live. The class fills up permanently
and that entity stops spawning for the rest of the session.

This is also why the player's death is **one tick late**: a lethal collision only raises
the request, and the player's own handler is what clears the alive flag the session loop
watches (Chapter 11).

## 4.6 Freeing a slot: swap-with-last, mid-walk

Freeing happens inside the entity walk, and the order is exact:

```
erase the entity's footprint from stencil
liveCount −= 1
if the freed slot was not the last:
    copy the entity now at liveCount into the freed slot
DO NOT advance the walk cursor
```

**The cursor must not advance**, and that holds whether or not a swap happened — which
is why the rule sits outside the branch above, and why § 9.4's `SETTLE` states it
unconditionally. Where a swap happened, the hole has been filled by the entity that
was last, which this tick has not yet processed, so advancing skips it. Where the
freed slot **was** the last, `liveCount` has just been decremented to the cursor's own
value, so the walk ends on its next test; advancing there instead puts the cursor one
past a count that only shrinks, and the walk then reads cleared slots as live entities.
Every other path through the walk advances the cursor normally.

This is the remove-while-iterating idiom, and it is what keeps the array dense with no
tombstones. It is also observable: it changes the order in which subsequent entities are
walked, which changes collision resolution order (Chapter 14) and the order slots are
reused.

## 4.7 Admission control is per class

Since the append itself is unchecked, population is bounded per class instead. Each
capped class holds a live count and a cap; the count is incremented at the spawn site
and decremented in that type's own removal path (§ 4.5).

| class | capped | class | capped |
|---|---|---|---|
| enemy submarine | ✅ | Destroyer | ✅ |
| magnetic mine | ✅ | depth charge | ✅ |
| hospital ship | ✅ | enemy torpedo | ✅ |
| merchant ship | ✅ | vertical torpedo | ✅ **cap = 1** |
| | | horizontal torpedo | ✅ **cap = 1** |

The two torpedo caps of 1 are why only one shot of each kind can be in flight — that is
the weapon's rate of fire, expressed as a population limit rather than a cooldown.

The other seven caps are the difficulty ladder; Chapter 8 gives their values per
mission.

**Six creation sites carry no cap at all:** the player, the supply submarine (bounded by
a timer instead), the payload, the dolphin, the Giant Clam, and the avenger.

### 4.7.1 The margin is zero, and that is worth knowing

**The supply chain** is the resupply convoy: the four uncapped classes that arrive
together and depend on one another.

| | class | role |
|---:|---|---|
| 1 | supply submarine | carries the convoy across the screen |
| 2 | payload | the cargo — reaching it refills fuel and torpedoes |
| 3 | dolphin | the escort, positioned relative to the payload every tick |
| 4 | Giant Clam | races the player for the payload |

At most one of each exists at a time, so the convoy occupies **four** slots. Nothing
enforces that — the supply submarine is bounded by a reload timer long enough that one
has always left before the next arrives, and the other three are created by the convoy
itself, one apiece. Chapter 16 specifies the chain.

At the hardest mission the caps then sum exactly to the array:

```
  25   the seven per-class caps at their mission-5 values (Chapter 8)
+  2   the two torpedo caps, 1 each
+  1   the player
+  4   the supply chain
─────
   32   = the array size
```

— and the avenger sits outside that arithmetic entirely, created one per triggering
event with no bound anywhere (Chapter 13).

**No overflow is demonstrated, and reaching every cap simultaneously with a full supply
chain on screen is unlikely in play.** An implementation should nonetheless treat the
array as fragile rather than safe: nothing enforces the sum. Writing slot 32 is
undefined behaviour in this specification. An implementation may drop the allocation
instead; it must not grow the array, because array size determines the caps' meaning.

## 4.8 Reset discipline

Between rounds and between missions, all of the following are cleared **together**:

- every live entity, erased from `stencil` and removed
- every live effect (Chapter 15)
- `liveCount`
- the effect count
- **all seven class counters**

Clearing the list without clearing the counters, or the reverse, lets a counter drift
permanently out of step with the array — the same failure as collapsing two-phase
removal, arriving by a different route.

## 4.9 Normative and free — summary

**Normative:** 32 slots · density and the absence of tombstones · append allocation ·
two-phase removal and the reason for it · swap-with-last and the non-advancing cursor ·
per-class caps and the two torpedo caps of 1 · the six uncapped creation sites · the
joint reset.

**Free:** field storage layout and naming · whether the four record groups are one array
of structs or several parallel arrays · how the stencil footprint is tracked for erasure.

---

# 5. Randomness

## 5.1 One generator, never reseeded

There is exactly **one** source of randomness in the game. There is no clock entropy, no
input-timing entropy and no second generator. Every random decision listed in § 5.5
comes from here.

**It is never reseeded** — not at power-on beyond its shipped value, not between rounds,
not between missions, not between games. It runs continuously for the life of the
process.

This is what makes the whole game reproducible from a cold start (§ 1.6), and it is what
Chapter 20's oracles depend on.

## 5.2 State and step

The generator holds **three bytes**, `s1`, `s2`, `s3`. Only `s2` and `s3` are recurrent:
`s1` is recomputed from the other two on every step and never influences the next one.
An implementation may store two bytes and derive the third.

```
step(s1, s2, s3):
    carry = s3 & 1
    s1    = ((carry << 7) | (s2 >> 1)) & 0xFF     # s2 shifted right, s3's low bit in at the top
    low   = s2 & 1
    s2    = low ^ s2                              # clears bit 0
    s3    = s1  ^ s3
    s2    = s3  ^ s2
    return s1, s2, s3
```

**Consumers step the generator, then read `s2`.** Where a consumer wants fewer bits it
masks `s2`; § 5.5 gives the specific uses.

## 5.3 Initial state

| byte | value |
|---|---|
| `s1` | `0xA0` |
| `s2` | `0xC6` |
| `s3` | `0x57` |

## 5.4 Properties

These are stated because they are checkable, and Chapter 20 checks them. All were
confirmed by exhaustive enumeration of the 65536-state space.

- **Fifteen live bits**, not sixteen: bits 1–7 of `s2` plus all eight of `s3`. Bit 0 of
  `s2` is rewritten every step and is readable by consumers, but carries nothing
  forward — two states differing only in that bit have the same successor.
- **The step map is exactly 2-to-1.** In-degree histogram over all 65536 states:
  `{0: 32768, 2: 32768}`. It is not a bijection.
- **The image after one step is exactly 32768 = 2¹⁵.** After a single step the state is
  inside the 15-bit image permanently.
- **Two cycles exist:** the fixed point at zero, and one cycle of length
  **32767 = 2¹⁵ − 1**. The remaining 32768 states are transient, funnelling in through
  the 2-to-1 collapse — which is why the cycle lengths do not sum to 65536.
- **From the shipped state the period is 32767.**
- **The generator cannot reach zero.** Not because no state steps to zero — one does —
  but because that state has in-degree 0 and is absent from the image, so it is
  unreachable after the first step.

## 5.5 Test vector

Starting from the initial state of § 5.3, the first twelve values of `s2` observed by a
consumer that steps and then reads are:

```
0x72  0xFF  0x8C  0xB8  0xD0  0xD0  0xB8  0x8C  0xFE  0xF3  0x06  0xF1
```

An implementation that reproduces this sequence, and a period of 32767, has the
generator right. One that does not has every spawn interval in the game wrong in a way
no amount of play-testing will localise.

## 5.6 Consumers

Eleven sites draw from the generator. They are specified in their own chapters; listed
here so that the *order* of draws — which is itself normative, because the generator is
shared — can be checked in one place.

| consumer | chapter | drawn |
|---|---|---|
| the title-screen demo's auto-fire, 1 in 64 | 10 | every tick |
| enemy submarine variant | 12 | **missions 1–2 only** |
| enemy submarine shallow/deep mask, then its depth | 12 | every spawn |
| the five spawn cooldowns | 12 | per reload |
| **the supply submarine's payload-release countdown** | 13 | **every spawn** |
| the Giant Clam's release delay | 13 | **only once the resupply counter reaches 3** |
| the depth charge's arc direction and wander period | 13 | per drop |

Three of those are conditional, and each is a place an implementation can silently
consume the generator at a different rate:

- The **entry-side draw is taken only on missions 1 and 2.** Missions 3–5 and the title
  screen are right-only (§ 8.4) and take no draw at all.
- The **clam's release delay draws nothing while the resupply counter is under its
  threshold** — that branch uses a fixed 255 (§ 13.8.3).
- The **supply submarine's release countdown** is drawn at every one of its spawns.

**Draw order matters.** Two implementations that draw the same quantities in a different
order produce different games from the same initial state. Where a chapter specifies
several draws, it specifies them in order.

## 5.7 Normative and free — summary

**Normative:** the step function · the initial state · never reseeding · the fifteen live
bits · the period · the set of consumers and the order in which they draw.

**Free:** whether the state is stored as two bytes or three · integer width used
internally, provided results are identical.

---

# 6. Sprite assets & the bake pipeline

## 6.1 Two representations

Every drawable object exists in two forms, and the distinction is the one Chapter 3
depends on:

| form | what it is | drives |
|---|---|---|
| **ink** | the silhouette: one byte per pixel, 0 or 1 | collision, and `stencil` |
| **colour** | palette indices, one byte per pixel | `color`, and nothing else |

They are generated together, from the same source bitmap, by the bake of § 6.3.

**Both are one byte per pixel. Neither is packed.** `ink` carries one bit of *meaning*
per pixel, not one bit of storage — the distinction matters, because packed storage is
what forces sprites to be pre-shifted.

**Drawing and moving therefore involve no bit manipulation of any kind.** A sprite at
any X is a byte copy at a byte offset; moving an entity is clearing its previous
footprint from `stencil` and writing its new one. There is no alignment case, no shift,
and no per-position sprite variant. The original needed all three because seven pixels
shared a byte there, which made any X not a multiple of seven require rotating the whole
sprite through a carry chain — § 1.3 lists that machinery under *not reproduced*, and
this is where the saving is collected.

Packing `ink` into a bitmask would be a regression rather than an optimisation: it buys
a cheaper test in the collision confirm and reinstates the alignment shift on every draw
and every move.

**`ink` cannot be recovered from `color`.** Every ink pixel has a non-zero colour, but
not every non-zero colour pixel is ink — § 6.3's chroma cell reaches one pixel right of
an isolated pixel, filling the gaps in an alternating fill. Treating `color != 0` as the
silhouette makes every such gap solid for collision purposes: a `#.#` row that is two
pixels of ink becomes a three-pixel bar.

## 6.2 The runtime asset

Each sprite is delivered to the runtime as:

| field | meaning |
|---|---|
| `w`, `h` | dimensions of the stripped bitmap, in pixels |
| `byteWidth` | **the source block's width in bytes**, retained — § 6.4 |
| `ink` | `w × h` bytes, 0 or 1 |
| `color` | `w × h` palette indices — the same box as `ink`, § 6.3 |

Assets are generated by `tools/` and are never hand-edited (§ 1.5).

## 6.3 The bake

Source bitmaps are 1 bit per pixel, packed **seven pixels to a byte, lowest bit
leftmost**. Each source byte additionally carries a **palette bit** covering all seven of
its pixels, so a single sprite may contain more than one palette region.

The bake takes a source block plus two parameters:

| parameter | meaning |
|---|---|
| `phase` | parity of the screen column the block's leftmost pixel lands on — 0 even, 1 odd |
| `flip` | the object's palette flip, XORed into every source byte's palette bit |

Colour is then selected per pixel from the palette of § 3.4:

| palette bit | even column | odd column |
|---:|---|---|
| 0 | violet | green |
| 1 | blue | orange |

where "column" means `(phase + i) & 1` for pixel `i` within the block — absolute screen
parity, not position within the sprite.

**The colour bitmap is produced in two passes, in this order:**

1. **Chroma.** For each lit pixel whose left and right neighbours are both unlit, write
   its selected colour at its own column **and** at the column to its right, if that
   column is unlit **and a lit pixel lies further right on the same row**. This
   two-pixel cell is why an every-other-pixel fill reads as solid colour rather than as
   stripes; the trailing condition is what keeps it inside the ink (§ 6.3.1).
2. **White.** For each lit pixel with at least one lit neighbour, write white at its own
   column, overwriting anything the chroma pass put there.

So runs of two or more adjacent pixels are white, isolated pixels are coloured, and
white wins wherever the two meet.

`ink` is simply the lit pixels, stripped to their bounding box.

### 6.3.1 Why the chroma cell is clipped to the row's ink

**A colour cell is two dots wide and straddles its dot** — measured against a signal
model of the composite path, an isolated pixel reads at full brightness on its own
column and roughly two-thirds on the one to its right. No integer grid holds a cell
whose edges fall half a dot outside the pixel, so the bake has to round it somewhere,
and every choice is a different way to be wrong:

| rule | `#.#` renders | rendered box vs the bitmap |
|---|---|---|
| cell rounded wholly right | 4 solid columns | one column wide on 293 of 505 ink rows |
| cell dropped | 2 columns with a hole | exact, but the gaps the hardware fills go black |
| **cell clipped to the row's ink** | **3 solid columns** | **exact on every row** |

**The third is normative.** It keeps the half of the rule that carries the picture —
gaps between isolated pixels fill, so an alternating fill reads solid and the text
strips stay legible — while the rendered bounding box equals the bitmap's on every row
of every block. Rounding wholly right widens the sprite wherever a row's last lit pixel
is isolated; the **vertical torpedoes** are the case that decides it, since their rows
alternate `#.#` and `###` and would render 4 columns against 3, leaving the shaft
visibly ragged.

**What clipping gives up** is the one place the other rule was closer: a lit pixel
standing alone on its row, with nothing further right, keeps one column instead of two.
That is the death-burst dot and spark particles, and the last pixel of a strip row.

`colorWidth` is therefore **always `w`**. It is retained as a field rather than folded
into `w` because ink and colour remain separately-shaped ideas — the same box, filled
differently.

## 6.4 `byteWidth` is retained on purpose

Collision box extents derive from the sprite's **byte** width, not its pixel width
(Chapter 14). Source blocks reserve at least six blank columns at their right edge as
working space, and the byte-width derivation is how the original sized its boxes to the
ink rather than to the padded storage.

The bake strips that padding. **Boxes must still be computed from the retained
`byteWidth`.** Recomputing them from the stripped bitmap yields boxes that are equal or
tighter — never looser — producing a game whose weapons miss slightly more often than
they should, with no symptom that points at the cause.

## 6.5 Colour assignment

**Each object is baked at the specific `phase` and `flip` its creation site gives it.**
Object colour is therefore a property of the asset, settled before the game runs. **One
object escapes this and is decided at draw time** — the death-burst debris, § 15.4 — and
it is the only one.

Most objects need one variant, and two observations explain why that holds even where an
object's parity changes during play:

- **Objects drawn as pure white** — those whose artwork contains no isolated lit pixel —
  have no colour to select, so `phase` is irrelevant to them. Several objects that move
  by odd steps fall in this group, which is why their motion is free to change parity.
- **The depth charge is the sharpest instance of that**, because it looks like the
  exception and is not. Its arc takes a single odd step near the end, so its parity does
  change mid-life — but the arcing bitmap is a solid pair that renders white at either
  parity, and the sinking bitmap it swaps to is only ever drawn after that step. **One
  variant each.** The artwork is built so the parity change costs nothing, which is the
  same trick as the group above, applied to the one object whose motion demanded it.

**One case genuinely needs more:**

- **The merchant vessels** are ten roster records over seven distinct bitmaps, and each
  record fixes both a spawn column parity and a palette flip. The result is ten objects
  in **four** distinct hues, which § 1.3 makes normative. They bake as ten variants;
  Chapter 12 gives the roster.

**The death frames are the exception to "creation site":** they have none, and take their
pair from the death sequence instead. `flip` is **1** for every death frame and for the
floating score, and `phase` is the parity § 7.4.1's frame table forces — even for the
sinking-ship frames, odd for the burst, the column and the score. One variant each, and a
wreck's colour never depends on what died.

**The effects of Chapter 15 are the other place the creation site is not the whole
story**, because that system forces no parity of its own. The dot and the streak still
bake per parity and their creator still picks; the debris cannot, and § 15.4 gives the
rule for it.

## 6.6 The sprite inventory

**Nothing in this game has an idle or cycling animation.** Every entity is a static
bitmap for its entire life. An implementation needs no animation system for live
entities — only the death sequence of § 7.4.1 plays a sequence of sprites, and it is
shared by every type.

There are exactly **five** in-life sprite changes in the whole game, and each is a
one-shot state change rather than a cycle:

| # | change | when |
|---:|---|---|
| 1 | vertical torpedo: rising → **descending** | deflected by a hospital ship (§ 13.6.2) |
| 2 | Giant Clam: open shell → **closed** | on eating the payload (§ 13.8.3) |
| 3 | depth charge: arcing → **sinking** | on entering the water (§ 13.7.4) |
| 4 | any dying entity → a **death frame** | § 7.4.1 |
| 5 | a merchant's last death frame → its **floating score** | § 7.3.2 |

### 6.6.1 The complete inventory

**Sixty-three bitmaps**, and the game authors no others. Each is baked at the parity and
palette its use site gives it (§ 6.5); a type with two sprites bakes both.

`bw` is the **stored byte width** that § 6.4 requires for collision boxes; `box` is the
resulting box width in pixels, `rows` the height. Ink may be narrower than the box.

**Entity sprites — 25.**

| sprite | bw | box | rows | used by | when |
|---|---:|---:|---:|---|---|
| player submarine | 5 | 28 | 6 | type 0 | always; also drawn as the spare-sub icon (§ 19.9.2) |
| torpedo rising | 2 | 7 | 6 | type 1 | from launch |
| torpedo descending | 2 | 7 | 6 | type 1 | **after a hospital-ship deflection** (§ 13.6.2) |
| horizontal torpedo | 2 | 7 | 3 | type 2 | always |
| enemy hull, right-to-left | 5 | 28 | 7 | type 3 | entering from the right |
| enemy hull, left-to-right | 5 | 28 | 7 | type 3 | entering from the left — missions 1–2 only (§ 8.4) |
| magnetic mine | 2 | 7 | 6 | type 4 | always |
| hospital ship | 5 | 28 | 7 | type 8 | always |
| merchant hulls **× 7** | 5 | 28 | 7 | type 9 | one per roster record, in four hues (§ 12.5) |
| supply submarine | 5 | 28 | 7 | type 13 | always |
| payload | 2 | 7 | 5 | type 14 | always |
| dolphin | 3 | 14 | 6 | type 15 | always — the dolphin never changes sprite |
| shell open | 2 | 7 | 9 | type 16 | before it reaches the payload |
| shell closed | 2 | 7 | 7 | type 16 | **after eating the payload** (§ 13.8.3) |
| Destroyer | 5 | 28 | 7 | type 17 | always |
| charge arcing | 2 | 7 | 2 | type 18 | during the arc (§ 13.7.3) |
| charge sinking | 2 | 7 | 4 | type 18 | **from water entry onward** (§ 13.7.4) |
| enemy torpedo | 2 | 7 | 3 | type 19 | always |
| avenger | 4 | 21 | 7 | type 20 | always |

**Death frames — 8**, shared by every type (§ 7.4.1).

| sprite | bw | box | rows | frames |
|---|---:|---:|---:|---|
| sinking ship 1, 2, 3 | 5 | 28 | 8 | 0–2, and again as 8–10 |
| burst 1, 2, 3 | 3 | 14 | 6 | 3–5 |
| tall column 1, 2 | 3 | 14 | 13 | 6–7 |

**Floating score values — 10**, all 5 / 28 / 7 (§ 7.3.2): five for an ordinary merchant
kill, one per mission, and five for the quota-completing kill.

**Effect sprites — 4** (§ 15.4).

| sprite | bw | box | rows | shape |
|---|---:|---:|---:|---|
| dot | 1 | 0 | 1 | a single pixel — a box width of 0 is one pixel, extents being inclusive |
| blob | 2 | 7 | 1 | two adjacent pixels, so it renders white |
| spark cluster | 2 | 7 | 4 | the debris particle |
| streak | 2 | 7 | 1 | ship wakes |

**Text strips — 16.** These are **artwork, not rendered text**, and each carries its own
fixed position in its own header — neither X nor Y is supplied by the code that posts it.

**Strips reserve no shift space, so a strip's drawn width is `bw × 7`** — not the
`(bw − 1) × 7` of § 6.4, which applies to entity sprites because those reserve blank
columns. Strips never collide, so no box is computed for them. All are **7 rows tall**.

| strip | bw | drawn | screen x | rows |
|---|---:|---:|---|---:|
| `HIGH SCORE` | 17 | 119 | 0 – 118 | 185 – 191 |
| `SCORE` | 9 | 63 | 175 – 237 | 185 – 191 |
| `SUBS` | 7 | 49 | 0 – 48 | 185 – 191 |
| `FUEL:` `TORP:` — one strip | 21 | 147 | 0 – 146 | 185 – 191 |
| the HUD erase bar | 25 | 175 | **0 – 174** | 185 – 191 |
| `MISSION` | 11 | 77 | 70 – 146 | 0 – 6 |
| `ONE` | 5 | 35 | 154 – 188 | 0 – 6 |
| `TWO` | 5 | 35 | 154 – 188 | 0 – 6 |
| `THREE` | 9 | 63 | 154 – 216 | 0 – 6 |
| `FOUR` | 7 | 49 | 154 – 202 | 0 – 6 |
| `FIVE` | 6 | 42 | 154 – 195 | 0 – 6 |
| `MISSION COMPLETE` | 26 | 182 | 49 – 230 | 0 – 6 |
| `OUT OF FUEL` | 19 | 133 | 84 – 216 | **105 – 111** |
| `GAME OVER` | 15 | 105 | 91 – 195 | **90 – 96** |
| demo message A | 35 | 245 | 21 – 265 | 0 – 6 |
| demo message B | 30 | 210 | 35 – 244 | 0 – 6 |

**The five numerals ship in the opposite palette to every other strip**, so the mission
banner reads as `MISSION` in one colour and its numeral in another. They share one
position, sitting to the right of the word.

Chapter 19 specifies when each is posted and erased.

The HUD digit font (§ 19.9) is separate from all of the above — 6 × 8 cells, not a block.

## 6.7 Normative and free — summary

**Normative:** the ink/colour split · the two-pass blend and its order · the
palette-bit-and-parity colour selection · the right-only chroma extension · retaining
`byteWidth` and using it for boxes · per-object colour assignment, and the four merchant
hues · the death frames' fixed flip and per-frame parity (§ 7.4.1) · the debris's
draw-time parity choice (§ 15.4), which is the only one.

**Free:** asset file format and packing · whether variants are stored separately or
generated at load · how `tools/` is structured.

**Not free:** every dimension in § 6.6.1. The artwork is fixed and is reproduced from the
original; an implementation does not author sprites, and a bitmap of the wrong size
changes collision boxes (§ 6.4) as well as the picture.

---

# 7. The type tables

## 7.1 One index, two tables

Every entity carries a **type**, 0–20. It selects one row in each of two static tables:

| table | holds | consulted |
|---|---|---|
| **dispatch** | two handler references and the type's score | every tick, and on every contact |
| **definition** | what the death sequence needs: re-anchor, frame range, debris, sound |
 | when an entity dies |

Twenty-one types across two eight-byte rows is 336 bytes for the whole behaviour
catalogue. **Keep the split.** Behaviour and death-data have different lifetimes and
different readers, and merging them produces a wide row that is mostly empty for most
types.

## 7.2 The dispatch table

Handlers are named by the type that owns them (Chapter 13). **Where several types name
the same handler, that sharing is the design** and is normative — it is what lets seven
merchant slots cost nothing extra.

| type | entity | update handler | collision response | score |
|---:|---|---|---|---:|
| 0 | player | player | player | — |
| 1 | vertical torpedo | vertical torpedo | vertical torpedo | — |
| 2 | horizontal torpedo | horizontal torpedo | horizontal torpedo | — |
| 3 | enemy submarine | enemy submarine | enemy submarine | 100 |
| 4 | magnetic mine | magnetic mine | magnetic mine | 50 |
| 5–7 | *unused merchant slots* | **merchant** | **merchant** | mission-scaled |
| 8 | hospital ship | hospital ship | hospital ship | — |
| 9 | merchant ship | **merchant** | **merchant** | mission-scaled |
| 10–12 | *unused merchant slots* | **merchant** | **merchant** | mission-scaled |
| 13 | supply submarine | supply submarine | supply submarine | — |
| 14 | payload | payload | payload | — |
| 15 | dolphin | dolphin | dolphin | — |
| 16 | Giant Clam | Giant Clam | Giant Clam | 50 |
| 17 | Destroyer | Destroyer | **generic** | 150 |
| 18 | depth charge | depth charge | depth charge | 20 |
| 19 | enemy torpedo | enemy torpedo | enemy torpedo | 50 |
| 20 | avenger | avenger | avenger | — |

Two structural facts fall out of reading the columns whole:

- **Seven types share the merchant pair.** Types 5–7 and 9–12 are identical in both
  tables. Only type 9 is ever created (§ 7.5).
- **The Destroyer is the only type with no collision response of its own.** It names the
  generic handler, which takes damage and scores and does nothing else. Every other type
  has a response that inspects the other party.

The row carries two further bytes that nothing reads.

## 7.3 Scoring

Score is **16-bit binary-coded decimal** and is added directly into the running score.
The values above are exact.

**A score of `$99` in the low byte is a sentinel, not a value.** It means *this type
scores by mission* and diverts to the rule below. Only the merchant slots carry it. This
is the reason § 1.3 makes decimal semantics normative: in binary the sentinel is an
ordinary number and the rule never fires.

### 7.3.1 The merchant rule

Let `m` be the mission number, 1–5.

| kill | score |
|---|---|
| an ordinary merchant | **(m + 1) × 100** — 200 through 600 |
| the merchant that empties the quota | **(m + 1) × 1000** — 2000 through 6000 |

The two differ by a factor of ten, awarded only when the kill counter reaches zero — so
the tenth merchant of a mission is worth more than the other nine together.

Implementation note: the original produces the ×10 by shifting `m + 1` left four times,
which multiplies by sixteen in binary and by ten in decimal, and the result is added as
BCD to the hundreds digit. Any arithmetic that yields the table above is conformant.

### 7.3.2 The floating score

A destroyed merchant leaves a score value floating on screen. **Ten sprites exist:** one
per mission for an ordinary kill, and one per mission for the quota-completing kill. The
sprite is chosen by the same test that chooses the score, so the number shown always
matches the number awarded.

Its lifetime is governed by a period of 32 on its final animation frame (§ 2.7.1).

## 7.4 The definition table

Consulted when an entity dies. **Re-anchor** offsets shift the entity's position when the
death sprite replaces the live one, since the two differ in size.

| type | entity | X re-anchor | Y re-anchor | first frame | last frame | debris | sound |
|---:|---|---:|---:|---:|---:|---:|---|
| 0 | player | 0 | 0 | 0 | 0 | **12** | 13 |
| 1 | vertical torpedo | 4 | 0 | 3 | 5 | 0 | 7 |
| 2 | horizontal torpedo | 0 | 0 | 3 | 5 | 0 | 7 |
| 3 | enemy submarine | 0 | 0 | 0 | 0 | 7 | 11 |
| 4 | magnetic mine | 4 | 4 | 6 | 7 | 0 | 6 |
| 5–7, 9–12 | merchant slots | 0 | 0 | 8 | 11 | 5 | 4 |
| 8 | hospital ship | 0 | 0 | 0 | 2 | 5 | 4 |
| 13 | supply submarine | 0 | 0 | 0 | 0 | 7 | 12 |
| 14 | payload | 2 | 1 | 3 | 5 | 0 | 16 |
| 15 | dolphin | 0 | 0 | 0 | 0 | 0 | 14 |
| 16 | Giant Clam | 0 | 0 | 0 | 0 | 0 | 14 |
| 17 | Destroyer | 0 | 0 | 0 | 2 | 5 | 5 |
| 18 | depth charge | 5 | 5 | 6 | 7 | 0 | 6 |
| 19 | enemy torpedo | 3 | 0 | 3 | 5 | 0 | 7 |
| 20 | avenger | 0 | 0 | 0 | 0 | 0 | **silent** |

Reading it as a whole:

- **First = last = 0 means no death animation.** The player, the enemy submarine, the
  supply submarine, the dolphin, the clam and the avenger simply vanish; the first three
  of those still emit debris.
- **The player's twelve-particle burst is the largest in the game** — against seven for
  a submarine and five for a ship — and it is the only type with debris but no animation
  *and* no re-anchor.
- **The merchant's last frame is 11**, which is the frame the floating-score lifetime of
  § 7.3.2 attaches to.
- **The avenger is the only silent type.** Its sound field carries a dedicated
  silence marker rather than a sound number.
- **Nine of the eighteen sounds are death sounds**, assigned here by type rather than by
  event, which is why the three torpedoes share one and the seven merchant slots share
  another. Chapter 18 gives the sequences.

The hospital ship's row looks inert and is not: nothing living can reach it (§ 13.6.2),
but a wreck can, so its full death specification does get used — rarely, and only when a
depth charge is destroyed just below one.

### 7.4.1 The death frames

**One frame table, shared by every type.** The first/last columns above are indices into
it. Twelve frames, in three visual groups plus a special case:

| frame | sprite | X parity | group |
|---:|---|---|---|
| 0, 1, 2 | sinking ship, three stages — **28 × 8** | **even** | a ship going down |
| 3, 4, 5 | burst, three stages — **14 × 6** | **odd** | a compact explosion |
| 6, 7 | tall column, two stages — **14 × 13** | **odd** | a water column |
| 8, 9, 10 | **the same three sinking-ship sprites again** | **even** | a second copy |
| 11 | **no sprite** — special-cased, § 7.3.2 | **odd** | the floating score |

Which type plays which:

| frames | animation | played by |
|---|---|---|
| 0–2 | sinking ship | hospital ship, Destroyer |
| 3–5 | burst | all three torpedoes, and the payload |
| 6–7 | tall column | depth charge, magnetic mine |
| 8–11 | sinking ship, **then the score** | merchant ship |
| — | none | player, enemy submarine, supply submarine, dolphin, Giant Clam, avenger |

**The merchant needs its own copy of the sinking frames** because it is the only type
whose animation must end on a floating score value, and frame 11 is intercepted before
the table is consulted.

Frames advance at period 4 (§ 2.7.1), and the entity is removed when the counter passes
the last frame.

**Each frame forces the entity's X to the parity in the table above**, applied before the
frame is drawn and before frame 11's interception, so the floating score is forced odd
along with the rest. An explosion therefore cannot change colour as it plays, and a
wreck's colour does not depend on where the thing that died happened to be.

**The death sequence also fixes the palette flip, and it fixes it to 1 for every type.**
Beginning a death replaces the entity's palette selection outright rather than merging
into it, and nothing in the animation restores it, so a wreck is drawn in the flipped
palette whatever the dying object's own was. A merchant and a Destroyer sink in the same
colour despite differing in life.

Both halves together make every death frame's colour a property of the frame alone.
§ 6.5 bakes them on that basis.

### 7.4.2 The re-anchor is subtracted

A death sprite is wider and taller than the thing that threw it, and every sprite is
placed by its top-left pixel (§ 17.3). The re-anchor compensates:

```
x −= X re-anchor          (16-bit)
y −= Y re-anchor
```

**Subtracted, not added** — pulling the anchor up and left so the wider block is centred
on what died. Applied **once**, when the death begins.

Five types carry a non-zero offset: the vertical torpedo (4, 0), the magnetic mine
(4, 4), the payload (2, 1), the depth charge (5, 5) and the enemy torpedo (3, 0). Skip
this and every torpedo, mine and depth charge explodes down and to the right of where it
actually was.

**The horizontal torpedo's zero looks like an oversight in the original and is
reproduced.** It is the same size as the other two torpedoes and dies into the same
wider burst, yet carries 0/0 — so its explosion sits low and right of the shot while
theirs are centred. Nothing in the game distinguishes it; the value was simply never
filled in. It is kept because it is observable.

## 7.5 The six unused slots

Types 5, 6, 7, 10, 11 and 12 are byte-identical to type 9 in both tables and **have no
creation site**. Nothing in the game ever produces one.

**Keep the slots.** Deleting them is safe today and unsafe later: Chapter 14's shared
merchant response exempts a *range* of types that stops short of 12, so an entity of
type 12 would be able to destroy another merchant. Preserving the slots keeps that
latent inconsistency inert rather than turning it into a bug the first time someone
reuses a type number.

## 7.6 Normative and free — summary

**Normative:** the type numbering · which types share handlers · every score value · the
`$99` sentinel and the merchant rule · the ten floating-score sprites and their
selection · every field of the definition table · the six unused slots.

**Free:** how handlers are referenced · table storage · whether the two tables are one
structure with eight fields.

---

# 8. Difficulty

## 8.1 Six rungs, eight knobs

**There is no level data.** Difficulty is a chain of six branches on the mission
counter — the title screen, then missions 1 to 5 — each setting the same eight values.
Five missions share one map, one roster, one set of sprites and one loadout.

**There is no default rung.** A mission counter above 5 falls through the chain into
**mission 3's** settings. This is unreachable in the game as specified, because clearing
mission 5 ends it — but an implementation that adds missions inherits mission 3's values
rather than any scaling rule, and should say so deliberately.

## 8.2 The ladder

Seven of the eight knobs are **live-population caps** — they limit *concurrency, not
rate*. Spawn intervals do not vary by mission at all.

| | enemy sub | mine | hospital ship | merchant | Destroyer | depth charge | enemy torpedo | *(unused)* |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| title / demo | 3 | 2 | 2 | 3 | 3 | 3 | 1 | 0 |
| mission 1 | 1 | 0 | 2 | 3 | 0 | 0 | 0 | 0 |
| mission 2 | 1 | 0 | 4 | 3 | 3 | 3 | 0 | 0 |
| mission 3 | 3 | 0 | 5 | 3 | 3 | 3 | 3 | 0 |
| mission 4 | 3 | 3 | 6 | 3 | 3 | 3 | 0 | 0 |
| mission 5 | 3 | 3 | 7 | 3 | 3 | 3 | 3 | 0 |

The eighth knob is zero on every rung and has no effect; it belonged to the rate
governor that § 1.3 does not reproduce.

**Four of the caps gate top-level spawners** (enemy submarine, hospital ship, merchant,
Destroyer). **Three gate secondary spawns from inside entity handlers** — the mine and
torpedo an enemy submarine launches, and the depth charge a Destroyer drops. Chapter 12
specifies both kinds.

Mission 5's caps sum to 25, which with the two torpedo caps gives the 27 of § 4.7.1.

## 8.3 Reading the curve

The ladder is mostly **gating**, not climbing.

- **Only the hospital ship ramps monotonically**: 2, 4, 5, 6, 7. It is also the only
  class that is never a target and never a threat, so the one thing that steadily
  increases is clutter.
- **The merchant cap never changes.** It is 3 in every mission. The target class is
  exactly as dense on mission 5 as on mission 1; what changes is what else is on screen.
- **Mission 1 switches three classes off entirely** — no mines, no Destroyers, and
  therefore no depth charges. A first mission is merchant traffic, hospital ships and an
  unarmed enemy submarine.
- **The two submarine weapons alternate rather than accumulate:** torpedoes on mission 3,
  mines on mission 4, both on mission 5. They are never introduced together, and the
  harder one to escape — the homing mine — arrives second.
- **The title screen is not the easy setting.** Its caps are denser than mission 1's on
  five of seven knobs, tuned to look busy rather than to be survivable. Chapter 10 relies
  on this: the demo must be visibly eventful.

## 8.4 The entry side is not on the ladder

Which side the enemy submarine enters from is decided separately, and it inverts the
apparent difficulty curve.

| mission | enters from |
|---|---|
| 1 and 2 | **either side**, chosen at random per spawn |
| 3, 4, 5 and the demo | **right only** |

On missions 1 and 2 the choice draws one bit from the generator — **bit 1 of the output
byte, not bit 0.** § 5.4 establishes that bit 0 carries nothing forward, so an
implementation that masks the low bit is not sampling the same thing. **Bit 1 set
selects the left side**, clear selects the right.

**Where that draw sits is normative.** It is taken *before* § 12.4's two depth draws, and
on the right-only rungs it is **not taken at all** — the spawner does not draw and
discard, so those missions consume one fewer value per submarine.

**The two missions where the submarine can come at you from behind are exactly the two
where it is unarmed.** From mission 3 on it always enters from the right, which is what
makes its torpedo's firing condition meaningful — Chapter 13 specifies a shot that is
refused unless the player is ahead of it.

## 8.5 Identical in every mission

Stated explicitly, because the list is longer than the ladder:

the kill quota of 10 · the ten-record target roster · both type tables of Chapter 7 ·
every sprite · the four surface spawn rows · every spawner interval · the starting fuel,
the starting torpedo count and the burn rate.

**The only genuine per-mission data in the game is the banner text**, and the banner
table having five entries is why the mission counter stops at 5.

## 8.6 Normative and free — summary

**Normative:** the six rungs and all values in § 8.2 · caps limiting concurrency rather
than rate · the fall-through to mission 3 · the entry-side rule, the bit it samples and
**which value picks which side** ·
everything in § 8.5 being mission-invariant.

**Free:** how the ladder is stored — a table is preferable to six branches, and produces
identical behaviour.

---

# 9. The tick

## 9.1 One loop, two callers

There is **one** simulation loop. The title-screen demo and a live mission call the same
loop with the same spawners, the same entity list and the same dispatch table.

The order below is normative in full. It is not incidental: spawners run **before** the
entity walk, so an entity created on a tick is walked, moved and drawn on that same
tick — never on the next one.

## 9.2 The tick, in order

| # | demo (Chapter 10) | mission (Chapter 11) |
|---:|---|---|
| 1 | — | **exit guards**: dead · out of fuel · quota met |
| 2 | poll input | poll input |
| 3 | **exit if a start was requested** | — |
| 4 | fire the vertical torpedo | — |
| 5 | the five spawners, in order | the five spawners, in order |
| 6 | draw once; fire the horizontal torpedo if the low six bits are zero | — |
| 7 | horizontal bounce, and swap the message | — |
| 8 | vertical bounce | — |
| 9 | **the frame** (§ 9.3) | **the frame** (§ 9.3) |

Steps 2, 5 and 9 are common; everything else belongs to one mode. The demo's extra
steps stand in for a player, and the mission's exit guards have no demo counterpart
because a keypress is the demo's only exit.

**The spawner order is normative** — enemy submarine, hospital ship, merchant, supply
submarine, Destroyer — because they draw from one shared generator (§ 5.6).

## 9.3 The frame

```
1  walk the entity list          § 9.4
2  walk the effects list         Chapter 15
3  advance sound by exactly one (pitch, duration) pair    Chapter 18
─────────────────────────────────────────────────────────────────
4  render and present            Chapter 17     ← presentation, not simulation
```

Exactly **one** sound pair per tick, always — not one per sound, and never two.

**Steps 1–3 are the simulation and step 4 is not.** The core produces no picture; the
renderer reads the state the walks left behind and composites it (§ 1.5). The line
matters because everything above it must run identically with no renderer attached —
that is what Chapter 20's oracles depend on.

The original had no such line: its walks drew as they went, which is why its frame also
carried page-flip bookkeeping. § 9.6.

## 9.4 The entity walk

A cursor runs from 0 and is compared against the **live count** each iteration, so
entities created during the walk are picked up by it and entities removed during it are
handled by § 9.5.

```
cursor = 0
while cursor != liveCount:
    e = entity[cursor]

    if   e.removalRequested:      goto UPDATE          # bypasses the divider
    elif e.firstUpdate:           goto UPDATE          # bypasses the divider
    elif e.stateChangePending:    goto STATE_CHANGE

    else:
        e.updateCountdown -= 1
        if e.updateCountdown != 0:
            cursor += 1 ; continue                     # skipped this tick
        if e.dying:               goto STATE_CHANGE

UPDATE:
    run the type's update handler        # moves, draws, reloads the countdown
    run collision for this entity        # Chapter 14
    if not e.stateChangePending: goto SETTLE

STATE_CHANGE:
    run the state-change handler         # sound, debris, begin the death animation

SETTLE:
    if e.removalRequested:  goto UPDATE                # give the handler another pass
    if e.removalConfirmed:  free the slot (§ 9.5)      # cursor does NOT advance
    else:                   cursor += 1
```

Three things in that are easy to lose:

- **Two flags bypass the divider.** A removal request and a first update both run the
  handler immediately, whatever the countdown says. The first-update bypass is what
  makes § 9.1's same-tick guarantee hold for spawned entities.
- **Collision runs inside the walk**, immediately after each entity's own handler — not
  as a separate pass afterwards. This is what gives § 3.3 its ordering: when an entity
  tests for contact, entities earlier in the walk are already at their new positions and
  entities later in the walk are still at their previous ones.
- **`SETTLE` can re-enter `UPDATE`.** If a request is still outstanding after the
  handler ran, the handler runs again. This is the two-phase handoff of § 4.5 completing
  within one tick.

### 9.4.1 `firstUpdate`

`firstUpdate` is set at creation and **cleared by the type's own handler** on its first
run, which is where per-type initialisation belongs. It is not a general "is alive"
flag — every live entity would then bypass its divider forever, and the entire speed
system of § 2.7 would collapse into everything moving at once.

## 9.5 Freeing a slot

Specified in § 4.6. The two points that belong to the walk: the slot is erased from
`stencil` before the swap, and **the cursor does not advance afterwards**, because the
hole is filled by an entity this tick has not yet processed.

## 9.6 Not reproduced

The original's frame carried two more steps after the sound: a rate governor (§ 1.3,
§ 2.6) and a page flip with a per-entity catch-up pass that redrew skipped entities onto
whichever buffer they were missing from. Both are absent here — the first by decision,
the second because a single `color` buffer composited from state each tick has no second
page to reconcile.

The catch-up pass is worth understanding rather than just deleting, because **the problem
it solved still exists and Chapter 17 solves it differently.** An entity skipped by its
divider does not move and is not redrawn, but it is still on screen and must stay there.
The original kept it there by tracking, per page, where each entity was last drawn. We
keep it there by drawing every live entity every tick from its current position — which
is the same picture, because a skipped entity's position is unchanged. § 17.6 states the
rule this imposes on the renderer.

## 9.7 Normative and free — summary

**Normative:** the step order of § 9.2 · spawner order · the frame order of § 9.3 · one
sound pair per tick · the walk of § 9.4 including both divider bypasses · collision
running inside the walk · `firstUpdate` semantics · the non-advancing cursor.

**Free:** how the loop is scheduled against wall-clock time · whether the walk is a loop
or recursion · how the cursor is represented.

---

# 10. Screen flow & the session state machine

## 10.1 There is no mode variable

**The mission counter is the mode flag.** Zero means the title screen; 1 to 5 are the
missions. It has exactly two writers: the title screen sets it to zero, and starting a
game increments it.

**So starting a game is a single increment** — the transition out of attract mode and
the advance to mission 1 are one operation, not two. An implementation with an
`AttractMode` class and a `GameMode` class has already diverged, because it now needs to
keep two things in step that were never separate.

Eighteen sites read the counter. They do two different jobs, and conflating them is the
usual way this goes wrong:

| question | count | effect |
|---|---:|---|
| *"is this the title screen?"* — tests against zero | 12 | suspends one rule each (§ 10.5.3, and Chapter 19's input gates) |
| *"which mission is this?"* — tests against a value | 6 | ordinary difficulty scaling that happens to treat 0 as a valid rung |

## 10.2 The screen flow

```
            ┌─────────────────────────────┐
            │  title screen + demo (§10.5)│◄──────────────┐
            └──────────────┬──────────────┘               │
                    start requested                       │
                           ▼                              │
            ┌─────────────────────────────┐        game over
            │   one game (§ 10.4)         │───────────────┘
            └─────────────────────────────┘
```

Two screens, and the game returns to the first when it ends — whether it was won or
lost (Chapter 11).

**The high score is committed on entry to the title screen, not when a game ends.** A
player watching the end-of-game sequence is still looking at the previous record; the
new one appears as the title screen comes up.

## 10.3 Session state

| state | meaning |
|---|---|
| `mission` | 0 = title screen, 1–5 = the mission number |
| `roundLive` | set while a round is playing, cleared for the outro |
| `spareSubs` | starts at **3**, decremented when a sub launches, **never incremented** |
| `replayMission` | set when a life was lost — replay rather than advance |
| `gameOver` | set when the subs run out, or when mission 5 is cleared |
| `ranDry` | set when the round ended with empty tanks |
| `startRequested` | set by the title screen's start input |
| `controller` | which input scheme this session uses (Chapter 19) |

`spareSubs` never increasing is the whole economy: **there are no extra lives, and no
way to earn one.**

## 10.4 One game

The session is three loops deep — game, mission, round:

```
new game:
    score = 0 ; flush the sound queue ; spareSubs = 3 ; replayMission = set
    apply the stored sound preference ; draw the zeroed score

  next mission:
    mission += 1                        ← this is also the attract → game transition
    apply the difficulty rung           Chapter 8
    round setup                         Chapter 11
    play                                the loop of Chapter 9
    outro                               Chapter 11

    if gameOver:        return to the title screen
    if replayMission:   go to "round setup"      (same mission again)
    else:               go to "next mission"
```

The mission counter stops at 5 because the banner table has five entries (§ 8.5), and
clearing mission 5 sets `gameOver` — Chapter 11.

## 10.5 The title screen and its demo

The demo is **the game playing itself**: the same loop, the same spawners, the same
entity list, with the mission counter at zero. There is no recorded input, no script,
and no demo-specific movement code.

The difficulty rung it runs on is the title-screen row of § 8.2, which is **denser than
mission 1** — the demo is tuned to look busy.

### 10.5.1 The demo submarine's behaviour

The whole "demo AI" is this:

- The sub is spawned stationary. A clamp zeroes whichever velocity component hits an
  edge (§ 2.5).
- **Each tick, if the horizontal velocity is zero, negate the stored horizontal
  direction and assign it.** Same for vertical, independently.
- It therefore travels diagonally and reverses at the walls.

**It writes the same velocity pair the player's controls write** (§ 1.3). Nothing
downstream knows or cares which wrote it — that seam is the entire mechanism by which
one engine serves both modes.

Weapons fire on their own:

| weapon | rule |
|---|---|
| vertical torpedo | **attempted every tick.** The population cap of 1 (§ 4.7) is what actually paces it |
| horizontal torpedo | one generator draw per tick; fires when the low six bits are all zero — **1 in 64** |

**The horizontal bounce also swaps the on-screen message**, choosing between two by the
sign of the stored direction. So message changes and wall bounces are the same event,
and the message cadence is a traverse of the screen.

Because the player's divider is 2 while the bounce test runs every tick (§ 2.7.3), the
demo's cadence is **twice** what a move-every-tick model predicts. Chapter 20 turns this
into an oracle.

### 10.5.2 The seven suspended rules

A zero mission counter suspends exactly seven rules. Together they are why an unattended
demo runs forever.

| # | in a mission | on the title screen |
|---:|---|---|
| 1 | contact damages the player | **nothing can hurt the demo sub** |
| 2 | firing spends a torpedo, and an empty magazine makes a sound | the ammunition path is skipped entirely — free shots, no empty sound |
| 3 | a kill awards score and records which floating value to show | scoring is skipped entirely |
| 4 | a merchant's death frame 11 swaps in that floating value | the wreck is removed instead — a demo merchant sinks through its earlier frames and vanishes |
| 5 | a merchant kill decrements the quota and stamps the roster | nothing counts toward a quota that is not running |
| 6 | fuel burns | **no drain — the demo never runs dry** |
| 7 | **the right clamp** flags the entity for removal (§ 11.3) | skipped — the demo bounces off that wall constantly and would delete itself |

**Rules 3 and 4 are a pair, and 4 is load-bearing rather than cosmetic.** Rule 3 is what
*writes* the floating-value index and rule 4 is what *reads* it. Suspend only the first
and a demo merchant indexes the floating-score table with whatever the previous occupant
of its slot left behind.

So the demo cannot die, cannot run out of fuel, cannot run out of torpedoes, and cannot
score. **It ends exactly one way: input.**

One more difference is not a suspension: the enemy submarine's entry side is chosen by a
rule that treats the title screen like missions 3–5 (§ 8.4), so the demo only ever sees
it enter from the right.

### 10.5.3 Leaving the title screen

Two inputs start a game, and **which one is used selects the controller for the entire
session** (Chapter 19):

| input | starts | controller |
|---|---|---|
| the start key | ✅ | keyboard |
| the primary fire button | ✅ | gamepad — debounced: it must be seen released first |

The exit is tested **immediately after input and before anything else in the tick**
(§ 9.2), so a start takes effect on the tick it is pressed.

Everything else the input handler offers is live here too — pause, and the settings
toggles — because those sit ahead of every mode test. Chapter 19 specifies them,
including the one that behaves differently here than in a mission.

## 10.6 Transitions poll no input

The round-start and round-end animations of Chapter 11 — the launch, the fly-in, the
outro drain — **do not read input at all.** Only the two loops of § 9.2 do. This is why
the outro can drive the player's submarine off the screen without the player being able
to fight it.

**But input during a transition is deferred, not dropped.** Nothing in a transition
clears the pending-input state, so a key pressed during one is consumed by the first
poll after play resumes and takes effect on the round's opening tick. Only the most
recent input survives — a flurry of presses collapses to exactly one.

## 10.7 Normative and free — summary

**Normative:** the counter serving as both mode flag and mission number · the single
increment that starts a game · the three-deep loop · `spareSubs` never increasing · the
demo running the same loop on the title-screen rung · the bounce behaviour and both
auto-fire rules · all seven suspensions, rule 4 included · the exit test's position in
the tick · the controller being selected by how the game is started · transitions
polling no input while deferring it.

**Free:** how the state is stored · how the two screens are structured in code, provided
they share one loop.

---

# 11. Round lifecycle & win/loss

A **round** is one submarine's attempt at one mission. It has three phases: setup, play,
outro.

## 11.1 Setup

Setup always erases whatever message is posted and posts the **mission banner** — the
word `MISSION` plus a numeral, from a five-entry table. That table having five entries is
why the mission counter stops at 5 (§ 8.5).

It then takes one of two paths, chosen by `replayMission`:

### 11.1.1 Fresh submarine — starting a game, or after a loss

1. Clear the HUD line and draw the label `SUBS`.
2. **Draw the player's own sprite once per spare submarine**, along the HUD line,
   stepping 30 pixels between them. The icons are the player sprite, not a separate
   asset.
3. **The launch:** **hold**; erase the last icon; redraw it at the player's start
   position (100, 100); queue the launch sound; **hold**; erase it; `spareSubs -= 1`.

   **Both holds are load-bearing and the first is easy to lose**, because it comes before
   anything visibly happens: the sequence pauses on the full rack of icons, *then* lifts
   one off. In the original they are the same routine called at two sites, before the
   lift and after the tone.
4. Clear the HUD line again — which is what removes the `SUBS` display — and draw the
   `FUEL:` and `TORP:` labels in its place.
5. Fill both gauges from the starting values (Chapter 16).
6. The player spawns at **(100, 100)**.

**This path also reloads the supply submarine's countdown to a full 1000** (§ 12.3),
immediately before the player is placed. It is the only spawner cooldown anything in the
game ever resets, so a fresh submarine always gets the whole interval before its first
resupply.

**`spareSubs` is decremented here, at launch — not on death.** So the count shown is
submarines *in reserve*, and the one you are flying has already been deducted.

### 11.1.2 Mission cleared — advancing to the next

No HUD rebuild; fuel, torpedoes and the gauges carry over untouched — **and so does the
supply submarine's countdown.** This path does not reload it, so a cleared mission
inherits whatever it was left at and the next resupply can arrive almost at once. The
asymmetry between the two paths is normative, not an oversight in the original.

1. The player spawns at **X = 0** — off-screen left — with the left clamp opened from 28
   to 0 and a horizontal velocity of +2.
2. The entity walk runs until the player reaches X = 100: **the submarine swims in from
   the left edge**, in view, while everything already on screen carries on.
   **The spawners do NOT run** — the fly-in and the drain run the frame only, so nothing
   new arrives during either, and neither consumes a generator draw (§ 5.6).
3. **Hold.**
4. The left clamp is restored to 28.

Both paths finish by setting `roundLive` and clearing `replayMission`, `gameOver` and
`ranDry`.

**The hold** in the steps above is a pause with the simulation stopped — nothing moves
and nothing animates. It occurs **twice** in the launch sequence and **once** at the end
of the fly-in.

**Specification: 33 ticks**, about 1.1 seconds at 30 Hz. The original produces this as a
counted busy-wait rather than as a frame count, so the figure is a consequence of its
processor speed rather than a designed duration; `docs/porting_decisions.md` records the
choice. An implementation may tune it — it is the one visible duration in the game that
no table determines.

## 11.2 Play

The loop of § 9.2. **Three guards are tested at the top of every tick, in this order:**

| # | guard | meaning |
|---:|---|---|
| 1 | the player's alive flag is clear | **dead** |
| 2 | both fuel bytes are zero | **out of fuel** |
| 3 | the kill counter is zero | **mission complete** |

Any one of them ends the round. **The order is normative** because § 11.3 re-tests them
in the same order and awards a different outcome depending on which it finds first.

Note guard 1's phrasing: nothing that kills the player writes that flag directly. A
lethal contact raises an ordinary removal request, and the player's own handler clears
the flag on its next update (§ 4.5, § 9.4) — so **death reaches this guard one tick
after the hit.**

## 11.3 The outro

The outro first sets up the exit, unconditionally:

- horizontal velocity **4** — double the player's normal speed, so the exit is visibly
  brisk
- vertical velocity **0** — level flight
- the right clamp opened from 280 to **306**, off-screen, so the player drives off rather
  than stopping at the edge
- `roundLive` cleared, which is what lets the player's handler flag itself for removal on
  reaching the new clamp

Then it classifies the round, testing in the same order as § 11.2:

| state | outcome |
|---|---|
| **dead** | life lost |
| **alive, fuel remaining** | **mission complete** — post the banner, queue the completion sound; **if this was mission 5, set `gameOver`** |
| **alive, tanks empty** | set `ranDry`; **vertical velocity becomes +2**, so the submarine *sinks as it drifts off* rather than leaving level — then fall through to life lost |

**Life lost** sets `replayMission`, and **if `spareSubs` is now zero, sets `gameOver`.**

Two consequences worth stating plainly:

- **Running dry costs a submarine even though nothing killed you.** It is a loss, and the
  only thing distinguishing it on screen is the descent and the banner.
- **Meeting the quota on the same tick the tanks empty is a loss.** Guard 3 ends the
  round, but the outro tests fuel before it tests the quota, so the round classifies as
  out of fuel. The mission is not cleared and the submarine is spent.

## 11.4 The drain

The outro then runs a loop, so that everything on screen finishes its business under the
banners:

```
repeat up to 20 times:
    post OUT OF FUEL and/or GAME OVER, if their flags are set
    run 11 ticks
    stop early once the entity list and the effects list are both empty
```

**The drain runs the frame only** — the entity walk, the effects walk and sound — with
no spawners and no input polled (§ 10.6). Both halves matter: no input is what lets the
submarine be driven off the screen while the player watches, and **no spawning is what
makes the early exit reachable at all.** With the spawners running, something new arrives
every few ticks, both lists are never empty together, and every drain takes its full 20
passes.

So up to **220 ticks**, and in practice fewer.
Afterwards both lists are cleared, both banners erased unconditionally, and the right
clamp restored to 280.

## 11.5 Win and loss, complete

| condition | result |
|---|---|
| sink 10 merchant vessels, alive, with fuel remaining | **mission complete** → next mission |
| ...and it was mission 5 | **the game is won** |
| killed | life lost → replay the same mission |
| tanks empty | life lost → replay the same mission |
| life lost with no spare submarines | **the game is over** |

There is no other way to lose a submarine, no way to gain one, and no score threshold
that grants one.

## 11.6 The ending

**Winning and losing look almost identical, and there is no victory screen.**

Clearing mission 5 takes the *same* mission-complete path as clearing any other: the
`MISSION COMPLETE` banner is posted across the top, the completion sound is queued, and
then `gameOver` is set. The drain loop then draws `GAME OVER` — **the same banner, from
the same code, that greets a player who has just lost their last submarine** — centred
horizontally and straddling the middle row of the screen.

So the winning frame carries **both banners at once**: `MISSION COMPLETE` at the top and
`GAME OVER` across the middle. Nothing else distinguishes the two endings — same drain,
same erase, same return to the title screen.

An implementation that adds a victory screen, a fanfare, or a distinct end state has
changed the game's ending (§ 1.3).

## 11.7 Normative and free — summary

**Normative:** both setup paths and what each does or skips, **including the supply
submarine's countdown being reloaded on one of them and not the other** · `spareSubs` decremented at
launch · the spare-sub icons being the player sprite · the fly-in being live simulation ·
the three guards **and their order** · death arriving one tick late · every outro
setting including the exit velocity of 4 and the sinking velocity of +2 · the
classification order and all of § 11.5 · the drain loop's 11-tick passes and 20-pass
cap · the ending of § 11.6.

**Free:** the exact duration of the holds, within the intent of § 11.1 · how banners are drawn.

---

# 12. The five spawners

## 12.1 One shape, five instances

Each spawner runs once per tick, in the order of § 9.2, and has the same shape:

```
if cooldown != 0:
    cooldown -= 1
    return                       # nothing else happens this tick

if liveCount(class) >= cap:      # Chapter 8
    return                       # WITHOUT reloading the cooldown

allocate a slot                  # § 4.4
fill the record
reload cooldown = base + (a generator draw & 15)
liveCount(class) += 1
```

## 12.2 A blocked spawn is pending, not skipped

**When the cooldown reaches zero but the class is at its cap, the cooldown is not
reloaded.** It stays at zero and the cap is retested on every subsequent tick, so the
spawn happens on the very tick a slot frees.

This is why § 8.2's caps behave as a *standing population* rather than as a rate: once a
class is saturated, killing one member replaces it immediately. An implementation that
reschedules a blocked spawn turns every cap into a slow trickle instead.

The merchant spawner is the exception, and § 12.5 gives it.

## 12.3 The five

| order | entity | type | spawn X | spawn Y | first spawn at tick | interval | capped |
|---:|---|---:|---|---:|---:|---|---|
| 1 | enemy submarine | 3 | 0 or 306 (§ 8.4) | **random**, § 12.4 | 51 | 48–63 | ✅ |
| 2 | hospital ship | 8 | 0 | 20 | 46 | 150–165 | ✅ |
| 3 | merchant ship | 9 | 0 or 1 (§ 12.5) | 10 | 201 | 200–215 | ✅ |
| 4 | supply submarine | 13 | 1 | 177 | **1** | 1000, fixed | ❌ |
| 5 | Destroyer | 17 | 306 | 30 | 51 | 240–255 | ✅ |

Intervals are `base + (draw & 15)`, so each is a 16-tick window. **The supply submarine
is the exception in two ways:** its interval is a fixed 1000 ticks with no random term,
and it has no population cap at all — it can be delayed but never blocked, and it is the
only class the difficulty ladder cannot touch.

**The supply submarine's 1000 is a reload value, not a period.** Its cooldown is tested
before it is decremented, like every other spawner's, so 1000 reloads into a **1001-tick**
gap between spawns — the same off-by-one that makes a cooldown of *n* fire on tick
*n + 1*. Nothing else in the game exposes the difference, because every other interval
carries a random term wider than one tick.

**The first-spawn column is exact and is a cold-boot property.** Those cooldowns are
shipped values that nothing resets between rounds or missions — **with one exception: the
supply submarine's countdown is reloaded to a full 1000 on the fresh-submarine path of
§ 11.1.1, and never on the mission-cleared path** — so the opening sequence of
the first demo after a cold start is fully determined. Chapter 20 uses it as an oracle.
A cooldown of *n* fires on tick *n + 1*, which is why the supply submarine — shipped at
zero — spawns on tick 1.

## 12.4 The enemy submarine's depth

The only spawner that chooses a Y. It costs **two generator draws, in this order:**

```
draw once   → if the low two bits are all zero  (1 in 4):  mask = 127
                                     otherwise  (3 in 4):  mask = 31
draw again  → Y = 43 + (value & mask)
```

So three spawns in four are a **shallow band just under the waterline** (rows 43–74), and
one in four is a **deep runner** (rows 43–170).

The resulting distribution over a full generator period:

| band | share |
|---|---:|
| rows 43–74 | 81.2% |
| rows 75–127 | 10.5% |
| rows 128–170 | 8.2% |
| above the player's ceiling of 50 | **17.2%** |

**About one spawn in six appears shallower than the player can ever climb** (§ 2.5) — it
can attack downward but the player cannot rise to meet it.

**The spawn costs three generator draws on missions 1–2 and two on every other rung**,
in this order:

1. the **entry side** of § 8.4 — taken *only* where the side is random, never drawn and
   discarded;
2. the **mask**;
3. the **depth**.

**All of them are normative, and so is the order.** An implementation that picks the mask
and the depth from a single draw, or that draws for the side on a right-only rung,
consumes the shared generator differently from this one and shifts every subsequent
random decision in the game (§ 5.6).

## 12.5 The merchant roster

Merchant spawning is roster-driven, and **the roster is the mission**: ten records, a
quota of ten, one spawn each.

Each record holds a bitmap, a **status**, and a flag byte that fixes the vessel's
appearance for life:

| bit | feeds |
|---|---|
| 0 | the spawn X — 0 or 1, which fixes the column parity and therefore the hue |
| 7 | the palette selection |

| record | hue | | record | hue |
|---:|---|---|---:|---|
| 0 | violet | | 5 | orange |
| 1 | blue | | 6 | green |
| 2 | violet | | 7 | blue |
| 3 | orange | | 8 | green |
| 4 | green | | 9 | blue |

Ten records over **seven distinct bitmaps** in **four hues**. Records 1 and 7 are
identical in both bitmap and flag — genuinely the same vessel twice. Records 2 and 8
share a bitmap at different parity, as do 4 and 9, and appear as different-coloured
ships. **This is what § 1.3 makes normative:** without colour the ten collapse to seven.

Spawning walks a cursor:

```
record = cursor ; cursor = (cursor + 1) mod 10
if record.status != available:
    reload the cooldown and return          # the interval is consumed, nothing spawns
record.status = in-flight
... spawn it
```

Two consequences:

- **The cursor advances even on a failed attempt**, so the roster is walked in order
  regardless of which records are still available.
- **A busy or sunk record consumes a full interval.** Late in a mission, with most of the
  roster sunk, merchant traffic thins out on its own — the last few targets arrive
  further apart with no rule saying so.

Status has three values: **available**, **in-flight** (set at spawn), and **sunk**
(stamped by the collision response, Chapter 14). All ten are reset to available at the
start of every mission, alongside the kill counter (§ 8.5).

**A ship that sails past returns its record to the pool.** The removal path reads the
roster slot back off the ship and frees the record **only if it is still in-flight** — a
sunk record carries the retired mark and is left alone. So there is a fourth transition,
*in-flight → available on escape*, and it is the one that makes escapes survivable:

- Ten records against a quota of ten with **no** way back would mean a single ship
  crossing safely made the mission unwinnable.
- Worse, once ten had gone by the cursor would find nothing available ever again, and
  **no merchant would spawn for the rest of the mission** — an empty sea with a quota
  that cannot be met.

**Letting them escape costs time, and only time.** That is the whole of the penalty:
merchant traffic thins as records sit in flight, and thickens again as they cross.

## 12.6 Normative and free — summary

**Normative:** the spawner order · the common shape · the blocked-spawn rule of § 12.2 ·
every value in § 12.3 including the first-spawn ticks · the supply submarine's two
exceptions · **all three draws of § 12.4, their order, and the side draw not being taken
at all on the right-only rungs** · the roster, its ten records and four
hues, the cursor's advance on failure, the interval consumed by an unavailable record,
and **an escaped ship returning its record to the pool while a sunk one does not**.

**Free:** how the roster and cooldowns are stored.

---

# 13. The entity catalogue

Fifteen of the twenty-one types are ever created (§ 7.5). Each entry below gives what
that type does on its update, in the order it does it.

**Every speed here is a step. Divide it by the type's period from § 2.7 to get pixels
per tick** — the two are stated in different places on purpose, because they are set in
different places and reading one alone gives a wrong answer that looks right.

## 13.1 The player — type 0

The player is an ordinary entity in the ordinary array. What makes it the player is
narrow: a handful of code writes two velocity bytes, and everything downstream is
generic.

Spawned with sprite, palette flip set, period **2**, and the alive flag raised. Its
update, in order:

1. **Removal requested?** Clear the alive flag — *that is the whole of dying*. Nothing
   else in the game writes that flag, so death is self-inflicted bookkeeping one tick
   after the hit (§ 11.2).
2. **First update?** Clear the flag, draw, do not move.
3. **Burn fuel** — gated on *both* the round being live and a mission running (§ 16).
4. **Move** by the current velocity pair.
5. **Apply four clamps** (§ 2.5), each zeroing its own axis.
6. Force X even, draw, reload the countdown.

**The clamps live inside this handler, so they run every second tick** — which is what
gives the title-screen demo its half-speed cadence (§ 2.7.3, § 10.5.1).

**The player is invulnerable during the outro.** Its collision response opens with two
gates before it examines anything: it declines damage when the round is not live, and
when the mission counter is zero. The outro clears the round-live flag before driving
the submarine off the screen (§ 11.3) — so the exit animation cannot be spoiled by
whatever is still on screen. The second gate is suspension 1 of § 10.5.2.

## 13.2 The two torpedoes — types 1 and 2

They share a magazine and a death, and nothing else. **The differences are what make one
weapon offensive and the other defensive.**

| | **vertical**, type 1 | **horizontal**, type 2 |
|---|---|---|
| cap in flight | 1 | 1 |
| cooldown | **none** — the cap alone paces it | **6 ticks** |
| launch point | player X + 9, Y − 7 | player X + 28, Y + 3 |
| step / period | **−1 / 1** → 1 px per tick, upward | **+4 / 2** → 2 px per tick, rightward |
| drift | none | ±1 in Y every 5 updates = **10 ticks**, the sign **inherited from the player** — below |
| bounds | removed above row 7 or at row 179 | clamped to rows 45–178; removed past X 308 |
| fire refused when | — | player X is past 304 |
| palette flip | no | yes |
| trail | one dot every 4 ticks | a two-dot blob every other tick |

**The horizontal torpedo inherits half the player's vertical velocity.** Its drift
direction is the player's *current* Y velocity halved — −2, 0 or +2 becoming −1, 0 or
+1 — read **at launch** and never written again. **Fire while climbing and the shot climbs
with you; fire level and it runs flat.** It is the only weapon in the game that reads the
state of the controls at launch.

The drift is not decorative: across a typical run the shot moves about seven rows, so an
implementation that picks a fixed sign gives every shot the same curve and loses the
mechanic outright.

**Only the vertical torpedo can reach a target** (§ 2.4.1). The horizontal one is clamped
to rows 45–178 and misses the lowest surface lane by five pixels; it exists to clear
threats at the player's own depth.

Firing either spends one from the shared magazine and, on an empty magazine, makes a
distinct sound instead of firing — both suspended for the demo (§ 10.5.2, rule 2).

## 13.3 The enemy submarine — type 3

Spawned at a random depth (§ 12.4) from either side on missions 1–2 and from the right
thereafter (§ 8.4). Step 2, period 1.

**Horizontally it does not steer at all.** It crosses at a flat 2 px per tick in the
direction fixed at spawn, and never turns.

**Vertically it closes on the player's depth.** It carries a countdown reloaded to **3**,
and on the tick that countdown expires:

```
if player.y < self.y:   self.y -= 1
elif player.y > self.y: self.y += 1
else:                   do nothing
```

**One pixel, every third tick** — 0.33 px per tick, against 2 px per tick horizontally.
So it converges on the player's depth far more slowly than it crosses the screen, and it
**stops dead when level** rather than oscillating around the target.

The practical shape of that: a submarine spawning far from the player's depth may cross
the whole screen without ever reaching it. It is a threat that has to be given time.

Lethal on contact, worth 100.

It is also a launcher, and its two children are the game's whole projectile threat:

| child | seed | reload | launch point | gate |
|---|---:|---:|---|---|
| **magnetic mine**, type 4 | 40 | 25 | parent X **+ 30** — the *stern* of a 35 px hull steering left | **none: a bare timer** |
| **enemy torpedo**, type 19 | 5 | 80 | parent X **− 8**, Y **+ 3** — ahead of the bow, on the centreline | § 13.5 |

**Both counters are seeded when the submarine spawns, and the seed is not the reload.**
A fresh submarine waits **40** ticks for its first mine and **25** between the rest.
Seeding both from the reload makes every submarine arrive already dangerous.

**And both counters are tested before they are decremented**, which puts the observable
interval one above the number in the table. The acting tick is the one that finds the
counter already at zero, so a reload of N spends N ticks decrementing and acts on the
next. Resolved:

| | first, counting the spawn tick as 0 | thereafter |
|---|---:|---:|
| magnetic mine | tick **41** | every **26** |
| enemy torpedo | tick **6** | every **81** |

A blocked attempt — the class is at its cap — leaves the counter at zero instead of
reloading it, so it retries every tick until a slot frees. That is § 12.2's "a blocked
spawn is pending, not skipped", applied to a launcher rather than a spawner.

Neither counter draws from the generator, so getting these cadences wrong shifts *when*
things appear without shifting *what* the generator hands out afterwards. The § 20.3
tripwire on draws and generator state is what distinguishes the two kinds of error.

Both are capped by the difficulty ladder, and the ladder is what introduces them:
torpedoes on mission 3, mines on mission 4, both on mission 5 (§ 8.3).

**The two are opposites and are best read as a pair:** the mine is laid without aiming
and then follows the player forever; the torpedo is aimed carefully, fired once, and
never looks again.

## 13.4 The magnetic mine — type 4

**Step 2, period 9 — 0.22 px per tick, the slowest-moving object in the game.**

It **homes on the player in both axes** for its entire life: every ninth tick it steps
±2 toward the player's current position. That is a drift rather than a chase, which is
what makes it survivable and what makes it inescapable if ignored — it never stops
coming and it never expires.

Once the player is dead it switches to a straight rightward +2 at period 1 (§ 2.7.2), so
it becomes nine times faster at the moment it stops mattering.

Worth 50. Its death sound and death frames are shared with **the depth charge**.

## 13.5 The enemy torpedo — type 19

### 13.5.1 Firing

Three gates, tested in this order:

1. **A per-submarine countdown.** Seeded to **5** at the submarine's spawn, so it takes
   its first shot almost as soon as it is on screen. Reloaded to **80** — *only on a
   successful shot*.
2. **The global live-torpedo count against the mission cap** (§ 8.2): 3 in missions 3 and
   5, 1 in the demo, 0 elsewhere.
3. **A firing solution: the submarine's X must be greater than or equal to the
   player's.**

Gate 3 is the interesting one. From mission 3 onward the submarine always enters from the
right and travels left (§ 8.4), so this reads as *shoot only while the target is still
ahead of me*. **A submarine that has already passed the player stops firing for the rest
of its run.**

As everywhere else in this engine, **a failed gate exits without reloading** (§ 12.2), so
the countdown sits at zero and retries every tick until the gate opens.

A submarine crossing at 2 px per tick lives about 150 ticks, so it manages **roughly two
shots per pass** — fewer if the player is behind it.

### 13.5.2 Aiming, once

At launch, and only at launch, the drift is chosen by comparing the player's depth
against the muzzle:

| player relative to the muzzle | drift |
|---|---:|
| above | **−1** |
| level | **0** |
| below | **+1** |

That value is stored and **never written again** for the rest of the shot's life.

### 13.5.3 Flying

- **3 px per tick leftward** — thirteen times the mine's speed, half again the player's,
  and the fastest thing in the game except the avenger.
- The drift is applied **every 4 ticks**, clamped to rows 42–171.
- It **expires** when it runs off the left edge — roughly 100 ticks from launch, so a
  torpedo that misses is gone well inside its parent's 80-tick reload.

**The torpedo leads where the player was when it left the tube. Dodge after it is fired
and it sails past.** That is the whole difference between the submarine's two weapons:
*the mine corrects, the torpedo commits.*

### 13.5.4 Contact

Its response exempts exactly two things: the submarine that fired it, and the Giant Clam.
There is no "unless it is dying" clause, so **a torpedo and a mine from the same
submarine destroy each other** — the mine's response agrees from its side. Both weapons
are only ever in the air together in mission 5 and in the demo, and there they do
interfere.

Worth 50. Its death sound and frames are shared with **the player's two torpedoes** — the
game files it as a torpedo, not as ordnance.

## 13.6 The surface classes — types 8, 9, 17

All three ride lanes the player cannot reach (§ 2.4.1) and have nothing to do but exist.

### 13.6.1 Merchant ship — type 9

Step 2, period 7 — **0.29 px per tick**, the longest life of anything in the game at
about 1,075 ticks on screen. Left to right, row 10. Roster-driven (§ 12.5).

It is the only class whose score is mission-scaled, and the only class that counts toward
the quota. It carries its roster slot, which is what lets its death stamp the roster and
decrement the kill counter.

### 13.6.2 Hospital ship — type 8

Step 2, period 3 — 0.67 px per tick. Left to right, row 20. **Lethal on contact, scores
nothing, and cannot be sunk.**

**It deflects the vertical torpedo.** On contact the torpedo's vertical velocity is
negated, its Y snapped to just below the ship's hull, its sprite swapped to the
descending form, and a distinct sound played — with neither party damaged. **The shot is
reflected, not consumed.**

**And a descending torpedo is dangerous to the player.** The player treats its own
vertical torpedo as harmless only while that torpedo is travelling *upward*. Once the
bounce flips the sign, it falls through to the damage path. **Fire straight up beneath a
hospital ship and the shot comes back and kills you.**

**Its own damage path is almost unreachable**, and this is worth stating because the
handler looks protective and is not. It exempts only the vertical torpedo and the ship
slots, and takes damage from everything else — but among *living* entities nothing else
gets to row 20, and the one that can physically reach it is the one type forbidden from
harming it.

**The exception is a wreck, and it is the only way this ship ever sinks.** A death
subtracts a re-anchor and swaps in a larger frame (§ 7.4.2), so a dying entity occupies
rows its living form never visits. A depth charge is the case that reaches: released at
row 31, its death frames are the 21 × 13 tall column re-anchored upward by 5, so an
exploding charge spans rows 26–38 and overlaps this hull's 20–27. Type 18 is not in the
exempt range, so it damages. **A charge destroyed just below a hospital ship sinks it**,
and its full sinking animation (§ 7.4) — otherwise dead artwork — plays.

A reachability argument that considers only living positions concludes this cannot happen;
§ 14.4 is where the mechanism that allows it lives.

**This is the difficulty curve.** The hospital ship cap is the only knob that ramps
monotonically (§ 8.3), so each mission puts more unsinkable obstacles in the layer
between the player and the ships that must be sunk. *The one class you must not attack is
also the one used to obstruct you.*

### 13.6.3 Destroyer — type 17

Step 2, period 5 — 0.40 px per tick, **right to left**, row 30, crossing in about 770
ticks. Worth 150, and killable — but it does **not** count toward the quota, which only
mission-scaled types do.

It is the only type with no collision response of its own (§ 7.2).

It releases **depth charges** at its own X + 18, Y + 1, capped by the ladder and disabled
entirely on mission 1.

## 13.7 The depth charge — type 18

Period 1 — it runs every tick, unlike its parent.

### 13.7.1 Release

Three gates, tested in this order:

1. **The global live count against the mission cap** (§ 8.2). **Zero in mission 1** — a
   mission-1 Destroyer crosses the screen and drops nothing, so a player meets the depth
   charge in the title-screen demo before meeting it in a game.
2. **The Destroyer must not yet have reached the left screen edge.** This is a
   screen-edge test, **not aiming** — the Destroyer may release anywhere else on its run.
3. **A per-Destroyer countdown of 10.** The Destroyer's period is 5, so the real cadence
   is **50 ticks** between drops from one Destroyer. Reloaded only on a successful drop.

With three Destroyers up, the global cap paces the charges rather than the countdown.

The charge appears at **Destroyer X + 18, Y + 1** — row 31, from a hull on row 30.

### 13.7.2 The fuse is the player's depth at the moment of release

At release the charge stores the player's current Y as its fuse depth, sampled **once and
never updated**. Its handler then does nothing but sink toward that depth, and detonates
on arrival.

**So diving after the release defeats it, and holding depth does not.** The fuse test runs
on every tick including the arc, but the release row of 31 is always above any reachable
fuse depth (the player is clamped to 50–175), so it can only fire during the sink.

### 13.7.3 The arc

Three values are seeded at drop time, all from the generator: an **arc index** starting at
28, a **lateral wander direction** of ±2, and a **wander period** of 2–16 ticks.

The arc index steps **down by 4** each tick and selects a delta:

| index | 28 | 24 | 20 | 16 | 12 | 8 | 4 |
|---|---:|---:|---:|---:|---:|---:|---:|
| dX | +2 | +2 | +2 | +2 | +2 | +2 | **+1** |
| dY | 0 | 0 | 0 | 0 | 0 | **+1** | **+3** |

Seven ticks: **+13 px across and +4 down**, ending at row 35. Five steps of pure
horizontal travel, then the fall begins and steepens — **a thrown parabola**, the
trajectory of something rolled off the stern of a moving ship rather than dropped.

The final step's **dX of +1** is the one odd horizontal step in the game whose effect a
player can see — but not on the arc itself, which renders white at either parity. It
lands the charge on an **odd** column, and that is what fixes the hue of the sinking form
it swaps to on the very next tick (§ 6.5, § 13.7.4). Drop the +1 and the charge sinks in
the other colour of its pair.

### 13.7.4 Hitting the water

When the arc index reaches zero, once:

- the sprite swaps to the sinking form;
- **three spray dots** are emitted at X + 3, Y — all with dy = **−2**, dx of −2, 0 and +2,
  lifetime 5 (§ 15.6): a fan thrown **upward**, not backward;
- the splash sound is queued immediately behind them;
- the bubble counter is set to 4.

This is the only event in the entity's life that makes a sound before it dies.

### 13.7.5 Sinking

From row 35:

- **2 px per tick straight down**;
- a **lateral wander** of ±2 once every wander-period ticks — so its horizontal step is
  zero on most ticks;
- a **bubble** — a two-pixel blob at X + 3, Y — every 4 ticks;
- **removed** if the wander carries it outside X 24 … 307.

From row 35 to a fuse depth of 50 is 8 ticks; to 175 it is 70.

### 13.7.6 Detonating, or being shot

Detonation raises the same flag a hit raises, so **a charge that reaches the player's
depth and a charge that is shot die by exactly the same path.**

Its response exempts only the Giant Clam. Everything else destroys it — the player, both
player torpedoes, the enemy submarine's mine and torpedo, and **another depth charge**.
And it is lethal to the player.

**Shooting one looks different from shooting a ship**, and the difference is in the
*torpedo's* handler: ships and the Destroyer consume the torpedo silently, but a depth
charge is on neither list, so the torpedo takes damage too and plays its own death.
*A shot that stops a depth charge explodes; a shot that sinks a ship just disappears.*

Worth 20 — the cheapest scoring type in the game. Its death sound and frames are shared
with **the magnetic mine**, the other laid explosive, and it emits no debris.

## 13.8 The supply chain — types 13, 14, 15, 16

Four entities, one mechanic. **None of them can harm the player** (§ 2.4.2).

### 13.8.1 Supply submarine — type 13

Step 2, period 1. Row 177, left to right, spawned by a fixed 1000-tick timer with no cap
(§ 12.3). Its handler creates the payload and the dolphin **together**.

**The release is on a countdown seeded at the submarine's own spawn: `90 + (a
generator draw & 31)`, so 90–121 ticks, decremented once per tick.** It crosses in 153
ticks, so the drop lands 59% to 79% of the way over — always in the right-hand half of
the screen, with only 30–60 ticks of the parent's run left. After it, the submarine
carries on and leaves; **neither child reads its record again**, which is what makes the
shared block of § 16.5 necessary rather than merely convenient.

The timing is load-bearing rather than decorative. The payload is released at the
parent's X + 10 and is removed once its X falls below 23 (§ 13.8.2), and the parent
spawns at X = 1 — so a release at spawn would put the payload below its own exit bound
before it had moved. **That draw is a consumer § 5.6's list does not name**, and draw
order is normative, so an implementation built from that list alone consumes the shared
generator differently from this one for the rest of the session.

### 13.8.2 Payload and dolphin — types 14 and 15

Released as a pair from the supply submarine: the **payload** at X + 10, **Y − 11**, and
the **dolphin** at X + 5, **Y − 6**. So the dolphin is the lower of the two and is drawn
*beneath* what it carries.

Reaching the payload **restores fuel and torpedoes together** to their starting values
(§ 16).

**The payload rises.** Its vertical velocity is set to **−2** at release, so it climbs at
2 px per tick from row 166. On reaching **row 50** — the player's own ceiling — its
vertical velocity is set to **0** and its Y is clamped there: it holds at 50 and waits.

Two exits follow from that:

- If it would ever pass **row 175** it dies rather than being removed quietly — the same
  state-change path a kill uses, so it explodes.
- It **drifts left at 2 px per tick** for its whole life — during the climb and along
  the ceiling alike — and is removed when that carries it past **X = 23**.

The dolphin and the clam derive their own positions from the payload's every tick
(§ 16.5), so both follow it up.

**Shoot the dolphin and three things happen**, and its response branches on **what
touched it**, not on whether it dies:

| toucher | outcome |
|---|---|
| the player · its own payload | harmless — swimming into it is safe, and the escort cannot hurt its cargo |
| either player torpedo | **the avenger** (§ 13.9) — the only place in the game that creates an entity |
| anything else — a mine, a depth charge, an enemy torpedo | it dies with **no retaliation** |

It scores nothing in any of those cases: type 15's score bytes are both zero, so a torpedo
spent on it buys a dead escort and, usually, an avenger.

**And however it goes, it drops the payload** (§ 16.5) — including the two rows above
that summon no avenger. That is a property of its *removal*, not of being shot.

### 13.8.3 Giant Clam — type 16

**Step 5, period 1 — 5 px per tick, the fastest object in the game.**

It is not on a spawner. The *payload's* handler counts down a release delay and, when it
expires, puts the clam on screen at X = 308 — off the drawable range (§ 2.3), so its
first tick is invisible. It then closes on the payload with **its depth locked to the
payload's Y − 5**.

On contact with the payload it swaps its sprite from open shell to closed and plays a
sound: **it has eaten the resupply.**

**Only the player's two torpedoes can destroy it.** Everything else — the player
included — passes through. It is worth 50.

**The release delay is what makes the clam a mission-long escalation.** A resupply
counter is incremented **twice** per resupply — once when the supply submarine appears
and once when the payload is released. While that counter is below 3, the clam's delay is
255 ticks, which is longer than a payload survives, so the clam never arrives. From then
on the delay is 0–15 ticks.

Because of the double increment the counter takes the values 2, 4, 6 … against a
threshold of 3, so **the first resupply of a mission is clam-free and every later one is
contested almost immediately.**

**Destroying a supply submarine before it releases shifts that parity.** Only the spawn
increment happens, so the counter reaches the threshold a run earlier and **the first
resupply you actually receive that mission arrives contested instead of free.** Nothing
announces it, and there is no way back inside the mission — the counter is reset only at
a mission's start.

## 13.9 The avenger — type 20

**Step 4, period 1 — 4 px per tick.**

It is created **only** by the dolphin's collision response — the one entity in the game
spawned from a collision rather than a spawner — and one is created per dolphin shot,
with **no cap anywhere** (§ 4.7.1).

**The trigger is the torpedo, not the death.** The response branches on which type
touched the dolphin (§ 14.6 row 15), so only the two player torpedoes summon an avenger.
A dolphin killed by a mine, a depth charge or an enemy torpedo dies unanswered — it still
drops the payload (§ 16.5.1), but nothing comes for you. Hanging the creation off the
death sequence instead retaliates for those kills too, which is the natural mistake: the
two coincide for the torpedoes and diverge everywhere else.

Its sprite is **21 × 7 px**. It spawns at **X = 1** — off-screen left — with **its Y
copied from the player's at that instant**, and crosses rightward. It is removed on
passing **X = 307**.

It does not steer: **it re-copies the player's Y every tick**, so it is always exactly at
the player's depth for its whole run.

It is lethal, scores nothing, and is **indestructible** — its collision response declines
damage with no type test at all, so nothing in the game can destroy it. That also makes
its silence marker (§ 7.4) unreachable: the only silent type never gets the chance to be
silent.

**It cannot be killed, cannot be dodged, and cannot be earned.** The only way to avoid it
is not to shoot the dolphin.

## 13.10 What reads the player

Four types read the player's position, and together they are the game's entire sense of
threat. None is announced by its sprite, and three are children of something else.

| type | reads | when | behaviour |
|---|---|---|---|
| 3 enemy submarine | depth | every 3rd tick, for life | steers **vertically only** |
| 4 magnetic mine | position, both axes | every 9th tick, for life | homes — slow, patient, inescapable |
| 18 depth charge | depth | **only at release** | a fuse, not tracking (§ 13.7.2) |
| 19 enemy torpedo | position and depth | **only at launch** | a firing solution, never revised |
| 20 avenger | depth | every tick | does not steer — **copies** the player's depth |

Reading types 3 and 4 as fixed-depth traffic makes the game substantially less dangerous
than it is.

## 13.11 How entities leave

**Every type has a specified exit**, and without them entities accumulate until the array
fills and every class cap locks permanently (§ 4.7).

There are two exits. **Removed** means the slot is freed silently. **Dies** means the
state-change path runs — sound, debris, death animation (§ 9.4) — the same path a kill
takes.

| type | exit |
|---|---|
| 0 player | never leaves by position; removed when the outro's opened right clamp is reached (§ 11.3) |
| 1 vertical torpedo | removed above row 7 or at row 179 |
| 2 horizontal torpedo | removed past **X 308** |
| 3 enemy submarine | removed past **X 308** |
| 4 magnetic mine | removed past **X 310** |
| 8 hospital ship | removed past **X 307** |
| 9 merchant ship | removed past **X 307** |
| 13 supply submarine | removed past **X 307** |
| 14 payload | removed below **X 23**; **dies** if it would pass row 175 (§ 13.8.2) |
| 15 dolphin | travels left; removed when its X passes below zero |
| 16 Giant Clam | travels left; removed when its X passes below zero |
| 17 Destroyer | travels left; removed when its X passes below zero |
| 18 depth charge | removed outside **X 24 … 307**; **dies** on reaching its fuse depth (§ 13.7.6) |
| 19 enemy torpedo | travels left; removed when its X passes below zero — about 100 ticks |
| 20 avenger | removed past **X 307** |

The three that "pass below zero" are the left-travelling classes, whose 16-bit horizontal
step is what detects the crossing. Note the limits are **not** uniform — 307, 308 and 310
all appear — and the differences are real rather than transcription noise: they are per
class and each is a separate constant.

**The magnetic mine is the one that never expires on its own.** Its limit of 310 is
beyond the drawable range (§ 2.3), and since it homes on the player rather than crossing
(§ 13.4), it will normally never approach it. A mine leaves when it kills the player,
when something destroys it, or when the round ends — not by running out of screen.

## 13.12 Normative and free — summary

**Normative:** every step, period, launch offset, reload, cap, bound and gate above · the
player's six-step update order and both invulnerability gates · the torpedo asymmetries
including the vertical's absent cooldown and **the horizontal's drift sign inherited
from the player's velocity at launch** · the hospital ship's deflection and the
descending torpedo becoming lethal · the clam's payload-locked depth and the
double-incremented resupply counter · the avenger's spawn condition, depth-copying and
indestructibility.

**Free:** how handlers are organised in code.

---

# 14. Collision & responses

## 14.1 Two stages

Collision runs **inside the entity walk**, immediately after each entity's own update
(§ 9.4). For the entity just updated — the **subject** — the game sweeps every other live
entity as a **candidate**.

| stage | test |
|---|---|
| 1 | **the box** — an inclusive rectangle overlap |
| 2 | **the confirm** — a pixel-accurate test against `stencil` |

The original carried a stage ahead of these — a screen-pixel pre-filter that rejected
subjects whose draw had landed on nothing. It bought rejection and affected nothing else,
and is not reproduced (§ 1.3).

## 14.2 The box

The subject's rectangle is built from its position and its **sprite's stored byte
width** (§ 6.4):

```
left   = x                     top    = y
right  = x + (byteWidth − 1) × 7        bottom = y + height − 1
```

**Both extents are inclusive.** The candidate's box is built the same way, and the test
is a standard separating-axis rejection on four comparisons.

The sweep **does not stop at the first hit** — one entity can collide with several others
in a single tick, and all of them resolve.

## 14.3 The confirm

Specified in § 3.2. Restated because this is where it is used:

```
confirm = ∃ p ∈ subject footprint :  ink[p] ∧ stencil[p] ∉ { 0, subjectSlot }
```

**The confirm does not reference the candidate.** It asks whether the subject's silhouette
touches *anything that is not itself*, so it is computed once per subject per tick and
cached; the sweep then performs box tests only.

That is not a simplification — it is what the original computes, because its own confirm
measures the whole subject sprite against the whole screen. A consequence follows and is
normative: **a third entity's pixels can confirm a contact between subject and
candidate** whose own silhouettes never met, provided their boxes overlapped.

## 14.4 Response is two-sided

A confirmed contact dispatches **twice** — once with each party as the subject:

```
respond(subject, candidate)
respond(candidate, subject)
```

Each call runs *that type's* response handler, and every handler's first act is to read
**the other party's type** and branch on it. This is why the responses read as
whitelists rather than as rules about the pair.

**A dying entity does not respond — but it can still be responded to.** The skip is per
*side*, not per pair: the dispatch tests the dying flag of the entity it is about to run,
so a wreck stops having opinions while remaining a valid `other` for everything else. The
sweep itself has no flag test of any kind.

**A wreck therefore stays collidable until its slot is freed**, and that is load-bearing
rather than incidental:

- § 14.6's rows 3 and 4 exempt their partners *only while those are not dying*. That
  clause can only ever bite if a dying entity is still swept — filter dying candidates out
  and it becomes unreachable code.
- **A wreck's footprint is not its live one.** The death sequence subtracts a re-anchor
  (§ 7.4.2) and swaps in a death frame that is usually larger, so a wreck occupies rows
  its living form never visits. § 13.6.2 turns on exactly this.

## 14.5 The damage flag defaults to harm

Before dispatching, a damage flag is set to **"this hurts"**. A handler opts *out* by
clearing it.

**The default is harm, and exemption is the exception.** A type with no opinion damages
and is damaged. Getting this backwards makes the entire game harmless.

When the flag survives, the generic outcome runs: award the type's score (§ 7.3) and
raise the entity's state-change flag, which is what triggers its death sound, its debris
and its death animation (§ 9.4, Chapter 15).

## 14.6 The response table

| type | exempts — no damage in that pairing | notes |
|---:|---|---|
| 0 player | horizontal torpedo · supply submarine · dolphin · Giant Clam · **its own vertical torpedo while it is rising** | plus two gates ahead of the whitelist (§ 13.1). The payload diverts to the refuel path |
| 1 vertical torpedo | **the player · another vertical torpedo — both only while this shot is rising** | **deflects** off the hospital ship (§ 13.6.2); consumed by ships and the Destroyer |
| 2 horizontal torpedo | the player · another horizontal torpedo | cannot hit its own launcher |
| 3 enemy submarine | Giant Clam · **its own mine and torpedo, but only while those are not dying** | its children pass through it *alive*; a child that is exploding damages it |
| 4 magnetic mine | Giant Clam · **enemy submarine and another mine, but only while those are not dying** | the same shape from the other side |
| 5–7, 9–12 merchants | **the ship slots — types 5 to 11** | **ships do not sink ships.** Three merchants spawn at X 0–1 on the same row within a few ticks, so without this they overlap on arrival and destroy each other. Then: score, stamp the roster, decrement the quota — **all three suspended in the demo** (§ 10.5.2) |
| 8 hospital ship | vertical torpedo · **the ship slots — types 5 to 11** | reachable only by a **wreck** (§ 13.6.2) |
| 13 supply submarine | the player · payload · dolphin | its own convoy and its customer |
| 14 payload | the player · Giant Clam · **the dolphin** | the dolphin branch is taken first and *also* skips the convoy-state clear (§ 16.5); every other contact clears it |
| 15 dolphin | the player · **its own payload** | **spawns the avenger on contact with either player torpedo** — keyed to the toucher, not to the death (§ 13.9). **Its removal drops the payload** (§ 16.5.1) |
| 16 Giant Clam | everything **except** the two player torpedoes | swaps to the closed shell on contact with the payload |
| 17 Destroyer | — | the generic handler; no behaviour of its own |
| 18 depth charge | Giant Clam | |
| 19 enemy torpedo | enemy submarine · Giant Clam | |
| 20 avenger | **everything, with no type test** | **indestructible** (§ 13.9) |

**Two rows carry a condition the exemption column cannot hold, and it is not the same
condition as § 14.4's.** Rows 3 and 4 exempt their partners only while **the other party
is not dying** — the type test comes first, then a test of that entity's dying flag. So an
exploding mine damages the submarine that laid it, and an exploding submarine damages its
own mine. § 14.4's rule that a dying entity is skipped applies to the **subject**; this is
a separate test on the **candidate**, and the two are easy to conflate. The enemy torpedo
(row 19) has no such clause, which is exactly why § 13.5.4's mine-and-torpedo pair destroy
each other.

**The two "ship slot" ranges are not the same range, and the difference is real.** The
surface classes exempt **5 to 11**, which stops one short of type 12 — itself a vestigial
merchant slot (§ 7.5). The vertical torpedo's own consume list enumerates **5, 6, 7, 9,
10, 11 and 12** individually, skipping 8 because the hospital ship has its own deflect
branch ahead of it. So type 12 is consumed by a torpedo but would not be exempt from
another ship. It is an off-by-one in the original with no consequence, since no type 12
can be created — **reproduce it rather than tidy it**, because making the two agree
invents a consistency the game does not have.

### 14.6.1 The launcher exemption is mutual, and has to be

Rows 0 and 1 carry the **same** gate: the player exempts its own vertical torpedo while
that shot is rising, and the shot exempts the player on the same test. Both read the
torpedo's own vertical velocity, and rising means negative.

**Neither half is optional, because the two overlap on launch.** The shot appears at the
player's Y − 7 and is six rows tall, so it clears the hull by exactly one row — and the
player steps two pixels per update against the torpedo's one. On the first tick the
player updates while ascending, the hull moves into the shot. The pair is dispatched to
both handlers (§ 14.4), so an exemption on one side alone leaves the other side's damage
path live: with only row 0's half, **every torpedo fired while ascending is destroyed on
the tick it is fired**, and the weapon works only while sinking or level.

The gate is on the sign rather than on identity, which is what makes § 13.6.2 work: a
hospital ship negates that velocity, and from then on both halves fall through to the
damage path. A deflected shot kills the player, and the player destroys it.

## 14.7 What the table shows

Reading the column as a whole gives three facts that are not visible type by type:

- **The Giant Clam has the narrowest damage whitelist in the game.** The enemy submarine,
  its mine, its torpedo and the depth charge all name it harmless, and the clam's own
  handler exempts everything but the player's two torpedoes. It is only reachable by the
  two things allowed to hurt it.
- **The hospital ship is its exact mirror**: reachable only by the one type forbidden to
  harm it. One is protected by its whitelist, the other by geometry.
- **The table records exemptions, and two rows do more than exempt.** Row 15 *creates* an
  entity on two of its branches (§ 13.9) and row 14's dolphin branch *skips a state
  clear* (§ 16.5). A row is a branch on the other party's type, not a boolean — and the
  branch a row takes can carry an effect that the exemption column has no space for. Two
  of those effects sit outside this chapter entirely: the dolphin's *removal* drops the
  payload (§ 16.5.1), which no response table can show, because the trigger is not a
  contact at all.

## 14.8 Normative and free — summary

**Normative:** collision running inside the walk · the box formula and its inclusive
extents · the sweep not stopping at the first hit · the confirm of § 14.3 including the
third-party consequence · two-sided dispatch and the skip for dying entities · the damage
flag defaulting to harm · every row of § 14.6 · the mutual launcher exemption of
§ 14.6.1 and its dependence on the torpedo's velocity sign.

**Free:** broad-phase implementation · whether the confirm is cached per tick or
recomputed.

---

# 15. Effects

## 15.1 A second object system

Effects are short-lived visual objects — wakes, trails, splash and explosion debris.
They live in **their own 32-slot allocator**, entirely separate from the entity list, and
are walked once per tick immediately after it (§ 9.3).

The design is the entity list built a second time: 32 slots, eight-byte records, a dense
array compacted by swap-with-last. **One structural difference: this allocator checks its
bound.** A creation request when all 32 slots are full is **dropped silently**. The
entity list has no such test (§ 4.7.1).

**The record shape is the whole difference between the two systems.** An entity record
holds identity and no velocity; an effect record holds velocity and no type:

| field | meaning |
|---|---|
| `x` | 16-bit |
| `y` | |
| `dx`, `dy` | signed per-step velocity |
| `mode` | four packed fields, § 15.2 |
| `stepCountdown` | ticks until the next step |
| `lifetime` | remaining steps |

An effect is fully self-describing — *move by (dx, dy) until the lifetime runs out* —
which is why the effects walk is one loop with **no dispatch table and no per-type code
anywhere behind it**.

**Effects never enter the stencil.** § 3.1's cells hold an *entity's* slot and § 3.3
maintains them inside the *entity* walk, so nothing an effect draws can be collided with
and Chapter 14 cannot see one. A trail dot is a picture and nothing else.

## 15.2 The mode byte

| field | job |
|---|---|
| step-delay reload | the value `stepCountdown` reloads to after each step |
| just-created | set at creation; the walk tests it, clears it, and **skips straight to the bounds test**, so an effect appears at its spawn position before it first moves — or, born outside the rectangle, is reaped there having never been drawn (§ 15.3) |
| sprite select | which of the four sprites (§ 15.4) |
| **palette flip** | **one of the two sprite-select bits, reused** — so it is not independently settable |

That last overlap has a consequence: **a sprite reachable only with that bit set is
always drawn flipped.** The spark cluster and the streak are in that position; the blob
and the dot are never flipped.

## 15.3 The update

```
if just-created:            clear the flag, and jump to the bounds test
stepCountdown -= 1
if stepCountdown != 0:      draw and return          # not time to step
lifetime -= 1
if lifetime exhausted:      die
x += dx ; y += dy
if outside the bounds rectangle:  die
draw, and reload stepCountdown
```

Dying erases the effect and compacts the array by swap-with-last, exactly as § 4.6.

**The first walk skips the move but not the clip.** A just-created effect joins the
sequence above *at the bounds test*, not at the draw — so one born outside the rectangle
dies on its first visit and is never seen, and one born inside is drawn and reloads its
countdown like any other. This is reachable, not a corner: § 15.8 offsets debris up to
27 px right of the dying entity, so a Destroyer killed near the right edge simply loses
the two records that carry that offset.

**The bounds rectangle is deliberately wider than the screen**, so effects drift off the
edges before they are reaped:

| edge | limit | in screen terms |
|---|---:|---|
| top | row **7** | — |
| bottom | row **181** | — |
| left | world X **6** | 22 px beyond the left edge |
| right | world X **330** | 23 px beyond the right edge |

All four are inclusive: an effect survives while `6 ≤ x ≤ 330` and `7 ≤ y ≤ 181`, and
dies on the walk that first puts it outside. X is the world coordinate of § 2.3 — the
same one the effect was seeded from — and Y is the screen row.

**Take these as four numbers, not as one symmetric margin.** The slack is 22 px on the
left and **23** on the right; § 2.3's visible span ends at 307, so deriving both sides
from a single "22 px beyond the edge" puts the right cull one pixel inside where the
game puts it.

## 15.4 The four sprites

| sprite | shape | flip | parity |
|---|---|---|---|
| **dot** | a single pixel | never | fixed by its creator (§ 15.5) |
| **blob** | two adjacent pixels — so it renders white (§ 6.3) | never | no hue, so none applies |
| **spark cluster** | four pixels over four rows | always | **live** — see below |
| **streak** | a white pair followed by alternating pixels | always | fixed by its creator (§ 15.5) |

These are the only artwork in the game outside the main sprite set.

**Flip is not free here — it is a consequence of the sprite select.** § 15.2's mode byte
uses one bit for both, so a sprite reachable only with that bit set is always drawn
flipped, and the other two never are.

**This system forces no parity.** The death frames do (§ 7.4.1); the effects walk of
§ 15.3 steps, moves, clips and draws, and never touches the low bit of X. So an effect's
parity is whatever its creator's X plus a constant offset makes it, and it survives only
while the object's `dx` is even.

That splits the four sprites three ways:

- **The blob has no hue at all** — two adjacent pixels render white — so neither bit
  reaches it.
- **The dot and the streak bake once per parity, and the creation site picks.** Both sit
  at odd offsets from their parents, so which variant applies depends on the parent;
  § 15.5 gives the outcomes. Neither ever moves on an odd `dx`, so the choice holds for
  the object's whole life.
- **The debris bakes once per parity and the *draw* picks, on the particle's current X.**
  Four of the twelve template records of § 15.8 carry an odd `dx`, so those particles
  change column parity every step and change hue as they fly. **This is the only
  draw-time colour decision in the game**, and it is the exception § 6.5 names.

## 15.5 Who creates what

| creator | sprite | offset from parent | velocity | lifetime | parity |
|---|---|---|---|---:|---|
| death burst | spark cluster | per template | radial fan, up to ±6 | 3–18 | **live** |
| vertical torpedo | dot | X+1, Y+7 rising / Y−1 falling | none | 1 | even |
| horizontal torpedo | blob | X, Y+1 | none | 1 | — |
| depth charge, water entry | dot × 3 | X+3, Y | dy = −2 for all three; dx = −2, 0, +2 | **5** | even |
| depth charge, sinking | blob | X+3, Y | none | 1 | — |
| enemy torpedo | dot | X+7, Y+1 | none | 1 | **odd** |
| hospital ship · merchants · Destroyer | streak | Y+7, under the hull | none | 1 | both — below |

A dash is the blob, which renders white and has no parity to fix. The two dot rows land
even because both parents sit at odd X and both offsets are odd; the enemy torpedo's is
odd because that parent sits at even X. The splash's three velocities are all even, so
those dots keep the parity they are born at for their whole five ticks.

**Almost every effect is a stationary mark, re-created each time its parent updates** —
which is why they track their parent exactly and need no following logic. Only the death
burst and the depth charge's splash have velocity. The lifetimes above are counts of
**steps**; how long a mark stands before taking its one step is its step delay, and
§ 15.9 gives one per creation site.

Two details that are easy to get backwards:

- **A ship's wake goes off its stern, and the stern depends on direction.** The hospital
  ship and the merchants travel right, so their wake is placed 7 px to the **left**; the
  Destroyer travels left, so its wake is placed 29 px to the **right**. The right-travelling
  ships also suppress the mark while still too close to the left edge to subtract: the
  subtraction is 16-bit and the wake is skipped outright when it would borrow — that is,
  whenever the ship's world X is below 7.
- **A wake therefore inverts its parent's parity**, because both stern offsets are odd.
  The hospital ship and the Destroyer travel at even X, so their wakes are odd; the
  merchant roster spawns records at **both** parities (§ 12.5), so merchant wakes occur
  at both. The record that spawned the ship picks the variant.
- **Wakes are not made every tick.** Each is created once per *parent update*, and those
  parents are divided down — so a wake is a single mark for one tick in every 3 (hospital
  ship), 5 (Destroyer) or 7 (merchant).

## 15.6 The splash is thrown upward

All three of the depth charge's water-entry dots carry **dy = −2** and differ only in
`dx` (−2, 0, +2), with a lifetime of 5. It is a three-way fan thrown **upward** at the
moment the charge enters the water — not anything thrown backward. Its sound is queued
at the same moment.

## 15.7 The three torpedo trails

All three torpedoes trail, all three through this allocator, and **no two the same way.**
Each mark has a lifetime of 1 — but a lifetime is a count of *steps*, and a mark stands
for its own step delay (§ 15.9) before taking that step. That delay is what turns the
spacing column below into a visible trail: **31 for the vertical shot, so eight dots**,
10 for the horizontal, 5 for the enemy's.

| torpedo | cadence | sprite | offset | spacing |
|---|---|---|---|---:|
| vertical | a counter, every 4th tick | dot | X+1, Y+7 rising / Y−1 falling | 4 px |
| horizontal | a toggle, every 2nd **update** — **from the first** | blob | X, Y+1 | 8 px |
| enemy | a toggle, every 2nd **update** — **from the second** | dot | X+7, Y+1 | 6 px |

**Both toggles flip once per update, not once per tick, and the spacing column is what
says so.** The enemy torpedo's period is 1, so for it the two are the same thing — but
the horizontal torpedo's period is 2, so its toggle flips every second tick and its mark
falls every fourth. At 2 px per tick that is the 8 px given here; reading the cadence as
ticks would halve it to 4. Where the two columns can be read against each other, the
spacing is the one to trust: it is the observable.

The two toggles are seeded to **opposite** values, so the player's horizontal torpedo
lays its first mark on the tick it is fired and the enemy's waits a tick. Every offset
puts the mark *behind* the shot, and the vertical torpedo's flips with the shot when a
hospital ship reverses it (§ 13.6.2).

## 15.8 The death burst

Raised by the state-change step of § 9.4 when an entity dies. The **debris count comes
from the entity's definition record** (§ 7.4) — 12 for the player, 7 for a submarine, 5
for a ship, 0 for everything else.

**Particles are table-driven, not generated.** One twelve-record template table is shared
by every type, and a type consumes **the first *n* records**, where *n* is its debris
count. Each record is an offset and a velocity, made absolute by adding the **dying
entity's** position outright:

| # | X off | Y off | dx | dy | life | direction |
|---:|---:|---:|---:|---:|---:|---|
| 0 | −3 | +2 | −5 | 0 | 5 | left |
| 1 | +1 | −4 | −3 | −4 | 4 | up-left |
| 2 | +18 | −4 | 0 | −5 | 6 | up |
| 3 | +27 | −4 | +4 | −1 | 3 | right |
| 4 | +27 | +6 | +4 | +4 | 4 | down-right |
| 5 | +14 | +6 | 0 | +5 | 7 | down |
| 6 | −3 | +6 | −6 | +4 | 6 | down-left |
| 7 | +2 | −4 | −5 | −3 | 15 | up-left, long-lived |
| 8 | +20 | −4 | 0 | −6 | 10 | up |
| 9 | +27 | +4 | +4 | 0 | 18 | right, longest-lived |
| 10 | +17 | +6 | 0 | +4 | 12 | down |
| 11 | +4 | +6 | −5 | +4 | 16 | down-left |

So the **order matters**: a five-particle ship throws records 0–4 — left, up-left, up,
right, down-right — and never the long-lived ones. Only the player, at twelve, uses the
whole table. That is why bigger deaths look different in kind rather than merely in
count.

**Eleven carry the spark-cluster sprite; record 8 carries the blob.** Its mode byte
selects a different one of § 15.4's four, and being a different sprite it is also the one
record drawn unflipped. Since a type takes the first *n* records, record 8 is reached only
at a debris count of nine or more — so the player's twelve-particle death is the only one
that contains it, and it renders white among eleven coloured sparks.

**Four records carry an odd `dx`** — 0, 1, 7 and 11, at −5, −3, −5 and −5. Those particles
change column parity on every step, which is what makes the debris the one object whose
colour is chosen at draw time (§ 15.4).

The dying entity's own animation runs at period 4 (§ 2.7.1), independently.

## 15.9 The step delay — and why trails are trails

**A mark's lifetime is 1 STEP; its step delay is what decides how long it stands.**
Every effect carries a delay of its own, and an effect does not take its first step —
and a lifetime-1 mark therefore does not die — until that delay has run. The delay is
set on the effect's **first walk**, not at creation: a new effect skips the countdown,
the lifetime and the move on that first visit, is clipped (§ 15.3), drawn, and ends it
by loading the countdown from its own delay.

So a trail's length is `delay ÷ cadence` marks, and each creation site chooses its own:

| mark | delay | cadence | marks visible |
|---|---:|---:|---|
| **vertical torpedo dot** | **31** | every 4 ticks | **8 dots**, 4 px apart |
| horizontal torpedo blob | 10 | every 4 ticks | ~3 blobs, 8 px apart |
| enemy torpedo dot | 5 | every 2 ticks | ~3 dots, 6 px apart |
| ship wake | **its parent's update period** | once per parent update | **exactly one** |
| depth-charge splash | 2 | once, on entry | the fan steps almost at once |
| depth-charge bubble | 16 | every 4 ticks | ~4 |
| death-burst debris | 1 | once, on death | steps every tick |

**The wake row is the one that shows the design.** A wake's delay is the divider of the
ship that laid it, so a ship holds exactly one wake mark: the old one expires as the next
parent update lays the next. That is why a wake reads as a mark under the hull while a
torpedo's reads as a trail behind it — the same allocator, the same lifetime of 1, and a
different delay.

**The vertical torpedo is the number to check a port against.** 31 against a 4-tick
cadence and a 1 px/tick climb is eight dots, evenly spaced, with the oldest dropping off
as each new one appears. A port that renders one blinking dot has taken the delay from
the wrong field; a port whose trail grows the length of the screen has taken it from the
creation template.

**The creation template's step-countdown field is dead, and looks alive.** The template
is copied whole into each new record, and ten of the eleven creation sites never fill
that one field — so a record is born holding whatever the last death burst left, or a
filler byte before there has been one. It never matters: the first walk overwrites it
from the delay above before it is ever decremented. Reading the copy and stopping there
predicts marks that stand for the filler value, which is not what the game does.

## 15.10 Normative and free — summary

**Normative:** effects being a separate 32-slot allocator that drops on overflow · the
record shape and the absence of any per-effect type · the mode byte's four fields and the
sprite-select/palette-flip overlap · the update order of § 15.3, **including the first
walk's clip** · the bounds rectangle's **four literal limits** · every creator in § 15.5
including the direction-dependent wake and the divided cadence ·
the splash's upward fan · all three trail cadences and the opposite seeding · debris
counts from the definition table · **this system forcing no parity**, the per-creator
parities of § 15.5, and the debris's draw-time parity choice · record 8 being a blob.

**Free:** storage layout · § 15.9's initial countdown, which is specified rather than
inherited.

---

# 16. Scoring, fuel & the supply chain

## 16.1 Score

Score is **three bytes of binary-coded decimal — six digits**. All arithmetic is decimal
(§ 1.3); the sentinel of § 7.3 only means anything in that representation.

The high score is three more bytes of the same shape.

**The high score is committed on entry to the title screen, not when a game ends.** The
comparison runs most-significant byte first, and copies when the stored record loses. So
a player watching the end-of-game drain (§ 11.4) is still looking at the previous record;
theirs appears as the title screen comes up.

Score is zeroed when a new game starts (§ 10.4), not between missions.

## 16.2 Fuel

| | |
|---|---|
| representation | **two bytes of BCD — four digits** |
| starting value | **1200** |
| burn amount | **10**, subtracted as a decimal pair |
| burn interval | every **9 player updates** |
| endurance | 120 burns × 18 ticks = **2160 ticks**, about 72 seconds at 30 Hz |

**The burn interval is the divider trap in its purest form.** The countdown decrements
once per *player update*, and the player's period is 2 (§ 2.7) — so a burn is 9 updates
but **18 ticks**. Reading the interval as ticks halves the endurance.

The burn is gated on **both** the round being live and a mission running. The second gate
is suspension 6 of § 10.5.2 — the demo never runs dry.

Fuel reaching zero ends the round and **costs a submarine** (§ 11.3).

## 16.3 Torpedoes

A single count, **starting at 30**, shared by both weapons — there is no separate
magazine for the vertical and horizontal torpedo (§ 13.2). Firing either spends one.
Firing on empty makes a distinct sound and no shot.

Running out does **not** end the round: a player with no torpedoes and fuel remaining can
still reach a resupply.

## 16.4 The resupply

Contact with the payload **restores fuel and torpedoes to their starting values** — 1200
and 30. It is a *restore*, not an addition: collecting a payload with fuel remaining
does not bank the surplus, and there is no way to exceed the starting values.

The exchange also queues a distinct sound, redraws both gauges, and does no damage in
either direction.

**The guard against a dying payload gates the refuel, not the contact — and the
difference is a submarine.** A payload that is already dying cannot be collected twice,
which is what the guard is for; but it does *not* stop being an object the player has
run into. The contact keeps the harmful default of § 14.5, so **a payload the player
destroyed is lethal for as long as its death animation runs**. Shoot your own resupply
and swim through the debris and it costs a life.

Only the player is hurt by it. The payload's own side of the two-sided dispatch is
dropped by the dying test of § 14.4, so the wreck takes no further damage and the
exchange is one-way.

An implementation that reads the guard as covering the whole contact loses a real
hazard and makes destroying your own resupply free. An implementation that widens it
from *dying* to *flagged for removal* makes the opposite error, and a worse one: the
payload raises its own removal flag on this very contact, so with both sides swept
(§ 14.4) the dispatch order would decide whether the tanks refill — and collecting a
payload would kill the player about half the time.

## 16.5 The convoy is one object in four records

The supply submarine, payload, dolphin and Giant Clam are coupled through **a small block
of shared state that carries the payload's position and motion**. The dolphin and the
clam do not track the payload — they **derive their own position from it every tick**:

| entity | placement |
|---|---|
| dolphin | payload X − 5, **payload Y + 5** — below what it carries |
| Giant Clam | **payload Y − 5**, closing horizontally at 5 px per tick |

**That coupling is the resupply mechanic, not an optimisation** (§ 1.3). The clam's depth
being locked to the payload is what makes the race a pure horizontal contest: it cannot
miss vertically, so the only question is whether it arrives before the player does.

The payload's own collision response clears the shared "a payload exists" flag on any
contact except with the dolphin — which is what ends the convoy whether the player
collected it, the clam ate it, or it was destroyed.

**Ending the convoy is not the same as removing the cargo, and being taken does both.**
On contact with **the player or the Giant Clam** the payload also raises its own removal
flag and vanishes — no score, no death frames, no debris — before declining the damage.
Clearing the flag alone leaves the entity alive and still reading the shared block, so a
cargo that has been collected or eaten goes on drifting: floating up at the release
velocity, or sinking at 4 px per tick if the dolphin had already been shot (§ 16.5.1).
Anything *else* that touches it takes the damaging fall-through instead and it dies
properly, which is the one case that does play frames. **That same dolphin branch also makes
the contact harmless**, so the escort can touch what it carries without either ending the
run or destroying it.

### 16.5.1 The dolphin's departure drops the payload

**When the dolphin is removed, its handler rewrites the shared block before it goes:**

| field | becomes | effect |
|---|---|---|
| payload dY | **+4** | it stops climbing and plummets at 4 px per tick |
| payload dX | **0** | it stops drifting left entirely |

Three things follow, and the third is the point:

- **With dX at 0 the payload can no longer reach its own exit at X = 23**, so the
  row-175 test of § 13.8.2 is the only outcome left: it explodes. From the ceiling at row
  50 that is **32 ticks** — the whole window you have to reach it.
- **This is a property of the dolphin's REMOVAL, not of its death.** The write sits in
  the standard removal handoff — the same "requested → confirmed" branch every type has —
  ahead of the handoff rather than on a separate death path. So it fires however the
  dolphin leaves: shot, killed by a mine or a depth charge, or swimming off the left edge
  once orphaned. The last of those is inert, because by then there is no payload.
- **The write is unconditional** — it does not test whether a payload exists. An
  implementation may not add that test: it is harmless only because a release re-seeds
  both components (§ 13.8.2), and a conditional version would behave identically while
  claiming a coupling the original does not have.

**The clam's removal does nothing of the kind.** Its handler carries the plain handoff
with no writes to the shared block, so killing the clam leaves the resupply untouched.
The asymmetry is the design: the escort's life is what the cargo depends on.

## 16.6 The readouts

Three values appear on the HUD line (§ 2.4), drawn through one shared digit routine:

| readout | shown |
|---|---|
| score | always |
| high score | always |
| `FUEL:` | during a round |
| `TORP:` | during a round |

Both gauges are redrawn when their value changes — on every burn, on every shot, and on
a resupply — and are set up during round setup (§ 11.1.1). Between rounds the same HUD
line carries the `SUBS` display instead. Chapter 19 specifies the layout.

## 16.7 Normative and free — summary

**Normative:** three-byte BCD score and decimal arithmetic throughout · the high score
committed on entry to the title screen · fuel's starting value, burn amount, and the
9-update / 18-tick interval · fuel exhaustion costing a submarine · one shared magazine of
30 · resupply restoring rather than adding, and its dying-payload guard · the convoy's
derived positions and the clam's payload-locked depth.

**Free:** how BCD is implemented · gauge rendering.

---

# 17. Renderer

## 17.1 The renderer reads state; the simulation never draws

Nothing in `core/` produces a picture (§ 1.5). Once per tick, after the walks, the
renderer reads the entity list, the effects list and the session state, and composites
`color` from them.

**`color` is rebuilt from state every tick.** There is no incremental update, no dirty
region and no second page. This is what allows the original's page-flip and catch-up
machinery to be absent rather than replaced (§ 9.6).

The renderer never touches `stencil` — that is simulation state, written during the walk
(§ 3.3), and the renderer neither reads nor writes it.

## 17.2 Compositing order

| # | layer | source |
|---:|---|---|
| 1 | clear to background, palette index 0 | — |
| 2 | **the waterline** | § 3.5 |
| 3 | **entities**, in slot order 0 … liveCount−1 | § 4.1 |
| 4 | **effects**, in slot order | Chapter 15 |
| 5 | **the HUD line** | § 16.6, Chapter 19 |
| 6 | **banners and messages**, if posted | § 11.3, § 10.5.1 |

**The waterline goes down before the entities, so objects crossing the surface occlude
it** — a torpedo passing through the sea surface is visible, and leaves a gap in the line
while it crosses. Drawing it afterwards would hide anything on row 38.

**Effects composite over entities** because the effects walk runs after the entity walk
(§ 9.3), and their content — sparks, wakes, trails — reads correctly on top.

**Entity order is slot order**, which is the same order the walk uses. Slot order changes
when an entity is removed (§ 4.6), so overlap order is observable and follows from the
array rather than from any depth value. There is no z-ordering in this game.

## 17.3 Drawing one sprite

```
for each pixel of the sprite's colour bitmap:
    if the source index is 0:  skip          # index 0 is transparent
    dst = (x − 28 + column, y + row)         # § 2.3
    if dst is outside 280 × 192:  skip       # ordinary rectangle clip
    color[dst] = source index
```

Three things this must not become:

- **No shifting, and no per-position sprite variants.** Both buffers are one byte per
  pixel, so any X is a byte offset (§ 6.1).
- **No colour decisions.** Each sprite already carries the palette indices it draws in,
  chosen when it was baked (§ 6.5). The renderer copies indices; it does not compute
  them.
- **Use the sprite's `color` array, not its `ink`.** They share a bounding box but are
  filled differently — colour appears in the gaps between isolated pixels (§ 6.3).

## 17.4 The stencil and the picture agree

`stencil` is maintained incrementally, only when an entity updates (§ 3.3); `color` is
rebuilt in full every tick. They do not fall out of step, because an entity that did not
update did not move — so the position the renderer draws it at is the position its
stencil footprint already occupies.

Stated because the asymmetry looks like a bug and is not, and because "fixing" it in
either direction breaks something: rebuilding `stencil` every tick changes collision
ordering (§ 3.3), and updating `color` incrementally reintroduces the problem § 9.6
describes.

## 17.5 Presenting

`color` becomes pixels through a palette lookup into an RGBA image, once per rendered
frame, and is presented to a canvas.

The display surface is **280 × 192**. Scaling is free (§ 1.3); integer scaling keeps the
art sharp, and the original's display was 4:3, so a 4:3 presentation is closest to how it
was seen. Neither is normative.

The indexed-texture GPU path is a later substitution for this section alone. It needs no
change anywhere else: `color` is already the texture it wants, and nothing outside this
chapter reads it.

## 17.6 Every live entity is drawn every tick

**An entity skipped by its divider is still drawn.** The divider governs whether an
entity *updates*, never whether it *appears* — and most entities are skipped on most
ticks (§ 2.7.1: a merchant ship updates once in seven).

A renderer that draws only entities that updated this tick produces a game in which
almost everything flickers or vanishes. This is the single most likely way to
mis-implement this chapter, because the divider is so prominent in the simulation
chapters that carrying it into rendering feels natural.

The same holds for effects: an effect that has not stepped is still drawn.

## 17.7 Normative and free — summary

**Normative:** the renderer reading state and never being driven by the simulation ·
`color` rebuilt each tick · the compositing order of § 17.2, waterline beneath entities
and effects above them · entity order being slot order · index 0 transparent · the
rectangle clip · drawing from `color` rather than `ink` · **every live entity and effect
drawn every tick regardless of its divider**.

**Free:** scaling, aspect and filtering · the presentation path · whether `color` is
double-buffered.

---

# 18. Audio

## 18.1 The device is a one-bit speaker

The game's entire audio output is **a cone that can be flipped between two positions**.
There is no amplitude, no waveform storage, no mixing and no second voice. Every sound in
the game is manufactured out of *how often* the cone is flipped and *for how long*.

So a sound is nothing but frequency and rhythm, and the whole sound design follows from
that constraint.

## 18.2 A sound is a list of (pitch, duration) pairs

Each pair is one burst of square wave.

```
half-period (cycles) = 5 × pitch + 24
frequency (Hz)       = 1,020,484 / (2 × (5 × pitch + 24))
burst length (s)     = duration × (5 × pitch + 24) / 1,020,484
```

`duration` counts **half-periods** — cone flips — not milliseconds.

**Pitch is inverse to frequency**: a larger pitch value is a lower note.

| pitch | frequency |
|---:|---:|
| 8 | 7,972 Hz — the highest the game uses |
| 15 | 5,154 Hz |
| 100 | 974 Hz |
| 200 | 498 Hz |
| 250 | 401 Hz — the lowest |

A sequence is a list of such pairs, terminated by a pitch of zero.

## 18.3 One pair per tick

**Exactly one pair is consumed per tick** (§ 9.3) — not one sound, and never two. A
sequence is therefore a *frame envelope*, not a waveform: **a 32-pair sound occupies 32
ticks**, a little over a second.

Bursts are short relative to a tick — the longest single burst in the game is 40 ms and
most are under 10 — so each tick produces **one short burst followed by silence**. That
burst-and-gap texture is what the game actually sounds like, and a continuous tone is
wrong.

## 18.4 The queue

Sounds are appended to a ring holding **128 pair-slots**, with separate read and write
cursors, both kept on pair boundaries.

**Nothing is ever pre-empted.** Appending starts at the *write* cursor and never touches
the read cursor, so a new sound is queued **behind** whatever is still sounding and waits
its turn.

This is the opposite of the obvious design, and it is normative. One speaker makes mixing
impossible, so the expected behaviour is for a new sound to cut off the old one. This
does not:

- **The audio lags the picture under load.** The player's own death occupies 32 ticks —
  about a second — and anything queued behind it waits that whole span. Sink three
  merchant ships in one tick and you have banked 24 ticks of audio describing an event
  that has already finished.
- **A full queue does not drop the newest sound.** With no bounds test, a write cursor
  that catches the read cursor either *overwrites unplayed pairs in place* — turning one
  sequence into a different one partway through — or lands exactly on it, at which point
  the queue reads as **empty and the entire backlog is discarded in one tick**.

Reaching that takes a sustained pile-up: the queue drains one pair per tick while a
multi-kill tick can add twenty-odd, so several chaotic ticks in a row are needed to bank
128 pairs — over four seconds of backlog. **The trade is the opposite of the obvious one:
pre-emption keeps audio tight at the cost of losing sounds; this never loses a sound
until it loses all of them at once.**

**The queue is flushed only between rounds**, never during play.

## 18.5 The eighteen sequences

Pairs are `pitch,duration`. This is the complete data.

| # | pairs | sequence |
|---:|---:|---|
| 0 | 4 | `25,20 20,20 15,20 10,20` |
| 1 | 3 | `8,16 16,16 24,16` |
| 2 | 2 | `15,10 15,10` |
| 3 | 1 | `100,20` |
| 4 | 8 | `250,5 237,3 225,4 212,3 200,5 187,3 175,4 167,3` |
| 5 | 8 | `167,3 175,5 187,4 200,3 212,4 225,2 237,3 250,5` |
| 6 | 12 | `100,4 75,4 105,4 75,4 112,4 80,4 70,4 100,4 125,4 75,4 62,4 100,4` |
| 7 | 12 | `50,8 35,8 50,8 35,8 56,8 40,8 35,8 50,8 63,8 36,8 31,8 50,8` |
| 8 | 4 | `10,20 15,20 20,20 25,20` |
| 9 | 4 | `25,40 20,40 15,40 10,40` |
| 10 | 24 | `200,3 175,4 210,3 150,5 250,4 210,3 180,5 150,3 165,3 195,4 220,3 240,3 250,2 205,4 180,3 145,5 155,2 190,4 220,3 245,4 230,3 200,4 175,3 150,4` |
| 11 | 8 | `250,4 220,5 180,3 150,4 160,4 190,3 220,4 245,3` |
| 12 | 8 | `150,5 180,4 220,4 250,3 245,2 215,4 175,3 150,3` |
| 13 | 32 | `200,5 175,3 210,3 150,2 225,4 160,3 140,4 200,5 250,2 150,3 125,3 200,3 200,3 175,4 210,4 150,5 225,4 160,3 140,4 200,2 250,3 150,4 125,5 200,2 200,3 175,3 210,4 150,3 225,3 160,4 140,5 200,3` |
| 14 | 4 | `100,3 85,3 105,3 75,3` |
| 15 | 32 | `200,4` × 32 |
| 16 | 4 | `100,3 85,3 105,3 75,3` — **the same sequence as 14** |
| 17 | 1 | `15,200` |

## 18.6 What plays when

**Nine sounds are death sounds and are not selected by an event at all** — each is the
sound field of a type's definition record (§ 7.4), played when an entity of that type is
destroyed:

| # | destroyed entity |
|---:|---|
| 4 | hospital ship · merchant ship |
| 5 | Destroyer |
| 6 | magnetic mine · depth charge |
| 7 | **all three torpedoes** — both of the player's and the enemy's |
| 11 | enemy submarine |
| 12 | supply submarine |
| 13 | **the player** |
| 14 | dolphin · Giant Clam |
| 16 | the payload |
| — | the avenger is **silent** — and unreachably so (§ 13.9) |

**Eight are events**, played from a specific site:

| # | event |
|---:|---|
| 0 | the depth charge **hitting the water** — queued with the splash (§ 15.6) |
| 1 | torpedo away, either weapon |
| 2 | the hospital ship **deflecting** a vertical torpedo (§ 13.6.2) |
| 3 | firing on an **empty magazine** |
| 8 | the Giant Clam closing on the payload (§ 13.8.3) |
| 9 | **refuelling** (§ 16.4) |
| 15 | `MISSION COMPLETE` (§ 11.3) |
| 17 | the launch animation (§ 11.1.1) |

**Sound 10 is an orphan.** Twenty-four pairs, fully formed, the longest sequence after
the two 32-pair ones — and nothing selects it. No event plays it and it is no type's
death sound. It is specified here for completeness; an implementation should ship it and
never play it.

## 18.7 They were written as a set

Worth knowing, because it tells you when a transcription is wrong:

- **0 and 8 are exact inverses** — the same four pairs in reverse order.
- **9 is 0 with the durations doubled**: the refuel note is the splash, drawn out.
- **4 and 5 mirror each other** in pitch across the same range; their durations do not
  mirror.
- **6 and 7 share an identical twelve-step contour**, transposed almost exactly an octave
  apart — 7 is the torpedo sound, 6 the ordnance sound.
- **11 and 12 mirror each other.**
- **13, the player's death, is that same twelve-pitch motif repeated** with varying
  durations and cut off at 32 pairs. The most elaborate sound in the game is a repeat of
  the shape used for everything else.
- **14 and 16 are one sequence**, shared rather than duplicated.
- **15 is a single pitch repeated 32 times** — a steady tone held for a second.

## 18.8 Muting

A sound setting is toggled by an input (Chapter 19) and has three states in effect:
**on**, **off**, and a third that suppresses playback entirely.

**The title screen is silent, but the demo keeps queueing.** Playback is suppressed while
the mission counter is zero, and the queue is flushed when a game starts — so whatever
the demo piled up is discarded rather than heard.

The consequence for the toggle: on the title screen it can only set a **preference**,
which takes effect when a game begins. Chapter 19 specifies the input.

## 18.9 Synthesis

Playback belongs to `presentation/` (§ 1.5). The core owns the queue and hands out one
pair per tick; it does not own a sample buffer.

**Model the device, not the tone.** Hold a one-bit cone state and flip it every
`5 × pitch + 24` CPU cycles at 1,020,484 Hz, `duration` times, then return to rest until
the next pair arrives. This reproduces the pitches exactly and the burst-and-gap texture
of § 18.3 for free.

A gentle one-pole low-pass approximates the physical cone; tunable, on by default.

**Playing a sound must cost no tick time.** The original's player blocked, which is why
its audio was frame time; ours runs off-thread and the simulation never waits for it.
The lag of § 18.4 must survive that change — it lives in the queue, not in the playback.

## 18.10 Normative and free — summary

**Normative:** the pitch-to-frequency formula and duration counting half-periods · one
pair per tick · the append-only, never-pre-empting queue and its 128-pair capacity · the
overflow behaviours · flushing only between rounds · all eighteen sequences · every
assignment in § 18.6, including the orphan and the silent type · the title screen being
silent while still queueing.

**Free:** the synthesis path and audio device · the low-pass · buffer sizes.

---

# 19. Input & HUD

## 19.1 One seam

**All input reaches the simulation as a single pair of per-axis velocities**, each one of
three values: −2, 0 or +2. Nothing downstream knows where they came from.

The pair has exactly three writers, and only one is active at a time:

| writer | when |
|---|---|
| the keyboard table | keyboard control |
| the analogue axes | gamepad control |
| the demo's bounce | the title screen (§ 10.5.1) |

That seam is the entire mechanism by which one engine serves both the demo and a played
game (§ 10.1). Everything after it — the player's handler, the clamps, the renderer — is
common.

## 19.2 Two control models

The two schemes differ in *feel*, not just in device, and **both are normative** (§ 1.3):

| | **keyboard** | **gamepad** |
|---|---|---|
| model | **latched** — a direction persists until another replaces it | **hold-to-move** — axes written every tick, zero included |
| stopping | requires the dedicated stop key | release to centre |

A latched scheme needs an explicit stop and a held one does not, which is why the
keyboard layout carries a ninth movement key that the gamepad has no use for.

## 19.3 Choosing a scheme

**The scheme is chosen by how the game is started, and never changes for that session**
(§ 10.5.3):

| starting input | scheme |
|---|---|
| the start key | keyboard |
| the primary fire button | gamepad — debounced: the button must be seen released first |

While one scheme is selected the other's controls are inert: under keyboard control the
fire buttons do nothing, and under gamepad control the movement and fire keys do nothing.

## 19.4 The keyboard

Movement is a **3 × 3 block of keys whose geometry is the direction they command**, with
the centre key as stop:

```
      Y    U    I           (−2,−2)  ( 0,−2)  (+2,−2)
      H    J    K           (−2, 0)  ( 0, 0)  (+2, 0)
      N    M    ,           (−2,+2)  ( 0,+2)  (+2,+2)
```

| key | fires |
|---|---|
| **D** | the vertical torpedo |
| **F** | the horizontal torpedo |

Eleven bindings in total — nine directions and two weapons.

**Latched means a direction key is consumed once and its velocity persists.** Holding the
key does nothing extra; releasing it does nothing at all. Only the most recent input
survives, so a flurry of presses collapses to one (§ 10.6).

**Bindings are fixed.** The original ships a live rebinding editor; this specification
does not, and the table above is the layout. The bindings remain a table, so an editor is
an additive change.

## 19.5 The gamepad

The gamepad drives the **analogue** scheme. A D-pad maps directly; a stick maps through a
deadzone.

**The bucketing to −1 / 0 / +1 per axis happens in `platform/`.** The core sees only
those three values, scaled to the ±2 of § 19.1 — no analogue magnitude ever reaches it,
which is what keeps § 1.6's integer-only rule intact. Passing through stick magnitude
would break the step-÷-divider speed model of § 2.7 and change how the submarine moves.

| button | fires |
|---|---|
| primary face button | the **horizontal** torpedo |
| secondary face button | the **vertical** torpedo |

That pairing is the original's and reads backwards to a modern player, whose expectation
is that the primary button is the primary weapon. It is kept deliberately; swapping it is
a one-line change.

**Axis inversion is not provided.** The original offers it because analogue sticks of its
era had no wiring convention; standard gamepad mapping fixes the axis senses, so pushing
up moves the submarine up with no configuration.

## 19.6 Controls live in both schemes

These sit ahead of every scheme and mode test, so they work while playing, under either
scheme, **and while the demo is running**:

| control | effect |
|---|---|
| pause | holds until any input |
| sound toggle | § 19.7 |

## 19.7 The sound toggle has two layers

The toggle **always** flips a stored preference. It copies that preference to the live
setting **only while a mission is running.**

So on the title screen it can set a preference but cannot change what is heard — and
since the title screen is silent anyway (§ 18.8), there is nothing there to change. The
preference takes effect when a game begins.

## 19.8 Input is polled once per tick

Only the two loops of § 9.2 poll input. **The transitions of Chapter 11 — the launch, the
fly-in, the outro drain — poll nothing** (§ 10.6), which is what makes the outro
unstoppable.

**Input during a transition is deferred, not discarded.** It is consumed by the first poll
after play resumes and takes effect on the round's opening tick.

## 19.9 The HUD

A single line at **row 185** (§ 2.4), below everything the game can reach. It has **three
states**, and they replace one another rather than coexisting:

| state | contents |
|---|---|
| title screen and demo | `HIGH SCORE` and its value, left · `SCORE` and its value, right |
| round setup | `SUBS` and one icon per spare submarine (§ 11.1.1) |
| during a round | `FUEL:` and its value · `TORP:` and its value · `SCORE` and its value |

**The high score appears only on the title screen**, which is consistent with its being
committed on entry to that screen (§ 16.1).

### 19.9.1 Exact layout

The line occupies **rows 185–191**. Every position below is a screen X range; labels are
the strips of § 6.6.1, values are digits.

**Title screen and demo:**

```
 0                118 119        160        175      237 238        279
├──── HIGH SCORE ──┤├─ 6 digits ─┤          ├─ SCORE ─┤├─ 6 digits ──┤
```

**During a round:**

```
 0                                        146   154   167  175      237 238      279
├── FUEL: ──┤├ 4 digits ┤├── TORP: ────────┤     ├ 2 dig ┤├─ SCORE ─┤├─ 6 digits ┤
      0-55      56-83         84-146             154-167
```

**Round setup:** the `SUBS` strip at 0–48, followed by one spare-submarine icon per
reserve (§ 19.9.3).

Digit fields, as byte columns of seven pixels:

| field | byte columns | screen x | digits | source |
|---|---|---|---:|---|
| fuel | 8–11 | 56–83 | 4 | two BCD bytes, most significant first |
| torpedoes | 22–23 | 154–167 | 2 | one BCD byte |
| high score | 17–22 | 119–160 | 6 | three BCD bytes, most significant first |
| score | 34–39 | 238–279 | 6 | three BCD bytes, most significant first |

**Labels and their values are exactly adjacent.** `HIGH SCORE` ends at 118 and its digits
begin at 119; `SCORE` ends at 237 and its digits begin at 238. The layout has no slack in
it, so a label of the wrong width collides with its own value.

### 19.9.2 The erase bar stops at 175

Switching between HUD states is done by drawing a blank bar over the line. **It spans
0–174 — precisely up to where `SCORE` begins.**

So the bar clears `HIGH SCORE`, `SUBS`, `FUEL:`/`TORP:` and every digit field left of it,
while **`SCORE` and its six digits are never erased and never redrawn on a state change.**
The score label is drawn once at start-up and survives every transition.

That is why the score sits at the right-hand end: it is the one readout common to all
three states, so the bar is sized to stop short of it.

**Every field is fixed-width by construction.** Values are BCD with a fixed byte count, so
leading zeros are drawn and no field ever changes length — nothing on the HUD shifts
position as values change.

Each field is redrawn when its value changes: fuel on every burn and on resupply,
torpedoes on every shot and on resupply, score on every kill. The high score is redrawn
only on entry to the title screen (§ 16.1).

### 19.9.3 The spare-submarine icons

Drawn during round setup, one per spare submarine, **beginning at screen X 56** and
stepping **30 pixels** between them. **The icon is the player's own sprite**, not a
separate asset — the same bitmap the game draws in the water, placed on the HUD line.

X 56 is byte column 8 — the same column the fuel gauge occupies in the next state, so
the rack and the gauge that replaces it start at the same place.

The launch animation then lifts the last icon off the line and flies it to the player's
start position (§ 11.1.1).

## 19.10 Banners and messages

Text outside the HUD line reaches the screen by **two different paths**, and which path a
strip uses determines both how it is removed and whether it changes colour.

### 19.10.1 Two paths

**The message stack** — used by the demo messages, the `MISSION` banner and
`MISSION COMPLETE`.

Posting pushes a strip onto a stack and draws it; erasing pops the top entry and undraws
it. Messages nest: posting a second does not remove the first, and erasing removes the
most recent. Erasing an empty stack does nothing.

**Each post also flips that strip's palette, permanently.** The flip is written back into
the strip itself, so the *next* post starts from the flipped value and flips again — a
stack-posted strip therefore **alternates between its two colours every time it is
shown**. The `MISSION` banner is a different colour every round; the demo messages cycle
through both of their colours as well as through each other.

**Direct blit** — used by `OUT OF FUEL` and `GAME OVER`.

These bypass the stack entirely: they are drawn where their header says, in their fixed
colour, with **no palette flip and no stack entry**. Because nothing on the stack
represents them, they must be erased explicitly — which is what the unconditional erase
at the end of the drain (§ 11.4) is for.

### 19.10.2 Where each appears

Three row bands are used, and only three:

| rows | strips |
|---|---|
| **0 – 6**, the top line | `MISSION` + numeral · `MISSION COMPLETE` · both demo messages |
| **90 – 96**, mid-screen | `GAME OVER` |
| **105 – 111** | `OUT OF FUEL` |

Screen X for each is in § 6.6.1. **`GAME OVER` and `OUT OF FUEL` occupy different rows and
can both be shown at once**, and `GAME OVER` overlaps nothing else: the player is clamped
to rows 50–175, but by the time the banner appears the outro has already driven it off the
screen.

### 19.10.3 When each is posted

| strip | path | shown | removed |
|---|---|---|---|
| demo message A / B | stack | on each horizontal bounce of the demo submarine, alternating | by the next post |
| `MISSION` + numeral | stack | round setup, every round (§ 11.1) | at the next round setup, **or on return to the title screen** |
| `MISSION COMPLETE` | stack | the outro, on a cleared mission (§ 11.3) | **end of the drain**, and specifically *not* by the next setup's erase |
| `OUT OF FUEL` | direct | **every pass** of the drain loop, while the tanks-empty flag is set | explicit erase, end of drain |
| `GAME OVER` | direct | **every pass** of the drain loop, while the game-over flag is set | explicit erase, end of drain |

**The two direct-blit banners are redrawn on every pass of the drain loop** (§ 11.4), up
to twenty times — the loop re-tests both flags each time round rather than drawing once
before it starts. **This is invisible**: drawing composites the strip into the same
position with the same content, so every pass after the first changes nothing. It is a
consequence of the loop's shape, not an effect.

At the end of the drain both are erased **unconditionally**, whether they were ever
shown or not.

**Each removal above happens at its own named moment, and a cleared round needs two of
them.** Setup posts the `MISSION` banner and the outro posts `MISSION COMPLETE`, so a
round that is won puts *two* strips on the stack. If only one is removed, the survivor is
the old `MISSION` banner and the next setup draws the new one straight over it — two
mission titles on the same seven rows, one more with every mission. So the drain's end
removes `MISSION COMPLETE` **specifically**, not merely the topmost entry, and the setup
that follows removes the banner underneath it.

**Returning to the title screen removes everything posted.** The title screen is a screen
being rebuilt, not a continuation, so no banner outlives the game it belonged to. **The
palette flips are not reset with it** — a flip belongs to the strip, so the `MISSION`
banner goes on alternating colour across games and not merely across the rounds of one.

**The winning frame carries `MISSION COMPLETE` at the top and `GAME OVER` across the
middle simultaneously** (§ 11.6). That is the only visual difference between winning the
game and losing it.

## 19.11 Normative and free — summary

**Normative:** the single velocity-pair seam and its three writers · both control models
and their difference · the scheme being locked by how the game starts, and the other
scheme's controls being inert · the eleven keyboard bindings and the 3 × 3 geometry ·
latched semantics · analogue bucketing happening outside the core · the button pairing ·
the sound toggle's two layers · input polled only by the two loops, and deferred through
transitions · the HUD's three states and every position in § 19.9.1 · the erase bar
stopping at 175 and the score surviving state changes · the icons being the player
sprite · the message stack and its palette flip · every row band and posting rule of
§ 19.10.

**Free:** key rebinding, if added · gamepad deadzone size · font rendering.

---

# 20. Oracles

## 20.1 Why these exist

A specification can only be checked against an implementation by someone who has read
both, and that reader is usually the implementer — who will read the specification the
same way twice. **An oracle checks the implementation against something that is not a
reading.**

Four are available here, and they exist because of two properties established earlier:
the core is **deterministic** (§ 1.6) and it runs with **no renderer and no platform
attached** (§ 1.5). Give up either and this chapter goes with it.

They are listed in increasing cost, and § 20.7 gives the order to bring them up.

## 20.2 Oracle 1 — the generator

**Cost: a unit test. No simulation required.**

Assert all of the following against Chapter 5:

| assertion | expected |
|---|---|
| the first twelve values from the initial state | `0x72 0xFF 0x8C 0xB8 0xD0 0xD0 0xB8 0x8C 0xFE 0xF3 0x06 0xF1` |
| the period from the initial state | **32767** |
| in-degree histogram over all 65536 states | `{0: 32768, 2: 32768}` |
| distinct cycle lengths | `{1, 32767}` |
| size of the image after one step | **32768** |

**This is the single most consequential thing that can be wrong**, because everything
random in the game descends from it and nothing about a wrong generator looks wrong. A
game with a subtly different generator plays plausibly and matches no other oracle.

The last three assertions are exhaustive over the state space and take a moment to run.
They are worth keeping: they catch a generator that produces the right first dozen values
and diverges later.

## 20.3 Oracle 2 — cold-boot spawn cadence

**Cost: the spawners, the entity list and the session state. No player, no collision, no
rendering.**

The five spawn cooldowns are shipped constants that **nothing resets between rounds or
missions** (§ 12.3), so the opening of the first demo after a cold start is exact:

| tick | first spawn |
|---:|---|
| **1** | supply submarine |
| **46** | hospital ship |
| **51** | enemy submarine |
| **51** | Destroyer |
| **201** | merchant ship |

Two failure signatures worth recognising:

- **Everything one tick early** means the cooldown is being tested before it is
  decremented. A cooldown of *n* fires on tick *n + 1*.
- **The enemy submarine and Destroyer disagreeing** means one of them is reloading its
  cooldown on a blocked spawn (§ 12.2).

This oracle also exercises the shared generator's **draw order** (§ 5.6): the enemy
submarine takes two draws for its depth and one for its cooldown, so a spawner that draws
the wrong number of times desynchronises every later spawn without changing this table.

## 20.4 Oracle 3 — the demo submarine's trajectory

**Cost: the player entity, the clamps and the attract loop. Still no collision and no
rendering.**

**Nothing random touches the demo submarine's path.** It is spawned at a fixed position
with fixed direction seeds and moves only by the bounce rule of § 10.5.1, so its
trajectory is exactly reproducible *independently of whether Oracle 1 passes*. That
isolation is what makes it valuable: it tests the divider, the clamps and the loop order
and nothing else.

From a cold start the demo submarine begins at **X = 28, Y = 160** with both direction
seeds at **−2**. Assert:

| event | ticks |
|---|---|
| message posts, i.e. horizontal bounces | **1, 256, 510, 764, 1018** |
| vertical bounces | **1, 18, 144, 270, 396** |

Steady-state intervals are **254** horizontal and **126** vertical. The first interval
differs on both axes because the submarine does not start centred.

**The failure signature is diagnostic**, not merely a mismatch:

| observed | cause |
|---|---|
| **1, 129, 256, 383** and **1, 10, 73, 136** | the player's **divider of 2 has been dropped** — the handler is running every tick |
| correct intervals, wrong first interval | wrong start position |
| horizontal correct, vertical wrong | a clamp bound is wrong (§ 2.5) |

The divider case is the one this oracle exists for. Every interval is very close to half
the correct value, which is exactly the kind of error that looks like a plausible game
and is wrong everywhere.

## 20.5 Oracle 4 — golden frames

**Cost: everything, including the renderer.**

The whole game is deterministic from cold boot until the first input, so a captured frame
at a fixed tick count is a genuine reference for the renderer as well as the core.

Capture `color` — not a screenshot of a scaled window — at several fixed tick counts and
compare byte for byte. Comparing the buffer rather than the presented image keeps the
test independent of § 17.5's free choices.

**Bring this up last.** It is the slowest to diagnose: a single wrong pixel can come from
any chapter, and Oracles 1–3 localise most failures before this one is worth running.

## 20.6 Invariants worth asserting continuously

Cheap to check on every tick while developing, and each catches a class of error the
oracles above would only find indirectly:

| invariant | protects |
|---|---|
| the entity array is dense, and `liveCount ≤ 32` | § 4.6's swap-with-last |
| each class counter equals the live population of that class | § 4.5's two-phase removal — **this is the one that catches a collapsed handoff** |
| the effects count never exceeds 32 | § 15.1 |
| every score and fuel nibble is 0–9 | § 1.3's decimal arithmetic |
| the sound queue advances by exactly one pair per tick | § 18.3 |
| `stencil` holds only 0 or the slot + 1 of a live entity | § 3.3's incremental maintenance |

The class-counter invariant deserves its place: a collapsed two-phase removal produces no
visible symptom until a class silently stops spawning for the rest of the session, which
is close to undiagnosable from play.

## 20.7 Derived timings

Not oracles — consequences, useful as sanity checks once the game runs:

| quantity | expected |
|---|---:|
| fuel endurance, full tank untouched | **2160 ticks** |
| a Destroyer crossing the screen | ~770 ticks |
| a merchant ship crossing the screen | ~1075 ticks |
| the player's death sound | 32 ticks |

**Fuel endurance halving to 1080 is the divider trap** (§ 16.2) — the burn interval is 9
player *updates*, which is 18 ticks.

## 20.8 The order to bring them up

Matching the order the chapters build in:

1. **Oracle 1** — before anything else exists. Pure unit test.
2. **Oracle 2** — once the entity list, spawners and session state work.
3. **Oracle 3** — once the player entity and its clamps exist.
4. **The invariants of § 20.6** — from the first entity onward, kept on during
   development.
5. **Oracle 4** — last, once 1–3 pass and a renderer exists.

Nothing before step 5 needs a pixel on screen.

## 20.9 Normative and free — summary

**Normative:** every expected value in § 20.2, § 20.3 and § 20.4 · the derived timings of
§ 20.7.

**Free:** test framework · how frames are captured and compared · whether the invariants
ship in release builds.
