// ----------------------
// Collision detection & response
// ----------------------
// An actor proposes its motion for a step as a velocity; the world is the
// authority on how much of that motion is actually possible. This resolver is
// that authority — it advances the actor by its velocity and constrains it
// against solid tiles, then reports the outcome as a `contacts` struct the actor
// reads on its next step.
//
// The two axes are resolved independently — advance X and resolve X, then
// advance Y and resolve Y. Handling one direction at a time keeps tile
// collisions stable at corners, where a single combined move could snap the
// actor to the wrong side.

/**
 * Integrates the actor's velocity into its position one fixed step, resolving
 * tile collisions per axis and zeroing blocked velocity components.
 *
 * @param {object}   actor     An Actor with x, y, w, h, vx, vy.
 * @param {LevelMap} levelMap  The tile map to collide against.
 * @param {number}   dt        The fixed timestep, in seconds (1/60).
 * @returns {{ground: boolean, ceiling: boolean, left: boolean, right: boolean}}
 *          Which sides ended the step in contact with a solid tile.
 */
export function resolveCollision(actor, levelMap, dt) {
  const TILE_SIZE = levelMap.tileSize;
  const isSolidTileAt = (x, y) => levelMap.isSolidAt(x, y);
  const step = dt * 60; // constants are tuned for 60 FPS; keep them frame-rate independent
  const contacts = { ground: false, ceiling: false, left: false, right: false };

  // --- HORIZONTAL: move, then resolve ---
  actor.x += actor.vx * step;
  if (actor.vx > 0) { // moving right
    if (isSolidTileAt(actor.x + actor.w, actor.y + 0.01) || isSolidTileAt(actor.x + actor.w, actor.y + actor.h - 1.01)) {
      actor.x = Math.floor((actor.x + actor.w) / TILE_SIZE) * TILE_SIZE - actor.w - 0.01;
      actor.vx = 0;
      contacts.right = true;
    }
  } else if (actor.vx < 0) { // moving left
    if (isSolidTileAt(actor.x, actor.y + 0.01) || isSolidTileAt(actor.x, actor.y + actor.h - 1.01)) {
      actor.x = Math.floor(actor.x / TILE_SIZE + 1) * TILE_SIZE;
      actor.vx = 0;
      contacts.left = true;
    }
  }

  // --- VERTICAL: move, then resolve ---
  actor.y += actor.vy * step;
  if (actor.vy > 0) { // falling
    if (isSolidTileAt(actor.x, actor.y + actor.h) || isSolidTileAt(actor.x + actor.w - 1, actor.y + actor.h)) {
      actor.y = Math.floor((actor.y + actor.h) / TILE_SIZE) * TILE_SIZE - actor.h - 0.01;
      actor.vy = 0;
      contacts.ground = true;
    }
  } else if (actor.vy < 0) { // jumping upward
    if (isSolidTileAt(actor.x, actor.y) || isSolidTileAt(actor.x + actor.w - 1, actor.y)) {
      actor.y = Math.floor(actor.y / TILE_SIZE + 1) * TILE_SIZE;
      actor.vy = 0;
      contacts.ceiling = true;
    }
  } else {
    // vy === 0: not moving vertically, probe just below for standing ground
    if (isSolidTileAt(actor.x, actor.y + actor.h + 1) || isSolidTileAt(actor.x + actor.w - 1, actor.y + actor.h + 1)) {
      contacts.ground = true;
    }
  }

  return contacts;
}
