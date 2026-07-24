import { Animator } from './animator.js';

/** @typedef {import('./env_types.js').EnvType} EnvType */

// A head-bumped block's up-and-down hop — the same shape and size as the grid
// brick's hop in world.js (kept in sync by eye; defined here so env objects stay
// self-contained and world.js need not be imported, which would be circular).
const BUMP_DURATION = 0.18; // seconds for the hop
const BUMP_HEIGHT = 10;     // peak rise, px

// ----------------------
// EnvObject
// ----------------------
// The instance an ENV_TYPES entry is built into -- the environment analog of
// Actor. An environment object is a body at a FREE (x, y) with its type's
// presentation. It is drawn like an actor, but it is NEVER passed to
// resolveCollision: environment is what actors are resolved *against*, not a
// subject of resolution. Its position is authoritative input to the world, not an
// output negotiated by the resolver.
//
// Step 1 gives it only a body + a look. Solidity (consulted by the resolver),
// contact reactions, overlap triggers, and self-motion land on it in later steps,
// each read from its `def`.
export class EnvObject {
  /**
   * @param {EnvType} def  the type this instance is built from (an ENV_TYPES entry).
   * @param {number} x     world x -- free, not tied to the tile grid.
   * @param {number} y     world y.
   */
  constructor(def, x, y) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.w = def.size.w;
    this.h = def.size.h;

    // A per-instance animator (a bumped brick's hop or a ? block's shimmer is
    // per-instance state, unlike the grid's synced tile animators). `currentState`
    // is what the world advances/draws; static objects simply hold `idle`.
    this.currentState = 'idle';
    this.animator = new Animator(def.sprites);

    // Head-bump hop: elapsed seconds since a bump, or -1 when idle. Object-owned
    // (unlike the grid's shared `bumps` Map) because a bump is per-instance.
    this.bumpT = -1;
  }

  // Start an up-and-down hop, unless one is already running (idempotent, so a
  // multi-tick bump does not restart it — mirrors world.bumpTile for grid bricks).
  bump() {
    if (this.bumpT < 0) this.bumpT = 0;
  }

  // Advance per-tick state: the animator, then any active hop.
  update(dt) {
    this.animator.update(this.currentState, dt);
    if (this.bumpT >= 0) {
      this.bumpT += dt;
      if (this.bumpT >= BUMP_DURATION) this.bumpT = -1;
    }
  }

  // Current vertical draw offset from the hop (0 when idle): a half-sine up and back.
  get yOffset() {
    return this.bumpT >= 0 ? -Math.sin((this.bumpT / BUMP_DURATION) * Math.PI) * BUMP_HEIGHT : 0;
  }
}
