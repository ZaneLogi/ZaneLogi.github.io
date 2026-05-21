# Phoenix Rendering and Collision — JS Port Design

This is the rendering/collision spec for the Phoenix port. It covers
sprite decoding, coordinate handling, object representation, the
render pipeline, and collision detection. The runloop and frame
structure live in `research_code_flow.md`.

Source-of-truth: `Code.md`, `RAMUse.md`, `bgtiles.md`, `fgtiles.md`,
`proms.md` from the local ComputerArcheology Phoenix clone (see
`../CLAUDE.md` for the per-PC path). Claims tagged
**[verified]** with citations, **[inferred]** when reasoning beyond
the source, or **[uncertain]** when the source is ambiguous.

The reference implementation pattern is the `space_invaders/` sub-
project in this repo — pre-decoded sprite atlas, object-list state,
`convertCoords` as a single coord-translation point (identity in
Phoenix, see §3.3), AABB collision.

---

## 1. Source's rendering model — what we're porting from

Phoenix has **no sprite hardware**. The CPU writes tile indices
directly into FG/BG tile-RAM windows; the tile chip composites them
every frame. "Sprites" are software constructs: multi-tile shapes
assembled from 8×8 tile cells, with a "shape table" at `$1700` listing
tile patterns per shape, and `DrawImageCbyB` ($0AD6) walking that
table to write tile indices into FG tile-RAM at an offset from the
object's position.

Two consequences shape the JS port design:

### 1.1 Sub-tile motion via 8 pre-shifted variants

State X/Y coords are pixel-granular. `PlayerShipX` defaults to `$64 = 100`
(not 8-aligned); the player ship moves 1 px/frame via `DEC (HL)` at
`Code.md:L0900`. Bullets, enemies, and most other moving objects are
likewise stored in pixel units.

