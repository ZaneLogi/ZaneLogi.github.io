#!/usr/bin/env python3
"""
extract.py -- pull the 32 Arkanoid-MSX level layouts out of the disassembly
into a compact JSON asset the browser can load.

Reads (from an external clone of the tiburoncio disassembly -- NOT copied into
this repo):
  level_maps.asm      the 17-byte-per-level brick bitmasks
  level_colors.asm    the per-level brick-colour lists (one byte per present brick)
  disassembly.asm     the 3 index tables:
                        LEVELS_PTR_TABLE       (dw, 32 bitmask addresses)
                        LEVEL_COLORS_PTR_TABLE (dw, 32 colour-list addresses)
                        BRICKS_PER_LEVEL       (db, 32 brick counts)

Writes:
  block_breaker/assets/levels.json
    [ { "bitmask":[17 ints], "colors":[N ints], "brickCount":N }, ...32 ]

We emit RAW bytes only -- the bitmask->grid decode lives in src/levels.js so it
stays reusable by the future game. This script's only job is faithful byte
extraction, and it asserts the correctness invariant per level:
    popcount(bitmask) == len(colors) == (LEVEL_COLORS_PTR delta)
i.e. every present brick has exactly one colour byte. NOTE BRICKS_PER_LEVEL is a
DIFFERENT number: the count of BREAKABLE bricks (present minus indestructible
gold), stored as "breakable" for the future win condition. present >= breakable.

Format facts (see block_breaker/CLAUDE.md for citations):
  32 brick levels; each bitmask 17 bytes = 136 bits, MSB-first, 1 = brick.
  Only 132 bits used (11 cols x 12 rows); trailing 4 bits are padding.

Usage:
    python block_breaker/tools/extract.py [path-to-arkanoid_msx_disasm]
Default source dir: C:\\Z_Temp\\arkanoid_msx_disasm
"""

import json
import re
import sys
from pathlib import Path

DEFAULT_SRC = Path(r"C:\Z_Temp\arkanoid_msx_disasm")
OUT = Path(__file__).resolve().parent.parent / "assets" / "levels.json"


def read_asm(path):
    # .asm files are ASCII data lines with the odd non-ASCII comment char; read
    # as UTF-8 with replacement so Windows' cp950 default doesn't choke.
    return path.read_text(encoding="utf-8", errors="replace")

BITMASK_BYTES = 17
NUM_LEVELS = 32

# ` ; 0x6615 - 0x661c ` -> the start address of the bytes on that db line.
ADDR_RE = re.compile(r";\s*0x([0-9a-fA-F]+)")
# strip an end-of-line comment (everything from the first ';')
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


def read_table(disasm_text, label, count):
    """Collect `count` numeric values from db/dw lines following `label:`.

    Skips comment-only and blank lines (BRICKS_PER_LEVEL interleaves ; L1 L2..
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

    levels = []
    total_present = 0
    for i in range(NUM_LEVELS):
        base = levels_ptr[i]
        bitmask = [maps_mem[base + k] for k in range(BITMASK_BYTES)]

        # Every PRESENT brick (set bit) gets one colour byte, so the colour-list
        # length == popcount(bitmask). (BRICKS_PER_LEVEL is a different quantity:
        # the number of BREAKABLE bricks -- present minus indestructible gold --
        # used for the win condition. present >= breakable.)
        present = sum(popcount(b) for b in bitmask)

        cbase = colors_ptr[i]
        colors = [colors_mem[cbase + k] for k in range(present)]

        # Independent cross-check: the colour-pointer delta must equal popcount.
        # (Proves both the bitmask read AND the colour pointers are right.)
        if i < NUM_LEVELS - 1:
            delta = colors_ptr[i + 1] - colors_ptr[i]
            assert present == delta, (
                f"level {i+1}: popcount {present} != colour-ptr delta {delta}")

        breakable = counts[i]
        assert breakable <= present, (
            f"level {i+1}: breakable {breakable} > present {present}")

        levels.append({
            "bitmask": bitmask,
            "colors": colors,
            "brickCount": present,   # bricks drawn (all present)
            "breakable": breakable,  # bricks that must be destroyed to clear
        })
        total_present += present

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(levels, separators=(",", ":")) + "\n")

    print(f"OK  {NUM_LEVELS} levels, {total_present} bricks present total")
    print(f"    present (drawn): {[lv['brickCount'] for lv in levels]}")
    print(f"    breakable      : {counts}")
    print(f"    wrote  {OUT}")


if __name__ == "__main__":
    main()
