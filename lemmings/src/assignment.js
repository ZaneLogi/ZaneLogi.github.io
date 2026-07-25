// lemmings/src/assignment.js
//
// Skill assignment (design_spec Chapter 18): turning a click into a change to one
// lemming. This file implements the normative core — the per-skill PRECONDITIONS
// (§18.4), the blocker overlap test (§18.6), and what a successful assignment DOES
// (§18.5: spend the budget, apply the effect). The cursor hit-test (§18.2, which
// lemming a click targets) is UI and left to the caller — the demo passes the
// lemming directly (see lemmingUnderCursor for the faithful 13×13 hit box).
//
// Phase 2 covers the five state-entering skills that have handlers: blocker,
// builder, basher, miner, digger. The traits (climber/floater) and the bomber fuse
// need states not yet ported, so they are out of scope here.

import { ACTION } from './lemming.js';
import { EFFECT } from './object_map.js';
import { writeBlockerField, blockerFieldOverlaps } from './blocker.js';

/** @typedef {import('./lemming.js').Lemming} Lemming */
/** @typedef {import('./object_map.js').ObjectMap} ObjectMap */

/** The assignable skills. Values are also the budget keys. */
export const SKILL = {
  // State-entering skills (transition the lemming immediately).
  BLOCKER: 'blocker',
  BUILDER: 'builder',
  BASHER: 'basher',
  MINER: 'miner',
  DIGGER: 'digger',
  // Trait / fuse skills — set a flag or light the fuse; the action is unchanged.
  CLIMBER: 'climber',
  FLOATER: 'floater',
  BOMBER: 'bomber',
};

// §18.4 — the target's current action must be in this set (a work skill may be
// assigned to a walker, shrugger, or a *different* work skill — never the one it is
// already doing).
const A = ACTION;
const ALLOWED = {
  blocker: new Set([A.WALKING, A.SHRUGGING, A.BUILDING, A.BASHING, A.MINING, A.DIGGING]),
  builder: new Set([A.WALKING, A.SHRUGGING, A.BASHING, A.MINING, A.DIGGING]),
  basher: new Set([A.WALKING, A.SHRUGGING, A.BUILDING, A.MINING, A.DIGGING]),
  miner: new Set([A.WALKING, A.SHRUGGING, A.BUILDING, A.BASHING, A.DIGGING]),
  digger: new Set([A.WALKING, A.SHRUGGING, A.BUILDING, A.BASHING, A.MINING]),
};

// §18.4 — the trait/fuse skills instead name the actions they may NOT be assigned
// to (they apply to almost any state).
const FORBIDDEN = {
  climber: new Set([A.BLOCKING, A.SPLATTING, A.EXPLODING]),
  floater: new Set([A.BLOCKING, A.SPLATTING, A.EXPLODING]),
  bomber: new Set([A.OHNOING, A.EXPLODING, A.VAPORIZING, A.SPLATTING]),
};

/** Whether the target's current action permits this skill (§18.4). */
function actionAllowed(skill, action) {
  if (ALLOWED[skill]) return ALLOWED[skill].has(action);
  if (FORBIDDEN[skill]) return !FORBIDDEN[skill].has(action);
  return false;
}

// Steel / one-way probes read the lemming's CACHED objectInFront / objectBelow
// (§18.4) — the values from its most recent object interaction, not a fresh probe.
function steelOrGrainAhead(lem) {
  const f = lem.objectInFront;
  return f === EFFECT.STEEL ||
    (f === EFFECT.ONE_WAY_LEFT && lem.direction !== -1) ||
    (f === EFFECT.ONE_WAY_RIGHT && lem.direction !== 1);
}
function steelOrGrainBelow(lem) {
  const b = lem.objectBelow;
  return b === EFFECT.STEEL ||
    (b === EFFECT.ONE_WAY_LEFT && lem.direction !== -1) ||
    (b === EFFECT.ONE_WAY_RIGHT && lem.direction !== 1);
}

