# research_game_state_machine.md

Decode of the I-12 subsystem: the `numPlayers` state machine that
governs attract / in-game / post-game / high-score-entry flow, the
`$77F6 PrintPackedMsg` packed-string printer, and the 2-player bank-
swap mechanism. All citations against
`C:\Z_Temp\computer_archeology_asteroids\content\Arcade\Asteroids\`
(this PC: `D:\tmp\computer_archeology_asteroids\content\Arcade\Asteroids\`).

This doc is the I-12a deliverable. It exists so I-12b through I-12h
can be implemented without re-reading the source for every step.

## 1. numPlayers state machine

`$1C numPlayers` is a 1-byte field with four meaningful values:

| Value | Meaning | Source comment |
|---|---|---|
| `$00` | Attract mode | "None" branch in $6885 / $6E76 / $703F / $6BA4 / $7268 |
| `$01` | Single-player game in progress | |
| `$02` | Two-player game in progress | |
| `$FF` | "Just ended — run high-score-placement check" | Set at $69D3 by all-players-out branch |

Transitions:

```
   [BOOT / cold start] ────────────────► attract(0)
   ▲                                          │
   │                                          │ SW1START or SW2START
   │                                          │ (credits available)
   │                                          ▼
   │                            in-game(1 or 2) ◄───┐
   │ $765C resets to 0                              │ next-player switch
   │ after placement                                │ (2-player only)
   │ detection runs                                 │ $69BA-$69CC
   │                                                │
   │                            ┌─ ship dies, ─────┘
   │                            │  curShips > 0
   │                            │  ($6B1E ship-hit,
   │                            │   $6B66 saucer-hit)
   │                            │
   │                            ▼  curShips == 0 + no active shots
   │                       game-over wait (status=0,
   │                                       shipSpawnTimer ≈ $80)
   │                            │
   │                            │ $6960 fires on the FRAME shipSpawnTimer == $80
   │                            ▼
   │  ($FF — placement detect) ←─── all-players-out: $69D3 sets $1C = $FF
   └────────────────────────────────  $69D5 zeros sound, $69DC turns on both lamps
