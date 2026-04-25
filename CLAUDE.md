# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

A personal collection of retro game projects (clones and originals) plus
small HTML5 / canvas experiments. Each top-level directory is a
self-contained project; there is no shared framework or library across
games.

Work is organized **one game per git branch** — `main` holds the merged
set. Switch branches to work on a specific game; the matching directory
is the one being actively developed.

## Running Locally

```bash
python -m http.server -b 127.0.0.1 8080
```

Then open `http://127.0.0.1:8080/` for the demo index, or jump straight
to a project (e.g. `/galaga_clone/`,
`/mario_physics/mini_mario_physics_demo.html`).

No build step, no npm, no dependencies — ES6 modules load directly in
the browser.

## Repository layout

### Retro game projects

| Directory          | Notes                                                |
|--------------------|------------------------------------------------------|
| `galaga/`          | Earlier Galaga port                                  |
| `galaga_clone/`    | Faithful Z80-source port — see its own `CLAUDE.md`   |
| `mario/`           | Original full-game implementation (legacy reference) |
| `mario_physics/`   | Mini Mario physics-engine rewrite (fixed-timestep)   |
| `pacman/`          |                                                      |
| `lemmings/`        |                                                      |
| `lode_runner/`     |                                                      |
| `space_invaders/`  |                                                      |
| `tanks/`           |                                                      |
| `ultima6/`         |                                                      |
| `ultima7/`         |                                                      |
| `xrick/`           |                                                      |

### Web / canvas experiments

Small standalone demos used to validate techniques later reused in the
games:

`audio/`, `css_loading_animation/`, `drag_drawing/`, `framerate/`,
`imagedata/`, `input/`, `lzw/`, `palette_rendering/`,
`resizable_canvas/`, `set_color_key/`

## Per-project conventions

Each game was built at a different time and they **don't share code or
patterns**. Before making changes inside a project directory, look for
its own `CLAUDE.md` and read that first — it overrides anything here.

Known per-project guidance:

- `galaga_clone/CLAUDE.md` — Z80-faithful task-table architecture, with
  references to the source disassembly under `C:\Z_Temp\hackbar_galaga\`

When a project has no local `CLAUDE.md`, default to:

- ES6 modules, no build step
- A single HTML file at the project root that boots `main.js`
- Sprites are BMP files; `0xFF00FF` is the colorkey transparent color
- Canvas resolution matches the original arcade / console where relevant

## mini_mario (`mario_physics/`) — quick reference

Fixed-timestep accumulator (1/60 s physics ticks) with render
interpolation, so visuals stay smooth regardless of display refresh
rate. Physics values in `actor.js` are multiplied by `dt * 60` to stay
frame-rate independent — keep this invariant when adding new forces or
velocities.

| File                | Role                                                    |
|---------------------|---------------------------------------------------------|
| `main.js`           | Game loop, input, canvas setup                          |
| `actor.js`          | AABB physics: gravity, accel, skid, jump, tilemap col.  |
| `actor_animator.js` | Sprite state-machine + horizontal facing flip           |
| `world.js`          | Owns actor/animator list; drives update + render        |
| `camera.js`         | Smooth follow with dead zone, world→screen, map clamp   |
| `level_map.js`      | Tile queries: world pos → tile, solid check, tile bbox  |

Input: arrows = move · Space = jump (early release = short jump) ·
Shift / Z = run.

Sprites loaded via `mario/resource.js` (shared with the legacy demo).

`mario/` is the original full-game implementation (~2300 lines, no
fixed timestep, string-based state). Useful as a reference for sprite
data and level structure but intentionally not refactored.
