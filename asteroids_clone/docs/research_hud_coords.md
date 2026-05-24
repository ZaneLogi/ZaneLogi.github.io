# research_hud_coords.md — HUD coordinate system

Pre-research for I-11a (HUD render) and the +128 playfield Y-offset
deferred from I-9d. Re-derives the `$7C03` byte→DVG mapping, the
`$72FE` per-slot LABS-emit's playfield-Y offset, the test-pattern
visible rectangle, and the gs/coords for every HUD callsite.

See [[research_dvg.md §4 + §6]] for the underlying scale/SVEC model
and [[research_dvg.md §10]] for the LABS bit layout this doc operates
on. See [[research_main_loop.md §3]] for the per-frame dispatch the
HUD emit sites live inside.

## §1. `$7C03` — the LABS-emit helper

Source label: none (referred to by address). Used by every CPU-built
LABS opcode site in the game. The helper takes two byte parameters
in registers (A, X), plus an out-of-band `ram.$00` byte that
contributes the LABS scale nibble. It emits **4 bytes** (one LABS
opcode = 2 DVG words) at `ram.$02:$03` (the display-list cursor) and
advances the cursor.

### §1.1. Setup phase (`$7C03-$7C18`)

```
$7C03: LDY #$00 ; STY $05 ; STY $07
$7C09: ASL A ; ROL $05 ; ASL A ; ROL $05 ; STA $04   ; ram.$04:$05 = A * 4 (16-bit)
$7C11: TXA ; ASL A ; ROL $07 ; ASL A ; ROL $07 ; STA $06  ; ram.$06:$07 = X * 4 (16-bit)
```

Both register parameters get multiplied by 4 (two left-shifts) into
16-bit working values. `A*4` lives in `$04:$05` (low:high), `X*4` in
`$06:$07`.

### §1.2. Emit phase (`$7C1A-$7C37`)

```
$7C1A: LDX #$04                ; index offset into the working bytes
$7C1C: LDA $02,X ; STA ($02),Y   ; byte 0 ← ram.$06 = (X_reg * 4) LO
$7C22: LDA $03,X ; AND #$0F ; ORA #$A0 ; STA ($02),Y(+1)  ; byte 1 ← (X_reg*4 HI & 0x0F) | $A0
$7C2B: LDA $00,X ; STA ($02),Y(+2)   ; byte 2 ← ram.$04 = (A_reg * 4) LO
$7C30: LDA $01,X ; AND #$0F ; ORA $00 ; STA ($02),Y(+3)   ; byte 3 ← (A_reg*4 HI & 0x0F) | ram.$00
```

Per [[research_dvg.md §10]], the LABS opcode is two 16-bit words
stored LSB-first: word 1 = `opcode-nibble | y_high_nibble | y_lo`,
word 2 = `scale-nibble | x_high_nibble | x_lo`. Cross-referencing the
emitted bytes:

| Display-list byte | Source                                | Maps to                |
|-------------------|----------------------------------------|------------------------|
| 0                 | `(X_reg * 4) LO`                       | Word 1 low byte (Y lo) |
| 1                 | `(X_reg * 4) HI` low nibble \| `$A0`   | Word 1 high byte (opcode `$A` + Y hi) |
| 2                 | `(A_reg * 4) LO`                       | Word 2 low byte (X lo) |
| 3                 | `(A_reg * 4) HI` low nibble \| `ram.$00` | Word 2 high byte (scale nibble + X hi) |

### §1.3. The naming clash

**The CPU register names are the OPPOSITE of the DVG coordinate they
drive.** The A register's value × 4 becomes the **DVG X** coordinate;
the X register's value × 4 becomes the **DVG Y** coordinate. The
v1 I-11 attempt assumed A→Y / X→X by analogy with the source's
`LDA #$Y / LDX #$X` mnemonic convention and had to be patched
mid-port when the HUD landed at the wrong row.

**Always cross-check both `LDA #$xx` and `LDX #$xx` against the
emitted DVG coordinate before relying on a `$7C03` call's position.**

### §1.4. The scale byte `ram.$00`

The byte at `ram.$00` is set by the caller (via `STA $00` or `STY $00`
right before the `JSR $7C03`). It gets OR'd into the **high byte of
word 2** at `$7C34`. Per [[research_dvg.md §10]], the LABS scale nibble
is the **high nibble of word 2's high byte** — so the caller stores a
value like `$E0` to set scale to `$E` (= 14) or `$10` to set scale to
`$1`. The low nibble of `ram.$00` ends up OR'd into the X coordinate's
high nibble, but it's always set to zero in practice (callers store
gs-byte values that already have a zero low nibble).

