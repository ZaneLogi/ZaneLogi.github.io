# CLAUDE.md — asteroids_clone

Guidance for Claude Code when working in this directory. Read this
before making changes here; it overrides the repo-root CLAUDE.md.

## What this is

A faithful HTML5 + ES6 port of Atari **Asteroids** (1979). "Faithful"
is load-bearing: behavior should match the original ROM, not a
modernized re-imagining. When in doubt, **read the 6502 source
disassembly** before designing.

- Vector-display arcade game (1024×1024 vector coordinate space,
  origin lower-left) — the **first vector-display port in this repo**
- No build step, no npm — open `index.html` via the project's local
  HTTP server (`python -m http.server -b 127.0.0.1 8080` from the repo
  root, then `/asteroids_clone/`)
- ES6 modules load directly in the browser

## Project stage

**Research stage — no gameplay code yet.** This branch starts with
only this CLAUDE.md. The next commits will be research docs under
`docs/`, then a standalone DVG-interpreter prototype, then the
runtime skeleton, then per-subsystem ports.

Do not start writing gameplay code until at least the DVG and
hardware research docs land.

## Source of truth

Local sparse-checkout of the official ComputerArcheology repo. The
absolute path is **per-PC** — fill in the other-PC path when it's
known:

- `C:\Z_Temp\computer_archeology_asteroids\content\Arcade\Asteroids\` (this PC)
- *(other-PC path — to be filled in)*

Upstream: <https://github.com/topherCantrell/computerarcheology>
(rendered at <https://www.computerarcheology.com/Arcade/Asteroids/>).
Sparse-checkout is configured for `content/Arcade/Asteroids` only;
the upstream repo covers many arcade games.

Asteroids runs on a **MOS 6502** main CPU at 1.5 MHz with a 250 Hz
interrupt (not a 60 Hz vsync — see `Hardware.md`). Display is the
**DVG** (Digital Vector Generator) custom processor sharing the bus
with the 6502.

Key files in the local clone:

| File           | Size    | Contents                                    |
|----------------|---------|---------------------------------------------|
| `Code.md`      | ~187 KB | Full 6502 disassembly with commentary       |
| `Hardware.md`  | 3 KB    | CPU, memory, display, sound, input          |
| `RAMUse.md`    | 10 KB   | RAM map ($0000-$03FF) with labels           |
| `DVG.md`       | 8 KB    | DVG opcode set, scale/brightness model      |
| `VectorROM.md` | 72 KB   | Vector ROM (sprites for ship/asteroid/UFO/letters) |
| `VectorROM1.md`| 70 KB   | Vector ROM variant (revision differences)   |
| `Journal.md`   | < 1 KB  | Research journal (mostly empty)             |
| `roms/`        | —       | Raw ROM dumps                               |

Per upstream, the disassembly is ~80% complete. The missing ~20%
clusters around: sound routines, NMI handler body ($7CF3), the RNG
implementation ($77B5), DVG-list builders, and packed message
unpacking. Nicholas Mikstas's alternate disassembly
(<https://www.nicholasmikstas.com/games/>) is the fallback source for
the gaps.

**Convention:** every non-trivial JS function should cite its 6502
counterpart in a comment, e.g. `// $6F57 — Code.md:asteroidUpdate`.
Use the source label name (`$680C`, `$6F57`, `asteroidUpdate`) — do
**not** invent line numbers; `Code.md` lines drift as upstream
updates. This is the same discipline as phoenix_clone and
galaga_clone.

## Architecture choice — routine-level translation

The repo-root CLAUDE.md "Architecture principle for retro ports"
section describes two viable architectures: **routine-level
translation** and **screen-RAM mapping**. For Asteroids the choice
is unambiguous: **routine-level translation**.

