# CLAUDE.md — phoenix_clone

Guidance for Claude Code when working in this directory. Read this
before making changes here; it overrides the repo-root CLAUDE.md.

## What this is

A faithful HTML5 + ES6 port of Amstar/Centuri **Phoenix** (1980).
"Faithful" is the load-bearing word: behavior should match the
original ROM, not a modernized re-imagining. When in doubt, **read the
source disassembly** before designing.

- Vertical-screen arcade game (resolution TBD — confirm during
  coordinate-system research)
- No build step, no npm — open `index.html` via the project's local
  HTTP server (`python -m http.server -b 127.0.0.1 8080` from the repo
  root, then `/phoenix_clone/`)
- ES6 modules load directly in the browser

## Source of truth

Local clone (sparse-checkout of the official ComputerArcheology repo).
The path is **per-PC** — both currently in use, depending on which PC
you're on:

- `D:\tmp\computer_archeology_phonenix\content\Arcade\Phoenix\`
- `C:\Z_Temp\computer_archeology_phoenix\content\Arcade\Phoenix\`

Use whichever exists locally. The "phonenix" typo in the first path
preserves an existing directory name and is not worth renaming. The
research docs under `docs/` cite source files by relative name only
(`Code.md`, `RAMUse.md`, etc.); the absolute path lives only here.

Upstream: <https://github.com/topherCantrell/computerarcheology>
(rendered at <https://www.computerarcheology.com/Arcade/Phoenix/>).

Phoenix runs on an **8085** main CPU (a Z80-translated variant exists
at <https://github.com/Sorbas2020/Phoenix> as a secondary cross-
reference). Use the 8085 listing as canonical; cross-check against
MAME (`mame/src/mame/phoenix/phoenix.cpp`) where helpful.

Key files in the local clone:

| File          | Contents                                       |
|---------------|------------------------------------------------|
| `Code.md`     | Full 8085 disassembly with commentary (~410 KB) |
| `Hardware.md` | CPU, memory, I/O, sound, video                 |
| `RAMUse.md`   | RAM map with labels                            |
| `proms.md`    | Color PROM dumps and palette structure         |
| `bgtiles.md`  | Background tile data                           |
| `fgtiles.md`  | Foreground tile data                           |
| `Journal.md`  | Peter's research journal                       |

**Convention:** every non-trivial function should cite its 8085
counterpart in a comment, e.g. `// L09BA — Code.md:GetScreenRamAddress`.
Use the Code.md label name (e.g. `L09BA`, `WaitVBlankCoin`) — do not
invent line numbers, since `Code.md` lines drift as upstream updates.
Keep this discipline — it makes verification possible.

## Architecture

Phoenix has **no task-table dispatcher** (unlike Galaga). The main
loop is three phases: `WaitVBlankCoin → GameStateMachine →
UpdateScoresAndSound`. The JS port should mirror this directly with a
single fixed-timestep tick + GameState `switch`. See
`docs/research_code_flow.md` §5 for the recommended `main.js` shape
and file layout.

## Phoenix-specific things to research before coding

Research docs live under `docs/`. Done — see the corresponding files:

1. ✅ **Code flow** — `docs/research_code_flow.md` (the spine — main
   loop, GameState dispatch, per-frame structure)
2. ✅ **Hardware & memory map** — `docs/research_hardware.md`
3. ✅ **Coordinate system & display** — `docs/research_coordinate_system.md`
4. ✅ **Stage structure** — `docs/research_stage_structure.md`
5. ✅ **Rendering & collision** — `docs/research_rendering.md` (sprite
   decoding, object-list state, render pipeline, AABB collision,
   mothership shield damage worked example)

Still open (do these before serious gameplay code):

6. **Enemy motion / attack patterns** — per-stage bird behavior,
   formations, swoop curves, egg-to-bird hatching
7. **Player mechanics + shield** — movement, firing, timed shield
   (Phoenix's distinguishing feature)
8. **Mothership stage** — destructible shield-block layers, mothership
   AI, win condition

Deferred:

9. **Sound** — Phoenix has no sound CPU; sound is direct memory-mapped
   bit-fields driving an MN6221AA melody chip. Only matters for audio
   fidelity. See `research_hardware.md` §5.

## Verification workflow

1. Find the 8085 routine by label (e.g. `f_XXXX`) in the
   computerarcheology listing or a local clone.
2. Read the function. Note any RAM labels it touches.
3. Find the data tables it references.
4. Port the *logic*, not the *aesthetics*. Goto + flag-check is fine
   in JS if it matches the 8085.
5. Cite the function and source line in a comment.
6. Use the dev panel (once it exists) to toggle the new task on alone
   and verify visually.

## Documentation

- `docs/progress.md` — implementation step tracker. Read this first
  when resuming work to see which step is in progress and what's next.
  Conventions for editing are in the doc itself.
- `architecture.html` *(planned)* — design + code-flow map (mirrors
  galaga_clone's architecture.html); intended as the resume-point
  visual once the project takes more shape.

When you discover something — a corrected value, a behavior the doc
glossed over, a fixed table — update the matching doc in the same
change. Stale diagrams are worse than missing ones.
