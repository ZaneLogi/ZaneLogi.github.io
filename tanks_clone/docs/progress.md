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

**A phase is ONE arc — research → design → implement — with the doc and the code
landing together in one commit** (root `CLAUDE.md` commit conventions; Zane
2026-07-17: *"I thought we are still in P3, as the implementation is along with the
doc"*). Don't split the build off under its own number: a "P4" was invented for P3's
scaffold and it was wrong. *(P0 is doc-only not because docs are their own phase,
but because it described work that had not started yet.)*

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

- **P3 — Game flow: research → design → the mode machine.** ☑ Done. One phase, one
  arc: decode the flow, fold it into the architecture, build it. Doc and code land
  together (root `CLAUDE.md` commit conventions) — `research_game_flow.md`
  (§1–§6 research, **§7 design — LOCKED**, mirroring the map's shape) plus
  `mode.js` · `flow.js` · `modes/{attract,session,game_over,hall_of_fame,editor}.js`
  · reshaped `game.js` · `main.js` accumulator · `hud.js`.
  The screen-level state graph the map only sketched: **11 phases** (8 main path +
  demo/editor/cutscene), each a state owning a `wait_1_frm` loop.
  - **The design (§7) — 5 modes, one nesting level.** `ATTRACT{Scroll,Menu,Demo}` ·
    `SESSION{StageIntro,Battle,Tail,Tally}` · `GAME_OVER` · `HALL_OF_FAME` ·
    `EDITOR`, on one `Mode.enter/update/render/exit` contract used at both levels
    (an HSM). Transitions in `flow.js` as data, each row citing its address.
    Session state stays on `Game` per the map's §7 lock — there is no `Session`
    object. Rulings: **Battle/Tail are two modes** and **"work first, improve
    later"** (Zane, 2026-07-16).
  - **The governing test, and it outranks the flow work** (Zane, 2026-07-16):
    *faithful to what the player can observe; free with what only the CPU can
    observe.* We don't mimic 6502-shaped mechanisms — that buys a byte-for-byte
    match an emulator does better. §7.1 sorts every §1–§6 finding into design vs
    artifact. Promoted to `CLAUDE.md` as the port's governing convention.
  - **Two rules in §7 are forced, not taste:** `update()`/`render()` must stay split
    (the accumulator runs 0/1/2+ ticks per repaint — and the *source already had
    this split*: `sub_DEA6` is deliberately outside the `$C2E6` pipeline), and
    transitions are central (modes-return-modes ⇒ a real ES-module import cycle).
  - **`tick()` order is `$D400`'s:** input → audio → counter → update. Audio and the
    frame counter must bump *before* `update()`, or every `frm_cnt_lo &` timer sits
    one frame out of phase.
  - **Rejected, with reasons, so it isn't re-litigated (§7.7):** pushdown automaton
    (pause is a modifier, not an overlay — `$C1FC`), statechart lib, generators
    (`yield` = `wait_1_frm` mirrors the artifact), modes-returning-modes, and the
    legacy `do_frame()` shape (fused update+draw — incompatible with the accumulator).
  - **Corrections to P1:** the scaffold's `Game.update()` conflated two things —
    `sub_C2E6` is a shared *body* (3 call sites: Battle, Tail, demo), not the tick.
    It becomes `mainBattleScript()`; `Game.tick()` drives the mode machine. The P1
    entry above records what P1 built and stands as history.
  - **The transition mechanism [D]** — there is no screen state variable and no
    dispatcher (unlike the `tank_flags` machine). Three mechanisms: ordinary
    call/return where *returning is the transition* (menu RTS ⇒ demo starts);
    **`PLA/PLA`** — a phase pops its own return address and `JMP`s, abandoning its
    caller's continuation (exactly 3 sites: `$CA56`, `$C7C3`, `$C43F`; stack stays
    balanced because the top-level loop is `JMP`-based); and flag-driven exit +
    fallthrough for the whole battle→tail→score→next-stage chain.
  - **No ending exists** — stages wrap 1..35 → 36..70 (2nd loop) → `$C25D` resets
    to 1 and clears the flag. Verified negatively: the ROM's *complete* huge-text
    set is 5 tables (BATTLE, CITY, HISCORE, GAME, OVER) — no congratulations text.
  - **Corrections to P0:** §2's "2P loop (`$C23E`)" was **wrong** — `sub_C2E6` has
    exactly 3 call sites and `$C23E` is the stage-ending *tail* loop; 1P/2P share
    one loop, differing only in `ram_enemy_limit` (5 vs 7) + a spawn tweak. §6's
    Audio-is-a-passive-tick framing was **wrong** — the sfx gates the GAME OVER
    (`$C630`) and HI-SCORE (`$C495`) transitions, and `sub_EA7E` reads
    `ram_pause_flag` (`$EA7E`) to mute (that's how the demo is silent).
  - **§8 `[?]` closed: `$11`** — `sub_D7CC` fills `$0400-$07FF` with `$11` (grey
    border) and *then* clears the attribute table and the 26×26 play grid to `$00`.
    `$11` and `tbl_DACB`'s "empty = `$00`" are different layers; the `[?]` came from
    reading `$D7CE` without the two loops right after it. Answer now lives in map
    §5 S2. (`sub_D47E_clear_0400_07FF` is a *different* routine that fills `$00`.)
  - **New convention (Zane, 2026-07-16):** a resolved open item moves to its
    section and is **deleted** from the `[?]` list. Encoded in map §8's preamble.
  - **The build (the same phase — impl lands with its doc).** The flow itself is
    **ported, not stubbed**; the stubs are the subsystems under it. `mode.js` (the
    `Mode` contract + `DONE`), `flow.js` (`MODE` + the `NEXT` table), the five
    `modes/*.js`, `game.js` reshaped, `main.js` given the accumulator, plus `hud.js`
    (a **NOT SOURCE** debug readout — an HTML element, not canvas-drawn; *at the time*
    Renderer and Input were both stubs, so the machine was otherwise invisible behind
    a black canvas. P4 gave it pixels; hud.js's live status is in "Debt" below).
  - **`main.js` had no accumulator** (P1 shipped one `tick()` per rAF, which map §1
    already said was wrong). Now fixed-timestep vs `NTSC_FPS`, `render()` once.
  - **`Game.frame` was a single counter** — map §1 explicitly says lo/hi must not
    collapse (hi ticks every 64 frames and is *written* as a timer). Now
    `FrameCounter{lo,hi}`; `Tail` depends on it (`$C236` seeds `$FE`).
  - **`Base` now models `game_over_flag` as state + timer** per flow doc §7.8:
    `BASE_STATE.{ALIVE,EXPLODING,DESTROYED}` + `explosionTimer`. Measured: 38 frames
    EXPLODING, DESTROYED on the 39th — matches `$E6B0`'s `$27` DEC'd at `$E2DC`.
  - **Ported along the way** (they *are* the flow): `resetSession` `$C2B3` /
    `preparePlayerData` `$C2BD` — the ROM's two entry points, split because the demo
    calls the second alone (`$C3BD`) and must not clear the title's scores;
    `checkStageEnding` `$C728`; `advanceStage` `$C259-$C280`; the `$CA6F`/`$CA74`
    handlers (the *entire* 1P/2P difference); most of `Scroll`/`Menu`/`Demo`.
  - **Verified deterministically in-browser** (no rAF — the `level_viewer selfTest()`
    precedent; the pane was `hidden`, which per `CLAUDE.md` is correct and not
    fixable from app code): scroll = exactly 240 frames → menu; Start skips it
    (`$C7C3`); 1P → `lives=[3,0]`/`limit=5`, 2P → `[3,3]`/`limit=7`; stage cleared →
    Tail→Tally→next stage with **no** game-over message (the `$C72E`-before-`$C730`
    order); eagle → 39-frame countdown → GAME_OVER → ATTRACT; hi-score branch →
    HALL_OF_FAME; `advanceStage` wrap 35→36 sets loop 1, 70→**1** clears it;
    `render()` throws nothing and mutates nothing across all 7 mode/sub combos.
    The HUD's fixed-width rule (root `CLAUDE.md` UI conventions) tested as it
    specifies — **one distinct length per line** (52/51/74) across 13 mode/sub/seq
    states plus forced worst-case widths, measured **per line** because a
    compensating bounce would hide inside a constant total.
  - **The `{at:MENU}` claim is measured, not asserted** (per "test the defining
    case"): editor bounces drive `constrUsageCnt` 1→7, arming `$CA43`, and the demo
    stays suppressed (`$CA38`) through 1500 idle frames. Routing the editor to the
    SCROLL entry instead would zero it every bounce and 7 would be unreachable.
  - **Two doc fixes the build exposed:** the demo timeout is **577–640** frames, not
    a flat 640 — `$C9D4` zeroes `frm_cnt_hi` but *not* `frm_cnt_lo`, so the first
    hi-tick lands on `lo`'s next 64-boundary; and §7's contract is `render(renderer)`,
    not `render(ctx)` — modes draw through `Renderer`, the PPU analog.
  - **Known stub artifact:** with nothing able to kill a tank yet, `Battle` and the
    demo never end on their own. Correct given the subsystems below them.

- **P4 — Attract mode: input, title, scroll, menu.** ☑ Done **except `Demo`**
  (Zane's scope call, 2026-07-17). The first real pixels: one arc from "the machine
  is invisible behind a black canvas" to a scrolling, selectable title screen. Order
  was Input → SCROLL → MENU — Input first because it is the only piece with no
  design risk and everything else needs it.
  - **`Input`, ported whole.** `sample()` `$D689` (`press = new & ~hold`,
    `$D6A3-$D6A9`), `dpadToDirection()` `$E451`, `clear()` `$C2AA`. Two findings
    shaped the code: `con_btn_*`'s bit layout already **is** the pad's shift order
    (A→bit0 … Right→bit7), so the mask IS the byte and nothing needs reordering; and
    `$E451` is a **priority decoder** (Right > Left > Down > Up), so this port needs
    no SOCD filter — a d-pad cannot press Left+Right, a keyboard can, and the ROM
    already answers it. The pad latch is level-based and re-strobed every NMI, so a
    press-and-release between samples is invisible to the ROM too: that is why DOM
    events accumulate into a `Set` rather than a queue. Re-derived, not mimicked —
    there is no shift register here.
  - **`Tilemap` (`tilemap.js`) — the `$0400-$07FF` buffer, and deliberately NOT
    `Field`.** Byte primitives only: `clear` `$D47E`, `index` `$D5FB`, `writeTiles`
    `$D6B3`, `setQuadrant` (`$D71E`/`$D725` + `$D74D`/`$D764`), attribute decode.
    **It does not settle the map's §8 `[?]`** — whatever `Field` turns out to be, the
    bytes need a representation, and the title needed one before `Field` exists. If
    "one thing", `Field` grows these methods; if "two things", it holds one. Neither
    is foreclosed.
  - **The huge letters are BRICK WALLS (`text.js` — `$D8D2`/`$D85E`).** There is no
    huge font in the ROM: `$D85E` reads the letter's *ordinary* 8x8 glyph out of the
    BG pattern table and expands each glyph BIT into a 4x4 brick quadrant — the same
    `$00-$0F` low-nibble vocabulary `BLOCK_TILES[$4]` (`[0F,0F,0F,0F]`) uses and that
    a bullet will chip. One glyph → 32x32 px → 4x4 tiles. That is why the ROM's whole
    huge-text set is five short ASCII strings and not one byte of letter artwork.
    **Verified 64/64 quadrants** against `CHR[]`. Not ported (pure PPU plumbing): the
    `$2007` read with its `$D884` dummy; the plane-1 skip (`$D85E` reads bytes 0-7
    only — for a 2-colour glyph plane 0 IS the shape); and the `$D88B`/`$D897`
    PHA/PLA reversal (the PPU reads forward while the routine walks the screen
    *upward*; the two reversals cancel to `plane0[r]` at `y + 4 + 4*r`).
  - **`Renderer` — two caches, different jobs.** `TileCache` (`tiles.js`) is **lazy**
    and keyed by **(tile, palette)**, because a NES tile is four pixel *indices*, not
    colours — the same brick is orange on the title (`con_bg_pal_03`) and grey in a
    stage. 512 tiles × 36 BG palettes = >18000 possible canvases; a title screen
    touches **52**. Eager decode is 512 — **90% wasted**. On top, each `Tilemap`
    composes into a persistent canvas repainted only when its `version` moves, so a
    scroll frame is ONE `drawImage` of an unchanged picture — exactly what the PPU's
    scroll register does. (Zane's design call: cache decoded tiles and `drawImage`;
    don't bit-blit per draw the way `demo/level_viewer` does.)
  - **`drawSprite` carries two coordinate quirks**, in the PPU analog where they
    belong: `$DA34` stores OAM Y = `sprY - 8` (so the ROM's `sprY` is the sprite's
    **centre**), and the PPU renders sprites one scanline late, so OAM Y is "top
    minus one". Net top = `sprY - 7` — that single pixel is what lands the menu
    cursor level with its text row. 8x16 mode also makes the tile byte not an index:
    bit 0 picks the *pattern table*, bits 7..1 the pair, which is why sprites can
    draw BG glyphs.
  - **`$D17F` draws the WHOLE title screen** — logo, scores, all three menu options,
    the Namco credits — once, at `$C095`, *before* the scroll. So it all scrolls up
    together, and `sub_C9C0` (Menu) adds no background at all. **This corrected a
    scoping error:** the small text had been deferred "to Menu", which would have
    left the title scrolling up half-empty (Zane caught it — *"is the drawing of the
    menu along with the title screen?"*). The ROM's `$D212`/`$D242`/`$D263`
    `wait_1_frm` calls spread the writes over four frames because the PPU write
    buffer has a size limit — invisible, spent before the scroll starts. We write one
    `Tilemap`.
  - **The scroll needs no second nametable.** The ROM scrolls a nametable PAIR
    (`$2800` title, `$2000` blanked, `ram_scroll_Y` walking between); we need one
    tilemap and an offset, because the outgoing screen is **provably always blank** —
    `$C09F` is `sub_C7AB`'s only caller and `$C09C`'s `sub_D16A` clears `$2000`
    immediately before it, every time. A faithful re-derivation, not a
    simplification. The pair's other job is equally invisible: `$C9DE`/`$C9E4` set
    `scroll_Y = 0` **and** `base_nmt = 2` on reaching the menu — same pixels, rebased
    so the counter needn't climb. Nobody sees it. (§7.1's artifact test, applied.)
  - **The menu cursor IS a tank** — roster slot 0 (`$C9C7-$C9E4`), pushed through the
    ordinary `sub_DEA6_tanks_handler` the battle loop calls. It gets the P1 palette
    for free (the palette **is** the slot index, `$DFE8 TXA`) and the menu owns no
    drawing code. **And there is no selection variable:** `sub_CA85` is
    `game_mode * $10 + $8B` → y 139/155/171, recomputed every frame at `$CA2F` with
    no "did it change?" test. `game_mode` *is* the selection. Treads roll via
    `wheels ^= 4` every 4th frame (`$C9E9`) — the ROM animating a parked tank purely
    so the screen looks alive.
  - **Ported with it:** `Tank.render` (`$DEB8`, named `handle` in P4; renamed P6) +
    `Tank.draw` `$DFB6`/`$DFE9` (whole, including the enemy `tbl_E003` flicker and the
    stun blink — not half a routine), `TankRoster.render` `$DEA6` / `clearAll` `$E413`,
    `drawNumber` `$D934`+`$D6DD`.
    `$DEB8`'s `(flags >> 3) & $FE` into `tbl_E4B8` is just **the flags' high nibble**
    once the 2-byte entries are divided back out — 16 states, 16 handlers.
  - **`sub_DEA6` is the RENDER half, and the ROM says so:** it sits OUTSIDE the
    `$C2E6` pipeline and is called from each screen's own loop (`$C9F5` menu /
    `$C20C` battle / `$C42F` demo). The split our `Mode` contract forces already
    exists upstream; nothing in the draw path mutates game state.
  - **New data (`tools/extract.py`):** `assets/dat_text.js` (the 9 title text tables)
    and `TANK_PALETTE_FLICKER` (`tbl_E003`). The extractor previously **skipped
    `.byte "STRING"` directives by design** — and the text tables are exactly those,
    so it now parses them. `ord()` is the correct decode, not a guess: the font is
    ASCII-indexed, and `00:D299: 42  .byte "BATTLE"` shows `$42` = 'B'.
  - **The disassembly's LABEL NAMES lie — trust the address column + operand bytes.**
    `tbl_D30F_text___1980_1985_namco_ltd` sits at **`$D2F8`** (the `$D258` operand is
    `$F8`); `tbl_D2A0_text___I_` at **`$D2A5`**; `tbl_D341_tile___dot` at **`$D33F`**.
    `TEXT_TABLES` in `extract.py` uses real addresses, names demoted to comments.
  - **The hidden cutscene is decoded** (flow doc §4 [11]) — the programmer's love
    letter, revealed one line per 64 frames. Its trigger is a **two-controller**
    combo: P1 *holds* the direction (`$CA04`/`$CA17`, `ram_btn_hold`) while P2
    *presses* the button (`$CA0A`/`$CA1D`, `ram_btn_press + $01`). The port's own
    TODO said "all on controller 2" and was **wrong** — reading `$CA0A` alone misses
    `$CA04` two instructions earlier. Flow doc §8's `[?]` on it is closed + deleted.
  - **Verified deterministically** (headless `Game`, synthetic `KeyboardEvent`s,
    canvas pixels — never a screenshot): Input 38/38, incl. the live page reacting to
    real keys; Tilemap/text/TileCache 23/23, incl. the 64/64 glyph match and a
    cache-hit / palette-miss check; scroll by pixel (`scrollY` 0 → empty, 60 → 120 →
    ink rises exactly 60px, 240 → parked at `dy=0`); Menu 12/12 state + 9/9 pixel.
    The cursor measured **122 lit px at x 65..77, y 133..145** — and decoding tiles
    `$18/$19/$1A/$1B` out of CHR gives an art ink-box of 1..13 with **122** lit px,
    so `cell(64,132) + art(1,1)` predicts the drawn position exactly.
  - **Three test failures were MY assertions, not the code** — the 7px-tall font in
    an 8px cell; bounding all ink in `x < 88` (which caught BG text); bounding the
    sprite *cell* instead of its *artwork*. Meanwhile the one real bug — `W S A D`
    instead of `W A S D` — **passed every assertion** and was caught only by *reading
    the rendered output*. Lesson kept in the tests: assert the literal string, and
    look at what was drawn.
  - **`controls.js` (NOT SOURCE)** — an on-page key legend **generated from
    `input.js`'s `KEYMAP`**, so it cannot drift; a test rebinds a key and asserts the
    legend follows. The ROM prints no control help because a Famicom player is
    holding the pad — a keyboard carries no such labelling, so the pad's own markings
    are re-derived in our view. P2's Start/Select are bound but never read (every
    menu/pause site is a non-indexed `LDA ram_btn_press`), and the legend says so.

- **P5 — Field: terrain substrate + occupancy, first battlefield on screen.** ☑ Done.
  The substrate every Battle subsystem stands on, built AND wired through the real flow
  so it is **visible**: Menu → 1P → `StageIntro` loads the stage into `Field` → `Battle`
  draws it. Battle's own subsystems stay stub (Zane, 2026-07-18: *"reach the Battle sub
  mode, I can see it works for field.js"*). Full decode: `docs/research_field.md`.
  - **Cell model — `Field` HAS-A a full 32×30 `Tilemap`.** Play grid at tile (2,2)
    (pixel (16,16), from `$F000`), `$11` grey border around it; `pixelToCell =
    (x>>3, y>>3)` matches `$D706` with no offset (tank coords already include it), so
    the border and eagle live in the same buffer as collision cells.
  - **`loadStage` reuses the P2-verified decode** — `$D80B` == `level_viewer`'s
    `paintBlock` (`BLOCK_TILES`/`BLOCK_ATTRIBUTE` = `tbl_DACB`/`tbl_DABB`); fill `$11` +
    169 blocks. Takes the decoded grid; `$F009`'s 36→70 wrap lives in `Game.stageGrid()`.
  - **#3 resolved — `isPassable` is the `< $20` compare** (`t==0 || t>=$20`), the ids
    arranged so one branch classifies terrain; named `TILE_DRIVE_OVER_MIN`, not an enum.
  - **Occupancy in scope; #2 resolved by building it faithfully.** The ROM's bit7
    packing → a separate grid; the two-pass timing (`$E181` mark all → move → `$E1FA`
    clear) is preserved because marking every tank before moving any is player-
    observable. Footprint = base cell + straddle neighbors (`$E1C9-$E1EB`); a destroyed
    tank's marks leak (`$E1FA` skip), faithfully. `Tank` gained `onIce`/`occupancyCells`;
    `Tilemap` gained `setPalette`.
  - **Wiring + intro screen:** `StageIntro.START_STAGE` → `field.loadStage(stageGrid())`;
    `Battle.render` (and `StageIntro` at CURTAIN_OPEN) draw `field.tilemap` at
    con_bg_pal_02. CURTAIN_CLOSE/SELECT now show a grey `$11` curtain + **"STAGE  N"**
    (`sub_CC90` fill + `sub_CA91`, con_bg_pal_04) — the font is hardcoded tiles
    `$23-$27` (S T A G E) + digit base `$6E`, at buffer `$05CC` = tile (12,14). The
    curtain WIPES like the ROM: grey closes from the top/bottom edges (`$CC90`), the
    field reveals from the centre outward (`$CCB2`), as a horizontal band clip
    (`Renderer.drawTilemapRows`). SELECT is fully ported: **A/B step the stage 1..35** (fresh press, or every 8th frame while
    held — `$C17F-$C1C2`, the auto-repeat resetting `frm_cnt_lo`), the number tracking;
    Start confirms; the screen shows only on stage 1 (`stageSelectUsed` gates it, §6a).
    `$C2E6` already called the two occupancy entry points — they slot in; the stub
    roster (state 0 → not drivable) makes them no-op, so Battle runs clean.
  - **Verified** — deterministic (169/169 blocks vs `LEVELS[0]`; `isPassable`/`isIce`
    logic; occupancy aligned/unaligned/skip/writeback/two-pass) + full headless flow
    drive (Menu→1P→SELECT shows "STAGE 1"→Start→Battle, field loaded, persists, 32256
    lit px) + screenshots of both the "STAGE 1" curtain and stage 1 rendering in `Battle`.
  - **`titleMap` moved `Game` → `Attract`** (Zane, 2026-07-18 — it was weird for `Game`
    to hold a title-only buffer while `StageIntro`/`Field` own their screens). The rule:
    a screen `Tilemap` lives at the **narrowest scope its drawers share** — the title's
    drawers are Attract's sub-modes, so it belongs to `Attract`; `Field`'s battlefield to
    `Field`; the curtain to `StageIntro`. `Game` now holds NO screen surface. `mode.js`
    gained a `parent` ref (set in `setSub`) so `Scroll`/`Menu` reach `this.parent.titleMap`.
    The MENU re-entry (`loc_C0A2`) now REDRAWS the title — the ROM relied on the title
    persisting in nametable `$2800`, a CPU-only mechanism; a fresh Attract's redraw is
    byte-identical (reads live scores), and the real MENU-vs-SCROLL distinction
    (`constrUsageCnt`, §6c) is untouched.
  - **`StageIntro` is complete** — close wipe → "STAGE N" + A/B select → open wipe. What
    remains are only hooks into subsystems that don't exist yet, each cited in
    `START_STAGE`: the **default base draw** (`$C1DC sub_CAF5` — Base/S6; why the
    fortification shows but the eagle doesn't), the **stage-load jingle** (`$C1C7` —
    Audio), and the **editor path** (`$C1D0` — Construction). Plus Battle's subsystems.
  - **JSDoc types** — each touched file (+ `text.js`) carries a `@typedef {import('…')}`
    header and `@param`s on its class-typed params, so VS Code resolves them (F12 /
    autocomplete). Comment-only; no runtime effect.

- **P6 — Player tank: spawn, movement, terrain + tank collision, ice.** ☑ Done. The
  first gameplay on the field — a drivable player. **Bullets are a separate scope**
  (Zane split the step, 2026-07-18: player-tank slice now, bullets next). Full decode +
  citations + verification record: `docs/research_movement.md`. The `$C2E6` pipeline
  steps 2/3/7 are filled; steps 1/4 (occupancy) were P5.
  - **Movement** — `$DB75` player control (`Tank.control`: d-pad → facing/state, the
    perpendicular-turn 8px grid-snap) + `$DBF1`/`loc_DC97` move step (`Tank.moveStep`:
    1px at the 3/4-frame gate, the **two leading-corner** terrain probe, wheel toggle).
    Method names corrected from the P1 stub's wrong mental model: `iceMovement`/`movement`
    → `controlPlayers`/`moveTanks` (the disasm's "ice_movement" label is a misnomer —
    `$DB75` is the input routine).
  - **Tank-vs-tank collision is free** — the P5 occupancy grid (`$E181` marks all,
    `$DBF1` reads bit7). No new code; it just needed two live tanks. Verified 2P.
  - **Spawn** — `$C331` spawns surviving players (2P-aware; absence of lives = the
    disable) → `$E363` places them in `$F0`; the move step runs the **respawn star**
    (`$DE55`/`$DE64` INC → `$E00B` pulsing star) → `sub_E3B8` drivable + helmet.
    `Tank.respawnFrame` is the packed low-nibble counter, made an explicit field.
  - **Spawn invincibility** — `$E27C` DEC (step 7) + the flickering shield, split into
    `updateInvincibility` (update) and `drawShields` (render) per the `Mode` contract.
  - **Ice** — `$E181` on-ice flag + `$DB75` slide-arm + `$DC52` `$80`-handler slide.
    The `$0103` quad-purpose byte re-derived into `onIce` + `Tank.slideTimer` (mapping
    in the research doc §6). Ice stages: 17/24/28/32 (A/B-selectable from stage 1).
  - **Three flagged deviations** (governing test): (1) player state simplified to
    `$80`/`$A0` — the `$88/$84` `SBC #$04` coast is unobservable (verified 0px drift on
    release); (2) ice's packed `$0103` byte → explicit fields; (3) `$E27C`'s DEC/draw
    split. Nothing load-bearing dropped.
  - **`Battle.render`** now draws the real 4-layer PPU composite: backdrop →
    behind-BG sprites → BG (colour-0 transparent) → front sprites. Two rendering fixes
    Zane required in this step (not deferred as polish), decode in research §7:
    - **Water shimmer** (`$C31D`, `waterPaletteSwap`) — Battle draws with the live
      `bgPaletteId` (02↔01 every 32 frames), so the water animates like the level
      viewer (76/256 px of a water block differ between the sets).
    - **Forest priority** (`$DA3B-$DA45`) — a tank half over forest (`$22`) draws
      **behind** the grass (partial obstacle, not a cover). `Renderer` gained a sprite
      queue (`beginSpriteLayers`/`flushSprites`) + a transparent-0 `_compose`;
      `Tank.draw` probes per half. Retires the "forest-priority probe unported" debt.
  - **Verified deterministically** (headless `Game`, `getImageData` — never a
    screenshot): spawn `$F0`→`$A0` ~37 frames; move ~3px/4frames + immediate stop on
    release; turn-snap; terrain (solids block flush, passables pass); **2P tank collision
    flush from all 4 approaches, no pass-through**; helmet 3→0 + shield; ice 15px slide
    (0 on ground) stopping at walls; and the **real flow** Menu→1P→SELECT→Battle spawns
    P1 and drives, `render()` clean. Pixels: star 105, tank 166, +shield 23.

- **P7 — Bullets: fire, movement + terrain collision, brick chip, explosion, and the
  player-vs-player FREEZE.** ☑ Done. Scope 2 (the other half of the P6 split). The
  battlefield is now interactive: players shoot, bricks chip, bullets explode, and P1's
  bullet freezes P2 / P2's freezes P1. Full decode + citations + verification:
  `docs/research_bullets.md`. Pipeline steps 5/8/11/12/13 filled; step 9 (enemy fire)
  stubbed. `bullet.js` rewritten from stub; `field.js`/`constants.js`/`game.js`/
  `modes/session.js` touched.
  - **10 flat bullet slots** — 0-7 each tank's primary (bullet i ↔ tank i), 8-9 the
    players' 2nd bullets (the 2-shot upgrade). The ROM lays the 2nd arrays right after
    the primaries so one loop `9→0` covers both; the flat-10 array IS that faithful model
    (the `& $06`/`& $07` loop masks are observable "which bullet hits which", named as
    predicates, not a zero-page mirror). Data-model rule, §0. The packed `ram_bullet_status`
    byte (hi nibble state / low 2 bits dir / low nibble explosion counter) is **split** into
    `state`/`dir`/`explosionPhase`/`phaseFrame`, like `Tank`'s flags and `Base`'s
    game-over byte (research doc dev #4 — done in review, was an inconsistency).
  - **Fire `$E122`/`$E08C`** — A/B → spawn into the tank's own primary (one per tank);
    the 2-shot upgrade promotes a busy primary into the 2nd slot. `property` from the
    tank type (fast/power) is ported but always 0 today (players spawn `type=0`;
    upgrades are the bonus scope). Speed `$E063`: normal 2px/frame, fast 4.
  - **Terrain `$E604`/`$E69A`** — a 4-sample **cross-section** sweep (perpendicular to
    travel), the far edge sampled only when the near one chipped a brick — so a bullet
    flies down a 1-wide corridor without chipping its walls. Per point: eagle→`Base.onHit`
    (dormant until Base draws the eagle); `≥$12` (water/ice/forest) fly over; border/steel
    stop; brick chips the quadrant (`chipQuadrant`, already `$D743`); a POWER bullet
    clears the whole tile. §3.
  - **Explosion `$E076`/`$DEE2`** — `$33 → 0` over 9 frames, 3 sprite phases
    ($F1/$F5/$F9, palette 3). **Bullet-vs-bullet `$E910`** — player bullets cancel any
    other bullet within 6px, silently.
  - **The FREEZE `$E70C` Part 3 (`$E83F`)** — a player hit by the OTHER player's bullet
    (`(p^bi)&1`) gets `stun_timer = $C8` (200); shielded → absorb, already-stunned →
    skip, demo → skip. The countdown + can't-move + blink already existed (P6, `$DB8F`/
    `$DFDD`); this adds the **set**. **`$E70C` Parts 1&2 (enemy kills / player kills
    enemy + score/bonus) deferred** to the enemy scope — cited stubs; no enemy exists,
    and they need the tank-explosion render + respawn + Score/Bonus.
  - **Render `$E0D8`** — flying = one 8×16 sprite `$B1+dir·2` (palette 2); front layer,
    enqueued between tanks and shields (OAM order shields < bullets < tanks).
  - **Verified deterministically** (headless `Game`, `getImageData`; 32 checks): fire /
    2px+4px speed / brick chip `$0F`→`$0A` + corridor passthrough / steel+border stop /
    water flyover / POWER clear / 9-frame explosion / bullet-vs-bullet / **the freeze
    both ways through the real `mainBattleScript`** (stunned player can't move) + no
    self-freeze + shield absorb + demo exempt / the full flow Menu→1P→Battle fires a
    visible bullet, `render()` clean.

- **P8 — Base / HQ: the eagle appears, is destroyed → game over, with the explosion +
  shovel fortify.** ☑ Done. The stage now has an HQ to defend: `StageIntro` stamps the
  eagle + walls into the field, a bullet (incl. the player's own) destroys it, the
  39-frame countdown + explosion play, and `checkStageEnding` ends the run. Full decode +
  citations + verification: `docs/research_base.md`. `base.js` rewritten from stub;
  `field.js`/`constants.js`/`game.js`/`modes/session.js`/`bullet.js` touched. Pipeline
  step 6 (`$E2A9`) filled; the eagle-hit path (P7, dormant) now live.
  - **The base is field TILES, not sprites** (the one fact everything follows from) — walls
    brick `$0F` / steel `$10`, eagle `$C8-$CB`, destroyed `$CC-$CF`, a fixed 6×4 stamp at
    the bottom-centre (`sub_CAF5` etc.). Only the game-over **explosion is sprites**
    (`$E2D8-$E362`). So `Base` owns no surface — it edits `Field`'s tilemap. The base
    region is empty in every stage (verified vs `LEVELS[0]`), so the stamp fills space.
  - **Found + fixed a latent P6 bug — `field.isPassable`.** `$DCD5` blocks on `BMI`
    (tile ≥ `$80`) *before* the `< $20` compare; that `BMI` did double duty (occupancy
    bit7 **and** the eagle `$C8-$CB`). The port split occupancy into its own grid, so the
    eagle reached only `isPassable`, which returned true for `$C8` → tanks drove through
    the eagle. Latent because no ≥`$80` tile was in the field until now. Fix:
    `t === 0 || (t >= $20 && t < $80)`. Only the eagle / destroyed eagle change; all real
    terrain is `< $80`. research_base.md §3.
  - **`sub_E2A9` ported whole** (Zane's scope call, 2026-07-19): the shovel fortify/blink/
    expiry branch (`$E2A9-$E2CF`, gated on `frm.lo` 16/64-frame gates) **then** the
    countdown. The shovel is **dormant** — nothing sets `shovelTimer` until Bonus; ported
    as `Base.applyShovel(field)` (`$E9FB`, drawProtected + `$14`) for Bonus to call, and
    tested directly.
  - **The explosion is a triangle wave** — index `= | |(count>>2)-5| - 5 |` (`$E2DE-$E2F6`),
    sweeping `1→2→3→4→5→…→0` over the 39 frames: one 16×16 blast (`$F1/$F5/$F9`) growing to
    a 32×32 four-group blast (`$D1…`/`$E1…`), palette 3. `Base.render`, front-most (step 6
    fills OAM before the tanks/bullets drawn after the pipeline).
  - **Wiring:** `StageIntro.START_STAGE` → `base.drawDefault(field)` (`$C1DC`, resolves the
    P5/P7 TODO); `Battle.render` → `base.render(renderer)` last; `Bullet.checkPoint` →
    `base.onHit(field)` (draws the destroyed eagle); `base.reset()` also clears `shovelTimer`.
  - **Deferred, cited:** the stage-load jingle (`$C1C7`) + eagle-hit sfx (`$E6B4/$E6B7`) —
    Audio; the editor draw-just-eagle path (`$C1E2 sub_CB5D`) — Construction; the demo base
    draw (`$C412`) — Demo.
  - **Verified** — 66/66 deterministic in-browser (headless `Game`, `getImageData`): draw /
    passability (incl. the fix + an A/B drive-through) / destruction full-flow (39-frame
    countdown → game over) / explosion phase sweep + sprite emission / shovel blink+expiry.
    Visual (preview pane): stage 1 renders the eagle in its fortification (alive `$c8`,
    122 px); destruction shows the blast (destroyed `$cc`, 245 px; blast 1525 px).
    Screenshot in the P8 session.

- **P9 — Enemy AI + spawn: enemies come alive and drive.** ☑ Done. Scope = **spawn +
  movement** (Zane's split, 2026-07-19: enemy *fire* + *kill/explode* are **P10**;
  **`Demo` was skipped** as the entry point in favour of real enemies). Enemies now
  materialise on the spawn interval and drive stage 1 with real Battle City AI —
  target-seeking that drifts from wander to player-chase to base-rush over the stage.
  Full decode + citations + verification: `docs/research_enemy_ai.md`. Pipeline steps 3
  (enemy branch) + 10 filled; the RNG (S12) and the S3 spawn machinery are ported.
  - **The finding that shaped it — the "AI" is not a separable decider; it IS the enemy
    half of the tank state machine.** `sub_DC3D` dispatches the flag high-nibble via
    `tbl_E498`; the `$80`/`$90`/`$A0` + follow states `$B0`/`$C0`/`$D0` **are** the
    movement handlers, decision interleaved with the move (the "turn when blocked"
    branch is inside `loc_DC97`). So the shared step is `Tank.tryStep`; the state
    handlers live in `EnemyAI` (the decision layer), which is **stateless** — one shared
    instance, not per-tank. The scaffold's `decideMovement`/`shouldFire` model was wrong
    and was revised (the §7 lock allows a boundary correction in implementation). At the
    roster it reads as agreed: **players by input, enemies via `enemyAI.drive`** — but a
    literal `controlEnemies` *pre-pass* is not faithful (enemy decide+move is fused; the
    turn-on-block needs the move result), so the routing lives inside `moveTanks`.
  - **RNG (S12, `$D44D`) → a 16-bit Galois LFSR + `frm_cnt_hi`.** The ROM's `random*7`
    is a weak mixer that leans on `zp[++index]` — a rolling read of the whole zero page,
    i.e. **live game state** (positions, frame counters). Governing test: the *sequence*
    is CPU-only, so we keep the role and replace the core + the 256-byte stir with a
    maximal-period LFSR (`0xB400`, period 65535), keeping `+ frm_cnt_hi`. Reconstructing
    the zero page is max plumbing that *still* would not match the ROM's sequence, so it
    is dropped. Bonus: the LFSR is reproducible → deterministic movement tests. (Zane's
    calls: LFSR, keep `+ frm_cnt_hi`, drop the 256-byte entropy, no cross-project
    references in the comments.)
  - **The state machine (S4).** `$A0` drives forward (1/16 grid re-pick → target;
    blocked → 1/4 turn / 3/4 recoil); `$90` turns (1/2 re-pick, else rotate ±1); `$80`
    is the recoil coast; `$B0`/`$C0`/`$D0` resolve a destination to a biased direction
    and become `$A0`. Target **drifts with `frm_cnt_hi`** (`sub_DE72`): early wander →
    mid follow-a-player (even slot→P1, odd→P2) → late rush the HQ. Direction toward a
    target (`sub_DDA2` + `tbl_E486` → `AIM_DIR`): a primary vertical-biased table, a
    coin-flip to the horizontal-biased half, so enemies wander toward rather than beeline.
  - **Spawn (S3).** `$DB48` spawns into the first free enemy slot (scan `enemy_limit`→2)
    on the interval → **max 4 concurrent in 1P** (6 in 2P); `$E42B`/`$E3B8` assign the
    per-stage type from two extracted+validated ROM tables (`STAGE_ENEMY_TYPES` `tbl_E4EC`
    / `STAGE_ENEMY_COUNTS` `tbl_E578`, counts sum to 20); `$E363` cycles the three top
    spawn points and flags the 4th/11th/18th as bonus carriers. Interval `= $BE − stage*4`
    (`−$14` in 2P). `extract.py` gained the two tables; `dat_levels.js` regenerated.
  - **`moveTanks` (`$DBF1`) enemy gates:** the clock-freeze gate (no-op until Bonus arms
    `clock_timer`; the DEC countdown deferred with it) + the per-type speed gate (fast
    tanks move every frame, others on `(slot ^ frm_cnt_lo) & 1`).
  - **Three flagged deviations** (governing test, all in `research_enemy_ai.md §7`): the
    RNG LFSR; the enemy **type assigned at spawn** not at `$E3B8` (unobservable during
    the respawn star, and it keeps the roster the single type owner); the `$88`→`$80`
    recoil coast → an explicit `Tank.coast` counter (the flag byte's bits 2-3 have no
    home in the state/dir split).
  - **`window.game`** — a NOT-SOURCE debug handle on the live instance (main.js, same
    category as `hud.js`), so a console/test session can force a Battle for a screenshot.
    Added at Zane's suggestion.
  - **Verified** — 63/63 deterministic in-browser (RNG 10, spawn 31, AI decisions 18,
    integration 6 through the real `$C2E6` body: enemies drive up to 206 px from spawn,
    deterministic across runs, head toward the base in the forced late-game) + a headless
    render diff (405 enemy sprite px) + a live screenshot of 4 enemies roaming stage 1
    (bonus tank flashing) via the `window.game` handle.

- **P10 — enemy combat + Score/HUD (S8).** ☑ Done. Three pieces built as a 3-step plan
  (Zane, 2026-07-19: **1/ S8-A HUD · 2/ P10 combat · 3/ S8-B score**) and then **folded into
  one P10 phase** (Zane's call): the sidebar HUD (**S8-A**), enemy fire/kill/explode/death,
  and score accumulation (**S8-B**). A diorama becomes a playable battle with a live
  scoreboard. Docs: `docs/research_hud.md` (HUD) + `docs/research_enemy_combat.md` (combat
  + score). The three sub-parts and their verification records follow.

  **(a) The sidebar HUD (S8-A).** The empty grey right sidebar becomes the real Battle City
  status column — **no combat dependency**, since every element reads state the game already
  has. `score.js` rewritten from stub; `constants.js`/`text.js`/`game.js`/`tank_roster.js`
  touched. Pipeline step 17 (`$C7C8`); the stage-entry HUD (`$C377`/`$C37D`/`$C380`) wired.
  - **Score is the HUD RENDERER; the state stays on `Game`** (the map's §7 lock — lives/
    scores/stage live on `Game`). The stub's duplicated `p1/p2/hi` fields were removed (a §7
    violation in waiting); `Score` now holds only a NOT-SOURCE render cache plus the S8-B
    logic (`add`; `checkHiscore` is a stub — see (c)).
  - **Lives show the RESERVE count** — `max(lives-1, 0)` (`$C805` `SBC #$01`): the tank in
    play isn't counted, so 3 lives prints "2". P1 always (row 18); P2 (row 21) in 2P **or
    demo**, the same gate as the IIp label.
  - **The reserve column drains on SPAWN, not kill** (`$C8B1` from the spawn handler `$DB68`,
    indexed by the post-decrement `enemy_spawn_cnt`) — bottom-up, cell = `{29+(i&1), 3+(i>>1)}`.
    This is exactly why it needs P9 (done) and not P10. Distinct from `enemiesLeft` (the
    kill counter, unchanged at 20 with no kills) — the debug HUD's `enemies=20` next to a
    visibly-drained column is that two-counter split, working.
  - **The `ram_0060` offset finding** — `$D6B3` (tile-list fill) copies tiles **verbatim**,
    but `$D6DD` (digit draw) **adds** the offset per digit. It selects the digit font: the
    title score uses `$30` (ASCII), the sidebar uses **`$6E`** (a smaller font). The ported
    `drawNumber` had `$30` hard-wired; it now takes a `digitBase` param. research_hud.md §4.
  - **Write-on-change deviation** (governing test) — the ROM re-fills its transient PPU
    buffer every frame; `drawLives` instead writes only when a player's displayed reserve
    changes, so the persistent field canvas isn't repainted each frame (same shape as the
    scroll/water-swap; CLAUDE.md rendering notes). On a change it re-draws **icon then
    digit** (the ROM's order), which self-heals the rare 2→1-digit shrink.
  - **Verified** — deterministic (headless `Game` + a fresh `Field`/`Score`): the full
    Menu→1P→Battle drive lands the sidebar cells (Ip `[58,13]`, flag `[[6c,fc],[6d,fd]]`,
    stage `6f`='1', P1 icon `14` + reserve digit `70`='2', no P2 column in 1P); 2P adds IIp
    `[5a,13]` + P2 icon/digit; reserve full-20 → bottom-up drain (19→(30,12), 18→(29,12),
    0→(29,3)); `version` stable on a no-op `drawLives`, bumps on a change; reserve-0 prints
    `6e`='0'. Render path: every HUD cell composes distinct ink vs a uniform border cell
    (`colors:1,lit:0`) — the `$6E` font renders legible glyphs ('2'=30 lit px, '1'=19,
    different per value. Plus a live stage-1 screenshot (pane visible): reserve column, IP+2,
    flag+1, all readable.

  **(b) Enemy combat.** Enemies shoot, a bullet destroys a tank, the tank explodes and dies,
  and the stage ends on the 20th kill or the last life lost. Bonus pickups deferred (Zane's
  split). Full decode: `docs/research_enemy_combat.md`. `bullet.js`/`tank.js`/`enemy_ai.js`/
  `game.js`/`tank_roster.js`/`constants.js` touched. Pipeline steps 9 (`$E162`) + 13 (`$E70C`
  Parts 1&2); the explosion tick (`$DDEA`) + death (`$DE07`) + render (`$DECD`/`DF33`/`DF46`).
  The kill EVENT is here; its score-visible consequences are (c).
  - **Enemy fire (`$E162`)** — 1/32 per drivable enemy via the existing `EnemyAI.shouldFire`
    (same LFSR as AI movement, so `frm_cnt_hi` is threaded in); frozen while `clock_timer`
    (stays 0 until Bonus). One primary each — no 2-shot upgrade.
  - **`$E70C` Parts 1&2** — Part 1 (enemy bullet → player: helmet absorbs, else the player
    explodes and loses its star tier); Part 2 (player bullet → enemy: armour `DEC`s and
    survives — a `$E3` heavy takes 4 hits — else explodes). Part 3 (the P-vs-P freeze) was
    P7, unchanged; the three run in ROM order. Deferred with citations: the bonus drop
    (`$E8BE` — Bonus/S7), and the kill's score/`kill_cnt`/extra-life (`$E7FB-$E827` — S8-B).
    The armour/`$E4→$E3` type math **stays**, so bonus-armour tanks still take the right
    hits — they just drop nothing. `boxHit` = the `|d| < $0A` box, shared with Part 3.
  - **Explosion tick (`$DDEA`)** — the ROM packs the phase countdown into the flags byte;
    the port splits it into `Tank.explosionTimer` (the same data-shape deviation as
    `Base.explosionTimer` / `Bullet.phaseFrame` / the enemy `coast`). `$70→$60..→$20`
    (3 ticks each) → `$10` (6) → dead. **Dispatched by the normal move step**, so it
    inherits the gate: a player's blast ticks on the 3/4 gate (measured 24 ticks), a
    non-fast enemy's on its speed gate (**48 frames** vs a fast enemy's **24** — verified).
    Both `Tank.moveStep` (players) and `EnemyAI.drive` (enemies) tick it. **The tick guard
    is `$10..$70`, not `$20..$70`** — a bug caught in verification: with `$20` as the
    floor the explosion stuck at `$10` forever (it never reached death); the `$10` phase
    must tick even though its popup isn't drawn.
  - **Death (`$DE07`, `Game.destroyTank`)** — player: `lives--`, respawn (`spawnPlayer`) if
    any remain; enemy: `enemiesLeft--`. The state it edits lives on `Game` (respawn is the
    roster's), so the tick reaches back via `game` — threaded through `moveTanks`, the
    shape `Base.update(field, game)` already uses. **Stage-end is already built**:
    `checkStageEnding` (every Battle frame) returns DONE on `enemiesLeft==0` (clear) or
    all-lives-0 (game over). The per-player 2P GAME OVER slide (`$DE18`) is deferred
    (unreached in 1P; needs the still-stubbed `$C972`).
  - **Explosion render (`$70..$20`)** — `TANK_EXPLOSION_FRAMES`: `$F1/$F5/$F9` single +
    `$D1../$E1..` four-group, the **same blast tiles as the P8 base**, re-centred on the
    tank (base's groups are eagle-fixed). `$10` draws nothing (popup deferred). `TANK_STATE`
    gained `EXPLODE_50/60`.
  - **Verified** — deterministic (headless `Game`, `getImageData`, sprite-emit spy): player
    kills enemy (phase sweep `70→60→50→40→30→20→10→0`, 24 ticks, `enemiesLeft 20→19`);
    armour `$E3` survives 3 hits, explodes on the 4th (`$E2/$E1/$E0` → `$70`); enemy kills
    player (`lives 3→2`, respawns `$F0`); helmet absorbs (no death, bullet cleared); stage
    clear at `enemiesLeft==0`; 1P game over at last life (`lives [0,0]`, no respawn,
    `checkStageEnding` DONE); the explosion completing **through the real pipeline** (48
    frames speed-gated / 24 fast); render emits the right sprites per state (`$70`→`[F1,F3]`,
    `$40`→8 big-blast, `$20`→`[F9,FB]`, `$10`/`$00`→none). Live screenshot: a four-group
    blast rendering amid roaming enemies, the kill decrementing `enemies` in the HUD.

  **(c) Score accumulation (S8-B).** The kill's score-visible consequences, hung off (b)'s
  kill event. `score.js`/`game.js`/`bullet.js`/`tank.js`/`constants.js` touched.
  - **`Score.add(game, player, points)`** — `$D9BE` add (plain int, not the ROM's 7-digit
    BCD — the digit math is CPU-only, the VALUE is faithful) + `$D138` the one-time extra
    life at 20000 (per player, gated on `extraLife[]`). **Scope call (Zane):** the
    hi-score-beaten (`$D97D`) and its HALL_OF_FAME routing are the **GAME OVER flow, a
    separate step** — pulled back out; `checkHiscore` stays a stub, and `$D138`'s
    game-over-flag guard (`$D13A`) is dropped here (belongs with GAME OVER).
  - **`Game.awardKill(enemy, owner, isDemo)`** at the `$E70C` Part 2 kill (`$E7FB-$E827`):
    `idx = (type>>5)-4` (`$80/$A0/$C0/$E0` → 0..3), `killCounts[owner][idx]++` (the per-type
    counter the P11 Tally consumes; `owner` = the bullet slot's low bit), then — unless the
    attract demo — `score.add(owner, ENEMY_KILL_POINTS[idx])`. `ENEMY_KILL_POINTS` is the
    decimal `[100,200,300,400]` (`sub_D9E1` reads `tbl_E8BA`'s `$10..$40` as hundreds).
    `Game.killCounts` cleared per stage (`$C374 sub_C71E`).
  - **Kill-points popup (`$10` / `ofs_001_DEFD`)** — the `$10` phase P10 left blank now draws
    the value: an enemy's `((type>>3)&$FC)-$10+$B9` number sprite (`$B9/$BD/$C1/$C5` =
    100/200/300/400), a killed player (type 0) a plain `$F1` blast.
  - **Verified** — deterministic: score rises 100/200/300/400 by type (`1000` after one of
    each); `killCounts` `[1,1,1,1]`; a P2 bullet (slot 1) credits player 2 `[0,300]`;
    extra-life at 20000 once (`lives 3→4→4`); the demo adds 0 but still counts the kill
    (`[0,0,0,1]`); the popup emits the right sprite (`$B9`=100 … `$C5`=400, player→`$F1`).
    Live screenshot: **100 / 200 / 300 / 400** floating where the four enemy types died.

- **P11 — Tally: the between-stage score count-out.** ☑ Done. The stage-clear screen
  animates: each player's per-type kills are counted out one at a time into a subtotal,
  then the totals, then a 2P survivor bonus — replacing the 180-frame `Tally` stub. Full
  decode + citations + verification: `docs/research_tally.md`. `sub_CCD4` (`$CCD4`, the
  count-out) + `sub_CEF7` (`$CEF7`, the screen). `modes/session.js` (`Tally` rewritten) +
  `constants.js` (`TALLY`) touched; `stage advance` was already built.
  - **The one load-bearing correction to the pre-impl plan** — the "Next" note said the
    tally counts kills "into the running score." **It doesn't.** The real score is
    credited **at kill time** (`$E824`, P10 `awardKill`); the tally's inner add (`$CD34
    LDX #$02`) targets a **display-only temp subtotal** (idx 2/3), cleared per type. The
    tally **never re-adds to the running score** — its only real-score write is the 2P
    bonus. `sub_D138`'s extra-life check during the count is a no-op (20000 already
    crossed at kill time). research_tally.md §1.
  - **Consumes `Game.killCounts` (P10)** — the loop DECs it one per pass (`$CD30`/`$CD4E`),
    exactly as the ROM DECs `ram_p1_enemy_type_kill_cnt`. Ported as a paced phase machine
    (`PRE → KILL ↔ BETWEEN → TOTALS → POST_TOTALS → BONUS? → FINAL`). Points `tbl_D3D1` =
    `tbl_E8BA` = `ENEMY_KILL_POINTS [100,200,300,400]`.
  - **The 2P `[?]` settled** — the survivor bonus is **+1000**: `sub_D9E1(#$00)` takes
    `bra_D9F9` and sets the thousands digit (`$CE3C-$CE43`). Gate: skip in 1P; skip in 2P
    once the base is destroyed (`game_over_flag == 0`); else the strictly-higher killer,
    if still alive, gets 1000 on the **real** score (via `Score.add`). §5.
  - **Its own screen, faithfully coloured** — a fresh `Tilemap` (digit font `$30`, bg
    palette `03`); `sub_D0D9`'s attribute table ported to per-cell palettes (headers →
    pal 1 red, scores → pal 2 orange, rest → pal 0 white). The four enemy-type icons are
    **sprites** (`sub_D0B8`, palette 2, x $81 / y $64·$7C·$94·$AC), redrawn each frame.
  - **Deviations** (governing test, §7): the count **cadence** holds `KILL_STEP = 8`
    frames/pass — the ROM's extra per-pass housekeeping frame is CPU-shaped precision not
    reproduced (the ~6 s / kill-every-8-frames *rhythm* is faithful); the temp subtotal is
    a display accumulator; `$2800`/`base_nmt`/`$0060`/`$006B` are CPU-only, so the digit
    font + `minDigits 1` (`006B = 1`) are passed **per `drawNumber` call** and `loc_CEE5`'s
    reset carries only `bgPaletteId = 0`.
  - **Stage advance was already built** — `advanceStage` (`$C259-$C280`, the 35→36 / 70→1
    wrap) is P3-verified; P11 adds the tally's exit reset and the end-to-end drive through
    a *real* tally. Deferred (cited): the count/bonus **sfx** (Audio); hi-score-beaten +
    HALL OF FAME (the GAME OVER flow).
  - **Verified** — 26/26 deterministic in-browser (headless `Game`, the real
    Menu→1P→Battle(clear)→Tail→Tally flow, `getImageData` / sprite-emit spy): 1P
    `[3,2,1,4]` counts out over 367 frames, consumed to 0, monotonic; totals `[10,0]`;
    per-type peak 4; type-0 subtotal 300; then `advanceStage` → next `StageIntro`, stage
    3→4; the "10" total drawn; 8 icon sprites (`80,82,a0,a2,c0,c2,e0,e2`, palette 2). 2P
    bonus P1 +1000 (800→1800), P2 unchanged; the game-over skip (900→900). Live screenshot
    (pane visible): "HI-SCORE 20000" (red/orange), "STAGE 3", "I-PLAYER 12300", the
    count-out mid-progress — `300 PTS 3←`, `400 PTS 2←`, two rows still 0.

## Next
**GAME OVER / HALL OF FAME** — the hi-score-beaten (`$D97D` / `Score.checkHiscore`) + the
`$C972` game-over-message animation + the jingle gates (Audio). Then **Bonus** (S7) — the
bonus-tank power-up drop; **Demo** (`$C642`); `StageIntro`'s sfx / editor hooks (Audio /
Construction).

## Debt (NOT SOURCE — delete when its owner lands)
- **`GameOver` / `HallOfFame` wait on a frame constant**, because the ROM waits on
  the *jingle* (`$C630` / `$C495`) and `Audio` is a stub. Both are commented
  `NOT SOURCE`; replace with `audio.isPlaying(...)` when `$EA7E` is ported. This is
  why "Audio: low priority" undersells it — it gates two modes (flow doc §6d/§7.8).
- **`drawNumber`'s `minDigits = 2` is the boot behaviour only.** `ram_006B_flag`
  ($6B) decides whether an all-zero score prints `00` or `0` (`$D942`); `$D491` sets
  it to 0 at RESET but `sub_C7C8_print_lives_handler` sets it to **1** every battle
  frame, and `$D17F` never sets it itself — so after a game the title may print `0`.
  Flow doc §8 `[?]`. Resolve when `Score`/`GameOver` land.
- **`hud.js`** is a development instrument, not part of the game. `Renderer` now
  draws, so its original retirement condition is technically met — but it is still
  the only view of the mode machine's internals (mode/sub/frm/stage/enemies/base),
  which the canvas never shows. (Lives left this list in S8-A — the sidebar shows
  them now.) Retire it when that stops being useful, not on the technicality.
- **`window.game`** (main.js, P9) is a NOT-SOURCE debug handle on the live instance —
  same category as `hud.js`, no "owner" to land against. Drop it if it ever gets in
  the way; it costs nothing and makes live inspection / screenshots a two-call job.
