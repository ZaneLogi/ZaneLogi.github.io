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

The lander is drawn at a **fixed screen position** (`YCURR`/`XCURR` LABS, `:181-182`);
the **world scrolls** to show motion. `ACCEL` accumulates velocity into the ship's world
position `XCURADJ/YCURADJ`; `DECODE`/`SCAPCHG` (`:484-485`) translate that into the
lunarscape scroll `SCROLL` (horizontal, fractional) + `SCRADD` (vertical), flagged by
`MJRFLG`. Vertical motion (descent) is `SCRADD`; the craft does not descend on screen —
the ground rises toward it.

The lander is held inside a **screen window**, not pinned to a single point: `SCAPCHG`
keeps ship X within `[XMIN=32, XMAX=224]` (adjusted units) — at an edge it scrolls the
scape (`XSCPADD`/`XSCPSUB`, stepping `LUNAROT` through the wrapping sections) instead of
moving the ship further (`:2682-2698`); vertical likewise (`YSCPADD`/`YSCPSUB`). So the
craft drifts within a centred window and the world scrolls underneath it.

### 9.1 Zoom — the major/minor scape transition

The game runs **two terrain coordinate systems**, switched by `LUNARNUM`
(`$40` = major, `0` = minor):
- **MAJOR** — far view, 1×, 4 sections (section mask `$03`); the zoom-out lander bank
  (`$4DF4`, ~15u).
- **MINOR** — near view, **4× magnified**, 16 sections (mask `$0F`); the zoom-in lander
  bank (`$4BA2`, ~29u). The 4× is why `ACCEL` multiplies velocity by 4 for the minor
  position step (`:1953-1958`) — same world motion, 4× the on-screen travel.

The switch is driven by **`SCPDST`** (`:2930`) — the *minimum distance from the lander's
corners to the terrain* (from the `DECODE` distance pass: `DISTYL`/`DISTYR`) — **not** raw
altitude, and it uses **hysteresis**:
- **Zoom IN (major → minor)** — `SCAPMJR` (`:2828`): while descending, once
  `SCPDST < YMJMIN (96)` (`:2853-2857`) it converts the major position into minor
  coordinates (`:2858-2927`), resets scroll, places the ship at `MINSTX`/`MINSTY`, and
  sets `LUNARNUM = 0`. *Within ~96 units of the ground → snap to the near 4× view.*
- **Zoom OUT (minor → major)** — `SCRLUP` (`:2725`, "convert minor offsets into major
  offsets"): while ascending past `YMIMAX (165)`, once `SCPDST ≥ YMISCR (520)` and not
  colliding (`:2719-2721`), it converts minor→major, resets scroll, places the ship at
  `RMJRX=128`, and sets `LUNARNUM = $40` (`:2725-2792`). *Climb well clear → pop to far view.*

The asymmetric thresholds (in ≈96, out 520-minor ≈130 major-equivalent) are deliberate
hysteresis so the view doesn't flap at the boundary. Each transition recomputes the ship's
position between the two systems and zeroes `SCROLL`/`SCRADD`. (Seb's altitude<70-in /
>160-out is his approximation of this; the source keys on lander-to-terrain distance.)

Confirm before a pixel-exact port: whether `SCPDST` is reported in minor (4×) units while
in minor (the `YMISCR=520` reads as minor-scaled ≈130 major). Both transitions require
`DECODE` (lander-corner → terrain distance), which needs terrain — so faithful zoom is a
later step than the no-terrain physics demo, but the **rule is now known**.

## 10. Starfield — `STARS` (`:1121-1150`)

Drawn every frame after `SCAPE` (`:389-390`). Two sets matching the two zoom levels:
- **Major/far** (`MJSTRA` lower band y 0–767, `MJSTRB` top band y 768–1279 in play
  mode) — positioned by a fixed `LABS` (`STRINIT`); offset only by the scape-section
  `OFFSET`, not smooth-scrolled.
- **Minor/near** (`MINSTR`) — runs through `SCRLDO`, i.e. it **scrolls** with the world.

Star point data itself is the 61-point field in `034598` `$5244-$53E6` (already decoded;
see CLAUDE.md region map) — single-dot VECs, brightness 5–9.

## 11. Landing / collision (brief — demo has no terrain)

`ACCEL` clears `COLFLG` each frame; collision is detected against the scape distances
(`DECODE`/`DISTXL…`). Outcome in `COLFLG`: `80` good (`VELY` small), `C0` hard
(`VELY < M.HRDY=10`, triggers a bounce with `GRAVITY=M.HRDG=65`), `8F` crash. Score uses
the per-site bonus multipliers (`TBSTFT: .BYTE 2,2,2,2,3,3,4,4,4,4,5,5,5,5,5` — 15
entries = the 15 terrain tiles): 50/15/5 base × site multiplier; +`BNFUEL=50` on a good
landing. Full landing model belongs in a later research doc when terrain is in scope.

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
