// ball_paddle.js -- demo: box open at the bottom, a paddle, a ball that rests on
// it and launches on Space. Ball physics + collision come from ../src/ball.js
// (faithful port); this file owns the paddle input, rendering, and 60 Hz loop.

import { Ball, PLAYFIELD } from '../src/ball.js';

const SCALE = 1;
const VIEW_W = 208;   // native px; symmetric 18px wall margins (18 and 190)
const VIEW_H = 192;
const PADDLE_Y = 174; // Vaus sprite Y (VAUS_AND_READY_SPRITE_TABLE:1976 = 0xAE)
const PADDLE_H = 6;
const BALL_SIZE = 5;  // ball rests exactly on the paddle: 169 (rest y) + 5 = 174
// The ball is drawn from its top-left, so at the right-wall clamp (x=185) its
// body reaches 185+BALL_SIZE. Put the right wall face there so it doesn't poke.
const WALL_RIGHT = PLAYFIELD.RIGHT_CLAMP + BALL_SIZE; // 190
const PADDLE_SPEED = 3;
const PADDLE_MAX_X = WALL_RIGHT - PLAYFIELD.PADDLE_W; // paddle right edge reaches the wall

const canvas = document.getElementById('view');
canvas.width = VIEW_W * SCALE;
canvas.height = VIEW_H * SCALE;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.scale(SCALE, SCALE);

const els = {
  state: document.getElementById('state'),
  skew: document.getElementById('skew'),
  spos: document.getElementById('spos'),
  pos: document.getElementById('pos'),
};

const paddle = { x: 82, width: PLAYFIELD.PADDLE_W, enlarged: false, sticky: false };
const ball = new Ball(0);

const keys = { left: false, right: false, fire: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  else if (e.key === ' ') { keys.fire = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false;
  else if (e.key === 'ArrowRight') keys.right = false;
  else if (e.key === ' ') keys.fire = false;
});

// ---- fixed 60 Hz physics loop (source runs one step per VBLANK) -------------
const TICK = 1000 / 60;
let acc = 0, last = performance.now();

function tick() {
  // paddle: arrow input replaces the MSX control read. We draw the paddle *bar*
  // directly at paddle.x, so we clamp the bar's edges to the wall faces (18 and
  // 190) -- symmetric. (The source's VAUS_X min=8 is a sprite-ORIGIN value: the
  // Vaus graphic has a ~10px transparent left margin inside its sprite, so at
  // VAUS_X=8 the visible bar still starts at the wall. Using the bar's own edge
  // as the reference is the faithful-looking equivalent here.)
  if (keys.left) paddle.x -= PADDLE_SPEED;
  if (keys.right) paddle.x += PADDLE_SPEED;
  if (paddle.x < PLAYFIELD.LEFT) paddle.x = PLAYFIELD.LEFT;
  if (paddle.x > PADDLE_MAX_X) paddle.x = PADDLE_MAX_X;

  const lost = ball.step(paddle, keys.fire);
  if (lost) ball.reset(); // demo respawn (source loses a life -> BALL_OUT_BELOW)
}

function frame(now) {
  // Clamp the delta: while the tab is hidden the browser pauses rAF, so on return
  // `now - last` would be huge and fast-forward the ball through a backlog. Cap it
  // to a few ticks so a hidden tab / lag spike just resumes smoothly.
  acc += Math.min(now - last, TICK * 5);
  last = now;
  let guard = 0;
  while (acc >= TICK && guard++ < 8) { tick(); acc -= TICK; }
  render();
  requestAnimationFrame(frame);
}

// ---- rendering --------------------------------------------------------------
const COL = {
  wall: '#3a3f52', wallEdge: '#565d76',
  paddle: '#c9d2e0', paddleEdge: '#ffffff',
  ball: '#ffe14d',
};

function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // box: top / left / right walls, open bottom
  ctx.fillStyle = COL.wall;
  ctx.fillRect(0, 0, VIEW_W, PLAYFIELD.TOP);                          // ceiling
  ctx.fillRect(0, PLAYFIELD.TOP, PLAYFIELD.LEFT, VIEW_H);             // left
  ctx.fillRect(WALL_RIGHT, PLAYFIELD.TOP, VIEW_W - WALL_RIGHT, VIEW_H); // right
  ctx.fillStyle = COL.wallEdge;                                       // inner edges
  ctx.fillRect(0, PLAYFIELD.TOP - 1, VIEW_W, 1);
  ctx.fillRect(PLAYFIELD.LEFT - 1, PLAYFIELD.TOP, 1, VIEW_H);
  ctx.fillRect(WALL_RIGHT, PLAYFIELD.TOP, 1, VIEW_H);

  // paddle -- bar clamped to the wall faces [18, 190] in tick(), so drawn direct.
  ctx.fillStyle = COL.paddle;
  ctx.fillRect(paddle.x, PADDLE_Y, paddle.width, PADDLE_H);
  ctx.fillStyle = COL.paddleEdge;
  ctx.fillRect(paddle.x, PADDLE_Y, paddle.width, 1);

  // ball (small square at its source coordinate)
  ctx.fillStyle = COL.ball;
  ctx.fillRect(ball.x, ball.y, BALL_SIZE, BALL_SIZE);

  // hud
  els.state.textContent = ['initializing', 'glued', 'moving'][ball.glue];
  els.skew.textContent = ball.skewness;
  els.spos.textContent = ball.speedPos;
  els.pos.textContent = `${ball.x}, ${ball.y}`;
}

// ---- defining-case self-test: paddle hit zone -> rebound skewness -----------
// Reproduces CHECK_UPDATE_BALL_GLUE_AND_SKEWNESS's mapping and checks that the
// live Ball produces the same skewness when caught at each offset.
function selfTest() {
  const EXPECT = [7, 6, 5, 4, 3, 2];               // BALL_SKEWNESS_TABLE @7836
  const px = 100;                                   // fixed paddle x for the test
  let ok = true;
  const row = [];
  for (let offset = 2; offset <= 41; offset++) {
    const b = new Ball(0);
    b.glue = 2; b.ySpeed = 1; b.y = 170; b.x = px + offset; // moving down onto paddle
    b.checkVausCollision({ x: px, enlarged: false, sticky: false });
    const expect = EXPECT[Math.floor(offset / PLAYFIELD.PADDLE_ZONES)];
    if (b.skewness !== expect) ok = false;
    if (offset % 7 === 2) row.push(`off${offset}->sk${b.skewness}`);
  }
  console.log(`[ball_paddle] paddle-response self-test ${ok ? 'PASS' : 'FAIL'}  (${row.join('  ')})`);
  return ok;
}

selfTest();
requestAnimationFrame(frame);
