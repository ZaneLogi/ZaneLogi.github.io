# CLAUDE.md — ultima6_clone

Guidance for Claude Code when working in this directory. Read this
before making changes here; it overrides the repo-root CLAUDE.md.

## What this is

A modern rewrite of Origin's **Ultima VI: The False Prophet** (1990)
in HTML5 + ES6. "Modern rewrite," not "routine-level translation" —
per the user memory `feedback_retro_port_translation_choice`: U6's
DOS hardware is incidental scaffolding (segmented memory, map / object
chunking, 320×200 viewport), not the gameplay mechanism. We're
translating the **game**, not the 1990 paging workarounds.

The sibling `ultima6/` folder holds the legacy JS port (built from
tech-docs + community reimplementations, before u6-decompiled was
known to exist). It stays untouched here — the viewers keep working.
Going forward, this folder is the canonical home for U6 rebuild work;
all decisions, research, and Journal narrative live under `docs/`.

## Game-data legal pattern (binding)

**Never commit U6 game data to the repo — not even a test fixture.**
Gitignore any local data files. Users supply their own legally-owned
U6 files at runtime; nothing copyrighted is ever distributed by this
repo. GitHub Pages serves it publicly, so a committed asset would be
*public distribution* — the highest-risk thing.

The legacy `ultima6/` port already established the safe flow, and the
rebuild reuses it rather than reinventing:

- **Dropzone** — user drags in their own U6 files
  (`../ultima6/map_viewer.js:831`).
- **IndexedDB** — bytes stored client-side only, keyed by lowercased
  filename (`../ultima6/u6db.js`). GitHub Pages is static hosting, so
  the data never reaches a server — it stays on the user's machine.
- **Checklist gate** — `expectedFiles` shown ✅/⛔ with a
  "Ready: YES/NO" flag (`../ultima6/map_viewer.js:814`).

This is the deliberate Nuvie-style "bring your own data" design, not an
accident — keep it. The slip to guard against is committing a "just for
testing" data file mid-implementation; don't. (This note exists because
auto-memory is per-PC and doesn't sync — a cold session on the other PC
needs the rule in committed form. A `<input type=file>` fallback
alongside the drag-only dropzone is a nice-to-have for the rebuild.)

## Project stage

