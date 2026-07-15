// ----------------------
// Animations
// ----------------------
// The third piece of behaviour that rides on a type: post-collision velocity +
// contacts -> the name of the state to show.
//
// This is derived, never driving: an animate function may read the actor but must
// not touch physics. It exists per type because which states *exist* is a type's
// business — Mario has a skid and a jump; a walker has neither, and asking it to
// report "fall" would name a sprite it doesn't own.
//
// An ACTOR_TYPES entry names one of these as its `animate`.

/**
 * Mario: skid beats airborne beats moving beats still.
 * @param {Actor} a
 * @returns {string} a key into the type's sprite-set
 */
export function marioAnimation(a) {
  if (a.isSkidding) return "skid";
  if (!a.contacts.ground) return a.vy < 0 ? "jump" : "fall";
  if (Math.abs(a.vx) > 0.1) {
    // Run frames only when sprinting fast enough; walking tops out below
    // runAnimSpeed, so it never trips them.
    return a.isRunning && Math.abs(a.vx) > a.runAnimSpeed ? "run" : "walk";
  }
  return "idle";
}

/**
 * A walker has one look and keeps it — airborne or not, a Goomba is a Goomba.
 * @returns {string}
 */
export function alwaysWalk() {
  return "walk";
}
