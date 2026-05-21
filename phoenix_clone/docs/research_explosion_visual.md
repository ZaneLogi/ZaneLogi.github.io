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

This doc characterizes the engine to the byte level. The port lands a
source-faithful walk for both render paths — central sprite and
scattered debris — driven directly by the four ROM tables described
in §6. §9 covers the implementation; §10 records the calibration
choices.

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

**Pre-clear on every frame (not just the deletion branches).** Source's
`DrawImageCbyB` unconditionally writes all 16 cells, so `$00` bytes
inside T1B70 (4 zeros) and T1B80 (12 zeros) erase the previous frame's
tiles at those positions. The port skips `$00` cells (canvas
transparency convention), so it must explicitly clear the 4×4 region
before drawing — otherwise dense-frame tiles linger at the `$00` slots
of subsequent medium/sparse frames and build up across the pulse
cycle instead of cleanly transitioning M→D→M→S→erase. Both
`_drawParticleFrame` (mothership) and `_drawPlayerParticleFrame`
(player) do this pre-clear; the player version was missed when first
ported in step 13 and fixed alongside the §5 scatter work
(2026-05-21).

`research_player_ship.md §2.2` and `research_mothership.md §7.2`
cover the per-call sprite positioning in more detail.

---

## 5. Tier 2 — scattered debris engine (`L2085`)

Source byte-level:

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
cloud."

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
animation progresses. The expansion gives the explosion a natural
"shockwave" feel — debris appears to fly outward from the impact
point over the ~1 second window.

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

## 9. Port implementation

### 9.1 Data extraction

`tools/build_data.py` extracts the four ROM tables as separate
256-byte Uint8Arrays:

```python
("PLAYER_EXPLOSION_TILES",       0x2800, 256),  # T2800
("PLAYER_EXPLOSION_CONTROL",     0x2900, 256),  # T2900
("MOTHERSHIP_EXPLOSION_TILES",   0x2A00, 256),  # T2A00
("MOTHERSHIP_EXPLOSION_CONTROL", 0x2B00, 256),  # T2B00
```

1 KB total of `data.js` growth.

### 9.2 Walk implementation

Both `states_player.js:_drawPlayerScatteredFrame` and
`states_mothership.js:_drawScatteredParticles` walk the L2085 algorithm
live each frame. The mothership version factors out `_walkL2085(...)`
as a shared helper; the player version inlines the same loop. Walk
math:

```js
const L_initial = (0xE0 - (((counterA5 - 0x20) << 2) & 0xE0)) & 0xFF;
state.scatteredDebris.clear();
let L = L_initial, deOff = 0;
for (let pair = 0; pair < 16; pair++) {
    // Byte 0: bits 0..7 walk DOWN rows 0..7 of column `pair`.
    let controlByte = CONTROL_TABLE[L];
    for (let bit = 0; bit < 8; bit++) {
        if (controlByte & (1 << bit)) {
            const tile = TILE_TABLE[deOff];
            if (tile !== 0) {
                const x = baseX + pair * 8, y = baseY + bit * 8;
                if (x >= 0 && x < 208 && y >= 0 && y < 256) {
                    state.scatteredDebris.set(`${x},${y}`, tile);
                }
            }
        }
        deOff++;
    }
    L = (L + 1) & 0xFF;
    // Byte 1: bits 0..7 walk DOWN rows 8..15 of same column.
    // (same body as above, with row = (8 + bit) * 8)
    ...
    L = (L + 1) & 0xFF;
}
```

(`col`/`row` derivation verified empirically by the §7 simulation —
e.g. window 7 has cells at `(0, 1, $32)` and `(0, 15, $42)` because
T2900[$E0]=$02 (bit 1) and T2900[$E1]=$80 (bit 7), which the
formula produces for pair=0/bit=1 and pair=0(byte1)/bit=7 respectively.)

Runtime cost: 32-iteration outer loop × 8 inner bits = 256 ops per
frame, only during the ~16 L2085-firing frames of each explosion.
Negligible at 60 Hz.

