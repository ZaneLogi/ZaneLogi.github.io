# Battle City — Game Flow (splash → game over)

*The **screen-level** state graph: every phase from RESET to GAME OVER, what
gates each transition, and the mechanism the 6502 uses to move between them.
Companion to `research_system_interaction_map.md` — that doc covers what happens
**inside** a battle frame (§3 pipeline, §4 tank state machine); this one covers
what happens **around** it.*

**Source:** `C:\Z_Temp\NES-Games-Disassembly\Battle City\` (cyneprepou4uk).
**Citation style + [D]/[?] markers:** as the map. **[D]** = read directly from
the code; **[?]** = inference, confirm before building on it.

**The headline [D]:** the screen flow has **no state variable and no
dispatcher.** Each phase is a subroutine that owns a `sub_D8F6_wait_1_frm` loop,
and the non-linear transitions are done by **popping the return address off the
stack** (`PLA/PLA`) and `JMP`ing. This is the one part of the game that does
*not* port as "call the function and let it return" — see §7.

---

## 1. The phase inventory

**Eleven phases — 8 on the main path, 3 side branches.** The criterion is
objective: a phase is a screen state that owns its own `wait_1_frm` loop and that
the player can be *in*. The two grey curtains are excluded — they are 16-frame
transitions inside `loc_C159`, not states — as is
`sub_D276_wait_while_displaying_enemy_tanks_with_sprites`, a generic delay helper.

| # | Phase | Loop | Entered from | Leaves when |
|---|---|---|---|---|
| 1 | Title scroll-in | `bra_C7B1_loop` (`$C7B1`) | `loc_C09C` | `scroll_Y == $F0` (240 frm) **or** Start/Select |
| 2 | Title menu | `bra_C9E6_loop` (`$C9E6`) | `loc_C0A2` | Start → mode dispatch; **or** idle `frm_cnt_hi == $0A` → RTS → demo |
| 3 | **STAGE N** screen | `loc_C172_loop` (`$C172`) | `loc_C159` | `ram_004C_flag != 0` → immediately; else Start |
| 4 | Battle | `bra_C1F9_loop` (`$C1F9`) | `$C1F6` | `sub_C728` returns Z=0 |
| 5 | Ending tail | `bra_C238_loop` (`$C238`) | `$C223` | `frm_cnt_hi == $02` |
| 6 | Score tally | `loc_CCFA_loop` / `loc_CD10_loop` | `$C256` | all 4 enemy types counted out |
| 7 | GAME OVER screen | `bra_C624_loop` (`$C624`) | `$C283` | **sfx finished** (`ram_sfx_game_over_1 == 0`) or Start/Select |
| 8 | HI-SCORE screen | `bra_C486_loop` (`$C486`) | `$C28C` (conditional) | **sfx finished** (`ram_sfx_hiscore_1 == 0`) |
| 9 | Demo / attract | `bra_C41D_loop` (`$C41D`) | `$C0A8` | Start/Select → title; or `sub_C728` ends the stage |
| 10 | Construction | `loc_C0EA_construction_loop` (`$C0EA`) | `$CA82` (mode 2) | Start → `$C150` |
| 11 | Hidden cutscene | `sub_C49C_play_hidden_cutscene` (`$C49C`) | `$CA4F` | (easter egg) |

---

## 2. The flow graph

```
vec_C070_RESET ($C070) — init PPU, LDX #$7F/TXS, sub_D491_clear_stuff_and_prepare_title_screen
   │
   ▼
loc_C095 ── sub_D17F_draw_title_screen ; ram_constr_usage_cnt = 0
   │
loc_C09C ── sub_D16A ; sub_C7AB_scroll_title_screen  ◄───────────────┐   [1]
   │                        └─ Start/Select → PLA/PLA → JMP loc_C0A2 ┤
   │                                                                 │
loc_C0A2 ── sub_C9C0_title_screen_handler ──────────────────────────►┤   [2]
   │           │ Select → INC ram_game_mode (0/1/2, wrap at 3)       │
   │           │ Start  → PLA/PLA → JMP (tbl_CA69,Y)  ───────┐       │
   │           └ RTS only on idle timeout (frm_cnt_hi==$0A)  │       │
   ├──────── sub_C3B5_demo_settings + sub_C41D_demo_handler ─┼──────►┤   [3]
   │              └─ Start/Select → PLA/PLA → JMP loc_C0A2 ──┤       │
   └──────── JMP loc_C09C ───────────────────────────────────┼───────┘
                                                             │
   tbl_CA69_game_mode_handler ($CA69) ◄──────────────────────┘
     00 → ofs_000_CA6F_00_1_player   enemy_limit = con_max_tanks-2 = 5 ┐
     01 → ofs_000_CA74_01_2_players  enemy_limit = con_max_tanks   = 7 ├→ sub_C2B3 → JMP loc_C159
     02 → ofs_000_CA7E_02_construction ──→ loc_C0AE ──► [4] editor     │
                                              └ Start → $C154 INC constr_usage_cnt → JMP loc_C0A2
   ┌──────────────────────────────────────────────────────────────────┘
   ▼
