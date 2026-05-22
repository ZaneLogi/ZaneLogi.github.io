#!/usr/bin/env python3
"""Build asteroids_clone/vector_rom_data.js from VectorROM.md.

Parses the topherCantrell/computerarcheology Asteroids VectorROM.md
disassembly, decodes each opcode per docs/research_dvg.md §6 / §10,
and emits a JS module of decoded-object form per §11.

First-pass scope: ship region only (CPU $5290-$54D8 / DVG byte
$1290-$14D8 / 17 ShipDirN + 17 ThrustDirN subroutines).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Per-PC sparse-clone paths; first existing one wins.
DEFAULT_SOURCE_PATHS = [
    Path("D:/tmp/computer_archeology_asteroids/content/Arcade/Asteroids/VectorROM.md"),
    Path("C:/Z_Temp/computer_archeology_asteroids/content/Arcade/Asteroids/VectorROM.md"),
]

OUT_PATH = Path(__file__).resolve().parents[1] / "vector_rom_data.js"

# Ship region in DVG byte addresses (= CPU byte - 0x4000).
SHIP_REGION_START = 0x1290  # CPU $5290 = ShipDir0 entry
SHIP_REGION_END = 0x14D8    # CPU $54D8 = ThrustDir64 final RTS

# Hardcoded synthetic labels + ranges for non-Ship/Thrust subroutines.
# Tuple form: (start_addr, end_addr_inclusive, name). DVG byte addresses
# (= CPU bytes - 0x4000). Sourced from research_vector_rom.md §3. The
# comment-style headers in VectorROM.md (`; Rock Pattern N`, etc.) aren't
# formal labels so we map them by hand. End addresses lets us discard
# opcodes between subroutines (e.g. jump-table JSRs or velocity-table data
# that's machine-readable as opcodes but belongs to neither sub).
# Characters (~36 of them at $14F0+) are deferred to a later iteration.
# Character entry addresses, sourced from the cross-reference table at
# $16D4-$171C in VectorROM.md. Note: digit "0" is an ALIAS for letter "O"
# (same shape at $15BA per the table comment) — emitted once as Char_O.
_CHAR_ENTRIES = [
    ("A", 0x14F0), ("B", 0x1500), ("C", 0x151A), ("D", 0x1526),
    ("E", 0x1536), ("F", 0x1546), ("G", 0x1554), ("H", 0x1566),
    ("I", 0x1574), ("J", 0x1582), ("K", 0x158E), ("L", 0x159A),
    ("M", 0x15A4), ("N", 0x15B0), ("O", 0x15BA), ("P", 0x15C6),
    ("Q", 0x15D4), ("R", 0x15E6), ("S", 0x15F6), ("T", 0x1604),
    ("U", 0x1610), ("V", 0x161C), ("W", 0x1626), ("X", 0x1634),
    ("Y", 0x163E), ("Z", 0x164C),
    ("Space", 0x1658),
    ("1", 0x165C), ("2", 0x1664), ("3", 0x1674), ("4", 0x1682),
    ("5", 0x1690), ("6", 0x169E), ("7", 0x16AC), ("8", 0x16B6),
    ("9", 0x16C6),
]
_CHAR_REGION_END = 0x16D2   # end of Char_9, before cross-reference table


def _char_ranges() -> list[tuple[int, int, str]]:
    """Build (start, end, name) ranges for characters. Each end = next char's
    start - 2 (leaving a 0-byte gap); last char ends at _CHAR_REGION_END."""
    sorted_chars = sorted(_CHAR_ENTRIES, key=lambda kv: kv[1])
    ranges = []
    for i, (label, start) in enumerate(sorted_chars):
        end = sorted_chars[i + 1][1] - 2 if i + 1 < len(sorted_chars) else _CHAR_REGION_END
        ranges.append((start, end, f"Char_{label}"))
    return ranges


EXTRA_SUBS_RANGES = [
    (0x10E0, 0x10EA, "ShipExplosion"),
    (0x1100, 0x112A, "Shrapnel1"),
    (0x112C, 0x1168, "Shrapnel2"),
    (0x116A, 0x119E, "Shrapnel3"),
    (0x11A0, 0x11DC, "Shrapnel4"),
    (0x11E6, 0x11FC, "Rock1"),
    (0x11FE, 0x1218, "Rock2"),
    (0x121A, 0x1232, "Rock3"),
    (0x1234, 0x124E, "Rock4"),
    (0x1252, 0x126C, "UFO"),
    (0x14DA, 0x14EE, "LivesIcon"),
    *_char_ranges(),
]
EXTRA_SUB_NAMES = {name for _, _, name in EXTRA_SUBS_RANGES}

def _find_extra_sub(addr: int) -> tuple[str | None, int | None]:
    """Return (name, start) if addr falls within a known EXTRA_SUB range."""
    for start, end, name in EXTRA_SUBS_RANGES:
        if start <= addr <= end:
            return name, start
    return None, None

# "Include" region: ShipExplosion through end of character set.
# Stops at $16D2 (end of Char_9) to exclude the cross-reference table at
# $16D4-$171C which is data (formatted as JSR opcodes), not subroutines.
INCLUDE_REGION_START = 0x10E0   # CPU $50E0 = ShipExplosion entry
INCLUDE_REGION_END   = 0x16D2   # CPU $56D2 = end of Char_9

LINE_RE = re.compile(
    r"^(?P<addr>[0-9A-Fa-f]{4}):\s+"
    r"(?P<bytes>(?:[0-9A-Fa-f]{2}\s+){2,4})"
    r"(?P<rest>.*)$"
)
LABEL_RE = re.compile(r"^(?P<name>[A-Za-z][A-Za-z0-9_]*):\s*$")
MNEMONICS = ("VEC", "SVEC", "LABS", "JSR", "JMP", "RTS", "HALT")


def decode_opcode(addr: int, byte_seq: list[int]) -> dict:
    """Decode 2 or 4 bytes at the given DVG byte address into an opcode dict.

    Field layouts follow docs/research_dvg.md §6.
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


