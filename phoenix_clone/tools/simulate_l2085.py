#!/usr/bin/env python3
# Simulate Phoenix's $2085 scattered-debris engine.
#
# Reads maincpu.bin, extracts T2800/T2900/T2A00/T2B00, walks $2085 for
# each of the 8 CounterA5-derived windows, outputs (col, row, tile)
# tuples per window. Drives section 6-8 of research_explosion_visual.md.
#
# Coordinate convention (matches research_coordinate_system.md):
#   - INC E in source screen-RAM = +1 row DOWN in canvas
#   - SUB $20 from E (RightOneColumn $0217) = +1 column RIGHT in canvas
#   - so SUB $30 from E (the $20D6 adjustment) = +1 col right, -16 rows
#
# The walk pattern emerges from the $20C8 RRCA bit-0 check on T2900 ptr:
#   - byte 0 of pair: 8 cells DOWN (rows 0-7 of column 0)
#   - byte 1 of pair: 8 more cells DOWN (rows 8-15 of column 0)
#   - column shift: -$30 in L = +1 col right, screen-ptr back to row 0
#   - byte 2 of next pair: 8 cells DOWN (rows 0-7 of column 1)
#   - ... 16 pairs total
#
# Result: 16 cols x 16 rows = 256-cell region per frame.
#
# Usage:
#     python phoenix_clone/tools/simulate_l2085.py

from pathlib import Path

_ROM_CANDIDATES = [
    Path("D:/tmp/computer_archeology_phonenix/content/Arcade/Phoenix/roms"),
    Path("C:/Z_Temp/computer_archeology_phoenix/content/Arcade/Phoenix/roms"),
]
ROM_DIR = next((p for p in _ROM_CANDIDATES if p.is_dir()), _ROM_CANDIDATES[0])
MAINCPU = (ROM_DIR / "maincpu.bin").read_bytes()


def extract(offset, length):
    return bytes(MAINCPU[offset:offset + length])


T2800 = extract(0x2800, 256)
T2900 = extract(0x2900, 256)
T2A00 = extract(0x2A00, 256)
T2B00 = extract(0x2B00, 256)


def compute_l_initial(counterA5):
    """$2085-$2090: L_initial = $E0 - ((CounterA5 - $20) << 2 & $E0)."""
    a = (counterA5 - 0x20) & 0xFF
    a = (a << 2) & 0xFF
    a = a & 0xE0
    return (0xE0 - a) & 0xFF


def simulate_walk(l_initial, control_table, tile_table):
    """Walk $2085 for one frame starting at control-table offset l_initial.

    Returns list of (col_offset, row_offset, tile_byte) tuples. Offsets
    are relative to the engine's starting screen-ptr (caller-supplied).
    """
    output = []
    de_offset = 0   # T2800/T2A00 ptr (walks linearly through 256 bytes)
    L = l_initial
    col_offset = 0
    row_offset = 0

    # Outer loop: 16 column-pairs (each pair = 2 control bytes = 16 cells)
    for pair in range(16):
        # Byte 0 of pair: 8 cells walked DOWN
        control_byte = control_table[L & 0xFF]
        for bit in range(8):
            bit_set = (control_byte >> bit) & 1
            if bit_set:
                tile = tile_table[de_offset]
                if tile != 0:
                    output.append((col_offset, row_offset, tile))
            row_offset += 1
            de_offset = (de_offset + 1) & 0xFF
        L = (L + 1) & 0xFF

        # Byte 1 of pair: 8 more cells DOWN (no screen-ptr reset)
        control_byte = control_table[L & 0xFF]
        for bit in range(8):
            bit_set = (control_byte >> bit) & 1
            if bit_set:
                tile = tile_table[de_offset]
                if tile != 0:
                    output.append((col_offset, row_offset, tile))
            row_offset += 1
            de_offset = (de_offset + 1) & 0xFF
        L = (L + 1) & 0xFF

        # Column shift: +1 col right in canvas, row back to 0
        # (source $20D6 SUB $30 from screen-ptr L)
        col_offset += 1
        row_offset -= 16

    return output


def density(table):
    return sum(bin(b).count('1') for b in table)


def window_density(table, l_initial):
    return sum(bin(table[(l_initial + i) & 0xFF]).count('1')
               for i in range(32))


