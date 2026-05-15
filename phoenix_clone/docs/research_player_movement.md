# Phoenix Player Movement — Research

Traces the player ship from input polling through position update, animation,
bullet firing, and screen-address calculation. Every claim is verified against
`Code.md` (the 8085 Computer Archeology listing).

**Cross-references:**
- `Code.md` (primary source)
- `research_code_flow.md §2` — main loop context
- `research_coordinate_system.md §3–4` — grid ↔ screen RAM math
- `RAMUse.md` — full RAM label reference

---

## 1. Data Structures

### 1.1 Player Grid Data (`$43C0–$43CB`)

Each entity occupies 4 bytes: `[State, Shape, X, Y]`.

```
Address | RAM label              | Init  | Purpose
--------|------------------------|-------|---------------------------------------------
$43C0   | PlayerState            | $0C   | Control bits: bit3=draw, bit4=erase
$43C1   | PlayerShape            | $10   | Tile shape index (updated per frame from T1600)
$43C2   | PlayerShipX            | $64   | X position; valid range $0D–$BF
$43C3   | PlayerShipY            | $D8   | Y position; constant (never changes in gameplay)
$43C4   | PlayerBulletState      | $00   | Bullet control bits
$43C5   | PlayerBulletShape      | $50   | Bullet tile index (from T1620)
$43C6   | PlayerBulletX          | $00   | Bullet X coordinate
$43C7   | PlayerBulletY          | $D0   | Bullet Y coordinate
$43C8   | AbovePlayerBulletState | $00   | Second bullet (level 3 / round 3 only)
$43C9   | AbovePlayerBulletShape | $50   |
$43CA   | AbovePlayerBulletX     | $00   |
$43CB   | AbovePlayerBulletY     | $D0   |
```

[verified, Code.md:$0560–$057F `InitPlayerDataStructure`]

`PlayerShipY = $D8` (216) is hardcoded; Phoenix is a fixed-row shooter.
The player never changes row.

### 1.2 Screen-Address Data (`$43E0–$43EB`)

`L09A0` converts grid coordinates to screen RAM addresses and writes them
to `$43E2/$43E3`, `$43E6/$43E7`, `$43EA/$43EB`. `L0886` shifts each
current pair into the "old" slot (2 bytes lower) every frame, so the
previous frame's addresses are available for tile erasure.

```
Address       | RAM label              | Written by  | Purpose
$43E0:$43E1   | OldPlayerShipMSB/LSB   | L0886       | screen RAM addr from last frame → used to erase
$43E2:$43E3   | PlayerShipMSB/LSB      | L09A0       | screen RAM addr for current frame
$43E4:$43E5   | OldPlayerBulletMSB/LSB | L0886       |
$43E6:$43E7   | PlayerBulletMSB/LSB    | L09A0       |
$43E8:$43E9   | OldAboveBulletMSB/LSB  | L0886       |
$43EA:$43EB   | AboveBulletMSB/LSB     | L09A0       |
```

[verified, Code.md:$0886 L0886; $09A0 L09A0 header comment]

### 1.3 Auxiliary Player RAM

```
$43A0 | IN0Current   — raw active-low input byte, refreshed each VBLANK
$43A1 | IN0Previous  — previous frame's IN0Current (for edge detection)
$4360 | PlayerMoved  — set $FF whenever X changes, cleared elsewhere
$4361 | BulletTriggered — set $30 when fire button pressed
$4362 | M4362        — bit6 set on shield activation
$43A6 | ShieldCount  — countdown from $FF; 0 = shield inactive
```

[verified, Code.md:$0913 PlayerMoved write; $095E BulletTriggered write; $08DC M4362 write]

---

## 2. Input Polling and Edge Detection

### 2.1 `WaitVBlankCoin` ($0080) — Frame Sync + Input Read

Called once per frame at the start of `GameStateMachine` (`$001A`):

