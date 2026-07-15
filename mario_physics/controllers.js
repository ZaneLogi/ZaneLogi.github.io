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