Since the tile chip can only address 8-pixel cells, the source carries
**8 pre-shifted shape variants** in tile-ROM for moving sprites. Tables
`T1600` (player ship) and `T1620` (player bullet, comment "**8 player
bullets for the fine bit shifting**") map `(X & 7) → shape_index` so
the right pre-shifted variant gets blitted at the tile-aligned position.

This is a tile-chip workaround. Modern canvas's `drawImage` renders a
composite sprite at any integer pixel coordinate without the trick.

[verified, `Code.md:L0900`, `Code.md:T1600`, `Code.md:T1620`]

### 1.2 Tile-RAM-readback collision (three-phase)

Phoenix's collision (e.g. `L0E10` for player-bullet vs alien) is a
three-phase mechanism wrapped around the tile-RAM:

| Phase | Granularity | Mechanism |
|---|---|---|
| 1. Identify category | Tile (1 byte read) | Tile-RAM-readback at the cell directly above the bullet; tile-value range encodes what was hit |
| 2. Sub-tile precision | Pixel (within an 8-px cell) | `T1740` per-variant solid-pixel bounds; bullet's `X & 7` must fall within `[lower, upper]` |
| 3. Identify instance | Tile, with anchor offset | `T1740` byte 2 + scan `$4B70` alien-list to find which alien owns that tile |

The three-phase complexity exists because the pre-shifted variants
make each cell's solid-pixel range variant-dependent. Different alien
tile variants cover different sub-pixel ranges within their 8-pixel
cell — see `T1740` data below:

```
1740: 08 00 00 FF   ; variant 0: hits in sub-X 0..7 (full cell)
1744: 01 00 F8 FF   ; variant 1: hits only in sub-X 0
1748: 08 01 02 FF   ; variant 2: hits in sub-X 1..7
174C: 04 00 FA FF   ; variant 3: hits in sub-X 0..3
1750: 08 01 04 FF   ; variant 4: hits in sub-X 1..7
1754: 08 00 FC FF   ; variant 5: hits in sub-X 0..7
1758: 08 05 06 FF   ; variant 6: hits in sub-X 5..7
175C: 08 00 FE FF   ; variant 7: hits in sub-X 0..7
```

[verified, `Code.md:L0E10`, `Code.md:T1740`]

The JS port doesn't carry pre-shifted variants, so it doesn't need
this complexity — a single AABB does the job (see §6).

---

## 2. Sprite / tile decoding

### 2.1 Decode all 256 tiles at init

`resource.js` decodes both tile ROMs (`fgtilesData` and `bgtilesData`)
to two arrays of 256 `ImageBitmap`s each at boot, fed to
`gfx.drawObject` via the tile indices stored on each game object.

Decode the **full tile-ROM** (256 tiles), not a list of named sprite
atlases. Reasons:
- Damage-stage tiles for shield blocks (`$4B..$5E` for the mothership
  shield decrement, the `$1B40` LUT for conveyor-belt damage) are
  unnamed but vital — see §7
- Character / score tiles, BG star tiles, and alien-formation variant
  tiles all live in tile-ROM
- Picking which tiles to decode is more work than decoding everything;
  forgetting one renders as `undefined`

**Tile-ROM byte layout.** Each ROM file is 4096 bytes — two 2KB ICs
concatenated, one bitplane each. For tile `T` byte `i`:
`bp0 = rom[T*8 + i]`, `bp1 = rom[2048 + T*8 + i]`. The intermediate
pixel value at (col=i, row=b) is
`((bp1 >> (7-b)) & 1) << 1 | ((bp0 >> (7-b)) & 1)`.

**Orientation transform.** The intermediate is anti-diagonally flipped
relative to the player's display — every decoded tile must therefore be
written to `grid[(7-x)*8 + (7-y)]` rather than `grid[y*8 + x]`. This
matches the `rotateCCW` + `flipHorizontal` pair in
`Phoenix.js:getBackground8x8Data` upstream. Without the flip, font
glyphs render as right-side-up (rotated 90° CW) and asymmetric sprites
look like garbage that resembles explosion debris.

Palette comes from PROM data per `proms.md` (see
`research_coordinate_system.md` §6); `resource.js` currently uses a
4-color debug palette and consumes only the tile bytes from `data.js`.

### 2.2 Composite shapes

Multi-tile sprites compose from individual tile bytes. Two distinct
sprite conventions live in source, picked by object type:

**Player ship — fixed 2×2 tile block.** Source `T1400` (`Code.md:$1400`,
8 entries × 4 tiles) holds 8 pre-shifted variants of the bare player
ship for sub-cell X positioning; `PlayerShape` (initial `$10` from
`PLAYER_INIT_BLOCK` byte 1) is computed each frame from
`(PlayerShipX & 7) << 2` so the variant cycles every pixel of motion.
The port cycles through all 8 variants using the T1600 lookup (non-linear:
X%8=0→frame #5, X%8=4→frame #1) and draws at tile-snapped `(X & ~7, Y)` —
the same snap-draw pattern as combat aliens (§9.3). The variant tile encodes
the sub-pixel visual offset; the snap position provides the coarse 8-px step;
together they reproduce the original visual position exactly.

```js
// states.js playerUpdate — called each combat frame
const T1600 = [0x10, 0x14, 0x18, 0x1C, 0x00, 0x04, 0x08, 0x0C];
const shape  = T1600[state.player.x & 7];
const base   = 0x30 + (shape >> 1);          // top-left tile of selected frame
p.tiles = [base, base+1, base+0x10, base+0x11];
// render.js drawPlayer — snap X to tile boundary
ctx.drawImage(images[p.tiles[0]], p.x & ~7,       p.y);
ctx.drawImage(images[p.tiles[1]], (p.x & ~7) + 8, p.y);
// bottom row at p.y + 8, same X pattern
```

**Important:** a naïve linear cycle (`v = X & 7; base = 0x30 + v*2`) is wrong.
T1600 is non-linear, so the linear formula assigns the wrong variant to every X
position, causing visible wobble. Use the T1600 table.

[verified, `Code.md:$0926`, `Code.md:T1600`]

The shielded-ship sprites (`T1770` "Regular ship, large shields";
`T1780` "Regular ship, small shields") are 4×4 = 16 tile blocks where
the *center* 2×2 is the same `30 31 / 40 41` ship and the perimeter
tiles are shield decoration. Source draws shields via the separate
`DrawShields` routine (`Code.md:$0AA0`) only when `ShieldCount > 0`;
the bare ship stays 2×2 always. Don't carry a `PLAYER_SHIP_INTACT`
shape that bakes in the shielded layout.

**Aliens (and bullets) — Bit3-dispatched 2-tile pairs.** Aliens are
2-tile sprites whose **shape and layout are picked per-frame** by the
Bit3Controller dispatch model documented in §2.4. The shape table at
`Code.md:$1420` (192 bytes, exported as `ALIEN_SHAPE_TABLE`) holds 96
shape entries × 2 tile bytes; the alien's `controlB` selects which
entry. Many entries use `$00` (= transparent) as the second tile, so
the visible sprite is often a single 8×8 cell.

Bird and mothership shape tables follow similar conventions but are
keyed off different per-object state bytes (`Code.md:$3E08` /
`$3E80` for birds — see step 9 research). Defer their decoding until
their stage handlers are ported.

### 2.3 Damage-progression LUTs

For destructibles like the mothership conveyor belt, port the lookup
tables verbatim:

```js
// shapes.js
export const SHIELD_DAMAGE_LUT = [/* 16 bytes from Code.md:$1B40 */];
```

See §7 for how this is used.

### 2.4 Per-object draw dispatch (Bit3Controller / Bit4Controller)

Source's per-object data block has a 1-byte `controlA` that encodes
both *whether* and *how* to draw the object. The per-frame
`*DataController` for each object type (PlayerDataController `$0700`,
AlienDataController `$0A50`, the bullet/shield controllers) routes
through `UpdateScreenObjects` (`$0718`) which calls two phases in
order:

- **Bit4Controller (`$0720`)** — if `controlA & $10`, dispatch on
  bits 4-6 (via `T0735`) to one of four "delete" handlers that clear
  the previously-drawn cells in screen RAM. The handler also clears
  bit 4 and rewrites bits 4-6 with the *current* low-nibble draw mode,
  so next frame's delete matches whatever this frame draws.
- **Bit3Controller (`$0740`)** — if `controlA & $08`, dispatch on
  bits 0-2 (via `T0759`) to one of four "draw" handlers, then OR `$18`
  back into `controlA` so next frame both pre-deletes (bit 4) and
  redraws (bit 3).

The four draw modes (low 3 bits of `controlA`):

| low3 | Handler | Display layout | Source comment |
|------|---------|----------------|----------------|
| 0    | `L076D` | 1×1 — single 8×8 tile = `controlB` raw | "Draw 1×1 (used at 'fade in' animation)" |
| 1    | `L0788` | 2×1 — horizontal 16×8 from shape table | "Draw 2×1 (alien)" |
| 3    | `L07AA` | 1×2 — vertical 8×16 from shape table | "Draw 1×2 (alien)" |
| 4    | `L07D2` | 2×2 — 16×16 from shape table | "Draw 2×2 (player ship, alien, planets)" |

For modes 1/3/4 the shape lookup loads `H=$14, L=controlB`, so the ROM
address is `$1400 + controlB`. The named alien shape table starts at
`$1420` (`ALIEN_SHAPE_TABLE`), so subtract `$20` from `controlB` to get
the JS array offset. Mode 0 doesn't index any shape table — `controlB`
IS the tile byte.

**Indexing gotcha — `controlB < $20`.** Because `H=$14` is fixed,
`controlB` values 0..$1F land in the *player ship* pre-shift table at
`$1400-$141F` (`T1400`), not in the alien table. Aliens never set
`controlB` that low in normal play, but the player uses this branch:
its `controlA = $0C` (Draw 2×2) reads 4 bytes at `$1400 + PlayerShape`,
which is exactly the pre-shift mechanism described in §2.2.

**Canvas port short-circuit.** We don't model screen RAM, so
delete-then-draw double-buffering is unnecessary — `gfx.clear()` at the
top of `render.frame` does the equivalent every frame. Our `drawAlien`
(in `render.js`) only ports the Bit3 draw path: read `controlA`'s
draw-enable bit and low 3 bits, fetch tiles from the shape table (or
take `controlB` raw for mode 0), `drawImage` at `(x, y)` with per-mode
offsets. We also don't mutate `controlA` after drawing — there's no
next-frame delete to set up. Bit4Controller has no port at all.

### 2.5 CRT rotation: column-major tile order in 2×2 sprites

Phoenix is a vertical-orientation arcade game — the cabinet's CRT is
rotated 90° clockwise relative to how the screen-RAM bytes are laid
out in memory. This rotation makes screen-RAM addressing
**column-major when viewed on the screen**:

| Memory delta | Source operation | Visual direction |
|---|---|---|
| `+1` | `INC DE` | DOWN within a column (next row) |
| `+0x20` | `CALL RightOneColumn` (`$0217`) | RIGHT to next column |

This affects how multi-tile sprites in `ALIEN_SHAPE_TABLE` (T1420) are
stored. Source's `L07D2` "Draw 2×2" writes the 4 bytes from the shape
table in this order (`Code.md:$07DC-$07EC`):

```
write byte 0 at DE          ; upper-left visually
INC DE                       ; DE +1 → visually DOWN one row
write byte 1 at DE          ; LOWER-left (NOT "upper right" despite some comments)
DEC DE
CALL RightOneColumn          ; DE +0x20 → visually RIGHT one column
write byte 2 at DE          ; upper-RIGHT
INC DE                       ; +1 → visually down again
write byte 3 at DE          ; lower-right
```

So the 4 bytes in `ALIEN_SHAPE_TABLE` for one 2×2 sprite are stored
**column-major visually**: `[UL, LL, UR, LR]`, NOT the row-major
`[UL, UR, LL, LR]` a casual reader would assume.

**Concrete example** (player ship frame #1 at `T1400`, comment in
`Code.md`):

```
1400: 30 40 31 41     ;frame#1
```

Decoded column-major (`[UL, LL, UR, LR]`):

```
UL=0x30  UR=0x31
LL=0x40  LR=0x41
```

Sensible: tiles `0x30`/`0x31` are the upper row, `0x40`/`0x41` the
lower row — they share a tile-row index in the source ROM.

Decoded as row-major would produce `[UL=0x30, UR=0x40, LL=0x31,
LR=0x41]` — the alien's lower-left tile painted in the upper-right
slot of the 2×2 cell, scrambling the sprite.

**Port impact.** `render.js`'s 2×2 dispatch must read the table as
column-major:

```js
const tiles = [
    ALIEN_SHAPE_TABLE[idx    ],   // UL
    ALIEN_SHAPE_TABLE[idx + 1],   // LL
    ALIEN_SHAPE_TABLE[idx + 2],   // UR
    ALIEN_SHAPE_TABLE[idx + 3],   // LR
];
const positions = [[0, 0], [0, 8], [8, 0], [8, 8]];
for (let i = 0; i < 4; i++) {
    if (tiles[i] === 0) continue;
    ctx.drawImage(images[tiles[i]], tx + positions[i][0], ty + positions[i][1]);
}
```

**The 1×2 and 2×1 modes don't have this gotcha** — they only read 2
tiles in a single dimension, and source's INC-DE-then-write sequence
just produces "tile 0 then tile 1 in that direction":

- `L0788` 2×1: `[LEFT, RIGHT]` (next column, single row).
- `L07AA` 1×2: `[TOP, BOTTOM]` (single column, two rows down).

Both row-major and column-major interpretations agree on a single
linear axis. Only 2×2 mode requires explicit column-major handling.

**Verification.** Rendering each of the 4 `controlB` variants from a
diagonal-swoop animation cycle side-by-side as static sprites makes
this immediately visible: row-major gave scrambled aliens; column-
major produces correctly-shaped diving aliens with subtle wing-
position variants across the cycle. The investigation that found
this bug is in this doc's commit history.

---

## 3. Coordinate space and granularity

### 3.1 Pixel-granular state, integer X/Y

All game-object X/Y coords are integers in pixels, matching source
units verbatim:

```js
state.player.x = 100;     // matches source PlayerShipX = $64 = 100
state.player.y = 216;     // matches source PlayerShipY = $D8 = 216
```

Movement is in 1-pixel increments — `state.player.x -= 1` for left
(equivalent to source `DEC PlayerShipX`), `+= 1` for right. Bullets
and enemies similarly.

### 3.2 Integer positioning — with snap-draw for variant-animated objects

State coords are integers; `drawImage` accepts integers. `imageSmoothingEnabled`
is not a concern. However, objects driven by per-frame variant animation (player
ship and combat aliens) use **snap-draw**: draw at `(X & ~7, Y)` (player) or
`(x & ~7, y & ~7)` (aliens), not exact `(X, Y)`. The tile variant content
encodes the sub-pixel offset; the snap provides the coarse 8-px step. The net
visible position is pixel-exact. See §9.3 for the full explanation.

### 3.3 `convertCoords` is essentially identity

**The source's object X/Y are already in display orientation** —
portrait, X→right, Y↓, identical to the standard canvas coordinate
convention. No ROT90 transform is needed at draw time.

Evidence: `PlayerShipX = 0x64 = 100` is centered on the 208-wide
display axis; `PlayerShipY = 0xD8 = 216` is near the bottom of the
256-tall axis; player bullet's Y is ship Y `- 8` ("8 pixels above")
confirming Y↓; enemy bullets initialise with `Y = 0x20 = 32` near the
top. These are all standard portrait-display values.

The "rotation" mentioned in `research_coordinate_system.md` lives
entirely in **memory layout** — the source's screen-RAM addresses
(`$4000-$433F`) are arranged in raw-scan (pre-rotation) layout, where
`+1` to a pointer = 1 row down on display and `+32` = 1 column LEFT
on display. `L09BA` (`GetScreenRamAddress`) applies the rotation when
mapping (X, Y) → memory address: `addr = 0x4000 + (25 - col) * 32 + row`.

We don't mirror screen RAM (object-list state, see §4), so we don't
need that rotation. Object X/Y go straight to canvas X/Y:

```js
// gfx.js
gfx.convertCoords = function(srcPt) {
    return { x: srcPt.x, y: srcPt.y };
    // The only thing this might add is a small constant offset if a
    // playfield letterbox shifts source (0, 0) relative to canvas (0, 0)
    // — verify by drawing the player ship at default coords during scaffolding.
};
```

`convertCoords` is still the **single place** any orientation /
offset adjustment lives — keep the indirection so a future tweak
(e.g. a constant `+ playfieldOriginX`) only touches one function. But
expect it to stay simple. Same pattern as `space_invaders/gfx.js`.

---

## 4. Object representation

### 4.1 Object list (no FG tile-RAM mirror)

Game state is a list of logical objects. Each carries its position,
its current tile pattern, and any per-object state:

```js
state.player    = { x, y, w: 16, h: 16, tiles, alive };           // fixed 2×2 sprite
state.aliens    = [/* 16 slots: { x, y, controlA, controlB, alive } */];
state.birds     = [/* phoenix-bird objects, fields TBD step 9 */];
state.bullets   = [/* player bullets, max 2 */];
state.bombs     = [/* enemy bullets, max 5 */];
state.mothership = { x, y, controlA, controlB, ..., alive };
```

Per-object fields:
- `x, y` — source pixel coords (integers; Y↓; identity-mapped to
  canvas via `convertCoords`).
- `w, h` — only on objects with a fixed sprite layout (player, static
  text rows). For Bit3-dispatched objects (aliens, bullets,
  mothership) the layout is read from `controlA` bits 0-2 each frame —
  see §2.4 — so `w/h` aren't carried.
- `tiles[]` — only on objects with a fixed sprite layout. For
  Bit3-dispatched objects the tile bytes come from a per-frame lookup
  (`ALIEN_SHAPE_TABLE[controlB - $20]` for aliens) keyed by `controlB`,
  so they aren't carried either.
- `controlA, controlB` — per-frame draw dispatch state for objects
  whose layout/shape can change frame-to-frame. Mirror of the per-
  object data block at `$43C0` (player), `$4B70+` (aliens), etc.
- `alive` — per-frame "is this object visible" flag — see §4.4.

### 4.1.1 Damage / live-tile mutation

For sprites that *do* carry a `tiles[]` array (player, mothership
shield blocks), damage-progression and shape changes mutate individual
entries in place. This is how the source's "as the ship loses
shields, replace shield tiles with damaged versions" effect comes
through — see §7 for the mothership shield decrement walkthrough.

### 4.2 Background as a 33-row tile-grid (port deviation)

The BG starfield is a tile-RAM-style mirror with **one extra hidden row
above the visible canvas** — a port-side design choice, not a 1:1 port
of source's plane layout:

```js
state.bgTiles    = new Uint8Array(26 * 33);   // 26 cols × 33 rows = 858 B
state.scrollPixel = 0;                         // 0..7, per-pixel offset within current row
state.counterB9  = 0;                          // $43B9 mirror; ticked by starsScrollDown
```

Display layout: row 0 sits at canvas `y = -8 + scrollPixel` (fully
off-screen at scrollPixel = 0, gradually revealed up to 7 px at the
top edge when scrollPixel = 7). Rows 1..32 cover the visible play
field at `y = (r - 1) * 8 + scrollPixel`. Row 32 sits at the bottom,
gaining/losing up to 7 px off the bottom edge over an 8-tick cycle.

**Per-frame scroll cycle:**
1. Each `bgUpdate` tick (= 60 Hz fade-in, ~30 Hz during alien combat
   via `$24C4`): `counterB9--`; `scrollPixel` derived from the low 3 bits.
2. On 8-pixel boundaries (`counterB9 & 7 == 0`): rotate the buffer
   down — `bgTiles[r] := bgTiles[r-1]` for `r = 32..1`. Old row 32
   is discarded (it scrolled off the bottom). Refill `bgTiles[0]` with
   26 fresh tiles from the active starfield ROM (`T1C00` or `T1F00`,
   pointer in `stageBlock[7..8]`).

**Galaxy / planet placement:** both `addGalaxiesToBackground` and
`addPlanetsToBackground` override the source's row formula and force
placement at the top of the buffer (column from source addr is kept):

- Galaxy → `bgTiles[1, col]` (top visible row)
- Planet → UL/UR at `bgTiles[0, col..col+1]` (hidden row above),
  LL/LR at `bgTiles[1, col..col+1]` (top visible row). At spawn time
  with `scrollPixel = 0`, only the planet's bottom half is on screen;
  the top half scrolls in over the next 8 ticks.

Both run **after** `starsScrollDown` in `bgUpdate`, so their writes
overwrite the freshly-refilled hidden row when they fire on an
8-boundary tick.

**Why this deviates from source (visual bug fix, not a faithful port):**

In source, `bgTiles` is 832 bytes (26 × 32) with no hidden margin, and
the scroll register `$5800` cycles modulo 256 px = 32 tile rows. The
star-fill row formula `R_star = (1 + (counterB9 >> 3)) & $1F` and the
galaxy/planet row formulas all rely on the wrap to coincidentally
land new BG content at "display row 1" (`y = 8`) every fill, then
drift down. As old rows wrap from display y=255 back to y=0, they
appear briefly at display row 0 before being overwritten by the next
fill at row 1 — the "appear at top, vanish at second row" artifact.

Arcade footage confirms the same artifact happens on real hardware —
**the score row is not opaque in the original game either**, and the
"stars appear at top row then vanish at second row" cycle is present.
It's just hard to notice unless you're looking for it: CRT phosphor
decay smears single-frame transitions, the arcade resolution is lower,
and the eye tracks moving stars away from the top edge faster than it
processes a 1/60 s erase event there. Verified by Zane via YouTube
longplay close-inspection (2026-05-17).

The port's pixel-perfect canvas (no decay, no scan-line blur, modern
displays at native resolution) makes the artifact obvious enough to
read clearly. Same logic, different rendering substrate — what was a
near-invisible quirk on a CRT is a distracting flicker on an LCD.

The 33-row design moves the fill + erase fully off-screen at row 0,
eliminating the artifact. Galaxies + planets are placed at the top
instead of computed row positions because, without the wrap, the
source row formula resolves to literal mid-screen positions rather
than the implicit "always near the top" the wrap was producing.

**Decision criterion for similar future fixes:** source-faithful is the
default, **but if the artifact is provably an old-era bug that's
exposed by the port's sharper rendering (no CRT decay, no opaque-
score masking, etc.), prefer the corrected behavior and document
the deviation here with the verification trail.** Don't silently
"fix" arcade behavior we just don't like.

