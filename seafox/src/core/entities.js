// seafox/src/core/entities.js
//
// The entity list of design_spec Chapter 4: everything that moves is a slot in
// one array of 32. It is dense -- live entities occupy [0, liveCount) with no
// holes and no tombstones -- and a slot IS an index. There is no handle, no
// generation counter and no free list.
//
// Three things here are normative and each has a failure mode that is invisible
// from play:
//
//   * Allocation is an unchecked append (§ 4.4). Overflow is prevented upstream
//     by the per-class caps, and § 4.7.1 shows those sum to exactly 32 with zero
//     margin. Treat the array as fragile rather than safe.
//   * Removal is TWO-PHASE (§ 4.5). Collapsing it leaks the population caps,
//     because only a type's own handler knows which class counter to decrement,
//     so a slot freed in the same step that requested it is recycled while its
//     class still counts it as live. That class then stops spawning for the rest
//     of the session, with no symptom until someone notices the absence.
//   * Freeing is swap-with-last, and the walk cursor MUST NOT advance
//     afterwards (§ 4.6), because the hole is filled by the entity that was
//     last, which this tick has not yet processed.
//
// Chapter 15 specifies a second, separate allocator for visual effects, which
// shares this discipline but not this array -- and unlike this one, it checks
// its bound.

import { CLASS, CLASS_OF_TYPE } from './types.js';

/** @type {number} design_spec § 4.1. The caps are meaningful only against this. */
export const MAX_ENTITIES = 32;

/**
 * One slot. The fields divide into identity/position, which mean the same for
 * every type, and per-type state, which does not (design_spec § 4.2).
 *
 * **The four scratch fields do not mean the same thing for different types**,
 * and reading them as though they did produces speeds wrong by an order of
 * magnitude. Most moving types keep their step in `scratch0`; the Destroyer does
 * not -- that field holds an unrelated cadence for it and its step of 2 sits in
 * `scratch1`. Take every scratch field's meaning from the type's own entry in
 * Chapter 13, never from another type's.
 *
 * There is deliberately **no velocity field**: motion is decided fresh each
 * update by the handler the type dispatches to. That is the structural
 * difference between an entity and an effect, whose record IS a velocity and
 * which therefore needs no dispatch at all.
 */
export class Entity {
  constructor() {
    this.clear();
  }

  /**
   * Return every field to its unallocated value.
   * @returns {void}
   */
  clear() {
    // -- identity and position (§ 4.2), the same for every type
    /** @type {number} 0-20, selecting both tables of Chapter 7. */
    this.type = 0;
    /** @type {string} key of the sprite currently being drawn. */
    this.sprite = '';
    /** @type {number} 16-bit world X (§ 2.3); screen_x = x - 28. */
    this.x = 0;
    /** @type {number} screen row directly. */
    this.y = 0;
    /** @type {number} ticks remaining until this entity's next update (§ 2.7). */
    this.updateCountdown = 0;

    // -- flags (§ 4.3)
    /** @type {boolean} a transition is due: sound, debris, begin the death animation. */
    this.stateChangePending = false;
    /** @type {boolean} playing a death animation: skip handler AND collision response. */
    this.dying = false;
    /** @type {boolean} phase one of § 4.5. */
    this.removalRequested = false;
    /** @type {boolean} phase two of § 4.5, set by the type's OWN handler. */
    this.removalConfirmed = false;
    /** @type {boolean} set at every creation. */
    this.active = false;
    /** @type {boolean} selects which colour pair this entity draws in (Chapter 6). */
    this.paletteFlip = false;
    /** @type {boolean} set at creation, cleared by the type's own handler (§ 9.4.1). */
    this.firstUpdate = false;

    // -- per-type state (§ 4.2). Only the first three mean the same for every type.
    /** @type {number} the countdown's reload value (§ 2.7). Speed is step / period. */
    this.updatePeriod = 1;
    /** @type {number} current animation frame. */
    this.animFrame = 0;
    /** @type {number} final animation frame. */
    this.animLastFrame = 0;
    /** @type {number} per-type scratch -- see Chapter 13 for THIS type. */
    this.scratch0 = 0;
    /** @type {number} per-type scratch. */
    this.scratch1 = 0;
    /** @type {number} per-type scratch. */
    this.scratch2 = 0;
    /** @type {number} per-type scratch. */
    this.scratch3 = 0;

    /**
     * A unique stamp per allocation, for identity only. Nothing in the
     * simulation reads it and no rule depends on it.
     *
     * It exists because slots are POOLED: a record is reused when its slot is
     * reallocated, so holding a reference to one and watching it over time shows
     * a single object that appears to teleport when a different entity moves in.
     * Anything measuring an entity across ticks -- the § 2.7.2 speed checks
     * especially -- has to be able to tell "this is still the same entity" from
     * "this slot changed hands", and a slot index cannot do it either, because
     * swap-with-last moves entities between slots (§ 4.6).
     * @type {number}
     */
    this.serial = 0;
  }

  /**
   * Copy every field from another slot. Used by the swap-with-last of § 4.6.
   * @param {Entity} other
   * @returns {void}
   */
  copyFrom(other) {
    for (const key of Object.keys(this)) this[key] = other[key];
  }
}

/**
 * The 32-slot array plus the class counters that bound it.
 *
 * The counters are held **separately from the live entity count** (§ 1.3) and
 * are not derived from the array. That separation is the point: they are
 * incremented at each spawn site and decremented by the owning type's removal
 * path, so a mismatch between a counter and the real population is exactly the
 * symptom of a collapsed two-phase removal. Deriving them would hide the bug
 * the § 20.6 invariant exists to catch.
 */
