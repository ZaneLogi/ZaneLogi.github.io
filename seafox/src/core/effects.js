// seafox/src/core/effects.js
//
// Effects -- design_spec Chapter 15. Wakes, trails, splash and explosion
// debris: short-lived visual objects with **their own 32-slot allocator**,
// entirely separate from the entity list, walked once per tick immediately
// after it (§ 9.3 step 2).
//
// **The record shape is the whole difference between the two systems.** An
// entity record holds identity and no velocity, so it needs a dispatch table to
// decide how to move; an effect record holds velocity and no type, so it is
// fully self-describing -- *move by (dx, dy) until the lifetime runs out* --
// and the walk below is one loop with **no dispatch table and no per-type code
// anywhere behind it**.
//
// One structural difference from the entity list, and it runs the other way:
// **this allocator checks its bound.** A creation request when all 32 slots are
// full is dropped silently, where § 4.7's entity list has no such test at all
// and relies entirely on the caps upstream.
//
// Effects never enter the stencil. They are visual only, cannot collide, and
// nothing in Chapter 14 can see them.

/** @type {number} § 15.1: the same slot count as the entity list, separately. */
export const MAX_EFFECTS = 32;


/**
 * The four sprites of § 15.4 -- the only artwork in the game outside the main
 * sprite set.
 *
 * **Flip is not free here: it is a consequence of the sprite select.** § 15.2's
 * mode byte spends one bit on both, so a sprite reachable only with that bit set
 * is always drawn flipped and the other two never are. The byte itself is not
 * reproduced -- § 1.4 turns a packed multi-state flag into named state -- but
 * this consequence is observable and is kept as a column.
 *
 * `parity` says who chooses the coloured variant:
 *   'fixed' -- the creation site picks, and the choice holds for life because
 *              neither the dot nor the streak ever moves on an odd dx;
 *   'none'  -- two adjacent pixels render white, so no hue applies;
 *   'live'  -- **the draw picks, on the particle's current X.** Four of the
 *              twelve burst templates carry an odd dx, so those particles change
 *              column parity every step and change hue as they fly. This is the
 *              only draw-time colour decision in the game (§ 6.5).
 *
 * @type {Object<string, {flip: boolean, parity: string, even: string, odd: string}>}
 */
export const EFFECT_SPRITES = {
  dot: { flip: false, parity: 'fixed', even: 'effectDotEven', odd: 'effectDotOdd' },
  blob: { flip: false, parity: 'none', even: 'effectBlob', odd: 'effectBlob' },
  spark: { flip: true, parity: 'live',
    even: 'effectSparkClusterEven', odd: 'effectSparkClusterOdd' },
  streak: { flip: true, parity: 'fixed',
    even: 'effectStreakEven', odd: 'effectStreakOdd' },
};

/**
 * **The bounds rectangle is deliberately wider than the screen** (§ 15.3), so
 * effects drift off the edges before they are reaped rather than vanishing at
 * them.
 *
 * **In WORLD x**, like the entity position every effect is seeded from -- so
 * "22 px beyond the edge" is 22 beyond § 2.3's visible span of 28-307, not 22
 * beyond the screen's own 0-279. Writing the screen numbers here would put the
 * right cull 6 px INSIDE the right edge, which is the one place it shows: the
 * debris would blink out just short of the border rather than drift over it.
 */
export const EFFECT_BOUNDS = { top: 7, bottom: 181, left: 28 - 22, right: 307 + 22 };

/** One effect. Velocity and no type -- the mirror of an entity record. */
export class Effect {
  constructor() {
    this.clear();
  }

  /** @returns {void} */
  clear() {
    /** @type {number} 16-bit world X. */
    this.x = 0;
    /** @type {number} */
    this.y = 0;
    /** @type {number} signed per-step velocity. */
    this.dx = 0;
    /** @type {number} */
    this.dy = 0;
    /** @type {string} a key of EFFECT_SPRITES. */
    this.sprite = 'dot';
    /** @type {number} 0 or 1, when the creation site fixes the parity. */
    this.parity = 0;
    /** @type {number} the value stepCountdown reloads to after each step. */
    this.stepReload = 1;
    /** @type {number} ticks until the next step. */
    this.stepCountdown = 1;
    /** @type {number} remaining steps. */
    this.lifetime = 1;
    /**
     * Set at creation: the walk tests it, clears it, and **skips straight to
     * the draw**, so an effect appears at its spawn position before it first
     * moves (§ 15.2).
     * @type {boolean}
     */
    this.justCreated = false;
    /** @type {boolean} live only while allocated. */
    this.active = false;
  }

  /**
   * @param {Effect} other
   * @returns {void}
   */
  copyFrom(other) {
    for (const key of Object.keys(this)) this[key] = other[key];
  }
}

