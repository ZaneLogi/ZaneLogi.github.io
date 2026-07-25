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
import { EFFECT } from './object_map.js';
import { layBrick, digOneRow, applyBashMask, applyMineMask } from './terrain_mod.js';
import { restoreBlockerField } from './blocker.js';

/** @typedef {import('./lemming.js').Lemming} Lemming */
/** @typedef {import('./terrain.js').Terrain} Terrain */
/** @typedef {import('./object_map.js').ObjectMap} ObjectMap */
/**
 * A per-frame action handler: mutate the lemming, return whether to check objects.
 * Terrain-work / blocking handlers also read/write the object map, so the frame
 * pump passes it as a third argument (locomotion handlers ignore it).
 * @typedef {(lem: Lemming, terrain: Terrain, objectMap: ObjectMap) => boolean} Handler
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

// ─── The terrain-work skills (§15.7–15.10) — they reshape the buffer (Ch 16) ──

/**
 * §15.7 Building — lays a rising staircase of bricks (loop, 16 frames), entered
 * with bricksLeft=12. A brick is laid on frame 9; on frame 0 the builder steps up
 * 1px + forward 2px and spends a brick, ending three ways: out of bricks →
 * Shrugging, a wall ahead → Walking+turn, the ceiling → Walking (no turn).
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @returns {boolean} checkObjects
 */
function building(lem, terrain) {
  const Tc = (x, y, m) => terrain.hasTerrainClamped(x, y, m);
  const d = lem.direction;

  // Lay this step's brick (the frame-10/bricksLeft-9 clause lays an extra one on
  // the very first step — a reference quirk). §16.5.
  if (lem.frame === 9 || (lem.frame === 10 && lem.bricksLeft === 9)) {
    layBrick(terrain, lem);
    return false;
  }

  if (lem.frame === 0) {                                   // step up + forward onto the brick
    lem.x += d; lem.y -= 1;
    if (lem.x <= 0 || lem.x > LEMMING_MAX_X || Tc(lem.x, lem.y - 1, -1)) {   // wall immediately ahead
      lem.transition(ACTION.WALKING, true); clampToTop(lem); return true;
    }
    lem.x += d;
    if (Tc(lem.x, lem.y - 1, -1)) {                        // wall one pixel further
      lem.transition(ACTION.WALKING, true); clampToTop(lem); return true;
    }
    lem.bricksLeft -= 1;
    if (lem.bricksLeft === 0) { lem.transition(ACTION.SHRUGGING); clampToTop(lem); return true; }
    if (Tc(lem.x + d * 2, lem.y - 9, -9) || lem.x <= 0 || lem.x > LEMMING_MAX_X) {   // obstacle at head height
      lem.transition(ACTION.WALKING, true); clampToTop(lem); return true;
    }
    if (lem.y - lem.footY < HEAD_MIN_Y) { lem.transition(ACTION.WALKING); clampToTop(lem); }  // ceiling — no turn
    return true;
  }

  return true;                                            // all other frames: idle
}

/**
 * §15.8 Bashing — tunnels horizontally (32-frame loop; index = frame mod 16). On
 * index 2–5 it cuts with the bash mask (Ch 16), on 11–15 it advances one pixel.
 * Ends: nothing left to bash (frame-5 look-ahead finds 4px clear) → Walking; floor
 * falls away → Falling; steel / against-the-grain one-way ahead → Walking+turn.
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @param {ObjectMap} objectMap
 * @returns {boolean} checkObjects
 */
function bashing(lem, terrain, objectMap) {
  const Tc = (x, y, m) => terrain.hasTerrainClamped(x, y, m);
  const d = lem.direction;
  const index = lem.frame % 16;

  if (index >= 11 && index <= 15) {                       // MOVE: advance into the tunnel
    lem.x += d;
    if (lem.x < 0 || lem.x > LEMMING_MAX_X) { lem.transition(ACTION.WALKING, true); return true; }
    let dy = 0;
    while (dy < 3 && !Tc(lem.x, lem.y, dy)) { dy += 1; lem.y += 1; }   // fall if the floor fell away
    if (dy === 3) { lem.transition(ACTION.FALLING); return true; }
    const front = objectMap.read(lem.x + d * 8, lem.y - 8);           // steel / one-way ahead (§4.4)
    if (front === EFFECT.STEEL ||
        (front === EFFECT.ONE_WAY_LEFT && d !== -1) ||
        (front === EFFECT.ONE_WAY_RIGHT && d !== 1)) {
      lem.transition(ACTION.WALKING, true);
    }
    return true;
  }

  if (index >= 2 && index <= 5) {                         // MASK: remove a chunk ahead
    applyBashMask(terrain, lem, index - 2);
    if (index === 5) {                                    // anything left to bash?
      let n = 0, x2 = lem.x + d * 8; const y2 = lem.y - 6;
      while (n < 4 && !terrain.hasTerrain(x2, y2)) { n += 1; x2 += d; }  // note: unclamped T (§15.8)
      if (n === 4) lem.transition(ACTION.WALKING);        // 4px of clear air ⇒ done
    }
  }
  return false;
}

