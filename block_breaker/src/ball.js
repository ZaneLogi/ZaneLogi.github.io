// ball.js -- faithful port of the Arkanoid-MSX ball physics + collision.
//
// Source: tiburoncio's disassembly. Every routine below cites its label/address
// in disassembly.asm / balls.asm. This is the reusable core the eventual game
// uses unchanged; the ball_paddle demo is its first consumer.
//
// The model (see block_breaker/CLAUDE.md "Ball physics"):
//   * `skewness` (signed, magnitude 1..8) is the MASTER trajectory-angle index.
//     x/y speed are DERIVED from it each move via the XY-speed tables.
//   * speed magnitude is rate-limited: the ball only moves every `moveTarget`
//     frames, then applies the speed vector `speedMultiplier+1` times; both come
//     from a (speedPos, |skewness|) table lookup. `speedPos` climbs each bounce.
//   * walls/paddle flip speed AND reflect skewness so the two stay consistent.

// ---- extracted tables (verbatim from disassembly.asm) -----------------------

// TBL_SKEWNESS_POS_TO_XY_SPEED @7491 -- positive skewness -> (ySpeed, xSpeed).
// Index = skewness-1. Negative Y = up. skewness 1/8 shallow, 4/5 steep.
const SKEWNESS_POS_TO_XY = [
  [-1, 2], [-1, 2], [-1, 1], [-2, 1], [-2, -1], [-1, -1], [-1, -2], [-1, -2],
];
// TBL_SKEWNESS_NEG_TO_XY_SPEED @7503 -- negative skewness -> (ySpeed, xSpeed).
// Index = |skewness|-1. Positive Y = down.
const SKEWNESS_NEG_TO_XY = [
  [1, -2], [1, -2], [1, -1], [2, -1], [2, 1], [1, 1], [1, 2], [1, 2],
];

// TBL_PTR_BALL_SPEED_PER_SKEWNESS_1/_2 @7537/@7555 -- per speedPos (0..15):
// [speedMultiplier, moveTarget].
const SPEED_PER_SKEWNESS_1 = [
  [0, 15], [0, 14], [0, 13], [0, 12], [1, 15], [1, 14], [1, 13], [1, 12],
  [0, 4], [2, 8], [0, 2], [2, 4], [0, 1], [2, 2], [1, 1], [2, 1],
];
const SPEED_PER_SKEWNESS_2 = [
  [0, 23], [0, 21], [0, 20], [0, 18], [1, 23], [1, 21], [1, 20], [1, 18],
  [0, 6], [2, 12], [0, 3], [1, 4], [1, 3], [1, 2], [0, 1], [1, 1],
];
// TBL_PTR_BALL_SPEED_PER_SKEWNESS_PTR @7519 -- selector indexed by |skewness|
// (entry 0 unused; skewness is never 0). skewness 3 & 6 use table _1.
const SPEED_PER_SKEWNESS = [
  SPEED_PER_SKEWNESS_2, // 0 (unused)
  SPEED_PER_SKEWNESS_2, // 1
  SPEED_PER_SKEWNESS_2, // 2
  SPEED_PER_SKEWNESS_1, // 3
  SPEED_PER_SKEWNESS_2, // 4
  SPEED_PER_SKEWNESS_2, // 5
  SPEED_PER_SKEWNESS_1, // 6
  SPEED_PER_SKEWNESS_2, // 7
  SPEED_PER_SKEWNESS_2, // 8
];

// BALL_SPEED_TABLE @7614 -- how many bounces at each speedPos before advancing.
const BALL_SPEED_TABLE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 8, 16, 24, 31];

// BALL_SKEWNESS_TABLE @7836 -- paddle hit zone -> rebound skewness.
// zone 0 (left edge) = 7 (sharp-left) ... zone 5 (right edge) = 2 (sharp-right).
const BALL_SKEWNESS_TABLE = [7, 6, 5, 4, 3, 2];

// TBL_SKEWNESS @8118 -- the 40-bounce angle perturbation (CHANGE_BALLS_SKEWNESS).
const CHANGE_SKEWNESS_TBL = [
  2, 3, 4, 3, 6, 5, 6, 7, -2, -3, -4, -3, -6, -5, -6, -7,
];

// SPEED_TABLE_POSITIONS @7179 -- initial speedPos by level (12, or 13 for the
// second half). Level 0 (demo) -> 12.
const SPEED_TABLE_POSITIONS = [
  12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
  13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
];

