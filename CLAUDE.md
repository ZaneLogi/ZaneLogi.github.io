# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Rules at a glance

The one-line form of every rule below. Each links to the section that carries the
reasoning + the case that paid for it; read that before leaning on the rule.

**Working across PCs & commits**
- One PC at a time; pull at session start, push at end. → *Cross-PC workflow*
- One-line commit subject when a doc carries the detail; code + its doc land
  together. → *Commit conventions*
- Repo-wide infra changes go on the branch chosen by *target*, not where you sit.
  → *Cross-PC workflow*

**Choosing the port architecture** (decide before coding)
- Faithful to what the **player can observe**; free with what only the CPU can.
  → *The governing test*
- Routine-level vs screen-RAM mapping is set by the source's mechanism profile.
  → *The two viable architectures*
- Hardware-only subsystem (analog circuit, no CPU code) ⇒ **drop, not defer**.
  → *When a subsystem is hardware-only*

**When to stop, when to deviate** (you flag, the user rules)
- Scale rigor to reversibility; start once the next step is cheap to undo.
  → *Scale rigor to reversibility*
- Work first, improve later. → *Scale rigor to reversibility*
- A rule fighting the task ⇒ flag in one line, wait. → *Flag a rule*
- A human command breaking a rule ⇒ flag in one line, don't adjudicate.
  → *A human command that breaks a rule*
- User's deliberate non-source add-ons are fine — build them, just mark them.
  → *Faithful is a chosen default*

**Not trusting stale knowledge**
- A claim you didn't just verify is a suspect; re-derive from source, cite the
  address. → *Research claims rot*
- Sub-agents for breadth, never depth; demand address citations, re-grep them.
  → *Delegating to sub-agents*

**Implementation & verification**
- A "defer" that hurts the current step is wrong — do it now. → *Re-evaluate
  deferrals*
- Multi-sub-step work = save-point commits, then squash. → *Sub-step plan*
- Measure canvas pixels / rendered strings, never screenshots. → *rotoscoped
  lessons #4*, *UI conventions*
- Suspect the preview is being *driven* wrong before blaming the tool; check
  `visibilityState` first. → *Verifying in the browser preview*

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

The top-level directories are the projects — retro-game ports plus small
canvas experiments — discoverable with `ls`. Which one is active is set by the
branch (one game per branch); if a project has its own `CLAUDE.md`, read it
first.

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
- **Write rich commit messages** *(but see "Commit conventions" below)*.
  They are the cross-PC communication channel — anything you'd want the
  other-PC me to know belongs there (or in a research doc / CLAUDE.md
  update committed in the same change).
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

## Commit conventions

Promoted repo-wide from `lunar_lander/CLAUDE.md`, where this style was
first used consistently. It refines the cross-PC "rich commit messages"
rule above: the richness lives in the **doc**, not the commit body.

- **One-line title + the trailer, no body — when a doc reveals the
  change.** If the change updates a doc that explains what changed and
  why (a `CLAUDE.md`, a `docs/research_*.md`, the living per-step
  tracker, …), the commit is just a one-line subject plus the
  `Co-Authored-By` trailer. The doc + the diff already carry the detail,
  so a multi-line body would only duplicate them. *(When there is no doc
  to point at, fall back to the cross-PC rule above and put the detail in
  the body.)*
- **The commit contains the implementation together with its doc
  update.** When a change has a doc home, the code and the doc change go
  in the **same** commit — never "code now, docs later." This is what
  makes the one-line title safe: the committed doc is where the reader
  goes for the detail, so it must land with the code it describes.

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

A retro-game port has **two viable architectures**, and the choice is a
**research-stage decision** — made before coding, from what the disassembly
reveals about the source's mechanism dependencies. Picking implicitly ("I'll
draw to canvas and figure it out as I go") accumulates ad-hoc deviations, some
wrong-direction.

### The governing test — faithful to what the *player* can observe

*(Promoted from `tanks_clone/CLAUDE.md` on merge — Zane's ruling
2026-07-16. Worked example + a sorted verdict table:
`tanks_clone/docs/research_game_flow.md` §7.1.)*

