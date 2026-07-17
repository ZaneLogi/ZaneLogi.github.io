# mario_physics — engine architecture

Guidance for working in this project. It describes the **system architecture —
the substrate, its invariants, and the movement model built on them** — not the
catalogue of what's in the game. The registries (`actor_types.js`, `tiles.js`)
and the level data are that catalogue; git is the history. This file changes when
the *structure* or the *movement design* changes. Local guidance; overrides the
root `CLAUDE.md`.

A small fixed-timestep 2D platformer engine, ES6 modules, no build step. Boots
from `mini_mario_physics_demo.html` → `main.js`.

## The loop and the per-frame pipeline

**Outer loop** (`main.js`). Real time is diced into fixed `1/60 s` physics ticks:
`update()` runs zero-or-more times per rendered frame to drain an accumulator,
then the frame is drawn once (an interpolation factor `alpha` is computed for the
renderer). Physics is therefore decoupled from display refresh rate.

**Inner pipeline** (`World.update`, per tick). It is **phase-major**: every actor
finishes a phase before any actor starts the next.

1. **control** — `type.control(actor)`: perception → intent. A phase of its own so
   that a controller which looks at the world sees a consistent snapshot, before
   any movement has changed a velocity.
2. **move** — `type.move(actor, intent, dt)`: intent + gravity + jump → velocity.
   Reads only *last* tick's `contacts`; never the map.
3. **collide** — `actor.contacts = resolveCollision(actor, levelMap, dt)`:
   integrate the velocity and resolve it against the tiles, returning a fresh
   `contacts`.
