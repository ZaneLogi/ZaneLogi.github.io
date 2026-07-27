# Throng — Game Design & Implementation Specification

A complete, self-contained specification for a real-time puzzle game: its rules, its
simulation, its data formats and its conformance criteria.

**Status:** in progress. Written — Chapters 1–6 (the contract, the substrate, and level
data), Chapter 9 (foot anchors — pulled forward from the otherwise-deferred asset pipeline
because the simulation depends on them), Chapters 11–20 (the complete simulation), and
Chapters 21–23 and 25 (rendering, the skill panel & HUD, the screen flow, and input &
camera, at requirements altitude). Stubs — Chapters 7, 8 and 10 (the rest of the asset
pipeline: decompression, piece geometry, packs) and Chapters 24 and 26–28 (audio, and the
verification chapters). The simulation is fully specified, foot anchors included. The only
data input the running simulation consumes is the destruction-mask bitmaps (Chapter 16) —
their dimensions are given here, their pixel patterns supplied alongside. Terrain piece
masks (Chapter 8) are **not** a simulation dependency: a level hands the simulation a
finished terrain buffer (§3.6), and pieces are needed only to *build* that buffer — by the
interchange importer (Chapter 6) or by levels authored as piece-placement lists — never by
the simulation that reads it.

**How to read this document:** it is the sole authority for the implementation. It
assumes no prior familiarity with the game — Chapter 1 introduces it from nothing —
and no access to any other material. Every data table, enum value and constant the
implementation needs is inlined here or in this document's accompanying data files.
Where a chapter is still a stub, that promise is not yet kept — treat stubs as "not
yet specified", never as "not needed".

---

## Table of contents

**Part 0 — Contract**

