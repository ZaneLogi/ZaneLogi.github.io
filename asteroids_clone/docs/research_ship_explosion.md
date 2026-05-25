# research_ship_explosion.md — Ship explosion fragment animator

Pre-research for I-11e (ship explosion render). Decodes the
`$7465-$7508` fragment animator that's called once per frame while
the ship is exploding (status `$A0..$FF`), so I-11e can render
6 fragments drifting outward from the ship's death position with
the correct per-frame motion, fragment-count decay, and glyph data.

See [[research_dvg.md §6]] for SVEC opcode semantics and
[[research_dvg.md §11]] for the runtime-VROM format. See
[[research_vector_rom.md §3.4]] for `ShipExplosion` VROM data.
See [[research_collisions.md §1]] for the ship-status-byte
state machine (alive `$01` → exploding `$A0` → cleanup → respawn).

## §1. Overview

When the ship is killed (status set to `$A0`, see I-11d), the
per-slot dispatcher routes the ship slot's exploding state to a
**dedicated fragment animator at `$7465`**. Unlike asteroid /
saucer exploding slots (which cycle through 4 Shrapnel SVEC
patterns via the `$7349-$7350` selector), the ship slot has its
own 6-fragment animation: each fragment is one short bright SVEC
drawn at a position that drifts outward from the death point.

The animator is data-driven by two parallel 6-entry tables in
vector ROM:

- **`ShipExplosion`** at CPU `$50E0-$50EA` (VectorROM.md tag
  `$10E0`) — 6 SVEC opcodes, each one a short bright vector
  drawn at `bri=12` (full brightness). These are the **glyph
  shapes** of the fragments.
- **`SHIP_EXPLOSION_VELOCITY`** at CPU `$50EC-$50F6` (VectorROM.md
  tag `$10EC`) — 6 byte pairs of `(vx, vy)` signed bytes,
  one pair per fragment. These are the **motion velocities**.

Each fragment has independent state (position) in zero-page RAM
(`$7D-$88` X-axis, `$89-$94` Y-axis — 6 × 2-byte pairs per axis),
initialized once at the start of the explosion and advanced each
frame.

The animator emits 1-6 fragments per frame depending on the
explosion's current stage (fragment count decays as the status
byte advances toward `$FF`).

## §2. Dispatcher route — `$72FE → $7345 → $7355 → $7465`

The per-slot dispatcher `$72FE` handles drawing for every object
slot, with branches for alive vs exploding states.

```
$72FE: STY $00 ; STX $0D                       ; gs byte ← Y; slot index ← X
$7302-$731D:  ... convert RAM position to DVG (with +128 Y-offset)
$731F: LDX #$04 ; JSR $7C1C                     ; emit per-slot LABS at object position
$7324-$7339:  ... no-op DVG padding loop (decoded in research_dvg.md §12)
$733B: JSR $7CDE                                 ; emit one more byte
$733E: LDX $0D                                   ; restore slot index
$7340: LDA $0200,X                               ; load slot status
$7343: BPL $735B                                 ; if status < $80 (alive), alive branch
$7345: CPX #$1B                                  ; exploding: is this ship slot?
$7347: BEQ $7355                                 ; yes → ship-explosion path
$7349-$7353:  ... shrapnel selector + JSR (asteroid/saucer exploding path)
$7355: JSR $7465                                 ; → ship-explosion animator
$7358: LDX $0D
$735A: RTS
```

When `$72FE` is reached for slot `$1B` (ship) with status `≥ $80`
(exploding), the path falls through to `$7355 → $7465`. Note
that **a per-slot LABS has already been emitted at `$731F-$7322`
to position the slot at the ship's current location**, with gs
set from `ram.$00`. `$7465` will emit ADDITIONAL LABS+SVEC pairs
to draw each fragment at its own offset from that base.

The gs value at this point (= `ram.$00`) comes from the caller
of `$72FE`. For the ship slot, this is the `$7018-$7025` path
(shared with alive-asteroid + alive-ship draws):

