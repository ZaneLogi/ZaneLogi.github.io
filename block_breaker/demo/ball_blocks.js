// ball_blocks.js -- demo: a ball fired inside a box built from 3 real walls
// (top/left/right) + a bottom row of indestructible bricks, bouncing off a
// curated set of interior indestructible blocks via the faithful brick collision.
//
// Grows with the port (docs/research_brick_collision.md):
//   S1 (now): STATIC render of the box + ball, to see the geometry. No motion or
//             collision yet -- those arrive with brick_collision.js at S2-S6, and
//             the launch loop + selfTest at S7.
//
// Uses: BrickField geometry (../src/brick_field.js), the decoded ball lozenge
// (../src/ball_sprite.js), and the shared playfield constants (../src/ball.js).

import { Ball, PLAYFIELD } from '../src/ball.js';
import { BrickField, BRICK, CELL } from '../src/brick_field.js';
import { BALL_SPRITE } from '../src/ball_sprite.js';
import { checkBrickHit, resetBrickEffectState } from '../src/brick_collision.js';
import { LEVELS } from '../assets/dat_levels.js';

const SCALE = 3;
const VIEW_W = 208;   // native px; symmetric 18px wall margins (walls at 18 / 190)
const VIEW_H = 124;   // cropped to the box (bricks top out ~row 11 = y115)
const WALL_RIGHT = PLAYFIELD.RIGHT_CLAMP + BALL_SPRITE.w; // 190 (ball is 5 wide)

const canvas = document.getElementById('view');
canvas.width = VIEW_W * SCALE;
canvas.height = VIEW_H * SCALE;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.scale(SCALE, SCALE);

// ---- curated layout: bottom brick floor + a few interior blocks -------------
const field = new BrickField();
field.fillRow(BRICK.ROWS - 1, CELL.UNBREAKABLE);   // row 11 floor, cols 0..10
[[4, 5], [5, 3], [5, 7], [6, 5]].forEach(([r, c]) => field.set(r, c, CELL.UNBREAKABLE));

// a real Ball launched inside the box, moving up-right; brick collision is wired
// via ball.brickCheck (the ball.js multiplier-loop hook). No paddle -- the brick
// floor keeps the ball above the paddle band, so a dummy paddle never matches.
const ball = new Ball(0);
const dummyPaddle = { x: -100, width: PLAYFIELD.PADDLE_W, enlarged: false, sticky: false };
ball.brickCheck = (b) => checkBrickHit(b, field);
function launch() {
  ball.glue = 2; ball.x = 100; ball.y = 92;
  ball.ySpeed = -1; ball.xSpeed = 1; ball.skewness = 1; ball.speedPos = 12;
}
launch();

// ---- rendering --------------------------------------------------------------
const COL = {
  bg: '#0d0f17',
  wall: '#3a3f52', wallEdge: '#565d76',
  brick: '#e0563a', brickEdge: '#ff8a6a',
  ball: '#ffe14d',
};

function drawBall(bx, by) {
  ctx.fillStyle = COL.ball;
  for (let r = 0; r < BALL_SPRITE.h; r++)
    for (let c = 0; c < BALL_SPRITE.w; c++)
      if (BALL_SPRITE.rows[r][c]) ctx.fillRect(bx + c, by + r, 1, 1);
}

function render() {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // walls (A): thin bright lines at the bounce faces -- top (y<9), left (x<18),
  // right (x>=190) -- dark field elsewhere. Positions provisional pending S2.
  ctx.fillStyle = COL.wallEdge;
  ctx.fillRect(0, PLAYFIELD.TOP - 2, VIEW_W, 2);        // ceiling face @ y=9
  ctx.fillRect(PLAYFIELD.LEFT - 2, 0, 2, VIEW_H);       // left face @ x=18
  ctx.fillRect(WALL_RIGHT, 0, 2, VIEW_H);               // right face @ x=190

  // bricks, drawn from cellRect so they sit where collision will expect them
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      if (!field.brickExistsAt(r, c)) continue;
      const { x, y, w, h } = field.cellRect(r, c);
      ctx.fillStyle = COL.brick;
      ctx.fillRect(x, y, w - 1, h - 1);          // 1px gap = brick mortar
      ctx.fillStyle = COL.brickEdge;
      ctx.fillRect(x, y, w - 1, 1);
    }
  }

  drawBall(ball.x, ball.y);
}

