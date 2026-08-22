// seafox/src/core/burst.js
//
// The death burst -- design_spec § 15.8. Raised by the state-change step of
// § 9.4 when an entity dies.
//
// **Particles are table-driven, not generated.** One twelve-record template is
// shared by every type, and a type consumes **the first n records**, where n is
// its debris count from the § 7.4 definition record -- 12 for the player, 7 for
// a submarine, 5 for a ship, 0 for everything else.
//
// **So the order is the design, not an implementation detail.** A five-particle
// ship throws records 0-4 -- left, up-left, up, right, down-right -- and never
// the long-lived ones. Only the player, at twelve, uses the whole table. Bigger
// deaths therefore look different in KIND rather than merely in count, and
// shuffling the table or handing every type the same slice destroys that while
// leaving every count correct.

import { EFFECT_SPRITES } from './effects.js';

/**
 * The twelve records (§ 15.8). Each is an offset and a velocity, made absolute
 * by adding the **dying entity's** position outright.
 *
 * Two rows carry more weight than the rest:
 *
 *   * **Record 8 carries the blob**, where the other eleven carry the spark
 *     cluster -- and being a different sprite it is also the one record drawn
 *     unflipped. Since a type takes the first n records, it is reached only at a
 *     debris count of nine or more, so **the player's twelve-particle death is
 *     the only one that contains it**, rendering white among eleven coloured
 *     sparks.
 *   * **Records 0, 1, 7 and 11 carry an odd dx** (-5, -3, -5, -5). Those
 *     particles change column parity on every step, which is what makes the
 *     debris the one object whose colour is chosen at draw time (§ 15.4).
 *
 * @type {{ox: number, oy: number, dx: number, dy: number, life: number,
 *          sprite: string}[]}
 */
export const BURST_TEMPLATE = [
  { ox: -3, oy: 2, dx: -5, dy: 0, life: 5, sprite: 'spark' },    // 0  left
  { ox: 1, oy: -4, dx: -3, dy: -4, life: 4, sprite: 'spark' },   // 1  up-left
  { ox: 18, oy: -4, dx: 0, dy: -5, life: 6, sprite: 'spark' },   // 2  up
  { ox: 27, oy: -4, dx: 4, dy: -1, life: 3, sprite: 'spark' },   // 3  right
  { ox: 27, oy: 6, dx: 4, dy: 4, life: 4, sprite: 'spark' },     // 4  down-right
  { ox: 14, oy: 6, dx: 0, dy: 5, life: 7, sprite: 'spark' },     // 5  down
  { ox: -3, oy: 6, dx: -6, dy: 4, life: 6, sprite: 'spark' },    // 6  down-left
  { ox: 2, oy: -4, dx: -5, dy: -3, life: 15, sprite: 'spark' },  // 7  up-left, long
  { ox: 20, oy: -4, dx: 0, dy: -6, life: 10, sprite: 'blob' },   // 8  up -- THE BLOB
  { ox: 27, oy: 4, dx: 4, dy: 0, life: 18, sprite: 'spark' },    // 9  right, longest
  { ox: 17, oy: 6, dx: 0, dy: 4, life: 12, sprite: 'spark' },    // 10 down
  { ox: 4, oy: 6, dx: -5, dy: 4, life: 16, sprite: 'spark' },    // 11 down-left
];

/**
 * Throw an entity's debris (§ 15.8).
 *
 * The dying entity's own death animation runs at period 4 (§ 2.7.1),
 * independently of these -- they are not frames of it.
 *
 * @param {Object} session
 * @param {Object} e the dying entity
 * @param {number} count its debris count, from the § 7.4 definition record
 * @returns {number} how many particles were actually created; fewer than
 *   `count` when the allocator ran out of slots, which it drops silently
 */
export function emitBurst(session, e, count) {
  let made = 0;
  for (let i = 0; i < count && i < BURST_TEMPLATE.length; i++) {
    const t = BURST_TEMPLATE[i];
    const slot = session.effects.spawn({
      x: e.x + t.ox,
      y: e.y + t.oy,
      dx: t.dx,
      dy: t.dy,
      sprite: t.sprite,
      lifetime: t.life,
      stepReload: 1,
    });
    if (slot !== -1) made += 1;
  }
  return made;
}

/**
 * @returns {number} how many template records carry an odd dx -- the particles
 *   whose colour the draw decides (§ 15.4). Exported so a test can assert the
 *   count rather than restate the indices.
 */
export function oddStepTemplates() {
  return BURST_TEMPLATE.filter((t) => (t.dx & 1) !== 0).length;
}

/**
 * @returns {boolean} whether the template's sprite assignment still matches
 *   § 15.8 -- eleven sparks and exactly one blob, at record 8.
 */
export function templateSpritesAreSound() {
  const blobs = BURST_TEMPLATE
    .map((t, i) => (t.sprite === 'blob' ? i : -1))
    .filter((i) => i >= 0);
  return blobs.length === 1 && blobs[0] === 8 &&
    BURST_TEMPLATE.every((t) => EFFECT_SPRITES[t.sprite] !== undefined);
}
