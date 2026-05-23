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

**2026-05-23 update:** I-7 (main-loop scaffold + 15-JSR dispatch) and
I-8 (ship physics — rotation, thrust, position math, fire) done.
Hyperspace deferred to I-13 (needs un-disasm RNG body). Next up:
**I-9** (asteroid spawn + split mechanics).

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
- **`demos/vector_rom.html` + `demos/vector_rom.js`** — verification demo.
  Canvas at 4:3 cabinet aspect ratio (800×600 = DVG 1024×768). Prev/Next
  steps through all 64 navigable subroutines (ThrustDirN reachable via
  thrust toggle when on matching ship). globalScale slider sweeps 0-9.
  Moved into `demos/` 2026-05-22 to reserve the project root's
  `index.html` / `main.js` for the eventual game entry point.

Sparse-clone of `topherCantrell/computerarcheology` (Asteroids
subfolder only) is set up on the second PC at
`D:\tmp\computer_archeology_asteroids\` — see `../CLAUDE.md` for both
per-PC paths.

## Per-object globalScale: estimates and confirmation plan

Visual verification of all 81 subroutines is done. Each shape now
renders correctly under the corrected DVG scale formula (see
[`research_dvg.md §4 + §6`](research_dvg.md), 2026-05-22 update) —
but we don't yet know the gs value the CPU code sets per object. The
gs-per-object map is encoded in every caller of the LABS-emit
helper `$7C03`: each caller stores the LABS globalScale byte into
`ram.$00` before calling, and `$7C03` ORs that byte into the LABS
opcode's scale nibble (see [`research_dvg.md §10`](research_dvg.md)
for the bit layout).

**Confirmation strategy (decided 2026-05-23):** the gs values are
**not** investigated as a standalone step. Each per-object port
step (I-8 ship, I-9 asteroid, I-10 saucer, I-12 HUD/attract) reads
the source for that object anyway — the gs value falls out as a
side-effect. A standalone "I-6 gs table" step would be the same
source-reading done twice. The estimates below are used as
placeholders in JS code (with `// TODO: confirm during I-N`
comments) and are corrected when the per-object port lands.

Refined estimates after the SVEC fix, based on cabinet-faithful
rendering at each candidate gs:

| Object | Likely gs | Reasoning |
|---|---|---|
| Player ship | **14 (confirmed I-8a)** | Source `$7027` derives Y=`$E0` from status=1 (alive); high nibble $E = 14 is stored at ram.$00 → ORs into the LABS scale field. Under the wrap-and-saturate scale model, gs=14 + ship local scales wraps to small visible total. |
| Lives icon | 0 (or close) | Same shape family as ship. |
| Asteroid (small/med/large) | **0 / 1 / 2** | Rock1 is SVEC-only with scaleMode≤3 (saturates at gs>4). Measured Rock1 spans: gs=0 → 64×64 small, gs=1 → 128×128 medium, gs=2 → 256×256 large. See [`research_vector_rom.md §3.6`](research_vector_rom.md). |
| UFO (large/small) | 0-2 (guess) | UFO is SVEC-only; same scale-response curve as asteroids. |
| Characters | 0-2 (guess) | HUD readability — to verify against cabinet HUD footage. |
| Ship explosion fragments | varies per frame | Animation cycles through gs values. |

**Per-object confirmation map** (which port step reads which
callsite of `$7C03`):

| Callsite | Object drawn (likely) | Port step |
|---|---|---|
| `$725E`, `$72A2`, `$72BF` (inside `scoreLivesDraw`) | score digits / lives icon / copyright | I-7 trailer or I-12 |
| `$6F48` | asteroid | I-9 |
| `$7027` (inside `$72FE` per-slot dispatcher) | ship | **confirmed I-8a (gs=14)** |
| (site inside `$6B93` / `$6C34`) | saucer | I-10 |
| `$73F7` | high-score-entry text | I-12 |
| `$781C` (inside `$77F6 PrintPackedMsg`) | packed message text | I-12 |
| `$6DD5`, `$7EFD`, `$7F25`, `$7F6A`, `$7F97` | attract / test-pattern text (TBC) | I-12 |
| `$686D` (direct main-loop call) | closing LABS opcode (mid-screen) | I-7 |

Each port step reads the `LDA #/STA $00` (or `LDY #/STY $00`)
immediately before its `JSR $7C03` and pins down the actual gs.

**Note (2026-05-23 — research bug):** earlier text in this section
claimed the gs-per-object map lived in "the un-disassembled
list-builder routine around `$7555`". That was wrong on two counts:
`$7555` is fully disassembled, and it is the per-frame sound-channel
update routine, not a list builder. List-building is distributed
across the `$7C03` callsites above. See
[`research_main_loop.md §3`](research_main_loop.md) for the
corrected 15-JSR table.