// ---- 60 Hz loop: launch + bounce (walls via ball.js, bricks via brickCheck) --
// Until S4, brick CORNERS (diagonal cell crossings) aren't bounced; a corner clip
// self-corrects within a step or two, and an outright escape respawns as a safety.
const TICK = 1000 / 60;
let acc = 0, last = performance.now();
function tick() {
  if (ball.step(dummyPaddle, false)) launch();   // lost/escaped -> respawn (S4 gap)
}
function frame(now) {
  // Clamp the delta: while the tab is hidden the browser pauses rAF, so on return
  // `now - last` would be huge and fast-forward the ball through a backlog. Cap it
  // to a few ticks so a hidden tab / lag spike just resumes smoothly.
  acc += Math.min(now - last, TICK * 5); last = now;
  let guard = 0;
  while (acc >= TICK && guard++ < 8) { tick(); acc -= TICK; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- headless containment scan ----------------------------------------------
// A private copy of the demo layout (floor row + interior blocks), a ball fired into
// it, run for 5000 frames through the real Ball.step + brickCheck. Returns how many
// frames the ball was outside the box or lost. `fast` starts it at speedPos 15 so the
// multiplier loop takes several sub-steps per frame (the anti-tunneling stress case).
function boxScan(fast) {
  const f = new BrickField();
  f.fillRow(BRICK.ROWS - 1, CELL.UNBREAKABLE);
  [[4, 5], [5, 3], [5, 7], [6, 5]].forEach(([r, c]) => f.set(r, c, CELL.UNBREAKABLE));
  const b = new Ball(0);
  b.brickCheck = (bb) => checkBrickHit(bb, f);
  b.glue = 2; b.x = 100; b.y = 92; b.ySpeed = -1; b.xSpeed = 1; b.skewness = 1;
  if (fast) b.speedPos = 15;
  const pad = { x: -100, width: PLAYFIELD.PADDLE_W, enlarged: false, sticky: false };
  let escapes = 0, lost = 0;
  for (let i = 0; i < 5000; i++) {
    if (b.step(pad, false)) lost++;
    // Faithful bounds x in [15, 189]: a border special (la2dfh) horizontal-bounces
    // WITHOUT snapping, so for the single frame it fires the ball can sit up to ~3px
    // past the wall face (18 -> 15 left, 186 -> 189 right) before the flipped xSpeed
    // carries it back. The snap that would have prevented this is COMPUTE_PRECISE_HIT_
    // POINT, whose writes are a dead vestige (see brick_collision.js borderBody). y is
    // held above the lost line by the brick floor -- it must never reach it.
    if (b.x < 15 || b.x > 189 || b.y >= PLAYFIELD.LOST_Y) escapes++;
  }
  return { escapes, lost };
}

// ---- anti-tunnel scan over the REAL levels (research_brick_collision.md §5d) --
// The box-scan above is a fully-enclosed box: a WRONG-axis corner bounce there still
// keeps the ball contained, so it cannot surface a tunnel. Real levels have stacked-
// brick pockets (e.g. level 8's (2,8)H / (1,9)U / (2,9)H) where a mis-resolved corner
// lets the ball drift sideways THROUGH a brick. This is the case that caught the two
// ambiguous-corner divergences (dropped la0b4h fallback; inverted moving-right carry):
// fire a paddle-tracked, accelerated ball into every level from a sweep of launch
// angles and flag any frame whose ball centre is buried >=2px inside a solid brick.
// Returns the number of runs that tunnelled (must be 0). NB: a plain "did it bounce?"
// corner assertion does NOT catch this -- the bounce happens, just on the wrong axis.
function levelTunnelScan() {
  const PADDLE_MAX_X = 190 - PLAYFIELD.PADDLE_W;
  const buried = (b, f) => {
    const cx = b.x + 2, cy = b.y + 2;
    const col = Math.floor((cx - BRICK.ORIGIN_X) / BRICK.CELL_W);
    const row = Math.floor((cy - BRICK.ORIGIN_Y) / BRICK.CELL_H);
    if (!f.inBounds(row, col) || !f.brickExistsAt(row, col)) return false;
    const rc = f.cellRect(row, col);
    return cx > rc.x + 2 && cx < rc.x + rc.w - 2 && cy > rc.y + 2 && cy < rc.y + rc.h - 2;
  };
  let tunnels = 0;
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const actions = LEVELS[lv].actions, hardHits = (lv >> 3) + 2;
    for (const sx of [30, 60, 90, 120, 150, 180]) {
      for (const sk of [1, 3, -3, 4, -4, 7, -7]) {
        const f = new BrickField();
        for (let r = 0; r < actions.length; r++)
          for (let c = 0; c < actions[r].length; c++) {
            const k = actions[r][c];
            if (k === CELL.EMPTY) continue;
            f.set(r, c, k);
            if (k === CELL.HARD) f.setHardHits(r, c, hardHits);
          }
        resetBrickEffectState();
        const b = new Ball(0);
        b.glue = 2; b.x = sx; b.y = 150; b.ySpeed = -1; b.xSpeed = sk < 0 ? -1 : 1;
        b.skewness = sk; b.speedPos = 15;              // accelerated: multi sub-step frames
        b.brickCheck = (bb) => checkBrickHit(bb, f);
        const pad = { x: 82, width: PLAYFIELD.PADDLE_W, enlarged: false, sticky: false };
        for (let i = 0; i < 800; i++) {
          pad.x = Math.max(PLAYFIELD.LEFT, Math.min(PADDLE_MAX_X, Math.round(b.x) - 18));
          b.step(pad, false);
          if (buried(b, f)) { tunnels++; break; }      // one flag per run is enough
        }
      }
    }
  }
  resetBrickEffectState();
  return tunnels;
}

// ---- self-test: brick collision, all four directions -----------------------
// Hand-placed cells + a ball with a chosen (pos, speed) so the collision routine
// classifies a specific crossing, then assert it bounced the right axis.
function selfTest() {
  const lines = [];
  let ok = true;
  const t = (name, cond) => { ok = ok && cond; lines.push(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
  const mkBall = (x, y, ys, xs) => {
    const b = new Ball(0);
    b.glue = 2; b.x = x; b.y = y; b.ySpeed = ys; b.xSpeed = xs; b.skewness = 1;
    return b;
  };

  const brickAt = (r, c) => { const f = new BrickField(); f.set(r, c, CELL.UNBREAKABLE); return f; };

  // vertical-face bounce (Y flip) for each of the four diagonal directions
  { const b = mkBall(100, 71, -1,  1);   // up-right,   into brick (5,5)
    t('up-right   vertical-face',   checkBrickHit(b, brickAt(5, 5)) && b.ySpeed ===  1); }
  { const b = mkBall(105, 71, -1, -1);   // up-left,    into brick (5,5)
    t('up-left    vertical-face',   checkBrickHit(b, brickAt(5, 5)) && b.ySpeed ===  1); }
  { const b = mkBall(100, 67,  1,  1);   // down-right, into brick (6,5)
    t('down-right vertical-face',   checkBrickHit(b, brickAt(6, 5)) && b.ySpeed === -1); }
  { const b = mkBall( 96, 72,  1, -1);   // down-left horizontal (X flip), brick (6,4)
    t('down-left  horizontal-face', checkBrickHit(b, brickAt(6, 4)) && b.xSpeed ===  1); }

  // horizontal-face bounce (X flip), up-right, into brick (5,5)
  { const b = mkBall(92, 68, -1, 1);
    t('up-right   horizontal-face', checkBrickHit(b, brickAt(5, 5)) && b.xSpeed === -1); }

  // ambiguous corner (up-right, prev(6,4) -> curr(5,5)): RESOLVE_CORNER must bounce
  { const f = new BrickField();
    [[5, 4], [6, 5], [5, 5]].forEach(([r, c]) => f.set(r, c, CELL.UNBREAKABLE));
    const b = mkBall(92, 71, -1, 1);
    t('up-right   corner bounces',
      checkBrickHit(b, f) === true && (b.ySpeed !== -1 || b.xSpeed !== 1)); }
  { const b = mkBall(92, 71, -1, 1);
    t('empty corner -> no hit', checkBrickHit(b, new BrickField()) === false); }

  // double impact -- up: ball enters the bottom row (11) from below (prevY=12)
  { const f = new BrickField(); f.set(11, 5, CELL.UNBREAKABLE);
    const b = mkBall(100, 119, -1, 1);
    t('up   double-impact bounces',
      checkBrickHit(b, f) === true && (b.ySpeed !== -1 || b.xSpeed !== 1)); }
  // double impact -- down: ball enters the top row (0) from above (prevY=31 wrap)
  { const f = new BrickField(); f.set(0, 5, CELL.UNBREAKABLE);
    const b = mkBall(100, 19, 1, 1);
    t('down double-impact bounces',
      checkBrickHit(b, f) === true && (b.ySpeed !== 1 || b.xSpeed !== 1)); }

  // no brick present -> no hit, speed unchanged
  { const b = mkBall(100, 71, -1, 1);
    t('no brick -> no hit', checkBrickHit(b, new BrickField()) === false && b.ySpeed === -1); }

  // ---- S5b: wall-adjacent border specials --------------------------------------
  // Right border, wall-adjacent brick (la2eeh): down-right at the right wall
  // (CURR_BRICK_X=11, PREV_BRICK_X=10), crossing into row 6 where a col-10 brick sits.
  // COMPUTE_WALL_ADJACENT_HIT_POINT -> carry -> vertical bounce off the brick, snapped.
  { const f = new BrickField(); f.set(6, 10, CELL.UNBREAKABLE);
    const b = mkBall(188, 67, 1, 1);
    const hit = checkBrickHit(b, f);
    t('right-border wall-adjacent brick', hit === true && b.ySpeed === -1 && b.x >= 16 && b.x < 186); }
  // Right border, empty / same-row (la2dfh): horizontal (wall) bounce, no brick needed.
  { const b = mkBall(188, 71, 1, 1);
    const hit = checkBrickHit(b, new BrickField());
    t('right-border wall horizontal', hit === true && b.xSpeed === -1 && b.ySpeed === 1); }
  // Left border, wall-adjacent brick (rare-case dispatch -> la2eeh): down-left at the
  // left wall (CURR_BRICK_X=15 from the wrapped x-17, PREV_BRICK_X=0), col-0 brick.
  { const f = new BrickField(); f.set(6, 0, CELL.UNBREAKABLE);
    const b = mkBall(16, 67, 1, -1); b.skewness = 3;   // skew 3 keeps the reconstructed X in-bounds
    const hit = checkBrickHit(b, f);
    t('left-border wall-adjacent brick', hit === true && b.ySpeed === -1 && b.x >= 16 && b.x < 186); }
  // Left border, empty / same-row (la2dfh): horizontal (wall) bounce.
  { const b = mkBall(16, 71, 1, -1);
    const hit = checkBrickHit(b, new BrickField());
    t('left-border wall horizontal', hit === true && b.xSpeed === 1 && b.ySpeed === 1); }

  // ---- S6: the 20-hit unbreakable skewness perturbation ------------------------
  // action_unbreakable_brick_hit bumps a shared counter every hit; every 20th calls
  // CHANGE_BALLS_SKEWNESS. The bounce itself already changes skewness (a DIFFERENT
  // transform), so spy on ball.changeSkewness to isolate the perturbation: reset the
  // counter, re-arm the same unbreakable hit 40 times -> exactly 2 perturbs (hit 20, 40).
  { resetBrickEffectState();
    const f = brickAt(5, 5);
    const b = mkBall(100, 71, -1, 1);
    let perturbs = 0;
    const realChange = b.changeSkewness.bind(b);
    b.changeSkewness = () => { perturbs++; realChange(); };
    for (let i = 0; i < 40; i++) {
      b.x = 100; b.y = 71; b.ySpeed = -1; b.xSpeed = 1; b.skewness = 1;   // re-arm the hit
      checkBrickHit(b, f);
    }
    t('unbreakable 20-hit skewness perturb (2 over 40)', perturbs === 2);
    resetBrickEffectState(); }   // leave the shared counter clean for the box-scan

  // ---- S5b: contained-box scan (research_brick_collision.md §9) -----------------
  // Fire the ball into the curated layout for 5000 frames; assert it never escapes the
  // 3 walls + brick floor and never reaches the lost line. Run a fast ball (speedPos
  // 15) too, so the fast-ball anti-tunneling payoff is exercised.
  const scan = boxScan(false), scanFast = boxScan(true);
  t('box-scan normal contained', scan.escapes === 0 && scan.lost === 0);
  t('box-scan fast contained',   scanFast.escapes === 0 && scanFast.lost === 0);

  // Anti-tunnel over all 32 real levels (§5d) -- the defining case the box-scan misses.
  t('no tunnel over all 32 levels', levelTunnelScan() === 0);

  const verdict = ok ? 'S6 VERIFY: PASS' : 'S6 VERIFY: FAIL';
  lines.push(verdict);
  console.log(lines.join('\n'));
  document.title = verdict;
  const note = document.querySelector('.note');
  if (note) note.textContent = lines.join('  •  ');
  return ok;
}

selfTest();
