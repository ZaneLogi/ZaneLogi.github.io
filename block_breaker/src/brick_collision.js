// brick_collision.js -- faithful port of CHECK_BRICK_HIT_AND_BOUNCE_BALL
// (arkanoid_msx_disasm/check_brick_hit_and_bounce_ball.asm). The ball <-> brick
// collision: given the ball's move, decide which brick face (top/bottom/side) or
// corner was hit, snap the ball flush, and bounce.
//
// Built incrementally per docs/research_brick_collision.md:
//   S1: extracted data tables.
//   S2: the up-right direction block (faces only).
//   S3: the other three directions. The source has four
//       near-duplicated blocks -- up-right (@9c41), up-left (@9ddd),
//       down-right (@9f6b), down-left (@a102). They share the prev->curr
//       crossing classification, so they port as ONE direction-parameterized
//       function -- but they are NOT "identical face logic" (an earlier claim,
//       now retracted): the ambiguous-corner path differs by X-direction, and
//       two right-vs-left divergences were later found, each of which let a ball
//       tunnel through a brick. Both fixed; see docs/research_brick_collision.md
//       §5d: (1) the dropped la0b4h horizontal fallback (carry-set branch), and
//       (2) an inverted carry decision in resolveCorner's moving-right branch.
//   S4:  corner precise-snap (RESOLVE_CORNER_COLLISION + TICKS_TO_HIT).
//   S5a: double-impact (CHECK_VERTICAL_DOUBLE_IMPACT).
//   S5b: the wall-adjacent border specials --
//       CHECK_BALL_REACHES_RIGHT_BORDER / CHECK_RARE_OR_IMPOSSIBLE_CASE and their
//       shared body, plus COMPUTE_WALL_ADJACENT_HIT_POINT, wired into checkBrickHit
//       before the face classification. (COMPUTE_PRECISE_HIT_POINT is a source
//       vestige -- see borderBody -- so it is not ported; only its bounce is.)
//   S6: APPLY_BRICK_HIT_EFFECT (@aa05) + action_unbreakable_brick_hit
//       (@aaa4). The ball.js per-sub-step hook was already in place from S5; S6 fills
//       in the effect that runs after each brick bounce: accelerate + the 20-hit
//       skewness perturbation. The demo's blocks are all UNBREAKABLE, so only that one
//       action-table entry is ported (the others arrive with the full game).
//
// The bounce primitives are ball.js's (verticalBounce / horizontalBounce) and the
// acceleration is ball.updateSpeed() -- APPLY_BRICK_HIT_EFFECT's first act (@aa05).

// CELL type constants, for APPLY_BRICK_HIT_EFFECT's per-type dispatch. brick_field.js
// imports nothing from here, so this stays a clean DAG (no circular import).
import { CELL } from './brick_field.js';

// TBL_SPEED_FROM_SKEWNESS @a86c (check_brick_hit_and_bounce_ball.asm:2016) --
// the AUXILIARY slope (X_SLOPE, Y_SLOPE) per |skewness|, indexed 2*(|skewness|-1).
// Y is always negative in the table; the routine flips the signs from the ball's
// Y_SPEED at read time. Used only by the sub-step boundary interpolation
// (TICKS_TO_HIT, S4) that pins the exact impact pixel / disambiguates corners.
//
// NOTE: DISTINCT from ball.js's movement SKEWNESS_*_TO_XY (steeper X at the
// extremes: ±4 vs the movement ±2). Do not reuse the movement table here.
export const SPEED_FROM_SKEWNESS = [
  [ 4, -1], // |skewness| = 1
  [ 2, -1], // 2
  [ 1, -1], // 3
  [ 1, -2], // 4
  [-1, -2], // 5
  [-1, -1], // 6
  [-2, -1], // 7
  [-4, -1], // 8
];

// Contact-point offsets (check_brick_hit_and_bounce_ball.asm:57-65). The leading
// contact edge, per direction. Grid: row = (y - Yoff) >> 3 (8px tall), col =
// (x - Xoff) >> 4 (16px wide). Source arithmetic is byte-wide, so mask & 0xFF and
// LOGICAL-shift to mirror `sub`/`srl`.
const OFF = { UP: 24, DOWN: 19, RIGHT: 12, LEFT: 17 };

