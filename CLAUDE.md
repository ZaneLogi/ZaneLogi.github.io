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
- **Cross-cutting cleanup → choose branch by target activity, not
  current location.** Repo-wide infra cleanup (tools/, root
  `CLAUDE.md`, build scripts, .gitignore) goes on `main` when the
  target branch is inactive OR the change is cross-cutting; on the
  project branch when that branch is currently active. Don't touch
  other projects' files from the branch you're sitting on — it
  muddies branch scope and creates harder merges later. If you're
  on `asteroids_clone` and need to fix something in
  `phoenix_clone/` or repo-root config, switch branches (or use a
  worktree) first.

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

## Architecture principle for retro ports

A retro-game port from arcade/console source has **two viable
architectures**. The choice should be made during the **research
stage**, before coding starts — based on what the disassembly reveals
about the original game's mechanism dependencies. Picking implicitly
("I'll just draw to canvas and figure out problems as they come")
leads to ad-hoc deviations that accumulate, and some end up
wrong-direction.

### The two viable architectures

| Architecture | What it models | When it's right |
|---|---|---|
| **Routine-level translation** | Each source routine → JS function with citation. ROM data extracted verbatim. Hardware abstractions NOT modeled — screen-RAM-readback sites get small per-site state-driven substitutes. | Source's gameplay mechanics live mostly in routines; screen-RAM-readback is rare or peripheral. |
| **Screen-RAM mapping** | A dedicated buffer mirrors source's video memory. Draw routines write to the buffer; collision-style routines read from it. Specific flavor depends on source's display type. | Multiple gameplay mechanics depend on screen-RAM readback. |

Both are legitimate. The choice is about matching the architecture to
the source's mechanism profile.

### Routine-level translation in practice

Source routines port as JS functions with `// Lxxxx — RoutineName`
citations. ROM data tables are extracted verbatim. The few sites
where source uses screen-RAM readback get small per-site state-driven
substitutes (e.g. a counter check instead of a tile read).

**Deviations are load-bearing under this architecture, not
compromises.** Every state-driven substitute keeps the project on
the "translation" side of the line. If you chose source-faithful for
ALL screen-RAM-readback sites under routine-level translation, you'd
model enough hardware that the project becomes a slow hand-written
emulator — no gain over MAME.

### Screen-RAM mapping in practice

The buffer's representation matches source's display type:

- **Tile-buffered source** (Pac-Man, Phoenix, Galaga era): two byte
  buffers (FG / BG) carry tile IDs at fixed (col, row) positions.
  Source's draw routines port as tile-buffer writes; render iterates
  the buffers and `drawImage` per cell.
- **Pixel-buffered source** (Space Invaders era and earlier): the
  canvas itself IS the screen-RAM buffer. Draw routines paint to
  canvas; collision-style routines use `getImageData()` to read
  pixels back. The canvas-as-VRAM equivalence is exact for pixel-
  packed source video memory.

Either flavor lets source's screen-RAM-readback mechanisms port
directly with no per-site substitutes. Upfront cost (~1-2 weeks of
infrastructure before visible gameplay) is recovered if the source
has many screen-RAM-dependent mechanics.

### Research-stage decision criteria

Before any code, the research docs should answer:

1. **How many gameplay mechanics depend on screen-RAM readback?**
   Count specifically: tile-collision lookups, pixel-collision
   lookups, region-clear-then-write patterns, tile-persistence
   sprite cycles, tile-state-driven AI. The exact threshold depends
   on what the count breakdown reveals — a single load-bearing
   mechanic (e.g. all collision is tile/pixel-based) outweighs many
   peripheral ones.
2. **Does any core mechanic (scoring, win-condition, collision)
   hinge on screen-RAM state?** If yes, screen-RAM mapping —
   regardless of count.
3. **Is screen-RAM the design's mechanism, or its coincidence?**
   Some games use screen-RAM reads because the hardware *is* the
   game state (Space Invaders pixel collision; Pac-Man dot eating).
   Others use it as a side-effect of having a buffered display
   (Phoenix shield is at this tile because DrawShields drew it
   there). The first is mechanism; the second is coincidence.
   Coincidence-style usage is fine to substitute with state-driven
   equivalents.
4. **Is source pixel-buffered or tile-buffered?** Determines which
   flavor of screen-RAM mapping applies if you go that route.

### Worked examples

**phoenix_clone — routine-level translation.** Phoenix has 3
screen-RAM-readback mechanisms: shield bullet-absorption (`L0CB4`),
L2085 explosion region pre-clear, alien partial-sprite tile-
persistence cycle. All three are coincidence-style, not mechanism-
style — source uses screen-RAM readback because the display happens
to be tile-buffered, not because gameplay logic *requires* tile-
buffer state. State-driven substitutes (counter check, separate
`scatteredDebris` Map, last-known-full `controlB` substitution) are
small, local, and preserve visible behavior. **If upfront research
had quantified this** (count = 3, all coincidence-style, no core
mechanic depends on tile state), routine-level was the clear right
call.

**galaga_clone — routine-level translation**, similar deviation
profile to phoenix_clone.