/**
 * §15.9 Mining — tunnels diagonally downward (24-frame loop). Cuts with the mine
 * mask on frames 1–2 (the second offset +1 forward, +1 down → a diagonal), moves
 * down-and-forward on frames 3 & 15. Ends: floor gone → Falling; steel /
 * against-the-grain one-way below → Walking+turn.
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @param {ObjectMap} objectMap
 * @returns {boolean} checkObjects
 */
function mining(lem, terrain, objectMap) {
  const Tc = (x, y, m) => terrain.hasTerrainClamped(x, y, m);
  const d = lem.direction;

  if (lem.frame === 1) { applyMineMask(terrain, lem, 0); return false; }
  if (lem.frame === 2) { applyMineMask(terrain, lem, 1); return false; }

  if (lem.frame === 3 || lem.frame === 15) {              // MOVE: down-and-forward
    lem.x += d;
    if (lem.x < 0 || lem.x > LEMMING_MAX_X) { lem.transition(ACTION.WALKING, true); return true; }
    lem.x += d;
    if (lem.x < 0 || lem.x > LEMMING_MAX_X) { lem.transition(ACTION.WALKING, true); return true; }
    if (lem.frame === 3) {
      lem.y += 1;
      if (lem.y > LEMMING_MAX_Y) { lem.isRemoved = true; return false; }
    }
    if (!Tc(lem.x, lem.y, 0)) { lem.transition(ACTION.FALLING); return true; }   // floor gone ⇒ fall
    const below = objectMap.read(lem.x, lem.y);                                  // steel / one-way underfoot
    if (below === EFFECT.STEEL ||
        (below === EFFECT.ONE_WAY_LEFT && d !== -1) ||
        (below === EFFECT.ONE_WAY_RIGHT && d !== 1)) {
      lem.transition(ACTION.WALKING, true);
    }
    return true;
  }

  if (lem.frame === 0) {
    lem.y += 1;
    if (lem.y > LEMMING_MAX_Y) { lem.isRemoved = true; return false; }
    return true;
  }
  return false;                                           // all other frames: idle
}

/**
 * §15.10 Digging — tunnels straight down. Digging advances its OWN frame (§12.4),
 * so the frame pump skips its generic advance for this action. On assignment it
 * clears two rows immediately (isNewDigger); thereafter one 9px row every 8 frames,
 * stepping down 1px. Ends: row already empty → Falling; steel below → Walking.
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @param {ObjectMap} objectMap
 * @returns {boolean} checkObjects
 */
function digging(lem, terrain, objectMap) {
  if (lem.isNewDigger) {                                  // first frame after assignment (§14.4)
    digOneRow(terrain, lem, lem.y - 2);
    digOneRow(terrain, lem, lem.y - 1);
    lem.isNewDigger = false;
  } else {
    lem.frame += 1;
    if (lem.frame >= 16) lem.frame -= 16;
  }

  if (lem.frame === 0 || lem.frame === 8) {               // dig a row every 8 frames
    const yTop = lem.y;
    lem.y += 1;
    if (lem.y > LEMMING_MAX_Y) { lem.isRemoved = true; return false; }
    if (!digOneRow(terrain, lem, yTop)) lem.transition(ACTION.FALLING);        // nothing removed ⇒ broke through
    else if (objectMap.read(lem.x, lem.y) === EFFECT.STEEL) lem.transition(ACTION.WALKING);   // hit steel
    return true;
  }
  return false;
}

// ─── The stationary states (§15.11–15.12) ────────────────────────────────────

/**
 * §15.11 Blocking — the assigned barrier. Its field turns others via the object
 * map (§4.5); its own handler only watches for its ground to vanish, then becomes
 * a Walker and restores the nine object-map cells its field overwrote.
 * @param {Lemming} lem
 * @param {Terrain} terrain
 * @param {ObjectMap} objectMap
 * @returns {boolean} checkObjects
 */
function blocking(lem, terrain, objectMap) {
  if (!terrain.hasTerrainClamped(lem.x, lem.y, 0)) {      // the ground under the blocker is gone
    lem.transition(ACTION.WALKING);
    lem.isBlocking = false;
    restoreBlockerField(lem, objectMap);
  }
  return false;
}

/**
 * §15.12 Shrugging — the brief "out of bricks" state a builder enters when its
 * supply runs out. Plays once, then returns to Walking.
 * @param {Lemming} lem
 * @returns {boolean} checkObjects
 */
function shrugging(lem) {
  if (lem.endOfAnimation) { lem.transition(ACTION.WALKING); return true; }
  return false;
}

/**
 * Dispatch table: action name → handler. The frame pump (§12.3) looks the current
 * action up here.
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
  [ACTION.BUILDING]: building,
  [ACTION.BASHING]: bashing,
  [ACTION.MINING]: mining,
  [ACTION.DIGGING]: digging,
  [ACTION.BLOCKING]: blocking,
  [ACTION.SHRUGGING]: shrugging,
};

/**
 * Actions whose handler manages its own animation frame (§12.4), so the frame pump
 * must NOT run the generic advance for them. Digging self-advances (§15.10);
 * Floating will join here in a later phase.
 * @type {Set<string>}
 */
export const SELF_ADVANCE = new Set([ACTION.DIGGING]);