/**
 * The extra (non-action-set, non-budget) precondition for a skill. Returns true if
 * the skill may still be assigned.
 * @param {string} skill
 * @param {Lemming} lem
 * @param {ObjectMap} objectMap
 * @returns {boolean}
 */
function extraPreconditionOk(skill, lem, objectMap) {
  switch (skill) {
    case SKILL.BLOCKER: return !blockerFieldOverlaps(lem, objectMap);         // §18.6
    case SKILL.BUILDER: return lem.y - lem.footY >= -5;                       // head not above the top bound
    case SKILL.BASHER: return !steelOrGrainAhead(lem);                       // no steel / one-way ahead
    case SKILL.MINER: return !steelOrGrainAhead(lem) && !steelOrGrainBelow(lem);
    case SKILL.DIGGER: return lem.objectBelow !== EFFECT.STEEL;               // no steel below
    case SKILL.CLIMBER: return !lem.isClimber;                                // not already a climber
    case SKILL.FLOATER: return !lem.isFloater;                                // not already a floater
    case SKILL.BOMBER: return lem.explosionTimer === 0;                       // no fuse already lit
    default: return false;
  }
}

/**
 * Apply the skill's effect (§18.5 step 2). The transition runs the state's entry
 * init (§14.4); the blocker additionally writes its object-map field (§4.5).
 * @param {string} skill
 * @param {Lemming} lem
 * @param {ObjectMap} objectMap
 * @returns {void}
 */
function applyEffect(skill, lem, objectMap) {
  switch (skill) {
    case SKILL.BLOCKER: lem.transition(ACTION.BLOCKING); writeBlockerField(lem, objectMap); break;
    case SKILL.BUILDER: lem.transition(ACTION.BUILDING); break;
    case SKILL.BASHER: lem.transition(ACTION.BASHING); break;
    case SKILL.MINER: lem.transition(ACTION.MINING); break;
    case SKILL.DIGGER: lem.transition(ACTION.DIGGING); break;
    // Traits / fuse do NOT change the action (§18.5): the trait matters later, the
    // fuse expires later.
    case SKILL.CLIMBER: lem.isClimber = true; break;
    case SKILL.FLOATER: lem.isFloater = true; break;
    case SKILL.BOMBER: lem.explosionTimer = 79; break;
  }
}

/**
 * Try to assign `skill` to `lem` (§18.4–18.6). Succeeds only if the budget is > 0,
 * the target's action is allowed, and the skill's extra precondition holds. On
 * success it spends the budget and applies the effect; a failed assignment spends
 * nothing.
 * @param {Lemming} lem the target lemming (chosen by the caller's hit-test)
 * @param {string} skill one of SKILL.*
 * @param {{ objectMap: ObjectMap, budget: Record<string, number> }} ctx
 * @returns {boolean} whether the assignment succeeded
 */
export function assignSkill(lem, skill, ctx) {
  const { objectMap, budget } = ctx;
  if (!lem || lem.isRemoved) return false;
  if (!(budget[skill] > 0)) return false;                 // §18.4 — budget > 0
  if (!actionAllowed(skill, lem.action)) return false;    // §18.4 — action set
  if (!extraPreconditionOk(skill, lem, objectMap)) return false;          // §18.4 / §18.6

  budget[skill] -= 1;                                      // §18.5 step 1 — spend the budget
  applyEffect(skill, lem, objectMap);                     // §18.5 step 2 — apply the effect
  return true;
}

/**
 * §18.2 — the faithful cursor hit-test for a single lemming: is the cursor point
 * inside its fixed 13×13 hit box, whose top-left is the sprite origin
 * (x + footDx, y + footDy) = (x − footX, y − footY)? Provided for the demo's
 * click-to-assign; the full two-candidate priority scan (§18.2–18.3) is UI.
 * @param {Lemming} lem
 * @param {number} px world x of the cursor
 * @param {number} py world y of the cursor
 * @returns {boolean}
 */
export function cursorHitsLemming(lem, px, py) {
  const left = lem.x - lem.footX, top = lem.y - lem.footY;
  return px >= left && px <= left + 12 && py >= top && py <= top + 12;
}
