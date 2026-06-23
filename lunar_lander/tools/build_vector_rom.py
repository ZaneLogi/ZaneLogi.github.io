#!/usr/bin/env python3
"""Build the Lunar Lander decoded-vector JS modules from the raw vector ROMs.

Lunar Lander uses the SAME Atari DVG as Asteroids, so the opcode decoder is
identical. Unlike asteroids_clone (which parses a markdown disassembly), this
reads RAW ROM bytes and walks each subroutine from a known entry address until
RTS.

Two ROMs / two outputs:
  * 034598-01.np3  (CPU $5000-$57FF)  -> vector_rom_data.js : the A-Z + space font
  * 034599-01.r3   (CPU $4800-$4FFF)  -> lander_rom_data.js : 8 base shapes + 9 tilt poses

`decode_opcode()`, `format_op()` and `_signed()` are copied verbatim from
asteroids_clone/tools/build_vector_rom.py (pure DVG byte decode + JS formatter);
see asteroids_clone/docs/research_dvg.md §6 / §10 / §11.
"""

from __future__ import annotations

import sys
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1]

# --- ROM #1: the font (034598-01.np3, CPU $5000-$57FF) ----------------------
FONT_ROM_PATHS = [
    Path("C:/Z_Temp/lunar_lander/034598-01.np3"),
    Path("D:/tmp/lunar_lander/034598-01.np3"),  # other PC — fill in when known
]
FONT_BASE, FONT_END = 0x5000, 0x5800

# Letter -> CPU entry address (verified strictly monotonic; each gap matches the
# decoded glyph length). 26 letters + space, in address order; each ends in RTS.
GLYPHS = [
    ("A", 0x55BE), ("B", 0x55CE), ("C", 0x55E8), ("D", 0x55F4),
    ("E", 0x5604), ("F", 0x5614), ("G", 0x5622), ("H", 0x5634),
    ("I", 0x5642), ("J", 0x5650), ("K", 0x565C), ("L", 0x5668),
    ("M", 0x5672), ("N", 0x567E), ("O", 0x5688), ("P", 0x5694),
    ("Q", 0x56A2), ("R", 0x56B4), ("S", 0x56C4), ("T", 0x56D2),
    ("U", 0x56DE), ("V", 0x56EA), ("W", 0x56F4), ("X", 0x5702),
    ("Y", 0x570C), ("Z", 0x571A), ("Space", 0x5726),
]

# --- ROM #2: the lander (034599-01.r3, CPU $4800-$4FFF) ----------------------
LANDER_ROM_PATHS = [
    Path("C:/Z_Temp/lunar_lander/034599-01.r3"),
    Path("D:/tmp/lunar_lander/034599-01.r3"),  # other PC — fill in when known
]
LANDER_BASE, LANDER_END = 0x4800, 0x5000

# Base shapes (octagon cabin / box body), one row at $4800-$48F8. Each pose
# JSRs one of these, then adds that angle's legs/thruster SVECs. $4800 is
# shared by pose #0 and the standing pose #8.
LANDER_BASES = [
    ("Base0", 0x4800), ("Base1", 0x4826), ("Base2", 0x4844), ("Base3", 0x486A),
    ("Base4", 0x4890), ("Base5", 0x48AC), ("Base6", 0x48D2), ("Base7", 0x48F8),
]
# 9 tilt poses; #8 ($4B64) is the upright/standing attitude.
LANDER_POSES = [
    ("Pose0", 0x4916), ("Pose1", 0x495C), ("Pose2", 0x49AA), ("Pose3", 0x49F6),
    ("Pose4", 0x4A42), ("Pose5", 0x4A80), ("Pose6", 0x4AC8), ("Pose7", 0x4B16),
    ("Pose8", 0x4B64),
]
LANDER_MASTER = 0x4BA2  # direction dispatch table (9 JSRs) — end-bound for pose #8


