#!/usr/bin/env python3
"""Build asteroids_clone/packed_messages.js from VectorROM.md.

Decodes the 11 packed messages at DVG bytes $171E-$17B8 per the spec
in docs/research_game_state_machine.md §7. Output is a JS module
with each message as a pre-decoded glyph-name array plus its LABS
coord (from Code.md's coord table at $7871).

Source format: 5-bit chars, 3 chars per 16-bit word (2 bytes). Bit 0
of byte 1 is the terminator flag. Char `@` (5-bit $00) also
terminates.

Char map (32 entries indexed by 5-bit code):
    0     1     2     3     4     5..30
    @     _     0     1     2     A..Z

The digit '0' (index 2) aliases to Char_O — matches the source's
$56D2 cross-reference table where both entries point at $15BA.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DEFAULT_SOURCE_PATHS = [
    Path("D:/tmp/computer_archeology_asteroids/content/Arcade/Asteroids/VectorROM.md"),
    Path("C:/Z_Temp/computer_archeology_asteroids/content/Arcade/Asteroids/VectorROM.md"),
]

OUT_PATH = Path(__file__).resolve().parents[1] / "packed_messages.js"

# Per docs/research_game_state_machine.md §7.4 — LABS coord table at
# CPU $7871. Format: per msg-id, byte pair {A=DVG-X/4, X=DVG-Y/4}.
# Source disassembler mis-renders these as instructions; values
# hand-extracted from raw bytes.
LABS_COORDS = [
    (0x64, 0xB6),  # 0: HIGH_SCORES
    (0x64, 0xB6),  # 1: PLAYER  — shares coord with HIGH_SCORES (different temporal context)
    (0x0C, 0xAA),  # 2: YOUR_SCORE_IS_ONE_OF_THE_TEN_BEST
    (0x0C, 0xA2),  # 3: PLEASE_ENTER_YOUR_INITIALS
    (0x0C, 0x9A),  # 4: PUSH_ROTATE_TO_SELECT_LETTER
    (0x0C, 0x92),  # 5: PUSH_HYPERSPACE_WHEN_LETTER_IS_CORRECT
    (0x64, 0xC6),  # 6: PUSH_START
    (0x64, 0x9D),  # 7: GAME_OVER
    (0x50, 0x39),  # 8: ONE_COIN_TWO_PLAYS
    (0x50, 0x39),  # 9: ONE_COIN_ONE_PLAY
    (0x50, 0x39),  # 10: TWO_COINS_ONE_PLAY
]

MSG_KEYS = [
    "HIGH_SCORES",
    "PLAYER",
    "YOUR_SCORE_IS_ONE_OF_THE_TEN_BEST",
    "PLEASE_ENTER_YOUR_INITIALS",
    "PUSH_ROTATE_TO_SELECT_LETTER",
    "PUSH_HYPERSPACE_WHEN_LETTER_IS_CORRECT",
    "PUSH_START",
    "GAME_OVER",
    "ONE_COIN_TWO_PLAYS",
    "ONE_COIN_ONE_PLAY",
    "TWO_COINS_ONE_PLAY",
]

# 5-bit code → glyph name. Index 0 ('@') is the terminator (no draw).
CHAR_TO_GLYPH = [
    None,        # 0: @ (terminator)
    "Char_Space",  # 1: _
    "Char_O",    # 2: '0' aliases to Char_O per $56D2 table
    "Char_1",    # 3
    "Char_2",    # 4
    "Char_A",    # 5
    "Char_B",    # 6
    "Char_C",    # 7
    "Char_D",    # 8
    "Char_E",    # 9
    "Char_F",    # 10
    "Char_G",    # 11
    "Char_H",    # 12
    "Char_I",    # 13
    "Char_J",    # 14
    "Char_K",    # 15
    "Char_L",    # 16
    "Char_M",    # 17
    "Char_N",    # 18
    "Char_O",    # 19
    "Char_P",    # 20
    "Char_Q",    # 21
    "Char_R",    # 22
    "Char_S",    # 23
    "Char_T",    # 24
    "Char_U",    # 25
    "Char_V",    # 26
    "Char_W",    # 27
    "Char_X",    # 28
    "Char_Y",    # 29
    "Char_Z",    # 30
]
# Pretty-print char map for cross-checking decoded text vs VectorROM.md comments.
CHAR_TO_TEXT = "@_012ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# DVG byte address of the offset table (mirror of CPU $571E).
OFFSET_TABLE_ADDR = 0x171E
MESSAGE_REGION_START = 0x1729   # first message ("HIGH SCORES")
MESSAGE_REGION_END = 0x17B8     # one past last message byte (sine LUT starts at $17B9)

# Match address-prefixed byte lines like "1729: 63 56 60 6E 3C EC 4D C0".
BYTE_LINE_RE = re.compile(
    r"^(?P<addr>[0-9A-Fa-f]{4}):\s+(?P<bytes>(?:[0-9A-Fa-f]{2}\s*)+)(?:;.*)?$"
)


def parse_byte_map(source: Path) -> dict[int, int]:
    """Scan VectorROM.md and build addr → byte map for $171E..$17B8.

    VectorROM.md interleaves data lines with comments (`; HIGH SCORES`,
    `; H I G _ S ...`, paragraph text). We accept any line whose
    address falls in the messages region.
    """
    byte_map: dict[int, int] = {}
    for raw_line in source.read_text(encoding="utf-8").splitlines():
        m = BYTE_LINE_RE.match(raw_line.strip())
        if not m:
            continue
        addr = int(m.group("addr"), 16)
        if addr < OFFSET_TABLE_ADDR or addr >= MESSAGE_REGION_END:
            continue
        bytes_str = m.group("bytes").strip()
        for i, tok in enumerate(bytes_str.split()):
            try:
                byte_map[addr + i] = int(tok, 16)
            except ValueError:
                break
    return byte_map


def decode_message(byte_map: dict[int, int], start: int, end: int) -> list[int]:
    """Decode a packed-message byte stream into a list of 5-bit codes.

    Stops on terminator bit (byte1 bit 0 set) OR on encountering char 0 ('@').
    Returns the list of codes WITHOUT the terminating @.
    """
    chars: list[int] = []
    addr = start
    while addr < end:
        if addr + 1 not in byte_map:
            raise ValueError(f"Missing bytes at ${addr:04X}-${addr+1:04X}")
        b0 = byte_map[addr]
        b1 = byte_map[addr + 1]
        # 3 chars × 5 bits = 15 bits; bit 0 of b1 = terminator flag.
        c0 = (b0 >> 3) & 0x1F
        c1 = ((b0 & 0x07) << 2) | (b1 >> 6)
        c2 = (b1 >> 1) & 0x1F
        term = b1 & 0x01
        for c in (c0, c1, c2):
            if c == 0:
                return chars
            chars.append(c)
        if term:
            return chars
        addr += 2
    raise ValueError(f"Message starting at ${start:04X} did not terminate by ${end:04X}")


def decode_all(byte_map: dict[int, int]) -> list[list[int]]:
    """Decode the 11 messages using the offset table at $171E."""
    offsets = []
    for i in range(11):
        addr = OFFSET_TABLE_ADDR + i
        if addr not in byte_map:
            raise ValueError(f"Offset table missing entry at ${addr:04X}")
        offsets.append(byte_map[addr])

    # Convert offsets to absolute addresses and compute per-message end bounds.
    starts = [OFFSET_TABLE_ADDR + off for off in offsets]
    # Last message ends at MESSAGE_REGION_END; others end at the next start.
    bounds = [(starts[i], starts[i + 1] if i + 1 < len(starts) else MESSAGE_REGION_END)
              for i in range(len(starts))]

    return [decode_message(byte_map, s, e) for s, e in bounds]


def emit_js(messages: list[list[int]]) -> str:
    lines = [
        "// asteroids_clone/packed_messages.js",
        "// Generated by tools/build_packed_messages.py. DO NOT edit by hand.",
        "// Source: <sparse-clone>/content/Arcade/Asteroids/VectorROM.md ($171E-$17B8)",
        "// Build:  python asteroids_clone/tools/build_packed_messages.py",
        "// Spec:   asteroids_clone/docs/research_game_state_machine.md §7",
        "//",
        "// 11 packed messages from the cabinet's vector ROM, pre-decoded into",
        "// glyph-name arrays. Each entry also carries the LABS coord (DVG-X/4,",
        "// DVG-Y/4) from Code.md's per-msg coord table at $7871. Global scale",
        "// for all packed messages is $10 per $77F6's STA $00 at $77FD-$77FF.",
        "",
        "export const PACKED_MSG = {",
    ]
    for i, codes in enumerate(messages):
        key = MSG_KEYS[i]
        labs_x, labs_y = LABS_COORDS[i]
        text = "".join(CHAR_TO_TEXT[c] for c in codes)
        glyphs = ", ".join(f"'{CHAR_TO_GLYPH[c]}'" for c in codes)
        lines.append(f"  // msg-id {i}: \"{text}\" — LABS ({labs_x}, {labs_y}) ×4 = "
                     f"DVG ({labs_x*4}, {labs_y*4})")
        lines.append(f"  {key}: {{")
        lines.append(f"    labs: {{ x: 0x{labs_x:02X}, y: 0x{labs_y:02X} }},")
        lines.append(f"    glyphs: [{glyphs}],")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("// Global scale used for all packed-message draws — set by $77F6")
    lines.append("// at $77FD-$77FF (`LDA #$10; STA $00`).")
    lines.append("export const PACKED_MSG_GS = 0x10;")
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
    byte_map = parse_byte_map(source)
    print(f"  parsed {len(byte_map)} bytes in messages region")

    messages = decode_all(byte_map)
    for i, codes in enumerate(messages):
        text = "".join(CHAR_TO_TEXT[c] for c in codes)
        print(f"  msg {i}: {text}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(emit_js(messages), encoding="utf-8")
    print(f"wrote:   {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