### §1.5. Cursor advance (`$7C39-$7C41`)

After emit, `ram.$02:$03` advances by 4 bytes (LABS opcode size). Next
opcode lands at the new cursor.

## §2. `$72FE` — per-slot LABS emit + playfield Y-offset

Source label: per-slot dispatcher entry. Called once per object-table
slot during the draw pass. Unlike `$7C03` (used by HUD sites with
**direct byte parameters**), `$72FE` reads the object's 16-bit
position fields and converts to DVG coordinates **with a +128 DVG-y
offset added**.

### §2.1. Position load + /8 conversion (`$7302-$731D`)

Caller arrives with the slot's 16-bit X position already in
`ram.$04:$05` (low:high) and the 16-bit Y position in `ram.$06:$07`.
Both are in source-byte units (1 game unit = 256 sub-tile units;
GAME_TO_DVG = 32 → 256 sub-tile = 8 DVG units, so we want /8).

X conversion:

```
$7302: LDA $05 ; LSR A ; ROR $04 ; LSR A ; ROR $04 ; LSR A ; ROR $04
$730D: STA $05                     ; ram.$04:$05 = X position / 8 (16-bit)
```

Y conversion **with a +$0400 add before the /8**:

```
$730F: LDA $07
$7311: CLC ; ADC #$04                ; ram.$06:$07 += $0400 (= +1024 sub-tile)
$7314: LSR A ; ROR $06 ; LSR A ; ROR $06 ; LSR A ; ROR $06
$731D: STA $07                       ; ram.$06:$07 = (Y position + $0400) / 8
```

`$0400 sub-tile / 8 = +128 DVG-y`. **Every playfield slot's DVG Y
coordinate is shifted up by 128.** This reserves the bottom 128
DVG-y units (which would otherwise contain wrap-bottom playfield
content) for the HUD.

### §2.2. Tail jump into `$7C1C` (`$731F-$7322`)

```
$731F: LDX #$04
$7321: JSR $7C1C                   ; jump into $7C03's emit phase
```

