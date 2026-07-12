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

## Current state — level + tile data extracted (DONE)

```
block_breaker/
  tools/extract.py     dev tool: reads the external .asm and decodes EVERYTHING at
                       build time — ports L5C7E (bitmask→grid) and
                       DECOMPRESS_TILE_COLORS (colour RLE). Runtime never unpacks.
  assets/dat_levels.js export const LEVELS = 32 × { grid[12][11], brickCount, breakable }
                       grid[r][c] = brick colour-index 0..9 or -1 (empty; pre-baked)
  assets/dat_tiles.js  export const TILES = { patterns[2048], colors[2048], colorToPattern[20] }
                       real MSX brick patterns + RLE-decompressed colours (extracted + rendered)
  src/tiles.js         buildTileBitmaps(TILES) → 256 MSX tile bitmaps; drawBrick blits
                       a brick's two 8×8 tiles. The faithful renderer.
  src/palette.js       MSX 16-colour palette (MSX_PALETTE, used by tiles.js) + a now-
                       superseded provisional brick-index→RGB map
  demo/level_viewer.html + level_viewer.js   browse all 32 layouts, drawn with REAL MSX tiles
```

Data is imported as ES modules — no `fetch`, no runtime decode. Run it:
`preview_start block_breaker` (port **8087**, config in `.claude/launch.json`),
open `/demo/level_viewer.html`. Regenerate data:
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

> `placed == popcount(bitmask) == brickCount` for every level — where `placed` is
> the count of bricks the grid decode actually positioned on the 12×11 grid.

Every present brick has exactly one colour byte, and gridding must place exactly
`popcount` of them (a set bit landing in the 4-bit padding region would surface as
`placed != popcount`). `tools/extract.py` asserts this at **build time** (plus the
`LEVEL_COLORS_PTR` delta cross-check); the data ships pre-validated, so the viewer
no longer re-checks live. Grid regression = the viewer rendering all 32 layouts
unchanged — level 1 is 6 full rows of 11, level 15 is bilaterally symmetric, level
8 shows 24 gold; a transposed or bit-reversed decode would break these.

### Gotcha: `BRICKS_PER_LEVEL` ≠ brick count

`BRICKS_PER_LEVEL[i]` is the count of **breakable** bricks (present minus the
indestructible **gold** bricks), i.e. the win-condition target — NOT the number
of bricks drawn. `present − breakable == goldCount`, and **colour index 9 =
gold** is a *decoded fact*: index 9's per-level frequency equals
`present − breakable` across all 32 levels. Provisional (unverified) so far:
the 0–8 index→colour mapping in `palette.js` — those are canonical-Arkanoid
stand-ins for the layout viewer. The **real** per-tile patterns + colours are
extracted into `assets/dat_tiles.js` and now rendered by `src/tiles.js`, retiring the
provisional map (the viewer draws real tiles).

## Ball physics — ball ↔ paddle collision (DONE)

`src/ball.js` is a faithful port of the ball movement + collision;
`demo/ball_paddle.html` exercises it (box open at the bottom, paddle, ball,
Space launches). Every method cites its source routine. The model:

- **`skewness` is the master trajectory-angle** (signed, magnitude 1–8). x/y
  speed are *derived* from it each move via `SKEWNESS_POS/NEG_TO_XY`
  (`disassembly.asm:7491/7503`). skewness 1/8 = shallow, 4/5 = steep.
- **Speed is rate-limited, not per-pixel** (`UPDATE_BALL_POSITION` @7356): a
  `(speedPos, |skewness|)` lookup (`@7519/7537/7555`) gives
  `(speedMultiplier, moveTarget)`; the ball moves only every `moveTarget`
  frames, then applies the vector `speedMultiplier+1` times. `speedPos` starts
  at 12 (`SPEED_TABLE_POSITIONS` @7179) and **accelerates each bounce**
  (`UPDATE_BALL_SPEED` @7574, `BALL_SPEED_TABLE` @7614), capped at 15.
