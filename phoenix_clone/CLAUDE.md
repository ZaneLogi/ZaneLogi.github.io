# CLAUDE.md — phoenix_clone

Guidance for Claude Code when working in this directory. Read this
before making changes here; it overrides the repo-root CLAUDE.md.

## What this is

A faithful HTML5 + ES6 port of Amstar/Centuri **Phoenix** (1980).
"Faithful" is the load-bearing word: behavior should match the
original ROM, not a modernized re-imagining. When in doubt, **read the
source disassembly** before designing.

- Vertical-screen arcade game (208×256 portrait canvas)
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

| File          | Contents                                        |
|---------------|-------------------------------------------------|
| `Code.md`     | Full 8085 disassembly with commentary (~410 KB) |
| `Hardware.md` | CPU, memory, I/O, sound, video                  |
| `RAMUse.md`   | RAM map with labels                             |
| `proms.md`    | Color PROM dumps and palette structure          |
| `bgtiles.md`  | Background tile data                            |
| `fgtiles.md`  | Foreground tile data                            |
| `Journal.md`  | Peter's research journal                        |

**Convention:** every non-trivial function should cite its 8085
counterpart in a comment, e.g. `// L09BA — Code.md:GetScreenRamAddress`.
Use the Code.md label name (e.g. `L09BA`, `WaitVBlankCoin`) — do not
invent line numbers, since `Code.md` lines drift as upstream updates.
Keep this discipline — it makes verification possible.

## Key facts (quick reference)

### The ten big quirks

1. **No sprite chip** — all objects are software-blitted as tile writes
2. **8 pre-shifted shape variants** — account for sub-tile (pixel-level) motion
3. **8-frame animation cycle** — player sprite frame = `X % 8`
4. **4-frame round-robin** — alien updates fire every 4th frame (~15 Hz)
5. **Polled VBLANK, no interrupts** — single per-frame tick, no concurrency
6. **Two tile planes** — FG + BG, both 32×26; BG scrolls each frame
7. **Display rotated 90°** — portrait cabinet; raw memory is landscape
8. **Active-low input byte** — button press = bit becomes 0, not 1
9. **Path-following aliens** — not free-roaming; follow ROM motion tables (T1700 + T1000–T13D0)
10. **Shield is the 4th button** — Phoenix-specific; tied to a shield state machine

### Update rates

| What                  | Routine                       | Rate           |
|-----------------------|-------------------------------|----------------|
| Input polling         | WaitVBlankCoin                | 60 Hz          |
| Player movement       | MovePlayer (L0900)            | 60 Hz          |
| Player animation      | L0926                         | 60 Hz          |
| Alien movement        | AlienMovementUpdate (L0D1C)   | 15 Hz (÷4)     |
| Alien animation       | AlienAnimationUpdate (L0D70)  | 15 Hz, offset  |
| Sound writes          | UpdateScoresAndSound (L2700)  | 60 Hz          |
| Background scroll     | per-frame increment           | 60 Hz          |

### Three coordinate systems

| System       | Origin    | Units              | Used for                        |
|--------------|-----------|--------------------|---------------------------------|
| Grid         | Top-left  | 1 byte per axis    | Object position storage in RAM  |
| Display      | Top-left  | Pixels (8-aligned) | Tile rendering, player-visible  |
| Screen RAM   | Stride    | Pointer arithmetic | Low-level tile writes           |

[Detail: `docs/research_coordinate_system.md`]

## Architecture

Phoenix has **no task-table dispatcher** (unlike Galaga). The main
loop is three phases:

```
WaitVBlankCoin → GameStateMachine → UpdateScoresAndSound
```

The JS port must mirror this directly: a single fixed-timestep tick +
`GameState` switch. Do **not** introduce ECS, task schedulers, or
generalized engines. See `docs/research_code_flow.md §5` for the
recommended `main.js` shape and file layout.

## Memory routing — read only what you need