Reasoning (per the framework's research-stage criteria):

1. **Screen-RAM-readback site count = 0.** Vector display has no
   raster screen RAM in the gameplay-readback sense. The DVG display
   list is write-only from the CPU's view — CPU constructs the list
   in vector RAM, DVG reads it for drawing only, gameplay code never
   reads it back.
2. **No core mechanic depends on screen state.** Collision is purely
   geometric (distance thresholds between object positions), not
   pixel/tile lookup.
3. **Mechanism vs coincidence.** N/A — there's no screen-RAM
   readback to even classify.
4. **Source is neither pixel- nor tile-buffered.** It's vector-
   buffered. Canvas's line-drawing API (`moveTo`/`lineTo`/`stroke`)
   maps 1:1 to DVG draw commands without any intermediate buffer.

So the port is: 6502 routines → JS functions with `$xxxx` citations,
gameplay state lives in JS objects (matching the $0200-$03FF object
tables), the DVG is a small interpreter (~100 LOC) emitting canvas
calls, vector ROM ports as JS draw subroutines.

## What we already know (from initial source scouting)

These come from a pre-research pass over the overview, Hardware.md,
DVG.md, RAMUse.md, and the Code.md table-of-contents. Treat them as
working hypotheses — replace with cited facts in the research docs.

- **Top-level dispatch** at `$6800`: fixed 6-step task sequence
  (input/credit → saucer → ship → asteroids → collisions → draw).
- **Object tables** at $0200-$03FF: 27 asteroids + 1 ship + 1 saucer
  + 2 saucer-shots + 4 player-shots, each as parallel arrays of
  `status / vx / vy / x_hi / y_hi / x_lo / y_lo`. 16-bit positions
  (hi byte + lo byte), 8-bit velocities, carry-propagated addition.
- **DVG** has 7 opcodes (VEC, LABS, SVEC, HALT, JSR, RTS, JMP),
  brightness 0-15, global+local scale, 4-deep call stack. See
  `DVG.md`.
- **Two-player RAM banking** via `$3200` bit 3 (mask `$04`) — swaps
  the $0200-$03FF region between players. Port as two state objects +
  active pointer (no need to literally bank memory). See
  `docs/research_hardware.md §2 + §6`.
- **250 Hz NMI** at `$7B65` (not `$7CF3` — that's RESET): does
  stack-sanity, counter ticks (`$5E`, `$5B`), lamp output, and one
  sound channel. Game logic runs in the main loop at **~62.5 Hz**,
  gated by `$5B` via `LSR/BCC` at `$6811`. See
  `docs/research_hardware.md §3-§4`.
- **Sound is 8 hardware-generated channels** at $3600-$3E00, not
  samples. Faithful path is Web Audio synthesis; visual-effect path
  is sampled playback. Defer until silent game runs end-to-end.

## Research-stage plan

Each doc lives in `docs/`. Order is roughly the dependency order; the
DVG prototype (R-B) is the first runnable artifact.

| # | Doc                            | Focus                                                       |
|---|--------------------------------|-------------------------------------------------------------|
| R-A | `research_hardware.md`       | 6502 model, memory map, 250 Hz interrupt vs frame rate      |
| R-B | `research_dvg.md`            | All 7 opcodes, canvas mapping, scale/brightness, stack — research-only (interpreter implementation deferred to implementation phase) |
| R-C | `research_position_math.md`  | 16-bit position + 8-bit velocity carry-propagation, sub-pixel motion, toroidal screen wrap |
| R-D | `research_main_loop.md`      | $6800 dispatch, 6-step task sequence, ship/saucer state machines, NMI handler $7CF3 (in the missing 20%) |
| R-E | `research_collisions.md`     | Distance-threshold geometry, asteroid-size encoding, fragmentation dispatch |
| R-F | `research_vector_rom.md`     | Port the 2 KB vector ROM as JS draw subroutines              |
| R-G | `research_sound.md`          | Deferred — characterize 8-channel synthesis model after silent game runs |

All R-* docs are paper-only — the DVG prototype originally planned
for R-B was dropped 2026-05-22 (architecture validation already done
by root CLAUDE.md framework reasoning; DVG.md fully specifies the
opcode set; canvas mapping is mechanical). The first runnable
artifact lands as the first commit of the implementation phase
(DVG interpreter, working from R-B's spec).

## Documentation

- `docs/progress.md` — research-stage tracker. Read this first when
  resuming work to see what's in progress and what's next. Will grow
  an implementation-step section once research clarifies the
  subsystems.
- `docs/DOCUMENTATION_INDEX.md` — navigation map across all research
  docs (Quick Navigation table, Architecture Overview, Cross-Document
  Reference Map). Currently a stub; will be populated once 2-3
  research docs exist and cross-referencing earns its keep.

## Conventions inherited from sibling projects

These come from feedback on phoenix_clone / galaga_clone and apply
here equally:

- **No worktrees.** Work directly on the `asteroids_clone` branch —
  the auto-worktree flow hides edits from VSCode and adds friction
  on this repo.
- **Terse commit subjects.** Cite the research-doc section in the
  body when there's depth to point at; don't restate design
  rationale that already lives in the doc.
- **Ask before commit.** Always propose the commit message and wait
  for confirmation before running `git commit`.
- **Cross-PC: one PC at a time.** Pull at the start of every session,
  push at the end. Force-push is OK when it's the better choice, but
  confirm first. See repo-root `CLAUDE.md` "Cross-PC workflow".
- **Rich commit messages OR rich research docs.** Cross-PC sync
  happens via committed content only — anything the other-PC me
  would want to know belongs in a commit message, doc, or this file.
