// game.js -- block_breaker: bricks + ball + paddle together (the root demo).
//
// Assembles the faithful pieces into one playfield:
//   * ball physics + wall/paddle/brick collision   -> src/ball.js
//   * ball <-> brick collision over a real level    -> src/brick_collision.js
//   * a level layout (?level=N in the URL, default 1) -> assets/dat_levels.js
//   * real MSX brick tiles                          -> src/tiles.js + assets/dat_tiles.js
//   * the decoded ball sprite                       -> src/ball_sprite.js
//
// Bricks break by their real per-cell kind (dat_levels.js `actions`): normal/capsule
// break in one hit, hard bricks take several, gold is unbreakable. Score, level-clear,
// and the capsule spawn are deferred (see block_breaker/CLAUDE.md).
//
// Rendering is at NATIVE resolution (208x192); the canvas is scaled up with CSS
// (image-rendering: pixelated) so the pixels stay crisp. The paddle is a rounded
// rect and the ball is a bitmap built once at load from the decoded 5x4 lozenge.

import { Ball, PLAYFIELD } from './src/ball.js';
import { BrickField, CELL } from './src/brick_field.js';
import { checkBrickHit, resetBrickEffectState } from './src/brick_collision.js';
import { buildTileBitmaps, drawBrick } from './src/tiles.js';
import { BALL_SPRITE } from './src/ball_sprite.js';
import { LEVELS } from './assets/dat_levels.js';
import { TILES } from './assets/dat_tiles.js';

// ---- native playfield canvas (walls at x=18 / x=190, top at y=9) ------------
const VIEW_W = 208;   // 18px left border + 172 interior + 18px right border
const VIEW_H = 192;   // top border y<9; open bottom (paddle ~174, lost y=184)
const WALL_RIGHT = PLAYFIELD.RIGHT_CLAMP + BALL_SPRITE.w;   // 190 (ball is 5 wide)

const canvas = document.getElementById('view');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---- assets built once at load ----------------------------------------------
const tiles = buildTileBitmaps(TILES);
const ctp = TILES.colorToPattern;
const ballBmp = buildBallBitmap();

// Level 1: `grid` (colour-index per cell) drives rendering; `actions` (the per-cell
// brick KIND, values == CELL.*) drives collision. Hard bricks get a per-cell hit
// counter (HARD_BRICKS_REMAINING_HITS = level/8 + 2).
// URL params: ?level=N (1-based, default 1; clamped to the 32 levels), ?easy
// (present = the ball never accelerates -- maps to ball.freezeSpeed below), and
// ?debug (present = ball-state HUD + collision-cell overlay; see the debug section).
const params = new URLSearchParams(location.search);
const LEVEL = Math.min(LEVELS.length, Math.max(1,
  parseInt(params.get('level'), 10) || 1)) - 1;
const EASY = params.has('easy');
const DEBUG = params.has('debug');
let paused = false, stepOnce = false;   // ?debug loop control: P pauses, '.' frame-advances
const grid = LEVELS[LEVEL].grid;
const actions = LEVELS[LEVEL].actions;
const HARD_HITS = (LEVEL >> 3) + 2;
const field = new BrickField();
for (let r = 0; r < grid.length; r++)
  for (let c = 0; c < grid[r].length; c++) {
    const kind = actions[r][c];             // CELL.NORMAL/CAPSULE/HARD/UNBREAKABLE/EMPTY
    if (kind === CELL.EMPTY) continue;
    field.set(r, c, kind);
    if (kind === CELL.HARD) field.setHardHits(r, c, HARD_HITS);
  }
resetBrickEffectState();

// ---- ball + paddle ----------------------------------------------------------
const PADDLE_Y = 174, PADDLE_H = 6, PADDLE_SPEED = 3;
const PADDLE_MAX_X = WALL_RIGHT - PLAYFIELD.PADDLE_W;   // right edge reaches the wall
const paddle = { x: 82, width: PLAYFIELD.PADDLE_W, enlarged: false, sticky: false };

const ball = new Ball(0);
ball.brickCheck = (b) => checkBrickHit(b, field);   // per-sub-step hook (ball.js loop)
ball.freezeSpeed = EASY;                            // ?easy -> updateSpeed() is a no-op