def decode_opcode(addr: int, byte_seq: list[int]) -> dict:
    """Decode 2 or 4 bytes at the given CPU address into an opcode dict.

    Verbatim from asteroids_clone; field layouts follow research_dvg.md §6.
    """
    word1 = byte_seq[0] | (byte_seq[1] << 8)
    op = (word1 >> 12) & 0xF

    if op <= 9:
        if len(byte_seq) != 4:
            raise ValueError(f"VEC at ${addr:04X} needs 4 bytes, got {len(byte_seq)}")
        word2 = byte_seq[2] | (byte_seq[3] << 8)
        local_scale = op
        y_sign = (word1 >> 10) & 1
        y_mag = word1 & 0x3FF
        x_sign = (word2 >> 10) & 1
        x_mag = word2 & 0x3FF
        bri = (word2 >> 12) & 0xF
        return {
            "op": "VEC",
            "localScale": local_scale,
            "bri": bri,
            "dx": -x_mag if x_sign else x_mag,
            "dy": -y_mag if y_sign else y_mag,
        }
    if op == 0xA:
        if len(byte_seq) != 4:
            raise ValueError(f"LABS at ${addr:04X} needs 4 bytes, got {len(byte_seq)}")
        word2 = byte_seq[2] | (byte_seq[3] << 8)
        y = word1 & 0x3FF
        x = word2 & 0x3FF
        global_scale = (word2 >> 12) & 0xF
        return {"op": "LABS", "x": x, "y": y, "globalScale": global_scale}
    if op == 0xB:
        return {"op": "HALT"}
    if op == 0xC:
        return {"op": "JSR", "_target_word": word1 & 0x0FFF}
    if op == 0xD:
        return {"op": "RTS"}
    if op == 0xE:
        return {"op": "JMP", "_target_word": word1 & 0x0FFF}
    if op == 0xF:
        # SVEC bit layout: 1111 smYY BBBB SmXX  (per §6)
        s_low = (word1 >> 11) & 1
        s_high = (word1 >> 3) & 1
        scale_mode = (s_high << 1) | s_low
        y_sign = (word1 >> 10) & 1
        y_mag = (word1 >> 8) & 0x3
        bri = (word1 >> 4) & 0xF
        x_sign = (word1 >> 2) & 1
        x_mag = word1 & 0x3
        return {
            "op": "SVEC",
            "scaleMode": scale_mode,
            "bri": bri,
            "dx": -x_mag if x_sign else x_mag,
            "dy": -y_mag if y_sign else y_mag,
        }
    raise ValueError(f"Unknown opcode nibble {op:X} at ${addr:04X}")


def decode_sub(rom: bytes, start_cpu: int, rom_base: int, rom_end: int) -> tuple[list[dict], int]:
    """Walk a subroutine from `start_cpu` until RTS (inclusive).

    Opcode width: VEC (nibble 0-9) and LABS (nibble A) are 4 bytes; everything
    else is 2. Returns (opcodes, end_cpu)."""
    ops: list[dict] = []
    pc = start_cpu - rom_base
    while True:
        if pc + 2 > len(rom):
            raise ValueError(f"sub @ ${start_cpu:04X}: ran past ROM end")
        word1 = rom[pc] | (rom[pc + 1] << 8)
        op = (word1 >> 12) & 0xF
        width = 4 if op <= 0xA else 2
        if pc + width > len(rom):
            raise ValueError(f"sub @ ${start_cpu:04X}: opcode runs past ROM end")
        opcode = decode_opcode(rom_base + pc, list(rom[pc:pc + width]))
        ops.append(opcode)
        pc += width
        if opcode["op"] == "RTS":
            break
        if rom_base + pc >= rom_end:
            raise ValueError(f"sub @ ${start_cpu:04X}: hit region end without RTS")
    return ops, rom_base + pc