```

Two important properties of this state machine:

- **$FF is a single-frame intermediate.** It's set by `$69D3` after
  all players are out, then cleared to `$00` by `$765C` on the very
  next frame's dispatch (after the placement scan runs). The user
  never sees `$FF` last more than one frame, but `$765C` and
  `$6D90`'s entry-render path both gate on it.
- **The wait-for-next-player marker is `shipSpawnTimer == $80`**, not
  a separate field. Source piggybacks on the spawn-timer countdown
  for the next-player wait window. See §3.

## 2. The 15-JSR dispatch (revised, replacing the I-7 sketch)

I-7 ported the 15-JSR dispatch as stubs. Now that we've decoded the
post-game/attract routines, the per-JSR comments need to be updated.
The corrected mapping:

```
$683C: JSR $6885 — playerMgmt    (credits + delayBeforePlay tick + JMP $6960 game-over check)
$683F: BCS $6803                 (CF=1 from playerMgmt → cold-restart loop)
$6841: JSR $765C — attractText   (MISNOMER: actually the post-game-over high-score-placement detector; runs only when $1C=$FF)
$6844: JSR $6D90 — highScoreMgmt (initial-entry rendering + rotate/hyperspace input loop)
$6847: BPL $6864                 (if N=0 from $6D90 → entry IS active → skip $73C4)
$6849: JSR $73C4 — highScoreTable (MISNOMER in task_seq.js: NOT entry input — actually the attract-mode HIGH SCORE table draw)
$684C: BCS $6864                 (CF=1 → skip gameplay block)
$684E: LDA delayBeforePlay
$6850: BNE $685E                 (delay > 0 → skip ship/saucer/fire block)
$6852: JSR $6CD7 — playerFire
$6855: JSR $6E74 — shipControl
$6858: JSR $703F — shipSpawnPhys
$685B: JSR $6B93 — saucerSpawn
$685E: JSR $6F57 — asteroidUpdate
$6861: JSR $69F0 — collisions
$6864: JSR $724F — scoreLivesDraw  (HUD)
$6867: JSR $7555 — soundDispatch
$686A-$686F: emit closing LABS at (~mid-screen)
$6870: JSR $77B5 — advanceRNG
$6873: JSR $7BC0 — emitHalt
$6876+: wave-progression trailer
```

**Required task_seq.js fix:** the `highScoreEntry` stub at line ~158
mis-cites `$73C4` as "rotate-to-select-letter / hyperspace-to-confirm
input for high-score initials". `$73C4`'s actual body is the
attract-mode HIGH SCORE table draw (header + 10 entries). The
rotate/hyperspace input lives INSIDE `$6D90` at `$6DF9-$6E6F`. The
stub should be renamed `highScoreTable` and recommented accordingly.

`$6D90`'s N-flag return convention (the BPL gate at $6847):

| `$6D90` return path | A reg at RTS | N flag | $6847 BPL | What runs at $6849 |
|---|---|---|---|---|
| No entry in progress ($32 AND $33 = $FF) | $FF | N=1 | skips | `$73C4` HIGH SCORE table draws (if attract mode) |
| Entry-rendering body completes | $00 | N=0 | takes | $73C4 skipped |

So during attract WITHOUT a pending high-score-entry, the table draws.
During attract WITH entry active, the entry prompts draw and the
table is suppressed. During gameplay (numPlayers != 0), both `$765C`
and `$73C4` early-out.

## 3. `$6885` playerMgmt — full decomposition

`$6885` is the top-level state dispatcher. Two main branches keyed on
`$1C numPlayers`:

### 3.1 In-game branch ($1C != 0)

```
$6885: LDA $1C
$6887: BEQ $689D       → attract branch
$6889: LDA $5A delayBeforePlay
$688B: BNE $6890       → delay > 0: tick it
$688D: JMP $6960       → delay == 0: game-over / next-player check
$6890: DEC $5A
$6892: JSR $69E2       → emit "PLAYER N" banner during the wait
$6895: CLC; RTS
```

So during the "wait between players" window (delayBeforePlay set to
$80 = 128 frames by `$69B3`), each frame draws "PLAYER 1" or
"PLAYER 2" centered while the counter drains. When it hits 0, `$6960`
fires and either game-overs or hands control to the next player.

### 3.2 Attract branch ($1C == 0)

```
$689D: LDA $71 holdDIP
$689F: AND #$03            ; bits 0-1 = coinage DIP
$68A1: BEQ $6897           → FREE PLAY: numCredits = 2
$68A3: CLC; ADC #$07       ; → msg-id $08/$09/$0A (1c1p, 1c2p, 2c1p)
$68A6: TAY
$68A7: LDA $32; AND $33    ; both placements
$68A9: BPL $68B0           → entry in progress: don't draw credits msg
$68AD: JSR $77F6           → draw the coinage message
$68B0: LDY $70 numCredits
$68B2: BEQ $6895           → no credits: skip start-button polling, fall to "PUSH START" path

$68B4: LDX #$01            ; assume 1-player game
$68B6: LDA $2403 SW1START
$68B9: BMI $68DE           → 1-player pressed: start game
$68BB: CPY #$02            ; ≥ 2 credits for 2-player?
$68BD: BCC $693B           → not enough: fall to push-start blink

$68BF: LDA $2404 SW2START
$68C2: BPL $693B           → not pressed: fall to push-start blink

; 2-player start path
$68C4-$68CA: holdLampValues |= $04; $3200 |= $04  ; swap to player-2 bank
$68CD: JSR $6ED8           ; $02F5 = 2 (asteroidsPerWave init); $56 = numShipsPerGame DIP
$68D0: JSR $7168           ; newWaveInit on player-2 bank
$68D3: JSR $71E8           ; place ship at center on player-2 bank
$68D6-$68D8: $58 ply2CurShips = $56 numShipsPerGame
$68DA: LDX #$02
$68DC: DEC $70 numCredits  ; (extra dec — total of 2 for 2-player game)

; common start path (1- and 2-player)
$68DE: STX $1C numPlayers    ; 1 or 2
$68E0: DEC $70 numCredits
$68E2-$68EA: holdLampValues = (holdLampValues AND $F8) EOR $1C
            ; turn off start lamps (bits 0-2)
$68ED: JSR $71E8           ; place ship at center on (now current-player) bank
                            ; — sets both banks' shipSpawnTimer/saucerTimeReload/etc.
                            ; via the $68F0+ burst (see §4)