// Spawn (and respawn) the ball glued on the paddle. reset() puts it at a fixed
// x=100, and the glue state machine takes ~2 frames to snap it onto the paddle
// (initGlued has no paddle reference; only followVaus sets x). Snapping here
// avoids the fresh ball flashing at mid-screen before it jumps to the paddle.
function spawnOnPaddle() {
  ball.reset();
  ball.x = paddle.x + ball.vausHitX;   // vausHitX = 26 after reset (ACTION_INITIALIZE_GLUED_BALL)
}
spawnOnPaddle();

const keys = { left: false, right: false, fire: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  else if (e.key === ' ') { keys.fire = true; e.preventDefault(); }
  // ?debug loop control: P toggles pause; '.' frame-advances one tick (auto-pausing
  // first, the emulator convention -- hold it to crawl forward steadily).
  else if (DEBUG && (e.key === 'p' || e.key === 'P')) { paused = !paused; e.preventDefault(); }
  else if (DEBUG && e.key === '.') { paused = true; stepOnce = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false;
  else if (e.key === 'ArrowRight') keys.right = false;
  else if (e.key === ' ') keys.fire = false;
});

// ---- on-the-fly ball bitmap: the decoded 5x4 lozenge, ball colour 15 = white -
function buildBallBitmap() {
  const cv = document.createElement('canvas');
  cv.width = BALL_SPRITE.w;
  cv.height = BALL_SPRITE.h;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  for (let r = 0; r < BALL_SPRITE.h; r++)
    for (let c = 0; c < BALL_SPRITE.w; c++)
      if (BALL_SPRITE.rows[r][c]) g.fillRect(c, r, 1, 1);
  return cv;
}

// ---- render -----------------------------------------------------------------
const BG_COLOR = '#17294d';   // playfield backdrop
const COL = { paddle: '#c9d2e0', paddleTop: '#ffffff' };

// Playfield frame tiles -- the real MSX silver border (source DRAW_FRAME,
// disassembly.asm:2098-2136). The source lays these tile codes on the name table:
// the top edge on row 0 (cols 1..24) and the two side walls down cols 1 and 24
// (rows 1..23). They're blitted from the same `tiles` bitmaps as the bricks (codes
// 2..13). Char cell = 8px, so name-table col c -> pixel x = c*8.
const FRAME_UP  = [2, 12, 12, 12, 8, 9, 10, 11, 12, 12, 12, 12,
                   12, 12, 12, 12, 8, 9, 10, 11, 12, 12, 12, 13];   // FRAME_UP_CHARS
const FRAME_LAT = [3, 4, 5, 6, 7, 3, 4, 5, 6, 7, 3, 4, 5,
                   6, 7, 3, 4, 5, 6, 7, 3, 4, 5];                    // FRAME_LATERAL_CHARS

// ---- debug overlay (?debug): ball-state HUD + collision-cell overlay ---------
// Pure observation -- reads existing ball/field state, never mutates it. The HUD is
// a fixed-width text panel (every field padded to its domain max, per the repo HUD
// rule, so the text never jitters); the in-canvas overlay highlights the exact grid
// cell checkBrickHit is classifying, which is what the tunnel debugging needed.
const padN = (v, w) => String(v).padStart(w);   // right-align numbers
const padW = (v, w) => String(v).padEnd(w);      // left-align words
const GLUE_NAME = ['init', 'glued', 'moving'];

const hud = DEBUG ? (() => {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:8px;left:8px;z-index:10;white-space:pre;pointer-events:none;' +
    'font:12px/1.4 ui-monospace,Consolas,monospace;color:#8fe3c8;' +
    'background:rgba(10,12,20,.85);border:1px solid #2a3a44;border-radius:4px;padding:6px 9px;';
  document.body.appendChild(el);
  return el;
})() : null;

// The collision's own contact-cell math -- a mirror of brick_collision.js (OFF = UP 24 /
// DOWN 19 / RIGHT 12 / LEFT 17, then (pos - offset) >> {3 rows | 4 cols}). Kept here so
// the overlay marks EXACTLY the cell checkBrickHit tests; update alongside brick_collision.
function contactCells(b) {
  const yOff = b.ySpeed < 0 ? 24 : 19, xOff = b.xSpeed < 0 ? 17 : 12;
  const pyp = (b.y - b.ySpeed) & 0xFF, pxp = (b.x - b.xSpeed) & 0xFF;
  return {
    currY: ((b.y - yOff) & 0xFF) >> 3, currX: ((b.x - xOff) & 0xFF) >> 4,
    prevY: ((pyp - yOff) & 0xFF) >> 3, prevX: ((pxp - xOff) & 0xFF) >> 4,
  };
}

