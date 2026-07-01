# CLAUDE.md — lunar_lander

Guidance for Claude Code in this directory. Read this before changing
anything here; it overrides the repo-root CLAUDE.md.

## What this is

A port of Atari **Lunar Lander** (1979) — a vector-display arcade game
running on the **same Atari DVG** (Digital Vector Generator) as
Asteroids. "Faithful" matters: behavior should match the original ROM.

## Status

ROM-decode stage — twelve demo pages: nine faithful vector-ROM byte-decodes plus
three source-faithful demos: **flight physics** (`physics.html`), **crash explosion**
(`explosion.html`, the `BOOM` routine), and the **faithful landscape**
(`landscape.html`, built from `LNMIN`/`MINTBL` — the terrain done right with the
source, vs the MAME-matched `screen.html`/`scroll_view.html`). The **gameplay-runtime
scaffold has begun** (step 0 — see "Gameplay runtime — build order & status" below);
no playable game yet. HUD value layout, pad multipliers, and the horizontal-scroll/wrap
behaviour are MEASURED against MAME (see "Gameplay HUD" + "Terrain scroll" below).

**The original program source has been located** (`historicalsource/lunar-lander`,
cloned per-PC — see "Program source" below for the paths — main module `A34573.1A` by Rich Moore).
So the physics/gameplay is now a **routine-level translation** target (source in hand),
not a measure-and-reconstruct one. The physics is decoded in
`docs/research_physics.md`; the picture ROMs (`034597/8/9`) are still our own byte-decode.
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
- **Thrust flame** (`demos/thrust.html`) — the lander across its **gameplay
  rotation range** (head left → up → right, tilt ±90°, never upside-down) with a
  throttle-driven **thrust flame**. The flame is a **CPU-side reconstruction, NOT
  ROM data** — no flame glyph exists in any of the three vector ROMs (see "Thrust
  flame" below). Based on `rotation.html`'s decode + DVG helpers.
- **Crash explosion** (`demos/explosion.html`) — a **routine-level translation of
  the `BOOM` routine** (`A34573.1A` + the `A34599.1C` debris pictures): the intact
  lander at centre bursts into a tumbling cabin octagon + 6 fragments that fly out
  and wink out over `INDEX` 1→127, then re-forms and replays with a new random
  1-of-4 pattern. Controls: pattern picker, zoom, pause + `INDEX` scrub. See
  "034599 explosion debris" below + `docs/research_explosion.md`.
- **Faithful landscape** (`demos/landscape.html`) — the lunar surface built **the way
  the ROM builds it**: the 16 sections `SECT01-16` (from 24 segments) in `LNMIN` order,
  Y-placed by `MINTBL`, wrapping seamlessly (`SECT11` = the flat `SEG019`). Its wide
  overview is the **zoom-OUT (major-scape) view** — what the MAME `0001` snapshot shows —
  drawn from the terrain-definition tables the ROM labels *minor scape* (see §3.1 gloss). Terrain
  ONLY (no lander/HUD); zoom (1× = whole 4096-wide loop) + scroll/auto-scroll with wrap;
  a `faithful ✓` self-check confirms every boundary hits `MINTBL`. This is the
  source-driven counterpart to `screen.html`/`scroll_view.html` (which matched a MAME
  snapshot before the source was found — kept as-is). See `research_vector_usage.md` §3.
- **Starfield** (`demos/starfield.html`) — the `$5244-$53E6` starfield
  (61 bright points) enlarged with a focus panel (points rendered as
  visible dots). The CPU-address range is editable, so it also serves as
  a general close-up viewer for any `034598` region. Used to confirm the
  starfield and terrain-tile regions below.
- **Screen layout** (`demos/screen.html`) — the gameplay screen composited on a
  faithful `1024×768` field: the `$5458` HUD with formatted values (left + right
  columns) and speed arrows, the terrain (15 tiles + an inserted flat pad, fit to
  the snapshot's vertical band) with multiplier-labelled pads, and the zoom-out
  lander. Shapes are byte-decoded; **HUD value alignment + pad multipliers are now
  MEASURED from a MAME gameplay frame** (see "Gameplay HUD" below), not guessed.
  The terrain tile *sequence* + on-screen scale remain CPU-side approximations.
  Starfield deferred (rendering needs rework).
- **Scrolling terrain** (`demos/scroll_view.html`) — the **same terrain `screen.html`
  draws** (the `$5000-$507E` tile data, same fit-to-width + band scale + pad
  multipliers), scrolled horizontally in a **ping-pong sweep**: slides one screen-width
  left (lander flying right, arrow `→`), then reverses and slides back (`←`). Endpoints
  are the same view, so each turnaround is seamless (drawn as two copies; tile loop net
  `dy=0`). HUD on top, speed slider + pause. (The real game *wraps* one way — see
  "Terrain scroll" — the ping-pong is a demo choice, not faithful behaviour.) Tile
  sequence is the address-order approximation, same as `screen.html` (real CPU order TBD).
- **Flight physics** (`demos/physics.html`) — fly the lander on a scrolling starfield with the
  **source-faithful flight model** (gravity `$11`, hover at throttle 8, thrust along the ship
  axis, inertial coasting, no drag) — a routine-level translation of the original
  (`A34573.1A`; see `docs/research_physics.md`). Lander centred, world scrolls (the arcade
  camera model); four difficulty modes (gravity / friction / 1.5× thrust / rotational inertia).
  **A demo, NOT real gameplay** — e.g. starting fuel is tied to the difficulty dropdown for
  convenience, whereas the source makes fuel-per-coin an independent operator DIP (§7.2).

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
shape's measured orientation (the real *direction→pose+flip* fold is in the
program source — `MODULE`/`FRCMLT` in `A34573.1A`, driven by `SHIP` 0–31 =
11.25°/step — but rotation.html still orders geometrically, not yet re-derived
from source). Each lander pivots about the **DVG origin
`(0,0)`** (≈ the cabin-octagon centre, shown as a red dot) — a fixed
point, chosen over a per-frame bounding-box centre that visibly wobbled.
Drawing at arbitrary sizes is also possible via DVG `globalScale` (doubles
per step; wraps at gs≥6 from the 4-bit `(localScale+globalScale) & 0x0F`
mask).

### 034599 explosion debris (`$4F1C-$4FBE`) — DECODED from source (`BOOM`)

The lander-crash debris field is drawn from **12 small fragment glyphs** at
`$4F1C-$4FBE`. The full mechanism is now decoded from the program source
(`A34573.1A` routine `BOOM` + `A34599.1C` pictures) — see
**`docs/research_explosion.md`**, ported in **`demos/explosion.html`**. The 12
glyphs are the source's `PIECE1..PIEC12`; their names confirm the earlier
eyeballed gallery labels:

| addr | name | shape | addr | name | shape |
|---|---|---|---|---|---|
| `$4F1C` | PIECE1 | leg strut | `$4F6E` | PIEC7 | box / square (panel) |
| `$4F28` | PIECE2 | stepped bracket | `$4F78` | PIEC8 | M / trapezoid zigzag |
| `$4F3A` | PIECE3 | chevron (shallow V) | `$4F8E` | PIEC9 | thin rectangle (panel) |
| `$4F46` | PIECE4 | triangle wedge | `$4FA0` | PIEC10 | leg strut |
| `$4F52` | PIECE5 | Z-step bracket | `$4FAE` | PIEC11 | leg strut |
| `$4F62` | PIECE6 | leg strut | `$4FBE` | PIEC12 | diamond (rotated square) |

**The mechanism (supersedes the old "random subset" read):** a crash is a fixed
**7-piece** animation over a step counter `INDEX` (1→127, +1 every other frame,
~4.2 s) — **1 tumbling cabin octagon** (a `$4800`-series base shape, pose =
`INDEX & 7`, lasts the whole run) **+ 6 debris fragments**. Each piece flies out
from the impact point at a constant velocity (offset = `delta·INDEX`) and winks
out at its own staggered time (`BOOMC1` = `93/96/100/109/112/116/127`). The
**"randomness" is a 1-of-4 pattern pick** (`RNDOM` 0–3 selects one of four
hand-authored `BOOMA{n}`/`BOOMB{n}` velocity+glyph sets), **not** a random subset
of the 12 glyphs. Positioning is a single **cumulative beam walk** (`VGVCTR` emits
relative dark moves). All 12 glyphs + 8 octagons are JSR targets in
`discovery_rom_data.js` / `gallery.html`.

### Thrust flame — programmatic (no ROM glyph); our design vs the original

There is **no thrust-flame glyph in any of the three vector ROMs** — the gallery
survey (every JSR/JMP target in 034597/8/9) turns up none. The flame is drawn
**programmatically by CPU code** — now **confirmed**: the original commented source
has been located, `FLAME` ("ADD FLAME TO SHIP") in `A34573.1A` of
<https://github.com/historicalsource/lunar-lander> (cloned per-PC — see "Program
source" below; full file map in the cross-PC sync memory). So it's a
software mechanism, not a hardware-only "drop". **`demos/thrust.html` keeps our own
flame construction by choice — it is NOT a byte-port of `FLAME`**; the original is
recorded below so the difference is on record (revisit only if we want arcade-exact).

`demos/thrust.html` builds our flame, modelled on two references:
- **Asteroids' thrust flame** (`asteroids_clone`): each `ShipDirN` pose is
  immediately followed in ROM by a tiny `ThrustDirN` (2 strokes + RTS) emitted on
  the **same DVG cursor** so it anchors to the ship's tail; it flickers on
  `fastTimer & 4` while thrust is held, mirrored with the ship's flip flags
  (`render.js` `drawShip`, source `$750B` / `$753B-$7553`).
- **Seb Lee-Delisle's *Moon Lander*** (`Lander.js`, from-scratch canvas — technique
  only, not a port source): a V off the nozzle, length = `base + min(throttle,1)*gain`,
  scaled by a 3-step frame-counter flicker (`((counter>>1)%3)*0.2 + 1` = 1.0/1.2/1.4),
  with the throttle exponentially smoothed (`thrustBuild += (target-thrustBuild)*0.2`).