```
$7018: LDA $0200,X                ; A = slot status
$701B: LDY #$E0                   ; default gs byte = $E0 (gs nibble = 14)
$701D: LSR A ; BCS $7027          ; if bit 0 set → keep Y=$E0, jump to dispatch
$7020: LDY #$F0                   ; bit 1 path: Y = $F0 (gs nibble = 15)
$7022: LSR A ; BCS $7027          ; if bit 1 set → keep Y=$F0, jump to dispatch
$7025: LDY #$00                   ; both clear: gs = 0
$7027: JSR $72FE                  ; per-slot draw with Y = gs byte
```

For an EXPLODING ship (status `$A0..$FF`), the bits 0 and 1 of
status cycle as the explosion advances:

| Status | bit 0 | bit 1 | gs nibble | Notes |
|--------|-------|-------|-----------|-------|
| `$A0`  | 0     | 0     | 0         | gs=0 |
| `$A1`  | 1     | 0     | 14 (`$E`) | gs=14 |
| `$A2`  | 0     | 1     | 15 (`$F`) | gs=15 |
| `$A3`  | 1     | 1     | 14        | bit 0 tested first; gs=14 |
| `$A4..$A7` | ...  | ...   | 0..14     | repeats |

The cycling produces **per-frame variable gs** for the
explosion's LABS+SVEC emits. Under [[research_dvg.md §4]]'s
mod-16 wrap + saturation rules, this means fragment SVECs render
at different effective sizes from frame to frame — the same
"across-sweep gs expansion" trick used for asteroid Shrapnel
(see I-9e progress notes).

**Port note for I-11e:** our existing port doesn't follow the
per-slot dispatcher pattern (each actor has its own draw
function with hardcoded gs). For the ship-exploding render we
have two options:

- (a) **Replicate the cycling** — derive gs in `drawShip`'s
  exploding branch from `(ship.status & 1) ? 14 : (ship.status &
  2) ? 15 : 0`. Most cabinet-faithful.
- (b) **Fix gs=14** — matches the alive-ship gs and is the simpler
  mental model. Frame-by-frame visual will differ slightly from
  cabinet.

Verify which one matches cabinet footage during I-11e. Default to
(a) for source-faithfulness; fall back to (b) if (a) looks wrong.

## §3. The ROM data

### §3.1. `ShipExplosion` glyphs — CPU `$50E0-$50EA`

```
$50E0: C6 FF   SVEC scale=01(*4) bri=12  x=-2  y=-3   (-8, -12)
$50E2: C1 FE   SVEC scale=01(*4) bri=12  x=+1  y=-2   (+4, -8)
$50E4: C3 F1   SVEC scale=00(*2) bri=12  x=+3  y=+1   (+6, +2)
$50E6: CD F1   SVEC scale=02(*8) bri=12  x=-1  y=+1   (-8, +8)
$50E8: C7 F1   SVEC scale=00(*2) bri=12  x=-3  y=+1   (-6, +2)
$50EA: C1 FD   SVEC scale=01(*4) bri=12  x=+1  y=-1   (+4, -4)
```

Already extracted in [vector_rom_data.js:18-25](../vector_rom_data.js).
6 SVECs at `bri=12` (high brightness — fragments are visible
sparks). Each is a single short vector. The displayed deltas in
parentheses are the post-scale values at gs=0 baseline; at
gs=14/15 the mod-16 wrap changes the effective size.

**Note: these are SVEC OPCODES, not subroutine entries.** The
animator at `$7465` emits them inline into the per-frame display
list (one per fragment), each preceded by a LABS to position the
fragment. There's no JSR to a ShipExplosion subroutine — they're
treated as data, paired 1:1 with the velocity table by index.

### §3.2. `SHIP_EXPLOSION_VELOCITY` — CPU `$50EC-$50F6`

