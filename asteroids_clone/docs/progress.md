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

**2026-05-25 update:** I-11 (collisions + scoring + lives + HUD) done.
Eight sub-steps planned in `plan_i11.md` were collapsed into six
in-session commits (I-11d+f folded ship-vs-asteroid collision into
I-11d so the death flow was play-testable; I-11g+h combined since
both extend the same `collisions` function with saucer pairs). HUD
landed first to make every subsequent scoring/lives change visually
verifiable. Two cross-cutting fixes folded in: (1) **multi-resolve
fix** — `$6A94 JMP $69F9` was missed in I-9h; latent until I-11b
scoring made it observable; added inner-loop `break` after each
resolve in all collision pairs. (2) **BB collision restored** —
I-9h's Euclidean port deviation missed ~21% of source-valid hits
(corner regions); reverted to source's `|dx|<r AND |dy|<r` for all
pairs after user observation that ship-vs-asteroid felt too
forgiving. Next up: **I-12** (attract mode + 2-player + game-over
flow that retires the temp lives-replenish stub in `Ship.kill`).

**2026-05-23 update:** I-7 (main-loop scaffold + 15-JSR dispatch) and
I-8 (ship physics — rotation, thrust, position math, fire) done.
Hyperspace deferred to I-13 (not a port blocker — see I-8 scope
notes; RNG is now known, see below). Next up: **I-9** (asteroid
spawn + split mechanics).

**2026-05-24 update — "~20% un-disasm" claim was overstated.** A
pre-I-9 read of the local `Code.md` for `$7168` (wave init) and
`$77B5` (RNG) found both fully disassembled. A spot-check of every
address this doc tree previously called "un-disasm" turned up the
same for: `$7125`, `$77D2`-`$77E8` (direction LUT lookup; reads a
table at `$57B9` in vector ROM), `$745A`/`$745C` (asteroid-slot
scanner), `$75EC` (asteroid-hit score + split spawn), `$77F6`
(PrintPackedMsg), `$7C03`/`$7CDE` (DVG list builders). The
**actual** still-un-disasm regions appear to be much smaller than
"20%" — most likely just sound routines, the per-character LUT
contents inside `$77E8`'s table, and possibly small data tables.
The "Missing ~20%" bullet below is preserved as a historical paper
trail; specific claims have been corrected inline in the research
docs that referenced them. Full sweep of remaining un-disasm
references deferred to when each subsystem's port step starts.

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
| Asteroid (small/med/large) | **14 / 15 / 0 (confirmed I-9d, 2026-05-24)** | Source `$701B-$7025` derives gs from size bits: small (bit 0 set) → `$E0` = 14, medium (bit 1 set) → `$F0` = 15, large (neither) → `$00` = 0. Under wrap-and-saturate, gs=14 wraps to a small visible size + gs=15 to medium + gs=0 to large. Earlier "0 / 1 / 2" estimate from demo-driven Rock1 spans was wrong direction (we measured at the wrong scaleMode assumption). |
| UFO (large/small) | 0-2 (guess) | UFO is SVEC-only; same scale-response curve as asteroids. |
| Characters | 0-2 (guess) | HUD readability — to verify against cabinet HUD footage. |
| Ship explosion fragments | varies per frame | Animation cycles through gs values. |

**Per-object confirmation map** (which port step reads which
callsite of `$7C03`):

