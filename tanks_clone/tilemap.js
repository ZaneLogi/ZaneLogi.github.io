// tilemap.js — the $0400-$07FF background buffer, as bytes.
//
// This is the RAM the ROM stages a whole nametable in: 32x30 tile ids at
// $0400-$07BF, then the 64-byte attribute table at $07C0-$07FF.
// sub_D7B4_copy_400h_to_nametable ($D7B4) ships all $400 of it to the PPU at
// $2000 or $2800, chosen by ram_offset_for_2006_hi.
//
// Absorbs the buffer PRIMITIVES, and nothing above them:
//   sub_D47E_clear_0400_07FF ($D47E)                 -> clear()
//   sub_D5FB_calculate_pointer ($D5FB)               -> index()
//   sub_D6B3_fill_buffer_with_tiles ($D6B3)          -> writeTiles()
//   sub_D71E/sub_D725 + sub_D74D/sub_D764            -> setQuadrant()
//
// SCOPE — this is deliberately NOT Field, and does not settle Field's open
// question ("is $0400 one thing or two?", map §8, deferred 2026-07-16). It is the
// part BOTH readings need: whatever Field turns out to be, the bytes need a
// representation, and the title screen needs one before Field exists. If the answer
// is "one thing", Field grows these methods; if "two things", Field holds one of
// these. Nothing here forecloses either.

export const TILEMAP_COLS = 32;
export const TILEMAP_ROWS = 30;
export const ATTR_BASE = 0x3C0;   // $07C0 - $0400

export class Tilemap {
  constructor() {
    this.bytes = new Uint8Array(0x400);   // $0400-$07FF
    // Bumped on every write. The renderer composes a tilemap into a persistent
    // canvas and only repaints when this moves — the NES does the same thing for
    // the same reason (it never redraws the background; its write buffer is a
    // dirty-block queue). Map §7 design notes.
    this.version = 0;
  }

  // sub_D47E_clear_0400_07FF ($D47E) — tiles AND attributes to $00.
  // Note $D7CC_create_default_stage_field is a DIFFERENT routine that fills $11.
  clear() { this.bytes.fill(0); this.version++; }

  // sub_D5FB_calculate_pointer ($D5FB): "formula = Y * 20 + X + 0400" — $20 = 32
  // columns. The ROM builds it with a shift/ROR chain because it has no multiply.
  static index(col, row) { return row * TILEMAP_COLS + col; }

  getTile(col, row) { return this.bytes[row * TILEMAP_COLS + col]; }

  setTile(col, row, id) {
    this.bytes[row * TILEMAP_COLS + col] = id;
    this.version++;
  }

  // sub_D6B3_fill_buffer_with_tiles ($D6B3) — a run of tile ids from (col, row).
  // The ROM's copy is $FF-terminated ($D6D0) and also queues the run into the PPU
  // write buffer; here the terminator is the array's length and the queue is the
  // version bump above.
  writeTiles(col, row, ids) {
    let i = Tilemap.index(col, row);
    for (const id of ids) this.bytes[i++] = id;
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
  setQuadrant(px, py, on) {
    const i = ((py >> 3) * TILEMAP_COLS) + (px >> 3);   // $D713 divide by 8, $D5FB
    const cur = this.bytes[i];
    if (cur & 0xF0) return;                            // $D74F / $D766 AND #$F0
    let bit = 1;                                       // $D725
    if (py & 0x04) bit <<= 2;                          //   -> $04
    if (px & 0x04) bit <<= 1;                          //   -> $02 / $08
    this.bytes[i] = on
      ? cur | bit                                      // $D76C ORA
      : cur & ~bit & 0xFF;                             // $D757 EOR #$FF + AND
    this.version++;
  }

  // The attribute table at $07C0: one byte per 32x32px area (4x4 tiles), holding
  // four 2-bit palette selectors, one per 16x16 quadrant of it. Standard PPU
  // layout — the ROM never spells it out because the hardware does the decode;
  // here we have to. sub_D80B ($D817) is what fills it during a stage.
  attribute(col, row) {
    const byte = this.bytes[ATTR_BASE + (row >> 2) * 8 + (col >> 2)];
    const shift = ((row & 0x02) << 1) | (col & 0x02);   // 0=TL 2=TR 4=BL 6=BR
    return (byte >> shift) & 0x03;
  }
}