loc_C159 ◄────────────────────────────────────────────────┐  (next stage)
   │  sub_EA51_clear_sound_engine_data ; pause_flag = 0    │
   │  bg_palette_id = con_bg_pal_04                        │
   │  sub_CC90_close_grey_curtain            (16 frm)      │
loc_C172_loop ── sub_CA91_print_word_stage_and_number ─────┤  [3] "STAGE N"
   │      ram_004C_flag == 0 → A/B select stage (1..35), wait for Start
   │      ram_004C_flag != 0 → fall straight through
bra_C1C5 ── constr_usage_cnt ? keep constructed field : sub_C9B0 + sub_F000_draw_stage
   │  sub_CCB2_open_grey_curtain             (16 frm)  ← this is what copies $0400 → PPU
   │  sub_C331_prepare_tanks_...  (also sets 004C=1, clears constr_usage_cnt)
   │
bra_C1F9_loop ── [pause gate] sub_C2E6_main_battle_script  [4] BATTLE
   │             sub_C728_check_condition_for_stage_ending → Z=0 ?
   ▼
$C223  frm_cnt_lo = frm_cnt_hi = 0
       game_over_msg_timer != 0 → frm_cnt_hi = $FE   (buy 2 extra hi-ticks)
bra_C238_loop ── sub_C2A2_disable_buttons_if_game_over    [5] tail
   │             sub_C2E6 again … until frm_cnt_hi == $02
   ▼
sub_CCD4_score_after_stage_handler                        [6] score tally
   │
   ├─ INC ram_stage
   ├─ == $47 (71) → ram_stage = 1 ; 2nd_loop_flag = 0     ← endless wrap
   ├─ == $24 (36) → 2nd_loop_flag = 1                     ← 2nd loop begins
   ├─ lives[0]+lives[1] != 0 && game_over_flag == $80 → JMP loc_C159 ──┘
   ▼ else
bra_C283_game_over ── sub_C5D9                            [7] GAME OVER
   │                  sub_D97D_check_hiscore_beaten
   │                  Y != 0 → sub_C44B ; sub_C295        [8] HI-SCORE
   └─ JMP loc_C095   (back to the title)
```

---

## 3. Transitions — the three mechanisms

### 3a. Ordinary call / return — "return" *means* "advance"

The phase order is simply the caller's instruction order **[D]**. `loc_C0A2`
calls `sub_C9C0_title_screen_handler`; when it returns — which happens on exactly
one path, the idle timeout at `$CA32` (`frm_cnt_hi == $0A` **and**
`constr_usage_cnt == 0`) — control falls through to `sub_C3B5_demo_settings` and
`sub_C41D_demo_handler`. There is no "go to demo" instruction; *returning from the
menu is what starts the demo.*

### 3b. `PLA/PLA` — the "become" transition **[D]**

When a phase must abandon its caller's continuation, it pops its own return
address off the stack and `JMP`s. **Exactly three sites**, and they are what make
the flow a graph rather than a call tree:

| Site | Trigger | Effect |
|---|---|---|
| `$CA56` | Start at the menu | `PLA PLA` then `JMP (tbl_CA69,Y)` → 1P / 2P / editor |
| `$C7C3` | Start/Select during the scroll-in | `PLA PLA` + `JMP loc_C0A2` — skip the rest of the scroll |
| `$C43F` | Start/Select during the demo | `PLA PLA` + `JMP loc_C0A2` — back to the menu |

The disassembly comments `$CA56` itself: `PLA ; skip demo and stuff` — it is
literally discarding the caller's two remaining `JSR`s (`sub_C3B5_demo_settings`,
`sub_C41D_demo_handler`) so that pressing Start doesn't fall into the attract mode.

**The stack stays balanced [D].** `loc_C095` / `loc_C09C` / `loc_C0A2` are reached
by `JMP`, never `JSR` — they are an infinite loop, not a subroutine. So each
`PLA/PLA` pops exactly the two bytes its own `JSR` pushed, restoring SP to the
top-level value from RESET's `LDX #$7F / TXS` (`$C086`). The entire game therefore
runs at one stack depth. It is a disciplined tail-call: *don't return to my
caller, go here instead, and leave the stack where my caller found it.*

### 3c. Flag-driven loop exit + fallthrough **[D]**

