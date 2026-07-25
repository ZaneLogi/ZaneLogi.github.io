// lemmings/src/handlers.js
//
// The per-frame action handlers (design_spec §15) — exact integer ports. Each
// takes the lemming and the terrain buffer, moves/probes/transitions the lemming,
// and returns `checkObjects` (§15.0): true asks the frame pump to run object
// interaction (Chapter 17) at the lemming's new position this frame.
//
// This is where §1.4 bites: every probe offset and step limit below is normative —
// a pixel wrong is a different game. The terrain buffer IS the collision geometry
// (Chapter 3), so all probes are pixel reads through terrain.hasTerrain* .
//
// Phase-1 set: the six locomotion states a lemming reaches on its own without a
// skill (walking, jumping, falling) plus the terminal states it is diverted into
// (splatting, drowning, vaporizing, exiting). Climber/floater branches are noted
// where they belong and join in Phase 2; in Phase 1 those traits are always false,
// so the branches are dead and the remaining path is exact.

import { ACTION } from './lemming.js';

/** @typedef {import('./lemming.js').Lemming} Lemming */
/** @typedef {import('./terrain.js').Terrain} Terrain */
/**
 * A per-frame action handler: mutate the lemming, return whether to check objects.
 * @typedef {(lem: Lemming, terrain: Terrain) => boolean} Handler
 */

// §2.3 bounds used by the handlers.
const LEMMING_MAX_X = 1647;   // right turn-around bound (64px past the world edge — a cliff)
const LEMMING_MAX_Y = 163;    // past this ⇒ fell out of the world, removed
const HEAD_MIN_Y = -5;        // top bound, checked against the head (sprite top)

/**
 * §15.19 — clamp to top. Called wherever a handler moves a lemming upward. Enforces
 * the top world bound in sprite space: the head is `foot + footDy`, `footDy = −anchor`.
 * @param {Lemming} lem
 * @returns {void}
 */
function clampToTop(lem) {
  const footDy = -lem.footY;                 // sprite-top offset = −(foot anchor) (§11.2)
  if (lem.y + footDy < HEAD_MIN_Y) {         // head above the top bound
    lem.y = HEAD_MIN_Y - 2 - footDy;         // push the head back to just below the bound
    lem.turn();
    if (lem.action === ACTION.JUMPING) lem.transition(ACTION.WALKING);  // a jump into the ceiling ends as a walk
  }
}

/**
 * §15.1 Walking — the default state and the hub of the machine. Steps one pixel,
 * turns at world bounds, and reads the terrain ahead to walk up (1–2px), jump
 * (3–6px), turn at a wall (7+px), walk down (drop 1–3px), or start falling (4+px).
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @returns {boolean} checkObjects
 */
function walking(lem, terrain) {
  const Tc = (x, y, m) => terrain.hasTerrainClamped(x, y, m);

  lem.x += lem.direction;                                    // step one pixel in the facing direction

  if (lem.x < 0 || lem.x > LEMMING_MAX_X) {                  // left/right world bound (§2.3)
    lem.turn();
    return true;
  }

  if (Tc(lem.x, lem.y, 0)) {                                 // terrain at the new foot — rising ground or wall
    let dy = 0;
    while (dy <= 6 && Tc(lem.x, lem.y - dy - 1, -dy - 1)) dy += 1;   // measure how high it rises
    if (dy > 6) {                                            // rises more than 6px ⇒ a wall
      // isClimber ⇒ Climbing (Phase 2); no climber in Phase 1 ⇒ turn.
      lem.turn();
      return true;
    }
    if (dy >= 3) { lem.transition(ACTION.JUMPING); lem.y -= 2; }     // a 3..6px step also starts a Jump
    else lem.y -= dy;                                        // 1..2px ⇒ step up onto it
    clampToTop(lem);
    return true;
  }

  // no terrain at the foot — walk down or fall
  let dy = 1;
  while (dy <= 3) {
    lem.y += 1;
    if (Tc(lem.x, lem.y, dy)) break;                         // found ground within 3px down
    dy += 1;
  }
  if (dy > 3) { lem.y += 1; lem.transition(ACTION.FALLING); }  // no ground within 3px ⇒ start falling
  if (lem.y > LEMMING_MAX_Y) { lem.isRemoved = true; return false; }  // fell out (§2.3)
  return true;
}