```

`$693B-$695F` "PUSH START blink" body — runs when in attract and no
start press happened:

```
$693B: LDA $32 / AND $32; BPL $694C   → entry active: skip PUSH START
$6941: LDA $5C fastTimer; AND #$20    ; blink every 32 frames
$6945: BNE $694C                       → on-phase: skip draw
$6947: LDY #$06 ("PUSH START")
$6949: JSR $77F6                       ; draw it
$694C: LDA $5C fastTimer; AND #$0F     ; blink lamps every 16 frames
$6950: BNE $695E                       → not blink-frame: skip
$6952-$695C: alternate which start lamp is on
$695E: CLC; RTS
```

Port deviation needed: **no cabinet lamps**. The lamp-blink writes
land in `holdLampValues` (`$6F`) and `$3200`. JS port models
`holdLampValues` as a state field but the `$3200` writes are no-ops.
Optionally render a small "1P / 2P" HUD indicator that mirrors the
lamp bits.

## 4. `$68F0-$693A` game-start burst

Fired from the start-press path (`$68ED` falls into it). Cold-init
defaults for ALL fields needed by both banks. Note: source writes to
both `$02xx` (active bank) and `$03xx` (the holding area = other
player's bank) so both players start identically.

```
$68F0: LDA #$01
$68F2: STA $02FA shipSpawnTimer     ; cold-init = 1 → respawn fires on frame 2
$68F5: STA $03FA otherPlayer+FA     ;   (same to other bank)
$68F8: LDA #$92
$68FA: STA $02F8 saucerTimeReload
$68FD: STA $03F8 otherPlayer+F8
$6900: STA $03F7 otherPlayer+F7
$6903: STA $02F7 saucerTimer
$6906: LDA #$7F
$6908: STA $02FB astdWaveTimer       ; 127-frame pre-wave grace
$690B: STA $03FB otherPlayer+FB
$690E: LDA #$05
$6910: STA $02FD max_rocks_for_ufo
$6913: STA $03FD otherPlayer+FD
$6916: LDA #$FF
$6918: STA $32 ply1HighPlacement    ; "neither player qualifies yet"
$691A: STA $33 ply2HighPlacement
$691C: LDA #$80
$691E: STA $5A delayBeforePlay      ; 128-frame pre-game pause
$6920: ASL A                         ; A = 0; C = 1
$6921: STA $18 curPlayer            ; player 1 starts
$6923: STA $19
$6925: LDA $56 numShipsPerGame      ; DIP-set, typically 3 or 4
$6927: STA $57 ply1CurShips
$6929: LDA #$04
$692B: STA $6C sndThump
$692D: STA $6E sndTHumpOff
$692F: LDA #$30
$6931: STA $02FC astWaveTimerReload
$6934: STA $03FC otherPlayer+FC
$6937: STA $3E00 SNDRESET            ; pulse sound chip reset
$693A: RTS                            ; (CF=1 from $6920 ASL)
```

Note `$693A: RTS` with `CF=1` (set at `$6920` by ASL of `$80`). The
caller `$683F: BCS $6803` then jumps back to the top of the main loop
— **this skips the rest of the dispatch for that frame**, so the
freshly-initialized state takes effect before any per-frame routines
run. Port: model as an early-return-with-flag from `playerMgmt` (the
current `simulate(state)` signature needs a "restart-this-frame" path).

**For the JS port** the burst becomes a single function call
`gameStartBurst(state, numPlayers)` that:
1. Resets timers in BOTH `state.players[0]` and `state.players[1]`.
2. Calls `newWaveInit(player2)` if 2-player.
3. Places ships at center on both banks.
4. Sets shared `delayBeforePlay = $80`, `curPlayer = 0`,
   `ply1HighPlacement = ply2HighPlacement = $FF`.
5. Sets `state.players[0].curShips = numShipsPerGame` (and player 2
   if 2-player).

## 5. `$6960` game-over flow

Called by `$6885` when `numPlayers != 0 AND delayBeforePlay == 0`.

```
$6960: LDA $5C fastTimer
$6962: AND #$3F                     ; every 64 frames
$6964: BNE $6970
$6966: LDA $02FC astWaveTimerReload ; per-game difficulty drift
$6969: CMP #$08                      ; floor at 8
$696B: BEQ $6970
$696D: DEC $02FC                     ; gradually shorten inter-wave pause
$6970: LDX $18 curPlayer
$6972: LDA $57,X ply1CurShips
$6974: BNE $6992                     → ships left: skip GAME OVER emit
$6976: LDA $021F shipShotsTimer      ; AND all 4 shot timers
$6979: ORA $0220
$697C: ORA $0221
$697F: ORA $0222
$6982: BNE $6992                     → shots still active: wait them out
$6984: LDY #$07 ("GAME OVER")
$6986: JSR $77F6                     ; draw it
$6989: LDA $1C numPlayers
$698B: CMP #$02
$698D: BCC $6992                     → 1-player: skip PLAYER N
$698F: JSR $69E2                     ; emit "PLAYER N" too
$6992: LDA $021B statusShip
$6995: BNE $69CD                     → ship not at 0 (alive or exploding): RTS
$6997: LDA $02FA shipSpawnTimer
$699A: CMP #$80
$699C: BNE $69CD                     → not on the $80 frame: RTS
$699E: LDA #$10
$69A0: STA $02FA shipSpawnTimer      ; reset to $10 (16-frame wait before switch)
$69A3: LDX $1C numPlayers
$69A5: LDA $57 ply1CurShips
$69A7: ORA $58 ply2CurShips
$69A9: BEQ $69CF                     → both dry: cold-attract transition
$69AB: JSR $702D                     ; clear ship slot
$69AE: DEX
$69AF: BEQ $69CD                     → 1-player game: RTS (will go to attract after 16-frame wait + $7050 re-fire)
$69B1: LDA #$80
$69B3: STA $5A delayBeforePlay       ; 128-frame between-player pause
$69B5: LDA $18 curPlayer
$69B7: EOR #$01
$69B9: TAX
$69BA: LDA $57,X
$69BC: BEQ $69CD                     → next player has 0 ships: RTS (skip switch)
$69BE: STX $18 curPlayer             ; commit switch
$69C0-$69C6: holdLampValues XOR= $04; STA $3200 ; bank swap
$69C9: TXA; ASL A; STA $19
$69CD: CLC; RTS

