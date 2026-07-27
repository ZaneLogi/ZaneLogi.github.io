# extract_masks.py — extract the 1bpp terrain-removal masks from MAIN.DAT section 1.
#
# OFFLINE build tool. Reads a *local* copy of the original DOS MAIN.DAT and emits
# ../assets/dat_masks.js — the bash / mine / explosion masks as Uint8 arrays.
# The original file is never copied into the repo.
#
# WHY Uint8 arrays (not a PNG): a mask is not a picture, it is data the SIMULATION
# reads per-pixel (design_spec §16): a set bit (1) removes the terrain pixel it
# covers, a clear bit (0) leaves it. Baking as plain arrays means the sim reads
# them directly with no image decode. (See §16 for application; the renderer can
# reuse the same shape as a destination-out eraser stamp.)
#
# Layout (Lemmix src/Styles.Base.pas Msk(...)): each mask has its own byte offset
# into decompressed section 1; within a mask, frames are consecutive. Offsets are
# self-checked by the frame-size chain (frameBytes = w * h * 1 / 8).
#
# Usage:  python extract_masks.py <dos-lemmings-dir>
#   e.g.  python extract_masks.py C:/Z_Temp/Lemm/lemmings_dos

import os
import sys

from binary_reader import BinaryReader
from file_container import FileContainer

# name, section-1 offset, frames, w, h   (bpp is always 1)
# bash/mine are mirrored (L = "_rtl", facing left); explosion is symmetric.
# The countdown digits ($0154) are HUD art (§21), not a terrain mask — excluded.
MASKS = [
    ("bash",      0x0000, 4, 16, 10),
    ("bash_rtl",  0x0050, 4, 16, 10),
    ("mine",      0x00A0, 2, 16, 13),
    ("mine_rtl",  0x00D4, 2, 16, 13),
    ("explosion", 0x0108, 1, 16, 22),
]

HEADER = """// lemmings/assets/dat_masks.js
//
// Terrain-removal masks (bash / mine / explosion) from MAIN.DAT section 1,
// extracted by tools/extract_masks.py. These are SIMULATION data, not art.
//
// FORMAT
//   MASKS[name] = { w, h, frames: [ Uint8Array(w*h), ... ] }
//   Each frame is row-major (index = y*w + x). A value of 1 means "remove the
//   terrain pixel here"; 0 means "leave it" (design_spec §16.1).
//
// HOW THE SIM APPLIES ONE (design_spec §16)
//   for (my = 0; my < h; my++)
//     for (mx = 0; mx < w; mx++)
//       if (frame[my*w + mx]) removeTerrain(x0 + mx, y0 + my);
//   Placement comes from the handler: bash/mine at the sprite origin
//   (x - footX, y - footY); explosion at the fixed (x - 8, y - 14) (§16.2-16.4).
//
// PROVENANCE
//   Shapes decoded from the original MAIN.DAT; layout/offsets from Lemmix
//   src/Styles.Base.pas Msk(...). bash/mine are mirrored (\"_rtl\" = facing left),
//   explosion is symmetric. Countdown digits are HUD art (§21), not included.
"""


def decompress_section(main_dat_path, index):
    with open(main_dat_path, "rb") as f:
        data = f.read()
    container = FileContainer(BinaryReader(data, filename="MAIN.DAT"))
    part = container.get_part(index)
    part.set_offset(0)
    return bytes(part.read_byte() for _ in range(part.length))


def decode_mask_frame(sec, base, w, h):
    """1bpp planar decode: one plane, pixel = bit (MSB-first). Returns w*h list of 0/1."""
    line_size = w // 8
    out = []
    for y in range(h):
        for x in range(w):
            byte = sec[base + y * line_size + (x // 8)]
            out.append((byte >> (7 - (x % 8))) & 1)
    return out


def main():
    if len(sys.argv) < 2:
        print("usage: python extract_masks.py <dos-lemmings-dir>")
        sys.exit(1)
    main_dat = os.path.join(sys.argv[1], "MAIN.DAT")
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.normpath(os.path.join(here, "..", "assets"))
    os.makedirs(out_dir, exist_ok=True)
    out_js = os.path.join(out_dir, "dat_masks.js")

    sec1 = decompress_section(main_dat, 1)
    print(f"section 1: {len(sec1)} bytes")

    decoded = {}  # name -> list of frames (each a w*h list)
    lines = [HEADER, "export const MASKS = {"]
    for (name, offset, frames, w, h) in MASKS:
        frame_bytes = (w // 8) * h
        lines.append(f"  {name}: {{ w: {w}, h: {h}, frames: [")
        decoded[name] = []
        for k in range(frames):
            base = offset + k * frame_bytes
            data = decode_mask_frame(sec1, base, w, h)
            decoded[name].append((w, h, data))
            lines.append(f"    new Uint8Array([ // frame {k}  ({w}x{h}, 1 = remove)")
            for y in range(h):
                row = data[y * w:(y + 1) * w]
                lines.append("      " + ",".join(str(v) for v in row) + ",")
            lines.append("    ]),")
        lines.append("  ]},")
    lines.append("};")
    lines.append("")

    with open(out_js, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"wrote {out_js}")

    # --- verification: render a couple of masks as ASCII ---
    def show(name, k):
        w, h, data = decoded[name][k]
        print(f"--- {name} frame {k} ({w}x{h}) ---")
        for y in range(h):
            print("  " + "".join("#" if data[y * w + x] else "." for x in range(w)))

    show("bash", 0)
    show("mine", 0)
    show("explosion", 0)


if __name__ == "__main__":
    main()
