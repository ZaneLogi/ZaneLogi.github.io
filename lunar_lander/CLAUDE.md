# CLAUDE.md — lunar_lander

Guidance for Claude Code in this directory. Read this before changing
anything here; it overrides the repo-root CLAUDE.md.

## What this is

A port of Atari **Lunar Lander** (1979) — a vector-display arcade game
running on the **same Atari DVG** (Digital Vector Generator) as
Asteroids. "Faithful" matters: behavior should match the original ROM.

## Status

ROM-decode stage — seven vector-ROM demo/survey pages, all faithful
byte-decodes. No gameplay / runtime / CPU-side port yet.
- **Font sheet** (`demos/vector_rom.html`) — the A-Z + space glyphs from
  `034598-01.np3`.
- **Lander poses** (`demos/lander.html`) — the 9 tilt attitudes from
  `034599-01.r3` (8 shared base octagons + per-angle leg/thruster SVECs).
- **Shape gallery** (`demos/gallery.html`) — every JSR/JMP-target
  subroutine across all three ROMs (599 lander, 598 font/pictures, 597
  terrain), each fit to a cell and labelled by CPU address. A survey tool
  for identifying shapes by eye; data from `discovery_rom_data.js`.
- **`$5458` composite** (`demos/hud.html`) — the 75-JSR mega-composite
  at `034598` `$5458`: all 75 JSR targets resolve to font glyphs
  (`$55BE-$5726`) and spell the **six HUD label strings**
  `SCORE  TIME  FUEL  ALTITUDE  HORIZONTAL SPEED  VERTICAL SPEED` (gaps are
  space-glyph `$5726` JSRs); 75/75 valid letters cross-validates the font
  decode. Its `VEC` moves position the labels as the **in-game 2×3 grid**
  (3 baselines y=748/720/692, columns x=100/600) — so `$5458` *is* the
  gameplay HUD layout, not just a label list. Only the numeric VALUES are
  CPU-drawn (not in `$5458`); `hud.html` renders `$5458` byte-faithfully, and
  `screen.html` adds sample values + arrows (see "034598 region map" +
  "gameplay HUD" below).
- **360° rotation** (`demos/rotation.html`) — the lander spun through a
  full circle at both ROM sizes (see "Lander rotation" below); also
  demonstrates `globalScale` resizing. Sources both banks from
  `discovery_rom_data.js`.
- **Starfield** (`demos/starfield.html`) — the `$5244-$53E6` starfield
  (61 bright points) enlarged with a focus panel (points rendered as
  visible dots). The CPU-address range is editable, so it also serves as
  a general close-up viewer for any `034598` region. Used to confirm the
  starfield and terrain-tile regions below.
