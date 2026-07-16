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
    (a **NOT SOURCE** debug readout — an HTML element, not canvas-drawn; it exists
    only because Renderer/Input are stubs, so the machine is otherwise invisible
    behind a black canvas. Retire it once Renderer draws).
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

## Next
- Fill stubs subsystem-by-subsystem, starting with `Field` (the central service),
  resolving the §8 `[?]` items as the work reaches them.
  - **`Field` opens with a design question, not code:** is it one thing or two? Map
    §8 — `$0400` is the collision grid *and* what the title/GAME OVER screens draw
    into, so the "whole nametable" reading may be an artifact the §7.1 test splits
    apart. Deferred by Zane 2026-07-16; start from legacy `tanks/level.js` +
    `castle.js`. Settle it before building.
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
- **`hud.js`** is a development instrument, not part of the game. Retire it once
  `Renderer` draws something.
