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
 *
 * Airborne splits on JUMPED-vs-FELL, not rising-vs-descending — ProcessPlayerAction
 * dispatches on Player_State, and a launch's $01 survives the whole arc while only a
 * walk-off gets $02. So a jump keeps the jump frame all the way down, and only a
 * walked-off fall gets the fall look. (Reading `vy` here instead would show a jump's
 * descent as a fall — which happens to look identical, since both drew the jump
 * frame, and hid the ledge case where they differ.)
 *
 * @param {Actor} a
 * @returns {string} a key into the type's sprite-set
 */
export function marioAnimation(a) {
  if (a.isSkidding) return "skid";
  if (!a.contacts.ground) return a.airborneByJump ? "jump" : "fall";
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
