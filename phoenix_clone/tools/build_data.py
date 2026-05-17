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

# Path is per-PC; both known paths are tried (see phoenix_clone/CLAUDE.md).
_ROM_CANDIDATES = [
    Path("D:/tmp/computer_archeology_phonenix/content/Arcade/Phoenix/roms"),
    Path("C:/Z_Temp/computer_archeology_phoenix/content/Arcade/Phoenix/roms"),
]
ROM_DIR = next((p for p in _ROM_CANDIDATES if p.is_dir()), _ROM_CANDIDATES[0])
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
    # source T1540 — 192-byte alien formation table: 6 sub-tables of 16
    # (X, Y) pairs at $1540/$1560/$1580/$15A0/$15C0/$15E0. The
    # FORMATION_INDEX LSB selects which sub-table this stage uses (see
    # FORMATION_LABELS below for per-sub-table boundaries and the in-game
    # level each is used at). NOTE: an earlier extraction was 256 bytes,
    # but the trailing 64 bytes at $1600-$163F belong to T1600 (shape-LSB
    # pointer table) and T1620 (player bullet pre-shift tiles), not
    # formations — they're separate exports below.
    ("ALIEN_FORMATIONS", 0x1540, 192),
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
    # source $17B0..$17F5 — alien-kill explosion machinery as one
    # contiguous 70-byte slice. Layout:
    #   $17B0..$17B7 — T17B0 (8 LSBs of frame addresses, indexed by
    #                  (explosionCounter & 0x0E) >> 1)
    #   $17B8..$17BD — frame #1 tiles (3x2 column-major)
    #   $17BE..$17C3 — frame #2 tiles
    #   $17C4..$17C9 — frame #3 tiles
    #   $17CA..$17CF — frame #4 tiles
    #   $17D0..$17DB — bonus-explosion tiles (left + right; step 11)
    #   $17DC..$17EF — padding + CoinChecking code (never indexed)
    #   $17F0..$17F5 — frame #5 head (FourByFourEmpty: all-zero blank)
    # Lookup at runtime:
    #   idx       = (counter & 0x0E) >> 1
    #   frameLsb  = ROM[idx]                       (= T17B0[idx])
    #   frameBase = frameLsb - 0xB0                (offset into this slice)
    #   tiles[k]  = ROM[frameBase + k]             (k = 0..5)
    # L0FC0 / L0FD8 consume this; step 10.
    ("ALIEN_EXPLOSION_ROM", 0x17B0, 70),
    # source T3300 — 8-byte table mapping relative alien-X distance
    # (8 distance buckets) to a column index used by T3310.
    # AlienBehaviorUpdate $3000 sub-state 5 ($31B4). §6.4.
    ("PATTERN_COL_TABLE", 0x3300, 8),
    # source T3310 — 32-byte table: (col_offset*4 + row 0-3) → byte
    # offset into T3330 region. Lower 16 bytes ($3310-$331F) used when
    # alien is RIGHT of player (lr=0); upper 16 bytes ($3320-$332F)
    # used when alien is LEFT of player (lr=4, since L31B4 adds 4 to
    # the column offset before *4). §6.4.
    ("PATTERN_ROW_TABLE", 0x3310, 32),
    # source T3330+ — extended pattern address table. The source uses
    # `LD L,A / LD H,$33` to address into this region with LSB =
    # (T3310 value) + (random & 6). T3310 values span $30-$F8 across
    # all 32 entries (lower 16 = alien-right-of-player, upper 16 =
    # alien-left-of-player), so worst-case LSB = $F8 + $06 = $FE,
    # plus +1 for the LSB byte = $FF. Extracting 208 bytes covers
    # $3330-$33FF. Stored as raw bytes so the lookup uses byte-offset
    # addressing directly, matching source semantics. §6.4.
    ("PATTERN_ADDR_TABLE", 0x3330, 208),
    # Path-data ROM slices used by getPathByte() for alien path traversal.
    # Path data lives in two regions of the CPU ROM:
    #   0x1000-0x13FF — drift loop (T1000) + 18 closed-loop patterns (T1020-T13D0)
    #   0x2C00-0x2FFF — 18 more closed-loop patterns (T2C00-T2FA0)
    #     including the two angry-pattern swoops at T2E00/T2E40
    # The 6 KB between is graphics/code; not exported. getPathByte dispatches
    # on ptr range: ptr<0x1400 → PATH_ROM_LOW[ptr - 0x1000];
    # else → PATH_ROM_HIGH[ptr - 0x2C00].
    # See PATH_PATTERN_LABELS below for per-pattern boundaries; the format
    # routine emits one labeled block per pattern in the generated data.js.
    ("PATH_ROM_LOW",  0x1000, 0x0400),
    ("PATH_ROM_HIGH", 0x2C00, 0x0400),
    # source T1C00 — 256-byte starfield "without planets, used to erase
    # mothership". Selected by stage init T05A8 ($43B2/$43B3 = $1C/$00)
    # for stages 0 / 5 / 7 (the "1st alien wave" + bird waves). Walked
    # by StarsScrollDown $0699 with INC L wrap (low byte only) — so the
    # 256-byte page is the natural extraction size.
    ("STARFIELD_T1C00", 0x1C00, 256),
    # source T1F00 — 256-byte starfield "without planets". Selected by
    # stage init T05C0 ($43B2/$43B3 = $1F/$00) for stage 2 (2nd alien
    # wave) and by T05B4 (mothership waves; deferred to step 11).
    ("STARFIELD_T1F00", 0x1F00, 256),
    # source T1E00..T1EDF — background-overlay tables for the periodic
    # planet (2x2) and galaxy (1x1) fills. Each is 32 bytes; layout:
    #   $1E00 T1E00 — PLANET_TILES   (8 entries × 4-tile 2x2 sprite data)
    #   $1E20 T1E20 — PLANET_MSB     (screen-RAM MSBs, one per entry)
    #   $1E40 T1E40 — PLANET_LSB_OFF (screen-RAM LSB offsets within column)
    #   $1E60 T1E60 — PLANET_COL_LSB (screen-RAM LSBs, per column)
    #   $1E80 T1E80 — GALAXY_TILES   (16 entries × single 1x1 tile)
    #   $1EA0 T1EA0 — GALAXY_MSB     (screen-RAM MSBs, one per entry)
    #   $1EC0 T1EC0 — GALAXY_LSB     (screen-RAM LSBs, one per entry)
    # AddPlanetsToBackground ($06B0) / AddGalaxiesToBackground ($2040)
    # index these by counters in stageBlock[0..5]. Step 3.3.
    ("PLANET_TILES",   0x1E00, 32),
    ("PLANET_MSB",     0x1E20, 32),
    ("PLANET_LSB_OFF", 0x1E40, 32),
    ("PLANET_COL_LSB", 0x1E60, 32),
    ("GALAXY_TILES",   0x1E80, 32),
    ("GALAXY_MSB",     0x1EA0, 32),
    ("GALAXY_LSB",     0x1EC0, 32),
]