- **Walls** (`ACTION_9941` @7233): bounce at `x<18` / `x≥186` / `y<9`; each
  negates speed **and** reflects skewness (`BALL_HORIZONTAL_BOUNCE` @7690 =
  `9−|s|`; `BALL_VERTICAL_BOUNCE` @7662 = `|s|−9`). `y≥184` = lost. Every 40
  wall bounces perturbs the angle (`CHANGE_BALLS_SKEWNESS` @8082).
- **Ball ↔ paddle** (`CHECK_UPDATE_BALL_GLUE_AND_SKEWNESS` @7726) — the
  centrepiece: only when moving down and `167≤y<173` and `VAUS_X<x≤VAUS_X+41`;
  snap `y=169`; invert Y; `zone = (x−VAUS_X)/7`; `skewness =
  BALL_SKEWNESS_TABLE[zone]` = `{7,6,5,4,3,2}` → **left edge = sharp-left,
  centre = steep-up, right edge = sharp-right**.
- **Glue / launch** (`@7143/@7186`): starts glued (`skewness=3`, `y=169`,
  `vausHitX=26`), tracks `VAUS_X+vausHitX`, releases on fire or a 120-frame
  timeout. Coordinate constants live in `PLAYFIELD` (ball.js).

**Verification** (run in-page against the real module): paddle-response mapping
exact for every zone; a 5000-frame launch/bounce/auto-catch sim kept the ball in
`x∈[18,185], y∈[9,169]` with **0 escapes** and acceleration 12→15. Keep the
`selfTest()` in `ball_paddle.js` as the regression check.

**Adaptations** (faithful data/physics, demo-shaped I/O): arrow keys replace the
MSX control read (`read_controls_move_vaus` @3197). The demo draws the paddle
*bar* directly at `paddle.x`, so it clamps the bar to the wall faces (18 and 190)
rather than the source's `VAUS_X` min of 8 — that 8 is a sprite-ORIGIN value (the
Vaus graphic has a ~10px transparent left margin inside its sprite), which the
abstract rectangle doesn't model; the bar's own edge is the faithful-looking
reference. Ball-lost respawns instead of losing a life; sound calls omitted.

## Ball ↔ brick collision (DONE — S1–S6)

`src/brick_collision.js` is the faithful port of `CHECK_BRICK_HIT_AND_BOUNCE_BALL`
(`check_brick_hit_and_bounce_ball.asm`), run once per unit sub-step from ball.js's
multiplier-loop hook (`ball.brickCheck`, injected — ball.js stays bricks-agnostic).
`src/brick_field.js` = the 11×12 grid + pixel geometry; `demo/ball_blocks.html`
exercises it (a ball fired into a box of 3 real walls + an unbreakable-brick floor +
interior blocks). **Full detail + address citations in
[`docs/research_brick_collision.md`](docs/research_brick_collision.md).** Highlights:

- **Four direction blocks** (up/down × left/right) collapse to one
  direction-parameterized function; each classifies the prev→curr brick-cell crossing
  into vertical-face / horizontal-face / ambiguous-corner and bounces via ball.js's
  `verticalBounce`/`horizontalBounce`.
- **Corner + sub-pixel snap:** `RESOLVE_CORNER_COLLISION` + `HANDLE_CORNER_CASE_*` use a
  `TICKS_TO_HIT` sub-step along an auxiliary slope (`TBL_SPEED_FROM_SKEWNESS`) to pin the
  exact hit pixel and disambiguate corners.
- **Specials:** `CHECK_VERTICAL_DOUBLE_IMPACT`; the wall-adjacent border cases
  (`CHECK_BALL_REACHES_RIGHT_BORDER` / `CHECK_RARE_OR_IMPOSSIBLE_CASE` +
  `COMPUTE_WALL_ADJACENT_HIT_POINT`).
- **Effect:** `APPLY_BRICK_HIT_EFFECT` = `updateSpeed()` (accelerate) + a per-type
  dispatch; the demo's `action_unbreakable_brick_hit` = a shared 20-hit counter →
  `changeSkewness()`. No brick removal/score/capsule (unbreakable-only demo).
