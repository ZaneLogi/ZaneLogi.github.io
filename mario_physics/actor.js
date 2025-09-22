// ----------------------
// Basic constants
// ----------------------
const GRAVITY = 0.6;
const FRICTION = 0.8;

// Walking parameters
const WALK_ACCEL = 0.4;
const WALK_MAX_SPEED = 3.0;

// Running parameters
const RUN_ACCEL = 0.6;
const RUN_MAX_SPEED = 6.0;

// Jump parameters
const JUMP_SPEED = 12;
const JUMP_CUT = 3;

export class Actor {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    this.speedWalk = WALK_MAX_SPEED;
    this.speedRun = RUN_MAX_SPEED;
    this.accelWalk = WALK_ACCEL;
    this.accelRun = RUN_ACCEL;
    this.decel = FRICTION;
    this.airAccel = WALK_ACCEL/2;

    this.jumpVel = -JUMP_SPEED;
    this.gravity = GRAVITY;
    this.maxFall = 6.0;

    this.onGround = false;
    this.jumpHeld = false;

    this.skidFriction = 0.2;

    this.facing = 1; // 1 = right, -1 = left
    this.currentState = "idle"; // main animation state
  }

  update(input) {
    let desiredSpeed = input.run ? this.speedRun : this.speedWalk;
    let accel = this.onGround ? (input.run ? this.accelRun : this.accelWalk) : this.airAccel;

    let isSkidding = false;

    // --- HORIZONTAL MOVEMENT ---
    if (input.left) {
      this.facing = -1;
      if (this.vx > 0 && this.onGround) {
        isSkidding = true;
        this.vx -= this.skidFriction;
        if (this.vx < 0) this.vx = 0;
      } else {
        this.vx -= accel;
        if (this.vx < -desiredSpeed) this.vx = -desiredSpeed;
      }
    } else if (input.right) {
      this.facing = 1;
      if (this.vx < 0 && this.onGround) {
        isSkidding = true;
        this.vx += this.skidFriction;
        if (this.vx > 0) this.vx = 0;
      } else {
        this.vx += accel;
        if (this.vx > desiredSpeed) this.vx = desiredSpeed;
      }
    } else {
      // natural decel
      this.vx *= this.decel;
    }

    // --- JUMPING ---
    // Jump start
    if (input.jump && this.onGround) {
      this.vy = this.jumpVel;
      this.onGround = false;
      this.jumpHeld = true;
    }

    // Short jump cut when releasing Space
    if (!input.jump && this.jumpHeld && this.vy < -JUMP_CUT) {
      this.vy = -JUMP_CUT;
      this.jumpHeld = false;
    }

    // --- GRAVITY ---
    this.vy += this.gravity;
    if (this.vy > this.maxFall) this.vy = this.maxFall;

    // --- STATE PRIORITY ---
    if (isSkidding) {
      this.currentState = "skid";
    } else if (!this.onGround) {
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
