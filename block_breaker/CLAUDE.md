# block_breaker — CLAUDE.md

Per-project guidance for the `block_breaker` branch. Read this before the root
`CLAUDE.md` conventions; it overrides them where they differ.

## What this is

A faithful, educational port of **Arkanoid for MSX**, built from the complete,
byte-accurate disassembly by **tiburoncio**
(<https://github.com/mcolom/arkanoid_msx_disasm>). We started from the level
data and are growing outward; the first deliverable is a **level viewer**.

- **Source of truth**: a clone of that disassembly at
  `C:\Z_Temp\arkanoid_msx_disasm` (an *external* dir, deliberately NOT copied
  into this repo — only derived data lands here). Verified complete: it
  reassembles to the original ROM (SHA-1 `2183f07f…`, per its
  `disassembly.asm` header). `z80dasm`-sourced, `z80asm`-buildable.
- **Target hardware**: MSX1, SCREEN 2 — **256×192**, fixed **16-colour**
  TMS9918A palette (4 bpp, 2 colours per 8-pixel row). Sprites are 16×16,
  monochrome, hardware-composited.

## Architecture: routine-level translation

Per the root `CLAUDE.md` decision framework, this is unambiguously a
**routine-level translation** (like `galaga_clone` / `phoenix_clone`), not
screen-RAM mapping. The upfront investigation established:

- Sprites are **hardware-composited** — the CPU only writes (Y, X, pattern,
  colour) per sprite into a shadow table, then block-copies it to the VDP sprite
  attribute table. No pixel blitting.
- **Collision is 100% software coordinate math** — ball↔brick is grid
  arithmetic against a RAM bitmap (`BRICK_MAP`), ball↔Vaus / ball↔alien are AABB
  against RAM structs. The one `RDVDP` (`disassembly.asm:485`) is just the VBLANK
  interrupt ack; the hardware sprite-collision flag is **never** used.
- **Zero screen-RAM readback** in any gameplay path → no canvas-as-VRAM buffer
  needed. Source routines port as JS functions with `Lxxxx` citations; ROM data
  tables are extracted verbatim.

## Current state — Phase 1: level viewer (DONE)

```
block_breaker/
  tools/extract.py     dev tool: reads the external .asm  →  assets/levels.json
  assets/levels.json   32 levels: { bitmask[17], colors[N], brickCount, breakable }
  src/levels.js        decodeLevel(level, cols=11, rows=12) → grid  (port of L5C7E)
  src/palette.js       MSX 16-colour palette + brick-index→RGB
  demo/level_viewer.html + level_viewer.js   browse all 32 layouts
```

Run it: `preview_start block_breaker` (port **8087**, config in
`.claude/launch.json`), open `/demo/level_viewer.html`. Regenerate data:
`python block_breaker/tools/extract.py [path-to-arkanoid_msx_disasm]`.

## Level format (verified against the disassembly + the live viewer)

- **32 brick levels.** `LEVELS_PTR_TABLE` (`disassembly.asm:2992`) and
  `BRICKS_PER_LEVEL` (`:2826`) have exactly 32 entries. Round 33 = the **DOH
  boss**, no brick grid — out of scope.
- **Bitmask**: 17 bytes/level, **MSB-first**, 1 bit = brick present
  (`level_maps.asm`; drawn by the loop at `disassembly.asm:2707-2806`, label
  `L5C7E`). Level `i` = 17 bytes at `LEVELS_PTR_TABLE[i]` (contiguous, stride 17).
- **Grid = 132 cells, 11 columns × 12 rows, row-major** — the 136-bit field's
  last 4 bits are unused padding (verified: never set in any level).
  **CONFIRMED by rendering**: level 1 is 6 solid rows of 11; levels 8/15 are
  bilaterally symmetric designs (a transposed or bit-reversed decode would break
  that symmetry). NOTE the equ labels `BRICK_COLS=12 / BRICK_ROWS=11`
  (`bricks.asm:23-24`) read **swapped** vs. the screen — only their product
  (132) is used (`:2646`); the screen-authoritative geometry is 11×12 (tilemap
  is 22 chars = 11 bricks wide, `:2910`; `BRICK_COL` runs 0..10, `bricks.asm:2`).
- **Colours**: a variable-length list, **one byte per PRESENT brick** (values
  0–9), consumed in the same MSB-first bit order (`IY` advances only on a set
  bit, `:2774`). Each colour indexes `TBL_COLOR_TO_PATTERN` (`:2985`, 20 bytes =
  10 brick types × a left+right tile pattern pair).

### The correctness invariant (standing test)

> `popcount(bitmask) == len(colours) == (LEVEL_COLORS_PTR delta)` for every level.

Every present brick has exactly one colour byte. `tools/extract.py` asserts this
at extraction; `demo/level_viewer.js` re-checks it live (the ✓/✗ per level). Keep
this as the regression check whenever the decode path changes.

### Gotcha: `BRICKS_PER_LEVEL` ≠ brick count

`BRICKS_PER_LEVEL[i]` is the count of **breakable** bricks (present minus the
indestructible **gold** bricks), i.e. the win-condition target — NOT the number
of bricks drawn. `present − breakable == goldCount`, and **colour index 9 =
gold** is a *decoded fact*: index 9's per-level frequency equals
`present − breakable` across all 32 levels. Provisional (unverified) so far:
the 0–8 index→colour mapping in `palette.js` — those are canonical-Arkanoid
stand-ins for the layout viewer, to be replaced by the real per-tile colours in
the faithful-tile step.

## Next step — faithful MSX-tile rendering (additive, planned)

Reuses `levels.json` / `levels.js` / `palette.js` unchanged; adds:
- `src/rle.js` — port of `DECOMPRESS_TILE_COLORS` (`disassembly.asm:860`), the
  colour-table RLE (literal if high-nibble≠0; else `[0x0X][countHi][a][b]` →
  pair `(a,b)` × count). Reused later for backgrounds/title.
- `src/tiles.js` — render an 8×8 pattern / 16×8 brick from pattern bytes
  (`in_game_patterns.asm`) + decoded colour bytes (`in_game_colors.asm`) + palette.
- `assets/tiles.json` — extracted patterns + decoded colour table.
This will also yield the *real* brick colours, retiring the provisional 0–8 map.

## Out of scope (for now)
Gameplay (ball/paddle/bricks/bounce, capsules, aliens, lasers, DOH), sound
(check whether the MSX PSG path is real code before deciding port-vs-drop),
attract/demo mode.

## Conventions
- ES6 modules, no build step; `python tools/devserver.py` (no-cache) for preview.
- Every ported routine cites its source label/address (`Lxxxx` or `file:line`).
- Extracted ROM data is derived-only; the disassembly itself stays external.
- Commit convention (root `CLAUDE.md`): one-line subject + trailer when a doc
  (this file) carries the detail; code + its doc update land in the same commit.
