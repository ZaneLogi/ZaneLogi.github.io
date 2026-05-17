# Phoenix Bird Stages — Motion, Maturity, and Hit Detection

Source-of-truth: a local clone of the computerarcheology.com Phoenix
project (8085 disassembly produced from the original ROM).

- **Disassembly** — `Code.md` (labels like `L3400`, `T3F00`).
- **RAM map** — `RAMUse.md` (every `$4Bxx` label resolves there).

These files live in the local ComputerArcheology Phoenix clone — see
`../CLAUDE.md` for the per-PC path.

Every claim is tagged **[verified]** with an address citation, **[inferred]**
when reasoning beyond what the listing makes explicit, or **[uncertain]**
when the source itself is ambiguous.

This doc covers JT4 stages **5** and **7** (bird combat) plus the
`$32B0` bird-init that runs at the end of GameState 2, plus the
hit-detection / scoring entry points (`$38E9`, `$38F8`, `$3844`,
`$3A6E`). The spiral-fill intro stage 4 (`$2230`) is summarised here in
§7 because it directly hands off into bird init. Mothership stages
(9/A/B + GameStates 6/7) are out of scope and will get their own doc.

For top-level context — JT1 / JT4 / stage cycle — read
`research_stage_structure.md §3` first.

---

## 1. Bird-combat dispatch (`$3400`)

`$3400` is the JT4 entry for stages 5 and 7. Unlike alien combat at
`$2000` it is **not** a `Counter93` round-robin lane dispatcher — it is
a fixed per-frame sequence with one Counter9A-bit-0 parity split.

Per-frame top of `$3400` (`Code.md:$3400-$340F`):

```
3400: CALL PlayerUpdate     ; $0876 — player ship, player bullet, shield
3403: CALL $3800            ; bird collision detection (called twice; see below)
3406: CALL $2600            ; "birds vertical movement update" per comment;
                            ; first 5 bytes NOP'd, body updates $4BD2 LSB scroll
3409: CALL $3800            ; bird collision detection (second pass)
340C: CALL $3980            ; bird-vs-player relative position scan
340F: LD   A,($43BB)        ; BirdsLeft
3412: AND  A
3413: JP   Z,$3462          ; if BirdsLeft == 0: stage-clear tail
3416: CP   $04
3418: JP   NC,$3438         ; if BirdsLeft >= 4: parity split branch
```

[verified, `Code.md:$3400-$3418`]

### 1.1 BirdsLeft < 4 — both halves every frame (`$341B`)

When `BirdsLeft` is in `1..3` the handler runs both half-flock updates
every frame (no parity split) — this is the analogue of the alien
"`AliensLeft<5` flag" path, but here it is implicit from the count
comparison rather than a separate latch:

```
341B: CALL DrawFirst4BirdObjects   ; $3474 — birds 0..3 movement + render
341E: CALL DrawSecond4BirdObjects  ; $3486 — birds 4..7 movement + render
3421: CALL $3560                   ; randomize / re-pick movement (§3.2)
3424: CALL $3498                   ; per-bird $35B0 dispatch for birds 0..3
3427: CALL $34AA                   ; per-bird $35B0 dispatch for birds 4..7
342A: LD   A,($439B)               ; Counter9A+1 (high byte)
342D: RRCA
342E: JP   C,$0FC0                 ; killed-alien/bird animation (lane gated)
3431: CALL $3930                   ; bird-bullet / player-relative scan
3434: JP   EnemyBulletUpdate       ; $0C40 — alien-bullet update
```

So when only a few birds are left, every frame updates both flock
halves and both run-routine dispatches. `$0FC0` is the same
explosion-update routine the alien path uses (see
`research_enemy_motion.md §1.0.5`) and it only ticks on `Counter9A+1`
bit-0 == 1.

[verified, `Code.md:$341B-$3434`]

### 1.2 BirdsLeft >= 4 — parity-split frames (`$3438`)

When all (or most) birds are alive, the work splits across two frames
via `Counter9A+1` bit 0:

```
3438: LD   A,($439B); RRCA; JP C,$3452 ; odd-parity branch
343F: CALL DrawFirst4BirdObjects       ; even: birds 0..3
3442: CALL $3560                       ; randomize
3445: CALL $3498                       ; $35B0 dispatch for birds 0..3
3448: CALL $3930
344B: JP   EnemyBulletUpdate
;
3452: CALL DrawSecond4BirdObjects      ; odd: birds 4..7
3455: CALL $3560
3458: CALL $34AA                       ; $35B0 dispatch for birds 4..7
345B: JP   $0FC0                       ; killed-alien/bird animation
```

So in normal play **half the flock is drawn per frame** (30 Hz per
half), and on the odd parity frame the `$0FC0` explosion animation
also runs (vs. even-frame `EnemyBulletUpdate` for alien bullets).

[verified, `Code.md:$3438-$345B`]

### 1.3 Stage-clear tail (`$3462`)

```
3462: LD   A,($439B); RRCA; RET C    ; only do work on even frames
3467: CALL EnemyBulletUpdate          ; $0C40 — finish bullets in flight
346A: CALL $0FC0                      ; finish explosion animations
346D: JP   $2204                      ; stage-clear countdown ($43B6)
```

When `BirdsLeft` underflows to 0 (all birds destroyed), control
reaches `$3462`; the remaining bullet/explosion sprites continue
ticking and the per-stage countdown at `$43B6` decrements through
`$2204`. Stage advances when `$43B6 < $A0` (~96 frames after kill).

[verified, `Code.md:$3462-$346D`. The `$2204` exit path is documented
in `research_stage_structure.md §5.2`.]

### 1.4 Big-picture comparison to alien `$2000`

| Property                  | Alien combat (`$2000`)              | Bird combat (`$3400`)                 |
|---------------------------|--------------------------------------|---------------------------------------|
| Dispatch scheme           | 4-lane round-robin via `Counter93`  | Fixed sequence + Counter9A bit-0 split |
| Movement/animation cadence| Round-robin lane-1/lane-2 (4-frame) | First/second-4-birds per parity (2-frame) |
| Population               | 16 aliens, decremented              | 8 birds, decremented                  |
| Speed-up when depleted   | `$435E AliensLeft<5` flag           | Implicit: `BirdsLeft < 4` skips parity split |
| Per-frame `$0C40`         | yes (via lane 3)                    | yes (via top-level CALL)              |
| Stage-clear countdown     | `$43B4` (decremented in `$0834`)    | `$43B6` (decremented in `$2204`)      |
| Movement source          | T1000/T1700 path tables             | Parametric, T3E80-modulated (§3)     |
| Animation source         | T1600 / shape cycle                 | Maturity bitfield → shape table (§4) |

The bird path is closer in spirit to "decremented per-frame
oscillators with shape derived from a global maturity byte" than to
the alien path's path-table playback. A port should not try to share
the dispatcher.

---

## 2. Per-stage init for birds — `$32B0`

`$32B0` is the tail of GameState 2 (`Code.md:$052F`), unconditionally
called at the end of every state-2 init. For non-bird stages it does
its `$4350-$437F` and `$439A-$439D` zero-fill and then hits the
`BirdsLeft == 0` early-return; for bird stages it continues into the
table copy.

