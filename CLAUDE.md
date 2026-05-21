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

## Cross-PC workflow

The user works on this repo across **two PCs**, syncing only through the
git remote. Auto-memory is per-PC and does not sync across them, so each
Claude session needs to discover what the other PC did from git itself.

**Working rules (binding, agreed 2026-05-08):**
- **Pull at the start of every PC session; push at the end.**
- **One PC at a time.** Don't make commits on both PCs in parallel —
  parallel work on `galaga_clone` once produced a 61/61-commit divergence.
- **Force-push is allowed when it's the better choice** (e.g. rebasing
  feature branches onto a cross-cutting main change to keep history
  linear). Confirm with the user first. The other PC, after pulling,
  will need `git reset --hard origin/<branch>` for any rebased branch —
  which is acceptable *only because* of the one-PC-at-a-time rule.
- **Write rich commit messages.** They are the cross-PC communication
  channel — anything you'd want the other-PC me to know belongs there
  (or in a research doc / CLAUDE.md update committed in the same change).

**The "last-known HEAD" sync protocol:** at session end (or whenever you
make/observe a commit), record `git rev-parse HEAD` for the active
branch in your auto-memory (e.g. a file like
`reference_cross_pc_sync_state.md`). At session start (or when the user
says they pulled), compare to current HEAD; if they differ, run
`git log <recorded>..HEAD` and read the new commits to update your
project memories. Then update the recorded SHA.

If you don't have a sync-state memory file yet (first session on this
PC after this convention is added), bootstrap one by recording the
current HEAD of each branch you work on, and start the protocol from
there.

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

## Delegating to sub-agents

Sub-agents (Explore, general-purpose, etc.) are good for **bounded
breadth-first scans** of source material — "find every collision routine",
"list all callers of `$0CC4`", "audit which `Lxxxx` paths are ported."
They are **not reliable for depth** — synthesis, judgment calls, or
anything that needs context from the conversation. Use them as
research instruments, not decision-makers.

The address-citation convention (every claim cites a source line or
label, e.g. `Lxxxx` for assembly-derived ports) is what makes sub-agent
output recoverable. Always demand it in the prompt:

> "Cite addresses for every claim. Group findings by source label.
> Quote the relevant bytes when the claim is non-obvious."

After the agent returns, **re-grep each cited region before relying
on the claim**. A 5-second grep falsifies a wrong claim cheaply; a
wrong claim that lands in code or docs is much more expensive to
remove later.

### Trip-wire moments

When a sub-agent's claim feels too clean and you can't immediately
see why it's true, **re-derive it from the primary source**.

Example from phoenix_clone (DrawShields + collision audit, 2026-05-20):
an audit agent flagged `$39F0` as the bird-vs-player path. Reading
`$39F0` alone showed only a ShieldCount check + JP to `$0CC4` — no
obvious collision detection. The trip-wire was correct: the actual
trick is 100 bytes earlier at `$3980`, which repurposes the player
bullet as a screen-RAM probe via `$3800`. Agent was right, but its
pointer was off — re-deriving from the source listing found the real
mechanism. Without the dig, the port would have copied the agent's
pointer-only framing into the doc, propagating the gap.

### Agents can write confidently wrong research docs

The most expensive failure mode is a research doc claim that passes
review at the time, lands in a `docs/research_*.md`, and only gets
falsified when a later port step actually depends on it.

From phoenix_clone, three such claims surfaced only when DrawShields
was being implemented and the doc claims got tested against real
gameplay:
- `research_player_movement.md §3.4` carried "Shield duration: 255
  frames ≈ 4.25 s" for weeks; correct figure is ~63 frames active
  (the 255 figure is the full re-fire cycle).
- `research_player_ship.md §5` claimed "source has no shield gate
  for alien-body collisions" — wrong; `$0F00` dispatches on
  ShieldCount before any tile scan.
- A code comment carried `// TODO: $3980 (cosmetic)` for weeks;
  `$3980` is the actual bird-kills-player path, not cosmetic.

**The defense is the address-citation rule plus this skepticism: if a
doc says something happens "always" or "never" in source, demand the
address it doesn't happen at and re-check.**

### Cheap-recovery commit hygiene

When sub-agent output influences a code change, keep the commits
small enough that a wrong-agent revert costs one commit, not a
session of work. For example, in phoenix_clone, DrawShields landed
as two commits (mixin-refactor, then feature+audit) — if the audit
had revealed DrawShields was fundamentally broken, the refactor
would survive the revert.

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
