#!/usr/bin/env python3
"""extract.py -- build-time ROM data extractor for tanks_clone.

Reads the cyneprepou4uk Battle City disassembly (an EXTERNAL directory; only
derived data lands in this repo) and emits ready-to-import ES modules under
assets/. Nothing here runs at gameplay time -- the browser imports pre-baked
data, never a decoder.

    python tanks_clone/tools/extract.py [path-to-disasm]

Default disasm path: C:\\Z_Temp\\NES-Games-Disassembly\\Battle City

Emits:
    assets/dat_chr.js     CHR tiles + palettes + the block tables
    assets/dat_levels.js  the 35 stage grids (+ the attract-mode stage)
    assets/dat_text.js    the title screen's text tables
"""

import os
import re
import sys

DEFAULT_DISASM = r"C:\Z_Temp\NES-Games-Disassembly\Battle City"

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ASSETS = os.path.join(PROJECT, "assets")

# Disasm lines read:  <CDL flags> <file offset> <bank:addr>: <bytes> <instruction>
# e.g.  "- D 2 - - - 0x001565 00:D555: 0F        .byte $0F, $18, $27, $38   ;"
BYTE_LINE = re.compile(r"\b00:([0-9A-Fa-f]{4}):\s+\S+\s+\.byte\s+([^;]+)")
# A literal operand, e.g. "$0F".
HEX_BYTE = re.compile(r"^\$[0-9A-Fa-f]{1,2}$")
# A whole-operand string, e.g. `.byte "BATTLE"`. The ROM's font is ASCII-indexed --
# tile id == character code -- which is why the disassembler can write text this way
# and why `ord()` below is the correct decode, not a guess: the byte column of
# `00:D299: 42  .byte "BATTLE"` shows $42, and $42 is 'B'.
STRING_BYTES = re.compile(r'^"([^"]*)"$')


def parse_operands(text):
    """One .byte directive's operands -> [byte, ...], or None if not plain data.

    Returns None for computed expressions (`.byte $06 * $04 + $03`) so the caller
    skips the line wholesale rather than half-parsing it into a wrong-length run.
    """
    text = text.strip()
    m = STRING_BYTES.match(text)          # checked FIRST: a string may contain commas
    if m:
        out = [ord(c) for c in m.group(1)]
        if any(b > 0xFF for b in out):
            raise SystemExit(f"extract: non-8-bit character in .byte {text}")
        return out
    toks = [t.strip() for t in text.split(",")]
    toks = [t for t in toks if t]
    if not toks or not all(HEX_BYTE.match(t) for t in toks):
        return None
    return [int(t[1:], 16) for t in toks]