def parse(source: Path) -> dict[str, list[dict]]:
    """Parse the disassembly.

    Each opcode dict carries an `_addr` field (DVG byte address); this is
    stripped before emit. `_addr` lets post-processing steps (fix_misplaced_rts,
    derive_addr_to_label) recompute entry addresses after moving opcodes.
    """
    subs: dict[str, list[dict]] = {}
    current_label: str | None = None
    in_code_block = False

    with source.open(encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            stripped = line.strip()

            # Markdown code-fence tracking — only ```code blocks have opcodes.
            # Reset current_label across block boundaries so a label declared in
            # one block doesn't capture opcodes in the next.
            if stripped.startswith("```"):
                in_code_block = stripped == "```code"
                current_label = None
                continue
            if not in_code_block:
                continue
            if stripped.startswith(";") or not stripped:
                continue

            m_label = LABEL_RE.match(stripped)
            if m_label:
                current_label = m_label.group("name")
                if current_label not in subs:
                    subs[current_label] = []
                continue

            m = LINE_RE.match(line)
            if not m:
                continue
            # Skip data lines — they share the `ADDR: BB BB` prefix but follow
            # with `;` (velocity tables) or nothing (packed-string bytes). Only
            # treat the line as an opcode if a known mnemonic word follows.
            rest_head = m.group("rest").lstrip().split(maxsplit=1)
            if not rest_head or rest_head[0] not in MNEMONICS:
                continue
            addr = int(m.group("addr"), 16)
            byte_seq = [int(b, 16) for b in m.group("bytes").split()]
            opcode = decode_opcode(addr, byte_seq)
            opcode["_addr"] = addr

            # Range-based detection for the EXTRA_SUBS (rocks, shrapnel,
            # UFO, etc.). When we enter a known range, start a new sub. When
            # we leave a known range (between two EXTRA_SUBs), drop the label
            # so jump-table JSRs and velocity-table data get discarded
            # rather than being appended to the previous sub.
            extra_name, _ = _find_extra_sub(addr)
            if extra_name:
                if current_label != extra_name:
                    current_label = extra_name
                    if current_label not in subs:
                        subs[current_label] = []
            elif current_label in EXTRA_SUB_NAMES:
                current_label = None  # left the range; discard until next sub

            if current_label is None:
                continue  # opcode outside any labeled subroutine — skip

            subs[current_label].append(opcode)

    return subs


def derive_addr_to_label(subs: dict[str, list[dict]]) -> dict[int, str]:
    """Build {entry_byte_addr -> label_name} from each sub's first opcode."""
    return {ops[0]["_addr"]: name for name, ops in subs.items() if ops}


# Note: a set of ship-data modification steps (modernize_svecs,
# close_axis_aligned_shapes, scale_axis_aligned_moves,
# scale_axis_aligned_thrusts) lived here briefly to "fix" the visual
# rendering of ShipDir0/16/64 and ThrustDir0/64 at low globalScale.
# Reverted intentionally — the original ROM data is byte-faithful and
# preserves the cabinet's actual rendering as a diagnostic signal for
# the port. Full recipe + rationale lives in docs/progress.md under
# "Ship-data modification recipe (deferred)" if we want to re-apply.


def fix_misplaced_rts(subs: dict[str, list[dict]]) -> None:
    """Some labels are placed one line before their actual entry in the
    disassembly (ShipDir64/ThrustDir64 is the known case: the $14D2 RTS
    is ShipDir64's terminator, not ThrustDir64's body). Detect and fix.

    Heuristic: if subroutine N doesn't end with RTS AND subroutine N+1
    starts with RTS, move the orphan RTS from N+1 to N.
    """
    names = list(subs.keys())
    for i, name in enumerate(names[:-1]):
        ops = subs[name]
        nxt = subs[names[i + 1]]
        if ops and ops[-1].get("op") != "RTS" and nxt and nxt[0].get("op") == "RTS":
            ops.append(nxt.pop(0))


def resolve_targets(
    subs: dict[str, list[dict]], addr_to_label: dict[int, str]
) -> list[str]:
    """Replace numeric JSR/JMP targets with symbolic names where possible.
    Returns a list of warning strings for any unresolved targets."""
    warnings: list[str] = []
    for name, ops in subs.items():
        for op in ops:
            if op["op"] in ("JSR", "JMP"):
                byte_addr = op["_target_word"] * 2
                resolved = addr_to_label.get(byte_addr)
                if resolved:
                    op["target"] = resolved
                else:
                    op["target"] = f"_at_{byte_addr:04X}"
                    warnings.append(
                        f"{op['op']} in {name} -> ${byte_addr:04X} (no matching label)"
                    )
                del op["_target_word"]
    return warnings


def filter_ship_region(
    subs: dict[str, list[dict]], addr_to_label: dict[int, str]
) -> dict[str, list[dict]]:
    """Include ship+thrust region AND the extra subroutines (rocks, etc.)."""
    return {
        name: subs[name]
        for addr, name in addr_to_label.items()
        if INCLUDE_REGION_START <= addr <= INCLUDE_REGION_END
    }


def _signed(val: int, width: int) -> str:
    """Right-aligned signed int, but no `+` for zero. Width covers sign+digits."""
    if val == 0:
        return f"{0:>{width}d}"
    return f"{val:>+{width}d}"


def format_op(op: dict) -> str:
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


SHIPDIR_RE = re.compile(r"^(Ship|Thrust)Dir(\d+)$")

# Direction unit math: full circle = 256 units (fits in a 6502 byte).
# Each unit = 360 / 256 = 1.40625°. Convention from the disassembly: 0 = east
# (ship points right), 64 = north (up), 128 = west, 192 = south. The 17
# subroutines cover 0°-90° only; the CPU mirrors at draw time for the rest.
_COMPASS = {0: "east →", 32: "northeast ↗", 64: "north ↑"}


def _shape_description(name: str) -> str | None:
    """Friendly comment for ShipDirN/ThrustDirN; None for unrecognized labels."""
    m = SHIPDIR_RE.match(name)
    if not m:
        return None
    kind = m.group(1)
    n = int(m.group(2))
    angle = n * (360.0 / 256.0)
    extra = f" ({_COMPASS[n]})" if n in _COMPASS else ""
    angle_str = f"{angle:g}°{extra}"
    if kind == "Ship":
        return angle_str
    return f"thrust flame, {angle_str}"


def emit_js(subs: dict[str, list[dict]], addr_to_label: dict[int, str]) -> str:
    label_to_addr = {v: k for k, v in addr_to_label.items()}
    lines = [
        "// asteroids_clone/vector_rom_data.js",
        "//",
        "// GENERATED FILE — do not edit by hand.",
        "// Source: <sparse-clone>/content/Arcade/Asteroids/VectorROM.md",
        "// Build:  python asteroids_clone/tools/build_vector_rom.py",
        "// Spec:   asteroids_clone/docs/research_dvg.md §11",
        "//",
        "// First-pass scope: ship region only (CPU $5290-$54D8 /",
        "// DVG byte $1290-$14D8). Covers 17 ShipDirN + 17 ThrustDirN = 34 subroutines.",
        "// Direction unit: 360°/256 = 1.40625° per unit; ShipDirN angle = N × 1.40625°.",
        "//",
        "// Data is byte-faithful to the ROM — no aesthetic modifications applied.",
        "// (A 4-step SVEC→VEC + ×8-scaling recipe was tried and reverted; see",
        "// docs/progress.md if you want to re-apply.)",
        "",
        "export const VROM = {",
    ]
    for name, ops in subs.items():
        entry_byte_addr = label_to_addr.get(name)
        cpu_addr = (entry_byte_addr + 0x4000) if entry_byte_addr is not None else None
        addr_str = f"${cpu_addr:04X}" if cpu_addr is not None else "(no addr)"
        desc = _shape_description(name)
        if desc:
            header = f"  // {addr_str} — {desc} — {len(ops)} opcodes"
        else:
            header = f"  // {addr_str} — {len(ops)} opcodes"
        lines.append(header)
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
    source = next((p for p in DEFAULT_SOURCE_PATHS if p.exists()), None)
    if source is None:
        print("ERROR: VectorROM.md not found in any known sparse-clone path:",
              file=sys.stderr)
        for p in DEFAULT_SOURCE_PATHS:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(f"reading: {source}")
    subs = parse(source)
    print(f"  parsed {len(subs)} subroutine labels")

    fix_misplaced_rts(subs)
    addr_to_label = derive_addr_to_label(subs)
    print(f"  derived {len(addr_to_label)} entry addresses post-fix")

    warnings = resolve_targets(subs, addr_to_label)
    for w in warnings:
        print(f"  warning: {w}", file=sys.stderr)

    ship_subs = filter_ship_region(subs, addr_to_label)
    print(f"  ship region: {len(ship_subs)} subroutines")

    # Sanity check: every sub should end with RTS.
    for name, ops in ship_subs.items():
        if not ops or ops[-1].get("op") != "RTS":
            tail = ops[-1] if ops else "(empty)"
            print(f"  warning: {name} does not end with RTS (tail: {tail})",
                  file=sys.stderr)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(emit_js(ship_subs, addr_to_label), encoding="utf-8")
    print(f"wrote:   {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