```asm
WaitVBlankCoin:
0080: 26 78    LD  H,$78       ; point to DSW0 ($78xx)
0082: 7E       LD  A,(HL)
0083: E6 80    AND $80         ; bit7 = blanking flag
0085: CA 80 00 JP  Z,$0080     ; loop until blanking starts
L0088:
0088: 7E       LD  A,(HL)
0089: E6 80    AND $80
008B: C2 88 00 JP  NZ,$0088    ; loop until blanking ends (0 = in blanking)
008E: 26 70    LD  H,$70       ; point to IN0 ($70xx)
0090: 7E       LD  A,(HL)      ; read active-low button byte
0091: 21 A0 43 LD  HL,$43A0    ; IN0Current
0094: 46       LD  B,(HL)      ; save previous value
0095: 77       LD  (HL),A      ; store new IN0Current
0096: 2C       INC L
0097: 70       LD  (HL),B      ; store old value in IN0Previous ($43A1)
; ... coin handling follows ...
```

[verified, Code.md:$0080–$00B5]

**Active-low:** a button press makes the bit 0, not 1.
The double-blanking wait (start then end) synchronizes the loop to exactly
one display frame.

### 2.2 `CheckInputBits` ($00BB) — 1→0 Transition Detect

```asm
CheckInputBits:
00BB: 21 A0 43 LD  HL,$43A0    ; IN0Current
00BE: 7E       LD  A,(HL)
00BF: 2F       CPL             ; flip to active-high
00C0: A0       AND B           ; isolate bits of interest (caller sets B)
00C1: 2C       INC L           ; point to IN0Previous
00C2: A6       AND (HL)        ; keep only bits that were 1 last frame and 0 now
00C3: C9       RET             ; NZ = button was just pressed
```

[verified, Code.md:$00BB–$00C3]

Returns NZ only on the first frame a button is pressed (rising edge in
active-high terms). Movement buttons are NOT checked via this routine —
they use a direct level test instead (see §3.3).

---

## 3. Per-Frame Player Update

### 3.1 `PlayerUpdate` ($0876) — Full Call Chain

```asm
PlayerUpdate:
0876: CD 00 07 CALL $0700      ; PlayerDataController  — erase old tiles, set up draw bits
0879: CD 86 08 CALL $0886      ; L0886                 — copy current screen addrs to "old" slots
087C: CD A0 08 CALL $08A0      ; L08A0                 — move player, fire bullet, shield
087F: CD A0 09 CALL $09A0      ; L09A0                 — compute new screen RAM addresses
0882: CD 7A 09 CALL $097A      ; L097A                 — compute left/right tile column split
0885: C9       RET
```

[verified, Code.md:$0876–$0885]

Order matters:
1. Erase at **old** addresses (from previous frame)
2. Promote current → old before we overwrite current
3. Move (changes X)
4. Compute new addresses from updated X
5. Map X to left/right tile columns for drawing

### 3.2 `PlayerDataController` ($0700) — Erase and Draw Dispatch

Walks 3 objects (player, bullet, above-bullet) by stepping BC through the
grid array 4 bytes at a time and DE via the same offset + $20:

```asm
PlayerDataController:
0700: 01 C0 43 LD  BC,$43C0    ; start at PlayerState
0703: 11 E0 43 LD  DE,$43E0    ; start at OldPlayerShipMSB
L0706:
0706: CD 18 07 CALL $0718      ; UpdateScreenObjects (erase and/or draw based on control bits)
0709: 79       LD  A,C
070A: C6 04    ADD $04         ; advance BC to next object (4-byte stride)
070C: 4F       LD  C,A
070D: C6 20    ADD $20         ; DE = BC + $20 (always)
070F: 5F       LD  E,A
0710: 50       LD  D,B
0711: FE EC    CP  $EC         ; exit when the offset reaches $EC (past $43C8)
0713: C2 06 07 JP  NZ,$0706
0716: C9       RET
```

[verified, Code.md:$0700–$0716]

Processes exactly **3 objects**: PlayerState ($43C0), PlayerBulletState
($43C4), AbovePlayerBulletState ($43C8). Loop exits after $43C8.

`UpdateScreenObjects` ($0718) dispatches to `Bit4Controller` (erase if
bit4 set) then `Bit3Controller` (draw if bit3 set), using jump tables at
`T0735` / `T0759` keyed on the shape-size bits in the control byte.

### 3.3 `L0886` ($0886) — Promote Current Screen Addresses to "Old"

Walks backwards from $43EB, reading 2-byte pairs and writing them 2 bytes
lower. Net effect per pair: MSB at `addr+N` → MSB at `addr+N-2`, same for LSB.