1. [Scope & conformance contract](#1-scope--conformance-contract) ✅

**Part I — Substrate**

2. [Coordinates & timing](#2-coordinates--timing) ✅
3. [The terrain bitmap is the collision geometry](#3-the-terrain-bitmap-is-the-collision-geometry) ✅
4. [The object map](#4-the-object-map) ✅

**Part II — Level data & geometry**

5. [Level model](#5-level-model) ✅
6. [The interchange level format](#6-the-interchange-level-format) ✅
7. [Interchange archive format & compression](#7-interchange-archive-format--compression) — stub
8. [Piece geometry & world construction](#8-piece-geometry--world-construction) — stub
9. [Animation metadata & foot anchors](#9-animation-metadata--foot-anchors) ✅ *(foot-anchor table only; rest of the pipeline deferred)*
10. [Level packs, ordering & codes](#10-level-packs-ordering--codes) — stub

**Part III — Simulation**

11. [Game state & the lemming record](#11-game-state--the-lemming-record) ✅
12. [Frame update order](#12-frame-update-order) ✅
13. [Spawning & release rate](#13-spawning--release-rate) ✅
14. [The action state machine](#14-the-action-state-machine) ✅
15. [The action handlers](#15-the-action-handlers) ✅
16. [Terrain modification](#16-terrain-modification) ✅
17. [Object interaction](#17-object-interaction) ✅
18. [Skill assignment](#18-skill-assignment) ✅
19. [Nuke, timer, end conditions & scoring](#19-nuke-timer-end-conditions--scoring) ✅
20. [Rule variants & compatibility flags](#20-rule-variants--compatibility-flags) ✅

**Part IV — Presentation & shell**

21. [Rendering](#21-rendering) ✅
22. [Skill panel & HUD](#22-skill-panel--hud) ✅
23. [Screen flow](#23-screen-flow) ✅
24. [Audio](#24-audio) — stub
25. [Input & camera](#25-input--camera) ✅

**Part V — Verification**

26. [Replay format & determinism](#26-replay-format--determinism) — stub
27. [Acceptance tests](#27-acceptance-tests) — stub
28. [Appendix: glossary & constants index](#28-appendix-glossary--constants-index) — stub

---

# 1. Scope & conformance contract

## 1.1 Purpose and audience

This document specifies **Throng**, a single-player real-time puzzle game, in enough
detail to be implemented from scratch. It is written for an implementer with no
prior exposure to the game and no access to any other description of it.

Two things follow from that, and they govern how the rest of the document is
written:

- **Every behaviour is stated, never referenced.** Where the specification gives a
  number — a fall distance, a frame count, a pixel offset — that number is
  normative because this document states it. There is no external authority to
  consult and no "obvious" default to fall back on. If something an implementer
  needs is absent, that is a defect in this document, to be fixed here.
- **Behaviour is specified exhaustively; presentation is not specified at all.**
  §1.3 draws that line precisely. It is the single most important thing to
  internalise before reading further, because the two halves of this document have
  completely different force: Parts I–III are requirements to the pixel, and Parts
  IV are requirements only about *what the player can see and do*, leaving how it
  looks entirely open.

**Only two things are deferred to a downstream implementation spec: the target
platform and the implementation language** (together with the rendering technology
bound to them). Everything else this document either specifies as normative or
deliberately leaves to the implementer's *design* — and where it leaves something to
design, it still reveals the requirements, slots and reference data that design must
satisfy (§1.3). Nothing else is "left to the implementation": if a behaviour or a
piece of content is not pinned here, that is because it is genuinely the implementer's
to author, not because it was omitted. An omission is a defect, per the first bullet;
a design freedom is not.

An implementation conforms when it passes the tests in Chapter 27.

## 1.2 The game in brief

The player is given a **level**: a wide, scrolling two-dimensional landscape made of
solid terrain, with one or more **entrances** and at least one **exit**.

A stream of small creatures — **lemmings** — emerges from the entrance at a
controllable rate. A lemming has no intelligence and takes no direction. It walks
forward until something stops it, turns around at walls it cannot climb, falls when
the ground ends, and dies if it falls far enough. Left alone, a level's lemmings
will almost always walk into a hazard or a dead end.

The player never controls a lemming directly. Instead the player spends a **budget
of skills**, fixed per level, by clicking an individual lemming to permanently
change what it does. There are eight:

| Skill | Effect |
|---|---|
| **Climber** | Permanent trait — the lemming scales vertical walls instead of turning at them |
| **Floater** | Permanent trait — the lemming descends slowly and survives any fall |
| **Blocker** | The lemming stops walking and turns back any lemming that touches it |
| **Bomber** | The lemming counts down and explodes, destroying terrain around it and itself |
| **Builder** | The lemming lays a limited staircase of bricks upward and forward |
| **Basher** | The lemming tunnels horizontally through terrain |
| **Miner** | The lemming tunnels diagonally downward through terrain |
| **Digger** | The lemming tunnels straight down through terrain |

The last five **destroy or create terrain**, permanently altering the landscape for
every lemming that follows. This is the core of the game: the player is not solving
a path for one creature but reshaping the level so that a stream of unthinking
creatures routes itself to the exit.

The landscape also contains **hazards** that the player must route around or
neutralise: traps that kill a lemming that touches them, water that drowns,
fire-like objects that incinerate. Some terrain is **steel** and cannot be
destroyed; some walls are marked **one-way** and can only be tunnelled from one
side.

The player has three further controls: the **release rate**, which speeds up or
slows the stream from the entrance; **pause**; and the **nuke**, which detonates
every remaining lemming at once and ends the attempt.

A level states how many lemmings will emerge and what proportion must reach the exit
to win. A countdown **timer** bounds the attempt. The level ends when the timer
expires, when the nuke completes, or when no lemmings remain in play; the player
wins if at least the required number reached the exit.

The whole game is that loop. The depth is entirely in the interaction between the
skills, the terrain they reshape, and the fact that the lemmings keep coming.

## 1.3 The conformance contract

> **The simulation is specified exhaustively and must be reproduced exactly.
> The presentation is specified only by what it must convey.**

Everything this document does not explicitly settle is decided by that split. What
follows sorts into four kinds: two are normative — and one of those, geometry that
looks like art, is where most mistakes are made (§1.4) — while the rest is not
reproduced, dividing into *authored*, *incidental*, and *deferred*.

### Normative — simulation behaviour

These must match this specification exactly. They are the conformance surface.

| Category | Examples |
|---|---|
| Positions | every lemming's integer foot (x, y) on every frame |
| Terrain state | which pixels are solid, after every mask, brick and dig operation |
| Animation state | which animation and which frame index a lemming is in, per frame |
| Timing | frame counts for every action, trap, countdown, and the level timer |
| Selection | which lemming a click at a given cursor position assigns to |
| Outcome | lemmings saved, percentage, win/lose, and the frame each occurs on |
| Cue timing | which sound event fires, and on which frame |

"Animation state" is normative while the *artwork* of that animation is not. The
frame index is simulation state — it gates transitions, drives the builder's brick
placement and the basher's mask application — so it must match exactly. What that
frame is drawn as is the implementation's choice.

### Normative — geometry that arrives looking like art

Covered in full in §1.4. This is the category that gets misfiled.

### Not reproduced — authored, incidental, deferred

What this document does not pin is not uniform, and the differences matter. *Authored*
content is the implementer's to design and is the clone's whole identity; *incidental*
choices are internal and invisible; *deferred* items are the only ones that leave this
document at all.

| Category | Examples | Kind |
|---|---|---|
| Art | sprite pixels, palettes, colour schemes, terrain and object appearance | Authored |
| Audio | sound design, music, mixing — the *cue frames* are normative, the sounds are not | Authored |
| UI appearance | panel styling, fonts, cursor art, screen decoration | Authored |
| Representation | how the terrain buffer, object map and level model are stored in memory | Incidental |
| Structure | class layout, module boundaries, naming, file organisation | Incidental |
| Off-simulation work | asset caching, file I/O, threading, save files, level serialisation | Incidental |
| Rendering & display tech | graphics API, layers, resolution, scaling, dirty-rect strategy | Incidental |
| Platform & language | the target platform and the implementation language | Deferred |

- **Authored is not "unspecified".** The implementer designs the look and sound, but
  this document still reveals the *slots* that design fills: which animations exist and
  how their frames are timed (Chapters 14–15), the foot anchors (Chapter 9), the mask shapes
  (Chapter 8), the cue frames (Chapter 24), the panel readouts (Chapter 22), and the
  supplied palettes as reference (Chapter 8). Appearance is free; the scaffold it hangs
  on is normative.
- **Incidental choices cannot be "wrong"** as long as the normative behaviour above is
  reproduced. Representation, code structure and the rendering mechanism are the
  implementation's own business, invisible to the player and to the conformance tests.
- **Deferred is exactly two items** — platform and language (§1.1, §1.7) — and nothing
  else is ever deferred to the implementation spec.

For brevity, later chapters often call all three kinds collectively **free**. When they
do, the kind is always one of these three; it is *deferred* only where platform or
language is named explicitly.

Why the simulation is pinned so tightly: the game is decided by exact integers.
Whether a basher reaches a gap, whether a builder's staircase clears a ledge,
whether a walker fits through a tunnel — each is a comparison of whole pixel
coordinates, and each determines whether a level can be solved at all. A one-pixel
deviation does not produce a slightly different game; it produces a game in which
some levels are unsolvable and others become trivial. Nothing downstream of those
comparisons has that property, which is why everything downstream is free.

## 1.4 Where the line runs: geometry is behaviour, art is not

The most consequential thing to get right about this project is that **much of what
arrives looking like artwork is actually physics.** Misfiling it as art — "we are
drawing our own sprites, so the supplied graphics data is optional" — silently
breaks the simulation while every individual decision looks defensible.

The game has no geometric shape model. Its world is a **pixel buffer**, and "is
there ground here?" is answered by reading a pixel (Chapter 3). Anything that writes
into that buffer is therefore defining collision geometry, whatever it looks like:

| Arrives as | Actually is | Normative? |
|---|---|---|
| A terrain piece's bitmap | The solid-pixel mask a level is assembled from | **Yes** — shape only |
| A terrain piece's colours | Decoration over that mask | No |
| An object's bitmap | Decoration | No |
| An object's trigger rectangle | Where the exit, trap or water actually acts | **Yes** |
| A lemming animation's pixels | Decoration | No |
| A lemming animation's foot anchor | The offset positioning the lemming and the cursor hit box | **Yes** |
| A bash / mine / explosion mask bitmap | The exact set of pixels destroyed | **Yes** — shape only |
| A sprite's width and height | Nothing the simulation reads | No |

Three worked consequences:

**Terrain piece shapes are normative.** A level is a list of *(piece id, x, y,
flags)* — it carries no geometry of its own. The solid pixels of a level are
determined entirely by the referenced pieces' masks. Two implementations that
disagree about one piece's mask by a single pixel are playing different levels. The
masks are supplied data (Chapter 8), not art to be redrawn. Their *colours* may be
discarded and replaced freely.

**Destruction masks are normative.** A basher removes exactly the pixels its mask
covers. Redrawing that mask "close enough" changes tunnel height, which changes
whether a walker fits, which changes which levels are solvable.

**Foot anchors are normative, and reach further than drawing.** Each animation
carries an anchor offset mapping a lemming's logical foot position to its sprite. It
is not merely a drawing convenience: the cursor hit box is a fixed 13 × 13
rectangle placed relative to that anchor, so the anchor table decides *which lemming
a click selects* — a normative behaviour per §1.3. Because the box is a fixed size
derived from the anchor rather than from the artwork, sprites may be any size the
implementation likes; the anchor numbers may not change. Chapter 9 tabulates them.

The practical rule: **the supplied geometry is data, the appearance is a blank
canvas.**

## 1.5 Layer scope

### Layer A — Simulation (specified exhaustively)

The deterministic core: terrain bitmap, object map, lemming list, the 18 action
handlers, terrain modification, object triggers, skill assignment, spawning, and end
conditions. **Chapters 2–4 and 11–20.**

The bulk of the document and the bulk of the risk. Specified down to individual
pixel probes — "test the pixel at (x + 8, y − 6)" — because per §1.3 nothing coarser
is sufficient.

### Layer B — Level data & geometry (specified in full)

The runtime level model, an importer for the interchange level format, and the
normative geometry — piece masks, trigger rectangles, animation anchors — that
levels are assembled from. **Chapters 5–10.**

This layer has two faces: the **level model** (Chapter 5) is the runtime authority —
the fields the simulation reads, defined by their meaning and range, not by any byte
layout — and the **interchange format** (Chapter 6) is a fixed external file format,
read-only input that the importer converts into the model. How an implementation
serialises the model for its own authored levels is free (§1.5, Layer C); only the
model's content is normative. What the importer must preserve is §1.4's "Yes" column
exactly; what it may discard is everything else.

### Layer C — Presentation & shell (specified as requirements)

The frame pump, screen flow (menu → level preview → play → results), skill panel,
input, camera and audio. **Chapters 21–25.**

These chapters state *what the player can see and do*, and what the simulation
requires of them — chiefly that the shell drive the simulation at a fixed step and
never feed it wall-clock time (§1.6). Beyond that they constrain nothing. These are
the chapters with the most design latitude in the document, and they should read as
requirements, not as descriptions of any particular implementation.

Explicitly out of scope, with no chapter: level browsers, configuration dialogs,
frame export, and developer cheats. An implementation may provide them; nothing here
constrains them.

## 1.6 Determinism

**The simulation must be a pure function of (level, rule flags, input stream).**
Given the same level and the same sequence of player inputs stamped with frame
numbers, two conforming implementations must produce identical game state on every
frame — and the same implementation must do so on every run, on every machine.

This is not a quality goal. It is the property that makes Chapter 26's replays usable
as a conformance suite, and it is the only practical way to verify Layer A: a
supplied replay plus its expected outcome is a mechanically checkable test, where
play-testing would only ever produce an opinion.

Four hard rules follow:

1. **Integer arithmetic only in the simulation.** No floating point anywhere a result
   can reach game state. Floating point is permitted only in things the simulation
   never reads — a frames-per-second readout, an audio volume.
2. **No random number source in the simulation.** The game has none. Everything that
   appears random is table-driven — notably the explosion particle scatter, which is
   a fixed 51 × 80 table of signed byte offsets (Chapter 21), and the floater's
   descent rates, which are a fixed table (Chapter 15). An implementation that
   reaches for a PRNG has misread the specification.
3. **No wall-clock time in the simulation.** The simulation advances in discrete
   frames. Real elapsed time may decide *when* the shell calls the step function and
   how many times, but must never be an input *to* it. Frame-rate-independent
   movement is a defect here, not a feature.
4. **Iteration order is part of the specification.** Lemmings are processed in list
   order, and list order is determined by spawn order. Because lemmings interact
   through shared state — the terrain bitmap and blocker fields — a changed order
   produces different results. Chapter 12 fixes the order of every phase within a
   frame; it is normative, not descriptive.

A corollary: a conforming implementation must be steppable **without rendering**.
Chapter 26's seek-to-frame and Chapter 27's headless tests both require it, so the
simulation must not call into the renderer, and the renderer must derive everything
it draws from simulation state after the fact. Given §1.3's split this is natural —
the renderer is downstream of the simulation by construction.

## 1.7 Target platform and language

Platform, language and rendering technology are deliberately **out of scope for this
document.** Choosing them is an implementation-spec concern, not a design one: §1.3
places platform, language and rendering in the free column, and §1.6 requires that
nothing the simulation computes depend on any of them. For this document to pick one
would contradict its own contract.

Nothing in Chapters 2–20 depends on the choice — the simulation is plain integer logic
over a byte buffer — and Chapters 21–25 are written as platform-agnostic requirements
(*what* the player must see and do), not as concrete rendering, input or audio APIs.
So the choice can be deferred to the implementation without leaving any chapter here
under-specified.

The implementation is free to record its own decision. As a non-binding starting
point, a browser + canvas target with ES6 modules and no build step suits the shape of
the problem well: the world is 1584 × 160 pixels (Chapter 2), the simulation is a
per-frame pass over a small pixel buffer, and roughly 17 frames per second is not
demanding. That is a suggestion for the implementation spec to weigh, not a ruling
made here.

---

# 2. Coordinates & timing

This chapter fixes the two frames of reference every later chapter is written in:
**where things are** and **when things happen**. Both are integer, both are exact,
and neither has any tolerance. Nothing here is a suggestion — a chapter that says
"the lemming moves to x + 1" means the integer 1 in the space defined below, and
"on the next frame" means the discrete step defined in §2.6.

## 2.1 Conventions

**All simulation quantities are integers in units of one pixel or one frame.** There
are no sub-pixel positions, no fractional velocities and no interpolation anywhere in
the simulation. Where movement appears smooth it is because the step is small, not
because it is continuous. This is not a simplification for convenience — §1.6 rule 1
makes it a requirement.

**The coordinate origin is the top-left of the world**, x increasing rightwards, y
increasing **downwards**. Y-down is used throughout without further comment: "above"
means smaller y, "falling" means increasing y.

**A lemming's position is its foot**, not its centre and not its sprite corner. The
pair (x, y) that Part III manipulates is a single point at the bottom-middle of the
creature — the pixel it stands on is (x, y), and the pixel it tests for ground is
directly at or below that point. Every probe offset in Chapter 15 is relative to this
point.

Sprites are placed by subtracting the animation's foot anchor from that point:

```
spriteLeft = x − anchorX
spriteTop  = y − anchorY
```

The anchor is per-animation and is normative data (§1.4, tabulated in Chapter 9). It
is the only bridge between simulation space and drawing space, which is why an
implementation may draw whatever it likes at whatever size but may not change these
numbers.

**A frame is one simulation step.** Frames are numbered from 0 and never skip. The
document uses "frame *n*" for absolute simulation time since the level began, and
"animation frame" for an index within an animation cycle; where confusion is
possible the latter is always qualified.

## 2.2 The world

Every level occupies a world of exactly:

| | Value |
|---|---|
| World width | **1584** pixels |
| World height | **160** pixels |

**These dimensions are fixed and identical for every level.** A level does not carry
its own size; it carries content placed within this space. Levels differ in what
occupies the world, never in how large it is.

The world is stored as a pixel buffer whose contents are the collision geometry
(Chapter 3). Coordinates outside `0 ≤ x < 1584`, `0 ≤ y < 160` are legal to *test* —
the terrain query is defined there and returns "no terrain" — but hold no data.
Terrain writes outside the world are discarded.

The world is wide and short: **just under five viewport widths across**
(1584 ÷ 320 = 4.95) and **exactly one viewport height tall**. Both of §2.4's
scrolling rules fall directly out of those two ratios rather than being independent
decisions — wider than the viewport means horizontal scrolling exists, and equal to
the viewport in height means vertical scrolling has nowhere to go.

## 2.3 Lemming coordinate bounds

A lemming's position may leave the world, and what happens depends on which edge:

| Bound | Value | Behaviour on breach |
|---|---|---|
| `LEMMING_MIN_X` | **0** | Turn around |
| `LEMMING_MAX_X` | **1647** | Turn around |
| `HEAD_MIN_Y` | **−5** | Push back down and turn around |
| `LEMMING_MAX_Y` | **163** | **Remove the lemming** — it is lost |

Three things about this table are easy to get wrong and are therefore normative in
detail:

**The side and top bounds turn the lemming around; the bottom bound destroys it.**
Breaching left, right or top reverses direction and play continues. Passing the
bottom limit removes the lemming — it has fallen out of the world and counts as lost,
not saved. This is the only way a lemming leaves play without dying to a hazard,
exploding, or exiting.

**The left and right edges of the world therefore behave differently, and this is
required.** `LEMMING_MIN_X` sits *at* the world's left edge, while `LEMMING_MAX_X`
sits 64 pixels *beyond* its right edge — and because the bound test is what triggers
the turn-around, that placement is what decides the character of each edge:

- **The left edge is a wall.** A lemming walking left from x = 0 breaches the bound
  immediately and reverses. It cannot leave the world on this side.
- **The right edge is a cliff.** A lemming walking right from x = 1583 is still
  within bounds, but terrain queries outside the world return "no terrain" (§2.2), so
  it finds no ground, falls the height of the level, and is removed on crossing
  y = 163.

Implementations that "tidy" `LEMMING_MAX_X` down to 1583 for symmetry will convert
the right edge from a cliff into a wall, so that lemmings bounce off it instead of
falling to their deaths. That is a large and immediately visible change in behaviour.

**The specific value 1647 carries no meaning; only its being greater than 1584
does.** Past x = 1583 no terrain can exist, so a lemming there has nothing to stand
on, bash or climb, becomes a faller, and stops advancing horizontally — x settles a
pixel or two beyond the edge and the lemming is removed shortly after. Any bound
above the world width produces identical observable behaviour. The value is
nonetheless specified exactly, because it costs nothing and removes the temptation to
re-derive it.

**The top bound is checked against the lemming's head, not its foot.** `HEAD_MIN_Y`
is compared against the position *offset by the current animation's anchor* — the
sprite's top edge, not the foot point. On breach the lemming is repositioned so its
head sits just below the limit and is turned around. Chapter 15 gives the exact
expression; the point here is that this is the one bound expressed in sprite space
rather than foot space, and it therefore depends on the Chapter 9 anchor data.

## 2.4 The viewport and scrolling

The player sees a window onto the world, not the whole world:

| | Value |
|---|---|
| World viewport | **320 × 160** pixels |
| Skill panel | **320 × 40** pixels, directly below |
| Logical display | **320 × 200** pixels |

Two consequences follow arithmetically, and both are normative because both are
directly observable:

**Horizontal scrolling has range 0 … 1264**, since `1584 − 320 = 1264`. The scroll
offset is the world x-coordinate displayed at the left edge of the viewport.

**There is no vertical scrolling.** The viewport height equals the world height
exactly (160 = 160), so the full vertical extent of every level is always on screen.
An implementation must not add vertical panning; there is nothing to pan to, and code
that assumes a vertical camera will mis-handle the top and bottom bounds of §2.3.

**The viewport width is normative, not a presentation choice.** It is tempting to
treat "how much you can see" as a display setting and widen it on a modern screen.
It is not: 320 is the term that produces the scroll range above, and how much of the
level is visible at once determines how many lemmings the player can watch while they
are in play. That is a difficulty control. A wider viewport makes every level easier
in a way the player can feel.

What *is* free is everything layered on top: the **display scale** (any integer
multiple, chosen to fit the available screen), window size, letterboxing, centring,
and whether the panel is drawn adjacent to the viewport or elsewhere. The logical
320 × 200 arrangement is what must be conveyed; the pixels it is presented in are the
implementation's business.

**Initial scroll position is a level parameter.** Each level carries a screen
position, in world pixels, used as the scroll offset when play begins (Chapter 5).
It is clamped to the range above.

## 2.5 Minimap coordinates

The panel includes a minimap of the whole world:

| | Value |
|---|---|
| Minimap size | **104 × 20** pixels |
| World → minimap x | `x div 16` |
| World → minimap y | `y div 8` |

The divisors are exact for the height (160 ÷ 8 = 20) and leave the width slightly
short: 1584 ÷ 16 = 99 of the 104 available columns. That slack is why the minimap's
viewport indicator cannot be geometrically exact, and it is **not** worth reproducing
faithfully — the indicator is a navigational aid, its exact width conveys nothing,
and Chapter 22 specifies it as a requirement rather than a measurement.

What is normative here is only that the minimap plots every live lemming's position
and the current viewport, and that clicking it scrolls there.

## 2.6 Time: the frame

**The frame is the unit of simulation time, and the only one.** The simulation
exposes a single step operation; everything in Part III happens in whole numbers of
these steps. There is no delta-time parameter, and §1.6 rule 3 forbids adding one.

| Speed | Frame period | Notes |
|---|---|---|
| Normal | **58 ms** (≈ 17.24 frames/second) | The default for every level |
| Fast level | **20 ms** (≈ 50 frames/second) | Selected by a per-level flag (Chapter 5) |
| Fast-forward | ~10 ms or faster | Player-invoked; see below |

**The normal and fast-level periods are normative**, because the rate at which
lemmings walk and the rate at which the level clock runs are both things the player
experiences directly, and the fast-level flag is a property of the level design
rather than of the display. **Fast-forward is free**: it is a player convenience that
runs the same simulation more quickly, and an implementation may pick any rate, or
step as fast as it can.

Note that the frame period never affects *what* the simulation computes — only how
often it is asked to compute it. Running at 10 ms per frame produces exactly the same
sequence of states as running at 58 ms, just sooner. This is what makes fast-forward
free, and it is the same property Chapter 26 relies on to seek through a replay.

**Frame 0 is the first frame of play.** A small number of scripted events are pinned
to absolute frame numbers early in a level — most importantly the entrances opening,
which does not happen on frame 0. Chapter 13 specifies them; the point here is that
they are expressed as exact frame numbers and are part of the simulation, not
animation flourishes.

## 2.7 The level clock

Each level carries a **time limit in whole minutes**. The clock is initialised to
that many minutes and zero seconds, and counts down.

**One second is exactly 17 frames.** The simulation holds a counter that advances
once per frame; on reaching 17 it resets to zero and decrements the displayed clock
by one second, borrowing from minutes as needed. The clock floors at 0:00 and does
not go negative.

Two consequences worth stating plainly:

- **17 frames per second is the normative relation, and it is not the frame rate.**
  The real-time frame period is 58 ms, so 17 frames take 986 ms — the clock runs
  fractionally fast against a wall clock. This is correct and must not be "fixed".
  The clock is defined in frames; wall-clock time is not an input to the simulation
  (§1.6 rule 3).
- **On a fast level the clock runs at the same 17 frames per second** — but frames
  arrive nearly three times as quickly, so a fast level's time limit is
  correspondingly shorter in real terms. The relation is defined in frames, so
  nothing special is needed to achieve this; it falls out.

Expiry of the clock is one of the level-ending conditions (Chapter 19). Whether the
clock advances while the game is paused is a rule variant (Chapter 20).

## 2.8 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| World | 1584 × 160, fixed for all levels | Storage format of the buffer |
| Position | Integer, foot-anchored, y-down | — |
| Sprite placement | Anchor offsets (Chapter 9) | Sprite size and artwork |
| Bounds | 0, 1647, −5, 163 and their behaviours | — |
| Viewport | 320 × 160 world view; no vertical scroll; scroll range 0…1264 | Display scale, window layout, letterboxing |
| Panel | 320 × 40 logical, below the viewport | Styling, position on screen |
| Minimap | Plots lemmings and viewport; click-to-scroll | Exact indicator geometry, styling |
| Frame period | 58 ms normal, 20 ms fast levels | Fast-forward rate |
| Clock | 17 frames = 1 second; limit in minutes; floors at 0:00 | Clock display format |

# 3. The terrain bitmap is the collision geometry

The game has **no geometric model of the landscape** — no polygons, no tiles, no
height field, no list of solid rectangles. There is one buffer of pixels covering the
world, and the question "is there ground at (x, y)?" is answered by looking at the
pixel there.

This is the single most important structural fact in the document. Every probe in
Chapter 15 is a pixel lookup, every destructive skill in Chapter 16 is a pixel write,
and the two compose without any intermediate representation: a basher removes pixels,
and the walker that follows finds no ground because those pixels are gone. Nothing
recomputes a collision shape, because there is no collision shape.

It is also what makes §1.4 true. Because the buffer *is* the collision geometry,
anything that writes into it is defining physics — including the terrain artwork the
level is assembled from.

## 3.1 The model

The world holds one value per pixel over the full 1584 × 160 extent (§2.2):

> **solid** — a boolean. True if terrain occupies this pixel.

That is the entire normative content of the buffer. **Everything else about how
terrain is stored is free** (§1.3): whether solidity lives in a packed bit array, a
byte per pixel, or an alpha channel shared with colour; whether colour is stored
alongside it or in a separate structure the simulation never sees; whether the
renderer reads the same memory or its own copy.

**Solidity is a separate fact from colour and must not be derived from it.** Black is
a legal colour for terrain, so a "solid if the pixel is not black" test will punch
invisible holes through parts of a level, producing collision behaviour that
contradicts what is drawn. The supplied piece data carries transparency as an
explicit distinction from colour (Chapter 8), and that distinction is what defines
the mask. An implementation that re-derives solidity from rendered colour has
introduced a physics bug it will find very hard to see.

## 3.2 The solidity query

All of Part III reaches the world through one query:

```
hasTerrain(x, y):
    if x < 0 or y < 0 or x ≥ 1584 or y ≥ 160:  return false
    return solid(x, y)
```

Two normative points:

**Out of bounds is empty, not blocked.** Probing outside the world returns *no
terrain* rather than failing or clamping. This is what makes §2.3's right-edge cliff
work: a lemming past x = 1583 probes for ground, finds none, and falls. An
implementation that treated out-of-bounds as solid would convert every world edge
into a floor and a wall.

**The query is total.** It is defined for every integer coordinate, including deeply
negative ones. No caller checks bounds before probing, and Chapter 15's probes freely
address pixels above the world's top edge while a lemming is near it. Bounds checking
belongs inside this function, not at its call sites.

## 3.3 The clamped query

A second form is used wherever a probe may reach above the top of the world:

```
hasTerrainClamped(x, y, minY):
    return hasTerrain(x, max(y, minY))
```

The third argument raises the probe: when `y` is above `minY` the lookup happens at
`minY` instead. With `minY = 0` this makes **the world's top row behave as though it
extended upward indefinitely** for the purpose of that probe — a lemming whose foot
has risen above y = 0 tests the terrain at y = 0 rather than finding empty space.

This is not an optimisation or a guard; it changes results. Chapter 15 states which
probes are clamped and with what `minY`, and the two forms are not interchangeable —
using the plain query where the clamped one is specified will let lemmings pass
through terrain near the top of a level.

## 3.4 Removing terrain

Destruction is a single primitive:

```
removeTerrain(x, y):
    if in bounds: solid(x, y) := false
```

Three normative points:

**It operates on one pixel and is unconditional.** There is no shape, no radius and
no falloff; Chapter 16's masks are simply sets of coordinates passed to this one at a
time. And it does not consult steel, one-way walls, or anything else — **the caller
decides whether destruction is permitted, and this primitive obeys.** Chapter 16
specifies those checks.

**Writes outside the world are silently discarded**, matching §3.2's total query. A
mask that overlaps the world edge applies its in-bounds part and drops the rest;
this is not an error.

**Terrain is only ever removed, never added — except by the builder.** The only
mechanism that makes a pixel solid during play is brick laying (Chapter 16). Nothing
else adds terrain, and nothing restores destroyed terrain.

## 3.5 What is deliberately not in this buffer

The terrain buffer answers exactly one question: *is this pixel solid?* Three things
an implementer may expect to find here are held elsewhere, and conflating them is a
structural error rather than a detail:

| Question | Answered by |
|---|---|
| Is this pixel solid? | **The terrain buffer** (this chapter) |
| May this pixel be destroyed? | The object map — steel (Chapter 4) |
| May it be tunnelled from this direction? | The object map — one-way walls (Chapter 4) |
| Does something happen to a lemming here? | The object map — triggers (Chapter 4) |

**Steel is not a kind of terrain.** It is not stored in this buffer, has no pixels of
its own, and does not make anything solid. It is a rectangular region recorded in a
separate structure that *forbids destruction* of whatever terrain lies under it.
Steel over empty space blocks nothing, because there is nothing there to protect.

**Interactive objects are never solid.** Exits, traps, water and entrances are drawn
into the display but contribute nothing to this buffer. A lemming cannot stand on an
exit, and water is not a surface — a lemming walks *into* the water's trigger region
and drowns there, on terrain that the level author placed underneath it.

Keeping these apart is what allows a single boolean per pixel to be sufficient.

## 3.6 Where the buffer comes from

The buffer is **filled once, before the first frame, and never rebuilt.** From then
on the only things that change it are the destructive and constructive skills of
Chapter 16, one pixel at a time.

Its initial contents are assembled from the level's terrain data. That assembly needs
two things this chapter has not defined — what a terrain placement *is* (Chapter 5)
and which pixels a piece contributes (Chapter 8) — so it is specified in **Chapter 8**,
once both inputs exist, rather than here.

Three properties of the result matter to this chapter and hold regardless of how the
assembly works:

- **Only terrain data reaches this buffer.** Objects contribute nothing (§3.5).
- **The result is nothing but a set of solid pixels.** However elaborate the assembly,
  what survives into the simulation is the single boolean of §3.1 — no piece identity,
  no layering, no record of which placement produced which pixel. Nothing in Part III
  can ask "which piece is this?", because after construction the question has no
  answer. This is why the assembly can be specified elsewhere without loss: it is a
  one-way funnel into this chapter's model.
- **Destruction is irreversible.** Since the buffer is never rebuilt and construction
  never re-runs, a pixel removed during play stays removed for the rest of the level.

## 3.7 What this forces on the renderer

The simulation owns the solid/not-solid fact; the renderer owns everything visible.
Two obligations follow:

**The rendered landscape must agree with the buffer, pixel for pixel.** The player
judges where the ground is by looking at it, and every skill decision depends on that
judgement. If a lemming stands on a pixel the player cannot see, or falls through one
they can, the game is unplayable regardless of how correct the simulation is. Whatever
colour scheme or texture the implementation chooses, the *silhouette* it draws must be
the buffer's solid set.

**Destruction must be visible immediately.** A pixel removed on frame *n* must not
appear solid on frame *n*. Bashers, miners and diggers are legible only because the
tunnel appears as it is cut.

Beyond that the renderer is unconstrained: it may colour terrain however it likes,
shade it, texture it, animate it, or draw it at any scale, provided the shape it
presents is the shape the simulation is using.

## 3.8 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Content | One boolean per pixel over 1584 × 160 | Storage layout, bit packing, colour association |
| Query | Out-of-bounds returns empty; total over all integers | — |
| Clamped query | `hasTerrain(x, max(y, minY))`; where used, per Chapter 15 | — |
| Removal | One pixel, unconditional, out-of-bounds discarded | — |
| Construction | Filled once before frame 0 (Chapter 8); never rebuilt | Assembly pipeline, caching |
| Objects | Never contribute solidity | — |
| Rendering | Drawn silhouette matches the solid set; destruction visible same frame | Colour, texture, shading, scale |

# 4. The object map

The terrain buffer answers *is this pixel solid?* and nothing else (§3.5). Every other
spatial question — may this be destroyed, from which direction, does something happen
to a lemming here — is answered by a second structure: a coarse grid of bytes, one per
**4 × 4 pixel cell**, covering the world and a margin around it.

Where the terrain buffer is fine-grained and boolean, this one is coarse and
enumerated. The two are read at different moments by different code and never
interact. Keeping them apart is what allows the terrain buffer to stay a single bit
per pixel.

## 4.1 Resolution and addressing

One cell covers a 4 × 4 pixel square. A pixel coordinate maps to a cell by flooring
and then shifting by a fixed border:

```
cellX = floor(x / 4) + 4
cellY = floor(y / 4) + 4
```

**The division floors; it does not truncate toward zero.** For negative coordinates
these differ — truncation would map x = −1 to cell 0 alongside x = 0, silently folding
the margin onto the world's first column. Implementations in languages whose integer
division truncates must floor explicitly.

**The `+ 4` is a 16-pixel border**, and it exists so that negative coordinates are
addressable rather than lost. Two things routinely address them: level content placed
partly off the left or top edge, and the blocker field of §4.5, which probes four
pixels to the left of a lemming that may be standing at x = 0.

The grid covers cells `0 ≤ cellX < 415`, `0 ≤ cellY < 47` — world pixels x from −16 to
1643 and y from −16 to 171.

```
readObjectMap(x, y):
    compute cellX, cellY as above
    if outside the grid: return NONE
    return grid[cellX, cellY]

writeObjectMap(x, y, value):
    compute cellX, cellY as above
    if outside the grid: do nothing
    grid[cellX, cellY] := value
```

**Out-of-range reads return `NONE`, not an error and not a blocking value.** This
matters for the same reason §3.2's out-of-bounds rule does: a lemming beyond the
world's edge must find nothing there, not an obstruction.

The **cell** is the unit of resolution for everything in this chapter. A trigger
region cannot be positioned or sized more finely than 4 pixels, and neither can steel
or a blocker's field. Where Part III appears to give pixel-precise object behaviour,
it is pixel-precise only up to this grid.

## 4.2 Cell values

A cell holds one byte, and **the byte has two disjoint meanings depending on its
range**:

| Range | Meaning |
|---|---|
| **0 … 127** | The **index of a trap** in the interactive-object list (§4.3, §17.2). The cell is that trap's trigger region. |
| **128 … 255** | An **effect code** from the table below. |

This dual encoding is normative. It exists because a trap must be identified
individually — triggering one must animate *that* trap and play *its* sound — whereas
every other effect is generic and needs no identity. A reader that treats the byte as
a single enumeration will mis-handle every trap in the game.

The effect codes:

| Code | Name | Meaning |
|---|---|---|
| 128 | `NONE` | Nothing here. The initial value of every cell. |
| 129 | `EXIT` | A lemming here has reached the exit |
| 130 | `FORCE_LEFT` | Turn back a lemming that is moving right — the left arm of a blocker |
| 131 | `FORCE_RIGHT` | Turn back a lemming that is moving left — the right arm of a blocker |
| 133 | `WATER` | A lemming here drowns |
| 134 | `FIRE` | A lemming here is vaporized |
| 135 | `ONE_WAY_LEFT` | Terrain here may only be tunnelled leftward |
| 136 | `ONE_WAY_RIGHT` | Terrain here may only be tunnelled rightward |
| 137 | `STEEL` | Terrain here may not be destroyed |
| 138 | `BLOCKER` | The centre of a blocker's field — see §4.5 |

Code 132 is unused and must never be written.

**`STEEL` marks a region, not a material.** It does not make anything solid and has no
appearance of its own; it only forbids destruction of whatever terrain happens to lie
in those cells. Steel over empty space protects nothing (§3.5).

## 4.3 Building the map

The map is filled once, before the first frame, in this order. **Later writes
overwrite earlier ones**, so the order is normative.

**1 — Clear.** Every cell is set to `NONE`.

**2 — Steel areas.** Each of the level's steel rectangles is painted with `STEEL` over
every cell its pixel rectangle touches.

**3 — Object trigger regions, in list order.** An *object* is one interactive thing the
level places — an exit, a trap, water. Each object placement carries a world position and
names an **object type**; the type is what determines the object's effect, its
appearance, and the rectangle within it that actually acts on lemmings — its **trigger
rectangle**. The placement is defined in Chapter 5, the type and its trigger rectangle in
Chapter 8. This step needs only three facts about a type, all supplied there: the effect
it produces, and the trigger rectangle's offset and size relative to the object's
position.

As with the terrain buffer (§3.6), the map does not care where these three facts come from:
a style-based or imported level reads them from the type metadata (Chapter 8), while a
natively-authored level may supply an object's effect and trigger rectangle directly. The
building algorithm below is identical either way.

The objects painted here are the **interactive objects** — every placed object *except*
entrances, which are pulled out at load for spawning and contribute nothing to this map
(Chapter 17, §13). "The list" below means this interactive-object list, in placement
order.

For each interactive object, its trigger region is painted with a single value:

- if the object's effect is *triggered trap*, the value is **the object's index** in
  the interactive list (0 … 127);
- otherwise the value is **the effect code** from §4.2.

The region is the object's trigger rectangle, placed in the world like so:

```
regionX = floorTo4(object.x) + triggerOffsetX
regionY = floorTo4(object.y) + triggerOffsetY
```

covering the trigger rectangle's width × height from that origin, where the offset and
size are the type's (Chapter 8) and `floorTo4(v) = floor(v / 4) · 4`.

**The object's own position is snapped down to a 4-pixel boundary *before* the trigger
offset is added** — the snap applies to the object's position, not to the resulting
region. An implementation that snaps the finished rectangle instead will misplace
trigger regions whose offsets are not multiples of 4.

Two consequences of the ordering:

- **Object triggers overwrite steel.** Where a trigger region overlaps a steel area,
  the trigger wins and those cells cease to be steel.
- **Later objects overwrite earlier ones.** Where two trigger regions overlap, the one
  later in the list is what a lemming will encounter.

Whether objects beyond a certain index are painted at all is a rule variant
(Chapter 20).

## 4.4 The two probe points

Part III reads this map at exactly two positions relative to a lemming, and every
object interaction in the game is expressed in terms of them:

| Name | Position | Used for |
|---|---|---|
| **below** | `(x, y)` — the foot | Exits, traps, water, fire, blocker arms, steel under a digger or miner |
| **in front** | `(x + 8·direction, y − 8)` — eight pixels ahead, eight above | Steel and one-way walls facing a basher or miner |

`direction` is +1 facing right, −1 facing left, so *in front* follows the lemming
around when it turns.

These are the only two points sampled. There is no area test, no swept volume and no
per-pixel object collision: a lemming is "in" a trigger region exactly when one of
these two probes lands in a cell carrying that value. This is why §4.1's 4-pixel
granularity is not merely an internal detail — it is the actual precision of every
object interaction in the game.

## 4.5 Blocker fields

A blocker has no special status in the simulation. It stops other lemmings by
**writing into this same map**, exactly as a level object does.

On becoming a blocker, a lemming writes nine cells arranged 3 × 3 around its foot, at
pixel offsets `dx ∈ {−4, 0, +4}` by `dy ∈ {−6, −2, +2}`. The table below is laid out
as it sits in the world — `dx` across, `dy` down, foot at the centre cell:

```
          dx = −4      dx = 0       dx = +4
dy = −6   FORCE_LEFT   BLOCKER      FORCE_RIGHT
dy = −2   FORCE_LEFT   BLOCKER      FORCE_RIGHT
dy = +2   FORCE_LEFT   BLOCKER      FORCE_RIGHT
```

The left column (four pixels left of the foot) is all `FORCE_LEFT`, the right column
all `FORCE_RIGHT`, the centre column all `BLOCKER` — a left arm, a right arm, and an
inert spine, exactly as they appear on screen.

A lemming moving right that probes a `FORCE_LEFT` cell turns around; one moving left
that probes `FORCE_RIGHT` turns around. A lemming already moving away is unaffected —
which is what makes a blocker a two-sided barrier rather than a trap.

**The centre column does nothing to other lemmings.** `BLOCKER` is not handled by the
per-frame object dispatch at all; a lemming whose probe lands there simply carries on.
Its only purpose is the overlap test below. This is easy to get wrong by assuming
symmetry with the arms, and doing so would make blockers stop lemmings that should
walk past.

### Save and restore

Because blockers write into the same grid as level objects, a blocker placed over an
exit, a trap or a one-way wall would destroy that information. So the write is
bracketed:

1. **On becoming a blocker** — read all nine cells and store them on the lemming, then
   write the field over them.
2. **On ceasing to block** — write the nine stored values back.

Ceasing to block happens in exactly two ways: the ground beneath the blocker is
destroyed, in which case it becomes a walker; or it explodes. Both must restore.

**A blocker must not move while blocking.** Restore writes to cells recomputed from
the lemming's position at the time of restoring, so a blocker that had moved would
restore the wrong cells — corrupting the map with a copy of what used to be somewhere
else. Nothing in Part III moves a blocker; this is stated so that no implementation
introduces it.

### Overlap test

A blocker may not be assigned where its field would overlap an existing one. The test
reads the same nine cells the field would occupy and fails if any already holds
`FORCE_LEFT`, `BLOCKER` or `FORCE_RIGHT`. Chapter 18 places this among the assignment
preconditions.

## 4.6 Who reads the map

Read sites are specified in full by their own chapters; this is the index.

| Reader | Probe | Chapter |
|---|---|---|
| Per-frame object dispatch — exit, trap, water, fire, blocker arms | below | 17 |
| Basher and miner — steel and one-way walls ahead | in front | 16 |
| Digger and miner — steel underfoot | below | 16 |
| Exploding lemming — whether terrain may be destroyed | below | 16 |
| Skill assignment preconditions | both | 18 |
| Blocker overlap test | nine cells | 18 |

Note what is **not** in this list: the destruction primitives themselves. Applying a
bash, mine or dig mask removes pixels unconditionally and never consults this map
(§3.4). Steel and one-way walls stop a lemming by preventing the skill from
continuing, not by protecting individual pixels from the mask. An implementation that
instead filters masks per-pixel against steel will produce partially-cut tunnels that
this game never shows.

## 4.7 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Resolution | One cell per 4 × 4 pixels | Storage layout |
| Addressing | Floored division, 16-pixel border, covered range | — |
| Out of range | Reads return `NONE`; writes discarded | — |
| Values | Dual encoding: 0–127 trap index, 128+ effect code | Symbolic names |
| Construction | Clear → steel → objects in list order; later writes win | Build-time data structures |
| Trigger placement | Object origin floored to 4 *before* adding the trigger offset | — |
| Probes | Exactly two points: below, and in front at (+8·dir, −8) | — |
| Blocker field | 3 × 3 cells at the stated offsets; arms turn, centre inert | — |
| Blocker bracketing | Save nine cells on entry, restore on exit; must not move | Where the saved cells are stored |

# 5. Level model

A **level** is the complete description of one puzzle. This chapter defines it as the
simulation sees it: a record of parameters plus three lists — terrain placements,
object placements, and steel areas. Everything the game needs to set up and run a
level comes from here.

The model is defined by **meaning and range, not by byte layout.** How a level is
stored on disk is the implementation's choice (§1.5); only the content specified here
is normative. A level reaches the model one of two ways — imported from the
interchange format (Chapter 6), or authored directly for this implementation — and the
model is identical either way. Cross-implementation exchange goes through the
interchange format, which is the one serialisation this document does pin down.

Nothing in the model is geometry. A placement names a piece or an object *type* and
says where to put it; the shape that piece contributes, the rectangle that object
triggers on, and the pixels either is drawn as all live in the type's metadata
(Chapter 8), keyed by the identifier stored here. The model is a script; Chapter 8 is
the cast.

## 5.1 Parameters

| Field | Meaning | Range | Read by |
|---|---|---|---|
| `releaseRate` | Initial rate lemmings emerge from the entrance | 1 … 99 | Ch. 13 |
| `lemmingsCount` | How many lemmings will emerge in total | 1 … 255 | Ch. 13, 19 |
| `rescueCount` | How many must reach the exit to win | 1 … `lemmingsCount` | Ch. 19 |
| `timeLimit` | Countdown length, in whole minutes | 1 … 99 | Ch. 2, 19 |
| `climberCount` … `diggerCount` | The eight skill budgets | 0 … 99 each | Ch. 18, 22 |
| `graphicSet` | Selects the tile / object / palette set (Ch. 8) | 0 … 9 | Ch. 8 |
| `specialGraphic` | Selects a full-screen level image; 0 = none (§5.5) | 0 … 9 | Ch. 8 |
| `screenPosition` | Initial horizontal scroll — world x at the viewport's left edge | −200 … 1384, clamped to 0 … 1264 on apply (§2.4) | Ch. 2 |
| `fastLevel` | Run at the fast frame period (§2.6) rather than the normal one | boolean | Ch. 2 |
| `title` | The level's name | up to 32 characters | Ch. 22, 23 |

The eight skill budgets are, in order: **climber, floater, bomber, blocker, builder,
basher, miner, digger.** Each is the total number of times that skill may be assigned
during the level (Chapter 18); a budget of 0 means the skill is unavailable and its
panel button inert.

Two constraints are normative and must survive both import and authoring:

- **`rescueCount ≤ lemmingsCount`.** A level that demands more saved than will ever
  emerge is unwinnable by construction; the requirement is meaningless above the
  supply.
- **Every range above is a validity range, not a display clamp.** A value outside it
  is a malformed level, not a hard case to render. The importer (Chapter 6) is where
  out-of-range interchange values are clamped into these bounds; a level already in
  the model is assumed valid.

## 5.2 Terrain placements

An **ordered list**, each entry:

| Field | Meaning | Range |
|---|---|---|
| `piece` | Which terrain piece (its mask) to stamp (Ch. 8) | 0 … 63 |
| `x`, `y` | World position of the piece's top-left corner | any integer; may sit partly or wholly off any edge |
| `flags` | Any subset of `ERASE`, `INVERT`, `NO_OVERWRITE` (Ch. 8) | — |

**Order is normative.** Terrain is assembled by applying these in list order (§3.6,
Chapter 8), and because the flags let a later piece erase or defer to an earlier one,
a reordered list produces different collision geometry. The list is the level's
terrain; there is no geometry outside it (except the special-graphic path, §5.5).

Coordinates are world pixels and may be negative or beyond the world edges; pieces are
clipped to the world at construction (§3.6). The three flags are terrain-construction
flags, defined in Chapter 8 — they shape the buffer, not the display.

## 5.3 Object placements

An **ordered list**, each entry:

| Field | Meaning | Range |
|---|---|---|
| `type` | Which object type this is an instance of (Ch. 8) | 0 … 15 |
| `x`, `y` | World position of the object's top-left corner | any integer |
| `flags` | Presentation-only compositing hints — optional (below) | subset of three |

Two distinctions here are load-bearing and easy to blur:

**Type versus list position.** The `type` (0 … 15) selects *what kind* of object this
is — its effect, its trigger rectangle, its appearance all come from the type metadata
(Chapter 8). Separately, an object's **position in this list is its identity**: when a
trap fires, the object map records *which* object by its list index (Chapter 4, values
0 … 127), and the object-limit rule variant (Chapter 20) counts by list position. So
the list is ordered for two independent reasons — trap identity and the object limit —
and its order is normative on both counts.

**The three flags are compositing directives for the object's image — presentation,
not behaviour.** Read literally, they say *how to paint the object's sprite onto the
scene*, and nothing more:

- `UPSIDE_DOWN` — draw the image vertically flipped.
- `ONLY_ON_TERRAIN` — draw the object's pixels only where solid terrain already lies
  beneath them, so the object reads as embedded in the landscape rather than floating.
- `NO_OVERWRITE` — draw the object only where nothing has been drawn yet, placing it
  behind existing terrain and objects rather than over them.

None of the three is read by the simulation. They do not move the object, do not change
its trigger, and do not affect spawning: an entrance releases lemmings from a fixed
offset of its stored position (Chapter 13) whether or not it carries `UPSIDE_DOWN`, and
an object's trigger rectangle is placed from its type metadata (§4.3) regardless of
every flag here. Flipping an `UPSIDE_DOWN` object's *art* must therefore never flip its
trigger.

Because Throng authors its own object art (§1.3), **honouring these flags is
optional.** They are the one presentation-only field the model carries: an
implementation that wants that embedded, layered compositing look can reproduce it, and
one that draws objects its own way may ignore them entirely — the game plays
identically either way. They are consumed, if at all, only by the renderer
(Chapter 21), never by Parts I–III.

The contrast with §5.2's terrain flags is worth holding onto, because the names
collide. `NO_OVERWRITE` (and its siblings) shape *terrain* there, and terrain is
collision geometry (Chapter 3) — so on terrain they are strictly normative. Here they
shape an *object's image*, and an object's image is decoration — so here they are
optional. **Same words, opposite force, because terrain is mechanism and objects are
not.**

Entrances and exits are identified differently, and neither is tagged by the model. An
**entrance** is any object of the entrance type — a fixed type id (1) — and is separated
out at load for spawning (Chapters 13, 17). An **exit** is any object whose type carries
the *exit* trigger effect (Chapter 8); it is an ordinary interactive object, recognised
through the object map like any other effect. So the model stores only `(type, x, y,
flags)`; what each object *is* comes from its type.

## 5.4 Steel areas

A list — order does not matter — of axis-aligned rectangles marking indestructible
terrain (Chapter 4):

| Field | Meaning | Range |
|---|---|---|
| `x`, `y` | Top-left corner | 4-pixel-aligned |
| `width`, `height` | Rectangle size | 4 … 64 pixels, a multiple of 4 |

A steel area forbids destruction of whatever terrain lies under it; it adds no terrain
and has no appearance of its own (§3.5, §4.2). The 4-pixel alignment and granularity
match the object map (§4.1) into which these rectangles are painted — steel cannot be
positioned or sized more finely than that.

## 5.5 The special-graphic indicator

When `specialGraphic` is non-zero, the level is built by the **single-image path**
(§3.6, Chapter 8): one full-screen image supplies all terrain, applied at a fixed
position, and the **terrain-placement list is ignored entirely.** `specialGraphic`
selects which such image. When it is zero, terrain comes from the placement list as
usual.

Object placements, steel areas and every parameter apply the same way in both cases;
only the source of terrain differs. This is a single boolean fork in construction, not
a different kind of level.

## 5.6 What the model is not

Three things an implementer may look for here are deliberately elsewhere:

- **Geometry** — piece masks, object trigger rectangles, destruction masks — is type
  metadata (Chapter 8), referenced by the identifiers stored here. The model never
  contains pixels or shapes.
- **Palettes and appearance** are authored (§1.3). The `graphicSet` selects a set whose
  supplied palette may be read as art-direction reference (Chapter 8), but the model
  carries no colours.
- **Byte layout** is not specified at all for the model (§1.5). The interchange format
  (Chapter 6) is the only pinned serialisation, and it is input, not the runtime
  representation.

## 5.7 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Parameters | The fields, meanings and ranges of §5.1; `rescueCount ≤ lemmingsCount` | In-memory representation |
| Terrain list | Contents and **order**; coordinates may be off-edge | Storage format |
| Object list | Contents and **order** (trap identity + object limit); type vs index | Storage format |
| Object flags | Never read by the simulation; trigger never flips | Presentation-only compositing hints, optional to honour |
| Steel list | Rectangles; 4-px aligned, 4 … 64 px | Order |
| Special graphic | Non-zero ⇒ single-image terrain, placement list ignored | — |
| Serialisation | The interchange format (Ch. 6) for exchange | The native on-disk format |

# 6. The interchange level format

The **interchange format** is a fixed 2048-byte binary record that describes one
level. It is not this project's invention — it is an externally-defined format shared
by a large existing corpus of levels — so unlike the level model (Chapter 5), its byte
layout *is* pinned, exactly, and must be read as specified here. This chapter is the
one place in the document that talks about bytes and bit positions.

Its only role is **input**: an importer reads a 2048-byte record and produces a
Chapter 5 model. It is never the runtime representation and is never written to during
play. Everything the importer cannot express as a model field it discards.

This chapter specifies the layout and the decode into the model. It does *not*
re-specify what the resulting fields mean — that is Chapter 5, and each field below
names its model target there.

## 6.1 Overall layout

A record is exactly **2048 bytes**, four regions in fixed positions:

| Offset | Size | Region | Holds |
|---|---|---|---|
| `0x000` | 32 | Header | The level parameters (§6.2) |
| `0x020` | 256 | Objects | 32 object slots × 8 bytes (§6.3) |
| `0x120` | 1600 | Terrain | 400 terrain slots × 4 bytes (§6.4) |
| `0x760` | 128 | Steel | 32 steel slots × 4 bytes (§6.5) |
| `0x7E0` | 32 | Title | The level name (§6.6) |

The three list regions are **fixed-capacity slot arrays**, not length-prefixed lists:
there are always 32 / 400 / 32 slots present, and unused slots carry a per-region
"empty" sentinel (§6.3–6.5). This caps a level at **32 objects, 400 terrain pieces and
32 steel areas** — limits the importer must enforce and an authored level converted
*to* this format must respect.

**Endianness is not uniform across the record, and this is the most common decode
bug.** The header's 16 values are **big-endian 16-bit words** and must be byte-swapped
to read. The object, terrain and steel entries are *not* words — they are packed byte
fields, decoded byte by byte as specified below, and no swapping applies to them. Read
a header word without swapping, or "swap" a packed entry, and the result is silently
wrong rather than an error.

## 6.2 Header — offset `0x000`, 32 bytes

Sixteen big-endian 16-bit words. Each is byte-swapped, then written to its model field
(§5.1) and clamped there (§6.7).

| Offset | Word | → model field |
|---|---|---|
| `0x00` | Release rate | `releaseRate` |
| `0x02` | Lemming count | `lemmingsCount` |
| `0x04` | Rescue count | `rescueCount` |
| `0x06` | Time limit (minutes) | `timeLimit` |
| `0x08` | Climber count | `climberCount` |
| `0x0A` | Floater count | `floaterCount` |
| `0x0C` | Bomber count | `bomberCount` |
| `0x0E` | Blocker count | `blockerCount` |
| `0x10` | Builder count | `builderCount` |
| `0x12` | Basher count | `basherCount` |
| `0x14` | Miner count | `minerCount` |
| `0x16` | Digger count | `diggerCount` |
| `0x18` | Screen position | `screenPosition` |
| `0x1A` | Graphic set | `graphicSet` |
| `0x1C` | Special graphic | `specialGraphic` |
| `0x1E` | Super-lemming flag | `fastLevel` |

The **super-lemming flag** is `0xFFFF` for a fast level and `0x0000` otherwise;
`fastLevel := (word == 0xFFFF)`. Any other value is treated as not-fast.

## 6.3 Object slots — offset `0x020`, 32 × 8 bytes

Each slot is 8 bytes `b0 … b7`. A slot whose eight bytes are **all zero is empty** and
is skipped.

Decode of a non-empty slot into a Chapter 5 object placement:

```
x     = (b0 << 8 | b1) − 16
y     = (b2 << 8 | b3)
type  = b5 & 0x0F
flags:  NO_OVERWRITE     if b6 & 0x80
        ONLY_ON_TERRAIN  if b6 & 0x40
        UPSIDE_DOWN      if b7 == 0x8F
```

Notes:

- `x` and `y` are big-endian byte *pairs within the entry* (not swapped words); the
  `−16` on `x` shifts out of the 16-pixel left margin, so a value of 16 means world
  x = 0. `y` has no offset.
- `type` is the low nibble of `b5` only; `b4` is unused.
- The three flags are the presentation-only compositing hints of §5.3. `b7` encodes
  upside-down as the specific byte `0x8F` (normal is `0x0F`).

**Empty slots are skipped and the surviving objects are compacted into a dense list,
preserving order.** This is essential and easy to get wrong: the object's **index in
the compacted list — not its slot number in the file — is its identity** everywhere
downstream (the trap value 0…127 in the object map, §4.2; the object-limit variant,
Chapter 20). Two files with the same objects in the same order but different empty-slot
padding must produce the same model.

## 6.4 Terrain slots — offset `0x120`, 400 × 4 bytes

Each slot is 4 bytes `b0 … b3`. A slot whose four bytes are **all `0xFF` is empty** and
is skipped. (Note the sentinel differs from objects: all-ones here, all-zero there.)

Decode of a non-empty slot into a Chapter 5 terrain placement:

```
flags:  ERASE         if b0 & 0x20
        INVERT        if b0 & 0x40
        NO_OVERWRITE  if b0 & 0x80
x    = ((b0 & 0x0F) << 8 | b1) − 16
h    = (b2 << 1) | (b3 >> 7)          // 9-bit raw vertical value
if h ≥ 256: h −= 512                   // fold to signed
y    = h − 4
piece = b3 & 0x3F
```

Notes:

- `b0` packs three things: its top three bits (`0x20 / 0x40 / 0x80`) are the terrain
  flags of §5.2; its low nibble is the high bits of `x`. The flag bit values match the
  model's `ERASE / INVERT / NO_OVERWRITE` (§3.6).
- `y` is a small signed quantity — the two-step fold then `−4` yields roughly `−260 …
  251`, letting a piece sit above the world's top edge. Pieces off any edge are legal
  and clipped at construction (§3.6).
- `piece` is `b3`'s low 6 bits (0 … 63); `b3`'s top bit is the 9th vertical bit, already
  consumed above.

## 6.5 Steel slots — offset `0x760`, 32 × 4 bytes

Each slot is 4 bytes `b0 … b3`. A slot whose four bytes are **all zero is empty** and
is skipped.

Decode of a non-empty slot into a Chapter 5 steel area:

```
x      = ((b0 << 1) | (b1 >> 7)) * 4 − 16
y      = (b1 & 0x7F) * 4
width  = (b2 >> 4)   * 4 + 4
height = (b2 & 0x0F) * 4 + 4
// b3 is always zero
```

Everything here is in **units of 4 pixels**, which is why steel is inherently
4-pixel-aligned (§5.4) and why `width` and `height` land in `4 … 64`. The `−16` on `x`
is the same left-margin shift as elsewhere.

## 6.6 Title — offset `0x7E0`, 32 bytes

32 bytes of single-byte characters, `→ title` (§5.1). Trailing spaces are conventional
padding and may be trimmed. This is the last region; the record ends at byte 2047.

## 6.7 Import normalisation and validity

The importer produces a *valid* model (§5.1) from a possibly-imperfect record:

- **Clamp every parameter to its §5.1 range** after swapping. Out-of-range values are
  clamped, not rejected — e.g. a skill count above 99 becomes 99, a time limit of 0
  becomes 1.
- **`rescueCount` is clamped to at most `lemmingsCount`** (§5.1), after both are read.
- **The special-graphic selector is normalised**: values above 4 fold to 1. A non-zero
  result selects the single-image construction path (§5.5).
- **Enforce the capacities.** Never emit more than 32 objects, 400 terrain pieces or 32
  steel areas; the slot arrays cannot express more, and neither may a model destined
  for this format.

A record that is not exactly 2048 bytes is not a valid interchange level and is
rejected before decoding.

## 6.8 Normative — summary

This entire chapter is normative: it is a fixed external format, and reading it wrong
produces a different level, not a stylistic variation. There is no authored or
incidental content here — the *only* freedom is what the importer does with the model
afterwards, which is Chapter 5's concern, not this one.

| Region | Fixed facts |
|---|---|
| Record | Exactly 2048 bytes; four regions at fixed offsets |
| Header | 16 big-endian words (swap); fast level = `0xFFFF` at `0x1E` |
| Objects | 32 × 8 B; empty = all-zero; **compact, preserving order; index = identity** |
| Terrain | 400 × 4 B; empty = all-`0xFF`; flags in `b0` top bits; signed `y` |
| Steel | 32 × 4 B; empty = all-zero; 4-pixel units throughout |
| Title | 32 bytes at `0x7E0` |
| Endianness | Header words big-endian; packed entries decoded byte-wise, no swap |

# 7. Interchange archive format & compression

> **Stub.** The archive section list and its decompression algorithm. Required by the
> importer and the geometry extractor only, never at runtime.

# 8. Piece geometry & world construction

> **Stub, part 1 — geometry.** Obtaining normative geometry from the supplied graphics
> archives: planar 1–4 bits-per-pixel decode, terrain piece masks, object trigger
> rectangles, and the destruction masks. The mask is defined by *presence*, not by
> colour: a pixel is part of the mask when the source encodes it as present, and black
> is a legal colour for a present pixel (§3.1). Palettes are carried as art-direction
> reference only.
>
> **Stub, part 2 — world construction.** The assembly promised by §3.6: how a level's
> terrain placements plus these masks become the terrain buffer. Must specify:
>
> - Start from an empty buffer — every pixel non-solid.
> - Apply terrain placements **in list order**. Order is normative: placements interact
>   through the flags below, so a reordered list produces different geometry.
> - The three drawing flags, by effect:
>   `ERASE` clears the destination pixel wherever the mask is present;
>   `INVERT` flips the piece vertically before applying it;
>   `NO_OVERWRITE` applies only where the destination is not already solid.
> - **Flag precedence is `NO_OVERWRITE` > `ERASE` > default.** A placement setting both
>   `NO_OVERWRITE` and `ERASE` behaves as `NO_OVERWRITE` and erases nothing. Not
>   obvious from the names; must be implemented as stated.
> - `INVERT` composes with the other two — flip first, then combine by whichever mode
>   applies. **Describe it concretely:** the flip is a top-to-bottom row reversal
>   *within the piece's own bounding box*, and the placement position is unaffected —
>   the flipped piece occupies exactly the same rectangle as the unflipped one would.
>   A worked before/after example belongs here; "flip vertically" alone is not
>   implementable.
> - Pixels falling outside the world are discarded, so a piece may be placed partly
>   off any edge.
> - **The special-level path:** where a level is flagged as such (Chapter 6), its
>   terrain list is ignored entirely and one supplied full-size image is applied at
>   world coordinates **(304, 0)** in the default mode. An alternative to piece
>   assembly, not an addition to it.

# 9. Animation metadata & foot anchors

The rest of Part II — how frames are packed, decoded and stored — is asset-pipeline detail
and is deferred (Chapters 7, 8, 10). One number per action is not: the **foot anchor**, the
offset that ties a lemming's simulation position to its drawn frame. Because the anchor
positions the cursor hit box (§18.2) and bounds the head against the top of the world (§2.3)
— both binding behaviours (§1.4) — it is **normative simulation input**, not presentation,
and is pulled forward here so the simulation is fully specified without waiting on the
pipeline. The other animation metadata the simulation touches is already placed: the
loop-vs-once mode is in the state table of §14.1, and each action's per-frame timing (which
frame lays a brick, digs a row, ends the animation) is in its handler in Chapter 15. What
remains — frame counts as a pack detail, frame dimensions, atlas layout, decode — is
deferred with the rest of Part II, or is Authored art the implementation chooses freely.

## 9.1 The anchor and what it fixes

A lemming is a single point — its **foot** (§2.1) — and a frame is a rectangle of pixels.
The **foot anchor** `(footX, footY)` is the pixel in the frame, measured from its top-left,
that is laid over the foot; equivalently the frame's top-left is drawn at
`(x − footX, y − footY)`, so the §11.2 offsets are `footDx = −footX` and `footDy = −footY`.

The anchor is **per-action — not per-frame, and not per-facing.** All frames of an action
share one anchor, and the left-facing form shares the right-facing form's anchor; the foot
sits at the horizontal centre either way, so `footX` is the same for every ordinary pose
(`8`, the centre of a 16-wide frame) and never varies behaviour. It is tabulated only for
completeness and matters to just one oversized graphic, the Exploding burst.

`footY` is the load-bearing half: it is the height of the head above the foot, and two rules
read it directly —

- **the head-bound clamp** (§2.3, §15.19): the head is at `y − footY`, and no pose may
  drive its head above the top bound, so a taller pose is stopped at a lower foot line;
- **the builder precondition** (§18.4): a builder may not start if its head would cross that
  bound — the same `y − footY ≥ −5` test.

This is why the numbers below are normative: change one and the same click selects a
different lemming, or a build starts where it should be refused.

## 9.2 The anchor table

Normative, one row per action, in the order of the §14.1 state table. `footX = 8` throughout
except the Exploding burst.

| Action | footX | footY |
|---|---|---|
| Walking | 8 | 10 |
| Jumping | 8 | 10 |
| Falling | 8 | 10 |
| Floating | 8 | 16 |
| Climbing | 8 | 12 |
| Hoisting | 8 | 12 |
| Building | 8 | 13 |
| Bashing | 8 | 10 |
| Mining | 8 | 13 |
| Digging | 8 | 12 |
| Blocking | 8 | 10 |
| Shrugging | 8 | 10 |
| Ohnoing | 8 | 10 |
| Exploding | 16 | 25 |
| Splatting | 8 | 10 |
| Drowning | 8 | 10 |
| Vaporizing | 8 | 14 |
| Exiting | 8 | 13 |

The `footY` values band by pose height: the upright walking-size states at `10`; the
climbing / hoisting / digging poses at `12`; the tall building / mining / exiting poses at
`13`; Vaporizing at `14`; Floating — arms up under the umbrella — at `16`, the tallest
ordinary pose. **Exploding is not a lemming pose but the burst that replaces it** (§15.14,
§21.4): a 32 × 32 graphic whose anchor `(16, 25)` centres it over the foot.

## 9.3 Normative and free — summary

| | Normative | Authored / Deferred |
|---|---|---|
| Foot anchor `(footX, footY)` | The §9.2 table — positions the hit box (§18.2) and the head bound (§2.3) | — |
| Loop / once mode | Per action, in §14.1 | — |
| Per-frame timing | Which frame acts, and when an animation ends — in each Chapter 15 handler | — |
| Frame count, dimensions, packing, atlas, decode | — | Dimensions and artwork are Authored; frame packing / atlas / decode are the deferred Part II pipeline |

# 10. Level packs, ordering & codes

> **Stub.** Pack structure, rank organisation, level ordering, and level codes.

# 11. Game state & the lemming record

Part III specifies how the game advances one frame. This chapter defines the state
that advancing operates on — everything that changes from frame to frame, and the
lifetime of each piece. It is the vocabulary the rest of Part III is written in: when
Chapter 15 says "increment `fallen` by 3", this chapter is where `fallen` is defined.

Game state has two tiers:

- **Per-lemming state** — a record per lemming, held in an ordered list (§11.1–11.2).
- **Global state** — counters, the clock, skill budgets, and spawn bookkeeping shared
  across the level (§11.3).

Two substrate structures — the terrain buffer (Chapter 3) and the object map
(Chapter 4) — are also mutable game state, owned here but already specified. They are
not repeated; §11.5 lists what lives where.

Per §1.6, this state plus the input stream is the *entire* determinant of the game.
Everything below is integer or enumerated; there is no floating-point or wall-clock
state anywhere in this chapter.

## 11.1 The lemming — simulation state

Each lemming is a record. The fields below are **normative simulation state**: they are
read and written by the handlers of Part III and they decide what the player sees
happen. The list is ordered, and that order is itself normative (§11.3, Chapter 12).

| Field | Meaning | Range / values | Lifetime |
|---|---|---|---|
| `x`, `y` | The foot position (§2.1) — the point the lemming *is* | integer world coords | whole life |
| `direction` | Facing and walk step: +1 right, −1 left | +1, −1 (0 while splatting) | whole life; flipped by turns |
| `action` | Current action state | one of the 19 (Chapter 14) | whole life; changes on transition |
| `frame` | Current animation-frame index (drives transitions, brick laying, mask application) | 0 … `maxFrame` | resets on transition |
| `fallen` | Pixels fallen so far in the current fall | ≥ 0 | reset to 0 on transition (or 3, §13/§20) |
| `explosionTimer` | Bomber fuse; 0 = no fuse lit | 0, or counting 79 → 1 | set to 79 on bomber assign; counts each frame |
| `bricksLeft` | Builder's remaining bricks | 0 … 12 | set to 12 on entering Building |
| `floatIndex` | Index into the floater descent table (Chapter 15) | 0 … table length | set to 0 on entering Floating; advances |
| `isClimber` | Permanent trait — scales walls | boolean | set once; never cleared |
| `isFloater` | Permanent trait — survives any fall | boolean | set once; never cleared |
| `isBlocking` | Currently a blocker (gates the map save/restore, §4.5) | boolean | set on entering Blocking; cleared on leaving |
| `isNewDigger` | First-frame digger flag — dig immediately on entry | boolean | set on entering Digging; cleared after first dig |
| `isRemoved` | No longer in play (saved, dead, or nuked out) | boolean | set once at removal; never cleared |
| `objectBelow` | The object-map value under the foot this frame (§4.4) | a cell value (§4.2) | recomputed every frame |
| `objectInFront` | The object-map value ahead this frame (§4.4) | a cell value (§4.2) | recomputed every frame |
| `endOfAnimation` | A *once* animation has reached its last frame | boolean | set by frame advance; read by handlers |
| `listIndex` | Position in the lemming list — the lemming's **identity** | ≥ 0 | fixed for life; used by replay (Chapter 26) |

Notes on the subtle ones:

- **`direction` is the whole of facing.** There is no separate "facing" field; `direction < 0`
  means facing left, and it selects the mirrored animation. A turn-around negates it.
- **`frame` is simulation state, not decoration.** Transitions fire on specific frame
  indices, a builder lays its brick on a specific frame, a basher applies its mask on
  specific frames. Two implementations that advance `frame` differently diverge
  immediately. Chapter 14 defines how it advances.
- **`objectBelow` / `objectInFront` are a per-frame cache**, not persistent state: they
  are refreshed from the object map at the start of each lemming's processing (§4.4,
  Chapter 17) and read by that frame's handler. Storing them on the record is a
  convenience; they carry nothing between frames.
- **`explosionTimer` counts 79 down to 1, then fires** (transition to Ohnoing, or
  straight to Exploding if airborne/floating/drowning). 0 means no fuse. It is *not*
  the digit shown on the lemming — that digit is derived from it (Chapter 21).

## 11.2 The lemming — derived and presentation fields

A full game carries these fields, but they are **not independent state**.
Each is either a cache of something recomputable, or purely visual. An implementation
may store them, recompute them, or omit them — none is normative, and none may
*influence* the simulation beyond what its source already does.

| Field | What it is | Why it's not independent state |
|---|---|---|
| `maxFrame`, `animationType` | The current action's frame count and loop/once mode | A copy of the animation metadata (Chapter 9), keyed by `action` + `direction` |
| `footDx`, `footDy` | Sprite-placement offsets = −(foot anchor) | Derived from the animation anchor (Chapter 9); `footDy` also feeds the head-bound check (§2.3), but is itself a function of `action` |
| `actionBits` | A one-hot bitmask mirror of `action` | Pure optimisation for fast set-membership tests |
| `born` | The frame the lemming was created | Recorded; not read by any rule — bookkeeping only |
| `combineFlags` | Which tint (climber/floater/builder) to draw with | Presentation only (Chapter 21) |
| `particleTimer`, `particleFrame`, `isExploded` | The post-explosion particle animation | Presentation only; the lemming is already removed |
| `savedMap[0..8]` | The nine object-map cells a blocker overwrote | **Normative but specified in §4.5** — listed here for completeness |
| render caches | Dirty rectangles, bitmap references, pixel-combine callbacks | Incidental (Chapter 21) |

`savedMap` is the one row that *is* normative; it appears here only because it is
physically part of the lemming record. Its rule lives with the blocker (§4.5).

## 11.3 Global state

State shared across the level. All of it is reset when the level begins (§11.6).

**Time and iteration:**

| Field | Meaning | Range | Lifetime |
|---|---|---|---|
| `currentIteration` | The frame counter — absolute simulation time | 0, 1, 2, … | +1 each frame |
| `clockFrame` | Sub-second counter; 17 of these is one game-second (§2.7) | 0 … 16 | wraps, decrementing the clock |
| `minutes`, `seconds` | Time left on the level clock | down from the limit to 0:00 | per level |

**Population counters** — these four drive spawning (Chapter 13) and the end
conditions and score (Chapter 19):

| Field | Meaning |
|---|---|
| `maxLemmings` | How many will be released in total (the level's `lemmingsCount`) |
| `released` | How many have emerged so far |
| `out` | How many are currently active (emerged, not yet removed) |
| `saved` | How many have reached an exit |
| `removed` | How many have left play (saved, dead, or nuked) |

The invariant is `out = released − removed`, and `saved ≤ removed`. A level ends when
no more will be released and `out` reaches 0 (Chapter 19).

**Skill budgets and release rate:**

| Field | Meaning | Range |
|---|---|---|
| `currentReleaseRate` | The live release rate; starts at the level's `releaseRate`, player-adjustable | 1 … 99 |
| `climbersLeft` … `diggersLeft` | The eight remaining skill budgets; each decremented on assignment | 0 … 99 |

The eight budgets start from the level's eight counts (§5.1) and only ever decrease
(a nuke does not touch them). A budget of 0 makes that skill unassignable (Chapter 18).

**Spawn, nuke and end bookkeeping:**

| Field | Meaning |
|---|---|
| `nextSpawnCountdown` | Frames until the next lemming is released (Chapter 13) |
| `entrancesOpened` | Whether the entrances have finished opening (set at frame 35, §2.6) |
| `isNuking` | A nuke is in progress (Chapter 19) |
| `nukeIndex` | How far the nuke has stepped through the lemming list |
| `particleFinishTimer` | Extra frames held after the last lemming leaves, so explosions finish before the level ends |

## 11.4 Configuration versus state

One thing held alongside the state above is **not** state — it never changes during a
level and is an *input*, not an evolving value:

- **The rule-variant flags** (Chapter 20). These select which behavioural variants are
  active. Per §1.6 they are a fixed input to the simulation for the whole level,
  chosen per level pack. Treat them as configuration read throughout Part III, not as
  something a frame can alter.

Distinguishing the two matters for determinism: the simulation is a pure function of
*(level, rule flags, input stream)* — the level and the flags are fixed, only the
per-lemming and global *state* evolves.

## 11.5 What is owned here but specified elsewhere

To keep the tiers complete, these mutable structures are game state too, but their
definitions live where they were introduced:

| Structure | Specified in |
|---|---|
| Terrain buffer (solid pixels) | Chapter 3 |
| Object map (trigger / steel / blocker cells) | Chapter 4 |
| The object lists (entrances separated from the rest) | Chapters 4, 13, 17 |
| The result record (counts, percentage, win/lose) | Chapter 19 |

The rest of a game's per-game fields — the renderer, the skill
panel, the sound queue, the replay recorder, pause/fast-forward/hyperspeed toggles,
cursor and mouse state — are shell and presentation (Chapters 21–25), not simulation
state, and are out of scope here.

## 11.6 Lifetimes and reset

Three lifetimes appear above, and keeping them straight is what makes a level
restartable and a replay seekable:

- **Per level.** All global state (§11.3) is initialised when the level starts:
  iteration and clock frame to 0, the clock to the time limit, all population counters
  to 0, the budgets to the level's counts, `currentReleaseRate` to the level's rate.
  The lemming list starts empty.
- **Per lemming life.** A lemming's record is created at spawn (Chapter 13) and persists
  until `isRemoved`. Traits (`isClimber`, `isFloater`) set during that life stay set.
- **Per transition / per frame.** `frame`, `fallen`, `bricksLeft`, `floatIndex` and the
  derived animation fields are (re)set when the action changes (Chapter 14);
  `objectBelow` / `objectInFront` are refreshed every frame.

Because every lifetime bottoms out in a level-start reset, the whole game state is
reconstructible from *(level, rule flags, inputs)* by replaying from frame 0 — the
property Chapters 26–27 depend on.

## 11.7 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Lemming simulation fields | §11.1 — meaning, range, lifetime | Field names, record layout |
| Lemming derived fields | Their *values* (as functions of action/anchor) | Whether stored or recomputed |
| Lemming presentation fields | — | Tints, particles, render caches |
| Global counters, clock, budgets | §11.3 — meaning and relations | Representation |
| Rule flags | Fixed per level; read, never written (§11.4) | — |
| Owned substrate | Terrain buffer, object map (Ch 3–4) | Storage |
| Reset | All state reset at level start (§11.6) | — |

# 12. Frame update order

One frame of the game is a **fixed sequence of phases**, run in the same order every
time. This chapter is that sequence. Chapters 13–19 specify what each phase does; this
chapter specifies *when* each runs relative to the others, and it is where §1.6 rule 4
— "iteration order is part of the specification" — is made concrete.

Order is not an implementation convenience here. The lemmings share the terrain buffer
(Chapter 3) and the object map (Chapter 4), the objects share the clock, and the phases
read and write that common state. Run them in a different order, or process the
lemmings in a different order, and the game produces different results from the same
inputs. Everything below is therefore normative.

## 12.1 The phase sequence

Advancing one frame runs these phases, in order:

| # | Phase | What it does | Chapter |
|---|---|---|---|
| 1 | **End check** | Test the end conditions; if met, finish and run no further phases | 19 |
| 2 | **Release-rate adjust** | Apply the player's held release-rate change | 13, 25 |
| — | *Pause gate* | If paused, stop here — phases 3–8 do not run | 25 |
| 3 | **Advance time** | Frame counter +1; clock tick (§2.7); scripted events (entrances open at frame 35, §2.6) | 13 |
| 4 | **Spawn** | Possibly release one new lemming from an entrance | 13 |
| 5 | **Lemmings** | Process every lemming, in list order (§12.3) | 14–17 |
| 6 | **Nuke advance** | If a nuke is running, light the next lemming's fuse | 19 |
| 7 | **Object animation** | Advance the animation frames of triggered and continuous objects | 17 |
| 8 | **Input** | Apply the inputs stamped for this frame | 25, 26 |

Rendering is **not** in this list. An implementation may interleave erase and
draw phases among these, but they compute nothing the simulation reads; §12.6 addresses
them. Phases 1–8 are the whole of the simulation's per-frame work.

## 12.2 The end check runs first, and lags by one frame

Phase 1 tests the end conditions (Chapter 19) against the counters as the *previous*
frame left them. A consequence worth stating: an end condition that becomes true during
frame *N* — the clock reaching 0:00 in phase 3, the last lemming leaving in phase 5 — is
not detected until phase 1 of frame *N+1*. End detection deliberately lags the event by
one frame. Implementations that test end conditions mid-frame and halt immediately will
end levels one frame early.

The end check is also gated so that explosions can finish: while the post-explosion hold
timer (§11.3, `particleFinishTimer`) is non-zero, phase 1 does not end the level even if
a condition is met.

## 12.3 The lemming loop is strictly list-ordered

Phase 5 processes the lemming list **from index 0 upward, in one pass**, and the order is
list order — which is spawn order (§11.1, `listIndex`). This is the single most
order-sensitive part of the frame.

Because the lemmings share the terrain buffer and object map, **a lemming sees the
this-frame changes of every lemming processed before it, and none of those processed
after it.** Concretely:

- A basher at index 3 removes terrain in phase 5; a walker at index 7, processed later
  the same frame, already finds the hole. A walker at index 1 does not — it was
  processed first and meets the hole only next frame.
- A lemming that becomes a blocker writes its field into the object map mid-phase-5
  (§4.5); lemmings later in the list turn at it this same frame, earlier ones next
  frame.

Reversing or reordering the list changes which lemmings see which changes, and therefore
changes outcomes. The order is normative, and an implementation must add newly spawned
lemmings to the **end** of the list (§13) so that list order stays spawn order.

Each lemming is processed through this sub-sequence:

1. **Particle timer** — if the lemming is mid-explosion, advance its particle animation.
2. **Skip if removed** — a removed lemming does nothing further.
3. **Fuse** — if a bomber fuse is lit, count it down; if it reaches 0, transition the
   lemming to Ohnoing (or straight to Exploding if airborne, floating or drowning) and
   **skip the rest of this lemming's processing for this frame**.
4. **Action handler** — advance the animation frame (§12.4), then run the current
   action's handler (Chapters 14–16). The handler may move the lemming, modify terrain,
   or transition it.
5. **Object interaction** — *if* the handler reported the lemming as active, read the two
   object-map probes (§4.4) at the lemming's new position and apply their effect: exit,
   trap, water, fire, or a blocker-arm turn (Chapter 17).

Note the coupling in step 4→5: the handler moves the lemming *first*, then object
interaction tests the position it moved to — within the same frame.

## 12.4 The animation frame advances before the handler runs

At the top of every lemming's action handler, the animation frame advances by one:

- If `frame < maxFrame`, increment it and clear `endOfAnimation`.
- Otherwise the animation has reached its end: set `endOfAnimation`, and for a *loop*
  animation wrap `frame` to 0 (a *once* animation holds on its last frame).

**Two actions are exceptions and advance their own frame inside their handler:
floating and digging.** For every other action the advance happens first, so the
handler runs with the already-incremented frame. This ordering is why a builder lays its
brick, or a basher applies its mask, on the frame index the handler tests — the frame is
current before the logic reads it. Getting this backwards (handler then advance) shifts
every frame-indexed event by one.

## 12.5 The pause gate freezes the simulation

When the game is paused, the frame stops at the pause gate: phases 3–8 do not run, so
the clock does not tick, no lemming is spawned, and no lemming is processed. The
simulation is frozen. (Whether the clock's *scripted* opening still advances while paused
— the "pause for time" behaviour — is a rule variant, Chapter 20.)

Phases 1–2 run before the gate: the end check is evaluated, and a held release-rate
change may still be applied. Everything else waits for unpause.

## 12.6 Rendering is outside the sequence

The eight phases above are all a conforming simulation must run, and it must be able to
run them **with no renderer attached** (§1.6). A renderer's erase/draw
phases may sit between and after the simulation phases, but they only read simulation state
to display it — they never feed anything back. Removing them leaves the sequence
computing exactly the same states, only faster and invisibly.

This is the property Chapter 26's seek-to-frame relies on: to jump to frame *N*, run
phases 1–8 for frames 0…*N* with rendering off, then render once. A frame run with
rendering and a frame run without must produce identical state, or seeking would drift.

## 12.7 Input has a defined slot

Player input — skill assignments, release-rate changes, pause, nuke — is not applied at
the arbitrary wall-clock moment a key or button is pressed. Each input is stamped with
the frame it belongs to and applied at a **fixed point in that frame**: release-rate
ramping at phase 2, everything else at phase 8. This is what lets the same input stream
reproduce the same game (§1.6), and it is the basis of the replay format (Chapter 26),
which specifies the stamping and application in full. For this chapter it is enough that
input is a phase with a fixed position, not an interrupt.

## 12.8 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Phase order | The eight phases of §12.1, in that order | — |
| Lemming loop | Strict list order; new lemmings appended | Loop implementation |
| Per-lemming sub-order | Particle → skip-removed → fuse → handler → objects | — |
| Frame advance | Before the handler; floating/digging self-advance | — |
| End detection | At phase 1; lags the event by one frame | — |
| Pause | Freezes phases 3–8 | — |
| Rendering | Excluded; simulation identical with it off | The renderer itself |
| Input | Fixed slots (phase 2 and phase 8), not interrupts | — |

# 13. Spawning & release rate

This chapter fills in frame phases 3 and 4 (§12.1): the level's opening seconds, and
the steady stream of lemmings from the entrances. It is where the population counters
of §11.3 begin to move.

Everything here is timed in whole frames and driven by integer counters. There is no
randomness (§1.6): the same level with the same release-rate inputs produces the same
lemming at the same frame from the same entrance, every time.

## 13.1 The opening timeline

A level does not begin releasing lemmings immediately. A fixed startup sequence runs
first, pinned to absolute frame numbers (§2.6):

| Frame | Event | Normative? |
|---|---|---|
| 0 | Play begins; the clock and counters are at their level-start values (§11.6) | yes |
| 15 | "Let's go" cue | sound only (Ch 24) |
| 34 | Entrance cue | sound only (Ch 24) |
| **35** | **Entrances open** — releasing becomes possible | **yes** |
| 55 | Music begins | sound only (Ch 24) |

The one simulation-normative event is at **frame 35**: the entrances open. Concretely,
a flag (`entrancesOpened`, §11.3) becomes true, and the release countdown (§13.3) starts
running. Before frame 35 no lemming can be released, and the countdown does not move.

**The spawn gate is frame 35 itself, not the completion of the entrance's opening
animation.** The hatch plays an opening animation (advanced by phase 7, Chapter 17), but
that animation is presentation; releasing is gated only on the frame-35 flag. An
implementation must not wait for the animation to finish before the first release.

## 13.2 The release countdown

Releasing is governed by a single integer counter, `nextSpawnCountdown` (§11.3),
initialised to **20** at level start.

Once the entrances are open, phase 4 runs this every frame:

```
decrement nextSpawnCountdown
if nextSpawnCountdown == 0:
    nextSpawnCountdown = releaseInterval()      // §13.3
    if released < maxLemmings:
        release one lemming                     // §13.4–13.5
```

So the **first lemming appears on frame 54**. The countdown ticks on every frame the
entrances are open, *starting with frame 35 itself* — phase 3 opens them before this
phase-4 code in the same frame (§12.1) — so the twenty counts fall on frames 35…54 and
the release fires on frame 54. (Read carelessly this looks like "20 frames after
opening" ⇒ frame 55; it is one fewer, because the opening frame is itself the first of
the twenty counts.) Each subsequent lemming follows one `releaseInterval()` later. The
decrement-then-test order is normative: decrement first, release when the result is
exactly 0.

## 13.3 The release interval

The interval between releases is a function of the current release rate:

```
releaseInterval(rate) = (99 − rate) div 2 + 4        // integer division
```

| Rate | Interval (frames) |
|---|---|
| 99 | 4 (fastest) |
| 50 | 28 |
| 1 | 53 (slowest) |

Higher rate ⇒ shorter interval ⇒ faster stream. The division truncates, so rates 98 and
99 give the same interval — a real property of the formula, not to be "smoothed". The
interval is recomputed from the *current* rate each time a lemming is released, so a
rate change takes effect from the next release onward (§13.6).

## 13.4 Which entrance releases

When a level has more than one entrance, releases rotate among them by a fixed table.
The entrance for a given release is:

```
entrance = orderTable[ released mod 4 ]
```

`orderTable` is a four-slot table of entrance indices, chosen once at level start from
the number of entrances:

| Entrances | orderTable | Rotation |
|---|---|---|
| 1, or more than 4 | 0, 0, 0, 0 | all from the first (AAAA) |
| 2 | 0, 1, 0, 1 | ABAB |
| 3 | 0, 1, 2, 1 | ABCB |
| 4 | 0, 1, 2, 3 | ABCD |

Two things to note:

- **The table has four slots and the rotation is always `released mod 4`, regardless of
  entrance count.** With three entrances the ABCB table means the second entrance
  releases twice as often as the first and third.
- **More than four entrances all release from the first** (the AAAA row). Whether a level
  may enable more than four entrances at all is a rule variant (Chapter 20), as is an
  alternate two-entrance ordering (ABBA instead of ABAB).

## 13.5 The spawned lemming

A released lemming is created and initialised as follows:

| Field | Value |
|---|---|
| `x` | entrance's `x` + **24** |
| `y` | entrance's `y` + **14** |
| `action` | **Falling** — it drops out of the hatch |
| `direction` | **+1** (facing right) |
| `listIndex` | the next index — it is **appended to the end** of the lemming list (§12.3) |
| everything else | the level-start defaults (§11.6): no fuse, no traits, fresh counters |

The `(+24, +14)` offset places the lemming at the hatch mouth relative to the entrance
object's stored top-left corner. It is a fixed offset and does **not** depend on the
entrance's drawing flags (§5.3) — an upside-down entrance still releases from
`(+24, +14)`. The `+24` becomes `+25` under a rule variant (Chapter 20).

Newly appended, the lemming is processed by phase 5 in the same frame it is spawned, at
the tail of the list. It falls until it meets ground, then walks (Chapter 15).

Releasing also increments the population counters: `released` and `out` both go up by
one (§11.3).

## 13.6 Adjusting the release rate

The release rate is the one level parameter the player changes during play. Phase 2
(§12.1) applies a held increase or decrease to `currentReleaseRate`, clamped to:

```
level's ReleaseRate  ≤  currentReleaseRate  ≤  99
```

**The level's own release rate is the floor** — the player can raise the rate up to 99
or lower it back down to the designer's value, but never below it. A level authored at
rate 50 can never run slower than 50.

A change affects only future releases: because §13.2 recomputes the interval from the
current rate at each release, raising the rate shortens the wait for the *next* lemming,
and lowering it lengthens it, but neither retimes a countdown already in progress until
it next reaches 0.

## 13.7 When releasing stops

No lemming is released once `released` has reached `maxLemmings` (the level's
`lemmingsCount`, §11.3) — the countdown keeps running but the release is suppressed.

A nuke also ends releasing immediately, by a separate gate: arming the nuke sets the
*nuking* flag, and spawning is suppressed whenever that flag is set (§19.4), regardless
of the counts. (The nuke's *scoring* glitch separately lowers `maxLemmings`, but that is
about the percentage, not about stopping the stream — Chapter 19.)

## 13.8 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Entrances open | Frame 35 (the flag), gating releases | Hatch opening animation |
| Initial delay | Countdown starts at 20 and ticks from frame 35 on (frame 35 is the first count) ⇒ first release on frame 54 | — |
| Interval | `(99 − rate) div 2 + 4`, from the current rate per release | — |
| Entrance rotation | `orderTable[released mod 4]`; tables per §13.4 | — |
| Spawn position | entrance `+ (24, 14)`; flag-independent | — |
| Spawn state | Action Falling, direction +1, appended to list | — |
| Release rate | Clamped `[level rate, 99]`; level rate is the floor | — |
| Stop | At `released == maxLemmings`; a nuke suppresses via its flag (§19.4) | — |

# 14. The action state machine

At every moment a lemming is in exactly one **action**. The action decides which
handler runs for it each frame (Chapter 15), which animation it shows, and how it
responds to the world. This chapter defines the states themselves, the operation that
moves a lemming from one to another, and what a lemming's fields are set to on entry.
Chapter 15 defines *when* each transition fires; this chapter defines *what a
transition does*.

## 14.1 The states

There are nineteen action values. One, `None`, is a placeholder never held during play;
the other eighteen are the real states, each with its own handler (Chapter 15).

| State | The lemming is… | Entered | Animation |
|---|---|---|---|
| Walking | walking forward | automatically (the default) | loop |
| Jumping | stepping up a low ledge | automatically, from Walking | once |
| Falling | dropping through empty space | automatically; also at spawn | loop |
| Floating | descending slowly under an umbrella | automatically, from Falling (floater trait) | loop |
| Climbing | scaling a vertical wall | automatically, from Walking (climber trait) | loop |
| Hoisting | pulling up over a climbed wall's top | automatically, from Climbing | once |
| Building | laying a brick staircase | **assigned** | loop |
| Bashing | tunnelling horizontally | **assigned** | loop |
| Mining | tunnelling diagonally down | **assigned** | loop |
| Digging | tunnelling straight down | **assigned** | loop |
| Blocking | standing as a two-sided barrier | **assigned** | loop |
| Shrugging | out of bricks, arms up | automatically, from Building | once |
| Ohnoing | fuse expired, about to explode | automatically (fuse) | once |
| Exploding | detonating | automatically, from Ohnoing (or fuse in air) | once |
| Splatting | dying from too great a fall | automatically, from Falling | once |
| Drowning | dying in water | automatically (water trigger) | once |
| Vaporizing | dying in fire | automatically (fire trigger) | once |
| Exiting | leaving through the exit (saved) | automatically (exit trigger) | once |

**Five states are terminal**: Exploding, Splatting, Drowning, Vaporizing, Exiting each
play a *once* animation and then remove the lemming (Chapter 15). Every other state can
be left for another.

## 14.2 How states are entered: assigned versus automatic

Only **five** states are entered by direct player assignment: Building, Bashing, Mining,
Digging, Blocking (Chapter 18). Everything else the simulation enters on its own.

The other three player skills do **not** name a state directly:

- **Climber and floater are traits, not states.** Assigning them sets a permanent flag
  (`isClimber`, `isFloater`); the lemming enters Climbing or Floating only later, when a
  walker meets a wall or a faller has fallen far enough. A climber that never meets a
  wall never enters Climbing.
- **Bomber is a fuse, not a state.** Assigning it lights the countdown (§11.1); the
  lemming keeps doing whatever it was doing until the fuse expires, then enters Ohnoing
  (or Exploding directly if airborne).

This is why the skill count is eight but the assignable *states* are five. Chapter 18
specifies the mapping; Chapter 14 only needs the distinction, because it changes what
"entering a state" means — a flag set now versus a state entered later.

## 14.3 The transition operation

All state changes go through one operation, `transition(lemming, newAction, turn?)`. It
does up to three things, in order:

1. **Turn, if asked.** If `turn` is set, negate `direction` (§14.5). This happens first,
   so the animation chosen next reflects the new facing.
2. **Always reselect the animation.** Set the lemming's animation to `newAction` at its
   current facing, and with it `maxFrame`, the loop/once type, and the foot anchor
   offsets (§11.2, Chapter 9). This happens on *every* call, even a pure turn or a
   no-op re-entry — the animation is never stale.
3. **Reset state, only on a real change.** If `newAction` differs from the current
   action, reset the per-action state:

   | Field | Set to |
   |---|---|
   | `action` | `newAction` |
   | `frame` | 0 |
   | `endOfAnimation` | false |
   | `fallen` | 0 |
   | `bricksLeft` | 0 |
   | builder tint | cleared |

   then run the entry initialisation for the new state (§14.4).

The ordering of the two early-outs is exact and normative:

- If `newAction` equals the current action **and** `turn` is not set, the operation does
  nothing at all (returns at the top).
- If `newAction` equals the current action **but** `turn` is set, steps 1–2 run (facing
  flips, animation reselects) and then it returns — **the state reset in step 3 does not
  run.** A turn preserves `frame`, `fallen` and everything else; only facing and the
  mirrored animation change.

That second case is exactly a turn-around, and the game exposes it as its own operation
(§14.5). The consequence to hold onto: **turning does not restart the animation or reset
fall distance** — a walker that turns keeps walking mid-stride.

## 14.4 Entry initialisation

When a *real* transition occurs (§14.3 step 3), the new state's entry actions run. Most
states do nothing beyond the common reset; these do more:

| Entering | Entry actions |
|---|---|
| Building | `bricksLeft := 12` |
| Falling | `fallen := 3` **only if** the faller-starts-with-3 variant is active (Chapter 20); otherwise `fallen` stays 0 |
| Digging | `isNewDigger := true` (dig on the first frame, §15) |
| Floating | `floatIndex := 0` (start of the descent table, §15) |
| Blocking | `isBlocking := true`; save the nine object-map cells and write the blocker field (§4.5) |
| Splatting | cancel any fuse (`explosionTimer := 0`); stop moving (`direction := 0`) |
| Mining | **`y := y + 1`** — entering mining nudges the lemming down one pixel |
| Ohnoing, Exploding, Exiting | play their cue (Chapter 24) |

Two of these are easy to miss and are load-bearing:

- **Mining moves the lemming one pixel down on entry**, before its handler ever runs.
  Omitting this misaligns every mine tunnel by a pixel.
- **Splatting zeroes `direction`.** A splatting lemming has no facing; this is why the
  splat animation is one of the direction-symmetric ones (§14.5).

## 14.5 Turning around

A **turn** negates `direction` (+1 ↔ −1) and reselects the mirrored animation for the
current action, and does nothing else — `frame`, `fallen`, action and all other state are
preserved (§14.3, the `turn` early-out). It is the same operation as `transition(lemming,
sameAction, turn: true)`.

Turns are triggered by the handlers and object logic — a walker meeting a wall it cannot
climb, a lemming reaching a level edge (§2.3), a blocker's arm, a one-way wall against
the grain. Chapters 15 and 17 say exactly when; here it matters only that a turn is
cheap and preserves progress.

**Whether a turn changes the visible animation depends on the action.** Nine actions
have distinct left- and right-facing animations; the other nine share one symmetric
animation, so turning them flips `direction` with no visible change:

| Mirrored — 10 (turn flips the sprite) | Symmetric — 8 (one animation both ways) |
|---|---|
| Walking, Jumping, Falling, Floating, Climbing, Hoisting, Building, Bashing, Mining, Shrugging | Digging, Drowning, Splatting, Exiting, Vaporizing, Blocking, Ohnoing, Exploding |

The distinction is authored art (Chapter 9); what is normative is that `direction`
flips and the animation is reselected for the new facing.

## 14.6 The transition map

The edges between states are decided in the handlers (Chapter 15) and object logic
(Chapter 17), not here, but an orientation map helps. The principal transitions:

- **Walking** is the hub. It leaves to: Falling (walks off an edge), Jumping (small step
  up), Climbing (climber meets a wall), or any assigned working state. It is returned to
  from almost everywhere when work finishes or a fall lands.
- **Falling** → Walking (soft landing), Splatting (landing after too long a fall),
  Floating (a floater, once fallen far enough), or a fatal trigger.
- **Climbing** → Hoisting (reaches the top) → Walking; or Falling (bumps an overhang).
- **Building** → Walking (staircase blocked or complete) or Shrugging (bricks exhausted)
  → Walking; can also start Falling.
- **Bashing / Mining / Digging** → Walking or Falling when the tunnel ends, is blocked by
  steel, or breaks through.
- **Blocking** → Walking when the ground under the blocker is removed.
- **Ohnoing** → Exploding. The fatal and Exiting states are sinks: they end in removal.

Any lemming can be diverted to Drowning, Vaporizing or Exiting by an object trigger
(Chapter 17), or to Ohnoing/Exploding by its fuse (§12.3), regardless of current state.

## 14.7 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| States | The 18 live states and their loop/once type | Enum values, names |
| Assignment | 5 states assigned directly; climber/floater = traits; bomber = fuse | — |
| Transition | Turn → reselect animation → (on real change) reset + entry init | — |
| Turn early-out | Same action + turn ⇒ facing/animation only, no state reset | — |
| Entry init | §14.4, incl. mining's `y+1` and splatting's `direction:=0` | — |
| Turning | Flips `direction`, reselects animation, preserves progress | Which actions have distinct mirrored art |
| Terminal states | Exploding, Splatting, Drowning, Vaporizing, Exiting remove the lemming | — |

# 15. The action handlers

This is the chapter the rest of the document is substrate for. Each of the eighteen
live actions (Chapter 14) has a **handler**: the per-frame procedure that moves the
lemming, probes the terrain, modifies it, and decides when to transition. The handlers
are where the pixel probes of Chapter 3 and the anchors of Chapter 9 are finally
exercised, and where §1.4's warning bites — a probe offset wrong by one pixel is a
different game.

Because of that, every handler below is given as **exact integer logic**: the precise
probes, the precise step limits, the precise frame indices — a loop is written as a
loop, a magic number stated as a number.

The handlers are grouped for reading: **locomotion** (§15.1–15.6), the **terrain-work
skills** (§15.7–15.10), and the **stationary, fatal and exit states** (§15.11–15.18),
followed by the shared operations they share (§15.19).

## 15.0 How to read a handler

**The per-frame contract.** For each active lemming, phase 5 (§12.3) first advances the
animation frame (§12.4), then runs the current action's handler, then — if the handler
returns *check objects* — runs object interaction (Chapter 17) at the lemming's new
position. So by the time a handler runs, `frame` is already the current frame; and a
handler that returns *check objects* is asking for its landing spot to be tested against
exits, traps, water and blocker fields this same frame.

**The return value matters.** Each handler returns a boolean — written here as **check
objects: yes / no**. *No* suppresses object interaction for that lemming this frame
(used when the lemming has just been removed, or is mid-animation in a state that must
not trigger anything). This is normative: it changes which frame a lemming can first
touch an object.

**Notation.** Throughout this chapter:

| Symbol | Meaning |
|---|---|
| `x`, `y` | The lemming's foot position (§2.1) |
| `d` | `direction`: +1 facing right, −1 facing left |
| `T(x, y)` | `hasTerrain(x, y)` — solid pixel test (§3.2) |
| `Tc(x, y, m)` | `hasTerrainClamped(x, y, m)` — clamped test, floor `y` at `m` (§3.3) |

All moves and probes are in whole pixels. "Turn" means the turn-around of §14.5;
"→ State" means a transition (§14.3) to that state.

## The locomotion states

The six states a lemming moves through on its own, without a skill: Walking and its
step-up Jumping, Falling and the floater's slow descent, and the climber's Climbing and
Hoisting.

### 15.1 Walking

The default state and the hub of the machine (loop animation). Each frame:

```
x += d                                     // step one pixel in the facing direction

if x < 0 or x > 1647:                       // left/right world bound (§2.3)
    turn;  return check objects: yes

if Tc(x, y, 0):                             // terrain at the new foot — rising ground or wall
    dy = 0
    while dy <= 6 and Tc(x, y − dy − 1, −dy − 1):   // measure how high it rises
        dy += 1
    if dy > 6:                              // rises more than 6px ⇒ a wall
        if isClimber: → Climbing
        else:         turn
        return check objects: yes
    else:                                   // rises 0..6px ⇒ step up onto it
        if dy >= 3: → Jumping;  y = y − 2   // a 3..6px step also starts a Jump
        else:       y = y − dy
        clamp to top boundary (§2.3)
        return check objects: yes

else:                                       // no terrain at the foot — walk down or fall
    dy = 1
    while dy <= 3:
        y += 1
        if Tc(x, y, dy): break              // found ground within 3px down
        dy += 1
    if dy > 3:                              // no ground within 3px ⇒ start falling
        y += 1;  → Falling
    if y > 163:  remove (fell out, §2.3);  return check objects: no
    return check objects: yes
```

The behaviour condenses to a step-height table, which is the most-used set of numbers
in the game:

| Terrain change ahead | Result |
|---|---|
| Rises 1–2 px | Walk up onto it (stay Walking) |
| Rises 3–6 px | **Jumping** (and `y −= 2`) |
| Rises 7+ px | Wall: **Climbing** if a climber, else **turn around** |
| Level, or drops 1–3 px | Walk along / down (stay Walking) |
| Drops 4+ px | **Falling** |
| Past x = 0 or x = 1647 | Turn around |

Note the asymmetry that defines the movement's feel: a lemming steps *up* to 2 px smoothly
and *down* to 3 px smoothly, climbs or turns at anything over 6 px up, and falls at
anything over 3 px down.

### 15.2 Jumping

Not a leap — the brief vertical "step-up" state a walker enters for a 3–6 px rise
(§15.1). It only moves the lemming *up*, never forward (once animation). Each frame:

```
dy = 0
while dy < 2 and Tc(x, y − 1, −dy − 1):     // rise up to 2px this frame
    dy += 1;  y −= 1
if dy < 2:  → Walking                        // rose less than 2px ⇒ done stepping up
clamp to top boundary (§2.3)
return check objects: yes
```

So a jumper climbs the step at up to 2 px per frame and drops back to Walking the frame
it rises less than 2 px — i.e. once it has cleared the step. It does not advance in `x`
while jumping; forward motion resumes on returning to Walking.

### 15.3 Falling

Entered at spawn and whenever a walker (or bashed/mined/built-off lemming) loses its
ground (loop animation). It accumulates `fallen`, the total distance dropped, which
decides splatting and floating. Each frame:

```
if fallen > 16 and isFloater:               // a floater deploys after falling 16px
    → Floating;  return check objects: yes

dy = 0
while dy < 3 and not Tc(x, y, dy):          // fall up to 3px this frame
    dy += 1;  y += 1
    if y > 163:  remove (fell out, §2.3);  return check objects: no

if dy == 3:                                  // fell the full 3px, still no ground
    fallen += 3;  return check objects: yes
else:                                        // hit ground within 3px
    if fallen > 60:  → Splatting             // fell too far to survive
    else:            → Walking
    return check objects: yes
```

Three normative thresholds:

- **A faller descends at most 3 px per frame** and adds 3 to `fallen` for each full-speed
  frame.
- **`fallen > 60` (MAX_FALLDISTANCE) on landing ⇒ Splatting** (death). 60 or less ⇒ a safe
  landing back to Walking.
- **`fallen > 16` with the floater trait ⇒ Floating** — so a floater that starts falling
  drops ~16 px before the umbrella opens.

**The splatting-return quirk.** Notice Splatting returns *check objects: yes*. That lets
object interaction run on the very frame the lemming begins to splat — and if it splats
onto an exit's trigger, the exit turns it from Splatting to Exiting, saving it. Whether this
"drop straight into the exit" behaviour is active is a rule variant (Chapter 20).

### 15.4 Floating

The floater's slow descent (loop animation). Unlike other handlers it does not advance
the frame normally — it drives both its `y` motion and its displayed frame from a
16-entry table, indexed by `floatIndex` (§11.1). Each frame:

```
frame = FloatTable[floatIndex].animFrame     // set displayed frame from the table
dy    = FloatTable[floatIndex].dy
floatIndex += 1
if floatIndex >= 16:  floatIndex = 8         // after 15, loop back to 8

if dy <= 0:
    y += dy                                   // rise or hold (dy is 0 or negative)
else:
    minY = 0
    while dy > 0:                             // descend dy px, stopping on ground
        if Tc(x, y, minY):  → Walking;  return check objects: yes
        y += 1;  dy -= 1;  minY += 1

if y > 163:  remove (fell out, §2.3);  return check objects: no
return check objects: yes
```

The table *is* the floating physics — a fixed descent profile, no arithmetic:

| idx | dy | idx | dy | idx | dy | idx | dy |
|---|---|---|---|---|---|---|---|
| 0 | +3 | 4 | −1 | 8 | +2 | 12 | +2 |
| 1 | +3 | 5 | 0 | 9 | +2 | 13 | +2 |
| 2 | +3 | 6 | +1 | 10 | +2 | 14 | +2 |
| 3 | +3 | 7 | +1 | 11 | +2 | 15 | +2 |

Reading it: entries 0–3 are a fast 3 px/frame drop while the umbrella opens (12 px
total), then a one-pixel bob up and a settle (−1, 0, +1, +1), then a **steady 2 px per
frame** descent from entry 8 onward — and since the index loops 8→15→8, a floater falls
2 px per frame indefinitely until it lands. This is the number that makes floaters slow
enough to always survive. (The umbrella-open cue fires as `floatIndex` passes 1,
Chapter 24.)

### 15.5 Climbing

Entered when a walking climber meets a wall over 6 px tall (§15.1); the lemming scales it
(loop animation). The 8-frame cycle splits in two:

```
if frame <= 3:                               // lower half of the cycle: watch for the top
    if not Tc(x, y − 7 − frame, 0):          // no terrain where the head is rising to ⇒ top reached
        y = y − frame + 2
        → Hoisting;  clamp to top (§2.3)
    return check objects: yes
else:                                        // upper half: climb one pixel
    y −= 1
    if (y + footDy < −5) or Tc(x − d, y − 8, −8):   // head past top bound, or an overhang behind
        → Falling with turn;  x += d * 2      // (d is already reversed by the turn)
    return check objects: yes
```

Two exits:

- **Reaching the top** (frames 0–3, no terrain above the head): nudge up and go to
  **Hoisting** — the pull-up-over-the-edge state.
- **Hitting an overhang** (frames 4–7): the wall has a ceiling — **Falling**, turned
  around and pushed 2 px off the wall (in the new facing). A climber cannot climb past an
  overhang.

The climber rises 1 px per frame during the upper half of each cycle.

### 15.6 Hoisting

The pull-up that follows a successful climb (once animation). Short:

```
if frame <= 4:
    y −= 2                                    // haul up 2px/frame
    clamp to top (§2.3)
    return check objects: yes
else if endOfAnimation:                       // frame 7
    → Walking;  clamp to top (§2.3)
    return check objects: yes
else:
    return check objects: no                  // frames 5–6: no motion, no object check
```

The hoist hauls the lemming up 2 px per frame over frames 0–4, holds through frames 5–6,
and returns to **Walking** at the end of the animation. Note frames 5–6 return *check
objects: no* — the one place a mid-animation handler deliberately suppresses object
interaction.

## The terrain-work skills

The four assigned skills that reshape terrain. Each is frame-driven: over its animation
cycle it does its work on specific frame indices and moves on others. All four call the
**terrain-modification primitives of Chapter 16** — brick laying, row digging, the bash
and mine masks — which own the exact pixel geometry; this chapter owns *when* each is
applied and *when the skill ends*.

Recall the steel and one-way-wall gating from Chapter 4: a working skill is stopped not
by protecting individual pixels but by the handler detecting steel or an against-the-grain
one-way wall at its probe and transitioning out. Those probes are here.

### 15.7 Building

Lays a rising staircase of bricks (loop animation, 16 frames). Entered with
`bricksLeft = 12` (§14.4). The work is spread across the cycle:

```
if frame == 10 and bricksLeft <= 3:  cue builder-warning (Ch 24)

if frame == 9 or (frame == 10 and bricksLeft == 9):   // lay this step's brick
    layBrick()                                         // Ch 16: 6px line at y−1
    return check objects: no

if frame == 0:                                         // step up and forward onto the brick
    x += d;  y −= 1
    if x <= 0 or x > 1647 or Tc(x, y − 1, −1):         // wall immediately ahead
        → Walking + turn;  clamp top;  return check objects: yes
    x += d
    if Tc(x, y − 1, −1):                               // wall one pixel further
        → Walking + turn;  clamp top;  return check objects: yes
    bricksLeft −= 1
    if bricksLeft == 0:  → Shrugging;  clamp top;  return check objects: yes
    if Tc(x + d*2, y − 9, −9) or x <= 0 or x > 1647:   // obstacle ahead at head height
        → Walking + turn;  clamp top;  return check objects: yes
    if y + footDy < −5:  → Walking (no turn);  clamp top   // ran into the ceiling
    return check objects: yes

return check objects: yes                              // all other frames: idle
```

Key facts:

- **A brick is laid once per cycle, on frame 9** (the `frame == 10 and bricksLeft == 9`
  clause is a quirk that lays an extra brick on the very first step). `layBrick`
  places a 6-pixel horizontal line one pixel above the foot, filling only empty pixels
  (Chapter 16).
- **The builder steps up 1 px and forward 2 px on frame 0**, then spends one brick. So the
  staircase rises at roughly 1 vertical : 2 horizontal.
- **Three ways to stop.** Out of bricks → **Shrugging** (§15.11). A wall ahead (any of the
  `Tc` probes) → **Walking**, turned around. The ceiling (head above the top bound) →
  **Walking**, *not* turned — an intentional asymmetry, not an oversight.
- The brick-lay frame returns *check objects: no*; motion frames return *yes*.

### 15.8 Bashing

Tunnels horizontally (loop animation, 16 frames, but `frame` runs 0–31 over two cycles;
use `index = frame mod 16`). Work and motion occupy different parts of the cycle:

```
index = frame mod 16

if 11 <= index <= 15:                       // MOVE: advance into the tunnel
    x += d
    if x < 0 or x > 1647:
        → Walking + turn
    else:
        dy = 0                              // fall if the floor fell away
        while dy < 3 and not Tc(x, y, dy):
            dy += 1;  y += 1
        if dy == 3:
            → Falling
        else:
            front = objectMap(x + d*8, y − 8)          // steel / one-way ahead (§4.4)
            if front == STEEL:  cue hits-steel
            if front == STEEL
               or (front == ONE_WAY_LEFT  and d != −1)
               or (front == ONE_WAY_RIGHT and d != +1):
                → Walking + turn
    return check objects: yes

else:
    if 2 <= index <= 5:                     // MASK: remove a chunk ahead
        applyBashMask(index − 2)            // Ch 16: bash mask frame 0..3
        if index == 5:
            cue basher
            n = 0;  x2 = x + d*8;  y2 = y − 6           // is there anything left to bash?
            while n < 4 and not T(x2, y2):              // note: T, not Tc
                n += 1;  x2 += d
            if n == 4:  → Walking          // 4px of clear air ahead ⇒ done
    return check objects: no
```

Key facts:

- **The mask is applied on frames 2–5** (four mask frames, Chapter 16), carving the tunnel;
  **the lemming advances on frames 11–15**, one pixel each — so a basher moves 5 px per
  16-frame cycle.
- **Bashing ends three ways.** Nothing left to bash — the frame-5 look-ahead finds 4 px of
  clear air → **Walking**. The floor falls away during a move frame → **Falling**. Steel or
  an against-the-grain one-way wall ahead → **Walking**, turned around.
- The frame-5 look-ahead uses the **unclamped** probe `T` (§3.2), not `Tc` — correct and
  normative here, because the check must see true empty space, not a clamped top edge.

### 15.9 Mining

Tunnels diagonally downward (loop animation, 16 frames). Recall entering Mining nudges
the lemming down 1 px (§14.4). Work on frames 1–2, motion on frames 3 and 15:

```
if frame == 1:
    applyMineMask(0, at x + footDx, y + footDy)         // Ch 16: mine mask frame 0
    return check objects: no
if frame == 2:
    applyMineMask(1, at x + d + footDx, y + 1 + footDy) // Ch 16: mine mask frame 1
    cue miner
    return check objects: no

if frame == 3 or frame == 15:                           // MOVE: down-and-forward
    x += d
    if x < 0 or x > 1647:  → Walking + turn;  return check objects: yes
    x += d
    if x < 0 or x > 1647:  → Walking + turn;  return check objects: yes
    if frame == 3:
        y += 1
        if y > 163:  remove (fell out);  return check objects: no
    if not Tc(x, y, 0):  → Falling;  return check objects: yes    // floor gone ⇒ fall
    below = objectMap(x, y)                              // steel / one-way underfoot
    if below == STEEL:  cue hits-steel
    if below == STEEL
       or (below == ONE_WAY_LEFT  and d != −1)
       or (below == ONE_WAY_RIGHT and d != +1):          // ← see the bug variant below
        → Walking + turn
    return check objects: yes

if frame == 0:
    y += 1
    if y > 163:  remove (fell out);  return check objects: no
    return check objects: yes

return check objects: no                                // all other frames: idle
```

Key facts:

- **Two mask applications, frames 1 and 2**, the second offset one pixel forward and down —
  together they carve the diagonal (Chapter 16). **Motion is on frames 3 and 15**: 2 px
  forward each, plus 1 px down on frame 3. The net path is a shallow down-forward diagonal.
- **Mining ends** on lost floor → **Falling**, or steel / against-the-grain one-way →
  **Walking**, turned.
- **Miner versus right one-way walls (rule variant, Chapter 20).** The steel/one-way check
  above is the *directional* form. Under the other form, the `ONE_WAY_RIGHT` clause drops
  its direction test — `below == ONE_WAY_RIGHT` alone turns the miner — so a right-pointing
  one-way wall becomes **unminable from either direction**. Which form is active is a rule
  variant.

### 15.10 Digging

Tunnels straight down (loop animation). Digging **advances its own frame** (§12.4), so the
handler manages `frame` itself:

```
if isNewDigger:                             // first frame after assignment (§14.4)
    digOneRow(y − 2)                        // Ch 16: 9px-wide row removal
    digOneRow(y − 1)
    isNewDigger = false
else:
    frame += 1
    if frame >= 16:  frame −= 16

if frame == 0 or frame == 8:                // dig a row every 8 frames
    yTop = y
    y += 1
    if y > 163:  remove (fell out);  return check objects: no
    if not digOneRow(yTop):                 // nothing removed ⇒ broke through into air
        → Falling
    else if objectMap(x, y) == STEEL:       // hit steel underfoot
        cue hits-steel;  → Walking
    return check objects: yes

return check objects: no
```

Key facts:

- **On assignment it immediately clears two rows** (`y−2` and `y−1`), so digging bites the
  instant it is assigned rather than waiting a frame.
- **Thereafter it digs one row every 8 frames** (on frames 0 and 8), stepping down 1 px each
  dig. `digOneRow` clears a 9-pixel-wide row and reports whether it removed anything
  (Chapter 16).
- **Digging ends two ways.** The row is already empty — broken through into a cavity →
  **Falling**. Steel directly below → **Walking** (digging cannot pass steel).

## The stationary, fatal and exit states

The remaining eight handlers are short. Six are **terminal**: they play a *once*
animation and, when it ends, remove the lemming (§15.19). The two non-terminal ones —
Blocking and Shrugging — return the lemming to Walking.

### 15.11 Blocking

The assigned barrier state (loop animation). The blocker stands and turns others via its
object-map field (§4.5); its own handler only watches for its ground to vanish:

```
if not Tc(x, y, 0):                 // the ground under the blocker is gone
    → Walking
    isBlocking = false;  restore the nine saved object-map cells (§4.5)
return check objects: no
```

A blocker blocks **indefinitely** — it has no timer. It stops only when the terrain
beneath its foot is removed (a basher, miner or digger cutting underneath, or an
explosion), at which point it becomes a Walker and restores the object-map cells its
field had overwritten. It never checks objects while blocking.

### 15.12 Shrugging

The brief "out of bricks" state a builder enters when its supply is exhausted (§15.7,
once animation):

```
if endOfAnimation:  → Walking;  return check objects: yes
return check objects: no
```

It plays once and returns to Walking, checking objects on that final frame.

### 15.13 Ohnoing

The countdown-expiry animation, entered when a fuse reaches 0 on the ground (§12.3, once
animation):

```
if endOfAnimation:  → Exploding;  return check objects: no
dy = 0
while dy < 3 and not Tc(x, y, dy):  // still falls if unsupported
    dy += 1;  y += 1
if y > 163:  remove (fell out);  return check objects: no
return check objects: yes
```

Two things worth noting: an oh-no-ing lemming **is still subject to gravity** — it falls
up to 3 px per frame like a faller — and it **still checks objects** (returns yes), so it
can reach an exit or hit a trap during the animation. When the animation ends it becomes
Exploding.

### 15.14 Exploding

The detonation (once animation). Everything happens at the end of the animation:

```
if endOfAnimation:
    if isBlocking:  isBlocking = false;  restore saved object-map cells (§4.5)
    if objectMap(x, y) not in {STEEL, WATER}:
        applyExplosionMask()        // Ch 16: blow a crater
    remove
    isExploded = true;  particleTimer = 52       // particle scatter (Ch 21)
    if particles are shown:  particleFinishTimer = 52    // holds the level open (§12.2)
return check objects: no
```

On detonation the lemming: undoes its blocker field if it had one; **blows a crater
unless it is standing on steel or in water** (in which case no terrain is removed); is
removed; and launches the 52-frame particle scatter, which also holds the level open long
enough to show it (§12.2). Terminal.

### 15.15 Splatting

Death from a fall over 60 px (§15.3, once animation):

```
if endOfAnimation:  remove
return check objects: no
```

Plays once, then removed — a loss, not a save. (Recall the direct-drop-to-exit quirk of
§15.3: because Splatting is *entered* with check-objects yes, it can convert to Exiting on
that entry frame if it lands on an exit; once splatting proper is under way, this handler
never checks objects again.)

### 15.16 Drowning

Death in water (once animation):

```
if endOfAnimation:  remove
else if not T(x + d*8, y):          // no terrain 8px ahead (unclamped, §3.2)
    x += d                          // drift forward in the water
return check objects: no
```

The drowning lemming drifts in its facing direction until it meets terrain or the
animation ends, then is removed. The probe is the **unclamped** `T` — correct here, as a
drowner near the top of the world should not be clamped.

### 15.17 Vaporizing

Death in fire (once animation):

```
if endOfAnimation:  remove
return check objects: no
```

The plainest terminal state: play once, remove.

### 15.18 Exiting

The one successful outcome (once animation), entered on reaching an exit's trigger
(Chapter 17):

```
if endOfAnimation:  remove;  saved += 1
return check objects: no
```

At the end of the animation the lemming is removed **and `saved` is incremented** — this
is the only handler that adds to the saved count, and therefore the only path to winning
(Chapter 19).

## 15.19 Shared operations

Two operations are invoked by handlers throughout the chapter and are defined once here.

**Clamp to top** — called wherever a handler moves a lemming upward (written above as
"clamp to top"). It enforces the top world bound (§2.3) in sprite space:

```
if y + footDy < −5:                 // head (foot + anchor) above the top bound
    y = −5 − 2 − footDy             // push the head back to just below the bound
    turn
    if action == Jumping:  → Walking
```

Breaching the top pushes the lemming down, turns it around, and — the one special case —
converts a Jumper to a Walker (a jump into the ceiling ends as a walk).

**Removal** — every terminal handler ends here:

```
isRemoved = true;  out −= 1;  removed += 1
```

Exiting additionally does `saved += 1`. So `saved` is always a subset of `removed`, and
the population invariant `out = released − removed` of §11.3 is preserved by this single
operation.

## 15.20 Normative and free — summary

The whole chapter is normative behaviour; the table records the pivots most easily got
wrong.

| Handler | Normative pivots |
|---|---|
| Walking | Step table: up 1–2 smooth / 3–6 jump / 7+ wall; down 1–3 smooth / 4+ fall |
| Jumping | Rise ≤2 px/frame, up only; ends when it rises <2 |
| Falling | 3 px/frame; splat at `fallen > 60`; floater deploys at `fallen > 16` |
| Floating | The 16-entry `dy` table; steady 2 px/frame loop 8→15 |
| Climbing | 1 px/frame up; top→Hoisting; overhang→Falling+turn+push-off |
| Hoisting | 2 px/frame up frames 0–4; frames 5–6 suppress object check |
| Building | Brick on frame 9; step 1-up/2-fwd on frame 0; out-of-bricks→Shrug; ceiling→Walk no-turn |
| Bashing | Mask frames 2–5, move 11–15 (5 px/cycle); frame-5 look-ahead uses unclamped `T` |
| Mining | Masks 1–2, move 3 & 15; one-way-right bug is a variant (Ch 20) |
| Digging | Two rows on assign; one row per 8 frames; steel→Walk, air→Fall |
| Blocking | No timer; ends only when ground removed; restores saved cells |
| Ohnoing | Still falls; still checks objects; →Exploding at end |
| Exploding | Crater unless on steel/water; particles + level-hold; terminal |
| Splatting / Vaporizing | Play once, remove |
| Drowning | Drift forward (unclamped) until stopped; remove |
| Exiting | The only handler that increments `saved` |

Free throughout: the handlers' *animation artwork* (Chapter 9) and the *crater/particle
appearance* (Chapter 21). What every probe, offset, frame index and step limit above
computes is normative.

# 16. Terrain modification

The action handlers of Chapter 15 reshape the terrain buffer through five primitives —
three that remove terrain with a **mask**, one that lays bricks, and one that digs a
row. This chapter defines those primitives: where each writes, what it writes, and what
data it needs. Chapter 15 owns *when* each is called; this chapter owns *what it does to
the buffer*.

All five operate directly on the terrain buffer (Chapter 3) through its single-pixel
primitives — `hasTerrain` to test, `removeTerrain` / set-solid to change — and none of
them recomputes any collision shape, because there is none (Chapter 3). Terrain is only
ever removed by these primitives, and only ever added by brick laying (§16.4); nothing
else changes the buffer during play.

## 16.1 Masks and what they need

A **mask** is a small 1-bit-per-pixel bitmap that describes a region of terrain to
remove. Applying a mask at a world position tests each mask pixel:

- a **set** mask pixel **removes** the terrain pixel at the corresponding world position
  (whatever was there becomes empty);
- a **clear** mask pixel leaves the world pixel untouched.

That is the whole of mask semantics. A mask never adds terrain and never inspects what
it removes — every set pixel clears, every clear pixel is a no-op.

**This chapter requires three mask bitmaps to be complete.** Their exact pixel patterns
are normative — they determine the precise shape of every tunnel and crater, and
therefore which levels are solvable (§1.4) — but only their dimensions and roles are
fixed here; the bitmaps themselves must be supplied to the implementation as data:

| Mask | Size (w × h) | Frames | Direction |
|---|---|---|---|
| Bash | 16 × 10 | 4 | mirrored (a left-facing and a right-facing form) |
| Mine | 16 × 13 | 2 | mirrored |
| Explosion | 16 × 22 | 1 | symmetric (same both ways) |

"Frames" are successive shapes applied on successive handler frames (§15.8–15.9);
"mirrored" means the left-facing form is the horizontal mirror of the right-facing one
(an implementation may store both or mirror one — Incidental). Pixels of a mask that
fall outside the world are discarded (§3.4).

## 16.2 The bash mask

Applied by the basher on mask frames (§15.8), one of the four frames per application.
The mask's top-left corner is placed at the lemming's sprite origin:

```
applyBashMask(frame):                       // frame ∈ 0..3
    place bash mask[direction][frame]  with top-left at (x + footDx, y + footDy)
```

`footDx`, `footDy` are the sprite-placement offsets (§11.2) — the same ones the renderer
uses — so the 16 × 10 removal aligns with the lemming's drawn body. Successive frames cut
successive slices, carving the horizontal tunnel as the basher advances.

## 16.3 The mine mask

Applied by the miner on frames 1 and 2 (§15.9), at two different positions that together
carve the downward diagonal:

```
applyMineMask(0)  →  top-left at (x + footDx,       y + footDy)         // frame 0
applyMineMask(1)  →  top-left at (x + d + footDx,   y + 1 + footDy)     // frame 1
```

The second application is offset one pixel in the facing direction and one pixel down
from the first, which is what turns two horizontal-ish cuts into a diagonal.

## 16.4 The explosion mask

Applied by an exploding lemming (§15.14), once, centred on the lemming:

```
applyExplosionMask():
    place explosion mask  with top-left at (x − 8, y − 14)
```

This offset is fixed, not anchor-derived: the 16-wide mask sits centred on the foot
`x` (`x − 8`), and the 22-tall mask sits mostly above the foot (`y − 14`), so the crater
straddles and rises above where the lemming stood. The explosion mask is symmetric, so
facing does not matter.

Recall the gate in the handler (§15.14): the mask is applied **only if** the lemming is
not standing on steel or in water. That is an all-or-nothing decision made before this
primitive runs; the primitive itself, once called, always removes.

## 16.5 Brick laying

The one primitive that *adds* terrain. Called by the builder once per step (§15.7):

```
layBrick():
    xStart = x        if facing right
    xStart = x − 4    if facing left
    for the 6 pixels (xStart .. xStart + 5) at row (y − 1):
        if the world pixel is empty:  set it solid
```

Three normative points:

- **A brick is exactly 6 pixels wide, one pixel above the foot** (`y − 1`), extending
  forward from the foot: rightward from `x`, or from `x − 4` when facing left.
- **It fills only empty pixels** — a brick never overwrites existing terrain, so bricks
  merge cleanly into a wall they run into rather than punching through it.
- **The pixels it sets are solid terrain**, indistinguishable thereafter from any other
  terrain (Chapter 3). A brick may itself be bashed, mined or dug.

Each brick may be tinted along a gradient as it is laid (later bricks a different shade)
— that colour is presentation (Chapter 21). What is normative is only *which* pixels
become solid.

## 16.6 Row digging

Called by the digger to clear one horizontal row (§15.10):

```
digOneRow(rowY):                            // rowY clamped to ≥ 0
    removedAny = false
    for the 9 pixels (x − 4 .. x + 4) at row rowY:
        if hasTerrain there:  removeTerrain there;  removedAny = true
    return removedAny
```

Two normative points:

- **A dig clears a 9-pixel-wide row** centred on the lemming (`x − 4` to `x + 4`).
- **It reports whether it removed anything.** The digger uses this: a row that was
  already empty (`removedAny` false) means it has broken through into a cavity and
  becomes a Faller (§15.10). This return value is behaviour, not diagnostics.

## 16.7 Steel and one-way walls gate the skill, not the pixel

None of the five primitives consults the object map. A mask removes every terrain pixel
under a set bit; `digOneRow` removes every terrain pixel in its row; `layBrick` fills
every empty pixel in its line. **Steel and one-way walls do not protect terrain from
these primitives** (§4.6).

Instead, the *handlers* enforce them (Chapter 15): a basher, miner or digger probes the
object map ahead of or beneath itself each cycle and **stops the skill** — transitioning
to Walking (or turning) — before its mask reaches protected terrain. So steel is
respected not because the mask spares it, but because the skill ends first.

The consequence to hold onto, because it is the opposite of the obvious design: an
implementation that "correctly" filters masks per-pixel against steel will **diverge from
this specification** — it will nibble steel-adjacent terrain differently, because the
behaviour here never filters, it just stops early. The gate lives at the probe (Chapter 15), and its
timing is part of the behaviour.

## 16.8 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Mask semantics | Set pixel removes, clear pixel leaves | Bitmap storage |
| Mask data | The three bitmaps' exact shapes; sizes 16×10, 16×13, 16×22 | How supplied; store-both-vs-mirror |
| Bash / mine placement | At `(x + footDx, y + footDy)`; mine frame 1 offset `(+d, +1)` | — |
| Explosion placement | Fixed `(x − 8, y − 14)`; symmetric | — |
| Brick | 6 px at `y − 1`, forward from foot; empty pixels only; becomes real terrain | Brick tint / gradient |
| Dig row | 9 px `(x−4 … x+4)`; returns whether anything was removed | — |
| Steel / one-way | Primitives never check them; the handler stops the skill (§16.7) | — |

# 17. Object interaction

Objects are how the level acts on lemmings: an exit saves them, a trap or water or fire
kills them, a blocker's field or a one-way wall turns them. This chapter defines how a
lemming interacts with the object map each frame (frame phase 5, §12.3), and how the
objects themselves animate (frame phase 7). It is the read side of the object map
(Chapter 4), as Chapter 16 was the write side of the terrain buffer.

## 17.1 The two probes

When a lemming's handler returns *check objects* (Chapter 15), object interaction runs
at the lemming's new position. It begins by reading the object map (Chapter 4) at the
two probe points of §4.4, and caching them on the lemming:

```
objectBelow   = objectMap(x, y)              // at the foot
objectInFront = objectMap(x + 8·d, y − 8)    // 8px ahead, 8px up
```

**Only `objectBelow` drives interaction.** The dispatch below is entirely a decision on
the foot cell. `objectInFront` is read here and stored, but it is consumed elsewhere —
by the bashing, mining and skill-assignment logic (Chapters 15, 18) for their steel and
one-way-wall checks. So this chapter reads two cells but acts on one; the other is a
convenience cache for later in the frame.

A corollary: **steel and one-way walls do nothing to a walking lemming.** They are never
dispatched here (the cases below do not mention them). They matter only to a skill that
probes ahead. A walker strolls over a one-way arrow and across steel-covered ground
untouched.

## 17.2 The object lists

At level start the level's objects (§5.3) are split into two runtime lists:

- **Entrances** — objects of the entrance type (type id 1). These drive spawning
  (Chapter 13) and do **not** participate in object interaction: they contribute nothing
  to the object map and never trigger.
- **Interactive objects** — every other object, kept in placement order. Their trigger
  regions populate the object map (§4.3), and this list is what a trap value indexes.

This split is why the object map's trap value (0 … 127, §4.2) indexes the **interactive
(non-entrance) objects**, numbered in placement order — not the full object list. An
implementation that indexes the full list, entrances included, will fire the wrong trap.

## 17.3 The effect dispatch

Object interaction is a single decision on `objectBelow`:

| `objectBelow` | Effect |
|---|---|
| `NONE` | Nothing |
| `0 … 127` (a trap index) | Trigger that trap (§17.4) |
| `EXIT` | If the lemming's action is **not Falling**: → Exiting, cue yippee |
| `FORCE_LEFT` | If the lemming is moving right (`d > 0`): turn around |
| `FORCE_RIGHT` | If the lemming is moving left (`d < 0`): turn around |
| `WATER` | → Drowning, cue drown |
| `FIRE` | → Vaporizing, cue vaporize |

At most **one** effect fires per lemming per frame — whatever the foot cell holds. Four
points are normative and easy to miss:

- **A falling lemming cannot exit.** The exit acts only if the action is not Falling, so a
  lemming must land and walk (or otherwise be non-falling) into the exit. This is what
  makes the splatting-into-exit quirk (§15.3) observable: a splatter is not falling, so it
  *can* exit on the frame it begins to splat.
- **A blocker's arm only turns lemmings walking into it.** `FORCE_LEFT` turns a
  rightward-mover, `FORCE_RIGHT` a leftward-mover; a lemming already moving away is
  unaffected. This is what makes a blocker a two-sided barrier (§4.5), not a wall.
- **Water and fire are unconditional** — any lemming whose foot enters them dies, in any
  state.
- **Steel and one-way walls are absent from this table** (§17.1).

## 17.4 Traps

A trap is a triggered object that kills. When `objectBelow` is a trap index, and **that
trap is not already triggered**:

```
mark the trap triggered
set its animation frame to its start (see below)
remove the lemming (§15.19)      // the lemming dies
cue the trap's own sound (§17.6, Chapter 24)
```

Two behaviours define how traps feel:

- **A trap is busy while it animates.** The kill happens only if the trap is *not already
  triggered*. Once triggered it plays its animation (§17.5) and ignores lemmings until it
  finishes and re-arms. So a trap kills one lemming, then is briefly harmless — a second
  lemming crossing during the animation walks through unharmed. This is not a bug; it is
  the trap's cadence, and it affects how many lemmings a trap catches.
- **The start frame is a rule variant.** In one form the trap's animation begins on frame 1
  (set to 0, then advanced to 1, skipping frame 0); in the other it begins on frame 0.
  Which is used shifts the trap animation, and its re-arm timing, by one frame
  (Chapter 20).

The trap's sound is chosen from its own metadata (its sound-effect id maps to a specific
trap sound — rope, squishing, ten-ton, bear, electro, spinning; §17.6, Chapter 24).

## 17.5 Object animation

Separately from interaction, objects advance their own animation each frame (phase 7,
§12.1). Every interactive object holds a current animation frame; how it advances depends
on its **animation type**:

| Advances when… | Type |
|---|---|
| Never (static object) | None |
| While triggered (traps) | Triggered |
| Every frame, always (water, fire) | Continuous |
| Once at the start (entrances opening) | Once |

The per-frame rule:

- A **Continuous** object advances its frame every phase 7, wrapping to 0 at the end —
  an endless loop (flowing water, flickering fire).
- A **Triggered** object advances only while its *triggered* flag is set; when its frame
  wraps back to 0, the flag clears — the trap **re-arms** (§17.4). This is the mechanism
  behind a trap's busy period.
- An **entrance** (Once) animates only during opening, from frame 35 (§13.1) until its
  animation completes, then stops for good.

Object animation is otherwise presentation — *which* frame is showing is state
(it gates the trap's re-arm), but the artwork of each frame is authored (Chapter 21).

## 17.6 Effects and animation types

The two enumerations objects carry in their metadata (Chapter 8). Both are normative
values.

**Trigger effect** — what an object does, and the object-map cell it writes (§4.2). The
cell value is the effect code plus 128, except a triggered trap, which writes its list
index instead:

| Effect | Code | Object-map cell |
|---|---|---|
| None | 0 | `NONE` (128) |
| Exit | 1 | `EXIT` (129) |
| Triggered trap | 4 | the trap's index (0 … 127) |
| Drown | 5 | `WATER` (133) |
| Vaporize | 6 | `FIRE` (134) |
| One-way wall left | 7 | `ONE_WAY_LEFT` (135) |
| One-way wall right | 8 | `ONE_WAY_RIGHT` (136) |

Codes 2, 3 and 9 (`FORCE_LEFT`, `FORCE_RIGHT`, `STEEL`) are **not** object effects — those
object-map cells are written by blockers (§4.5) and steel areas (§4.3), not by object
metadata. No object declares them.

**Animation type** — how the object animates (§17.5): None (0), Triggered (1),
Continuous (2), Once (3).

## 17.7 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Probes | Two cells read; only `objectBelow` dispatches | Caching |
| Object lists | Entrances (type 1) split out; traps index the interactive list | List storage |
| Dispatch | One effect/frame; the §17.3 table; falling-can't-exit; arm direction | — |
| Traps | Kill if not busy; re-arm on animation end; start-frame variant (Ch 20) | Trap artwork |
| Animation | None / Triggered / Continuous / Once advance rules | Frame artwork |
| Effects & types | The enum values and effect→cell mapping | Symbolic names |
| Steel / one-way | Inert to interaction; only skills read them | — |

# 18. Skill assignment

This is the player's only lever on an individual lemming: point the cursor, and with a
skill selected, click to assign it. This chapter defines how a click becomes an
assignment — which lemming it targets, whether the assignment is allowed, and what it
does. It is the one place player intent enters the simulation at the granularity of a
single lemming.

Assignment is an **input**, applied at frame phase 8 (§12.7). A click is stamped with its
frame and resolved then; the lemming it resolves to is what a replay records (Chapter
26). Nothing here is timed or random — given the same cursor position and selected skill
on the same frame, the same lemming is chosen and the same result follows.

## 18.1 The flow

```
a skill is selected (the armed panel button, §22)     ← UI state
on a click:
    find the target lemming(s) under the cursor        (§18.2)
    apply the selected skill to them                   (§18.3–18.5)
```

The **selected skill** is UI state (the armed button — Chapters 22, 25); this chapter
takes it as given. What it adds is everything from the click inward.

## 18.2 The cursor hit-test

Every lemming has a **hit box**: a fixed **13 × 13-pixel** square whose top-left corner
is the lemming's sprite origin — `(x + footDx, y + footDy)`, the same anchor-relative
point the sprite and masks use (§11.2, §1.4). A lemming is "under the cursor" when the
cursor point lies in its box:

```
box = [x + footDx  ..  x + footDx + 12] × [y + footDy  ..  y + footDy + 12]
```

The box size is fixed and derived from the anchor, **not** from the sprite artwork — so
our own sprites may be any size, but this 13 × 13 must not change, because it decides
which lemming a click selects (a binding behaviour, §1.3).

**The priority rule.** Scanning all lemmings in list order, the hit-test keeps two
candidates among those under the cursor:

- a **prioritized** lemming — one whose action is *working*: Blocking, Building,
  Shrugging, Bashing, Mining, Digging, or Ohnoing;
- a **non-prioritized** lemming — any other (Walking, Falling, Climbing, …).

Each is the **last** such lemming in list order (later lemmings draw on top, so this
selects the topmost). From these:

```
Lemming1 (primary)   = prioritized, unless there is none or the right button is held,
                       in which case = non-prioritized
Lemming2 (secondary) = non-prioritized  (always)
```

So a left-click on a stack targets the **working** lemming by default; **holding the
right button** targets the passive one instead — the way to pick the walker standing on
the same spot as a basher. (A separate right-click *glitch*, where a stale off-cursor
lemming is targeted when nothing is under the cursor, is a rule variant — Chapter 20.)

## 18.3 Two candidates, and the fallback

The hit-test yields up to two lemmings; assignment tries `Lemming1` first. **The four
terrain-work skills fall back to `Lemming2`** if `Lemming1` fails its preconditions; the
other four skills use `Lemming1` only.

| Skill | Uses |
|---|---|
| Builder, Basher, Miner, Digger | `Lemming1`, then `Lemming2` if it doesn't qualify |
| Climber, Floater, Bomber, Blocker | `Lemming1` only |

The fallback exists because `Lemming1` is usually the *working* lemming, and you often
cannot re-assign a worker the skill it is already doing — so the click falls through to
the passive lemming beneath it.

## 18.4 Per-skill preconditions

An assignment succeeds only if **all** of its conditions hold. Every skill first requires
its **budget > 0** (§11.3); the rest:

| Skill | Target action must be | Additional conditions | On success |
|---|---|---|---|
| **Climber** | any except Blocking / Splatting / Exploding | not already a climber | set climber trait |
| **Floater** | any except Blocking / Splatting / Exploding | not already a floater | set floater trait |
| **Bomber** | any except Ohnoing / Exploding / Vaporizing / Splatting | no fuse already lit (`explosionTimer == 0`) | light the fuse (`= 79`) |
| **Blocker** | Walking, Shrugging, Building, Bashing, Mining, Digging | field must not overlap an existing one (§18.6) | → Blocking |
| **Builder** | Walking, Shrugging, Bashing, Mining, Digging | head not above the top bound (`y + footDy ≥ −5`) | → Building |
| **Basher** | Walking, Shrugging, Building, Mining, Digging | no steel ahead; no one-way wall against the grain | → Bashing |
| **Miner** | Walking, Shrugging, Building, Bashing, Digging | no steel ahead **or** below; no one-way against the grain | → Mining |
| **Digger** | Walking, Shrugging, Building, Bashing, Mining | no steel below | → Digging |

The pattern in the bottom five rows: a work skill (or blocker) may be assigned to a
lemming that is **walking, shrugging, or doing a *different* work skill** — never the one
it is already doing. Walking and shrugging lemmings can take anything; a faller, climber
or floater can take none of the five (they are not in any work set), but can still be
made a climber, floater or bomber (top three rows), which apply to almost any state.

The steel and one-way checks read the lemming's **cached** `objectInFront` / `objectBelow`
(§17.1) — the probe values from its most recent object interaction — not a fresh probe. A
basher or miner blocked by steel plays the hits-steel cue and the assignment simply fails
(the budget is not spent).

## 18.5 What a successful assignment does

On success, in order:

1. **Spend the budget** — decrement that skill's count (§11.3). A failed assignment
   spends nothing.
2. **Apply the effect** — the "on success" column of §18.4: set a trait, light a fuse, or
   transition the lemming to the skill's state (which runs that state's entry
   initialisation, §14.4 — e.g. a builder gets 12 bricks, a blocker writes its field).
3. **Cue the assignment sound** (Chapter 24) and, for climber/floater, apply the tint
   (Chapter 21).
4. **Record the assignment** for replay — the lemming's `listIndex`, the skill, and
   whether the secondary candidate was used (Chapter 26).

A trait assignment (climber, floater) does **not** change the lemming's current action —
it keeps walking or falling; the trait only matters later. A fuse (bomber) likewise
leaves the action alone until it expires (§12.3). The other five transition immediately.

## 18.6 The blocker overlap test

Blocker has one precondition the others do not: its field may not overlap an existing
blocker's field. The test reads the same nine object-map cells the field would occupy
(§4.5) and **fails if any already holds `FORCE_LEFT`, `BLOCKER` or `FORCE_RIGHT`**. If it
fails, the assignment is refused and the budget is not spent. This is what stops two
blockers from being placed on top of each other and corrupting each other's saved cells.

## 18.7 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Hit box | 13 × 13 at sprite origin `(x+footDx, y+footDy)`; fixed, anchor-derived | Cursor artwork |
| Priority | Working lemmings prioritized; last-in-list; right button picks passive | — |
| Candidates | `Lemming1` then `Lemming2` for the four work skills; else `Lemming1` | — |
| Preconditions | Budget > 0 plus the §18.4 table (action set + extra checks) | — |
| Steel / one-way | Read from cached probes; block bash/mine/dig | — |
| On success | Spend budget, apply effect, cue, record; traits/fuse don't change action | Sound, tint |
| Blocker overlap | Refuse if the nine cells hold any blocker value | — |

# 19. Nuke, timer, end conditions & scoring

This chapter closes the loop: what ends a level, and whether the player won. It fills in
frame phase 1 (the end check) and phase 6 (the nuke), and defines the percentage
arithmetic that turns the population counters (§11.3) into a verdict.

## 19.1 The level clock

The clock counts down from the level's time limit (§2.7): one game-second every 17
frames, borrowing minutes, floored at 0:00. It is pure simulation state — defined in
frames, never in wall-clock time (§1.6).

Its only effect on the outcome is expiry: when the clock reaches 0:00, the level ends
and the attempt is judged on whatever has been saved so far (§19.2). Whether the clock
advances while the game is paused is a rule variant (Chapter 20).

## 19.2 End conditions

At frame phase 1 (§12.1), before anything else advances, the game tests whether it has
ended. It ends when **any** of these holds:

| Condition | Meaning |
|---|---|
| `minutes ≤ 0 and seconds ≤ 0` | Time is up |
| `saved ≥ maxLemmings` | Everyone who counts has been saved |
| `removed ≥ maxLemmings` | No lemmings remain in play |
| `nuking and out == 0` | A nuke has finished — the last lemming is gone |

When one holds, the level finishes (§19.5) and no further phases run that frame or after.
Time-up additionally sets a *time-is-up* flag on the result.

**One gate delays all of this: the explosion hold.** While the post-explosion timer
(§11.3, `particleFinishTimer`) is non-zero, the end check does nothing — the level cannot
end. The timer is set to 52 frames whenever a lemming explodes, so that a nuke's or a
bomber's explosions play out fully before the results appear rather than being cut off.
The level ends only once the last explosion has finished.

Recall from §12.2 that this check reads the *previous* frame's counters, so an end
condition that becomes true during a frame is acted on at the start of the next.

## 19.3 The nuke

The nuke detonates every remaining lemming. It is a two-part mechanism: arming (an
input), then a staggered sequence that lights one fuse per frame.

**Arming** (phase 8, from the nuke control — pressed twice as a safety, §25). Arming:

- sets the *nuking* flag (which immediately stops all further spawning — §19.4);
- begins the detonation sequence;
- cues the nuke sound (Chapter 24).

Arming a second time does nothing; a nuke cannot be un-armed.

**The sequence** (phase 6, §12.1). While the sequence is running, each frame it lights
**one** lemming's fuse — the next not-yet-removed lemming in list order:

```
advance an index through the lemming list, skipping removed lemmings
if past the end:  the sequence is done
else:             if that lemming has no fuse and is not splatting/exploding,
                  light its fuse (explosionTimer = 79);  advance the index
```

So the nuke lights fuses one per frame, marching up the list, and each fuse then counts
down 79 frames to Ohnoing/Exploding (§12.3, §15.13). The result is the characteristic
**staggered cascade** of explosions rather than a simultaneous blast — a direct
consequence of one-fuse-per-frame in list order. Once every lemming has been given a
fuse, the sequence stops; the level ends when the last of them has exploded (§19.2,
condition four).

## 19.4 Releasing stops at a nuke

Arming the nuke sets the *nuking* flag, and spawning (§13.2) is gated on it directly:
once armed, no further lemming is released, regardless of `maxLemmings`. This is
independent of the scoring change in §19.6 — the nuke halts the stream by the flag alone.

## 19.5 Finishing

When an end condition fires, the game **finishes**: the simulation is marked done and
stops advancing, and control passes to the results screen (Chapter 23). The result record
is computed at that point from the final counters (§19.6). Nothing in the simulation runs
after finishing.

## 19.6 Scoring

The verdict is a comparison of two integer percentages.

```
target% = rescueCount * 100 div lemmingsCount      // the required proportion
done%   = saved       * 100 div denominator        // the achieved proportion
won     = done% ≥ target%
```

Both use **integer (truncating) division** — a level needing 50 of 100 has `target% =
50`, and saving 49 gives `done% = 49`, a loss by one. The percentages, not the raw
counts, decide the outcome, which is why odd lemming counts can make the required *number*
saved differ from the naive percentage.

- **`target%`** is fixed by the level: the rescue requirement over the total lemmings.
- **`done%`** is the saved count over a **denominator** that is normally `lemmingsCount` —
  but the nuke's scoring glitch (below) can change it.
- The result also carries the raw `rescueCount`, `saved`, and both percentages for the
  results screen (Chapter 23).

## 19.7 The nuke scoring glitch

Under a rule variant (Chapter 20), arming the nuke lowers `maxLemmings` to the number of
lemmings **released so far**, and the scoring denominator follows it: `done%` is then
computed over the *released* count, not the level's full `lemmingsCount`.

The effect is that nuking early **inflates the percentage** — with a smaller denominator,
the same number saved is a larger fraction — and the inflated figure is what both the
in-game readout and the final verdict use. It is active only when its variant flag is set;
with the flag off, the denominator is always the full `lemmingsCount` and nuking cannot
improve the score.

## 19.8 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Clock | 17 frames/second; floors 0:00; expiry ends the level | Clock display (Ch 22) |
| End conditions | The four of §19.2; checked at phase 1; one-frame lag | — |
| Explosion hold | End deferred 52 frames while an explosion finishes | — |
| Nuke | Arm stops spawning; one fuse/frame in list order; staggered cascade | Nuke cue |
| Scoring | `done% ≥ target%`, integer division; denominators per §19.6 | Results presentation (Ch 23) |
| Nuke glitch | Denominator = released-at-nuke (variant, Ch 20) | — |

# 20. Rule variants & compatibility flags

A handful of rules in Part III have **more than one defensible form**. Part III names
each such point and defers it here; this chapter catalogues every variant and defines
both forms of each precisely.

**This chapter does not decide which forms Throng uses — the implementation does.** Some
variants matter only for compatibility with imported levels; others are pure conveniences
or exploits. Which to support, and which form is the default, is an implementation choice
made against the project's own goals. What the chapter guarantees is that whichever a
build selects, its behaviour is specified to the pixel and frame, so two builds that
select the same set behave identically.

## 20.1 How variants are configured

The active variants form a **flag set** — a fixed input to the simulation, chosen once
and unchanged for the duration of a level (§11.4). Because it is a fixed input, it does
not threaten determinism (§1.6): the simulation remains a pure function of *(level, flag
set, input stream)*, and a replay is only meaningful paired with the flag set it was
recorded under.

Two things are the implementation's to decide and are **not** fixed here:

- **Which variants to support at all.** A build may implement every variant, or only the
  subset its levels need.
- **How the set is scoped.** It may be one global rule set for the whole game, or chosen
  per level pack so that different imported sets can each run under the form they were
  authored for. Different level sets imported through the interchange format (Chapter 6)
  may assume different forms of the Group A and B variants below; a build that wants to
  play them correctly must offer those forms.

The variants divide into three groups by *what kind of thing* they change.

## 20.2 Group A — gameplay variants

These sit inside the simulation and change what a lemming does. **A level's solvability
can depend on them** — a level authored for one form may be unsolvable under the other.

| Variant | One form | Other form | Ref |
|---|---|---|---|
| **Object count limit** | Only the first 16 interactive objects act; any beyond are inert | All interactive objects up to the map's capacity act | §4.3 |
| **Miner vs right one-way wall** | The miner stops at a right-pointing one-way wall from **either** direction (unminable) | The miner stops only when moving against it, symmetric with the left one-way | §15.9 |
| **Splat-into-exit** | A lemming beginning to splat on an exit trigger is **saved** (splat → exiting) | It is lost — splatting ignores the exit | §15.3, §17.3 |
| **Faller initial distance** | A new faller's `fallen` starts at **3** (splats 3 px sooner) | Starts at **0** | §14.4, §15.3 |
| **Entrance count limit** | At most **4** entrances are enabled; extras inert | All entrances participate | §13.4 |
| **Climber-on-shrugger** | Assigning climber to a shrugging lemming also snaps its action to Walking | Sets the trait without changing the action | §18.4 |

## 20.3 Group B — value & ordering variants

These change *which value* a rule uses. They rarely decide solvability on their own, but
they shift exact positions and timings, so a replay recorded under one form will diverge
under the other.

| Variant | One form | Other form | Ref |
|---|---|---|---|
| **Two-entrance order** | With two entrances, releases go **A B B A** | **A B A B** | §13.4 |
| **Spawn offset** | Lemmings spawn at entrance **+25** in x | **+24** | §13.5 |
| **Trap animation start** | A triggered trap's animation begins on frame **1** | Frame **0** | §17.4 |

## 20.4 Group C — meta & shell variants

These live at the boundary between input, scoring and the simulation. **No level's
solvability depends on them**; they affect the score or the feel of the controls, and
exist mainly so that inputs and replays made under them stay valid.

| Variant | One form | Other form | Ref |
|---|---|---|---|
| **Nuke scoring denominator** | Arming the nuke sets the saved-% denominator to the number **released so far** (inflating the score) | The denominator stays the full lemming count | §19.7 |
| **Pause-time banking** | Pausing before the entrances open banks time — the clock holds but the entrances still open on schedule, granting extra seconds | Pausing does not affect available time | §12.5, §19.1 |
| **Right-click stale target** | A click that resolves with no lemming under the cursor may assign to the last off-cursor lemming remembered from a prior hit-test | Nothing is assigned | §18.2 |

## 20.5 Normative and free — summary

| | Normative | Authored / Incidental |
|---|---|---|
| Each variant | Both forms, specified exactly (§20.2–20.4) | — |
| Which to support | — | Implementation's choice |
| Default form | — | Implementation's choice |
| Scoping | — | Global or per-pack — implementation's choice |
| Determinism | The active set is a fixed input; replays pair with their set | — |

# 21. Rendering

The renderer is strictly **downstream of the simulation** (§3.7): each frame it reads the
state and draws it, and nothing it does feeds back into the frame pump. This is a
*requirements* chapter (Layer C): *what* must appear and *when* is normative, because the
player sees it; *how* it is drawn — the exact pixels, colours, and whether the frame is
composited on a canvas, in the DOM, or elsewhere — is free (§1.4, §1.3). Where the chapter
leans on bundled graphics — the sprites and masks, the countdown digits (§8) — an
implementation may draw them as provided or author its own; what binds is their **anchors
and geometry**, never their pixels or colours.

Most of this chapter is already realised (world composition, terrain and lemming drawing,
draw order); §21.3–21.5 are the overlays that complete it.

## 21.1 The layer order

The viewport is composited back-to-front:

1. the **background** (sky, or a level backdrop);
2. the **terrain silhouette** (§3) — solid pixels drawn, empty left clear;
3. the **interactive objects** (§4, §17) — entrances, exits and traps, in their animation state;
4. the **lemmings** (§21.2), in list order (later ones draw on top, §18.2);
5. the **per-lemming overlays** — the countdown digit (§21.3) and the explosion scatter (§21.4);
6. the **cursor** (§21.5).

The panel and HUD (Chapter 22) are drawn outside the viewport. What is normative is the
order **where it changes what the player sees** — lemmings over terrain, a digit over its
lemming; blends and tints are free.

## 21.2 Drawing a lemming

A lemming is drawn from its current animation's frame, positioned **anchor-relative**: the
sprite origin is placed so the animation's **foot anchor** (§2.1, §9) lands at the
lemming's `(x, y)`, and facing selects the mirrored variant (§14.5). This is the **same
anchor that fixes the 13 × 13 cursor hit box** (§18.2), so the anchor is normative geometry
(§1.4); the sprite artwork and colours are free.

## 21.3 The countdown digit

A lemming with a lit fuse — `explosionTimer > 0` (§11.1) — shows a single **countdown
digit** above it, so the player can read how long until it blows.

- **Which digit** is a function of the fuse timer (0…79): **5** while 65–79, **4** while
  49–64, **3** while 33–48, **2** while 17–32, **1** while 0–16. It is a pure function of a
  deterministic sim value, so it reproduces frame-for-frame.
- **Where**: anchor-relative, centred just above the head — an 8 × 8 glyph at
  `(x − 1, spriteTop − 12)` sits clear of the sprite; the exact offset and glyph size are free.
- **The glyphs** — a five-cell strip, 5→1 — may be bundled with the game or authored (§8);
  their colour and font are free, while the digit's value and its placement above the head
  are normative.

## 21.4 The explosion scatter

When a lemming explodes (§15.14) it is removed and, in its place, a **particle scatter**
bursts from its final position, plays for the post-explosion hold (`particleTimer`, §11.3 —
52 frames), and then clears. This is the same hold that defers the end check (§19.2), so the
player sees the blast for exactly as long as the simulation waits on it.

Only that is normative: **a burst of the explosion-hold duration appears at the death point
and then is gone.** How the particles move is free (§1.4). Two approaches both satisfy it:

- **An offset table** — one row per hold frame, each row a set of `(dx, dy)` pixel offsets
  from the death point, plotted as coloured pixels and cycled through as the hold counts
  down. A row can retire particles partway through (a per-particle "gone" marker), so the
  burst thins out toward the end.
- **A procedural burst** — fling a handful of particles from the death point with an initial
  spread, let gravity pull them down, and fade or drop them as the hold runs out.

Either way the particle count, spread, colours and trajectories are authored (§1.3). Because
the scatter is presentation, strictly downstream of the sim, it may draw from a random seed
without touching determinism (§1.6) — the frame pump never reads a particle position.

## 21.5 The selection cursor

The cursor reflects the **§18.2 hit-test every frame**: when a selectable lemming is under
it, the cursor takes a **focused** form and the panel names that lemming (§22.3 — the
cursor-focus readout); otherwise it shows its plain form.

The cursor is authored — its art is the implementation's own — and the focused indicator's form
is free (a swapped cursor, a reticle, a highlight, anything). What is normative is only that
its focused state **tracks the hit-test**, so the player can see which lemming a click will
select. The under-cursor text (skill / count) is the §22.3 readout, already the panel's job.

## 21.6 Normative and free — summary

| | Normative | Authored / Free |
|---|---|---|
| Layer order | Lemmings over terrain; digit/scatter over their lemming; cursor on top (§21.1) | Blends, tints, backdrop art |
| Lemming | Anchor-relative placement at the foot anchor (§2.1, §9); facing (§14.5) | Sprite art and colours |
| Countdown digit | Shown while `explosionTimer > 0`; the 5→1 value from the timer; placed above the head | Glyph art, colour, font |
| Explosion scatter | A burst of the explosion-hold duration (§11.3) plays, then clears | The particle table / trajectories |
| Selection cursor | Its focused state tracks the §18.2 hit-test | Cursor art; the focused indicator's form |

# 22. Skill panel & HUD

The panel is the player's entire interface to a running level: everything they read
about the simulation's state, and every action they take on it, passes through it. This
chapter fixes *what* the panel must display and *what* each control does — the half a
player can observe, and therefore normative (§1.4). It does not fix how any of it looks
or where it sits: panel styling, fonts, button and cursor art, and on-screen placement
are Authored (§1.3), and the realisation technology — a bitmap panel, DOM widgets, or
native controls — is equally free. Where this chapter gives a size, a position or an
order, it offers **one reference arrangement** — a concrete layout given for guidance, not as a requirement, and not the only one that conforms.

## 22.1 A view and a control surface

The panel does two jobs, and neither computes an outcome:

- **A view.** It mirrors live simulation state — the skill budgets (§11.3), the
  population counters, the level clock (§2.7), and the minimap — and keeps every readout
  current as the simulation advances. It reads this state; it never owns it (§11.5).
- **A control surface.** Its controls are the origin of the player inputs the frame
  consumes: the release-rate change applied at phase 2, and the skill assignments, pause
  toggle and nuke arming applied at the input phase, phase 8 (§12.1). The panel routes
  these; the mechanisms they drive live in Chapters 13, 18 and 19, and the stamping and
  timing of the inputs in Chapters 25–26.

**Reference geometry.** §2.4 fixes a logical panel of **320 × 40** pixels directly below
the 320 × 160 viewport, with a **104 × 20** minimap inside it (§2.5); the **reference arrangement**
puts the controls in a single left-to-right row in the order §22.2 gives. All of that is
given here **for reference only.** Per §2.4 and §2.8 the panel's size, position and styling are free
— an implementation may widen it, split it, move it beside or away from the viewport, and
restyle every element — provided the functions and values below hold. What a player can
*do* and *read* is normative; the surface it is presented on is not.

## 22.2 The controls

Every control routes to a mechanism specified elsewhere; the panel's obligation is to
expose it and to reflect the states it can be in.

| Control | What it does | States |
|---|---|---|
| **Release-rate down / up** | Requests a decrease / increase of `currentReleaseRate`, applied at phase 2 and clamped to the level's floor … 99 (§13.6). The panel displays two numbers: the level's floor rate and the current rate. | Current rate 1 … 99; *down* inert at the floor, *up* inert at 99. |
| **Skill button** (×8) | Two jobs: shows that skill's remaining budget (`climbersLeft … diggersLeft`, §11.3), and selects that skill as the *active* one for assignment (§18, §22.5). Reference order: Climber, Floater, Bomber, Blocker, Builder, Basher, Miner, Digger. | Budget 0 … 99; selected / not selected; budget 0 ⇒ not selectable (§11.3, §18.4). |
| **Pause** | Toggles the pause gate (§12.5). While paused, phases 3–8 do not run, but the panel stays live and a release-rate change still takes effect — phase 2 precedes the gate. | Running / paused. |
| **Nuke** | Arms the nuke (§19.3), applied at phase 8; a two-press safety (§25). Arming sets `isNuking`, which halts the release stream (§19.4) and begins the staggered detonation (§19.3). | Idle / armed-pending (after the first press) / armed — a running nuke cannot be un-armed. |

## 22.3 The readouts

The HUD reflects live counters, and each must show the *current* simulation state — a
panel that displays stale counts is non-conforming. What the value *is* is normative; how
it is formatted and labelled is free.

| Readout | Shows |
|---|---|
| **Cursor focus** | The action of the lemming under the cursor — the target of the §18.2 13 × 13 hit box — named as its skill/state, and, when several overlap, that there is a choice. Blank when the cursor is over no lemming. It is the aim aid for assignment. |
| **OUT** | The `out` counter (§11.3): how many lemmings are currently in play. |
| **IN** (home) | The saved proportion — the running `done%` of §19.6 over the current denominator, i.e. the same figure that becomes the verdict. |
| **TIME** | The level clock (§19.1, §2.7) as minutes-seconds, counting down and floored at 0-00. |

These are the *in-play* HUD. The end-of-level verdict and its presentation are the
results screen (Chapter 23), not part of the panel.

## 22.4 The minimap

The minimap is a scaled plot of the whole world, giving an overview no single 320-wide
viewport can. What it must convey is fixed by §2.5:

- it **plots every live lemming** at `(x div 16, y div 8)`; and
- it **marks the current viewport** — the §25 camera window — within that plot.

The divisor slack (99 of 104 columns, §2.5) means the viewport indicator cannot be
geometrically exact; it is a navigational aid, not a measurement, and reproducing its
precise width conveys nothing. Dot size and colour, the indicator's shape, and the
minimap's styling are free. Clicking the minimap to move the camera is normative (§2.5)
but is a camera interaction, specified in Chapter 25; here the minimap is the *display*
those clicks target. It is the one readout most naturally drawn as its own small raster —
but that too is a realisation choice, not a requirement.

## 22.5 The selected skill

At most one skill is *active* at a time — the one whose button was pressed last.
Selecting a skill is a panel-local state change: it spends no budget and drives no
simulation phase, and only determines which skill the next assignment will apply. An
assignment — a click on a lemming (§18.2) — reads the active skill and then succeeds or
fails by the Chapter 18 preconditions, the budget among them (§18.4). The active skill
persists across assignments until the player selects another; before any skill is
selected, a click on a lemming assigns nothing. Whether the active skill is shown as a
highlighted button, a changed cursor, or both is free.

## 22.6 Normative and free — summary

| | Normative | Authored / Free |
|---|---|---|
| Panel as a whole | Displays the state and routes the controls below | Size, position, styling, realisation tech; 320 × 40-below is reference (§2.4) |
| Release-rate control | Adjusts `currentReleaseRate` at phase 2, clamped to floor … 99 (§13.6); shows floor and current | Button art; how the numbers are drawn |
| Skill buttons | Show each budget (§11.3); select the active skill (§18); budget 0 ⇒ unselectable | Icons, labels; the Climber … Digger order is reference |
| Pause / Nuke | Pause toggles the §12.5 gate; Nuke arms per §19.3 (two-press), halting release (§19.4) | Their art and press feedback |
| Readouts | Cursor focus, OUT, IN % (§19.6), TIME (§19.1) — kept current every frame | Fonts, format, labels |
| Minimap | Plots live lemmings and the camera window by the §2.5 mapping | Dot / indicator styling; raster vs. widgets |
| Selection | Exactly one active skill; assignment reads it (§18) | Highlight / cursor style |

# 23. Screen flow

A running level is only the middle of the experience: the player arrives at a level,
plays it, and is told how they did. Around the Chapter 19 simulation sits a small **state
machine of screens**, and this chapter is that machine — the screens, what each must
present, and the transitions between them. As with Chapter 22 this is a *requirements*
chapter (Layer C): the states, their content and the transitions are normative because
the player moves through them; how any screen looks, where it sits, and the widget
technology that renders it — a bitmap screen, DOM widgets, or native views all conform —
are free (§1.4, §1.3).

## 23.1 The screens

The shell is in exactly one screen at a time:

| Screen | What it is | Content it must present |
|---|---|---|
| **Menu** | The entry point | The choices to start play, pick a difficulty rating, and enter a level code (§23.6). |
| **Preview** | The pre-level briefing | The level's parameters (§23.3) — enough to plan before the entrances open. |
| **Play** | The running level | The viewport + the Chapter 22 panel over the Chapter 19 simulation. The *only* screen where the simulation advances. |
| **Results** | The verdict | The Chapter 19 outcome (§23.4) and the exits — retry, continue, or menu. |

Nothing outside **Play** advances the simulation (§1.6): Menu, Preview and Results are
static with respect to the frame pump. A build may add screens (options, credits, a
level-select grid), but must provide these four in the relationship below.

## 23.2 The transitions

The forward path is **Menu → Preview → Play → Results**; from Results the player branches
back. What triggers each move:

- **Play → Results** is the only *automatic* transition: it fires when the simulation
  finishes (§19.5) — the end check has met a condition and the result is computed (§19.6).
- **Results → Retry** re-enters **Play** on the *same* level, from a level-start reset
  (§23.5).
- **Results → Continue** advances to the next level in the pack (Chapter 10) and enters
  its **Preview** — offered when the attempt won (or when the pack permits advancing).
- **Results → Menu** and **Preview → Menu** return to the entry point.

Every transition other than Play→Results is a player input: this chapter fixes *that* the
transitions exist and where they lead, not how they are triggered (that is Chapter 25).

## 23.3 The level briefing (Preview)

Before the entrances open, the player is shown the level's plan. The Preview must present
the level parameters (Chapter 5) needed to strategise:

- the level's **name** and its number in the pack;
- the **lemming count** and the **rescue requirement** (as a count and/or the percentage,
  §19.6);
- the starting **release rate** and the **time limit** (§2.7);
- the **skill budgets** available (§11.3).

These are the same numbers Play and the result depend on; the Preview surfaces them ahead
of time. What is normative is that the player can read the goal before committing; the
framing is free.

## 23.4 The results screen

When the level finishes (§19.5), Results presents the verdict computed in §19.6. It must
show:

- the **achieved** proportion (`done%`) against the **required** proportion (`target%`),
  and the **win/lose** outcome (`done% ≥ target%`);
- the raw **saved** count against the **rescue requirement**, so the figure behind the
  percentage is legible;
- whether the clock ran out (the *time-is-up* flag, §19.2), when that was the cause.

A tiered **outcome message** may be layered over this ("superb", "well done", … down
to "none of them survived") keyed to how far above or below target the result fell. That
messaging is **authored flavour** (§1.3): an implementation may reword, retier or omit it
— only the underlying figures and the win/lose verdict are normative. The screen also
presents the exits of §23.2 (retry / continue / menu).

## 23.5 Retry, continue, and reset

**Retry is a level-start reset, not a special path.** Re-entering Play on the same level
runs the §11.6 per-level initialisation — iteration and clock to 0, the clock to the
limit, every population counter to 0, the budgets back to the level's counts, the release
rate to the level's own, the lemming list emptied — and rebuilds the level's substrate
(Chapters 3–4) from the same source. Because the whole game state bottoms out in this
reset and the simulation is deterministic (§1.6), a retry is a clean replay from frame 0;
nothing of the previous attempt survives.

**Continue advances the pack.** It selects the next level (Chapter 10) and enters its
Preview. What "next" means, and whether a loss blocks advancing, are pack rules (Chapter
10); Ch23 only requires that a won level can lead to the next.

## 23.6 Level codes

Each level in a pack carries a **level code** (Chapter 10) so a player can resume at it
without replaying the earlier ones. The Menu offers a **code-entry** screen: a valid code
jumps to that level's Preview; an invalid one is rejected and the player stays put. Ch23
owns the *entry screen and its accept/reject behaviour*; the code's format and the
level each maps to are Chapter 10.

## 23.7 Scope: the flow runs ahead of the pieces it needs

The full machine assumes a **level pack** — the Menu's level selection, Continue's "next
level", and the level codes all rest on Chapter 10, which is still to be built. A build
with a single level still exercises the core loop — **Preview → Play → Results → Retry** —
and leaves the pack-dependent transitions (menu selection, continue, codes) unimplemented
until Chapters 7–10 land. This is the same "the requirements chapter runs ahead of the
implementation" split the panel (Chapter 22) already lives with.

## 23.8 Normative and free — summary

| | Normative | Authored / Free |
|---|---|---|
| Screens | The four states of §23.1; only Play advances the sim | Extra screens; styling, layout, widget technology |
| Transitions | The graph of §23.2; Play→Results fires on §19.5 | How each is triggered (§25); inter-screen animation |
| Preview | Presents the Chapter 5 level parameters before play | Framing, art, which extras are shown |
| Results | `done%` vs `target%`, win/lose, saved vs rescue, time-up (§19.6, §19.2) | Outcome-message wording/tiers; layout |
| Retry | The §11.6 level-start reset; a deterministic replay from frame 0 | — |
| Continue / codes | A won level can lead to the next; code-entry accepts/rejects | "Next" + code semantics are Chapter 10 |

# 24. Audio

> **Stub.** The sound *event* set and its cue frames — normative — and the mapping to
> the implementation's own sound design and music, which is free.

# 25. Input & camera

Play is the one screen where the simulation runs (§23.1), and this chapter specifies how
the player reaches into it: the pointer and the commands that drive the Chapter 19 game,
and the camera that decides which 320-pixel slice of the world they are looking at. Like
Chapters 22–23 this is a **Layer C requirements** chapter. What the player must be able to
*do* — the set of commands, and the fact that each reaches its mechanism — is normative,
because it is observable (§1.4). What key or button each command sits on, how fast the
camera scrolls, and every convenience layered on top are Authored or free: they change how
the game is driven, never what it computes.

Two facts from earlier chapters bound everything here:

- **Input never interrupts the simulation.** A key or click does not take effect at the
  wall-clock instant it happens; it is stamped with the current frame and applied at that
  frame's fixed slot — release-rate at phase 2, everything else at phase 8 (§12.7). The
  pressing is asynchronous; the *effect* is on-grid. Chapter 26 specifies the stamping.
- **The camera is not part of the simulation.** Scrolling reads simulation state to
  display it and feeds nothing back (§12.6). Camera position, fast-forward rate and seek
  are therefore outside the determinism contract (§1.6 rule 3) — none is an input the game
  computes with.

A consequence worth stating: the camera runs on its own clock, serviced on a timer
independent of the frame timer. The view keeps panning smoothly between simulation frames
and while the game is paused, so a frozen level can still be surveyed.

## 25.1 The pointer and the play field

Inside the viewport the pointer resolves to a single world point — the game cursor — and
that point is the sole geometric input to skill assignment. A **left-click** assigns the
active skill (§22.5) to the lemming the cursor is over, exactly as Chapter 18 specifies:
the point is tested against every lemming's 13 × 13 hit box (§18.2), the priority rule
picks a target, and the Chapter 18 preconditions decide success. The cursor also drives the
panel's focus readout (§22.3) every frame, button or no button, so the player can see who
they are about to select.

One modifier is a genuine input to the selection and not mere presentation: **holding the
right button** flips the hit-test from the working lemming to the passive one under the
same point (§18.2). It is consumed by Chapter 18; this chapter only notes that the shell
must expose "select the other lemming here" as a held state, however it is bound.

Everything else about the pointer is Authored: the exact hotspot the art registers to, the
swap to a highlight cursor when a lemming is in range, and the pointer image itself. They
help the player aim; they do not change which lemming a given point selects.

## 25.2 The command set

During Play the shell must let the player issue each command below. **The commands are
normative — each must exist and reach the mechanism named — but the key or button each sits
on is Authored.** The bindings in the table are **a reference arrangement**, given as
guidance; an implementation may rebind any of them, provided every command stays reachable.

| Command | Effect | Reference binding |
|---|---|---|
| **Select skill** (×8) | Makes that skill the active one for assignment (§22.5); a budget-0 skill is not selectable (§18.4). | F3 Climber, F4 Floater, F5 Bomber, F6 Blocker, F7 Builder, F8 Basher, F9 Miner, F10 Digger |
| **Release-rate down / up** | Requests a decrease / increase of `currentReleaseRate`, applied at phase 2 and clamped floor … 99 (§13.6). Held, it ramps continuously until released. | F1 / F2 (hold to ramp) |
| **Pause** | Toggles the pause gate (§25.4, §12.5). | Pause key, or F11 |
| **Nuke** | Arms the nuke (§19.3), applied at phase 8, behind the two-press safeguard below. | F12 |
| **Abandon level** | Ends the level immediately and goes to Results (§25.6, §23.2). | Esc |

Each command has a panel control as well (§22.2); panel and keyboard are two bindings of one
command set, and a conforming shell may offer either or both.

**The nuke's two-press safeguard is normative; its exact form is not.** Because arming the
nuke cannot be undone (§19.3) and loses the level, a single stray press must not arm it —
the player has to confirm. For reference, one workable confirm is a quick double-press: two
nuke presses within about a quarter-second on the key, or a double-click on the panel
button. An implementation may confirm differently (press-and-hold, a two-step control), but
it must not arm on one unqualified press.

## 25.3 The camera

The view is a 320-pixel-wide window that scrolls horizontally over the 1584-wide world;
there is no vertical scroll (§2.4). **What is normative is reach: by some combination of
controls the player must be able to bring any horizontal scroll position in 0 … 1264 (§2.4)
into view, and the shell must not add vertical panning** — there is nothing to pan to (§2.4).
How scrolling is offered, and how fast, is free.

For reference, five affordances make a sensible default set:

| Affordance | Behaviour | Reference detail |
|---|---|---|
| **Screen-edge push** | Pointer at the left or right edge of the viewport scrolls that way while it rests there. | 8 px per scroll tick |
| **Keyboard scroll** | Left / Right arrow scrolls while held. | 8 px per tick |
| **Precise scroll** | A modifier slows keyboard scroll to a pixel a tick for fine framing. | Ctrl + arrow → 1 px per tick |
| **Drag-pan** | A modified drag grabs the world and slides it under the pointer. | Alt + left-drag |
| **Minimap jump** | A click on the minimap (§22.4) centres the view on the clicked world column, clamped to range. | — |

The pixel counts, the tick rate and which modifiers select them are all reference: they set
scroll *feel*, and feel is free (the same latitude §2.6 gives fast-forward). The clamp to
0 … 1264 is not free — a camera that scrolls past the world edge would show undefined space.

## 25.4 Pause, fast-forward, and stepping

**Pause** toggles the gate of §12.5: phases 3–8 stop, so the clock, spawning and every
lemming freeze, while the panel stays live and a release-rate change still lands (phase 2
precedes the gate). The camera still scrolls and the pointer still reports focus (§18.2
hit-test over the frozen field), so a paused level can be read and planned. Whether the
scripted opening clock still advances while paused is a rule variant (§12.5, Chapter 20).

**Fast-forward** runs the identical simulation faster — for reference, at roughly a 10 ms
frame period (§2.6). It is a convenience and wholly free: any rate conforms, and an
implementation may omit it. Because it changes only *how often* a frame is computed, never
*what* is computed, it cannot affect outcome (§2.6). While fast-forwarding, skill assignment
and most commands are best suppressed so the player does not act blind; pause and abandon
stay available. Fast-forward and pause are mutually exclusive — one cannot fast-forward a
frozen game.

**Single-frame stepping** is the paused counterpart: advance exactly one frame, or (given
the recorder, §25.5) retreat one. It is an optional aid for reading a level a frame at a
time, and is free in both existence and binding.

## 25.5 Seek: time travel over a deterministic simulation

The determinism contract (§1.6) plus the input recorder (Chapter 26) make a family of
**seek** commands possible: jump the game to any frame, forward or back. Forward advances by
running the intervening frames silently at speed; backward restarts from frame 0 and replays
to the target. Either way the reached state is exactly the state normal play would have
produced at that frame — which is why seek is sound, and why it belongs to the same
machinery as replay (Chapter 26 specifies the mechanism).

For reference, a useful set exposes seek as step-by-a-frame, a-second, ten-seconds and
a-minute in each direction, plus run-to-end, and a one-slot savestate (mark a frame, jump
back to it later). **This whole group is optional and free** — existence, granularity and
bindings alike. It is a convenience for review, practice and debugging; a conforming shell
may offer all of it, some, or none. Its only hard requirement is the one it inherits: a seek
must land on the true frame-*N* state, so it is available only to an implementation whose
simulation is deterministic and whose input is recorded.

## 25.6 Triggering the screen transitions

Chapter 23 fixes the screen graph and defers to this chapter *what fires each edge* (§23.2).
The triggers are ordinary shell input, and only the Play edges are specific here:

- **Play → Results** fires when the level ends: on its own when a Chapter 19 end-condition
  is met (§19.5, §23.2), or on demand when the player **abandons** the level (§25.2) —
  abandoning is just requesting the end now.
- **Into Play** (Preview → Play) and **out of Results** (retry / continue / menu, §23.5)
  are advance / choice inputs on those screens — a confirm to start, and a pick among the
  offered exits.

As everywhere in this chapter, the trigger *commands* are normative (the player must be able
to start a level, leave one, and choose among the Results exits); the keys, buttons or menu
items they sit on are free.

## 25.7 Normative and free — summary

| | Normative | Authored / Free |
|---|---|---|
| Command set | Each §25.2 command exists and reaches its mechanism | The key / button each is bound to |
| Pointer | Left-click assigns via the §18.2 hit-test; right-button-held selects the passive lemming | Cursor art, hotspot, highlight swap |
| Input timing | Applied at the §12.7 slots (phase 2 / phase 8), not on the keypress | — |
| Nuke safety | A confirm step guards arming; one stray press must not arm | The confirm's exact form (double-tap, hold, …) |
| Camera reach | Any scroll position 0 … 1264 reachable (§2.4); no vertical pan | Which affordances; scroll speed, tick, modifiers |
| Pause | Toggles the §12.5 gate | Its binding |
| Fast-forward | May not alter outcome (§2.6) | Its rate, existence, binding |
| Seek / savestate / step | If offered, must land on the true frame-*N* state (§1.6, Ch. 26) | Existence, granularity, bindings — all optional |
| Transition triggers | Player can start, abandon, and choose Results exits (§23.2) | Their bindings; inter-screen animation |

# 26. Replay format & determinism

> **Stub.** The recorded input-item format, playback, and seek-to-frame, and the use of
> replays as a conformance suite — viable because of §1.6.

# 27. Acceptance tests

> **Stub.** Per-frame state hashing, replay conformance against the supplied replay
> corpus with expected outcomes, bulk solvability checks over the imported level
> corpus, the required headless harness, and pass criteria.

# 28. Appendix: glossary & constants index

> **Stub.** Terminology used in this document, and an index of every normative
> constant it defines, with the section that defines it.
