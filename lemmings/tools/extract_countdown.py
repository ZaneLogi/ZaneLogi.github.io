# extract_countdown.py — extract the countdown-digit HUD glyphs from MAIN.DAT.
#
# OFFLINE build tool. Reads a *local* copy of the original DOS MAIN.DAT and emits
# ../assets/countdown.png — the five countdown digits (5..1) as an 8x40 strip.
# The original file is never copied into the repo.
#
# These are the little numbers that appear over a lemming with a lit fuse
# (design_spec §21.3). They live in MAIN.DAT section 1 alongside the terrain masks
# (Lemmix src/Styles.Base.pas: Msk($0154, 'Countdown digits', 5, 8, 8, 1)), but they
# are HUD ART, not a simulation mask (unlike dat_masks.js) — so we emit a PNG.
#
# Layout: 5 frames of 8x8, 1bpp, stacked vertically (digit 5 on top .. 1 on bottom),
# matching the reference draw `SrcRect.Offset(0, (5-Digit)*8)` (Lemmix Game.pas:2633).
# Set bits are drawn opaque; clear bits transparent. Colour is free (§21.3) — white.
#
# Usage:  python extract_countdown.py <dos-lemmings-dir>
#   e.g.  python extract_countdown.py C:/Z_Temp/Lemm/lemmings_dos

import os
import sys
from PIL import Image

from binary_reader import BinaryReader
from file_container import FileContainer

OFFSET = 0x0154   # section-1 byte offset (Lemmix Styles.Base.pas Msk(...))
FRAMES = 5        # digits 5,4,3,2,1 (top to bottom)
W, H = 8, 8
COLOR = (255, 255, 255)   # digit colour is free (§21.3); white reads over any background


def decompress_section(main_dat_path, index):
    with open(main_dat_path, "rb") as f:
        data = f.read()
    container = FileContainer(BinaryReader(data, filename="MAIN.DAT"))
    part = container.get_part(index)
    part.set_offset(0)
    return bytes(part.read_byte() for _ in range(part.length))


def decode_frame(sec, base, w, h):
    """1bpp planar decode (MSB-first): returns a w*h list of 0/1 (row-major)."""
    line_size = w // 8   # 8//8 = 1 byte per row
    out = []
    for y in range(h):
        for x in range(w):
            byte = sec[base + y * line_size + (x // 8)]
            out.append((byte >> (7 - (x % 8))) & 1)
    return out


def main():
    if len(sys.argv) < 2:
        print("usage: python extract_countdown.py <dos-lemmings-dir>")
        sys.exit(1)
    main_dat = os.path.join(sys.argv[1], "MAIN.DAT")
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.normpath(os.path.join(here, "..", "assets"))
    os.makedirs(out_dir, exist_ok=True)
    out_png = os.path.join(out_dir, "countdown.png")

    sec1 = decompress_section(main_dat, 1)
    print(f"section 1: {len(sec1)} bytes")

    frame_bytes = (W // 8) * H   # 1 * 8 = 8 bytes per digit
    img = Image.new("RGBA", (W, H * FRAMES), (0, 0, 0, 0))
    px = img.load()
    frames = []
    for k in range(FRAMES):
        base = OFFSET + k * frame_bytes
        data = decode_frame(sec1, base, W, H)
        frames.append(data)
        for y in range(H):
            for x in range(W):
                if data[y * W + x]:
                    px[x, k * H + y] = (COLOR[0], COLOR[1], COLOR[2], 255)

    img.save(out_png)
    print(f"wrote {out_png}  ({W}x{H * FRAMES}, {FRAMES} digits 5..1 top-to-bottom)")

    # verification: ASCII render each digit cell
    for k in range(FRAMES):
        print(f"--- cell {k}  (digit {5 - k}) ---")
        d = frames[k]
        for y in range(H):
            print("  " + "".join("#" if d[y * W + x] else "." for x in range(W)))


if __name__ == "__main__":
    main()
