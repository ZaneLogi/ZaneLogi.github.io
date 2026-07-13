# block_stacker — CLAUDE.md

Per-project guidance. Overrides the root `CLAUDE.md` where they differ.

## What this is

A **faithful gameplay port of NES Tetris** to a web canvas. The goal is the
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

**Study complete, pre-implementation.** All gameplay sub-goals (A–D) are decoded
in `docs/research_gameplay.md`. One item is intentionally left for empirical
validation:

- **Entry delay (ARE) exact frame count** — mechanism derived from source
  (`updatePlayfield` rewinds `vramRow`; render copies 4 rows/frame; spawn+scan
  gate on `vramRow ≥ 32`). Pin the exact constant by **frame-stepping an
  emulator** before hard-coding — do not assert from memory.

## Scope (pending decision, not study)

- **Type A** (endless) first; Type B (garbage goal) optional.
- **Drop:** 2-player + garbage, endings, high-score entry, demo, stats screens.
- **Defer:** audio (APU music + SFX are software-sequenced — portable, but a
  separate research-first effort, like `block_breaker`'s sound).

## Running locally (once built)

Repo root: `python -m http.server -b 127.0.0.1 8080`, then
`http://127.0.0.1:8080/block_stacker/`. ES6 modules, no build step — a single
`index.html` boots `main.js`.
