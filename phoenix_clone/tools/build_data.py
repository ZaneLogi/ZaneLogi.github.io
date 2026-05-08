#!/usr/bin/env python3
# Reads the Phoenix ROMs from the disassembly clone and emits
# phoenix_clone/data.js with the tile/palette byte arrays plus parsed
# static-text-table records (PrintTextLines $01D0 input data).
#
# Run from anywhere:
#     python phoenix_clone/tools/build_data.py
#
# Source ROMs:
#     D:/tmp/computer_archeology_phonenix/content/Arcade/Phoenix/roms/
#         fgtiles.bin   (4096 bytes — ic39 + ic40 concatenated, 1 bitplane each)
#         bgtiles.bin   (4096 bytes — ic23 + ic24 concatenated, 1 bitplane each)
#         proms.bin     ( 512 bytes — ic40 + ic41 concatenated, 1 palette bit each)
#         maincpu.bin   (16384 bytes — ic45+ic46+ic47+ic48+h5..h8 concatenated)

from pathlib import Path

ROM_DIR  = Path("D:/tmp/computer_archeology_phonenix/content/Arcade/Phoenix/roms")
OUT_FILE = Path(__file__).resolve().parent.parent / "data.js"

ROMS = [
    ("fgtilesData", "fgtiles.bin", 4096),
    ("bgtilesData", "bgtiles.bin", 4096),
    ("promsData",   "proms.bin",    512),
]

MAINCPU_NAME = "maincpu.bin"
MAINCPU_SIZE = 16384

# Static-text tables consumed by PrintTextLines ($01D0). Format per entry
# (32 bytes in the code ROM):
#   +0..+1   screen-RAM address (MSB, LSB)
#   +2..+5   four FF padding bytes (skipped via L+=5)
#   +6..+31  26 tile bytes (one per display column, drawn left-to-right)
# The address inverse (addr → x, y) is described in
# phoenix_clone/docs/research_rendering.md §4.3 "Static text tables".
#
# Known $01D0 call sites in Code.md (add to TEXT_TABLES as the port grows):
#     $0017 (cold-init):           T1800, 3 rows  ← extracted here
#     $01E1 (PrintCopyright):      T1960, 3 rows
#     $0290 (PromptForStartGame):  T19C0, 2 rows
#     $02A2 (PromptForStartGame):  T1BA0, 1 row
#     $06ED:                       T1800, 1 row (reuses first T1800 entry)
TEXT_TABLES = [
    ("STATIC_TEXT_ROWS", 0x1800, 3),     # source label T1800
]

# Raw byte-array slices from maincpu.bin used by the per-stage init
# pipeline (research_stage_structure.md §4 / research_rendering.md "alien
# render model"). Each tuple is (export name, code-ROM offset, length).
RAW_SLICES = [
    # source T0560 — 32-byte default player + bullets block, copied to
    # $43C0 by InitPlayerDataStructure ($0547). Step 5 only consumes the
    # first 4 bytes (PlayerState/Shape/X/Y) but the full block is carried
    # so the bullet slots can light up in later steps.
    ("PLAYER_INIT_BLOCK", 0x0560, 32),
    # source T0598 — 16-byte LSB dispatch table for InitGlobalLevelData
    # ($0580). Indexed by stage low nibble; high byte of pointer is fixed
    # at $05; the LSBs all fall in the $A8..$CC range, pointing at one of
    # the four blocks below.
    ("STAGE_BLOCK_INDEX", 0x0598, 16),
    # source $05A8/$05B4/$05C0/$05CC — the four unique 12-byte per-stage
    # blocks, packed as one 48-byte slice. Decoded by
    # research_stage_structure.md §4.1.
    ("STAGE_BLOCKS", 0x05A8, 48),
    # source T063A — 16-byte alien-formation LSB index for
    # InitAlienPositions ($0610). Two rows of 8 bytes (round 1 / round 2+);
    # indexed by (LevelAndRound RRCA & 0x0F).
    ("FORMATION_INDEX", 0x063A, 16),
    # source T1000 — 17-byte alien formation-drift path: a sequence of
    # T1700 (MOTION_DIRECTIONS) indices, null-terminated. Walked one byte
    # per 8-pixel grid crossing by AlienMovementUpdate ($0D1C) — see
    # research_enemy_motion.md §3.3. The closed-loop swoop patterns
    # T1020-T13D0 are deferred until the AlienBehaviorUpdate ($3000)
    # port lands.
    ("MOTION_PATH_BASE", 0x1000, 17),
    # source T1420 — 192-byte alien character-block shapes table consumed
    # by the Bit3 draw functions L0788 (Draw 2x1) and L07AA (Draw 1x2).
    # Indexed by alien controlB (with H=$14 prefix, so source addresses
    # $1400+controlB; subtract $20 to get the array offset).
    ("ALIEN_SHAPE_TABLE", 0x1420, 192),
    # source T1500 — 32-byte alien control-state init table copied to
    # $4B70+ by InitAlienControlStates ($05EC). 16 entries × (controlA,
    # controlB); even-stage entries are the fade-in start state ($08, $6C),
    # odd-stage entries are the post-fade combat state ($09, $60).
    ("ALIEN_CONTROL_INIT", 0x1500, 32),
    # source T1520 — 32-byte alien movement-pattern pointer table copied
    # to $4B50-$4B6F by $0650. 16 entries × 2-byte pointer. Carried for
    # source-faithful symmetry but unused until step 6 wires alien motion.
    ("ALIEN_MOVE_PTR_INIT", 0x1520, 32),
    # source T1540 — 256-byte alien formation table: 8 sub-tables of 16
    # (X, Y) pairs at $1540/$1560/$1580/$15A0/$15C0/$15E0/$1600/$1620.
    # The FORMATION_INDEX LSB selects which sub-table this stage uses.
    ("ALIEN_FORMATIONS", 0x1540, 256),
    # source T1600 — 160-byte alien shape-LSB lookup, addressed as
    # SHAPE_LSB_TABLE[T16A0_base + offset]. Each byte is a low byte into
    # T1420 (ALIEN_SHAPE_TABLE) selecting which alien shape to draw.
    # AlienAnimationUpdate ($0D86) writes the looked-up byte to
    # alien.controlB. Spans $1600-$169F: enough for all bases referenced
    # by ANIMATION_TABLE (max $90 + 8 = $98). research_enemy_motion.md §4.3.
    ("SHAPE_LSB_TABLE", 0x1600, 160),
    # source T16A0 — 96-byte alien animation table: 32 entries × 3 bytes
    # (drawMode, calcStyle, t1600Base). Indexed by current path byte.
    # drawMode is OR'd into controlA's low 3 bits (so the draw mode can
    # change per path step!). calcStyle picks which (x,y) bits compute
    # the SHAPE_LSB_TABLE offset. research_enemy_motion.md §4.2.
    ("ANIMATION_TABLE", 0x16A0, 96),
    # source T1700 — 64-byte alien motion direction table: 32 entries ×
    # 2 bytes (signed dx, signed dy). Indexed by current path byte.
    # AlienMovementUpdate ($0D30) reads the (dx, dy) and applies to
    # alien (x, y). Index 0 is unused (path byte 0 = end-of-list marker).
    # research_enemy_motion.md §3.2.
    ("MOTION_DIRECTIONS", 0x1700, 64),
    # source T1760 — 8-byte alien-vs-bird partition. Indexed by
    # (LevelAndRound & 0x0E) >> 1 inside $2204; positive byte ($10) sets
    # AliensLeft = 16, negative byte ($88) sets BirdsLeft = 8. Carried
    # but not consumed until bird-stage step.
    ("ALIEN_BIRD_PARTITION", 0x1760, 8),
]


