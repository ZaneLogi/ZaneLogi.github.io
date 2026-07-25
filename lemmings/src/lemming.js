// lemmings/src/lemming.js
//
// The lemming record (design_spec §11.1) and the state-machine operations that
// change its action (§14.3–14.5). Pure integer data + logic — no canvas, no
// wall-clock (§1.6). The per-frame *handlers* that move a lemming live in
// handlers.js; this file owns the record and the transition() that handlers call.

import { LEMMING_ANIMATIONS } from '../assets/animation_metadata.js';

/**
 * A lemming action state — the string doubles as the animation base name (§9),
 * so the renderer resolves the facing variant with
 * `SpriteSheet.directional(action, direction < 0)`.
 * @typedef {'walking'|'jumping'|'falling'|'splatting'|'drowning'|'vaporizing'|'exiting'
 *   |'building'|'bashing'|'mining'|'digging'|'blocking'|'shrugging'} Action
 */

/**
 * One animation's runtime metadata row (from `assets/animation_metadata.js`).
 * @typedef {(typeof LEMMING_ANIMATIONS)[number]} AnimInfo
 */

/**
 * The action-state name constants. Values are the animation base names.
 * @type {Readonly<Record<string, Action>>}
 */
export const ACTION = {
  WALKING: 'walking',
  JUMPING: 'jumping',
  FALLING: 'falling',
  SPLATTING: 'splatting',
  DROWNING: 'drowning',
  VAPORIZING: 'vaporizing',
  EXITING: 'exiting',
  // Phase-2 skill states.
  BUILDING: 'building',
  BASHING: 'bashing',
  MINING: 'mining',
  DIGGING: 'digging',
  BLOCKING: 'blocking',
  SHRUGGING: 'shrugging',
};

// frames / loop per animation, keyed by base name. Mirrored (_rtl) variants share
// the base's frame count and loop mode, so a base-name lookup is sufficient for
// the simulation; facing only matters to the renderer (§14.5).
/** @type {Map<string, AnimInfo>} */
const ANIM = new Map();
for (const a of LEMMING_ANIMATIONS) if (!ANIM.has(a.name)) ANIM.set(a.name, a);

/**
 * Animation metadata for an action (throws if none — a programming error).
 * @param {Action|string} action
 * @returns {AnimInfo}
 */
function animInfo(action) {
  const a = ANIM.get(action);
  if (!a) throw new Error('lemming: no animation metadata for action "' + action + '"');
  return a;
}

/**
 * One lemming: the normative simulation record (§11.1) plus the derived
 * animation cache (§11.2) and the state-machine operations that change its action
 * (§14.3–14.5). Its position `(x, y)` is the FOOT (§2.1).
 */
export class Lemming {
  /**
   * Create a lemming at a foot position (§2.1) in a starting action. The spawner
   * (§13) makes new lemmings Falling; the demo stages place them directly.
   * @param {number} x foot x (world pixels)
   * @param {number} y foot y (world pixels)
   * @param {number} [direction=1] facing/step: +1 right, −1 left
   * @param {Action} [action='falling'] initial action state
   */
  constructor(x, y, direction = 1, action = ACTION.FALLING) {
    // --- §11.1 simulation state ---
    /** @type {number} foot x — the point the lemming *is* (§2.1) */
    this.x = x;
    /** @type {number} foot y (§2.1) */
    this.y = y;
    /** @type {number} facing & walk step: +1 right, −1 left (0 while splatting) */
    this.direction = direction;
    /** @type {Action} current action state */
    this.action = action;
    /** @type {number} animation-frame index (drives transitions, §11.1) */
    this.frame = 0;
    /** @type {number} pixels fallen so far in the current fall */
    this.fallen = 0;
    /** @type {number} bomber fuse; 0 = none (Phase 2) */
    this.explosionTimer = 0;
    /** @type {number} builder's remaining bricks (Phase 2) */
    this.bricksLeft = 0;
    /** @type {number} floater descent-table index (Phase 2) */
    this.floatIndex = 0;
    /** @type {boolean} permanent trait — scales walls (Phase 2) */
    this.isClimber = false;
    /** @type {boolean} permanent trait — survives any fall (Phase 2) */
    this.isFloater = false;
    /** @type {boolean} currently a blocker (Phase 2) */
    this.isBlocking = false;
    /** @type {boolean} first-frame digger flag (Phase 2) */
    this.isNewDigger = false;
    /** @type {boolean} no longer in play (saved, dead, or nuked) */
    this.isRemoved = false;
    /** @type {number} object-map value under the foot — per-frame cache (§4.4) */
    this.objectBelow = 0;
    /** @type {number} object-map value ahead — per-frame cache (§4.4) */
    this.objectInFront = 0;
    /** @type {boolean} a *once* animation reached its last frame */
    this.endOfAnimation = false;
    /** @type {number} position in the lemming list — identity (set by Simulation) */
    this.listIndex = -1;
    /** @type {number[]|null} the nine object-map cells a blocker overwrote (§4.5) */
    this.savedMap = null;

    // --- derived cache (§11.2): the current animation's frame count, loop mode,
    // and foot anchor. The anchor feeds the head-bound clamp (§2.3, §15.19) and
    // the renderer's sprite placement (§2.1); it is a function of `action`.
    /** @type {number} frame count of the current animation */
    this.frames = 1;
    /** @type {boolean} true = loop, false = play once and hold */
    this.loop = false;
    /** @type {number} foot anchor x (§2.1, §9) */
    this.footX = 8;
    /** @type {number} foot anchor y (§2.1, §9) */
    this.footY = 10;
    this._selectAnimation(action);
  }