### 4.3 Static text tables (T1800 / T1860 / T1960 / T19C0 / T1BA0)

Static screen text — score labels, copyright, prompts — is laid out
in code-ROM tables consumed by `PrintTextLines` at `Code.md:$01D0`.
Each entry is exactly **32 bytes**:

```
+0..+1   screen-RAM address (MSB, LSB)         e.g. 43 20 = $4320
+2..+5   four FF padding bytes                 (skipped via L+=5)
+6..+31  26 tile bytes, one per display column (drawn left-to-right)
```

`PrintTextLines` walks `C` consecutive entries; the caller passes the
table base in `HL` and the row count in `C`. `DrawRow` (`Code.md:$01ED`)
stores the 26 tile bytes via `(DE) := A; DE -= 32` per column, which
moves one display column rightward (the source's `RightOneColumn`
helper at `Code.md:$0217` is the 8085 expression of "stride -32 in
tile-RAM == +1 in display X").

**Address inverse (port-time only).** Since the port doesn't model
tile-RAM addresses (rendering is canvas-direct, see §4.1), the
`(MSB, LSB)` field is converted to `(x, y)` once during the build
step and never used at runtime:

```
plane_off = ((MSB << 8) | LSB) - 0x4000
col = 25 - (plane_off >> 5)               // 0..25
row = plane_off & 0x1F                    // 0..31
x = col * 8
y = row * 8
```

(Inverse of `Code.md:L09BA` `GetScreenRamAddress`. We never need a
runtime port of the forward function — see §4.1.)

**Port shape.** Each table entry becomes one object-list record. A
26-tile horizontal strip is `{x, y, w: 208, h: 8, tiles: [26 bytes]}`,
which `drawObject` (§5) renders without any special-case path:

```js
state.staticTextRows = [
    { x: 0, y:  0, w: 208, h: 8, tiles: [/* …26… */] },  // T1800[0]
    { x: 0, y:  8, w: 208, h: 8, tiles: [/* …26… */] },  // T1800[1]
    { x: 0, y: 16, w: 208, h: 8, tiles: [/* …26… */] },  // T1800[2]
];
```

Tile bytes go through the same FG palette path as moving objects: the
upper 3 bits of the tile index pick the color group (§3.3 of
`research_coordinate_system.md`), so e.g. T1800 row 0 renders the
letter tiles (`0x03..0x1F`) in color group 0 and the digit/punct tiles
(`0x20..0x3F`) in color group 1 — Phoenix's "letters and digits in
different colors" effect, free of charge.

**Build pipeline.** `tools/build_data.py` reads `maincpu.bin`, parses
each requested `(name, offset, row_count)` triple in its `TEXT_TABLES`
list, and emits an `export const <name> = [...]` array of records. To
add a new table when a new caller lands, append one line to
`TEXT_TABLES` and re-run the script. The currently-emitted set is
intentionally minimal — see the call-site map in the script's header
comment for the other known tables and their (offset, row_count).

### 4.4 `alive` semantics — per-frame draw enablement

In source, an object is drawn this frame iff a per-frame routine calls
its `*DataController` (which then runs Bit3Controller — see §2.4).
**Per-stage init writes the data block but does not draw**; only the
per-frame stage handler does. So whether an object is visible on a
given frame is determined by *which stage handler is currently running*,
not by the data block alone.

Two examples relevant to current stages:

- `PlayerUpdate` (`$0876`, calls `PlayerDataController`) is invoked
  from `L2000` (alien combat, JT4 stages 1/3/B) and `L3400` (bird
  combat, stages 5/7) — *not* from `L0834` (alien fade-in, stages 0/2).
  So the player ship is invisible during the entire fade-in intro,
  even though state-2 init copied a valid `controlA = $0C` (Draw 2×2,
  bit 3 set) into `$43C0`.
- `AlienDataController` (`$0A50`) is invoked from `L2000` every frame
  but from `L0834` only after `CounterB4 < $15` (the last 22 of ~256
  fade-in frames). So aliens stay invisible through the wait phase
  even though state-2 init wrote their `(controlA, controlB)` and
  formation positions.

In our object model the `alive` field captures this. Each object is
created with `alive: false`. The per-frame stage handler sets `alive
= true` whenever its source-equivalent would call the relevant
DataController. `render.frame` skips any object with `alive = false`
or with `controlA & $08 == 0`.

**`alive` is not "the entity exists".** It's a per-frame draw-enable
toggle. A killed alien clears its `controlA` bit 3 (and the next
frame's Bit4Controller delete fires) — `alive` stays whatever the
per-frame handler is setting it to. For step 5 the two flags are
redundant (`alive` only ever flips with `controlA` bit 3 set), but
once kills land in step 8, the cleaner separation is: `alive` =
"per-frame handler is iterating me", `controlA` bit 3 = "source's
draw-enable bit". Both must be true to render.

---

## 5. Render pipeline

Per-frame, after `tick()`:

```js
// render.js
function render(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(state);
    for (const obj of allDrawableObjects(state)) {
        drawObject(obj);
    }
}

function drawObject(obj) {
    for (let row = 0; row < obj.h / 8; row++) {
        for (let col = 0; col < obj.w / 8; col++) {
            const tile = obj.tiles[row * (obj.w / 8) + col];
            if (tile === 0) continue;     // 0 = transparent (FourByFourEmpty $17F0)
            const pt = gfx.convertCoords({
                x: obj.x + col * 8,
                y: obj.y + row * 8,
            });
            ctx.drawImage(resource.tileImages[tile], pt.x, pt.y);
        }
    }
}
```

`drawObject` works for every object type (player, aliens, birds,
mothership, bullets) because they all share the same `{x, y, tiles[]}`
shape. The function is ~10 lines and never branches by object type.

**Render cost.** Worst case ~50 visible objects × ~16 tiles per object
= ~800 `drawImage` calls per frame. Trivial on modern hardware.

**No "erase prior position" work.** The source uses
`OldPlayerShipMSB/LSB`-style pointers to clear the previous position
from FG tile-RAM before redrawing. Our canvas-clear-per-frame
replaces that — drop the old-position bookkeeping entirely.

---

## 6. Collision

### 6.1 AABB primary

```js
// collision.js
function aabbHit(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
}

// Player bullet vs aliens (port of L0E10):
for (const bullet of state.bullets) {
    if (!bullet.alive) continue;
    for (const alien of state.aliens) {
        if (!alien.alive) continue;
        if (aabbHit(bullet, alien)) {
            onAlienHit(alien, bullet);
            break;
        }
    }
}
```

This is functionally equivalent to Phoenix's three-phase
tile-readback + T1740 sub-tile bounds + alien-list scan. The source's
complexity came from the pre-shifted-variants design choice; we don't
need it because each of our objects has one consistent sprite at any
X — the AABB IS the alien's solid extent.

Cost: ~5 bullets × ~50 enemies = ~250 tests/frame, trivial.

### 6.2 Per-tile sub-test for destructibles

For objects with internal structure that gets destroyed piecewise
(notably the mothership shield blocks), AABB tells you which object
was hit; a per-tile lookup within that object's `tiles[]` tells you
which block:

```js
function tileWithinObject(obj, hitX, hitY) {
    const dx = hitX - obj.x;
    const dy = hitY - obj.y;
    const col = dx >> 3;
    const row = dy >> 3;
    const wTiles = obj.w / 8;
    const hTiles = obj.h / 8;
    if (col < 0 || col >= wTiles || row < 0 || row >= hTiles) return -1;
    const idx = row * wTiles + col;
    if (obj.tiles[idx] === 0) return -1;   // already destroyed (transparent)
    return idx;
}
```

For most enemies (uniform shape), skip §6.2 — the AABB hit IS the
whole answer. Use §6.2 only when the object has heterogeneous internal
state (mothership shield, possibly bird boss as it matures).

### 6.3 Coverage of source paths

| Source collision path | JS port equivalent |
|---|---|
| Player bullet vs formation alien (`L0E10`) | `aabbHit(bullet, alien)` |
| Player bullet vs swooping alien (`L0E39`) | `aabbHit(bullet, alien)` |
| Player bullet vs mothership shield (`L237B`) | `aabbHit(bullet, mothership)` → `tileWithinObject` → §7 damage |
| Enemy bullet vs player shield (`L0CAC`) | `aabbHit(bomb, playerShield)` |
| Enemy bullet vs player ship (`L0CB4`) | `aabbHit(bomb, player)` |
| Alien collision with player ship sides (`L0CF4`) | `aabbHit(player, alien)` |

---

## 7. Worked example: mothership shield damage

The mothership stage shows partial damage on shield blocks before
they fully disappear — the "trace of destruction" the player observes
on each hit. The source achieves this via tile-bitmap swapping (not
pixel manipulation; the tile chip can't address pixels).

### 7.1 Source mechanism 1 — sequential tile decrement (`L237B`)

```
237B: LD A,(DE) / AND $F7 / LD (DE),A    ; mark shield element damaged in state byte
2384: LD A,B   / DEC A   / LD (HL),A     ; tile_index--  → next damage stage tile
2387: CP $4B   / RET NZ                  ; not at fully-destroyed yet → done
238A: LD (HL),$00                        ; otherwise → transparent
```

Tiles `$5E`, `$5D`, `$5C`, …, `$4B` in tile-ROM are
progressively-damaged versions of the same shield block. Each hit
decrements the on-screen tile index by 1.

[verified, `Code.md:L237B`]

### 7.2 Source mechanism 2 — tile lookup table (`L23AF`)

```
23AF: LD A,B / AND $0F / ADD A,E / LD E,A   ; index into table at $1B40
23B4: LD A,(DE) / LD (HL),A                  ; lookup → next damage tile
```

A 16-entry LUT at `$1B40` maps `current_tile & 0x0F` → next damage
stage tile. Used for the conveyor-belt blocks.

[verified, `Code.md:L23AF`]

### 7.3 JS port

```js
// shapes.js
export const SHIELD_DAMAGE_LUT = [/* 16 bytes from Code.md:$1B40 */];

// state.js
state.mothership = {
    x, y, w, h,
    tiles: [/* initial intact-tile values from $1700 shape */],
    state: [/* per-tile damage-state bytes (mirrors source's parallel array) */],
};

// On bullet impact (port of L237B — shield-block region):
function onShieldHitDecrement(mothership, tileIdx) {
    let t = mothership.tiles[tileIdx];
    t -= 1;
    if (t < 0x4B) t = 0x00;
    mothership.tiles[tileIdx] = t;
    mothership.state[tileIdx] &= 0xF7;
}

// On bullet impact (port of L23AF — conveyor-belt region):
function onShieldHitLUT(mothership, tileIdx) {
    const cur = mothership.tiles[tileIdx];
    mothership.tiles[tileIdx] = SHIELD_DAMAGE_LUT[cur & 0x0F];
}
```

**No render changes** — `drawObject(mothership)` is unchanged. It
walks `mothership.tiles[]` and `drawImage`s each tile; the next frame
naturally shows the swapped damage tile.

This worked example is also why the **decode-all-256-tiles** decision
(§2.1) matters: damage-progression tiles `$4B..$5E` and the LUT
targets aren't in any named sprite atlas; if `resource.js` only
decoded "named" sprites, the shield damage would render as
`undefined`. Decode the whole tile-ROM upfront.

---

## 8. Player ship animation

Source switches `PlayerShape` (`$43C1`) between several frame variants
based on input/state — different shapes for "intact ship", "ship with
large shield", "ship with small shield", "green ship", etc. (See
`Code.md:T1770-T17A0`.)

In our port, `state.player.tiles[]` is mutated directly each combat frame
by `states.playerUpdate()` via the T1600 lookup. There is no separate
`state.player.shape` key — `tiles[]` is the live, mutable shape.

Animation frame **for sub-tile X positioning** (the 8-variant trick in
`T1600`) **IS used** — see §2.2 and §9.3. The T1600 lookup is non-linear
(X%8=0→frame #5, X%8=4→frame #1). A linear `X & 7` cycle is incorrect and
produces visible wobble because the variant pixel content doesn't match the
draw position for each X value.

---

## 9. Render-time atomicity vs. source's screen-RAM model

Phoenix's source updates per-object state across multiple game ticks
via "lane scheduling". For combat aliens (`L2000`), each 4-tick cycle
does:

| Lane | Source work |
|------|-------------|
| 0 | `AlienDataController` — writes current shape to screen RAM |
| 1 | `AlienMovementUpdate` — change `alien.x` |
| 2 | `AlienAnimationUpdate` — recompute `controlB` based on new `alien.x` |
| 3 | other (enemy bullets, etc.) |

Lanes 1 and 2 land on different ticks (8085 CPU budget). Between
them, `alien.x` is fresh but `controlB` is stale (still computed for
the previous `x`). The source hides this gap because the display
reads from screen RAM, and screen RAM is only rewritten on lane 0 of
the *next* cycle when `DataController` blits the tile bytes for the
new (x, controlB) pair — by which time both are fresh.

Our port keeps `alien.x` and `alien.controlB` as separate object
fields and `render.frame` reads both at draw time. If render runs
*between* lane 1 and lane 2, we draw new x with stale controlB →
visible glitter.

### 9.1 Tick-pair amplification at non-1:1 render rates

`runloop.js` runs `tick()` at `TICK_HZ = 60` and calls `render()` once
per `requestAnimationFrame`.

- **60 Hz monitor:** 1 tick per render. The stale-controlB frame lasts
  ~17 ms and is usually invisible.
- **30 Hz monitor (or any case where the runloop accumulates 2 ticks
  per render):** lanes group into stable pairs within each render
  frame. Two pairings exist:
  - **Pairing A:** `(1,2)` and `(3,0)` — every render that does work
    does both movement and animation. x and controlB stay synced.
  - **Pairing B:** `(0,1)` and `(2,3)` — every render does *either*
    movement or animation, never both. Stale controlB frame lasts a
    full ~33 ms, very visible.

Pairing is sticky until a single tick is dropped (browser hiccup, GC,
`rAF` skip), which rotates A↔B and the new pairing sticks. So a clean
30 Hz run can flip to permanent stutter mid-stage.

### 9.2 Fix: collapse movement + animation into one tick

8085 split the lanes for CPU budget; JS has no equivalent pressure.
Run animation immediately after movement in the same tick:

```js
// states.js stageAlienCombat
if (lane === 1) {
    this.alienMovementUpdate();
    this.alienAnimationUpdate();   // keep controlB locked to current x
}
// lane 2 is now empty — drop the else-if
```

`alien.x` and `alien.controlB` now update atomically within one tick;
tick-pair drift can't expose the gap.

### 9.3 Pre-shift variants need tile-aligned drawing

Same source/port disconnect, different symptom. `AlienAnimationUpdate`
picks one of N pre-shifted tile variants based on `(x>>1) & 3` (X-mode)
etc. The source blits each variant at a **tile-cell-aligned**
position; the sub-tile pixel offset baked into the variant places the
alien at the correct sub-cell X. With 4 X-mode variants × 2-px each
= 8-px coverage, plus the tile-aligned coarse step, you get full
1-px-granular *apparent* motion.

If the port draws the variant tile at exact `alien.x`, the sub-tile
offset double-counts (variant adds 2 px, `drawImage` adds another
2 px) → visible ~4-px jitter on X drift. Fix: for variant-mode
dispatches (`low3 ∈ {1, 3, 4}`) draw at `(alien.x & ~7, alien.y & ~7)`
(see `render.js drawAlien`). Variant contributes the sub-cell offset;
the tile-aligned position contributes the coarse 8-px step; together
they reconstruct the source's visible position.

The snap-draw rule applies to **both** combat aliens and the player ship:

- **Aliens:** `AlienAnimationUpdate` rewrites `controlB` each frame; draw at
  `(x & ~7, y & ~7)`.
- **Player ship:** `playerUpdate` rewrites `tiles[]` via T1600 each frame; draw
  at `(X & ~7, Y)`.

Both follow the same model: variant content encodes the sub-pixel offset, snap
position provides the coarse step. The earlier claim ("player ship can pin
variant 0 and let `drawImage` work") was wrong — it ignored the visual animation
that T1600 cycling produces as the ship moves.

### 9.4 Known faithful artifact: fade-in → combat half-alien

At the moment a stage transitions from fade-in (`L0834`) to combat
(`L2000`), aliens often render as a half-width sprite for one frame.
This is **faithful behavior, not a port bug**. Trace:

1. `L0848` ends fade-in: `INC LevelAndRound`, `GameState = 2`. Aliens
   still hold `(controlA=$08, controlB=$68)` from the last fade-in
   frame.
2. State-2 init runs `InitAlienControlStates` (`$05EC`) which loads
   `ALIEN_CONTROL_INIT[stage*2..+1]`. For odd stages (combat) that's
   `(controlA=$09, controlB=$60)`. So aliens enter L2000 with the
   stale combat-init values, *before* `AlienAnimationUpdate` has run
   to compute a fresh variant.
3. L2000's first frame typically lands on lane 0 (`$435F & 3 = 0` —
   the counter isn't reset between stages), which calls
   `AlienDataController` → `Bit3Controller` → `L0788` (Draw 2×1) with
   `controlB=$60` → indexes `ALIEN_SHAPE_TABLE[$40..$41] = ($6A, $00)`.
   Source's `L0788` writes both bytes unconditionally, so screen RAM
   gets `(tile=$6A, tile=$00)` — left half = `$6A`, right half blank.
4. ~3 ticks later when lane 2 runs, `AlienAnimationUpdate` rewrites
   `controlB` to a real variant and the alien renders correctly from
   then on.

So the original arcade also flashed half-aliens at every stage entry
for ~17 ms. At 30 Hz the artifact lasts ~33 ms and is more noticeable
on a modern display, but reproducing it is "correct" port behavior.
Don't add a port-specific guard (e.g. delaying the first
`AlienDataController` call until after `AlienAnimationUpdate`) unless
the project's faithfulness stance changes.

### 9.5 General lesson

Any source mechanism that's only "atomic from screen RAM's
perspective" needs care when ported to a "render reads object state
directly" model. Look for:
- Multi-tick partial updates to object display state (lane
  scheduling, sub-routine round-robins)
- Sub-pixel tricks that assume tile-cell-aligned blit positions
- Anywhere source writes part of an object's display state in one
  tick and the rest in another

[verified, `Code.md:L2000`, `Code.md:$0D1C` AlienMovementUpdate,
`Code.md:$0D70` AlienAnimationUpdate]

---

## 10. Implementation checklist

When working on rendering or collision code, verify:

- [ ] `resource.tileImages[]` decodes all 256 tiles (not just named ones)
- [ ] `state.player.x` / `state.aliens[*].x` etc. are integers in source pixel units
- [ ] No call site passes non-integer X/Y to `drawImage`
- [ ] All canvas-touching code goes through `gfx.convertCoords` (kept as the single indirection point even though it's identity)
- [ ] Each object has `{x, y, w, h, tiles[]}` minimum
- [ ] `drawObject` is one function used by every object type
- [ ] Mothership shield damage uses §7 tile-swap pattern, not pixel mutation
- [ ] Collision is AABB primary; per-tile sub-test only for destructibles
- [ ] No `OldPlayerShipMSB`-style "erase prior frame" bookkeeping
