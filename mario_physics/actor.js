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

    // Physics constants come from the type definition, copied wholesale: which
    // constants exist is the *type's* business, not the Actor's. A walker carries
    // a `speed`; Mario carries a friction model and a jump curve. Naming them here
    // would make the Actor know every type.
    Object.assign(this, def.physics);

    // The world's answer to last step's motion: which sides ended in contact.
    // Read as an input to this step's movement — jumping and ground traction are
    // only available when grounded.
    this.contacts = { ground: false, ceiling: false, left: false, right: false };
    this.prevJump = false;

    // Intent source for a human-driven actor: the composition root writes this
    // each tick and the `keyboard` controller hands it on. Actors whose type
    // names a computed controller never read it.
    this.input = {};

    // Jump state. SMB's jump is an impulse, so there is no "am I jumping" flag —
    // what persists is *which gravity is live*: a weak one while rising with the
    // button held, a strong one otherwise. Once swapped to the strong one it
    // stays swapped until the next launch. `jumpOriginY` is where that launch
    // happened; the launch-tick grace measures rise against it.
    this.jumpGravity = 0; // set at launch, from the |vx| band
    this.fallGravity = def.physics.spawnFallGravity ?? 0;
    this.gravityLive = this.fallGravity;
    this.jumpOriginY = y;

    this.isSkidding = false;
    this.isRunning = false; // run key held while moving — drives the run animation

    this.facing = 1; // 1 = right, -1 = left
    // SMB keeps *facing* and *moving direction* apart, and their disagreeing is
    // what defines a skid: `facing` is where the input points, `movingDir` is the
    // sign of the speed. movingDir holds its last value while vx is 0, which is
    // what lets a dead-stopped skid keep the direction it snapped to.
    this.movingDir = 1;
    this.runTimer = 0;     // ticks of run physics still owed after the key drops
    this.runningSpeed = 0; // last tick's |vx|, if it was above the gate; else 0
    this.currentState = "idle"; // main animation state
  }

  // How the actor wants to look, given the motion the world actually allowed.
  // Which states exist is the type's business — Mario has a skid and a jump, a
  // walker has neither — so the type's `animate` decides and this only stores the
  // answer. Kept apart from the movement step so presentation and physics can each
  // change without disturbing the other.
  updateAnimationState() {
    this.currentState = this.def.animate(this);
  }
}