| Callsite | Object drawn (likely) | Port step |
|---|---|---|
| `$725E`, `$72A2`, `$72BF` (inside `scoreLivesDraw`) | score digits / lives icon / copyright | I-7 trailer or I-12 |
| ~~`$6F48`~~ → **`$7018-$7027`** (after motion, falls into `$72FE`) | asteroid | **confirmed I-9d (gs=14/15/0)**. Earlier `$6F48` claim was wrong — that site is inside a high-score table draw routine. |
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
- **Missing ~20% of disassembly** (historical — see 2026-05-24
  update at top of file). Original list was: sound (R-G), RNG
  `$77B5` body, DVG-list builders, packed-string unpacking, and
  `$75EC`. **All except sound are now confirmed visible** in the
  local `Code.md`. Nicholas Mikstas's alternate disassembly
  (<https://github.com/nmikstas/asteroids-disassembly>) remains the
  fallback source for anything that does turn out to be missing.
  (NMI handler body — earlier listed here — was always visible at
  `$7B65`; the `$7CF3` confusion was the RESET handler. Resolved
  during R-A.)

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
| I-9 | Asteroid spawn + split mechanics | **done** (I-9c rotation animation dropped — alive asteroids static) |
| I-10 | Saucer AI + state machine | **done** (6 sub-steps; player-shot-vs-saucer pulled in mid-step; other collisions deferred to I-11) |
| I-11 | Collisions + scoring + lives + HUD | **done** (6 sub-steps; I-11d+f folded ship-collision into death flow; I-11g+h combined saucer pairs; BB-faithful collision restored; multi-resolve fix) |
| I-12 | Attract mode + power-on test pattern + credits + game-over flow | not started |
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
  replaces the $77D2/$77D5 LUT helper that reads from a vector-ROM
  table at `$57B9`; LUT-lookup *code* is fully visible, table
  *contents* are in VROM data), linear-
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
- **Hyperspace** (`$6E74` + `$7052-$7081`) — moved to I-13 (polish
  stage, not a port blocker). The RNG body (`$77B5`) is in fact
  fully visible — see 2026-05-24 update at top of file — so no real
  un-disasm dependency exists; deferral is purely a scope call.

### I-9 scope (done 2026-05-24)

I-9 covered seven sub-steps; the per-step plan expanded from the
original `not started` line above. Post-impl fixes for gameplay-feel
issues surfaced during play-testing are folded into the matching
sub-step bullets below.

- **I-9a wave spawn + RNG** — `$7168` newWaveInit (edge
  selection, asteroidsPerWave cap 11, max_rocks_for_ufo cap 10);
  `$77B5` 16-bit Galois LFSR; `$7203` perturbVelocity (4-RNG-call
  inter-axis decorrelation); `$7233` magnitude clamp [6, 31];
  `$7206-$720B` signedPerturb.
- **I-9b motion + wrap** — extends `$6F57` dispatch to
  asteroid slots `$00-$1A`; uses `Asteroid.advancePosition` (shared
  `$6FC7-$7016` pattern from I-8).
- **I-9c rotation animation** — **dropped**. Source `$701B-$7025`
  confirms alive asteroids are static; shape variety comes from
  bits 3-4 seeded at spawn (1 of 4 fixed Rock tumble poses per
  asteroid lifetime). Earlier "status += $10 per rotation step"
  claim was the exploding-asteroid path only.
- **I-9d draw + per-object gs** — `$7018-$7027` + `$72FE` alive
  draw path; per-size gs=14/15/0 via `$701B-$7025` (exploits mod-16
  wrap; design note in [`research_dvg.md §4`](research_dvg.md));
  shape from bits 3,4 via `$7365-$736A`. **Stale claim correction:**
  "asteroid draw site is `$6F48`" was wrong (that's high-score
  table) — actual site is `$7018-$7027` (inline after motion, falls
  into `$72FE`).
- **I-9e explosion animation** — `$6F64-$6F77` increment formula
  `(-status>>4)+1` per tick; `$6F82-$6F8E` cleanup. **Shape order:
  4→3→2→1** per `$50F8` jump table at `$10F8-$10FE` (Pattern 4 is
  smallest spread ±10-15, Pattern 1 is largest ±16-32 — concentric
  patterns play smallest-first to grow outward). **Across-sweep gs
  expansion** via source's `$7321` LABS emit with gs computed at
  `$6FA4-$6FA9` as `(status & $F0) + $10`, cycling
  $B→$C→$D→$E→$F→$0 across stages to double the shrapnel pattern
  each step via the same mod-16 wrap trick. **`$7324-$7339`
  `$90`/`$80`/`$70` emit loop** confirmed as no-op DVG padding per
  MAME's `avgdvg dvg_generate_vector_list` (only LABS modifies
  the DVG scale latch); see [`research_dvg.md §12`](research_dvg.md)
  for the resolved investigation.
- **I-9f wave-progression trailer** — `$6876-$6883`: drain
  `astdWaveTimer` and fire `newWaveInit` when both timer +
  `curAsteroidCount` hit zero. I-9a's dev-shim bootstrap call in
  `main.js` was removed (the trailer naturally fires wave 1 on
  frame 1 since both fields start at 0).
