#!/usr/bin/env python3
"""
extract.py -- pull the Arkanoid-MSX brick data out of the disassembly into
compact ES-module assets the browser imports directly (no fetch, no runtime
decode).

ALL decoding happens here, at build time -- the runtime never unpacks anything
(a decode mechanism is meaningless to run for gameplay). The two ported source
routines live here, cited:
  * L5C7E (disassembly.asm:2707-2806)     -- bitmask -> 11x12 brick grid
  * DECOMPRESS_TILE_COLORS (@0x4389)       -- colour-table RLE

Reads (from an external clone of the tiburoncio disassembly -- NOT copied into
this repo):
  level_maps.asm        the 17-byte-per-level brick bitmasks
  level_colors.asm      the per-level brick-colour lists (one byte per present brick)
  in_game_patterns.asm  256 chars x 8 rows of 8x8 monochrome pattern bytes (ROM 0x7d84)
  in_game_colors.asm    the RLE-compressed tile colour table (ROM 0x8584)
  disassembly.asm       index tables:
                          LEVELS_PTR_TABLE       (dw, 32 bitmask addresses)
                          LEVEL_COLORS_PTR_TABLE (dw, 32 colour-list addresses)
                          BRICKS_PER_LEVEL       (db, 32 breakable counts)
                          TBL_COLOR_TO_PATTERN   (db, 20 = 10 brick types x
                                                  left+right char code)

Writes:
  block_breaker/assets/dat_levels.js
    export const LEVELS = [ { grid:[12][11], brickCount, breakable }, ...32 ]
      grid[r][c] = brick colour-index (0..9) or -1 (empty), row-major.
  block_breaker/assets/dat_tiles.js
    export const TILES = { patterns:[2048], colors:[2048], colorToPattern:[20] }
      patterns[code*8 + row] = 8x8 pattern byte (MSB = leftmost pixel).
      colors  [code*8 + row] = (fg<<4)|bg, RLE-decompressed; nibbles index MSX_PALETTE.
      colorToPattern[2*i], [2*i+1] = brick colour-index i -> (left,right) char codes.

Correctness invariants asserted per level:
    placed == popcount(bitmask) == brickCount
i.e. gridding places exactly popcount bricks and none fell in the 4-bit padding
region (validates the geometry, not just the popcount arithmetic).
BRICKS_PER_LEVEL is a DIFFERENT number: the count of BREAKABLE bricks (present
minus indestructible gold), stored as "breakable" for the win condition.
present >= breakable; gold = present - breakable.

Usage:
    python block_breaker/tools/extract.py [path-to-arkanoid_msx_disasm]
Default source dir: C:\\Z_Temp\\arkanoid_msx_disasm
"""

import json
import re
import sys
from pathlib import Path

DEFAULT_SRC = Path(r"C:\Z_Temp\arkanoid_msx_disasm")
OUT_DIR = Path(__file__).resolve().parent.parent / "assets"
OUT_LEVELS = OUT_DIR / "dat_levels.js"
OUT_TILES = OUT_DIR / "dat_tiles.js"

BITMASK_BYTES = 17
NUM_LEVELS = 32
COLS = 11
ROWS = 12
TILE_TABLE_BYTES = 2048   # one SCREEN 2 third: 256 chars x 8 rows


def read_asm(path):
    # .asm files are ASCII data lines with the odd non-ASCII comment char; read
    # as UTF-8 with replacement so Windows' cp950 default doesn't choke.
    return path.read_text(encoding="utf-8", errors="replace")


# ` ; 0x6615 - 0x661c ` -> the start address of the bytes on that db line.
ADDR_RE = re.compile(r";\s*0x([0-9a-fA-F]+)")
# a numeric token (hex or decimal) inside a db/dw operand list.
NUM_RE = re.compile(r"0x[0-9a-fA-F]+|\d+")


def build_addr_map(path):
    """Parse a `db` data file into { address: byte } using each line's ; 0xADDR."""
    mem = {}
    for line in read_asm(path).splitlines():
        s = line.strip()
        if not s.startswith("db"):
            continue
        m = ADDR_RE.search(s)
        if not m:
            continue
        addr = int(m.group(1), 16)
        data = s.split(";", 1)[0]          # bytes only, drop the address comment
        for tok in NUM_RE.findall(data[2:]):  # data[2:] skips the leading 'db'
            mem[addr] = int(tok, 0) & 0xFF
            addr += 1
    return mem


def contiguous_bytes(mem):
    """mem = { addr: byte }; return the contiguous byte list from min(addr)."""
    base = min(mem)
    out = []
    a = base
    while a in mem:
        out.append(mem[a])
        a += 1
    return out


