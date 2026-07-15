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

**Inner pipeline** (`World.update`, per tick, for each actor):

1. **intent** — `actor.applyInput(input, dt)`: input + gravity + jump → velocity.
   Reads only *last* tick's `contacts`; never the map.
2. **collide** — `actor.contacts = resolveCollision(actor, levelMap, dt)`:
   integrate the velocity and resolve it against the tiles, returning a fresh
   `contacts`.
3. **react** — `World.reactToContacts(actor)`: the world responds to the contact
   (e.g. a bumped tile's `onBump`).
4. **present** — `actor.updateAnimationState()` then `animator.update(state, dt)`:
   velocity + contacts → animation.

The world also advances tile animations and block-bump hops on this same tick clock.

| Phase | Owner |
|---|---|
| intent (input/forces → velocity) | `Actor` |
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

The design the **intent** phase expresses. The feel is inspired by
FullScreenMario, which is a reference here, not an authority — a deliberate design
call outranks matching it. The numbers live in the `ACTOR_TYPES` physics entry;
this section is the design they encode.

**Horizontal — a friction equilibrium, not a ramp to a cap.** Holding a direction
adds a fixed per-tick impulse; multiplicative friction then damps the result and a
small linear decel bleeds it toward zero. Top speed is therefore *emergent* — the
point where accel and friction balance (≈4.77 px/tick walking) — not a clamp. The
run key doubles the accel impulse, overshooting that equilibrium, so sprinting is
the one case actually pinned by the `maxSpeed` clamp. Releasing all direction keys
swaps in a far larger decel: the actor glides to a stop over ~65 ticks rather than
halting.

**Air control is full.** The same horizontal model runs grounded and airborne —
there is no reduced air acceleration. Mid-jump you can accelerate from rest to top
speed, or reverse outright.

**Jump — an accumulating thrust, not an impulse.** A jump has no launch velocity.
While the button is held *and* the actor is still rising, each tick adds a decaying
upward thrust (`jumpUnit / jumpLev^jumpMod`, `jumpLev` counting held ticks), so
holding longer jumps higher with diminishing returns: a tap clears ~1.2 tiles, a
full hold ~4.5. Releasing, or cresting into a fall, ends the thrust for good — a
new jump needs a landing and a fresh press. The variable-height window is thus the
ascent only (~30 ticks); releasing after the apex is indistinguishable from holding.

**Running jumps go slightly higher.** Horizontal speed lowers the jump exponent,
worth ~3 px at full sprint. We key it on `|vx|` so the boost is symmetric by
speed: jump height shouldn't depend on which way you face. This is the one
deliberate divergence from the reference, which keys it on *signed* velocity and
so jumps ~6 px lower to the left. The symmetric choice is ours on design grounds —
whether the original SMB is symmetric here is **unverified**, so this is not a
fidelity claim, and the reference may well be faithful on it.

**Gravity** is a constant per-tick downward accel clamped at a terminal fall speed
(reached ~16 ticks into a fall). It is skipped while grounded, so `vy` rests at 0
and a launch tick's thrust is not cancelled before it applies.

Measured against the reference frame-for-frame: walk/run accel and clamp, skid
reversal, terminal fall, and air control match exactly; the symmetric run-jump
boost is the sole intended difference.

## Type-Object registries — how the system is extended

A generic instance class plus a table of type definitions it is built from.
**Adding a kind of thing is a table entry, not new engine code.**

- **`ACTOR_TYPES[name] → { size, physics, sprites }`.** An `Actor` (the instance)
  is constructed from one entry. `Actor` is the typed object; the entry is its type.
- **`TILES[id] → { solid, look, onBump? }`.** A grid cell's type. `look` is either
  `{ color }` (flat) or `{ frames, fps }` (sprite / animated). `onBump(world, tx,
  ty, actor)` is the cell's optional response to a head-bump, driven through world
  affordances (`bumpTile`, `setTile`, …); no `onBump` → the tile only blocks.
- **Sprite-sets `{ state → { frames, fps } }`** are the animation data an
  `Animator` plays; the same shape serves actors and animated tiles.

The seam: a new tile or actor type is a registry entry, with any per-type
behaviour attached to that entry (tiles carry `onBump`). The generic mechanisms —
resolver, world pipeline, animator — do not change.

## Module map

| File | Owns |
|---|---|
| `main.js` | composition root: canvas, input, level data, wiring, the fixed-timestep loop |
| `actor.js` | `Actor`: movement intent + animation-state derivation; built from an `ACTOR_TYPES` entry; world-agnostic |
| `collision.js` | `resolveCollision`: per-axis integrate + tile detect + respond; returns `contacts` |
| `world.js` | `World`: owns actors + map; runs the pipeline and the react step; owns tile animations + block-bump hops; draws |
| `animator.js` | `Animator`: plays a sprite-set; owns all frame-cycling |
| `actor_types.js` | `ACTOR_TYPES` registry |
| `tiles.js` | `TILES` registry + `isSolid` |
| `level_map.js` | `LevelMap`: tile-grid queries (`isSolidAt`, `setTile`, `worldToTile`, `getTileRect`) |
| `camera.js` | smooth follow, world→screen, map clamp |

Sprites load via `../mario/resource.js` (shared with the legacy `mario/` demo);
`0xFF00FF` is the colorkey.

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
- **A movement-design change** — retuning the jump, changing the friction model —
  deliberately overwrites behaviour, so it **will** go red. Re-blessing is part of
  the change, and the commit message says why the numbers moved.

So the harness isn't only asking "did I break something" — it is checking the claim
you made about which kind of change this is. If one commit moves *both* the scenario
code and the baseline, treat it as a smell: you have either bundled two changes, or
changed behaviour while calling it a refactor.

Eight scenarios cover every phase of the tick, not just the physics — `qblock_bump`
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
| `test/baseline.js` | data: the blessed fingerprint, and the commit + JS engine that blessed it |
| `test/fingerprint.html` | runs, compares, renders, and emits a re-bless block |

Two things to respect:

- **Exact-match is only valid on the engine that blessed it.** `Math.pow` is
  implementation-approximated by spec, and the jump's thrust divisor uses it with a
  non-integer exponent. A different engine may go red with nothing actually wrong —
  `baseline.js` records which one to re-bless on.
- **To re-bless** — only ever for the second case above — paste the block the page
  emits into `baseline.js`. Re-blessing to turn a red harness green is the one way
  to make it worthless.