  /**
   * §11.2 — copy the current action's animation metadata (frame count, loop mode,
   * foot anchor) for the frame-advance (§12.4), the head-bound clamp, and the
   * renderer. Reselected on every transition so it is never stale.
   * @param {Action} action
   * @returns {void}
   */
  _selectAnimation(action) {
    const a = animInfo(action);
    this.frames = a.frames;
    this.loop = a.loop;
    this.footX = a.footX;
    this.footY = a.footY;
  }

  /**
   * §14.3 — the one state-change operation. Up to three steps, in order:
   *   1. turn (negate direction) if asked;
   *   2. always reselect the animation for `newAction` at the current facing;
   *   3. on a *real* change (newAction ≠ current), reset per-action state + entry init.
   *
   * Two early-outs are normative (§14.3): same action + no turn ⇒ nothing; same
   * action + turn ⇒ steps 1–2 only (a turn preserves frame/fallen — §14.5).
   * @param {Action} newAction
   * @param {boolean} [turn=false] also flip facing (a turn-around)
   * @returns {void}
   */
  transition(newAction, turn = false) {
    if (newAction === this.action && !turn) return;   // top early-out

    if (turn) this.direction = -this.direction;        // step 1
    this._selectAnimation(newAction);                  // step 2 (facing set by step 1)

    if (newAction !== this.action) {                   // step 3 — real change only
      this.action = newAction;
      this.frame = 0;
      this.endOfAnimation = false;
      this.fallen = 0;
      this.bricksLeft = 0;
      this._entryInit(newAction);
    }
  }

  /**
   * §14.5 — a turn is `transition(sameAction, turn:true)`: flip facing, reselect
   * the mirrored animation, preserve everything else (frame, fallen, action).
   * @returns {void}
   */
  turn() {
    this.transition(this.action, true);
  }

  /**
   * §14.4 — entry initialisation for the new state. Most states do nothing beyond
   * the common reset in step 3; these have extra entry actions.
   *
   * Note: Blocking's object-map field write (§4.5) is NOT here — it needs the
   * object map, which this record does not hold. The assignment site writes the
   * field right after this transition (blocker.js, §18.5); here we only flag the
   * lemming as blocking.
   * @param {Action} action
   * @returns {void}
   */
  _entryInit(action) {
    switch (action) {
      case ACTION.SPLATTING:
        this.explosionTimer = 0;   // cancel any fuse
        this.direction = 0;        // a splatter has no facing (§14.4)
        break;
      case ACTION.BUILDING:
        this.bricksLeft = 12;      // a builder's staircase budget (§15.7)
        break;
      case ACTION.DIGGING:
        this.isNewDigger = true;   // dig on the first frame (§15.10)
        break;
      case ACTION.MINING:
        this.y += 1;               // entering mining nudges the lemming down 1px (§14.4)
        break;
      case ACTION.BLOCKING:
        this.isBlocking = true;    // field write happens at the assignment site (§4.5)
        break;
      // Falling: `fallen` stays 0 — the faller-starts-at-3 variant (§20) is off.
    }
  }
}
