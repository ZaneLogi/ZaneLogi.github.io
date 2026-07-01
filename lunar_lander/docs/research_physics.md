# research_physics.md — lunar_lander

Lander physics, motion, and starfield, decoded from the **original Atari source**
(Rich Moore, 1978). Source-of-truth: `historicalsource/lunar-lander`, main module
`A34573.1A` (local clone `D:\tmp\lunar_lander_source\`). Citations are line numbers in
that file. `.RADIX 16` — bare numbers are hex; a trailing `.` means decimal.

This is the foundation for the physics demo (`demos/physics.html`, built) and the
eventual runtime port. It is a **routine-level translation** target — the source is in
hand, so the physics is faithful, not measured/reconstructed.

## 1. Per-frame motion sequence

The main loop runs once per display frame (`INTWAIT` waits end-of-frame, `:1060`). In
PLAY mode each frame does, in order (`:409-485`):

```
FLAME    ; draw exhaust from LAST frame's thrust vector  (:409)
FRICTN   ; (easy mode only, every 16 frames) velocity drag  (:418)
THRLVL   ; read analog throttle pot -> THRUST (0-F)  (:454)
FRCMLT   ; resolve THRUST into XTHRUST/YTHRUST via ship rotation  (:458)
ROTSHP   ; apply rotate-L/R switches -> SHIP rotation  (:459)
BURN     ; subtract fuel = thrust level x fuel factor  (:460)
DISPLY   ; compute HUD values (altitude, speeds, fuel, score)  (:461)
ACCEL    ; integrate: velocity += accel; position += velocity  (:483)
DECODE   ; ship world-position -> scape distance  (:484)
SCAPCHG  ; update lunarscape scroll  (:485)
```
Timing: NMI = 4 ms (`SECCNT=250.` NMIs/sec, `:59`); `FRMECNT=6` → a frame is ~24 ms
(`:56`). So the physics tick is ~24 ms (~41.7 Hz), **not** 60 Hz.

## 2. State & fixed-point format

Zero-page (`:172-272`):
- `THRUST` (1 byte) — current throttle level 0–F ("ROCKET THRUST X.05", `:174`).
- `SHIP` (1 byte) — rotation 0–31 (**32 steps = 11.25°/step**, full circle) `:175`.
- `XTHRUST`/`YTHRUST` (1 byte each) — thrust acceleration components `:239-240`.
- `VELX` / `VELY` — **16-bit fixed-point velocity per axis** (`VELX:.BLKB 4`, `VELY=VELX+2`,
  `:247-248`); `+1` byte = integer, `+0` = fraction. Signs held separately in
  `SGNVLX`/`SGNVLY` (D7), `:241-242`.
- `XCURADJ`/`YCURADJ` — ship world position, 16-bit fixed-point each `:178-179`.
- `GRAVITY` (1 byte) — current gravity accel `:250`.
- `SCROLL` (horizontal, fractional) / `SCRADD` (vertical) / `MJRFLG` (scroll flag) —
  the scape/star scroll state `:234-236`.
- `FUEL` — 3-byte **BCD** (subtracted in decimal mode, `GAS`/`GASA` `:942`).

## 3. Constants (`:47-59`)

| Const | Value | Meaning |
|---|---|---|
| `GRAVT` | `.BYTE 11,11,22,11` (`:681`) | gravity per game type (see §7) |
| `FUELFAC` | `0DA` | fuel-use factor (× thrust level) |
| `FLFAC2` | `90` | fuel-use factor for game type 2 (Prime) |
| `FLMFRC` | `74` | flame fraction (see [[the flame in CLAUDE.md]]) |
| `M.HRDY` | `10.` | hard-landing Y-velocity threshold (bounce) |
| `M.HRDG` | `65.` | hard-landing gravity (set into `GRAVITY` to slam the craft down, `:579`) |
| `BNFUEL` | `50` | bonus fuel on a good landing |
| `FLFACT` | `8` | 8 fuel units/sec |
| `FRMECNT` | `6` | frame = 6 NMIs = 24 ms |
| `SECCNT` | `250.` | NMIs per second (NMI = 4 ms) |

`COLFLG` (`:243`): `80` = good landing, `C0` = hard landing, `8F` = crash.

## 4. The integration — `ACCEL` (`:1940-2015`)

Runs twice: Y axis first (`X=2`), then X axis (`X=0`). Per axis:

1. **Position** (skipped while a scape scroll is in progress, `MJRFLG` bit, `:1946`):
   `position += velocity`. In the **minor (close) scape** the velocity is ×4 before the
   position step (`ASL/ROL` twice, `:1953-1958`) — the zoomed-in world moves 4× faster.
2. **Gravity** — applied to **Y only** (X gravity = 0, `:1972-1974`); always *subtracted*
   (`SSORSGN=80`): `VELY -= GRAVITY`.
3. **Thrust** — `VEL += XTHRUST/YTHRUST` (`:1989-2003`). Game type 2 (Prime) multiplies
   thrust by 1.5 first (`:1996-2002`).

So the model is:
```
VELY += YTHRUST - GRAVITY     ; gravity pulls down, only on Y
VELX += XTHRUST
position += velocity           ; (x4 in the close view)
```
Gravity is a constant downward accel; there is **no global drag** (except easy-mode
friction, §6). Velocity is otherwise conserved — true inertial coasting.

## 5. Thrust pipeline

- **`THRLVL`** (`:897-940`) — reads the analog throttle pot (`POTVAL` in `PTRNGE`,
  auto-calibrating `POTMIN`/`POTUSE`). Below a dead-zone window (¼ range) `THRUST=0`;
  above, `THRUST` = pot fraction ÷16 → **0–15**. No credit ⇒ no thrust.
- **`FRCMLT`** (`:1758-1790`) — turns `THRUST` into a vector by ship rotation:
  `THRSTLV = TRSTAB[THRUST]` (level→magnitude), then `XTHRUST = SINES[xoff]·THRSTLV`,
  `YTHRUST = SINES[yoff]·THRSTLV`, with quadrant signs from `SIGNS[SHIP>>3]`. A single
  `SINES` table + an offset/reflection trick gives both sin and cos. **Thrust points
  along the ship's "up" axis**, so it rotates with the lander (the same scheme our
  thrust demo models geometrically).
- **`BURN`** (`:1794-1808`) — `fuel -= THRSTLV · FUELFAC` (FLFAC2 for Prime), BCD.

## 6. Friction — easy mode only (`FRICTN`, `:1036-1056`)

In **game type 0 (easy)** only, every 16 frames (`:414-418`): `VEL -= VEL/32` on both
axes (`LSR` ×5 = ÷32). A gentle ~3% bleed. The arcade's only "drag" — and it's
conditional. (Seb's global `drag=0.9997` is his own choice, not faithful.)

## 7. Difficulty — two independent levers

Difficulty is set on **two axes**: the *player* picks the flight model, the *operator*
picks the fuel budget.

### 7.1 Player game type (`PLYMOD` 0–3)

Cycled live by the **GAME-SELECT button** (`TYPESW=$2404`). `TYPE` (`:687-714`) debounces
the press, increments `PLYMOD` mod 4, then loads `GRAVITY = GRAVT[PLYMOD]` and lights the
mode lamp `MODLMP[PLYMOD]` (`.BYTE 8,4,2,1`, `:716`). Game starts at `PLYMOD = 0` (`:350`,
"easy"). The four types (manual: Training/Cadet/Prime/Command) differ by code gated on
`PLYMOD`:

| `PLYMOD` | Name | Gravity (`GRAVT`) | Distinctive |
|---|---|---|---|
| 0 | Training | `11` (17) | **friction** (§6); **rotation auto-clamped** (below) |
| 1 | Cadet | `11` (17) | plain — pure inertia, no clamp |
| 2 | Prime | `22` (34, 2×) | thrust ×1.5 (`:1996`); lower burn factor `FLFAC2=90` vs `DA` (`:1800`) |
| 3 | Command | `11` (17) | **rotational inertia** (§8) — `SHPINE` momentum |

**Training rotation clamp** (`ROT.NI :868-881`): only when `PLYMOD == 0`, rotation is held
to the safe hemisphere (`ROT+1` in `0..$40`), snapping at the extremes (max-left = `$10`),
so a beginner can't over-rotate. Harder modes skip it (`BNE ROT.GAS :870`).

Escalation: Cadet removes Training's safety net (friction + clamp); Prime doubles gravity
(thrust boosted 1.5× to partly compensate); Command attacks the *controls* themselves
(rotational momentum → easy to overshoot).

### 7.2 Operator fuel-per-coin (DIP)

Separate from game type and physics-neutral: the coin-mode DIP (`OPT0=$2800`, 2 bits)
indexes `CRDTBL` (`:763`) = **450 / 600 / 750 / 900** fuel units per coin (free play = 900).
`CREDIT` adds that to `FUEL` on coin-in (`:738-758`). More fuel = longer, easier play.

### 7.3 Fuel economy (the shared pressure)

Fuel is the real clock:
- **Thrust** burns `THRSTLV × FUELFAC` per frame (`BURN`; Prime uses `FLFAC2`).
- **Rotation also burns fuel** — `ROT.GAS` (`:882`): "one ship rotation costs ¼ fuel
  unit," so Command's inertia makes it easy to waste fuel spinning.
- **Good landing** refunds `BNFUEL = 50` (`:556`); a **crash** deducts a random chunk (`DEDUCT`).

## 8. Rotation — `ROTSHP` (`:773-`)

`SHIP` (0–31) is the rotation. Rotate-L/R switches change it (`ROTCHK`). In
**Command mode (PLYMOD 3)** rotation carries **inertia**: a `SHPINE` angular-velocity
accumulator is integrated into `ROT`, with min/max clamps — the craft keeps spinning
after you let go. Other modes rotate directly (`ROT.NI`). Gameplay limits attitude to
the upper half-circle (head left→up→right; see CLAUDE.md "Gameplay rotation range").

## 9. Motion display — velocity → scroll (lander stays centred)

The craft is **not pinned to screen-centre** — it moves within a **screen dead-zone window**,
and the world scrolls only at the window edges. Four coordinate frames are in play; keeping
them straight is the whole trick:

| Frame | Vars | Units | Start |
|---|---|---|---|
| adjusted / MODULE | `XCURADJ`/`YCURADJ` (`:178`) | logical `× $40` (×64) fixed-point | `INTXCUR/INTYCUR` = `64·64`/`682·64` |
| DVG / screen (LABS) | `XCURR`/`YCURR` (`:181`) | 10-bit DVG coord | **(64, 682)** |
| scape scroll | `SCROLL`/`SCRADD` (`:234`) | terrain offset under the ship | 0 / 0 |

`POSTMOD` (`:1295`) is the only bridge adjusted → screen: it calls `ROTATE` (`:2019`), which
is exactly **`XCURADJ >> 6`** (the `×64` fixed-point shifted back down), then OR's the `$A0`
LABS opcode. So **`XCURR = XCURADJ >> 6` = the logical value** — start screen point = **(64, 682)**,
which (DVG Y-up, 1024×768) is **upper-left, near the top**, not centre.

`ACCEL` (`:1946`) adds velocity to `XCURADJ`/`YCURADJ` **unless** `MJRFLG` says the scape is
scrolling (then the velocity goes to the scroll and the ship holds). `SCAPCHG` (`:2674`) sets
`MJRFLG` + scrolls the scape only when the ship reaches an edge — X kept within
`XCURADJ+1 ∈ [XMIN 32, XMAX 224]` = logical **X [128, 896]** (`XSCPADD`/`XSCPSUB`, stepping
`LUNAROT` through the wrapping sections, `:2682-2698`); vertical within `[YMIMIN 256, YMJMAX 660]`
(`:3731-3737`). So the craft **drifts across the screen within the window**, and the terrain
holds still until an edge — descent past the bottom lowers `SCRADD` → the ground rises.

**Port note:** the lander draws at `(posX, SCREEN_H − posY)` (the `POSTMOD >>6` result, held
un-scaled), velocity integrates into `posX/posY`, and the excess scrolls the scape at the window
edges (`physics_arcade.js`, `lander.js`). The **horizontal** dead-zone `[XMIN,XMAX]` runs in both
scapes. The **vertical** dead-zone is built for the **minor** scape (`[WIN_YMIN 256, WIN_YMAX 660]`,
excess → `SCRADD`, so the ground rises as you descend / recedes as you climb); the **major** far
view keeps free vertical movement (the whole terrain is on screen) — its ascent past the ceiling
is the off-top reset (§9.1), and its descent triggers the zoom-in before the bottom. The
scape-edge overflow scales by `1/camera.scale` (4 world-units/px major, 1 minor), the dual of the
×4 minor position step — so the world scroll rate is identical in both scapes. (An earlier cut
that clamped `posY` to a vertical window in *major* snapped the ship down when it climbed — dropped;
the vertical window is a minor-scape concept, per the `YMI*` constant names.)

### 9.1 Zoom — the major/minor scape transition

The game runs **two terrain coordinate systems**, switched by `LUNARNUM`
(`$40` = major, `0` = minor):
- **MAJOR** — far view, 1×, 4 sections (section mask `$03`, `DECODE :2144`); the zoom-out
  lander bank (`$4DF4`, ~15u).
- **MINOR** — near view, **4× magnified**, 16 sections (mask `$0F`, `DECODE :2140`); the
  zoom-in lander bank (`$4BA2`, ~29u). The 4× is why `ACCEL` multiplies velocity by 4 for
  the minor position step (`:1953-1958`) — same world motion, 4× the on-screen travel.

The switch is driven by **`SCPDST`** (`:2930`) — the *smaller of the two Y-axis corner
distances* `DISTYL`/`DISTYR` (from the `DECODE` pass; `SCPDST` compares only the Y distances
and returns the min in `A`/`X`, the other corner's low byte in `Y`) — **not** raw altitude.
`DECODE` measures the **left** corners on even frames and the **right** on odd
(`FRAME LSR / BCS :2092-2112`), so one of the two can be a frame stale; the min is still a
good ground-clearance estimate. The transition uses **hysteresis**:
- **Zoom IN (major → minor)** — `SCAPMJR` (`:2828`): once `SCPDST < YMJMIN (96)` (top byte 0
  and low byte `< 96`, `:2853-2857`) it converts the major position into minor coordinates
  (`:2858-2923`), zeroes scroll, sets `LUNARNUM = 0`, and resets the ship to
  `MINSTX = 512/4 = 128` / `MINSTY = 632/4 = 158` (adjusted units, `:2924-2927`, `:3738-3739`).
  *Within ~96 units of the ground → snap to the near 4× view.*
- **Zoom OUT (minor → major)** — `SCRLUP` (`:2725`, "convert minor offsets into major
  offsets"): while ascending with the ship high in its window (`YCURADJ ≥ YMIMAX = 660/4 = 165`,
  `:2709`), once `SCPDST ≥ YMISCR (520)` and `COLFLG` clear (`:2711-2720`), it converts
  minor→major, zeroes scroll, sets `LUNARNUM = $40`, and resets the ship X to
  `RMJRX = 512/4 = 128` (`:2789-2792`). If `COLFLG` is set at that point it is a `COLLIDE`
  (crash) instead (`:2721`). *Climb well clear → pop to far view.*

The thresholds are asymmetric on purpose (in `96` **major** units; out `520` **minor** units
≈ `130` major-equivalent after the ÷4) so the view doesn't flap at the boundary. Each is
compared in the *current* scape's own units — major for the zoom-in test, minor for the
zoom-out test — which is what makes the ÷4 the right way to relate them (this resolves the
earlier open question about `SCPDST` units). (Seb's altitude<70-in / >160-out is his
approximation of this corner-distance rule.)

**Off the top of the major scape resets the flight.** While ascending in major, if the ship
reaches the top and `YSCPADD` can no longer scroll (`:2833-2836`), `SCAPMJR` runs
`INTWAIT → DEDCTA → PLYSTRT` (`:2837-2841`) — the flight restarts with fuel deducted. So the
far view has a hard ceiling, not open sky.

**Port note (built — `landscape.js` `updateZoom` / `frameCamera`, `physics_arcade.js`):** the
transition is a **snap** (flip `LUNARNUM`, set camera scale 0.25↔1.0, reset the ship to the
fixed screen pos MINSTX/MINSTY (512/632 logical) or RMJRX (512), zero-then-set the scroll). The
**trigger uses the altitude proxy** `landscape.altitudeAt` (single-point `heightAt`) as the
`SCPDST` stand-in — the faithful thresholds map to world units as **IN alt < 384** (`YMJMIN 96`
major-units ×4) / **OUT alt ≥ 520** (`YMISCR 520` minor-units) while ascending + high in the
window; the real 2-corner `SCPDST`/`DECODE` swaps in at the collision step. **Coordinate
continuity** is preserved without the exact `SUMSA`/`SUMSUM` byte math: note the ship's world
point before the snap, then set `SCROLL`/`SCRADD` so it still sits over that point at the new
scale + reset screen pos (a labeled simplification — verified visually continuous, no altitude
jump across the snap). The off-top reset is `state.resetFlight(fuelPenalty)` (minimal — full
`PLYSTRT`/`GAMODE` is the state-machine step). All live-verified in `play.html`.

## 10. Starfield — `STARS` (`:1121-1150`)

Drawn every frame after `SCAPE` (`:389-390`). Two sets matching the two zoom levels:
- **Major/far** (`MJSTRA` lower band y 0–767, `MJSTRB` top band y 768–1279 in play
  mode) — positioned by a fixed `LABS` (`STRINIT`); offset only by the scape-section
  `OFFSET`, not smooth-scrolled.
- **Minor/near** (`MINSTR`) — runs through `SCRLDO`, i.e. it **scrolls** with the world.

Star point data itself is the 61-point field in `034598` `$5244-$53E6` (already decoded;
see CLAUDE.md region map) — single-dot VECs, brightness 5–9.

## 11. Landing / collision — `DECODE` + `SCAPLND` verdict

Two routines: `DECODE` measures how far the ship is from the scape; `SCAPLND` turns that
(plus velocity + attitude) into the `COLFLG` verdict. Both need terrain in scope (the physics
demo has none).

**`DECODE` (`:2087`) — corner-to-terrain distances.** It walks the scape's VG display list
segment by segment and, for the ship's four corners `SHPUPL`/`SHPUPR`/`SHPLWL`/`SHPLWR`,
computes the X- and Y-axis gaps to the surface into `DISTXL`/`DISTXR` (X) and
`DISTYL`/`DISTYR` (Y). To halve per-frame cost it does the **left** corners on even frames,
the **right** on odd (`FRAME LSR / BCS :2092`). `ACCEL` clears `COLFLG` to `0` each frame
(`:1943`) before `DECODE` runs.

**Crash by penetration.** If a corner's distance comes back **negative** — the corner is at
or below the surface — `DECODE` sets `COLFLG = 8F` (crash) immediately (`:2350-2352`,
`:2396-2399`, and `DSTNCY :2547-2549`). This is the "flew into a slope" crash, independent
of velocity.

**Landing verdict — `SCAPLND` (`:2794`).** Called from `SCAPCHG` every frame in minor mode.
It reads `SCPDST` (the smaller Y corner-distance) and grants a **successful landing** only
when *all* of:
1. **Both corners touching** — `SCPDST` **and** the other corner's Y distance are both `< 2`
   (≈ within 1 unit; `:2795-2800`). A tilted ship touches one corner first → the other is
   far → fails this → falls through to the impact check.
2. **Near-upright** — `SHIP ∈ {7,8,9}` (`SHIP−7 < 3`, `:2801-2805`): within ±1 step
   (±11.25°) of vertical **`SHIP = 8`** (see the SHIP-convention note below).
3. **Descent speed** — high byte of `|VELY|`: `< 4` → **good**, `4–7` → **hard**, `≥ 8` →
   **crash** (`:2806-2811`).
4. **Lateral speed** — high byte of `|VELX|` `< 4`, else crash (`:2813-2815`).

Result in `COLFLG`: `80` good / `C0` hard / `8F` crash (`:2816-2823`). (`M.HRDY = 10` is
**not** the good/hard threshold — it is the post-verdict bounce seed below; the real gate is
the `<4 / 4–7 / ≥8` split on the velocity high byte.)

**Outcome — `PLYCHK` (`:531`) / `MOTCHK` (`:514`).** Once `COLFLG` bit 7 is set the game
scores (`LNDADR`), copies `COLFLG → M.CLFL`, and:
- **Bonus fuel** `BNFUEL = 50` **only** on a good landing (`COLFLG = 80`; `:554-558`).
- `DEDUCT` subtracts impact fuel loss (`:559`); `GAMODE` advances to land/crash and
  `INDEX = 1` starts the animation (`:574-576`).
- **Hard-landing bounce:** the outcome seeds `VELY+1 = M.HRDY (10)` and
  `GRAVITY = M.HRDG (65)` (`:577-580`); `MOTCHK` keeps `ACCEL`+`DECODE` running so the module
  bounces and re-settles (`:514-521`). A crash instead plays `BOOM` (see
  `research_explosion.md`); a good landing settles.

**Scoring — `POINTS` (`:3311`) × site factor `TBSTFT` (`:1921`).** Base points per outcome:
**good `50`**, **hard `15`**, **crash `5`** (`:3311-3318`). `LNDGD` (`:1900`) reads the
site's multiplier from `TBSTFT = 2,2,2,2,3,3,4,4,4,4,5,5,5,5,5` (15 entries = 15 terrain
sites) and calls `POINTS` that many times, so the award is `base × site-multiplier` (decimal
`SED` add). This matches the game's own `5X 5X 2X 2X` pad labels (CLAUDE.md "Gameplay HUD").

**SHIP convention — the port matches the source (upright `= 8`).** The source's
vertical/upright is **`SHIP = 8`**: `ATRINIT` seeds `8` (`:589`), the abort auto-rotate homes
to `#8` (`:994-1013`), and `FRCMLT` puts full thrust along `+Y` at `SHIP = 8` with zero X
(`:1758-1789`); the Training clamp keeps `ROT+1 ≤ 0x40` → `SHIP ∈ [0,16]` (`ROT.NI :868-877`).
So `0`/`16` are on-side, `24` upside-down. **The port uses this same convention**
(`physics_arcade.js` `tilt = SHIP−8`, Training clamp `[0,16]`; `lander.js` pose fold about `8`)
so every source constant compared against `SHIP` ports **verbatim** — this landing gate stays
`SHIP ∈ {7,8,9}` with no offset.

`PLYINIT` seeds `SHIP = 16` at play-start (`:650-651`) — the source's **sideways** value, not
upright: **MAME confirms the lander enters lying on its side, head to the right / legs to the
left**, and the player rotates it upright. So the port keeps the faithful `newGame SHIP = 16`
seed (it now renders sideways, as the cabinet does), and upright stays tied to the thrust
formula, never to that seed. (An earlier build treated `16` as upright with a `tilt = SHIP−16`
axis — a self-consistent `+8` shift that flew fine but rendered the start upright instead of
on-side and would have needed `{15,16,17}` here; realigned to `8` so the source ports 1:1.)

## 12. Implications for the physics demo

Faithful pieces to implement (no terrain, starfield = the motion cue):
- **Integration:** `VELY += YTHRUST − GRAVITY`, `VELX += XTHRUST`, `pos += VEL`; constant
  gravity, inertial coasting, **no global drag**. Fixed-point or float is fine for a demo
  as long as the ratios match (gravity `0x11`, thrust scaled by `TRSTAB`/`SINES`).
- **Throttle** → `THRUST` 0–15 (dead zone), thrust along the ship "up" axis.
- **Rotation** ±90°, 11.25°/step (we have this); offer Command-mode inertia as an option.
- **Motion shown by scrolling the starfield** in both axes from velocity — this is exactly
  the arcade's model (fixed craft, scrolling world), so it is **faithful, not a demo
  hack**. Drive star scroll from velocity (H = `VELX`, V = `VELY`).
- **HUD** reuses the `$5458` layout with live altitude / H-speed / V-speed / fuel / score.
- Difficulty differences (§7) are a nice optional toggle (gravity ×2 + 1.5× thrust for
  Prime; friction for Training; rotational inertia for Command).

Demo choices to label as non-faithful (not in source): any global drag, the green/red
flame colour (DVG is monochrome), and our flame's lengthen-with-throttle (the source
widens — see CLAUDE.md "Thrust flame").