Everything from `loc_C159` to game over is **one linear code path**, gated by
variables rather than calls:

- `sub_C728_check_condition_for_stage_ending` returns non-zero → exit the battle loop.
- `frm_cnt_hi == $02` → exit the tail loop.
- Then `INC ram_stage`, the two wrap checks, the lives check and the
  `game_over_flag` check pick `JMP loc_C159` (next stage) or fall into
  `bra_C283_game_over`.

So 1P, 2P and "next stage" are not three flows — they are one flow entered with
different variables.

---

## 4. Phase detail

**[1] Title scroll-in** — `sub_C7AB_scroll_title_screen` (`$C7AB`). `scroll_Y` is
INC'd once per frame until `CMP #$F0` (`$C7BE`) ⇒ **240 frames ≈ 4.0 s** at
`NTSC_FPS`. Skippable (§3b).

**[2] Title menu** — `sub_C9C0_title_screen_handler` (`$C9C0`). `bg_palette_id =
con_bg_pal_03`; `base_nmt = $02` (the title lives in the `$2800` nametable, hence
`con_ppu_offset_2800` in `sub_D17F`). The I/II cursor is drawn as **tank slot 0**
(`ram_tank_flags = con_tank_flag_80 + $03`, wheels EOR'd every 4 frames at
`$C9E9`) through the ordinary `sub_DEA6_tanks_handler` — the menu cursor *is* a
tank. Select INCs `ram_game_mode`, wrapping at 3 (`$CA25`).
**Idle → demo:** `frm_cnt_hi` reaching `$0A` (`$CA34`) ⇒ **577–640 frames ≈
9.6–10.6 s**, *not* a flat 640. `$C9D4` zeroes `frm_cnt_hi` on entry but **not
`frm_cnt_lo`**, so the first of the ten hi-ticks lands on `lo`'s next multiple-of-64
boundary — 1 to 64 frames away, depending on the phase `lo` happened to be in when
the menu was entered. The remaining nine are 64 apart. *(Measured on the port
2026-07-16; an earlier draft of this line asserted a flat 640.)*

**[3] STAGE N screen** — `loc_C172_loop`. `sub_CC90_close_grey_curtain` (`$CC90`)
fills the screen with tile `$11` over **16 frames**; `sub_CA91` prints
`"STAGE  "` + the number into the PPU buffer at `$05CC`. On the **first stage of a
fresh game only** (`ram_004C_flag == 0`) A/B change the stage number — clamped to
1..35 by `$C199` (`CMP #$24` → `$23`) and `$C1BC`/`$C1C0` (`DEC` → 0 → 1). Start
commits. `sub_CCB2_open_grey_curtain` (`$CCB2`) then reveals the field over 16
frames — and note it is *not* just an effect: with `grey_tile_flag = 0` it draws
the **real tiles from `$0400`**, so **the curtain is the mechanism that copies the
field to the PPU** (there is no `sub_D7B4_copy_400h_to_nametable` on this path).

**[4] Battle** — `bra_C1F9_loop`. Covered by map §2/§3.

**[5] Ending tail** — `bra_C238_loop`. Gameplay *keeps running* after the stage
ends, with buttons zeroed if game over (`sub_C2A2`, `$C2A2`). Duration is set by
seeding `frm_cnt_hi` at `$C223`/`$C236` and waiting for `$02` (`$C24D`):

| case | seed | hi-ticks | frames | ≈ |
|---|---|---|---|---|
| normal (stage cleared) | `$00` | 2 | **128** | 2.13 s |
| a GAME OVER message is sliding | `$FE` | 4 | **256** | 4.26 s |

(`ram_frm_cnt_hi` ticks every **64** frames — `$D43E` `AND #$3F / BNE / INC`,
confirmed. `frm_cnt_lo` is zeroed alongside it, so the first tick is exactly 64
frames out.)

**[6] Score tally** — `sub_CCD4` → `sub_CEF7_draw_screen_with_score_count`
(`$CEF7`, drawn into `$2800` via `con_ppu_offset_2800`). Counts out
`ram_p1/p2_enemy_type_kill_cnt` per type against `tbl_D3D1_points_for_killing_enemy`,
one kill per pass, calling `sub_D138_gain_extra_life_for_20000_pts` as it goes; then
totals, then the 2P bonus comparison (`$CE2B`), then `loc_CEE5` waits `$78` = 120 frames.

**[7] GAME OVER screen** — `sub_C5D9` (`$C5D9`). Clears `$0400-$07FF`, draws huge
`tbl_D343_huge_text___game` / `tbl_D348_huge_text___over`, and **waits for the sfx
to finish** — see §6d.