/** The 32-slot effect allocator (§ 15.1). */
export class EffectList {
  constructor() {
    /** @type {Effect[]} */
    this.slots = [];
    for (let i = 0; i < MAX_EFFECTS; i++) this.slots.push(new Effect());
    /** @type {number} live effects occupy [0, liveCount). */
    this.liveCount = 0;
    /** @type {number} how many creations have been dropped for want of a slot. */
    this.dropped = 0;
  }

  /**
   * Create one effect.
   *
   * **Unlike the entity list, this checks its bound** (§ 15.1): a request with
   * all 32 slots full is dropped silently and the game carries on a mark short.
   * That is the specified behaviour, not a safety net bolted on -- which is why
   * it is counted rather than thrown.
   *
   * @param {Object} spec `{x, y, dx, dy, sprite, parity, lifetime, stepReload}`
   * @returns {number} the slot, or -1 when dropped
   */
  spawn(spec) {
    if (this.liveCount >= MAX_EFFECTS) {
      this.dropped += 1;
      return -1;
    }
    const slot = this.liveCount;
    this.liveCount += 1;
    const e = this.slots[slot];
    e.clear();
    e.x = spec.x;
    e.y = spec.y;
    e.dx = spec.dx || 0;
    e.dy = spec.dy || 0;
    e.sprite = spec.sprite;
    e.parity = spec.parity === undefined ? (spec.x & 1) : spec.parity;
    e.lifetime = spec.lifetime;
    e.stepReload = spec.stepReload === undefined ? 1 : spec.stepReload;
    // The countdown is set on the first WALK, not here (§ 15.9) -- the walk's
    // first-visit branch loads it from this effect's own step delay. Anything
    // written here is overwritten before it is ever decremented.
    e.stepCountdown = e.stepReload;
    e.justCreated = true;
    e.active = true;
    return slot;
  }

  /**
   * Free a slot, compacting by swap-with-last exactly as § 4.6.
   * @param {number} slot
   * @returns {void}
   */
  free(slot) {
    this.liveCount -= 1;
    if (slot !== this.liveCount) this.slots[slot].copyFrom(this.slots[this.liveCount]);
    this.slots[this.liveCount].clear();
  }

  /** @returns {void} § 4.8: cleared together with the entity list. */
  reset() {
    for (let i = 0; i < MAX_EFFECTS; i++) this.slots[i].clear();
    this.liveCount = 0;
  }
}

/**
 * Walk the effects list once (§ 15.3), in this exact order:
 *
 *   stepCountdown -= 1
 *   if not yet due:            draw and return
 *   lifetime -= 1
 *   if exhausted:              die
 *   x += dx ; y += dy
 *   if outside the bounds:     die
 *   draw, and reload stepCountdown
 *
 * The draw is the renderer's (§ 17.2 composites effects OVER entities, because
 * this walk runs after the entity walk); nothing here produces a picture.
 *
 * @param {Object} session
 * @returns {void}
 */
export function walkEffects(session) {
  const list = session.effects;
  let cursor = 0;

  while (cursor < list.liveCount) {
    const e = list.slots[cursor];

    if (e.justCreated) {
      // **The first visit skips the countdown, the lifetime AND the move, and
      // ends by LOADING the countdown from this effect's step delay** (§ 15.9).
      // So the delay is what decides how long a mark stands, and a lifetime of 1
      // means "stand for `stepReload` ticks, then go" rather than "blink once".
      // That is the whole of why a torpedo has a visible trail: 31 for the
      // vertical shot's dot, laid every 4 ticks, is eight dots behind it.
      e.justCreated = false;
      e.stepCountdown = e.stepReload;
      cursor += 1;
      continue;
    }

    e.stepCountdown -= 1;
    if (e.stepCountdown !== 0) {
      cursor += 1;                        // not time to step -- drawn, not moved
      continue;
    }

    e.lifetime -= 1;
    if (e.lifetime <= 0) {
      list.free(cursor);                  // cursor does not advance
      continue;
    }

    e.x += e.dx;
    e.y += e.dy;

    if (e.x < EFFECT_BOUNDS.left || e.x > EFFECT_BOUNDS.right ||
        e.y < EFFECT_BOUNDS.top || e.y > EFFECT_BOUNDS.bottom) {
      list.free(cursor);
      continue;
    }

    e.stepCountdown = e.stepReload;
    cursor += 1;
  }
}

/**
 * Which baked asset an effect draws as.
 *
 * For everything but the debris this is settled at creation. For the debris it
 * is decided **here, on the particle's current X** -- the only draw-time colour
 * decision in the game (§ 15.4, § 6.5).
 *
 * @param {Effect} e
 * @returns {string} a key of the baked sprite set
 */
export function spriteFor(e) {
  const kind = EFFECT_SPRITES[e.sprite];
  if (kind.parity === 'none') return kind.even;
  if (kind.parity === 'live') return (e.x & 1) ? kind.odd : kind.even;
  return e.parity ? kind.odd : kind.even;
}