```asm
L0886:
0886: 21 EB 43 LD  HL,$43EB    ; start at top of AboveBullet pair
0889: 06 03    LD  B,$03       ; 3 pairs to copy
L088B:
088B: 56       LD  D,(HL)      ; D = high-address byte of pair
088C: 2B       DEC HL
088D: 5E       LD  E,(HL)      ; E = low-address byte of pair
088E: 2B       DEC HL
088F: 72       LD  (HL),D      ; write D to "old" high slot
0890: 2B       DEC HL
0891: 73       LD  (HL),E      ; write E to "old" low slot
0892: 2B       DEC HL          ; ready for next pair
0893: 05       DEC B
0894: C2 8B 08 JP  NZ,$088B
0897: C9       RET
```

[verified, Code.md:$0886–$0897]

Result:
- `$43E2:$43E3` (PlayerShipMSB/LSB) → `$43E0:$43E1` (OldPlayerShipMSB/LSB)
- `$43E6:$43E7` → `$43E4:$43E5`
- `$43EA:$43EB` → `$43E8:$43E9`

### 3.4 `MovePlayer` ($08C4) — Shield + Movement Dispatch

Entry point for player logic. Also dispatches to shield drawing if player
is inactive:

```asm
MovePlayer:
08C4: 21 C0 43 LD  HL,$43C0    ; PlayerState
08C7: 7E       LD  A,(HL)
08C8: E6 08    AND $08         ; is bit3 set (draw flag)?
08CA: CA A0 0A JP  Z,$0AA0     ; no: jump to DrawShields instead
08CD: 2E A6    LD  L,$A6       ; ShieldCount ($43A6)
08CF: 7E       LD  A,(HL)
08D0: A7       AND A           ; is ShieldCount nonzero?
08D1: C2 EA 08 JP  NZ,$08EA    ; yes: skip shield button check, just decrement
08D4: 06 80    LD  B,$80       ; bit7 = shield button
08D6: CD BB 00 CALL $00BB      ; CheckInputBits — was shield just pressed?
08D9: CA EB 08 JP  Z,$08EB     ; no: skip shield activation
08DC: 2E 62    LD  L,$62       ; $4362
08DE: 36 40    LD  (HL),$40    ; set bit6 (bird-maturity / shield flag)
08E0: 2E C0    LD  L,$C0       ; PlayerState ($43C0)
08E2: 7E       LD  A,(HL)
08E3: E6 F7    AND $F7         ; clear bit3 (stop drawing player ship)
08E5: 77       LD  (HL),A
08E6: 2E A6    LD  L,$A6       ; ShieldCount
08E8: 36 FF    LD  (HL),$FF    ; activate shield (255 frames ≈ 4.25 s at 60 Hz)
L08EA:
08EA: 35       DEC (HL)        ; decrement ShieldCount every frame while active
L08EB:
08EB: 2E C2    LD  L,$C2       ; PlayerShipX ($43C2)
08ED: CD 00 09 CALL $0900      ; L0900 — update X from left/right input
08F0: 01 00 16 LD  BC,$1600    ; T1600 base
08F3: C3 26 09 JP  $0926       ; L0926 — look up animation frame
```

[verified, Code.md:$08C4–$08F3]

---

## 4. Movement: `L0900` ($0900)

```asm
L0900:
0900: 3A A0 43 LD  A,($43A0)   ; IN0Current (active-low)
0903: 2F       CPL             ; convert to active-high
0904: E6 60    AND $60         ; mask bits 5+6 (right=$20, left=$40)
0906: C8       RET Z           ; no button → no move
0907: E6 40    AND $40         ; is it left ($40)?
0909: CA 17 09 JP  Z,$0917     ; no → try right
; LEFT
090C: 7E       LD  A,(HL)      ; PlayerShipX ($43C2)
090D: FE 0D    CP  $0D         ; at left boundary?
090F: D8       RET C           ; yes → stop
0910: 35       DEC (HL)        ; move left
0911: 3E FF    LD  A,$FF
0913: 32 60 43 LD  ($4360),A   ; PlayerMoved = $FF
0916: C9       RET
L0917:
; RIGHT
0917: 7E       LD  A,(HL)      ; PlayerShipX
0918: FE C0    CP  $C0         ; at right boundary?
091A: D0       RET NC          ; yes → stop
091B: 34       INC (HL)        ; move right
091C: 3E FF    LD  A,$FF
091E: 32 60 43 LD  ($4360),A   ; PlayerMoved = $FF
0921: C9       RET
```