**Implementation phase. Current status + the I-N step ledger live in
[`docs/progress.md`](docs/progress.md)** — its top banner is the single source of truth
(see that file's §"Doc maintenance"); this section is NOT a status mirror. As of
2026-06-05: **I-12 (dialog window) COMPLETE; next I-13 (conversation VM).** What stays
here is the durable, slowly-changing reference — the code layout, the dev console helpers,
and the per-step **kept deviations** (so a later session doesn't "correct" them). The ECS
runtime-ground spec is
`docs/architecture_ecs.md`, implemented in `ecs/world.js` since I-1. Code layout:
`ecs/` (runtime core), `assets/` (format decoders), `resources/` (TileRegistry,
MapLevel, Camera, Viewport, Party, Paths, Schedules, …), `systems/` (render, camera,
world-data, schedule, passability, avatar move, move-followers, humanoid-anim,
pathfinding, npc_path, npc_tick, ai_modes, **cell_pick, command_dispatch,
use_handlers, use_drawbridge** (I-10), …), `resources/` also has **Commands**
(dispatch registries) + **MessageLog**; `components/`, `view/` (WebGL renderer +
dev HUD/inspector + **message_channel** + **dev_npc_inspect**), `world_loader.js`
(world-object load + runtime add/delete/find primitives), `u6db.js` (BYO-data store),
`index.html`/`main.js` (app shell), `tests/`.

**Dev console helpers** (`view/dev_npc_inspect.js`, on `window.__U6` — reuse, don't
re-invent). READ-ONLY (never touch the sim): `inspectNpc(npcId)` (identity + position incl z
+ per-slot-z schedule + `dungeonSafe`), `scanDungeonSchedules()` (every loaded NPC on /
scheduled to a dungeon level), `teleportSuppressed(npcId)` (would the I-9h visibility guard
suppress its teleport at the live view center — the safe form of the spotlight check).
CAMERA-only (write the view, not the sim): `lookAtNpc(npcId)` (pan once to center it),
`followNpc(npcId)` (camera tracks it every frame, overriding manual pan), `stopFollow()`.
**Dungeon caveat:** dungeon levels (z≠0) aren't loaded, so a dungeon-resident or
dungeon-scheduled NPC won't render/tick (and would teleport onto an unloaded level if
scheduled there); the camera helpers warn when the target is on z≠0. `scanDungeonSchedules()`
currently reports **20** such NPCs (gargoyles/fighters/a horse on z=2..5) — check it before
picking an NPC to drive in any experiment.

**Invoking them** (Zane + Claude both use these): they're global on `window.__U6`, so call them
straight from the browser **DevTools console** (F12 → Console) on the running game —
`__U6.inspectNpc(100)`, `__U6.followNpc(100)` / `__U6.stopFollow()`, etc. (autocomplete after
`__U6.`; `console.table(__U6.scanDungeonSchedules().rows)` for the scan as a table). Also
reachable via preview-eval. A **boot-time `console.info` hint** listing the helpers is
**deferred** — add on request (Zane will say when); keep the console quiet until then.

**Key I-9 kept deviations from source** (so the next-session you doesn't
"correct" them): per-NPC window (not player-centered); edge-seek accepts any
toward-goal edge (not source's single dominant axis); teleport-to-previous-target
on reschedule; flat step-rate (move-point economy deferred); arrival facing
(I-9g) is frame-encoded (`(facing<<2)|1` stand frame), not a separate
`SetDirection` field — a later GUARD-pacing step reads facing from `frame>>2`;
NPC facing/walk animation is **humanoid-only** (`isHumanoid` gate in both
`npcStep` and `atDestination`) — source's `C_1E0F_0664` is type-dispatched and
the clone ported only its humanoid arm, so non-humanoid NPCs (gazer, animals)
move/settle without animating (per-type arms deferred); don't "fix" a static
non-humanoid sprite by feeding it the humanoid frame layout.
NPC #12's teleport-to-dinner is a *correct* consequence of a CLOSED castle
drawbridge — NOT a cost-cap bug; do not raise the 7-bit cost cap. **RESOLVED by
I-10e (2026-06-04):** the drawbridge is now modeled + crossable, so with the
bridge lowered #11/#12 WALK to the dining room (verified live); they teleport
only when it's raised (faithful — NPC AI has no USE action, so the player lowers
it via the crank).
**I-9h:** the off-area teleport's near-radius is **derived from the live viewport**
(`Viewport.nearRadius` = half the visible extent + an 8-tile margin; ≈40 at the old 64×40
canvas, smaller on a small window, larger on a big one) — render-to-fit (2026-06-05) made
the visible extent vary, so a fixed value would pop on-screen NPCs on a large window. It
must always exceed the on-screen half-extent; **don't replace it with a small fixed
constant**. The old `TELEPORT_NEAR_RADIUS = 40` survives only as the unit-test fallback
(the tests register no `Viewport`). The guard's **center is the CAMERA's center tile, not
the avatar's** (`npc_tick_system.js` computes `floor(cam.worldX/16)+cols/2`): visibility
tracks the camera because the clone **drag-pans** (source can't, so it gates on the avatar).
They coincide while the camera follows; centering on the camera stops a visible NPC popping
in a panned-to region. Tests fall back to the avatar position. The 3/turn teleport cap is kept source-faithful but is a throttle invisible
behind the visibility guard (drop-candidate, not load-bearing); source's pathfind cap
(`D_17A7`) is intentionally not ported. The unreachable-fallback snap is unified into
`tryTeleportToSlot(..., allowVisible=true)` — there is no separate `snapToSlot`.

The three phases (see local memory `feedback_project_phases`):

- **Discussion phase** → architecture-level exploration. Closed.
- **Research phase** → `ultima6_clone/docs/research_*.md`; reading
  u6-decompiled to ground decisions in reality. Closed (9 source-research
  docs committed at `4656410`; ECS ground settled 2026-05-29).
- **Implementation phase (current)** → per-step `I-N` ports under
  `ultima6_clone/`, graphics-first. See `docs/progress.md` for the ledger and
  each step's "scope" subsection.

The discussion-phase architecture decisions (Pure ECS primary + Hybrid
fallback; A-grid for terrain; packed Status byte; folder split +
copy-then-own; graphics-first sequencing) were **inputs** into research;
research validated rather than overturned them, and they are now **locked
in `docs/architecture_ecs.md`**. Remaining open questions are per-system
details that surface as each `I-N` step lands, not architecture-level
unknowns.

## Source of truth

Local clone of ergonomy_joe's full C decompilation of U6 `GAME.EXE`
(PC/MSDOS v4.5). The clone is **per-PC** — every session needs a
local copy because the auto-memory layer doesn't sync repos
across PCs. Paths so far:

- **`D:/tmp/u6_decompiled/`** (PC where this branch was created,
  2026-05-27)
- **`C:/Z_Temp/u6_decompiled/`** (other PC, cloned 2026-05-27)

Use whichever exists locally. The research docs under `docs/` cite
source files by relative name only (`seg_XXXX.c:NNN`, `u6.h:NNN`,
etc.); the absolute path lives only here — same convention as
`phoenix_clone/CLAUDE.md`. When a new PC's clone path needs to be
recorded, add a bullet above and update nowhere else.

Setup on a fresh PC:
```
git clone --depth=1 https://github.com/ergonomy-joe/u6-decompiled.git <path>
```
Repo is ~1.1 MB, no sparse-checkout needed.

- Upstream: <https://github.com/ergonomy-joe/u6-decompiled>
- Dated: 2022/03/29 by ergonomy_joe
- Decompilation method: disassemble `GAME.EXE` → re-derive C source
  (Borland Turbo C 2.0 conventions) → re-build to a near-identical
  binary → iterate until they match
- Repo shape:
  - `SRC/seg_XXXX.c` — function/code segments named per Turbo C
    segment layout (no friendly names)
  - `SRC/*.h` — headers: `ai.h`, `cmd.h`, `gr.h`, `obj.h`,
    `spells.h`, `tile.h`, `u6.h`
  - `SRC/BSS.ASM` — uninitialized data
  - `SRC/OSILIB/` — low-level asm (`KBD.ASM`, `MOUSE.ASM`,
    `SOUND1-5.ASM`, `RAND.ASM`, `INFLATE.ASM`, `OSI_FILE.ASM`)
  - `MAKEFILE`, `doit.bat` — build glue

There's no top-level function index — function discovery requires
reading. The Journal log is where that discovery gets captured as
it happens.

**Tech-docs caveat** (from upstream README): the U6 Technical
Documents PDFs (the ones in `../ultima6/doc/`) refer to an *earlier*
version of the game and do not exactly reflect the shipped code. When
tech-docs and u6-decompiled disagree, **u6-decompiled wins** — the
tech docs become a hint, not an authority.

The legacy `ultima6/` port was built from those tech docs (plus
community projects, plus Zane's own C++ `U6WorldEditor` ported into
JS). Known divergence from source: the pillar-render bug near
Lycaeum is the observed symptom that triggered this research phase.
(Note: the apparent flag-alias bug at `../ultima6/obj.js:9-11` —
CURSED / HATCHED / MUTANT all on 0x40 — turns out to be **faithful
to source**; `u6.h:80-82` overloads bit 0x40 across object types,
and call sites dispatch semantics via object-type checks. So that
one isn't a port bug.) Auditing the broader JS-vs-source render-
path delta is one of the expected outputs of this research phase.

**Citation convention** (mirrors phoenix_clone / asteroids_clone /
galaga_clone): once implementation phase starts, every non-trivial
JS function cites its C counterpart, e.g.
`// seg_3522.c:functionName`. Use file + function name; don't
invent line numbers (file content may shift if upstream re-derives
or renames).

## Architecture choice — modern rewrite

The repo-root CLAUDE.md "Architecture principle for retro ports"
section names two architectures (routine-level translation vs
screen-RAM mapping); both apply to **hardware-as-design** retro
ports (arcade cabinets). U6 is neither — it's **hardware-as-
substrate** (DOS RPG), which lands under a different choice:
modern rewrite. See `feedback_retro_port_translation_choice` in
local memory for the principle.

**Settled — full spec in `docs/architecture_ecs.md`.** Summary of the
locked decisions:

- **Pure ECS as primary architecture; Hybrid as named fallback.**
  Picked for learning value + deferred-subsystem extensibility +
  collapsed upfront cost (the "2-3 weeks of ECS-core invention"
  framing was a human-coder baseline; with Claude doing the
  typing, the leftover cost is design-discussion + reading-to-
  internalize, not raw coding time). Hybrid stays named as a real
  escape valve if the "where does behavior live?" friction wears
  on the project mid-stream — pivot path is then "switch to
  Hybrid," not "redesign from scratch."
- **A-grid for terrain** — `Uint16Array` of tile IDs +
  `TileRegistry` singleton resource. Pure-ECS-correct, not a
  compromise: terrain is static, homogeneous, dense, position-
  indexed; the grid IS the ECS answer for terrain. Per-tile
  dynamic state (fire, fog-of-war, mapped/unmapped) goes in
  sparse overlays (`Map<packed_xy, T>` or parallel byte arrays).
  Only items / doors / NPCs / furniture are ECS entities. Source
  organizes this way too — `TerrainType[]`, `TileFlag[]`,
  `BaseTile[]`, `TypeWeight[]` are all tile-type-indexed; the
  per-object arrays are object-indexed.
- **Packed Status byte** with bit accessors for static-or-near-
  static on/off properties (OWNED, INVISIBLE, CHARMED, LOCAL,
  LIT, etc.). Combat-style transients that carry duration /
  severity / source data become their own data components
  (`PoisonedDuration`, etc.); systems iterate
  `entitiesWith(PoisonedDuration)`. Don't store the same status
  in two places — pick one storage per concept.
- **Graphics-first sequencing** — minimum-viable gate is
  "Britain visible on screen." Minimum ECS set: entity registry +
  `Position` + `Renderable` components + `TileRegistry` resource +
  `MapLevel` resource + `RenderSystem` + `CameraSystem`. Then each
  next system adds 1-2 components + 1 system.

> These were first framed during the discussion phase; the full runtime
> ground (E+C+S, tick, world-loading) was closed 2026-05-29. The
> canonical, self-contained spec is `docs/architecture_ecs.md`.

## Modern-browser UX as architectural anchor

Source's behavior is the spec for **what happens** in the game
(mechanics, AI, scoring, win conditions). It is NOT the spec for
**how it feels** (frame rate, drag-scroll smoothness, animation
continuity, input latency). Those look like the same axis but
diverge where source's 1990 hardware was the bottleneck.

**Canonical example — render cadence.** Source has three channels:

- Composite re-render on-demand (`C_1100_0306` / `C_0A33_09CE`,
  gated by `D_17B0`/`D_0340`/`StatusDirty` flags).
- Palette cycling continuously at CON_prompt-idle-tick rate
  (`PaletteAnimation`, slots `0xE0-0xFB`).
- Animdata tile-pointer rewriting continuously at the same rate
  (`tile_pointers[tile_to_animate[i]] = ...`, ~29 entries).

That shape worked on a 286/386 because composite was expensive
and player actions were sparse. A 2026 user dragging a 1280×800
map view at 60Hz+ expects every drag-frame to repaint smoothly —
~10k cells × 60Hz of repaints. Inheriting source's on-demand
cadence produces visible stutter; that's a hardware artifact, not
a mechanic worth preserving.

**Modern UX requirements that override source-faithful cadence:**

- Drag-scroll smoothness at display refresh rate (60-144Hz).
- Continuous animations without user input (waves, fountains,
  flags, NPC sprite cycles, sunrise/sunset).
- Instant-feeling status panel + UI updates.

**Implication for the substrate.** WebGL becomes the default
choice — not because every frame is a re-blit, but because the
three render channels map cleanly to WebGL primitives (instanced
VAO draws of a precomposed tile-index buffer + sparse
`bufferSubData` updates for animdata + fragment-shader palette
LUT uniform for the cycling channel). The legacy
`ultima6/map_viewer.js` already implements this pattern; its
WebGL choice is well-justified. canvas2d alternatives exist for
each channel but each trades memory or per-call cost.

**Defense pattern.** When sizing a "is X performant enough?"
question for the rebuild, **check the modern-UX requirement
before the source-behavior requirement**. If source has a coarser
or slower version of X, that's the floor — anything modern can
match it — not the ceiling. Source's behavioral envelope is
substrate residue; the rebuild targets what modern hardware
affords + what 2026 users expect.

This is a corollary of D2 ("source = mechanic spec, not code
template"): source's behavioral *envelope* (timing, cadence,
responsiveness) is also not the spec — same substrate-vs-mechanic
distinction applied to runtime characteristics instead of code
structure.

## Documentation

- `docs/Journal.md` — **chronological reading log.** Per session,
  what was read in u6-decompiled, what surprised, what got
  documented, open questions raised, next intended step. This IS
  the project's narrative.
- `docs/research_*.md` — **topic-organized, currently-true.** Per
  the existing `feedback_doc_style` memory: no resolved-history
  sections, no strikethrough — rewrite in place as understanding
  improves.
- `docs/DOCUMENTATION_INDEX.md` — navigation map across research
  docs. Populated as `research_*.md` files accumulate.
- `docs/progress.md` — **the implementation ledger.** The `I-N` step
  table + a per-step **§"I-N scope"** section (the real per-step record),
  with a one-line **status banner** at the top that is the project's single
  source of truth for "where are we / what's next."

**Doc maintenance (binding).** On completing a step, the only substantial doc
writes are a new `progress.md §"I-N scope"` section + a terse `Journal.md`
entry. Current status is the **one-line** `progress.md` banner; this file's
"Project stage" section and `DOCUMENTATION_INDEX.md` **point** to that banner
rather than mirroring it (the per-step mirroring is what bloated the docs and
left `DOCUMENTATION_INDEX` stale at I-10). Everything else per step is a
one-line touch (banner, ledger row, the two pointers, memory). Full convention:
`docs/progress.md §"Doc maintenance"`.

## Conventions inherited from sibling projects

- **No worktrees.** Work directly on the `ultima6_clone` branch.
- **Terse commit subjects with `[ultima6_clone]` prefix.** Cite
  research-doc sections in the body when there's depth to point
  at; don't restate design rationale that already lives in the doc.
- **Ask before commit.** Always propose the commit message and wait
  for confirmation before running `git commit`.
- **Cross-PC: one PC at a time.** Pull at session start, push at
  session end. See repo-root `CLAUDE.md` "Cross-PC workflow".
- **Rich commit messages OR rich research docs.** Cross-PC sync
  happens via committed content only — anything the other-PC me
  would want to know belongs in a commit, doc, or this file.

## Cross-references

- Sibling: `../ultima6/` (legacy JS port — paused; pillar-render
  bug near Lycaeum is the audit driver. `obj.js:9-11` flag aliasing
  is faithful to source, not a port bug.)
- Repo-root principles: `../CLAUDE.md` "Architecture principle for
  retro ports" — gives the broader taxonomy this project picks
  *modern rewrite* under (rather than routine-level translation or
  screen-RAM mapping)
- Local memory: `project_ultima6_status`,
  `feedback_retro_port_translation_choice`, `feedback_project_phases`,
  `feedback_doc_style`