**[8] HI-SCORE screen** — `sub_C44B` (`$C44B`), only if `sub_D97D_check_hiscore_beaten`
returns Y != 0. Draws `tbl_D2B5_huge_text___hiscore` + `sub_D951_draw_huge_hiscore`,
cycles `bg_palette_id` through 5..8 on `frm_cnt_lo & $03` (`$C489`), and **waits for
the sfx to finish**. Followed by `sub_C295` (clear + copy) before returning to the title.

**[9] Demo / attract** — `sub_C3B5_demo_settings` (`$C3B5`) + `sub_C41D_demo_handler`
(`$C41D`). Draws stage `$FF` (the demo stage), then sets `ram_stage = $1E` so the HUD
**displays stage 30**; `lives[1] = 3`; `enemy_limit = 5`; `2nd_loop_flag = con_flag_demo`;
BATTLE/CITY huge text over the field. `sub_C642_demo_players_ai_handler` (`$C642`) drives
the "players" and then the ordinary `sub_C2E6` runs — the attract mode *is* the battle loop.
**The demo is silent** because `$C3B7` sets `ram_pause_flag = 1` (§6e).

**[10] Construction** — `loc_C0AE`. Exits via `$C150`: `INC ram_constr_usage_cnt` then
`JMP loc_C0A2` — note it targets `loc_C0A2`, **not** `loc_C095`, so the title is not
redrawn and the counter is not reset. That accumulation is what feeds §6c.

**[11] Hidden cutscene** — `sub_C49C_play_hidden_cutscene` (`$C49C`), fired from `$CA4F`
when `constr_usage_cnt == $07` **and** `hidden_cutscene_action_cnt == $74`.
See <https://tcrf.net/Battle_City_(NES)>.

**What it is (decoded 2026-07-17):** a secret credit — the programmer's love letter.
It blanks the screen (`$C4A9` clears `$0400`, `$C4AC` ships it) and reveals one line
per `sub_C567_wait_64_frm` (`$C567`: zero `frm_cnt_lo`, spin until `& $3F` — 64 frames
≈ 1.07 s). Ten of those, so ~11 s:

| when | cell | table | text |
|---|---|---|---|
| after 2 waits | row 8, col 8 | `$D30F` | `THIS PROGRAM WAS` |
| +1 wait | row 10, col 8 | `$D284` | `WRITTEN BY` |
| +1 | row 12, col 8 | `$D334` | `OPEN` `$6B` `REACH` — one run, dash in the middle |
| +1 | row 14, col 8 | `$D34D` | `WHO LOVES NORIKO` |
| +1 each | row 16, cols 8-12 | `$D33F` | `.` `.` `.` `.` `.` — **one dot per second** |

The five dots are five separate `sub_D6B3` calls to `$2208`-`$220C`, each after its own
64-frame wait: an ellipsis typed out slowly, letting the confession sit. Then `$C55D`
rebuilds the default stage field and it `RTS`es back to `$CA52` — the game just starts.

**The trigger's counter is a TWO-CONTROLLER combo**, and the usual shorthand
("Down+A on controller 2") is wrong: the **D-pad half is player 1's HOLD** and the
**button half is player 2's PRESS**.

| step | source | effect |
|---|---|---|
| `$CA04` `hold[0] & Down` + `$CA0A` `press[1] & A` | P1 holds, P2 presses | `cnt += $10` |
| `$CA17` `hold[0] & Right` + `$CA1D` `press[1] & B` | P1 holds, P2 presses | `cnt -= 1` |

So `$74` = 8×(Down+A) then 12×(Right+B). Reading `$CA0A`/`$CA1D` alone and inferring
"controller 2" misses `$CA04`/`$CA17` two instructions earlier — the port's own TODO
had it wrong until this was re-derived.

Note the counter reaching 7 also **suppresses the demo entirely** (`$CA38`), so once
the editor half of the ritual is done the attract loop stops cycling and waits.

---

## 5. The stage cycle — there is no ending **[D]**

```
ram_stage:  1 … 35        1st loop      (2nd_loop_flag = 0)
            36 … 70       2nd loop      (2nd_loop_flag = 1, set at $C26B/$C271)
            71            → ram_stage = 1, 2nd_loop_flag = 0   ($C25D/$C263/$C267)
```

`sub_F000_draw_stage` maps 36..70 back onto the 35 stage files with `A >= $24 →
SBC #$23` (`$F009`), so the 2nd loop replays the same layouts at higher
difficulty. Stage 71 wraps to 1 **and clears the flag**, so loop 3 is loop 1 again
— an endless 70-stage cycle.

**The only terminal state is GAME OVER.** Verified as a negative claim: the ROM's
complete set of full-screen texts is five — `tbl_D299` BATTLE, `tbl_D2A0` CITY,
`tbl_D2B5` HISCORE, `tbl_D343` GAME, `tbl_D348` OVER. There is no
congratulations/ending text to reach, and `$C25D` is the only stage wrap.

