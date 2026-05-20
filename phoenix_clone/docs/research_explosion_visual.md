# Phoenix Explosion Visual Subsystem

Source-of-truth: a local clone of the computerarcheology.com Phoenix
project (8085 disassembly produced from the original ROM).

- **Disassembly** — `Code.md`
- **RAM map** — `RAMUse.md`

These files live in the local ComputerArcheology Phoenix clone — see
`../CLAUDE.md` for the per-PC path.

Every claim is tagged **[verified]** with an address citation,
**[inferred]** when reasoning beyond what the listing makes explicit,
or **[uncertain]** when the source itself is ambiguous.

This doc covers the **visual subsystem** invoked by both player death
(state 4, `$0AEA`) and mothership destruction (state 6, `$2400`).
State-machine dispatch lives in `research_player_ship.md §2` and
`research_mothership.md §7`; this doc factors out what those sections
share — the two render paths (central sprite + scattered debris) and
their ROM data tables.

The scattered-debris path was deferred at port-time (see the deferral
notes in the two state-machine docs). This research pass exists to
characterize the engine precisely enough that the port can either land
a source-faithful implementation or commit to the visual-effect
approximation already in place for the mothership.

---

## 1. Two-tier explosion in one diagram

```
   CounterA5  Phase    What runs
   ─────────  ───────  ────────────────────────────────────────────────
   $60 → $21  early    Per-frame dispatch on bit-0 (and bit-1 for player)
                       routes to one of:
                         L0FC0  — alien-kill explosion anim (player only)
                         L20E8  — central 4×4 particle sprite      ← Tier 1
                         L2070  — player scattered debris   ← Tier 2 (player)
                         L2426  — mothership scattered debris ← Tier 2 (moth)
   $20        wipe     One-shot ClearForeground (player) /
                       $2520 bonus-score branch (mothership)
   $1F → $01  late     Late phase: scroll reset (player stages 4-8 only),
                       progressive mothership erase ($246A)
   $00        done     L0B15 respawn decision (player) /
                       state 7 score display (mothership)
```

The visual subsystem covers **Tier 1** (central sprite) and **Tier 2**
(scattered debris). Both are invoked from the per-frame dispatch in the
early phase; CounterA5 also feeds the frame-selector math inside each
tier, so both visuals animate as CounterA5 ticks down.

---

## 2. Player explosion path (`$0AEA` → `$0BBA`)

State-4 early-phase dispatch (`Code.md $0BBA-$0BC4`):

```
0BBA: LD B,A            ; B := CounterA5
0BBB: RRCA              ; CY := old bit 0
0BBC: JP NC,$0FC0       ; bit-0 even → L0FC0 (alien-kill anims)
0BBF: RRCA              ; (odd bit-0) CY := old bit 1
0BC0: LD A,B            ; restore A := CounterA5
0BC1: JP C,$2070        ; old bit 1 set → L2070 (scattered debris)
0BC4: JP $20E8          ; else → L20E8 (central sprite)
```

[verified — `Code.md:$0BBA-$0BC4`]

Three-way dispatch by `(CounterA5 & 3)`:

| `A5 & 3` | Bit pattern | Path | Visual |
|---|---|---|---|
| 0 | `...00` | `L0FC0` | Alien-kill explosion slots tick (`$4370`/`$4374`/`$4378`/`$437C`) |
| 1 | `...01` | `L20E8` | Central 4×4 sprite at player position |
| 2 | `...10` | `L0FC0` | (same as 0) |
| 3 | `...11` | `L2070` | Scattered debris around player |

So over 64 frames of the early phase, each path fires ~16 times. The
two visual paths together produce a "central pulse + chaotic
surroundings" effect at ~30 Hz aggregate (one or the other on every odd
bit-0 frame).

---

## 3. Mothership explosion path (`$2400` → `$2410`)

State-6 early-phase dispatch (`Code.md $240E-$2426`):

```
240E: LD B,A            ; B := CounterA5
240F: RRCA              ; CY := bit 0
2410: NOP
2411: LD A,B            ; restore A
2412: JP NC,$20E8       ; bit-0 even → L20E8 (central sprite)
2415: (setup for L2085 with T2A00/T2B00 — see §5)
2426: JP $2085
```

