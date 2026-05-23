# research_dvg.md — Digital Vector Generator

Source-of-truth references: `DVG.md` and `VectorROM.md` in the
ComputerArcheology Asteroids listing (path in `../CLAUDE.md`), plus
Jed Margolin's annotated schematic at
<http://www.jmargolin.com/vgens/aster.pdf> and Phil Pemberton's
overview at <http://www.philpem.me.uk/elec/vecgen.pdf>.

This doc is the spec the canvas-side DVG interpreter will be built
from. No prototype is included — per [[CLAUDE.md]] research-stage
plan, gameplay code (including the interpreter) lands in the
implementation phase from this spec.

## §1. Overview

The DVG is a custom processor that reads a 16-bit-word **display
list** from shared memory (`$4000-$5FFF`) and steers a CRT's electron
beam along the requested vectors. It runs in parallel with the main
CPU (see [[research_hardware.md §5]]) and has its own program counter,
4-level call stack, brightness DAC, and 2D position/scale latches.

Display lists are mixed: CPU-built **draw commands** live in vector
RAM (`$4000-$47FF`); reusable **vector subroutines** for sprite shapes
live in vector ROM (`$5000-$57FF`). The CPU constructs a list ending
in HALT, then writes any value to `$3000` (`GODVG`) to kick off the
DVG; the DVG runs until HALT and asserts the HALT line on `$2002`.

**Canvas mapping in one line:** the seven DVG opcodes map almost
trivially to `ctx.beginPath / moveTo / lineTo / stroke`, with a small
software interpreter holding cursor (x, y), global scale, brightness,
and a 4-deep return-address stack.

## §2. Memory model — CPU bytes vs DVG words

The 8 KB region `$4000-$5FFF` is shared:

| CPU byte range | DVG word range | Populated? |
|----------------|----------------|------------|
| `$4000-$47FF`  | `$0000-$03FF`  | Vector RAM (display list, CPU writes) |
| `$4800-$4FFF`  | `$0400-$07FF`  | Unused (expansion) |
| `$5000-$57FF`  | `$0800-$0BFF`  | Vector ROM (sprite subroutines) |
| `$5800-$5FFF`  | `$0C00-$0FFF`  | Unused |

Two access widths:

- **CPU writes** individual bytes — display lists are built byte by
  byte, little-endian.
- **DVG reads** 16-bit words — every fetch is two consecutive bytes,
  LSB first.

Example from `DVG.md`:

```
CPU writes (byte address):  $4000: BF 36   BF 06
DVG reads (word address):   $0000: 36BF    06BF
```