What the 2nd loop changes: enemies spawn at the stage-35 rate regardless of stage
(`$C391`–`$C399` substitutes `#$23` into the interval formula), plus
`sub_C859_draw_flag_above_stage_number` (`$C859`/`$C83F`) shows the loop flag, and
`$C7E1`, `$E3DD`, `$E42B`, `$E815`, `$E8A4`, `$E9B0` read it. Spawn interval itself:
`ram_enemy_spawn_interval = $BE - (stage * 4)` (`$C39E`), then `-$14` more in 2P
(`$C3AD`).

---

## 6. The gate variables

### 6a. `ram_004C_flag` ($4C) — "stage select is a first-stage-only feature"

Two writers **[D]**: `sub_C2BD_prepare_player_data` zeroes it (`$C2CB`) when a
fresh game starts; `sub_C331` sets it to 1 (`$C38F`) once the first stage is
prepared. One reader: `$C175`. So `loc_C172_loop` waits for input the first time
through and falls straight past on every stage after — which is exactly Battle
City's stage select.

### 6b. `ram_game_over_flag` ($68) — a tri-state flag *and* timer **[D]**

Not a boolean. `$E2D2` discriminates all three:

| value | meaning | tested by |
|---|---|---|
| `$80` (`con_not_game_over`) | playing | `BMI` (`$E2D6`), `CMP #$80` (`$C27C`, `$DE1A`) |
| `$01`–`$7F` | the eagle is exploding | falls through both branches at `$E2D4`/`$E2D6` |
| `$00` | game over | `BEQ` (`$C72A`, `$E2D4`, `$E6AC`) |

A bullet reaching the eagle sets it to `$27` (`$E6B0`, with
`sub_CC08_draw_destroyed_eagle`); `sub_E2A9_HQ_handler` DECs it every frame
(`$E2DC`) while driving the explosion animation off the remaining count; at `$00`
`sub_C728` sees it and ends the stage. So "eagle destroyed → game over" is a
**39-frame animated countdown**, not an edge.

### 6c. `ram_constr_usage_cnt` ($4B) — the editor's cross-phase memory

| site | op | effect |
|---|---|---|
| `$C09A` | `= 0` | at `loc_C095` — fresh title (RESET, or return after game over) |
| `$C154` | `INC` | leaving the editor |
| `$C35F` | `= 0` | `sub_C331` — entering any stage |
| `$C0AE`,`$C0E3` | read | skip re-creating the default field if re-entering the editor |
| `$C1D0` | read | **≠ 0 ⇒ skip `sub_F000_draw_stage`** — play the constructed field |
| `$CA38` | read | **≠ 0 ⇒ the demo never starts** |
| `$CA43` | read | `CMP #$07` — the hidden-cutscene gate |

The `$C1D0` / `$C35F` pair is why a constructed stage is played **once**: `$C1D0`
runs before `sub_C331` clears the counter, so stage 1 uses your field and stage 2
onward reverts to the real stages.

### 6d. Sound-engine completion gates two phase transitions **[D]**

Both end-of-game screens are timed by the **sfx**, not a frame counter:

- `$C630` — `LDA ram_sfx_game_over_1 / BNE bra_C624_loop` `; wait until sound is played`
- `$C495` — `LDA ram_sfx_hiscore_1 / BNE bra_C486_loop` `; wait until sound is played`

The GAME OVER screen is additionally skippable with Start/Select (`$C627`); the
HI-SCORE screen is **not** — its only exit is the sfx finishing.

### 6e. `ram_pause_flag` ($6D) has two consumers, not one **[D]**

The stage loop's pipeline gate (`$C1FC`) is the well-known one. The second is
`sub_EA7E_sound_driver` itself: `$EA7E` reads it and sets `ram_sfx_check_limit` to
`$1C` (scan all sfx slots `$0300-$031B`) when clear, or `$01` (only the pause sfx
at `$0300`) when set. So the flag **mutes the sound engine**, and that is how
`sub_C3B5_demo_settings` (`$C3B7`) makes the attract mode silent — it is not a
vestigial write.

### 6f. The two GAME OVER *message* trigger sites **[D]**

`ram_game_over_msg_timer`/`_pos_X`/`_pos_Y`/`_mov_type` feed one animator,
`sub_C972_game_over_text_handler` (`$C972`, pipeline step 15), from two places
with different meanings:

| site | when | setup | stage ends? |
|---|---|---|---|
| `$C737` (`sub_C728`) | real game over | X=`$70`, Y=`$F0`, mov_type=**0** (up), timer=`$11` | **yes** |
| `$DE18` → `sub_DE46` (`$DE46`) | 2P: one player out, the other alive | P1: X=`$20`, mov_type=**3** (right); P2: X=`$C0`, mov_type=**1** (left); Y=`$D8`, timer=`$0D` | **no** |

`sub_C972` DECs the timer every 16 frames (`frm_cnt_lo & $0F`), moves via
`tbl_D3D5_game_over_message_spd_X` / `tbl_D3D9_game_over_message_spd_Y` indexed by
mov_type while timer ≥ `$0A`, then holds. It returns immediately in the demo
(`CMP #con_flag_demo` at `$C979`) — the attract mode never shows GAME OVER.

---

## 7. The mode machine (design) — **LOCKED 2026-07-16**

*This section replaces an earlier "Port consequences" list that was wrong-headed:
four of its six bullets treated 6502 plumbing as mechanism to preserve. What
follows is the design that survived that correction. §1–§6 above are the research;
this is what falls out of it — the same shape as the map (§1–§6 research, §7
design).*

### 7.1 The method — observable vs artifact

**Zane's ruling (2026-07-16), and it governs the whole port:** we don't mimic
mechanisms that come from the 6502's hardware design. Routine-by-routine
translation of *plumbing* buys only a byte-for-byte match, and an emulator does
that better than we ever will. The flow is designed from **the player's
experience**, with the source as the authority on *content and timing*, not on
*shape*.

> **Faithful to what the player can observe. Free with what only the CPU can
> observe.**

This is the root `CLAUDE.md`'s "is it the design's mechanism, or its coincidence?"
test, applied to control flow instead of screen-RAM. Sorting §1–§6:

| Finding | Observable? | Verdict |
|---|---|---|
| The phase set and its order (§1, §2) | yes | **design** — this is the spec |
| 240-frm scroll · 10.6 s idle→demo · 16-frm curtain · 128/256-frm tail (§4) | yes, as feel | **design** — cited constants |
| Stage select on stage 1 only (§6a) | yes | **design** |
| 20 enemies/stage · 2nd loop @36 · wrap @71 · no ending (§5) | yes | **design** |
| Eagle explodes 39 frm, *then* game over (§6b) | yes | **design** |
| GAME OVER / HI-SCORE last as long as their jingle (§6d) | yes | **design** |
| Demo is silent · shows stage 30 · is AI-driven battle (§4) | yes | **design** |
| 2P: one player out → side message, game continues (§6f) | yes | **design** |
| `wait_1_frm` as a blocking coroutine (§1) | **no** | artifact → fixed-timestep tick |
| `PLA/PLA` stack unwind (§3b) | **no** | artifact → a transition edge |
| `loc_*` trampoline labels (§3c) | **no** | artifact → mode identity |
| `game_over_flag` as a tri-state byte (§6b) | **no** | artifact → enum + timer |
| `pause_flag` doubling as the sfx mute (§6e) | **no** | artifact → two separate facts |
| Curtain doubling as the field→PPU upload (§4) | **no** | artifact → it's a wipe |
| `sub_D276`'s six call sites, nested loops (§4) | **no** | artifact → a screen with a timer |

The timing numbers transfer **verbatim** — unlike `prince_of_persia`'s view-space
case (root `CLAUDE.md` lesson 6c), we render the same 256×240 at the same
60.0988 Hz, so there is no coordinate space to re-derive into. 128 frames means
128 frames.

### 7.2 The graph — 5 modes, one nesting level

```
        ┌────────────────────────────────────────────────────┐
        ▼                                                    │
   ┌─ ATTRACT ──Start──► SESSION ──lost──► GAME_OVER ────────┤
   │  ├ SCROLL           ├ STAGE_INTRO       │               │
   │  ├ MENU ────┐       ├ BATTLE            ▼               │
   │  └ DEMO     │       ├ TAIL          HALL_OF_FAME ───────┘
   │  (cycles)   │       └ TALLY         (only if beaten)
   │             │          └─(next stage)
   └─────────────┴──mode 2──► EDITOR ──► ATTRACT {at: MENU}
```

**Sub-modes are the nesting level.** `SESSION` owns
`StageIntro → Battle → Tail → Tally`; `ATTRACT` owns `Scroll → Menu → Demo`
(cycling). They are sub-modes rather than top-level ones because they share the
run's state and none can exit to attract on its own.

**`Battle` and `Tail` are two modes** (Zane, 2026-07-16): *"It is harmless to have
two modes. Do it this way first — have it work first, improve it later."* `$C23E`
is `$C200` again plus `sub_C2A2`, so fusing them is possible — but it threads an
`if (endingTail)` through the middle of the battle's update, and "the stage is over
but the world keeps moving" is a genuinely different beat.