**space_invaders — screen-RAM mapping (canvas-pixel-buffer flavor).**
Source's collision detection is *literally* a video-RAM pixel read —
the 8080 checks the 1bpp video memory to see if a player shot hit
something or if an alien shot hit a shield. This is mechanism, not
coincidence: the pixel buffer IS the collision geometry. The port
uses the canvas as the screen-RAM analog: draw everything to canvas,
then `getImageData()` at shot positions to detect collisions. No
per-site state-driven substitutes needed — source's pixel-read
semantics port directly to canvas pixel-read semantics. Routine-
level translation would have required maintaining a parallel
collision-geometry buffer mirroring every sprite blit; canvas-as-
VRAM is free. See `space_invaders/game.js:handlePlayerShot` and
`handleAlienShot`. Reference: <https://www.computerarcheology.com/Arcade/SpaceInvaders/>.

### The payoff: smoother coding from upfront investigation

The shared lesson across all three projects: **the more thoroughly
the research stage characterizes the source's mechanism profile, the
fewer architectural surprises during coding.** Each gameplay
subsystem ports without friction when the chosen architecture
already fits — no mid-project rewrites, no accumulating deviations,
no wrong-direction substitutes that later need to be undone.

In phoenix_clone, the L2085 explosion scatter was deferred for ~6
weeks under the (incorrect) assumption that source's mechanism
required screen-RAM persistence; a deeper upfront read of `Code.md
$2085-$20E2` would have shown L2085 is write-only (reads target ROM
tables, writes target screen RAM) and unblocked the port
immediately. The cost of skimping on research is paid in
implementation drift. Time spent on research docs before coding is
the cheapest time in the project.

### When a subsystem has no software counterpart — drop, not defer

Some retro source code includes mechanisms the CPU doesn't actually
implement. The 6502 / Z80 / 8085 pokes a byte to a memory-mapped
register, and a custom analog circuit on the PCB (op-amps, VCOs,
filters, noise generators) converts that byte into continuous audio
or visual output. The "code" is the byte write; the rest is
hardware.

When you encounter such a subsystem, ask: **does the source code
implement the mechanism, or just pulse-trigger it?** If the latter,
a "port" is a re-design of the analog circuit in JavaScript — not a
routine-level translation, and not in the spirit of an educational
port.

The honest call is to **drop the subsystem, not defer it.** A defer
is "we'll do it later"; a drop is "there's nothing here to port."
Write a short characterization-only research doc explaining why,
flip status to "dropped" across progress.md / per-project CLAUDE.md
/ DOCUMENTATION_INDEX.md, sweep deferred-to-later comments in code
to say "not ported (no software counterpart)." Leave references for
any future revisit (MAME netlist + FPGA HDL + original schematic).

Example: **asteroids_clone R-G (sound)** — 9 memory-mapped
registers (`$3600-$3E00`) drive discrete analog circuits on the
cabinet PCB. Each byte write selects volume/frequency in the analog
stage; the CPU has no oscillator or wavetable code. Dropped via
`asteroids_clone/docs/research_sound.md` with references to MAME's
discrete netlist + Mikstas's FPGA HDL + the Atari schematic.

The drop-vs-defer transition only applies when the upstream
mechanism is genuinely hardware-only. When the source DOES
implement the subsystem (e.g. phoenix_clone's sound, which the
8085 explicitly builds), defer + later-port is the right call.

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

## When implementation surprises the research

Two lessons surfaced from asteroids_clone I-9's post-port fix
arc. Both apply to retro-port work generally, not just to the
specific project that produced them.

### Visual mismatch → suspect the research, not the code

When ported code is source-faithful per the research doc but
visual output disagrees with expectation (cabinet footage, user
intuition, mechanic feel), the **research claim itself** is the
default suspect — not the port code. Re-derive the relevant
claim from primary source (disassembly, MAME, hardware spec)
before patching the JS or proposing port deviations.

This generalizes the "Agents can write confidently wrong
research docs" warning above: that section is scoped to
sub-agent output, but the same pattern shows up with research
the lead author wrote themselves. The trigger is different —
not "an agent claim feels too clean" but "visual output
disagrees with what the faithful port should produce."

Three I-9 cases proved the pattern, all "code was correct
relative to a wrong research claim":