## 13. Port fidelity — arithmetic & clock (gameplay build)

How faithfully the gameplay runtime reproduces the decoded physics above (the
architecture that consumes it lives in CLAUDE.md "Flight-model architecture"):

- **Arithmetic = floating point, not the source's integer fixed-point.** The source
  keeps velocity/position as multi-byte fixed-point (`VELX .BLKB 4` = int+fraction),
  sign-magnitude sign bytes (`SGNVLX`/`SGNVLY`), an integer `SINES` table + `MULTR`/
  `MULTC`→`PROD` multiply in `FRCMLT`, and truncating `LSR` shifts. The port uses the
  real **constants** (`GRAVITY=$11`, `TRSTAB`, `FUELFAC`, `GRAVT[PLYMOD]`) and the real
  **routine structure**, but integrates in JS floats. This is faithful in feel/ratios,
  **not bit-exact** (float rounding ≠ byte-carry). Acceptable for the educational goal.
  - **Exception — the collision / landing kernel is ported as faithful integer math.**
    Landing-vs-crash hinges on exact distances/shifts, and the sibling asteroids_clone
    post-mortem (repo CLAUDE.md) shows a misread 16-bit shift makes collision feel
    half-size. So `DECODE`/`COLFLG` distance math uses the source's integer widths and
    shift semantics, even though motion uses floats.

