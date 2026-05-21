# CLAUDE.md — galaga_clone

Guidance for Claude Code when working in this directory. Read this before
making changes here; it overrides the repo-root CLAUDE.md (which is
mario-focused).

## What this is

A faithful HTML5 + ES6 port of Namco Galaga (1981). "Faithful" is the
load-bearing word: behavior should match the Z80 ROM, not a modernized
re-imagining. When in doubt, **read the Z80 source** before designing.

- 224 × 256 canvas (matches arcade hardware)
- No build step, no npm — open `index.html` via the project's local HTTP
  server (`python -m http.server -b 127.0.0.1 8080` from the repo root,
  then `/galaga_clone/`)
- ES6 modules load directly in the browser

## Z80 source — the source of truth

The disassembly is **per-PC** — the auto-memory layer doesn't sync repos
across PCs, so each session uses whichever local copy exists. Paths so far:

- **`D:\tmp\galaga_rom\rom0\`** — this PC (the `D:\tmp\ZaneLogi.github.io`
  working copy)
- **`C:\Z_Temp\hackbar_galaga\rom0\`** — the other PC

Use whichever exists locally. When a new PC's path needs recording, add a
bullet above and update nowhere else (same convention as
`ultima6_clone/CLAUDE.md` §"Source of truth").

Upstream: <https://github.com/hackbar/galaga> &nbsp;(forked from
`neiderm/arcade` ← `gary-seven/eightysArcade`).

Whenever a finding cites a Z80 label or line number (e.g.
`f_1F85, gg1-2_fx.s:2071`), the file lives under that local path —
or browse the same path on the GitHub repo above. The
`computerarcheology.com` Galaga page is a useful secondary cross-
reference for tables and labels.

Key files:

| File              | Contents                                    |
|-------------------|---------------------------------------------|
| `task_man.s`      | Task scheduler, task table, frame counter   |
| `gg1-2.s`         | Main game logic (ship, formation, score)    |
| `gg1-2_fx.s`      | Effects, movement, collision                |
| `gg1-3.s`         | Object state machines, sprite codes         |
| `game_ctrl.s`     | Stage flow, attract / ready / play          |
| `new_stage.s`     | Per-stage init                              |

**Convention:** every non-trivial function in this codebase cites its Z80
counterpart in a comment, e.g. `// f_1F85 — c_1F92, gg1-2_fx.s:2071`.
Keep this discipline — it makes verification possible.

## Architecture: task table dispatch

The Z80 game is a cooperative scheduler over a fixed task table
(`d_cpu0_task_table`). Each task is a small function that runs every
frame *if its enable flag is set*. Tasks read/write a shared global
state (RAM).

We mirror this exactly:

- **`state.js`** — single shared mutable object (mirrors Z80 RAM).
  All tasks read/write here. No encapsulation; that's intentional.
- **`main.js`** — fixed-timestep runloop (1/60 s) and `TASK_TABLE`
  dispatch. Iterates the table each tick, calls `task.update(state)`
  if `state.tasks[flag]` is true.
- **`tasks/*.js`** — one file per Z80 task function. Each exports
  `update(state)` and optionally `render(state)`. Render runs every
  frame regardless of enable flag (the Z80 sprite RAM is always drawn).
- **`gfx/*.js`** — ROM data and the sprite decoder (`resource.js`).
  Decoded sprites are exported as `HTMLCanvasElement[]`.
- **`devPanel.js`** — Proxy-backed UI to toggle each task on/off live.
  Essential for isolating bugs and verifying tasks one at a time.

### Frame timing

- `state.frameCount` mirrors `ds3_92A0_frame_cts[0]` — 60 Hz tick counter.
  Tasks use `(frameCount % N) === 0` for sub-rates (e.g. `% 4` = 15 Hz).
- `state.gameTimers[0..3]` mirror `ds4_game_tmrs` — countdown bytes
  decremented at 2 Hz by `tickGameTimers()` in `main.js`. Always-on,
  not in the task table.

