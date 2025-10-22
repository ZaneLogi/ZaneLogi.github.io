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

const SMALL_W = 24;
const SMALL_H = 32;
const BIG_W = 32;
const BIG_H = 64;

// Time based movement constants
// Why (dt * 60)?
// the constants (accel = 0.4, gravity = 0.6) are tuned for 60 FPS.
// Multiplying by (dt * 60) normalizes them to behave identically at any FPS.

export class Actor {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = SMALL_W;
    this.h = SMALL_H;
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
    this.prevJump = false;

    this.skidFriction = 0.2;

    this.facing = 1; // 1 = right, -1 = left
    this.currentState = "idle"; // main animation state
  }

  doPhysics(input, dt) {
    let desiredSpeed = input.run ? this.speedRun : this.speedWalk;
    let accel = this.onGround ? (input.run ? this.accelRun : this.accelWalk) : this.airAccel;

    let isSkidding = false;

    // --- HORIZONTAL MOVEMENT ---
    if (input.left) {
      this.facing = -1;
      if (this.vx > 0 && this.onGround) {
        isSkidding = true;
        this.vx -= this.skidFriction * (dt * 60); // scaled
        if (this.vx < 0) this.vx = 0;
      } else {
        this.vx -= accel * (dt * 60); // scaled
        if (this.vx < -desiredSpeed) this.vx = -desiredSpeed;
      }
    } else if (input.right) {
      this.facing = 1;
      if (this.vx < 0 && this.onGround) {
        isSkidding = true;
        this.vx += this.skidFriction * (dt * 60); // scaled
        if (this.vx > 0) this.vx = 0;
      } else {
        this.vx += accel * (dt * 60); // scaled
        if (this.vx > desiredSpeed) this.vx = desiredSpeed;
      }
    } else {
      // natural decel
      this.vx *= Math.pow(this.decel, dt * 60); // framerate independent friction
    }

    // --- JUMPING ---
    // Jump start (only on new key press AND on ground)
    if (input.jump && !this.prevJump && this.onGround) {
      this.vy = this.jumpVel;
      this.onGround = false;
      this.jumpHeld = true;
    }

    // Short jump cut when releasing Space
    if (!input.jump && this.jumpHeld && this.vy < -JUMP_CUT) {
      this.vy = -JUMP_CUT;
      this.jumpHeld = false;
    }

    // Update prevJump state for next frame
    this.prevJump = input.jump;

    // --- GRAVITY ---
    this.vy += this.gravity * (dt * 60); // scaled
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

  moveAndCollide(levelMap, dt) {
    const TILE_SIZE = levelMap.tileSize;
    const isSolidTileAt = (x, y) => levelMap.isSolidAt(x, y);

    // Horizontal move
    this.x += this.vx * (dt * 60); // scaled
    if (this.vx > 0) { // moving right
      if (isSolidTileAt(this.x + this.w, this.y + 0.01) || isSolidTileAt(this.x + this.w, this.y + this.h - 1.01)) {
        this.x = Math.floor((this.x + this.w) / TILE_SIZE) * TILE_SIZE - this.w - 0.01;
        this.vx = 0;
      }
    } else if (this.vx < 0) { // moving left
      if (isSolidTileAt(this.x, this.y + 0.01) || isSolidTileAt(this.x, this.y + this.h - 1.01)) {
        this.x = Math.floor(this.x / TILE_SIZE + 1) * TILE_SIZE;
        this.vx = 0;
      }
    }

    // Vertical move
    this.y += this.vy * (dt * 60); // scaled
    this.onGround = false; // reset

    if (this.vy > 0) { // falling
      if (isSolidTileAt(this.x, this.y + this.h) || isSolidTileAt(this.x + this.w - 1, this.y + this.h)) {
        this.y = Math.floor((this.y + this.h) / TILE_SIZE) * TILE_SIZE - this.h - 0.01;
        this.vy = 0;
        this.onGround = true;
      }
    } else if (this.vy < 0) { // jumping upward
      if (isSolidTileAt(this.x, this.y) || isSolidTileAt(this.x + this.w - 1, this.y)) {
        this.y = Math.floor(this.y / TILE_SIZE + 1) * TILE_SIZE;
        this.vy = 0;
      }
    } else {
      // this.vy === 0, Check if standing on ground
      if (isSolidTileAt(this.x, this.y + this.h + 1) || isSolidTileAt(this.x + this.w - 1, this.y + this.h + 1)) {
        this.onGround = true;
      }
    }
  }

  update(input, levelMap, dt) {
    this.doPhysics(input, dt);
    this.moveAndCollide(levelMap, dt);
  }
}
