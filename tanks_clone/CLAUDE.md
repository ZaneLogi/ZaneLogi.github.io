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
  vs `ultima6`). It earned its keep once: its hand-made `dat_levels.js` layouts
  were the **oracle** that confirmed the stage format (nibble order, grid width,
  block codes) in one diff. Refer to it; never copy from it — it has 5 of the 35
  stages and never read the ROM.

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
  It mirrors a *whole* nametable — `$07C0-$07FF` is the 64-byte attribute table.
- **BLOCK codes and TILE ids are different namespaces — never mix them.** Stage
  files store BLOCK codes (`$0-$D`, one nibble per 16×16); the field stores TILE
  ids (2×2 per block) and that is what gameplay reads back (`$E181` tests tile
  `$21` for ice, `$DA2B` tests tile `$22` for forest). Both live in `constants.js`
  as `BLOCK` / `TILE`. Map §5 S2.
- **Timing: one logic pass = one NMI = 60.0988 Hz** (`NTSC_FPS`). rAF is the
  render pump only — logic runs on a fixed-timestep accumulator. And
  `ram_frm_cnt_hi` is *not* a high byte: it ticks every **64** frames and the game
  writes it as a timer, so don't collapse lo/hi into one counter. Map §1.
- **Rendering follows the PPU, not convenience.** The NES never redraws the field
  (its write buffer is a dirty-block queue), so keep a persistent field canvas
  allocated once and repaint only changed blocks. Draw tanks as **2×8×16 sprites**,
  never a pre-composed 16×16 (`$DA2B` probes the field per half). Composite
  backdrop → behind-BG sprites → BG (index 0 transparent) → front sprites.
  Map §7 design notes.
- Deferred (stub-only): `Audio` ($EA7E sfx engine — portable, low priority),
  `Construction` (stage editor). ES6 modules, no build step; `index.html` boots
  `main.js`.

## Layout

```
tools/extract.py    build-time: parses bank_FF.asm + reads CHR_ROM.chr + the 36
                    stage files; decodes and VALIDATES, then emits ES modules.
                    Runtime never decodes.  `python tanks_clone/tools/extract.py`
assets/dat_chr.js   CHR (8192 B = 512 tiles) + SPRITE_PALETTES (4) +
                    BG_PALETTE_SETS (9) + BLOCK_TILES + BLOCK_ATTRIBUTE
assets/dat_levels.js LEVELS = 35 × grid[13][13] of block codes, + DEMO_STAGE
palette.js          NES 2C02 master palette — hardware, not ROM (the ayumi
                    precedent in block_breaker: vendor the chip, port the driver)
tiles.js            decodeTiles (2bpp planar → indices) + paintTile
demo/chr_viewer.*   all 512 tiles, both tables, real palettes, 8×16 default
demo/level_viewer.* all 35 stages + attract, real tiles, live $C31D water swap
```

Preview: `preview_start tanks_clone` (port **8089**).

**Measure `document.visibilityState` before diagnosing anything.** Skipping that
one check is what makes the rAF problem look mysterious and recur.

| state | rAF | meaning |
|---|---|---|
| `"visible"` | 60 Hz, indefinitely | healthy — see below |
| `"visible"` | frozen | renderer **wedged** → `preview_stop` + `preview_start` |
| `"hidden"` | frozen, timers ~1–2 Hz | pane not open. Correct browser behaviour, **not fixable from app code** |

**Settled by A/B, 2026-07-16** — same probe, only variable = Zane opening/closing
the pane. Open: `"visible"`, rAF 91/1517 ms (60 Hz), timers 92-94. Closed:
`"hidden"`, rAF **0**, timers **3-4** (a requested 1500 ms timeout took 2034 ms).
So the pane's open/closed state drives `visibilityState`, and everything follows.
This is the Page Visibility API + background-timer throttling behaving *correctly*
— there is no bug here to fix.

- **rAF does NOT need driving.** While `"visible"`, the water swap ran **36 s
  untouched** — 68 swaps at the exact 532 ms cadence. An earlier belief that "rAF
  only ticks while actively driven" was wrong: it was measured on a closed pane
  and blamed on the wrong mechanism.
- **A hidden pane is not a bug to fix.** It doesn't composite, so no loop design
  helps. Verify logic *deterministically* instead (`level_viewer.js selfTest()`
  sweeps `$C31D` over 128 frames without needing a live loop).
- **NEVER ask for a viewport bigger than the pane's real window.** `resize_window`
  accepts it silently, then *emulates + scales* the viewport; with a fractional dpr
  that mis-composites. **The one-line check:**
  `window.innerHeight > window.outerHeight` ⇒ impossible for a real window ⇒ you
  are being scaled. Best is not to resize at all: pick a viewport that fits and
  zoom the *page*.
  - 2026-07-16: demanded `inner 900x1000` from an `outer 942x574` window — 426 px
    too tall — and the pane rendered a duplicate narrow copy of the page. Sticky
    across `preview_stop`/`preview_start`, so restarting appeared not to fix it
    only because the bad viewport was re-imposed on each new pane. Sizing the
    viewport to fit (900x480, ~94 px chrome headroom) cleared it immediately.
- **When the pane looks wrong, suspect your own manipulation first — run the
  checks above before concluding anything about the tool.** The 07-16 ghost was
  self-inflicted start to finish; the pane behaved correctly given what it was
  asked for, and so did the browser (`visibilityState` throttling is the spec
  working). Four theories were spent blaming the environment — hidden-tab
  throttling, a stale resize layer, a wedged renderer, a split-view toggle — while
  the disproof (`innerH > outerH`) sat unread in my own tool output. The pane is a
  valid verification target; treat a failure as a bug in how it is being driven
  until the checklist says otherwise.
- **Never conclude from a check that drove the page.** Scheduling your own rAF
  wakes the loop and gives a false pass. Probe with `setInterval` + a state proxy.
- Prefer measuring canvas pixels via eval over screenshots regardless — a
  screenshot rasterises at a non-1:1 scale and is useless for precise checks.
- Keep the loop **unkillable** (always reschedule, never conditionally stop) and
  paint one frame at load. Cheap insurance, independent of all the above.

## Status

Lives in [`docs/progress.md`](docs/progress.md) — phase log + what's next. Not
duplicated here.