# Pattern boundaries within the two PATH_ROM_* slices.
# Mirrors the `T1020:` / `T1064:` / ... labels in
# Code.md $1020-$13D0 and $2C00-$2FA0 so the generated arrays
# read self-describingly. Each entry: (address, label, description).
# These are used by format_path_rom() to insert `// label` comments
# at the right byte offset in the emitted Uint8Array literal, and to
# build the PATTERNS dictionary export so JS code can reference
# patterns by name (e.g. PATTERNS.T1020).
PATH_PATTERN_LABELS = [
    # PATH_ROM_LOW — drift + 18 closed-loop patterns
    (0x1000, "T1000", "Formation drift (R×4, L×8, R×4)"),
    (0x1020, "T1020", "Pattern 1"),
    (0x1064, "T1064", "Pattern 2"),
    (0x10A8, "T10A8", "Pattern 3 (phase 3)"),
    (0x10D4, "T10D4", "Pattern 4"),
    (0x1100, "T1100", "Pattern 5"),
    (0x1130, "T1130", "Pattern 6"),
    (0x1160, "T1160", "Pattern 7"),
    (0x11A4, "T11A4", "Pattern 8"),
    (0x11D0, "T11D0", "Pattern 9"),
    (0x1200, "T1200", "Pattern 10"),
    (0x1244, "T1244", "Pattern 11"),
    (0x1288, "T1288", "Pattern 12"),
    (0x12CA, "T12CA", "Pattern 13"),
    (0x1300, "T1300", "Pattern 14"),
    (0x1328, "T1328", "Pattern 15"),
    (0x1354, "T1354", "Pattern 16"),
    (0x139C, "T139C", "Pattern 17"),
    (0x13D0, "T13D0", "Pattern 18"),

    # PATH_ROM_HIGH — 18 more closed-loop patterns (continued below)
    (0x2C00, "T2C00", "Pattern 19"),
    (0x2C34, "T2C34", "Pattern 20"),
    (0x2C90, "T2C90", "Pattern 21"),
    (0x2CC8, "T2CC8", "Pattern 22"),
    (0x2D00, "T2D00", "Pattern 23"),
    (0x2D44, "T2D44", "Pattern 24"),
    (0x2D88, "T2D88", "Pattern 25"),
    (0x2DC0, "T2DC0", "Pattern 26"),
    (0x2E00, "T2E00", "Pattern 27 — angry, playerX bit 0 == 1"),
    (0x2E20, "T2E20", "Pattern 28"),
    (0x2E40, "T2E40", "Pattern 29 — angry, playerX bit 0 == 0"),
    (0x2E6C, "T2E6C", "Pattern 30"),
    (0x2E90, "T2E90", "Pattern 31"),
    (0x2EC4, "T2EC4", "Pattern 32"),
    (0x2F00, "T2F00", "Pattern 33"),
    (0x2F34, "T2F34", "Pattern 34"),
    (0x2F64, "T2F64", "Pattern 35"),
    (0x2FA0, "T2FA0", "Pattern 36"),
]


