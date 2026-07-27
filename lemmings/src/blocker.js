// lemmings/src/blocker.js
//
// The blocker's object-map field (design_spec §4.5, §18.6). A blocker stops other
// lemmings not by any special status but by WRITING into the object map, exactly
// as a level object does: a 3×3 block of cells around its foot — a FORCE_LEFT left
// arm, a FORCE_RIGHT right arm, and an inert BLOCKER spine.
//
// Because it writes into the same grid as level objects, the write is bracketed:
// the nine overwritten cells are saved on the lemming when it starts blocking and
// restored when it stops (ground removed, or it explodes). A blocker must not move
// while blocking, or the restore would target the wrong cells (§4.5).

import { EFFECT } from './object_map.js';

/** @typedef {import('./lemming.js').Lemming} Lemming */
/** @typedef {import('./object_map.js').ObjectMap} ObjectMap */

// The nine cells, as they sit in the world (§4.5): dx across, dy down, foot centre.
const DXS = [-4, 0, 4];
const DYS = [-6, -2, 2];

/** The field value for a column: left arm turns right-movers, right arm turns left-movers. */
function fieldValue(dx) {
  if (dx < 0) return EFFECT.FORCE_LEFT;
  if (dx > 0) return EFFECT.FORCE_RIGHT;
  return EFFECT.BLOCKER;                  // centre spine — inert to other lemmings (§4.5)
}

/**
 * §4.5 — on becoming a blocker: read all nine cells, store them on the lemming,
 * then write the field over them.
 * @param {Lemming} lem
 * @param {ObjectMap} objectMap
 * @returns {void}
 */
export function writeBlockerField(lem, objectMap) {
  const saved = [];
  for (const dy of DYS) for (const dx of DXS) saved.push(objectMap.read(lem.x + dx, lem.y + dy));
  lem.savedMap = saved;
  for (const dy of DYS) for (const dx of DXS) objectMap.write(lem.x + dx, lem.y + dy, fieldValue(dx));
}

/**
 * §4.5 — on ceasing to block: write the nine saved values back. The cells are
 * recomputed from the lemming's current position, which is why a blocker must not
 * move while blocking.
 * @param {Lemming} lem
 * @param {ObjectMap} objectMap
 * @returns {void}
 */
export function restoreBlockerField(lem, objectMap) {
  if (!lem.savedMap) return;
  let i = 0;
  for (const dy of DYS) for (const dx of DXS) objectMap.write(lem.x + dx, lem.y + dy, lem.savedMap[i++]);
  lem.savedMap = null;
}

/**
 * §18.6 — the assignment overlap test: read the nine cells the field would occupy
 * and fail if any already holds a blocker value. This stops two blockers from
 * being placed on top of each other and corrupting each other's saved cells.
 * @param {Lemming} lem
 * @param {ObjectMap} objectMap
 * @returns {boolean} true if the field would overlap an existing one
 */
export function blockerFieldOverlaps(lem, objectMap) {
  for (const dy of DYS) for (const dx of DXS) {
    const v = objectMap.read(lem.x + dx, lem.y + dy);
    if (v === EFFECT.FORCE_LEFT || v === EFFECT.BLOCKER || v === EFFECT.FORCE_RIGHT) return true;
  }
  return false;
}