- **Clock = one fixed tick per source frame: `TICK = 6/250 s` (24 ms, ~41.7 Hz).**
  `FRMECNT=6` NMIs × 4 ms; `SECCNT=250` NMIs/s (`:56`,`:59`). Keeping **1 tick == 1
  frame** ports both the per-frame constants (`VELY += YTHRUST−GRAVITY`) and the
  frame-*counted* logic (`FRICTN` every 16 frames, `INDEX` every other, the `TIME`
  display, `ROT` debounce) with **no rate conversion**. Not 1/60: rerating would turn
  those integer frame counts into fractional tick counts. A fixed-timestep accumulator
  + render interpolation makes the ~41.7 Hz sim smooth on any display refresh, so there
  is no visual cost. Input is **sampled once per tick** (as the source reads switches
  per frame), so control latency matches the cabinet regardless of monitor rate.

## 14. Start state — `PLYINIT` (`:609-673`)

New Game seeds these (ported in `state.newGame`); all values are the source's own:

- **`SHIP = 16.`** (decimal, `:651`) — **on its side, heading right** (legs to the left),
  NOT upright. Upright is `SHIP = 8` (§11 SHIP-convention note), so the ship **enters
  sideways** and the player rotates it upright — MAME-confirmed at the play-start frame. The
  ship enters upper-left (below) drifting right, lying on its side. ATRINIT uses `SHIP = 8`
  (upright) for the attract pose (`:588`); don't confuse the two seeds.
