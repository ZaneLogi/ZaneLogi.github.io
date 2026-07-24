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
  (`{ ground, ceiling, left, right, bumped, groundRef }`). Movement decisions (jump
  eligibility, the grounded gravity skip) read it; nothing else carries collision
  results into an actor. `bumped` and `groundRef` also *name what was touched* —
  `{ kind:'tile', tx, ty }` or `{ kind:'env', obj }` — so the world can react to it
  and, later, carry a rider on a moving one.
- **The resolver detects; the world decides.** `resolveCollision` reports what was
  touched (which tile or env object was bumped / stood on) and stops motion, but
  runs no game logic. Reactions live in `World` and in type definitions.
- **Actors are world-agnostic.** An `Actor` never reads the tile map; everything
  the world permits returns through `contacts`.
- **Presentation is derived, not driving.** Animation state is computed from
  post-collision velocity + contacts; the `Animator` only plays frames — it never
  touches physics.
- **Axis-separated resolution.** The resolver integrates and resolves X, then Y,
  so tile collisions stay stable at corners. This is also what lets SMB's `$05`
  penetration-depth gate be skipped: the source is single-pass, so a foot probe
  finding solid is ambiguous there and depth disambiguates it — resolving per axis
  answers the same question structurally (a hit in the X pass IS a wall, a hit in
  the Y pass IS a floor). The gate is that constraint's solution, not a behaviour.
- **Collision point-samples; it does not test a box.** A type names its `probes` in
  the actor's own space and `LevelMap.isSolidAt` is a point query — SMB's model, in
  which no hitbox exists anywhere. **Two foot probes is the load-bearing part**: an
  actor is supported if *either* foot finds solid, which is ledge forgiveness and
  which a bounding box cannot express. `size` is the drawn extent; `probes` is the
  collision geometry; they are different things and must not be conflated again. A
  type naming no probes gets box-derived ones, which reproduce the box model exactly.
  Offsets are **actor space** — they do not scale with the tile. Solid **env objects**
  are point-sampled by the *same* probes, snapped to the object's own face rather than
  a grid line — a separate pass that leaves the grid path bit-identical (with none
  present it runs no code).

## Movement model

The design the **intent** phase expresses. The numbers live in the `ACTOR_TYPES`
physics entry; this section is the design they encode.

**This is Super Mario Bros.' physics**, decoded from the 6502 source — see
`docs/research_smb_physics.md`, which carries the constants, their ROM labels, the
unit derivations, and the scope: what is ported and what is deliberately not.
**The physics is 1:1 with the ROM — every constant IS the byte its comment cites.**
`maxFall` is 4 because `$04` is 4; the launch is −4 because `PlayerYSpdData` is `$fc`.
There is no conversion step to get wrong.

**The world is not.** A tile is 32 px against SMB's 16 px brick, and that is a
**deliberate design choice, not a half-finished conversion**: Mario moves at exactly
SMB's speed through blocks twice SMB's size. He is half a tile wide rather than one,
and a full-hold jump clears ~2 blocks rather than ~4.1. His own motion is SMB's — the
world around it is larger.

Three scales live here and only two of them are the world's. Keeping them apart is
what lets the tile size change without touching anything else:

| quantity | scales with | where it comes from |
|---|---|---|
| speeds, accels, gravity | **physics** | this section's constants — the ROM's bytes |
| sprite + collision-probe offsets | **the actor** | fixed at 16×32 by the CHR; not a choice |
| tile snapping, the block grid | **the world** | `levelMap.tileSize` |

