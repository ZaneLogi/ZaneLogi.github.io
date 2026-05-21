# research_vector_rom.md — The 2 KB vector ROM

Source-of-truth references: `VectorROM.md` and `VectorROM1.md` in
the ComputerArcheology Asteroids listing, plus `Hardware.md` for the
memory map. Citations use `$xxxx` form (CPU byte addresses) — see §2
for the DVG-word-address dual notation when relevant.

Prerequisites: [[research_dvg.md]] (opcodes + canvas mapping +
interpreter pseudocode). This doc inventories what's *in* the vector
ROM; the runtime is already specified by R-B.

## §1. Overview

The vector ROM (`$5000-$57FF`, 2 KB, also visible as DVG word
addresses `$0800-$0BFF`) holds every reusable graphic the game
draws. Each "graphic" is itself a DVG subroutine — a sequence of
opcodes ending in RTS — invoked by JSR from the CPU-built display
list at frame-build time.

Contents at the high level:

| Region (CPU bytes) | Content                                                     |
|--------------------|-------------------------------------------------------------|
| `$5000-$5086`      | Power-on test pattern (diamonds + parallel-line array)      |
| `$5088-$50A2`      | "BANK ERROR" text (Rev 2) / "PAGE SELECT ERROR" (Rev 1)     |
| `$50A4-$50DE`      | Credits text ("c 1979 ATARI INC" / "ASTEROIDS BY ATARI")    |
| `$50E0-$50EA`      | Ship explosion (6-line burst shape)                         |
| `$50EC-$50F6`      | Ship explosion piece-velocity table (6 entries × 2 bytes)   |
| `$50F8-$50FE`      | Shrapnel-pattern jump table (4 entries)                     |
| `$5100-$51DC`      | Shrapnel patterns 1-4 (one fired when shot hits anything)   |
| `$51DE-$51E4`      | Rock-pattern jump table (4 entries)                         |
| `$51E6-$524E`      | Rock patterns 1-4 (asteroid shape variants)                 |
| `$5250-$526C`      | UFO shape (single — large/small via scale)                  |
| `$526E-$528E`      | Ship-direction lookup table (17 entries × 2 bytes)          |
| `$5290-$54D8`      | 17 Ship + Thrust shape pairs (one per direction quadrant)   |
| `$54DA-$54EE`      | Lives icon (small ship for reserve display)                 |
| `$54F0-$57FF`      | Characters (A-Z, 0-9, symbols)                              |

The ROM is **NOT decoded** by the port — it's a frozen blob of DVG
opcodes that the R-B interpreter consumes verbatim. The port ships a
copy of the ROM image (~2 KB) as a static asset.

## §2. Memory layout — CPU bytes ↔ DVG words

Per [[research_hardware.md §2]] and [[research_dvg.md §2]]:

| CPU byte range  | DVG word range   |
|-----------------|------------------|
| `$5000-$57FF`   | `$0800-$0BFF`    |

JSR/JMP target addresses written in the display list are **word
addresses** (the upper nibble + 12 bits = `0xCxxx` / `0xExxx`). The
DVG multiplies by 2 internally to derive the byte offset. Throughout
this doc, the **CPU byte address** is the canonical form (e.g.
`$5290 ShipDir0`); the disassembly cross-references the DVG word
address in parens — e.g. `JSR $0A48 ($1490)` from `VectorROM.md` is
"JSR DVG-word-$0A48 = byte-$1490" but the `$1490` is relative to
the DVG's 0-based view (offset $1490 in DVG address space = CPU
$5490 — because the DVG view starts at $0000 while CPU view starts
at $4000 for VRAM, $5000 for VROM, etc.).

(This dual notation is everywhere in the source disassembly; the JS
port just sees a contiguous Uint8Array.)

## §3. Subroutine inventory

### 3.1 Test pattern (`$5000-$5086`)

The diamond-shaped self-test image drawn before main code runs (also
visible if the ROM checksum fails on power-on). Pure visual diagnostic
— the port doesn't need to invoke it for normal gameplay. Keep it in
the ROM blob for completeness; do nothing at the call site (the port
has no equivalent of a hardware checksum failure).

### 3.2 BANK ERROR text (`$5088-$50A2`)

Rendered if a RAM test in the diagnostic code fails. Same as
above — present in the blob, never called by the port.