function updateHud() {
  const b = ball;
  const moving = b.glue === 2 && b.xSpeed !== 0 && b.ySpeed !== 0;
  const cc = moving ? contactCells(b) : null;
  const cellLine = cc
    ? `curr(${padN(cc.currY, 2)},${padN(cc.currX, 2)}) prev(${padN(cc.prevY, 2)},${padN(cc.prevX, 2)})`
    : padW('(glued)', 23);
  hud.textContent = [
    paused ? '[PAUSED]   . step   P resume' : '[running]  P pause   . step',
    `lvl ${padN(LEVEL + 1, 2)}   ${padW(GLUE_NAME[b.glue], 6)}  easy ${padW(EASY ? 'on' : 'off', 3)}`,
    `skew ${padN(b.skewness, 2)}  speedPos ${padN(b.speedPos, 2)}  mult ${b.speedMultiplier} target ${padN(b.moveTarget, 2)}`,
    `spd x${padN(b.xSpeed, 2)} y${padN(b.ySpeed, 2)}   pos x${padN(Math.round(b.x), 3)} y${padN(Math.round(b.y), 3)}`,
    `${cellLine}  bounces ${padN(b.bounceCounter, 2)}`,
  ].join('\n');
}

// Faint grid lattice over the brick region + a highlight of the prev/curr contact
// cells: prev = blue, curr = red if it holds a brick (a hit is imminent) / green if
// empty. The ball sprite sits over its own draw position while the highlighted cell
// is offset by the collision's contact offsets -- exactly the relationship to watch.
function drawDebugCells() {
  const tl = field.cellRect(0, 0), br = field.cellRect(field.rows - 1, field.cols - 1);
  const x0 = tl.x, y0 = tl.y, x1 = br.x + br.w, y1 = br.y + br.h;
  ctx.save();
  ctx.strokeStyle = 'rgba(150,180,255,0.16)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let c = 0; c <= field.cols; c++) { const x = x0 + c * 16 + 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let r = 0; r <= field.rows; r++) { const y = y0 + r * 8 + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();

  if (ball.glue === 2 && ball.xSpeed !== 0 && ball.ySpeed !== 0) {
    const cc = contactCells(ball);
    const fill = (r, c, style) => {
      if (!field.inBounds(r, c)) return;
      const { x, y, w, h } = field.cellRect(r, c);
      ctx.fillStyle = style; ctx.fillRect(x, y, w, h);
    };
    fill(cc.prevY, cc.prevX, 'rgba(120,160,255,0.22)');
    const solid = field.brickExistsAt(cc.currY, cc.currX);
    fill(cc.currY, cc.currX, solid ? 'rgba(255,90,90,0.40)' : 'rgba(90,255,200,0.30)');
    if (field.inBounds(cc.currY, cc.currX)) {
      const { x, y, w, h } = field.cellRect(cc.currY, cc.currX);
      ctx.strokeStyle = solid ? '#ff5a5a' : '#5affc8'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }
  ctx.restore();
}

function render() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // bricks: draw only cells that still hold a brick (broken ones are removed from the
  // field), coloured by the grid tile. render <-> collision agree via the field geometry.
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      if (!field.brickExistsAt(r, c)) continue;
      const { x, y, w, h } = field.cellRect(r, c);
      drawBrick(ctx, tiles, ctp, grid[r][c], x, y, w, h);
    }
  }

  // playfield frame: the real MSX wall tiles (source DRAW_FRAME) drawn on top --
  // top edge on row 0 (cols 1..24), then the left/right walls down cols 1 and 24
  // (rows 1..23). Bricks live in cols 2..23 and the walls in cols 1/24, so they
  // never overlap; the ball's bounce lines (x<18 / x>=186, y<9) sit a couple px
  // inside the wall faces -- the same faithful sprite-margin geometry as the paddle.
  for (let i = 0; i < FRAME_UP.length; i++)
    ctx.drawImage(tiles[FRAME_UP[i]], (1 + i) * 8, 0);           // top edge, cols 1..24
  for (let j = 0; j < FRAME_LAT.length; j++) {
    ctx.drawImage(tiles[FRAME_LAT[j]], 1 * 8, (1 + j) * 8);      // left wall  (col 1)
    ctx.drawImage(tiles[FRAME_LAT[j]], 24 * 8, (1 + j) * 8);     // right wall (col 24)
  }

  // paddle: a rounded bar with a top sheen
  ctx.fillStyle = COL.paddle;
  ctx.beginPath();
  ctx.roundRect(paddle.x, PADDLE_Y, paddle.width, PADDLE_H, PADDLE_H / 2);
  ctx.fill();
  ctx.fillStyle = COL.paddleTop;
  ctx.fillRect(paddle.x + 3, PADDLE_Y + 1, paddle.width - 6, 1);

  // ball
  ctx.drawImage(ballBmp, ball.x, ball.y);

  if (DEBUG) { drawDebugCells(); updateHud(); }   // ?debug overlay, drawn last
}

