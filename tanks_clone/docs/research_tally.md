# research_tally.md — P11: the between-stage score tally

The screen shown after every stage: each player's per-type enemy kills are **counted
out one at a time** into a subtotal, then the totals, then (2P) a survivor bonus.
`sub_CCD4_score_after_stage_handler` ($CCD4) is the count-out; `sub_CEF7` ($CEF7) draws
the static screen it animates over. Called once per stage end from `$C256`, between
`Tail` and `advanceStage`.

## §0 Scope

- **In:** `sub_CEF7` (the screen), `sub_CCD4` (the count-out loop), `sub_D0B8` (the four
  enemy-type icon sprites), `sub_D0D9` (the screen's BG sub-palette regions), the 2P
  bonus (`bra_CE2B`), and the exit reset (`loc_CEE5`).
- **Reused, not re-derived:** `drawNumber` (`$D934`/`$D6DD`, P4/P10), `writeText`
  (`$D6B3`), `Score.add` (`$D9BE`/`$D138`, P10), `Tilemap.setPalette` (P5), the sprite
  path (`drawSprite`, P6).
- **Deferred (cited stubs):** the count/bonus **sfx** (`ram_sfx_score_count` `$CD2A`,
  `ram_sfx_bonus_1000` `$CE7C`) — Audio. The **hi-score-beaten** raise + HALL OF FAME
  routing is the GAME OVER flow (a separate step), untouched here.

## §1 The one load-bearing fact — the count is DISPLAY, the score is already banked

**The real score is credited at kill time, not at the tally.** `$E824`
(`sub_D9BE_add_score` with X = player index 0/1) adds the kill's points to
`ram_p1/p2_score` the instant the enemy explodes — this is P10's `Game.awardKill`
(`research_enemy_combat.md` §7), and it is correct.

So the tally's inner add (`$CD34 LDX #$02` / `$CD52 LDX #$03`) targets
`ram_p1/p2_**temp**_score` (score index **2/3**), a **display-only** accumulator that
is cleared and re-counted per enemy type (`$CD00`). The tally **never re-adds to the
running score.** Its only real-score write is the 2P survivor bonus (§5). `sub_D138`
(the 20000 extra-life check) is called during the count (`$CD3D`) but is a **no-op** —
the real score already crossed 20000 at kill time, so the life was already granted.

This corrects the pre-implementation "Next" note, which read the count as adding "into
the running score." It counts into a subtotal beside the running score; the running
score just sits there (redrawn each pass because the ROM's PPU buffer is transient —
`$CD62`/`$CD67` redraw the *unchanged* `ram_p1_score` at (5,9) every frame). The port
draws it once.

**Data model:** `Game.killCounts[player][type]` (P10) is the count consumed here — the
loop DECs it one per pass, exactly as the ROM DECs `ram_p1_enemy_type_kill_cnt`
(`$CD30`/`$CD4E`). The temp subtotal, per-type killed count, and totals are `Tally`'s
own display fields; scores are ints, not the ROM's 7-digit BCD (the digit math is
CPU-only; the value is faithful — same rule as P10).

## §2 The count-out loop (`sub_CCD4`)

```
$CCD4  draw the screen ($CEF7); wait $1E (30)                       -> PRE
$CCDC  total kills[p] = sum of the four per-type counts  (BEFORE the count DECs them)
$CCF8  type = 0
loc_CCFA (per type): clear this type's subtotal + killed count for both players
  loc_CD10 (per pass): for each player with kills of this type left —
    DEC killCounts[p][type]; INC killedCount[p]; subtotal[p] += tbl_D3D1[type]
    (play sfx; sub_D138 no-op); flag = "a kill was tallied"
  $CDDA  wait $08 (8)
  $CDDF  flag set -> loop loc_CD10 ; else -> next type
    $CDE8  type == 4 -> totals ; else wait $14 (20) -> loc_CCFA
bra_CDF4  wait $1E (30); draw total kills[p]
$CE21  wait $0F (15)
bra_CE2B  (2P, base alive) the survivor bonus (§5)
loc_CEE5  wait $78 (120); reset base_nmt/$0060/$006B/bg_pal ($CEEA-$CEF4); RTS
```