The demo draws the plume as **two lines starting at the nozzle mouth's two tips and
converging to a point** `len` further along the engine direction, where `len` ∝
nozzle-mouth width × throttle × counter-flicker (the mouth-width factor keeps the
plume proportional across **both** size banks), in the hull phosphor colour. The nozzle mouth is found
geometrically per-pose (`nozzleTips`): it's the pose segment that **crosses the
engine centreline** (the axis through the DVG origin in the engine direction) and
sits **deepest** along it — the flared bell exit edge; the legs reach deeper but
splay off-axis so they don't cross the centreline. **An optional red-flame toggle is
a deliberate non-faithful aesthetic** — the DVG is monochrome (intensity-only, `bri`
0-15, no colour); the green is already a phosphor-sim choice, red is pure embellishment.

**The original `FLAME` vs ours** (`lunar_lander_source/A34573.1A:1315`, data `:1430`).
Same family — a programmatic V at the nozzle, gated on thrust ≠ 0, rotating with the
ship — but the construction differs, and **we keep ours**:
- **What thrust scales (inverted axis).** Original: flame **length is fixed** (per-
  rotation table `FLAMEA`, ~7 units) and **thrust widens** it — endpoints are
  `DEL ± THRUST'·perp(DEL)` → a *short, wide, flickering fan*. Ours: **width fixed**
  (the nozzle mouth) and **throttle lengthens** the plume → a *narrowing jet*. Opposite axes.