def read_table(disasm_text, label, count):
    """Collect `count` numeric values from db/dw lines following `label:`.

    Skips comment-only and blank lines (some tables interleave ; L1 L2..
    banners). Stops once `count` values are gathered.
    """
    lines = disasm_text.splitlines()
    for i, line in enumerate(lines):
        if line.strip().startswith(label + ":"):
            vals = []
            for cont in lines[i + 1:]:
                code = cont.split(";", 1)[0].strip()      # drop trailing comment
                if not code:
                    continue                               # blank / comment-only
                if not (code.startswith("db") or code.startswith("dw")):
                    break                                  # hit the next thing
                vals.extend(int(t, 0) for t in NUM_RE.findall(code[2:]))
                if len(vals) >= count:
                    return vals[:count]
            return vals[:count]
    raise SystemExit(f"label {label!r} not found in disassembly.asm")


def popcount(byte):
    return bin(byte).count("1")


def decode_to_grid(bitmask, colors, cols=COLS, rows=ROWS):
    """Port of L5C7E (disassembly.asm:2707-2806): walk the 17-byte bitmask
    MSB-first; each set bit places the next colour byte into the row-major grid
    (absent cells do NOT advance the colour cursor). Mirrors the old
    src/levels.js decodeLevel this replaces. Returns (grid, placed) where
    grid[r][c] = colour-index or -1 (empty). Stops at cols*rows cells, so the
    trailing 4 padding bits of byte 16 are ignored.
    """
    grid = [[-1] * cols for _ in range(rows)]
    cell = 0
    cursor = 0
    total = cols * rows
    for byte in bitmask:
        for bit in range(7, -1, -1):
            if cell >= total:
                break
            if (byte >> bit) & 1:
                r, c = divmod(cell, cols)
                grid[r][c] = colors[cursor]
                cursor += 1
            cell += 1
        if cell >= total:
            break
    return grid, cursor


def decompress_tile_colors(stream, out_len=TILE_TABLE_BYTES):
    """Port of DECOMPRESS_TILE_COLORS (disassembly.asm @0x4389). A source byte
    with high-nibble != 0 is a LITERAL (written verbatim). Otherwise a 4-byte
    record [0x0X][Y][a][b] writes the pair (a, b) alternating N = 256*X + Y
    times (2*N output bytes).

    Faithful boundary: the routine's outer limit check is `ld a,h; cp b; ret z`
    -- it tests only the HIGH byte of the dest pointer against base+8, not the
    full pointer, and never checks mid-record. So the final record overshoots
    the 2048-byte third by a few bytes (H still lands on the target page), and
    those spill bytes fall into the next third's table, which is overwritten
    when that third is decoded (all three thirds decode this same stream). The
    faithful per-third colour table is therefore the FIRST out_len bytes -- so
    we decode past the end and truncate, mirroring the hardware's effective
    result. (The sole degenerate record C0=0,B0=0 -- which the Z80 pre-guard
    would treat as 256, not 0 -- does not occur in this ROM data.)
    """
    out = []
    i = 0
    while len(out) < out_len:
        v = stream[i]
        if v & 0xF0:                       # high nibble != 0 -> literal
            out.append(v)
            i += 1
        else:                              # compressed: [0x0X][Y][a][b]
            n = 256 * (stream[i] & 0x0F) + stream[i + 1]
            a, b = stream[i + 2], stream[i + 3]
            i += 4
            out.extend([a, b] * n)
    return out[:out_len]                    # discard the benign overshoot


def fmt_hex(vals, per_line=16, indent="    "):
    """Wrap a byte list as 0xNN rows for a readable generated array."""
    rows = []
    for i in range(0, len(vals), per_line):
        rows.append(indent + ", ".join("0x%02x" % v for v in vals[i:i + per_line]) + ",")
    return "\n".join(rows)


LEVELS_HEADER = """\
// AUTO-GENERATED by tools/extract.py -- do not edit by hand.
// 32 Arkanoid-MSX levels, pre-baked at build time (port of L5C7E,
// disassembly.asm:2707-2806). grid[r][c] = brick colour-index (0..9) or -1
// (empty), 12 rows x 11 cols, row-major. brickCount = bricks present (drawn);
// breakable = win-condition target (present minus indestructible gold, index 9).
"""

TILES_HEADER = """\
// AUTO-GENERATED by tools/extract.py -- do not edit by hand.
// Real MSX brick tile data, extracted + decoded from the ROM at build time:
//   patterns[code*8 + row]         8x8 monochrome pattern byte, MSB = leftmost
//                                  pixel (in_game_patterns.asm @0x7d84).
//   colors  [code*8 + row]         per-row (fg<<4)|bg colour byte, RLE-decompressed
//                                  (in_game_colors.asm @0x8584 via
//                                  DECOMPRESS_TILE_COLORS @0x4389); nibbles index
//                                  the MSX palette.
//   colorToPattern[2*i], [2*i+1]   brick colour-index i -> (left,right) char codes
//                                  = the brick's two 8x8 halves (16x8 brick)
//                                  (TBL_COLOR_TO_PATTERN @0x5ddb). i=9 = gold.
"""


