# Phoenix Splash Screen + Attract Mode

Source-of-truth: a local clone of the computerarcheology.com Phoenix
project (8085 disassembly produced from the original ROM).

- **Disassembly** — `Code.md`
- **RAM map** — `RAMUse.md`
- **Hardware** — `Hardware.md` (IN0 bit layout)

These files live in the local ComputerArcheology Phoenix clone — see
`../CLAUDE.md` for the per-PC path.

Every claim is tagged **[verified]** with an address citation,
**[inferred]** when reasoning beyond what the listing makes explicit,
or **[uncertain]** when the source itself is ambiguous.

This doc covers the attract-mode entry point (`L002D`), the splash
sequence inside `SplashAndDemo $00E3`, the attract-mode gameplay loop
(`GameDemo $03B0`), the scripted input injector
(`GetPlayerInputsForDemo $0173`), and the coin-up path back to game
mode (`CoinChecking $17E0` → `PromptForStartGame $0288`).

For top-level context — the main loop and `GameOrAttract` flag — read
`research_code_flow.md §1-§2` first.

---

## 1. Overview diagram

```
   power-on / game-over
        │
        ▼
   GameOrAttract := 0  ($43A2)
   Counter98 := 0       ($4398:$4399, 16-bit)
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Main loop ($001A) — top of every frame                    │
   │    1. WaitVBlankCoin ($0080) — increments Counter98+1 (LSB)│
   │    2. Read GameOrAttract                                   │
   │       == 0 → attract path (L002D)                          │
   │       != 0 → GameStateMachine + UpdateScoresAndSound       │
   └────────────────────────────────────────────────────────────┘
                       │
       attract path:   ▼
   ┌────────────────────────────────────────────────────────────┐
   │  L002D — mute sound, then CoinChecking ($17E0)             │
   │     credits == 0 → SplashAndDemo ($00E3)                   │
   │     credits  > 0 → PromptForStartGame ($0288) — wait start │
   └────────────────────────────────────────────────────────────┘
                       │
   SplashAndDemo:      ▼  ticks Counter98 once per frame, then
                          dispatches based on Counter98 thresholds.
```

### Splash → attract timeline (Counter98 thresholds)

| Counter98 | Routine | Phase |
|-----------|---------|-------|
| `$0001` | `PrintCopyright $01E1` | one-shot — clear screen + 3 copyright rows |
| `$0002`..`$011F` | `SlowPrintScoreAverageTable $0196` | type out the score table one char/frame |
| `$0120` | `DrawScoreAverageTableTiles $0BCA` | one-shot — paint sprite icons next to the numbers |
| `$01B0` | `PrintCopyright $01E1` | one-shot — re-paint copyright rows |
| `$01B8` | `InitGlobalLevelData $0580` | one-shot — prep stage data for the demo |
| `$01C0`..`$049F` | `SlowPrintScrollRegisterUpdate $0078` | scroll BG + paint background tiles |
| `$0300`..`$06AF` | `DrawIntroBirdAnimationFrame $21DC` | animated Phoenix bird in the center |
| `$03E6`+ | `GameDemo $03B0` | **attract-mode gameplay** (real game with scripted input) |
| `$1510`+ | (demo end — see §4) | |

[verified — `Code.md:$00E3-$013A`]

At 60 Hz, the demo starts **998 frames ≈ 16.6 seconds** after splash entry.

---

## 2. Counter98 — the splash-mode tick

16-bit free-running counter at `$4398` (MSB) / `$4399` (LSB), incremented
each frame inside `SplashAndDemo $00E3`:

```
00E3: 21 99 43        LD   HL,$4399     ; Counter98+1 (LSB)
00E6: CD 00 02        CALL $0200        ; AddOneToMem (advances 16-bit value)
```

[verified — `Code.md:$00E3-$00E6`]

### Reset sites

**Power-on:** RAM is zeroed by `ClearRAMBank $006B` at boot; Counter98
starts at `$0000`. [verified — `Code.md:$0050-$006A`]

