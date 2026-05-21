# asteroids_clone — progress

Research-stage tracker. Read this when resuming work to see what's in
progress and what's next. Once research clarifies the implementation
subsystems, this doc will grow an implementation-step section.

## Research stage

Each doc lives under `docs/`. Order is dependency order; **R-B is the
first runnable artifact** — a standalone DVG-interpreter prototype
that validates the architecture choice end-to-end before any gameplay
code is written.

| # | Doc | Focus | Status |
|---|---|---|---|
| R-A | `research_hardware.md` | 6502, memory map, 250 Hz interrupt vs frame rate | not started |
| R-B | `research_dvg.md` | DVG opcodes + canvas mapping + standalone prototype | not started |
| R-C | `research_position_math.md` | 16-bit position carry, sub-pixel motion, toroidal wrap | not started |
| R-D | `research_main_loop.md` | $6800 dispatch, 6-step task sequence, NMI $7CF3 | not started |
| R-E | `research_collisions.md` | Distance-threshold geometry, asteroid-size encoding | not started |
| R-F | `research_vector_rom.md` | Port the 2 KB vector ROM as JS draw subroutines | not started |
| R-G | `research_sound.md` | 8-channel hardware synthesis | deferred until silent game runs |

Status values: `not started` | `in progress` | `done` | `deferred`.

## Current focus

None yet — about to start R-A.

## Open questions surfaced during scouting

These came from the pre-research pass over the source overview,
`Hardware.md`, `DVG.md`, and the `Code.md` table-of-contents. Each
will be addressed in the relevant research doc when reached.

- **250 Hz interrupt content** (R-A / R-D): coin/timer/sound polling
  vs frame rendering? Splits the NMI handler `$7CF3` from the main
  loop.
- **16-bit position math** (R-C): faithful `{hi, lo}` byte pair
  (drift-free, byte-accurate) vs JS `Float64` (cleaner code, drift
  risk over long sessions). Trade-off worth a §-level discussion.
- **Vector glow rendering** (R-B): CRT artifact, not in ROM — port-
  side visual decision. Decide before the DVG prototype lands.
- **Missing ~20% of disassembly**: clusters around sound (R-G), NMI
  handler body (R-D), RNG `$77B5`, DVG-list builders, and packed-
  string unpacking. Nicholas Mikstas's alternate disassembly
  (<https://www.nicholasmikstas.com/games/>) is the fallback source.

## Implementation steps

To be populated as research clarifies the subsystems. Preliminary
rough order (not committed): scaffold → DVG interpreter + canvas
runtime → object tables + main loop → ship physics → asteroid
spawn/split → saucer AI → collisions + scoring → attract mode →
polish → sound.