def decode_region(
    rom: bytes, base: int, end: int, entries: list[tuple[str, int]],
    label_prefix: str, region_end: int | None = None,
) -> tuple[dict[str, list[dict]], dict[str, int], dict[int, str], list[str]]:
    """Decode every (name, addr) entry in a ROM region. `region_end` is the
    cross-check end address for the LAST entry (the next thing after it);
    intermediate entries cross-check against the following entry's start."""
    subs: dict[str, list[dict]] = {}
    label_to_addr: dict[str, int] = {}
    addr_to_label: dict[int, str] = {}
    warnings: list[str] = []
    for i, (name, addr) in enumerate(entries):
        full = f"{label_prefix}{name}" if label_prefix else name
        next_addr = entries[i + 1][1] if i + 1 < len(entries) else region_end
        ops, end_cpu = decode_sub(rom, addr, base, end)
        subs[full] = ops
        label_to_addr[full] = addr
        addr_to_label[addr] = full
        if ops[-1]["op"] != "RTS":
            warnings.append(f"{full} (${addr:04X}) does not end with RTS")
        if next_addr is not None and end_cpu != next_addr:
            warnings.append(
                f"{full} (${addr:04X}) decoded to ${end_cpu:04X}, "
                f"but next entry starts at ${next_addr:04X}"
            )
    return subs, label_to_addr, addr_to_label, warnings


def resolve_targets(subs: dict[str, list[dict]], addr_to_label: dict[int, str]) -> list[str]:
    """Replace numeric JSR/JMP `_target_word` with symbolic `target` names.
    Target word -> CPU byte = word*2 + 0x4000 (DVG byte 0 == CPU $4000)."""
    warnings: list[str] = []
    for name, ops in subs.items():
        for op in ops:
            if op["op"] in ("JSR", "JMP"):
                cpu = op["_target_word"] * 2 + 0x4000
                op["target"] = addr_to_label.get(cpu, f"_at_{cpu:04X}")
                if op["target"].startswith("_at_"):
                    warnings.append(f"{op['op']} in {name} -> ${cpu:04X} (no matching sub)")
                del op["_target_word"]
    return warnings


def _signed(val: int, width: int) -> str:
    """Right-aligned signed int, but no `+` for zero. Verbatim from asteroids."""
    if val == 0:
        return f"{0:>{width}d}"
    return f"{val:>+{width}d}"


def format_op(op: dict) -> str:
    """Verbatim from asteroids_clone — emits one decoded-object literal."""
    kind = op["op"]
    if kind == "VEC":
        return (
            f"{{op: 'VEC',  localScale: {op['localScale']}, "
            f"bri: {op['bri']:>2}, "
            f"dx: {_signed(op['dx'], 5)}, "
            f"dy: {_signed(op['dy'], 5)}}}"
        )
    if kind == "SVEC":
        return (
            f"{{op: 'SVEC', scaleMode: {op['scaleMode']}, "
            f"bri: {op['bri']:>2}, "
            f"dx: {_signed(op['dx'], 2)}, "
            f"dy: {_signed(op['dy'], 2)}}}"
        )
    if kind == "LABS":
        return (
            f"{{op: 'LABS', x: {op['x']}, y: {op['y']}, "
            f"globalScale: {op['globalScale']}}}"
        )
    if kind == "JSR":
        return f"{{op: 'JSR',  target: '{op['target']}'}}"
    if kind == "JMP":
        return f"{{op: 'JMP',  target: '{op['target']}'}}"
    if kind == "RTS":
        return "{op: 'RTS'}"
    if kind == "HALT":
        return "{op: 'HALT'}"
    raise ValueError(f"Cannot format opcode {op}")


def emit_js(var: str, subs: dict[str, list[dict]], label_to_addr: dict[str, int],
            header: list[str], comment) -> str:
    lines = list(header)
    lines.append("")
    lines.append(f"export const {var} = {{")
    for name, ops in subs.items():
        addr = label_to_addr[name]
        lines.append(f"  // ${addr:04X} — {comment(name)} — {len(ops)} opcodes")
        lines.append(f"  {name}: [")
        for op in ops:
            lines.append(f"    {format_op(op)},")
        lines.append("  ],")
        lines.append("")
    if lines[-1] == "":
        lines.pop()
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def _font_comment(name: str) -> str:
    letter = name[len("Char_"):]
    return "space" if letter == "Space" else f"'{letter}'"


def _lander_comment(name: str) -> str:
    if name.startswith("Base"):
        return f"base shape {name[len('Base'):]} (octagon cabin)"
    if name == "Pose8":
        return "pose 8 — standing/upright"
    return f"pose {name[len('Pose'):]} (tilt)"