4. **react** — `World.reactToContacts(actor)`: the world responds to the contact
   (e.g. a bumped tile's `onBump`).
5. **present** — `actor.updateAnimationState()` then `animator.update(state, dt)`:
   velocity + contacts → animation.

Phase-major is indistinguishable from per-actor while there is one actor, and
load-bearing the moment there are two: comparing two actors is meaningless if the
first has already integrated and the second has not, so anything actor-vs-actor can
only live *between* phases. It also keeps every actor's view of the world a
consistent snapshot of the last tick, instead of one that depends on array order.

The world also advances tile animations and block-bump hops on this same tick clock.

| Phase | Owner |
|---|---|
| control (perception → intent) | the type's `control` fn |
| move (intent/forces → velocity) | the type's `move` fn |
| integrate + detect + respond | collision resolver |
| orchestration + world reaction | `World` |
| presentation | `Animator` |

## Invariants

Rules a change must not break:

- **Fixed timestep.** Constants are tuned for 60 fps and scaled by `dt * 60`; keep
  that factor on every new force/velocity so behaviour is refresh-rate-independent.
- **Phase order is intent → collide → react → present**, and *intent reads the
  previous tick's `contacts`*. Collision feeds back into movement through a stored
  struct read next tick — not a within-tick call.
- **`contacts` is the single feedback channel** from collision into movement
  (`{ ground, ceiling, left, right, bumped }`). Movement decisions (jump
  eligibility, the grounded gravity skip) read it; nothing else carries collision
  results into an actor.
- **The resolver detects; the world decides.** `resolveCollision` reports what was
  touched (including which tile was bumped) and stops motion, but runs no game
  logic. Reactions live in `World` and in type definitions.
- **Actors are world-agnostic.** An `Actor` never reads the tile map; everything
  the world permits returns through `contacts`.
- **Presentation is derived, not driving.** Animation state is computed from
  post-collision velocity + contacts; the `Animator` only plays frames — it never
  touches physics.
- **Axis-separated resolution.** The resolver integrates and resolves X, then Y,
  so tile collisions stay stable at corners.

## Movement model

The design the **intent** phase expresses. The numbers live in the `ACTOR_TYPES`
physics entry; this section is the design they encode.

**This is Super Mario Bros.' physics**, decoded from the 6502 source — see
`docs/research_smb_physics.md`, which carries the constants, their ROM labels, the
unit derivations, and the scope: what is ported and what is deliberately not.
Everything is scaled ×2: our tile is 32 px against SMB's 16 px brick, and every
physics quantity is linear in distance, so ×2 is exact.

Scope, in one line: **ground and air movement, horizontal and vertical**. Swimming,
climbing, crouching, and the water/pipe speed clamps are decoded but not ported.
**SMB's movement is size-independent** — every `PlayerSize` read is in collision
geometry, block breakability, or graphics — so this covers a big Mario too, if one
is ever added. Size lives in the *collision* layer, not here.

**Horizontal — a linear adder to a hard clamp.** Holding a direction adds a fixed
per-tick rate; the clamp stops it. Top speed *is* the clamp (walk 3.0, run 5.0) —
not an equilibrium, and there is no multiplicative friction anywhere. One rate
serves accel *and* decel: with no direction held, the same adder takes its sign
from the current speed and bleeds to a dead stop (~40 ticks from walk speed).

Two things make it SMB's rather than a generic ramp-and-clamp:

- **Two independent indices.** One picks the clamp, the other the rate — they are
  not the same choice. Run physics need the run key *and* input agreeing with the
  direction of travel, and they linger 10 ticks after the key drops. Above walk
  speed, the walk rate is swapped for a faster bleed-down.
- **Several reads are one tick stale, on purpose.** SMB runs its physics sub
  before the routine that writes `runningSpeed`, and before the `movingDir`
  update at the tail of the frame. `marioMovement` keeps that order, and says so.

**Skid is `facing ≠ movingDir`** — two separate concepts, which is why the Actor
carries both. It doubles the rate, and below 1.375 px/tick a skid snaps to a dead
stop and re-aims `movingDir` at `facing`.

**A blocked direction never reaches the physics.** `marioMovement` masks its intent
against `contacts.left/right` before using it, so Mario does not accelerate into a
wall and get cancelled by the resolver — he is simply not pressing. That is SMB's
`and Player_CollisionBits`, and `contacts` is the same one-tick-stale channel.

**Air control is partial, and the gate is the point.** Airborne, run physics apply
only above 3.125 px/tick. The walk clamp is 3.0 — *just below the gate* — so a
standing jump can never reach run speed in the air no matter how long you hold a
direction. Speed is something you carry into a jump, not something you build in
one. Facing also freezes airborne: SMB sets it only on the ground.

**Jump — an impulse, and holding does not lift.** The launch velocity is set once
(−8, or −10 above 3.125 px/tick) and gravity does everything after. **Variable
height comes from gravity *selection*, not thrust**: while rising with the button
held, gravity is 0.25; release it and 0.875 swaps in — and never swaps back, so
re-pressing mid-air buys nothing. Holding the button doesn't push Mario up, it
makes him *lighter* while he is already rising. A tap clears ~1.4 tiles, a full
hold ~4.1.

**Five bands, indexed by `|vx|` at the moment of the press** — the launch, the held
gravity, and the fall gravity all come from the band. The run-jump goes higher
*despite* stronger gravity, because the bigger launch wins. Bands 0 and 1 are
identical in the ROM: five entries, three distinct behaviours.

**The boost is symmetric by speed**, because SMB indexes on
`Player_XSpeedAbsolute` — an absolute value, so height depends on speed magnitude,
not facing. The port keys on `|vx|`, matching it.

**Gravity is skipped while grounded** — which is not a convenience, it is what makes
the launch tick move the *full* launch velocity. SMB's `ImposeGravity` does
`y += vy` before that frame's `vy += g`, and skipping the grounded tick reproduces
that exactly. Terminal fall is 8; there is no *upward* clamp, because the
rise-limiting half of `ImposeGravity` is skipped for the player — which is what
lets the −10 launch stand.

**A fall you never jumped into is gentler than any jump** (0.3125). SMB seeds
`VerticalForceDown` at level entrance and only overwrites it at a launch, so
walking off a ledge before your first jump uses the entrance value. Genuinely a
quirk, faithfully kept.

## Type-Object registries — how the system is extended

A generic instance class plus a table of type definitions it is built from.
**Adding a kind of thing is a table entry, not new engine code.**

- **`ACTOR_TYPES[name] → { size, control, move, animate, physics, sprites }`.** An
  `Actor` (the instance) is constructed from one entry. `Actor` is the typed
  object; the entry is its type — and the Actor holds only *state*, never
  behaviour. That rides on the type, in three layers:
  - **`control(actor)` → intent.** May look at the world.
  - **`move(actor, intent, dt)` → velocity.** May *not*. Keeping it blind is what
    leaves an actor drivable from synthetic contacts with no map at all, which is
    how `test/` measures one.
  - **`animate(actor)` → a state name.** Derived, never driving.

  Splitting control from move lets an actor that must *see* exist without handing
  every actor the map. Nothing sees yet: a **reactive** actor needs no senses,
  because "I hit a wall" is a *consequence* and consequences already arrive
  through `contacts`. An actor that must **probe** (is there a ledge ahead?) or
  **perceive** (where is the player?) needs a sense interface that does not exist
  yet — `contacts` cannot serve either, being retrospective by construction.

  Physics constants are copied onto the Actor wholesale, because *which* constants
  exist is the type's business — a walker carries a `speed`; Mario carries speed
  clamps, accel rates, and jump bands. An Actor that named them would know every type.

  The player is not special: its controller reads `actor.input`, which the
  composition root writes, so no other actor ever sees it.
- **`TILES[id] → { solid, look, onBump? }`.** A grid cell's type. `look` is either
  `{ color }` (flat) or `{ frames, fps }` (sprite / animated). `onBump(world, tx,
  ty, actor)` is the cell's optional response to a head-bump, driven through world
  affordances (`bumpTile`, `setTile`, …); no `onBump` → the tile only blocks.
- **Sprite-sets `{ state → { frames, fps } }`** are the animation data an
  `Animator` plays; the same shape serves actors and animated tiles.

The seam: a new tile or actor type is a registry entry, with any per-type
behaviour attached to that entry (tiles carry `onBump`). The generic mechanisms —
resolver, world pipeline, animator — do not change.

## ROM data — tiles and palette

`assets/dat_tiles.js` is **generated** (`python tools/build_sprite_data.py emit`,
from the SMB ROM + SMBDIS.ASM): the whole 8K CHR as base64 — tiles 0-255 sprites at
PPU `$0000`, 256-511 background at `$1000`, a split `Start` sets once and never
rewrites — plus the tables parsed out of the asm. Nothing is retyped; don't hand-edit.

`palette.js` is **neither generated nor from the ROM.** The cartridge holds 6-bit
colour *indices* and the PPU turns each into an analog signal, so index→RGB is
hardware, not data. It is a hand-supplied standard 2C02 table.

`demo/chr_viewer.html` renders all 512 tiles in the ROM's own palettes — the eyeball
check that the data is right.

## Module map

| File | Owns |
|---|---|
| `main.js` | composition root: canvas, input, level data, wiring, the fixed-timestep loop |
| `actor.js` | `Actor`: a body — state, plus the constants its type's behaviour reads; world-agnostic |
| `actor_types.js` | `ACTOR_TYPES` registry — the blueprint an `Actor` is instanced from |
| `actor_controllers.js` | `control` fns: perception → intent (`keyboard`, `reactiveWalker`) |
| `actor_movements.js` | `move` fns: intent + contacts → velocity (`marioMovement`, `constantWalk`) |
| `actor_animations.js` | `animate` fns: velocity + contacts → a state name (`marioAnimation`, `alwaysWalk`) |
| `collision.js` | `resolveCollision`: per-axis integrate + tile detect + respond; returns `contacts` |
| `world.js` | `World`: owns the actor list (`addActor`/`removeActor`) + map; runs the pipeline and the react step; owns tile animations + block-bump hops; draws every actor |
| `animator.js` | `Animator`: plays a sprite-set; owns all frame-cycling. Distinct from `actor_animations.js`, which only *names* the state to show |
| `tiles.js` | `TILES` registry + `isSolid`. Level-grid cell types — nothing to do with CHR tiles |
| `chr_decoder.js` | CHR bytes → pixel indices → blitted tiles (`decodeTiles`, `paintTile`) |
| `palette.js` | the 2C02 master table; `nesRgb` / `nesHex` |
| `assets/dat_tiles.js` | GENERATED: CHR + `FRAMES` + `GFX_TBL_OFFSETS` + `PLAYER_COLORS` + `AREA_PALETTES` |
| `tools/build_sprite_data.py` | the generator — reads ROM + asm, writes `assets/dat_tiles.js` |
| `level_map.js` | `LevelMap`: tile-grid queries (`isSolidAt`, `setTile`, `worldToTile`, `getTileRect`) |
| `camera.js` | smooth follow, world→screen, map clamp |

Sprites load via `../mario/resource.js` (shared with the legacy `mario/` demo);
`0xFF00FF` is the colorkey. That module is an explicit **registry**, not a
directory scan: `res_loader` fetches only the paths listed in it, so **a new
sprite must be added there or it never loads** — the file sits on disk, and you
get a `No resource …` assert when something first tries to draw it. A frame name
in a sprite-set is the registry key minus `res/images/` (`"goomba/goombas_0"` →
`'res/images/goomba/goombas_0'`).

## Verifying a change — the fingerprint harness

Open `test/fingerprint.html`. It runs synchronously (no rAF, so it works even when
the preview tab is hidden) and reports PASS/FAIL against a blessed baseline.

It is a **characterization** harness: it pins what the physics *currently* does,
not what it *should* do. Its only question is "did this change?" — which is what
makes a behaviour-preserving restructure provable rather than hoped-for. It has no
opinion on whether the physics is any good, and it will happily pin a bug.

**Run it before and after any change meant to preserve behaviour.** Play-testing
cannot do this job: a 3 px shift in jump height or a 2-tick shift in the skid is
invisible to feel and would ship unnoticed.

The harness pairs with the two things this file changes for, and which one you are
making decides what the harness should do:

- **A structure change** — a refactor (inverting the loop, moving movement onto the
  type, hoisting gravity) — claims to change no behaviour, so it **must pass against
  the existing baseline**. Red means the claim was false. The scenario code may have
  to follow a changed API; the *baseline* must not move.
- **A movement-design change** — retuning the jump, changing an accel rate or a
  clamp — deliberately overwrites behaviour, so it **will** go red. Re-blessing is
  part of the change, and the commit message says why the numbers moved.

So the harness isn't only asking "did I break something" — it is checking the claim
you made about which kind of change this is. If one commit moves *both* the scenario
code and the baseline, treat it as a smell: you have either bundled two changes, or
changed behaviour while calling it a refactor.

Nine scenarios cover every phase of the tick, not just the physics — `qblock_bump`
exercises the **react** phase (`TILES.onBump` → hop → `3` spends to `5`) and
`anim_states` the **present** phase. A fingerprint covering only intent+collide
would stay green while a restructure silently stopped dispatching block bumps.

Each scenario reduces to a hash of its full per-tick trace (catches any drift, at
full float precision) plus a few readable scalars (which say *what* moved when it
fires). Comparison is exact: the physics is deterministic to the last bit, so drift
is a bug, not noise.

| File | Owns |
|---|---|
| `test/fingerprint.js` | the scenarios + runner |
| `test/baseline.js` | data: the blessed fingerprint, and the JS engine that produced it |
| `test/fingerprint.html` | runs, compares, renders, and emits a re-bless block |

**To re-bless** — only ever for a deliberate movement-design change — paste the
block the page emits into `baseline.js`. Re-blessing to turn a red harness green is
the one way to make it worthless.