A uniform scale hides the difference; changing one alone is what exposes it. See
`docs/research_smb_collision.md` §"Three scales" — it is the same split, and the
reason the collision port survives a `LevelMap` block-size change.

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
| `collision.js` | `resolveCollision`: per-axis integrate + point-sample the type's `probes` against grid tiles AND solid env objects + respond; returns `contacts` |
| `world.js` | `World`: owns the actor list (`addActor`/`removeActor`), the environment-object list (`addEnvObject`), and the map; runs the pipeline and the react step; owns tile + env-object animations + block-bump hops; draws env objects (behind) then every actor |
| `animator.js` | `Animator`: plays a sprite-set; owns all frame-cycling. Distinct from `actor_animations.js`, which only *names* the state to show |
| `tiles.js` | `TILES` registry + `isSolid`. Level-grid cell types — nothing to do with CHR tiles |
| `env_types.js` | `ENV_TYPES` registry — environment-object blueprints; a third registry beside `ACTOR_TYPES`/`TILES` for solids/triggers actors are resolved *against*, never themselves run through `resolveCollision` |
| `env_object.js` | `EnvObject`: an environment-object instance — a body at a free `(x, y)` + a per-instance animator; the environment analog of `Actor` |
| `chr_decoder.js` | CHR bytes → pixel indices → blitted tiles (`decodeTiles`, `paintTile`). No SMB knowledge |
| `chr_tiles.js` | the ROM's CHR decoded once — the shared `tiles` singleton (`chr_decoder` ← `chr_tiles` → `dat_tiles`), so the 8K decode happens a single time, not once per builder |
| `sprite_frames.js` | a graphics table's rows → drawable frames. Everything SMB-specific about assembling tiles into a sprite: the 2-wide row, rows-per-table, the mirror rules |
| `background_frames.js` | background metatiles → drawable 16×16 blocks (`buildMetatile`): the 2×2 assembler, the background analog of `sprite_frames.js` |
| `palette.js` | the 2C02 master table; `nesRgb` / `nesHex` |
| `assets/dat_tiles.js` | GENERATED: CHR + `FRAMES` + `GFX_TBL_OFFSETS` + `PLAYER_COLORS` + `AREA_PALETTES` |
| `tools/build_sprite_data.py` | the generator — reads ROM + asm, writes `assets/dat_tiles.js` |
| `level_map.js` | `LevelMap`: tile-grid queries (`isSolidAt`, `setTile`, `worldToTile`, `getTileRect`) |
| `camera.js` | smooth follow, world→screen, map clamp |
| `demo/chr_viewer.html` | browses all 512 CHR tiles in the ROM's own palettes |

**Mario's frames come from the ROM and are built synchronously** — `sprite_frames.js`
composes them at module load, so they need no resource loader. A sprite-set frame is
either a **drawable** (anything with `draw(ctx, x, y, mirror)`, which is what those
are) or a **name**, resolved as a BMP.

The names go via `../mario/resource.js` (shared with the legacy `mario/` demo);
`0xFF00FF` is the colorkey. That module is an explicit **registry**, not a
directory scan: `res_loader` fetches only the paths listed in it, so **a new
sprite must be added there or it never loads** — the file sits on disk, and you
get a `No resource …` assert when something first tries to draw it. A frame name
in a sprite-set is the registry key minus `res/images/` (`"goomba/goombas_0"` →
`'res/images/goomba/goombas_0'`). The Goomba and the animated tiles are still on
this path; Mario is not.

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

Which *kind* of change you are making decides what the harness should do, and each
kind has a signature. Naming the kind first turns red from a verdict into evidence:

- **A structure change** — a refactor (inverting the loop, moving movement onto the
  type, hoisting gravity) — claims to change no behaviour, so it **must pass against
  the existing baseline**. Red means the claim was false. The scenario code may have
  to follow a changed API; the *baseline* must not move.
- **A movement-design change** — retuning the jump, changing an accel rate or a
  clamp — deliberately overwrites behaviour, so it **will** go red. Re-blessing is
  part of the change, and the commit message says why the numbers moved.
- **A presentation change** — an `animate` fn, `isSkidding`, a sprite-set. Signature:
  **every trace hash stays put** and only readable scalars move, because the traces
  are `vx`/`vy`/position. *A hash that moves means the change reached the physics and
  is wrong* — that is a sharper check than the PASS/FAIL line.
- **A unit change** — rescaling the physics. Neither of the first two: behaviour is
  identical, the ruler moved. It is **provable**, so prove it rather than re-blessing
  on faith: physics-*generated* distances scale exactly (jump peaks, stopping
  distance), every **tick count stays identical** (`v/a` is scale-free), and
  *level*-determined distances do NOT scale — the floor did not move, so the time to
  fall to it changes instead.

**Scaffolding must be scale-independent, and fixing it is its own step.** `settle()`
ticks until grounded and `terminalTick` reads `actor.maxFall` for a reason: a fixed
tick count or a literal `8` silently ties the harness to one physics scale, and then
a unit change fails for reasons that have nothing to do with the physics. Fix the
scaffolding *first*, prove it green at the old scale, and only then change behaviour.

If one commit moves *both* the scenario code and the baseline, treat it as a smell —
you have bundled two changes, or changed behaviour while calling it a refactor. The
**one legitimate exception**: a scenario's *level* can be tuned to the old behaviour
(`qblock_bump`'s block was 96 px up, out of reach once the jump halved). Then it must
move or the scenario measures nothing — and `bumpTick = -1` is what that looks like.
Check the scenario still exercises its phase; a scalar quietly going -1 or a state
vanishing from `statesSeen` is coverage loss wearing a passing test's clothes.

Eleven scenarios cover every phase of the tick, not just the physics — `qblock_bump`
exercises the **react** phase (`TILES.onBump` → hop → `3` spends to `5`), `anim_states`
the **present** phase, and `env_land` / `env_wall` the **env-solid pass** (a free 16 px
block Mario lands on / stops at). A fingerprint covering only intent+collide would stay
green while a restructure silently stopped dispatching block bumps.

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