// CHECK_BRICK_HIT_AND_BOUNCE_BALL (@9c2d). Runs once per unit sub-step (from the
// ball's multiplier loop). Returns true if a brick was hit (a bounce happened). The
// per-hit brick effect (accelerate + 20-hit skewness) runs inside doBounce via
// APPLY_BRICK_HIT_EFFECT -- no caller hook needed.
//
// The four source blocks classify a crossing between the previous and current
// brick cell (each computed from the ball's leading edge). The cell delta is 0 or
// one step IN THE MOVEMENT DIRECTION; anything else is not a hit. Then:
//   (dRow, dCol)  ->  face          brick cell           bounce
//   (0, 0)            vertical      (prevY, currX)        Y flip
//   (0, ±1)          horizontal    (prevY, currX)        X flip
//   (±1, 0)          vertical      (currY, prevX)        Y flip
//   (±1, ±1)         ambiguous corner -> RESOLVE_CORNER (S4); no hit for now
// The horizontal/vertical FACE hits bounce without the sub-pixel snap until S4.
// The source keeps BRICK_ROW/BRICK_COL in scratch RAM, set right before each
// BRICK_EXISTS_AT_ROWCOL. CHECK_VERTICAL_DOUBLE_IMPACT reads BRICK_COL that it does
// NOT re-set at its trigger -- i.e. the value the PREVIOUS collision left. We model
// that global RAM here: `exists` records the last-queried cell; the double-impact
// reads it. Module-level = shared across balls, like the source.
let lastQueriedRow = -1, lastQueriedCol = -1;
function exists(field, row, col) {
  lastQueriedRow = row; lastQueriedCol = col;
  return field.brickExistsAt(row, col);
}

// ACTION_SKEWNESS_COUNTER (@e5ac) -- a GLOBAL counter (shared by all balls in the
// source) bumped on every unbreakable-brick hit; every 20th hit perturbs the ball
// angle. Module-level here for the same reason `lastQueriedRow/Col` is. Distinct from
// ball.js's per-instance 40-wall-bounce counter (bounceCounter).
let unbreakableHitCount = 0;

// Reset the shared brick-effect scratch (the hit counter + last-queried cell). Not a
// source routine -- a clean-slate hook for game init / deterministic tests.
export function resetBrickEffectState() {
  unbreakableHitCount = 0;
  lastQueriedRow = -1; lastQueriedCol = -1;
}

// APPLY_BRICK_HIT_EFFECT (@aa05). Runs AFTER the bounce at every brick-hit site. First
// UPDATE_BALL_SPEED (bounce-driven acceleration), then dispatch on the hit brick's type
// via TBL_BRICK_ACTIONS (@aa52). The source keys the dispatch off a per-level "unrolled"
// action table indexed by (BRICK_ROW, BRICK_COL); we substitute a direct read of the
// cell type at the just-queried cell (the BRICK_ROW/BRICK_COL globals = lastQueriedRow/
// Col, set by the `exists` right before the bounce) -- same contract, no RAM mirror
// (cf. BRICK_EXISTS_AT_ROWCOL, brick_field.js). Scope (block_breaker/CLAUDE.md): brick
// removal + hard-brick multi-hit + the gold perturb; score, level-clear, and the capsule
// spawn are deferred (capsule bricks break like normal for now).
function applyBrickHitEffect(ball, field) {
  ball.updateSpeed();                                   // UPDATE_BALL_SPEED (@aa05)
  const r = lastQueriedRow, c = lastQueriedCol;
  switch (field.get(r, c)) {
    case CELL.UNBREAKABLE:
      // action_unbreakable_brick_hit (@aaa4): every 20th hit -> CHANGE_BALLS_SKEWNESS.
      // No removal. (The BRICK_UNUSED writes + the VRAM/sound tail are dropped.)
      if (++unbreakableHitCount === 20) {
        unbreakableHitCount = 0;
        ball.changeSkewness();                          // CHANGE_BALLS_SKEWNESS (@ab38)
      }
      break;
    case CELL.HARD:
      // action_hard_brick_hit (@aac7): count down the per-cell hits; the ball already
      // bounced, so destroy the brick only once the counter reaches 0.
      if (field.decHardHits(r, c) <= 0) field.remove(r, c);
      break;
    case CELL.NORMAL:
    case CELL.CAPSULE:
      // action_brick_hit (@aaef) / _and_capsule (@aac1): remove the brick.
      field.remove(r, c);
      break;
  }
}