```
$50EC: D8 1E   ; fragment 0: vx=-40  vy=+30
$50EE: 32 EC   ; fragment 1: vx=+50  vy=-20
$50F0: 00 C4   ; fragment 2: vx= 0   vy=-60
$50F2: 3C 14   ; fragment 3: vx=+60  vy=+20
$50F4: 0A 46   ; fragment 4: vx=+10  vy=+70
$50F6: D8 D8   ; fragment 5: vx=-40  vy=-40
```

Already extracted in
[vector_rom_data.js:923-930](../vector_rom_data.js). Signed bytes.
Velocities in source byte units (matching the per-frame position
advance — see §5).

**Cleanup note:** the comment block above the
`SHIP_EXPLOSION_VELOCITY` export in `vector_rom_data.js` says
"Cabinet animator (un-disasm CPU region near RAM $7D-$94)". This
is wrong — the animator IS visible at `$7465-$7508`. Fix as
part of I-11e or as a separate doc-comment cleanup chip.

## §4. Init phase — `$7465-$748C`

```
$7465: LDA $021B                       ; A = ship status
$7468: CMP #$A2                        ; status >= $A2?
$746A: BCS $748E                       ; yes → skip init, jump to per-frame phase
$746C: LDX #$0A                        ; X = 10 (byte offset for last fragment)
$746E:   LDA $50EC,X                   ; A = velocity_x of fragment (X/2)
$7471:   LSR A ; LSR A ; LSR A ; LSR A  ; A = velocity_x / 16 (logical >> 4)
$7475:   CLC ; ADC #$F8 ; EOR #$F8     ; sign-extend (arithmetic shift result)
$747A:   STA $7E,X                     ; fragment X-position HI byte ← signed(vx/16)
$747C:   LDA $50ED,X                   ; A = velocity_y of fragment (X/2)
$747F:   LSR A ... ADC #$F8 ; EOR #$F8  ; same arithmetic shift on vy
$7488:   STA $8A,X                     ; fragment Y-position HI byte ← signed(vy/16)
$748A:   DEX ; DEX                     ; advance to previous fragment (2-byte stride)
$748C:   BPL $746E                     ; loop X=10,8,6,4,2,0 (6 fragments)
```

### §4.1. The `+$F8 / EOR #$F8` arithmetic-shift trick

`LSR A` is a logical right shift on the 6502 — it inserts 0 into
bit 7 regardless of sign. For arithmetic shift (sign-extend), the
source uses a 2-step trick:

- After `LSR A` × 4, A is the unsigned high nibble (top 4 bits of
  the original byte, in the low nibble of A).
- `CLC ; ADC #$F8` adds -8 in signed form. For positive originals
  (top nibble 0-7), this gives `top_nibble - 8` (negative).
- `EOR #$F8` flips bits 3,4,5,6,7. For positive originals, this
  negates the negative result back to positive. For negative
  originals (top nibble 8-F), the EOR converts the still-large
  unsigned value to the correctly sign-extended small negative.

Net: A becomes the signed `velocity_byte / 16` (arithmetic
shift), suitable as the high byte of a 16-bit signed position
relative to the ship's death position.

**Port implication:** in JS, just use `Math.trunc(velocity / 16)`
or the equivalent — Float64 arithmetic handles sign correctly
without the +F8/EOR trick.

### §4.2. The init guard `CMP #$A2 / BCS $748E`

Init only runs when status is `$A0` or `$A1` (the very first
1-2 frames after kill). Once status reaches `$A2`, the BCS
branches past the init phase. So **init is a one-shot, not a
per-frame reset.**

Why $A2 specifically (instead of $A1)? Because the explosion-anim
increment can jump status by ~7 in a single frame (see §6), so
status may go directly from $A0 to $A7 in one frame. The BCS at
`$A2` catches both "$A0 first frame" and the unlikely "$A1 second
frame" cases without re-running init. After the first frame,
status >= $A7 > $A2 always, so init is skipped.

### §4.3. Position storage layout

- Fragment K's 16-bit X position: low byte at `ram.$7D+2K`,
  high byte at `ram.$7E+2K`.