`$7C1C` is `$7C03`'s emit tail (the section after the A*4 / X*4
setup) — it just emits the 4 bytes from `ram.$04..$07` and advances
the cursor. So `$72FE` populates the working bytes manually
(skipping `$7C03`'s register-multiplication setup) then jumps in
mid-routine.

### §2.3. Port implication

HUD callsites use `$7C03` directly with byte parameters → no +128
offset. They emit at the literal DVG coordinate `(A*4, X*4)`.

Playfield slots use `$72FE` (called from the per-slot dispatcher)
with 16-bit position fields → +128 DVG-y offset added before emit.

So in the port:

- Every actor's `dvgPos()` must add `PLAYFIELD_Y_OFFSET = 128` to its
  Y component, since the port's `runList` emits at the literal DVG
  coordinate (no equivalent of `$72FE`'s preprocessing).
- HUD emit sites in `scoreLivesDraw` emit at the literal DVG
  coordinate (no offset).

## §3. Visible coordinate bounds

Source: VectorROM.md test pattern at `$1000-$1014` (called by power-on
test mode; see [[research_dvg.md §11]] for the test-pattern context).
The pattern traces a closing rectangle outline of the cabinet's
visible area:

```
$1000: LABS                              x=0      y=128
$1004: VEC scale=07(/4) bri=0 x=0    y=0       ; no-op
$1008: VEC scale=09(/1) bri=7 x=1023 y=0       ; LL → LR
$100C: VEC scale=09(/1) bri=7 x=0    y=767     ; LR → UR
$1010: VEC scale=09(/1) bri=7 x=-1023 y=0      ; UR → UL
$1014: VEC scale=09(/1) bri=7 x=0    y=-767    ; UL → LL (close)
```

Visible rectangle: **DVG X ∈ [0, 1023], DVG Y ∈ [128, 895]** (1024 px
wide, 768 px tall). Cabinet aspect ratio is 4:3 → canvas backing
store is sized 1024 × 768 to match.

### §3.1. Why the Y range starts at 128, not 0

DVG Y is "up" — DVG y=895 is the **top** of the screen, DVG y=128
is the **bottom** of the visible area. (Canvas Y is the opposite —
see §5 for the flip.)

The +128 offset from §2 aligns the playfield's natural coordinate
space with the cabinet's visible area. Two facts combine:

- **Playfield internal range**: game-coord space is `[0, 32) × [0,
  24)` ([world.js:11-12](../world.js)). Multiplied by `GAME_TO_DVG
  = 32`, the natural playfield DVG-coord range is `[0, 1024) ×
  [0, 768)` — anchored at the DVG origin (DVG y=0 is the playfield
  bottom).
- **Test-pattern visible range**: `[0, 1023] × [128, 895]` per the
  rectangle traced above. The cabinet's visible area's **bottom
  edge sits at DVG y=128**, not y=0 — the bottom 128 DVG-y units
  are simply off-screen, not used for anything.

`$72FE`'s +128 Y-offset shifts every playfield slot's DVG-y by +128,
mapping the playfield's natural `[0, 768)` onto `[128, 896)` — the
same 768 integer Y values as the test-pattern visible Y range
`[128, 895]` (half-open `[128, 896)` ≡ closed `[128, 895]`). So
the playfield exactly fills the cabinet's visible rectangle.

**The HUD is not in a reserved strip.** The HUD callsites (§4) sit
at DVG y ∈ {852, 876} — near the **top** of the visible area, well
inside the playfield's `[128, 896)` Y range. Asteroids and the
ship can fly behind the score/lives display; the HUD is just
overlaid graphics, not a layout-reserved region.

Cabinet screen partition (DVG Y axis, "up" = high values):

```
DVG y=896  ┌──── top of visible area ────────────────┐  canvas y=4
DVG y=876  │   ▒  HUD: score digits (gs=1)           │  canvas y=24
DVG y=852  │   ▒  HUD: lives icons (gs=14)           │  canvas y=48
           │                                          │
           │       PLAYFIELD                          │
           │   (asteroids, ship, saucer — DVG-y       │
           │   ∈ [128, 896) after +128 offset)        │
           │                                          │
DVG y=128  └──── bottom of visible area ─────────────┘  canvas y=772
DVG y<128                                                (off-screen below visible)
```

Both HUD and playfield draw into the same `[128, 895]` visible Y
range. The HUD just sits at the top of that range and renders
over (i.e. after, in DVG-list order) the playfield slots below.

## §4. HUD `$7C03` callsites (player 1 mode)

Each callsite below cites the immediate preceding `LDA #/LDX #/STA
$00` instructions that set the byte parameters. Decode shown for
each.

### §4.1. Player 1 score LABS — `$725E`

```
$724F: LDA #$10 ; STA $00       ; gs byte = $10 → scale nibble $1
$7253: LDA #$50 ; LDX #$A4 ; JSR $7BFC   ; (preceding JSR-emit, not a LABS — see §6)
$725A: LDA #$19
$725C: LDX #$DB
$725E: JSR $7C03                ; LABS emit
```

Decode at `$725E`: A = `$19`, X = `$DB`, ram.$00 = `$10`.

- DVG X = A × 4 = `$19` × 4 = `$64` = 100
- DVG Y = X × 4 = `$DB` × 4 = `$36C` = 876
- scale = `$10` high nibble = 1

**Player 1 score LABS at DVG (100, 876), gs=1.**

After this LABS, the digit-emit sequence follows (5 digits at
gs=1 — see §6 for the emission pattern).

### §4.2. Player 1 lives LABS — `$6F48`

Called from `$7293-$7297` via `JSR $6F3E` with `A = $28` and
`Y = ply1CurShips` ($57):

```
$7293: LDA #$28
$7295: LDY $57                  ; Y = ply1CurShips
$7297: JSR $6F3E
```

`$6F3E` body (the ship-icon emitter):

```
$6F3E: BEQ $6F56                ; if Y==0 (no ships), skip whole emit
$6F40: STY $08                  ; ram.$08 = ship count
$6F42: LDX #$D5
$6F44: LDY #$E0
$6F46: STY $00                  ; gs byte = $E0 → scale nibble $E (= 14)
$6F48: JSR $7C03                ; LABS emit
$6F4B: LDX #$DA ; LDA #$54 ; JSR $7BFC    ; per-icon JSR-emit (see §6)
$6F52: DEC $08 ; BNE $6F4B                ; loop ship_count times
```

Decode at `$6F48`: A = `$28` (preserved from caller), X = `$D5` (just
loaded), ram.$00 = `$E0`.

- DVG X = `$28` × 4 = `$A0` = 160
- DVG Y = `$D5` × 4 = `$354` = 852
- scale = `$E0` high nibble = 14 (`$E`)

**Player 1 lives LABS at DVG (160, 852), gs=14.**

The per-icon stride is encoded in the inner loop's `LDX #$DA / LDA
#$54 / JSR $7BFC` — a JSR opcode emit that calls the ship-icon
subroutine and implicitly advances the cursor by the subroutine's
internal SVECs. The icon's natural width sets the stride; we don't
need to compute it for the port (the cursor just advances naturally
as the JSR opcodes execute under `runList`).

### §4.3. Other `$7C03` callsites — deferred to I-12

These are in the same scoreLivesDraw routine but cover features
that aren't part of I-11 scope:

| Address | Decoded position    | gs | Purpose                                  |
|---------|--------------------|----|-----|
| `$686D` | varies              | varies | Main-loop closing emit (mid-screen LABS — already a stub in `closingEmit`) |
| `$6DD5` | —                   | —  | Attract mode / credits text |
| `$72A2` | DVG (480, 876)      | 0  | High-score display in HUD top-center |
| `$72BF` | DVG (768, 876)      | 1  | Player 2 score mirror (top-right) |
| `$73F7` | —                   | —  | High-score-entry text |
| `$781C` | —                   | —  | PrintPackedMsg text |
| `$7EFD`, `$7F25`, `$7F6A`, `$7F97` | — | — | Attract / test-pattern text |

All deferred to I-12. For I-11a we render player-1 score + player-1
lives only.

## §5. Canvas-Y mapping

Three candidate `toCanvasY(dvgY)` mappings considered; canvas backing
store 1024 × 768 (1:1 with DVG visible rectangle, no scale).

| Mapping             | Visible DVG Y range fits         | Digit-top behavior         |
|---------------------|----------------------------------|----------------------------|
| `768 - dvgY` (pre-I-11) | `[0, 768]`                  | HUD invisible: y=876 maps to canvas y=-108 (off-canvas) |
| `896 - dvgY` (strict)  | `[128, 896]` (test rectangle)  | Digit tops at DVG y~900 clip ~4 px above canvas top |
| `900 - dvgY` (chosen)  | `[132, 900]`                   | Digit tops flush with canvas y=0; ~4 px slack at bottom edge (DVG y=132 → canvas y=768; visible-bottom asteroids may settle just below canvas edge) |

**Choice: `toCanvasY(dvgY) = 900 - dvgY`.**

Rationale: the cabinet's actual rendered area extends a few pixels
past the test-pattern rectangle (the test pattern is the **specified**
visible region, not the absolute physical extent). The 4-px slack
gives digit tops headroom without changing canvas dimensions.

**Empirical confirmation deferred to I-11a:** render "00000" at the
HUD position and verify digit tops are fully visible. If they clip,
either raise to `904 - dvgY` or accept a small clip — the doc-time
choice is `900 - dvgY`.

The bottom-edge slack at `DVG y=132 → canvas y=768`: in practice
asteroids/ship wrap before settling at DVG y=128 exactly, so the
4-px gap below the bottom-most playfield position isn't visually
disruptive.

## §6. Digit emission pattern — what happens AFTER the score LABS

After the LABS at `$725E` lands the cursor at (100, 876) with gs=1,
the source emits a sequence of opcodes to draw 5 score digits. The
exact decode is deferred to I-11a (will require re-reading `$7C20`
neighborhood + `$56D4` character-lookup table), but the high-level
pattern is:

- **`$7BFC` (JSR-opcode emit)** — emits a 4-byte JSR opcode pointing
  to a Char_N subroutine in vector ROM. Each Char_N is a sequence of
  SVECs that draws a digit and leaves the cursor advanced to the
  start of the next digit position.
- **`$7CDE` (zero-length VEC emit)** — emits a 2-byte word `$00 A`
  where A is supplied by the caller. Used for cursor adjustments
  between digits or for spacer "0" rendering.
- **`$56D4` character pointer table** — `$56D4,Y` and `$56D5,Y` pair
  to encode the (A_reg, X_reg) inputs to `$7BFC` for character
  index Y. Per-character entries 0..35 cover digits 0-9 + letters
  A-Z.

### §6.1. Digit-0 aliases Char_O via the character cross-reference table

There is no `Char_0` glyph subroutine in vector ROM. Instead, the
cross-reference table at VectorROM.md `$16D4` (= CPU `$56D4`) maps
the digit-0 character index to **Char_O's body at $55BA**, so
"digit 0" and "letter O" share the same glyph rendering.

Cross-reference table (excerpt):

```
$16D4: 2C CB   JSR $0B2C ($1658)   ; SPACE 1
$16D6: DD CA   JSR $0ADD ($15BA)   ; O and 0 ... same pattern
$16D8: 2E CB   JSR $0B2E ($165C)   ; 1
$16DA: 32 CB   JSR $0B32 ($1664)   ; 2
... [3..9, then A..Z]
```

Each entry is a 2-byte JSR opcode word, indexed by `$56D4,Y` /
`$56D5,Y` (the load pattern used at `$6F35-$6F38`). The byte pair
encodes the JSR target word for that character's glyph subroutine.

VectorROM.md tag addresses use a `$1xxx` prefix; CPU sees the same
data at `$5xxx` ($4000 offset). Char_O body is at `$55BA` (CPU) =
`$15BA` (VectorROM.md tag) = DVG word `$0ADD` (JSR target).

**Port implication:** when the I-11a digit-emit loop reads the BCD
nibble for a "0" digit, the cross-reference lookup naturally calls
Char_O — no special case needed at the digit-emit level. In the JS
port the lookup table is implicit: `Char_${nibble === 0 ? 'O' :
nibble}` for nibbles 1..9, or equivalently a `DIGIT_NAMES` array
indexed by nibble where index 0 holds `'Char_O'` and indices 1..9
hold `'Char_1'..'Char_9'`.

**VROM `$1658` is `Char_Space`, not `Char_0`.** Both are 2-opcode
sequences (cursor advance + RTS) but `Char_Space` is distinct from
the digit-0 alias mechanism above. `Char_Space` is used for the
SPACE character (index 0 in the cross-reference table) and likely
for leading-zero suppression if scoreLivesDraw implements it (TBC
during I-11a — confirm by re-reading the per-digit emit loop).

## §7. Port plan summary

For I-11a HUD render:

1. **[world.js](../world.js)**: export `PLAYFIELD_Y_OFFSET = 128`.
2. **[asteroid.js](../asteroid.js), [ship.js](../ship.js),
   [saucer.js](../saucer.js), [shot.js](../shot.js)**: each
   `dvgPos()` returns `{ x: x * GAME_TO_DVG, y: y * GAME_TO_DVG +
   PLAYFIELD_Y_OFFSET }`.
3. **[main.js](../main.js)**: change `toCanvasY` to `(dvgY) => 900 -
   dvgY`. Canvas backing store stays 1024 × 768.
4. **[task_seq.js](../task_seq.js)**: implement `scoreLivesDraw`:
   - Emit player-1 score at DVG (100, 876) gs=1, 5 BCD nibbles of
     `scoreThousands:scoreTens` (4 nibbles) + one trailing zero
     (implicit ones place, since score is tracked in tens — defer
     the "Char_0 vs Char_Space vs leading-zero-suppression" question
     to verification).
   - Emit player-1 lives at DVG (160, 852) gs=14, `curShips` copies
     of `LivesIcon`.

State changes (also in I-11a):

- [state.js](../state.js): re-type `scoreThousands` from decimal int
  to BCD byte (init `$00`); add `scoreTens` (BCD byte, init `$00`);
  add `curShips` (init 3 from `$6925-$6927` `numShipsPerGame` DIP);
  flip `numPlayers` default `0 → 1` (with `// I-12 makes dynamic`
  comment).

## §8. Verification checklist for I-11a

After the HUD code lands, the following must be visually true on
canvas at game start:

- 5 score digits visible in top-left area at canvas y ≈ 0-24
  (depending on whether leading-zero suppression is enabled — if
  suppression is on, only the rightmost "0" is visible).
- 3 lives icons (ship-shape triangles) visible in top-left area,
  slightly to the right of the score, at canvas y ≈ 48 (DVG y=852
  → canvas y = 900 - 852 = 48).
- Playfield asteroids/ship shifted down by ~32 canvas-px vs the
  pre-I-11a state (the +128 DVG-y offset → canvas y shift of -32
  under the `900 - dvgY` mapping).
- Ship at game (16, 12) → DVG (512, 384 + 128 = 512) → canvas (512,
  388). Slightly above canvas center (height 768/2 = 384).
- Wave-spawn asteroids appear shifted up similarly. Verify by
  playing through the wave and confirming none clip at the canvas
  bottom edge.
