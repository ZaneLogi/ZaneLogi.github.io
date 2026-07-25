// lemmings/src/object_interaction.js
//
// The read side of the object map (design_spec Chapter 17): how a lemming
// interacts with objects each frame. Runs in phase 5 (§12.3) at the lemming's new
// position, but only when its handler returned `checkObjects` (§15.0).
//
// It reads the two probe points (§4.4), caches them on the lemming, and dispatches
// on the FOOT cell only (§17.1: objectInFront is cached for skills, not acted on
// here). At most one effect fires per lemming per frame (§17.3).

import { EFFECT } from './object_map.js';
import { ACTION } from './lemming.js';

/** @typedef {import('./lemming.js').Lemming} Lemming */
/** @typedef {import('./object_map.js').ObjectMap} ObjectMap */

/**
 * Run object interaction (§17) for one lemming at its current foot position. Reads
 * the two probe points (§4.4), caches them on the lemming, and dispatches on the
 * FOOT cell only — at most one effect per lemming per frame (§17.3).
 * @param {Lemming} lem
 * @param {ObjectMap} objectMap
 * @param {Array<{animType:number, frameCount:number, startFrame:number, triggered:boolean, frame:number}>} [objects]
 *   the interactive-object runtime list (§17.2), indexed by the trap value in the
 *   object map. Empty/omitted on stages with no traps.
 * @returns {void}
 */
export function objectInteraction(lem, objectMap, objects = []) {
  // §17.1 — the two probes: below (the foot) drives interaction; in-front is a
  // convenience cache consumed later by bashing/mining/assignment (Chapters 15, 18).
  const below = objectMap.read(lem.x, lem.y);
  lem.objectBelow = below;
  lem.objectInFront = objectMap.read(lem.x + 8 * lem.direction, lem.y - 8);

  // §17.3 — a single decision on objectBelow.
  if (below <= 127) {
    // §17.4 — 0..127 is a trap index into the interactive-object list (§4.2, §17.2).
    // Trigger that trap if it exists and is NOT already busy: mark it triggered,
    // start its animation, and remove the lemming (§15.19 — it dies with no death
    // animation of its own; the trap animates instead). A trap mid-animation
    // ignores lemmings until it re-arms (§17.5), so a second one crosses unharmed.
    const trap = objects[below];
    if (trap && !trap.triggered) {
      trap.triggered = true;
      trap.frame = trap.startFrame;   // §17.4 start-frame (Chapter-20 variant)
      lem.isRemoved = true;           // §15.19 — the lemming dies
      // cueSound(trap.soundId) — audio is Chapter 24 (no software counterpart here)
    }
    return;
  }
  switch (below) {
    case EFFECT.EXIT:
      // A falling lemming cannot exit — it must land first (§17.3, the §15.3 quirk).
      if (lem.action !== ACTION.FALLING) lem.transition(ACTION.EXITING);
      break;
    case EFFECT.FORCE_LEFT:
      if (lem.direction > 0) lem.turn();   // turn back a rightward-mover (a blocker's left arm)
      break;
    case EFFECT.FORCE_RIGHT:
      if (lem.direction < 0) lem.turn();   // turn back a leftward-mover (a blocker's right arm)
      break;
    case EFFECT.WATER:
      lem.transition(ACTION.DROWNING);     // unconditional — any state drowns
      break;
    case EFFECT.FIRE:
      lem.transition(ACTION.VAPORIZING);   // unconditional — any state vaporizes
      break;
    // NONE, BLOCKER (inert to others), STEEL, ONE_WAY_* — nothing here (§17.1, §17.3).
  }
}
