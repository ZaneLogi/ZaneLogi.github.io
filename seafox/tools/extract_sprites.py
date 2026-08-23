#!/usr/bin/env python3
"""extract_sprites.py - read the game's sprite bitmaps off the original disk
image and emit assets/sprite_blocks.js.

The disk image lives OUTSIDE this repository; pass its path.

  python tools/extract_sprites.py --dsk /path/to/image.dsk
  python tools/extract_sprites.py --dsk /path/to/image.dsk --dump   ASCII preview
  python tools/extract_sprites.py --dsk /path/to/image.dsk --check  verify only

It also emits assets/digit_font.js -- the HUD digit font, which is not a block
and is not part of the chained artwork.

Nothing here is retyped from the image. Pixels, byte widths, row counts, palette
bits and the text strips' screen positions are all READ OUT of it. The only
transcriptions are the design spec's own tables, and they are used purely as
assertions: if the walk disagrees with docs/design_spec.md by a single row, by a
strip position, or by a merchant hue, this tool fails instead of emitting.

What the tool cannot read out of the image is a bitmap's `phase` and `flip`
(design_spec 6.5) - those come from the code that spawns each object, not from
the artwork. Assets whose pair has not been established carry `verified: false`,
and the report at the end lists them.
"""

import argparse
import base64
import os
import sys
from typing import Iterator, Optional

# ---------------------------------------------------------------------------
# DOS 3.3 disk image
# ---------------------------------------------------------------------------

SECTOR: int = 256
TRACK: int = SECTOR * 16

# A DOS 3.3 logical sector sits at a different offset in a ProDOS-ordered image.
DOS_TO_PRODOS: list[int] = [0, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 15]

CATALOG_TRACK: int = 17
ENTRY_SIZE: int = 0x23
ENTRIES_PER_SECTOR: int = 7
TYPE_BINARY: int = 0x04


class DiskImage:
    """A sector image with a DOS 3.3 filesystem on it."""

    def __init__(self, path: str) -> None:
        with open(path, 'rb') as f:
            self.data: bytes = f.read()
        self.path: str = path
        self.tracks: int = len(self.data) // TRACK
        if self.tracks < 18:
            raise SystemExit('%s: %d bytes is too small to be a disk image'
                             % (path, len(self.data)))
        self.order: str = 'dos'

    def sector(self, track: int, sec: int) -> bytes:
        """One logical sector, de-interleaved for the image's sector order."""
        if not (0 <= track < self.tracks and 0 <= sec < 16):
            raise ValueError('T%d/S%d out of range' % (track, sec))
        phys = sec if self.order == 'dos' else DOS_TO_PRODOS[sec]
        off = track * TRACK + phys * SECTOR
        return self.data[off:off + SECTOR]

    def catalog(self) -> Iterator[dict]:
        """Yield one dict per live catalog entry."""
        vtoc = self.sector(CATALOG_TRACK, 0)
        track, sec = vtoc[1], vtoc[2]
        seen: set[tuple[int, int]] = set()
        while track != 0 and (track, sec) not in seen:
            seen.add((track, sec))
            if not (0 <= track < self.tracks and 0 <= sec < 16):
                return
            cat = self.sector(track, sec)
            for i in range(ENTRIES_PER_SECTOR):
                e = cat[0x0B + i * ENTRY_SIZE: 0x0B + (i + 1) * ENTRY_SIZE]
                if e[0] in (0x00, 0xFF):        # never used, or deleted
                    continue
                yield {'name': ''.join(chr(b & 0x7F) for b in e[3:33]).rstrip(),
                       'type': e[2] & 0x7F,
                       'ts': (e[0], e[1])}
            track, sec = cat[1], cat[2]

    def track_sector_list(self, track: int, sec: int) -> list[tuple[int, int]]:
        """Follow a file's track/sector list, returning its data sectors in order."""
        out: list[tuple[int, int]] = []
        seen: set[tuple[int, int]] = set()
        while (track, sec) != (0, 0) and (track, sec) not in seen:
            if not (0 <= track < self.tracks and 0 <= sec < 16):
                break
            seen.add((track, sec))
            link = self.sector(track, sec)
            for i in range(0x0C, SECTOR, 2):
                if (link[i], link[i + 1]) != (0, 0):
                    out.append((link[i], link[i + 1]))
            track, sec = link[1], link[2]
        return out

    def read_binary(self, entry: dict) -> tuple[bytes, int]:
        """Payload and load address of a BIN file, 4-byte header stripped."""
        raw = b''.join(self.sector(t, s)
                       for t, s in self.track_sector_list(*entry['ts']))
        addr = raw[0] | raw[1] << 8
        length = raw[2] | raw[3] << 8
        return raw[4:4 + length], addr


def open_graphics_file(path: str, name: str) -> tuple[bytes, int]:
    """Find a named BIN file on the image, trying both sector orders."""
    img = DiskImage(path)
    for order in ('dos', 'prodos'):
        img.order = order
        try:
            for entry in img.catalog():
                if entry['name'] == name and entry['type'] == TYPE_BINARY:
                    payload, addr = img.read_binary(entry)
                    if payload:
                        return payload, addr
        except (ValueError, IndexError):
            continue
    raise SystemExit('%s: no BIN file named %r in either sector order.\n'
                     'Is this the right disk image?' % (path, name))