- **Decoded finding:** `COMPUTE_PRECISE_HIT_POINT` is a **dead vestige** (its output is
  provably unread at both call sites) → not ported; this is why the ball faithfully pokes
  ~3px past a wall (x=15/189) for one frame when a border special fires.
- **Verify:** in-page `selfTest()` (17 cases: 4 directions, corners, double-impact,
  4 border cases, the 20-hit perturb) + a 20 000-frame headless box-scan
  (x∈[15,189], 0 escapes / 0 losses, normal + fast ball).

## Audio — PSG sound (hardware seam + demo DONE; sequencer pending)

**Research finding — the MSX PSG path IS real code, so it ports** (contrast an
analog-only subsystem, which the root `CLAUDE.md` says to *drop*). The sound
engine (`sound_src.asm`, ~1400 lines incl. data) is a genuine register-driven
music/effects sequencer. What it does NOT do is generate the waveform — the 3
tone oscillators + noise **LFSR** + envelope are the **AY-3-8910 (PSG)
hardware**. So the port splits cleanly:

- **sequencer → software** (ports faithfully as JS routines);
- **oscillators → `ayumi-js`** (an accurate AY-3-8910 emulation — the JS analog
  of the chip; we do NOT hand-roll the square/noise generators).

**The seam.** The Z80 keeps a 14-byte shadow of the PSG registers
(`SOUNDS_REGS_BUFFER` @ `0xE5C4`) and, each 60 Hz VBLANK tick, flushes the dirty
ones to the chip via `out (0A0h)/(0A1h)` (`SOUND_ISR_UPDATE`, `sound_src.asm:509`;
hooked at `VDP_HOOK_HANDLER`, `disassembly.asm:484`). The port mirrors this: a
`Psg` register shadow + `flushToAyumi` = the flush; `ayumi` does the oscillation.
**This hardware seam is complete and verified.**

```
src/psg/ayumi.js        vendored ayumi-js (Peter Sovietov's AY core); ES-module
                        adapted (one-line const + export) — emulation untouched
src/psg/sound_engine.js Psg = 14-register shadow + flushToAyumi (DONE);
                        SoundEngine = queue (ADD_SOUND, DONE) + the bytecode
                        player (SOUND_ISR_UPDATE) as a marked skeleton
src/psg/psg_worklet.js  AudioWorkletProcessor: owns Ayumi + SoundEngine; ticks
                        the engine at 60 Hz ON THE AUDIO CLOCK (sampleRate/60,
                        not rAF), renders one sample per ayumi.process()
demo/audio_psg.html     PSG playground + headless selfTest + 小蜜蜂 demos
```

Key facts (verified in-page):
- **MSX AY clock = 1,789,772 Hz** (3.579545 MHz ÷ 2); `ayumi.configure(false,…)`
  (`false` = AY-3-8910, not YM2149).
- **R7 mixer is active-low** (1 = source off) — `flushToAyumi` passes the bits
  straight through as ayumi's `tOff`/`nOff`. Only **R13 (envelope shape)** is
  guarded: writing it retriggers the envelope on real hardware, so it's pushed
  only on the flush where it was actually written (mirrors the `SOUND_REG_MASK`
  bit).
- **60 Hz tick lives inside the worklet** (sample-counted), so tempo is immune
  to frame-rate jank — the faithful analog of the VBLANK-IRQ-driven original.

**Verify:** `selfTest()` in `audio_psg.html` (headless, no audio output needed,
4/4): tone pitch (measured 439.9 Hz for A-440 → clock + period math), mixer
active-low (silent when the tone bit is disabled), noise, and envelope-driven
amplitude (audible with volume nibble = 0). Keep as the regression check.

