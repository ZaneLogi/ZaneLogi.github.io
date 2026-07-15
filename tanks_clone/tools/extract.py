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
# A literal operand, e.g. "$0F". The bank also holds strings (.byte "COPYRIGHT..")
# and computed expressions (.byte $06 * $04 + $03); neither appears in the tables
# we extract, so lines carrying them are skipped rather than half-parsed.
HEX_BYTE = re.compile(r"^\$[0-9A-Fa-f]{1,2}$")


def parse_byte_tables(asm_path):
    """Build {cpu_addr: [byte, ...]} from the numeric .byte directives in the bank.

    Only `$hh`-style operands are kept. The bank also holds string directives
    (e.g. `.byte "COPYRIGHT 1981 1"` -- packed text for PrintPackedMsg); none of
    the tables we extract are strings, so those lines are skipped wholesale
    rather than half-parsed into a wrong-length run.
    """
    table = {}
    with open(asm_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = BYTE_LINE.search(line)
            if not m:
                continue
            toks = [t.strip() for t in m.group(2).split(",")]
            toks = [t for t in toks if t]
            if not toks or not all(HEX_BYTE.match(t) for t in toks):
                continue
            table[int(m.group(1), 16)] = [int(t[1:], 16) for t in toks]
    return table


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
        f.write("];\n")

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
        f.write("];\n")

    codes = sorted({v for g in grids for row in g for v in row})
    print(f"extract: CHR 8192 B -> 512 tiles (sprites 0-255 @ $0000, BG 256-511 @ $1000)")
    print(f"extract: palettes  4 sprite, 9 bg sets x 4")
    print(f"extract: blocks    16 attribute + 16 x 4 tile ids")
    print(f"extract: stages    {len(grids)} decoded ({COLS}x{ROWS}), "
          f"codes used: {', '.join(f'${c:X}' for c in codes)}")
    print(f"extract: wrote     {os.path.join(ASSETS, 'dat_chr.js')}")
    print(f"extract: wrote     {os.path.join(ASSETS, 'dat_levels.js')}")


if __name__ == "__main__":
    main()
