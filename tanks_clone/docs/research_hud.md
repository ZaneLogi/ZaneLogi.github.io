# research_hud.md — S8-A: the battle sidebar HUD

The right-side status column of a battle: **lives**, the shrinking **20-enemy
reserve** icon column, the **Ip/IIp** labels, and the **flag + stage number**.
This is the first slice of S8 (Score/HUD).

## §0 Scope

- **In (this doc):** everything the ROM draws into the battle sidebar strip —
  `sub_C7C8` (lives), `sub_C8C0`/`sub_C8B1`/`sub_C8A2`/`sub_C894` (enemy-icon
  column), `sub_C830` (Ip/IIp), `sub_C859` (flag + stage number).
- **Elsewhere — S8-B** (score *accumulation*: `add_score` $D9BE, extra-life $D138):
  built with its data source in P10 (`research_enemy_combat.md` §7). `hi-score-beaten`
  ($D97D) is deferred with the GAME OVER flow.
- **Elsewhere — P11:** the between-stage Tally count-out (`$CEF7`), which reads the
  per-type kill counters P10 records.

Everything here reads state the game **already** has (`lives`, `stage`,
`gameMode`, `secondLoop`, the enemy-spawn counter) — that is exactly why the HUD had
no combat dependency and could land first.

## §1 The sidebar — one cell map

The sidebar is the **right border strip** of the field's `Tilemap`: the play grid
is 13 blocks × 2 = 26 tiles at cols 2–27, so cols 28–31 are `$11` grey border
(`Field.loadStage`). The HUD lives in cols **29–30**, every cell **palette 0**
(the border fill sets palette 0; BG text has no palette of its own — map §5/§9 —
so it inherits the default-0 attribute, and `writeTiles` leaves palette untouched).

Positions are decoded from each routine's buffer address / X,Y (buffer offset
`addr − $0400`, then `row = off >> 5`, `col = off & 31`):

| element | tiles | cell(s) | when | source |
|---|---|---|---|---|
| Ip label | `[$58,$13]` | (29,17)(30,17) | always | `$C830` → `$063D` |
| P1 lives | icon `$14` + digit | (29,18) + (30,18) | always | `$C7C8` → `$065D`, digit col 25→30 |
| IIp label | `[$5A,$13]` | (29,20)(30,20) | 2P/demo | `$C849` → `$069D` |
| P2 lives | icon `$14` + digit | (29,21) + (30,21) | 2P/demo | `$C7F2` → `$06BD`, row 21 |
| enemy reserve | `$6A` ×20 | cols 29–30, rows 3–12 | stage entry | `$C8C0`/`$C894` |
| flag | `[$6C,$FC]` / `[$6D,$FD]` | (29,23)(30,23) / (29,24)(30,24) | stage entry | `$C859` → `$06FD`/`$071D` |
| stage number | digit(s) | (30,25) or (29–30,25) | stage entry | `$C859`, col 25→30, base $6E |

## §2 The routines

**`sub_C7C8_print_lives_handler` ($C7C8) — pipeline step 17, every battle frame.**
Draws the P1 icon at `$065D` unconditionally; in 2P **or demo** (`$C7E1`
`2nd_loop==$02` / `$C7E7` `game_mode!=0`) also the P2 icon at `$06BD`. Then a loop
over player index (`ram_005A`: 1→0 for 2P/demo, forced to 0 for 1P) prints each
player's lives digit:
- **The value is `max(lives − 1, 0)`** (`$C805` `SEC/SBC #$01`, `$C808` `BPL` else
  0). Battle City's sidebar shows the **reserve** tank count, not total lives — the
  one in play isn't counted. So 3 lives → "2".
- digit row = `player_index*3 + $12` → **P1 row 18, P2 row 21** (`$C816-$C821`).
- digit col: `sub_D934` starts at X=$19 (25) and skips the number's leading zeros,
  so the ones digit lands at **col 30**, right of the icon at col 29. A 2-digit
  reserve (≥10 lives, reachable via extra-life) puts the tens at col 29, **over**
  the icon — a genuine ROM quirk we keep (the icon is re-drawn each change first,
  so the sequence self-heals a 2→1-digit shrink; §6).