**Faithful to what the player can observe; free with what only the CPU
can observe.** Do **not** mimic mechanisms that exist because of the
CPU's hardware design. Routine-by-routine translation of *plumbing*
buys only a byte-for-byte match, and **an emulator does that better
than we ever will.** The source is the authority on *content, rules and
timing* — never on *shape*.

This is the sharp, usable form of the "is it the design's mechanism, or
its coincidence?" test below, and it generalizes past *data layout* to
control flow and everything else. A packed tri-state flag byte becomes
a state enum plus a timer; an indirect `JMP (ptr)` through a jump table
becomes a `switch` on the state it was dispatching; a screen-clearing
curtain that doubles as a DMA becomes a renderer wipe. Behaviour
identical, shape ours.

**Watch the failure mode it was written from:** admiring a clever
hardware trick — a curtain that doubles as a DMA, a coroutine
hand-built out of `wait_1_frm`, a tri-state flag byte — and mistaking
*cleverness* for *mechanism*. The question is never "is this clever?"
but "can the player tell?"

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

- **phoenix_clone → routine-level.** 3 screen-RAM-readback mechanisms (shield
  absorption `L0CB4`, L2085 explosion pre-clear, alien tile-persistence), **all
  coincidence-style** — the display just happens to be tile-buffered. Small
  local state-driven substitutes preserve behaviour. Count = 3, none core ⇒
  routine-level was clearly right.
- **galaga_clone → routine-level**, similar profile.
- **space_invaders → screen-RAM (canvas-pixel-buffer).** Collision *is* a 1bpp
  video-RAM pixel read — the pixel buffer IS the collision geometry, so this is
  **mechanism, not coincidence.** The canvas is the screen-RAM analog: draw,
  then `getImageData()` at shot positions. No substitutes needed; a parallel
  collision buffer would be the expensive alternative. See
  `space_invaders/game.js:handlePlayerShot`. Ref:
  <https://www.computerarcheology.com/Arcade/SpaceInvaders/>.

### The payoff: research depth buys coding calm

**The more thoroughly research characterizes the source's mechanism profile,
the fewer architectural surprises during coding** — no mid-project rewrites, no
accumulating deviations. Research time before coding is the cheapest time in the
project; the cost of skimping is paid back with interest in implementation
drift.

*Case — phoenix_clone: the L2085 explosion scatter was deferred ~6 weeks on the
wrong assumption that it needed screen-RAM persistence. A closer read of `Code.md
$2085-$20E2` would have shown L2085 is write-only, unblocking it immediately.*

### When a subsystem is hardware-only — drop, not defer

Some retro "code" is just a byte poked to a memory-mapped register, where a
discrete analog circuit on the PCB (op-amps, VCOs, filters) turns it into audio
or video. The byte write is the code; the rest is hardware.

**Ask: does the source *implement* the mechanism, or just *pulse-trigger* it?**
If the latter, a "port" would be re-designing the analog circuit in JS — not a
translation, and not in the spirit of the project. **Drop it, don't defer** — a
defer says "later," a drop says "nothing here to port":

- Write a short characterization-only research doc saying why.
- Flip status to "dropped" across progress.md / project CLAUDE.md / doc index;
  sweep code comments to "not ported (no software counterpart)."
- Leave revisit references (MAME netlist + FPGA HDL + schematic).