### 7.3 The contract — one `Mode`, used at both levels

```js
// mode.js
export const DONE = Symbol('done');

export class Mode {
  constructor(game, args = {}) { this.game = game; this.args = args; }
  enter()     {}             // once, on entry
  update()    { return null } // one logic tick @ NTSC_FPS. null = stay, DONE = finished
  render(renderer) {}        // 0..n times per tick — MUST NOT mutate state
  exit()      {}             // once, on leaving
}
```

A `Mode` may own a child `Mode` and drive it with the same protocol — that is the
whole of the hierarchy (a hierarchical state machine; no library, no new concept).

### 7.4 Three properties that are forced, not preferences

1. **`update()` / `render()` split — forced by the accumulator (map §1).** rAF runs
   at the *display* rate, so one repaint may need **0, 1 or 2+** logic ticks. Fused
   update-and-draw means drawing twice in one frame, or not at all. *The source
   already had this split and the legacy JS lost it:* `sub_DEA6_tanks_handler` is
   deliberately **not** in the `$C2E6` pipeline (§3 note) — `$C2E6` purely advances
   world state, drawing is its own pass.
2. **Transitions decided centrally — forced by ES-module import cycles.** If a mode
   returned the next mode, `attract.js` would import `editor.js` and `editor.js`
   would import `attract.js`. A real cycle, and with no build step that means TDZ
   landmines on the class declarations. With a central table, modes import *nothing*
   of each other.
3. **A fresh instance per entry.** State is clean *by construction*, so the
   "remember to reset your `seq` before returning DONE" bug class cannot exist. Costs
   ~5 allocations per playthrough.

### 7.5 The flow table — the graph as data

```js
// flow.js — this table IS §2, executable. Each row cites its source.
export const NEXT = {
  [M.ATTRACT]:      (g) => g.gameMode === 2 ? [M.EDITOR] : [M.SESSION],  // $CA56 → tbl_CA69
  [M.SESSION]:      ( ) => [M.GAME_OVER],                                // $C283
  [M.GAME_OVER]:    (g) => g.hiScoreBeaten()                             // $C286 sub_D97D
                             ? [M.HALL_OF_FAME] : [M.ATTRACT, {at: A.SCROLL}],
  [M.HALL_OF_FAME]: ( ) => [M.ATTRACT, {at: A.SCROLL}],                  // $C292 → loc_C095
  [M.EDITOR]:       ( ) => [M.ATTRACT, {at: A.MENU}],                    // $C156 → loc_C0A2
};
```

**The `{at:}` payload is load-bearing (§6c).** `A.SCROLL` is `loc_C095` — redraw the
title *and zero `constr_usage_cnt`*. `A.MENU` is `loc_C0A2` — straight to the menu,
**counter preserved**. That preservation is what lets the counter reach the 7 that
unlocks the hidden cutscene (`$CA43`). Collapse the two entries into one and the
easter egg dies silently.

*(Table vs a plain `switch` in `game.js` is taste, not merit — 5 nodes either way. The
table wins narrowly because each row carries its source address, so it reads
side-by-side with §2, and the graph itself is testable: every mode reachable, every
terminal path returns to ATTRACT. Swapping it for a `switch` is a local change.)*

### 7.6 The tick

```js
// game.js
setMode(id, args) {
  this.mode?.exit();
  this.modeId = id;
  this.mode = new MODES[id](this, args);   // fresh — see 7.4(3)
  this.mode.enter();
}

tick() {                                   // one logic frame @ NTSC_FPS
  // --- the NMI half's non-render duties, in vec_D400_NMI's own order (map §1) ---
  this.input.sample();                     // $D689  (NMI step 5)
  this.audio.tick();                       // $EA7E  (NMI step 7)
  this.frm.bump();                         // $D43C  (NMI step 8)
  // --- then the main-loop half resumes, exactly as it does after wait_1_frm ---
  if (this.mode.update() === DONE) this.setMode(...NEXT[this.modeId](this));
}

render() {                                 // NMI steps 1-4 (OAM DMA + buffer flush)
  this.renderer.beginFrame();
  this.mode.render(this.renderer);         // modes draw through Renderer, the PPU analog
  this.renderer.endFrame();
}
```

**The order inside `tick()` is not arbitrary — it is `$D400`'s (map §1 [D]).** The
NMI fires *while* the main loop is parked in `wait_1_frm`, so every frame is
`render → input → audio → counter → update`, and `update` runs last, reading what
the NMI just refreshed. Two consequences a naive ordering gets wrong by one frame:
`audio.tick()` **before** `update()`, because sfx that `update` queues into
`ram_sfx_*` are consumed by the *next* NMI, not this one; and `frm.bump()` **before**
`update()`, because the main loop always reads a counter the NMI has already
advanced. Put the bump after and every `frm_cnt_lo & $0F` timer (§6f), the wheel
animation (`& $03`, `$C9E9`) and the water swap (`& $1F`, `$C31D`) sit one frame out
of phase.