## Coordinate system (very easy to get wrong)

The Z80 sprite hardware applies a **10-pixel horizontal offset** when
drawing. ROM stores sprite-X; we draw at canvas-X. The conversion is
applied **once** when copying values out of the ROM:

```
canvas_X = sprite_X - 10
```

So:

- Z80 ship spawn `0x7A = 122` → `state.player.x = 112`
- Z80 ship limits `0x12 / 0xE1 = 18 / 225` → canvas `8 / 215`
- Z80 formation column X `[0x31..0xC1] = [49..193]` → canvas `[39..183]`

Y has no offset.

When reading a Z80 X value or porting a new feature: **subtract 10
immediately** so the rest of the JS stays in canvas coordinates.

## Fidelity patterns to preserve

These are not bugs — they reproduce exact Z80 behavior. Don't "clean
them up":

- **Pre-move bounds check, not post-move clamp.** The Z80 does
  `cp limit / ret c` *before* `add`, so the ship may stop one step
  short of the wall. See `tasks/playerMove.js`.
- **dxFlag toggle for sub-pixel speed.** `dxFlag ^= 1` each held frame
  alternates 1 / 2 px steps, averaging ~1.5 px/frame. Mirrors
  `b_92A0[3]`.
- **Counter wrap arithmetic.** Many Z80 counters use `& 0xFF`,
  `& 0x07`, etc., for power-of-two wrapping. Preserve the masks; don't
  refactor to `%`.
- **Sprite frame codes are integers, not symbols.** `sprites.ship[6]`
  is the upright pose because the Z80 stores `06` in the sprite-code
  byte. Keep the magic numbers and cite the Z80 case statement.

## Verification workflow

1. Find the Z80 function by name (e.g. `f_2A90`) — grep the local Z80
   source (whichever per-PC path from §"Z80 source" exists on this machine).
2. Read the function. Note any RAM labels it touches
   (`ds_*`, `db_*`, `b_*`).
3. Find the data tables by label.
4. Port the *logic*, not the *aesthetics*. Goto + flag-check is fine
   in JS if it matches the Z80.
5. Cite the function and source line in a comment.
6. Use the dev panel to toggle the new task on alone and verify
   visually.

## Documentation

- **`progress.html`** — implementation step tracker (11 steps total).
  Update the matching step when finishing meaningful work; add fix /
  decide / verify notes inline.
- **`diagram.html`** — **the project's code-flow / architecture map**.
  Visual reference for: game state machine, the 60 Hz task scheduler
  and slot ordering, the two timing systems (frame counter vs game
  timers), formation grid layout, enemy lifecycle (fly-in → home →
  attack → exploding → respawn), path bytecode format, player /
  bullet / bomb flow, and the rendering pipeline. **Read this first**
  when picking up new work — it shows how the pieces connect.

These are the project's living docs. Keep them current; they're what
makes resuming work in a later session cheap.

**When you discover something** — a wrong slot count, a corrected
coordinate value, a Z80 behaviour the diagram glossed over, a fixed
data table — **update diagram.html in the same change**. Stale
diagrams are worse than missing ones because they get trusted. If a
section's data is invalidated by a finding, fix the section, don't
just add a footnote.

## Things that will trip you up

- **Don't add task `init()` calls in `main.js`.** Tasks self-init lazily
  on first `update()` if needed (see `tasks/starfield.js`). This mirrors
  the Z80 cold-start pattern.
- **Always-on tasks in the dev panel are checkbox-disabled.** Don't
  remove that protection; toggling them off breaks invariants
  (`objectStates`, `bombUpdate` are always-on per `task_enable_tbl_def`).
- **Formation has 48 slots, not 40.** Boss rows fill cols 3–6 only;
  butterfly and wasp fill all 10. Source: `db_obj_home_posn_rc`
  (`task_man.s`).
- **`f_2A90` (oscillate) and `f_1DE6` (pulse) are mutually exclusive.**
  One runs during fly-in and attack, the other at steady state. Don't
  enable both at once outside dev testing.
