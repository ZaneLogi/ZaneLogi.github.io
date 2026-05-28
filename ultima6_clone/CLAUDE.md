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

> Historical: the discussion-phase exploration that led to this
> folder happened in note-branch sessions on 2026-05-26 and
> 2026-05-27. Substance has been folded into this CLAUDE.md +
> docs/research_*.md; those note files are kept on the `note`
> branch as historical record but are NOT required reading. See
> `feedback_note_branch_is_scratchpad` in local memory for the
> principle.

## Project stage

**Research phase.** Discussion phase ended 2026-05-27 with the
creation of this folder; implementation phase has NOT started.

The three phases (see local memory `feedback_project_phases`):

- **Discussion phase** → on the `note` branch; architecture-level
  exploration without source-code grounding. Closed.
- **Research phase (current)** → here, in `ultima6_clone/docs/`;
  reading u6-decompiled to ground decisions in reality.
- **Implementation phase** → when research is sufficient; per-
  subsystem ports under `ultima6_clone/`.

**No gameplay code until research clarifies the engine's model.**
The driving research questions (entity layout, draw order, double-
height handling, transparency policy, conversation VM, schedule
logic, etc.) are open. Only u6-decompiled can answer them.

Architecture decisions from the discussion phase (Pure ECS primary
+ Hybrid fallback; A-grid for terrain; packed Status byte; folder
split + copy-then-own; graphics-first sequencing) are **provisional
inputs** into research, not locked outputs. Research may refine or
overturn any of them — that's the point of having a research phase.

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

Working hypotheses, subject to research validation:

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

> Historical: these were settled in note-branch sessions on
> 2026-05-26 and 2026-05-27. The hypotheses live here now; the
> note files are historical context, not required reading.

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
- `docs/progress.md` — **not yet created.** Lands when research
  phase yields a research-stage doc plan (R-A / R-B / ... shape,
  matching sibling projects) or when implementation phase opens.

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
  `feedback_doc_style`, `feedback_note_branch_is_scratchpad`

**Historical-only** (kept on the `note` branch as the discussion-
phase record; substance has been folded into this CLAUDE.md +
docs/research_*.md — NOT required reading):
- `notes/2026-05-26-1141-candidate-deep-dives.md` (candidate survey)
- `notes/2026-05-26-2226-u6-architecture-settled.md` (D1-Q3 settlements)
- `notes/2026-05-27-0121-u6-pillar-bug-and-decompiled-discovery.md`
  (pillar bug + u6-decompiled as ground-truth reference)