- **Nozzle direction.** Original: a hand-authored 9-entry table `FLAMEA` (rotation
  0–8) plus a smaller `FLAMEB` for the "major"/zoomed module (≈ our two banks). Ours:
  detected geometrically per pose (`nozzleTips`).
- **Thrust input.** Original quantizes to `THRUST' = THRUST/4 + flick` (integer 1–4);
  ours is continuous 0–1, smoothed.
- **Flicker.** Original: frame-parity (every other frame `+1`). Ours: 3-step counter.
- **Brightness.** Original scales with thrust (`VGBRIT = (THRUST/2+8)<<4`, ~`80`–`F0`;
  abort `F0`). Ours: fixed full brightness. (Both monochrome — see the red-toggle note.)

Net: the arcade flame is a short/wide/bright/thrust-flickered *fan*; ours is a longer
cinematic *plume*. Confirmations from `FLAME` that validate our approach: the flame
*does* rotate with attitude via a per-pose table, *is* emitted into the ship's vector
list from the nozzle base, and *is* monochrome-intensity. (The exact rendered outline
of `FLAME` — beam origin, whether the two `VGVCTR`s close a triangle — needs a
`VGVCTR`/beam trace before any pixel-exact port.)

**Gameplay rotation range** (also what `thrust.html` constrains to): the lander
tilts within **one half-circle only** — head left → up → right, so the engine always
points downward-ish; it never goes upside-down. Engine-heading convention (the
direction the thrust points, standard math angle, +y up): head-left = `0°`, standing
= `270°`, head-right = `180°`, i.e. the arc `0 → 270 → 180`. Parametrised in the demo
as **tilt ∈ [−90°, +90°]** (0 = upright), with engine = `270 − tilt`. This maps to the
**9 stored poses + their X-mirror** (`xFlip` for left/right, NO `yFlip`; stand =
`$4B64`/`$4DB6`) — 17 attitudes ~11.25° apart. (`rotation.html` shows the *full* 360°
via X **and** Y mirror; the gameplay range is the X-mirror-only lower half.)

