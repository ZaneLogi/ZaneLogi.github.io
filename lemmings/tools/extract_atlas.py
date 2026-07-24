# extract_atlas.py — build the lemming sprite atlas from the original MAIN.DAT.
#
# OFFLINE build tool. Reads a *local* copy of the original DOS Lemmings files
# (MAIN.DAT + GROUND0O.DAT) and emits ONE derivative asset — a 4bpp indexed PNG
# atlas — into ../assets/. The original files are never copied into the repo.
#
# Pipeline (matches Lemmix src/Dos.Bitmaps.pas + Styles.Base.pas exactly):
#   1. Decompress MAIN.DAT via the existing tools/ unpacker -> section 0.
#   2. Planar-decode each of the 28 lemming animations (GetPix algorithm).
#   3. Palette from GROUND0O.DAT: VGA_PaletteStandard(0-7) + VGA_PaletteCustom(8-15).
#   4. Pack one animation per row (frames left-to-right) into a 4bpp indexed PNG,
#      palette index 0 = transparent (tRNS).
#
# Usage:  python extract_atlas.py <path-to-dos-lemmings-dir>
#   e.g.  python extract_atlas.py C:/Z_Temp/Lemm/lemmings_dos

import os
import sys
from PIL import Image

from binary_reader import BinaryReader
from file_container import FileContainer

# --- the 28 lemming animations (MAIN.DAT section 0 order) -------------------
# offset, name, frames, width, height, bpp  — from Lemmix Styles.Base.pas.
ANIMS = [
    (0x0000, "walking",       8, 16, 10, 2),
    (0x0140, "jumping",       1, 16, 10, 2),
    (0x0168, "walking_rtl",   8, 16, 10, 2),
    (0x02A8, "jumping_rtl",   1, 16, 10, 2),
    (0x02D0, "digging",      16, 16, 14, 3),
    (0x0810, "climbing",      8, 16, 12, 2),
    (0x0990, "climbing_rtl",  8, 16, 12, 2),
    (0x0B10, "drowning",     16, 16, 10, 2),
    (0x0D90, "hoisting",      8, 16, 12, 2),
    (0x0F10, "hoisting_rtl",  8, 16, 12, 2),
    (0x1090, "building",     16, 16, 13, 3),
    (0x1570, "building_rtl", 16, 16, 13, 3),
    (0x1A50, "bashing",      32, 16, 10, 3),
    (0x21D0, "bashing_rtl",  32, 16, 10, 3),
    (0x2950, "mining",       24, 16, 13, 3),
    (0x30A0, "mining_rtl",   24, 16, 13, 3),
    (0x37F0, "falling",       4, 16, 10, 2),
    (0x3890, "falling_rtl",   4, 16, 10, 2),
    (0x3930, "umbrella",      8, 16, 16, 3),
    (0x3C30, "umbrella_rtl",  8, 16, 16, 3),
    (0x3F30, "splatting",    16, 16, 10, 2),
    (0x41B0, "exiting",       8, 16, 13, 2),
    (0x4350, "vaporizing",   14, 16, 14, 4),
    (0x4970, "blocking",     16, 16, 10, 2),
    (0x4BF0, "shrugging",     8, 16, 10, 2),
    (0x4D30, "shrugging_rtl", 8, 16, 10, 2),
    (0x4E70, "ohnoing",      16, 16, 10, 2),
    (0x50F0, "exploding",     1, 32, 32, 3),
]


def decompress_section0(main_dat_path):
    """Decompress MAIN.DAT and return section 0 (lemming animations) as bytes."""
    with open(main_dat_path, "rb") as f:
        data = f.read()
    container = FileContainer(BinaryReader(data, filename="MAIN.DAT"))
    part = container.get_part(0)
    part.set_offset(0)
    return bytes(part.read_byte() for _ in range(part.length))


def read_palette(ground_path):
    """Assemble the 16-colour in-level palette from GROUND?O.DAT.

    TDosGroundRec layout (1056 bytes): VGA_PaletteCustom @984, VGA_PaletteStandard
    @1008, each 8 x (R,G,B) with 6-bit channels (0..63). Convert 6->8 bit via <<2.
    Assembled palette = standard(0..7) + custom(8..15).
    """
    with open(ground_path, "rb") as f:
        g = f.read()

    def pal8(off):
        return [((g[off + i*3] << 2), (g[off + i*3 + 1] << 2), (g[off + i*3 + 2] << 2))
                for i in range(8)]

    standard = pal8(1008)
    custom = pal8(984)
    return standard + custom  # 16 entries


def get_pix(sec, base, x, y, width, height, bpp):
    """Planar pixel read — port of Lemmix TDosPlanarBitmap.GetPix.
    Planes stored consecutively; plane i contributes bit i; MSB-first bits."""
    line_size = width // 8
    plane_size = line_size * height
    p = y * line_size + (x // 8)
    mask = 1 << (7 - (x % 8))
    val = 0
    for i in range(bpp):
        if sec[base + p + i * plane_size] & mask:
            val |= (1 << i)
    return val


def decode_anim(sec, offset, frames, w, h, bpp):
    """Return a list of frames, each an h x w grid of palette indices."""
    line_size = w // 8
    frame_bytes = line_size * h * bpp
    out = []
    for k in range(frames):
        base = offset + k * frame_bytes
        frame = [[get_pix(sec, base, x, y, w, h, bpp) for x in range(w)]
                 for y in range(h)]
        out.append(frame)
    return out


def main():
    if len(sys.argv) < 2:
        print("usage: python extract_atlas.py <dos-lemmings-dir>")
        sys.exit(1)
    dos_dir = sys.argv[1]
    main_dat = os.path.join(dos_dir, "MAIN.DAT")
    ground = os.path.join(dos_dir, "GROUND0O.DAT")

    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.normpath(os.path.join(here, "..", "assets"))
    os.makedirs(out_dir, exist_ok=True)
    out_png = os.path.join(out_dir, "lemmings_atlas.png")

    sec0 = decompress_section0(main_dat)
    palette = read_palette(ground)
    print(f"section 0: {len(sec0)} bytes")
    print("palette:", palette)

    # atlas layout: one animation per row, frames left-to-right.
    atlas_w = max(frames * w for (_o, _n, frames, w, _h, _b) in ANIMS)
    atlas_h = sum(h for (_o, _n, _f, _w, h, _b) in ANIMS)
    print(f"atlas: {atlas_w} x {atlas_h}")

    img = Image.new("P", (atlas_w, atlas_h), 0)
    flat = []
    for (r, g, b) in palette:
        flat += [r, g, b]
    img.putpalette(flat)

    px = img.load()
    layout = []
    row_y = 0
    for (offset, name, frames, w, h, bpp) in ANIMS:
        anim = decode_anim(sec0, offset, frames, w, h, bpp)
        for k, frame in enumerate(anim):
            fx = k * w
            for y in range(h):
                for x in range(w):
                    px[fx + x, row_y + y] = frame[y][x]
        layout.append((name, 0, row_y, w, h, frames))
        row_y += h

    # 4bpp indexed PNG; palette index 0 -> transparent (tRNS).
    img.save(out_png, bits=4, transparency=0)
    print(f"wrote {out_png}")
    print("rows (name, x, y, w, h, frames):")
    for row in layout:
        print("  ", row)


if __name__ == "__main__":
    main()