$69CF: STX $1A numPrevPlayers
$69D1: LDA #$FF
$69D3: STA $1C numPlayers            ; → state = $FF
$69D5: JSR $6EFA                     ; turn off all sounds
$69D8-$69E0: holdLampValues = (holdLampValues AND $F8) OR $03  ; both start lamps on
$69E1: CLC; RTS
```

**The crucial "$80 marker" detail.** Source sets
`shipSpawnTimer = $81` in `Ship.kill` (`$6B1E-$6B25`). On the next
frame's dispatch:
1. `$6885` → `$6960` runs FIRST. It checks `CMP #$80` against the
   timer. On frame N+1 the timer is still `$81`, so no fire.
2. Later in the same frame, `$703F` shipSpawnPhys runs and decrements
   `$81 → $80`.
3. **Frame N+2**: `$6960` runs first this frame, sees `$80`, fires
   the game-over branch. `shipSpawnPhys` later sees `$10` (just-set)
   and decrements normally.

So `Ship.kill` does NOT need to write `$80` — the source's $81
universal-respawn-delay marker passes through `$80` exactly once on
its way to 0, and `$6960` catches that frame.

## 6. `$765C` — post-game-over high-score-placement detector

Despite the historical label "attractText" in `task_seq.js`, this
routine has no text rendering. Its body:

```
$765C: LDA $1C
$765E: BPL $7698                     → if N=0 ($00-$7F, i.e., NOT $FF): RTS
$7660: LDX #$02                      ; start with player 2 (X = 2, 0)
$7662-$7666: $5D slowTimer = $FF; $32 = $FF; $33 = $FF
$7668-$767A: loop Y=0..18 (10 entries × 2 bytes): compare $52,X+$53,X
             against table $1D,Y+$1E,Y; if player beats → record placement Y
             and JMP $7699 (shuffle insert)
$767C: DEX; DEX; BPL $7668           ; next player
$7680-$7690: resolve ply1 vs ply2 ordering (player 2 placement < player 1
             placement is impossible since tied scores end up sequentially)
$7692: LDA #$00
$7694: STA $1C numPlayers            ; → state = $00 (attract)
$7696: STA $31 highScoreLetter
$7698: RTS
```

The high-score table is at `$1D-$30` (zero-page) — 10 entries, each
2 bytes (`scoreTens`, `scoreThous`). The shuffle path `$7699-$76ED`
inserts the qualifying score at the recorded index. The 3-letter
initials live at `$34-$51` (10 × 3 bytes).

The `numPlayers = $FF → $00` transition happens HERE, completing the
single-frame intermediate.

## 7. `$77F6` PrintPackedMsg — packed-string printer

### 7.1 Byte format (per VectorROM.md "Messages" section)

