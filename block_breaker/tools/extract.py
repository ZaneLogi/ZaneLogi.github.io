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
OUT_SOUND = OUT_DIR / "dat_sound.js"

BITMASK_BYTES = 17
NUM_LEVELS = 32
COLS = 11
ROWS = 12
TILE_TABLE_BYTES = 2048   # one SCREEN 2 third: 256 chars x 8 rows

# The PSG player + its data span this region (sound_src.asm ORG 0xB400).
SOUND_BASE = 0xB400
SOUND_END = 0xC000        # exclusive; the image is 0xB400..0xBFFF = 0x0C00 bytes

# z80dasm omitted the opcode bytes on a few code lines where a label immediately
# follows the instruction. Supply them explicitly (byte verified from the Z80
# mnemonic). This is code, not sound data -- included only for a gap-free image.
SOUND_ROM_OVERRIDES = {
    0xB58B: 0x5E,         # ld e,(hl)  (WRITE_MASKED_PSG_REG_AND_ADVANCE, sound_src.asm:483)
    # CMD_NOTE_CH1_AND_EFFECT prologue @0xB676 (sound_src.asm:716-718), written
    # symbolically without byte comments. Assembled by hand:
    0xB676: 0x21, 0xB677: 0xC5, 0xB678: 0xE5,   # ld hl, PERIOD_EFFECT0_DELTA (0xE5C5)
    0xB679: 0x16, 0xB67A: 0x01,                 # ld d, 1
    0xB67B: 0xCD, 0xB67C: 0xE6, 0xB67D: 0xB6,   # call CMD_SET_ONE_NOTE_ON_CHANNEL (0xB6E6)
}


def read_asm(path):
    # .asm files are ASCII data lines with the odd non-ASCII comment char; read
    # as UTF-8 with replacement so Windows' cp950 default doesn't choke.
    return path.read_text(encoding="utf-8", errors="replace")


# ` ; 0x6615 - 0x661c ` -> the start address of the bytes on that db line.
ADDR_RE = re.compile(r";\s*0x([0-9a-fA-F]+)")
# a numeric token (hex or decimal) inside a db/dw operand list.
NUM_RE = re.compile(r"0x[0-9a-fA-F]+|\d+")

# For the sound PC-walk (build_sound_rom): a code line's comment is
# `<addr>\t<bytes>\t<ascii>`; a data range comment is `0xADDR - 0xADDR`.
BYTE_RE = re.compile(r"^[0-9a-fA-F]{2}$")            # one opcode byte
RANGE_ADDR_RE = re.compile(r"0x([0-9a-fA-F]+)\s*-")  # a data line's start-of-range addr
# a code line's `;<addr>\t<bytes>` (addr = 4 hex; bytes = the field up to the next
# tab). Search anywhere -- some lines carry a stray `;` in the operand first
# (e.g. `ld b, (TBL_SOUND_PARAMS & 0xFF00) >> 8; ;b51d\t06 b4`).
CODE_COMMENT_RE = re.compile(r";([0-9a-fA-F]{4})\t([^\t]*)")
SOUND_ID_RE = re.compile(r"^(SOUND_\w+):\s*equ\s+(\d+)")


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


def decompress_brick_actions(stream):
    """Port of the brick-action RLE unroll (disassembly.asm:1031-1057). Each byte
    packs (action << 4) | count -> emit `action` `count` times; a 0xFF byte ends
    the level. `action` indexes TBL_BRICK_ACTIONS: 0 normal, 1 capsule, 2 hard,
    3 unbreakable (gold), 4 empty (no brick). Returns the 132 per-cell actions.
    """
    out = []
    for b in stream:
        if b == 0xFF:
            break
        out.extend([(b >> 4) & 0x0F] * (b & 0x0F))
    return out


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


