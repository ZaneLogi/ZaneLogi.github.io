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
  - **Ported with it:** `Tank.handle` `$DEB8` + `Tank.draw` `$DFB6`/`$DFE9` (whole,
    including the enemy `tbl_E003` flicker and the stun blink — not half a routine),
    `TankRoster.handleAll` `$DEA6` / `clearAll` `$E413`, `drawNumber` `$D934`+`$D6DD`.
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

## Next
- **`Demo`** — the last piece of ATTRACT, deferred by scope. `sub_C642_demo_players_
  ai_handler` (`$C642`) writes `ram_btn_hold,X`/`ram_btn_press,X` directly: the demo
  **fakes controller input** rather than driving tanks (flow doc §8). It then runs
  `mainBattleScript`, so it is really gated on `Field` + tank movement, not on
  ATTRACT.
- **`Field`** — still opens with a design question, not code: is it one thing or two?
  Map §8 — `$0400` is the collision grid *and* what the title/GAME OVER screens draw
  into. Deferred by Zane 2026-07-16; start from legacy `tanks/level.js` +
  `castle.js`. **P4 added evidence, not an answer:** the title exercises the tilemap
  half (same buffer, same tile vocabulary) with *zero* collision semantics, and
  `Tilemap` now isolates the byte primitives both readings need. Settle it before
  building `Field` itself.
- Docs are written when the content needs a home, sized to it — no one-doc-per-
  subsystem rule (map, "where a finding lands"). `Field` looks like it earns its
  own file (block/tile decode, occupancy, pixel→cell); a smaller subsystem may only
  need a map section, a cited constant, or a code comment.

## Debt (NOT SOURCE — delete when its owner lands)
- **`GameOver` / `HallOfFame` wait on a frame constant**, because the ROM waits on
  the *jingle* (`$C630` / `$C495`) and `Audio` is a stub. Both are commented
  `NOT SOURCE`; replace with `audio.isPlaying(...)` when `$EA7E` is ported. This is
  why "Audio: low priority" undersells it — it gates two modes (flow doc §6d/§7.8).
- **`Tally` is a flat 180-frame placeholder** — `$CCD4`'s real count-out is unported.
- **`drawNumber`'s `minDigits = 2` is the boot behaviour only.** `ram_006B_flag`
  ($6B) decides whether an all-zero score prints `00` or `0` (`$D942`); `$D491` sets
  it to 0 at RESET but `sub_C7C8_print_lives_handler` sets it to **1** every battle
  frame, and `$D17F` never sets it itself — so after a game the title may print `0`.
  Flow doc §8 `[?]`. Resolve when `Score`/`GameOver` land.
- **The sprite forest-priority probe is unported** — `$DA3B-$DA45` reads the field at
  (`sprX + 3`, `sprY`) and, on tile `$22`, ORs `ram_priority_spr_A` (`$20`) to put
  the sprite BEHIND the background. Needs `Field` **and** the backdrop → behind-BG →
  BG → front composite (CLAUDE.md "Rendering follows the PPU"). Nothing reaches it
  yet: the title has no forest, so the probe's answer is always "no".
- **`hud.js`** is a development instrument, not part of the game. `Renderer` now
  draws, so its original retirement condition is technically met — but it is still
  the only view of the mode machine's internals (mode/sub/frm/lives), which the
  canvas never shows. Retire it when that stops being useful, not on the technicality.