// ---- fixed 60 Hz loop (source runs one step per VBLANK) ---------------------
const TICK = 1000 / 60;
let acc = 0, last = performance.now();

function tick() {
  // paddle: arrow input replaces the MSX control read; bar clamped to the walls.
  if (keys.left) paddle.x -= PADDLE_SPEED;
  if (keys.right) paddle.x += PADDLE_SPEED;
  if (paddle.x < PLAYFIELD.LEFT) paddle.x = PLAYFIELD.LEFT;
  if (paddle.x > PADDLE_MAX_X) paddle.x = PADDLE_MAX_X;

  ball.step(paddle, keys.fire);
  // Respawn only once the ball has fully fallen off the bottom of the screen --
  // not at the source's y>=184 "lost" line, which sits just below the paddle.
  if (ball.y >= VIEW_H) spawnOnPaddle();
}

function frame(now) {
  const dt = Math.min(now - last, TICK * 5); last = now;
  if (paused) {
    // ?debug: hold the sim frozen; '.' advances exactly one tick. Clear acc so
    // resuming doesn't fast-forward a backlog built up while stepping.
    if (stepOnce) { tick(); stepOnce = false; }
    acc = 0;
  } else {
    // Clamp the delta: a hidden tab pauses rAF, so on return `now - last` would be
    // huge and fast-forward the ball through a backlog. Cap to a few ticks.
    acc += dt;
    let guard = 0;
    while (acc >= TICK && guard++ < 8) { tick(); acc -= TICK; }
  }
  render();
  requestAnimationFrame(frame);
}

// ---- headless self-test (selected level): containment + bricks actually break
// Fire a private ball into a private copy of the REAL level field for 3000 frames
// with a paddle that tracks it. Assert it never escapes the walls (x in [15, 189],
// the faithful border-poke bound, ball_blocks §9) AND that some bricks broke. Live
// state untouched.
function selfTest() {
  const f = new BrickField();
  let initial = 0;
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++) {
      const kind = actions[r][c];
      if (kind === CELL.EMPTY) continue;
      f.set(r, c, kind);
      if (kind === CELL.HARD) f.setHardHits(r, c, HARD_HITS);
      initial++;
    }
  const b = new Ball(0);
  b.brickCheck = (bb) => checkBrickHit(bb, f);
  const pad = { x: 82, width: PLAYFIELD.PADDLE_W, enlarged: false, sticky: false };
  let escapes = 0;
  for (let i = 0; i < 3000; i++) {
    pad.x = Math.max(PLAYFIELD.LEFT, Math.min(PADDLE_MAX_X, Math.round(b.x) - 18));
    b.step(pad, b.glue === 1);            // launch immediately whenever (re)glued
    if (b.x < 15 || b.x > 189) escapes++;
  }
  let remaining = 0;
  for (let r = 0; r < f.rows; r++)
    for (let c = 0; c < f.cols; c++) if (f.brickExistsAt(r, c)) remaining++;
  resetBrickEffectState();                // leave the shared brick counter clean
  const ok = escapes === 0 && remaining < initial;
  console.log(`[game] level-${LEVEL + 1} self-test ${ok ? 'PASS' : 'FAIL'} ` +
              `(escapes=${escapes}, bricks ${initial}->${remaining})`);
  return ok;
}
selfTest();

render();                        // paint the first frame immediately (before rAF starts)
requestAnimationFrame(frame);