def build_font(rom: bytes) -> list[str]:
    entries = [(f"Char_{l}", a) for l, a in GLYPHS]
    subs, label_to_addr, addr_to_label, warnings = decode_region(
        rom, FONT_BASE, FONT_END, entries, label_prefix="")
    warnings += resolve_targets(subs, addr_to_label)
    header = [
        "// lunar_lander/vector_rom_data.js",
        "//",
        "// GENERATED FILE — do not edit by hand.",
        "// Source: 034598-01.np3 (Lunar Lander picture/glyph ROM, CPU $5000-$57FF)",
        "// Build:  python lunar_lander/tools/build_vector_rom.py",
        "// Spec:   asteroids_clone/docs/research_dvg.md §11 (shared DVG format)",
        "//",
        "// Scope: the letters/font block (A-Z + space). Each glyph is a DVG",
        "// subroutine ending in RTS, decoded byte-faithfully from the ROM.",
        "// Picture shapes (lander) live in lander_rom_data.js.",
    ]
    (OUT_DIR / "vector_rom_data.js").write_text(
        emit_js("VROM", subs, label_to_addr, header, _font_comment), encoding="utf-8")
    return [f"font: {len(subs)} glyphs"] + [f"  warning: {w}" for w in warnings]


def build_lander(rom: bytes) -> list[str]:
    base_entries = list(LANDER_BASES)
    pose_entries = list(LANDER_POSES)
    # Bases first (so poses can reference them); the last base end-bounds at the
    # first pose, the last pose end-bounds at the master dispatch table.
    bsubs, blta, bata, bwarn = decode_region(
        rom, LANDER_BASE, LANDER_END, base_entries, "", region_end=pose_entries[0][1])
    psubs, plta, pata, pwarn = decode_region(
        rom, LANDER_BASE, LANDER_END, pose_entries, "", region_end=LANDER_MASTER)

    subs = {**bsubs, **psubs}
    label_to_addr = {**blta, **plta}
    addr_to_label = {**bata, **pata}
    warnings = bwarn + pwarn + resolve_targets(subs, addr_to_label)

    header = [
        "// lunar_lander/lander_rom_data.js",
        "//",
        "// GENERATED FILE — do not edit by hand.",
        "// Source: 034599-01.r3 (Lunar Lander picture ROM #2, CPU $4800-$4FFF)",
        "// Build:  python lunar_lander/tools/build_vector_rom.py",
        "// Spec:   asteroids_clone/docs/research_dvg.md §11 (shared DVG format)",
        "//",
        "// The lander: 8 base shapes (octagon cabin) + 9 tilt poses. Each pose",
        "// JSRs a base shape then adds that angle's legs/thruster SVECs. The",
        "// master direction table at $4BA2 (9 JSRs, tilt-indexed) is not ported;",
        "// the demo renders each pose subroutine directly. Byte-faithful decode.",
    ]
    (OUT_DIR / "lander_rom_data.js").write_text(
        emit_js("LANDER", subs, label_to_addr, header, _lander_comment), encoding="utf-8")
    return [f"lander: {len(bsubs)} base shapes + {len(psubs)} poses"] + \
           [f"  warning: {w}" for w in warnings]


def _load(paths: list[Path], what: str) -> bytes | None:
    p = next((p for p in paths if p.exists()), None)
    if p is None:
        print(f"ERROR: {what} not found in any known per-PC path:", file=sys.stderr)
        for q in paths:
            print(f"  - {q}", file=sys.stderr)
        return None
    print(f"reading: {p} ({p.stat().st_size} bytes)")
    return p.read_bytes()


def main() -> int:
    font_rom = _load(FONT_ROM_PATHS, "034598-01.np3 (font)")
    lander_rom = _load(LANDER_ROM_PATHS, "034599-01.r3 (lander)")
    if font_rom is None or lander_rom is None:
        return 1

    report = build_font(font_rom) + build_lander(lander_rom)
    for line in report:
        (print(line, file=sys.stderr) if line.lstrip().startswith("warning:") else print(line))
    print(f"wrote:   {OUT_DIR / 'vector_rom_data.js'}")
    print(f"wrote:   {OUT_DIR / 'lander_rom_data.js'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
