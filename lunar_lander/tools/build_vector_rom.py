#!/usr/bin/env python3
"""Build lunar_lander/vector_rom_data.js from the Lunar Lander vector ROM.

Lunar Lander uses the SAME Atari DVG as Asteroids, so the opcode decoder
is identical. Unlike asteroids_clone (which parses a markdown disassembly),
this reads the RAW ROM bytes (034598-01.np3 — the $5000-$57FF picture/glyph
ROM) and walks each glyph subroutine from a known entry address until RTS.

Scope: the letters/font block (A-Z + space). Picture shapes come later.

`decode_opcode()`, `format_op()` and `_signed()` are copied verbatim from
asteroids_clone/tools/build_vector_rom.py (pure DVG byte decode + JS
formatter); see asteroids_clone/docs/research_dvg.md §6 / §10 / §11.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Per-PC raw-ROM paths (first existing wins). The ROM stays OUT of the repo;
# the committed artifact is the decoded vector_rom_data.js this emits.
DEFAULT_ROM_PATHS = [
    Path("C:/Z_Temp/lunar_lander/034598-01.np3"),
    Path("D:/tmp/lunar_lander/034598-01.np3"),  # other PC — fill in when known
]

OUT_PATH = Path(__file__).resolve().parents[1] / "vector_rom_data.js"

# 034598-01.np3 maps at CPU $5000; file offset = addr - ROM_BASE.
ROM_BASE = 0x5000
ROM_END = 0x5800  # one past the $5000-$57FF window

# Letter -> CPU entry address (user-supplied; verified strictly monotonic,
# and each gap matches the decoded glyph length). 26 letters + space, in
# address order. Each glyph subroutine ends in RTS.
GLYPHS = [
    ("A", 0x55BE), ("B", 0x55CE), ("C", 0x55E8), ("D", 0x55F4),
    ("E", 0x5604), ("F", 0x5614), ("G", 0x5622), ("H", 0x5634),
    ("I", 0x5642), ("J", 0x5650), ("K", 0x565C), ("L", 0x5668),
    ("M", 0x5672), ("N", 0x567E), ("O", 0x5688), ("P", 0x5694),
    ("Q", 0x56A2), ("R", 0x56B4), ("S", 0x56C4), ("T", 0x56D2),
    ("U", 0x56DE), ("V", 0x56EA), ("W", 0x56F4), ("X", 0x5702),
    ("Y", 0x570C), ("Z", 0x571A), ("Space", 0x5726),
]


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


def decode_glyph(rom: bytes, start_cpu: int, next_cpu: int | None) -> tuple[list[dict], int]:
    """Walk a glyph subroutine from `start_cpu` until RTS (inclusive).

    Opcode width: VEC (nibble 0-9) and LABS (nibble A) are 4 bytes; every
    other opcode is 2 bytes. Returns (opcodes, end_cpu)."""
    ops: list[dict] = []
    pc = start_cpu - ROM_BASE
    while True:
        if pc + 2 > len(rom):
            raise ValueError(f"glyph @ ${start_cpu:04X}: ran past ROM end")
        word1 = rom[pc] | (rom[pc + 1] << 8)
        op = (word1 >> 12) & 0xF
        width = 4 if op <= 0xA else 2
        if pc + width > len(rom):
            raise ValueError(f"glyph @ ${start_cpu:04X}: opcode runs past ROM end")
        opcode = decode_opcode(ROM_BASE + pc, list(rom[pc:pc + width]))
        ops.append(opcode)
        pc += width
        if opcode["op"] == "RTS":
            break
        if ROM_BASE + pc >= ROM_END:
            raise ValueError(f"glyph @ ${start_cpu:04X}: hit ROM end without RTS")
    return ops, ROM_BASE + pc


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


def emit_js(subs: dict[str, list[dict]], label_to_addr: dict[str, int]) -> str:
    lines = [
        "// lunar_lander/vector_rom_data.js",
        "//",
        "// GENERATED FILE — do not edit by hand.",
        "// Source: 034598-01.np3 (Lunar Lander picture/glyph ROM, CPU $5000-$57FF)",
        "// Build:  python lunar_lander/tools/build_vector_rom.py",
        "// Spec:   asteroids_clone/docs/research_dvg.md §11 (shared DVG format)",
        "//",
        "// Scope: the letters/font block (A-Z + space). Each glyph is a DVG",
        "// subroutine ending in RTS, decoded byte-faithfully from the ROM.",
        "// Picture shapes (lander/terrain/flag/digits) are a later pass.",
        "",
        "export const VROM = {",
    ]
    for name, ops in subs.items():
        addr = label_to_addr[name]
        letter = name[len("Char_"):]
        disp = "space" if letter == "Space" else f"'{letter}'"
        lines.append(f"  // ${addr:04X} — {disp} — {len(ops)} opcodes")
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


def main() -> int:
    rom_path = next((p for p in DEFAULT_ROM_PATHS if p.exists()), None)
    if rom_path is None:
        print("ERROR: 034598-01.np3 not found in any known per-PC path:", file=sys.stderr)
        for p in DEFAULT_ROM_PATHS:
            print(f"  - {p}", file=sys.stderr)
        return 1

    rom = rom_path.read_bytes()
    print(f"reading: {rom_path} ({len(rom)} bytes)")

    subs: dict[str, list[dict]] = {}
    label_to_addr: dict[str, int] = {}
    addr_to_label: dict[int, str] = {}
    warnings: list[str] = []

    for i, (letter, addr) in enumerate(GLYPHS):
        name = f"Char_{letter}"
        next_cpu = GLYPHS[i + 1][1] if i + 1 < len(GLYPHS) else None
        ops, end_cpu = decode_glyph(rom, addr, next_cpu)
        subs[name] = ops
        label_to_addr[name] = addr
        addr_to_label[addr] = name
        if ops[-1]["op"] != "RTS":
            warnings.append(f"{name} (${addr:04X}) does not end with RTS")
        if next_cpu is not None and end_cpu != next_cpu:
            warnings.append(
                f"{name} (${addr:04X}) decoded to ${end_cpu:04X}, "
                f"but next glyph starts at ${next_cpu:04X}"
            )

    # Resolve any JSR/JMP targets against the glyph entry addresses. None are
    # expected for the font block (glyphs are self-contained SVEC + RTS), but
    # handle them so a stray inter-glyph call surfaces as a warning, not a crash.
    for name, ops in subs.items():
        for op in ops:
            if op["op"] in ("JSR", "JMP"):
                cpu = op["_target_word"] * 2 + 0x4000
                op["target"] = addr_to_label.get(cpu, f"_at_{cpu:04X}")
                if op["target"].startswith("_at_"):
                    warnings.append(f"{op['op']} in {name} -> ${cpu:04X} (no matching glyph)")
                del op["_target_word"]

    for w in warnings:
        print(f"  warning: {w}", file=sys.stderr)
    print(f"  decoded {len(subs)} glyphs"
          f"{' — all end in RTS, no warnings' if not warnings else ''}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(emit_js(subs, label_to_addr), encoding="utf-8")
    print(f"wrote:   {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
