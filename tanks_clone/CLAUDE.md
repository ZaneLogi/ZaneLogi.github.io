# tanks_clone — CLAUDE.md

Faithful port of NES **Battle City** (Japanese Namco, 1985), built
**architecture-first**. Branch: `tanks_clone`.

## Read first
- `docs/research_system_interaction_map.md` — the big view: subsystems, the
  per-frame pipeline, coupling, and the **§7 OO decomposition (LOCKED)** that the
  code scaffold follows. What happens *inside* a battle frame.
- `docs/research_game_flow.md` — what happens *around* it: the 11 screen phases
  from RESET to GAME OVER, the `PLA/PLA` transition mechanism, the gate variables,
  the endless 70-stage cycle.
- `docs/progress.md` — living phase tracker.

**Resolved open items move to their section and leave the `[?]` list** — see the
map's §8 preamble. Don't let an answered question linger in an open-item list, and
don't let the answer live only in that list.

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
- **The governing test — faithful to what the player can observe; free with what
  only the CPU can observe.** (Zane's ruling 2026-07-16.) We do **not** mimic
  mechanisms that come from the 6502's hardware design. Routine-by-routine
  translation of *plumbing* buys only a byte-for-byte match, and **an emulator does
  that better than we ever will.** The source is the authority on *content, rules
  and timing* — never on *shape*. This is the root `CLAUDE.md`'s "is it the design's
  mechanism, or its coincidence?" test, and it generalizes the data-model bullet
  below from data shape to control flow and everything else. Worked example + a
  sorted verdict table: `docs/research_game_flow.md` §7.1. *(Watch the failure mode
  it was written from: admiring a clever hardware trick — a curtain that doubles as
  a DMA, `wait_1_frm`-as-coroutine, a tri-state flag byte — and mistaking
  cleverness for mechanism.)*
- **Work first, improve later** (Zane, 2026-07-16). Prefer the simple thing that
  works over the clever thing that might.
- **Data model: idiomatic OO, faithful *behavior*.** Do NOT mirror the 6502
  zero-page array layout — one object per entity, methods for routines. The
  faithful default still binds the *mechanics*; only the data shape is reorganized.
- **Every ported routine cites its source** in a comment: `// $DBF1` /
  `// sub_DBF1_tank_movement`.
- **The §3 pipeline order is a faithfulness invariant.** `mainBattleScript()` calls
  subsystems in the exact order of `sub_C2E6_main_battle_script` ($C2E6). Keep it.
  It is a *shared body*, not a tick: the `Battle` and `Tail` modes and the demo each
  call it (`$C200` / `$C23E` / `$C429` — the only three call sites).
- **The game is a mode machine — `Mode.enter/update/render/exit`, 5 modes, one
  nesting level.** LOCKED: `docs/research_game_flow.md` §7, which also records what
  was rejected and why. Two rules there are *forced*, not taste: `update()` and
  `render()` must stay split (the fixed-timestep accumulator runs 0/1/2+ ticks per
  repaint), and transitions are decided centrally in `flow.js` (modes returning
  modes creates a real ES-module import cycle).
- **The field is the collision grid.** `Field` ($0400-$07FF mirror) is a shared
  service: tile ids = terrain, bit7 = tank occupancy. Movement/bullets/base query it.
  It mirrors a *whole* nametable — `$07C0-$07FF` is the 64-byte attribute table.
  - **`[?]` The "whole nametable" half is UNDER REVIEW — don't build on it yet.**
    The governing test above may split this bullet in two: `$0400` is *also* where
    the title screen ($D17F) and GAME OVER ($C5D9) are drawn, so it is really the
    **background layer**, and the battlefield is merely what occupies it during
    gameplay. The NES conflates them because it has exactly one nametable — which
    smells like an artifact, not design. Deferred by Zane 2026-07-16 ("discuss Field
    later"); tracked as map §8. Resolve it when `Field` starts.
- **BLOCK codes and TILE ids are different namespaces — never mix them.** Stage
  files store BLOCK codes (`$0-$D`, one nibble per 16×16); the field stores TILE
  ids (2×2 per block) and that is what gameplay reads back (`$E181` tests tile
  `$21` for ice, `$DA2B` tests tile `$22` for forest). Both live in `constants.js`
  as `BLOCK` / `TILE`. Map §5 S2.
- **Timing: one logic pass = one NMI = 60.0988 Hz** (`NTSC_FPS`). rAF is the
  render pump only — logic runs on a fixed-timestep accumulator. And
  `ram_frm_cnt_hi` is *not* a high byte: it ticks every **64** frames and the game
  writes it as a timer, so don't collapse lo/hi into one counter. Map §1.
- **Rendering follows the PPU, not convenience.** Map §7 design notes. Built in P4
  (`renderer.js`, `tiles.js`) — what holds today, and what is still only a plan:
  - **Two caches.** `TileCache` is **lazy** and keyed by **(tile, palette)** — a NES
    tile is four pixel *indices*, not colours, so the same brick is orange on the
    title and grey in a stage; keying on the tile alone hands back wrong colours.
    Separately, each `Tilemap` composes into a persistent canvas repainted only when
    its `version` moves — the NES never redraws the background either (its write
    buffer is a dirty-block queue). A scroll is then one `drawImage` of an unchanged
    picture, which is what the PPU's scroll register does. *(Whole-map repaint for
    now; per-cell dirty tracking is what the battlefield will want.)*
  - **Tanks are 2×8×16 sprites**, never a pre-composed 16×16 — `$DA2B` probes the
    field per half. In 8×16 mode the OAM tile byte's **bit 0 picks the pattern
    table**, so sprites can draw BG glyphs (`$C59C` → `#$9D`).
  - **Two coordinate quirks live in `drawSprite`**, not in callers: `$DA34` stores
    OAM Y = `sprY - 8` (so `sprY` is the sprite's **centre**), and the PPU renders
    sprites one scanline late. Net top = `sprY - 7`.
  - **Still a plan:** the backdrop → behind-BG sprites → BG (index 0 transparent) →
    front sprites composite, and with it `$DA3B-$DA45`'s forest-priority probe. Needs
    `Field`; nothing reaches it yet (the title has no forest). progress.md "Debt".
- Deferred (stub-only): `Audio` ($EA7E sfx engine — portable), `Construction`
  (stage editor). ES6 modules, no build step; `index.html` boots `main.js`.
  - **`Audio` is not as low-priority as it looks: it GATES two modes.** `GameOver`
    ($C630) and `HallOfFame` ($C495) each spin until their jingle finishes — the
    sound *is* their timer. Both currently wait on a `NOT SOURCE` frame constant.
    See progress.md "Debt" and flow doc §6d/§7.8.

## Layout

The runtime — `index.html` boots `main.js`:

```
main.js             the pump: fixed-timestep accumulator @ NTSC_FPS + rAF render.
                    Owns hud.js (a debug instrument; Game knows nothing of it).
game.js             Game: subsystems, session state, setMode/tick/render,
                    mainBattleScript() ($C2E6 — a shared BODY, not the tick)
mode.js             the Mode contract (enter/update/render/exit) + DONE
flow.js             NEXT — the mode graph as data, each row citing its $addr
modes/attract.js    ATTRACT + Scroll/Menu/Demo    ($C095/$C09C/$C0A2)
modes/session.js    SESSION + StageIntro/Battle/Tail/Tally  ($C159/$C1F9/$C238/$CCD4)
modes/game_over.js  $C5D9    modes/hall_of_fame.js  $C44B
modes/editor.js     $C0AE (deferred stub)
tilemap.js          Tilemap: the $0400-$07FF background buffer as BYTES — clear
                    ($D47E), writeTiles ($D6B3), setQuadrant ($D71E/$D725 +
                    $D74D/$D764), attribute decode. NOT Field, and deliberately does
                    not settle Field's open question — see the field bullet above
text.js             drawHugeText ($D8D2/$D85E — the glyph IS the huge letter),
                    writeText ($D6B3), drawNumber ($D934 + $D6DD)
hud.js              NOT SOURCE — debug readout into an HTML element. Still the only
                    view of the mode machine's internals; see progress.md "Debt"
controls.js         NOT SOURCE — the on-page key legend, GENERATED from input.js's
                    KEYMAP so it cannot drift. Painted once from main.js
<subsystem>.js      field / tank / tank_roster / bullet / base / bonus / enemy_ai /
                    score / renderer / input / audio / rng / construction — §7 classes
```

The data pipeline (build-time; runtime never decodes):

```
tools/extract.py    build-time: parses bank_FF.asm + reads CHR_ROM.chr + the 36
                    stage files; decodes and VALIDATES, then emits ES modules.
                    Runtime never decodes.  `python tanks_clone/tools/extract.py`
assets/dat_chr.js   CHR (8192 B = 512 tiles) + SPRITE_PALETTES (4) +
                    BG_PALETTE_SETS (9) + BLOCK_TILES + BLOCK_ATTRIBUTE +
                    TANK_PALETTE_FLICKER (tbl_E003 — the enemy colour cycle)
assets/dat_levels.js LEVELS = 35 × grid[13][13] of block codes, + DEMO_STAGE
assets/dat_text.js  the 9 title-screen text tables ($D17F draws every one), as BG
                    tile ids at their ROM cell. The extractor SKIPPED .byte "STRING"
                    directives by design until these needed it
palette.js          NES 2C02 master palette — hardware, not ROM (the ayumi
                    precedent in block_breaker: vendor the chip, port the driver)
tiles.js            decodeTile / decodeTiles (2bpp planar → indices), paintTile, and
                    TileCache — LAZY, keyed by (tile, PALETTE): a tile is four pixel
                    indices, not colours, so the same brick is orange on the title
                    and grey in a stage. Title screen = 52 decodes, not 512
demo/chr_viewer.*   all 512 tiles, both tables, real palettes, 8×16 default
demo/level_viewer.* all 35 stages + attract, real tiles, live $C31D water swap
```

Preview: `preview_start tanks_clone` (port **8089**). **The server root IS
`tanks_clone/`** ⇒ `http://localhost:8089/index.html`, *not* `/tanks_clone/` (that
404s). And when re-testing a module edit, **reload the document** — `import(
'./game.js?t=N')` re-fetches game.js but its `./modes/session.js` resolves to the
cached URL, so you silently test stale code.

**Measure `document.visibilityState` before diagnosing anything.** Skipping that
one check is what makes the rAF problem look mysterious and recur.

| state | rAF | meaning |
|---|---|---|
| `"visible"` | 60 Hz, indefinitely | healthy — see below |
| `"visible"` | frozen | renderer **wedged** → `preview_stop` + `preview_start` |
| `"hidden"` | frozen, timers ~1–2 Hz | pane not open. Correct browser behaviour, **not fixable from app code** — but see "ask" below |

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
- **A hidden pane is not a bug to fix — but you may ASK Zane to open it.** Standing
  offer, 2026-07-17: *"next time, if you need, you can ask to open the hidden tab
  for you."* Ask when a check needs real **pixels or feel**; one line, then wait.
  - **You cannot open it yourself** — measured 2026-07-17: `tabs_create` + navigate
    still gives `visibilityState: "hidden"`, `hasFocus: false`, rAF frozen. Fronting
    a tab is in reach; opening the *pane* is Zane's UI action. Don't retry it.
  - **Prefer deterministic verification when it suffices** — it usually does, and
    it's the better test. Build headless and step: construct `Game`, stub
    `input.sample`, drive `press[]` + `tick()` (that is how all of P3's mode machine
    was verified, incl. the HUD's constant-width rule). `level_viewer.js selfTest()`
    sweeps `$C31D` over 128 frames with no live loop at all.
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