function doBounce(ball, field, kind) {
  if (kind === 'v') ball.verticalBounce();
  else ball.horizontalBounce();
  applyBrickHitEffect(ball, field);
  return true;
}

export function checkBrickHit(ball, field) {
  const bounce = (kind) => doBounce(ball, field, kind);

  const ys = ball.ySpeed, xs = ball.xSpeed;
  if (ys === 0 || xs === 0) return false;   // the routine only runs on diagonal moves

  // direction-dependent contact offsets + single-step directions
  const yOff = ys < 0 ? OFF.UP : OFF.DOWN;    // 24 up / 19 down
  const xOff = xs < 0 ? OFF.LEFT : OFF.RIGHT; // 17 left / 12 right
  const yDir = ys < 0 ? -1 : 1;
  const xDir = xs < 0 ? -1 : 1;

  const prevYpx = (ball.y - ys) & 0xFF;   // PREV_Y_PX (BALL_Y - Y_SPEED)
  const prevXpx = (ball.x - xs) & 0xFF;   // PREV_X_PX (BALL_X - X_SPEED)
  const currY = ((ball.y - yOff) & 0xFF) >> 3;
  const currX = ((ball.x - xOff) & 0xFF) >> 4;
  const prevY = ((prevYpx - yOff) & 0xFF) >> 3;
  const prevX = ((prevXpx - xOff) & 0xFF) >> 4;

  // Source guard order (up-right :144-233; the other three blocks mirror it):
  //   A curr-row < 12, B prev-row < 13 (UP ONLY), C prev-col < 11, then the BORDER
  //   special, then D curr-col < 11, then the double-impact trigger, then E prev-row
  //   < 12. The order matters: the border case has CURR_BRICK_X == 11 (right) / 15
  //   (left), so guard D must sit AFTER the border check -- it cannot fold into one
  //   top guard (as S1-S5a did) or the border path is never reached.
  if (currY >= 12) return false;                     // A (:145 / :413 / :639 / :831)
  if (ys < 0 && prevY >= 13) return false;           // B, up-only (:189 / :430)
  if (prevX >= 11) return false;                     // C (:211 / :441 / :665 / :857)

  // CHECK_BALL_REACHES_RIGHT_BORDER (:217/:669) / CHECK_RARE_OR_IMPOSSIBLE_CASE
  // (:444/:860). Returns true = source carry set ("handled; stop classifying").
  if (checkBorder(ball, field, { currX, prevX, currY, prevY, prevXpx, prevYpx }))
    return true;

  if (currX >= 11) return false;                     // D (:221 / :447 / :673 / :863)

  // CHECK_VERTICAL_DOUBLE_IMPACT (@a328): ball enters the field's bottom row from
  // below (up) or top row from above (down).
  if (ys < 0 ? (currY === 11 && prevY === 12) : (currY === 0 && prevY === 31))
    return checkVerticalDoubleImpact(ball, field, currY, currX, prevX);

  if (prevY >= 12) return false;   // E: up_right_main_compare / check_case_down_right gate

  // the crossing must be 0 or a single step in the movement direction
  const dRow = currY - prevY;
  const dCol = currX - prevX;
  if (dRow !== 0 && dRow !== yDir) return false;
  if (dCol !== 0 && dCol !== xDir) return false;

  const aRow = dRow === 0 ? 0 : 1, aCol = dCol === 0 ? 0 : 1;
  if (aRow === 0 && aCol === 0) {                 // same cell -> vertical face
    if (exists(field, prevY, currX)) return bounce('v');
  } else if (aRow === 0 && aCol === 1) {          // side face -> horizontal (@9d18)
    if (exists(field, prevY, currX)) { snapHorizontal(ball, prevY, currX); return bounce('h'); }
  } else if (aRow === 1 && aCol === 0) {          // top/bottom face -> vertical (@9d36)
    if (exists(field, currY, prevX)) { snapVertical(ball, currY, prevX); return bounce('v'); }
  } else if (aRow === 1 && aCol === 1) {          // diagonal -> ambiguous corner (@9d54)
    // RESOLVE_CORNER decides vertical vs horizontal; cells are (CURR_BRICK_Y, PREV_BRICK_X) etc.
    const r = resolveCorner(ball, currY, prevX);
    if (r.vertical) {                              // carry set -> vertical candidate (currY, prevX)
      if (exists(field, currY, prevX)) { ball.x = r.hitX; ball.y = r.hitY; return bounce('v'); }
      // la0b4h / up_right_no_brick (@a0b4 / @9d81): no brick at the vertical candidate ->
      // horizontal bounce off the DIAGONAL brick (currY, currX). Omitting this let a ball
      // that entered a 1-wide vertical column diagonally tunnel straight through it
      // (RESOLVE_CORNER said "vertical" but that candidate is the empty cell beside the column).
      if (exists(field, currY, currX)) { snapHorizontal(ball, currY, currX); return bounce('h'); }
    } else {                                       // carry clear -> horizontal candidate (prevY, currX)
      if (exists(field, prevY, currX)) { snapHorizontal(ball, prevY, currX); return bounce('h'); }
      if (exists(field, currY, currX)) { snapVertical(ball, currY, currX); return bounce('v'); }
    }
  }
  return false;
}