- Fragment K's 16-bit Y position: low byte at `ram.$89+2K`,
  high byte at `ram.$8A+2K`.

Init writes only the high byte (= `velocity / 16` signed). The
low byte is left as whatever was there from the previous use of
that RAM region. Effectively the fragment starts ~`(vx/16,
vy/16)` distance from the ship in source-byte units, with a few
sub-byte units of arbitrary jitter.

For port: initialize fragments at `(velocity_x/16, velocity_y/16)`
game-coord-relative offsets from the ship's death position (ignore
the source's sub-byte jitter — it's negligible in Float64).

## §5. Per-frame phase — `$748E-$7508`

```
$748E: LDA $021B ; EOR #$FF ; AND #$70   ; A = (~status) & $70
$7495: LSR A ; LSR A ; LSR A             ; A >>= 3 (byte offset, 2-byte stride)
$7498: TAX
$7499: STX $09                            ; ram.$09 = fragment index limit (byte offset)
                                          ; (6, 5, 4, ... fragments to emit)
$749B-$74C5: LDY #$00                     ; ... advance position by velocity
                                          ; (sign-extended via DEY trick: $74A0 BPL skip DEY)
$74A4: CLC ; ADC $7D,X ; STA $7D,X        ; X-position lo ← lo + velocity_x
$74A8: TYA ; ADC $7E,X ; STA $7E,X        ; X-position hi ← hi + (Y=sign-ext) + carry
$74AD: STA $04 ; STY $05                  ; ram.$04:$05 = X-position HI:Y (sign-ext)
$74AF-$74C5: ...                          ; same for Y axis → ram.$06:$07
$74C7: LDA $02 ; STA $0B                  ; save current display-list cursor
$74C9: LDA $03 ; STA $0C                  ; (ram.$0B:$0C = scratch copy)
$74CF: JSR $7C49                          ; emit LABS at signed-magnitude position
$74D2: LDY $09                            ; Y = fragment byte offset
$74D4: LDA $50E0,Y ; LDX $50E1,Y          ; (A, X) = SVEC bytes for fragment
$74DA: JSR $7D45                          ; emit SVEC opcode bytes inline
$74DD-$74EC: (re-emit with EOR #$04 flip — see §5.3)
$74EF-$74FF: (copy 3 bytes from $0B-savearea — see §5.4)
$7501: JSR $7C39                          ; advance display-list cursor by emitted size
$7504: LDX $09 ; DEX ; DEX ; BPL $7499    ; next fragment (decrement byte offset)
```

### §5.1. Fragment count from status

`((~status) & $70) >> 3` produces the BYTE OFFSET of the last
fragment to emit (DEX DEX walks from there down to 0):

| Status range  | ~status & $70 | >> 3 | Fragment count |
|---------------|---------------|------|----------------|
| `$A0..$AF`    | `$50`         | `$0A` | 6 |
| `$B0..$BF`    | `$40`         | `$08` | 5 |
| `$C0..$CF`    | `$30`         | `$06` | 4 |
| `$D0..$DF`    | `$20`         | `$04` | 3 |
| `$E0..$EF`    | `$10`         | `$02` | 2 |
| `$F0..$FF`    | `$00`         | `$00` | 1 |

So fragments decay 6 → 5 → 4 → 3 → 2 → 1 across the 6 stages
(one stage per `$10` of status increment). The explosion ends
when status overflows past `$FF` — see §7.

### §5.2. Position advance per fragment

Each frame, each active fragment's 16-bit position is incremented
by its velocity (with sign extension via the `LDY #$00 / BPL skip
/ DEY` pattern that sets Y to 0 or $FF as the sign-extended high
byte of the velocity). Velocity is the same byte from the ROM
table every frame — fragments drift in a straight line at constant
velocity.

After the position advance, `ram.$04:$05` holds the X-position
high byte (with sign-extended Y in `$05`), and `ram.$06:$07`
holds Y. These are signed-magnitude 16-bit relative offsets from
the ship's death point.

