# tanks_clone — progress

Faithful port of NES **Battle City** (Japanese Namco 1985), built
**architecture-first**: analyze subsystems + interactions → design the JS class
decomposition → scaffold commented stubs (citing source) → then port routines.

- **Source disasm:** `C:\Z_Temp\NES-Games-Disassembly\Battle City\` (cyneprepou4uk),
  sparse-checkout. Per-PC — re-clone on the other PC if absent.
- **Legacy reference:** `../tanks/` (incomplete earlier clone — no enemies/AI).
- **Data-model decision:** idiomatic OO, faithful *behavior*, do **not** mirror
  the 6502 zero-page array layout.

## Phase log

- **P0 — System interaction map.** ☑ Done: `research_system_interaction_map.md`.
  Covers the two-halves frame model, top-level flow, the 18-step battle pipeline
  (§3, order is a faithfulness invariant), the `tank_flags` state machine, the
  13 subsystems, the shared-state coupling graph, and the **§7 OO decomposition
  — LOCKED 2026-07-15**.
  - Key finds: field buffer `$0400–$07FF` is tilemap **and** collision grid
    (bit7 = occupancy); slots 0=P1/1=P2/2–7=enemies (decoded); bullet[i]↔tank[i],
    2nd-bullet = players-only upgrade (decoded); enemy fire = 1/32 RNG, frozen by
    clock power-up.
- **P1 — Stub scaffold.** ☑ Done. 16 ES6 modules (one per §7 class) + `index.html`
  + `main.js` + per-project `CLAUDE.md`. Each class carries responsibility +
  source citations, no logic yet. `Audio` + `Construction` are deferred stubs.
  `Game.update()` lists the §3 pipeline order literally (the faithfulness
  invariant). Verified in-browser: whole import graph loads, `Game` builds,
  the 18-step pipeline ticks clean (no missing methods / broken imports).
  Preview: launch.json `tanks_clone` @ 127.0.0.1:8089.
- **P2 — ROM data extraction + viewers.** ☑ Done. `tools/extract.py` (build-time,
  validates) → `assets/dat_chr.js` + `assets/dat_levels.js`; `palette.js` +
  `tiles.js`; `demo/chr_viewer.*` + `demo/level_viewer.*`. The terrain pipeline is
  decoded and verified end to end. Detail: map §1 / §5 S2 / §5 S9 / §7.
  - **Stage format** — 91 B = 182 nibbles = 14×13, high-nibble first, col 13 is
    padding (`$D` in 468/468 rows) ⇒ **13×13** blocks of 16×16. `sub_F000_draw_stage`
    confirms the stride itself (`#$5B` = 91) and `A=$FF` → the demo stage.
  - **Two tables per block code** — `tbl_DACB` ($DACB) → its 2×2 tile ids,
    `tbl_DABB` ($DABB) → its BG palette. Both read by `sub_D80B`.
  - **CHR split is decoded, not assumed** — `$2000 = …|$B0` ⇒ BG at `$1000`,
    sprites at `$0000`, **8×16 sprite mode**. In 8×16 the OAM tile byte's bit 0
    picks the table, so sprites also draw BG glyphs (`$C59C` → `#$9D`).
  - **Sprite palette = slot index** for players (`$DFE8` `TXA`); enemies flicker
    per frame via `tbl_E003`; bonus tanks flash 2↔3. **BG text has no palette** —
    it inherits its attribute quad (default 0, `$D7E1` clears `$07C0` to `$00`).
  - **Corrections to P0:** §2's stage-loop shape (wait is at the TOP; pause gates
    only `$C2E6`; `$E23B`/`$E0D8` were missing); §5 S13's "`stage_FF` = construction
    default" (it is the **demo** stage). §8's cell-geometry `[?]` closed.
  - **Verified** — build-time invariants (all 36 files 91 B; pad col `$D` 468/468;
    codes `$0-$D` only); render pixel-exact vs the legacy `../tanks/` level 1
    (incl. the `$9` steel at (6,3)); all 4 terrain families through their own
    attribute palette; `$C31D` schedule swept deterministically (changes at
    frames 0/32/64/96); the live water shimmer probed **passively** (250 ms
    samples ⇒ runs of 2 = 532 ms/swap = 32 frames @ 60.0988 Hz).

## Next
- Fill stubs subsystem-by-subsystem, starting with `Field` (the central service),
  resolving the §8 `[?]` items as the work reaches them.
- Docs are written when the content needs a home, sized to it — no one-doc-per-
  subsystem rule (map, "where a finding lands"). `Field` looks like it earns its
  own file (block/tile decode, occupancy, pixel→cell, the `$11` puzzle); a smaller
  subsystem may only need a map section, a cited constant, or a code comment.