// CHECK_VERTICAL_DOUBLE_IMPACT (@a328). Reached when the ball enters the field's
// bottom row from below (up) or top row from above (down). Opens by reading the
// STALE scratch BRICK_COL the previous collision left (lastQueriedCol, see `exists`).
function checkVerticalDoubleImpact(ball, field, currY, currX, prevX) {
  const bounce = (kind) => doBounce(ball, field, kind);
  if (lastQueriedCol === currX) {                       // stale BRICK_COL == currX (@a32c)
    if (exists(field, currY, currX)) { snapVertical(ball, currY, currX); return bounce('v'); }
    return false;
  }
  // la354h: resolve via RESOLVE_CORNER against (currY, X<0 ? currX : prevX)
  const r = resolveCorner(ball, currY, ball.xSpeed < 0 ? currX : prevX);
  if (r.vertical) {                                 // carry set (@a370)
    if (exists(field, currY, prevX)) { snapVertical(ball, currY, prevX); return bounce('v'); }
    if (exists(field, currY, currX)) { snapHorizontal(ball, currY, currX); return bounce('h'); }
  } else {                                          // carry clear (@a3af)
    if (exists(field, currY, currX)) { snapVertical(ball, currY, currX); return bounce('v'); }
  }
  return false;
}

// CHECK_BALL_REACHES_RIGHT_BORDER (@a29a) / CHECK_RARE_OR_IMPOSSIBLE_CASE (@a2ad) --
// two dispatchers that share the la2bdh body. The right-moving direction blocks call
// the first (config CURR_BRICK_X==11 && PREV_BRICK_X==10 = the ball reached the right
// wall); the left-moving blocks call the second (config CURR_BRICK_X==15 &&
// PREV_BRICK_X==0 = the leading contact point x-17 wrapped past the left wall). Returns
// true when the border config matched (source carry set); false = clear_carry_and_exit,
// i.e. not a border step -- continue the normal classification.
function checkBorder(ball, field, cells) {
  const atBorder = ball.xSpeed >= 0
    ? (cells.currX === 11 && cells.prevX === 10)   // CHECK_BALL_REACHES_RIGHT_BORDER
    : (cells.currX === 15 && cells.prevX === 0);   // CHECK_RARE_OR_IMPOSSIBLE_CASE
  if (!atBorder) return false;                     // clear_carry_and_exit (@a324)
  return borderBody(ball, field, cells);
}