- **5 bits per character.** 3 chars in 2 bytes = 15 bits. Bit 0 of
  byte 1 is the **terminator flag** (1 = message ends; 0 = continue
  with next 2-byte triple).
- **Char `@` (5-bit value $00) also terminates** the message, regardless
  of the terminator flag.
- **Char map** (32 entries, 5-bit codes $00-$1F):
  ```
  index:  0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
  char:   @   _   0   1   2   A   B   C   D   E   F   G   H   I   J   K
  index: 10  11  12  13  14  15  16  17  18  19  1A  1B  1C  1D  1E  1F
  char:   L   M   N   O   P   Q   R   S   T   U   V   W   X   Y   Z   ?
  ```
  Indices 5-30 (A-Z) are sequential. Index 19 ("O") doubles as the
  digit `0` glyph — the existing `Char_O → Char_0` cross-ref in
  `vector_rom_data.js` (per `research_hud_coords.md §6.1`) is the
  same dispatch table this routine uses.

### 7.2 Per-language offset table base ($7887-$788E)

```
$7887-$7888: $571E  ; English (DIP $2803 bits 0-1 = 00)
$7889-$788A: $788F  ; bogus (lands in code memory)
$788B-$788C: $79F3  ; bogus
$788D-$788E: $351B  ; bogus (I/O space)
```

**Port: hardcode English ($571E).** The 3 non-English entries point
into garbage and are dead code on standard cabinet DIPs.

### 7.3 Offset table at $571E (mirror of $171E in vector ROM)

11 messages, indexed by msg-id 0-A:

| msg-id | Offset byte | Start addr | Text |
|---:|---:|---:|---|
| 0 | $0B | $5729 | "HIGH SCORES" |
| 1 | $13 | $5731 | "PLAYER " |
| 2 | $19 | $5737 | "YOUR SCORE IS ONE OF THE TEN BEST" |
| 3 | $2F | $574D | "PLEASE ENTER YOUR INITIALS" |
| 4 | $41 | $575F | "PUSH ROTATE TO SELECT LETTER" |
| 5 | $55 | $5773 | "PUSH HYPERSPACE WHEN LETTER IS CORRECT" |
| 6 | $6F | $578D | "PUSH START" |
| 7 | $77 | $5795 | "GAME OVER" |
| 8 | $7D | $579B | "1 COIN 2 PLAYS" |
| 9 | $87 | $57A5 | "1 COIN 1 PLAY" |
| A | $91 | $57AF | "2 COINS 1 PLAY" |

**(Computer Archeology's comment on $1721 spells "PEASE" but the
encoded bytes decode to "PLEASE". Typo in the comment, not the data.)**

### 7.4 LABS coord table at $7871 (22 bytes = 11 × 2)

Per `research_hud_coords.md §1`, `$7C03` takes `A = DVG-X/4`,
`X = DVG-Y/4`. Each table entry is `{A, X}`:

| msg-id | A | X | DVG coord (×4) | Callsite |
|---:|---:|---:|---:|---|
| 0 HIGH SCORES | $64 | $B6 | (400, 728) | $73D6 |
| 1 PLAYER | $64 | $B6 | (400, 728) | $69E2, $6D9C |
| 2 YOUR SCORE... | $0C | $AA | (48, 680) | $6DB9 |
| 3 PLEASE ENTER... | $0C | $A2 | (48, 648) | $6DBE |
| 4 PUSH ROTATE... | $0C | $9A | (48, 616) | $6DC3 |
| 5 PUSH HYPERSPACE... | $0C | $92 | (48, 584) | $6DC8 |
| 6 PUSH START | $64 | $C6 | (400, 792) | $6947 |
| 7 GAME OVER | $64 | $9D | (400, 628) | $6984 |
| 8 1 COIN 2 PLAYS | $50 | $39 | (320, 228) | $68A3+ |
| 9 1 COIN 1 PLAY | $50 | $39 | (320, 228) | $68A3+ |
| A 2 COINS 1 PLAY | $50 | $39 | (320, 228) | $68A3+ |

All credit messages share `(320, 228)` because at most one shows per
frame in attract mode. PLAYER and HIGH SCORES also share `(400, 728)`
— different temporal contexts (PLAYER during between-player wait /
game-over; HIGH SCORES during attract without entry).

### 7.5 Globals set by the routine

- `ram.$00 = $10` (`$77FD`) — global scale `$10` is used for ALL
  packed messages. This is the gs that gets ORed into the next
  `$7C03` LABS emission.