1. **Collision felt too tight vs cabinet** → research had read
   `$6A22-$6A25 LSR/ROR/ASL` as "extract sign bit into A; `$08
   = |dx|`"; actually a 16-bit unsigned right shift, so `$08
   = |dx|/2`. The CMP against the `$6A55` table thus tested
   half-distances, meaning effective radii are 2× the table
   values. Faithful port of the wrong reading produced
   collision exactly half what cabinet does.
2. **Explosion debris appeared to converge inward** → research
   mapped status bits 2,3 → Shrapnel1..4 by incrementing
   index. Source's `$50F8` jump table at `$10F8-$10FE`
   actually maps 0→Pattern4, 3→Pattern1 (smallest-to-largest
   spread, concentric patterns played smallest-first to grow
   outward). VectorROM.md line 185 had this explicitly: "all
   four patterns are the same just slightly spread out."
3. **Explosion stayed static despite the shape-order fix** →
   research treated `$7324-$7339`'s `$90`-byte emit loop as
   the across-sweep scale mechanism (initially deferred as a
   port deviation). MAME's `dvg_generate_vector_list`
   confirmed those words are no-op VEC opcodes; the real gs
   plumbing was upstream at `$7321`'s LABS emit, where
   `(status & $F0) + $10` gets OR'd into the LABS word's gs
   nibble. Research had missed that path entirely.

**Defense:** when the user reports visual mismatch, "feels
wrong," or "doesn't match cabinet," before patching the JS or
accepting it as a port deviation, ask: *what does the
research doc claim about this behavior, and have I verified
that claim against the primary source recently?* If the claim
is months old or was only verified once, re-derive with
skepticism. "Unexpected output despite faithful port" is a
strong signal the research is wrong, not the code.

### Verify negative source claims (un-disasm, missing routines)

Claims of *absence* in source — "this region is un-disasm",
"this routine isn't decoded", "the body is missing" — are
systematically under-verified and propagate across research
docs as if confirmed. The author writes it once based on a
quick read; future-author inherits the claim; the wrong claim
persists for weeks until a port step actually needs the region.

asteroids_clone's pre-I-9 sweep falsified the "~20% un-disasm"
framing wholesale: `$77B5` (RNG), `$75EC` (asteroid-hit handler),
`$7168` (wave init), `$77D2-$77E8` (direction LUT), `$745A`/
`$745C` (slot scanner), `$77F6` (PrintPackedMsg), `$7C03`/
`$7CDE` (DVG list builders) — all claimed un-disasm in earlier
docs, all fully visible on re-read of `Code.md`. The actual
un-disasm content turned out to be mostly sound-routine
internals (dropped anyway) plus small data tables.

**Defense:** before asserting absence in a research doc, grep
the local mirror of `Code.md` for the specific address. The
check is seconds; the propagating wrong claim costs hours when
a port step later inherits it. If you write "X is un-disasm,"
include the addresses or bytes that prove the absence. Otherwise
downgrade the phrasing to "X looks un-disasm at a glance — verify
before relying on."

This is parallel to "Agents can write confidently wrong research
docs" under "Delegating to sub-agents" — same class of error,
committed by the lead author rather than a sub-agent. Defense is
the same: cite addresses, re-derive from primary source, demand
the bytes.

### Re-evaluate deferrals against current-step impact

When an item is flagged "out of scope, defer to later step"
but turns out to affect the **current step's** quality,
validation, or feel, fix it now rather than letting the
original deferral stand. Deferral decisions made during
planning should be re-evaluated against the actual impact
discovered during implementation.

The asteroids_clone I-9 collision-tightness item was
originally classified as "defer until after I-9 + I-11
complete, to revisit alongside other gameplay-feel tuning."
The deferral assumed it was a polish-stage concern — but in
practice the wrong (half-size) radii made shots feel
unreliable, blocking confident validation of the I-9h
collision kernel itself. Re-investigating it during I-9 both
unblocked validation AND turned out to resolve a research-
doc bug (see previous subsection).

**Defense:** before deferring an item, ask:
- Does it interfere with testing the current step's other
  code paths?
- Does it cause visible friction during play-testing of this
  step's output?
- Is the only "scope-conserving" reason for the deferral that
  it spans subsystems the current step doesn't touch directly?

If yes to any of these, the deferral is probably wrong — do
the work now. Polish-stage deferrals (CRT glow rendering,
sound) are fine; gameplay-feel and validation-blocking
deferrals are not.

### Sub-step plan + save-point commits + final squash

Single-commit implementation of a multi-sub-step subsystem leads
to fragile, hard-to-validate work. **asteroids_clone I-11 v1** is
the cautionary example: tried to land collisions + scoring + lives
+ HUD as one diff (~600 lines, 10 files), spent 4 patch rounds on
HUD coordinates and 3 on the ship explosion, still buggy at the
end, rolled back entirely. Redone as 6 in-session save-point
commits, then squashed — landed cleanly.

The pattern that works:

1. **Pre-implementation research doc** for the trickiest sub-step
   first. asteroids_clone I-11 had `research_hud_coords.md` +
   `research_ship_explosion.md` land *before* impl started.
2. **Sub-step plan** — informal: a short list of bullets in a
   scratch doc, a comment block, or a throwaway plan-branch. The
   sub-step list should be small enough that each bullet maps to
   one commit's worth of work (~50-200 lines).
3. **Each sub-step lands as one save-point commit.** Browser-
   verify the change visually before moving to the next. If a
   sub-step approach is wrong, `git reset --hard HEAD~1` rolls
   back cleanly.
4. **Final squash** at the end into one `impl I-N` commit. The
   progress.md "I-N scope" subsection carries the per-sub-step
   notes + per-deviation decode notes — the level of detail that
   doesn't fit in a commit body but is needed for cross-PC
   continuity.

The save-point commits aren't meant to be published — they exist
for the developer's safety during the work. Only the squash goes
to origin. Commit-body convention: cite the research-doc sections
that hold the details, don't restate them in the commit message.

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