```js
// main.js
function frame(now) {
  requestAnimationFrame(frame);                        // unkillable — always reschedule
  acc += Math.min(now - last, MAX_CATCHUP); last = now;
  while (acc >= TICK) { game.tick(); acc -= TICK; }    // 0, 1, or 2+ times
  game.render(ctx);                                    // exactly once
}
```

Session state (`lives`, `stage`, `scores`, `secondLoop`, `stageSelectUsed`) lives on
`Game` — the map's §7 already locked that, and it means `GameOver` reads the final
scores with no handoff. `game.resetSession()` is `sub_C2B3`. There is **no `Session`
state object**; `SESSION` is a mode, not a data owner.

### 7.7 Rejected, with reasons — do not re-litigate

| Rejected | Why |
|---|---|
| **Pushdown automaton / screen stack** | Its marquee use is pause-as-overlay. BC's pause is a *modifier inside the battle* — `$C1FC` gates only `$C2E6` while `$E23B`/`$E0D8`/`$DEA6` keep running, so sprites animate on the pause screen (§2). The stack's reason to exist is absent. |
| **Statechart library (XState/SCXML)** | Right vocabulary, absurd dependency for 9 states in a no-build-step project. Took the vocabulary, not the runtime. |
| **Generators (`yield` = `wait_1_frm`)** | Mirrors the 6502's coding style, which is the artifact, not the design. Would make `Game` a hand-written emulator of the CPU's call stack — no gain over MAME. *(The argument that killed the alternative — "you'd hand-roll `sub_D276`'s return address" — was circular: that only bites if you've already decided to preserve the routine structure.)* |
| **Modes return the next mode** | Import cycles — 7.4(2). |
| **Legacy `do_frame()` (fused update+draw, `seq` int, module singleton)** | Incompatible with the accumulator — 7.4(1). Its footguns are real: `xrick/scr_gameover.js` saves `this.period` and restores `this.game_period`. |

### 7.8 The honesty ledger — where we knowingly leave the source

Per the root `CLAUDE.md`: mark deviations, don't hide them.

- ~~**`Audio` is stubbed, and it gates two modes (§6d).**~~ **Retired in P15** — `$EA7E`
  is ported, so `GameOver`/`HallOfFame` wait on the real `audio.isPlaying(GAME_OVER_1 /
  HISCORE_1)`; the frame constant survives only as a fallback for when audio never
  unlocked (no user gesture — a browser fact, not a source one). The asymmetry still
  holds: GAME OVER has a Start/Select escape (`$C627`), HI-SCORE has none.
- **The demo's silence is a design fact, not `pause_flag` plumbing (§6e).** `Attract`
  simply plays no sfx. "Pausing mutes" is a *separate* fact that `Battle` owns. The
  source expresses both through one byte; we don't.
- **`game_over_flag` becomes `Base.state` (ALIVE/EXPLODING/DESTROYED) + a timer
  (§6b).** The 39-frame explosion is preserved; the tri-state-byte packing is not.
- **The curtain is a renderer wipe, not a field upload (§4).** On hardware
  `sub_CCB2_open_grey_curtain` *is* the `$0400`→PPU copy; for us that is plumbing.
  A 16-frame wipe, reusable by any transition.

### 7.9 File layout

```
mode.js       the Mode base + DONE
flow.js       NEXT — the mode graph as data (7.5)
game.js       Game: session state, setMode/tick/render, the MODES registry
modes/attract.js       ATTRACT + its Scroll/Menu/Demo sub-modes
modes/session.js       SESSION + StageIntro/Battle/Tail/Tally sub-modes
modes/game_over.js     $C5D9
modes/hall_of_fame.js  $C44B
modes/editor.js        $C0AE (deferred stub)
```

Only `game.js`/`flow.js` import the modes; modes import none of each other (7.4(2)).

---

## 8. Open questions / to-verify

- **[?]** `sub_C642_demo_players_ai_handler` (`$C642`) — how the attract mode
  drives the two player slots. It writes `ram_btn_hold,X` / `ram_btn_press,X`
  directly (`$C6AD`/`$C6AF`), i.e. the demo fakes controller input rather than
  driving tanks. Belongs to `EnemyAI`/`TankRoster` when the demo is ported.
*(Resolved items are moved into the section they belong to and deleted from this
list — an open-item list that still lists answered questions is worse than no
list. See the map's §8 preamble.)*