- **I-9g split-copy primitive** — `$6A9D-$6AD2` (status / position
  / velocity copy with random shape-variant bits); reuses I-9a's
  `$7203` perturb + `$7233` clamp; `$7630`/`$764A` sub-tile XOR
  jitter so children don't perfectly overlap. **Terminology cleanup
  folded in:** "rotation seed/bits" → "shape-variant seed/bits"
  across `task_seq.js` + `state.js` + research docs (source-listing's
  "rotation" misled into expecting visible spin).
- **I-9h shot-vs-asteroid collision** — `$69F0-$6A95` kernel
  (subset: outer = playerShots, inner = asteroids); `$6B0F`+`$75EC`
  resolver subset (shot kill, size LSR-downgrade, spawn ≤2 children
  via I-9g splitAsteroid, mark parent exploding `$A0`). **Radius
  correction:** source's `$6A22-$6A25` LSR/ROR is a 16-bit unsigned
  right shift (`$08 = |dx|/2`, NOT `|dx|`), so the `$6A55` table
  values (42/72/132) are halved-unit; effective radii in raw
  sub-tile units are **2× the table: 84/144/264** = 10.5/18/33 DVG
  ≈ Rock1 visible extent (resolves the deferred "collision feels
  tight vs cabinet" item from `research_collisions.md §7`).
  **Proximity gate widened** from `|dx|>1` to `|dx|>=2` (source
  accepts dx_hi ∈ `{0, 1, $FE, $FF}` = ±2 game units).

**Deferred from I-9 scope (re-open at I-11 unless noted):**
- **Other collision pairs** (ship-vs-asteroid, saucer-shot-vs-ship,
  ship-shot-vs-saucer, saucer-vs-asteroid) — natural I-11 scope.
- **Scoring + ship death + lives** — needs `$7397` BCD-add port +
  saucer score path at `$6B73-$6B90`. I-11.
- **Score-table size mismatch** — source's `$7659` is 2 bytes
  (`$10, $05`), classic docs say 20/50/100. Resolve during I-11
  against cabinet behavior or Mikstas annotations. See
  [`research_collisions.md §7`](research_collisions.md).
- **Saucer-adjustment block `$6A6B-$6A75` unreachable** — `$6A69`
  BNE always branches because A (= r or r+28) is never zero for
  any radius-table value. Either dead source code or a missing
  saucer-radius path elsewhere. Verify when I-11's saucer
  collision lands.
- **`$745A`/`$745C` slot-scanner body** — visible at `$7531+`
  but not decoded; I-9h uses `Array.find` as placeholder.
  Re-port during I-11 when the same `$75EC` handler fires for
  the additional collision pairs (spawned as a separate chip).
- **`$72FE` +4 game-unit Y offset** at `$7311-$7313` — HUD margin
  reservation (the bottom DVG rows y=[0,128) belong to score +
  lives). Apply during I-12 when HUD lands.

**Port deviations introduced during I-9 (documented at site):**
- **Euclidean collision** (vs source's BB ∩ Manhattan octagon) —
  documented at [`research_collisions.md §6`](research_collisions.md).
- **`Array.find` for free-slot search** — see above deferred entry.
- **Round-cap zero-length SVECs at 3px lineWidth** — canvas-side
  rendering decision for shrapnel sparks; no source counterpart
  (cabinet phosphor decay isn't a discrete pixel size). Player-shot
  dot stays at the I-8 4px to remain visually distinct from
  shrapnel debris. See `main.js drawSegment`.
- **Skip `$7324-$7339` `$90`-emit loop** — confirmed via MAME as
  no-op DVG padding; no visual effect when omitted.

### I-10 scope (done 2026-05-24)

I-10 covered six sub-steps; per-sub-step verification was done in
the dev console via `__game.saucer.*` mutation + state polling.
The sixth sub-step (I-10f, player-shot-vs-saucer collision + saucer
death animation) was pulled in mid-step after the I-10e play-test,
since the corresponding I-11-scope deferrals (other saucer
collisions, scoring, ship death) cleanly factor out.

- **I-10a saucer spawn + spawn-timer** — `$6B93-$6C33` saucer-spawn
  dispatch: every-4-frame gate, status check (alive → dispatch to
  active), ship/numPlayers/asteroid_hit_timer/max_rocks_for_ufo
  gating, `$02F8` saucerTimeReload SBC #$06 progression, position
  + horzVel set (left/right edge from `$60` bit 6, random Y from
  RNG >> 3 clamped to `[0, 23]`), size pick (large unless
  saucerTimeReload < $80; then score 30k+ → small, else
  saucerTimeReload/2 < RNG → small). New `Saucer.spawn(state,
  advanceRNG)` method. Also folded in: `$75F0` sets
  `asteroid_hit_timer = $50` on shot-vs-asteroid hit (the I-9h
  resolver got the one missing line that gates I-10a's behavior).
  New state fields: `saucerTimeReload` (init $92), `asteroid_hit_timer`,
  `shipSpawnTimer` (init **0** not source's cold-init 1 — port
  deviation, see note below), `scoreThousands` (placeholder for I-11).
- **I-10b saucer motion + direction-change + despawn** — extends
  `$6F57` dispatch over slot `$1C` to call `Saucer.advancePosition`;
  `$6C34-$6C44` periodic vertical direction-change firing when
  `fastTimer & 0x7F == 0` (twice per 256-frame cycle, since dispatch
  is itself every-4-frame gated → effectively ~once per 128 frames),
  RNG-indexed into 4-entry direction table at `$6CD3` (bytes
  `$F0, $00, $00, $10` = 50% zero, 25% down, 25% up); `$6FE2-$6FEA
  → $702D` despawn when saucer crosses either x-edge (source only
  checks high-edge AND #$1F wrap, but port extends to low-edge too
  since saucer's horzVel can be either sign). Despawn resets
  saucerTimer = saucerTimeReload for next-spawn countdown.
- **I-10c saucer draw** — `$737C-$7382` per-slot dispatcher case:
  JSR into VROM's `UFO` subroutine at `state.saucer.dvgPos()` with
  gs from `Saucer.globalScale()` = `$7018-$7025`'s mod-16 wrap
  (small status=1 → bit 0 set → gs=14; large status=2 → bit 1 set
  → gs=15). Small saucer visibly smaller than large — same wrap
  trick as asteroids (research_dvg.md §4). Verified visually.
- **I-10d saucer shoot** — `$6C45-$6CCD` shot dispatch (continuation
  of `saucerActive`): gate on `shipSpawnTimer == 0` (or attract
  mode); decrement `saucerTimer`; on hit-0, reset to `$0A`, compute
  `saucerShotDir`. Large saucer (status=2): random direction from
  RNG. Small saucer (status=1): aim at ship with self-velocity
  compensation (`dx = ship.x - saucer.x - saucer.vx/2`, dy same),
  `Math.atan2` for the 8-bit angle (port replaces `$76F0` slope-LUT
  + sign-quadrant reflections — angle is invariant under uniform
  scale, so source's `dx *= 4` scaling step is skipped), then
  `$6CAC-$6CC4` score-based noise (`<35k`: AND `$8F` + OR `$70` →
  signed `[-16, +15]`; `>=35k`: AND `$87` + OR `$78` → signed
  `[-8, +7]`). Spawn into first-free `state.saucerShots` slot via
  refactored `Shot.spawn(x, y, vx, vy, direction)` (was `spawn(ship)`
  — refactored to take explicit source state so both player + saucer
  fire paths share it). Verified: large saucer = uniform random
  direction; small saucer at (4,12) targeting ship at (28,12) =
  shots cluster around east with ±20° spread.
- **I-10e saucer-shot motion + draw** — extends `asteroidUpdate`
  loop over `state.saucerShots` (same `Shot.advancePosition` +
  `Shot.decrementLifetime` as player shots, slots `$1D-$1E` in
  source's `$6F57` dispatch); `drawSaucerShots` emits a dot per
  alive shot via the renderer's `drawDot` (same as `drawPlayerShots`).
- **I-10f player-shot-vs-saucer collision + saucer death animation**
  — pulled in mid-step (after I-10e play-test). Extends `collisions()`
  with shot-vs-saucer test after the asteroid inner loop: same
  Euclidean proximity test as I-9h, radius from `$6A55` table by
  saucer size bits (small=1 → r=84/256, large=2 → r=144/256;
  saucer-specific +18/+36 adjustments at `$6A6B-$6A75` confirmed
  UNREACHABLE per I-9 audit, so effective radii match small/medium
  asteroid values). `resolveShotVsSaucer` kills the shot + marks
  saucer exploding ($A0) + zeroes velocity, mirroring `$6B3C-$6B65`
  shot-path subset (scoring path `$6B73-$6B90` deferred to I-11).
  Asteroid-style explosion-anim added for saucer slot in
  `asteroidUpdate`: same negate/shift/increment formula as exploding
  asteroid; on completion ($6F99-$6F9F) clears status and resets
  `saucerTimer = saucerTimeReload` for next spawn countdown.
  `drawSaucer` renders Shrapnel cycling + across-sweep gs expansion
  for the exploding branch (identical formula to `drawAsteroids`'s
  exploding path — source's `$72FE` per-slot dispatcher falls through
  to the same `$7349-$7353` Shrapnel selector for any non-ship slot
  with status >= $80). Also gates the saucer collision behind a
  `shot.status === 0` check after the asteroid inner loop, to avoid
  a single shot resolving against both an asteroid AND the saucer
  in one frame (port deviation: source's `$6A94 JMP $69F9` aborts
  the inner loop on hit; our impl continues — gate compensates).

**Deferred from I-10 scope (re-open at I-11 unless noted):**
- **Other saucer collision pairs** — ship-vs-saucer, saucer-vs-asteroid,
  saucer-shot-vs-ship. (Player-shot-vs-saucer pulled into I-10f.)
  Natural I-11 scope alongside scoring + death/lives.
- **Saucer scoring** — `$6B73-$6B90` (200 large, 990 small) fires
  from player-shot-vs-saucer resolution at the `$6B45 BCS $6B73`
  branch. I-11 with BCD score adder `$7397`.
- **Ship death/respawn body** — `$7048-$704D` shipSpawnTimer decrement
  + `$706F-$707E` death transition + `$6B1E-$6B27` ship-hit resolution.
  Workaround in I-10a: `shipSpawnTimer` initialized to 0 (steady-state
  value when ship is alive), since the source's cold-init `1` would
  permanently block saucer shooting until the deferred decrement runs.

**Port deviations introduced during I-10 (documented at site):**
- **`Math.atan2` for `$76F0`** — replaces source's 16-entry slope-LUT
  at `$772F+` + sign-quadrant reflections. Angle invariant under
  uniform scale, so source's `dx *= 4` widening step is also skipped.
  Output convention matches `$77D2`/`$77D5` LUT input (verified by
  small-saucer aim test: saucer at (4,12), ship at (28,12) → shots
  cluster around east with ±20° spread per low-score noise mask).
- **`Array.find` for free saucer-shot slot** — same shortcut as
  I-9h's asteroid free-slot scan. Source uses `$6CF2-$6CFA` Y-decrement
  loop + `$0E` stop sentinel; port walks `state.saucerShots`.
- **Edge-symmetric despawn** — source's `$6FE2` only checks high-edge
  AND #$1F wrap, but in 8-bit position math the low-edge underflow
  also produces a wrapped value the source carries to `$6FE0 AND
  #$1F`. Port detects both edges explicitly in `Saucer.advancePosition`
  since Float64 doesn't naturally trigger the high-byte overflow.
- **Single-collision-per-shot gate** — added in I-10f. Source's `$6A94
  JMP $69F9` aborts the inner loop on hit so one shot resolves at
  most one pair per frame; I-9h's port continues the inner loop. I-10f
  adds an explicit `if (shot.status === 0) continue` after the
  asteroid inner loop so the shot-vs-saucer test can't fire on a
  shot that just killed an asteroid.
- **Euclidean for shot-vs-saucer** — inherited from I-9h's asteroid
  port deviation. Same code path. See `research_collisions.md §6`.
  **Reverted to BB in I-11** (see I-11 scope below); this entry is
  preserved for historical paper trail of when the deviation lived.

### I-11 scope (done 2026-05-25)

I-11 covered six in-session sub-steps, planned as eight in
`plan_i11.md` but collapsed via two foldings (I-11d+f for
play-testable death; I-11g+h for combined saucer collision pairs).
Per-sub-step commits served as save points during the session;
they were squashed into one `impl I-11` commit at the end matching
the I-8/I-9/I-10 commit shape.

- **I-11a HUD render** — score + lives, BCD digits + ship-icon
  rendering. Decoded from `research_hud_coords.md`:
  - `$7C03` LABS-emit helper: A register → DVG-X, X register → DVG-Y,
    both ×4 (CPU register names are OPPOSITE the DVG coordinate they
    drive — v1 mis-decoded this). HUD callsites: player-1 score at
    DVG `(100, 876)` gs=1 (`$725E`), player-1 lives at DVG `(160, 852)`
    gs=14 (`$6F48`).
  - `$72FE` `+$0400 / 8 = +128` DVG-y playfield offset added to every
    actor's `dvgPos()` (`asteroid.js` / `ship.js` / `saucer.js` /
    `shot.js` all read `PLAYFIELD_Y_OFFSET` from `world.js`). The
    +128 reserves the bottom of the visible cabinet region for HUD;
    earlier port omitted this since HUD wasn't yet rendering.
  - `toCanvasY = 900 - dvgY` (was `canvas.height - dvgY`); the +4 px
    slack past the test-pattern visible rectangle prevents digit
    tops from clipping at canvas y=0.
  - State changes: `scoreThousands` re-typed decimal → BCD byte;
    new `scoreTens` BCD byte; new `curShips` (init 3 from
    `$6925-$6927` numShipsPerGame DIP); `numPlayers` cold-init
    flipped 0 → 1 (I-12 will make this dynamic via `$6885`
    playerMgmt).
  - Digit-0 renders as `Char_O` via the `$56D4` cross-reference
    table — VROM has no `Char_0` glyph; the table maps digit-0 to
    `Char_O`'s body at `$55BA` ([research_hud_coords.md §6.1]).
- **I-11b BCD score-add + shot-vs-asteroid scoring** —
  `$7397-$73B1` SED-mode ADC port via `bcdAdd(a, b, carryIn)`
  helper (per-nibble adjust if sum ≥ 10). `addScore(state, byte)`
  applies the adder to `scoreTens` then propagates carry to
  `scoreThousands`. `$73A4-$73AE` bonus-life trigger when the 10k
  digit (high nibble of `scoreThousands`) increments — `state.curShips
  += 1`. **Score-table mystery resolved by port deviation:** source's
  `$75FF LSR / TAX` indexes the 3-byte table at `$7659` `[$10, $05,
  $02]`, but the LSR collapses large+small both to X=2 and pushes
  medium to X=3 (out-of-table). Port uses a direct size-bit dispatch
  matching cabinet scoring: `small=$10 (100 pts)`, `medium=$05 (50
  pts)`, `large=$02 (20 pts)`. **Plan_i11.md typo flagged:** that
  doc lists the lookup as `{small: $01, medium: $05, large: $10}` —
  labels swapped vs cabinet. The verify section ("Shoot large → 00020,
  medium → 00070, small → 00170") is the source-of-truth; cabinet-
  faithful values used. Also folded in: **multi-resolve fix** —
  source's `$6A94 JMP $69F9` aborts the inner loop on hit; I-9h's
  port continued. Added `break` after each resolve in all collision
  pairs. Latent until scoring made it observable.
- **I-11c shot-vs-saucer scoring + saucerTimer re-arm** —
  `$6B73-$6B90`: `saucerTimer = saucerTimeReload` unconditional
  re-arm (no longer waiting for explosion-completion at `$6F99`),
  then `$6B79` `numPlayers != 0` gate, then scoring via `LSR` on
  saucer status — small (status=1) = `$99 BCD = 990 pts`, large
  (status=2) = `$20 BCD = 200 pts`. Sound timer `$6B56 STA $69`
  still deferred to R-G.
- **I-11d+f ship state machine + ship-vs-asteroid collision** —
  ship death/respawn body finally lands. `Ship.kill(state)`:
  status=$A0, vx=vy=0, `curShips -= 1`, `shipSpawnTimer = $81`
  (129-frame respawn delay) per `$706F-$707E` + `$6B1E-$6B27`.
  `Ship.respawn(state)`: status=1, position=(16.375, 12.375)
  per `$71E8`'s `hposhShip $10 / hposlShip $60 / vposhShip $0C /
  vposlShip $60`. `Ship.placeAtCenter()` for explosion-end cleanup
  at `$6F93` (places ship + status=0; shipSpawnPhys keeps ticking
  timer until status=1). `Ship.canSafelyRespawn(state)`: `$7139`
  scan of saucer + all asteroids for `|dx| < 4 AND |dy| < 4`
  (non-wrap-aware per source's high-byte SBC + CMP #$04/#$FC
  pattern). `shipSpawnPhys` body extended for `$703F-$7085`:
  numPlayers + status>=$80 skip → timer countdown → on-zero
  safe-respawn check + saucer-alive 2-frame defer → respawn.
  Ship cold-init flipped to `status=0` + `shipSpawnTimer=1`
  matching `$68F2` (was `status=1` workaround in I-7).
  asteroidUpdate ship-slot branch: exploding-anim with fastTimer-
  bit-0 carry-in per `$6F62-$6F77` (ship explodes one frame slower
  than asteroid). drawShip exploding branch kept skipping render
  here — I-11e adds the visible fragments. **Folded in I-11f:**
  ship-vs-asteroid collision with `$6A67 ADC #$1C` ship-radius
  adjustment (+28 halved-unit = +56 raw / 256 game-coord), so
  ship hit-radii: small=(84+56)/256, medium=(144+56)/256,
  large=(264+56)/256. On hit, both die + score via
  `killAsteroid(state, ast, true)`. Folded in because ship-vs-
  asteroid is the only natural way to test ship death through
  gameplay (without it, only dev-console `__game.ship.kill()`
  works). **Temp lives-replenish stub** in `Ship.kill`: when
  curShips hits 0, reset to 3 — keeps testing past the 3rd
  death until I-12 lands the real game-over → attract-mode
  transition via `$6885` playerMgmt. Hyperspace (`$7052-$7081`)
  still deferred to I-13.
- **I-11e ship explosion 6-fragment render** —
  `$7465-$7508` animator from
  [`research_ship_explosion.md`](research_ship_explosion.md).
  `Ship.shipExplosionFragments` field holds 6 × `{x, y}` game-
  coord offsets from ship death position. `Ship.kill` initializes
  fragment offsets from `SHIP_EXPLOSION_VELOCITY` table at
  `$50EC-$50F6` (already in `vector_rom_data.js`).
  `Ship.advanceExplosionFragments()` ticks per frame.
  `drawShip`'s exploding branch emits one SVEC per active fragment
  via new `renderer.drawShipExplosionPiece(idx, cursor, gs, alpha)`.
  Active fragment count from `((~status) & 0x70) >> 4`: 6 at $A0
  decaying to 1 at $F0. **Six port deviations** documented inline
  in `ship.js` + `main.js`:
  1. **Init `/96` instead of source's `/16`** — source-faithful gave
     fragment offsets up to 4.4 game-units (way wider than cabinet);
     tuned empirically against user-provided cabinet snapshot.
  2. **Drift `/4096` per frame** instead of source's effective `/256` —
     source-faithful gave 15 game-unit drift across the ~36-frame
     lifetime (off-screen by half-lifetime); tuned to keep fragments
     near the ship's death point.
  3. **Fixed `gs = 0`** instead of source's per-status-bit cycling
     (0/14/15). Source's cycling relies on CRT phosphor decay to
     visually integrate into a "growing star"; on canvas (which
     clears each frame) the cycling reads as bullet/comet shape-
     morphing. Fixed gs gives stable per-fragment shape.
  4. **Render as oriented filled rectangle** (rotated `fillRect`)
     instead of stroked line. Short stroked lines with any lineCap
     produce a teardrop appearance because cap/AA-end pixels are
     comparable in size to the line. Oriented rect (3 px thick,
     SVEC length) gives uniform thickness with sharp ends.
  5. **Single SVEC per fragment** (no double-emit + EOR #$04). Source's
     double-emit was a CRT phosphor brightness-reinforcement trick;
     not visible on cabinet per user observation; canvas doesn't
     have phosphor accumulation. Single emit, full alpha + thicker
     line compensate.
  6. **Alpha fade `1.0 → 0.2`** across the status range. Approximates
     cabinet's phosphor-decay fade-out. Linear ramp keyed to status.
- **I-11g+h saucer-shot + saucer-body collisions** —
  Four new collision pairs added to the `collisions` function:
  - **Saucer-shot vs ship** (outer X=2,3): kill shot + `Ship.kill`.
    Ship target → table picks `$2A` (small-asteroid-equivalent
    radius = 84/256). No `$1C` shooter adjustment (X != 0). No
    score path for this pair.
  - **Saucer-shot vs asteroid**: kill shot + `killAsteroid(false)`
    — no score (saucer shooter fails `$75EC`'s `$760E-$7612` gate
    `BCC` when shooter index < 4).
  - **Saucer-body vs ship** (outer X=1): both die. Score saucer
    points (200/990) via source's `$6B0F-$6B19` X-swap to ship-
    shooter semantic; `$6B73-$6B76` re-arms `saucerTimer` at hit
    time; `$6B79` numPlayers gate; `$6B81-$6B8B` LSR-on-saucer-
    status picks `$99` (small) or `$20` (large).
  - **Saucer-body vs asteroid**: both die, no score (same shooter-
    gate). Saucer marked exploding via the existing $A0 path;
    saucerTimer re-arms at explosion-completion (`$6F99-$6F9F`),
    not at hit time.
  All four use BB collision (matching the rest after the revert).
  Saucer geometry uses `$6A55-$6A61`'s LSR-on-saucer-status chain
  to pick `$2A`/`$48` (small/large saucer hit-radius).

**Deferred from I-11 scope (re-open at I-12 unless noted):**
- **Game-over flow + attract-mode transition** — `$6885` playerMgmt
  decides "player ran out of ships" branch; per-PC sync via
  `$0300` ply2RAM (banked at `$3200` bit 3). I-12 with attract mode.
  The temp lives-replenish stub in `Ship.kill` retires when this
  lands.
- **2-player HUD branch** (`$7286-$72FA`) and **high-score display +
  entry** (`$72A2`, `$72BF`, `$73F7`) — I-12.
- **Hyperspace** (`$7052-$7081`) — I-13.
- **Sound** — all `STA $69`/`STA $6B`-style timer writes, including
  bonus-ship sound at `$73A8`. R-G.
- **`$745A` / `$745C` slot-scanner body** — still using `Array.find`
  placeholder from I-9. Future cleanup chip; not gameplay-affecting.
- **Leading-zero suppression in HUD digits** — currently all 5
  digits render (with `Char_O` for nibble=0). If cabinet shows
  leading-zero suppression in any DIP setting, revisit.

**Port deviations introduced (or restored) during I-11:**
- **BB collision restored** for all pairs (ship-vs-asteroid,
  player-shot-vs-asteroid, player-shot-vs-saucer, saucer-shot-vs-*,
  saucer-vs-*). Earlier port deviation (Euclidean since I-9h) missed
  the ~21% of source-valid hits where `|dx|` AND `|dy|` are both
  near `r` — visible as "ship-vs-asteroid feels too forgiving" user
  observation 2026-05-25.
- **Direct size→BCD score lookup** at `asteroidScoreByte` instead
  of source's `$75FF LSR / TAX` indexing. Source's path doesn't
  cleanly index the 3-byte score table (LSR collapses two sizes to
  the same index; one size reads past the table). Port uses
  `{small: $10, medium: $05, large: $02}` direct dispatch matching
  cabinet scoring.
- **Temp lives-replenish in `Ship.kill`** — sets `curShips = 3` when
  it would hit 0. Removed by I-12.
- **Six ship-explosion render deviations** in `Ship.kill` /
  `advanceExplosionFragments` / `drawShipExplosionPiece` (see I-11e
  bullet above). Source's render relies on CRT phosphor integration
  that doesn't translate to canvas; deviations approximate the
  perceived cabinet effect (slow drift, fixed shape, alpha fade).
- **Multi-resolve fix** (added inner-loop `break` after each
  resolve) — actually restores source faithfulness (`$6A94 JMP
  $69F9`); I-9h's port had missed it. Not a deviation; bug fix.

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
