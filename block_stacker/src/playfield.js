// playfield.js — the 10x20 cell array + collision, ported from the NES.
// The playfield is a dedicated game-state buffer (NES $0400), NOT a tilemap
// readback — see ../docs/research_gameplay.md (architecture: routine-level translation).

import { COLS, ROWS, TILE_EMPTY } from './constants.js';
import { ORIENTATIONS } from './pieces.js';

export class Playfield {
  constructor() {
    // Row-major, index = y*COLS + x (main.asm:2393-2401). Empty = TILE_EMPTY.
    this.cells = new Uint8Array(COLS * ROWS);
    this.reset();
  }

  reset() {
    this.cells.fill(TILE_EMPTY);
  }

  get(x, y) {
    return this.cells[y * COLS + x];
  }

  set(x, y, tile) {
    this.cells[y * COLS + x] = tile;
  }

  // isPositionValid — port of main.asm:2392.
  // Tests the 4 minos of `orientation` placed at (x, y). Three failure checks,
  // matching the source's net behavior (any violation -> invalid):
  //   - floor/ceiling: (dy + y + 2) >= 22           (main.asm:2417-2420)
  //   - occupancy:     playfield cell < TILE_EMPTY   (main.asm:2421-2439)
  //   - walls:         (x + dx) out of [0, COLS)     (main.asm:2440-2444; negative wraps)
  // The source reads the cell before the wall check (a negative dx wraps into the
  // prior row); we bound first to stay in-array — the outcome is identical. Rows
  // above the board (vanish zone, y+dy < 0) are treated as empty.
  isPositionValid(orientation, x, y) {
    const { cells } = ORIENTATIONS[orientation];
    for (const [dy, dx] of cells) {
      if (dy + y + 2 >= 22) return false;          // floor/ceiling
      const col = x + dx;
      if (col < 0 || col >= COLS) return false;    // walls
      const row = y + dy;
      if (row >= 0 && this.get(col, row) < TILE_EMPTY) return false; // occupancy
    }
    return true;
  }
}