/**
 * §15.2 Jumping — the brief vertical "step-up" state (once animation). Rises up to
 * 2px per frame and drops back to Walking once it has cleared the step. Never
 * advances in x.
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @returns {boolean} checkObjects
 */
function jumping(lem, terrain) {
  const Tc = (x, y, m) => terrain.hasTerrainClamped(x, y, m);
  let dy = 0;
  while (dy < 2 && Tc(lem.x, lem.y - 1, -dy - 1)) { dy += 1; lem.y -= 1; }  // rise up to 2px this frame
  if (dy < 2) lem.transition(ACTION.WALKING);               // rose less than 2px ⇒ done stepping up
  clampToTop(lem);
  return true;
}

/**
 * §15.3 Falling — descends up to 3px/frame and accumulates `fallen`, which decides
 * splatting (>60px ⇒ death) and, in Phase 2, floating. Removed if it drops out of
 * the world.
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @returns {boolean} checkObjects
 */
function falling(lem, terrain) {
  const Tc = (x, y, m) => terrain.hasTerrainClamped(x, y, m);

  // isFloater ⇒ deploy the umbrella after fallen>16 (Phase 2). No floater in Phase 1.

  let dy = 0;
  while (dy < 3 && !Tc(lem.x, lem.y, dy)) {                  // fall up to 3px this frame
    dy += 1; lem.y += 1;
    if (lem.y > LEMMING_MAX_Y) { lem.isRemoved = true; return false; }   // fell out (§2.3)
  }

  if (dy === 3) { lem.fallen += 3; return true; }            // fell the full 3px, still no ground
  if (lem.fallen > 60) lem.transition(ACTION.SPLATTING);     // fell too far to survive
  else lem.transition(ACTION.WALKING);                       // safe landing
  return true;
}

// ─── Terminal states (§15.15–15.18) — play a once animation, then remove ─────

/**
 * §15.15 Splatting — death from a fall over 60px. Plays once, then removes.
 * @param {Lemming} lem
 * @returns {boolean} checkObjects
 */
function splatting(lem) {
  if (lem.endOfAnimation) lem.isRemoved = true;
  return false;
}

/**
 * §15.16 Drowning — death in water; drifts forward until it meets terrain or the
 * animation ends, then removes. The 8px-ahead probe is the unclamped `T` (§15.16).
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @returns {boolean} checkObjects
 */
function drowning(lem, terrain) {
  if (lem.endOfAnimation) lem.isRemoved = true;
  else if (!terrain.hasTerrain(lem.x + lem.direction * 8, lem.y)) lem.x += lem.direction;  // unclamped T (§15.16)
  return false;
}

/**
 * §15.17 Vaporizing — death in fire; the plainest terminal state (play once, remove).
 * @param {Lemming} lem
 * @returns {boolean} checkObjects
 */
function vaporizing(lem) {
  if (lem.endOfAnimation) lem.isRemoved = true;
  return false;
}

/**
 * §15.18 Exiting — the one successful outcome. `saved` is incremented by the frame
 * pump when the removal is observed (this is the only path that reaches removal
 * while action === EXITING).
 * @param {Lemming} lem
 * @returns {boolean} checkObjects
 */
function exiting(lem) {
  if (lem.endOfAnimation) lem.isRemoved = true;
  return false;
}

/**
 * Dispatch table: action name → handler. The frame pump (§12.3) looks the current
 * action up here. Skill handlers (Building/Bashing/Mining/Digging/Blocking/…) are
 * added in Phase 2.
 * @type {Record<string, Handler>}
 */
export const HANDLERS = {
  [ACTION.WALKING]: walking,
  [ACTION.JUMPING]: jumping,
  [ACTION.FALLING]: falling,
  [ACTION.SPLATTING]: splatting,
  [ACTION.DROWNING]: drowning,
  [ACTION.VAPORIZING]: vaporizing,
  [ACTION.EXITING]: exiting,
};