(Rev 1 of the ROM had this string as "PAGE SELECT ERROR"; Rev 2
shortened it to "BANK ERROR". `VectorROM1.md` is the Rev 1 image and
shows the longer string. Difference is cosmetic — the port can use
either rev's image.)

### 3.3 Credits text (`$50A4-$50DE`)

Drawn in attract mode below the score / high-score display. Calls
characters from §3.10 via JSR. Rev 2: `"c 1979 ATARI INC"`. Rev 1:
`"ASTEROIDS BY ATARI"`. Port uses Rev 2 (the historical "final"
version).

### 3.4 Ship explosion (`$50E0-$50EA`)

A 6-line burst shape drawn when the player ship explodes. The shape
itself is short — `$10E0-$10EA` (in DVG-word notation, byte
`$50E0+`). The accompanying **piece-velocity table** at `$50EC-$50F6`
gives each of the 6 explosion fragments an independent velocity, used
by the CPU's explosion animator at `$7D-$94` ship-explosion-offsets
RAM region (see [[research_position_math.md]] note on ship explosion
data).

### 3.5 Shrapnel patterns (`$5100-$51DC`)

Four patterns indexed via the jump table at `$50F8-$50FE`:

| Pattern | Address       | Use                                  |
|---------|---------------|--------------------------------------|
| 1       | `$5100-$512A` | Compact spread                       |
| 2       | `$512C-$5168` | Wider spread (VEC opcodes, larger)   |
| 3       | `$516A-$519E` | Medium spread                        |
| 4       | `$51A0-$51DC` | Widest spread                        |
|         |               |                                      |

`VectorROM.md` comments note: *"all four patterns are the same just
slightly spread out. This is extremely clever. You could use one
pattern and vary the scale to make it look like it is spreading out.
But the scale jumps are powers-of-two. These slightly-scaled
patterns can be used to take up the gaps in the large scaling
doubles!"* — confirming the 4 patterns interpolate between the
power-of-2 scale jumps that the DVG hardware supports natively.

The shrapnel animator at the CPU side cycles through patterns 1→2→3→4
across frames to produce a continuous-looking expansion.

### 3.6 Rock patterns (`$51E6-$524E`)

Four asteroid shape variants, indexed via jump table at
`$51DE-$51E4`. Each is roughly the same size (the variants are
about visual diversity, not collision-shape diversity).

| Pattern | Address       |
|---------|---------------|
| 1       | `$51E6-$51FC` |
| 2       | `$51FE-$5218` |
| 3       | `$521A-$5232` |
| 4       | `$5234-$524E` |

**Asteroid size is purely a scale operation.** A "large asteroid" is
the same rock pattern drawn with global scale = 9 (/1, full size);
medium = 7 (/4, quarter); small = 5 (/16, sixteenth). The shape's
encoding into the size byte (`status[Y]` low 2 bits — see
[[research_collisions.md §3]]) controls which **rock pattern**
(rotation variant), while the asteroid's RAM "size" controls the
**LABS global-scale** value at draw time.

The 4 rock patterns × 4 rotation variants (the upper nibble of
status, incremented each rotation step — see
[[research_position_math.md]]) × 3 size scales = 48 visible asteroid
images from 4 ROM shapes. ROM-size optimization is the source's
default mindset.

### 3.7 UFO shape (`$5252-$526C`)

A **single** UFO shape covering both large and small saucers. Small
saucer is drawn at LABS scale = 0 (/512, smallest); large is drawn
at scale = 0 with `SVEC bri >0` and one or two early line variants —
i.e. visually the same outline but with the body lines lit. Source
selects between sub-shapes via a `JSR` offset (the entry `$5250
JSR $0929 ($1252)` is the small-saucer entry; large-saucer entry
TBD if a separate routine).

Actually re-reading more carefully: the UFO section in `VectorROM.md`
shows a single jump-table-1-entry pointing at `$1252` (= CPU `$5252`)
and one set of opcodes. The large vs small UFO distinction is then
likely encoded **in the CPU-built display list** (different LABS
scale before JSR), not in the ROM itself.

### 3.8 Ship direction table (`$526E-$528E`)

```
$526E: ShipDir0  ($5290)
$5270: ShipDir4  ($52A8)
$5272: ShipDir8  ($52CC)
$5274: ShipDir12 ($52F0)
...
$528E: ShipDir64 ($54C2)
```

17 entries × 2 bytes each = 34 bytes = `$528E - $526E + 2`. Direction
units are 0, 4, 8, ..., 64, with each unit ≈ 360°/256 = 1.41°. So 17
distinct shapes cover **0° to 90°** in 5.625° steps.

The other 270° of the full circle are derived by **reflection** (Y-
or X-mirror) at the CPU-list-build site, NOT in the ROM. This is the
ROM-size optimization that lets the source ship 17 ship shapes
instead of 64.

Port can either:

- **Keep the 17 shapes + reflection** (faithful, byte-accurate).
  Requires the JS list-builder to know about the mirroring — slight
  complexity at the call site.
- **Pre-compute 64 shapes** at startup (or render with `ctx.rotate`).
  Cleaner. ~3× memory cost (~1 KB extra).

Recommend the second — JS isn't space-constrained.

### 3.9 Lives icon (`$54DA-$54EE`)

A small ship outline used in the top-left "lives remaining"
display. Distinct from `ShipDir0` because it's at a fixed orientation
+ size; reusing the per-direction ship shape would draw it at the
wrong size for the lives strip. Trade-off: ROM stores one extra
small-ship shape.

### 3.10 Characters (`$54F0-$57FF`)

The character set, used for score / high-score / "PUSH START" /
"GAME OVER" / "PLAYER N" / "BANK ERROR" / credits / hi-score
initials. Each character is its own subroutine ending in RTS.

The character set in `VectorROM.md` indexes "A" at `$14F0` (DVG word)
= CPU `$54F0`. Subsequent letters at `$1500`, `$151A`, `$1526`, etc.
The disassembly file lists 36 character draw addresses in the
preamble line at line 711-712 (covering A-Z, 0-9, possibly some
symbols).

**Indexing scheme**: a "print packed string" routine at `$77F6`
(`code.PrintPackedMsg`, called by the score routine at e.g. `$69E2`
to draw "PLAYER ") uses an index table to map characters to their
ROM addresses. The packed-string format itself is in the
un-disassembled ~20% region — to investigate via Mikstas's
alt-disassembly when implementing the HUD.

For the port: the JS-side equivalent is a `printChar(code)` that
appends a JSR opcode targeting the right character subroutine into
the current display list. The ROM image already has each character
at its native address.

## §4. Revision differences (VectorROM vs VectorROM1)

The two ROM dumps in the source are:

- **VectorROM.md** — Rev 2, the "final" production ROM with
  "BANK ERROR" / "c 1979 ATARI INC" strings.
- **VectorROM1.md** — Rev 1 with "PAGE SELECT ERROR" /
  "ASTEROIDS BY ATARI" strings.

Per upstream:

> "Thanks to Sean D. Solle for pointing out mistakes in the
> disassembly for SVEC y= negative values. Those have been
> corrected."
> "Thanks to slx7R4GDZM for many fixes and discoveries here."

The differences appear limited to the text strings (§3.2, §3.3).
**Gameplay shapes** (ship / asteroid / UFO / shrapnel / explosion)
are identical across revisions. The port uses Rev 2 (`VectorROM.md`)
as the canonical image.

## §5. JS port spec

Per [[research_dvg.md §10]], the DVG interpreter accepts the
contiguous 8 KB memory image (VRAM + VROM). The vector ROM portion
is the second half:

```js
// implementation phase, when the DVG interpreter is built:

const VRAM_BASE = 0x4000;  // CPU byte address
const VROM_BASE = 0x5000;
const RAM_SIZE = 0x800;    // 2 KB VRAM
const ROM_SIZE = 0x800;    // 2 KB VROM

const dvgMemory = new Uint8Array(0x2000);  // 8 KB total

// Load the vector ROM image at the boot phase:
const vromBytes = await fetch('assets/vector_rom.bin').then(r => r.arrayBuffer());
dvgMemory.set(new Uint8Array(vromBytes), 0x1000);   // CPU $5000 = DVG offset $1000
// (the DVG sees offset $1000 = byte $1000, which is the start of the ROM region
//  when the CPU's $4000-$5FFF is mapped to DVG's $0000-$1FFF)
```

The 2 KB blob comes from extracting bytes `$5000-$57FF` out of the
disassembly dumps in `VectorROM.md`. Two extraction options:

**Option A — Extract directly from `roms/035127.02`.** The source
includes the actual ROM binary alongside the disassembly. This is
the cleanest path: ship that binary as the asset, no extraction
work needed.

**Option B — Reconstruct from the `.md` disassembly.** Parse each
`xxxx: BB BB` line in `VectorROM.md`, accumulate the bytes. Useful
if `roms/035127.02` is not redistributable (license check needed —
the disassembly is fan-disassembled, the binary may be Atari IP).

**Recommendation: check license before shipping `roms/035127.02`.**
If unclear, Option B (reconstruct from the disassembly) gives us a
defensible "we typed the bytes from a public disassembly" derivation
chain. The byte count is small (2 KB).

The build script that does this lives in `tools/build_vector_rom.py`
(planned for implementation phase). It reads `VectorROM.md`, parses
each address-line-byte triple, and emits a 2 KB binary file.

### 5.1 Calls into vector ROM from JS code

The CPU code's JSR instructions become **list-building helper
calls** in JS. For example, drawing the player ship at the ship's
current position becomes:

```js
// equivalent of $7555 mainListBuild's ship-draw subsection
function buildShipDraw(listBuilder, state) {
  listBuilder.emit_LABS(state.ship.x * 32, state.ship.y * 32, /* scale */ 9);
  listBuilder.emit_JSR(SHIP_DIR_TABLE[state.ship.direction >> 2]);
  if (state.ship.thrusting && (state.fastTimer & 1)) {
    listBuilder.emit_JSR(SHIP_DIR_TABLE[state.ship.direction >> 2] + SHIP_TO_THRUST_OFFSET);
  }
}
```

The JS `emit_JSR(addr)` writes the C-opcode + 12-bit word address
into the list (`(addr >> 1) | 0xC000`). The DVG interpreter
transparently bridges into ROM-space when the JSR target lands at
`$5000+`.

This means **all the vector ROM shapes are usable as-is**; the JS
code just needs to know the entry-point address of each. The
address-table for that becomes a small constants module:

```js
// asteroids_clone/vector_rom_table.js (planned)
export const VROM = {
  SHIP_EXPLOSION: 0x50E0,
  SHIP_EXPLOSION_VEL_TABLE: 0x50EC,
  SHRAPNEL_JUMP: 0x50F8,
  ROCK_JUMP: 0x51DE,
  UFO_ENTRY: 0x5252,
  SHIP_DIR_TABLE: 0x526E,
  LIVES_ICON: 0x54DA,
  CHAR_TABLE_START: 0x54F0,
  // ... per-letter entries to be filled in during character-port step
};
```

## §6. Open questions / deferred to implementation phase

- **Per-character entry-point addresses** — `VectorROM.md` lists 36
  addresses in its preamble (`$14F0, $1500, $151A, ...` in DVG-word
  notation = `$54F0+` in CPU bytes). The port needs an ASCII-code →
  ROM-address table; building it is a 5-minute task during the HUD
  port step.
- **Packed-string format** at `$77F6 PrintPackedMsg` — un-disasm
  region. Likely a length-prefixed ASCII-coded string with the
  decoder calling per-character `JSR`s into ROM. Cross-reference
  Mikstas's disassembly during HUD port.
- **Saucer large vs small dispatch** (§3.7) — verify by reading
  `$724F scoreLivesDraw` and `$7555 mainListBuild` (currently un-
  characterized) for the actual call-site.
- **Ship rotation** — port choice between byte-accurate 17-shape +
  reflection vs JS-friendly canvas-rotate. Default: canvas-rotate
  (cleaner). If subjectively wrong, switch later.
- **Asteroid shrapnel cycling** — exactly how many frames each
  pattern is shown, and whether all 4 cycle in sequence or one is
  randomly chosen per shot. Source's animator code lives near the
  collision resolution (`$6B47-$6B65` and friends); details TBD.

## §7. Citations summary

| Topic                                     | Address(es)       |
|-------------------------------------------|-------------------|
| Vector ROM memory map (CPU bytes)         | `$5000-$57FF`     |
| Vector ROM memory map (DVG word view)     | `$0800-$0BFF`     |
| Power-on test pattern                     | `$5000-$5086`     |
| BANK ERROR text (Rev 2)                   | `$5088-$50A2`     |
| Credits text (Rev 2 "c 1979 ATARI INC")   | `$50A4-$50DE`     |
| Ship explosion shape + velocity table     | `$50E0-$50F6`     |
| Shrapnel jump table + 4 patterns          | `$50F8-$51DC`     |
| Rock jump table + 4 patterns              | `$51DE-$524E`     |
| UFO shape                                 | `$5252-$526C`     |
| Ship-direction table + 17 ship shapes     | `$526E-$54D8`     |
| Lives icon                                | `$54DA-$54EE`     |
| Character set                             | `$54F0-$57FF`     |
| Packed-string printer (CPU-side)          | `$77F6` (un-disasm body) |
| Asteroid-size = scale, not shape          | per [[research_collisions.md §3]] |
| Mirror trick for full-circle ship rotation| §3.8              |
| Rev 1 ROM dump (PAGE SELECT ERROR text)   | `VectorROM1.md`   |
| ROM binary file                           | `roms/035127.02`  |
