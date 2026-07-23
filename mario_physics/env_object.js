import { Animator } from './animator.js';

/** @typedef {import('./env_types.js').EnvType} EnvType */

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
  }
}