`tbl_D3D1_points_for_killing_enemy` ($D3D1) = `$10 $20 $30 $40` — **the same table** as
P10's `tbl_E8BA`, decoded as hundreds (`sub_D9E1`), i.e. `ENEMY_KILL_POINTS =
[100,200,300,400]`. Both players count **in parallel** in one pass; a type with 0 kills
for both burns one empty pass (flag stays clear) and advances.

Ported as a **phase machine** (`TALLY_PHASE` in `modes/session.js`):
`PRE → KILL ↔ BETWEEN → TOTALS → POST_TOTALS → BONUS? → FINAL`.

## §3 Layout — the screen (`sub_CEF7`), decoded to (col,row)

Buffer offset → `col = off & $1F`, `row = (off − $0400) >> 5`; number positions are the
routine's own `posX`/`posY` (`drawNumber(col=posX, row=posY)`). Drawn into nametable
`$2800` in the ROM (CPU-only); the port builds one `Tilemap`.

| element | col,row | source |
|---|---|---|
| "HI-SCORE" / value | (8,3) / posX 18,row 3 | `$CF2D` / `$CF34` |
| "STAGE" / number | (12,5) / posX 14,row 5 | `$CF48` / `$CF54` |
| "I-PLAYER" / P1 score | (3,7) / posX 5,row 9 | `$CF6B` / `$CF72` |
| "II-PLAYER" / P2 score (2P) | (21,7) / posX 23,row 9 | `$CFC9` / `$CFD0` |
| P1 ← arrow / "PTS" | col 14 / col 8, rows 12/15/18/21 | `$CF86` / `$D01F` |
| P2 → arrow / "PTS" (2P) | col 17 / col 26, same rows | `$CFE4` / `$D062` |
| P1 subtotal / count (per type) | posX 1 / posX 8, row = type·3+12 | `$CD6E` / `$CD89` |
| P2 subtotal / count (2P) | posX 19 / posX 14 | `$CDAD` / `$CDC8` |
| P1 / P2 total kills | posX 8 / posX 14, row 23 | `$CE02` / `$CE17` |

Rows are `TYPE_ROW0 (12) + type·3` (`$CD74` ASL/ADC #$0C). `drawNumber` right-aligns
(leading-zero walk), so `posX` is the walk's *start* column and the digits land to its
right — which is why "PTS" (col 8) and the count (posX 8 → digits at col 12+) don't
collide. Glyphs are ASCII font tiles (`'H'`=$48…, `' '`=$20) plus custom glyphs
$5E `I` / $5F `II` / $6B dash / $5B ← / $5D → / $15 `!`; the short strings are
hand-encoded in `constants.js` (`TALLY`) with `tbl_Dxxx` citations, like `HUD_LABEL`.

## §4 The four enemy-type icons (`sub_D0B8`) — sprites, redrawn every frame

Not BG: `sub_D0B8` draws four enemy tanks as sprites each frame (also during the waits,
`sub_D276`). Fixed centre **x = $81 (129)**, **y = $64/$7C/$94/$AC** (100/124/148/172),
tile **$80/$A0/$C0/$E0** (the type's base tank tile), **palette 2**. Each is two 8×16
sprites (`drawSprite(tile, x−8, y) + drawSprite(tile+2, x, y)`), like every tank (P6).
`Tally.render` draws the BG `Tilemap` then these eight sprites — no flicker
(`sub_D130` hard-sets palette 2, unlike a battle enemy).

## §5 The 2P survivor bonus (`bra_CE2B`) — the tally's only real-score write

Gate (`$CE24-$CE2F`): **1P skips it**; **2P skips it once the base is destroyed**
(`game_over_flag == 0`, i.e. `base.isDestroyed()` — a survivor bonus makes no sense on a
game-over). Otherwise: the player who killed **strictly more** *and* is **still alive**
(`ram_lives[p] != 0`) gets **+1000** on the **real** score (`Score.add`), plus a redraw
of that score, the "1000" number, "BONUS!" (`tbl_D3C4`) and "PTS". A tie awards nobody
(both `BCS` fall through).

**The 1000 is `sub_D9E1(#$00)`** (`$CE3C`): with A = 0 the routine takes `bra_D9F9` and
sets the *thousands* digit to 1 → the decimal number 1000 (`$CE43` adds it to score idx
0/1). This settles the pre-impl `[?]`: the bonus is genuinely +1000, via that special
case. `TALLY.BONUS_POINTS = 1000`.

## §6 Screen colours (`sub_D0D9`) — three BG sub-palettes

`sub_D0D9_prepare_nametable_attributes` ($D0D9) writes the attribute table so the
`con_bg_pal_03` set (digit offset $30) renders three regions. Decoded from the attribute
bytes ($50/$A0/$0A/$05, 2 bits per 16×16 quad) to per-cell palettes (our `Tilemap`
stores one palette per cell — nothing to unpack):

| region | tile rows,cols | palette | observed |
|---|---|---|---|
| headers (HI-SCORE / I-PLAYER / II-PLAYER / BONUS) | 2-3·0-15, 6-7, 24-25 | **1** | red |
| the scores (hi / P1 / P2) | 2-3·16-31, 8-9 | **2** | orange |
| everything else (STAGE, type rows, PTS, totals) | default | **0** | white |

`TALLY.ATTR_REGIONS` in `constants.js` lists these as `[rowStart,rowEnd,colStart,colEnd,pal]`.
Verified on screen (§8): the header reads red, the scores orange, the count-out white.

## §7 Deviations (the governing test — faithful to the observable)

1. **Count cadence.** The port holds `KILL_STEP = 8` frames per tallied pass; the ROM
   also spends a `loc_CCFA`/`loc_CD10` housekeeping frame or two per pass (transient PPU
   refills). The *rhythm* a player sees (a kill ticks ~every 8 frames, the whole tally
   ~6 s for 10 kills) is faithful; the exact frame count is CPU-shaped precision an
   emulator does better — same class as the curtain-wipe band clip (P5).
2. **Temp score as a display accumulator** (§1), not a re-add to the running score.
3. **`$2800` / `base_nmt` / `ram_0060` / `ram_006B`** are CPU-only render state: the
   port builds a `Tilemap` and passes the digit-font ($30) and leading-zero (`minDigits
   1`, i.e. `006B = 1`) params **per `drawNumber` call**. So `loc_CEE5`'s reset of those
   bytes has no analog beyond `bgPaletteId = 0`; the §"Debt" `006B` item is moot here
   (nothing global to leak).
4. **Icons drawn directly** as sprites at the four fixed positions, not routed through a
   `Tank` object (no state/dir/wheels — `sub_D130` uses the bare type tile).

## §8 Verification

Deterministic in-browser (headless `Game`, real flow Menu→1P→Battle(`enemiesLeft=0`
clear)→Tail→Tally, `getImageData` / sprite-emit spy), **26/26**:

- **1P count-out** — `killCounts [3,2,1,4]` counts out over **367 frames**, consumed to
  0, `killCounts` only ever decreasing; totals `[10,0]`; per-type peak count reaches 4
  (armour); type-0 subtotal peaks at 300 (3×100); the "10" total drawn at (12-13,23);
  then `advanceStage` → next `StageIntro`, stage 3→4.
- **2P bonus** — totals `[5,2]`, P1 (more kills, alive) gets +1000 (800→1800), P2
  unchanged.
- **Game-over skip** — base destroyed → the bonus gate skips it (900→900).
- **Render** — 8 icon sprites, tiles `80,82,a0,a2,c0,c2,e0,e2`, palette 2; the screen
  composes 1996 lit px with the §6 palette split.
- **Live screenshot** (pane visible): "HI-SCORE 20000" (red/orange), "STAGE 3",
  "I-PLAYER 12300", and the count-out mid-progress — `300 PTS 3← 🯅`, `400 PTS 2← 🯅`,
  two rows still at 0 — matching `killCounts [3,2,1,4]` with types 0-1 done.
