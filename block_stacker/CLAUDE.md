# block_stacker — CLAUDE.md

Per-project guidance. Overrides the root `CLAUDE.md` where they differ.

## What this is

A **gameplay port of NES Tetris** to a web canvas. The goal is the
*mechanics and feel* — playfield, piece set, rotation, input/DAS, gravity,
lock/line-clear/scoring cadence. **Visual assets are explicitly not the point**;
the board is drawn with Canvas APIs, not the original CHR tiles.

Named `block_stacker` as the sibling of `block_breaker` (Arkanoid): that game
*breaks* blocks, this one *stacks* them. Genre name, not the trademark.

## Source (reference disassembly)

`C:\Z_Temp\TetrisNESDisasm\` — CelestialAmber's complete, byte-matching ca65
disassembly of `Tetris (U) [!].nes` (md5 `ec58574d96bee8c8927884ae6e7a2508`).
Cloned outside the repo, per the repo convention for reference sources. Key
files: `main.asm` (all PRG code), `tetris-ram.asm` (RAM map), `constants.asm`.

**Citation convention:** every ported routine cites `// main.asm:NNNN` (label or
line). Re-grep the cited region before relying on a claim (root-repo rule).

## Architecture — routine-level translation

Decided at research stage (see `docs/research_gameplay.md`): collision reads a
dedicated 200-byte `playfield` RAM array (`$0400`), **not** the PPU nametable —
zero screen-RAM readback. So routines port 1:1 to JS functions; ROM tables are
extracted verbatim; the `playfield` array is drawn to canvas.

**Timing:** reproduce the NMI-rate logic with a **fixed-timestep 60 Hz tick**
(same pattern as `mario_physics/`). `requestAnimationFrame` is the render pump
only. Intra-frame order is load-bearing: **shift → rotate → drop**, all before
gravity, in the same tick.

## Status

**Phases 1–2 done; phase 3 next.** Build proceeds in phases (tracker:
`docs/research_gameplay.md` → *Implementation phases*):

1. **Core substrate** ✅ — `playfield` array + `isPositionValid`,
   piece/rotation/spawn tables, spawn, fixed-60 Hz tick, `playState` machine,
   canvas render.
2. **Movement** ✅ — edge-detected controller input, DAS shift (16-charge /
   6-repeat, wall-charge, carries across pieces), no-kick A=CW/B=CCW rotation,
   soft drop + gravity, lock-on-landing. Verified by driven per-frame checks.
   Surfaced + fixed a research-doc error: **soft drop is every 2 frames, not 3**
   (`@downPressed` resets the counter to 1 and fires at 3 → period 2).
3. **Lock / clear / score / level** ✅ — lock into the array (+ top-out →
   game-over curtain), line detect + 20-frame center-out wipe + collapse, scoring
   (`pointsTable × (level+1)` + soft-drop points), level-up (BCD `>>4` threshold).
   *Deviations (view-space / phase-deferred):* score & lines as plain ints (BCD is
   a display detail; the level-up `>>4` quirk is replicated), collapse deferred to
   after the wipe (we render the array directly, not via VRAM), `vramRow`/ARE gates
   skipped (phase 5). Verified by driven cycle tests + confirmed playable
   end-to-end in a real browser.
4. **RNG** ✅ — roll-twice randomizer: 16-bit LFSR (taps 1 & 9, ticked every
   frame) + reroll-on-repeat-or-8th-slot. Verified: long period / no stick, even
   7-piece spread, ~6% immediate-repeat rate (vs 14% uniform — the NES drought
   feel), deterministic. Replaced the placeholder cycle.
5. **Entry delay (ARE)** — next (needs emulator calibration). · 6. Modern toggles.

Modules: `src/{constants,pieces,playfield,game,render,input}.js` + `main.js`.

**Still open (empirical, not memory):**
- **Entry delay (ARE) exact frame count** (phase 5) — mechanism derived
  (`updatePlayfield` rewinds `vramRow`; render copies 4 rows/frame; spawn+scan
  gate on `vramRow ≥ 32`); pin the constant by **frame-stepping an emulator**.
- **In-app preview freezes when idle** (hidden tab → no rAF, no compositing) —
  verify look/feel in a real browser (VS Code Live Server), not the in-app pane.

## Scope — decided (option b)

An NES core (default, no flags) plus modern QoL as opt-in URL toggles (the
`block_breaker` `?easy`/`?debug` pattern). Detail: `docs/research_gameplay.md`
→ *Scope decisions (E)*.

- **Type A** (endless) first; Type B (garbage goal) optional.
- **Toggles in (b):** `?ghost`, `?hold`, `?harddrop`, `?next=N` — additive
  layers over the core, never woven in.
- **Drop:** 2-player + garbage, endings, high-score entry, demo, stats screens.
- **Defer:** audio (APU music + SFX are software-sequenced — portable, but a
  separate research-first effort, like `block_breaker`'s sound).
- **Not in (b):** SRS / wall-kick, 7-bag, lock delay = a separate ruleset
  (option c) — not a toggle.

## Running locally (once built)

Repo root: `python -m http.server -b 127.0.0.1 8080`, then
`http://127.0.0.1:8080/block_stacker/`. ES6 modules, no build step — a single
`index.html` boots `main.js`.