// la2bdh (@a2bd) -- the shared border body, once the config matched. Classify the row
// crossing and bounce. Always returns true (set_carry_and_exit): at the border config,
// the routine always "handles" the step.
//
// NOTE on COMPUTE_PRECISE_HIT_POINT (@a3d1): the Y1==Y2 branch (la2dfh) and the
// no-brick branch (@a31b) both `call COMPUTE_PRECISE_HIT_POINT` then BALL_HORIZONTAL_
// BOUNCE. But that routine only ever writes SCRATCH RAM (BRICK_HIT_{X,Y}_PIXEL,
// VAUS_X2, the slopes) -- never the ball (ix/iy) -- and NEITHER call site reads any of
// it back before returning. Its entire output is provably dead at both sites: only the
// horizontal bounce is observable. It is a vestige (cf. the disassembly README's other
// "planned but not implemented" findings -- most likely ball-position writes that were
// removed), so it is not ported; we emit just the bounce it guards.
function borderBody(ball, field, cells) {
  const ys = ball.ySpeed;

  if (cells.currY === cells.prevY) {     // Y1 == Y2 -> la2dfh: horizontal (wall) bounce
    ball.horizontalBounce();
    return true;
  }

  // Y1 != Y2: the crossing must be exactly one row in the movement direction (a byte
  // compare, so the down wrap prevY==31 -> currY==0 counts). Otherwise the source's
  // own "rare / impossible" branch (@a2d4/@a2dc): set carry, NO bounce.
  const adjacent = ys < 0 ? cells.currY === ((cells.prevY - 1) & 0xFF)   // la2d7h (up)
                          : cells.currY === ((cells.prevY + 1) & 0xFF);  // (down)
  if (!adjacent) return true;            // rare/impossible: handled, no bounce
  return borderWallAdjacent(ball, field, cells);                        // la2eeh
}

// la2eeh (@a2ee) -- adjacent-row border case: the ball is at the wall AND crossing into
// the next row. COMPUTE_WALL_ADJACENT_HIT_POINT decides whether the trajectory lands on
// the wall-adjacent brick's top/bottom face (carry -> vertical bounce off the brick,
// snapped to the computed hit pixel) or slips past into the wall (no carry -> horizontal
// wall bounce). BRICK_ROW = CURR_BRICK_Y for both the compute and the brick query.
function borderWallAdjacent(ball, field, cells) {
  const hit = computeWallAdjacentHitPoint(ball, cells.currY, cells.prevXpx, cells.prevYpx);
  if (!hit.carry) {                      // slipped past the brick -> la2dfh fallback (@a2f7)
    ball.horizontalBounce();
    return true;
  }
  // carry: face candidate -- hit the brick at (CURR_BRICK_Y, PREV_BRICK_X) if present.
  if (exists(field, cells.currY, cells.prevX)) {     // @a2fa BRICK_COL = PREV_BRICK_X
    ball.y = hit.y; ball.x = hit.x;                   // snap to BRICK_HIT_{Y,X}_PIXEL (@a306)
    return doBounce(ball, field, 'v');               // BALL_VERTICAL_BOUNCE + APPLY_BRICK_HIT_EFFECT
  }
  ball.horizontalBounce();               // no_brick_do_horizontal_bounce_set_carry (@a31b)
  return true;
}

