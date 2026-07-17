#!/usr/bin/env python3
"""
build_sprite_data.py — extract Mario's sprite data from the SMB ROM + disassembly.

Inputs (both live OUTSIDE the repo; see mario_physics/CLAUDE.md):
  --rom  Super Mario Bros. (Japan, USA).nes   NROM-256: 16b header + 32K PRG + 8K CHR
  --asm  SMBDIS.ASM                            doppelganger's disassembly

Nothing in this tool is retyped from either source. The tile IDs, the state->row
offsets and the palette indices are PARSED out of SMBDIS.ASM; the pixels come out
of the ROM's CHR. That is the whole point: a transcription error is impossible
because there is no transcription.

  emit   write assets/dat_tiles.js
"""

import argparse
import os
import re
import sys

# ---------------------------------------------------------------------------
# iNES / CHR
# ---------------------------------------------------------------------------

def read_chr(path):
    """The ROM's CHR bytes. Skips the header + PRG; validates it is the ROM we expect."""
    d = open(path, "rb").read()
    if d[0:4] != b"NES\x1a":
        sys.exit(f"not an iNES file: {path}")
    prg_banks, chr_banks = d[4], d[5]
    mapper = (d[7] & 0xF0) | (d[6] >> 4)
    if mapper != 0:
        sys.exit(f"expected NROM (mapper 0), got mapper {mapper}")
    prg_off = 16 + (512 if (d[6] >> 2) & 1 else 0)
    chr_off = prg_off + prg_banks * 16384
    return d[chr_off:chr_off + chr_banks * 8192]


# ---------------------------------------------------------------------------
# SMBDIS.ASM table parser
# ---------------------------------------------------------------------------

LABEL_RE = re.compile(r"^([A-Za-z_][A-Za-z_0-9]*):")
DB_RE = re.compile(r"^\s*\.db\s+(.*)$")


def parse_db_table(asm_lines, label):
    """Bytes of the .db block introduced by `label:`, up to the next label.

    Returns (flat_bytes, rows) where rows is [(bytes, inline_comment, section)].
    `section` is the most recent standalone comment line -- PlayerGraphicsTable
    separates its three blocks with ';big player table', ';small player table',
    ';used by both player sizes', and those are the only place the size is stated.
    """
    start = None
    for i, line in enumerate(asm_lines):
        m = LABEL_RE.match(line)
        if m and m.group(1) == label:
            start = i
            break
    if start is None:
        sys.exit(f"label not found in ASM: {label}")

    out, rows, section = [], [], ""
    for line in asm_lines[start + 1:]:
        if LABEL_RE.match(line):
            break
        code, _, comment = line.partition(";")
        if not code.strip():
            if comment.strip():
                section = comment.strip()   # standalone comment = a section header
            continue
        m = DB_RE.match(code)
        if not m:
            break  # a real instruction -- the data block is over
        vals = [v.strip() for v in m.group(1).split(",") if v.strip()]
        row = [int(v[1:], 16) if v.startswith("$") else int(v) for v in vals]
        out.extend(row)
        rows.append((row, comment.strip(), section))
    return out, rows


AREA_PALETTE_TABLES = [
    "WaterPaletteData", "GroundPaletteData", "UndergroundPaletteData",
    "CastlePaletteData", "DaySnowPaletteData", "NightSnowPaletteData",
    "MushroomPaletteData", "BowserPaletteData",
]

FRAME_RE = re.compile(r"^frame \d+$")

SECTION_SIZE = {
    "big player table": "big",
    "small player table": "small",
    "used by both player sizes": "both",
}


def frame_meta(rows):
    """(size, name) per 8-byte frame, synthesized from the asm's two comment sources.

    Rows 1/2/6/7/... carry only 'frame 2' / 'frame 3' -- the verb lives on the first
    row of the group ('walking frame 1'), and the size lives on the section header.
    These two fields are the only DERIVED things in assets/dat_tiles.js; everything
    else is verbatim.
    """
    out, base = [], ""
    for vals, comment, section in rows:
        if len(vals) != 8:
            continue
        if FRAME_RE.match(comment):
            name = f"{base} {comment}"          # 'frame 2' -> 'walking frame 2'
        else:
            base = comment.split(" frame ")[0]
            name = comment
        out.append((SECTION_SIZE.get(section, "?"), name))
    return out


# ---------------------------------------------------------------------------

def b64_chunks(raw, width=76):
    import base64
    s = base64.b64encode(raw).decode()
    return [s[i:i + width] for i in range(0, len(s), width)]


