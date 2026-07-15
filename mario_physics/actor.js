// ----------------------
// Actor
// ----------------------
// An Actor models a body's own intentions, not its place in the world. Each
// step it produces two things and nothing more:
//   applyInput()           input + gravity + jump -> velocity    (how it wants to move)
//   updateAnimationState() velocity + contacts    -> currentState (how it wants to look)
// It holds no knowledge of tiles or geometry. Whatever the world permits comes
// back through `this.contacts`, and that struct is the single place where the
// results of collision (grounded / hit wall / hit ceiling) re-enter the actor's
// own decisions.
export class Actor {
  constructor(def, x, y) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.w = def.size.w;
    this.h = def.size.h;
    this.vx = 0;
    this.vy = 0;

    // Physics constants come from the type definition (see actor_types.js).
    const p = def.physics;
    this.runAccel = p.runAccel;
    this.friction = p.friction;
    this.decelMoving = p.decelMoving;
    this.decelIdle = p.decelIdle;
    this.maxSpeed = p.maxSpeed;
    this.runAnimSpeed = p.runAnimSpeed;

    this.jumpUnit = p.jumpUnit;
    this.jumpMod = p.jumpMod;
    this.jumpModSpeed = p.jumpModSpeed;
    this.maxRise = p.maxRise;

    this.gravity = p.gravity;
    this.maxFall = p.maxFall;

    // The world's answer to last step's motion: which sides ended in contact.
    // Read as an input to this step's movement — jumping and ground traction are
    // only available when grounded.
    this.contacts = { ground: false, ceiling: false, left: false, right: false };
    this.prevJump = false;

    // Jump state. `jumping` marks the rising phase in which a held jump adds
    // thrust; `jumpLev` counts the ticks it has been held, feeding the decaying
    // thrust curve.
    this.jumping = false;
    this.jumpLev = 0;

    this.isSkidding = false;
    this.isRunning = false; // run key held while moving — drives the run animation

    this.facing = 1; // 1 = right, -1 = left
    this.currentState = "idle"; // main animation state
  }

  // How the actor wants to move this step: fold input and forces into a
  // velocity. Reaches the world only through `this.contacts` (last step's
  // result), never by inspecting tiles directly.
  applyInput(input, dt) {
    const grounded = this.contacts.ground;
    const step = dt * 60;

    // --- HORIZONTAL MOVEMENT ---
    // Additive accel + multiplicative friction + a small linear decel. Top speed
    // is the equilibrium of accel vs. friction, not a hard ramp. The same model
    // runs grounded and airborne — full air control.
    let decel;
    if (input.left || input.right) {
      const dir = input.right ? 1 : -1;
      this.facing = dir;
      const adder = this.runAccel * (input.run ? 2 : 1); // run key doubles the accel
      this.vx += dir * adder * step;
      this.vx *= Math.pow(this.friction, step);
      decel = this.decelMoving;
      this.isRunning = !!input.run;
      // Skid = pressing against current motion (ground only, for the sprite).
      this.isSkidding = grounded && ((dir > 0 && this.vx < 0) || (dir < 0 && this.vx > 0));
    } else {
      this.vx *= Math.pow(this.friction, step); // glide to a stop
      decel = this.decelIdle;
      this.isRunning = false;
      this.isSkidding = false;
    }
    // Linear decel toward zero, then clamp to top speed.
    if (this.vx > decel * step) this.vx -= decel * step;
    else if (this.vx < -decel * step) this.vx += decel * step;
    else this.vx = 0;
    if (this.vx > this.maxSpeed) this.vx = this.maxSpeed;
    else if (this.vx < -this.maxSpeed) this.vx = -this.maxSpeed;

    // --- JUMP START ---  fresh press while on the ground
    if (input.jump && !this.prevJump && grounded) {
      this.jumping = true;
      this.jumpLev = 0;
    }

    // --- GRAVITY ---
    // While grounded the actor is treated as resting (vy held at 0, no gravity).
    // Skipping gravity here keeps vy at 0 on the launch tick so the jump thrust
    // below actually fires; airborne, gravity accumulates as usual.
    if (!grounded) {
      this.vy += this.gravity * step;
      if (this.vy > this.maxFall) this.vy = this.maxFall;
    }

    // --- JUMP THRUST ---
    // While the button is held and the actor is still rising, add a decaying
    // upward impulse: the numerator is constant but the divisor grows each tick,
    // so early ticks lift hard and later ticks barely — holding longer jumps
    // higher, with diminishing returns. Faster horizontal *speed* lowers the
    // exponent, raising the jump. We key it on |vx| so the boost is symmetric by
    // speed — jump height shouldn't depend on which way you face. (A design call,
    // not a fidelity one; see the movement model in CLAUDE.md.)
    if (this.jumping && input.jump && this.vy <= 0) {
      this.jumpLev += 1;
      const mod = this.jumpMod - Math.abs(this.vx) * this.jumpModSpeed;
      const dy = this.jumpUnit / Math.pow(this.jumpLev, mod);
      this.vy = Math.max(this.vy - dy * step, this.maxRise);
    }
    // Releasing the button — or cresting into a fall — ends the thrust; a new
    // jump then requires landing and a fresh press.
    if (!input.jump || this.vy > 0) this.jumping = false;

    this.prevJump = input.jump;
  }

  // How the actor wants to look, given the motion the world actually allowed.
  // Kept apart from the movement step so presentation and physics can each
  // change without disturbing the other.
  updateAnimationState() {
    if (this.isSkidding) {
      this.currentState = "skid";
    } else if (!this.contacts.ground) {
      if (this.vy < 0) this.currentState = "jump";
      else this.currentState = "fall";
    } else if (Math.abs(this.vx) > 0.1) {
      // Run animation only when sprinting fast enough; walking tops out below
      // runAnimSpeed, so it never trips the run frames.
      if (this.isRunning && Math.abs(this.vx) > this.runAnimSpeed) this.currentState = "run";
      else this.currentState = "walk";
    } else {
      this.currentState = "idle";
    }
  }
}