[verified — `Code.md:$240E-$2426`]

Two-way dispatch by `(CounterA5 & 1)`:

| `A5 & 1` | Path | Visual |
|---|---|---|
| 0 | `L20E8` | Central 4×4 sprite at mothership position |
| 1 | `L2426 → L2085` | Scattered debris with T2A00/T2B00 tables |

Differences from the player path:

- No `L0FC0` slot ticks — no in-flight alien explosions to animate
  during a mothership kill (the mothership stage clears alien slots
  via `$0F00` shield-block + pilot logic earlier)
- 50/50 dispatch instead of 25/25/50 (one visual path per frame
  instead of one-of-three)
- Different ROM tables (T2A00 instead of T2800, T2B00 instead of
  T2900) — see §6
- Different starting screen offset (`$2415-$2419` sets `C := E - $05 + $C0`,
  vs player's `$2071-$2073` `C := E - $0A + $C0`)

---

## 4. Tier 1 — central 4×4 sprite engine (`L20E8`)

Shared by both explosions. Reads (CounterA5 >> 2) & $0E to select one of
three 4×4 frames from T1B60/T1B70/T1B80 (or a deletion frame from T1B90),
blits via DrawImageCbyB at a position offset from the caller's screen
ptr by approximately one column left + one row up.

```
20E8-20FB: screen-ptr arithmetic (caller-supplied DE)
20FC: LD A,B               ; B := CounterA5
20FD-20FE: RRCA / RRCA     ; A >>= 2
20FF: AND $0E              ; (CounterA5 >> 2) & 0x0E → 0..14
2101: ADD $90              ; index into T1B90 selector
2103-2104: HL := $1B90 + offset
2106-2109: (HL) → real tile-data ptr (deref T1B90)
210A: LD BC,$0404          ; 4 cols × 4 rows
210D: JP $0AD6             ; DrawImageCbyB
```

[verified — `Code.md:$20E8-$210D`]

### 4.1 T1B90 selector

8 entries, indexed by `(CounterA5 >> 2) & 0x0E`:

| Index | Tile-data pointer | Effect |
|---|---|---|
| 0 | T1B80 | Frame 2 — sparse |
| 2 | T1B70 | Frame 1 — medium |
| 4 | T1B60 | Frame 0 — dense |
| 6 | T1B70 | Frame 1 — medium |
| 8 | T17F0 (`FourByFourEmpty`) | "Deletion" frame — all-blank |
| A | T17F0 | "Deletion" |
| C | T17F0 | "Deletion" |
| E | T17F0 | "Deletion" |

So the central sprite cycles `0..3..2..1..0..delete..delete..delete..delete`
as CounterA5 ticks. The "delete" frames erase the previous sprite
(source's screen-RAM model — the blit overwrites; with a 4×4 blank, the
4×4 region becomes clear). [verified — `Code.md:$1B90-$1B9F`,
inferred for the source effect from existing `_drawParticleFrame` notes]

### 4.2 Port status

✅ **Ported** at step 12.9 (mothership) and step 13 (player) as
`_drawParticleFrame` / `_drawPlayerParticleFrame`. Tile-data extracted
as `PARTICLE_SPRITES` (T1B60 + T1B70 + T1B80, 48 bytes). T1B90
selector inlined as JS if/else chain in both callers.

The port renders into `fgOverlay` rather than screen-RAM, with a 4×4
delete-region pass on the "deletion" branches. Visually equivalent
to source.

`research_player_ship.md §2.2` and `research_mothership.md §7.2`
cover the per-call sprite positioning in more detail.

---

## 5. Tier 2 — scattered debris engine (`L2085`)

The deferred path. Source byte-level:

```
2085: SUB $20            ; A := CounterA5 - $20    (range $00..$3F during early phase)
2087: RLCA
2088: RLCA               ; A := A * 4
2089: NOP
208A: AND $E0            ; keep high 3 bits        (range $00, $20, $40, ..., $E0)
208C: LD L,A             ; L := A
208D: LD A,$E0
208F: SUB L
2090: LD L,A             ; L := $E0 - L            (window offset into control table)

2091: LD A,$3F
2093: SUB C              ; A := $3F - C    (C = screen-ptr LSB lower bound)
2094: LD A,$43
2096: SBC B              ; A := $43 - B (with borrow from previous SUB)
2097: JP NC,$20B0        ; if BC <= $433F → proceed with walk
                         ; else: advance screen ptr down, fix bounds, loop back

209A: INC HL twice       ; advance T2900 ptr by 2  (skip this row of bytes)
209C: LD A,E
209D: ADD $10
209F: LD E,A             ; E += $10 (move down by 16 rows in screen RAM)
20A0: LD A,C
20A1: SUB $20
20A3: LD C,A             ; C -= $20
20A4: LD A,B
20A5: SBC $00
20A7: LD B,A
20A8: JP $2091           ; loop boundary check

20B0: PUSH BC            ; save BC (screen-ptr bound)
20B1: LD A,(HL)          ; A := T2900[L] (the control byte)              ← READ ROM
20B2: EX (SP),HL         ; swap: HL ↔ screen-ptr (stack now holds T2900 ptr)
20B3: LD B,$08           ; 8 bits to process

20B5: LD (HL),$00        ; clear screen-RAM cell                          → WRITE
20B7: RRCA               ; CY := old bit 0 of control byte
20B8: JP NC,$20BF        ; bit was 0 → skip overwrite
20BB: EX DE,HL           ; swap: HL ↔ T2800 ptr (DE now is screen ptr)
20BC: LD C,(HL)          ; C := tile from T2800                          ← READ ROM
20BD: EX DE,HL           ; swap back
20BE: LD (HL),C          ; write tile to screen-RAM                      → WRITE

20BF: INC HL             ; advance screen ptr (= INC E = DOWN one row)
20C0: INC DE             ; advance T2800 ptr
20C1: DEC B
20C2: JP NZ,$20B5        ; loop for 8 bits

20C5: EX (SP),HL         ; swap back: HL is T2900 ptr again
20C6: INC HL             ; advance T2900 ptr to next byte
20C7: LD A,L
20C8: RRCA               ; CY := bit 0 of new L value
20C9: JP C,$20B1         ; if L odd → process next byte (same column pair)
20CC: LD A,L
20CD: AND $1F            ; low 5 bits of L
20CF: JP Z,$20E1         ; if low 5 bits == 0 → exit (window done)
20D2: EX (SP),HL         ; swap: HL is screen ptr
20D3: LD A,L
20D4: SUB $30
20D6: LD L,A             ; screen ptr -= $30 (back-left to next column pair)
20D7: LD A,H
20D8: SBC $00
20DA: LD H,A
20DB: EX (SP),HL         ; swap back: HL is T2900 ptr
20DC: CP $3F             ; A is high byte of screen ptr after adjustment
20DE: JP NZ,$20B1        ; if NOT $3F → continue walking
20E1: POP BC
20E2: RET
```

[verified — `Code.md:$2085-$20E2`]

### 5.1 Read/write classification

Every memory access in the engine:

| Address | Type | Target |
|---|---|---|
| `$20B1: LD A,(HL)` | READ | Control table T2900/T2B00 (ROM) |
| `$20B5: LD (HL),$00` | WRITE | Screen RAM (clear) |
| `$20BC: LD C,(HL)` | READ | Data table T2800/T2A00 (ROM) |
| `$20BE: LD (HL),C` | WRITE | Screen RAM (tile) |

**The engine never reads back from screen RAM.** All reads target
the ROM data tables; all writes target screen RAM. The output is a
pure function of `(CounterA5-derived window, T2900[L..L+31],
T2800[0..255], screen-ptr-base)`.

This is the load-bearing finding for porting: the canvas port can
recreate the visual without modeling screen-RAM persistence. Each
frame computes the active set of `(canvas_x, canvas_y, tile)` tuples
from scratch and draws them.

### 5.2 CounterA5 → window offset mapping

The window math at `$2085-$2090`:

```
L_initial = $E0 - (((CounterA5 - $20) << 2) & $E0)
```

As CounterA5 ticks `$60 → $20`, the input `(CounterA5 - $20)` ticks
`$40 → $00`. Multiplying by 4 gives `$100 → $00`. The `AND $E0`
quantizes to 8 distinct values (`$00, $20, $40, $60, $80, $A0, $C0, $E0`).
The `$E0 - …` reverses the order.

Concrete table of `(CounterA5, L_initial)` — one entry per 8 CounterA5
ticks because the `<<2 & $E0` quantizes:

| CounterA5 range | L_initial | Window of T2900 used |
|---|---|---|
| `$60`–`$59` | `$E0` | bytes `$E0..$FF` |
| `$58`–`$51` | `$C0` | bytes `$C0..$DF` |
| `$50`–`$49` | `$A0` | bytes `$A0..$BF` |
| `$48`–`$41` | `$80` | bytes `$80..$9F` |
| `$40`–`$39` | `$60` | bytes `$60..$7F` |
| `$38`–`$31` | `$40` | bytes `$40..$5F` |
| `$30`–`$29` | `$20` | bytes `$20..$3F` |
| `$28`–`$21` | `$00` | bytes `$00..$1F` |

(L wraps every 8 ticks because the `<<2 & $E0` quantization makes
every 8 consecutive CounterA5 values map to the same `L_initial`.)

The engine then walks 32 bytes of T2900 starting at `L_initial`,
giving 256 control bits per frame. Same for T2900/T2B00 mothership
case with T2A00/T2B00.

[verified — `Code.md:$2085-$2090`]

### 5.3 The walk pattern

The engine walks the 32-byte control window in a specific pattern:

1. **Outer loop**: 16 column-pairs (one column-pair = 2 control bytes,
   processed back-to-back via the `$20C8 RRCA` bit-0 check at L's new
   value)
2. **Inner loop**: 8 cells per control byte, walking DOWN the screen
   one row per cell (via `$20BF INC HL` = INC E in rotated screen-RAM)
3. **Between column pairs**: screen ptr adjusts by `-$30` (back-left in
   rotated layout) before the next column pair starts

This produces a vertical-strips pattern: column 0 top→bottom, column 1
top→bottom, then jump back and start column 2, etc.

In canvas (x, y) coordinates, the walk produces cells at:

```
For bit_index 0..255:
    column_pair = bit_index // 16     (0..15)
    byte_in_pair = (bit_index // 8) & 1   (0 or 1)
    bit_in_byte = bit_index & 7       (0..7)

    canvas_col_offset = column_pair * 2 + byte_in_pair  (0..31)
    canvas_row_offset = bit_in_byte                     (0..7)
```

So the engine's region is **32 columns × 8 rows** of 8×8 cells =
**256 px wide × 64 px tall**, anchored at the caller-supplied
screen-ptr base (one column left + one row up of the killed
object's center, per the caller setup at `$2070-$2079` and
`$2415-$241E`).

256 px wide ≈ the full play-area width (canvas is 208 px after the
HUD bezel, so the explosion's debris field can wrap horizontally —
likely clipped at canvas edges in source's CRT). 64 px tall is one
quarter of the visible play area. [inferred — based on the 8-bit walk
+ 32-byte window math; needs visual confirmation at port time]

### 5.4 Bit-index → tile mapping

T2800/T2A00 walked sequentially: `tile_at_bit_index = T2800[bit_index]`
when the corresponding control bit is set. So the data table is read
in linear order regardless of the walk pattern. [verified — `$20BC INC DE`
in inner loop, no DE adjustment between iterations]

---

## 6. ROM data tables

Verified via `tools/simulate_l2085.py` reading `maincpu.bin` directly.

### 6.1 Control-bit density

Both control tables are extremely sparse — most bytes have 0 or 1 bit
set. This is unexpected: the engine scans 256 cells per frame but
only ~10-25 of them ever get a tile written.

- T2900 (player):     78 / 2048 bits = **3.8% set**
- T2B00 (mothership): 152 / 2048 bits = **7.4% set**

Per-32-byte-window (= cells written per frame):

| `L_initial` | T2900 cells | T2B00 cells |
|---|---|---|
| `$00` | 9 | 13 |
| `$20` | 5 | 16 |
| `$40` | 11 | 22 |
| `$60` | 11 | 21 |
| `$80` | 11 | 24 |
| `$A0` | 11 | 24 |
| `$C0` | 11 | 18 |
| `$E0` | 9 | 14 |

So per-frame: ~10 cells for player, ~20 for mothership. Far sparser
than the central 4×4 sprite (16 cells). The scatter is **smaller in
total cell count** than the central pulse — its visual contribution
is "a few stray fragments scattered around" rather than "a debris
cloud." This explains why the deferral wasn't immediately visually
obvious during smoke tests.

### 6.2 T2800 (player tile data, 256 B)

Mostly zeros (~86% zero, ~14% non-zero). Tile codes used: `$30`-`$5A`
(fragment-like FG tiles) and `$C1`-`$E2` (shield/particle tiles, same
range as the central T1B60/70/80 sprites).

Full bytes dumped by the simulator; see
`tools/simulate_l2085.py` output. Compact summary:

```
0000: 00 32 00 00 00 00 00 00 00 00 00 00 00 00 42 42
0010: 00 00 00 00 00 00 00 00 00 00 E1 00 00 E2 00 00
...  (sparse continuation; full dump in tools output)
```

### 6.3 T2A00 (mothership tile data, 256 B)

Denser than T2800 (~71% non-zero). Tile range is similar (`$53`,
`$5E`, `$C0`-`$E3`, `$D0`-`$D3` — the dense region around `$80` is
the densest debris).

```
0000: 00 00 00 00 00 00 00 D2 00 00 00 00 00 00 00 00
0010: 00 00 00 00 00 DE 00 5E E0 00 00 E1 00 00 00 00
...
```

(Both tile dumps reproduced in full by the simulator script.)

### 6.4 T2900 / T2B00 control bytes

Bit patterns dumped by the simulator. Notable: bits aren't
randomly scattered — they cluster. Looking at T2B00 head:

```
0000: 00 00 00 00 00 00 00 00 00 00 80 01 40 02 80 05
0010: A0 01 40 02 00 01 00 00 00 00 00 00 00 00 00 00
```

The non-zero stretch is bytes `$0A..$11` — 8 bytes = one column-pair-
plus-some. So the explosion's "center of mass" of debris is concentrated
in specific column-pairs, not uniformly distributed.

---

## 7. Walk simulation

The simulation script `tools/simulate_l2085.py` directly mirrors the
walk algorithm derived in §5.3. Key per-frame loop:

```python
# Outer loop: 16 column-pairs (each pair = 2 control bytes = 16 cells)
for pair in range(16):
    # Byte 0: 8 cells walked DOWN
    for bit in range(8):
        if control_table[L] & (1 << bit):
            output.append((col_offset, row_offset, tile_table[de]))
        row_offset += 1
        de += 1
    L += 1
    # Byte 1: 8 more cells DOWN
    for bit in range(8):
        if control_table[L] & (1 << bit):
            output.append((col_offset, row_offset, tile_table[de]))
        row_offset += 1
        de += 1
    L += 1
    # Column shift: +1 col right in canvas, row back to 0
    # (source $20D6 SUB $30 = RightOneColumn + 16 rows back up)
    col_offset += 1
    row_offset -= 16
```

Verified:
- L_initial computation matches source `$2085-$2090` byte-for-byte
- 16 column-pairs × 16 cells = 256 cells per frame (matches the
  $20CC-$20CF termination at `L & $1F == 0`)
- Column shift direction matches source `$20D6 SUB $30` decomposed
  as `RightOneColumn ($20) + 16 rows reset ($10)`

---

## 8. Per-frame snapshots and the visual story

For each explosion, 8 CounterA5 windows produce 8 distinct debris
patterns. Mapping window L_initial back to CounterA5 (per §5.2):

| Window | L_initial | CounterA5 range | Frames in window |
|---|---|---|---|
| 0 (start) | `$00` | `$58-$5F` | last 8 frames before explosion ends |
| 1         | `$20` | `$50-$57` | |
| 2         | `$40` | `$48-$4F` | |
| 3         | `$60` | `$40-$47` | mid-explosion |
| 4         | `$80` | `$38-$3F` | |
| 5         | `$A0` | `$30-$37` | |
| 6         | `$C0` | `$28-$2F` | |
| 7 (last)  | `$E0` | `$20-$27` | first 8 frames after explosion starts |

Note the order: **the explosion *starts* at window 7 (`L=$E0`) and
*ends* at window 0 (`L=$00`)** — CounterA5 ticks DOWN from `$60`
toward `$20`.

### 8.1 The big finding — explosion expands from center to edges

Per-window col/row bounding boxes (player explosion):

| Window | CounterA5 | Col range | Row range | Bounding box | Visual character |
|---|---|---|---|---|---|
| 7 | `$20-$27` (start) | 0..15 | 0..15 | full 16×16 | widest scatter |
| 6 | `$28-$2F` | 0..15 | 0..15 | full 16×16 | wide scatter |
| 5 | `$30-$37` | 1..14 | 1..15 | 14×15 | wide scatter |
| 4 | `$38-$3F` | 2..13 | 3..15 | 12×13 | medium spread |
| 3 | `$40-$47` | 3..12 | 4..14 | 10×11 | tightening |
| 2 | `$48-$4F` | 4..11 | 6..14 | 8×9 | tight |
| 1 | `$50-$57` (mid) | 5..8 | 8..12 | 4×5 | tight central |
| 0 | `$58-$5F` (end) | 6..9 | 10..13 | 4×4 | pinpoint at center |

**Wait — the walk runs in CounterA5-decreasing order during the
explosion, but the windows are walked in L_initial-decreasing order
(`$E0 → $00`). So the explosion VISUAL is:**

- **Frames at CounterA5 ≈ `$5F` (just after onPlayerHit)**: only
  3-4 cells at row 10-13, col 6-9 (a tiny pinpoint at the center of
  the 16×16 region — basically AT the player position)
- **Mid-explosion (CounterA5 ≈ `$40`)**: ~11 cells spread across a
  10×11 area
- **Late-explosion (CounterA5 ≈ `$25`)**: ~9-11 cells spread across
  the full 16×16 area

So the explosion **starts as a pinpoint and expands outward** as the
animation progresses. That's the opposite of what I'd assumed from
the deferral notes (which suggested "chaotic scatter from the start").
The expansion gives the explosion a natural "shockwave" feel — debris
appears to fly outward from the impact point over the ~1 second window.

The mothership explosion has the same expanding shape but ~2× denser
(~20 cells per frame instead of ~10), making the visual punchier.

### 8.2 Tile palette

Tiles used across all windows:

- **Player**: `$30, $32, $3B, $3D, $3E, $3F, $40, $41, $42, $4D, $4F,
  $5A, $C1, $C2, $C3, $C8, $CA, $CE, $CF, $D8, $DA, $DE, $DF, $E0,
  $E1, $E2`
- **Mothership**: `$53, $5E, $C0, $C1, $C2, $C3, $CA, $CE, $CF, $D0,
  $D1, $D2, $D3, $D8, $DA, $DE, $DF, $E0, $E1, $E2, $E3`

Many tiles in the `$C0-$E3` range overlap with central-sprite tiles
(T1B60/70/80) — the scatter uses the same explosion fragment-sprite
palette, giving visual continuity between the central pulse and the
peripheral debris.

### 8.3 Full per-frame tuples

Reproduced verbatim from `tools/simulate_l2085.py` output. Each entry
is `(col_offset, row_offset, tile)` where offsets are in 8-px cells
from the engine's starting screen-ptr (= player or mothership
position, minus ~1 column left + 1 row up — caller setup at `$2070`
and `$2415`).

#### Player — Window 0 (`L=$00`, CounterA5 `$58-$5F` — explosion start)

```
( 6, 13, $40)   ( 7, 11, $3E)   ( 7, 12, $C8)
( 7, 13, $D8)   ( 8, 10, $E2)   ( 8, 12, $CA)
( 8, 13, $DA)   ( 9, 11, $3F)   ( 9, 13, $41)
```

#### Player — Window 7 (`L=$E0`, CounterA5 `$20-$27` — explosion end)

```
( 0,  1, $32)   ( 0, 15, $42)   ( 1, 10, $E1)
( 3,  6, $DF)   ( 8,  0, $E0)   (11,  6, $DF)
(14,  9, $C2)   (15,  2, $3B)
```

(Other 6 player windows + all 8 mothership windows: see
`tools/simulate_l2085.py` output — too verbose to inline. ~80 tuples
total for player, ~150 for mothership.)

---

## 9. Port mapping plan

### 9.1 Data extraction

Add four entries to `tools/build_data.py`:

```python
("PLAYER_EXPLOSION_TILES",       0x2800, 256),  # T2800
("PLAYER_EXPLOSION_CONTROL",     0x2900, 256),  # T2900
("MOTHERSHIP_EXPLOSION_TILES",   0x2A00, 256),  # T2A00
("MOTHERSHIP_EXPLOSION_CONTROL", 0x2B00, 256),  # T2B00
```

Or alternatively two consolidated 512-byte slices with offset
constants. Either way: ~1 KB of `data.js` growth.

### 9.2 Strategy 1 — live decoder

Replicate the walk math in `states_player.js:_drawPlayerScatteredFrame`
and `states_mothership.js:_drawScatteredParticles`. Each frame:

```js
const L_initial = (0xE0 - (((counterA5 - 0x20) << 2) & 0xE0)) & 0xFF;
state.scatteredDebris.clear();
let deOff = 0;
for (let i = 0; i < 32; i++) {
    const controlByte = CONTROL_TABLE[(L_initial + i) & 0xFF];
    // Each pair-of-bytes covers one canvas column-pair (16 rows tall):
    //   byte 0 (i=0,2,4,...) → rows 0..7 of column pair
    //   byte 1 (i=1,3,5,...) → rows 8..15 of column pair
    const col = i >> 1;                    // 0..15 (column index)
    const rowBase = (i & 1) ? 8 : 0;
    for (let bit = 0; bit < 8; bit++) {
        if (controlByte & (1 << bit)) {
            const tile = TILES_TABLE[deOff];
            if (tile !== 0) {
                const row = rowBase + bit;
                state.scatteredDebris.set(
                    `${baseX + col * 8},${baseY + row * 8}`, tile);
            }
        }
        deOff++;
    }
}
```

(`col`/`row` derivation verified empirically by the §7 simulation —
e.g. window 7 has cells at `(0, 1, $32)` and `(0, 15, $42)` because
T2900[$E0]=$02 (bit 1) and T2900[$E1]=$80 (bit 7), which the
formula above produces for i=0/bit=1 and i=1/bit=7 respectively.)

Pros: walk math is in the JS — easy to audit against this doc. ~20
lines total. No build-time machinery.
Cons: 32-iteration inner-outer loop runs each frame (~256 op count).
Negligible at 60 Hz on modern hardware.

### 9.3 Strategy 2 — build-time unrolling

Run the §7 simulation in Python (live inside `build_data.py`) and
emit precomputed per-window arrays:

```js
export const PLAYER_EXPLOSION_FRAMES = [
    // Window 0 (L=$00, CounterA5 $58-$5F): [[col, row, tile], ...]
    [[6, 13, 0x40], [7, 11, 0x3E], [7, 12, 0xC8], ...],
    // ...
    // Window 7 (L=$E0, CounterA5 $20-$27):
    [[0, 1, 0x32], [0, 15, 0x42], [1, 10, 0xE1], ...],
];
```

JS at runtime:

```js
const windowIdx = 7 - (((counterA5 - 0x20) >> 3) & 7);  // §5.2 mapping
const frame = PLAYER_EXPLOSION_FRAMES[windowIdx];
state.scatteredDebris.clear();
for (const [col, row, tile] of frame) {
    state.scatteredDebris.set(`${baseX + col * 8},${baseY + row * 8}`, tile);
}
```

Pros: ~8 lines of JS. Walk math is gone from runtime entirely.
Cons: `build_data.py` grows by ~30 lines (the simulator can be
imported from `tools/simulate_l2085.py`). The data flow becomes
"Python is the spec; JS just iterates."

### 9.4 Recommendation

**Strategy 1.** The walk math turned out to be ~10 lines once the
algorithm was understood. The total runtime cost is trivial (256
operations per frame, only during the ~32-frame explosion early
phase). Strategy 2's main advantage — "intricate math runs once at
build time" — doesn't apply once the math is this simple.

Strategy 2 is still worth keeping in mind as a fallback if A/B testing
reveals the walk math has a subtle bug — having the simulator output
the expected per-frame cells makes verification trivial.

### 9.5 Per-explosion integration

| Site | Replace | With |
|---|---|---|
| `states_mothership.js:_drawScatteredParticles` | Current cos/sin visual-effect ring | Strategy-2 lookup into `MOTHERSHIP_EXPLOSION_FRAMES` |
| `states_player.js:state4_PlayerExplosion` early phase, `a5 & 3 == 3` branch | (currently no scatter) | Strategy-2 lookup into `PLAYER_EXPLOSION_FRAMES` |

Both sites: compute `baseX/baseY` from the killed object's position +
the source-offset constants (player: `E - $0A + $C0` per §2;
mothership: `E - $05 + $C0` per §3). Translate from source's
screen-RAM offset arithmetic to canvas (x, y) — see the existing
`_drawParticleFrame` calls for the conversion pattern.

### 9.6 Existing visual-effect ring removal

The current `_drawScatteredParticles` in `states_mothership.js` uses
a cos/sin scatter — a visual-effect approximation predating this
research. Strategy-2 replacement is byte-for-byte source-faithful,
so the ring code can be deleted in the same commit. Net diff
should be roughly zero (~30 lines removed, ~30 lines added).

---

## 10. Open questions / verify at port time

- **`baseX` / `baseY` calibration**: Source computes the engine's
  starting screen-ptr from the player or mothership screen address
  via `LD A, E; SUB $0A; ADD $C0; LD C, A` (`$2071-$2079`). The exact
  canvas offset of the 16×16 region's top-left relative to the
  killed object's position needs verification. From the simulation
  data alone, window 0 (explosion start) has cells clustering at
  `row 10-13, col 6-9` — roughly the bottom-center of the region —
  consistent with the region being **centered on the killed object,
  not anchored at its top-left**. Likely `baseX = player.x - 64`,
  `baseY = player.y - 56`, but **needs A/B against MAME**.

- **Region edge clipping**: 16-cell-wide region × 8 px = 128 px.
  Canvas is 208 px wide. Player X ranges `$0C..$C0` = 12..192 px.
  With `baseX = player.x - 64`, region spans `player.x - 64 ..
  player.x + 56`. At extreme player X (12), region left edge is at
  -52 — partially off-canvas. At extreme right (192), region extends
  to 248 — partially off-canvas right. Source presumably lets the
  writes go to screen-RAM wrap; port should skip out-of-canvas
  cells (`if (canvas_x < 0 || canvas_x >= 208) continue;`).

- **Per-frame clear semantics for `state.scatteredDebris`**:
  Source's L2085 clears every cell in the region each call (writes
  `$00` first, then conditionally overwrites with a tile). Port
  should call `state.scatteredDebris.clear()` at the start of each
  scattered-particle frame, then fill with the current window's
  cells. Without this, debris from previous frames lingers and
  accumulates — wrong behavior (source visibly wipes the region
  each frame).