[verified, Code.md:$0900–$0921]

**Movement is level-sensitive, not edge-triggered.** As long as a button is
held, X changes by ±1 every frame (60 Hz). No acceleration.

**Boundaries:**
- Left: X must be ≥ $0D (13) to move further left; `RET C` stops on carry
- Right: X must be < $C0 (192) to move further right; `RET NC` stops on no-carry
- Valid range: $0D–$BF (13–191 inclusive)

---

## 5. Animation: `L0926` ($0926) + `T1600`

```asm
L0926:
0926: 7E    LD  A,(HL)     ; HL points to PlayerShipX ($43C2)
0927: E6 07 AND $07        ; lower 3 bits = X % 8
0929: 81    ADD A,C        ; BC = T1600 base ($1600)
092A: 4F    LD  C,A
092B: 0A    LD  A,(BC)     ; fetch tile index from table
092C: 2D    DEC L          ; back to PlayerShape ($43C1)
092D: 77    LD  (HL),A     ; store as PlayerShape
092E: C9    RET
```

[verified, Code.md:$0926–$092E]

### `T1600` ($1600) — Player ship frames

```
Offset | X % 8 | Tile index | Comment (from Code.md)
-------|-------|------------|-------------------------------
 +0    |   0   |   $10      | player ship frame #5
 +1    |   1   |   $14      | player ship frame #6
 +2    |   2   |   $18      | player ship frame #7
 +3    |   3   |   $1C      | player ship frame #8
 +4    |   4   |   $00      | player ship frame #1
 +5    |   5   |   $04      | player ship frame #2
 +6    |   6   |   $08      | player ship frame #3
 +7    |   7   |   $0C      | player ship frame #4
```

[verified, Code.md:$1600–$1607 T1600 listing]

The orientation cycles continuously through 8 frames as X increments.
Starting at the left boundary ($0D, which is $0D % 8 = 5), the ship
starts on frame #2 ($04).

---

## 6. Bullet Firing: `L0930` ($0930)

Called from `L08A0` for the primary bullet; called again for
`AbovePlayerBullet` on round 3 only.

```asm
L0930:
0930: 7E       LD  A,(HL)      ; BulletState ($43C4)
0931: E6 08    AND $08         ; is bit3 set (bullet already active)?
0933: C2 64 09 JP  NZ,$0964    ; yes → L0964: move bullet upward
; bullet not active: check fire button
0936: EB       EX  DE,HL       ; swap HL/DE
0937: 06 10    LD  B,$10       ; bit4 = fire button
0939: CD BB 00 CALL $00BB      ; CheckInputBits — just pressed?
093C: C8       RET Z           ; no → done
; spawn bullet at player position
093D: 7E       LD  A,(HL)      ; IN0Previous mirror
093E: E6 EF    AND $EF         ; clear bit4 (consume fire press)
0940: 77       LD  (HL),A
0941: 1A       LD  A,(DE)      ; BulletState
0942: F6 08    OR  $08         ; set bit3 (activate bullet)
0944: 12       LD  (DE),A      ; → $43C4 PlayerBulletState
0945: 13       INC DE
0946: 13       INC DE          ; DE → PlayerBulletX ($43C6)
0947: 3A C2 43 LD  A,($43C2)   ; PlayerShipX
094A: C6 04    ADD $04         ; bullet spawns 4 pixels right of player
094C: 12       LD  (DE),A      ; → PlayerBulletX
094D: 13       INC DE          ; DE → PlayerBulletY ($43C7)
094E: 3A C3 43 LD  A,($43C3)   ; PlayerShipY ($D8)
0951: D6 08    SUB $08         ; bullet starts 8 pixels above player
0953: 12       LD  (DE),A      ; → PlayerBulletY
0956: 01 20 16 LD  BC,$1620    ; T1620 base (bullet tile table)
0959: CD 26 09 CALL $0926      ; assign bullet tile index = T1620[X % 8]
095C: 3E 30    LD  A,$30
095E: 32 61 43 LD  ($4361),A   ; BulletTriggered = $30
0961: C9       RET

; Active bullet movement:
L0964:
0964: 2C 2C 2C INC L × 3      ; HL → PlayerBulletY ($43C7)
0967: 7E       LD  A,(HL)
0968: D6 08    SUB $08         ; move bullet up by 8 grid units per frame
096A: 77       LD  (HL),A
096B: FE 1F    CP  $1F         ; reached top of screen?
096D: D0       RET NC          ; no → done
; bullet hit top: deactivate
096E: 2D 2D 2D DEC L × 3      ; HL → PlayerBulletState ($43C4)
0971: 7E       LD  A,(HL)
0972: E6 F7    AND $F7         ; clear bit3
0974: 77       LD  (HL),A
0975: C9       RET
```