- After the LABS at `$781C`, `$781F-$7821` writes `$70` to the cursor
  via `$7CDE` — looks like a DVG opcode preceding the glyph JSRs.

### 7.6 Unpacker dispatch ($7853-$786E)

```
$7853: AND #$3E                  ; mask: keep 5-bit char in bits 5-1
                                   ; (chr × 2, range 0-30)
$7855: BNE $785B                 → non-zero: continue
$7857: PLA; PLA; BNE $7849       → char 0 ('@'): pop return addr,
                                   terminate message via $7849 → $7C39
$785B: CMP #$0A                  ; chr*2 < $0A (= chr < 5)?
$785D: BCC $7861                 → yes (chars @ _ 0 1 2): X = chr*2
$785F: ADC #$0D                  ; else X = chr*2 + $0E
                                   (skip 7 unused entries between '2' and 'A')
$7861: TAX
$7862-$786D: copy 2 bytes from $56D2,X / $56D3,X to ($02),Y
              ; emits JSR opcode + low/high address into vector RAM
$786E: LDX #$00; RTS
```

The table at `$56D2` (mirror of `$16D2` in vector ROM) contains JSR
opcodes targeting each glyph's vector ROM subroutine. Same table the
I-11a HUD digit dispatch uses.

### 7.7 JS port shape

```js
// state arg passed through for $00 global-scale write
function drawPackedMessage(state, renderer, msgId, options = {}) {
  const labsCoords = PACKED_MSG_LABS[msgId];        // {x, y} ×4
  const charBytes = PACKED_MSG_BYTES[msgId];        // Uint8Array
  const cursor = { x: labsCoords.x * 4, y: labsCoords.y * 4 };
  // Iterate triples; each triple = 2 bytes, 3 chars.
  // Stop on terminator-bit set OR char 0.
  let i = 0;
  while (i < charBytes.length) {
    const b0 = charBytes[i], b1 = charBytes[i+1];
    const c0 = (b0 >> 3) & 0x1f;
    const c1 = ((b0 & 0x07) << 2) | (b1 >> 6);
    const c2 = (b1 >> 1) & 0x1f;
    const term = b1 & 0x01;
    if (c0 === 0) break;
    renderer.drawAt(GLYPH_NAME[c0], cursor, 0x10);
    if (c1 === 0) break;
    renderer.drawAt(GLYPH_NAME[c1], cursor, 0x10);
    if (c2 === 0) break;
    renderer.drawAt(GLYPH_NAME[c2], cursor, 0x10);
    if (term) break;
    i += 2;
  }
}
```

The `GLYPH_NAME` table maps 5-bit codes 1-30 to existing VROM
subroutine names — for 1 (`_`) it's a small space stride; for 2
(`0` = `O`) it's `Char_O`; for 3-4 (`1`, `2`) it's `Char_1` / `Char_2`;
for 5-30 (`A`-`Z`) it's `Char_A` through `Char_Z`. Index 0 (`@`) is
the terminator (no draw).

The cursor advances naturally within each `Char_X` subroutine (the
"sequential JSRs share a cursor" pattern from I-8/I-11a).

The byte-pair unpacking can either be implemented at runtime
(loop above) OR pre-decoded once at module-load into JS string
arrays `["H", "I", "G", "H", "_", "S", ...]`. I-12b will use the
pre-decode path — simpler and `tools/build_packed_messages.py` can
do the byte-pair → string decode once at build time, mirroring the
existing `build_vector_rom.py` pattern.

## 8. 2-player bank-swap → PerPlayerState mapping

### 8.1 Hardware mechanism

`$3200` is the lamp / bank-select output latch. Bit 2 (mask $04)
selects which 256-byte page maps to the CPU's `$0200-$02FF` region:
- bit 2 = 0 → physical page A maps to $02xx; page B maps to $03xx
- bit 2 = 1 → physical page B maps to $02xx; page A maps to $03xx

(The CPU always addresses $02xx for "current player" state; the
hardware redirects based on bit 2.)

Source mirror at `$6F holdLampValues` keeps a CPU-readable copy
since `$3200` is write-only.

### 8.2 What's banked vs shared (from `RAMUse.md`)

**Banked at $0200-$03FF (all per-player):**

