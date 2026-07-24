// lemmings/src/object_map.js
//
// The object map (design_spec Ch 4): a coarse grid of bytes, one per 4×4 pixel
// cell, answering every spatial question the terrain buffer does not — may this
// be destroyed, from which direction, does something happen to a lemming here.
// Plain data (no canvas), headless (§1.6).

// Effect codes (§4.2). Values 0..127 are trap indices; 128+ are these codes.
export const EFFECT = {
  NONE: 128,          // nothing here; the initial value of every cell
  EXIT: 129,          // a lemming here has reached the exit
  FORCE_LEFT: 130,    // turn back a lemming moving right — a blocker's left arm
  FORCE_RIGHT: 131,   // turn back a lemming moving left  — a blocker's right arm
  WATER: 133,         // a lemming here drowns
  FIRE: 134,          // a lemming here is vaporized
  ONE_WAY_LEFT: 135,  // terrain here may only be tunnelled leftward
  ONE_WAY_RIGHT: 136, // terrain here may only be tunnelled rightward
  STEEL: 137,         // terrain here may not be destroyed
  BLOCKER: 138,       // centre of a blocker's field (inert to other lemmings)
};

export const CELL = 4;          // one cell covers a 4×4 pixel square (§4.1)
export const BORDER_CELLS = 4;  // +4 cells = 16px border so negatives address (§4.1)
const COLS = 415;               // cells: world x from −16 to 1643 (§4.1)
const ROWS = 47;                // cells: world y from −16 to 171 (§4.1)

export class ObjectMap {
  constructor() {
    this.cols = COLS;
    this.rows = ROWS;
    this.cells = new Uint8Array(COLS * ROWS).fill(EFFECT.NONE);
  }

  // Floored division + fixed border (§4.1). Floor, not truncate, so negatives
  // do not fold onto the world's first column.
  _cellX(x) { return Math.floor(x / CELL) + BORDER_CELLS; }
  _cellY(y) { return Math.floor(y / CELL) + BORDER_CELLS; }

  // §4.1 — out-of-range read returns NONE (not an error, not a blocking value).
  read(x, y) {
    const cx = this._cellX(x), cy = this._cellY(y);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return EFFECT.NONE;
    return this.cells[cy * COLS + cx];
  }

  // §4.1 — out-of-range write discarded.
  write(x, y, value) {
    const cx = this._cellX(x), cy = this._cellY(y);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    this.cells[cy * COLS + cx] = value;
  }

  // Paint every cell a pixel rectangle touches with an effect/trap value — a
  // trigger region or a steel area (§4.3). The value wins over whatever was
  // there (later writes overwrite earlier, §4.3).
  paintRect(x, y, w, h, value) {
    const cx0 = Math.max(0, this._cellX(x));
    const cx1 = Math.min(COLS - 1, this._cellX(x + w - 1));
    const cy0 = Math.max(0, this._cellY(y));
    const cy1 = Math.min(ROWS - 1, this._cellY(y + h - 1));
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        this.cells[cy * COLS + cx] = value;
  }

  // World-pixel top-left of a cell (for rendering/debug).
  static cellWorldX(cx) { return (cx - BORDER_CELLS) * CELL; }
  static cellWorldY(cy) { return (cy - BORDER_CELLS) * CELL; }
}