[verified, Code.md:$0930–$0975]

**Bullet tile** from `T1620`: `50 51 52 53 54 55 56 57` — 8 variants for
the 8 sub-pixel X positions, matching the player's pre-shifted shape.

**Bullet speed:** Y decrements by 8 per frame = 480 grid units/second
(at 60 Hz). Top boundary is $1F (31).

**Only one bullet at a time** per channel. If bit3 is set the fire button
is ignored.

---

## 7. Screen Address Computation

### 7.1 `L09A0` ($09A0) — Grid → Screen RAM for All Player Objects

```asm
L09A0:
09A0: 01 C2 43 LD  BC,$43C2    ; PlayerShipX
09A3: 11 E2 43 LD  DE,$43E2    ; PlayerShipMSB (output)
L09A6:
09A6: CD BA 09 CALL $09BA      ; GetScreenRamAddress — converts one X/Y pair
09A9–09AC:     INC BC × 3      ; skip to next X (skip Y and the 2-byte previous pair)
09AC–09AE:     INC DE × 3      ; advance output pointer
09AF: 79       LD  A,C
09B0: FE CE    CP  $CE         ; past AbovePlayerBulletX ($43CA)?
09B2: C2 A6 09 JP  NZ,$09A6    ; loop until all 3 pairs done
09B5: C9       RET
```

[verified, Code.md:$09A0–$09B5, header comment confirms 3 source pairs]

### 7.2 `GetScreenRamAddress` ($09BA) — Coordinate Math

```asm
GetScreenRamAddress:
09BA: 21 00 0A LD  HL,$0A00    ; T0A00 — screen RAM address table (row lookup)
09BD: 0A       LD  A,(BC)      ; get X coordinate
09BE: E6 F8    AND $F8         ; snap to 8-pixel grid: clear low 3 bits
09C0: 0F       RRCA            ; shift right 2 → tile-row index × 2
09C1: 0F       RRCA
09C2: 85       ADD A,L
09C3: 6F       LD  L,A
09C4: 7E       LD  A,(HL)      ; fetch MSB of screen RAM base address for that row
09C5: 12       LD  (DE),A      ; store MSB → $43E2
09C6: 03       INC BC          ; BC → Y coordinate
09C7: 13       INC DE
09C8: 23       INC HL          ; T0A00 LSB entry for this row
09C9: 0A       LD  A,(BC)      ; get Y coordinate
09CA: E6 F8    AND $F8         ; snap to 8-pixel grid
09CC–09CE:     RRCA × 3        ; shift right 3 → column offset
09CF: 86       ADD A,(HL)      ; add column offset to row LSB
09D0: 12       LD  (DE),A      ; store LSB → $43E3
09D1: C9       RET
```

[verified, Code.md:$09BA–$09D1]

For the rotated display, X maps to row and Y maps to column. The
full coordinate math is in `research_coordinate_system.md §3–4`.

### 7.3 `L097A` ($097A) — Left/Right Tile Column Split

The player sprite is 2 tiles wide. `L097A` splits the X position into
left-column and right-column tile addresses using `T0B38`:

