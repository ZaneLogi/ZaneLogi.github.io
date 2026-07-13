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

    const p = def.physics;
    this.speedWalk = p.speedWalk;
    this.speedRun = p.speedRun;
    this.accelWalk = p.accelWalk;
    this.accelRun = p.accelRun;
    this.decel = p.decel;
    this.airAccel = p.airAccel;
    this.skidFriction = p.skidFriction;

    this.jumpVel = -p.jumpVel;
    this.jumpCut = p.jumpCut;
    this.gravity = p.gravity;
    this.maxFall = p.maxFall;

    // The world's answer to last step's motion: which sides ended in contact.
    // Read as an input to this step's movement — jumping and ground traction are
    // only available when grounded.
    this.contacts = { ground: false, ceiling: false, left: false, right: false };
    this.jumpHeld = false;
    this.prevJump = false;

    this.isSkidding = false;

    this.facing = 1; // 1 = right, -1 = left
    this.currentState = "idle"; // main animation state
  }

  // How the actor wants to move this step: fold input and forces into a
  // velocity. Reaches the world only through `this.contacts` (last step's
  // result), never by inspecting tiles directly.
  applyInput(input, dt) {
    const grounded = this.contacts.ground;
    const step = dt * 60;

    let desiredSpeed = input.run ? this.speedRun : this.speedWalk;
    let accel = grounded ? (input.run ? this.accelRun : this.accelWalk) : this.airAccel;

    this.isSkidding = false;

    // --- HORIZONTAL MOVEMENT ---
    if (input.left) {
      this.facing = -1;
      if (this.vx > 0 && grounded) {
        this.isSkidding = true;
        this.vx -= this.skidFriction * step; // scaled
        if (this.vx < 0) this.vx = 0;
      } else {
        this.vx -= accel * step; // scaled
        if (this.vx < -desiredSpeed) this.vx = -desiredSpeed;
      }
    } else if (input.right) {
      this.facing = 1;
      if (this.vx < 0 && grounded) {
        this.isSkidding = true;
        this.vx += this.skidFriction * step; // scaled
        if (this.vx > 0) this.vx = 0;
      } else {
        this.vx += accel * step; // scaled
        if (this.vx > desiredSpeed) this.vx = desiredSpeed;
      }
    } else {
      // natural decel
      this.vx *= Math.pow(this.decel, step); // framerate independent friction
    }

    // --- JUMPING ---
    // Jump start (only on new key press AND on ground)
    if (input.jump && !this.prevJump && grounded) {
      this.vy = this.jumpVel;
      this.jumpHeld = true;
    }

    // Short jump cut when releasing Space
    if (!input.jump && this.jumpHeld && this.vy < -this.jumpCut) {
      this.vy = -this.jumpCut;
      this.jumpHeld = false;
    }

    // Update prevJump state for next frame
    this.prevJump = input.jump;

    // --- GRAVITY ---
    this.vy += this.gravity * step; // scaled
    if (this.vy > this.maxFall) this.vy = this.maxFall;
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
      if (Math.abs(this.vx) > this.speedWalk + 0.1) this.currentState = "run";
      else this.currentState = "walk";
    } else {
      this.currentState = "idle";
    }
  }
}