```
32B0: LD   HL,$4350; LD B,$30; CALL ClearBbytesAtHL   ; zero $4350..$437F
32B8: LD   L,$9A;  LD B,$04; CALL ClearBbytesAtHL    ; zero $439A..$439D
32BF: LD   A,($43BB); AND A; RET Z                    ; no birds → done
32C4: RLCA × 3                                        ; C = BirdsLeft * 8
32C7: LD   C,A
32C8: LD   HL,$4B70; LD B,$40; CALL ClearBbytesAtHL  ; zero entire $4B70..$4BAF
32D0: LD   D,$4B; LD H,$3F                            ; DE -> bird struct, HL -> $3Fxx
32D4: LD   A,$40; SUB C; ADD $70; LD E,A              ; DE := $4B70 + (8 - BirdsLeft)*8
32DA: ADD  $10; LD L,A                                ; HL := $3F + (8 - BirdsLeft)*8 + $10
32DD: LD   B,C                                        ; copy BirdsLeft * 8 bytes
32DE: LD   A,($43B8); RRCA × 2                       ; bit 2 → carry
32E3: JP   NC,$05E0                                  ; bit2=0 → copy from T3F80
32E6: LD   A,L; ADD $40; LD L,A                       ; advance H:L by $40
32EA: JP   $05E0                                     ; bit2=1 → copy from T3FC0
```

[verified, `Code.md:$32B0-$32EA`]

Two important details a port can miss:

1. **The struct is zeroed first** (`$32C8 ClearBbytesAtHL B=$40`),
   then a partial copy lands new bytes only for the *currently alive*
   birds — so a bird that died in stage 5 is **not** revived for stage
   7. The "8 bytes × BirdsLeft" copy starts at `$4B70 + (8 -
   BirdsLeft) * 8`, i.e. it fills from the **end** of the bird array
   and leaves the leading slots cleared. Mirror this in the port.
   [verified by tracing the address arithmetic at `$32D4-$32DC`.]

2. **Table selection is bit 1 of `$43B8 LevelAndRound`** — resolved
   2026-05-17 by re-tracing `$32E1-$32E3`. The two RRCAs walk bits
   `0` and `1` of A through carry; after both, carry holds the
   *original* bit 1 of LevelAndRound. `JP NC,$05E0` then picks the
   first table when bit 1 == 0:
   - Stage 4 (`0100`) bit 1 = 0 → copies T3F80 (bird wave 1)
   - Stage 5 (`0101`) bit 1 = 0 → copies T3F80 (bird wave 1)
   - Stage 6 (`0110`) bit 1 = 1 → copies T3FC0 (bird wave 2)
   - Stage 7 (`0111`) bit 1 = 1 → copies T3FC0 (bird wave 2)

   This matches the Code.md labels' "level 3/8" vs "level 4/9"
   distinction (Computerarcheology level numbering is offset from JT4
   stage nibble — their "level 3" = our stage 4-5 pair, their "level 4"
   = our stage 6-7 pair).

   `$32B0` only runs the copy if `BirdsLeft > 0`, which is gated by
   the `T1760` partition at the *prior* `$2204` exit
   (`research_stage_structure.md §4.2`). T1760[2] and T1760[3] = $88
   → BirdsLeft = 8 for the stage 4-7 range; other stages get
   AliensLeft instead and bypass the copy. [verified.]

### 2.1 T3F80 — "level 3/8" bird-init table

64 bytes, 8 birds × 8 bytes each (`Code.md:$3F80-$3FBF`):

```
3F80: 01 48 EE 00 10 B0 10 20     ; bird 0
3F88: 01 49 2C 00 10 A0 00 B0     ; bird 1
3F90: 01 49 6A 00 10 90 00 B8     ; bird 2
3F98: 01 49 A8 00 10 80 00 C0     ; bird 3
3FA0: 01 49 E6 00 10 70 00 C8     ; bird 4
3FA8: 01 4A 24 00 10 60 00 C8     ; bird 5
3FB0: 01 4A 62 00 10 50 00 C8     ; bird 6
3FB8: 01 4A A0 00 10 40 00 C8     ; bird 7
```

[verified, `Code.md:$3F80-$3FBF`]

### 2.2 T3FC0 — "level 4/9" bird-init table

```
3FC0: 01 4A CE 00 10 38 00 B0     ; bird 0
3FC8: 01 48 CC 00 10 B8 10 20     ; bird 1
3FD0: 01 4A CA 00 10 38 00 B8     ; bird 2
3FD8: 01 48 C8 00 10 B8 10 18     ; bird 3
3FE0: 01 4A C6 00 10 38 00 C0     ; bird 4
3FE8: 01 48 C4 00 10 B8 10 10     ; bird 5
3FF0: 01 4A C2 00 10 38 00 C8     ; bird 6
3FF8: 01 48 C0 00 10 B8 10 08     ; bird 7
```

[verified, `Code.md:$3FC0-$3FFF`]

The two tables share the same 8-byte stride. Selection is bit 1 of
LevelAndRound (resolved in §2 note 2 above): wave 1 (stages 4/5) →
T3F80; wave 2 (stages 6/7) → T3FC0.

### 2.3 The "(8 - BirdsLeft) × 8" trailing-slot offset

`$32D4-$32DD` computes the source-table start and destination-struct
start so that the trailing `BirdsLeft` slots get fresh data:

| BirdsLeft | `C` (`= 8*BirdsLeft`) | `DE` (dest) | `HL` (src, wave 1)|
|-----------|------------------------|-------------|--------------------|
| 8         | `$40`                  | `$4B70`     | `$3F80`            |
| 5         | `$28`                  | `$4B88`     | `$3F98`            |
| 1         | `$08`                  | `$4BA8`     | `$3FB8`            |

So slots `0..(8 - BirdsLeft - 1)` stay zeroed (dead birds) and the
fresh data lands in slots `(8 - BirdsLeft)..7`. In normal play this
behaviour is mostly invisible because `$2204` resets BirdsLeft to 8
at every transition — but it's load-bearing in the debug-start path
(§9.0) where state-0 → state-2 runs without going through `$2204`.

### 2.3 Per-bird byte structure (8 bytes, parsed from $34C0 + $35B0)

Drawing from `DrawBirdObject $34C0` and `$35B0` we can decode the
8-byte struct field-by-field:

| Offset | Init from T3F80 byte 0 (bird 0) | Role                                                              | Updated by             |
|--------|---------------------------------|-------------------------------------------------------------------|------------------------|
| +0     | `$01`                           | Shape index (0 = inactive slot; else index into T3F00 + T3EC0)    | $35B0 maturity routines, kill paths |
| +1     | `$48`                           | MSB of screen-RAM address for this bird's top tile                | init; updated by $35E0 main-path "carry to MSB" branch ($35FE-3602 / $3642-3647) |
| +2     | `$EE`                           | LSB of screen-RAM address (decreased by $20 / increased by $20 in $35E0 sweep) | $35E0 ($35F9-$35FD / $363D-$3641) |
| +3     | `$00`                           | **Animation-phase counter** — cycled 0..7 by $36C0 motion (`bird[3] = (bird[3]+1) & 7` on even-advanceCtr frames) | $36C0 ($36C3-$36C8) |
| +4     | `$10`                           | **Maturity-advance gate counter** — decremented by `$35B0` once per dispatch; gates the maturity OR-bit when it hits 0 | $35B0 ($35BD `DEC (HL)`); reset by maturity routines |
| +5     | `$B0`                           | **Grid X / sweep-amplitude accumulator** — modified by $35E0 (`bird[5] += bird[6]` main path; `bird[5] -= bird[6]&$0F` alt path) | init; $35E0 |
| +6     | `$10`                           | **Per-bird movement-step value.** `< $10` → $35E0 small-step path; `>= $10` → $35E0 jumps to $3628 step-back path; `& $0F == 0` is the gate for $36EA / $370A maturity advance. Updated by L3604/L3648/L3663/L3744. | init; $35E0 + helpers |
| +7     | `$20`                           | Grid Y / sweep target — read by $35E0 L3604 ($360A) and L3648 ($364B) to drive horizontal sweep amplitude | init; possibly $35E0/$3628 helpers (not fully walked) |

[all fields [verified] from $35B0 + $35E0 + $36C0 source walks 2026-05-17.]

The "shape index" at +0 is the **per-bird payload of the global
maturity bitfield**: initial value `$01` means "egg, level 1". The
four maturity-advance routines (§4) write different bit-OR'd values
back into +0 of the bird struct under different conditions, advancing
the bird through "egg → growing → adult" shapes.

---

## 3. Bird movement randomizer (`$3560`)

`$3560` runs once per frame in `$3400` (or per parity-half) and
re-picks the active T3E80 lookup parameters. Per-frame work:

```
3560: CALL GetRandomNumber             ; A = pseudo-random byte
3563: LD   B,A; RLCA RLCA; LD C,A      ; C = A << 2
3567: RLCA RLCA; OR B                  ; A = (A<<4) | A  (mix bits)
356A: LD   ($436F),A                   ; M436F = random byte
356D: LD   A,($43B8)                   ; LevelAndRound
3570: CP   $40
3572: JP   C,$3577                     ; if round < 4, use raw value
3575: LD   A,$30                       ; cap round contribution at $30
3577: AND  $30; RRCA                   ; bits 5..4 → bits 4..3 of B
357A: LD   B,A
357B: LD   A,($43BB); DEC A            ; BirdsLeft - 1
357F: CP   $04
3581: JP   C,$3586
3584: LD   A,$03                       ; cap density at 3
3586: RLCA; OR B; LD B,A               ; B = (round*16 << 1) | ((min(BirdsLeft-1,3)) << 1)
3589: LD   A,($439A); RLCA RLCA        ; Counter9A
358C: AND  $20                         ; bit 3 of Counter9A → bit 5 of B
358E: ...                              ; (truncated — final OR + table index)
```

[verified, `Code.md:$3560-$358E`]

This is **not** per-bird movement code — it picks a global T3E80 index
that affects how the maturity dispatch routes for the whole flock this
frame. Individual birds still execute their own L35B0-driven update.

`$30AA GetRandomNumber` is the engine's standard PRNG (used by alien
swoop selection at `$315A`). Reuse the existing port's `randomByte()`.

The cap at `LevelAndRound >= $40` (round 4 and up) matches
`research_stage_structure.md §8.1`: round-4 freezes the round
contribution to the bird-shape table.

---

## 4. Maturity advance — `M4368` and the maturity-advance routines