export class EntityList {
  constructor() {
    /** @type {Entity[]} slots, pre-allocated; a slot is an index. */
    this.slots = [];
    for (let i = 0; i < MAX_ENTITIES; i++) this.slots.push(new Entity());
    /** @type {number} live entities occupy [0, liveCount). */
    this.liveCount = 0;
    /** @type {Object<string, number>} the nine capped classes of § 4.7. */
    this.counts = EntityList.zeroCounts();
    /** @type {number} monotonic, stamped onto each allocation. Identity only. */
    this.serialCounter = 0;
  }

  /**
   * @returns {Object<string, number>} every capped class at zero.
   */
  static zeroCounts() {
    /** @type {Object<string, number>} */
    const c = {};
    for (const key of Object.values(CLASS)) c[key] = 0;
    return c;
  }

  /**
   * Allocate a slot by append (design_spec § 4.4).
   *
   * **There is no bounds check and no failure path**, because the original has
   * none: overflow is prevented upstream by the caps. § 4.7.1 records that at
   * the hardest mission they sum to exactly 32 -- 25 ladder caps, 2 torpedoes,
   * the player, and the four-record supply chain -- with the avenger outside
   * that arithmetic entirely and bounded by nothing.
   *
   * Writing slot 32 is undefined behaviour in the specification. This throws
   * rather than growing: the array size determines what every cap means, so
   * growing it would silently change the game.
   *
   * The class counter is NOT touched here -- § 4.7 puts that at the spawn site.
   * @param {number} type one of TYPE
   * @returns {number} the slot index
   */
  alloc(type) {
    if (this.liveCount >= MAX_ENTITIES) {
      throw new Error('entity array overflow: the caps of § 4.7 failed to bound it');
    }
    const slot = this.liveCount;
    this.liveCount += 1;
    const e = this.slots[slot];
    e.clear();
    e.type = type;
    e.active = true;
    e.firstUpdate = true;
    this.serialCounter += 1;
    e.serial = this.serialCounter;
    return slot;
  }

  /**
   * Free a slot: swap-with-last, mid-walk (design_spec § 4.6).
   *
   * **A walk cursor sitting at `slot` must never advance after this returns.**
   * § 9.4's SETTLE states that unconditionally, and both cases need it:
   *
   *   * slot was not the last -- the hole is now filled by the entity that was
   *     last, which this tick has not processed. Advancing skips it.
   *   * slot WAS the last -- `liveCount` has just been decremented to `slot`,
   *     so the cursor already equals it and the walk ends on the next test.
   *     Advancing here overruns the live prefix, and the walk then frees slots
   *     it never allocated until `liveCount` goes negative.
   *
   * The second case is why this returns nothing: an "should I advance?" result
   * invites a caller to advance in the case that looks safe and is not.
   *
   * The stencil erase that § 4.6 puts first lands with Chapter 3; the ordering
   * is recorded here because it matters -- the footprint must go before the
   * swap, while the slot still identifies the entity that owned it.
   *
   * @param {number} slot the slot to free
   * @returns {void}
   */
  freeSlot(slot) {
    if (slot >= this.liveCount || slot < 0) {
      throw new Error('freeSlot(' + slot + ') outside the live prefix of ' + this.liveCount);
    }
    this.liveCount -= 1;
    if (slot !== this.liveCount) {
      this.slots[slot].copyFrom(this.slots[this.liveCount]);
    }
    this.slots[this.liveCount].clear();
  }

  /**
   * Increment a type's class counter, at the spawn site (§ 4.7).
   * @param {number} type
   * @returns {void}
   */
  countSpawn(type) {
    const cls = CLASS_OF_TYPE[type];
    if (cls !== null && cls !== undefined) this.counts[cls] += 1;
  }

  /**
   * Decrement a type's class counter, from that type's own removal path (§ 4.5).
   * @param {number} type
   * @returns {void}
   */
  countRemoval(type) {
    const cls = CLASS_OF_TYPE[type];
    if (cls !== null && cls !== undefined) this.counts[cls] -= 1;
  }

  /**
   * Phase two of § 4.5, from inside a type's own update handler: clear the
   * request, decrement this type's class counter, and mark the slot free for the
   * walk to reclaim.
   *
   * **Every handler must do this and no other code may**, because only a type's
   * own handler knows which class counter to decrement. A slot freed without it
   * is recycled while its class still counts it as live, and that class then
   * stops spawning for the rest of the session with no visible symptom.
   * @param {number} slot
   * @returns {void}
   */
  confirmRemoval(slot) {
    const e = this.slots[slot];
    e.removalRequested = false;
    e.removalConfirmed = true;
    this.countRemoval(e.type);
  }

  /**
   * The live population of a class, counted from the array rather than read
   * from the counter. Only tests use this -- it is the independent measurement
   * the § 20.6 invariant compares the counter against.
   * @param {string} cls one of CLASS
   * @returns {number}
   */
  populationOf(cls) {
    let n = 0;
    for (let i = 0; i < this.liveCount; i++) {
      if (CLASS_OF_TYPE[this.slots[i].type] === cls) n += 1;
    }
    return n;
  }

  /**
   * Clear the list and every counter together (design_spec § 4.8).
   *
   * Clearing the list without the counters, or the reverse, lets a counter drift
   * permanently out of step with the array -- the same failure as collapsing
   * two-phase removal, arriving by a different route.
   *
   * § 4.8 says "all seven class counters", counting the difficulty ladder's
   * knobs. The two torpedo counters are counters too and are cleared here as
   * well: a round reset removes every entity, so leaving a torpedo count
   * standing would leak a cap that is only 1 deep.
   * @returns {void}
   */
  reset() {
    for (let i = 0; i < MAX_ENTITIES; i++) this.slots[i].clear();
    this.liveCount = 0;
    this.counts = EntityList.zeroCounts();
  }
}