**Previous misreading (resolved 2026-05-22):** before the SVEC fix,
the interpreter divided SVEC's `raw × scaleMode-multiplier` by
`2^(9 - globalScale)`. That made SVECs vanish at low gs, which led
to the wrong conclusion that the cabinet ship at gameplay scale was
an "open V" missing its back-edge details. The actual hardware adds
`scaleMode + 2` to the global scale (same additive model as VEC) —
so at gs=0 the ship's back-edge SVECs render properly and the V
closes. The "Ship-data modification recipe" below was a phantom-
problem fix and is now obsolete; it stays in this file as a
historical paper trail in case the analysis is useful for diagnosing
similar misreads on other shapes later.

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
| I-7 | Object tables + main loop ($6800 dispatch) | **done** |
| I-8 | Ship physics (rotation, thrust, position math, fire) | **done** (hyperspace deferred to I-13) |
| I-9 | Asteroid spawn + split mechanics | not started |
| I-10 | Saucer AI + state machine | not started |
| I-11 | Collisions + scoring + lives | not started |
| I-12 | Attract mode + power-on test pattern + credits | not started |
| I-13 | Polish + visual tuning (incl. ship hyperspace $7052-$7081) | not started |
| I-14 | Sound (R-G dependency) | deferred |

### I-8 scope

I-8 covered four conceptual sub-steps:

- **Visible ship** at cabinet-true gs=14 + DVG scale wrap-and-saturate
  fix (4-bit mask + total>9 → shift-by-10 path, per MAME `avgdvg.c`).
  Sim/render split lands in `task_seq.js`.
- **Rotation** (`$7086-$709A`, ±3/tick) + 17-shape direction fold
  (`$750B`) with X/Y flip flags. `dvg.runList` gains `xFlip`/`yFlip`
  (analog of `$6AD3`'s EOR-during-VRAM-copy sign mirroring). Keyboard
  polled-switch model wired in `main.js`.
- **Thrust + position math** — accel (`$70AC-$70DE`, Math.cos/sin
  replaces the $77D2/$77D5 LUT in the un-disasm region), linear-
  damping friction (`$70E1-$7124`), Float64 position advance
  (`$6FC7-$7016`) with toroidal wrap. Game-coord `[0, 32) × [0, 24)`
  per [`research_position_math.md §6`](research_position_math.md);
  shared cursor between ShipDirN and ThrustDirN matches the source's
  one-LABS-then-sequential-JSRs pattern.
- **Player fire** (`$6CD7`) — edge-detected SWFIRE via
  `state.fireWasPressed` (source uses `photomLimiter $63`), spawn into
  free slot $1F-$22, shot velocity = ship velocity + base direction
  unit clamped ±112/256 (`$6D14`), 18-tick lifetime decrementing every
  4 frames (`$7393`). Renderer gains `drawDot` (analog of `$7CE0`).
  Collisions stay out — I-11.

**Deferred from I-8 scope:**
- **Hyperspace** (`$6E74` + `$7052-$7081`) needs the RNG body
  (`$77B5`, un-disasm region) and the death-rate constants — moved
  to I-13.

## Ship-data modification recipe (obsolete — phantom problem)

**Status: obsolete 2026-05-22.** This recipe was applied to
`vector_rom_data.js`, reverted the same day, then proven unnecessary
by the SVEC-formula correction. It is retained here as a historical
paper trail — both for the diagnostic methodology and for the
warning it carries about confirming bias.

### Why it was a phantom problem

Under the original (incorrect) SVEC interpretation, the interpreter
treated `globalScale` as an additional divisor on top of the
`scaleMode` multiplier. At gameplay gs=0 this drove SVEC magnitudes
to ~0 integer DVG units. ShipDir0 / 16 / 64, which use SVECs for the
back-edge details and the anchor-offset move, then rendered as
"open V arrows with tiny back curls" — different from the diagonal
ShipDir4..60 which use VECs throughout.

The recipe below was an attempt to compensate for this in the
**data**, by manually scaling the SVECs up so they'd survive the
divisor. We then convinced ourselves this was a cabinet-faithful
artifact (CRT line width filling a phantom-SVEC gap) and reverted.

Both moves were wrong. The cabinet hardware adds `scaleMode + 2` to
global scale (additive, not divisive — see
[`research_dvg.md §4 + §6`](research_dvg.md) corrected 2026-05-22 via
MAME `avgdvg.c` + Mikstas HDL). At gs=0 the SVECs render at their
full `raw × 2^(scaleMode+1)` magnitudes (8-32 DVG units per
segment), and the ship closes properly without any data modification.

### Methodology lesson

The recipe's existence shows a self-confirming-bias trap: once we
saw the "open V" output, we rationalized it as cabinet-faithful
rather than questioning the interpreter. Catching this required
going outside the original DVG.md spec to MAME source + Mikstas HDL.
**Default to suspecting the interpreter before rationalizing
visual output as "intended".**

### The recipe itself (preserved for reference)

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