This applies **only** when the mechanism is genuinely hardware-only. When the
source *does* implement it (e.g. phoenix_clone's sound, built by the 8085),
defer + later-port is right.

*Case — asteroids_clone sound: 9 registers (`$3600-$3E00`) drive discrete analog
circuits; the CPU has no oscillator/wavetable code. Dropped via
`research_sound.md` with MAME-netlist / FPGA-HDL / schematic references.*

## Defaults bind until someone deviates deliberately — you flag, the user rules

The research-first rigor above pushes one way — research harder, verify more,
follow the source. That bias is right for *irreversible* work but has no brake;
applied to everything it produces the opposite failure, **stalling**. This
section is the brake. The through-line: a default holds until a deviation is
*deliberate*, and the four subsections cover who gets to make it deliberate —
you (by reversibility), you-flagging-a-rule, you-flagging-a-human-command, and
the user by choice.

### Scale rigor to reversibility, not habit — when to stop researching

**Exhaustive-up-front is for *irreversible* decisions only** (the architecture
choice, a data format the port hangs off, a source claim later steps build on) —
cheap to research, expensive to undo. **Anything with a fast check is cheap to
reverse: build it, run it, let the result falsify you** rather than researching
it to certainty first.

- **Stopping condition:** once you can name the next concrete step and starting
  it is cheap to undo, **start**. Research ends when the remaining uncertainty is
  *load-bearing* (would change what you build) — not when you *feel* sure
  (comfort uncertainty is not a reason to keep reading).
- **Re-reading what's already in context is not research** — it's avoidance in
  diligence's clothes. Act on what you hold.
- **The tell:** if preparing to act cost more than attempt-and-check would,
  you're past the line. Prefer the small reversible attempt — it produces
  evidence; more reading produces a feeling.
- **Work first, improve later** — the simple thing that works over the clever
  thing that might.

*Case — 2026-07 sfx task: stalled re-reading source already in context, the
research bias with no governor.*

### Flag a rule that's fighting the task — one line, then wait

**This doc is a prior, not a straitjacket.** A rule pushing you toward a bad
outcome (stalling, disproportionate effort, a wrong-direction pull) → **say so
in one line and pause for a ruling.** Wanted, not insubordination.

> "Rule X is pushing me to Y, but this task looks like Z (cheap / known /
> reversible). Relax it here?" → then wait; once ruled, don't re-litigate.

- **Flag the mismatch, not your discomfort** — the trigger is a rule genuinely
  fighting reversibility/verifiability, not reluctance to do hard work.
- **The user can invite it** — "doc check?" is the cue to raise anything awkward.

### A human command that breaks a rule — flag it, don't adjudicate

The mirror: a *human's instruction* crosses a rule here. **Name the break in one
line and let them rule. Do NOT analyse whether the rule is right, weigh
exceptions, or propose rewording** — that judgment is theirs.

> "Heads up — X breaks rule Y. Your call." → then do as they say.

Rewrite the rule only if explicitly asked, and keep it brief. Answering a plain
instruction with an "is the rule too tight" essay is the failure this guards.

### Faithful is a chosen default — the user's deliberate add-ons are fine

The follow-the-source rigor targets **accidental drift**, not user intent. When
the user **deliberately chooses** a non-source feature (hard drop, ghost, a QoL
toggle, an original mechanic), **that choice is the justification** — build it
without agonizing, beyond a one-line heads-up. The flag-and-wait protocol is for
*you* deviating on load-bearing mechanism, not for a feature they asked for.

- **Still mark it** in code and docs as a deliberate non-source deviation —
  honesty about it is not resistance to it.
- **The faithful default still binds the parts they want faithful** (the ported
  core mechanics). This doesn't loosen those.

*Case — block_stacker, a hard-drop score bonus: "we do faithfully only when I
think we can... with extra innovation or add-on, we do it on purpose, we know
it is not faithful. so what? this is our clone."*

## Delegating to sub-agents