### §5.3. The LABS + SVEC emit

`$7C49` (called at `$74CF`) is a LABS-emit variant that handles
signed-magnitude position bytes — it converts negative values to
absolute + sign bits and emits the LABS opcode. See `$7C49-$7C8B`
for the body; for our port, we can use `Math.abs` and pass the
absolute position to the renderer.

After the LABS, the source emits TWO copies of the SVEC byte pair
(at `$74DA` and `$74EC`) — the second copy with `EOR #$04`
applied. This is the DVG's quirk that an SVEC opcode followed
by another SVEC at the same address renders the segment twice
(for brightness reinforcement). The EOR `$04` flips one of the
direction bits, producing a small zigzag rather than a perfectly
overlapping pair — visual effect is a brighter/larger fragment.

**Port deviation candidate:** the double-SVEC-with-flip is a CRT
phosphor brightness trick. For canvas rendering, single SVEC at
the right brightness is visually equivalent. Verify during I-11e;
if cabinet footage shows a clear "double" or "zigzag" per fragment,
implement faithfully. Otherwise single SVEC is fine.

### §5.4. The 3-byte copy at `$74EF-$74FF`

```
$74EF: LDY #$FF
$74F1: INY
$74F2: LDA ($0B),Y ; STA ($02),Y          ; copy byte 0
$74F6: INY
$74F7: LDA ($0B),Y ; EOR #$04 ; STA ($02),Y  ; copy byte 1 with EOR #$04
$74FD: CPY #$03 ; BCC $74F1               ; loop Y=0,1,2
```

This copies 3 bytes from the saved cursor (`ram.$0B-$0C`) to the
current cursor (`ram.$02-$03`), with `EOR #$04` on byte 1. This
is the SECOND copy of the LABS+SVEC (with the flip bit). The
purpose is the same as §5.3 — brightness reinforcement via
quasi-duplicate emit.

For the port, a single LABS+SVEC per fragment is the simplest
faithful render. Verify visually during I-11e.

## §6. Explosion-animation increment — `$6F62-$6F77`

The per-slot loop at `$6F57` calls `$7708` (negate-A) and shifts
right 4 to compute the increment as `(~status >> 4)`. For the
ship slot, the +1 base is gated on `fastTimer & 1`:

```
$6F62: BPL $6FC7                  ; alive: branch to motion
$6F64: JSR $7708                  ; A = 2's complement of status (= -status)
$6F67: LSR A ; LSR A ; LSR A ; LSR A  ; A = (~status >> 4) = high nibble of -status
$6F6B: CPX #$1B                   ; ship slot?
$6F6D: BNE $6F76                  ; no → asteroid/saucer path
$6F6F: LDA $5C ; AND #$01 ; LSR A  ; C ← fastTimer & 1 (sets carry to 0 on even frames)
$6F74: BEQ $6F77                  ; (always taken — A is 0 after LSR)
$6F76: SEC                        ; (asteroid path: unconditional +1)
$6F77: ADC $0200,X                ; new status = old + (~status>>4) + carry
```

So:

- **Asteroid / saucer exploding**: increment = `(~status >> 4) + 1`
- **Ship exploding**: increment = `(~status >> 4) + (fastTimer & 1)`

For status = `$A0` (= start): `(~status >> 4)` = `($60 >> 4)` =
`6`. Ship advances by 6 (even frame) or 7 (odd frame). Asteroid
always advances by 7.

For status = `$F0`: `(~status >> 4)` = `($0F >> 4)` = `0`. Ship
advances by 0 (even) or 1 (odd). Asteroid advances by 1.

Net: **ship explosion runs ~1 frame slower than asteroid over the
same status range**. From `$A0` to past `$FF`, that's ~56 frames
for ship vs ~50 for asteroid (rough; depends on fastTimer
phase). The ~56-tick figure matches v1's empirical observation.

