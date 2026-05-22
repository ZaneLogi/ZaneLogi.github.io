# asteroids_clone — progress

Research-stage tracker. Read this when resuming work to see what's in
progress and what's next. Once research clarifies the implementation
subsystems, this doc will grow an implementation-step section.

## Research stage

Each doc lives under `docs/`. Order is dependency order. The DVG
prototype that originally lived in R-B was dropped 2026-05-22 —
all R-* docs are now paper-only; the first runnable artifact lands
as the first commit of the implementation phase (DVG interpreter,
built from R-B's spec).

| # | Doc | Focus | Status |
|---|---|---|---|
| R-A | `research_hardware.md` | 6502, memory map, 250 Hz interrupt vs frame rate | **done** |
| R-B | `research_dvg.md` | DVG opcodes + canvas mapping + bit-field spec for all 7 opcodes | **done** |
| R-C | `research_position_math.md` | 16-bit position carry, sub-pixel motion, toroidal wrap | **done** |
| R-D | `research_main_loop.md` | $6800 dispatch, 15-JSR task sequence, frame-sync gate via $5B | **done** |
| R-E | `research_collisions.md` | Distance-threshold geometry, asteroid-size encoding | **done** |
| R-F | `research_vector_rom.md` | Port the 2 KB vector ROM as JS draw subroutines | **done** |
| R-G | `research_sound.md` | 8-channel hardware synthesis | deferred until silent game runs |

**Research stage substantially complete** — R-A through R-F are
landed (the docs that gate gameplay code); R-G is deferred to
post-silent-game per the original plan. The DVG interpreter +
runtime skeleton can now be written from these specs as the first
implementation-phase commit.

Status values: `not started` | `in progress` | `done` | `deferred`.

## Current focus

R-A through R-F all done. Research stage substantially complete.
**2026-05-22 update:** the vector-ROM representation question was
resolved as a **decoded-object format** — the ROM ships as a
generated JS module of opcode objects keyed by source-label name
(e.g. `VROM.ShipDir0`), and one small interpreter handles both ROM
subroutines and the CPU-built per-frame vector RAM list. See
[`research_dvg.md §11`](research_dvg.md) for the full spec.

Implementation phase started on the same day. Current state:

- **`tools/build_vector_rom.py`** — decodes `VectorROM.md` into the
  runtime format. Output is **byte-faithful to the ROM**: only
  `fix_misplaced_rts` re-attributes one orphan RTS from a typographically
  mis-placed label (ThrustDir64) back to ShipDir64. No data modifications.
- **`vector_rom_data.js`** — generated, **81 subroutines** covering all
  gameplay-active shapes: 17 ShipDirN + 17 ThrustDirN + ShipExplosion +
  4 Shrapnel patterns + 4 Rock patterns + UFO + LivesIcon + 26 letters +
  9 digits (`0` is an alias for `O`, per the ROM's cross-reference table) +
  Space. Skipped: power-on test pattern, BANK ERROR text, credits text
  (re-extract when porting attract mode).
- **`dvg.js`** — ~40-line DVG interpreter (per R-B §11 spec). Renderer-
  agnostic; takes a `drawSegment` callback.
- **`index.html` + `main.js`** — verification demo. Canvas at 4:3 cabinet
  aspect ratio (800×600 = DVG 1024×768). Prev/Next steps through all 64
  navigable subroutines (ThrustDirN reachable via thrust toggle when on
  matching ship). globalScale slider sweeps 0-9.

Sparse-clone of `topherCantrell/computerarcheology` (Asteroids
subfolder only) is set up on the second PC at
`D:\tmp\computer_archeology_asteroids\` — see `../CLAUDE.md` for both
per-PC paths.

## Next step: per-object globalScale determination

Visual verification of all 81 subroutines is done. Each shape renders
correctly *at its intended gameplay globalScale* — but we don't yet
know the gs value the CPU code sets per object. The cabinet's actual
gs-per-object map lives in the un-disassembled list-builder routine
around `$7555`. Likely values based on cabinet footage + research
docs:

| Object | Likely gs | Source |
|---|---|---|
| Player ship | 0 | Cabinet footage (~9% screen width) |
| Lives icon | 0 (or close) | Small ship-shaped HUD element |
| Asteroid (large/med/small) | 9 / 7 / 5 | [`research_vector_rom.md §3.6`](research_vector_rom.md) |
| UFO (large/small) | 7-9 | [`research_vector_rom.md §3.7`](research_vector_rom.md) |
| Characters | 4-6 (guess) | HUD readability |
| Ship explosion fragments | varies per frame | Animation cycles through gs values |

To confirm: read the still-undisassembled `$7555` region (or Mikstas's
alternate disassembly) when porting the main loop. Until then, the
demo uses these guesses with the gs slider so we can spot-check.

**Side effect for ShipDir0 / ShipDir64 at gs=0:** SVECs `>>9` round to
zero in hardware too, so the cabinet ship was *also* an "open V" without
visible back-edge details at gameplay scale. CRT line width + phosphor
afterglow likely filled the visual gap. We considered modernizing the
data to make the ship look closed at all scales; reverted to preserve
this diagnostic signal. Recipe parked in [Ship-data modification recipe
(deferred)](#ship-data-modification-recipe-deferred) below.

## Open questions surfaced during scouting

These came from the pre-research pass over the source overview,
`Hardware.md`, `DVG.md`, and the `Code.md` table-of-contents. Each
will be addressed in the relevant research doc when reached.

- ~~**250 Hz interrupt content**~~ — **resolved in R-A §3-§4**: NMI
  at `$7B65` does stack-sanity + counter ticks (`$5E`, `$5B`) + lamp
  output + slam/bonus sound. Game logic and frame rate are derived in
  the main loop, gated by `$5B` for ~62.5 Hz. (`$7CF3` is the RESET
  handler, not NMI — earlier scouting had this wrong.)
- ~~**16-bit position math**~~ — **resolved in R-C §7**: Float64
  wins (cleaner code, drift risk acceptable per 52-bit FP mantissa
  analysis). Documented as a port deviation per `../CLAUDE.md`
  conventions; cite the deviation at each affected JS site.
- ~~**Vector glow rendering**~~ — **deferred in R-B §5/§11**: three
  viable canvas strategies documented (alpha-mapped, width-mapped,
  multi-pass bloom). Default starting point is alpha-mapped; upgrade
  later if visuals warrant it. Decision happens during DVG-interpreter
  implementation, not now.
- **Missing ~20% of disassembly**: clusters around sound (R-G), RNG
  `$77B5` body, DVG-list builders, packed-string unpacking, and
  `$75EC` (asteroid-hit score + split-velocity perturbation —
  surfaced by R-E §5/§7). Nicholas Mikstas's alternate disassembly
  (<https://www.nicholasmikstas.com/games/>) is the fallback source.
  (NMI handler body — earlier listed here — is actually fully
  disassembled at `$7B65`; the `$7CF3` confusion was the RESET
  handler. Both visible. Resolved during R-A.)

## Implementation steps

| # | Step | Status |
|---|---|---|
| I-1 | Sparse-clone setup on this PC | **done** |
| I-2 | Build script: parse VectorROM.md → decoded-object format | **done** |
| I-3 | DVG interpreter (renderer-agnostic, drawSegment callback) | **done** |
| I-4 | Verification demo (canvas + slider + prev/next) | **done** |
| I-5 | Extract all 81 gameplay-active subroutines (visual spot-check) | **done** |
| I-6 | Determine per-object globalScale (see Next step above) | next |
| I-7 | Object tables + main loop ($6800 dispatch) | not started |
| I-8 | Ship physics (rotation, thrust, position math) | not started |
| I-9 | Asteroid spawn + split mechanics | not started |
| I-10 | Saucer AI + state machine | not started |
| I-11 | Collisions + scoring + lives | not started |
| I-12 | Attract mode + power-on test pattern + credits | not started |
| I-13 | Polish + visual tuning | not started |
| I-14 | Sound (R-G dependency) | deferred |

## Ship-data modification recipe (deferred)

**Status: tried, reverted 2026-05-22.** The recipe below was applied
to `vector_rom_data.js` and then rolled back. Documented here so we
can re-apply without re-deriving if we change our minds.

### Why we reverted

ShipDir0 (face east), ShipDir16 (22.5°), and ShipDir64 (face north)
use SVECs for their move opcode and (for 0/64) their back-edge
detail. At the gameplay globalScale these SVECs would `>>9` round to
zero, making the ships look like *open arrows with tiny back curls*
that don't quite connect — different from the diagonal ShipDir4..60
which use VECs throughout and render as closed shapes.

We initially modernized the data to make all 17 ship shapes look
identically "closed" at every gs. But on reflection: the original
cabinet ran the same hardware math, so at the cabinet's gameplay gs
the ship was *also* an open V with phantom SVEC data that never got
drawn. CRT line width + phosphor afterglow likely filled the visual
gap. Keeping the data byte-faithful preserves the cabinet's actual
rendering as a diagnostic — if our port produces an open V, that's
the real Asteroids ship; if our port produces something different,
we have a rendering bug to find.

Most other shapes (Rock1..4, Shrapnel1..4, UFO, ShipExplosion,
LivesIcon) don't have this problem because the game runs them at
higher gs values (asteroids: gs=5/7/9, UFO: gs=7-9, etc.) where
SVECs render at usable magnitudes natively.

### The recipe (if we want to re-apply)

Pipeline order in `tools/build_vector_rom.py.main()`:
```
parse → fix_misplaced_rts → modernize_svecs → close_axis_aligned_shapes
      → scale_axis_aligned_moves → scale_axis_aligned_thrusts → derive_addr_to_label
```

Targets:
- `MODERNIZE_TARGETS = ("ShipDir0", "ShipDir16", "ShipDir64", "ThrustDir0", "ThrustDir64")`
- `CLOSE_TARGETS = ("ShipDir0", "ShipDir64")`
- `MOVE_SCALE_TARGETS = ("ShipDir0", "ShipDir16", "ShipDir64")`
- `THRUST_SCALE_TARGETS = ("ThrustDir0", "ThrustDir64")`

Step 1 — `modernize_svecs(subs, targets)`: convert each SVEC to a
VEC with the same `bri`:
- `VEC.dx = SVEC.dx * (2 << SVEC.scaleMode)` (factor 2/4/8/16)
- `VEC.dy = SVEC.dy * (2 << SVEC.scaleMode)`
- `VEC.localScale = 6` for move opcodes (bri=0), so they scale
  predictably regardless of surrounding VEC scales (matters for
  ShipDir16 whose draws are at localScale=4)
- `VEC.localScale = (first VEC's localScale in the same sub)` for
  drawn SVECs, so proportions are preserved

Step 2 — `close_axis_aligned_shapes(subs, targets)`: multiply each
back-edge drawn segment's `dx`/`dy` by **8**. Definition of "back
edge": every drawn VEC that *isn't* one of the two long tip VECs
(identified by `|dx|>=256 or |dy|>=256`) and isn't the move (bri=0).
Why ×8 specifically: ShipDir0 tip Y total = -512 raw; back Y total
= +64 raw → gap = 448. For closure, back Y must equal +512 →
factor 512/64 = 8. ShipDir64 is the same shape rotated, same factor.
The non-closing axis is already balanced (sums to 0 for both tip
and back) so scaling all components by 8 keeps it balanced. Assert
gap ≤ 1 after the scaling to catch math regressions.

Step 3 — `scale_axis_aligned_moves(subs, targets)`: multiply the
single move-only opcode (bri=0) by **8**. Brings the cursor offset
from LABS anchor up to ~24 units at gs=0, matching the diagonals'
offset magnitude (~22 units).

Step 4 — `scale_axis_aligned_thrusts(subs, targets)`: multiply every
drawn segment (bri>0) by **8**. Same factor for the same reason as
step 2 — the flame's two endpoints are designed to land on the
matching ship's vertex 0 (move position) and vertex 1 (end of
first drawn segment). After step 2 scaled vertex 1 by 8, the flame
needs to scale too to reach it.

### Quick sanity-check expected values after re-apply

- `ShipDir0`: move `(-192, -128)`, back-1 `(0, +256)`, back-2 `(-128, +128)`,
  tip-1 `(+768, -256)`, tip-2 `(-768, -256)`, back-3 `(+128, +128)` — closes
- `ShipDir64`: move `(+128, -192)`, back-1 `(-256, 0)`, back-2 `(-128, -128)`,
  tip-1 `(+256, +768)`, tip-2 `(+256, -768)`, back-3 `(-128, +128)` — closes
- `ShipDir16`: move `(-128, -192)`, rest of draws unchanged from ROM
- `ThrustDir0`: `(-256, +128)` and `(+256, +128)`
- `ThrustDir64`: `(-128, -256)` and `(-128, +256)`

Everything else (UFO, LivesIcon, ShipExplosion, Rock1..4,
Shrapnel1..4, diagonal Ship/ThrustDirN) untouched.