# Sub-table boundaries within ALIEN_FORMATIONS. Each formation is a
# 32-byte block of 16 (X, Y) pairs giving the starting (x, y) of each
# alien for one or more stages. FORMATION_INDEX (T063A) maps
# (LevelAndRound RRCA & 0xF) → sub-table LSB, so multiple stages
# share the same formation (see research_stage_structure.md §4.2).
# Comments mirror Code.md's "Level N initial screen coordinates" labels.
FORMATION_LABELS = [
    (0x1540, "T1540", "Stages 0x02-0x03 (fade-in second wave, round 1)"),
    (0x1560, "T1560", "Level 1 — stages 0x00-0x01 (round 1 alien combat)"),
    (0x1580, "T1580", "Level 10 — stages 0x14-0x1B (round 2 later combat)"),
    (0x15A0, "T15A0", "Level 7 — stages 0x12-0x13 (round 2 fade-in 2nd wave)"),
    (0x15C0, "T15C0", "Level 6 — stages 0x10-0x11 (round 2 fade-in 1st wave)"),
    (0x15E0, "T15E0", "Level 5 — stages 0x04-0x0B (round 1 later combat)"),
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


def format_formations(data: bytes, base_addr: int, indent: str = "    ") -> str:
    """
    Emit ALIEN_FORMATIONS as labeled 32-byte blocks, one per sub-table.
    Each row inside a block is one alien's (X, Y) pair (16 aliens per
    sub-table, 32 bytes). Tag each row with the alien index so the
    formation reads like a position table at a glance.
    """
    lines = []
    for i, (addr, lbl, desc) in enumerate(FORMATION_LABELS):
        seg_start = addr - base_addr
        lines.append(f"{indent}// {lbl} (${addr:04X}): {desc}")
        for alien_idx in range(16):
            off = seg_start + alien_idx * 2
            x_byte = data[off]
            y_byte = data[off + 1]
            lines.append(
                f"{indent}0x{x_byte:02X}, 0x{y_byte:02X},  "
                f"// i={alien_idx:2d}: (x={x_byte}, y={y_byte})"
            )
    return "\n".join(lines)


def format_path_rom(data: bytes, base_addr: int, indent: str = "    ",
                    per_row: int = 16) -> str:
    """
    Emit a path-ROM slice as labeled per-pattern blocks. Each pattern in
    PATH_PATTERN_LABELS that falls within [base_addr, base_addr+len(data))
    gets a `// label (addr): description` header before its bytes. The
    bytes for a pattern run from its label address up to (but not
    including) the next pattern's label address, which keeps the
    inter-pattern 0x00 terminator + 0xFF padding visible at the tail of
    each block — matching Code.md's layout.
    """
    end_addr = base_addr + len(data)
    labels = sorted(
        (addr, lbl, desc) for addr, lbl, desc in PATH_PATTERN_LABELS
        if base_addr <= addr < end_addr
    )

    lines = []
    for i, (addr, lbl, desc) in enumerate(labels):
        next_addr = labels[i + 1][0] if i + 1 < len(labels) else end_addr
        seg_start = addr - base_addr
        seg_end   = next_addr - base_addr

        lines.append(f"{indent}// {lbl} (${addr:04X}): {desc}")
        for byte_idx in range(seg_start, seg_end, per_row):
            row = data[byte_idx:min(byte_idx + per_row, seg_end)]
            lines.append(indent + ", ".join(f"0x{b:02X}" for b in row) + ",")

    return "\n".join(lines)


def format_patterns_dict(indent: str = "    ") -> str:
    """
    Emit the PATTERNS dictionary export — maps each pattern label to
    its ROM address so JS code can reference patterns by name.
    """
    lines = []
    for addr, lbl, desc in PATH_PATTERN_LABELS:
        lines.append(f"{indent}{lbl}: 0x{addr:04X},  // {desc}")
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
        if name in ("PATH_ROM_LOW", "PATH_ROM_HIGH"):
            # Emit with per-pattern boundary comments (mirrors Code.md).
            out.append(format_path_rom(slice_bytes, offset))
        elif name == "ALIEN_FORMATIONS":
            # Emit with per-sub-table boundary comments and per-alien
            # position annotations (mirrors Code.md T1540/T1560/...).
            out.append(format_formations(slice_bytes, offset))
        else:
            out.append(format_bytes(slice_bytes))
        out.append("]);")
        out.append("")

    # PATTERNS — pattern-label → ROM address map. Lets JS reference
    # closed-loop patterns by name (e.g. PATTERNS.T1020) instead of magic
    # numbers. Mirrors the Tnnnn labels in Code.md $1020-$13D0 / $2C00-$2FA0.
    out.append("// PATTERNS — pattern label → ROM address. 36 closed-loop")
    out.append("// swoop patterns plus T1000 (formation drift). See")
    out.append("// research_enemy_motion.md §3.3 / §6.4 for usage.")
    out.append("export const PATTERNS = {")
    out.append(format_patterns_dict())
    out.append("};")
    out.append("")

    OUT_FILE.write_text("\n".join(out), encoding="utf-8")
    total = sum(len(b) for b in rom_blocks)
    print(f"wrote {OUT_FILE}  ({total} bytes of ROM data, {OUT_FILE.stat().st_size} bytes of JS)")


if __name__ == "__main__":
    main()