def fmt_bytes(data, indent=''):
    lines = []
    for row_start in range(0, len(data), 16):
        row = data[row_start:row_start + 16]
        hex_part = ' '.join(f'{b:02X}' for b in row)
        lines.append(f"{indent}{row_start:04X}: {hex_part}")
    return '\n'.join(lines)


def fmt_bits(data, indent=''):
    lines = []
    for row_start in range(0, len(data), 4):
        row = data[row_start:row_start + 4]
        bin_part = '  '.join(f'{b:08b}' for b in row)
        lines.append(f"{indent}{row_start:04X}:  {bin_part}")
    return '\n'.join(lines)


def emit_section_6():
    print("\n## Section 6 OUTPUT - paste into research_explosion_visual.md\n")

    print("### 6.1 Control-bit density\n")
    print(f"- T2900 (player):     {density(T2900)} / 2048 bits "
          f"= {density(T2900)/2048:.1%} set")
    print(f"- T2B00 (mothership): {density(T2B00)} / 2048 bits "
          f"= {density(T2B00)/2048:.1%} set\n")

    print("Per-window set-bit counts (= cells written per frame):\n")
    print("| L_initial | T2900 (player) | T2B00 (mothership) |")
    print("|-----------|----------------|--------------------|")
    for l_init in [0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0, 0xE0]:
        d_p = window_density(T2900, l_init)
        d_m = window_density(T2B00, l_init)
        print(f"| `${l_init:02X}` | {d_p} | {d_m} |")

    print("\n### 6.2 T2800 (256 bytes, player tile data)\n```")
    print(fmt_bytes(T2800))
    print("```\n")

    print("### 6.3 T2A00 (256 bytes, mothership tile data)\n```")
    print(fmt_bytes(T2A00))
    print("```\n")

    print("### 6.4 T2900 (256 bytes, player control bits)\n```")
    print(fmt_bytes(T2900))
    print("```\n")

    print("### 6.5 T2B00 (256 bytes, mothership control bits)\n```")
    print(fmt_bytes(T2B00))
    print("```\n")


def emit_section_7_8():
    print("\n## Sections 7-8 OUTPUT - paste into research_explosion_visual.md\n")

    for label, ctl, tiles in [
        ("PLAYER",     T2900, T2800),
        ("MOTHERSHIP", T2B00, T2A00),
    ]:
        print(f"\n### {label} explosion frames\n")
        print(f"Per-frame snapshots for the 8 CounterA5 windows. Offsets "
              f"are (col, row) in 8-px cells relative to the engine's "
              f"starting screen-ptr (~one column left + one row up of "
              f"the killed object).\n")
        for l_init in [0xE0, 0xC0, 0xA0, 0x80, 0x60, 0x40, 0x20, 0x00]:
            output = simulate_walk(l_init, ctl, tiles)
            # CounterA5 range for this L_initial
            # L_initial = $E0 - ((A5 - $20) << 2 & $E0)
            # solve: ((A5 - $20) << 2 & $E0) = $E0 - L_initial
            # so (A5 - $20) << 2 in [$E0 - L_initial, $E0 - L_initial + $20)
            # A5 in [$20 + ($E0 - L_initial) >> 2, ..)
            base = ((0xE0 - l_init) >> 2)
            a5_lo = 0x20 + base
            a5_hi = a5_lo + 7
            print(f"#### Window L=${l_init:02X}  (CounterA5 ${a5_lo:02X}-${a5_hi:02X})")
            print(f"- cells written: {len(output)}")
            if output:
                cols = sorted(set(t[0] for t in output))
                rows = sorted(set(t[1] for t in output))
                tiles_used = sorted(set(t[2] for t in output))
                print(f"- col range: {cols[0]}..{cols[-1]}")
                print(f"- row range: {rows[0]}..{rows[-1]}")
                print(f"- tiles: {' '.join(f'${t:02X}' for t in tiles_used)}")
                print(f"- tuples:")
                for col, row, tile in output:
                    print(f"    ({col:>2}, {row:>2}, ${tile:02X})")
            else:
                print("  (empty)")
            print()


if __name__ == "__main__":
    emit_section_6()
    emit_section_7_8()