- **Screen layout** (`demos/screen.html`) — a *speculative* composite of the
  whole gameplay screen on a faithful `1024×768` field: the `$5458` HUD with
  formatted values (left + right columns) and speed arrows, the terrain
  (15 tiles + an inserted flat pad, fit to the snapshot's vertical band), and
  the zoom-out lander. Shapes are byte-decoded; the terrain scale and the
  value/arrow/lander positions are matched to a MAME screenshot (approximate —
  exact placement is CPU-side). Starfield deferred (rendering needs rework).

(Note: a faithful byte-decode renders the lander legs correctly — earlier
non-faithful attempts had "legs too small"; staying byte-true to the ROM
avoids it.)

## Known faithful quirks (decoded as-is — NOT bugs)

- **`$4C94` has an extra leg stroke.** In `034599`, a second 9-frame
  lander rotation set is dispatched from the `$4DF4` table (`$4BE4,
  $4C22, $4C5A, $4C94, $4CD6, $4D02, $4D42, $4D7E, $4DB6`). Frame 3
  (`$4C94`) carries a **14th bright stroke at `$4CCC`** — bytes
  `00 10 00 C3`, a `bri=12` horizontal VEC drawing (−8,−1)→(−5,−1) over
  the left leg — where the other 8 frames each have 13. The decode is
  byte-exact (its RTS lands precisely on the next entry `$4CD6`), so this
  is an original-ROM artwork glitch reproduced on purpose; it stands out
  in `gallery.html`. Do **not** "fix" it — deleting the stroke would make
  the decode un-faithful.

## Lander rotation & the two size banks

`034599` stores the lander as **two 9-pose banks**, each spanning only
**~one 90° quadrant** (upright → laid on its side, ~12°/step). The full
360° is reconstructed by **X/Y mirroring** (`dvg.js` `xFlip`/`yFlip`) —
the same reflection scheme Asteroids uses for its ship (`ship.js`
`$750B`: 17 shapes/quadrant + flips; the lander is the coarser 9/quadrant
version). The two banks are the same rotation set at two sizes:

| Bank | Dispatch table | Poses | Native size | Role |
|---|---|---|---|---|
| zoom-out (far) | `$4DF4` | `$4BE4 $4C22 $4C5A $4C94 $4CD6 $4D02 $4D42 $4D7E $4DB6` | ~15 units | far view |
| zoom-in (close) | `$4BA2` | `$4916 $495C $49AA $49F6 $4A42 $4A80 $4AC8 $4B16 $4B64` | ~29 units | close view |

`demos/rotation.html` renders the full sweep; it orders frames by each
shape's measured orientation (the real *direction→pose+flip* fold lives
in the un-decoded LL CPU ROM, so the ordering is geometric, not the
original's exact thresholds). Each lander pivots about the **DVG origin
`(0,0)`** (≈ the cabin-octagon centre, shown as a red dot) — a fixed
point, chosen over a per-frame bounding-box centre that visibly wobbled.
Drawing at arbitrary sizes is also possible via DVG `globalScale` (doubles
per step; wraps at gs≥6 from the 4-bit `(localScale+globalScale) & 0x0F`
mask).

## DVG reuse — same chip as Asteroids

LL drives the identical DVG, verified by decoding glyphs straight from
the ROM (`A` @ `$55BE` = 7 SVEC + RTS, `B` @ `$55CE` = 12 SVEC + RTS) —
byte-for-byte the same opcode encoding as Asteroids. So:

- `dvg.js` here is a **verbatim copy** of `asteroids_clone/dvg.js` (repo
  convention: games are self-contained, no shared library across them).
- The decoded-object vector format is identical.
- The authoritative DVG opcode/scale spec is
  `asteroids_clone/docs/research_dvg.md` (§4-§6, §11) — not duplicated
  here.

## Screen / coordinate space (conclusion so far)

Working model for the eventual render/runtime port:

- **Playfield 1024 × 768**, **origin (0,0) bottom-left**, **Y-up**;
  on-screen content lives in **x 0–1023, y 0–767**.
- The DVG is *addressable* to 1024×1024 (10-bit coords each axis), so a
  `LABS`/cursor can legally hold y up to 1023 — but LL's visible content
  sits in y 0–767. Don't be surprised if intermediate cursor math touches
  y > 767.

**How this was deduced** (we do NOT have the LL program-ROM disassembly):
the HUD composite `$5458` is the only ROM-**absolute** anchor we have — it
opens with `LABS (100, 748)` and its text row spans y `692–760`. For a
top-of-screen status line that only makes sense if the visible ceiling is
≈768, so the field is `[0, 768)` top-aligned. Notably LL does **not** use
Asteroids' `+128` vertical centering (`asteroids_clone/world.js`
`PLAYFIELD_Y_OFFSET`, which puts Asteroids' content in `[128, 896)`); the
two ceilings differ by exactly that 128. Everything else (terrain
baseline, exact bottom of the visible band) is CPU-side and still TBD.

## Vector ROM source (per-PC, NOT committed)

Raw ROM dumps (2 KB each) live in a per-PC directory — the exact path
differs between the two machines, so the build scripts
(`tools/build_vector_rom.py` and `tools/build_discovery.py`) probe a
list and use whichever exists on the machine you're on:

- `D:\tmp\lunar_lander\`
- `C:\Z_Temp\lunar_lander\`

(Add a new path to that list if you clone the ROMs onto a third machine.)

| File             | Maps at        | Holds |
|------------------|----------------|-------|
| `034598-01.np3`  | CPU `$5000-$57FF` | picture/glyph ROM — terrain tiles, starfield, the HUD label grid (`$5458`), the A-Z + space font, digits, colon, and arrows (see "034598 region map" below) |
| `034599-01.r3`   | CPU `$4800-$4FFF` | picture ROM #2 — the lander (8 base octagons `$4800-$48F8` + 9 tilt poses `$4916-$4B64`, dispatch table `$4BA2`; a second 9-frame rotation set dispatched from `$4DF4`); flag still TBD (terrain + digits live in `034598`) |
| `034597-01.m3`   | CPU `$5800-$5FFF` | third vector ROM (base **confirmed** via MAME `llander`). Its DVG decode is noise — **not** the terrain (terrain is in `034598` `$5000-$507E`); actual content/purpose still unclear. |

File offset = `addr − base` (`$5000` for `034598`, `$4800` for `034599`,
`$5800` for `034597`). The committed artifacts are the **decoded**
`vector_rom_data.js` (font), `lander_rom_data.js` (lander), and
`discovery_rom_data.js` (full survey) — not the ROMs themselves.

## Build + run

```bash
# regenerate the curated runtime data (reads the per-PC ROMs):
#   vector_rom_data.js (font) + lander_rom_data.js (lander)
python lunar_lander/tools/build_vector_rom.py
# regenerate the exploratory survey data (every sub in all 3 ROMs):
#   discovery_rom_data.js  (feeds gallery.html)
python lunar_lander/tools/build_discovery.py

# serve from the repo root, then open a demo:
#   /lunar_lander/demos/vector_rom.html   (font sheet)
#   /lunar_lander/demos/lander.html       (9 lander poses)
#   /lunar_lander/demos/gallery.html      (full ROM shape survey)
#   /lunar_lander/demos/hud.html          ($5458 HUD labels, in-game 2×3 grid)
#   /lunar_lander/demos/rotation.html     (360° rotation, both size banks)
#   /lunar_lander/demos/starfield.html    (034598 starfield; editable-range close-up)
#   /lunar_lander/demos/screen.html       (speculative full-screen layout, 1024x768)
python -m http.server -b 127.0.0.1 8080
```

`vector_rom_data.js`, `lander_rom_data.js`, and `discovery_rom_data.js`
are **generated** — edit the build script, not the data files. (Preview
config: launch.json `lunar_lander` serves this dir on port 8085.)

## 034598 region map ($5000-$57FF)

The picture/glyph ROM is laid out in these decoded regions (use
`demos/starfield.html` to view any of them enlarged):

| Range | Contents |
|---|---|
| `$5000-$507E` | **Terrain tiles** — 15 fixed-width segments, each net `+256` horizontal advance, zero dark moves (one continuous polyline per tile). Net `dy` over the 15 in address order sums to **0**, so they chain left-to-right into a continuous, horizontally-wrapping surface. Flat tiles (e.g. `$506C`, `$516E`) are landing-pad pieces. The tile **sequence** is CPU-side (nothing in ROM chains them); address order already forms a valid closed profile. |
| `$5088-$51A2` | Terrain stroke primitives — the shared left-to-right slope/flat pieces the tiles `JSR`. |
| `$5244-$53E6` | **Starfield** — 24 subroutines, **61 bright points, zero lines** (every "stroke" is a zero-length VEC = a single dot), brightness `5-9` (star magnitudes). No routine assembles them — the CPU positions the clusters at runtime. |
| `$5458` | **HUD labels — the in-game 2×3 grid** — 75 font-glyph JSRs spelling `SCORE  TIME  FUEL  ALTITUDE  HORIZONTAL SPEED  VERTICAL SPEED` (gaps are space-glyph `$5726` JSRs). Its `VEC` moves lay them out as **3 rows (y=748/720/692) × 2 columns (x=100/600)** — this *is* the gameplay HUD layout; only the numeric values are CPU-drawn separately. |
| `$55BE-$5726` | Font — A-Z + space (see table below). |
| `$572A-$5794` | **Digits 1-9** — 9 glyphs (`$572A=1, $5732=2, $5742=3, $5750=4, $575E=5, $576C=6, $577A=7, $5784=8, $5794=9`), same 8×12 SVEC form as the font. **`0` reuses the letter `O` (`$5688`).** |
| `$55B2` | **Colon `:`** — two stacked dots, advance 6 (= half a digit); TIME's `MM:SS` separator. |
| `$5566` `$5576` `$5586` `$5598` | **Arrows** — right / left / up / down. Speed-direction indicators (`$5566` right + `$5598` down used by H/V speed). |

(The `$5000-$507E` terrain tiles supersede the earlier `034597`
"pointer-table" lead, which decoded to noise — the terrain geometry is
here in `034598`.)

### Gameplay HUD (from a MAME `llander` rev2 screenshot)

The in-game status display is **two columns × three rows** — the labels are
exactly `$5458` (its `VEC` moves build the grid); the CPU adds the values:

| Left column | Right column |
|---|---|
| `SCORE 0000` (4 digits) | `ALTITUDE 2072` (4 digits) |
| `TIME 00:07` (`MM:SS`, colon) | `HORIZONTAL SPEED 104 →` |
| `FUEL 0739` (4 digits) | `VERTICAL SPEED 59 ↓` |

Ground-truth notes: TIME is `MM:SS`; ALTITUDE is 4 digits; the two speeds
carry a **direction arrow** (`→` / `↓`). The colon and arrows ARE in ROM
(not the font block): colon = `$55B2` (two dots, half-width), arrows =
`$5566` (right) / `$5598` (down). The screenshot also confirms the terrain
(jagged wrapping horizon with flat **2X/3X/5X** landing pads — pad
multiplier = `1 + 64/width`: 64→2X, 32→3X, 16→5X) and the starfield
(scattered sky dots). `demos/screen.html` draws `$5458` (the real 2×3
labels) plus sample values + arrows; value positions are matched to the
screenshot (exact placement is CPU-side).

## Letter address table (034598-01.np3, $5000-$57FF)

Contiguous, alphabetical, each glyph ends in RTS:

```
A $55BE  B $55CE  C $55E8  D $55F4  E $5604  F $5614  G $5622
H $5634  I $5642  J $5650  K $565C  L $5668  M $5672  N $567E
O $5688  P $5694  Q $56A2  R $56B4  S $56C4  T $56D2  U $56DE
V $56EA  W $56F4  X $5702  Y $570C  Z $571A  space $5726
```

## Next steps (user will provide info)

Terrain tiles, starfield, HUD labels (`$5458`), digits (`$572A-$5794`, `0`=`O`),
colon (`$55B2`) and arrows (`$5566`/`$5598`) are all located in `034598` (see the
region map). Still open:
- **Terrain tile sequence + pad placement** — which tiles in what order the game
  lays down, which flats are marked landing pads, and their multipliers/positions
  (CPU-side). Address order is a valid wrapping default; `multiplier = 1 + 64/width`
  (64→2X, 32→3X, 16→5X) fits the snapshot, but the real selection is unconfirmed.
- **HUD value / arrow / pad-label positions** — drawn by the CPU at runtime;
  `screen.html` matches them to a screenshot, but exact coords are CPU-side.
- **`034597-01.m3`** — MAME confirms it's a vector ROM at `$5800`, but its DVG
  decode is noise; what it actually holds (and why) is still unclear — re-decode TODO.
- **Flag** + any remaining picture parts.
The user supplies ROM context per shape set.
