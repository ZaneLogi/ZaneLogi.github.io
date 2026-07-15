// ----------------------
// Movements
// ----------------------
// The lower half of an actor's behaviour: intent + contacts -> velocity.
//
// A movement function is world-agnostic — it sees the intent its controller
// produced and last tick's `contacts`, never the map and never another actor.
// That is what keeps an actor drivable from synthetic contacts with no world at
// all, which is how test/fingerprint.js measures them.
//
// An ACTOR_TYPES entry names one of these as its `move`. The constants it reads
// come from that same entry, so two types can share a movement function and
// differ only in numbers.

/**
 * Constant-velocity walking, and nothing else. No accel, no friction, no jump —
 * a Goomba is not a slower Mario, it moves at exactly one speed or not at all.
 * That is the point of movement riding on the type: sharing Mario's model here
 * and tuning the constants could not produce this.
 *
 * @param {Actor}  a
 * @param {object} intent  { left, right } from the type's controller
 * @param {number} dt      fixed timestep, in seconds
 */
export function constantWalk(a, intent, dt) {
  const step = dt * 60;

  if (intent.right) { a.vx = a.speed; a.facing = 1; }
  else if (intent.left) { a.vx = -a.speed; a.facing = -1; }
  else a.vx = 0;

  // Gravity on the same terms as everything else: skipped while resting, so a
  // walker that steps off a ledge falls, and one on the floor stays put.
  if (!a.contacts.ground) {
    a.vy += a.gravity * step;
    if (a.vy > a.maxFall) a.vy = a.maxFall;
  }
}

/**
 * Mario's model. Not a linear ramp to a cap: an additive per-tick impulse is
 * damped by multiplicative friction, so top speed is the equilibrium of the two.
 * The jump is not an impulse either — see the thrust block below.
 *
 * @param {Actor}  a       the actor to move
 * @param {object} intent  { left, right, run, jump } from the type's controller
 * @param {number} dt      fixed timestep, in seconds
 */
export function marioMovement(a, intent, dt) {
  const grounded = a.contacts.ground;
  const step = dt * 60;

  // --- HORIZONTAL MOVEMENT ---
  // Additive accel + multiplicative friction + a small linear decel. The same
  // model runs grounded and airborne — full air control.
  let decel;
  if (intent.left || intent.right) {
    const dir = intent.right ? 1 : -1;
    a.facing = dir;
    const adder = a.runAccel * (intent.run ? 2 : 1); // run key doubles the accel
    a.vx += dir * adder * step;
    a.vx *= Math.pow(a.friction, step);
    decel = a.decelMoving;
    a.isRunning = !!intent.run;
    // Skid = pressing against current motion (ground only, for the sprite).
    a.isSkidding = grounded && ((dir > 0 && a.vx < 0) || (dir < 0 && a.vx > 0));
  } else {
    a.vx *= Math.pow(a.friction, step); // glide to a stop
    decel = a.decelIdle;
    a.isRunning = false;
    a.isSkidding = false;
  }
  // Linear decel toward zero, then clamp to top speed.
  if (a.vx > decel * step) a.vx -= decel * step;
  else if (a.vx < -decel * step) a.vx += decel * step;
  else a.vx = 0;
  if (a.vx > a.maxSpeed) a.vx = a.maxSpeed;
  else if (a.vx < -a.maxSpeed) a.vx = -a.maxSpeed;

  // --- JUMP START ---  fresh press while on the ground
  if (intent.jump && !a.prevJump && grounded) {
    a.jumping = true;
    a.jumpLev = 0;
  }

  // --- GRAVITY ---
  // While grounded the actor is treated as resting (vy held at 0, no gravity).
  // Skipping gravity here keeps vy at 0 on the launch tick so the jump thrust
  // below actually fires; airborne, gravity accumulates as usual.
  if (!grounded) {
    a.vy += a.gravity * step;
    if (a.vy > a.maxFall) a.vy = a.maxFall;
  }

  // --- JUMP THRUST ---
  // While the button is held and the actor is still rising, add a decaying
  // upward impulse: the numerator is constant but the divisor grows each tick,
  // so early ticks lift hard and later ticks barely — holding longer jumps
  // higher, with diminishing returns. Faster horizontal *speed* lowers the
  // exponent, raising the jump. We key it on |vx| so the boost is symmetric by
  // speed — jump height shouldn't depend on which way you face. (A design call,
  // not a fidelity one; see the movement model in CLAUDE.md.)
  if (a.jumping && intent.jump && a.vy <= 0) {
    a.jumpLev += 1;
    const mod = a.jumpMod - Math.abs(a.vx) * a.jumpModSpeed;
    const dy = a.jumpUnit / Math.pow(a.jumpLev, mod);
    a.vy = Math.max(a.vy - dy * step, a.maxRise);
  }
  // Releasing the button — or cresting into a fall — ends the thrust; a new
  // jump then requires landing and a fresh press.
  if (!intent.jump || a.vy > 0) a.jumping = false;

  a.prevJump = intent.jump;
}