| Range | Field | Notes |
|---|---|---|
| $0200-$021A | statusAsteroids[27] | object table |
| $021B | statusShip | object table |
| $021C | statusSaucer | object table |
| $021D-$021E | saucerShotTimer[2] | object table |
| $021F-$0222 | shipShotsTimer[4] | object table |
| $0223-$0245 | horzVel × 35 slots | |
| $0246-$0268 | vertVel × 35 slots | |
| $0269-$028B | hposh × 35 slots | high byte of X position |
| $028C-$02AE | vposh × 35 slots | high byte of Y position |
| $02AF-$02D1 | hposl × 35 slots | low byte of X position |
| $02D2-$02F4 | vposl × 35 slots | low byte of Y position |
| $02F5 | asteroidsPerWave | |
| $02F6 | curAsteroidCount | |
| $02F7 | saucerTimer | |
| $02F8 | saucerTimeReload | |
| $02F9 | asteroid_hit_timer | |
| $02FA | shipSpawnTimer | |
| $02FB | astdWaveTimer | |
| $02FC | astWaveTimerReload | |
| $02FD | max_rocks_for_ufo | |

**Indexed-by-curPlayer at fixed zero-page:**

| Addr | Field | Index |
|---:|---|---|
| $52,$54 | scoreTens | X = curPlayer*2 |
| $53,$55 | scoreThous | X = curPlayer*2 |
| $57,$58 | curShips | X = curPlayer (no ×2) |
| $32,$33 | highPlacement | X = curPlayer |

**Truly shared (single value, all players read the same):**

| Addr | Field | Notes |
|---|---|---|
| $1C | numPlayers | |
| $18 | curPlayer | the bank pointer itself |
| $1A | numPrevPlayers | game-over → attract |
| $1D-$30 | highScores (10 × 2 bytes) | |
| $31 | highScoreLetter | |
| $34-$51 | highScoresInitials (10 × 3) | |
| $56 | numShipsPerGame | DIP-set |
| $59 | hyperSpaceFlag | |
| $5A | delayBeforePlay | |
| $5B | NMI timeout | |
| $5C-$5D | fastTimer / slowTimer | |
| $5F-$60 | RNG state | |
| $66-$6E | sound timers | |
| $6F | holdLampValues | |
| $70 | numCredits | |
| $71 | holdDIP | |
| $72 | slamFlag | |
| $73 | coinsToCredits | |
| $7A-$7C | coin1/2/3 input lengths | |

**Transient (in shared memory but effectively re-initialized per
respawn or per-frame):**

| Addr | Field | Notes |
|---|---|---|
| $61 | direction | not banked; player 2's ship picks up whatever direction was left in $61. Source has no reset in $7068. |
| $62 | saucerShotDir | per-frame |
| $63 | photomLimiter | edge-detect state — both players share |
| $64-$65 | ship_thrust_dH/dV | low-byte accumulators |
| $7D-$94 | ship explosion x/y offsets | per-explosion |

### 8.3 JS model

```js
class PerPlayerState {
  constructor() {
    this.asteroids = Array.from({length: 27}, () => new Asteroid());
    this.ship = new Ship();
    this.saucer = new Saucer();
    this.saucerShots = [new Shot(), new Shot()];
    this.playerShots = Array.from({length: 4}, () => new Shot());

    // $02F5-$02FD per-wave timers
    this.asteroidsPerWave = 2;
    this.curAsteroidCount = 0;
    this.saucerTimer = 0;
    this.saucerTimeReload = 0x92;
    this.asteroid_hit_timer = 0;
    this.shipSpawnTimer = 1;
    this.astdWaveTimer = 0;
    this.astWaveTimerReload = 0x30;
    this.max_rocks_for_ufo = 5;

    // Score + lives (per-player at fixed zero-page in source)
    this.scoreTens = 0x00;
    this.scoreThousands = 0x00;
    this.curShips = 3;

    // Per-player high-score placement byte
    this.highPlacement = 0xFF;
  }
}

class GameState {
  constructor() {
    this.players = [new PerPlayerState(), new PerPlayerState()];
    this.curPlayer = 0;

    // Shared (truly):
    this.numPlayers = 0;          // I-12d cold-init flipped from 1 to 0
    this.numPrevPlayers = 0;
    this.numCredits = 1;          // dev default for I-12d
    this.fastTimer = 0;
    this.slowTimer = 0;
    this.delayBeforePlay = 0;
    this.rngLo = 1; this.rngHi = 0;
    this.holdLampValues = 0;
    this.holdDIP = 0;             // DIP mirror

    this.highScores = new Array(10).fill(null).map(() => ({tens: 0, thous: 0}));
    this.highScoresInitials = new Array(10).fill(null).map(() => [0, 0, 0]);
    this.highScoreLetter = 0;
    this.numShipsPerGame = 3;     // DIP-set

    // Transient/shared:
    this.hyperSpaceFlag = 0;
    this.input = { rotLeft: false, rotRight: false, thrust: false,
                   hyper: false, fire: false, start1: false, start2: false };
    this.fireWasPressed = false;

    // Compatibility getters (so existing code reads through curPlayer):
    // get ship() { return this.players[this.curPlayer].ship; }
    // ... same for asteroids/saucer/saucerShots/playerShots and the
    //     9 banked timers + score/lives/highPlacement.
  }
}
```

