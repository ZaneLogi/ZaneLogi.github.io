// brick_field.js -- the brick grid and its pixel geometry, for ball <-> brick
// collision. A grid of cells (each holding a brick type, 0 = empty) plus the
// row/col <-> pixel mapping the collision routine works in.
//
// Faithful geometry (arkanoid_msx_disasm):
//   * bricks are 16 px wide (col = x >> 4; "a brick is 2 chars horizontally",
//     check_brick_hit_and_bounce_ball.asm:210) x 8 px tall (row = y >> 3).
//   * grid is 11 columns x 12 rows: the collision guards CURR_BRICK_X < 11
//     (`cp 11` @:221) and CURR_BRICK_Y < 12 (`cp 12` @:145) -- matching the
//     level-viewer's 11x12 decode.
//   * BRICK_EXISTS_AT_ROWCOL (disassembly.asm:8347) is a presence query over the
//     level bitmap. The source uses a bit-addressing RAM layout; we substitute a
//     plain grid lookup (same contract: row/col in -> present bit out).
//
// This module owns the STRUCTURE + geometry; a demo/level populates the cells.

export const BRICK = {
  CELL_W: 16, // px, verified (col = x >> 4)
  CELL_H: 8,  // px, verified (row = y >> 3)
  COLS: 11,   // col 0..10
  ROWS: 12,   // row 0..11

  // Field pixel origin -- top-left of cell (row 0, col 0) in the ball's coordinate
  // space. SOURCE-DERIVED (S2): DRAW_BACKGROUND_TILEMAP copies the brick tilemap to
  // VRAM name-table 0x1862 (disassembly.asm:2906); base 0x1800 -> offset 0x62 = 98
  // = char (col 2, row 3) = pixel (16, 24). Cross-checked: ORIGIN_Y=24 equals the
  // collision up-contact offset (row = (y-24)>>3), and x[16,192] is flush inside
  // the char-aligned wall borders (matches cabinet footage). Cells are 16x8.
  ORIGIN_X: 16,
  ORIGIN_Y: 24,
};

// Brick cell KIND -- the source's TBL_BRICK_ACTIONS index (disassembly.asm:7923):
//   0 normal (breakable), 1 capsule (breaks like normal; capsule spawn deferred),
//   2 hard (multi-hit), 3 unbreakable/gold (bounce only), 4 empty (no brick).
// Cells default to EMPTY; a level (dat_levels.js `actions`) or demo fills the rest.
export const CELL = {
  NORMAL: 0,
  CAPSULE: 1,
  HARD: 2,
  UNBREAKABLE: 3,
  EMPTY: 4,
};

export class BrickField {
  constructor(cols = BRICK.COLS, rows = BRICK.ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Uint8Array(cols * rows).fill(CELL.EMPTY);   // row-major kinds
    this.hardHits = new Uint8Array(cols * rows);                 // hard-brick remaining hits
  }

  inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  get(row, col) {
    return this.inBounds(row, col) ? this.cells[row * this.cols + col] : CELL.EMPTY;
  }

  set(row, col, type) {
    if (this.inBounds(row, col)) this.cells[row * this.cols + col] = type;
  }

  // BRICK_EXISTS_AT_ROWCOL (disassembly.asm:8347) -- is there a solid brick at
  // (row, col)? Out-of-bounds reads as empty (no brick), matching the collision's
  // range guards.
  brickExistsAt(row, col) {
    return this.get(row, col) !== CELL.EMPTY;
  }

  // Pixel rectangle of a cell, in the ball's coordinate space. Render bricks with
  // this so they agree with collision by construction (both use BRICK.ORIGIN_*).
  cellRect(row, col) {
    return {
      x: BRICK.ORIGIN_X + col * BRICK.CELL_W,
      y: BRICK.ORIGIN_Y + row * BRICK.CELL_H,
      w: BRICK.CELL_W,
      h: BRICK.CELL_H,
    };
  }

  // Convenience for building curated layouts (the ball_blocks box): fill the
  // outer-ring / a row / a rect with a brick type. Layout choices live in the
  // demo; these are just setters.
  fillRow(row, type, colStart = 0, colEnd = this.cols - 1) {
    for (let c = colStart; c <= colEnd; c++) this.set(row, c, type);
  }

  fillCol(col, type, rowStart = 0, rowEnd = this.rows - 1) {
    for (let r = rowStart; r <= rowEnd; r++) this.set(r, col, type);
  }

  // ---- breakable-brick mutation (the game's brick-removal side) --------------
  // Remove a brick: it becomes EMPTY, so brickExistsAt() -> false (render skips
  // it, collision ignores it). Analog of CHECK_AND_REMOVE_BRICK @abd3.
  remove(row, col) { this.set(row, col, CELL.EMPTY); }

  // Hard bricks carry a per-cell remaining-hit counter (HARD_BRICKS_REMAINING_HITS
  // @0xe039, init level/8 + 2). decHardHits returns the hits LEFT after the hit.
  setHardHits(row, col, n) {
    if (this.inBounds(row, col)) this.hardHits[row * this.cols + col] = n;
  }
  decHardHits(row, col) {
    if (!this.inBounds(row, col)) return 0;
    const i = row * this.cols + col;
    return this.hardHits[i] > 0 ? --this.hardHits[i] : 0;
  }
}