def build_sound_rom(path):
    """Assemble sound_src.asm's 0xB400..0xBFFF byte image WITHOUT a Z80 assembler.

    z80dasm emits every instruction's raw opcode bytes in its
    `;<addr>\\t<bytes>\\t<ascii>` comment, and the data lines carry db/dw
    operands. So we PC-walk from ORG 0xB400: code lines are self-locating (the
    comment holds addr + bytes); db/dw data lines advance the PC, resyncing it at
    any `0xADDR -` range comment (and at the comment-only line that precedes the
    descriptor blocks). The one symbolic operand `dw SOUND_SEQUENCES` resolves to
    0xB855.

    Why not just parse db lines (like the level/tile extractor): some effect-preset
    bytes (SOUND_EFFECT_PRESET_TABLE -> 0xB4xx) live at addresses the disassembler
    rendered as CODE, so the code-comment bytes are load-bearing sound data.
    """
    mem = {}
    pc = SOUND_BASE
    for raw in read_asm(path).splitlines():
        code = raw.split(";", 1)[0].strip()      # operand text, before any comment

        if code.startswith("db") or code.startswith("dw"):
            is_dw = code.startswith("dw")
            m = RANGE_ADDR_RE.search(raw)         # this data line states its own addr?
            if m:
                pc = int(m.group(1), 16)
            for tok in code[2:].split(","):
                tok = tok.strip()
                if not tok:
                    continue
                val = 0xB855 if tok == "SOUND_SEQUENCES" else int(tok, 0)
                if is_dw:                         # little-endian word
                    mem[pc] = val & 0xFF
                    mem[pc + 1] = (val >> 8) & 0xFF
                    pc += 2
                else:
                    mem[pc] = val & 0xFF
                    pc += 1
            continue

        # A code line: its comment holds `;<addr>\t<bytes>`. Self-locating.
        cm = CODE_COMMENT_RE.search(raw)
        if cm:
            pc = int(cm.group(1), 16)
            for b in cm.group(2).split():         # the byte field, up to the ascii tab
                if not BYTE_RE.match(b):
                    break
                mem[pc] = int(b, 16)
                pc += 1
            continue

        # A comment-only line that seeds the next block's address (`; 0xb422 - ...`).
        m = RANGE_ADDR_RE.search(raw)
        if m:
            pc = int(m.group(1), 16)

    for a, b in SOUND_ROM_OVERRIDES.items():      # fill only the byte-less code lines
        mem.setdefault(a, b)

    rom = []
    for a in range(SOUND_BASE, SOUND_END):        # contiguity = parse-desync tripwire
        if a not in mem:
            raise SystemExit(f"sound rom gap at {a:#06x} (PC-walk desync)")
        rom.append(mem[a])
    return rom


def parse_sound_ids(path):
    """sounds.asm `SOUND_NAME: equ N` -> { NAME: N } (SOUND_ prefix stripped)."""
    ids = {}
    for line in read_asm(path).splitlines():
        m = SOUND_ID_RE.match(line.strip())
        if m:
            ids[m.group(1)[len("SOUND_"):]] = int(m.group(2))
    return ids


def check_sound_anchors(rom):
    """Fail the build if the byte image is misaligned (see docs/research_sound.md §8)."""
    def at(addr):
        return rom[addr - SOUND_BASE]

    anchors = [
        (0xB400, [0xC3, 0xE8, 0xB4], "jp PLAY_SOUND"),
        (0xB403, [0xC3, 0x94, 0xB5], "jp SOUND_ISR_UPDATE"),
        (0xB855, [0x01], "SOUND_SEQUENCES[0]"),
        (0xBA68, [0x0C], "stream 0xBA68 (sfx196 primary)"),
        (0xB86A, [0x7F], "stream 0xB86A (sfx2 brick-destroyed)"),
    ]
    for addr, expect, name in anchors:
        got = [at(addr + i) for i in range(len(expect))]
        assert got == expect, (
            f"sound anchor {name} @{addr:#06x}: "
            f"{['0x%02x' % v for v in got]} != {['0x%02x' % v for v in expect]}")

    # Descriptor cross-check: sfx 2 -> pointer[2] -> block -> stream 0xB86A. If the
    # PC-walk over the 5-byte descriptor blocks desynced, this word is wrong.
    block = 0xB400 | at(0xB406 + 2)
    stream = at(block + 3) | (at(block + 4) << 8)
    assert stream == 0xB86A, f"sfx2 descriptor stream {stream:#06x} != 0xB86A"


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