def write_levels_js(levels):
    entries = ["  " + json.dumps(lv, separators=(",", ":")) for lv in levels]
    OUT_LEVELS.write_text(
        LEVELS_HEADER + "export const LEVELS = [\n" + ",\n".join(entries) + "\n];\n")


def write_tiles_js(patterns, colors, ctp):
    OUT_TILES.write_text(
        TILES_HEADER
        + "export const TILES = {\n"
        + "  patterns: [\n" + fmt_hex(patterns) + "\n  ],\n"
        + "  colors: [\n" + fmt_hex(colors) + "\n  ],\n"
        + "  colorToPattern: [" + ", ".join("0x%02x" % v for v in ctp) + "],\n"
        + "};\n")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        raise SystemExit(f"source dir not found: {src}")

    disasm = read_asm(src / "disassembly.asm")
    levels_ptr = read_table(disasm, "LEVELS_PTR_TABLE", NUM_LEVELS)
    colors_ptr = read_table(disasm, "LEVEL_COLORS_PTR_TABLE", NUM_LEVELS)
    counts = read_table(disasm, "BRICKS_PER_LEVEL", NUM_LEVELS)

    maps_mem = build_addr_map(src / "level_maps.asm")
    colors_mem = build_addr_map(src / "level_colors.asm")

    # ---- levels: pre-bake each grid + assert geometry ----------------------
    levels = []
    total_present = 0
    for i in range(NUM_LEVELS):
        base = levels_ptr[i]
        bitmask = [maps_mem[base + k] for k in range(BITMASK_BYTES)]

        # Every PRESENT brick (set bit) has one colour byte, so the colour-list
        # length == popcount(bitmask). (BRICKS_PER_LEVEL is a different quantity:
        # BREAKABLE bricks -- present minus indestructible gold.)
        present = sum(popcount(b) for b in bitmask)

        cbase = colors_ptr[i]
        colors = [colors_mem[cbase + k] for k in range(present)]

        # Independent cross-check: the colour-pointer delta must equal popcount.
        if i < NUM_LEVELS - 1:
            delta = colors_ptr[i + 1] - colors_ptr[i]
            assert present == delta, (
                f"level {i+1}: popcount {present} != colour-ptr delta {delta}")

        breakable = counts[i]
        assert breakable <= present, (
            f"level {i+1}: breakable {breakable} > present {present}")

        # Pre-bake the grid + the STRONGER geometry check: gridding must place
        # exactly popcount bricks (none fell in the 4-bit padding region).
        grid, placed = decode_to_grid(bitmask, colors)
        assert placed == present, (
            f"level {i+1}: gridded {placed} != popcount {present} "
            f"(a set bit landed in the padding region -> wrong geometry)")

        levels.append({"grid": grid, "brickCount": present, "breakable": breakable})
        total_present += present

    # ---- tiles: patterns (plain) + colours (RLE) + colour->pattern ---------
    patterns = contiguous_bytes(build_addr_map(src / "in_game_patterns.asm"))
    assert len(patterns) == TILE_TABLE_BYTES, (
        f"patterns: {len(patterns)} != {TILE_TABLE_BYTES}")

    color_stream = contiguous_bytes(build_addr_map(src / "in_game_colors.asm"))
    tile_colors = decompress_tile_colors(color_stream)

    color_to_pattern = read_table(disasm, "TBL_COLOR_TO_PATTERN", 20)
    assert len(color_to_pattern) == 20, f"colorToPattern: {len(color_to_pattern)} != 20"

    # ROM anchors (spot-check the extraction is aligned to the real bytes).
    assert color_to_pattern[18:20] == [0x67, 0x68], (
        f"gold pair wrong: {color_to_pattern[18:20]!r} != [0x67, 0x68]")
    assert patterns[0x23 * 8] == 0xff, (
        f"solid brick 0x23 row0 = {patterns[0x23*8]:#04x} != 0xff")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_levels_js(levels)
    write_tiles_js(patterns, tile_colors, color_to_pattern)

    print(f"OK  {NUM_LEVELS} levels, {total_present} bricks present total")
    print(f"    present (drawn): {[lv['brickCount'] for lv in levels]}")
    print(f"    breakable      : {counts}")
    print(f"    wrote  {OUT_LEVELS}")
    print(f"OK  tiles: patterns={len(patterns)} colors={len(tile_colors)} "
          f"colorToPattern={len(color_to_pattern)}")
    print(f"    colorToPattern = {['0x%02x' % v for v in color_to_pattern]}")
    print(f"    anchors OK: gold pair (0x67,0x68), solid 0x23 row0 = "
          f"{patterns[0x23*8]:#04x}")
    print(f"    wrote  {OUT_TILES}")
    print("    level 1 grid (anchor -- expect 6 full rows of 11):")
    for row in levels[0]["grid"]:
        print("      " + "".join("#" if c != -1 else "." for c in row))


if __name__ == "__main__":
    main()