### 9.3 Per-explosion integration

| Site | Implementation |
|---|---|
| `states_mothership.js:_drawScatteredParticles` | Calls `this._walkL2085(counterA5, baseX, baseY, MOTHERSHIP_EXPLOSION_CONTROL, MOTHERSHIP_EXPLOSION_TILES)`. Driven from `state6_MothershipExplosion`'s `(a5 & 1) === 1` branch. |
| `states_player.js:_drawPlayerScatteredFrame` | Inlined walk against `PLAYER_EXPLOSION_CONTROL` + `PLAYER_EXPLOSION_TILES`. Driven from `state4_PlayerExplosion`'s `(a5 & 3) === 3` branch. |

Both write into `state.scatteredDebris` (a Map separate from
`state.fgOverlay` so the per-call region wipe doesn't clobber the
L20E8 central particle drawn on alternate frames or the mothership
bonus-score popup). `render.drawScatteredDebris` paints it as the
last FG-plane pass per frame, mirroring the source's tail-of-dispatch
write order.

`scatteredDebris.clear()` runs at three sites: at the start of every
L2085 call (source's `$20B5 LD (HL),$00` region wipe), at state-4
`a5==$20` (`L0BBA` mid-explosion ClearForeground), and at
`_motherShipBonusScore`/`_playerRespawnDecision` (explosion-end
boundaries).

---

## 10. Calibration notes

- **Anchor offsets.** The 16×16 region's canvas top-left is computed
  from the killed object's position:
  - Player: `baseX = player.x - 56`, `baseY = player.y - 88`. Lands
    the simulation's window-0 centroid (col ≈ 7.5, row ≈ 11.5 — the
    *bottom-center* of the region per T2800/T2900's data layout) on
    the player ship center.
  - Mothership: `baseX = 40`, `baseY = (beltRow - 1) * 8 - 56`. Lands
    T2A00/T2B00's window-0 centroid (col ≈ 7.5, row ≈ 7.5 — *centered*
    in the region; different table layout from the player) on the
    pilot at canvas (100, (beltRow-1)*8+4).
  Both are best-guesses from the §7-§8 simulation; the source's
  screen-ptr arithmetic (`$2071-$2079` for player, `$2415-$2419` for
  mothership) does similar `E ± const + C0` math, but the exact
  canvas offset to drop into has never been A/B'd against MAME.

- **Region edge clipping.** 16-col region × 8 px = 128 px. With
  player X ranging $0C..$C0 (12..192) and `baseX = player.x - 56`,
  the region can extend off either canvas edge — and likewise for
  mothership when the pilot is near a boundary. The walk skips
  cells outside `[0, 208) × [0, 256)`. Source presumably let writes
  wrap into adjacent screen-RAM rows; the canvas port treats wraps
  as invisible.

- **Mothership pilot tracking.** `findBeltRow(state)` scans
  `state.bgTiles` for the belt-tile row each frame, so the anchor
  `(beltRow - 1) * 8 - 56` follows the mothership as `$24E0`
  continuous-scroll drifts it down during stage B combat. Same
  helper drives the L20E8 central-particle anchor — both effects
  stay co-located on the moving pilot.

---

## 11. Cross-references

- `research_player_ship.md §2` — player explosion state-4 dispatch
  (covers the L0FC0 path that's not part of this doc's scope)
- `research_player_ship.md §2.5` — port mapping for `L2070` → `L2085`
  walk via `_drawPlayerScatteredFrame`
- `research_mothership.md §7` — mothership explosion state-6 dispatch
- `research_mothership.md §10` — port deviations list (deviations from
  earlier port iterations now resolved by this engine)
- `research_rendering.md §2.5` — sprite decode + the FG/BG plane split
- `Code.md $2085-$20E2` — the engine itself
- `Code.md $2800/$2900/$2A00/$2B00` — the four ROM data tables