SOUND_HEADER = """\
// AUTO-GENERATED by tools/extract.py -- do not edit by hand.
// The Arkanoid MSX PSG player + data, assembled from sound_src.asm (ORG 0xB400)
// WITHOUT a Z80 assembler: db/dw operands + the raw opcode bytes z80dasm emits in
// each instruction's ;addr comment (some effect-preset data lives at addresses the
// disassembler rendered as code). See docs/research_sound.md.
//   base   0xB400  -- rom[addr - base] mirrors the Z80's absolute addressing.
//   rom    0x0C00 bytes (0xB400..0xBFFF): jp table, TBL_SOUND_PARAMS + descriptor
//          blocks, the handler/effect code region, and SOUND_SEQUENCES bytecode.
//   ids    sounds.asm's SOUND_* equ table (prefix stripped).
"""


def write_sound_js(rom, ids):
    id_lines = ",\n".join(f"    {k}: {v}" for k, v in ids.items())
    OUT_SOUND.write_text(
        SOUND_HEADER
        + "export const SOUND = {\n"
        + f"  base: 0x{SOUND_BASE:04x},\n"
        + "  rom: [\n" + fmt_hex(rom) + "\n  ],\n"
        + "  ids: {\n" + id_lines + ",\n  },\n"
        + "};\n")


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

    # Per-level brick ACTION table (RLE-compressed), separate from the colours.
    ca_text = read_asm(src / "compressed_brick_actions_per_level.asm")
    action_ptrs = read_table(ca_text, "COMPRESSED_BRICK_ACTIONS_PER_LEVEL", NUM_LEVELS)
    actions_mem = build_addr_map(src / "compressed_brick_actions_per_level.asm")

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

        # Per-cell brick action (0..4), decompressed + gridded. Cross-check the
        # action table against the bitmask: action 4 (empty) <=> no brick.
        addr = action_ptrs[i]
        stream = []
        while actions_mem[addr] != 0xFF:
            stream.append(actions_mem[addr])
            addr += 1
        flat = decompress_brick_actions(stream)
        assert len(flat) == COLS * ROWS, (
            f"level {i+1}: {len(flat)} action cells != {COLS*ROWS}")
        actions = [flat[r * COLS:(r + 1) * COLS] for r in range(ROWS)]
        for r in range(ROWS):
            for c in range(COLS):
                assert (actions[r][c] == 4) == (grid[r][c] == -1), (
                    f"level {i+1} cell ({r},{c}): action {actions[r][c]} "
                    f"disagrees with bitmask (grid={grid[r][c]})")

        levels.append({"grid": grid, "actions": actions,
                       "brickCount": present, "breakable": breakable})
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

    # ---- sound: the whole PSG player + data as a byte image + the id table ---
    sound_rom = build_sound_rom(src / "sound_src.asm")
    sound_ids = parse_sound_ids(src / "sounds.asm")
    check_sound_anchors(sound_rom)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_levels_js(levels)
    write_tiles_js(patterns, tile_colors, color_to_pattern)
    write_sound_js(sound_rom, sound_ids)

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
    print(f"OK  sound: rom={len(sound_rom)} bytes (0x{SOUND_BASE:04x}..0x{SOUND_END-1:04x}), "
          f"{len(sound_ids)} ids; anchors OK (jp table, SOUND_SEQUENCES, sfx2/sfx196 streams)")
    print(f"    wrote  {OUT_SOUND}")


if __name__ == "__main__":
    main()
