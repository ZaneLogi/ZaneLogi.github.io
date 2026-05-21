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

R-A through R-F all done. Research stage substantially complete. Next steps are either: populate `DOCUMENTATION_INDEX.md` (now that 6 research docs exist and cross-referencing earns its keep), or start the implementation phase (first commit: DVG interpreter from R-B's spec).

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

To be populated as research clarifies the subsystems. Preliminary
rough order (not committed): scaffold → **DVG interpreter + canvas
runtime (first implementation commit, from R-B spec)** → object
tables + main loop → ship physics → asteroid spawn/split → saucer
AI → collisions + scoring → attract mode → polish → sound.
