# mario_physics — engine architecture

Guidance for working in this project. It describes the **system architecture —
the substrate and its invariants — not what's in the game**. The registries
(`actor_types.js`, `tiles.js`) and the level data are the catalogue of what
exists; git is the history. This file only changes when the *structure* changes.
Local guidance; overrides the root `CLAUDE.md`.

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
  eligibility, ground vs. air accel) read it; nothing else carries collision
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
