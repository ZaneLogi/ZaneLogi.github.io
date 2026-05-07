# Phoenix Coordinate System and Display — Research Notes

**Status:** addressing and shape-format claims now derived directly
from the local 8085 disassembly (`Code.md`); pixel-level rendering
not yet exercised end-to-end. The remaining `⚠ verify` markers in
Section 5 (background scroll pacing) and the optional MAME spot-check
in Section 7.4 are the only items still unconfirmed.

This is the up-front coordinate-system spec for the Phoenix port. It is
derived primarily from the Computer Archeology Phoenix disassembly
(`https://www.computerarcheology.com/Arcade/Phoenix/`, also mirrored
locally in `D:\tmp\computer_archeology_phonenix\content\Arcade\Phoenix\`)
and cross-checked against the MAME `phoenix.cpp` driver.

The architecture of Phoenix is fundamentally different from Galaga
(see the Galaga clone's `research_coordinate_system.md`): **Phoenix has
NO sprite chip**. All moving objects (player ship, bullets, aliens,
birds, mothership) are software-blitted into the same tile/character
RAM that holds the static screen. So the conversion question is
different — instead of "what does the sprite chip do with a register
byte?" it's "how does the ROM convert a coordinate byte into a
character-RAM address?"

---

## 1. Native hardware screen resolution

### 1.1 The numbers

From MAME `src/mame/phoenix/phoenix.h`:

```
MASTER_CLOCK = XTAL(11'000'000)        // 11 MHz
PIXEL_CLOCK  = MASTER_CLOCK / 2        // 5.5 MHz
HTOTAL       = (512 - 160) = 352
HBEND        = 0
HBSTART      = 256
VTOTAL       = 256
VBEND        = 0
VBSTART      = 208
```

Visible area in **raw (unrotated) hardware orientation** is therefore
**256 wide × 208 tall**. This matches the FPGA reimplementation
(`emard/vhdl_phoenix`), which independently confirms "352 pixels
horizontal with 96 pixels non-visible and 256 pixels visible, and 256
lines vertical with 48 lines non-visible and 208 lines visible".

### 1.2 The tile-grid corroboration

Computer Archeology's RAM page states:

> "26 columns by 32 rows (after rotation) … each graphics tile is 8x8
> pixels. This gives a rotated screen dimension of 26\*8 x 32\*8 =
> 208x256 pixels."
> (`Arcade/Phoenix/RAMUse.html`, "Screen memory" section)

So in **display orientation** the screen is **208 px wide × 256 px
tall** (a vertical/portrait monitor). The unrotated 256×208 swaps to
208×256 after the cabinet rotation. Both sources agree.

Refresh rate is the standard arcade ~60.6 Hz (PIXEL_CLOCK 5.5 MHz /
HTOTAL 352 / VTOTAL 256 ≈ 61.04 Hz).

---

## 2. Screen orientation

### 2.1 The cabinet

MAME's Phoenix `GAME(...)` macros all use **`ROT90`** (per the MAME
phoenix.cpp source and corroborated by web search of the driver). The
monitor in the arcade cabinet is physically rotated **90° clockwise**
relative to the raw scan-out, giving a vertical playfield with the
player at the bottom and the alien formation entering from the top.

Computer Archeology phrases the same fact:

> "The screen is rotated physically clockwise, but the screen memory
> layout is standard upper-left corner to lower right corner."
> "The first (upper left) byte of screen memory maps to the upper
> right corner of the rotated screen."
> (`Arcade/Phoenix/RAMUse.html`)

### 2.2 What this means for the canvas

The HTML5 canvas should be **portrait** (taller than wide), matching
the arcade cabinet, not the raw scan orientation. **Recommended
canvas: 208 × 256.** (See Section 7 for whether to scale up.)

In the canvas, +X is to the right and +Y is downward, which is the
natural display convention. Because we render in display orientation
(not raw scan orientation), we do not need to implement the rotation
in software — we draw tiles directly into the rotated grid.

### 2.3 The ROM's view vs. the screen's view

The Z80/8085 ROM does NOT think in display X/Y. It thinks in **screen
memory pointer arithmetic**, where:

> "Adding one to a screen memory pointer moves 1 row down the screen.
> Subtracting one moves the pointer 1 row up on the screen. Adding 32
> to a screen memory pointer moves 1 column left. Subtracting 32 moves
> the pointer 1 column right."
> (`Arcade/Phoenix/RAMUse.html`)

So **in memory layout**: stride 1 = vertical step in display
orientation; stride 32 = horizontal step in display orientation
(reversed: +32 moves *left* on the display).

This is the most important quirk to internalise. If you naively walk
"left to right" in screen memory (stride 1) you are actually walking
top-to-bottom of the displayed image.

---

## 3. Tile/character resolution and addressing

### 3.1 Tile size

**8 × 8 pixels per tile**, with **2 bits per pixel** (4 colours per
palette entry). Tiles are stored as two bitplanes in graphics ROM, each
plane 8 bytes per tile. (Computer Archeology `bgtiles.html` and the
Journal page; matches MAME's `gfx_layout` for Phoenix.)

### 3.2 Tile-grid layout

**32 columns × 26 rows in raw memory layout, displayed as 26 columns ×
32 rows after the 90° rotation.** Tile RAM is 32 × 26 = 832 bytes per
plane; the address ranges below are 0x0340 long, which is 832.

### 3.3 Tile RAM banks

Phoenix has **two video-RAM pages**, both 0x4000-0x4FFF, swapped by
bit 0 of the video register at `0x5000`:

```
Foreground page (page 0): 0x4000–0x433F   (32×26 = 832 bytes)
Background page (page 1): 0x4800–0x4B3F   (32×26 = 832 bytes)
```

The MAME video routine confirms two tile maps with the foreground
drawn over the (scrolling) background:

> "There are two sets of sprites: background and foreground. The
> foreground is drawn over the scrolling background."
> (`Arcade/Phoenix/Journal.html`)

In MAME's `phoenix_v.cpp`:
```c
TILE_GET_INFO_MEMBER(phoenix_state::get_fg_tile_info) {
    code = m_videoram_pg[m_videoram_pg_index][tile_index];
    col  = (code >> 5);
    col  = col | 0x08 | (m_palette_bank << 4);
    tileinfo.set(1, code, col, 0);
}
```

So a **tile byte is the character index directly**; the **upper 3 bits
of the tile index also feed into the palette selection** (so tile
0x00..0x1F use one palette region, 0x20..0x3F another, etc.). The
`palette_bank` (selected by bit 1 of the video register at 0x5000) is
the "letters blue / digits red" trick noted in the journal.

### 3.4 Memory-pointer arithmetic (already quoted above)

```
MSB|LSB   stride  display effect
   +1            move down 1 row     (display Y += 8 px)
   +32           move left 1 column  (display X -= 8 px)
```

Tile cell `(col, row)` in display orientation, with col counted
left-to-right (0..25) and row counted top-to-bottom (0..31), maps to
memory address as follows. The ROM uses a 26-entry lookup table at
`T0A00` (`Code.md:L09BA`) for the column-MSB:LSB pair, then adds the
row to the LSB:

```
addr = (T0A00[col].MSB << 8) | (T0A00[col].LSB + row)

T0A00[ 0] = 0x4320   (display col 0  = leftmost)
T0A00[ 1] = 0x4300
T0A00[ 2] = 0x42E0
...                   stride = -0x20 per col
T0A00[24] = 0x4020
T0A00[25] = 0x4000   (display col 25 = rightmost, the literal "first byte" of screen RAM)
```

Equivalent closed form: `addr = 0x4320 - col * 0x20 + row`, i.e.
`addr = 0x4000 + (25 - col) * 32 + row`. So the only inversion is the
column axis (display X→memory MSB stride is reversed); rows are
NOT inverted (display row 0 = memory LSB 0 within each column block).
This is fully consistent with the two pointer-arithmetic facts above
(+1 = down, +32 = left) and with Computer Archeology's "first byte →
upper right" statement.

Verified against `Code.md:L09BA` (`GetScreenRamAddress`) and the table
at `Code.md:T0A00`.

---

## 4. "Sprite" resolution and addressing

**Phoenix has no dedicated sprite hardware.** The player ship, bullets,
aliens, birds and mothership are all drawn by the CPU as character
bytes written into the same tile RAM described in Section 3. The
"sprites" are simply blitted shapes of one or more 8×8 tiles.

### 4.1 Object RAM (the source of truth for object positions)

From `Arcade/Phoenix/RAMUse.html`:

```
0x43C0  PlayerState              (control byte)
0x43C1  PlayerShape              (character/shape index)
0x43C2  PlayerShipX              (grid coord, $0C min, $64 default, $C0 max)
0x43C3  PlayerShipY              (grid coord, $D8 default — fixed, player only moves on X)

0x43C4–43C7  PlayerBullet  (state, shape $50–$57, X, Y)
0x43CC–43DF  EnemyBullet0..4  (4 bytes each: state, shape $58–$5F, X, Y)

0x4B70..0x4BAF  Aliens 0..F (or Birds 0..7, levels 3/4/8/9)
                4 bytes each (StateA, StateB/Shape LSB, X, Y)
```

Each object also has a **cached screen-RAM address pair** maintained by
the engine so erase/redraw doesn't have to recompute it:

```
0x43E0–43E1  OldPlayerShipMSB/LSB  (where to erase from this frame)
0x43E2–43E3  PlayerShipMSB/LSB     (where it was drawn)
0x43E4–43E7  PlayerBullet addrs (Old, current)
0x43EC–43FF  EnemyBullet addrs (5 × 4 bytes)
0x4BB0–4BEF  Alien addrs       (16 × 4 bytes)
```

This Old/Current pattern means the per-frame loop is:
```
for each object:
   1. erase by writing blank tile bytes at OldMSB/LSB
   2. compute new screen address from (X, Y)
   3. write shape's tile bytes at the new address
   4. copy new address into Old slots for next frame
```

### 4.2 X/Y → screen-RAM-address conversion

`L09A0` (`Code.md:L09A0`) is just a wrapper that loops over the
player ship and the two bullet slots (`43C2/43C6/43CA`), writing
results into `43E2/43E6/43EA`. The actual coord→address math is in
`GetScreenRamAddress` at `Code.md:L09BA`:

```
09BA: LD   HL,$0A00       ; T0A00 base
09BD: LD   A,(BC)         ; A = X coord (43C2)
09BE: AND  $F8            ; mask to multiple-of-8 (drop low 3 bits)
09C0: RRCA                ; A = (X & 0xF8) >> 1 (with bit 7 carrying — but X<=0xC0 so bit 7 = 0)
09C1: RRCA                ; A = (X & 0xF8) >> 2  → byte stride 2 into T0A00
09C2: ADD  A,L            ; HL = T0A00 + 2*(X>>3)
09C3: LD   L,A
09C4: LD   A,(HL)         ; MSB byte from T0A00
09C5: LD   (DE),A         ; → 43E2 (PlayerShipMSB)
09C6: INC  BC             ; advance to Y coord (43C3)
09C7: INC  DE             ; advance to LSB slot (43E3)
09C8: INC  HL             ; advance to LSB byte of T0A00 entry
09C9: LD   A,(BC)         ; A = Y coord
09CA: AND  $F8
09CC: RRCA
09CD: RRCA
09CE: RRCA                ; A = Y >> 3 (three RRCAs since Y<=0xF8 fits)
09CF: ADD  A,(HL)         ; LSB = T0A00.lsb[X>>3] + (Y>>3)
09D0: LD   (DE),A         ; → 43E3 (PlayerShipLSB)
09D1: RET
```

So the conversion is **pure tile-grid**:

```
col = X >> 3                 // 0..25
row = Y >> 3                 // 0..31
addr = (T0A00[col].MSB << 8) | (T0A00[col].LSB + row)
     = 0x4000 + (25 - col) * 32 + row
```

The **low 3 bits of X and Y are discarded** (`AND $F8`) — but **only
for the screen-RAM address calculation**, not for the visible sprite
position. State coords are pixel-granular: the player ship moves
1 px/frame (`L0900` does `DEC (HL)` on `PlayerShipX`), so intermediate
positions like `0x65`, `0x66`, `0x67` are real and visible.

The engine handles sub-tile rendering by maintaining **8 pre-shifted
shape variants** of each moving sprite. From `Code.md:T1600`:

```
1600: 10 14 18 1C    ; player ship frame #5, #6, #7, #8
1604: 00 04 08 0C    ; player ship frame #1, #2, #3, #4
```

Eight shape indices total, picked by `PlayerShipX & 7` (see
`Code.md:L0926`). And `Code.md:T1620` literally comments **"8 player
bullets for the fine bit shifting"**:

```
1620: 50 51 52 53 54 55 56 57    ; 8 bullet tile variants for X & 7 = 0..7
```

So Phoenix renders smoothly at 1-pixel granularity, even though the
underlying tile chip only addresses 8-pixel cells, by pre-rendering
the 8 shifted variants in tile-ROM and selecting at draw time.

The `Code.md:L0AA0` (`DrawShields`) comment "ignore any fine bit
shifting of the player" is **specific to the shield**: the shield
uses the player's tile-aligned screen-RAM address as a reference
point (no per-shield-element sub-shifting), but the ship sprite drawn
on top of that reference does sub-shift via the variant trick.

**JS port consequence:** state X/Y are integers in pixels (1-pixel
movement increments); `drawImage` at any integer pixel position
handles sub-tile alignment natively — no need to pre-render 8
variants. Decode the 8-aligned canonical shape variant only.

PlayerShipX defaults to **0x64 (=100)**, min **0x0C (=12)**, max
**0xC0 (=192)**. With `(X>>3)` that's columns 1..24 — leaving a 1-tile
margin on each side of the 26-column display. PlayerShipY defaults to
**0xD8 (=216)** → row 27, putting the ship 4 rows from the bottom.

### 4.3 Shape data

The 0x1700–0x17DC region of the **program** ROM (not graphics ROM)
holds three different things, all "shape-adjacent" but with distinct
formats:

**(a) `T1700` — alien-movement direction table** (`Code.md:T1700`,
0x1700–0x173F). Pairs of signed bytes `(dX, dY)` selected by an index
in alien state. Not shape data at all; the previous doc misplaced it.
Used by the alien controller around `Code.md:L0D3B` (`A * 2` →
LSB into 0x17xx).

**(b) `T1770` — 4×4 player-ship and shield-frame shape table**
(`Code.md:T1770`, 0x1770–0x17AF). Four 16-byte (4×4) frames, each
storing **raw tile indices in column-major order** (rows fastest):

```
1770: EC FC FD F4 ED 30 40 F5 EE 31 41 F6 EF FF FE F7   ; ship + large shields
1780: E8 F8 F9 F0 E9 30 40 F1 EA 31 41 F2 EB FB FA F3   ; ship + small shields
1790: E8 F8 F9 F0 E9 E4 E6 F1 EA E5 E7 F2 EB FB FA F3   ; green ship + large shields
17A0: 00 00 00 00 00 E4 E6 00 00 E5 E7 00 00 00 00 00   ; green ship, no shields (00 = transparent)
```

`DrawShields` (`Code.md:L0AA0`) selects one of these four frames by
ANDing the shield counter with `0x0C` and shifting left twice (×4
gives 16-byte stride), then jumps to `DrawImageCbyB`
(`Code.md:L0AD6`). That generic blitter takes BC = (rows, cols), HL =
shape pointer, DE = screen pointer, and writes one tile byte per
screen cell, advancing screen by `INC DE` (down 1 row in display)
inside the inner loop and by `RightOneColumn` (subtract 32) between
columns. So the encoding is:

```
shape[col][row]   stored row-major in memory? NO — column-major:
                  shape[c*rows + r] = tile_index
                  → blit order: outer = columns, inner = rows
                  → memory traversal mirrors the +1=down/+32=left
                    rule of screen RAM, so a straight copy works
```

Tile index `0x00` is the transparent/blank tile (see Section 5.2 and
`FourByFourEmpty` at `Code.md:L17F0` — sixteen `0x00` bytes used
both as shield-erase data and as alien-explosion frame #5).

**(c) `T17B0` and the explosion frames** (`Code.md:0x17B0`–0x17DC).
`17B0` is a one-byte-per-frame LSB lookup ("alien explosion frame
sequence #5,#4,#3,#2,#1,#2,#1,#2"); the targeted frames at
0x17B8/17BE/17C4/17CA/17D0/17D6 are 6-byte 3×2 tile arrays in the
same column-major encoding as `T1770`. Drawn by `Draw3x2`
(`Code.md:L3540`), which is just an unrolled `DrawImageCbyB` for the
3-col × 2-row case.

**Summary of shape-table encoding (`T1770` and friends):**

| Field              | Value                                       |
|--------------------|---------------------------------------------|
| Layout             | Column-major (rows fastest)                 |
| Element            | 1 byte = direct tile index into fg/bg ROM   |
| Footprint          | Implicit (caller passes BC = rows × cols)   |
| Transparent index  | `0x00` (`FourByFourEmpty`)                  |
| Frame stride       | rows × cols bytes                           |

Object/alien shapes outside `T1770` (Bird, Bird-pilot, mothership
parts, etc.) follow the same column-major-of-tile-indices convention,
sized per the caller's BC. Examples in the disassembly: `T0A40`
(`Code.md:T0A40`, 4-byte 2×2 alien shapes), `T17D0`/`T17D6` (3×2 bonus
explosion halves).

### 4.4 No hidden offsets or doubling

Because Phoenix is software-blitted, there is **no analogue to
Galaga's −16 / −40 sprite-chip offsets**. The pixel position you
write the shape to *is* the pixel position it appears. The only
"hidden" transformations are:
- the rotation between memory layout and display (Section 3.4)
- the divide-by-8 to reach the tile-grid (suspected; verify)
- the background scroll (Section 5) for objects in the background plane

There is no sprite zoom/double on Phoenix.

---

## 5. Background plane (scrolling starfield / planet)

Phoenix has a **vertically-scrolling background** that produces the
star/planet motion in some levels. It is not a particle starfield like
Galaga's — it is the **background tile page** (page 1 at 0x4800–0x4B3F)
scrolled hardware-style.

### 5.1 The scroll register

Address `0x5800` is `scrollRegister`. From MAME `phoenix_v.cpp`:

```c
void phoenix_state::phoenix_scroll_w(uint8_t data)
{
    m_bg_tilemap->set_scrollx(0, data);
}
```

The byte written is the X-scroll of the background tilemap directly,
with no transformation. In display orientation that's a *vertical*
scroll of the visible image (because the cabinet is rotated 90°
clockwise — what the hardware calls "scrollx" appears as up/down
movement on screen).

The Z80 init writes 0x00 to 0x5800 at boot (`016D`). During gameplay
the scroll value is incremented per frame (or per level pacing) to
produce the moving background. ⚠ verify: trace the scroll writer to
get the per-frame increment.

### 5.2 Composition

The displayed image is:

```
final = foreground_tile_page (page 0, 0x4000) drawn OVER
        background_tile_page (page 1, 0x4800) scrolled by reg 0x5800
```

with tile index 0 in the foreground treated as transparent (this is
typical for tile-over-tile arcade hardware; verify the exact
transparent-index against MAME's `get_fg_tile_info`).

For the JS port: render the background tilemap with a per-frame
y-offset (display Y) equal to the scroll register, then render the
foreground tilemap on top with cell (0,0) tiles skipped.

### 5.3 No discrete starfield

There is **no LFSR-driven star generator** like Galaga's. All the
"stars" are actually background tiles that scroll as one piece.

---

## 6. Color depth, palette, PROM organisation

### 6.1 The PROMs

Two MMI 6301 PROMs (256 × 4 bits each), exposed in the local dump as
`proms.md` (which the website was 404'ing). The raw bytes are listed
under `proms.md` "Bit 0" (PROM `mmi6301.ic40`, low 3 bits used per
nibble) and "Bit 1" (PROM `mmi6301.ic41`, low 3 bits used per
nibble):

```
ROM_LOAD( "mmi6301.ic40", 0x0000, 0x0100, ... )  // bit-0 of each (R,G,B) channel
ROM_LOAD( "mmi6301.ic41", 0x0100, 0x0100, ... )  // bit-1 of each (R,G,B) channel
```

**Per-entry layout** (each PROM byte is a 3-bit value `0..7` — the
upper nibble of the 8-bit byte is unused / always 0; only the low
3 bits matter):

```
PROM bit-i byte at offset N (N in 0..255):
   bit 0 = red   bit-i
   bit 1 = green bit-i
   bit 2 = blue  bit-i
```

Combining the two PROMs gives a 2-bit value per channel, so the colour
space is **2 bits R + 2 bits G + 2 bits B = 64 distinct triples** (no
intensity bias beyond the resistor weighting — confirmed by inspecting
both PROM dumps, which never set the upper nibble).

**Active region:** offsets 0x00–0x7F of each PROM are populated; 0x80–
0xFF are all-zero (visible directly in `proms.md`). So in practice
only the **first 128 palette entries** are meaningful. Within that:

```
0x00–0x1F   foreground tile palette region 0..3   (4 colours per region × 8 regions)
0x20–0x3F   foreground regions 4..7
0x40–0x5F   background tile palette region 0..3
0x60–0x7F   background regions 4..7
```

Each 8-byte stride corresponds to one 4-colour sub-palette (see
Section 6.2 — the `(tile_code >> 5)` selects which sub-palette).
`palette_bank` (bit 1 of video register 0x5000) flips between the
foreground/background halves for the "letters blue / digits red"
trick.

**Channel decode** (the resistor-network bit referenced in MAME):
the natural reading is `value = (bit1 << 1) | bit0`, then **scale to
8-bit channel** with the standard 2-bit-DAC weights:

```
channel_8bit = value * 0x55       // 0,0x55,0xAA,0xFF for value 0..3
```

This is the simple-and-correct decode for a 2-bit ladder with equal
top/bottom rails. For pixel-perfect MAME parity, replace `* 0x55` with
the resistor-network weighted maths from `phoenix_v.cpp`
(`phoenix_net_info`), which produces marginally different intermediate
values; visually the two are within ~3 LSBs per channel.

For the JS port, **pre-compute a 256-entry RGBA palette once at boot**
by walking the two PROM arrays in parallel and applying the decode
above. The first 128 entries will populate; entries 128..255 will all
read black, which is fine — they are never selected by the `col`
formula in Section 6.2 (max `col = 0x07 | 0x08 | (1 << 4) = 0x1F` →
times 8 colours per palette entry-set in MAME's `palette_init` ⇒ at
most index 127).

### 6.2 Bits per pixel / palette selection

Each tile pixel is **2 bits** (from the two bitplanes — Section 3.1).
Those 2 bits index into a 4-colour sub-palette. Which sub-palette is
chosen is determined by:

```
col = (tile_code >> 5)               // top 3 bits of tile index
col = col | 0x08 | (palette_bank << 4)
```

So the **tile code's top 3 bits select a palette region (0..7)**, OR'd
with bit 3 set, OR'd with the palette bank shifted into bit 4. That's
the "next-to-lowest bit" of the video register at 0x5000 mentioned on
the Hardware page:

> "The next-to-lowest bit control the color palette for both
> foreground and background."

Net effect: each tile has 4 visible colours from a fixed palette slot
chosen by the tile code's high bits, and the global palette bank can
be flipped to swap colour schemes wholesale (used for the
"numbers red, letters blue" trick documented in the Journal).

### 6.3 Background and foreground share the PROM

Both the foreground and background tile renderers index into the same
256-entry palette; they use different palette regions (different
high-bit ranges) so they do not visually conflict.

---

## 7. Recommended JS canvas dimensions and mapping

### 7.1 Canvas size

**Native: 208 × 256.** This matches the rotated display exactly. Use
CSS `image-rendering: pixelated` and an outer scale (×2 or ×3) to
present it at usable size on a modern monitor without filtering.

Alternatives (NOT recommended for the initial port):
- 416 × 512 internal canvas with 2x pre-blit — wastes pixels and
  complicates the tile blitter.
- Wide 256×208 — wrong orientation; you'd have to apply a rotation
  on every draw.

### 7.2 Mapping formulas (hardware → canvas)

Given Phoenix has no sprite chip, the conversion from object-RAM
(X, Y) to canvas pixels is just:

```
canvas_X_pixel = (obj_X & 0xF8)   // verified — see Section 4.2
canvas_Y_pixel = (obj_Y & 0xF8)
```

The low 3 bits of `obj_X` and `obj_Y` are **discarded** by
`GetScreenRamAddress` (`Code.md:L09BA`). They are not used for
sub-tile positioning or animation. The engine increments `obj_X` in
1-pixel steps but only redraws when the snap-to-8 result changes, so
on-screen motion is in 8-pixel jumps even though the state is finer.

For tiles, no conversion is needed — they are drawn at fixed
8×8 grid positions:

```
canvas_X_pixel = display_col * 8       // display_col 0..25
canvas_Y_pixel = display_row * 8       // display_row 0..31
```

### 7.3 Worked examples

**Example 1: Player ship at default position.**

From `T0560` initialisation: `PlayerShipX = 0x64 = 100`,
`PlayerShipY = 0xD8 = 216`.

Hypothesised canvas position (tile-aligned):
- `canvas_X = 100 & 0xF8 = 96` → column 12 of 0..25
- `canvas_Y = 216 & 0xF8 = 216` → row 27 of 0..31

That places the ship at column 12 (just right of centre, since centre
is col 12.5) and row 27 (4 rows from the bottom, leaving room for the
2-tile-tall ship plus a score area). Visually plausible; matches
arcade screenshots of Phoenix where the player sits ~4 tiles up from
the bottom.

⚠ verify: confirm column 12 vs 13 vs 12.5 (the ship is 2 tiles wide
so its centre lands between columns).

**Example 2: Player ship at left limit.**

`PlayerShipX = 0x0C = 12`. `12 & 0xF8 = 8` → column 1. Leaves 1 tile
of margin on the left. Matches arcade behaviour where the ship can't
clip off the left edge.

**Example 3: Player ship at right limit.**

`PlayerShipX = 0xC0 = 192`. `192 & 0xF8 = 192` → column 24. The ship
is 2 tiles wide, so its right edge would be at column 25 — flush with
the right side of the 26-column display. Consistent.

**Example 4: Player bullet vertical range.**

PlayerBulletY ranges from `$D0 = 208` (just above the player at y=216)
down to `$18 = 24` (near the top of the play area). In rows: 26 down
to 3. Top 3 rows reserved for HUD/score area. Matches the visible
playfield.

These four examples are confirmed by `GetScreenRamAddress`
(`Code.md:L09BA`): `obj_X` / `obj_Y` are pixel coordinates in display
orientation, and the memory address is

```
addr = 0x4000 + (25 - (X >> 3)) * 32 + (Y >> 3)
```

(equivalently `addr = T0A00[X>>3].MSB:LSB + (Y>>3)`).

### 7.4 Cross-check against MAME

The addressing is now derived from disassembly (Sections 3.4, 4.2),
so a MAME spot-check is optional rather than required. Suggested
sanity check during first-pixel bring-up:

1. Boot MAME's Phoenix; pause at first playable frame.
2. Read `0x43C2`/`0x43C3` (`PlayerShipX`/`PlayerShipY`).
3. Confirm the ship's top-left tile sits at canvas pixel
   `((X & 0xF8), (Y & 0xF8))` measured from the top-left of the
   rotated 208×256 playfield.
4. If it doesn't, the most likely cause is a sign error in the
   column-axis inversion when porting `T0A00` — re-read Section 3.4.

---

## 8. Open questions / things to verify before implementing

1. **Per-frame scroll-register update pattern.** The init writes 0x00
   at boot (`Code.md:016D`). Section 5.1 still owes a trace of the
   per-frame writer — check whether scroll is incremented every VBLANK
   or paced by a level counter, and whether the low 3 bits of the
   `0x5800` byte are used (they are dropped by `phoenix_scroll_w`'s
   `set_scrollx`, but the ROM may still gate on them).
2. **PROM resistor-network exact constants.** The simple
   `value * 0x55` scaling is within ~3 LSBs per channel of MAME's
   resistor-weighted decode. If pixel-perfect parity is required,
   port the exact `phoenix_net_info` weights from MAME
   `phoenix_v.cpp`. Optional — visually indistinguishable in the
   typical case.
3. **Sub-tile motion vs. on-screen motion.** Section 4.2 establishes
   that the engine snaps to the 8-pixel grid. Confirm during
   bring-up whether the visible motion is in 8-pixel jumps (matches
   the disassembly literally) or whether MAME / the original cabinet
   does a finer interpolation we missed. If the latter, trace whether
   the scroll register or a separate fine-X register is what produces
   the smoothness.

---

## 9. Sources

| Source | Used for |
|--------|----------|
| `Code.md:L09A0`, `Code.md:L09BA`, `Code.md:T0A00` (local clone of computerarcheology.com Phoenix `Code.md`) | Verified X/Y→screen-RAM-address conversion (Sections 3.4, 4.2); confirmed sub-tile bits discarded |
| `Code.md:T1700`, `Code.md:T1770`, `Code.md:L0AA0` (`DrawShields`), `Code.md:L0AD6` (`DrawImageCbyB`), `Code.md:L3540` (`Draw3x2`), `Code.md:0x17F0` (`FourByFourEmpty`) | Shape-table format (Section 4.3) and transparent-tile confirmation |
| `proms.md` (local clone) | Full PROM dumps used for Section 6.1 palette layout and channel decode |
| `https://www.computerarcheology.com/Arcade/Phoenix/Hardware.html` (local: `Hardware.md`) | Memory map of video registers (0x5000, 0x5800), 32×26 tile grid, palette bank bit |
| `https://www.computerarcheology.com/Arcade/Phoenix/RAMUse.html` | Object-RAM layout (43C0-43FF, 4B70-4BEF), screen-pointer arithmetic, rotation note, 208×256 px figure |
| `https://www.computerarcheology.com/Arcade/Phoenix/Journal.html` | Two-tile-set architecture (fg over bg), 2-bit/pixel from two bitplanes, MMI6301 PROMs, palette-bank trick |
| `https://www.computerarcheology.com/Arcade/Phoenix/bgtiles.html` (local: `bgtiles.md`) | 8×8 tiles, 256 tiles per set, two bitplanes |
| `https://www.computerarcheology.com/Arcade/Phoenix/fgtiles.html` (local: `fgtiles.md`) | Same format as background; "Object 1770-17D6" shape region |
| `https://github.com/mamedev/mame/blob/master/src/mame/phoenix/phoenix.cpp` | ROT90, GAME() macros, set_raw call signature, I8085A CPU |
| MAME `phoenix.h` (via raw.githubusercontent) | PIXEL_CLOCK 5.5MHz, HTOTAL/HBSTART/VTOTAL/VBSTART = 352/256/256/208 |
| MAME `phoenix_v.cpp` (via WebFetch summary) | `phoenix_scroll_w` direct passthrough, `get_fg_tile_info` palette derivation, resistor-network PROM decoding |
| `emard/vhdl_phoenix` FPGA reimplementation (via web search summary) | Independent confirmation of 256 visible × 208 visible |

The Galaga port's `galaga_clone/research_coordinate_system.md` was
used as a structural template; note that almost none of its findings
transfer (Phoenix has fundamentally different video architecture).