# ---------------------------------------------------------------------------
# The graphics blocks
# ---------------------------------------------------------------------------

GRAPHICS_FILE: str = 'FOX2'

# The graphics load low and are copied up before the game runs, so the block
# links stored in the data are addresses in the POST-copy map. Both ends of that
# copy are fixed; the load address comes from the file itself.
PRELOAD_BASE: int = 0x2000
RUNTIME_BASE: int = 0x6000

# Half-open [start, limit) address ranges of chained blocks. Three, because the
# four effect bitmaps live with the effect allocator's data rather than with the
# rest of the artwork.
CHAINS: list[tuple[int, int]] = [(0x8A6F, 0xACC9),   # entities, deaths, scores
                                 (0xACC9, 0xB420),   # the text strips
                                 (0x65A2, 0x661D)]   # the four effects

# Block header, 8 bytes. Byte 1 is not read: nothing in the port needs it.
HDR_PALETTE_EOR: int = 0
HDR_X_LO: int = 2
HDR_Y: int = 4
HDR_BYTE_WIDTH: int = 5
HDR_ROWS: int = 6
HDR_SHIFT_SLOTS: int = 7

# A block that reserves shift slots stores seven copies of its bitmap: one real
# and six pre-rotated. Pre-shifting is not reproduced (design_spec 1.3), so only
# the first is read.
SHIFT_SLOTS: int = 7

# Strips carry their own screen X, biased by the four bytes of working margin
# every draw reserves. Checked against design_spec 6.6.1 for all sixteen.
STRIP_X_BIAS: int = 4 * 7

PIXELS_PER_BYTE: int = 7