- **Position** ← `INTXCUR`/`INTYCUR` (`:3747-8`): `.WORD 64.*40` / `682.*40`. The `*40`
  (= `*$40` = ×64) is the **adjusted-window (MODULE)** fixed-point, so the logical position is
  **(64, 682)**; the on-screen draw point is the same value (`POSTMOD` = `XCURADJ >> 6`, §9).
  That is **upper-left, near the top** of the 1024×768 field — the ship enters top-left and
  drifts *within its dead-zone window* (NOT centred). Copied into `XCURADJ`/`YCURADJ` (`:631-632`).
- **Velocity** ← `INVELX`/`INVELY` (`:3749-50`, hex): `$3200` (12800) / `$10` (16), copied into
  `VELX`/`VELY` by `PLYINIT` (`:628-636`); `REINIT` clears the sign bytes → both **positive** =
  rightward / up (`SCAPCHG :2683/:2703`). In source velocity units (screen px = velocity/16384 per
  frame): `VELX` = **~0.78 px/frame rightward drift** (the ship enters and drifts in); `VELY` = 16
  is a **negligible up-seed** (~0.001 px/frame) that gravity (−17/frame) overtakes on the first
  frame. **Wired** in `state.newGame`.
- **`GRAVITY = $11`** (17, `:596`); **`GAMODE = $40`** = PLAY (`:646`); **`LUNARNUM = $40`**
  = major/zoom-out (REINIT `:672`); `LUNAROT`/`SCROLL`/`SCRADD` cleared to 0 (REINIT `:657`).

**Frame note:** `XCURADJ`/`YCURADJ` is the ship's adjusted-window position, converted to the
DVG `LABS` by `POSTMOD` (`:1295`) = `>> 6` (§9); the scape's position relative to the ship is
`SCROLL`/`SCRADD`. The port now seeds the position (`posX/posY`) and the velocity (`VELX/VELY` = `INVELX/INVELY`)
and draws the ship inside the dead-zone window (§9 "Port note"), so the `(64,682)` upper-left
start renders faithfully and the ship drifts in. **Still deferred:** the minor-view `×4`
position step and the minor edge-scroll scale, finalized alongside the zoom step.
