# research — GAME OVER / HALL OF FAME (+ the sliding message & PAUSE) — P12

The end of a run, and the two full-screen boards that close it. Covers `sub_C5D9`
(GAME OVER), `sub_C44B` (HALL OF FAME) + `sub_D951` (the huge hi-score), `sub_D97D`
(the hi-score check), `sub_C972`/`sub_C947` (the sliding "GAME OVER" message), and
`sub_C8F9` (the blinking PAUSE text — Zane's add-on for this step). All addresses are
`bank_FF.asm` (cyneprepou4uk). The mode-graph frame this fits into is
`research_game_flow.md` §4 [7][8], §6d/§6f; this doc is the routine-level decode.

The governing test applies throughout (`CLAUDE.md`): faithful to what the player
observes, free with what only the CPU observes. §7 sorts the deviations.

## §1 — The branch: `$C283-$C295`

`advanceStage`'s "run is over" fall-through (`$C273-$C280`) lands at
`bra_C283_game_over`, four calls in order:

```
$C283  JSR sub_C5D9                  ; the GAME OVER screen (blocks on its jingle)
$C286  JSR sub_D97D_check_hiscore    ; raise the hi-score; Y = beaten flag
$C289  TYA / BEQ bra_C292            ; not beaten -> skip the board
$C28C  JSR sub_C44B                  ; the HALL OF FAME (HI-SCORE) board
$C28F  JSR sub_C295                  ; clear $0400 + ship it up (plumbing)
$C292  JMP loc_C095                  ; -> title (the full, counter-zeroing entry)
```

This is already the shape of [`flow.js`](../flow.js): `SESSION` DONE → `GAME_OVER`,
then `NEXT[GAME_OVER]` calls `hiScoreBeaten()` (which IS `$C286`) to pick
`HALL_OF_FAME` vs straight to `ATTRACT`. Deciding the branch out in `flow.js` matches
the ROM letting *the caller of `sub_C5D9`* decide, not the screen itself. `sub_C295`
(disable NMI → clear `$0400` → copy up → enable NMI) is pure PPU plumbing — the next
mode (title) redraws from scratch, so nothing ports.

Reaching game over ALWAYS passes through the Tally first: `checkStageEnding` →
`Tail` → `Tally` → `advanceStage` returns false → `GAME_OVER`. So the GAME OVER
screen inherits `bg_palette_id = con_bg_pal_00`, which the Tally set at its own exit
(`$CEF4`). `sub_C5D9` sets no palette of its own; the port renders with `g.bgPaletteId`.

## §2 — GAME OVER screen: `sub_C5D9` (`$C5D9`)

1. `$C5DC-$C5E4`: draw to nametable `$2000`, `scroll_Y = 0`, `base_nmt = 0` (a plain
   static screen — no scroll pair, unlike the title).
2. `$C5E6`: `sub_D47E_clear_0400_07FF` — the buffer to `$00`. Port = a fresh `Tilemap`
   (its constructor is all-zero; `$D47E` ≡ `Tilemap.clear`).
3. `$C5E9-$C5F9`: huge **"GAME"** (`tbl_D343`) at px `(0x3C, 0x46)` via
   `sub_D8D2_draw_huge_letters`.
4. `$C5FC-$C60C`: huge **"OVER"** (`tbl_D348`) at px `(0x3C, 0x78)`.
5. `$C60F` copy up, `$C615-$C621` `frm_cnt_hi = 0` + set the three `sfx_game_over_*`.
6. `bra_C624_loop`: `wait_1_frm`; **Start/Select (`$C627`, `con_btns_SS`) skips**;
   else loop until `sfx_game_over_1 == 0` ("wait until sound is played").
7. exit `$C632-$C63E`: disable NMI, clear, copy up, `sub_EA51_clear_sound_engine_data`.

The huge letters are the brick-glyph letters `text.js` already ports (`drawHugeText`):
`sub_D85E` reads a letter's ordinary 8×8 BG glyph and blows each bit into a 4×4 brick
quadrant. `tbl_D343`/`tbl_D348` verified against the bytes ("labels lie"): `$D343 =
"GAME"`, `$D348 = "OVER"`. Port: [`modes/game_over.js`](../modes/game_over.js) —
`enter()` builds the `Tilemap`, `render()` draws it at `g.bgPaletteId`, `update()`
keeps the Start/Select skip + the **NOT-SOURCE jingle frame stub** (Audio deferred; §7).

## §3 — HALL OF FAME (HI-SCORE) board: `sub_C44B` (`$C44B`)

Reached only when `$C289` says the hi-score was beaten.

1. `$C44E-$C458`: static screen setup + `sub_D47E` clear (as §2).
2. `$C45B-$C46B`: huge **"HISCORE"** (`tbl_D2B5`, verified `= "HISCORE"` — one word,
   no dash; the dashed `"HI-SCORE"` is a *different* table `tbl_D2BD`) at px `(0x10, 0x32)`.
3. `$C46E`: `sub_D951_draw_huge_hiscore` — the hi-score as HUGE digits.
4. `$C471-$C483`: copy up, `frm_cnt_hi = 0`, set the three `sfx_hiscore_*`.
5. `bra_C486_loop`: `wait_1_frm`; **`$C489-$C490` the colour flash** —
   `bg_palette_id = (frm_cnt_lo & 3) + 5`, i.e. `con_bg_pal_05..08` cycling every
   frame; **no skip button** (the asymmetry with GAME OVER — the jingle is the ONLY
   exit); loop until `sfx_hiscore_1 == 0`. `$C497` `bg_palette_id = con_bg_pal_00`.

### The huge hi-score — `sub_D951` (`$D951`)

`pos = (0x10, 0x64)`, `tile_id_offset = $30`. It walks the 7-digit BCD score MSB-first
from `$3D`, and for each **leading-zero** digit advances X by `$20` (`$D964-$D96A`)
and skips it; the first nonzero digit onward is fed to `sub_D8D2` (each digit VALUE +
offset `$30` → the ASCII glyph). So the number is **right-aligned in a 7-digit field**,
each huge digit `$20` px wide.

Port (`modes/hall_of_fame.js` `drawHugeHiscore`): scores are ints, so `String(hi)` has
no leading zeros already — place the first digit at `startX = 0x10 + (7 - len) * 0x20`
and `drawHugeText(tm, digits, startX, 0x64)` at offset 0 (the font is ASCII: `'2'` glyph
= charCode `$32` = the ROM's digit-value 2 + offset `$30`). Verified live: hi-score
`31400` draws right-aligned huge, cycling palette 5..8.

## §4 — Hi-score check: `sub_D97D` (`$D97D`)

Returns `Y`: `0` not beaten, `1` P1 beat it, `$FF` P2 beat it (`$C289 TYA / BEQ` only
cares beaten-or-not). Mechanism: compare each player's 7-digit BCD score to `hi_score`
MSB-first; on the first differing digit, `BMI` (score < hi) → not beaten, else copy the
whole score into `hi_score`. P1 is checked first (`$D981`), then P2 against the
possibly-raised value (`$D9A0`). An EQUAL score does **not** count (strict `>`).

With int scores this is `hiScore = max(hiScore, s0, s1)`, beaten iff either strictly
exceeded — [`score.js`](../score.js) `checkHiscore(game)`, entered via `Game.hiScoreBeaten()`.
Verified: `15000 vs 20000` → not beaten; `25000` → raises to 25000; `20000/30000` (P1
ties, P2 beats) → raises to 30000; both `20000` (tie) → not beaten, stays 20000.

### §4a — a zero score on the title prints "00" after a game (closes flow doc §8)

`sub_D934`'s all-zero-number path (`$D942`) reads the shared `ram_006B_flag` (`$6B`):
`0` → back up 2 → `"00"`, nonzero → back up 1 → `"0"`. The open question was what the
title shows for a zero score *after a game* — `$D17F` (the title) never sets `$6B`
itself, and the battle lives-printer (`sub_C7C8`, `$C7CC`) sets it to `1`.

Resolved: it is always **`"00"`**. Every writer accounted for — RESET (`$D495`) and the
**Tally exit `loc_CEE5` (`$CEF0`) set 0**; `sub_C7C8` and the Tally setup (`$CEFC`) set
1 — and *game over always routes through the Tally* (`checkStageEnding` → Tail → `$C256`
`sub_CCD4` → `advanceStage` → GAME OVER), whose `$CEF0` clears `$6B` to 0 before the
board and title draw (neither `sub_C5D9` nor `sub_C44B`/`sub_D951` touches it). So `$6B =
0` at the title, same as at boot. The port drops the shared byte and passes `minDigits`
per call ([`text.js`](../text.js) `drawNumber`): title `2`, HUD lives `1`, tally `1` — so
[`attract.js`](../modes/attract.js)'s title `drawNumber` (default `minDigits = 2`) is
already faithful. Verified in-browser: a zero title score renders two `$30` glyphs
("00"). No code change; the `$CEF0` write is dropped only because its *effect* is
re-expressed per call.

## §5 — The sliding "GAME OVER" message: `sub_C972` + `sub_C947`

State lives in four bytes (`ram_game_over_msg_pos_X/_Y/_mov_type/_timer`, `$0105-$0108`),
modelled as `GameOverMessage` on [`game.js`](../game.js). Three sites touch it:

- **`begin` `$C737`** (in `checkStageEnding`): the REAL game over — `posX=$70`,
  `posY=$F0`, `movType=0` (up), `timer=$11`; `frm_cnt_lo = 0`. Already ported.
- **`clear` `$C337-$C33E`** (in `sub_C331` prepareStage): `posY=$F0`, `timer=0`. A
  fresh stage has no message. **This clear was MISSING** from the port — without it a
  prior run's leftover timer would draw "GAME OVER" over the next run's first battle
  (`sub_C972` draws while `timer != 0`). Now `prepareStage()` calls `gameOverMsg.clear()`.
- **`sub_DE46` `$DE48`** (2P per-player "player N is out"): DEFERRED — §8.

### Animate — `sub_C972` (`$C972`), pipeline step 15

```
if timer == 0            -> RTS            ; $C972-$C975 no message
if 2nd_loop == demo      -> RTS            ; $C977-$C97B the demo never shows it
if (frm_lo & $0F) == 0:  DEC timer         ; $C97D-$C983 every 16 frames
                         if timer == 0: posY = $F0   ; hide when it expires
if timer >= $0A:  posX += tbl_D3D5[movType]  ; $C98D-$C99F  spd_X
                  posY += tbl_D3D9[movType]  ; $C9A2-$C9A9  spd_Y
JSR sub_C947 (draw)
```

Speed tables (verified): `tbl_D3D5` (spd_X) `= 00 FF 00 01`, `tbl_D3D9` (spd_Y) `= FF
00 01 00`, indexed by movType Up/Left/Down/Right. movType 0 (up) → dx 0, dy −1. So the
message slides UP from `posY=$F0` (off-screen bottom) while `timer >= $0A`, then holds,
then hides at `timer 0`.

Measured through the real `Battle(lose) → Tail` flow: `posY` 240 → 113 over 127 moving
frames (`timer` 17→10), holds at 113 while `timer` 9→1, hides (posY=$F0) at `timer 0`
(frame 272). Demo-exempt confirmed (timer/posY untouched).

### Draw — `sub_C947` (`$C947`)

Palette 3, front. Two `sub_DA7B` groups: `(posX, $79)` and `(posX+$10, $7D)`. Each
`sub_DA7B(x, t)` draws tile `t` at `x-8` and `t+2` at `x`. Net **4 sprites**
`$79/$7B/$7D/$7F` at `posX-8 / posX / posX+8 / posX+$10`, all at `posY`.

### The update/draw split

`sub_C972` fuses move + draw; the port splits per the Mode contract:
`Game.updateGameOverText()` (step 15, in `mainBattleScript`) does the move only,
`Game.drawGameOverText(renderer)` does `sub_C947`. The draw gates on `timer > 0 &&
!demo` (the same two early-returns `sub_C972` makes before it would call `sub_C947`).
The one frame the ROM draws at `posY=$F0` (timer just hit 0) is simply not drawn — it
is off-screen, so unobservable. The battlefield the message rides over is drawn by
`Battle`/`Tail` render (`renderBattlefield`, [`modes/session.js`](../modes/session.js)).

## §6 — PAUSE text: `sub_C8F9` (`$C8F9`)

The pause *logic* already existed (P3/P5): `$C210` Start toggles `ram_pause_flag`
(`Battle.update`), `$C1FC`/`$C200` gate the pipeline (`if (!g.paused) mainBattleScript()`),
and the render calls run outside the gate (which is why sprites still show while paused).
This step adds the on-screen readout `sub_C8F9`, the last pause TODO:

```
if !paused              -> RTS       ; $C8F9-$C8FB
if (frm_lo & $10) == 0  -> RTS       ; $C8FD-$C901  show 16 frames, hide 16
draw 5 sprites (palette 3, all Y=$80):        ; $C90B-$C934
   X=$64 T=$17   $6C $19   $74 $1B   $7C $1D   $84 $1F   ; P A U S E
```

Five 8×16 front sprites, the BG-glyph letters "PAUSE", 8 px apart. Called at `$C21B`
in the Battle loop only (the Tail loop `$C238` omits it). Port: `drawPauseText`
(session.js), enqueued in `renderBattlefield` only when `pause` is set (Battle, not
Tail). Verified: paused + `(frm.lo & $10)` → the 5 tiles at the right X/Y/palette;
blink-off → none; unpaused → none.

## §7 — Deviations (governing test)

1. **Jingle gates STAY stubbed.** `sub_C5D9` (`$C630`) and `sub_C44B` (`$C495`) each
   spin until their jingle finishes — the sound IS the timer. `Audio` (`$EA7E`) is a
   deferred stub, so both modes wait a `NOT SOURCE` frame constant (200 / 240) instead.
   Not a shortcut we chose — it is the one subsystem below this that isn't built. Both
   are commented `NOT SOURCE`; replace with `audio.isPlaying(...)` when Audio lands.
   (This is why "Audio: low priority" undersells it — it gates two whole modes.)
2. **hi-score / huge hi-score are ints, not 7-digit BCD.** The digit-array math is
   CPU-only; the VALUE and the right-alignment are faithful (data-model rule).
3. **The message move/draw split** (§5): `update()` moves, `render()` draws — forced by
   the fixed-timestep Mode contract, and the ROM already splits render (`sub_DEA6`,
   `sub_C947`) out of the `$C2E6` pipeline anyway.
4. **`sub_C295` / `sub_C63E` / the exit clears are dropped** — PPU plumbing; the next
   mode redraws from scratch.
5. **The double water-swap in the Tail** (`$C24A` after step 18's `$C31D`) is a single
   idempotent call for us — the second is a redundant re-evaluation of the same
   `frm_lo & $3F` condition in the same frame.

## §8 — Deferred / open

- **2P per-player "player N is out" slide** — `$DE18` → `sub_DE46` (`$DE48`: timer=$0D,
  posY=$D8), driven by the SAME `sub_C972` animator that lands here (movType still 0).
  It is 2P-only and MID-run (a player loses their last life but the other plays on — it
  does NOT end the stage), so it is orthogonal to the run-ending message. Stays deferred
  in `Game.destroyTank` with its citation; it needs the 2P GAME OVER handling (`$C972`
  is now ready for it, `$DE18`/`sub_DE46` is not).
- **All jingles / sfx** — Audio: `$C1C7` stage-load, `$C218` pause, `$C61B`/`$C47D`
  the two boards' jingles (the gates in §7.1), `$CD2A`/`$CE7C` the tally sfx.
