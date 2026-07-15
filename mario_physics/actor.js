// ----------------------
// Actor
// ----------------------
// An Actor is a body: its state, and the constants its behaviour reads. What it
// *does* comes from its type — an ACTOR_TYPES entry names a `control` (perception
// -> intent) and a `move` (intent + contacts -> velocity), and the world calls
// them. The Actor itself only derives how it wants to look:
//   updateAnimationState() velocity + contacts -> currentState
// It holds no knowledge of tiles or geometry. Whatever the world permits comes
// back through `this.contacts`, and that struct is the single place where the
// results of collision (grounded / hit wall / hit ceiling) re-enter an actor's
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

    // Intent source for a human-driven actor: the composition root writes this
    // each tick and the `keyboard` controller hands it on. Actors whose type
    // names a computed controller never read it.
    this.input = {};

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
