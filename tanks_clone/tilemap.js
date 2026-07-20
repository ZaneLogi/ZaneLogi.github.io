// tilemap.js — the screen's background data
//
//   tiles       — one tile id per 8x8 cell (32x30). The SHAPE to draw. A NES tile is
//                 four pixel *indices* (0-3), not colours, so the same brick is
//                 orange on the title and grey in a stage.
//   palettes    — one palette (0-3) per cell, 1:1 with `tiles`. The COLOUR: which of
//                 the 4 background palettes this cell uses. paletteAt() reads it.
//
// This is pure render data. `Field` (the battlefield) HAS-A `Tilemap` and adds terrain
// semantics + occupancy on top; the title / GAME OVER screens use a bare `Tilemap` with
// no `Field`.
//
// Byte PRIMITIVES only, each citing its source routine:
//   sub_D47E_clear_0400_07FF ($D47E)                 -> clear()
//   sub_D5FB_calculate_pointer ($D5FB)               -> index()
//   sub_D6B3_fill_buffer_with_tiles ($D6B3)          -> writeTiles()
//   sub_D71E/sub_D725 + sub_D74D/sub_D764            -> setQuadrant()

export const TILEMAP_COLS = 32;
export const TILEMAP_ROWS = 30;

export class Tilemap {
  constructor() {
    this.tiles    = new Uint8Array(TILEMAP_COLS * TILEMAP_ROWS);  // shape:  tile id per cell
    this.palettes = new Uint8Array(TILEMAP_COLS * TILEMAP_ROWS);  // colour: palette 0-3 per cell
    // Bumped on every write. The renderer composes a tilemap into a persistent
    // canvas and only repaints when this moves
    this.version = 0;
  }

  // sub_D47E_clear_0400_07FF ($D47E) — tiles AND palettes to $00.
  // Note $D7CC_create_default_stage_field is a DIFFERENT routine that fills $11.
  clear() { this.tiles.fill(0); this.palettes.fill(0); this.version++; }

  // sub_D5FB_calculate_pointer ($D5FB): "formula = Y * 20 + X + 0400" — $20 = 32
  // columns. The ROM builds it with a shift/ROR chain because it has no multiply.
  static index(col, row) { return row * TILEMAP_COLS + col; }

  tileAt(col, row) { return this.tiles[row * TILEMAP_COLS + col]; }

  setTile(col, row, id) {
    this.tiles[row * TILEMAP_COLS + col] = id;
    this.version++;
  }

  // sub_D6B3_fill_buffer_with_tiles ($D6B3) — a run of tile ids from (col, row).
  // The ROM's copy is $FF-terminated ($D6D0) and also queues the run into the PPU
  // write buffer; here the terminator is the array's length and the queue is the
  // version bump above.
  writeTiles(col, row, ids) {
    let i = Tilemap.index(col, row);
    for (const id of ids) this.tiles[i++] = id;
    this.version++;
  }

  // sub_D71E ($D71E) + sub_D725 ($D725) + sub_D74D/$D764 — write ONE 4x4-pixel
  // quadrant of a tile, addressed in PIXELS.
  //
  // This is the brick vocabulary, and it is the whole trick behind the huge title
  // letters. Tile ids $00-$0F are a 4-bit mask of which of a tile's four 4x4
  // quadrants are brick: $D725 turns (px & 4, py & 4) into bit 1/2/4/8 (TL/TR/BL/BR),
  // and $D764 ORs it in while $D74D ANDs it out. Cross-check the extracted data:
  // BLOCK_TILES[$4] (full brick) is [0F,0F,0F,0F] and BLOCK_TILES[$0] (brick right)
  // is [00,0F,00,0F] — same family, same encoding.
  //
  // The `& $F0` guard ($D74F / $D766) is why this is safe to scribble over a
  // populated buffer: a tile whose high nibble is set is NOT a brick tile (steel
  // $10, water $12, ice $21, forest $22...) and is left alone.
  //
  // Here is the mental model:
  // one tile = 8x8 px = 2x2 quadrants, one brick block = 2x2 tiles = 4x4 quadrants.
  // The NES PPU's atomic unit is the 8x8 tile — it cannot draw a quarter-tile.
  // So a chippable-brick game has to enumerate the 16 combinations as 16 tiles up front;
  // there's no other way to get 4x4 granularity out of hardware that only paints 8x8.
  // Then "chip a brick" costs exactly one byte: change the nametable cell from $0F to $0E,
  // and next frame the PPU redraws that one 8x8 tile showing the new shape
  // — no pixel editing.
  setQuadrant(px, py, on) {
    const i = ((py >> 3) * TILEMAP_COLS) + (px >> 3);   // $D713 divide by 8, $D5FB
    const cur = this.tiles[i];
    if (cur & 0xF0) return;                            // $D74F / $D766 AND #$F0
    let bit = 1;                                       // $D725
    if (py & 0x04) bit <<= 2;                          //   -> $04
    if (px & 0x04) bit <<= 1;                          //   -> $02 / $08
    this.tiles[i] = on
      ? cur | bit                                      // $D76C ORA
      : cur & ~bit & 0xFF;                             // $D757 EOR #$FF + AND
    this.version++;
  }

  // The palette (0-3) this cell draws with — a plain 1:1 lookup. The ROM stored this
  // as the packed attribute table at $07C0 and the hardware decoded it per 16x16
  // quadrant; here it is one value per cell, so there is nothing to unpack.
  // sub_D80B ($D817) is what fills it during a stage (via tbl_DABB, block -> palette).
  paletteAt(col, row) { return this.palettes[row * TILEMAP_COLS + col]; }

  // The writer paired with paletteAt — Field.loadStage sets each cell's palette from
  // BLOCK_ATTRIBUTE (tbl_DABB) as it draws a stage. sub_D80B ($D817).
  setPalette(col, row, pal) {
    this.palettes[row * TILEMAP_COLS + col] = pal;
    this.version++;
  }
}