JSR/JMP target addresses in display-list code are **word addresses**
(0-bit-shifted from the CPU's perspective); the DVG multiplies by 2
to derive the byte offset. Disassembly conventionally shows both:
e.g. `JSR $0AE4 ($15C8)`.

**Port implication:** Model the display list as a `Uint8Array` of
2048 bytes (vector RAM) plus a static `Uint8Array` of the vector
ROM image. Walk it with a `pc` byte-index that advances by 2 or 4 per
opcode. Multiply word-address targets by 2 to get byte indices.

## §3. Coordinate system

| | |
|---|---|
| Range  | (0, 0) lower-left → (1023, 1023) upper-right |
| Cursor | (x, y) maintained internally, mutated by VEC/SVEC, set absolutely by LABS |
| Y axis | **Up** (positive Y is toward the top of the screen) |

**Canvas Y-flip is required.** HTML5 canvas uses Y-down with origin
top-left. The interpreter must flip on output:

```
canvas_y = canvas_height - (dvg_y * canvas_height / 1024)
```

…or equivalently apply a `ctx.setTransform` with negative Y scale
before drawing.

The 1024×1024 vector space is rendered onto whatever canvas size the
port uses; default sizing should preserve the original cabinet's
aspect ratio (the production game ran on a 1024-wide × 768-tall
visible window, with the upper 256 units unused — confirmed by the
LABS examples in `VectorROM.md` test pattern which use y ≤ 895).

This section covers the DVG layer in isolation. See
[[research_position_math.md §6]] for the full three-layer model
(game-coord → DVG-coord → canvas-coord) — including where each
conversion happens in the port (`Ship.dvgPos()`, `toCanvasY`) and
why the cursor passed to `runList` must be shared across sequential
draws (the I-8c thrust-flame anchor pattern).

## §4. Scale model — power-of-2 division

**Both VEC and SVEC use the same additive scale model.** Two fields
combine into a **total scale** that drives a single barrel shifter:

- **Global scale** (`$00-$0F`) — set by LABS, persists until next LABS
- **Local scale** — per-opcode field. Source differs between VEC and SVEC:
  - VEC: the opcode nibble itself (`0..9`).
  - SVEC: the 2-bit `Ss` field remapped to `scaleMode + 2` → `2..5`. See §6 for the bit-level details.

The values are *added* to form the **total scale**, used as a
power-of-2 divisor:

| Total | Divisor |
|-------|---------|
| 0     | /512    |
| 1     | /256    |
| 2     | /128    |
| 3     | /64     |
| 4     | /32     |
| 5     | /16     |
| 6     | /8      |
| 7     | /4      |
| 8     | /2      |
| 9     | /1 (no scaling) |

So:

```
shift = 9 - total_scale
rendered_dx = (|raw_dx| >> shift) × sign(raw_dx)
rendered_dy = (|raw_dy| >> shift) × sign(raw_dy)
```

The shift acts on an **unsigned magnitude**, then the sign is
re-applied — i.e. truncation toward zero. This is NOT the same as
JS's `>>` operator on signed values, which rounds toward −∞ for
negatives. See §10 port implication.

**Magnitude width.** VEC carries a full 10-bit magnitude (`0..1023`).
SVEC's 2-bit raw is placed in bits 9-8 of the same internal 10-bit
field (so it sees magnitudes `0, 256, 512, 768`) — the smaller
SVEC packet trades resolution for compactness but goes through the
identical barrel shifter. See §6 for the encoding detail.

**Wrap + saturate at total > 9** (corrected 2026-05-23 against MAME
`avgdvg.c` lines 631-641 + 785-799). The hardware does **two** things
before the barrel shift:

1. **4-bit mask:** `total = (local + global) & 0x0f` — the sum
   WRAPS modulo 16. So `local=6 + gs=14 = 20`, masked to `4`.
2. **Saturation:** if the masked `total > 9`, the hardware
   effectively sets `total = -1`, giving `shift = 10` (one bit
   smaller than `gs=0`'s `/512` — a render at `magnitude / 1024`).

The wrap is what makes the cabinet's use of "out of range" gs
values (10-15) produce visible output. Asteroids uses `gs=14` for
ship + small asteroid and `gs=15` for medium asteroid; both rely on
the wrap to bring `local + global` back into 0-9. For example:

- Ship VEC with `local=6`, `gs=14`: total = 20 & 15 = 4 → shift=5 →
  rendered ≈ raw/32 (small, visible)
- Rock1 SVEC with `local=5` (scaleMode=3), `gs=14`: total = 19 & 15
  = 3 → shift=6 → rendered ≈ raw/64 (smaller than at gs=0)
- Rock1 SVEC with `local=2` (scaleMode=0), `gs=14`: total = 16 & 15
  = 0 → shift=9 → rendered ≈ raw/512 (sub-pixel, truncates to 0)

So at high gs values some opcodes wrap into the visible range and
some truncate to zero — the rendered shape is a *subset* of the
shape at low gs, missing the smallest-scaleMode details. This is
deliberate cabinet behavior, not a bug.

When `total > 9` *after* the mask (i.e. masked sum lands in 10-15),
the saturation gives `shift = 10`. In integer-pixel arithmetic SVEC
truncates to 0 here (sub-pixel); for VEC the rendered delta is
`raw/1024` — small but possibly visible for large raws.

**Earlier (incorrect) version of this section claimed
"saturation = delta becomes ≈ 0 at total > 9".** That was true for
the SVEC integer-pixel case but wrong for VEC, and missed the
crucial wraparound mask. See dvg.js header for the implementation.

LABS coordinates are **absolute, NOT scaled** — they set the cursor
verbatim. Only VEC/SVEC deltas are scaled.

The same vector ROM subroutine can be drawn at different sizes by
calling LABS with different global scales before each JSR.
Asteroids uses this to render asteroids at 3 sizes from one
sprite-image set (see §8 and [[research_vector_rom.md §3.6]]).

**Port implication:** Implement the full wrap+saturate sequence:

```js
let total = (localScale + globalScale) & 0x0f;
if (total > 9) total = -1;
const div = 1 << (9 - total);
rendered = Math.trunc(raw / div);
```

JS's `Math.trunc(x / div)` matches the hardware's "shift unsigned
magnitude, re-apply sign" semantics. Plain `raw >> total_scale`
rounds toward −∞ for negative `raw`, off by one in edge cases,
and was a source of bug 2026-05-22. Omitting the `& 0x0f` mask
and the `total = -1` substitution was a source of bug 2026-05-23
(ship rendered way too big at the cabinet-true gs=14).

## §5. Brightness model

Per-VEC/per-SVEC field, 4 bits (0-15):

- `0` = invisible (move without drawing — common at the start of a
  subroutine to position the cursor)
- `1-15` = visible, increasing intensity

The hardware drives a brightness DAC; lines at higher intensity glow
brighter on the CRT.

**Port implication — three viable approaches:**

1. **Alpha-mapped strokes.** `strokeStyle = rgba(0, 255, 0, B/15)`
   per segment, `lineWidth = 1`. Simple, works in any canvas. Loses
   the CRT glow but maintains relative intensity.
2. **Width-mapped strokes.** Keep alpha=1, vary `lineWidth` with
   brightness. Approximates the "thicker line = brighter" CRT effect
   more closely than (1).
3. **Multi-pass bloom.** Draw twice: once thin at full alpha, once
   thick at reduced alpha, optionally with `globalCompositeOperation
   = 'lighter'`. Closest to CRT vector glow but most expensive.

The deferred "vector glow rendering" decision in `progress.md` lands
here. Default starting point: option 1 (alpha-mapped), upgrade later
if visuals warrant it. Either way, brightness 0 → skip the
`lineTo`/`stroke` and emit a `moveTo` instead.

## §6. Opcode reference

Upper nibble of the first word selects the opcode:

| Nibble | Opcode | Length    | Summary |
|--------|--------|-----------|---------|
| 0-9    | VEC    | 4 bytes   | Full-precision vector |
| A      | LABS   | 4 bytes   | Set cursor + global scale |
| B      | HALT   | 2 bytes   | End of list |
| C      | JSR    | 2 bytes   | Push return, jump to subroutine |
| D      | RTS    | 2 bytes   | Pop, return |
| E      | JMP    | 2 bytes   | Unconditional jump |
| F      | SVEC   | 2 bytes   | Short-precision vector |

The bit layouts below show word 1 first (CPU-bytes 0+1, LE) and word 2
where applicable (CPU-bytes 2+3, LE). Per `DVG.md` notation:

- `S` / `s` = scale bits
- `B` = brightness
- `m` = sign bit (1 = negative)
- `Y` / `X` = delta magnitude bits
- `y` / `x` = absolute coordinate bits (LABS only)
- `a` = JSR/JMP target word address
- `-` = unused (write zero)

### VEC (full vector) — 4 bytes

```
word 1:  SSSS -mYY YYYY YYYY   (scale 0-9 in upper 4, Y sign + 10-bit Y in lower 12)
word 2:  BBBB -mXX XXXX XXXX   (brightness in upper 4, X sign + 10-bit X in lower 12)
```

So |dx|, |dy| ≤ 1023 each. Effective dx, dy = sign × magnitude.

Worked example from `DVG.md`:

```
Bytes:    87FE 73FE   (LE words 0xFE87 0xFE73)
Decoded:  scale=08 (/2), bri=07, Y=−1022, X=1022
Rendered: cursor += (1022>>8, −1022>>8) = (+511, −511) with intensity 7
```

### LABS (load absolute + global scale) — 4 bytes

```
word 1:  1010 00yy yyyy yyyy   (opcode A, 10-bit Y)
word 2:  SSSS 00xx xxxx xxxx   (4-bit global scale, 10-bit X)
```

Both coordinates 0-1023, both absolute (not scaled). Global scale
persists for subsequent VEC/SVEC until the next LABS.

```
Bytes:    A37F 03FF   (LE words 0x7FA3, 0xFF03)
Decoded:  Y=895, X=1023, global scale=00 (/512)
```

### HALT — 2 bytes

```
B000   (literal — opcode B, all-zero payload)
```

DVG sets `HALT` flag (readable at `$2002`); main loop blocks on this
before starting the next frame (see [[research_hardware.md §5]]).

### JSR — 2 bytes

```
1100 aaaa aaaa aaaa   (opcode C, 12-bit word address)
```

Push current PC onto the 4-deep internal stack, jump to `a × 2` (byte
offset). **Stack overflow is unchecked** in hardware — the source
relies on subroutines never nesting beyond 4 levels.

### RTS — 2 bytes

```
D000
```

Pop top of stack, resume there. Underflow is undefined.

### JMP — 2 bytes

```
1110 aaaa aaaa aaaa   (opcode E, 12-bit word address)
```

Unconditional, no stack interaction.

### SVEC (short vector) — 2 bytes

The scale field is split across the word's halves; verified against
`VectorROM.md` test pattern.

```
word:    1111 smYY BBBB SmXX
```

- `Ss` together form a 2-bit `scaleMode` (S = high bit, s = low bit):
  `00`, `01`, `10`, `11`. Hardware **remaps** this to a local-scale-
  equivalent value `2, 3, 4, 5` (see below).
- `m` is the sign bit (Y in upper nibble, X in lower nibble)
- `YY` and `XX` are 2-bit magnitudes (0-3) — placed in **bits 9-8 of
  an internal 10-bit magnitude field**, i.e. effective magnitude is
  `raw × 256` = 0, 256, 512, or 768.
- `BBBB` is brightness as in VEC

**Scale interaction with global.** SVEC uses the same additive scale
model as VEC (§4): `total_scale = (scaleMode + 2) + global_scale`,
then `rendered_d = magnitude >> (9 - total_scale)`. Equivalently:

```
rendered_d = raw × 2^(scaleMode + 1 + global_scale)
             (saturating when total_scale > 9 — delta becomes ~0)
```

The disassembler's parenthesized "effective" value in
`VectorROM.md` (e.g. `(-24.00, -16.00)` for `SVEC scale=02(*8) x=-3
y=-2`) is the rendered value **at global scale 0** — not a pre-
global intermediate. Increasing global scale makes SVECs BIGGER,
just like it makes VECs bigger.

**`*2 / *4 / *8 / *16` notation.** `DVG.md` and `VectorROM.md`
annotate the scaleMode as `*2 / *4 / *8 / *16`. These multipliers
are the rendered magnitude at gs=0: scaleMode 0 → raw × 2,
scaleMode 1 → raw × 4, etc. The notation matches the formula above
when `global_scale = 0`: `raw × 2^(scaleMode + 1)`. It does NOT mean
"raw is multiplied by 2/4/8/16 and global divides on top" — that
was an incorrect early reading that produced visually wrong shapes
until 2026-05-22.

Worked examples from `VectorROM.md` (rendered values shown for gs=0):

```
Bytes 1058: DB F0  →  word 0xF0DB  →  SVEC scaleMode=2, bri=13, x=+3, y=0
                                       at gs=0: cursor += (+24, 0)
                                       at gs=5: cursor += (+768, 0)  (max valid: total=9)
                                       at gs=6: saturated, delta ≈ 0

Bytes 105E: 00 F9  →  word 0xF900  →  SVEC scaleMode=1, bri=0, x=0, y=+1
                                       at gs=0: cursor += (0, +4)
                                       at gs=6: cursor += (0, +256)  (max valid: total=9)
                                       at gs=7: saturated
```

Note: `DVG.md`'s SVEC example FF70 has a typo in its decoded-text
annotation ("scale=01(\*2), y=-6") — the encoding logic is consistent
with the table; the decoded annotation should read "scale=01(\*4),
y=-12". The bytes themselves are not in question; just the comment.

**Citation:** the corrected math is verified against MAME's
`avgdvg.c` (`temp = 2 + ((firstwd >> 2) & 0x02) + ((firstwd >> 11) &
0x01); temp = (scale + temp) & 0x0f; if (temp > 9) temp = -1;
deltax = (x << 16) >> (9 - temp)`) and against Nicholas Mikstas's
Asteroids HDL design notes
(<https://nmikstas.github.io/portfolio/asteroidsHDL/asteroidsHDL.html>),
which states explicitly: "Total Scaling Number = VEC(or SVEC)
Scaling Number + Global Scaling Number".

## §7. The 4-level call stack

Hardware reality:

- JSR pushes return PC; RTS pops.
- Internal stack depth is **4** — hardware does no overflow check.
- Asteroids' display lists are written with this in mind: top-level
  draw calls (`$7C03`, `$7CDE` — see [[research_main_loop.md]]) use
  at most 3 nested levels.

**Port implication:** Use a JS array (`stack.push(pc) / pc =
stack.pop()`); cap at 4 in the interpreter and `console.warn` on
overflow to catch authoring mistakes early. The source's display
lists are correct by construction, but our hand-written test lists
could regress.

## §8. Vector ROM organization (`$5000-$57FF`)

The 2 KB vector ROM is a flat block of DVG-encoded subroutines, all
ending in RTS. From `VectorROM.md`'s table-of-contents (visible
sections):

| Subroutines | What |
|-------------|------|
| Letters / digits | `JSR`-callable shapes for ASCII (high-score, "PUSH START", "GAME OVER", "PLAYER 1/2", "BANK ERROR") |
| Asteroid shapes | Four asteroid variants (rotated and scaled); see VectorROM1.md for revision differences |
| Ship | Player ship shape + thrust flame |
| UFO (large + small) | Saucer body shapes |
| Test pattern | Diamond + parallel-line array (visible at startup if BANK ERROR detected) |

Each letter is its own subroutine at a fixed word address, called by
JSR from a higher-level "print string" subroutine in vector ROM (or
from CPU-built lists for game text). The letter-set spans roughly
`$1500-$166X` (byte address) per the BANK ERROR example's JSR
targets.

Detailed sub-routine offsets — to be exhaustively cataloged in
[[research_vector_rom.md]] (R-F); this section is the high-level
inventory only.

**Port implication:** The 2 KB vector ROM image becomes a static
`Uint8Array` shipped with the port (no decode step). The interpreter
loads it into the same address space the CPU sees (`$5000-$57FF`
byte addresses), and JSR transparently bridges between RAM-built
lists and ROM-resident subroutines.

## §9. Display-list lifecycle

Per-frame, the CPU:

1. Builds the next list into VRAM (`$4000-$47FF`) byte-by-byte.
   Routines around `$7C03` and `$7CDE` (per [[research_main_loop.md]])
   are the list builders; the details of HOW the source structures
   these calls live in R-D.
2. Terminates with HALT.
3. Waits for the previous frame's DVG HALT signal at `$2002`.
4. Writes any byte to `$3000` (GODVG).
5. Proceeds to game logic for the *next* frame while DVG draws this
   one (the parallelism described in [[research_hardware.md §5]]).

**Port implication:** No parallelism is needed in canvas. Per-frame:

```js
buildDisplayList(state);   // CPU-side equivalent
dvg.run(displayList);      // sets cursor, walks opcodes, calls ctx.lineTo / stroke
                            //   — synchronous, no second buffer
```

The "frame N draws while frame N+1 is being built" optimization is a
historical artifact, not a gameplay-mechanism dependency.

## §10. Canvas-side port spec — bit-layout reference (input to build script)

**Note (2026-05-22):** the runtime no longer interprets raw ROM bytes
directly — see §11 for the decoded-object format that supersedes this
section's runtime model. The bit-layout details below remain
authoritative as the spec the build script consumes when decoding
`VectorROM.md` into the runtime format; the pseudocode loop is a
useful reference for what the runtime interpreter is conceptually
doing per opcode.

Component | JS shape
---|---
State | `{ x, y, globalScale, brightness, stack: [], pc }`
Memory | `Uint8Array(8192)` (VRAM 0-2047, ROM 4096-6143 — match CPU offsets)
Entry | `dvg.run(ram, rom)` — sets up state, loops opcode-dispatch until HALT
Output | Direct `ctx.moveTo / lineTo / stroke` per VEC/SVEC; `beginPath` at LABS
Coord transform | `screenX = x * scaleX`; `screenY = canvasH - y * scaleY`
Scale arithmetic | `dx_rendered = Math.trunc(magnitude / (1 << (9 - total_scale)))` — shift magnitude unsigned then re-apply sign (§4)
Brightness | Per-segment `strokeStyle = rgba(0,255,0,bright/15)` — see §5
Stack | JS array, `console.warn` if depth > 4
Done flag | After HALT, set a `halted: true` field readable from outside (analog to `$2002` bit)

Pseudocode for the main dispatch loop (corrected 2026-05-22 against
MAME `avgdvg.c` and Mikstas's Asteroids HDL — see §6 Citation):

```js
function run(ram, rom) {
  let pc = 0;                    // byte index into ram
  let x = 0, y = 0;
  let globalScale = 0;
  const stack = [];
  let halted = false;

  // Hardware: shift a 10-bit unsigned magnitude by (9 - total_scale),
  // then re-apply sign. JS's signed >> would round toward -∞ for
  // negatives, so use Math.trunc(magnitude / div) instead. Saturation:
  // total > 9 → delta ≈ 0 (decoder misbehaves; well-formed ROMs avoid).
  function applyScale(rawSigned, totalScale) {
    if (totalScale > 9) return 0;              // saturation
    const shift = 9 - totalScale;
    const mag = Math.abs(rawSigned);
    return Math.sign(rawSigned) * (mag >> shift);
  }

  while (!halted) {
    const w1 = ram[pc] | (ram[pc+1] << 8);   // LE word
    const op = (w1 >> 12) & 0xF;

    if (op <= 9) {                            // VEC
      const w2 = ram[pc+2] | (ram[pc+3] << 8);
      const localScale = op;                   // opcode nibble IS local scale
      const totalScale = localScale + globalScale;
      const ySign = (w1 >> 10) & 1;
      const yMag = w1 & 0x3FF;                 // full 10-bit magnitude
      const xSign = (w2 >> 10) & 1;
      const xMag = w2 & 0x3FF;
      const bri = (w2 >> 12) & 0xF;
      const dx = applyScale(xSign ? -xMag : xMag, totalScale);
      const dy = applyScale(ySign ? -yMag : yMag, totalScale);
      drawVector(x, y, x + dx, y + dy, bri);
      x += dx; y += dy;
      pc += 4;
    } else if (op === 0xA) {                  // LABS
      const w2 = ram[pc+2] | (ram[pc+3] << 8);
      y = w1 & 0x3FF;
      x = w2 & 0x3FF;
      globalScale = (w2 >> 12) & 0xF;          // sets global, not scaled itself
      pc += 4;
    } else if (op === 0xB) {                  // HALT
      halted = true;
    } else if (op === 0xC) {                  // JSR
      const target = (w1 & 0x0FFF) * 2;
      stack.push(pc + 2);
      pc = target;
    } else if (op === 0xD) {                  // RTS
      pc = stack.pop();
    } else if (op === 0xE) {                  // JMP
      pc = (w1 & 0x0FFF) * 2;
    } else if (op === 0xF) {                  // SVEC
      const bri = (w1 >> 4) & 0xF;
      const s = (w1 >> 11) & 1;                // high bit of scaleMode
      const S = (w1 >> 3) & 1;                 // low bit of scaleMode
      const scaleMode = (s << 1) | S;          // 0..3
      const ySign = (w1 >> 10) & 1;
      const yMag = (w1 >> 8) & 0x3;            // 2-bit raw, 0..3
      const xSign = (w1 >> 2) & 1;
      const xMag = w1 & 0x3;
      // SVEC's 2-bit raw is placed in bits 9-8 of a 10-bit magnitude
      // (i.e. effective magnitude = raw × 256). scaleMode remaps to
      // local-equivalent scaleMode+2 (range 2..5). Then identical
      // additive scale + barrel shift as VEC.
      const localEquiv = scaleMode + 2;
      const totalScale = localEquiv + globalScale;
      const dx = applyScale((xSign ? -xMag : xMag) << 8, totalScale);
      const dy = applyScale((ySign ? -yMag : yMag) << 8, totalScale);
      drawVector(x, y, x + dx, y + dy, bri);
      x += dx; y += dy;
      pc += 2;
    }
  }
}
```

This is the spec, not committed code — the actual interpreter lands
in the implementation phase. Two open decisions left for that phase:

1. **`drawVector` brightness mapping** — start with alpha-mapped
   (§5 option 1); revisit if glow is needed.
2. **Stack depth check** — `console.warn` at >4 vs silent? Pick
   `console.warn` initially to catch our own hand-written-list
   mistakes during R-F vector-ROM porting; loosen later.

## §11. Vector ROM data representation — decoded-object format

Decided 2026-05-22 in discussion. Supersedes the runtime model in §10
(which is retained as the bit-layout spec the build script consumes).

**Status:** Implemented and verified. `tools/build_vector_rom.py`
emits `vector_rom_data.js` containing 81 decoded subroutines covering
all gameplay-active shapes. The data is byte-faithful to the ROM (no
modernizing transforms applied — see `progress.md` for the recipe
that was tried and reverted). The `dvg.js` interpreter (~40 LOC)
walks the decoded objects and emits canvas line strokes.

The vector ROM ships as a generated JS module exporting an object
keyed by source-label name. Each subroutine is an array of decoded
opcode objects; the runtime interpreter walks these directly rather
than the underlying ROM bytes.

### Format

```js
export const VROM = {
  ShipDir0: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx:  -3, dy:  -2},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx:   0, dy:  +2},
    // ...
    {op: 'RTS'},
  ],
  // ... ~80 more subroutines
};
```

### Per-opcode field convention

| Opcode | Fields                          | Notes |
|--------|---------------------------------|-------|
| `LABS` | `x, y, globalScale`             | absolute coords; `globalScale` persists until next LABS |
| `VEC`  | `localScale, bri, dx, dy`       | `localScale` is added to current `globalScale` at draw time (per §4) |
| `SVEC` | `scaleMode, bri, dx, dy`        | `scaleMode` 0-3 is remapped to local-equivalent `scaleMode+2` (range 2..5) and added to `globalScale` the same way VEC's `localScale` is (§4 + §6). The `×2/×4/×8/×16` annotation in `VectorROM.md` is the rendered magnitude at gs=0 (`raw × 2^(scaleMode+1)`), NOT a separate "multiply then divide by global" formula. |
| `JSR`  | `target`                        | symbolic name string, e.g. `'ShipDir0'`; matches source label |
| `JMP`  | `target`                        | as JSR |
| `RTS`  | —                               | |
| `HALT` | —                               | |

Convention reasoning:

- **`x, y` vs `dx, dy`** — absolute coords use `x, y` (LABS only);
  delta motion uses `dx, dy` (VEC, SVEC). Grepping `dx` finds every
  relative-motion site; grepping `x:` finds every absolute set.
- **Scale field names** encode the semantic role (`globalScale` /
  `localScale` / `scaleMode`), not just "scale". The names disambiguate
  the three different scale concepts in the opcode set.
- **JSR/JMP targets are symbolic names matching source labels**
  (`'ShipDir0'`, not `0x5290`). The CPU-side indexed lookups port to
  arrays of strings (e.g. `SHIP_DIR_TABLE`); readability is the win.

### Interpreter sketch

Matches the implemented [`dvg.js`](../dvg.js). See §4 and §6 for the
math derivations and the MAME/HDL citations.

```js
export function runList(VROM, list, cursor, globalScale, drawSegment) {
  for (const op of list) {
    switch (op.op) {
      case 'LABS':
        cursor.x = op.x; cursor.y = op.y; globalScale = op.globalScale;
        break;

      case 'VEC': {
        const fromX = cursor.x, fromY = cursor.y;
        // Hardware shifts an unsigned magnitude then re-applies sign
        // (truncation toward zero); JS `>>` rounds toward -∞ for
        // negatives, so we use Math.trunc(raw / div) instead.
        const div = 1 << Math.max(0, 9 - (op.localScale + globalScale));
        cursor.x += Math.trunc(op.dx / div);
        cursor.y += Math.trunc(op.dy / div);
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'SVEC': {
        const fromX = cursor.x, fromY = cursor.y;
        // scaleMode 0..3 remaps to local-equivalent 2..5, added to
        // globalScale exactly like VEC. Saturation: total > 9 →
        // hardware quirk, integer delta ≈ 0.
        const total = (op.scaleMode + 2) + globalScale;
        const mul = total > 9 ? 0 : 1 << (op.scaleMode + 1 + globalScale);
        cursor.x += op.dx * mul;
        cursor.y += op.dy * mul;
        if (op.bri > 0) drawSegment(fromX, fromY, cursor.x, cursor.y, op.bri);
        break;
      }

      case 'JSR':  runList(VROM, VROM[op.target], cursor, globalScale, drawSegment); break;
      case 'JMP':  return runList(VROM, VROM[op.target], cursor, globalScale, drawSegment);
      case 'RTS':  return;
      case 'HALT': return 'halt';
    }
  }
}
```

JS recursion replaces the DVG's 4-deep hardware stack — each
recursive `runList` call corresponds to one push/pop. The depth
limit is no longer a constraint (per §7, source uses at most 3
nested levels).

### Why this format

1. **Human-readable.** Every shape can be inspected by reading the
   data file. No bit-decoding in your head to understand what a
   subroutine draws.
2. **One mechanism, one interpreter.** The CPU's per-frame vector RAM
   list is the same format, built by ported CPU code. The interpreter
   doesn't distinguish ROM-resident shapes from CPU-built lists —
   both are arrays of opcode objects.
3. **No per-shape function proliferation.** An earlier consideration
   of decompiling each ROM subroutine into its own JS draw function
   was rejected — ~80 nearly-identical functions for what is
   fundamentally data, not code.
4. **Runtime cost.** No bit-decoding per opcode. V8 hidden classes
   collapse the ~500 identically-shaped opcode objects into a single
   shape descriptor; memory cost is negligible.

### Build pipeline

`tools/build_vector_rom.py` parses the disassembly text under
`<sparse-clone>/content/Arcade/Asteroids/VectorROM.md`, walks the
opcode bytes per §6 / §10, and emits:

- `asteroids_clone/vector_rom_data.js` — the runtime input (above)
- `asteroids_clone/assets/vector_rom.bin` — byte dump for verification
  against `roms/035127.02` (planned roundtrip check via
  `tools/check_roundtrip.py`)

First implementation milestone is scoped to the ship region
(`$5290-$54D8`, 17 ShipDirN + 17 ThrustDirN = 34 subroutines) to
validate the format before scaling the script to the rest of the ROM.

### Trade-off accepted

Byte-level MAME cross-check is not free anymore — the runtime input
is no longer the source ROM bytes. Mitigation: the planned roundtrip
checker re-encodes the decoded form and asserts it matches
`roms/035127.02`. Byte-accuracy is preserved as a build-time
invariant, just not as a runtime artifact.

## §12. Deferred questions

- **CRT vector glow.** Whether to attempt bloom emulation (§5 option
  3) is purely a port-side visual decision and can land or not at any
  time. Recommend deferring until the game is playable; the alpha
  mapping is "honest" enough for development.
- **DVG-list builder routines.** `$7C03` and `$7CDE` are the source's
  high-level list builders for the per-frame display list; they sit
  in the ~20% un-disassembled region per `Code.md`. Mikstas's
  alternate disassembly may have these. [[research_main_loop.md]]
  (R-D) is the natural place to chase them down — they're more about
  "how the source decides what to draw this frame" than about the
  DVG itself.
- **Bank-error / power-on test.** The test pattern at `$5040+`
  (rendered if RAM check fails) is harmless; ignored by the port.

## Citations summary (for grep)

- DVG hardware spec: `DVG.md` (full file)
- Opcode encoding examples: `DVG.md` "VEC" / "LABS" / "SVEC" sections
- Vector-ROM test pattern: `VectorROM.md` lines `$1000-$1086`
- BANK ERROR string example: `VectorROM.md` lines `$1088-$10A2`
- DVG/CPU shared bus: `Hardware.md` "Other" table + this doc §2
- HALT / GODVG: `Hardware.md` `$2002` / `$3000`, plus `Code.md`
  `$6815`, `$6822`
- External: <http://www.jmargolin.com/vgens/aster.pdf> (schematic);
  <http://www.philpem.me.uk/elec/vecgen.pdf> (background)