For port: implement the increment formula in the ship-exploding
branch of `asteroidUpdate` (already exists as a stub in
[task_seq.js:347-364](../task_seq.js)). The fastTimer-bit-0 gate
goes on the increment's +1, NOT on the whole tick.

## §7. End condition + cleanup

When `ADC` overflows past `$FF`, the status would wrap to `$00`+
in 6502 land. The source handles this at `$6F80 BCS $6F99`:

```
$6F7A: BMI $6FA1                  ; if new status MSB still set (status < $FF), continue
$6F7C: CPX #$1B                   ; ship slot?
$6F7E: BEQ $6F93                  ; yes → ship-specific cleanup
$6F80: BCS $6F99                  ; non-ship: explosion complete
$6F82: DEC $02F6                  ; curAsteroidCount -= 1
...
$6F93:  ... ship cleanup           ; calls $71E8 (Ship.respawn placement)
```

The exact body of `$6F93` is the spawn-protect / respawn-timer
setup that I-11d ports as `Ship.respawn(state)`. For I-11e's
explosion-render concern, the relevant fact is: **explosion ends
when status overflows past `$FF`, at which point the ship is
placed at the spawn center (game-coord `(16.375, 12.375)` ≈ DVG
center) via `$71E8`**.

So I-11e's `drawShip` only needs to render fragments while status
is in `[$80, $FF]`. The render math doesn't need to handle the
post-overflow case — by the time status crosses `$FF`, the
exploding branch in `asteroidUpdate` already calls
`ship.respawn(state)` and resets status to 1, putting the ship
back in the alive branch.

## §8. Port summary (as landed in I-11e)

I-11e landed with six port deviations from the source-faithful path
described in §3-§7. Each is documented inline in `ship.js` /
`main.js`; this section consolidates them.

State (`ship.js`):

- `shipExplosionFragments` — 6 × `{x: number, y: number}` game-coord
  offsets from ship death position.
