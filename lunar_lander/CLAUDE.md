# CLAUDE.md — lunar_lander

Guidance for Claude Code in this directory. Read this before changing
anything here; it overrides the repo-root CLAUDE.md.

**Commit style (this project):** a **one-line title + the trailer** — no
multi-line body (the research docs + the diff carry the detail). e.g.
`[lunar_lander] <subject>` then `Co-Authored-By: …` (a `step N —` prefix
on the subject is optional).

## What this is

A port of Atari **Lunar Lander** (1979) — a vector-display arcade game
running on the **same Atari DVG** (Digital Vector Generator) as
Asteroids. "Faithful" matters: behavior should match the original ROM.

## Status

**Complete** — a faithful JS port of Atari **Lunar Lander** (1979). The **gameplay runtime is
done and released** (steps 0-8): seams · terrain · flight · HUD · zoom · collision/landing ·
out-of-fuel · scoring · starfield. It was assembled from a **ROM-decode stage** — twelve demo pages
(nine vector-ROM byte-decodes + three source-faithful demos: **flight physics** `physics.html`,
**crash explosion** `explosion.html` the `BOOM` routine, **faithful landscape** `landscape.html`
from `LNMIN`/`MINTBL`, plus the MAME-matched `screen.html`/`scroll_view.html`) — the validated
building blocks the runtime was extracted from; those demos now live at `demos/`. The **project root
`index.html` boots the game**: a full mission loop — fly, land or crash (the `DECODE`/`SCAPLND` verdict → good/hard/crash
outcomes with the bounce, the `BOOM` explosion, and the source's status messages), score by `TBSTFT`
bonus site (4 flashing `NX` pads per drop), burn fuel down to the `DEDUCT`/`OUT OF FUEL` end-game,
and re-drop until the tank runs dry — over a scrolling `STARS` backdrop. The vector-ROM decode demos
live at `demos/` (`demos/index.html` hub). HUD value layout, pad multipliers, and the
horizontal-scroll/wrap behaviour are MEASURED against MAME (see "Gameplay HUD" + "Terrain scroll" below).

**Deferred by choice** — a few deliberate omissions (not bugs; the educational goal is met) are
listed once in [Deferred (by choice)](#deferred-by-choice) at the end of this file.

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
  (This static decode demo omits the starfield — the game renders it via `starfield.js`, step 8.)
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

- **VERTICAL/HORIZONTAL SPEED "bounces" down periodically in Training.** In
  Training (`PLYMOD 0`) `FRICTN` runs every 16 frames (`:1036`), subtracting
  `VEL/32` from each velocity magnitude. At speed, that single-frame drop of
  `|VEL|/32` can cross a display `÷64` boundary (speed = `|VEL| >> 6`), so the
  HUD number ticks **down 1** for a frame before gravity/thrust resumes climbing
  it — the number appears to jitter. This is **faithful** (confirmed against
  MAME): the other modes (Cadet/Prime/Command have no friction) count perfectly
  monotonically. Do **not** smooth or clamp the display to "fix" it.

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

Working model for the render/runtime port (built):

- **Playfield 1024 × 768**, **origin (0,0) bottom-left**, **Y-up**;
  on-screen content lives in **x 0–1023, y 0–767**.
- The DVG is *addressable* to 1024×1024 (10-bit coords each axis), so a
  `LABS`/cursor can legally hold y up to 1023 — but LL's visible content
  sits in y 0–767. Don't be surprised if intermediate cursor math touches
  y > 767.

**Responsive presentation (2026-07-02, asteroids_clone-style).** 1024×768 is the
fixed *logical* space; the on-screen canvas is scaled to fit the viewport at a locked
4:3. `main.js` `fitCanvas()` sizes the canvas to the largest 4:3 box that fits its
`#stage`, makes the backing store DPR-aware, and sets `ctx.setTransform(w/1024, 0, 0,
h/768, …)` — so every module keeps drawing in 1024×768 units and `render.js` / the
coordinate math are untouched (only the on-screen size changes). `index.html` is a
viewport-height CSS grid: the settings panel is a **right-side pane** on wide viewports
(≥1024px — the 4:3 canvas then uses the full height; PLAY MODE stacked vertically) and
a **stacked bottom panel** on narrow/portrait. Same mechanism as `asteroids_clone`
(`main.js` `applyCanvasSize`/`syncBackingStore`), minus its size-preset buttons.

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

# serve from the repo root, then:
#   /lunar_lander/                        THE GAME (index.html boots main.js)
#   /lunar_lander/demos/                  the vector-ROM decode demos (demos/index.html hub), incl.:
#     vector_rom.html (font) · lander.html (9 poses) · gallery.html (ROM survey) · hud.html ($5458
#     labels) · rotation.html (360°) · thrust.html (flame) · starfield.html (034598 close-up) ·
#     screen.html + scroll_view.html (MAME-matched layout) · physics.html (flight) ·
#     explosion.html (BOOM) · landscape.html (LNMIN/MINTBL terrain)
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
| `$5244-$53E6` | **Starfield** — 24 subroutines, **61 bright points, zero lines** (every "stroke" is a zero-length VEC = a single dot), brightness `5-9` (star magnitudes). The **JSRL index tables `MJSTRA` (`$52FE`) / `MJSTRB` (`$530E`) / `MINSTR` (`$53EE`)** (anchored off `LNMIN`=`$51BA`) select + order these clusters into the major-lower / major-top / minor fields — assembled by `STARS` (:1121) with `STRINIT` LABS origins. So the layout **is** in ROM (see `starfield.js` / `build_discovery.py` `STARTABLES`); an earlier note that "no routine assembles them" was wrong. |
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
cluster is `5X 5X 2X 2X` left-to-right. NOTE: `multiplier = 1 + 64/width` was a
coincidental fit to these four pads — it is **NOT** the real mechanism. The ROM
assigns the multiplier by **site index** via the fixed table `TBSTFT =
2,2,2,2,3,3,4,4,4,4,5,5,5,5,5` (15 sites; `research_physics.md` §11 `:1921`), not
from width. Scoring (built step 7) uses `TBSTFT[site]` — a per-SITE table, NOT the width formula:

| pad | rom x (center) | y_up | label |
|---|---|---|---|
| left peak-flank ledge  | ≈ 390 | ≈ 233 | **5X** (narrow, high on the slope) |
| right peak-flank ledge | ≈ 560 | ≈ 179 | **5X** |
| central valley floor   | ≈ 666 | ≈ 43  | **2X** (wide) |
| right valley floor     | ≈ 848 | ≈ 47  | **2X** |

Observed here, wide valley floors read 2X and narrow peak-flank ledges read 5X — but
that width↔multiplier correlation is incidental to these pads, not the rule (the rule is
the `TBSTFT` per-site table above). Note: **not every flat is a scoring pad** — the wide
flat at the bottom of the left-center valley (rom ~266–290) carries no label, so pads are
specifically designated in the terrain data, not "any flat spot."

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

## Gameplay module layout

The gameplay is **ES6 modules split by subsystem** — Seb Lee-Delisle's
`Lander.js`/`game.js`/… shape, and the repo's own modular exemplar `mario_physics/` — NOT
one big file. This mirrors the original's own decomposition (`A34573.1A` links `LUNAR`/
`LUNVCT`/`LUNCON`/`LUNINT` plus the separate vector-ROM source), so modular files and
faithful **routine-level translation** reinforce each other: each module holds the ported
routines with their `A34573.1A:nnnn` citations.

**Module style:** stateful subsystems are **ES6 classes** (`export class`, plain `this.`
fields — matching `mario_physics/`, e.g. `camera.js`): `Landscape`, `Lander`, the physics
steppers, `Starfield`, `Input`, the state machine. `render.js` stays **stateless functions**
(it's the drawing utility over a passed `ctx`, not a subsystem); `state.js` is a **shared
data object** (the zero-page bag). No `#private` fields (mario_physics doesn't use them).

**Naming style (decided 2026-07-02): readable names over source mnemonics.** The terse
1970s abbreviations (`COLFLG`, `SHPINE`, …) stay in the SOURCE and in citations only —
runtime code uses descriptive names, with the source label kept in a comment at the
declaration (e.g. `collisionStatus, // the source's COLFLG (:243)`). Enumerated source
values become a named enum whose values KEEP the source's own bytes, so bit-level source
logic still ports 1:1 (e.g. `CollisionStatus.GOOD_LAND = 0x80`, state.js). The runtime
modules are fully renamed (2026-07-02); the demos keep their original mnemonic copies.
The applied map (source label → runtime name — research docs & source cite the LEFT
column, code uses the RIGHT):

| source | runtime | source | runtime |
|---|---|---|---|
| `COLFLG` | `collisionStatus` + `CollisionStatus` enum | `M.CLFL` | `outcomeStatus` |
| `GAMODE` | `gameMode` + `GameMode` enum | `PLYMOD` | `difficulty` |
| `SHIP` | `shipRotation` | `SHPINE` | `angularVelocity` |
| `THRUST` | `thrustLevel` | `VELX`/`VELY` | `velX`/`velY` |
| `SCROLL`/`SCRADD` | `scrollX`/`scrollY` | `LUNARNUM` V-bit | boolean `zoomedOut` |
| `INDEX` | `sequenceStep` | `FUEL`/`SCORE` | `fuel`/`score` |
| `GMTIME`/`TIMVAL` | `clockMinutes`+`clockSeconds`/`nmiCountdown` | RNDOM picks | `messagePick`/`explosionPattern` |
| `SHPUPL/LWL/LWR/UPR` | `CORNER_UPPER_LEFT`/`_LOWER_LEFT`/`_LOWER_RIGHT`/`_UPPER_RIGHT` | `DISTYL/DISTYR`+`SCPDST` | `clearanceLeft`/`clearanceRight`+`clearance` |
| `TRSTAB` | `THRUST_TABLE` | `FUELFAC`/`FLFAC2` | `BURN_FACTOR`/`BURN_FACTOR_PRIME` |
| `M.HRDY`/`M.HRDG` | `BOUNCE_VELOCITY`/`BOUNCE_GRAVITY` | `LNMIN`/`MINTBL` tables | `SECTION_ORDER`/`SECTION_BASELINES` |
| `MINSTX`/`MINSTY`/`RMJRX` | `ZOOM_IN_SHIP_X`/`ZOOM_IN_SHIP_Y`/`ZOOM_OUT_SHIP_X` | | |

**`index.html` = the game (promoted on release).** The project root **`index.html` boots
`main.js`** — the folder root plays the game, like the sibling clones (and so the built-in
preview at the folder root plays it). The vector-ROM decode **demo hub moved to
`demos/index.html`** (cross-linked with the game; each is one click from the other). During the
build this was inverted (`index.html` = the demo hub, the game booted from a temporary
`play.html`); the release promotion swapped them (`play.html → index.html`, old hub →
`demos/index.html`). The repo-root index at `:8080/` still lists everything.

The demos are the **validated building blocks** to extract from (repo convention: demos
validate techniques later reused in the games). `demos/physics.html` is already a
single-file proto-gameplay (physics + starfield + HUD + lander + flame + input + loop).

| Module | Role | Ports (source) | Leverage (demo) |
|---|---|---|---|
| `main.js` | boot, canvas, fixed-timestep loop, per-frame order | main loop `:409-485`, `LUNINT` | physics.js |
| `lander.js` | flight + craft: `ACCEL`, `THRLVL`/`FRCMLT`, `ROTSHP`(+inertia), `BURN`, `MODULE` pose+flame | `LUNAR`+`LUNVEC` | thrust.js + physics.js |
| `landscape.js` | **terrain authority**: assembly + scroll + zoom + terrain **queries** (`heightAt` + the bonus-site `siteAt`): `SCAPE`, `LNMIN`/`MINTBL`, `SCROLL`/`SCRADD`, `SCAPCHG`/`SCAPMJR`/`SCRLUP`. Terrain facts only — **no land/crash verdict**. | `LUNMIN` + scape | screen.js + scroll_view.js |
| `collision.js` | **land/crash verdict**: the per-rotation corner tables (`SHPUPL`… `:3592`) probed through `landscape.heightAt` → `DISTY*`/`SCPDST` clearances + the `SCAPLND` integer gate → `COLFLG` (good/hard/crash). Outcomes (bounce/`BOOM`/messages) run in main.js's `MOTCHK` sequence; `boom.js` holds the explosion data. | `DECODE`/`SCPDST`/`SCAPLND` | explosion.js |
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
- **`state.js`** — the shared zero-page values (`shipRotation`, `velX/velY`, `fuel`,
  `scrollX/scrollY`, `zoomedOut`, … — see the "Naming style" map above) + the `camera`,
  at the source's boot defaults.

**Not lift-and-drop — extract + consolidate + upgrade:**
- demos duplicate code (attitude/flame in `thrust.js` AND `physics.js`; HUD in `screen.js`
  AND `physics.js`) → consolidate into one module each;
- demo simplifications → faithful (terrain address-order → real `LNMIN`/`MINTBL` sequence;
  keep keyboard throttle / generated starfield by choice — see the demo labels);
- viewer demos (`lander.js`, `starfield.js`, `gallery.js`, `hud.js`, `vector_rom.js`) —
  reuse their extraction/decode logic, not the viewer shell.

**Net-new (built without a demo ancestor):** the **landscape → collision** chain —
`landscape.heightAt` terrain queries feeding `collision.js`'s `DECODE`/`SCAPLND` verdict —
the zoom transition, and the **bonus-site scoring** (`landscape.siteAt` + the derived 15-site
`TBSTFT` pool feeding `beginOutcome`), all in the runtime (`docs/research_physics.md`
§9.1 + §11 + §11.3).

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
- the difficulty is chosen via an on-page control that sets `state.difficulty` (the
  source's `PLYMOD`), **not** the
  SELECT-button cycle (`TYPE`/`TYPESW` `:687`) — so `input.js` skips the button debounce.
- the current mode is shown **on-screen**; the cabinet used a physical lamp (`MODLMP`),
  not the HUD.

(The operator **fuel-per-coin** DIP, `research_physics.md` §7.2, is the natural other
entry in that HTML settings area — fuel budget, kept visually separate from control feel.)

### Gameplay runtime — build order & status

Built one sub-step at a time, each browser-verified (repo "sub-step + save-point" pattern).
The root `index.html` boots `main.js`; served by the `lunar_lander` launch config (port 8085) at
`/`. Clock: `TICK = 6/250` s (24 ms) — one source frame; float arithmetic except
the collision/landing kernel (`research_physics.md` §13). (During the build the boot page was a
temporary `play.html`; the release promotion renamed it to `index.html` — see "index.html migration".)

- **[done] Step 0 — seams + skeleton:** `state.js`, `render.js`, `main.js`, the boot page (`play.html`
  during the build, now the root `index.html`). Draws one lander pose to prove `main → render → dvg → *_rom_data` end-to-end.
- **[done] Step 1 — `landscape.js`:** the terrain authority — `LNMIN`/`MINTBL` surface
  (`faithful ✓`) rendered scale-agnostically via the camera (scroll + 3-copy wrap, major ¼)
  with `drawSegmentsWorld` in render.js; built query-ready (segment list + per-section
  x-ranges) for the later `heightAt` (step 5) / `siteAt` (step 7) queries. IDLE shows the major scape behind the start screen.
- **[done] Step 2 — flight (`input.js` + `physics_arcade.js` + `lander.js`):** the full
  IDLE⇄PLAY loop. `Input` (only DOM reader) → normalized intent + `startPressed`/`resetPressed`
  + `settings`; `state.newGame`/`toIdle` lifecycle transitions (+ SPACE-start / Reset button);
  `ArcadePhysics.step` (sole motion owner): ROTSHP, THRLVL/FRCMLT (float trig), ACCEL, FRICTN,
  BURN, the **PLYMOD 0-3 profiles** (gravity/friction/thrust×1.5/inertia, research_physics.md §7);
  `Lander` delegates motion + renders the pose (SHIP→9-pose+flip fold, **little bank in PLAY /
  big in IDLE**) + throttle flame. Motion via the §9 **screen dead-zone-window** model — the
  lander draws at its live `posX`/`posY` (NOT centred); only the horizontal excess past
  `[128,896]` DVG units at a window edge scrolls `SCROLL` (vertical dead-zone deferred to the
  zoom step). Source-faithful start (§14; `SHIP 8 = upright`, and the play-start `SHIP 16` enters the ship
  **on its side** heading right, as MAME shows); **rotation is Training-only clamp** `[0,16]`
  (faithful, `ROT.NI :868`) — Cadet/Prime/Command wrap the full circle 0-31, the pose fold
  rendering the upside-down half via yFlip. **Deviations (labeled):** keyboard throttle is a
  spring-loaded ramp — hold `↑` to step THRUST up to 15, release to step it back down to 0 from
  wherever it sits (the cabinet's pot has no software ramp at all, `THRLVL` just reads its
  position, `:897` — a key has no position to read, so this is our stand-in); `THRUST_RAMP_TICKS`
  is provisional ramp feel; no collision yet (the craft sinks through terrain until step 6). `SHIP`
  is float (finer angle; pose fold snaps). (Fuel BURN rate is now FAITHFUL — see step 3.)
- **[done] Step 3 — `display_info.js` (HUD):** the `$5458` label grid + the CPU-drawn VALUES —
  a routine-level translation of `DISPLY` (:3258, compute the decimals) + `MESDATA` (:1453, draw).
  `DisplayInfo.render(state, camera, landscape)` (read-only; draws via new `render.js` helpers
  `drawGlyphString` + `drawArrowGlyph`, keeping all canvas drawing in the render seam). Faithful
  scaling: SCORE 4-digit leading-zeros; TIME `MM:SS` from a new **game clock** (`state.tickClock`,
  the NMI second-counter `A34573.1D:360` — `TIMVAL -= FRMECNT` per tick, PLAY only); FUEL 4-digit
  integer part; ALTITUDE/H-SPEED/V-SPEED zero-suppressed; **speed = `|VEL| >> 6`** (DISPLY :3264);
  **arrows** →/←/↑/↓ from velocity sign, hidden at 0 (DISPLY :3276). Layout = the MAME-measured grid
  (screen.js). **Deviations (labeled):** velocity is sign-magnitude in source (VELX + SGNVLX, ACCEL
  :1959) — we take `abs()`+sign from our signed floats; BCD→plain-int formatting; **ALTITUDE =
  the real `SCPDST`** since step 5 (collision.js's min lower-corner clearance in minor / bare-point
  probe in major, passed in by main.js; reads 0 during the outcome — ALTITD cleared, `:562`).
  Also landed here: the **faithful fuel `BURN`** (:1794) — `floor(burnFac·TRSTAB[THRUST]/256)/100`
  units/frame (burnFac 218, or 144 Prime), = 0.23/frame (~9.6/s) full, 0.14/frame (~5.8/s) hover;
  this replaced a provisional rate that drained ~4× too fast. `ROT.GAS` = 0.06 unit/rotating-frame
  (:882; ~per-frame under our float rotation, a small deviation).
- **[done] Step 4 — the zoom-in (minor) scape + major↔minor transition:** the near view + the
  faithful snap (research_physics.md §9/§9.1). `landscape.js` owns it — `frameCamera` (scale
  0.25 major / 1.0 minor, camera from SCROLL/SCRADD per scape) + `updateZoom` (the SCAPMJR/SCRLUP
  analog): **trigger = the real `SCPDST`** (collision.js's measured clearance, passed in by
  main.js since step 5), **IN alt < 384 / OUT alt ≥ 520** (+ascending +high-in-window) — the
  faithful hysteresis band mapped to world units. **Snap** (no tween): flip `LUNARNUM`, reset ship to MINSTX/MINSTY (512/632)
  or RMJRX (512), set scroll for **coordinate continuity** (world-point-preserving; a labeled
  simplification of the exact `SUMSA`/`SUMSUM`). `physics_arcade.js` adds the **×4 minor position
  step** + the **minor vertical dead-zone** (`[256,660]` → `SCRADD`; the ground rises as you
  descend). **Minimal off-top-of-major reset** `state.resetFlight(20)` (deduct fuel, reseed; keeps
  score/clock). Minor lander = the big bank at **`PXU.in 1.0`** (native): the source draws lander +
  terrain into one VG list at one scale, so each bank renders at its authored size — near bank 27u
  vs the 256u minor section (~0.11), the ~1.8× far→near change is just the bank swap, NOT a 4× zoom.
  **MAME-validated** against `llander` snap `0006.png` (lander ≈27.5u = 43px ÷ 1.5625; peak-summit
  landing reproduced 1:1). Live-verified: zoom in/out snap, dead-zone scroll both ways, off-top
  reset, no altitude jump across the snap.
  - **Resolved in step 7 (positions later corrected 2026-07-02):** the pad multiplier is
    **`TBSTFT[site]`** (`2,2,2,2,3,3,4,4,4,4,5,5,5,5,5`, research_physics.md §11.3), a per-SITE table
    — NOT the `1+64/width` guess in screen.js. The 15 site POSITIONS are the ROM's real ones —
    `TBLABS`=$4E06 (034599), `world_x = major_x/majorScale` lands all 15 on terrain flats and
    reproduces the MAME `5X 5X 2X 2X` cluster byte-for-byte (see the step-7 entry — this replaced an
    earlier width-ranked derivation once the "TBMNA is VG-RAM" belief proved wrong).
- **[done] Step 5 — collision + landing (`collision.js` + `boom.js` + outcomes):** the
  land/crash chain (research_physics.md §11/§11.1/§11.2). `collision.js` = the per-rotation
  corner tables (`SHPUPL`/`SHPLWL`/`SHPLWR`/`SHPUPR` `:3592-3722`, verbatim; minor view only,
  major = bare-point probe per `CNVRT :2442`) probed through `landscape.heightAt` →
  `DISTYL`/`DISTYR`/`SCPDST` clearances + penetration → the `SCAPLND` verdict (INTEGER kernel:
  both lower corners < 2, `SHIP ∈ {7,8,9}`, `|VELY|`hi <4/<8, `|VELX|`hi <4 → `COLFLG`
  80/C0/8F). The measured `SCPDST` replaced BOTH proxies (HUD ALTITUDE + the zoom trigger —
  `landscape.updateZoom(state, cam, alt)` now takes it; `landscape.altitudeAt` removed).
  Outcomes = main.js's `MOTCHK` sequence (`INDEX` every other tick to 127): good settles,
  hard runs the `M.HRDY`/`M.HRDG` bounce to re-contact, crash draws `boom.js` (the BOOM port
  from demos/explosion.js) at the impact point; the source status messages + "NN POINTS"
  render in the ROM glyph set (display_info `renderOutcome`); then fuel left → re-drop
  (score + fuel kept; step 6 resets the clock + fuel par/used per drop), dry → attract.
  **Deviations (labeled, §11.2):** both corner pairs every
  tick (source alternates L/R per frame); X-axis distance pass subsumed by 4-corner vertical
  probes (heightfield, no overhangs); **scoring STUB = base 50/15/5 × factor 1** (the LNDADR
  non-designated-site default — real `TBSTFT[site]` + flats→sites mapping land with the scoring
  step 7; `DEDUCT` crash fuel-loss now landed in step 6); message placement approximate-centred at 2×; octagon crash-drift
  (`DELTA`) not ported; bounce seed applied only on hard. Verified live: good (+50, BNFUEL
  +50), hard (C0 bounce rise→settle), tilted crash (8F + debris + "THERE WERE NO SURVIVORS"),
  out-of-fuel → attract; each verdict scores exactly once. Dev hook: `window.LL` exposes
  state/camera/landscape/collision for console/eval verification.
- **[done] Step 6 — out of fuel (`FLMIN`/`FLUSE` par + `DEDUCT` + `STATUS` messages):** the fuel
  end-game (research_physics.md §7.4). `state.fuelPar` (FLMIN) grows `FLFACT` 8 per game-second in
  `tickClock` (`A34573.1D:366`); `state.fuelUsed` (FLUSE) accumulates every thrust/rotation burn in
  the stepper (GAS `:972`). On a CRASH (`COLFLG & 0F ≠ 0`) `deductFuel` (DEDUCT `:1816`) destroys the
  hoarded reserve `fuelPar − fuelUsed` — capped at 99 and at the fuel present — into `state.fuelLost`
  (FLDED) + a 127-frame message timer (MSCNT1); good/hard landings deduct nothing (`:1817`). It is an
  **anti-hoarding penalty** (fly under the 8/sec par then crash → lose the reserve), not a flat cost.
  `display_info` draws the three `STATUS` fuel messages (`:1605`) during PLAY: `LOW ON FUEL` (< 100,
  blinking on FRAME&10), `OUT OF FUEL` (empty), `NN FUEL UNITS LOST` (post-crash, while the timer
  counts). Added a free-running per-tick `state.frame` (source INC FRAME `:443`) for the blink.
  **Faithful side-effect:** `seedFlight` (= PLYINIT `:640`) now clears the mission clock + fuel
  par/used every drop, so the off-top reset and the post-outcome re-drop reset the clock too
  (required — the par must restart per drop). Live-verified: par/used growth (fuel + used = start),
  the exact 50-unit DEDUCT on a forced crash, all three messages in the ROM font.
- **[done] Step 7 — scoring (`TBSTFT` per-site + `TABSIT` pick + `SITES` flash):** the real bonus
  scoring (research_physics.md §11.3). The 15 bonus SITES are the ROM's **real positions** —
  `TBLABS`=$4E06 (034599), decoded to `BONUS_SITE_X` (build_discovery.py); `landscape` places each at
  `world_x = major_x/majorScale` (×4), which lands **all 15 on terrain flats** (the flat = the landing
  zone), with the multiplier `TBSTFT[index]` (four 2X, two 3X, four 4X, five 5X). *(Faithful rewrite
  2026-07-02: the site positions turned out to be plain ROM, not "runtime VG-RAM" — same wrong claim
  as the starfield; this replaced an earlier width-ranked DERIVATION that could bunch two pads together.
  The ROM positions reproduce the MAME `5X 5X 2X 2X` cluster byte-for-byte.)* + `siteAt(worldX)` (the
  `LNDADR` X-match, `:1863`). `state.pickBonusSites` picks 4 per drop **faithfully** (`TABSIT`, `PLYINIT
  :609`): `INTCNT`-seeded (our `state.frame`) — `TABSIT[0]=INTCNT&3`, `[1]=(+1)&3` (two ADJACENT low
  2X pads), `[2]=BNSITE((INTCNT>>2)&F)`, `[3]=BNSITE([2]^0F)` (two COMPLEMENTARY high 3X-5X pads) —
  reproducing MAME 0001's `TABSIT=[0,1,13,11]` exactly (was a "2 random-distinct per band" deviation).
  `beginOutcome` scores base 50/15/5 × the active-site `TBSTFT` factor (`POINTS
  :3311`; factor 1 off an active site, `:1898`; applies to crashes too) — main.js computes the
  factor from `siteAt` + `activeSites` at the landing X. `display_info.renderSites` flashes the 4
  active pads during PLAY (`SITES :1511`, blink on `FRAME&10` — source phase, shown when the bit is
  SET): the **landing-zone BAR** (`TBMNV`/`TBVCTR` :1533 — a bright line the width of the valid zone,
  `TSTLNG` = 256/128/64/32 by the `MNVAL` class, so wide = the easy 2X pads, a 32 stub = the 5X ledges)
  + the `NX` label centred on it, hanging just below; wrapped like the terrain. The zone `[site_X,
  site_X+TSTLNG]` also feeds `siteAt`, so the bar shows the exact scoring zone. *(The bar colour is a
  labeled embellishment — the DVG is monochrome; `ZONE_BAR_COLOR` in display_info.js, amber by default.)*
  Verified: the 15-site pool distribution, the `TABSIT` pick, good-on-2X = 100, good off-site = 50,
  crash off-site = 5, the bar + `NX` flash on all 4 active pads (MAME-matched positions + widths).
- **[done] Step 8 — polish (`starfield.js` + feel-tuning):** the `STARS` backdrop (research_physics.md
  §10). `starfield.js` (`class Starfield`) is a **faithful** port of `STARS` (:1121): the three ROM JSRL
  index tables `MJSTRA`/`MJSTRB`/`MINSTR` (`build_discovery.py` → `STARTABLES`) select + order the
  `$5244-$53E6` cluster subroutines, and `STRINIT` (:1152) sets each field's LABS origin; chaining the
  clusters (globalScale 0) from the origin lays the field, so positions + magnitudes come straight from
  ROM. It scrolls horizontally 1:1 with the world (`camera.x·scale`), drawn behind the terrain in every
  mode (main.js `render`, before `landscape.render` — STARS-before-SCAPE order :389-391). The far/near
  field pick mirrors `LUNARNUM` major/minor. **MAME-matched** (snap/llander 0000-0003): major-lower
  (`MJSTRA`, LABS(0,256)) = **15 dots over a 1024 tile spanning the FULL height y 192-768** (repeats per
  screen — the ROM lists the 4 clusters twice as a scroll buffer); stars translate 1:1 with the terrain.
  The `MJSTRB` top field (LABS(0,768)) sits above the visible 0-767 window (never rendered — attract vs
  play snapshots show the same stars). **One labeled simplification:** the minor (zoom-in) field
  (`MINSTR`) is chained from LABS(0,256) instead of the exact `MINSVG`/`SCRLDO` per-section LABS (:1138) —
  only ~a handful land in the close-up window either way (snap 0006 ≈ 4). *(This step originally shipped a
  DERIVATION — all 24 subs at even X in a top band — under the wrong belief that the cluster LAYOUT lived
  in VG-RAM; the tables are in fact plain ROM off `LNMIN`=$51BA, and the field was re-decoded faithfully
  2026-07-02 after a density mismatch vs MAME surfaced it. The bonus-site `TBLABS`/`TBMNA` positions —
  step 7 — turned out to be the SAME wrong "VG-RAM" claim, also corrected 2026-07-02.)* **Feel-tuning = no-op:** the provisional `THRUST_RAMP_TICKS` (2) + lander scales
  were validated by playtest (LGTM), not changed. (The `DOGAME`/`GAMODE` attract-machine pieces are
  N/A — the HTML panel replaces coin/SELECT — and the mission cycle finish/re-drop is already built.)

`state.js` holds the shared zero-page values (the seam) plus the lifecycle + scoring
(`newGame`/`beginOutcome`/`deductFuel`/`pickBonusSites` — the module table's `state.js`
role); the full `GAMODE` attract-machine is largely N/A (the HTML panel replaces coin/SELECT).

## Settled decode questions — don't re-investigate

Finding the original program source answered the ROM-decode stage's open questions:

- **Terrain sequence** — it's the `LNMIN` section order + `MINTBL` LABS (16 sections of
  segments `SEG001-024`), not address order (`docs/research_vector_usage.md` §3). The
  MAME-frame-stitch approach is moot.
- **Difficulty / level variation** — `PLYMOD` (0–3) changes gravity / friction /
  1.5× thrust / rotational inertia, plus the operator fuel-per-coin DIP
  (`docs/research_physics.md` §7) — **physics ONLY**. The terrain is one **fixed** surface,
  unaffected by difficulty, and there is **no "level"** (`SCAPE` uses fixed `LNMIN`/`MINTBL`;
  `LUNARNUM` is the near/far zoom state, not a terrain index). See `research_vector_usage.md` §3.
- **`034597-01.m3`** — a **FOREIGN-VERSION-ONLY** vector ROM, not "unclear" (see the region map).
- **"Flag"** — was the thrust flame; it's the programmatic `FLAME` routine (see "Thrust flame").

## Deferred (by choice)

Deliberate omissions, not bugs — small polish / completeness items put aside because the port already
meets its educational goal (arcade-*faithful*, not a mechanically-complete reproduction). Listed here
once, so a future session doesn't rediscover them as defects. Local sections still note each in
context (the step entries + "Flight-model architecture"); this is the canonical list.

- **Octagon crash-drift (`DELTA`).** On a crash, the `BOOM` cabin octagon + debris should inherit the
  lander's residual velocity at impact (`DELX`/`DELY` from `VELX`/`VELY`, `A34573.1A:3488`/`:3353`),
  so the whole field coasts with the crash momentum; ours detonates in place at the impact point. To
  port: capture the impact velocity before `beginOutcome` zeroes it (`:561-571`), then offset the
  `boom.js` draw by `drift · sequenceStep`. Detail in `docs/research_explosion.md` + the step-5 entry.
- **Off-top-of-major reset penalty.** The off-top reset (`landscape.updateZoom` → `state.resetFlight`)
  charges a flat fuel penalty instead of the faithful `DEDCTA` `FLMIN − FLUSE` accounting
  (`docs/research_physics.md` §7.4 / §9.1).
- **Seb-style physics model.** A second, tuned-float flight model (`physics_seb`) behind the existing
  `step(state, input)` seam — a drop-in if ever wanted (see "Flight-model architecture — stepper +
  profiles").

Broader arcade-completeness (the full `GAMODE` attract machine, coin/`SELECT` switches, 2-player, the
attract-mode auto-demo, and sound) is **out of scope** for the educational port — the HTML settings
panel replaces coin/`SELECT`, and the rest isn't needed to demonstrate the ported mechanics.