def read_rom(name: str, expected: int) -> bytes:
    path = ROM_DIR / name
    data = path.read_bytes()
    if len(data) != expected:
        raise SystemExit(f"{path}: expected {expected} bytes, got {len(data)}")
    return data


def format_bytes(data: bytes, indent: str = "    ", per_row: int = 16) -> str:
    lines = []
    for row_start in range(0, len(data), per_row):
        row = data[row_start:row_start + per_row]
        lines.append(indent + ", ".join(f"0x{b:02X}" for b in row) + ",")
    return "\n".join(lines)


def parse_text_table(rom: bytes, offset: int, row_count: int) -> list[dict]:
    records = []
    for i in range(row_count):
        base = offset + i * 32
        addr = (rom[base] << 8) | rom[base + 1]
        # addr → (col, row) → (x, y); see research_rendering.md §4.3.
        plane_off = addr - 0x4000
        col = 25 - (plane_off >> 5)
        row = plane_off & 0x1F
        records.append({
            "x": col * 8,
            "y": row * 8,
            "tiles": list(rom[base + 6 : base + 32]),
        })
    return records


def format_text_table(records: list[dict], indent: str = "    ") -> str:
    lines = []
    for r in records:
        tile_str = ", ".join(f"0x{b:02X}" for b in r["tiles"])
        lines.append(f"{indent}{{ x: {r['x']:3d}, y: {r['y']:3d}, tiles: [{tile_str}] }},")
    return "\n".join(lines)


def main() -> None:
    rom_blocks = [read_rom(name, size) for (_, name, size) in ROMS]
    maincpu = read_rom(MAINCPU_NAME, MAINCPU_SIZE)

    out = []
    out.append("// data.js — auto-generated by phoenix_clone/tools/build_data.py")
    out.append("// Source: D:/tmp/computer_archeology_phonenix/content/Arcade/Phoenix/roms/")
    out.append("// Do not edit by hand; re-run the prep script if the ROMs change.")
    out.append("")

    for (var_name, _, _), data in zip(ROMS, rom_blocks):
        out.append(f"export const {var_name} = new Uint8Array([")
        out.append(format_bytes(data))
        out.append("]);")
        out.append("")

    for name, offset, row_count in TEXT_TABLES:
        records = parse_text_table(maincpu, offset, row_count)
        out.append(f"// {name} — code-ROM offset 0x{offset:04X}, {row_count} row(s).")
        out.append(f"export const {name} = [")
        out.append(format_text_table(records))
        out.append("];")
        out.append("")

    for name, offset, length in RAW_SLICES:
        slice_bytes = maincpu[offset:offset + length]
        out.append(f"// {name} — code-ROM offset 0x{offset:04X}, {length} byte(s).")
        out.append(f"export const {name} = new Uint8Array([")
        out.append(format_bytes(slice_bytes))
        out.append("]);")
        out.append("")

    OUT_FILE.write_text("\n".join(out), encoding="utf-8")
    total = sum(len(b) for b in rom_blocks)
    print(f"wrote {OUT_FILE}  ({total} bytes of ROM data, {OUT_FILE.stat().st_size} bytes of JS)")


if __name__ == "__main__":
    main()