**Sub-agents are research instruments, not decision-makers.** Good for **bounded
breadth-first scans** ("find every collision routine," "list all callers of
`$0CC4`," "audit which `Lxxxx` paths are ported"); **unreliable for depth** —
synthesis, judgment, anything needing conversation context.

- **Demand address citations in the prompt** — "cite addresses for every claim,
  group by source label, quote the bytes when non-obvious." That convention is
  what makes the output recoverable.
- **Re-grep each cited region before relying on it** — a sub-agent claim is a
  research claim like any other (→ "Research claims rot").

### Cheap-recovery commit hygiene

**When sub-agent output drives a code change, keep commits small enough that a
wrong-agent revert costs one commit, not a session.**

*Case — phoenix_clone: DrawShields landed as two commits (mixin-refactor, then
feature+audit); had the audit exposed a broken DrawShields, the refactor would
survive the revert.*

## Research claims rot — verify before you build on them

**A research claim you did not just verify is a suspect.** Docs, sub-agent
findings, and your own past notes all decay the same way: written once from a
quick read, inherited as settled, falsified weeks later by the port step that
finally depends on them. The cost is asymmetric — a 5-second re-grep vs hours
of unwinding a wrong claim that reached code.

**The defense, in every case: re-derive from primary source and cite the
address.** If you write "X is un-disasm" or "the source never does Y," include
the bytes that prove it; otherwise downgrade to "looks like … — verify before
relying on."

**Four triggers. Any one of them means stop and re-derive:**

- **A claim feels too clean and you can't see *why* it's true.** Sub-agents are
  usually right about *what* and wrong about *where* — check the pointer, not
  just the conclusion. A wrong pointer copied into a doc becomes a real gap.
- **Visual output disagrees with what the faithful port should produce.** When
  code is source-faithful per the doc but the result contradicts cabinet
  footage, user intuition, or feel, the **research claim is the default
  suspect — not the port code.** Ask: what does the doc claim here, and when
  was that claim last checked against primary source? Months-old or
  verified-once ⇒ re-derive before patching the JS or accepting a "port
  deviation."
- **A claim of *absence*** — "this region is un-disasm," "that routine isn't
  decoded," "the body is missing." These are systematically under-verified and
  propagate as if confirmed. Grep the local source mirror for the specific
  address; it takes seconds.
- **The words "always" or "never."** Demand the address where it *doesn't*
  happen, and re-check.

*Case — phoenix_clone 2026-05-20: an agent named `$39F0` as the bird-vs-player
path; `$39F0` holds only a ShieldCount check + `JP $0CC4`. The mechanism is 100
bytes earlier at `$3980`, repurposing the player bullet as a screen-RAM probe
via `$3800`. Right answer, wrong pointer.*

*Case — phoenix_clone DrawShields: three doc claims survived review for weeks
and died on contact with implementation. "Shield duration 255 frames" (really
~63 active; 255 is the re-fire cycle); "no shield gate for alien-body
collisions" (`$0F00` dispatches on ShieldCount before any tile scan); a
`// TODO: $3980 (cosmetic)` comment on what is actually the bird-kills-player
path.*

*Case — asteroids_clone I-9, three visual mismatches, all "code correct
relative to a wrong claim." Collision felt half-size: `$6A22-$6A25` was read as
a sign-bit extract, but it is a 16-bit unsigned shift, so the `$6A55` table
tests half-distances and real radii are 2×. Debris converged inward: the
`$50F8` jump table maps 0→Pattern4, 3→Pattern1 (smallest-first, growing
outward), not incrementing. Explosion stayed static: the scale plumbing is
`$7321`'s LABS emit OR-ing `(status & $F0) + $10` into the gs nibble — research
had missed the path entirely and blamed a `$90`-byte loop that MAME confirms is
no-op VEC opcodes.*

*Case — asteroids_clone: a "~20% un-disasm" framing was falsified wholesale on
one re-read. `$77B5` (RNG), `$75EC` (asteroid-hit), `$7168` (wave init),
`$77D2-$77E8` (direction LUT), `$745A`/`$745C` (slot scanner), `$77F6`
(PrintPackedMsg), `$7C03`/`$7CDE` (DVG list builders) were all fully visible.
The genuinely-missing content was sound-routine internals (dropped anyway) plus
small data tables.*

## Implementation process

### Re-evaluate deferrals against current-step impact

**A "defer to later" that turns out to affect the *current* step's quality,
validation, or feel is wrong — fix it now.** Planning-time deferral decisions
get re-judged against what implementation actually reveals.

Before deferring, ask: does it block testing this step's other code paths?
Cause visible friction when play-testing this step's output? Is the only reason
to defer that it *spans* subsystems this step doesn't touch? **Yes to any ⇒ do
it now.** Polish-stage deferrals (CRT glow, sound) are fine; gameplay-feel and
validation-blocking ones are not.

*Case — asteroids_clone I-9: collision-tightness was filed as polish, "revisit
after I-9 + I-11." But the wrong half-size radii made shots feel unreliable,
which blocked validating the I-9h collision kernel itself. Doing it in-step
unblocked validation *and* fixed the research-doc bug behind it.*

### Sub-step plan + save-point commits + final squash

**Don't land a multi-sub-step subsystem as one commit.** Break it up:

1. **Research doc for the trickiest sub-step first** — before any impl.
2. **Sub-step plan** — an informal bullet list (scratch doc / comment block /
   throwaway branch), each bullet ≈ one commit's worth (~50-200 lines).
3. **Each sub-step = one save-point commit**, browser-verified before the next.
   Wrong approach ⇒ `git reset --hard HEAD~1` rolls back clean.
4. **Final squash** into one `impl I-N` commit. The per-sub-step + per-deviation
   detail lives in progress.md, not the commit body (→ Commit conventions).

Save-point commits are developer safety, not for publishing — only the squash
goes to origin.

*Case — asteroids_clone I-11 v1: collisions + scoring + lives + HUD as one
~600-line/10-file diff → 4 patch rounds on HUD coords, 3 on the ship explosion,
still buggy, rolled back. Redone as 6 save-point commits then squashed — landed
clean.*

## Lessons — porting a rotoscoped animation engine (from prince_of_persia)

These surfaced from `prince_of_persia` (a routine-level port of Prince
of Persia's rotoscoped actor from SDLPoP) but generalise past it — they
belong with the retro-port lessons above. Getting the run cycle right —
facing → anchor → step distance — took several wrong turns; each lesson
was paid for in bugs.

1. **Source data that looks "weird" is usually load-bearing.** The frames'
   asymmetric padding looked like sloppiness; it was the per-frame
   registration. Suspect *meaning* before normalising it away. (= the rule
   *"deviations are load-bearing"* above, applied to art assets.)
2. **In a faithful port, find the transform in the source — don't invent
   it.** The flip's mirror axis was guessed twice (box centre, content
   centre) before reading `draw_mid`, where PoP's exact rule (`xpos -= w;
   hflip`) was waiting. The draw/blit routine — flip, clip included — is part
   of the mechanism; read it, don't reconstruct it.
3. **Static correctness ≠ dynamic correctness.** A fix that passes a
   single-frame symmetry test can still be wrong in motion. When the symptom
   is animation, measure the animation over time (the failing feature — the
   feet), not a static proxy.
4. **Measure canvas pixels, not screenshots.** The preview screenshot
   rasterises at a non-1:1 scale — it invented an offset that wasn't there and
   could equally hide a real one. Every correct conclusion came from
   `getImageData` via `preview_eval`. Eyeballing precise position / facing /
   symmetry is actively misleading.
5. **Suspect your own last fix; trust the observer's "this looks off."** The
   step asymmetry was *caused by* the previous fix — a new symptom right after
   a change makes the change the prime suspect. When the user reports a
   mismatch and your reasoning "proves" it's fine, **measure** — the observer
   watching the real output beats reasoning from assumptions.
6. **Follow a faithful source; deviating needs a *load-bearing* reason, never
   "simpler for now."** Two reasons qualify: a hardware-only mechanism (drop,
   above), and a **view-space number** — a quantity in a render space we chose
   *not* to reproduce, which you **re-derive in our view, don't copy.** *(PoP
   insets the collision face ~10 units because the DOS room is drawn pseudo-3D;
   a flat clone stops flush and re-derives any offset from its own render. Keep
   the collision *logic* faithful — which tile blocks, link-hop, bump/recoil,
   the latch — re-express only the number.)* The trap in the other direction:
   **shortcuts entangle** — a `curr_col` clamp and a front-only `getEdgeDistance`
   each existed only because the other did, together producing a climb-into-wall
   bug that cost a full rework to unwind. Corollaries: **(a)** prove entanglement
   with an A/B toggle *before* ripping it out; **(b)** no "make it work for now"
   off-ramps on *substrate* — defer separable features, never the substrate.
7. **Flag-and-wait when the user's ask looks like it breaks follow-the-source.**
   Don't grind to reconcile it, and don't self-adjudicate whether the deviation
   is "legitimate" (that's the stall). This is the same protocol as "A human
   command that breaks a rule" above — one line, then wait. *(Paid for
   2026-07-09 on `wall_dist`: self-adjudication stalled a whole session on one
   x-bias number.)*

## UI conventions — HUD / on-screen readouts

A general UI rule (surfaced in `prince_of_persia`, applies to every game's HUD).

**Live readouts use fixed-width fields — pad each value to its domain's maximum
width so the text never bounces.** A HUD that updates every frame shifts every
field to the right of any value whose *digit / character count* changes
(`frame=7` → `frame=11`, `dir=left` → `dir=right`). That horizontal jitter is
noisy and hard to read. A monospace font alone does **not** fix it — `1` and
`11` are still one cell vs two; the *field width itself* must be held constant.

The rule, in three parts:

1. **Monospace + `white-space: pre`** on the container, so the pad spaces render
   at a fixed cell width (a proportional font defeats padding).
2. **Pad every variable field to the max width its value can reach** — numbers
   right-aligned (`padStart`), state words left-aligned (`padEnd`). Size to the
   domain maximum: a coordinate bounded `0..640` → 3 digits; a `left`/`right`
   state → 5. Constant fields (e.g. `[bounds 0..640]`) need no padding.
3. **The test is one constant string length.** Sample the rendered readout over
   many ticks across all states; if the set of distinct lengths is > 1, a field
   is still bouncing. (Measure the string, not a screenshot — same discipline as
   the pixel-measure lesson (#4) above.)

Reference implementation: `prince_of_persia/demos/motion.js` — the `padN` /
`padW` helpers and the HUD line that uses them.

## Verifying in the browser preview

*(Promoted from `tanks_clone/CLAUDE.md` on merge; paid for across
`tanks_clone` and `prince_of_persia`. Each project keeps its own
specifics — port number, server root, launch name — in its own doc.)*

The preview pane is a **valid verification target**. Treat a failure as
a bug in how it is being *driven* until the checks below say otherwise.

**The ES-module cache trap.** Everything here is ES6 modules with no
build step, so a cache-busted `import('./game.js?t=N')` re-fetches
`game.js` — but *its* `./modes/session.js` import resolves to the
already-cached URL, so you silently test stale code against fresh code.
**Reload the document** after editing a module; don't hand-roll a
cache-busted import and trust it.

**Measure `document.visibilityState` before diagnosing anything.**
Skipping this one check is what makes preview problems look mysterious
and recur.

| state | rAF | meaning |
|---|---|---|
| `"visible"` | 60 Hz, indefinitely | healthy |
| `"visible"` | frozen | renderer **wedged** → stop + restart the preview |
| `"hidden"` | frozen, timers ~1–2 Hz | pane not open. Correct browser behaviour (Page Visibility API + background-timer throttling) — **not fixable from app code** |

- **rAF does NOT need driving.** While `"visible"` it ticks
  indefinitely on its own (measured: 36 s untouched, 68 palette swaps
  at the exact cadence). The belief that it "only ticks while actively
  driven" was **wrong** — measured on a *closed* pane and blamed on the
  wrong mechanism.
- **A hidden pane is not a bug to fix — but you may ask for it to be
  opened.** You cannot open it yourself: fronting a tab is in reach,
  opening the *pane* is the user's UI action. Ask when a check needs
  real pixels or feel; one line, then wait.
- **Never conclude from a check that drove the page.** Scheduling your
  own rAF wakes the loop and gives a false pass. Probe passively —
  `setInterval` plus a state proxy.
- **NEVER ask for a viewport bigger than the pane's real window.** The
  resize is accepted silently, then *emulated and scaled*; with a
  fractional dpr that mis-composites, and it is **sticky across
  preview restarts** (so restarting looks like it didn't help). The
  one-line check: `window.innerHeight > window.outerHeight` ⇒
  impossible for a real window ⇒ you are being scaled. Best is not to
  resize at all — pick a viewport that fits and zoom the *page*.
- **Prefer deterministic verification when it suffices** — it usually
  does, and it is the better test: construct the game headless, stub
  input, drive ticks, assert on state or `getImageData`. This is the
  same discipline as "Measure canvas pixels, not screenshots" (lesson
  #4 of the rotoscoped-port section), approached from the other side.
- **Keep the render loop unkillable** (always reschedule, never
  conditionally stop) and paint one frame at load. Cheap insurance,
  independent of everything above.

**When the pane looks wrong, suspect your own manipulation first.** The
2026-07-16 case was self-inflicted start to finish: four theories spent
blaming the environment — hidden-tab throttling, a stale resize layer,
a wedged renderer, a split-view toggle — while the disproof
(`innerH > outerH`) sat unread in my own tool output. The pane behaved
correctly given what it was asked for, and so did the browser.