```asm
L097A:
097A: 3A C2 43 LD  A,($43C2)   ; PlayerShipX
097D: 47       LD  B,A         ; save
097E: E6 07    AND $07         ; X % 8 → sub-pixel index
0980: 07       RLCA            ; × 2 (each entry is 2 bytes)
0981: 21 38 0B LD  HL,$0B38    ; T0B38
0984: 85       ADD A,L
0985: 6F       LD  L,A
0986: 78       LD  A,B         ; restore X
0987: 96       SUB (HL)        ; X - left_delta → left tile column
0988: 32 9E 43 LD  ($439E),A   ; M439E — left column position
098B: 23       INC HL
098C: 78       LD  A,B
098D: 86       ADD A,(HL)      ; X + right_delta → right tile column
098E: 32 9F 43 LD  ($439F),A   ; M439F — right column position
0991: C9       RET
```

[verified, Code.md:$097A–$0991]

### `T0B38` ($0B38) — Position Mapping Deltas

8 pairs `[left_delta, right_delta]` indexed by `X % 8`:

```
X % 8 | Left delta | Right delta | Left tile col  | Right tile col
-------|-----------|-------------|-----------------|----------------
  0    |     0     |      8      | X              | X + 8
  1    |     1     |      9      | X - 1          | X + 9
  2    |     2     |     10      | X - 2          | X + 10
  3    |     3     |     11      | X - 3          | X + 11
  4    |     3     |     11      | X - 3          | X + 11
  5    |     2     |     10      | X - 2          | X + 10
  6    |     1     |      9      | X - 1          | X + 9
  7    |     0     |      8      | X              | X + 8
```

[verified, Code.md:$0B38–$0B47 T0B38 listing]

The deltas are symmetric around the center (0–3, then 3–0 mirrored).
This keeps the drawn sprite centered on the grid X as it shifts through
sub-pixel positions.

---

## 8. Frame Summary — GameState 3 Gameplay

```
WaitVBlankCoin ($0080)
  ├─ busy-wait for VBLANK start and end
  └─ IN0Previous = old IN0Current; IN0Current = new hardware read

GameStateMachine → state 3 → L0800

  PlayerUpdate ($0876)
  ├─ PlayerDataController ($0700)
  │    ├─ for each of 3 objects (player, bullet, above-bullet):
  │    │    erase at OldXxx MSB/LSB if bit4 set
  │    │    set up draw if bit3 set
  ├─ L0886 ($0886)
  │    └─ copy $43E2:$43E3 → $43E0:$43E1 (and same for bullets)
  ├─ L08A0 ($08A0)
  │    ├─ MovePlayer ($08C4)
  │    │    ├─ if bit3 clear → DrawShields ($0AA0)
  │    │    ├─ if ShieldCount > 0 → decrement ShieldCount
  │    │    ├─ else check shield button (edge) → activate if pressed
  │    │    ├─ L0900 → read left/right (level) → update PlayerShipX ±1
  │    │    └─ L0926 → PlayerShape = T1600[X % 8]
  │    ├─ L0930 ($0930) for PlayerBullet
  │    │    ├─ if bit3 set → move bullet up 8 units; deactivate at $1F
  │    │    └─ else check fire button (edge) → spawn at (PlayerX+4, PlayerY-8)
  │    └─ L0930 again for AbovePlayerBullet (round 3 only)
  ├─ L09A0 ($09A0)
  │    └─ for each object: GetScreenRamAddress ($09BA) → $43E2/$43E6/$43EA
  └─ L097A ($097A)
       └─ PlayerShipX + T0B38[X%8] → $439E:$439F (left/right tile columns)

UpdateScoresAndSound ($2700)
```

---

## 9. Key Facts for Porting

| Fact | Value | Source |
|------|-------|--------|
| X range | $0D–$BF (13–191) | L0900 boundary checks |
| Y | $D8 = 216, constant | `InitPlayerDataStructure` |
| Move rate | ±1 per frame (60 Hz) | L0900, one INC/DEC |
| Shield duration | 255 frames ≈ 4.25 s | L08C4, ShieldCount=$FF |
| Bullet speed | −8 Y per frame | L0964 SUB $08 |
| Bullet top limit | $1F (31) | L0964 CP $1F |
| Animation frames | 8 (T1600[X%8]) | L0926 + T1600 |
| Bullet tiles | 8 (T1620[X%8]) | L0930 + T1620 |
| Movement input | level-checked (held = continuous) | L0900 direct AND |
| Shield/fire input | edge-checked (press only) | CheckInputBits |
| Sprite width | 2 tiles | L097A + T0B38 |