**Porting the flame to gameplay.** The construction is **`globalScale`-robust** because
everything is derived from the *rendered* pose geometry, not absolute constants: the
nozzle tips come from the decoded segments and the plume length is a multiple of the
mouth width — both scale with the pose. So when the game zooms (bank swap and/or DVG
`globalScale`), decode the lander at the **live gs** and compute the flame from *that
same* decode (or apply the zoom as one uniform transform over pose+flame) — keep them
coupled to a single decode and the plume tracks at any size. (Only gs ≥ 6, the 4-bit
scale-wrap regime, would distort — gameplay won't use it.) In the demo the 18
attitudes per bank are **precomputed once** (segments + direction + nozzle mouth are
static per attitude); the frame loop only adds the throttle-driven plume.

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

**How this was deduced** (from the picture ROMs alone — the program source is now
in hand and can confirm it directly, e.g. the `LABS`/`VGRAM` usage in `A34573.1A`):
the HUD composite `$5458` is the only ROM-**absolute** anchor in the picture ROMs — it
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
| `034599-01.r3`   | CPU `$4800-$4FFF` | picture ROM #2 — the lander (8 base octagons `$4800-$48F8` + 9 tilt poses `$4916-$4B64`, dispatch table `$4BA2`; a second 9-frame rotation set dispatched from `$4DF4`); **explosion-debris glyphs `$4F1C-$4FBE`** (see "034599 explosion debris" below); flag still TBD (terrain + digits live in `034598`) |
| `034597-01.m3`   | CPU `$5800-$5FFF` | **Vector ROM — FOREIGN VERSION ONLY** (per `LUNAR.DOC`). Holds the foreign-language vector content: foreign character glyphs + `.ASCVG` message strings + offset tables (`FTBLNG=$5800`, `FORMSG`, `FMESSG=$5E69`, `F.MOFF=$5FA4`). Absent/unused in a US cabinet, so decoding our dump as *English shapes* gives noise — that's the foreign ROM, not a decode bug. |

File offset = `addr − base` (`$5000` for `034598`, `$4800` for `034599`,
`$5800` for `034597`). The committed artifacts are the **decoded**
`vector_rom_data.js` (font), `lander_rom_data.js` (lander), and
`discovery_rom_data.js` (full survey) — not the ROMs themselves.

### Program source (the gameplay/physics code)

The original **commented 6502 program source** is public — `historicalsource/lunar-lander`,
cloned per-PC (the exact path differs between machines, same convention as the ROM dumps
above): `D:\tmp\lunar_lander_source\` or `C:\Z_Temp\lunar_lander_source\` — main module
`A34573.1A` by Rich Moore;
`.1B`/`.1C`/`.1D` are the other linked modules; `VECAN.XX` is the font source; `LUNAR.MAP`
the hardware I/O map). This **supersedes** the earlier "un-dumped program ROM" assumption:
the physics, scroll, flame, scoring, and collision are all readable. Decoded in
`docs/research_physics.md`. The repo **also carries the labeled SOURCE for the three
vector ROMs** — `A34598.1B` ("LUNMIN": terrain sections/segments, starfields, the `VECAN`
font), `A34599.1C` ("LUNVEC": the two lander banks + explosion pieces), and `A34597.1A`
(**foreign-version only**) — so the vector data has named definitions, not just our
byte-decode. (The per-PC `.np3` dumps still feed the build scripts.)

### How the vector data is used (display list)

The CPU never draws; each frame it assembles a **VG-RAM display list** of DVG instructions
and the hardware runs it, jumping into the picture ROMs. Two usage modes:
- **Static shapes** (terrain, starfield, font, HUD, arrows) → `LABS` (position) + `JSRL`
  (jump to the ROM subroutine), drawn in place — the picture ROM is a *library* the CPU
  stitches by reference. **Terrain = 16 sections `SECT01-16`** (each 256 wide = a JSRL list
  of segments `SEG001-024`), ordered by **`LNMIN`** (which repeats → the wrap) and
  positioned by **`MINTBL`**. That's the real terrain sequence — it **supersedes the
  address-order guess** in `screen.html`/`scroll_view.html`. The **far scape is built at
  runtime** by `TRANS`, not stored.
- **The lander** (mirrored) → `MODULE` folds `SHIP`(0-31) → 9 poses + X/Y sign masks, picks
  the bank by zoom (`SHIPS` near / `LITTLE SHIPS` far), then **copies the pose's vectors
  into VG RAM `EOR`-flipping the delta signs** (`SHPINV`) to mirror it (our `xFlip`/`yFlip`
  at render time = the same thing).

Full catalog (section→segment sequences, lander dispatch, starfield/font/messages) in
**`docs/research_vector_usage.md`**. Expansions for the terse labels (`LNMIN`,
`MJRVG`, `SCAPE`, `SHPINV`, `BOOM`, DVG mnemonics, …) are in **`docs/glossary.md`**.

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
#   /lunar_lander/demos/thrust.html       (gameplay rotation range + throttle-driven thrust flame)
#   /lunar_lander/demos/starfield.html    (034598 starfield; editable-range close-up)
#   /lunar_lander/demos/screen.html       (full-screen layout, 1024x768; MAME-measured HUD/pads)
#   /lunar_lander/demos/scroll_view.html  (screen.html terrain, ping-pong scroll: slide one screen, reverse)
#   /lunar_lander/demos/physics.html      (source-faithful flight physics on a scrolling starfield)
#   /lunar_lander/demos/explosion.html    (source-faithful crash explosion: BOOM routine, 1-of-4 random pattern)
#   /lunar_lander/demos/landscape.html    (faithful landscape from LNMIN/MINTBL; terrain only, wraps)
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
| `$5000-$507E` | **Terrain — 16 sections** `SECT01-16` (`A34598.1B:13`), each 256 wide and itself a **`JSRL` list** of 1–4 of the `$5088` segments (+ inline `VCTR` connectors); `SECT11` is a one-segment alias. The byte-decoder rendered each section's composite as a 256-wide polyline — the old "15 fixed-width tiles" reading. The on-screen order is the **ROM `LNMIN` table** (`SECT01..16` + a `SECT01-04` wrap tail), positioned vertically by `MINTBL` — NOT address order, and the source **chains them** (the old "nothing in ROM chains them" was wrong). One fixed surface, **not** level/difficulty-dependent. See `docs/research_vector_usage.md` §3. |
| `$5088-$51A2` | **Terrain — 24 segments** `SEG001-024` (`A34598.1B:101`), the reusable slope/flat stroke pieces the sections `JSRL`. **All 24 are used** by the sections above (resolves "terrain glyphs whose use we hadn't found"). |
| `$5244-$53E6` | **Starfield** — 24 subroutines, **61 bright points, zero lines** (every "stroke" is a zero-length VEC = a single dot), brightness `5-9` (star magnitudes). No routine assembles them — the CPU positions the clusters at runtime. |
| `$5458` | **HUD labels — the in-game 2×3 grid** — 75 font-glyph JSRs spelling `SCORE  TIME  FUEL  ALTITUDE  HORIZONTAL SPEED  VERTICAL SPEED` (gaps are space-glyph `$5726` JSRs). Its `VEC` moves lay them out as **3 rows (y=748/720/692) × 2 columns (x=100/600)** — this *is* the gameplay HUD layout; only the numeric values are CPU-drawn separately. |
| `$55BE-$5726` | Font — A-Z + space (see table below). |
| `$572A-$5794` | **Digits 1-9** — 9 glyphs (`$572A=1, $5732=2, $5742=3, $5750=4, $575E=5, $576C=6, $577A=7, $5784=8, $5794=9`), same 8×12 SVEC form as the font. **`0` reuses the letter `O` (`$5688`).** |
| `$55B2` | **Colon `:`** — two stacked dots, advance 6 (= half a digit); TIME's `MM:SS` separator. |
| `$5566` `$5576` `$5586` `$5598` | **Arrows** — right / left / up / down. Speed-direction indicators (`$5566` right + `$5598` down used by H/V speed). |

(The `$5000-$507E` terrain tiles supersede the earlier `034597`
"pointer-table" lead, which decoded to noise — the terrain geometry is
here in `034598`.)

### Gameplay HUD — MEASURED from MAME (`llander` rev2, 2026-06-29)

Two 1600×1200 snapshots (idle frame `0000`, gameplay frame `0001`) were pixel-
measured into the `1024×768` model (`rom = px ÷ 1.5625`, `y_up = 768 − px_y ÷ 1.5625`).
The in-game status display is **two columns × three rows** — the labels are
exactly `$5458` (its `VEC` moves build the grid, at rows `y_up` 748/720/692,
columns `x` 100/600); the CPU adds the values:

| Left column | Right column |
|---|---|
| `SCORE 0000` (4 digits) | `ALTITUDE 2076` (4 digits) |
| `TIME 00:07` (`MM:SS`, colon) | `HORIZONTAL SPEED 106 →` |
| `FUEL 8250` (4 digits) | `VERTICAL SPEED 61 ↓` |

**Value alignment (confirmed, the two columns differ):**
- **Left column** (SCORE/TIME/FUEL) is **LEFT-aligned** — first char fixed at
  **rom x ≈ 204**, numbers grow right.
- **Right column** (ALTITUDE/H-SPEED/V-SPEED) is **RIGHT-aligned** — units digit
  fixed at **rom x ≈ 878**, numbers grow left. (Proof: idle single `0` and active
  `2076` share the same right edge, different left edge.)
- **Digit pitch ≈ 11 rom units**; TIME is `MM:SS` (colon = `$55B2`, half-width).
- **Speed arrows** are drawn ~20 units right of the value (**rom x ≈ 897**), rows 2/3:
  `→` = `$5566`, `↓` = `$5598`. Colon and arrows are in ROM, not the font block.

**Landing pads (confirmed by the game's own multiplier labels):** the visible
cluster is `5X 5X 2X 2X` left-to-right, matching `multiplier = 1 + 64/width`
(64→2X, 32→3X, 16→5X):

| pad | rom x (center) | y_up | label |
|---|---|---|---|
| left peak-flank ledge  | ≈ 390 | ≈ 233 | **5X** (narrow, high on the slope) |
| right peak-flank ledge | ≈ 560 | ≈ 179 | **5X** |
| central valley floor   | ≈ 666 | ≈ 43  | **2X** (wide) |
| right valley floor     | ≈ 848 | ≈ 47  | **2X** |

So **wide valley floors = 2X (easy), narrow ledges high on the peak = 5X (hard)** —
the inverse width↔multiplier design. (This **corrects** an earlier width-only guess
that called the side valleys "3X" and missed the two 5X flank ledges.) Note: **not
every flat is a scoring pad** — the wide flat at the bottom of the left-center valley
(rom ~266–290) carries no label, so pads are specifically designated in the terrain
data, not "any flat spot."

### Terrain scroll — MEASURED from MAME (frames 0000-0003, 2026-06-29)

Four frames (lander flown right; cross-correlated, RMS 0.6–1.9 px over ~870 rom of
overlap):

- **Pure horizontal scroll, fixed vertical baseline, constant scale** in the far
  (zoomed-out) view: `dy = 0` in every pair, deepest valley fixed at `y_up ≈ 42`.
  No vertical pan, no zoom change while high. (The zoom-IN lander bank kicks in only
  at low altitude — scale changes there, which breaks cross-frame stitching.)
- **The terrain wraps** — flying right, the left edge leaves and re-emerges on the
  right (user-confirmed); one ~3840-unit loop (15 tiles × ~256, net dy=0).
- Frame offsets vs `0001`: `0000`=0, `0002`=+147 rom, `0003`=+244 rom (additive ✓).
- A single stitched **master profile (rom 0–1268, ~⅓ of the loop)** reproduces all
  four frames at **< 1.2 px RMS** — proving the four windows are one continuous
  terrain. That third contains the single `5X 5X 2X 2X` pad cluster.
- **A screen rendered from this data alone reproduces the MAME frame** (HUD grid,
  value alignment, arrows, terrain, pads) — i.e. the decoded layout is sufficient to
  draw a correct game screen. (This was an offline reconstruction from the stitched
  master profile, not committed — it only confirms the layout is correct.)

The repo demos do NOT use the MAME master profile: `demos/screen.html` (static) and
`demos/scroll_view.html` (scrolling) render the terrain from the **ROM tile data**
(`$5000-$507E`, address order) at the fit-to-width silhouette scale, with the HUD
value alignment + pad multipliers set to the MAME-measured values above.

**Now resolved by the source** (`docs/research_vector_usage.md` §3): the terrain
**sequence is the ROM `LNMIN` table** (16 sections, fixed) — the MAME-stitch
reconstruction is moot — and the terrain is **fixed, NOT level/difficulty-dependent**
(difficulty `PLYMOD` changes only the physics; `SCAPE` `:1093` reads fixed
`LNMIN`/`MINTBL` and never `PLYMOD`; `LUNARNUM` is the near/far *zoom* state, not a
terrain index). The **`TRANS` zoom reduction is now decoded** too: the major (zoom-out)
scape is *generated* from the minor `LNMIN` data at **¼ DVG scale, 4 minor sections packed
into 1** (`research_vector_usage.md` §3 "The major … scape"). Still CPU-side: exact
value/arrow/pad pixel placement.

## Letter address table (034598-01.np3, $5000-$57FF)

Contiguous, alphabetical, each glyph ends in RTS:

```
A $55BE  B $55CE  C $55E8  D $55F4  E $5604  F $5614  G $5622
H $5634  I $5642  J $5650  K $565C  L $5668  M $5672  N $567E
O $5688  P $5694  Q $56A2  R $56B4  S $56C4  T $56D2  U $56DE
V $56EA  W $56F4  X $5702  Y $570C  Z $571A  space $5726
```

## Planned gameplay module layout (when we build the runtime)

The eventual gameplay will be **ES6 modules split by subsystem** — Seb Lee-Delisle's
`Lander.js`/`game.js`/… shape, and the repo's own modular exemplar `mario_physics/` — NOT
one big file. This mirrors the original's own decomposition (`A34573.1A` links `LUNAR`/
`LUNVCT`/`LUNCON`/`LUNINT` plus the separate vector-ROM source), so modular files and
faithful **routine-level translation** reinforce each other: each module holds the ported
routines with their `A34573.1A:nnnn` citations.

**`index.html` migration.** Today `index.html` is the demo hub (only because there's no
game yet). During the build, a root **`play.html` boots `main.js`** so the demo hub stays
live at `index.html`. **On release, promote `play.html` → `index.html`** — a game project's
root should boot the game (like the sibling clones, and so the built-in preview at the
folder root plays the game) — and **move the current demo hub to `demos/index.html`**
(linked from the game; the repo-root index at `:8080/` still lists everything).

The demos are the **validated building blocks** to extract from (repo convention: demos
validate techniques later reused in the games). `demos/physics.html` is already a
single-file proto-gameplay (physics + starfield + HUD + lander + flame + input + loop).

| Module | Role | Ports (source) | Leverage (demo) |
|---|---|---|---|
| `main.js` | boot, canvas, fixed-timestep loop, per-frame order | main loop `:409-485`, `LUNINT` | physics.js |
| `lander.js` | flight + craft: `ACCEL`, `THRLVL`/`FRCMLT`, `ROTSHP`(+inertia), `BURN`, `MODULE` pose+flame | `LUNAR`+`LUNVEC` | thrust.js + physics.js |
| `landscape.js` | scape assembly + scroll + zoom + collision: `SCAPE`, `LNMIN`/`MINTBL`, `SCROLL`/`SCRADD`, `SCAPCHG`/`SCAPMJR`/`SCRLUP`, `DECODE` | `LUNMIN` + scape | screen.js + scroll_view.js |
| `starfield.js` | `STARS` (major/minor) | `STARS`, `598:306/401` | physics.js + demos/starfield.js |
| `display_info.js` | HUD `$5458` + `DISPLY` values, digits/arrows/messages | HUD/DISPLY | screen.js + physics.js |
| `input.js` | switches (rotate/abort/throttle), `TYPE` difficulty, `CREDIT` coin/fuel | `:687`/`:722`/`ROTCHK` | physics.js |
| `state.js` | game-state machine (`GAMODE` attract/play/land), `PLYMOD`, scoring | `DOGAME`/`GAMODE` | — |
| `dvg.js`, `*_rom_data.js` | renderer + decoded shapes (reused as-is) | — | (shared) |

**Two seams (built — step 0):**
- **`render.js`** — a **direct-draw** render layer over `dvg.js`: modules draw by shape
  KEY (`drawShapeWorld` = camera-space for scape/lander; `drawShapeScreen` = fixed-space
  for HUD), so vector data stays single-sourced in `*_rom_data.js` and the camera
  transform lives in one place. We chose direct dvg draw **over** a VG-RAM display-list
  analog — simpler; the single-sourcing a display list would enforce is instead enforced
  by the rule **"no vector-coordinate literals in any module."**
- **`state.js`** — the shared zero-page values (`SHIP`, `VELX/Y`, `FUEL`, `SCROLL`,
  `LUNARNUM`, …) + the `camera`, at the source's boot defaults.

**Not lift-and-drop — extract + consolidate + upgrade:**
- demos duplicate code (attitude/flame in `thrust.js` AND `physics.js`; HUD in `screen.js`
  AND `physics.js`) → consolidate into one module each;
- demo simplifications → faithful (terrain address-order → real `LNMIN`/`MINTBL` sequence;
  keep keyboard throttle / generated starfield by choice — see the demo labels);
- viewer demos (`lander.js`, `starfield.js`, `gallery.js`, `hud.js`, `vector_rom.js`) —
  reuse their extraction/decode logic, not the viewer shell.

**Net-new (no demo has it yet, but fully documented):** the **landscape/collision** chain —
`DECODE` (lander-corner → terrain distance), landing/crash detection, scoring, and the zoom
transition — see `docs/research_physics.md` §9.1 + `docs/research_vector_usage.md` §3.
`physics.html` has no terrain, so this is the main remaining build.

### Flight-model architecture — stepper + profiles

The flight model is pluggable behind a thin **stepper contract** so motion can be
swapped without touching anything downstream (collision, scoring, camera, render all
read the shared `state`):

```
step(state, input, dt)   // advance the canonical state one 24 ms tick
```

Two independent axes:
- **Model / architecture** — which `step()` runs. **`physics_arcade` first** (the faithful
  routines `ACCEL`/`FRCMLT`+`SINES`/`ROTSHP`/`BURN`; float math, real constants — see
  `docs/research_physics.md` §13). A second **Seb-style** model (`physics_seb`, tuned
  floats) is **deferred**: the `step()` seam makes it a drop-in later, so keeping the door
  open costs ~nothing — building it is the only cost, and it's put aside for now.
- **Profile within a model** — for the arcade stepper this is the authentic **`PLYMOD` 0-3**
  table (Training/Cadet/Prime/Command; gravity/friction/thrust/inertia per
  `research_physics.md` §7). A new profile = one more constant tuple; a new architecture =
  a new `step()` module.

**Selection = an HTML control in the HUD, NOT the cabinet mechanisms** — two labeled
deviations; the physics/profiles stay faithful:
- `PLYMOD` is chosen via an on-page control that sets `state.PLYMOD`, **not** the
  SELECT-button cycle (`TYPE`/`TYPESW` `:687`) — so `input.js` skips the button debounce.
- the current mode is shown **on-screen**; the cabinet used a physical lamp (`MODLMP`),
  not the HUD.

(The operator **fuel-per-coin** DIP, `research_physics.md` §7.2, is the natural other
entry in that HTML settings area — fuel budget, kept visually separate from control feel.)

### Gameplay runtime — build order & status

Built one sub-step at a time, each browser-verified (repo "sub-step + save-point" pattern).
`play.html` boots `main.js`; served by the `lunar_lander` launch config (port 8085) at
`/play.html`. Clock: `TICK = 6/250` s (24 ms) — one source frame; float arithmetic except
the collision/landing kernel (`research_physics.md` §13).

- **[done] Step 0 — seams + skeleton:** `state.js`, `render.js`, `main.js`, `play.html`.
  Draws one lander pose to prove `main → render → dvg → *_rom_data` end-to-end.
- **Step 1 — `landscape.js`:** `LNMIN`/`MINTBL` terrain via the camera (scale+scroll+wrap),
  major ¼ scale (`research_vector_usage.md` §3).
- **Step 2 — `lander.js`:** the `physics_arcade` stepper + `PLYMOD` table + HTML mode
  control + `MODULE` pose/flame.
- **Steps 3-7:** `input.js`, `display_info.js` (HUD), `starfield.js`, then the net-new
  collision/landing/scoring/zoom-transition, then the `GAMODE` machine.

`state.js` currently holds the shared zero-page values (the seam); the `GAMODE`
attract/play/land machine + scoring (the module table's `state.js` role) lands with the
final step and may live in `state.js` or a small sibling module.

## Next steps

Having the original source resolved most of the old decode unknowns:
- **Terrain sequence** — it's the `LNMIN` section order + `MINTBL` LABS (16 sections of
  segments `SEG001-024`), not address order (`docs/research_vector_usage.md` §3). The
  MAME-frame-stitch approach is moot.
- **Difficulty / level variation** — decoded: `PLYMOD` (0–3) changes gravity / friction /
  1.5× thrust / rotational inertia, plus the operator fuel-per-coin DIP
  (`docs/research_physics.md` §7) — **physics ONLY**. The terrain is one **fixed** surface,
  unaffected by difficulty, and there is **no "level"** (`SCAPE` uses fixed `LNMIN`/`MINTBL`;
  `LUNARNUM` is the near/far zoom state, not a terrain index). See `research_vector_usage.md` §3.
- **`034597-01.m3`** — a **FOREIGN-VERSION-ONLY** vector ROM, not "unclear" (see the region map).
- **"Flag"** — was the thrust flame; it's the programmatic `FLAME` routine (see "Thrust flame").

The open work is now **building the gameplay runtime** (see "Planned gameplay module layout"
above): the flight half is demo-proven (`physics.html`); the landscape / collision / landing /
scoring / zoom half is documented but unbuilt.