- `Ship.kill(state)` — additionally initializes each fragment offset
  as `SHIP_EXPLOSION_VELOCITY[i].{vx,vy} / 96` (see deviation #1).
- `Ship.advanceExplosionFragments()` — each fragment offset advances
  by `velocity / 4096` per frame (see deviation #2).

Sim (`task_seq.js asteroidUpdate` ship-slot exploding branch):

- Per-tick status increment uses source-faithful `(negated >> 4) +
  (fastTimer & 1)` for ~0.9-sec lifetime.
- `state.ship.advanceExplosionFragments()` called every tick.
- On status overflow past $FF: `placeAtCenter()` + `status = 0`
  per `$6F93-$6F8E`. shipSpawnPhys then ticks the timer until
  status=1.

Render (`task_seq.js drawShip` exploding branch + `main.js
drawShipExplosionPiece`):

- Active fragment count = `Math.max(1, 6 - stage)` where `stage =
  (status - 0xA0) >> 4`. Decays 6→5→4→3→2→1 across stages 0..5.
- For each active fragment, emit one SVEC from
  `VROM.ShipExplosion[i]` at `ship.dvgPos() + frag_offset_in_DVG`,
  routed through `drawSegmentBright` (oriented filled rect, not
  stroked line — see deviation #4).

### The six port deviations

1. **Init `/96` instead of source's `/16`.** Source writes
   `velocity/16` to the HI byte of fragment position (giving offsets
   up to 4.4 game-units in our coord system). Cabinet footage shows
   fragments tightly clustered around ship — within ~1 game-unit.
   `/96` empirically matches the cabinet snapshot's burst radius.
2. **Drift `/4096` instead of source's effective `/256`.** Source-
   faithful per-frame add (`position += velocity`) gives ~15 game-
   units of drift across the lifetime — way off-screen. `/4096`
   gives ~1 unit of additional spread on top of init, matching the
   cabinet's slow visible drift.
3. **Fixed `gs = 0`** instead of source's per-status-bit cycling
   (0/14/15 from status bits 0,1). Source's cycling builds a
   "growing star" appearance via CRT phosphor decay integrating
   multiple frames at different sizes. Our canvas clears each
   frame (no phosphor integration), so the cycling reads as bullet/
   comet shape-morphing per frame. Fixed gs gives stable per-
   fragment shape (5-14 px lengths at gs=0).
4. **Render as oriented filled rectangle** (rotated `fillRect` of
   3 px × SVEC-length) instead of stroked line. Short stroked lines
   with any `lineCap` produce a teardrop/comet appearance because
   the cap (or AA-end pixels) is comparable in size to the line.
   Oriented filled rect gives uniform thickness with sharp ends.
5. **Single SVEC per fragment** (no double-emit + EOR #$04). Source
   `$74DA + $74EC` emits each SVEC twice for CRT phosphor brightness
   reinforcement — confirmed not visible on cabinet per user
   observation. Skipped; max alpha + thicker line compensate.
6. **Alpha fade `1.0 → 0.2`** across status $A0 → $FF via
   `ctx.globalAlpha`. Approximates the cabinet's phosphor-decay
   fade-out so fragments visibly dim as they age — in addition to
   the count decay.

The combination produces a cabinet-faithful "burst → slow drift →
fade out" visual without needing CRT phosphor emulation. Port spec
was tuned empirically with user feedback across ~6 iterations.

### §8.1 Why the `/96` and `/4096` numbers don't fall out of source

The source-faithful per-frame fragment-position math is straight-
forward — init writes `velocity/16` to the position HI byte; per-frame
adds `velocity` to the position lo byte with carry to hi. Applying
those formulas directly with our HI-byte-as-game-unit interpretation
gives init offsets up to 4.4 game-units and per-frame drift of
`velocity/256`, producing ~15 game-units of total drift across the
explosion lifetime — way wider than what cabinet shows.

The reason source's same numbers render small on cabinet is the
**scale-normalization in `$7C49`** (the signed-magnitude LABS-emit
helper). `$7C49` left-shifts the signed-magnitude position values
until the value normalizes into the 10-bit LABS coordinate field,
encoding the shift count into the LABS `scale` nibble. The DVG then
applies the LABS scale to subsequent SVECs only — not to the LABS
cursor itself. The net effect on rendered cursor position is that
`$7C49` performs an implicit division of the source's position
magnitude by some power-of-2 derived from the per-frame normalization.

Porting `$7C49` faithfully (~50 lines of sign-magnitude + ASL-loop
scale-normalization, plus the LABS bit-layout packing at `$7CBB-$7CD9`)
would let our renderer reproduce source's exact rendered position
without the empirical `/96` and `/4096` divisors. We chose the
empirical path during I-11e because (a) the cabinet visual was
adjustable with two small constants, and (b) `$7C49`'s logic is
specialized to the source's 6502 sign-magnitude encoding which
doesn't map cleanly to Float64 game-coords. A future polish step
could revisit this as a separate research+port chip.

## §9. Verification checklist for I-11e

After ship-explosion render lands:

1. Dev console: `__game.ship.kill(__game)`.
2. Visually confirm: 6 small bright fragments at the ship's
   previous position, distributed in roughly the directions
   implied by `SHIP_EXPLOSION_VELOCITY` (fragment 0 toward
   upper-left, fragment 1 toward lower-right, fragment 2
   straight down, etc. — verify each direction matches the
   velocity table sign).
3. Watch the fragment count decay: 6 → 5 → 4 → 3 → 2 → 1
   across roughly 56 ticks (per source) or ~36 real frames at
   our timing. Use a `setInterval`-based freeze in dev console
   to confirm the count at each `$10` status boundary.
4. After explosion completes (status overflows `$FF`), confirm
   the ship is placed at center via `placeAtCenter` and reappears
   at game-coord (16.375, 12.375) once shipSpawnTimer hits 0.
5. Alpha fade: stage 0 fragments should be at full brightness;
   stage 4-5 visibly dimmer (alpha ~0.46 → 0.2).