**Game over** (both players' lives = 0): `L0B60` at `CounterA5 == $80`
zeros Counter98 explicitly:

```
0B7F: AF              XOR  A
0B80: 2E 98           LD   L,$98        ; Counter98 MSB
0B82: 77              LD   (HL),A       ; := 0
0B83: 2C              INC  L            ; Counter98+1 LSB
0B84: 77              LD   (HL),A       ; := 0
```

(Note: the port currently bypasses this path — `state5_GameOver` does
a direct `player1Lives = 3` reset since the attract loop isn't wired.
Wiring step 14 removes that deviation; see `progress.md` step 13 row.)

[verified — `Code.md:$0B7F-$0B84`]

**Coin-up:** `PromptForStartGame $0288` does **NOT** reset Counter98.
The counter continues from wherever it was when the coin came in. The
next call to `GameStateMachine` ignores it (state 0 → 1 → 2 → 3 runs
its own timing via `CounterA5`).

[verified — `Code.md:$0288-$02C7`]

---

## 3. Splash timeline — per phase

### 3.1 `PrintCopyright $01E1`

```
01E1: CD 40 01        CALL $0140        ; ClearForeAndBackground
01E4: 21 60 19        LD   HL,$1960     ; T1960 text table
01E7: 0E 03           LD   C,$03        ; 3 rows
01E9: C3 D0 01        JP   $01D0        ; PrintTextLines (tail call)
```

[verified — `Code.md:$01E1-$01E9`]

Three rows at `T1960` / `T1980` / `T19A0`. Format is the standard
PrintTextLines record (2-byte addr + 4-byte padding + 26 chars) the
port already understands via `tools/build_data.py`.

Decoded text content (using the existing port's char map: 00=space,
01-1A=A-Z, 20-29=digits 0-9, 2A=`.`, 7E=copyright-symbol `©`):

- **T1960** → `43 3C` (FG-plane dest `$433C` → display row 28, full width):
  `10 08 0F 05 0E 09 18 7E 00 03 0F 10 19 12 09 07 08 14 00 21 29 28 20 00 00 00`
  → "PHOENIX © COPYRIGHT 1980   " [verified — `Code.md:$1960`]
- **T1980** → `43 3D` (FG dest `$433D` → display row 29): "  AMSTAR ELECTRONICS CORP " [verified]
- **T19A0** → `43 3E` (FG dest `$433E` → display row 30): "  PHOENIX AZ. U.S.A.       " [verified]

All three rows land in the FG plane at the bottom of the display
(rows 28-30, y = 224 / 232 / 240). 26 tiles wide — full screen width.
Existing `tools/build_data.py` `parse_text_table` decodes these
correctly without modification (same FG-plane format as T1800 / T1A00).

(Exact rendering depends on the `7E` glyph in the FG tile-ROM —
displayed as a © symbol in the arcade. Verify by visual inspection
at port time.)

### 3.2 `SlowPrintScoreAverageTable $0196`

Routine:

```
0196: 7E              LD   A,(HL)       ; A := Counter98+1 (LSB)
0197: E6 1F           AND  $1F          ; mask low 5 bits → 0..31 (char position in row)
0199: FE 06           CP   $06
019B: D8              RET  C            ; bail if char position < 6 (skip first 6 cols)
019C: 5F              LD   E,A          ; E := char position
019D: 7E              LD   A,(HL)
019E: E6 E0           AND  $E0          ; high 3 bits → 0/32/64/.../224 (row offset)
01A0: 4F              LD   C,A          ; C := row offset
01A1: 2D              DEC  L            ; → $4398 (Counter98 MSB)
01A2: 46              LD   B,(HL)       ; B := Counter98 MSB
01A3: 2E A8           LD   L,$A8        ; $43A8 = scratch
01A5: 70              LD   (HL),B
01A6: 2C              INC  L
01A7: 71              LD   (HL),C       ; build 16-bit row pointer at $43A8:$43A9
01A8: 01 60 18        LD   BC,$1860     ; T1860 base
01AB: CD 06 02        CALL $0206        ; AddBCtoMem (pointer += $1860)
01AE-01B1:                              ; deref → load row header (screen addr)
01B2-01CA:                              ; write char at (HL+char_position) to screen
```

[verified — `Code.md:$0196-$01CA`]

**Behavior**: each frame within the Counter98 range `$0002..$011F`,
print **one** character. The row is selected by Counter98 bits 5-7
(`0`, `$20`, `$40`, …); the column within the row is selected by
Counter98 bits 0-4 (skips the first 6 columns — those are the static
"left padding" of the row format). Result: the score-average table
prints letter-by-letter, row by row, over ~285 frames (~4.8s).

**T1860** is the base of the score-average rows (multiple 32-byte
records — at least up to Counter98 range `$0120` worth = ~7 rows × 32
bytes = the "100 PTS / 50 PTS / 30 PTS / 20 PTS / ..." columns of
the score table). Exact row count: count records starting at `$1860`
up to where the data ends. **[needs T1860 byte dump at port time —
build_data.py extension trivial.]**

### 3.3 `DrawScoreAverageTableTiles $0BCA`

```
0BCA: 21 D0 42        LD   HL,$42D0     ; screen-RAM dest for left half of alien #3
0BCD: 01 DF FF        LD   BC,$FFDF     ; addr stride
0BD0: 36 64           LD   (HL),$64     ; tile $64 (alien #3 left)
0BD2: 09              ADD  HL,BC
0BD3: 23              INC  HL
0BD4: 36 65           LD   (HL),$65     ; tile $65 (alien #3 right)
0BD6: 21 F2 42        LD   HL,$42F2
0BD9: 11 40 0A        LD   DE,$0A40     ; T0A40 — 4×2 sprite block
0BDC: CD 38 35        CALL $3538        ; Draw4x2
0BDF: 21 15 4B        LD   HL,$4B15
0BE2: 11 00 3C        LD   DE,$3C00     ; T3C00 — 6×2 bird sprite
0BE5: CD 28 35        CALL $3528        ; Draw6x2
0BE8: 21 D8 4A        LD   HL,$4AD8
0BEB: 11 48 0A        LD   DE,$0A48     ; T0A48 — 2×2 alien pilot
0BEE: CD 48 35        CALL $3548        ; Draw2x2
0BF1: C9              RET
```

[verified — `Code.md:$0BCA-$0BF1`]

One-shot at Counter98 == `$0120`. Paints 4 enemy sprites into FG
screen-RAM at fixed positions (next to the already-printed text rows):

1. Alien #3 (a 2-tile horizontal pair at `$42D0`/`$42D1` — small alien)
2. 4×2 sprite block from `T0A40` at `$42F2` (medium-size alien — alien #37/#34 grouping)
3. 6×2 bird from `T3C00` at `$4B15`
4. 2×2 alien pilot from `T0A48` at `$4AD8`

Tile data sources `T0A40`, `T0A48`, `T3C00` are existing source tables;
the port can extract them via `tools/build_data.py` extension. The
`$42xx` and `$4Bxx` screen-RAM destinations decode to specific canvas
positions via the existing `display_col = 25 - source_col` mapping
(`research_rendering.md §4.3`).

### 3.4 `DrawIntroBirdAnimationFrame $21DC`

```
21DC: 7E              LD   A,(HL)       ; A := Counter98+1 (LSB)
21DE: 47              LD   B,A          ; save it
21DF: 21 73 4B        LD   HL,$4B73     ; scratch slot 3 (bird draw struct)
21E2: E6 07           AND  $07          ; low 3 bits → 0..7 (sub-frame index)
21E4: 77              LD   (HL),A       ; store at $4B73
21E5: 2D              DEC  L            ; → $4B72
21E6: 36 EF           LD   (HL),$EF     ; screen-RAM LSB
21E8: 2D              DEC  L            ; → $4B71
21E9: 36 49           LD   (HL),$49     ; screen-RAM MSB ($49EF = center)
21EB: 2D              DEC  L            ; → $4B70
21EC: 78              LD   A,B          ; restore Counter98 LSB
21ED: E6 F8           AND  $F8          ; high 5 bits
21EF-21F1:            RRCA × 3          ; >> 3 (divide by 8)
21F2: C6 3A           ADD  $3A          ; + $3A (T233A base offset)
21F4: 5F              LD   E,A
21F5: 16 23           LD   D,$23
21F7: 1A              LD   A,(DE)       ; A := frame-index from T233A
21F8: 77              LD   (HL),A       ; → $4B70 (bird shape)
21F9: CD C0 34        CALL $34C0        ; DrawBirdObject
21FC: C3 E0 1E        JP   $1EE0
```

[verified — `Code.md:$21DC-$21FC`]

**Two superimposed cadences** drive the bird:

- **$4B73 = Counter98 LSB & 0x07** — updates every frame (sub-frame
  cycle 0..7). Used by `DrawBirdObject $34C0` for the bird's
  per-frame wing-flap variant.
- **$4B70 = T233A[(Counter98 LSB >> 3) + 0]** — advances every 8
  frames. Walks the bird through 16 distinct sprite frames over 128
  Counter98 LSB values (the full attract range is Counter98
  `$0300..$06AF` ≈ 1968 frames, so the cycle repeats ~15×).

Fixed screen position: `$49EF` (MSB=$49, LSB=$EF). Decoding to display
coords via the standard mapping. **[verify position at port time —
likely center-upper area of the screen.]**

**T233A** is the bird-frame-index table. Length: 32 bytes (since the
input range is `0..31` after `>> 3`). **[verify at port time, dump
T233A bytes.]**

### 3.5 `SlowPrintScrollRegisterUpdate $0078`

```
0078: CD 96 01        CALL $0196        ; SlowPrintScoreAverageTable (continue printing)
007B: C3 F0 06        JP   $06F0        ; L06F0 — update scroll register + fill BG
```

[verified — `Code.md:$0078-$007B`]

Two-in-one: continues the score-table print (calling `$0196` again),
**plus** drives the BG starfield scroll via `L06F0`. This phase
(Counter98 `$01C0..$049F` ≈ 736 frames ≈ 12.3s) is what makes the
starfield scroll into the splash while finishing the score-table
print.

---

## 4. `GameDemo $03B0` — attract-mode gameplay

```
03B0: 01 A0 07        LD   BC,$07A0     ; threshold 1
03B3: CD 70 02        CALL $0270        ; SubtractFromMemory (Counter98 - $07A0)
03B6: DA CE 03        JP   C,$03CE      ; if Counter98 < $07A0 → drive demo
03B9: CD 58 02        CALL $0258        ; CompareBCtoMem
03BC: CA EB 03        JP   Z,$03EB      ; at exactly $07A0 → demo level swap
03BF: 01 60 0B        LD   BC,$0B60     ; threshold 2
03C2: CD 70 02        CALL $0270
03C5: DA CE 03        JP   C,$03CE      ; if Counter98 < $0B60 → drive demo
03C8: CD 58 02        CALL $0258
03CB: CA E2 03        JP   Z,$03E2      ; at exactly $0B60 → demo level swap

L03CE:                                  ; drive one demo frame
03CE: CD 73 01        CALL $0173        ; GetPlayerInputsForDemo → B
03D1: 21 A0 43        LD   HL,$43A0     ; IN0Current
03D4: 7E              LD   A,(HL)       ; A := real IN0
03D5: E6 01           AND  $01          ; keep only coin bit (bit 0)
03D7: B0              OR   B            ; OR with scripted demo input
03D8: 77              LD   (HL),A       ; write back
03D9: C3 00 04        JP   $0400        ; GameStateMachine (tail call)
```

[verified — `Code.md:$03B0-$03D9`]

**Three things this routine does each frame:**

1. **Threshold-based demo level swaps** at Counter98 `$07A0` and
   `$0B60` (jumps to `L03EB` / `L03E2` — the level-transition paths).
   Otherwise drives one demo frame.
2. **Input injection**: calls `GetPlayerInputsForDemo`, then OR-merges
   the scripted byte into `IN0Current` while preserving the real
   coin bit. This is the key mechanism — the demo plays the **real**
   game using scripted input, not a separate code path.
3. **Tail-calls `GameStateMachine $0400`** — same entry as the
   non-attract path (`Code.md:$0024`).

### Exit conditions

- **Coin inserted**: handled at the main-loop level. Each frame `$001A`
  reads `GameOrAttract`, and `WaitVBlankCoin` debounces the coin into
  `CoinCount`. When `PromptForStartGame` runs and sets `GameOrAttract
  := 1`, the next iteration takes the game-mode branch and `GameDemo`
  stops being called.
- **Counter98 `$1510`**: per the comment at `Code.md:$0280` ("Counter
  value goes from $03E6 to $1510 during the demo"). What happens at
  `$1510` — does the loop wrap, does the demo exit, does Counter98
  continue past it? **[uncertain — verify by reading `L03E2` / `L03EB`
  and the wrap path at port time. Likely: at $1510 Counter98 wraps or
  the demo finishes naturally via lives loss.]**

---

## 5. `GetPlayerInputsForDemo $0173` — input table

```
0173: 7E              LD   A,(HL)       ; A := Counter98+1 (LSB)
0174: E6 7F           AND  $7F          ; mask low 7 bits (range 0..127)
0176: 06 CE           LD   B,$CE
0178: FE 1F           CP   $1F          ; vs 31
017A: D8              RET  C            ; A < 31 → B = $CE (right + fire held)
017B: 06 FE           LD   B,$FE
017D: C8              RET  Z            ; A == 31 → B = $FE (release all → fire edge)
017E: 06 AE           LD   B,$AE
0180: FE 5F           CP   $5F          ; vs 95
0182: D8              RET  C            ; A < 95 → B = $AE (left + fire held)
0183: 06 FE           LD   B,$FE
0185: C8              RET  Z            ; A == 95 → B = $FE
0186: 06 CE           LD   B,$CE
0188: FE 7F           CP   $7F          ; vs 127
018A: D8              RET  C            ; A < 127 → B = $CE
018B: 06 FE           LD   B,$FE
018D: 2D              DEC  L            ; → Counter98 MSB
018E: 7E              LD   A,(HL)
018F: FE 09           CP   $09
0191: C0              RET  NZ           ; MSB != 9 → B = $FE
0192: 06 7E           LD   B,$7E        ; MSB == 9 → B = $7E (shield)
0194: C9              RET
```

[verified — `Code.md:$0173-$0194`]

### IN0 bit mapping (active-low — bit clear = button pressed)

Authoritative source: `Hardware.md` (the `$7000` description) and
`Code.md:$0937` (the fire-bit constant in `PlayerUpdate`).

| Bit | Button | Demo-byte bit value |
|-----|--------|---------------------|
| 0 | Coin | (masked + OR'd from real IN0 by `GameDemo`) |
| 1 | 1P-Start | always set in demo bytes (not pressed) |
| 2 | 2P-Start | always set in demo bytes (not pressed) |
| 3 | — | always set (unused) |
| 4 | Fire | toggles to drive edge-detected fire |
| 5 | Right | direction |
| 6 | Left | direction |
| 7 | Shield | shield |

### Decoded demo byte table

| Byte | Binary | Bits clear (= pressed) | Effect |
|------|--------|------------------------|--------|
| `$CE` | `1100_1110` | 0, 4, 5 | Coin (overridden), Fire, **Right** held |
| `$FE` | `1111_1110` | 0 | Coin (overridden) only — **all buttons released** |
| `$AE` | `1010_1110` | 0, 4, 6 | Coin (overridden), Fire, **Left** held |
| `$7E` | `0111_1110` | 0, 7 | Coin (overridden), **Shield** held |

**The disassembly comment "1111_1110 = push fire" at `$017B` /
`$0183` / `$018B` is wrong.** `$FE` actually releases all buttons.
The auto-fire effect works because `playerUpdate` reads fire on edge
(release → press transition — `Code.md:$0931 fireEdge` style logic
in the port). By releasing for one frame at LSB 31/95/127, the next
frame's $CE/$AE byte re-asserts fire as a fresh press, triggering a
new bullet. Net cadence: a shot every ~31 frames (≈ 0.5 s) during
the move-right phase, again during move-left.

### Timeline (per Counter98 LSB cycle, 128 frames ≈ 2.1 s)

| Counter98 LSB | Behaviour |
|----------------|-----------|
| 0 .. 30   | Right + Fire held |
| 31        | All released (1 frame — fire edge primes next shot) |
| 32 .. 94  | Left + Fire held |
| 95        | All released |
| 96 .. 126 | Right + Fire held |
| 127       | All released |

This pattern repeats every 128 LSB frames. **Special override**: when
Counter98 MSB == `$09` (i.e. Counter98 in `$0900..$09FF`, 256 frames
≈ 4.3 s), the routine always returns `$7E` regardless of LSB — the
demo's shield button is held for that whole window. [verified —
`Code.md:$018D-$0192`]

---

## 6. Coin path — `CoinChecking` + `PromptForStartGame`

### 6.1 `CoinChecking $17E0`

```
17E0: 3A 00 78        LD   A,($7800)    ; DSW0
17E3: E6 10           AND  $10          ; bit 4 = coinage mode
17E5: 3A 8F 43        LD   A,($438F)    ; CoinCount
17E8: C8              RET  Z            ; coinage bit clear → return CoinCount as-is
17E9: 0F              RRCA              ; bit set → halve count (rotate right)
17EA: E6 0F           AND  $0F          ; mask low nibble
17EC: C9              RET
```

[verified — `Code.md:$17E0-$17EC`]

Reads `CoinCount $438F` (which `WaitVBlankCoin` debounces from IN0
bit 0), optionally halves it (per DSW0 bit 4 — "1 coin for 1 credit"
vs "2 coins for 1 credit", per `Hardware.md`), returns the credit
count in A.

### 6.2 Main-loop dispatch on credit count

```
0039: CD E0 17        CALL $17E0        ; CoinChecking → A
003C: A7              AND  A            ; flags from A
003D: CA 46 00        JP   Z,$0046      ; A == 0 → continue splash (L0046)
0040: CD 88 02        CALL $0288        ; A != 0 → PromptForStartGame
0043: C3 1A 00        JP   $001A        ; back to main loop
```

[verified — `Code.md:$0039-$0043`]

### 6.3 `PromptForStartGame $0288`

```
0288: CD 40 01        CALL $0140        ; ClearForeAndBackground
028B: 21 C0 19        LD   HL,$19C0     ; T19C0 — "PUSH" + "ONLY 1PLAYER BUTTON"
028E: 0E 02           LD   C,$02
0290: CD D0 01        CALL $01D0        ; PrintTextLines (2 rows)
0293: 0E 02           LD   C,$02        ; default mask: bit 1 (1P start)
0295: CD E0 17        CALL $17E0
0298: FE 02           CP   $02
029A: DA A7 02        JP   C,$02A7      ; credits < 2 → 1P only
029D: 21 A0 1B        LD   HL,$1BA0     ; T1BA0 — "1 OR 2PLAYERS BUTTON"
02A0: 0E 01           LD   C,$01
02A2: CD D0 01        CALL $01D0        ; print 1 row
02A5: 0E 06           LD   C,$06        ; mask: bits 1+2 (1P + 2P starts)
L02A7:
02A7: 3A 00 70        LD   A,($7000)    ; IN0 raw
02AA: 2F              CPL               ; flip → active-high
02AB: A1              AND  C            ; mask start bits
02AC: C8              RET  Z            ; no start press → return (main loop re-enters)
02AD: CD CB 02        CALL $02CB        ; DecrementCoins (sets GameOrAttract := 1 or 2)
02B0: CD F0 02        CALL $02F0        ; UpdateHiScore
02B3: CD 2E 03        CALL $032E        ; ClearAndPrintScores
02B6: CD 50 03        CALL $0350        ; GetPlayerLivesFromDip (fresh lives!)
02B9: CD 40 01        CALL $0140        ; ClearForeAndBackground
02BC-02C5:                              ; toggle video bank 0/1 (2P prep)
02C7: C9              RET
```

[verified — `Code.md:$0288-$02C7`]

**Three text tables involved:**

- **T19C0** (2 rows): the "PUSH" prompt always shown.
- **T1BA0** (1 row): the "1 OR 2PLAYERS BUTTON" extra row, shown only
  when credits >= 2.

**Critical for the port:** `$02B6 CALL $0350 GetPlayerLivesFromDip`
runs here, which is the **proper** lives-init path. Once step 14
lands, the step-13 deviation that hard-resets `player1Lives = 3` in
`state5_GameOver` becomes unnecessary — game-over → attract →
coin-up → PromptForStartGame → GetPlayerLivesFromDip handles the
lives reset faithfully.

### 6.4 No one-frame race

The main loop reads `GameOrAttract` at the **top of every frame**.
`PromptForStartGame` mutates `GameOrAttract` partway through a frame
via `DecrementCoins`, then returns to `$001A` (top of loop). The
next iteration sees the new value and immediately takes the
game-mode branch. No splash frame is "skipped"; the transition is
clean. [verified — `Code.md:$001D-$0043`, control-flow analysis]

---

## 7. Port mapping — landed (step 14 ✅)

The forward-looking plan in earlier drafts used `attract.*` helpers;
the actual port consolidates the work into a single `states_intro.js`
mixin (`introFrame` plus private helpers) — same shape source uses
(no separate `attract` module).

| Source                              | Port location (landed)                                            |
|-------------------------------------|-------------------------------------------------------------------|
| `GameOrAttract $43A2` default       | `state.gameOrIntro = 0` (renamed from `gameOrAttract` in 14.A)    |
| `L001D` dispatch                    | `main.tick()` — branch on `state.gameOrIntro`                     |
| Counter98 tick + 16-bit field       | `state.counter98` (16-bit), ticked at top of `introFrame`         |
| `L002D` attract entry               | `introMixin.introFrame()`                                         |
| `SplashAndDemo $00E3`               | inside `introFrame` — threshold dispatch on `state.counter98`     |
| `PrintCopyright $01E1`              | `_printCopyright()` (also clears `scoreTableRows`/`scoreIconSprites`, mirroring `$0140`) |
| `T1960`                             | `COPYRIGHT_TEXT` export from `tools/build_data.py`                |
| `SlowPrintScoreAverageTable $0196`  | `_slowPrintScoreTable(counter98)` — sub-frame state machine       |
| `T1860`                             | `SCORE_TABLE_ROWS` export                                         |
| `DrawScoreAverageTableTiles $0BCA`  | `_drawScoreIcons()` — 5 sprite groups into `state.scoreIconSprites` (mixed FG/BG planes) |
| `T0A40` / `T0A48` / `T3C00`         | `SCORE_ICON_T0A40` / `SCORE_ICON_T0A48` / `SCORE_ICON_T3C00`      |
| `$0078 SlowPrintScrollRegisterUpdate` | reuses step-3 `bgUpdate()` from `$01C0..$049F`                  |
| `DrawIntroBirdAnimationFrame $21DC` | `_drawIntroBird(counter98)` writing `state.introBird`; render via `render.drawIntroBird()` (layered between BG and FG so it sits behind score text) |
| `T233A`                             | `INTRO_BIRD_FRAMES` (32-byte extract: 23 documented + 9 code-byte tail; render bounds-check drops the invalid ones, producing the source-faithful "blink") |
| `DrawBirdObject $34C0`              | `render.drawIntroBird` — reuses `BIRD_T3EC0` / `BIRD_T3E08` / `BIRD_TILE_DATA` from step 11.3; skips `counterB9` scroll offset and the screen-RAM top-clip (fixed canvas position $49EF → (80, 120)) |
| Splash-loop wrap ($1510)            | `_loopBackToSplashStart()` — zeros Counter98, clears `bgTiles` + `scoreIconSprites` + `introBird`. Placeholder shortcut at $06B0 (bird-end + 1) for step 14; $1510 takes over when step 15 lands `GameDemo` |
| `CoinChecking $17E0` / `WaitVBlankCoin` tail ($008E-$00AB) | coin-edge handler in `main.js:tick()` — runs every frame in ALL states (matches source's pre-`GameOrAttract`-branch position), increments `state.coinCount` (cap 99, port deviation from source's $09). Coins inserted during gameplay bank credits used at the next prompt entry. |
| `PromptForStartGame $0288`          | `_promptForStartGame()` (start-edge handler only — coins handled in `main.js`) + `_enterPromptMode()` fires once when `introFrame` first observes `coinCount > 0` (tracked via `state.promptModeActive`; clears splash state) |
| `T19C0`                             | `PROMPT_TEXT` export                                              |
| `GetPlayerLivesFromDip $0350`       | hard-coded `state.player1Lives = 3` on start press; DIP modelling still deferred |
| `DecrementCoins $02CB`              | inline in `_promptForStartGame` start-edge branch                 |

Visible side-effects now live:

- Cold-start opens in intro mode, not gameplay.
- `state5_GameOver` at counterA5 == $80 sets `gameOrIntro = 0` + zeros
  Counter98 via `_enterIntroMode` (the `player1Lives = 3` direct write
  was removed in 14.I; 14.H's coin-up path is the lives-init source).
- Coin (Digit 5) and Start (Digit 1) are functionally meaningful.

---

## 8. Open questions / port-time follow-ups

Resolved during step 14 (left here as a trail for diff readers):

- ~~T1860 row count + total size~~: 8 rows × 32 bytes = $1860..$195F.
- ~~T233A length + content~~: 32-byte extract; first 23 bytes are
  documented bird-shape values, trailing 9 bytes are code at
  `$2351-$2359` that land as invalid shape indices for high LSBs
  (`render.drawIntroBird` bounds-check skips those → bird "blinks").
- ~~`$06F0` reuse from intro path~~: works as-is; intro `bgUpdate`
  dispatch in counter98 `$01C0..$049F` calls it without state-3 guards.
- ~~Sprite tile data for `T0A40`, `T0A48`, `T3C00`~~: extracted as
  `SCORE_ICON_T0A40` / `_T0A48` / `_T3C00` (column-major arrays).

Still open (step 15 territory or beyond):

- **`L03E2` / `L03EB` (demo level swaps)**: what specifically do they
  change (LevelAndRound, gameState reset)? Read at port time —
  matters only for matching exact demo behaviour, not for any
  visible attract feature.
- **Counter98 `$1510` upper limit**: confirm the wrap / demo-end path.
  Port currently uses a `$06B0` placeholder shortcut (bird-end + 1)
  to wrap the cycle while GameDemo is unported; step 15 removes that
  line and `$1510` becomes the active trigger.
- **`DSW0 $7800` modelling**: source reads it for coinage (`$17E3`)
  and bonus-life threshold (`$0163`). Port has no DIP model. Step 14
  defaulted to "1 coin = 1 credit" (DSW0 bit 4 clear) and lives = 3.
  A real DIP modelling layer is a separate concern; would touch
  `$0350 GetPlayerLivesFromDip` so the hard-coded `player1Lives = 3`
  in `_promptForStartGame` can be removed.