def parse_byte_tables(asm_path):
    """Build {cpu_addr: [byte, ...]} from the .byte directives in the bank."""
    table = {}
    with open(asm_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = BYTE_LINE.search(line)
            if not m:
                continue
            vals = parse_operands(m.group(2))
            if vals is None:
                continue
            table[int(m.group(1), 16)] = vals
    return table


def read_until_ff(table, start, limit=64):
    """Flatten bytes from `start` until the ROM's own $FF terminator (exclusive).

    This is the text tables' real length mechanism -- sub_D6B3 ($D6D0) and
    sub_D8D2 ($D8D8) both stop on $FF -- so it beats hardcoding lengths here.
    """
    out = []
    addr = start
    while len(out) <= limit:
        if addr not in table:
            raise SystemExit(f"extract: no .byte directive at ${addr:04X} "
                             f"(reading a text table from ${start:04X})")
        for b in table[addr]:
            if b == 0xFF:
                return out
            out.append(b)
        addr += len(table[addr])
    raise SystemExit(f"extract: no $FF terminator within {limit} bytes of ${start:04X}")


# --- title-screen text ($D17F draws every one of these) ----------------------
#
# Addresses are the REAL ones, taken from the address column and cross-checked
# against the operand bytes at the load sites. The disassembly's LABEL NAMES are
# not reliable here and must not be used to locate a table:
#   `tbl_D2A0_text___I_`                  actually sits at $D2A5
#   `tbl_D30F_text___1980_1985_namco_ltd` actually sits at $D2F8
# (the $D258 operand is $F8, and $D1BD's is $A5 -- the bytes settle it).
#
# Cells are the ROM's own arithmetic, e.g. $D21D/$D21F for 1 PLAYER:
#   LDX #($062B & $001F)      -> col 11
#   LDY #($062B - $0400) / $20 -> row 17
TEXT_TABLES = [
    ("I_DASH",          0xD2A5, 3,  2,  "$D1C5 -> $0462. $5E = the 'I' glyph, $6B = dash"),
    ("HI_DASH",         0xD2B1, 3,  11, "$D1E0 -> $046B"),
    ("II_DASH",         0xD2A8, 3,  21, "$D1FF -> $0475. 2P only ($D1EF tests ram_game_mode)"),
    ("ONE_PLAYER",      0xD2C6, 17, 11, "$D21D -> $062B"),
    ("TWO_PLAYERS",     0xD2CF, 19, 11, "$D22C -> $066B"),
    ("CONSTRUCTION",    0xD2EB, 21, 11, "$D23B -> $06AB"),
    ("LOGO_NAMCOT",     0xD28F, 23, 11, "$D24D -> $06EB. $60-$68, nine custom glyphs"),
    ("NAMCO_COPYRIGHT", 0xD2F8, 25, 4,  "$D25C -> $0724. $40 = the (c) glyph, $69 = dot"),
    ("ALL_RIGHTS",      0xD320, 27, 6,  "$D26E -> $0766"),
]


def read_bytes(table, start, count):
    """Flatten `count` bytes from the address-keyed .byte map, starting at `start`."""
    out = []
    addr = start
    while len(out) < count:
        if addr not in table:
            raise SystemExit(f"extract: no .byte directive at ${addr:04X} "
                             f"(needed {count} bytes from ${start:04X})")
        out.extend(table[addr])
        addr += len(table[addr])
    if len(out) != count:
        raise SystemExit(f"extract: ${start:04X} yielded {len(out)} bytes, wanted {count} "
                         "(a .byte run straddles the end)")
    return out


# --- stage decode -----------------------------------------------------------
# Verified against the disassembly + the legacy tanks/ port:
#   91 bytes = 182 nibbles = 14 cols x 13 rows, HIGH nibble first, one nibble
#   per 16x16 block. Column 13 is padding (always $D) -> 13x13 usable.
STAGE_BYTES = 91
STORED_COLS = 14
COLS = 13
ROWS = 13
EMPTY = 0xD


def decode_stage(raw, name):
    if len(raw) != STAGE_BYTES:
        raise SystemExit(f"extract: {name} is {len(raw)} bytes, expected {STAGE_BYTES}")
    nib = []
    for b in raw:
        nib.append(b >> 4)
        nib.append(b & 0x0F)
    assert len(nib) == STORED_COLS * ROWS, f"{name}: {len(nib)} nibbles"

    grid = []
    for r in range(ROWS):
        row = nib[r * STORED_COLS:(r + 1) * STORED_COLS]
        # INVARIANT: the 14th column is padding and is $D in every stage.
        if row[COLS] != EMPTY:
            raise SystemExit(f"extract: {name} row {r} pad column = "
                             f"${row[COLS]:X}, expected ${EMPTY:X}")
        # INVARIANT: only block codes $0-$D exist ($E/$F are unused in tbl_DACB).
        for c, v in enumerate(row[:COLS]):
            if v > 0xD:
                raise SystemExit(f"extract: {name} ({r},{c}) = ${v:X}, "
                                 "outside the $0-$D block-code range")
        grid.append(row[:COLS])
    return grid


def js_array(vals, per_line, indent, fmt=lambda v: str(v)):
    lines = []
    for i in range(0, len(vals), per_line):
        chunk = ", ".join(fmt(v) for v in vals[i:i + per_line])
        lines.append(" " * indent + chunk + ",")
    return "\n".join(lines)


def main():
    disasm = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DISASM
    asm = os.path.join(disasm, "bank_FF.asm")
    chr_path = os.path.join(disasm, "CHR_ROM.chr")
    stages_dir = os.path.join(disasm, "incbin", "stages")

    for p in (asm, chr_path, stages_dir):
        if not os.path.exists(p):
            raise SystemExit(f"extract: missing {p}\n"
                             f"  pass the disassembly path as argv[1] "
                             f"(default: {DEFAULT_DISASM})")

    os.makedirs(ASSETS, exist_ok=True)
    tables = parse_byte_tables(asm)

    # --- CHR ---------------------------------------------------------------
    chr_data = open(chr_path, "rb").read()
    if len(chr_data) != 8192:
        raise SystemExit(f"extract: CHR_ROM.chr is {len(chr_data)} bytes, expected 8192")

    # --- palettes ($D555 sprites, $D565 background x 9 sets) ---------------
    sprite_pal = read_bytes(tables, 0xD555, 16)          # 4 palettes x 4
    bg_pal = read_bytes(tables, 0xD565, 9 * 16)          # 9 sets x 4 palettes x 4

    # --- block tables ($DABB attribute, $DACB tiles) -----------------------
    block_attr = read_bytes(tables, 0xDABB, 16)          # code -> palette 0..3
    block_tiles = read_bytes(tables, 0xDACB, 16 * 4)     # code -> TL,TR,BL,BR tile ids

    # --- enemy palette flicker ($E003) -------------------------------------
    tank_flicker = read_bytes(tables, 0xE003, 8)         # -> sprite palette 0..3

    # --- per-stage enemy roster (35 stages x 4 type-slots) -----------------
    # tbl_E4EC ($E4EC): the TYPE BYTE for each of a stage's 4 type-slots, in spawn
    #   order (sub_E3B8 reads tbl_E4EC[(stage-1)*4 + offset]).
    # tbl_E578 ($E578): how many enemies of each type-slot spawn that stage
    #   (sub_E42B loads it into ram_enemy_type_stage_cnt; sub_E3B8 consumes it).
    # The 4 type bytes are the enemy tank types: $80 basic, $A0 fast, $C0 power,
    # $E0 armour. Each stage's four counts sum to con_enemies_per_stage (20).
    enemy_types = read_bytes(tables, 0xE4EC, 35 * 4)
    enemy_counts = read_bytes(tables, 0xE578, 35 * 4)
    ENEMY_TYPE_BYTES = {0x80, 0xA0, 0xC0, 0xE0}
    for s in range(35):
        row_t = enemy_types[s * 4:s * 4 + 4]
        row_c = enemy_counts[s * 4:s * 4 + 4]
        bad = [b for b in row_t if b not in ENEMY_TYPE_BYTES]
        if bad:
            raise SystemExit(f"extract: stage {s + 1} enemy types {['$%02X' % b for b in bad]} "
                             "not in {$80,$A0,$C0,$E0} -- wrong tbl_E4EC address?")
        if sum(row_c) != 20:
            raise SystemExit(f"extract: stage {s + 1} enemy counts {row_c} sum to "
                             f"{sum(row_c)}, expected 20 -- wrong tbl_E578 address?")

    # --- stages ------------------------------------------------------------
    names = [f"stage_{i:02d}.bin" for i in range(1, 36)] + ["stage_FF.bin"]
    grids = []
    for n in names:
        raw = open(os.path.join(stages_dir, n), "rb").read()
        grids.append(decode_stage(raw, n))

    # --- emit assets/dat_chr.js -------------------------------------------
    with open(os.path.join(ASSETS, "dat_chr.js"), "w", encoding="utf-8") as f:
        f.write(
            "// GENERATED by tools/extract.py -- do not edit by hand.\n"
            "// Source: cyneprepou4uk Battle City disassembly (external).\n"
            "\n"
            "// CHR_ROM.chr, 8192 bytes = 512 tiles x 16 (8x8, 2bpp planar:\n"
            "// bytes 0-7 = plane 0, bytes 8-15 = plane 1).\n"
            "//\n"
            "// The NMI sets $2000 = ram_base_nmt | $B0 (vec_D400_NMI, $D41F):\n"
            "//   bit 4 = 1 -> BACKGROUND pattern table at $1000 -> tiles 256..511\n"
            "//   bit 3 = 0 -> SPRITE     pattern table at $0000 -> tiles 0..255\n"
            "//   bit 5 = 1 -> 8x16 sprite mode (a 16x16 tank = 2 sprites, not 4)\n"
            "export const CHR_SPRITE_BASE = 0;\n"
            "export const CHR_BG_BASE = 256;\n"
            "export const CHR = [\n"
        )
        f.write(js_array(list(chr_data), 16, 2, lambda v: f"0x{v:02x}"))
        f.write("\n];\n\n")

        f.write("// tbl_D555_sprites_palette ($D555): 4 palettes x 4 NES color indices.\n")
        f.write("export const SPRITE_PALETTES = [\n")
        for i in range(4):
            row = sprite_pal[i * 4:(i + 1) * 4]
            f.write("  [" + ", ".join(f"0x{v:02X}" for v in row) + "],\n")
        f.write("];\n\n")

        f.write("// tbl_D565_background_palette ($D565): 9 sets (con_bg_pal_00..08),\n"
                "// each 4 palettes x 4 NES color indices. ram_bg_palette_id picks the\n"
                "// set; $FF (con_bg_pal_FF) means 'skip' (NMI $D418 BMI).\n"
                "// Sets 01/02 differ only by swapping $3C<->$12 in palette 1 -- that is\n"
                "// the water shimmer sub_C31D_water_palette_swap_handler drives.\n")
        f.write("export const BG_PALETTE_SETS = [\n")
        for s in range(9):
            f.write(f"  [ // con_bg_pal_{s:02d}\n")
            for i in range(4):
                row = bg_pal[s * 16 + i * 4:s * 16 + (i + 1) * 4]
                f.write("    [" + ", ".join(f"0x{v:02X}" for v in row) + "],\n")
            f.write("  ],\n")
        f.write("];\n\n")

        f.write("// tbl_DABB_nametable_attribute ($DABB): block code -> BG palette 0..3.\n"
                "// Read by sub_D80B_write_block_tiles_and_attribute_to_buffer ($D817).\n")
        f.write("export const BLOCK_ATTRIBUTE = [\n")
        f.write(js_array(block_attr, 16, 2))
        f.write("\n];\n\n")

        f.write("// tbl_DACB_block_data ($DACB): block code -> its 2x2 tile ids, in\n"
                "// TL, TR, BL, BR order (the write order at $D832-$D85A: +1, +$1F, +1).\n"
                "// These are BACKGROUND tile ids -> index CHR at CHR_BG_BASE + id.\n")
        f.write("export const BLOCK_TILES = [\n")
        for i in range(16):
            row = block_tiles[i * 4:(i + 1) * 4]
            f.write("  [" + ", ".join(f"0x{v:02X}" for v in row) + f"], // ${i:X}\n")
        f.write("];\n\n")

        f.write("// tbl_E003_spr_A_palette ($E003): the ENEMY tank colour flicker.\n"
                "// ofs_001_DFB6 ($DFCD-$DFDA) indexes it with\n"
                "//   (ram_frm_cnt_lo * 4 + ram_tank_type) & $07\n"
                "// so an enemy's palette changes every frame, and its ARMOUR LEVEL (which\n"
                "// lives in tank_type) shifts the phase -- that is how a damaged heavy tank\n"
                "// cycles a different colour set as it degrades. Players do NOT use this:\n"
                "// their palette is simply the slot index ($DFE8 TXA).\n")
        f.write("export const TANK_PALETTE_FLICKER = [\n")
        f.write(js_array(tank_flicker, 8, 2, lambda v: f"0x{v:02X}"))
        f.write("\n];\n")

    # --- emit assets/dat_levels.js ----------------------------------------
    with open(os.path.join(ASSETS, "dat_levels.js"), "w", encoding="utf-8") as f:
        f.write(
            "// GENERATED by tools/extract.py -- do not edit by hand.\n"
            "// Source: incbin/stages/*.bin in the cyneprepou4uk disassembly.\n"
            "//\n"
            "// Format (decoded at build time, verified against the legacy tanks/ port):\n"
            "//   91 bytes = 182 nibbles = 14 cols x 13 rows, HIGH nibble first,\n"
            "//   one nibble per 16x16 block. Column 13 is padding (always $D) and is\n"
            "//   dropped here -> grid[13][13] of block codes $0-$D.\n"
            "//   Each code indexes BLOCK_TILES / BLOCK_ATTRIBUTE (assets/dat_chr.js).\n"
            "//\n"
            "// NOT in this data: the eagle and its surrounding walls. Row 12 is empty\n"
            "// in every stage file -- the HQ is painted by code ($C331 / $E2A9). [?]\n"
            "//\n"
            "// Geometry (STAGE_COLS/STAGE_ROWS/BLOCK_PX) is NOT re-exported here --\n"
            "// constants.js is its one home. It is asserted at build time instead.\n"
            "\n"
            "// LEVELS[0..34] = stages 1..35.\n"
            "export const LEVELS = [\n"
        )
        for i, g in enumerate(grids[:35]):
            f.write(f"  [ // stage {i + 1}\n")
            for row in g:
                f.write("    [" + ", ".join(f"0x{v:X}" for v in row) + "],\n")
            f.write("  ],\n")
        f.write("];\n\n")
        f.write("// stage_FF.bin -- the attract-mode stage (bank_FF.asm:8670 comments it\n"
                "// `; demo`; sub_C41D_demo_handler auto-plays the battle loop on it).\n")
        f.write("export const DEMO_STAGE = [\n")
        for row in grids[35]:
            f.write("  [" + ", ".join(f"0x{v:X}" for v in row) + "],\n")
        f.write("];\n\n")

        # --- per-stage enemy roster -----------------------------------------
        f.write(
            "// Per-stage enemy roster. STAGE_ENEMY_TYPES[s] = the four type BYTES\n"
            "// ($80 basic / $A0 fast / $C0 power / $E0 armour), in spawn order\n"
            "// (tbl_E4EC $E4EC, read by sub_E3B8). STAGE_ENEMY_COUNTS[s] = how many\n"
            "// of each of those four spawn that stage (tbl_E578 $E578, loaded by\n"
            "// sub_E42B). The four counts sum to 20 (con_enemies_per_stage), asserted\n"
            "// at build time. Indexed 0..34 = stages 1..35 (2nd loop reuses stage 35).\n"
            "export const STAGE_ENEMY_TYPES = [\n"
        )
        for s in range(35):
            row = enemy_types[s * 4:s * 4 + 4]
            f.write(f"  [{', '.join(f'0x{v:02X}' for v in row)}], // stage {s + 1}\n")
        f.write("];\n\n")
        f.write("export const STAGE_ENEMY_COUNTS = [\n")
        for s in range(35):
            row = enemy_counts[s * 4:s * 4 + 4]
            f.write(f"  [{', '.join(str(v) for v in row)}], // stage {s + 1} (sum 20)\n")
        f.write("];\n")

    # --- emit assets/dat_text.js ------------------------------------------
    texts = [(name, addr, row, col, note, read_until_ff(tables, addr))
             for name, addr, row, col, note in TEXT_TABLES]

    # INVARIANT: the ROM's font is ASCII-indexed, so every byte is either a
    # printable ASCII code or one of the custom glyphs above $7F is impossible
    # here -- these tables are all < $80. A byte outside that means the table
    # start is wrong (a mislabelled address read as data).
    for name, addr, _, _, _, ids in texts:
        if not ids:
            raise SystemExit(f"extract: {name} at ${addr:04X} is empty")
        bad = [b for b in ids if b > 0x7F]
        if bad:
            raise SystemExit(f"extract: {name} at ${addr:04X} has non-tile bytes "
                             f"{['$%02X' % b for b in bad]} -- wrong start address?")

    with open(os.path.join(ASSETS, "dat_text.js"), "w", encoding="utf-8") as f:
        f.write(
            "// GENERATED by tools/extract.py -- do not edit by hand.\n"
            "// Source: cyneprepou4uk Battle City disassembly (external).\n"
            "//\n"
            "// The title screen's text, as BACKGROUND TILE IDS -- index CHR at\n"
            "// CHR_BG_BASE + id. The ROM's font is ASCII-indexed, so 'B' really is $42;\n"
            "// the ids above the letters are custom glyphs ($5E = 'I', $5F = 'II',\n"
            "// $60-$68 = the NAMCOT logo, $69 = dot, $6B = dash, $40 = the (c) sign).\n"
            "//\n"
            "// Every one of these is drawn by sub_D17F_draw_title_screen ($D17F), which\n"
            "// runs ONCE at $C095 -- before the scroll. So the whole screen, scores and\n"
            "// menu options included, scrolls up together; sub_C9C0 (the menu) adds only\n"
            "// the cursor tank, as a sprite.\n"
            "//\n"
            "// The ROM's $FF terminator is DROPPED: sub_D6B3 stops on it ($D6D0), a JS\n"
            "// array has a length. Same normalisation as dat_levels.js dropping the pad\n"
            "// column. ROW/COL are the ROM's own $D6B3 arguments, not a re-layout.\n"
            "\n"
            "export const TEXT = {\n"
        )
        for name, addr, row, col, note, ids in texts:
            ascii_ = "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in ids)
            f.write(f"  // ${addr:04X} {note}\n")
            f.write(f"  //   row {row}, col {col} -> \"{ascii_}\"\n")
            f.write(f"  {name}: {{ row: {row}, col: {col}, ids: ["
                    + ", ".join(f"0x{v:02X}" for v in ids) + "] },\n")
        f.write("};\n")

    codes = sorted({v for g in grids for row in g for v in row})
    print(f"extract: CHR 8192 B -> 512 tiles (sprites 0-255 @ $0000, BG 256-511 @ $1000)")
    print(f"extract: palettes  4 sprite, 9 bg sets x 4")
    print(f"extract: blocks    16 attribute + 16 x 4 tile ids")
    print(f"extract: stages    {len(grids)} decoded ({COLS}x{ROWS}), "
          f"codes used: {', '.join(f'${c:X}' for c in codes)}")
    print(f"extract: enemies   35 x 4 type/count (all sums == 20, types in "
          "{{$80,$A0,$C0,$E0}})")
    print(f"extract: text      {len(texts)} title tables, "
          f"{sum(len(t[5]) for t in texts)} tile ids total")
    print(f"extract: wrote     {os.path.join(ASSETS, 'dat_chr.js')}")
    print(f"extract: wrote     {os.path.join(ASSETS, 'dat_levels.js')}")
    print(f"extract: wrote     {os.path.join(ASSETS, 'dat_text.js')}")


if __name__ == "__main__":
    main()