- `ram_006B_flag` is set to 1 here (`$C7CC`) → the all-zero print is `0`, i.e.
  `minDigits = 1` (vs the title's 2). It's cleared again at `$C82D`.

**Enemy reserve column — `sub_C8C0` / `sub_C8A2` / `sub_C8B1` / `sub_C894`.**
- `sub_C894_calculate_enemy_icon_pos`: `X = (A & 1) + $1D`, `Y = (A >> 1) + $03`.
  So index `i` → cell **(29 + (i&1), 3 + (i>>1))** — a 2-wide × 10-tall grid
  filling left→right, top→bottom, cols 29–30, rows 3–12.
- `sub_C8C0_draw_20_enemy_icons` (stage entry): loops `A = $12,$10,…,$00` (10
  values), each calling `sub_C8A2`, which writes `tbl_D362 = [$6A,$6A]` — a **pair**
  at (29,Y),(30,Y). 10 pairs = **20 cells**. (The port fills 20 cells directly via
  the same `enemyIconCell(i)`; identical result.)
- `sub_C8B1_erase_enemy_icon` (from the spawn handler `$DB68`): writes
  `tbl_D36B = [$11]` (one grey cell) at `sub_C894(index)`. The index is
  `ram_enemy_spawn_cnt` **after** its decrement (`$DB64` `DEC` → `$DB66` `LDA`),
  which starts at 20 and counts down — so the grid **drains bottom-up** (index 19 =
  cell (30,12), the bottom-right) one icon per spawn. This is why the reserve column
  is driven by **spawns**, not kills (P9, done), and needs no P10.

**`sub_C830_draw_Ip_IIp_icons` ($C830) — stage entry.** `tbl_D2AB "Ip"` at `$063D`
always; `tbl_D2AE "IIp"` at `$069D` in 2P **or demo** — same gate as the lives.

**`sub_C859_draw_flag_above_stage_number` ($C859) — stage entry.** A 2×2 flag from
`tbl_D365`/`tbl_D368` (rows 23–24), then the stage number: offset `$6E`,
`sub_DA13`(stage) → decimal, `sub_D934`/`sub_D6DD` at col 25→30, row 25. Stage is
1–35, so the all-zero path never runs (minDigits irrelevant).

## §3 The tile tables (extracted, `bank_FF.asm`)

| table | addr | bytes | meaning |
|---|---|---|---|
| `tbl_D341_player_icon` | $D341 | `14 FF` | mini player-tank icon |
| `tbl_D362_enemy_icon` | $D362 | `6A 6A FF` | one reserve enemy = tile `$6A` (drawn in pairs) |
| `tbl_D36B_gray` | $D36B | `11 FF` | erase → grey border tile (= `TILE.BORDER`) |
| `tbl_D2AB_Ip` | $D2AB | `58 13 FF` | `$58`="I", `$13`="P" |
| `tbl_D2AE_IIp` | $D2AE | `5A 13 FF` | `$5A`="II", `$13`="P" |
| `tbl_D365_flag1` | $D365 | `6C FC FF` | flag top row |
| `tbl_D368_flag2` | $D368 | `6D FD FF` | flag bottom row |

These are literal tile ids (§4). `$FF` is the fill terminator, not a tile.

## §4 The `ram_0060` tile-id offset — and why `drawNumber` needed a parameter

Two ROM primitives, one adds the offset and one does not:
- **`sub_D6B3_fill_buffer_with_tiles`** ($D6B3, ported as `Tilemap.writeTiles`)
  copies table bytes **verbatim** — no `ram_0060` add. So every §3 tile is literal.
- **`sub_D6DD`** ($D6DD, fused into `drawNumber`) adds `ram_0060_tile_id_offset`
  ($D6F5) to each non-terminator digit.

The offset selects the digit font: the **title** score uses `$30` (ASCII '0'), the
**sidebar** (lives at `$C7CE`, stage number at `$C87A`) uses **`$6E`** — a second,
smaller digit font in the BG pattern table. The ported `drawNumber` had `$30`
hard-wired (correct only for the title); it now takes a `digitBase` param
(default `$30`), and the HUD passes `$6E`.

## §5 Design

- **`Score` is the HUD *renderer*; the state stays on `Game`.** Per the map's §7
  lock, `lives`/`scores`/`stage` live on `Game`; `Score` reads them and writes into
  `field.tilemap`. The stub's duplicated `p1/p2/hi` fields are removed (they were a
  §7 violation waiting to happen); `Score` holds only NOT-SOURCE render caches.
- **Two entry points, mapped to the ROM's two draw times:**
  - `Score.drawStageHud(field, gameMode, isDemo, stage)` — the stage-entry draws
    (`$C8C0`/`$C830`/`$C859`), called from `Game.prepareStage` (`$C331`). Also
    resets the lives cache so step 17 repaints on the first battle frame.
  - `Score.drawLives(field, lives, gameMode, isDemo)` — `$C7C8`, pipeline step 17.
  - `Score.eraseEnemyIcon(field, index)` — `$C8B1`, from `roster.spawnEnemyTick`.
- **Write-on-change (deviation, governing test).** The ROM re-fills its transient
  PPU buffer every frame; our `Tilemap` is persistent and repaints only on a
  `version` bump, so an every-frame `writeTiles` would defeat that (the whole point
  of the persistent-canvas cache — CLAUDE.md rendering notes; same shape as the
  scroll and water-swap). So `drawLives` writes only when a player's displayed
  reserve **changes** (cache in `Score._livesShown`). On a change it re-draws the
  **icon then the digit** (the ROM's order), which also self-heals the rare
  2-digit→1-digit shrink that would otherwise leave a stale tens digit at col 29.
  This is the same faithful re-derivation as the field: draw once, update on change.
  Player-observably identical.

## §6 Verification plan (deterministic, headless `Game` + `getImageData`)

1. **Cell contents** — after `prepareStage`, assert `field.tilemap` tiles: 20 `$6A`
   at the reserve cells; Ip `[$58,$13]` at (29,17); flag tiles at rows 23–24; stage
   number digit(s) at row 25.
2. **Lives** — `drawLives` writes `max(lives-1,0)` at (30,row); flip lives and
   assert the digit changes; a 2P game draws P2 at row 21, a 1P game does not.
3. **Reserve drain** — call `eraseEnemyIcon` for descending indices and assert the
   bottom-up order (index 19 → (30,12)); drive real spawns and watch the count of
   `$6A` cells fall.
4. **write-on-change** — assert `field.tilemap.version` does **not** move on a
   `drawLives` call when lives are unchanged; does move on a change.
5. **Pixels / palette** — screenshot stage 1 (pane open) and confirm the sidebar
   renders lives, the reserve column, Ip, the flag and the stage number in a
   readable palette (verifies the `$6E` digit font actually renders as digits).

## §7 Open / deferred

- **`$6E` digit font** — the disasm is unambiguous that the offset is `$6E`; that
  it renders as legible digits is confirmed in the screenshot step, not asserted
  blind here.
- **`ram_006B_flag` post-game title** — still the text.js `[?]` (title may print
  `0` vs `00`); a GameOver-flow concern (unaffected by the score work here).