**Demo-only (NOT the game's audio):** the `▶ 小蜜蜂` melody + `+ bass + drums`
buttons are a hand-scheduled tune in the demo page (♩=120), there to exercise
all three tone channels + the noise voice. The faithful engine files carry no
tune data — that stays in the demo.

### Next increment — the faithful sequencer port
Port `SOUND_ISR_UPDATE`'s bytecode player + effects into `SoundEngine.isrUpdate`,
fed the extracted `SOUND_SEQUENCES` data, so `sfx(196)` plays the genuine
level-start music and `sfx(2)` the brick-break. Pieces: the queue drain
(`PLAY_SOUND` @ `sound_src.asm:202`), descriptor decode (`TBL_SOUND_PARAMS` @ `:7`),
the two stream advancers (`ADVANCE_SOUND_STREAM_IF_READY` @ `:130` + `DISPATCH_*`),
the note handler (`CMD_SET_ONE_NOTE_ON_CHANNEL` @ `:785`), and the period / volume
/ delay effect generators (`:892`+). Source map: `sound.asm` (RAM layout),
`sounds.asm` (sound-ID table), `sound_src.asm` (the player).

## Tile data extraction + rendering (DONE)

**Extraction — DONE.** The real MSX brick graphics are extracted into
`assets/dat_tiles.js` (`export const TILES = { patterns, colors, colorToPattern }`).
All decoding happens at **build time** in `extract.py` — there is **no `rle.js`**
and **no `tiles.json`** (a decode mechanism is meaningless to run for gameplay):
- **patterns** — 2048 bytes (256 chars × 8 rows) from `in_game_patterns.asm`
  (ROM `0x7d84`), plain. `patterns[code*8 + row]`, MSB = leftmost pixel.
- **colors** — 2048 bytes, RLE-decompressed by the ported `DECOMPRESS_TILE_COLORS`
  (`disassembly.asm` @`0x4389`): literal if high-nibble≠0; else `[0x0X][Y][a][b]`
  → pair `(a,b)` × `N = 256·X + Y`. `colors[code*8 + row] = (fg<<4)|bg`, nibbles
  index the MSX palette. *Faithful boundary quirk:* the routine's outer check tests
  only the pointer's HIGH byte, so the last record overshoots the 2048-byte third
  by a few bytes (they spill into the next third, which is overwritten) — the
  extractor decodes past the end and truncates to 2048, the hardware's effective
  result.
- **colorToPattern** — 20 bytes (`TBL_COLOR_TO_PATTERN` @`0x5ddb`): brick
  colour-index `i` → `(colorToPattern[2i], colorToPattern[2i+1])` = the brick's
  left + right 8×8 char codes (a 16×8 brick). `i=9` (gold) → `(0x67, 0x68)`.

**Rendering — DONE (exact tiles).** `src/tiles.js` `buildTileBitmaps(TILES)` builds
256 ready-to-blit 8×8 tile bitmaps once at load — each pixel is the pattern bit
selecting that row's fg/bg colour, so it is pixel-identical to the MSX; `drawBrick`
blits a brick's two tiles (`colorToPattern[2i]`, `[2i+1]`) scaled, nearest-neighbour.
The fidelity call is settled as **exact** (real patterns + the 2-colours-per-8px-row
colour bytes, not a flat colour). `demo/level_viewer.js` draws every layout — grid
**and** the 10-type legend — with real tiles. Verified by canvas-pixel measurement:
brick type 8 renders real gray (palette 14, not the provisional "silver?"), the
black brick-separator seams are present, and level 8 shows 24 gold.

## Out of scope (for now)
Breakable-brick effects (removal / score / capsule — only the unbreakable action is
ported), aliens, lasers, DOH, attract/demo mode, lives/score. Audio: the PSG **hardware
seam + demo are done** (see **Audio** above); the faithful *sequencer* port is the
remaining sound work. (Done: ball movement, ball↔wall, ball↔paddle, **ball↔brick
collision + the unbreakable-brick effect**, **PSG audio seam + Web Audio path**,
**MSX tile-data extraction**.)

## Conventions
- ES6 modules, no build step; `python tools/devserver.py` (no-cache) for preview.
- Every ported routine cites its source label/address (`Lxxxx` or `file:line`).
- Extracted ROM data is derived-only; the disassembly itself stays external.
- Commit convention (root `CLAUDE.md`): one-line subject + trailer when a doc
  (this file) carries the detail; code + its doc update land in the same commit.