The global byte `$4368` (`RAMUse.md:M4368`, "Maturity of the birds.
From 'egg' over 'no wings' to 'adult' ($01 to $0F)") is the
**flock-wide maturity state**. It is updated by routines pointed at
by `T3F00[shape][4..5]` (the "first call" address, which fires
SECOND in dispatch order — see §5.1). Each routine OR's a different
bit (or no bit, for the inert $36CC variant):

| Routine | OR bit | Resulting maturity   | Used by shapes              |
|---------|--------|----------------------|------------------------------|
| `L36D2` | `$01`  | egg                  | 1, 2, 3                     |
| `L36EA` | `$02`  | growing wings        | 4, 5, 8, 9, B, E            |
| `L370A` | `$04` (+ optional `$08` via override) | late immature → adult | 6, 7, A, F |
| `L36CC` | (none) | inert / unwind only  | C, D                        |

[verified — T3F00 walked end-to-end `Code.md:$3F00-$3F7F`; bit-OR
values explicit at $36E1/$3701/$3721/$3739.]

### 4.1 The gate logic

All three active routines start by popping the stack (recovering B,
C, D, E from `T3F00[shape][0..3]` and the bird+4 pointer), then
gate-check the bird's `advanceCtr` (offset +4):

```
LD A,(HL)           ; HL = bird+4; A = advanceCtr
AND A; RET NZ       ; return if advanceCtr != 0 — too early
```

`$36EA` and `$370A` add a second gate on `bird[+6] & $0F == 0`:

```
INC L × 2           ; HL = bird+6
LD A,(HL); AND $0F
RET NZ              ; low nibble of bird[+6] must be 0
DEC L × 2           ; back to bird+4
```

### 4.2 The write block (shared)

When both gates pass:

```
LD (HL),B           ; bird[+4] := B  (= T3F00[0], new advance counter)
DEC L × 4           ; HL = bird+0
LD (HL),D           ; bird[+0] := D  (= T3F00[2], new shape)
LD A,($4368); OR <bit>; LD ($4368),A   ; OR the routine's bit into M4368
RET                 ; (or fall through to $370A override; see §4.3)
```

### 4.3 `$370A` override path (the only OR-$08 fire site)

After `$370A` does its core write (OR $04), it tests one more gate:

```
3726: LD A,($436F)        ; A = M436F (bit-mixed PRNG byte from $3560)
3729: AND E                ; A = M436F & E (where E is T3F00[shape][3])
372A: AND $F0               ; A &= $F0
372C: RET NZ                ; return if result is non-zero — skip override
```

If `(M436F & E) & $F0 == 0`, the override fires:

```
372D: LD A,E; AND $0F       ; A = E low nibble (new shape from byte 3)
372F: LD (HL),A             ; bird[+0] := A   (override the shape just written)
2C 2C 2C 2C                 ; INC L × 4 → bird+4
LD (HL),C                   ; bird[+4] := C   (override advance counter; C = T3F00[1])
LD A,($4368); OR $08; LD ($4368),A   ; OR $08 into M4368 (adult bit)
RET
```

So `$370A` can produce two distinct transitions per call: a "normal"
advance (bit 2 set, shape from D = T3F00[2]) or an "override" advance
(bit 3 also set, shape from E low nibble = T3F00[3] & $0F). The
override choice is gated by the M436F & E mask — with `$3560`
producing varied M436F bytes each frame, the override fires
probabilistically per bird.

### 4.4 Cleanup

The bonus-explosion cleanup at `$3A37` writes `M4368 := $00` on every
bird kill, resetting the flock-wide maturity to "no shapes
available." Surviving birds re-spawn into the egg shape next time
they reach the maturity-advance gate. [verified.]

---

## 5. T3F00 dispatch and T3E80 shape table

### 5.1 T3F00 — per-shape dispatch entries

Each entry in `T3F00` is **8 bytes**: 4 register values (B, C, D, E)
plus 2 routine pointers (each 2 bytes, written little-endian). The
entries are indexed by bird shape (offset +0); `$35B0` does
`shape << 3` to compute the entry base.

```
3F00: FF FF FF FF FF FF FF FF        ; index 0 — unused (means "slot empty")
3F08: 20 FF 02 FF 36 D2 36 C0        ; index 1 — B=$20,C=$FF,D=$02,E=$FF → call L36D2 then L36C0
3F10: 20 FF 03 FF 36 D2 35 E0        ; index 2 — B=$20,C=$FF,D=$03,E=$FF → call L36D2 then L35E0
3F18: ...
```

[verified, `Code.md:$3F00-$3F7F` walked 2026-05-17.]

#### Full T3F00 table

| Shape | B    | C    | D    | E    | bytes 4..5 (maturity) | bytes 6..7 (motion) |
|-------|------|------|------|------|------------------------|----------------------|
| 0     | `FF` | `FF` | `FF` | `FF` | — | — (slot empty)             |
| 1     | `20` | `FF` | `02` | `FF` | `$36D2` (OR $01)       | `$36C0` (anim cycle) |
| 2     | `20` | `FF` | `03` | `FF` | `$36D2`                | `$35E0` (sweep)      |
| 3     | `30` | `FF` | `04` | `FF` | `$36D2`                | `$35E0`              |
| 4     | `10` | `FF` | `05` | `FF` | `$36EA` (OR $02)       | `$35E0`              |
| 5     | `10` | `FF` | `06` | `FF` | `$36EA`                | `$36C0`              |
| 6     | `10` | `60` | `07` | `1F` | `$370A` (OR $04 + maybe $08) | `$36C0`        |
| 7     | `F0` | `10` | `0B` | `1A` | `$370A`                | `$36C0`              |
| 8     | `40` | `FF` | `04` | `FF` | `$36EA`                | `$36C0`              |
| 9     | `10` | `FF` | `08` | `FF` | `$36EA`                | `$36C0`              |
| A     | `40` | `10` | `0F` | `17` | `$370A`                | `$36C0`              |
| B     | `10` | `FF` | `0A` | `FF` | `$36EA`                | `$35E0`              |
| C     | `FF` | `FF` | `FF` | `FF` | `$36CC` (no-op)        | `$35E0`              |
| D     | `FF` | `FF` | `FF` | `FF` | `$36CC`                | `$35E0`              |
| E     | `10` | `FF` | `06` | `FF` | `$36EA`                | `$35E0`              |
| F     | `10` | `10` | `07` | `79` | `$370A`                | `$35E0`              |

#### Dispatch call order

Source `$35B0` builds a stack frame in this order:

```
push (B, C)           ; T3F00 bytes 0,1 — payload pair 1
push (D, E)           ; T3F00 bytes 2,3 — payload pair 2
push maturity_addr    ; T3F00 bytes 4,5 — first call's return addr
push motion_addr      ; T3F00 bytes 6,7 — second call's return addr
RET                   ; pops motion_addr → PC = motion routine
```

So **motion fires first**, maturity second. When motion RETs, it
pops `maturity_addr`. The maturity routine starts with `POP DE / POP
BC / POP HL` to recover the payload pairs and the saved bird+4
pointer.

#### Port shape

The port skips the stack-PUSH/RET trick — plain function call
sequence using `BIRD_T3F00` as a packed byte array:

```js
const base = shape << 3;
const b = T3F00[base + 0], c = T3F00[base + 1];
const d = T3F00[base + 2], e = T3F00[base + 3];
const maturityAddr = (T3F00[base + 4] << 8) | T3F00[base + 5];
const motionAddr   = (T3F00[base + 6] << 8) | T3F00[base + 7];
// Call order: motion first, then maturity.
motionRouter[motionAddr](bird);
maturityRouter[maturityAddr](bird, b, c, d, e);
```

### 5.2 T3E80 — bird shape/motion lookup

`Code.md:$3E80-$3EBE` — 31 16-bit entries (62 bytes, then padding):

```
3E80: 05 40    ; entry 0  — shape $05, delta $40
3E82: 05 20    ; entry 1
3E84: 04 30
3E86: 04 10
3E88: 06 48    ; (commented "not used?")
3E8A: 06 28
...
3EBE: 08 60
```

[verified bytes through entry 31 in the disassembly. Some entries are
flagged "not used?" by Computerarcheology, suggesting Phoenix never
selects those random+round+density combinations in normal play.]

Indexed via the bit-packed value `$3560` computes from
`LevelAndRound`, `BirdsLeft`, `Counter9A`, and the PRNG. Each entry
gives (shape, delta) — shape goes back into a bird's offset +0; delta
feeds into the motion routine via `T3F00` entry's `C`/`E` slot.

### 5.3 T3EC0 — shape → draw-routine entry LSB

`DrawBirdObject $34C0` adds `$C0` to the shape index and reads from
`T3EC0` (`Code.md:$3EC0` onwards) the **LSB of the entry point into
the unrolled draw routine at `$3520+`**. The entry LSB encodes the
**column count** of the sprite (all bird sprites are 2 tile-rows
tall, varying in width):

| T3EC0 LSB | Entry        | Cols × rows | Pixels   |
|-----------|--------------|-------------|----------|
| `$20`     | `Draw7x2`    | 7 × 2       | 56 × 16  |
| `$28`     | `Draw6x2`    | 6 × 2       | 48 × 16  |
| `$30`     | `Draw5x2`    | 5 × 2       | 40 × 16  |
| `$38`     | `Draw4x2`    | 4 × 2       | 32 × 16  |
| `$40`     | `Draw3x2`    | 3 × 2       | 24 × 16  |
| `$48`     | `Draw2x2`    | 2 × 2       | 16 × 16  |
| `$50`     | `Draw1x2`    | 1 × 2       |  8 × 16  |

Each entry block is 8 bytes; `width = (0x58 - lsb) >> 3`. The entries
fall through sequentially (Draw7x2 → Draw6x2 → … → Draw1x2 → blank
tail at $3558), so entering at a later LSB just runs fewer columns.

#### T3EC0 raw bytes

```
3EC0: FF                                  ; index 0 — slot empty
3EC1: 48 40 40 40 38 30 28 38 30 28 20 30 20 30 28
       ^1 ^2 ^3 ^4 ^5 ^6 ^7 ^8 ^9 ^A ^B ^C ^D ^E ^F
```

Decoded per shape (matches the disassembler annotation):

| Shape | LSB | Cols × rows |
|-------|-----|-------------|
| 1     | `$48` | 2 × 2 (egg/star) |
| 2     | `$40` | 3 × 2 |
| 3     | `$40` | 3 × 2 |
| 4     | `$40` | 3 × 2 |
| 5     | `$38` | 4 × 2 |
| 6     | `$30` | 5 × 2 |
| 7     | `$28` | 6 × 2 |
| 8     | `$38` | 4 × 2 |
| 9     | `$30` | 5 × 2 |
| A     | `$28` | 6 × 2 |
| B     | `$20` | 7 × 2 (full wings) |
| C     | `$30` | 5 × 2 |
| D     | `$20` | 7 × 2 |
| E     | `$30` | 5 × 2 |
| F     | `$28` | 6 × 2 |

So the visible sprite size grows from a small star (2 cols, shape 1)
up to a fully spread bird (7 cols, shapes B and D).

### 5.4 T3E08 — anim-frame address table

`Code.md:$3E00..$3E7F` — 128 bytes. The first 8 bytes (`$3E00..$3E07`)
are an unrelated bit-mask preamble (`01 02 04 08 10 20 40 80`); the
actual address table starts at the labelled `T3E08`. Index formula
from `$34D4-$34D7`:

```
tIdx = ((shape << 3) + bird[+3]) & 0x7E
addr = (T3E08[tIdx] << 8) | T3E08[tIdx + 1]
```

So 4 distinct anim frames per shape are reachable (because `bird[+3]`
cycles 0..7, but bit 0 is masked off → effective frame index = `(bird
[+3] >> 1) & 3`). Frames map to "egg → cracking → wings growing →
wings spread" for the early shapes, and "wings down → wings up → no
wings → wings flapping" for the later shapes.

Per the source annotations the address space referenced spans
`$3C00..$3DB7` — the **tile-data ROM** lives in this range and is
extracted as `BIRD_TILE_DATA` (port name) at `data.js`.

#### Tile-data layout

Each sprite is `N × 2` tiles (N from §5.3). Tile bytes are laid out
**column-major in pairs** so the draw routine (which walks `INC HL`
for row-step, then `ADD HL,$FFDF` = right-1-col + up-1-row for the
next column) emits them in the order it expects:

```
[col0_row0, col0_row1, col1_row0, col1_row1, ..., colN_row0, colN_row1]
```

A "tile byte" of `$00` is the BG-plane blank tile and is skipped by
the draw routine in source (well, source writes it as `$00` to screen
RAM, which is the implicit "no tile" state). Port also skips
zero-tile draws so wing tips render correctly against the starfield.

Birds are drawn into the **BG plane** in source (`$48XX-$4BXX`
addresses), so tile codes look up `resource.bgTileImages`, not the FG
table.

### 5.5 Per-bird update code flow

End-to-end flow of one `$35B0` dispatch for one bird. Phoenix runs on
the 8085 (Z80-compatible assembly mnemonics; same family). Labels in
the diagram refer to `Code.md` addresses; values in `( )` are RAM
fields read or written.

```
              birdUpdate(bird)        [$35B0 PER-BIRD DISPATCHER]
                    │
              ┌─ shape == 0 ? ─yes─▶ RET (slot empty)
              │ no
              ▼
              DEC advanceCtr (if != 0)
              │
              ▼
        T3F00[shape] → (B, C, D, E, maturityAddr, motionAddr)
              │
              ▼
       ┌──────┴──────────────────────────────────────────┐
       │  PUSH B,C  PUSH D,E  PUSH maturityAddr          │
       │  PUSH motionAddr     RET → motionAddr fires     │
       │  (motion returns → pops maturityAddr → fires)   │
       └──────┬──────────────────────────────────────────┘
              │
              ▼
     ╔════════╧═══════════╗            ╔════════════════════════╗
     ║ MOTION ROUTINE     ║            ║ MATURITY ROUTINE       ║
     ║ (fires FIRST)      ║            ║ (fires SECOND)         ║
     ╚════════╤═══════════╝            ╚════════════════════════╝
              │
        ┌─────┴──────────────────────┐
        ▼                             ▼
    $36C0 (anim cycle)           $35E0 (sweep motion)
    shapes 1,5,6,7,8,9,A         shapes 2,3,4,B,C,D,E,F
        │                             │
        ▼                             ▼
  if (advanceCtr & 1): RET    field6 >= $10 ?
  field3 = (field3+1) & 7     ┌──── yes ──── no ───┐
  RET                         ▼                    ▼
                       $3628 ALT PATH        MAIN PATH (in $35E0)
                       (move LEFT)           (move RIGHT)
                              │                    │
                              ▼                    ▼
                       a = field6 & $0F      B = field6
                       a == 0 ? ──yes──┐     gridX += B
                       │ no            │     field3 += B
                       ▼               ▼     (field3+B) < 8 ?
                  gridX -= a       $3744    ┌── yes ── no ──┐
                  field3 -= a      ┌──┐     ▼               ▼
                  borrow on        │f6:│  $366A          wrap field3
                  field3 -= a ?    │$11│  (no col step)   screenLsb -= $20
                  ┌─yes─┐ no       │gX↓│  if (B != 0):    (borrow → MSB--)
                  │     │          │f3:│      RET         fall to $3604
                  ▼     ▼          │$07│  field6++              │
              wrap     $3695       │LSB│  RET                   ▼
              field3   target chk  │+$20│                  $3604 (main tail)
              LSB+=$20 (gY==gX?)   └──┘                    ┌────────┐
              (carry   ┌yes─┐ no                           │ field6 │
              → MSB++) │    │                              │ = $10  │
              fall to  │    └─▶ RET                        │ (tent. │
              $3648    ▼                                   │ switch │
              │     field6 = 0                             │ to alt)│
              ▼     B = max(gX, playerX&F8)                └────────┘
        $3648 │     M436D += 8                                  │
        ┌──┐ │     a = M436D_pre + 8 + B                       ▼
        │f6│  │     gridY = $C8                          diff = gridY-gridX
        │= │  │     if (carry|a>=$C8): RET               │
        │new│  │     gridY = a                          ▼ if 0:
        │val│  │                                       $3672 ← pick new
        │|  │  │                                       │       target X:
        │$10│  │                                       │       B = min(gX,pX&F8)
        └──┘  │                                       │       M436D += 8
              │                                       │       a = B - M436D_pre
              ▼                                       │       gridY = $08
            RET                                       │       (or a if valid)
                                                      ▼ else:
                                                  a = (diff-1) RRCA×3 & $1F
                                                  field6 = a+1
                                                  if cpBorrow: RET
                                                  field6 = M436E
                                                  if M436E==B: RET
                                                  field6 = B+1
                                                  RET

  ─── then maturity routine runs ───

  ┌─────────────────────────────────────────────────────────────┐
  │ MATURITY (gates on advanceCtr == 0, picks new shape from D) │
  ├─────────────────────────────────────────────────────────────┤
  │  $36D2 (shapes 1,2,3):                                       │
  │      gate: advanceCtr == 0                                   │
  │      → advanceCtr := B; shape := D; M4368 |= $01             │
  │                                                              │
  │  $36EA (shapes 4,5,8,9,B,E):                                 │
  │      gates: advanceCtr == 0 AND (field6 & $0F) == 0          │
  │      → advanceCtr := B; shape := D; M4368 |= $02             │
  │                                                              │
  │  $370A (shapes 6,7,A,F):                                     │
  │      gates: advanceCtr == 0 AND (field6 & $0F) == 0          │
  │      → advanceCtr := B; shape := D; M4368 |= $04             │
  │      → override gate: ((M436F & E) & $F0) == 0 ?             │
  │            yes → shape := E & $0F; advanceCtr := C;          │
  │                  M4368 |= $08                                │
  │                                                              │
  │  $36CC (shapes C, D):  POP+RET only (no maturity advance)    │
  └─────────────────────────────────────────────────────────────┘
```

#### Key state transitions

```
SHAPE PROGRESSION (via maturity engine):
   1  →  2  →  3  →  4  →  5  →  6  →  7  →  B  →  ...
  egg            small bird       full wings spread
   │                              │
   │   ($36D2)         ($36EA)    │      ($370A normal)
   │←─── OR $01 ────── OR $02 ────│
   │                              │      ($370A override)
   │                              ├─ randomly → F (via E & $0F)
   │                              └─ randomly → others
   ↑                                            │
   └────  wing hit ────────────────────────────┘
          (port-side: bird.shape := 1)

MOTION PATH OSCILLATION (via $35E0 dispatch):
                      ┌──────────────────────────┐
                      │                          │
                      ▼                          │
              MAIN path (move RIGHT)             │
              field6 < $10                       │
              every anim wrap (field3 → 8):      │
                  screenLsb -= $20               │
                  call $3604                     │
                  $3604 picks next field6        │
              if gridX == gridY → $3672          │
                  → pick new gridY target        │
                  → field6 stays $10             │
                                                 │
              field6 ≥ $10  ────────────────────┘
                                                 │
                      ▼                          │
              ALT path (move LEFT)               │
              every anim borrow (field3 < B):    │
                  screenLsb += $20               │
                  fall to $3648                  │
                  $3648 picks next field6 | $10  │
              if no anim-borrow → $3695          │
                  if gridX == gridY:             │
                      field6 := 0  ─────────────┘
                      pick new gridY target
```

#### Cadence

- `$35B0` is called once per bird via `$3498` (birds 0..3) or
  `$34AA` (birds 4..7) — invoked from `$3400` based on Counter9A+1
  bit 0 (= alternating frames). So each bird gets motion + maturity
  every other frame ≈ 30 Hz per bird.
- One advance step (`$36D2`/`$36EA`/`$370A`) fires when
  `advanceCtr` reaches 0, then resets to B (= T3F00[shape][0]).
  Typical advance counters are `$10`-`$40`, so each shape lasts
  16-64 motion ticks ≈ 0.5-2 seconds.
- `$35E0` motion produces a horizontal column step (`screenLsb ±=
  $20`) every time `field3` wraps the 8-bit anim counter, which
  happens every ⌈8 / field6⌉ motion ticks.

---

## 6. Hit detection — `$3800`, `$38E9`, `$3844`, bonus path

### 6.1 Wing-hit entry (`$38E9`)

```
38E9: LD A,$FF
38EB: LD ($4366),A             ; M4366 := $FF (mothership/bird-wing-hit flag)
38EE: LD BC,$0702              ; B=$07 (slot payload), C=$02 (score delta)
38F1: JP $38F8                 ; → shared explosion-spawn allocator
```

[verified, `Code.md:$38E9-$38F1`]

So a wing-hit raises `M4366` and queues an entry in the alien/bird
kill-explosion array `$4370-$437F` (see `research_enemy_motion.md
§1.0.5`). The "200-pt bonus" wiring already in
`spawnBonusExplosion()` is reused here unchanged — step 11 just
needs to invoke it from the bird collision code.

### 6.2 Allocator (`$38F8 / $38FB`)

```
38F8: LD HL,$4370              ; start of alien-explosion array
38FB: XOR A; CP (HL); JP Z,$3906   ; if slot[0].animFrame == 0, take it
3900: INC L × 4                ; else advance to next slot
3904: CP (HL); RET NZ          ; if also occupied, give up
3906: LD (HL),B                ; install B in slot.animFrame
3907: ...                      ; (truncated — fills the rest of the 4-byte slot)
```

[verified, `Code.md:$38F8-$3906`]

This is the shared "first-free of two slots" allocator used by all
alien-kill and bird-kill animations. The port already exports
`spawnExplosion(animFrame, scoreBcd)` (see `research_enemy_motion.md
§1.0.5`) — wing-hits go through that with `(animFrame=$07,
scoreBcd=$02)`.

### 6.3 Body-hit / bonus-explosion path (`$3844`)

When a bird is killed outright (body hit, not just wing), `$3800`
calls `$3844` and the bonus-explosion machinery already ported in
step 10.7 fires:

```
3844: ADD $60; LD L,A; LD H,$3B    ; T3B60[bullet_mask_byte]
3849: LD A,(HL); AND C; RET Z      ; tile-mask vs bullet pixel; miss → return
384C: CALL $38A1                    ; "anti-piracy" check + erase via T17F0
384F: EX DE,HL                      ; HL = bird's screen-RAM addr
3850: LD A,(HL); LD (HL),$00        ; A = current tile; clear the BG cell
3853-7: INC L × 4; LD D,(HL)        ; D = bird's E-state byte
3858: POP HL
3859: LD HL,$43BB
385C: DEC (HL)                      ; BirdsLeft--
385D-388D:                          ; score scaling based on (A from tile read)
                                    ;   < $0B → JP $3894: alien-slot, scoreBcd=$05 (50 pts), M4364 := $FF
                                    ;   ≥ $0B → bonus slot, BC=$1010 init then scaled:
                                    ;     == $0F → keep BC=$1010 → 100 pts
                                    ;     == $0E → C = ((D >> 1) & $7C) + $30
                                    ;     ≥ $0C → C >>= 1
                                    ;     <  $0C → C >>= 2
388D: JP $38FB                       ; populate first-free slot
```

On the bonus-explosion-animation END (`$3A37`, after the slot counter
reaches 0 and the explosion sprite has finished playing):
- `M4368 := $00` (reset flock maturity — the "egg recovery" effect)
- `M4366 := $00` (clear mothership/bird-wing-hit flag)

[verified, `Code.md:$3844-$388D` walked 2026-05-17. The
collision-detection in `$3800` is **tile-mask based** via T3B60 (read
the bird's tile from BG screen RAM, AND with a bullet-sub-cell mask
from $3E00, hit if non-zero) — fundamentally incompatible with a
port that doesn't model BG-plane bird draws. See §10 item 11 for the
port deviation.]

### 6.4 Wing-hit feedback (`$3A6E-$3A76`)

```
3A6E: LD A,($43B8); ANI $08      ; test stage bit 3 (mothership wave?)
3A72: JP Z, $3A77                 ; if clear, fall through
3A75: LD (HL),$05                 ; longer feedback duration on mothership
                                  ;  stage (5-frame wing-hit beep)
```

[verified, `Code.md:$3A6E-$3A76`. Affects `SoundControlA` at `$438C`
— audio only; no rendering impact.]

For the port: deferred unless sound lands. The flag stays in
`M4366`, but no visible game state hinges on the feedback timer.

---

## 7. Spiral-fill intro (`$2230`) — abbreviated

Stage 4/6/8 dispatch to `$2230`, which draws a center-out spiral wipe
into background tile RAM. Per-stage variant:

- Stages 4, 6 — wipe to **starfield**: at exit, copies the star tiles
  from `T1C00`/`T1F00` into the background RAM. Then increments
  `LevelAndRound` and sets `GameState := 2`.
- Stage 8 — wipe to **black** (mothership intro): at exit, calls
  `ClearBackground` instead of copying stars.

The branch is `Code.md:$2295` testing bit 3 of `LevelAndRound`
(stage >= 8 → black). [verified, cross-referenced with
`research_stage_structure.md §8.1`.]

The spiral itself is animated over ~13 frames — counter at `$439C`
ticks each frame, controller exits when counter shifted right by 6
reaches `$0D`. The exact per-frame tile-write order is not walked in
this pass — it's cosmetic and only matters for visual fidelity, not
gameplay. Bird init at `$32B0` runs on the very next frame after the
spiral completes (via the GameState 2 dispatch).

---

## 8. Birds do not fire

Searching for any `EnemyFireScanAndSpawn $2560` invocation from `$3400`
or its callees: **none**. Birds reuse `EnemyBulletUpdate $0C40` to tick
the per-bullet position of any aliens that may already have bullets in
flight (carryover from stage 3 — `BirdsLeft` and `AliensLeft` are
independent counters), but birds themselves never spawn new bullets.

This matches the original arcade behaviour: bird stages are
fundamentally about dodging swooping birds, not bullet patterns. The
port should:

- Keep `enemyBullets[]` allocated and ticked during bird stages (for
  carryover), but
- **Skip** the call to `enemyFireScanAndSpawn` during stages 5/7.

[verified by absence; `Code.md:$3400-$346D` contains no `$2560` call.]

---

## 9. Implementation hooks — proposed sub-steps for port step 11

### 9.0 Debug-start at bird stage (recommended for the whole of step 11)

Player-collision is still skipped (step 9 carryover), so the player
can't die. To avoid waiting ~30 s of alien combat per iteration, add
a one-shot override that drops the game directly into stage 5 on cold
start:

```js
// state.js or main.js — top of file
const DEBUG_START_LEVEL_AND_ROUND = 0x05;  // null = normal start

// during GameState 0 → 2 transition (or wherever state-2 init is first invoked):
if (DEBUG_START_LEVEL_AND_ROUND !== null) {
  state.levelAndRound = DEBUG_START_LEVEL_AND_ROUND;
  state.birdsLeft = 8;             // T1760[2] = $88; set explicitly because
                                   // $2204 (the normal setter) didn't run
}
```

`$32B0` self-gates on bit-2 of `LevelAndRound` and `BirdsLeft > 0`, so
this is the only setup needed; the bird-struct init runs in the
normal state-2 path.

**Note on the stage cycle while debug-started:** with the 8d wrap
stop-gap still in place, killing all birds advances to stage 6
(spiral-fill, unimplemented) which then wraps to round+1 stage 0
(alien wave). For fast bird-only iteration during 11.3–11.5, the
stop-gap's wrap condition can be temporarily widened to wrap **stage
5+** back to stage 5 — but only inside the same dev session; revert
before committing.

This affordance retires once 11.6 (stage-clear cleanup) and step 12
land the full cycle. Keep `DEBUG_START_LEVEL_AND_ROUND` as a `null`
default so production cold-start is unaffected.

### 9.1 Sub-steps

Order is flexible because the debug-start above means each can be
landed independently. Suggested sequence:

- **11.1 Bird-data init (`$32B0`)** — wire `state2_StageInit` to
  always run `$32B0` (it self-gates on `BirdsLeft`). Port T3F80 +
  T3FC0 as JS literals (combined as `BIRD_INIT_TABLE`); port the
  `(8 - BirdsLeft) × 8` offset arithmetic so partial-flock carryover
  works. Add `state.birds[8]` with the 8-field struct + global
  `state.maturity`. ✅ landed 2026-05-17; T3F80-vs-T3FC0 selection
  resolved as bit 1 of LevelAndRound (§2.2).

- **11.2 Bird-combat dispatch (`$3400`)** — implement the
  `BirdsLeft<4` / `BirdsLeft>=4` parity branch. Hook into the
  existing JT4 stage dispatch as `state3_Bird` (handle stage indices
  5 and 7). Reuse `playerUpdate()`, `enemyBulletUpdate()`,
  `explosionUpdate()` — only new code is the per-bird half-flock
  iterator.

- **11.3 Bird update engine (`$35B0` + T3F00 + T3E80)** — implement
  the per-bird maturity / movement dispatch. This is the
  highest-risk sub-step (stack-based dispatch maps to a
  table-of-records in JS). Test by polling `state.birds[*].shape`
  and `state.maturity` while watching maturity bits flip from
  `$01` → `$0F`.

- **11.4 Bird hit detection (`$3800` + `$38E9` + `$3844`)** — port
  the per-bird AABB / tile-mask collision; wire wing-hits through
  `spawnExplosion($07, $02)` and body-hits through the existing
  `spawnBonusExplosion()` path (already in step 10.7). Decrement
  `BirdsLeft`; reset `M4368` on each kill.

- **11.5 Stage-clear cleanup** — when `BirdsLeft == 0`, ensure
  `$3462`-equivalent runs the bullet/explosion tail and the existing
  `$2204` countdown advances to next stage.

- **11.6 Spiral-fill intro (`$2230`)** — port the spiral wipe
  minimally (one frame of tile writes per JS frame; correct exit
  condition; correct wipe-target branch on stage bit 3). Cosmetic, so
  deferred to last; until landed, stage 4/6 is effectively a black
  frame transition between waves. Could be permanently stubbed if
  cosmetic-only is acceptable.

Mothership stages (9/A/B) and GameStates 6/7 are **step 12**, with
their own research doc `research_mothership.md` (not yet written).
The 8d wrap stop-gap stays until step 12 lands the full 5-stage
cycle.

---

## 10. Open questions / not walked this pass

1. ✅ **T3F80 vs T3FC0 runtime selection** — resolved 2026-05-17 by
   re-trace during 11.1 implementation: bit 1 of LevelAndRound (after
   `RRCA × 2` at `$32E1-$32E3`) selects T3F80 for wave 1 (stages 4/5)
   and T3FC0 for wave 2 (stages 6/7). Details in §2.2.
2. ✅ **Bird-struct offsets +3 and +6** — resolved 2026-05-17 by
   $35E0 / $36C0 walks during 11.3 implementation. `+3` is the
   anim-phase counter ($36C0 cycles it 0..7). `+6` is the per-bird
   movement-step value (gates $35E0 main-vs-alt path on `>= $10` and
   `$36EA/$370A` maturity advance on `& $0F == 0`). See §2.3.
3. ✅ **Full T3F00 table contents** — landed in §5.1 (all 16 entries).
4. ✅ **T3EC0 + draw routine + tile data** — resolved 2026-05-17.
   T3EC0 decoded (§5.3). Draw routine at `$3520+` walked: 6 entry
   points (Draw7x2..Draw2x2 + Draw1x2 tail) form an unrolled
   column-pair sequence. T3E08 anim-frame address table extracted
   (§5.4); `BIRD_TILE_DATA` (= `$3C00-$3DBF`, 448 bytes) + `BIRD_T3E08`
   (= `$3E00-$3E7F`, 128 bytes) added to `data.js`. `render.drawBird`
   ports the full lookup and draws faithful N×2 bird sprites using
   the BG tile palette.
5. **Bonus-score formula at `$386F-$388D`** for bird kills — the
   port has the spawn machinery from step 10.7 but step 11.4 (hit
   detection) will need to confirm the score values.
6. ✅ **`$2600` BG-scroll port** — landed 2026-05-17 (port-side
   approximation). Source's `$2600` has TWO scroll paths:
   - main ($2618-$2649): `CounterB9 -= D` → scroll **down**
   - alt  ($2650-$2662): `CounterB9 += T3ED0[...]` → scroll **up**

   The path is chosen by comparing `M4BD1` vs `M4BD3` (extended
   bird storage maintained by `$26D0`/`$26AA`/`$2668`). The result
   is back-and-forth oscillation of the BG-scroll register — birds
   visibly bob UP and DOWN, not just descend monotonically.
   (Confirmed via arcade video: birds drift in both directions.)

   `($5800) := CounterB9` ($263C) writes the scroll register; the
   hardware shifts the entire BG plane. In source, birds live in BG
   memory so they scroll with it.

   Port-side equivalent in `stageBirdCombat`:
   ```js
   const scrollDir = (state.counter9a & 0x40) ? +1 : -1;
   state.counterB9 = (state.counterB9 + scrollDir) & 0xFF;
   ```
   Counter9A's bit-6 flips every 64 frames (~1 sec at 60 Hz), so
   counterB9 walks ±64 around a center, producing ~2-second
   up-down-up-down cycles. The exact amplitude / period don't match
   source's M4BD0+-driven values, but the visual character (bobbing
   birds) is preserved. `render.drawBird` adds `(-counterB9) & 0xFF`
   to canvas Y; `birdBulletCollision` uses the same offset so kills
   land on visible sprites.

   **Confirmed via arcade video**: bird stages have NO visible
   starfield, planets, or galaxies — just black BG + birds + player.
   So the port deliberately skips `bgUpdateIfAlienStage` here (which
   would fill bgTiles with stars / planets / galaxies); `bgTiles`
   stays at the zeros from state-2 init and the BG plane renders
   solid black.

   The full M4BD0+ extended-bird-storage state machine isn't ported
   — its effect on the exact scroll-register value is a per-bird
   jitter invisible at the gameplay level.
