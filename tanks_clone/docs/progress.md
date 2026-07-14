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

## Next
- Fill stubs subsystem-by-subsystem (start with `Field` — the central service),
  each with its own `research_*.md` resolving the relevant §8 `[?]` items.