class Block:
    """One bitmap as it is stored: 7 pixels per byte, lowest bit leftmost."""

    def __init__(self, index: int, byte_width: int, rows: int, bits: bytes,
                 palette_eor: int, x: int, y: int, shifted: bool) -> None:
        self.index: int = index
        self.byte_width: int = byte_width
        self.rows: int = rows
        self.bits: bytes = bits
        self.palette_eor: int = palette_eor
        self.x: int = x
        self.y: int = y
        self.shifted: bool = shifted

    @property
    def width(self) -> int:
        """Stored width in pixels."""
        return self.byte_width * PIXELS_PER_BYTE

    def lit(self, col: int, row: int) -> bool:
        """Is the pixel at (col, row) set?"""
        b = self.bits[row * self.byte_width + col // PIXELS_PER_BYTE]
        return bool((b >> (col % PIXELS_PER_BYTE)) & 1)

    def palette_regions(self) -> dict[int, int]:
        """How many lit bytes carry each palette bit.

        A bitmap may hold more than one palette region (design_spec 6.3). The
        ships use that for their masts: the hull is one palette and the mast
        tips the other, so the bit is not uniform across a sprite.
        """
        out: dict[int, int] = {}
        for row in range(self.rows):
            for c in range(self.byte_width):
                b = self.bits[row * self.byte_width + c]
                if b & 0x7F:
                    bit = (b >> 7) & 1
                    out[bit] = out.get(bit, 0) + 1
        return out

    def dominant_palette_bit(self) -> int:
        """The palette bit of the region that covers most of the bitmap."""
        regions = self.palette_regions()
        return max(regions, key=lambda bit: regions[bit])

    def is_pure_white(self) -> bool:
        """True when no lit pixel is isolated, so the bitmap has no hue at all.

        design_spec 6.3: a lit pixel with a lit neighbour is painted white, and
        only isolated pixels take a colour. A bitmap with none is white at either
        parity, which is what lets an object move by odd steps without changing
        colour (design_spec 6.5).
        """
        for row in range(self.rows):
            for col in range(self.width):
                if not self.lit(col, row):
                    continue
                left = col > 0 and self.lit(col - 1, row)
                right = col + 1 < self.width and self.lit(col + 1, row)
                if not (left or right):
                    return False
        return True

    def glyph_cells(self) -> int:
        """Count the glyphs in a strip of characters.

        Glyphs are separated by blank columns, but how many depends on how the
        artwork is drawn. A glyph made of isolated pixels -- the form that takes
        a colour (design_spec 6.3) -- has a blank column inside every stroke, so
        one blank column cannot be read as a gap there. A glyph drawn in solid
        runs, which renders white, has no internal blank column at all.
        """
        min_gap = 1 if self.is_pure_white() else 2
        occupied = [any(self.lit(col, r) for r in range(self.rows))
                    for col in range(self.width)]
        cells, blanks, started = 0, min_gap, False
        for lit in occupied:
            if lit:
                if blanks >= min_gap:
                    cells += 1
                blanks, started = 0, True
            elif started:
                blanks += 1
        return cells

    def ascii_rows(self) -> list[str]:
        """The bitmap as rows of '#' and '.'."""
        return [''.join('#' if self.lit(c, r) else '.' for c in range(self.width))
                for r in range(self.rows)]


def walk_blocks(data: bytes, load_addr: int) -> list[Block]:
    """Walk every chain and return the blocks in the order they are stored."""
    shift = (PRELOAD_BASE - load_addr) - RUNTIME_BASE

    def at(addr: int) -> int:
        off = addr + shift
        if not (0 <= off < len(data)):
            raise SystemExit('block address $%04X falls outside the file - '
                             'wrong file, or a different release' % addr)
        return off

    def word(addr: int) -> int:
        o = at(addr)
        return data[o] | data[o + 1] << 8

    blocks: list[Block] = []
    for start, limit in CHAINS:
        addr = start
        while addr < limit:
            # Some blocks are introduced by a pointer to their own header.
            preamble = 2 if word(addr) == addr + 2 else 0
            o = at(addr) + preamble
            byte_width = data[o + HDR_BYTE_WIDTH]
            rows = data[o + HDR_ROWS]
            shifted = data[o + HDR_SHIFT_SLOTS] != 0
            if not (1 <= byte_width <= 40 and 1 <= rows <= 32):
                raise SystemExit('block %d at $%04X has a nonsense header (%d x %d)'
                                 % (len(blocks), addr, byte_width, rows))
            size = byte_width * rows
            pixels = o + 8
            blocks.append(Block(index=len(blocks),
                                byte_width=byte_width,
                                rows=rows,
                                bits=data[pixels:pixels + size],
                                palette_eor=data[o + HDR_PALETTE_EOR],
                                x=data[o + HDR_X_LO] | data[o + HDR_X_LO + 1] << 8,
                                y=data[o + HDR_Y],
                                shifted=shifted))
            addr += preamble + 8 + (SHIFT_SLOTS * size if shifted else size)
        if addr != limit:
            raise SystemExit('the chain ending at $%04X overran to $%04X'
                             % (limit, addr))
    return blocks


# ---------------------------------------------------------------------------
# design_spec 6.6.1 - the inventory, used as an assertion
# ---------------------------------------------------------------------------

# (name, byteWidth, rows), in the order the blocks are stored. Sixty-three, and
# the game authors no others.
INVENTORY: list[tuple[str, int, int]] = [
    # Entity sprites - 25.
    ('playerSubmarine',      5, 6),
    ('torpedoRising',        2, 6),
    ('torpedoDescending',    2, 6),
    ('torpedoHorizontal',    2, 3),
    ('enemyHullRightToLeft', 5, 7),
    ('enemyHullLeftToRight', 5, 7),
    ('magneticMine',         2, 6),
    ('merchantHullA',        5, 7),
    ('merchantHullB',        5, 7),
    ('merchantHullC',        5, 7),
    ('hospitalShip',         5, 7),
    ('merchantHullD',        5, 7),
    ('merchantHullE',        5, 7),
    ('merchantHullF',        5, 7),
    ('merchantHullG',        5, 7),
    ('supplySubmarine',      5, 7),
    ('payload',              2, 5),
    ('dolphin',              3, 6),
    ('shellOpen',            2, 9),
    ('shellClosed',          2, 7),
    ('destroyer',            5, 7),
    ('chargeArcing',         2, 2),
    ('chargeSinking',        2, 4),
    ('enemyTorpedo',         2, 3),
    ('avenger',              4, 7),
    # Death frames - 8, shared by every type.
    ('sinkingShip1',         5, 8),
    ('sinkingShip2',         5, 8),
    ('sinkingShip3',         5, 8),
    ('burst1',               3, 6),
    ('burst2',               3, 6),
    ('burst3',               3, 6),
    ('tallColumn1',          3, 13),
    ('tallColumn2',          3, 13),
    # Floating score values - 10. Five ordinary, five quota-completing.
    ('scoreOrdinary1',       5, 7),
    ('scoreOrdinary2',       5, 7),
    ('scoreOrdinary3',       5, 7),
    ('scoreOrdinary4',       5, 7),
    ('scoreOrdinary5',       5, 7),
    ('scoreQuota1',          5, 7),
    ('scoreQuota2',          5, 7),
    ('scoreQuota3',          5, 7),
    ('scoreQuota4',          5, 7),
    ('scoreQuota5',          5, 7),
    # Text strips - 16. Artwork, not rendered text.
    ('stripScore',           9, 7),
    ('stripHighScore',      17, 7),
    ('stripSubs',            7, 7),
    ('stripFuelTorp',       21, 7),
    ('stripDemoMessageA',   35, 7),
    ('stripMission',        11, 7),
    ('stripMissionComplete', 26, 7),
    ('stripGameOver',       15, 7),
    ('stripOutOfFuel',      19, 7),
    ('stripOne',             5, 7),
    ('stripTwo',             5, 7),
    ('stripThree',           9, 7),
    ('stripFour',            7, 7),
    ('stripFive',            6, 7),
    ('stripHudEraseBar',    25, 7),
    ('stripDemoMessageB',   30, 7),
    # Effect sprites - 4.
    ('effectBlob',           2, 1),
    ('effectSparkCluster',   2, 4),
    ('effectDot',            1, 1),
    ('effectStreak',         2, 1),
]

FIRST_STRIP: int = 43
LAST_STRIP: int = 58

# design_spec 6.6.1 - each strip's own screen x and top row.
STRIP_POSITIONS: dict[str, tuple[int, int]] = {
    'stripHighScore':      (0,   185),
    'stripScore':          (175, 185),
    'stripSubs':           (0,   185),
    'stripFuelTorp':       (0,   185),
    'stripHudEraseBar':    (0,   185),
    'stripMission':        (70,  0),
    'stripOne':            (154, 0),
    'stripTwo':            (154, 0),
    'stripThree':          (154, 0),
    'stripFour':           (154, 0),
    'stripFive':           (154, 0),
    'stripMissionComplete': (49, 0),
    'stripOutOfFuel':      (84,  105),
    'stripGameOver':       (91,  90),
    'stripDemoMessageA':   (21,  0),
    'stripDemoMessageB':   (35,  0),
}

# design_spec 7.3.1 - an ordinary kill is 200 through 600, three digits; the
# quota-completing kill is ten times that, four digits. The artwork is the only
# thing that says which set of five is which, so count the digits.
SCORE_DIGITS: dict[str, int] = {'scoreOrdinary': 3, 'scoreQuota': 4}


# ---------------------------------------------------------------------------
# design_spec 6.5 - the parity and palette each bitmap is baked at
# ---------------------------------------------------------------------------

# design_spec 6.3: colour is picked by absolute column parity and the palette
# bit that `flip` is XORed into.
HUES: dict[tuple[int, int], str] = {(0, 0): 'violet', (1, 0): 'green',
                                    (0, 1): 'blue',   (1, 1): 'orange'}

# One entry per BAKED ASSET, not per block: an object drawn in more than one
# colour bakes once per appearance (design_spec 6.5).
#
#   asset name, block name, phase, flip, established
#
# `established` False means the pair has not been traced to the code that
# spawns the object. It is emitted as `verified: false` and reported at the end;
# for a bitmap that is pure white the pair cannot matter, and the tool says so.
ASSETS: list[tuple[str, str, int, int, bool]] = [
    ('playerSubmarine',      'playerSubmarine',      0, 1, True),
    ('torpedoRising',        'torpedoRising',        1, 0, True),
    ('torpedoDescending',    'torpedoDescending',    1, 0, True),
    ('torpedoHorizontal',    'torpedoHorizontal',    0, 1, True),
    ('enemyHullRightToLeft', 'enemyHullRightToLeft', 0, 1, True),
    ('enemyHullLeftToRight', 'enemyHullLeftToRight', 0, 1, True),
    ('magneticMine',         'magneticMine',         0, 1, True),
    ('hospitalShip',         'hospitalShip',         0, 1, True),
    ('supplySubmarine',      'supplySubmarine',      1, 0, True),
    ('payload',              'payload',              1, 0, True),
    ('dolphin',              'dolphin',              0, 0, True),
    ('shellOpen',            'shellOpen',            0, 0, True),
    ('shellClosed',          'shellClosed',          0, 0, True),
    ('destroyer',            'destroyer',            0, 0, True),
    # The charge is even through its arc and odd after the single odd step at the
    # end of it, so its parity really does change mid-life -- and it still needs
    # one variant per sprite. The arc bitmap is a solid pair and renders white at
    # either parity, and the sinking bitmap is only ever drawn after the step. The
    # odd step fixes the sinking form's hue rather than changing the arc's.
    ('chargeArcing',         'chargeArcing',         0, 1, True),
    ('chargeSinking',        'chargeSinking',        1, 1, True),
    ('enemyTorpedo',         'enemyTorpedo',         0, 0, True),
    ('avenger',              'avenger',              1, 1, True),
    # design_spec 12.5 - ten roster records over seven bitmaps in four hues.
    # Each record's flag byte fixes both the spawn column parity and the palette.
    ('merchant0',            'merchantHullD',        0, 0, True),
    ('merchant1',            'merchantHullE',        0, 1, True),
    ('merchant2',            'merchantHullA',        0, 0, True),
    ('merchant3',            'merchantHullG',        1, 1, True),
    ('merchant4',            'merchantHullF',        1, 0, True),
    ('merchant5',            'merchantHullB',        1, 1, True),
    ('merchant6',            'merchantHullC',        1, 0, True),
    ('merchant7',            'merchantHullE',        0, 1, True),
    ('merchant8',            'merchantHullA',        1, 0, True),
    ('merchant9',            'merchantHullF',        0, 1, True),
    # The death system fixes both halves of the pair itself, for every type, so
    # a wreck's colour does not depend on what died or on where it died:
    #
    #   FLIP is always 1. Starting a death animation OVERWRITES the entity's
    #   palette byte rather than merging into it, and the value it writes has
    #   the flip bit set. Nothing in the animation clears it again.
    #
    #   PHASE is per frame, forced before the frame is drawn: the frame table
    #   carries a parity byte that either clears or sets the low bit of X. The
    #   sinking-ship frames clear it -- EVEN -- and the burst, column and
    #   floating-score frames set it -- ODD. That is what stops an explosion
    #   changing colour as it plays (design_spec 7.4.1).
    #
    # The floating score is the last frame of the merchant's own death sequence,
    # so it inherits both: forced odd, flipped.
    ('sinkingShip1',         'sinkingShip1',         0, 1, True),
    ('sinkingShip2',         'sinkingShip2',         0, 1, True),
    ('sinkingShip3',         'sinkingShip3',         0, 1, True),
    ('burst1',               'burst1',               1, 1, True),
    ('burst2',               'burst2',               1, 1, True),
    ('burst3',               'burst3',               1, 1, True),
    ('tallColumn1',          'tallColumn1',          1, 1, True),
    ('tallColumn2',          'tallColumn2',          1, 1, True),
    ('scoreOrdinary1',       'scoreOrdinary1',       1, 1, True),
    ('scoreOrdinary2',       'scoreOrdinary2',       1, 1, True),
    ('scoreOrdinary3',       'scoreOrdinary3',       1, 1, True),
    ('scoreOrdinary4',       'scoreOrdinary4',       1, 1, True),
    ('scoreOrdinary5',       'scoreOrdinary5',       1, 1, True),
    ('scoreQuota1',          'scoreQuota1',          1, 1, True),
    ('scoreQuota2',          'scoreQuota2',          1, 1, True),
    ('scoreQuota3',          'scoreQuota3',          1, 1, True),
    ('scoreQuota4',          'scoreQuota4',          1, 1, True),
    ('scoreQuota5',          'scoreQuota5',          1, 1, True),
    # Effects are the one system that does NOT force parity: the walk steps,
    # moves, clips and draws, and never touches the low bit of X. So an effect's
    # parity is whatever its creator's X plus a constant offset makes it.
    #
    # `flip` is still fixed, by the sprite selector: the same mode bit that picks
    # the sprite also carries the flip, so a sprite reachable only with that bit
    # set is ALWAYS flipped. The spark cluster and the streak are in that
    # position; the blob and the dot are never flipped.
    #
    # Parity splits three ways:
    ('effectBlob',            'effectBlob',          0, 0, True),
    # Both its creators land it on an even column, and it is two adjacent pixels
    # so it renders white regardless -- neither bit can matter here.
    ('effectDotEven',         'effectDot',           0, 0, True),
    ('effectDotOdd',          'effectDot',           1, 0, True),
    # The dot is stationary and one pixel, so each creator fixes it for life --
    # but they disagree. Even: the vertical torpedo (odd parent, +1) and the
    # depth charge's three splash dots (odd parent, +3, and all three velocities
    # are even so the parity holds for their whole life). Odd: the enemy torpedo
    # (even parent, +7).
    ('effectStreakEven',      'effectStreak',        0, 1, True),
    ('effectStreakOdd',       'effectStreak',        1, 1, True),
    # A wake is placed off its parent's stern by an ODD offset -- 7 to the left
    # for the right-travelling ships, 29 to the right for the Destroyer -- so it
    # inverts its parent's parity. The hospital ship and the Destroyer give odd;
    # the merchant roster gives both, because its records spawn at both parities.
    ('effectSparkClusterEven', 'effectSparkCluster', 0, 1, True),
    ('effectSparkClusterOdd',  'effectSparkCluster', 1, 1, True),
    # The debris is the one sprite whose parity is LIVE. Its twelve template
    # offsets are a mix of odd and even, and four of the twelve carry an ODD dX
    # (-5, -3), so those particles change column parity on every step. No
    # creation site fixes it and nothing forces it; both variants are emitted and
    # the draw has to choose. See `phaseLive` in the generated file's header.
]

# Assets whose parity nothing fixes -- not the creator, not the walk. Both
# variants are emitted and the draw picks by the object's current X, which is
# the one place in the game where a colour decision cannot be baked.
PHASE_LIVE: set[str] = {'effectSparkClusterEven', 'effectSparkClusterOdd'}

# The sixteen strips carry their own palette bit in their header and their own
# X on screen, so both are read rather than listed.
STRIP_ASSETS: list[str] = [name for name, _, _ in INVENTORY[FIRST_STRIP:LAST_STRIP + 1]]


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def verify(blocks: list[Block]) -> list[str]:
    """Check the walk against the design spec. Returns the failures."""
    bad: list[str] = []

    if len(blocks) != len(INVENTORY):
        bad.append('found %d blocks, the spec inventory has %d'
                   % (len(blocks), len(INVENTORY)))
        return bad

    for blk, (name, byte_width, rows) in zip(blocks, INVENTORY):
        if (blk.byte_width, blk.rows) != (byte_width, rows):
            bad.append('block %d (%s): image has %d x %d, spec says %d x %d'
                       % (blk.index, name, blk.byte_width, blk.rows, byte_width, rows))

    # Strips reserve no shift space; everything else does.
    for blk, (name, _, _) in zip(blocks, INVENTORY):
        is_strip = FIRST_STRIP <= blk.index <= LAST_STRIP
        if blk.shifted == is_strip:
            bad.append('block %d (%s): %s shift slots, expected %s'
                       % (blk.index, name, 'has' if blk.shifted else 'has no',
                          'none' if is_strip else 'some'))

    # A strip's position is its own, and the spec records all sixteen.
    for blk, (name, _, _) in zip(blocks, INVENTORY):
        if not (FIRST_STRIP <= blk.index <= LAST_STRIP):
            continue
        want_x, want_y = STRIP_POSITIONS[name]
        got_x = blk.x - STRIP_X_BIAS
        if (got_x, blk.y) != (want_x, want_y):
            bad.append('block %d (%s): image puts it at x=%d y=%d, spec says x=%d y=%d'
                       % (blk.index, name, got_x, blk.y, want_x, want_y))

    # The two sets of five floating scores differ only in their digit count.
    for blk, (name, _, _) in zip(blocks, INVENTORY):
        for prefix, digits in SCORE_DIGITS.items():
            if name.startswith(prefix):
                if blk.glyph_cells() != digits:
                    bad.append('block %d (%s): %d digits, expected %d'
                               % (blk.index, name, blk.glyph_cells(), digits))

    by_name = {name: blk for blk, (name, _, _) in zip(blocks, INVENTORY)}

    # Every asset must name a bitmap that exists.
    for asset, block_name, _, _, _ in ASSETS:
        if block_name not in by_name:
            bad.append('asset %s names an unknown bitmap %s' % (asset, block_name))

    # design_spec 12.5 - the ten merchant records, in four hues.
    spec_hues = ['violet', 'blue', 'violet', 'orange', 'green',
                 'orange', 'green', 'blue', 'green', 'blue']
    for record, want in enumerate(spec_hues):
        asset = 'merchant%d' % record
        entry = next((a for a in ASSETS if a[0] == asset), None)
        if entry is None:
            bad.append('no asset for merchant record %d' % record)
            continue
        _, block_name, phase, flip, _ = entry
        blk = by_name.get(block_name)
        if blk is None:
            continue
        # The hue a player would name is the hull's, which is the region that
        # covers the ship; the masts sit in the other palette.
        got = HUES[(phase, blk.dominant_palette_bit() ^ flip)]
        if got != want:
            bad.append('%s: bakes %s, spec says %s' % (asset, got, want))

    # The five numerals ship in the opposite palette to every other strip.
    numerals = {'stripOne', 'stripTwo', 'stripThree', 'stripFour', 'stripFive'}
    for name in STRIP_ASSETS:
        flipped = bool(by_name[name].palette_eor & 0x80)
        if flipped != (name in numerals):
            bad.append('%s: palette flip is %s, expected %s'
                       % (name, flipped, name in numerals))

    return bad


# ---------------------------------------------------------------------------
# design_spec 6.6.1 / 19.9 - the HUD digit font
# ---------------------------------------------------------------------------

# The font is NOT a block: no eight-byte header, no link, no shift slots, and it
# does not live in any of the three chains. It is eighty raw bytes of glyph, and
# the routine that draws it writes them straight to the screen rows -- no
# blitter, no clip. So it is read by address rather than by walking.
FONT_ADDR: int = 0x14F2
FONT_GLYPHS: int = 10
FONT_ROWS: int = 8


def read_digit_font(data: bytes, load_addr: int) -> list[bytes]:
    """Read the ten glyphs. Returns one bytes of FONT_ROWS per digit."""
    off = FONT_ADDR - load_addr
    raw = data[off:off + FONT_GLYPHS * FONT_ROWS]
    if len(raw) != FONT_GLYPHS * FONT_ROWS:
        raise SystemExit('the font runs past the end of %s' % GRAPHICS_FILE)
    return [raw[d * FONT_ROWS:(d + 1) * FONT_ROWS] for d in range(FONT_GLYPHS)]


def verify_font(glyphs: list[bytes]) -> list[str]:
    """Check the font against design_spec 6.6.1 and 19.9. Returns failures."""
    bad: list[str] = []

    for d, g in enumerate(glyphs):
        lit = [[(by >> k) & 1 for k in range(PIXELS_PER_BYTE)] for by in g]

        # A glyph byte is seven pixels and no palette bit: the digit routine
        # stores raw, so a set bit 7 would be a pixel-bearing palette flip the
        # port has nowhere to put.
        if any(by & 0x80 for by in g):
            bad.append('digit %d: a glyph byte sets bit 7' % d)

        # 6 x 8 cells (design_spec 6.6.1): six pixels of ink, then a blank
        # seventh column, and a blank eighth row. Both blanks are the spacing --
        # they are why consecutive digits do not touch, and why a field of them
        # is exactly seven pixels per digit.
        if any(row[6] for row in lit):
            bad.append('digit %d: column 6 is not blank, so digits would touch' % d)
        if g[FONT_ROWS - 1] != 0:
            bad.append('digit %d: row 7 is not blank' % d)

        # No isolated lit pixel anywhere in the font, so the two-pass bake of
        # design_spec 6.3 resolves every glyph to pure white and the HUD needs
        # no parity and no palette. Asserted rather than assumed: one isolated
        # pixel would make a digit take a hue from the column it lands in.
        for r, row in enumerate(lit):
            for x in range(PIXELS_PER_BYTE):
                if not row[x]:
                    continue
                left = x > 0 and row[x - 1]
                right = x + 1 < PIXELS_PER_BYTE and row[x + 1]
                if not left and not right:
                    bad.append('digit %d: isolated lit pixel at row %d column %d '
                               '-- the glyph would take a hue' % (d, r, x))
    return bad


FONT_HEADER: str = '''// seafox/assets/digit_font.js
//
// GENERATED FILE -- do not edit by hand.
// Build:  python seafox/tools/extract_sprites.py --dsk <path to the disk image>
//
// The HUD digit font of design_spec 19.9, read from $14F2-$1541 of the graphics
// file. Ten glyphs, eight bytes each, one byte per row.
//
// **It is not a block** (design_spec 6.6.1). Everything in sprite_blocks.js
// carries an eight-byte header giving its width, rows, palette and position,
// and is drawn by the general blitter. The font has none of that: the digit
// routine indexes it by BCD nibble and stores the bytes straight to the screen
// rows. What it shares with the blocks is the pixel format alone -- seven
// pixels to a byte, lowest bit leftmost -- so it is shaped like a block here,
// with byteWidth 1 and rows 8, purely so the bake of design_spec 6.3 applies to
// it unchanged.
//
// The cell is 6 x 8: six pixels of ink, a blank seventh column and a blank
// eighth row. Both blanks are the spacing between fields, which is what makes a
// digit field exactly seven pixels per digit with nothing to add between them.
//
// **Every glyph is pure white**, because no glyph contains an isolated lit
// pixel -- the extractor asserts this rather than assuming it. So the font takes
// no hue from the column it lands on, needs no parity variant, and phase and
// flip below are both 0 and mean nothing.
'''


def emit_font(glyphs: list[bytes], out_path: str) -> int:
    """Write assets/digit_font.js. Returns the number of glyphs emitted."""
    lines: list[str] = [FONT_HEADER, '', 'export const DIGIT_FONT = [']
    for d, g in enumerate(glyphs):
        lines.append('  { byteWidth: 1, rows: %d, phase: 0, flip: 0, bits: "%s" },  // %d'
                     % (FONT_ROWS, base64.b64encode(g).decode('ascii'), d))
    lines.append('];')
    lines.append('')

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    return len(glyphs)


# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------

HEADER: str = '''// seafox/assets/sprite_blocks.js
//
// GENERATED FILE -- do not edit by hand.
// Build:  python seafox/tools/extract_sprites.py --dsk <path to the disk image>
//
// The sixty-three bitmaps of design_spec 6.6.1, exactly as they are stored on
// the original disk, plus the parity and palette each one is drawn at.
//
// FORMAT
//   SPRITE_BLOCKS[name] = { byteWidth, rows, phase, flip, bits }
//
//   byteWidth  the SOURCE block's width in bytes. Collision box extents derive
//              from this and not from the stripped pixel width -- recomputing
//              them from the bitmap yields tighter boxes and a game that misses
//              more often than it should (design_spec 6.4).
//   rows       height in pixels.
//   phase      parity of the screen column the leftmost pixel lands on, 0 even
//              and 1 odd. Picks one hue of a pair (design_spec 6.3).
//   flip       the palette flip, XORed into every source byte's palette bit.
//   bits       base64 of byteWidth*rows source bytes, row-major.
//   verified   present and false when the phase/flip pair above has not been
//              established. Listed by the tool that wrote this file.
//   phaseLive  present and true when NOTHING fixes this object's parity -- not
//              its creator, not the walk that draws it. Both parities ship as
//              separate assets and the draw picks by the object's current X.
//              This is the only colour decision the bake cannot make.
//
//   ONE SOURCE BYTE IS SEVEN PIXELS, LOWEST BIT LEFTMOST. Bit 7 is not a pixel:
//   it is the palette bit covering all seven of them (design_spec 6.3).
//
//   Text strips additionally carry { x, y }. A strip's position is its own and
//   is not supplied by the code that posts it (design_spec 6.6.1).
//
// A bitmap drawn in more than one colour appears once per appearance: the ten
// merchant records over seven hulls (design_spec 12.5), and the dot, streak and
// debris once per parity, because nothing in the effects system fixes theirs
// (design_spec 15.4).
//
// THE BAKE OF design_spec 6.3 IS NOT DONE HERE. Turning these into the runtime
// {w, h, byteWidth, ink, color} of design_spec 6.2 happens at load: baking here
// would ship roughly fifteen times this file, and the two-pass blend is
// normative, so it belongs in code the game actually runs.
'''


def emit(blocks: list[Block], out_path: str) -> int:
    """Write the generated module. Returns the number of assets emitted."""
    by_name = {name: blk for blk, (name, _, _) in zip(blocks, INVENTORY)}
    strips = set(STRIP_ASSETS)

    lines: list[str] = [HEADER, '', 'export const SPRITE_BLOCKS = {']
    for asset, block_name, phase, flip, established in ASSETS + [
            (n, n, 0, 0, True) for n in STRIP_ASSETS]:
        blk = by_name[block_name]
        fields = ['byteWidth: %d' % blk.byte_width, 'rows: %d' % blk.rows]
        if asset in strips:
            # Read off the block, not listed: a strip carries both.
            fields.append('phase: %d' % ((blk.x - STRIP_X_BIAS) & 1))
            fields.append('flip: %d' % (1 if blk.palette_eor & 0x80 else 0))
            fields.append('x: %d' % (blk.x - STRIP_X_BIAS))
            fields.append('y: %d' % blk.y)
        else:
            fields.append('phase: %d' % phase)
            fields.append('flip: %d' % flip)
            if asset in PHASE_LIVE:
                fields.append('phaseLive: true')
            if not established:
                fields.append('verified: false')
        fields.append('bits: "%s"' % base64.b64encode(blk.bits).decode('ascii'))
        lines.append('  %s: { %s },' % (asset, ', '.join(fields)))
    lines.append('};')
    lines.append('')

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    return len(ASSETS) + len(STRIP_ASSETS)


# ---------------------------------------------------------------------------

def report(blocks: list[Block]) -> None:
    """Print what was found, and what still needs establishing."""
    stored = sum(b.byte_width * b.rows * (SHIFT_SLOTS if b.shifted else 1) + 8
                 for b in blocks)
    artwork = sum(b.byte_width * b.rows for b in blocks)
    print('  %d bitmaps, %d bytes of artwork (%d stored, %d of it pre-shift slots)'
          % (len(blocks), artwork, stored, stored - artwork))

    two_region = [name for blk, (name, _, _) in zip(blocks, INVENTORY)
                  if len(blk.palette_regions()) > 1]
    if two_region:
        print('  %d bitmaps carry two palette regions, so the bake must select '
              'colour per byte and not per sprite:' % len(two_region))
        print('    ' + ', '.join(two_region))

    by_name = {name: blk for blk, (name, _, _) in zip(blocks, INVENTORY)}
    unestablished = [(a, b) for a, b, _, _, ok in ASSETS if not ok]
    coloured = [a for a, b in unestablished if not by_name[b].is_pure_white()]
    white = [a for a, b in unestablished if by_name[b].is_pure_white()]

    if white:
        print('  %d assets have no established phase/flip but are pure white, '
              'so neither can matter:' % len(white))
        print('    ' + ', '.join(white))
    if coloured:
        print('  %d assets have an UNESTABLISHED phase/flip and DO take a hue:'
              % len(coloured))
        print('    ' + ', '.join(coloured))
    if PHASE_LIVE:
        print('  %d assets have a LIVE parity -- nothing fixes it, so the draw '
              'must pick by current X:' % len(PHASE_LIVE))
        print('    ' + ', '.join(sorted(PHASE_LIVE)))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dsk', required=True, help='the original disk image')
    ap.add_argument('-o', '--out', default=None,
                    help='output module (default: assets/sprite_blocks.js)')
    ap.add_argument('--check', action='store_true', help='verify, do not write')
    ap.add_argument('--dump', action='store_true', help='print every bitmap as ASCII')
    args = ap.parse_args()

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = args.out or os.path.join(here, 'assets', 'sprite_blocks.js')

    data, load_addr = open_graphics_file(args.dsk, GRAPHICS_FILE)
    print('%s: %s loads at $%04X, %d bytes'
          % (args.dsk, GRAPHICS_FILE, load_addr, len(data)))

    blocks = walk_blocks(data, load_addr)
    glyphs = read_digit_font(data, load_addr)
    failures = verify(blocks) + verify_font(glyphs)
    if failures:
        print('\nThe image does not match docs/design_spec.md:', file=sys.stderr)
        for f in failures:
            print('  %s' % f, file=sys.stderr)
        return 1
    print('  every bitmap matches the spec inventory, every strip its position, '
          'every merchant its hue')
    print('  the digit font is %d glyphs of %d rows at $%04X, every one pure white'
          % (len(glyphs), FONT_ROWS, FONT_ADDR))
    report(blocks)

    if args.dump:
        for blk, (name, _, _) in zip(blocks, INVENTORY):
            print('\n--- %d %s  %dx%d%s'
                  % (blk.index, name, blk.width, blk.rows,
                     '  (pure white)' if blk.is_pure_white() else ''))
            for row in blk.ascii_rows():
                print('    ' + row)
        for d, g in enumerate(glyphs):
            print('\n--- digit %d  $%04X' % (d, FONT_ADDR + d * FONT_ROWS))
            for by in g:
                print('    ' + ''.join('#' if (by >> k) & 1 else '.'
                                       for k in range(PIXELS_PER_BYTE)))

    if args.check:
        return 0

    count = emit(blocks, out_path)
    size = os.path.getsize(out_path)
    print('  wrote %s: %d assets, %d bytes' % (os.path.relpath(out_path, here),
                                               count, size))

    font_path = os.path.join(os.path.dirname(out_path), 'digit_font.js')
    count = emit_font(glyphs, font_path)
    size = os.path.getsize(font_path)
    print('  wrote %s: %d glyphs, %d bytes' % (os.path.relpath(font_path, here),
                                               count, size))
    return 0


if __name__ == '__main__':
    sys.exit(main())