Bank swap (`$3200 bit 2 EOR $04` at `$69C0-$69C6`) becomes:

```js
state.curPlayer ^= 1;
state.holdLampValues ^= 0x04;
```

The `$3200` write is dropped (no real lamp hardware). Optional:
expose `state.holdLampValues` to a small HUD lamp indicator.

## 9. Port deviations expected during I-12

| # | Deviation | Why | Where documented |
|---|---|---|---|
| 1 | Two `PerPlayerState` objects + active pointer | No banked memory in JS; same pattern as phoenix_clone's per-player state | I-12c site comment |
| 2 | `$3200` writes are no-ops | No cabinet lamp hardware | I-12d / I-12e site comments |
| 3 | Lamp blink → optional HUD indicator | No cabinet lamps | I-12d site comment |
| 4 | `numCredits` cold-init = 1 (dev default) | No coin input wired; defer real coin counter | I-12d site comment |
| 5 | English-only language base ($571E) | DIP $2803 non-English entries point into garbage | I-12b site comment |
| 6 | Packed-message decode at build time | Simpler than runtime bit unpacking; mirrors `build_vector_rom.py` pattern | I-12b tooling |
| 7 | `$73C4` re-cited as `highScoreTable` (not `highScoreEntry`) | task_seq.js stub mislabeled — actual body draws attract-mode HIGH SCORE table | I-12g site comment + task_seq.js fix |
| 8 | `playerMgmt` may need an "abort-this-frame" return path | Source's `$693A` RTS+CF=1 → `$683F` BCS jumps back to top of main loop, skipping the rest of the frame | I-12d main.js / task_seq.js |

## 10. Updates required to existing files (I-12a only — small)

- **`task_seq.js`**: rename `highScoreEntry` stub to `highScoreTable`;
  fix the `$73C4` comment to "attract-mode HIGH SCORE table draw"
  (no rotate/hyperspace input — that lives in `$6D90`).
  *Defer to I-12g — not blocking I-12a.*
- **`docs/progress.md`**: add a one-line pointer to this new doc
  under "Implementation steps" → I-12. Do NOT mark I-12 done.

## 11. Open questions (resolve as encountered during I-12b-e)

- **Char index 5-30 dispatch arithmetic.** `$7853`'s `ADC #$0D` is
  `$0E` because of the `BCC` falling-through with `C=1` after the
  `CMP #$0A`. The +$0E gap accounts for the `$56DC-$56E8` "digits
  3-9" entries that the packed-message format doesn't use. Verify
  the existing `vector_rom_data.js` `VROM.Char_X` entries cover
  every letter A-Z without gaps. (Spot-check at I-12b time.)
- **Where the SW1START / SW2START hardware reads land in
  `state.input`.** I-12d will wire keys `1` / `2`. Confirm
  `$2403` / `$2404` polled-switch semantics (BMI on bit 7 read).
- **`$702D` slot-clear body.** Called from `$69AB` to wipe the ship
  slot when transitioning between players. Currently not ported.
  I-12e dependency.
- **`$6EFA` sound-off.** Called from `$69D5` cold-attract. Currently
  a stub. R-G dependency; I-12e calls it but body stays empty.
- **Bonus-life interaction with `$80` marker.** When `Ship.kill`
  decrements curShips to 0, then later the score earns a 10k bonus
  (`$73A4-$73AE` bonus-ship grant) BEFORE the `$80` frame fires,
  curShips bumps back to 1. Source's `$6970-$6972` `LDA $57,X; BNE
  $6992` then skips the GAME OVER emit. Verify the JS port handles
  this race correctly (the bonus-add happens in collisions; $6960
  runs at top-of-frame in the next frame; should be a non-issue).