7. ✅ **`$35E0` sweep motion + helpers** — landed 2026-05-17. Main
   path (bird[+6] < $10, moves bird right) and alt path (`$3628`,
   bird[+6] >= $10, moves bird left) ported, with all 6 helpers
   ($3604/$3648/$366A/$3672/$3695/$3744). Per-tick mechanics
   verified by single-step trace: bird[+5]/[+3]/[+6] evolve as
   expected; screen-RAM addr updates with $20 carry/borrow
   semantics; $3672 / $3695 pick new bird[+7] targets from
   min/max(player X, bird[+5]) ± `M436D`. Sweep is purely
   horizontal in source ($35E0 never touches the bird's row); the
   apparent vertical descent in arcade comes from `$2600`'s BG-
   scroll-register update (still unported — see item 6).

   **Three bugs fixed during landing** (2026-05-17):
   1. **`$3695` target check** — my first port checked `bird.gridY
      != step_parameter` instead of `bird.gridY != bird.gridX`.
      Source reads B = bird[+5], A = bird[+7], `CP B; RET NZ` —
      that's gridY vs gridX, NOT vs the step. The bug prevented
      the alt → main transition from ever firing, so birds drifted
      one-way and escaped the BG plane.
   2. **Dispatch parity-gate byte order** — source reads `$439B`
      (the LSB of 16-bit Counter9A, incremented every frame) for
      the per-frame half-flock alternation. My port read
      `(counter9a >> 8) & 1` which is the **MSB** ($439A, flips
      every 256 frames). Effect: birds 0-3 updated for 256
      consecutive frames while birds 4-7 stayed frozen, then the
      flipped. Fix: read `counter9a & 1`. Per `AddOneToMem` at
      `$0200`: HL=$439B is INCed first and carries into $439A —
      proving $439B is the LSB regardless of the disassembler's
      "MSB:LSB" comment.
   3. **`$3560` randomizer counter byte** — symmetric to #2 in the
      opposite direction. Source reads `$439A` (MSB, slow) for the
      T3E80 index jitter; my port read `$439B` (LSB, fast). The
      lookup over-randomized. Fix: `(counter9a >> 8) & 0xFF`.

   After all three fixes: birds oscillate left↔right every 30-80
   ticks, all 8 update concurrently (per-frame parity alternation),
   and stay within the BG plane for the full bird stage. Verified
   visually with 8 birds spread across playfield in mixed
   anim-phase / sweep-direction states.
8. ✅ **Bird egg-crack visual** — resolved 2026-05-17 alongside item
   4. The anim-cycle counter `bird[+3]` (cycled by `$36C0` motion)
   drives the T3E08 lookup so shapes 1/5/6/7/8/9/A walk through 4
   tile-data variants per maturity stage (small star → medium star →
   big star → group of stars for shape 1, etc.). Shapes that use
   `$35E0` motion (currently stubbed) show only frame 0 until that
   motion routine is ported.
9. **Mothership stages.** Out of scope — own doc.

10. **Bonus-score scaling formula** (`$385D-$388D`). Step 11.4 ports
    body-hit with a fixed `scoreBcd = $10` (100 pts) — the source's
    pre-divider initial value. Full per-state scaling (E == $0F /
    $0E / $0C / < $0C branches) is a follow-up; verification target
    would be parity with arcade-recorded scores on specific kill
    types.

11. **Tile-mask collision (`$3800`) vs port's AABB.** Step 11.4 uses
    AABB between the player bullet and each live bird's drawn-sprite
    bounding box (`width × 16 px`, width derived from T3EC0) instead
    of source's T3B60 tile-mask test against BG screen-RAM (which
    the port doesn't populate for birds — `render.drawBird` blits
    direct to canvas). Status of source's collision sub-paths:
    - **Wing-hit (`L38BC` → `$38E9`)** — ✅ ported (2026-05-17).
      Port distinguishes wing vs body via bullet-distance-from-bird-
      center, gated by sprite width (only shapes with `widthCols >=
      5` have wings). Wing hit calls `onBirdWingHit`: downgrades
      bird.shape to 1 (egg/small), spawns alien-slot explosion with
      scoreBcd=$02 (20 pts), DOESN'T decrement BirdsLeft. The
      maturity engine then naturally regrows the bird through
      `$36D2`/`$36EA`/`$370A` transitions over ~150 ticks (~2.5 s).
      Source's exact T3DB8 tile-replacement isn't ported — port
      uses a coarse "drop to shape 1" rule, then relies on the
      existing maturity progression. Visible behaviour matches
      arcade: bird hit on wing visibly shrinks, then grows back.
    - **Low-tier alien-slot scoring** (`$3894`, scoreBcd=$05 /
      50 pts when read tile A < $0B) is still unreachable. All
      body kills use the bonus slot at 100 pts. Restoring this
      requires the tile-mask collision (= BG-plane mirror).