- **state-4 `a5=$20` wipe interaction**: The wipe at `a5 === $20`
  clears `fgOverlay` + explosion slots, but not `scatteredDebris`.
  Add `state.scatteredDebris.clear()` to that wipe so the debris
  doesn't survive past the mid-explosion ClearForeground.

- **Mothership stage 9-A transition during debug-K cheat**: If the
  player kills the mothership immediately after stage 9 fade-in
  starts (via debug `K`), state-6 runs with the mothership still
  scrolling in (`bgTiles` updated each frame). The `baseX/baseY`
  calculation should use the CURRENT mothership position, not the
  stored start position. Verify the mothership-center calculation
  in `_drawScatteredParticles` handles this. [test by triggering K
  during stage 9]

---

## 11. Cross-references

- `research_player_ship.md §2` — player explosion state-4 dispatch
  (covers the L0FC0 path that's not part of this doc's scope)
- `research_player_ship.md §2.5` — the deferral note this research
  resolves; can be updated to "✅ resolved, see research_explosion_visual.md"
- `research_mothership.md §7` — mothership explosion state-6 dispatch
- `research_mothership.md §10` item 7 — the same deferral note from
  the mothership side
- `research_rendering.md §2.5` — sprite decode + the FG/BG plane split
- `Code.md $2085-$20E2` — the engine itself
- `Code.md $2800/$2900/$2A00/$2B00` — the four ROM data tables
