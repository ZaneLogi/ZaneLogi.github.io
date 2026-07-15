// ----------------------
// Controllers
// ----------------------
// The upper half of an actor's behaviour: perception -> intent.
//
// This is the layer that is allowed to know things. A controller may look at the
// world (later, through an injected sense interface); a movement function may
// not. Splitting them is what lets an actor that has to *see* — one that tracks
// the player, or probes for a ledge ahead — exist without giving every actor the
// map.
//
// The player is not special here. Its perception loop simply runs outside the
// program: pixels -> a human's eyes -> the keyboard -> `actor.input`. Its
// controller only has to hand that on. An actor with no human gets a controller
// that computes the same thing instead.
//
// An ACTOR_TYPES entry names one of these as its `control`.

/**
 * Intent for a human-driven actor: whatever the composition root last wrote to
 * `actor.input`. Only actors whose type names this controller ever see input,
 * so there is no broadcast to actors that shouldn't have one.
 *
 * @param {Actor} a
 * @returns {object} { left, right, run, jump }
 */
export function keyboard(a) {
  return a.input;
}

/**
 * Walk forward; turn around on hitting something. The whole reactive class:
 * it needs no senses at all, because "I hit a wall" is a *consequence*, and
 * consequences already arrive through `contacts`. It never learns where it is,
 * what the tile was, or where the player is — and a Goomba shouldn't.
 *
 * `facing` doubles as the direction state: the intent below derives from it, and
 * the movement sets it back from that intent, so the two agree by construction.
 *
 * @param {Actor} a
 * @returns {object} { left, right }
 */
export function reactiveWalker(a) {
  if (a.contacts.left) a.facing = 1;   // blocked going left -> go right
  if (a.contacts.right) a.facing = -1; // blocked going right -> go left
  return { left: a.facing < 0, right: a.facing > 0 };
}