// COMPUTE_WALL_ADJACENT_HIT_POINT (@a591). "Checks for an external collision that changes
// the ball parameters. Called after hitting the left or right walls." Same TICKS_TO_HIT
// sub-step machinery as RESOLVE_CORNER: step PREV_Y_PX along the auxiliary Y slope to the
// brick's Y edge, reconstruct X there, clamp it against the wall bound (188 right / 15
// left), and return carry = "the hit X is on the brick side (in bounds)". Returns the
// snapped { x, y } = BRICK_HIT_{X,Y}_PIXEL. Byte arithmetic; unsigned compares.
function computeWallAdjacentHitPoint(ball, row, prevXpx, prevYpx) {
  const ys = ball.ySpeed, xs = ball.xSpeed;
  const edgeA = (8 * row + (ys < 0 ? 24 : 19)) & 0xFF;   // HIY_Y_EDGE_A
  const edgeB = (edgeA + 7) & 0xFF;                        // HIY_Y_EDGE_B

  const t = SPEED_FROM_SKEWNESS[Math.abs(ball.skewness) - 1];
  let xSlope = t[0], ySlope = t[1];
  if (ys >= 0) { xSlope = -xSlope; ySlope = -ySlope; }

  // step PREV_Y_PX to the brick Y edge, counting ticks (up: until y < EDGE_B;
  // down: until y >= EDGE_A+1). The source's ++/-- on the edge byte just bumps the
  // target during the loop and restores it, so hitY uses the un-bumped edge.
  let y = prevYpx;
  const target = ys < 0 ? edgeB : (edgeA + 1) & 0xFF;
  let ticks = 0;
  for (let g = 0; g < 40; g++) { ticks++; y = (y + ySlope) & 0xFF; if (ys < 0 ? y < target : y >= target) break; }

  // reconstruct X at the crossing, then clamp against the wall + set the carry
  let B = (prevXpx + (ticks - 1) * xSlope) & 0xFF;
  let carry;
  if (xs >= 0) {                         // right wall, bound 188 (la64eh)
    if (188 < B) { B = 188; carry = false; } else carry = true;
  } else {                               // left wall, bound 15 (la64eh -> la64ah)
    if (15 < B) carry = true; else { B = 16; carry = false; }
  }
  return { carry, x: B & 0xFF, y: ys < 0 ? edgeB : edgeA };
}

// RESOLVE_CORNER_COLLISION (@a670). At an ambiguous corner, sub-step the auxiliary
// slope from the pre-step position until it crosses the brick's Y edge (counting
// TICKS_TO_HIT), reconstruct X there, and classify X against the brick's
// horizontal band. Returns { vertical, hitX, hitY }: vertical === true is the
// source's carry-set (the vertical-face interpretation wins). Source arithmetic is
// byte-wide; compares are UNSIGNED (Z80 `cp`).
function resolveCorner(ball, row, col) {
  const ys = ball.ySpeed, xs = ball.xSpeed;
  const edgeA = (8 * row + (ys < 0 ? 24 : 19)) & 0xFF;   // HIY_Y_EDGE_A
  const edgeB = (edgeA + 7) & 0xFF;                       // HIY_Y_EDGE_B

  // auxiliary slope from |skewness| (TBL_SPEED_FROM_SKEWNESS Y is always negative;
  // Y_SPEED >= 0 negates both, per the routine).
  const t = SPEED_FROM_SKEWNESS[Math.abs(ball.skewness) - 1];
  let xSlope = t[0], ySlope = t[1];
  if (ys >= 0) { xSlope = -xSlope; ySlope = -ySlope; }

  // sub-step from PREV_Y_PX to the brick Y edge, counting ticks
  let y = (ball.y - ys) & 0xFF;                           // PREV_Y_PX
  const target = ys < 0 ? edgeB : (edgeA + 1) & 0xFF;
  let ticks = 0;
  for (let guard = 0; guard < 40; guard++) {
    ticks++;
    y = (y + ySlope) & 0xFF;
    if (ys < 0 ? y < target : y >= target) break;
  }

  // reconstruct X at the crossing: PREV_X_PX + (ticks - 1) * X_SLOPE
  const B = (((ball.x - xs) & 0xFF) + (ticks - 1) * xSlope) & 0xFF;

  // classify B against the brick's horizontal band, returning `vertical` = the
  // source carry (set = vertical face wins). The two X directions are MIRROR
  // IMAGES, not identical -- the carry polarity is opposite in the outer bands
  // (source la725 moving-right vs la75eh moving-left). NB: the two middle bands
  // (base < B <= base+31) were once inverted here for moving-right, which let a
  // ball drift sideways through a brick (vertical bounce flips ys, never xs);
  // keep these matched to la725/la797h, and the left branch to la75eh/la7d7h.
  const base = (16 * col + (xs >= 0 ? 12 : 16)) & 0xFF;
  let vertical, hitX;
  if (xs >= 0) {                            // moving right (la725 / la797h)
    if (base >= B)            { vertical = true;  hitX = base; }      // B <= base
    else if (base + 31 < B)   { vertical = false; hitX = base + 31; } // B > base+31
    else if (base + 15 < B)   { vertical = false; hitX = B; }         // right half -> horizontal
    else                      { vertical = true;  hitX = B; }         // left half  -> vertical
  } else {                                  // moving left (la75eh / la7d7h)
    if (base >= B)            { vertical = false; hitX = base; }
    else if (base + 31 < B)   { vertical = true;  hitX = base + 31; }
    else if (base + 15 >= B)  { vertical = true;  hitX = B; }
    else                      { vertical = false; hitX = B; }
  }
  return { vertical, hitX: hitX & 0xFF, hitY: ys < 0 ? edgeB : edgeA };
}

