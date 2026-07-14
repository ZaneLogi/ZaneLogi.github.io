# tanks_clone — CLAUDE.md

Faithful port of NES **Battle City** (Japanese Namco, 1985), built
**architecture-first**. Branch: `tanks_clone`.

## Read first
- `docs/research_system_interaction_map.md` — the big view: subsystems, the
  per-frame pipeline, coupling, and the **§7 OO decomposition (LOCKED)** that the
  code scaffold follows.
- `docs/progress.md` — living phase tracker.

## Source of truth
- Disassembly: `C:\Z_Temp\NES-Games-Disassembly\Battle City\` (cyneprepou4uk),
  sparse-checkout. **Per-PC** — re-clone on the other PC if absent:
  `git clone --filter=blob:none --no-checkout … && git sparse-checkout set "Battle City"`.
- Legacy earlier clone (no source, incomplete — no enemies/AI): `../tanks/`.
  Reference only; `tanks_clone` is the from-source rebuild (like `ultima6_clone`
  vs `ultima6`).

## Conventions specific to this port
- **Data model: idiomatic OO, faithful *behavior*.** Do NOT mirror the 6502
  zero-page array layout — one object per entity, methods for routines. The
  faithful default still binds the *mechanics*; only the data shape is reorganized.
- **Every ported routine cites its source** in a comment: `// $DBF1` /
  `// sub_DBF1_tank_movement`.
- **The §3 pipeline order is a faithfulness invariant.** `Game.update()` calls
  subsystems in the exact order of `sub_C2E6_main_battle_script` ($C2E6). Keep it.
- **The field is the collision grid.** `Field` ($0400-$07FF mirror) is a shared
  service: tile ids = terrain, bit7 = tank occupancy. Movement/bullets/base query it.
- Deferred (stub-only): `Audio` ($EA7E sfx engine — portable, low priority),
  `Construction` (stage editor). ES6 modules, no build step; `index.html` boots
  `main.js`.

## Status
Scaffold phase (P1): stub classes in place, no logic yet. Next: fill
subsystem-by-subsystem starting with `Field`, each with its own `research_*.md`.
