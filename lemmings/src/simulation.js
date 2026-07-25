// lemmings/src/simulation.js
//
// The frame pump (design_spec Chapter 12): holds the world (terrain buffer +
// object map), the lemming list, and the population counters, and advances them
// one frame at a time. Headless (§1.6) — no canvas, no wall-clock; the renderer is
// strictly downstream, reading this state after step() returns.
//
// step() runs the subset of the §12.1 phases the Phase-1 locomotion demo needs:
// advance the frame counter, then process every lemming in strict list order
// (§12.3) — advance its animation frame (§12.4), run its handler (Chapter 15),
// then object interaction (Chapter 17) if the handler asked. Spawn (§13) and the
// end check (§19) are available via addLemming / counters but not driven here.

import { Lemming, ACTION } from './lemming.js';
import { HANDLERS } from './handlers.js';
import { objectInteraction } from './object_interaction.js';
import { advanceFrame } from './animation.js';

/** @typedef {import('./terrain.js').Terrain} Terrain */
/** @typedef {import('./object_map.js').ObjectMap} ObjectMap */

/**
 * The frame pump (Chapter 12): holds the world (terrain buffer + object map), the
 * lemming list, and the population counters, and advances them one frame at a time.
 * Headless (§1.6) — no canvas, no wall-clock; the renderer reads this state after
 * `step()` returns.
 */
export class Simulation {
  /**
   * @param {Terrain} terrain the collision-geometry pixel buffer (Chapter 3)
   * @param {ObjectMap} objectMap the trigger/steel grid (Chapter 4)
   */
  constructor(terrain, objectMap) {
    this.terrain = terrain;
    this.objectMap = objectMap;
    /** @type {Lemming[]} list order = spawn order; index is identity (§11.1, §12.3) */
    this.lemmings = [];
    this.frame = 0;
    // Population counters (§11.3): the invariant is out = released − removed.
    this.released = 0;
    this.out = 0;
    this.saved = 0;
    this.removed = 0;
  }

  /**
   * Direct placement — what the isolated demo stages use (cleaner than waiting out
   * the frame-35 + countdown spawn timing). Appends to the end of the list, so list
   * order stays spawn order (§12.3). A spawned lemming starts Falling by default,
   * exactly as the entrance releases it (§13.5).
   * @param {number} x foot x
   * @param {number} y foot y
   * @param {number} [direction=1] +1 right, −1 left
   * @param {import('./lemming.js').Action} [action='falling'] initial action
   * @returns {Lemming} the created lemming
   */
  addLemming(x, y, direction = 1, action = ACTION.FALLING) {
    const lem = new Lemming(x, y, direction, action);
    lem.listIndex = this.lemmings.length;
    this.lemmings.push(lem);
    this.released += 1;
    this.out += 1;
    return lem;
  }

  /**
   * Advance one frame: bump the frame counter, then process every lemming in strict
   * list order (§12.3) — advance its animation frame (§12.4), run its handler
   * (Chapter 15), then object interaction (Chapter 17) if the handler asked —
   * reconciling the population counters as lemmings leave play.
   * @returns {void}
   */
  step() {
    this.frame += 1;

    // Phase 5 — process every lemming, in strict list order (§12.3).
    for (const lem of this.lemmings) {
      if (lem.isRemoved) continue;

      // §12.4 — advance the animation frame BEFORE the handler runs (§15.0). A
      // transition inside the handler resets frame to 0, overriding this advance.
      const adv = advanceFrame(lem.frame, { frames: lem.frames, loop: lem.loop });
      lem.frame = adv.frame;
      lem.endOfAnimation = adv.endOfAnimation;

      // Run the current action's handler; it returns whether to check objects.
      const handler = HANDLERS[lem.action];
      const checkObjects = handler ? handler(lem, this.terrain) : true;

      // §17 — object interaction at the new position, if the handler asked and the
      // lemming is still in play.
      if (checkObjects && !lem.isRemoved) objectInteraction(lem, this.objectMap);

      // Reconcile counters when a lemming leaves play. Removal (§15.19) decrements
      // out and increments removed; the exit path (§15.18) also counts a save —
      // action === EXITING at removal is the only way to reach the saved count.
      if (lem.isRemoved) {
        this.out -= 1;
        this.removed += 1;
        if (lem.action === ACTION.EXITING) this.saved += 1;
      }
    }
  }

  /**
   * The lemmings still in play (for the renderer).
   * @returns {Lemming[]}
   */
  liveLemmings() { return this.lemmings.filter((l) => !l.isRemoved); }

  /**
   * The live-lemming count — the `out` counter (§11.3).
   * @returns {number}
   */
  liveCount() { return this.out; }
}