// HANDLE_CORNER_CASE_VERTICAL (@a810). Precise snap for a vertical (top/bottom-face)
// bounce: sub-step to the brick's Y edge (same as resolveCorner), then set ball.y
// to that edge and clamp ball.x into the brick's X band [base, base+15].
function snapVertical(ball, row, col) {
  const ys = ball.ySpeed, xs = ball.xSpeed;
  const edgeA = (8 * row + (ys < 0 ? 24 : 19)) & 0xFF;
  const edgeB = (edgeA + 7) & 0xFF;
  const t = SPEED_FROM_SKEWNESS[Math.abs(ball.skewness) - 1];
  let xSlope = t[0], ySlope = t[1];
  if (ys >= 0) { xSlope = -xSlope; ySlope = -ySlope; }

  let y = (ball.y - ys) & 0xFF;                     // PREV_Y_PX
  const target = ys < 0 ? edgeB : (edgeA + 1) & 0xFF;
  let ticks = 0;
  for (let g = 0; g < 40; g++) { ticks++; y = (y + ySlope) & 0xFF; if (ys < 0 ? y < target : y >= target) break; }

  const X = (((ball.x - xs) & 0xFF) + (ticks - 1) * xSlope) & 0xFF;   // reconstruct X
  const base = (16 * col + (xs < 0 ? 17 : 12)) & 0xFF;
  ball.x = (base >= X ? base : (base + 15 < X ? base + 15 : X)) & 0xFF;
  ball.y = ys < 0 ? edgeB : edgeA;
}

// HANDLE_CORNER_CASE_HORIZONTAL (@a901). Precise snap for a horizontal (side-face)
// bounce: sub-step to the brick's X edge, set ball.x to that edge, and snap ball.y
// to the near edge of the brick's Y band.
function snapHorizontal(ball, row, col) {
  const ys = ball.ySpeed, xs = ball.xSpeed;
  const hitX = (16 * col + (xs < 0 ? 16 : 12)) & 0xFF;   // COMPUTED_HIT_X
  const hitXneg = (hitX + 15) & 0xFF;                    // COMPUTED_HIT_X_NEG
  const t = SPEED_FROM_SKEWNESS[Math.abs(ball.skewness) - 1];
  let xSlope = t[0], ySlope = t[1];
  if (ys >= 0) { xSlope = -xSlope; ySlope = -ySlope; }

  let x = (ball.x - xs) & 0xFF;                     // PREV_X_PX
  const target = xs < 0 ? hitXneg : (hitX + 1) & 0xFF;
  let ticks = 0;
  for (let g = 0; g < 40; g++) { ticks++; x = (x + xSlope) & 0xFF; if (xs < 0 ? x < target : x >= target) break; }

  const Y = (((ball.y - ys) & 0xFF) + (ticks - 1) * ySlope) & 0xFF;   // reconstruct Y
  const r8 = (8 * row) & 0xFF;
  ball.y = (ys >= 0 ? (r8 + 20 >= Y ? r8 + 20 : r8 + 28)
                    : (r8 + 31 < Y ? r8 + 32 : r8 + 24)) & 0xFF;
  ball.x = xs < 0 ? hitXneg : hitX;
}