// ---- playfield constants (source pixel coordinates) -------------------------
// Bounce boundaries from ACTION_9941 @7233 and the collision routine @7726.
export const PLAYFIELD = {
  LEFT: 18,          // ball bounces when x < 18, clamp to 18
  RIGHT: 186,        // ball bounces when x >= 186
  RIGHT_CLAMP: 185,  // clamp to 185 on right bounce
  TOP: 9,            // ball bounces when y < 9, clamp to 9
  BALL_REST_Y: 169,  // ball sits on the paddle at y=169
  PADDLE_TOP: 167,   // collision band [167, 173)
  PADDLE_BOTTOM: 173,
  LOST_Y: 184,       // y >= 184 -> ball lost
  PADDLE_MIN_X: 8,   // VAUS_X floor (l69b7h @3297)
  PADDLE_W: 41,      // normal paddle collision span (+41); zones of 7
  PADDLE_ZONES: 7,
  PADDLE_W_ENLARGED: 57,
  PADDLE_ZONES_ENLARGED: 10,
};

// signed-byte helper: the source works in two's-complement bytes.
const sign8 = (v) => (v & 0x80 ? v - 256 : v);

export class Ball {
  constructor(level = 0) {
    this.level = level;
    this.active = 1;
    this.reset();
  }

  // Put the ball back into the "initialize glued" state (glue=0). step() will
  // run initGlued() next frame. Used at start and on respawn.
  reset() {
    this.glue = 0;          // 0=init, 1=glued, 2=moving  (BALL_TABLE_IDX_GLUE)
    this.x = 100;
    this.y = PLAYFIELD.BALL_REST_Y;
    this.ySpeed = 0;
    this.xSpeed = 0;
    this.moveCounter = 0;
    this.skewness = 3;
    this.speedPos = 12;
    this.speedMultiplier = 0;
    this.moveTarget = 0;
    this.speedCounter = 0;
    this.glueCounter = 0;
    this.vausHitX = 26;
    // BALL_BOUNCES_COUNTER is global in the source (shared by all balls); a
    // single ball makes it per-instance here. A multi-ball game would share one.
    this.bounceCounter = 0;
  }

  // ACTION_INITIALIZE_GLUED_BALL @7143 -- one-time setup, transitions glue 0->1.
  initGlued() {
    this.y = PLAYFIELD.BALL_REST_Y;      // 169
    this.vausHitX = 26;
    this.glue = 1;                        // glued
    this.glueCounter = 120;              // ~2 s auto-launch
    this.skewness = 3;                   // launch angle
    this.ySpeed = -1;                    // moving up
    this.speedPos = SPEED_TABLE_POSITIONS[this.level]; // 12
  }

  // ACTION_BALL_FOLLOWS_VAUS_IF_GLUED @7186 -- track the paddle while glued;
  // release (glue=2) on fire or when the glue timer runs out.
  followVaus(paddle, firePressed) {
    if (firePressed) { this.release(); return; }   // CONTROLS fire bit @7202
    if (--this.glueCounter === 0) { this.release(); return; }
    this.x = paddle.x + this.vausHitX;             // VAUS_X + VAUS_HIT_X @7217
  }

  release() {
    this.glue = 2; // l9935h @7226 -- ball moves normally (sound omitted)
  }

  // UPDATE_BALL_POSITION @7356 -- apply speed for one frame (rate-limited).
  // The source calls CHECK_BRICK_HIT inside the multiplier loop; omitted here.
  updatePosition() {
    const absSkew = Math.abs(this.skewness);
    const sub = SPEED_PER_SKEWNESS[absSkew];        // pick _1/_2 by |skewness|
    const [mult, target] = sub[this.speedPos];      // (multiplier, moveTarget)
    this.speedMultiplier = mult;
    this.moveTarget = target;

    // rate limit: only move once every moveTarget frames
    if (++this.moveCounter < this.moveTarget) return;
    this.moveCounter = 0;

    // skewness -> (ySpeed, xSpeed)
    let ys, xs;
    if (this.skewness >= 0) [ys, xs] = SKEWNESS_POS_TO_XY[this.skewness - 1];
    else [ys, xs] = SKEWNESS_NEG_TO_XY[absSkew - 1];
    this.ySpeed = ys;
    this.xSpeed = xs;

    // apply the vector multiplier+1 times (even mult=0 -> once). The source calls
    // CHECK_BRICK_HIT per unit sub-step here (disassembly.asm:7443) and KEEPS
    // sub-stepping after a hit -- the loop only stops on DOH_BEEN_HIT, which stays 0
    // for normal bricks -- so a fast ball can hit several bricks in one frame. So we
    // do NOT break here. brickCheck is inert (undefined) unless a field is wired.
    for (let i = 0; i <= this.speedMultiplier; i++) {
      this.y += this.ySpeed;
      this.x += this.xSpeed;
      if (this.brickCheck) this.brickCheck(this);
    }
  }

  // UPDATE_BALL_SPEED @7574 -- bounce-driven acceleration, capped at speedPos 15.
  updateSpeed() {
    this.speedCounter++;
    if (BALL_SPEED_TABLE[this.speedPos] < this.speedCounter) {
      this.speedCounter = 0;
      if (++this.speedPos === 16) this.speedPos = 15;
    }
  }