def emit(chr_all, asm_lines, out_dir):
    gfx, grows = parse_db_table(asm_lines, "PlayerGraphicsTable")
    offs, _ = parse_db_table(asm_lines, "PlayerGfxTblOffsets")
    pcol, prows = parse_db_table(asm_lines, "PlayerColors")
    swim, _ = parse_db_table(asm_lines, "SwimKickTileNum")
    meta = frame_meta(grows)

    L = []
    A = L.append
    A("// mario_physics/assets/dat_tiles.js")
    A("//")
    A("// GENERATED FILE -- do not edit by hand.")
    A("// Build:  python mario_physics/tools/build_sprite_data.py emit")
    A("//")
    A("")
    A("export const CHR_BASE64 = [")
    for c in b64_chunks(chr_all):
        A(f'  "{c}",')
    A('].join("");')
    A("")
    A("// --- PlayerGraphicsTable --------------------------------------------------")
    A("// 26 frames x 8 tile IDs. A tile is 8x8, a player is 2 tiles wide by 4 tall:")
    A("//   tiles[0] tiles[1]   row 0, y = Y+0..7      tiles[4] tiles[5]   row 2, y = Y+16..23")
    A("//   tiles[2] tiles[3]   row 1, y = Y+8..15     tiles[6] tiles[7]   row 3, y = Y+24..31")
    A("// $fc is the blank tile (all zero). Small Mario's top two rows are $fc, which is")
    A("// what bottom-aligns every size inside one 16x32 block -- the feet rule, free.")
    A("//")
    A("// `size` and `name` are the only DERIVED fields in this file: the asm states the")
    A("// size on a section header comment and the verb on the first row of each group.")
    A("export const FRAMES = [")
    for i, (size, name) in enumerate(meta):
        tiles = ", ".join(f"0x{t:02x}" for t in gfx[i * 8:i * 8 + 8])
        A(f'  {{ off: 0x{i*8:02x}, size: "{size}", name: "{name}",'.ljust(58) +
          f' tiles: [{tiles}] }},')
    A("];")
    A("")
    A("// --- PlayerGfxTblOffsets --------------------------------------------------")
    A("// action -> FRAMES offset. Indexed by the code ProcessPlayerAction picks, +8 for")
    A("// small (GetGfxOffsetAdder). Small can neither crouch nor throw fireballs, so")
    A("// those two slots reuse the killed / standing frames.")
    A("export const GFX_TBL_OFFSETS = [")
    A("  " + ", ".join(f"0x{o:02x}" for o in offs[:8]) +
      ",   // big:   jump swim stand skid walk climb crouch throw")
    A("  " + ", ".join(f"0x{o:02x}" for o in offs[8:]) + ",   // small: same order")
    A("];")
    A("")
    A("// --- SwimKickTileNum ------------------------------------------------------")
    A("// Mario's swim-kick feet, patched over OAM row 3's left tile every 8th frame")
    A("// while swimming (PlayerGfxHandler -> BigKTS). Not reachable from FRAMES.")
    A("export const SWIM_KICK_TILES = [" +
      ", ".join(f"0x{t:02x}" for t in swim) + "];  // [big, small]")
    A("")
    A("// --- PlayerColors ---------------------------------------------------------")
    A("// NES palette *indices*, 4 per palette. Entry 0 is the backdrop; for sprites")
    A("// index 0 is transparent regardless of what it holds.")
    A("export const PLAYER_COLORS = [")
    for i, (vals, comment, _) in enumerate(prows):
        A("  [" + ", ".join(f"0x{v:02x}" for v in vals) + f"],  // {comment}")
    A("];")
    A("")
    A("// --- area palettes --------------------------------------------------------")
    A("// Pre-baked PPU writes: each table opens `$3f, <lo>, <len>` -- write <len> bytes")
    A("// to that PPU address -- then the payload, then $00 to end the block. $3F00 is")
    A("// palette RAM: $3F00-$3F0F are the 4 background palettes, $3F10-$3F1F the 4")
    A("// sprite palettes, 4 entries each.")
    A("//")
    A("// The four 32-byte tables are whole sets; the short ones patch a slice.")
    A("export const AREA_PALETTES = [")
    for label in AREA_PALETTE_TABLES:
        b, _ = parse_db_table(asm_lines, label)
        addr, ln, payload = (b[0] << 8) | b[1], b[2], b[3:3 + b[2]]
        if b[3 + ln] != 0x00:
            sys.exit(f"{label}: expected $00 terminator, got ${b[3 + ln]:02x}")
        name = label.replace("PaletteData", "").lower()
        rows = ",\n".join(
            "      [" + ", ".join(f"0x{v:02x}" for v in payload[i:i + 4]) + "]"
            for i in range(0, len(payload), 4))
        A(f'  {{ name: "{name}", ppu: 0x{addr:04x}, len: 0x{ln:02x}, entries: [')
        A(rows + " ] },")
    A("];")
    A("")
    assets = os.path.join(out_dir, "assets")
    os.makedirs(assets, exist_ok=True)
    path = os.path.join(assets, "dat_tiles.js")
    open(path, "w", newline="\n").write("\n".join(L))
    print(f"wrote {path}  ({len(chr_all)} CHR bytes = {len(chr_all)//16} tiles, "
          f"{len(meta)} frames)")



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", default=r"D:/tmp/smb_disasm/rom/Super Mario Bros. (Japan, USA).nes")
    ap.add_argument("--asm", default=r"D:/tmp/smb_disasm/SMBDIS.ASM")
    ap.add_argument("--out-dir", default=r"D:/tmp/ZaneLogi.github.io/mario_physics")
    # Kept as a positional so the build line stays `... build_sprite_data.py emit`,
    # which is what the generated header tells the reader to run.
    ap.add_argument("mode", choices=["emit"])
    args = ap.parse_args()

    chr_all = read_chr(args.rom)
    asm_lines = open(args.asm, "r", errors="replace").read().splitlines()
    emit(chr_all, asm_lines, args.out_dir)


if __name__ == "__main__":
    main()