Before opening any doc, use this table to identify the minimum set.

| Symptom / task                    | Read first                                                           | Skip                          |
|-----------------------------------|----------------------------------------------------------------------|-------------------------------|
| Gameplay logic / GameState bug    | `docs/research_code_flow.md`, `RAMUse.md`, `Hardware.md §CPU/RAM`   | enemy motion, rendering       |
| Rendering / sprite / visual bug   | `docs/research_rendering.md`, `Hardware.md §video`, `RAMUse.md`     | enemy motion (unless anim.)   |
| Enemy / AI / movement bug         | `docs/research_enemy_motion.md`, `Code.md` (T1700/T1000–T13D0), `RAMUse.md` | stage structure, player |
| Stage structure / progression bug | `docs/research_stage_structure.md`, `docs/research_code_flow.md`    | rendering, hardware           |
| Unknown / debugging cold          | `RAMUse.md` → `docs/research_code_flow.md` → expand only if needed  | everything else initially     |

`docs/DOCUMENTATION_INDEX.md` is a cross-reference map across all seven
research docs — use it to locate a specific routine or concept without
reading entire files.

## Token control rules

- **Never** read all research docs together unless explicitly required.
- **Never** re-read `Code.md` unless a specific function is unknown —
  it is ~8 000 lines; find the routine by label, read only that block.
- When discovering a correction, update **only** the relevant doc
  section; do not rewrite entire files.
- Prefer incremental understanding. Query the system, don't reload it.

## Research status

Done — research docs complete under `docs/`:

1. ✅ **Code flow** — `docs/research_code_flow.md` (spine: main loop,
   GameState dispatch, per-frame structure)
2. ✅ **Hardware & memory map** — `docs/research_hardware.md`
3. ✅ **Coordinate system & display** — `docs/research_coordinate_system.md`
4. ✅ **Stage structure** — `docs/research_stage_structure.md`
5. ✅ **Rendering & collision** — `docs/research_rendering.md` (sprite
   decode, object-list state, render pipeline, AABB collision,
   mothership shield damage worked example)
6. ✅ **Alien combat motion / animation** — `docs/research_enemy_motion.md`
   (per-frame 4-lane round-robin, path-following via T1700 + T1000–T13D0,
   position-keyed animation via T16A0 + T1600, stage-clear hand-off)

Still open (do these before serious gameplay code):

7. **Bird-stage motion + egg hatching** (`L3400`) — distinct from alien
   combat; covers swoop curves and egg → bird transformation
8. **Player mechanics + shield** — movement, firing, timed shield
   (Phoenix's distinguishing feature)
9. **Mothership stage** — destructible shield-block layers, mothership
   AI, win condition

Deferred:

- **Sound** — direct memory-mapped bit-fields driving an MN6221AA melody
  chip. Only matters for audio fidelity. See `research_hardware.md §5`.

## Verification workflow

1. Find the 8085 routine by label in `Code.md` or the local clone.
2. Read the function; note any RAM labels it touches.
3. Find the data tables it references.
4. Port the *logic*, not the *aesthetics*. Goto + flag-check is fine
   in JS if it matches the 8085.
5. Cite the function label in a comment: `// L0900 — Code.md:MovePlayer`
6. Use the dev panel (once it exists) to toggle the new task on alone
   and verify visually.

## Documentation

- `docs/progress.md` — implementation step tracker. Read this first
  when resuming work to see which step is in progress and what's next.
- `docs/DOCUMENTATION_INDEX.md` — navigation map across all research
  docs; includes cross-reference tables, key findings, and implementation
  roadmap.
- `architecture.html` *(planned)* — design + code-flow map (mirrors
  galaga_clone's architecture.html); intended as the resume-point
  visual once the project takes more shape.

When you discover something — a corrected value, a behavior the doc
glossed over, a fixed table — update the matching doc in the same
change. Stale diagrams are worse than missing ones.