  // BALL_VERTICAL_BOUNCE @7662 -- flip Y, reflect skewness to its vertical mirror.
  verticalBounce() {
    this.ySpeed = -this.ySpeed;
    const a = Math.abs(this.skewness) - 9;
    this.skewness = this.skewness < 0 ? -a : a;
  }

  // BALL_HORIZONTAL_BOUNCE @7690 (+ INVERT_BALL_VERTICAL_SKEWNESS @7700) --
  // flip X, reflect skewness to its horizontal mirror (9 - |s|, sign kept).
  horizontalBounce() {
    this.xSpeed = -this.xSpeed;
    const a = 9 - Math.abs(this.skewness);
    this.skewness = this.skewness < 0 ? -a : a;
  }

  // CHECK_BALL_BOUNCES_AND_CHANGE_SKEWNESS @7342 -- every 40 wall bounces the
  // ball's angle is perturbed via CHANGE_BALLS_SKEWNESS @8082.
  checkBallBounces() {
    if (++this.bounceCounter === 40) {
      this.bounceCounter = 0;
      this.changeSkewness();
    }
  }

  changeSkewness() {
    const idx = (this.skewness < 0 ? -this.skewness + 8 : this.skewness) - 1;
    this.skewness = CHANGE_SKEWNESS_TBL[idx];
  }

  // CHECK_UPDATE_BALL_GLUE_AND_SKEWNESS @7726 -- the ball<->paddle collision +
  // rebound response. paddle = { x, enlarged, sticky }.
  checkVausCollision(paddle) {
    if (this.ySpeed < 0) return;                          // moving up: no hit
    if (this.y < PLAYFIELD.PADDLE_TOP || this.y >= PLAYFIELD.PADDLE_BOTTOM)
      return;                                             // 167 <= y < 173
    if (this.x <= paddle.x + 1) return;                   // left of paddle

    const zones = paddle.enlarged ? PLAYFIELD.PADDLE_ZONES_ENLARGED
                                  : PLAYFIELD.PADDLE_ZONES;      // C = 7 / 10
    const width = paddle.enlarged ? PLAYFIELD.PADDLE_W_ENLARGED
                                  : PLAYFIELD.PADDLE_W;          // B = 41 / 57
    if (this.x > paddle.x + width) return;                // right of paddle

    // hit
    this.y = PLAYFIELD.BALL_REST_Y;                       // snap to 169

    if (paddle.sticky) {                                  // GLUING_STATE_STICKY
      this.vausHitX = this.x - paddle.x;
      this.glueCounter = 240;
      this.glue = 1;
      return;
    }

    // rebound: invert Y, pick skewness from the hit zone (l9c05h @7801)
    this.ySpeed = -this.ySpeed;
    const offset = this.x - paddle.x;
    const zone = Math.floor(offset / zones);             // DIVIDE_HL_BY_C @9261
    this.skewness = BALL_SKEWNESS_TABLE[zone];           // {7,6,5,4,3,2}
  }

  // ACTION_9941 @7233 -- one frame of normal (glue=2) movement: move, then wall
  // bounces, paddle collision, and the lost check.
  moveNormally(paddle) {
    this.updatePosition();
    if (!this.active) return;

    // right wall (moving right, x >= 186) -- exclusive with left
    if (this.xSpeed >= 0 && this.x >= PLAYFIELD.RIGHT) {
      this.updateSpeed();
      this.horizontalBounce();
      this.x = PLAYFIELD.RIGHT_CLAMP;                     // 185
      this.checkBallBounces();
    } else if (this.xSpeed < 0 && this.x < PLAYFIELD.LEFT) {
      this.updateSpeed();
      this.horizontalBounce();
      this.x = PLAYFIELD.LEFT;                            // 18
      this.checkBallBounces();
    }

    // ceiling (moving up, y < 9) -- can co-occur with a side bounce (corner)
    if (this.ySpeed < 0 && this.y < PLAYFIELD.TOP) {
      this.updateSpeed();
      this.verticalBounce();
      this.y = PLAYFIELD.TOP;                             // 9
      this.checkBallBounces();
    }

    this.checkVausCollision(paddle);

    if (this.y >= PLAYFIELD.LOST_Y) this.lost = true;     // caller handles it
  }

  // BALL_MOVEMENT_STEP dispatch @7103 -- one frame for this ball.
  // Returns true if the ball was just lost this frame (y >= 184).
  step(paddle, firePressed) {
    this.lost = false;
    if (!this.active) return false;
    switch (this.glue) {
      case 0: this.initGlued(); break;
      case 1: this.followVaus(paddle, firePressed); break;
      case 2: this.moveNormally(paddle); break;
    }
    return this.lost === true;
  }
}
