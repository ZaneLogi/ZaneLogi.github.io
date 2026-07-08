# Galaga Path Data + Motion Interpreter — Verified Specification

Source-of-truth: `C:\Z_Temp\hackbar_galaga\rom0\` (`gg1-5.s` for all citations
unless noted). Every claim tagged **[verified]** with line citation or
**[inferred]** when reasoning beyond the source.

This is the "Round 2" research after stage-init. Several findings here
**contradict** how `bugMotion.js` is currently structured.

## 1. bug_motion_que struct layout (per slot, 0x14 bytes) [verified]

Each of 12 slots holds one in-flight enemy. Offsets used in `f_08D3` and
the launcher (`l_29D1_finalize_object_setup`):

| Offset | Bytes | Field | Source |
|--------|-------|-------|--------|
| 0x00   | 1     | Y position low byte (fraction)         | gg1-5.s:1887 init=0; gg1-5.s:2207-2209 add velocity |
| 0x01   | 1     | Y position high byte (= rawY) **renderer's input** | gg1-5.s:1878 init=variant.y; gg1-5.s:2303 read for render |
| 0x02   | 1     | X position low byte (fraction)         | gg1-5.s:1888 init=0; gg1-5.s:2207-2209 add velocity |
| 0x03   | 1     | X position high byte (= rawX) **renderer's input** | gg1-5.s:1881 init=variant.x; gg1-5.s:2282 read for render |
| 0x04   | 1     | Angle low byte                         | gg1-5.s:1889 init=0; gg1-5.s:2081-2084 += rotRate |
| 0x05   | 1     | Angle high byte (10-bit angle = b05<<8 + b04, only bits 0-1 of b05 used) | gg1-5.s:1884 init=variant.rotHi; gg1-5.s:2086-2102 |
| 0x06   | 1     | Home position Y (set by FB TURN_HOME) | gg1-5.s:1840 |
| 0x07   | 1     | Home position X (set by FB TURN_HOME) | gg1-5.s:1841 |
| 0x08   | 1     | Path pointer LOW byte                  | gg1-3.s:1842 init from db_2A3C[idx]; gg1-5.s:1465 |
| 0x09   | 1     | Path pointer HIGH byte (& 0x1F mask)   | gg1-3.s:1854 init; gg1-5.s:1466 |
| 0x0A   | 1     | vx (lower nibble of segment byte 0)    | gg1-5.s:2003 |
| 0x0B   | 1     | vy (upper nibble of segment byte 0)    | gg1-5.s:2011 |
| 0x0C   | 1     | rotRate (segment byte 1, optionally negated) | gg1-5.s:2018 |
| 0x0D   | 1     | Segment timer (counts down to 0; 0 = load next) | gg1-5.s:2021 init from segment byte 2; 1461 dec |
| 0x0E   | 1     | Bomb-drop counter (0x08 or 0x44 from bit 0 of wave byte) | gg1-3.s:1834 |
| 0x0F   | 1     | Bomb-drop enable bits (from b_92E2[1]) | gg1-3.s:1803 |
| 0x10   | 1     | Object index (formation-slot ID, 0x00-0x5E) | gg1-3.s:1761 |
| 0x11   | 1     | X step (set by FB TURN_HOME for homing) | gg1-5.s:1793 |
| 0x12   | 1     | Y step (set by FB TURN_HOME for homing) | gg1-5.s:1794 |
| 0x13   | 1     | Flags byte: bit 0 = active, bit 5 = bee/boss dive, bit 6 = home-check, bit 7 = **negate-rotation** | gg1-3.s:1894; gg1-5.s:1740, 2014-2018, 2031, 2058, 1842 |

**Position storage = 16-bit fixed-point per axis.** High byte (b01/b03) is
the raw coord that gets fed to the rendering transform. Low byte (b00/b02)
is fraction, so internal motion can accumulate sub-pixel deltas.

## 2. Path bytecode format [verified, gg1-5.s:1471-1492]

Each token byte is read at `j_090E_flite_path_init`:
- If byte < 0xEF → it's a 3-byte SEGMENT, dispatch to `l_0BDC_flite_pth_load`
- If byte ≥ 0xEF → it's a TOKEN, dispatch via jump table at `d_0920_jp_tbl`

### 2.1 Segment (3 bytes) [verified, gg1-5.s:1996-2021]

```
byte 0:  vx (lower nibble) | vy (upper nibble)    — both UNSIGNED 0-15
byte 1:  rotRate                                  — SIGNED 8-bit (-128..+127)
byte 2:  segment duration in frames               — UNSIGNED 0-255
```

The segment-load code:
```asm
ld c, a                  ; A = byte 0
and #0x0F
ld 0x0A(ix), a           ; vx = lower nibble (unsigned)
ld a, c
rlca / rlca / rlca / rlca
and #0x0F
ld 0x0B(ix), a           ; vy = upper nibble (unsigned)

ld a, (hl)               ; byte 1 = rotRate
bit 7, 0x13(ix)          ; check NEGATE-ROTATION flag (set by bit 6 of wave byte)
jr z, l_0BF7
neg                      ; negate rotation if flag set
l_0BF7:
ld 0x0C(ix), a

ld a, (hl)               ; byte 2 = duration
ld 0x0D(ix), a
```

**No sign extension on vx/vy.** Direction comes entirely from the angle.

### 2.2 Token jump table (d_0920_jp_tbl, 17 entries) [verified, gg1-5.s:1494-1511]

| Token | Handler | Purpose | Args | Side-effects |
|-------|---------|---------|------|--------------|
| 0xFF | `case_0E49` | END — make object inactive (remove from queue) | 0 | Clears 0x13(ix), sets b_8800[id]=0x80, clears sprite |
| 0xFE | `case_0B16` | BREAK formation (level 3+ attack) | 0+ | Reads ship X, computes targeting offset, advances HL by 9 |
| 0xFD | `case_0B46` | JUMP — unconditional load new path pointer | 2 (addr) | Sets HL = new pointer, continues at `j_090E_flite_path_init` |
| 0xFC | `case_0B4E` | DIVE — set dive origin Y | 1 (origin Y) | Stores at 0x06(ix), sets bit 5 of 0x13(ix), break |
| 0xFB | `case_0AA0` | **TURN_HOME — REDIRECT toward formation slot** | 0 | See §6 below |
| 0xFA | `case_0BD1` | LOOP_TOP — conditional reload | 2 (alt addr) | If `cont_bmb && !task_actv[0x1D]`: skip; else load new ptr |
| 0xF9 | `case_0B5F` | REENTER_COLUMN — re-enter at home column | 0 | Sets 0x03(ix) X to the home-column coord |
| 0xF8 | `case_0B87` | REENTER_TOP — re-enter at top (NOT a tractor beam; the `.dw` "tractor beam reaches ship" comment is a mislabel — the code only sets Y) | 0 | Sets 0x01(ix) = 0x9C (rawY → canvas top edge) |
| 0xF7 | `case_0B98` | ATTACK_TURN — conditional jump if transient | 2 (sub addr) | If `obj_id & 0x38 == 0x38`: jump to addr; else skip |
| 0xF6 | `case_0BA8` | FREE_FLIGHT — enter free-flight | 1 (heading angle) | Sets angle 0x04/0x05 = arg<<2 (10-bit heading) + arms bomb-drop |
| 0xF5 | `case_0942` | Set status to 3, advance to next | 0 | Continue path |
| 0xF4 | `case_0A53` | Capture-boss diving | 0+ | Special handling |
| 0xF3 | `case_0A01` | BREAK_TARGETED — pick sub-path by ship deltaX | 2 (LUT addr) + 6-byte LUT | Computes target index 0-5, picks sub-path |
| 0xF2 | `case_097B` | Bonus-bee split | 2 (sub path) | Spawns split-off bee in new queue slot |
| 0xF1 | `case_0968` | Diving stops, bug goes home | 0 | Sets 0x01(ix) = home Y + 0x20 |
| 0xF0 | `case_0955` | ATTACK_WAVE — stage 8+ gated jump | 2 (alt addr) | If stage ≥ 8: load new ptr; else skip |
| 0xEF | `case_094E` | BOMB_MODE — stage 8+ gated jump | 2 (alt addr) | Same gate as F0 |

**No call stack.** All "calls" (FD, F0, F7, etc.) are JUMPS that REPLACE
the path pointer. There's no return mechanism — the new path runs until
its own terminator (FF or FB), then enemy stops/snaps. So our prior
"sub-path call/return" framing was wrong: these are jumps, not calls.

## 3. Per-tick interpreter cycle (`f_08D3`) [verified, gg1-5.s:1422-1525]

For each of 12 slots:

```
1. Check active (bit 0 of 0x13). If clear, skip slot.
2. Increment global b_bugs_flying_cnt.
3. Read disposition b_8800[obj_id]. If not 3, 7, or 9 → call case_0E49 (deactivate).
4. Decrement segment timer (0x0D).
5. If timer hit 0:
     a. Set HL = path pointer (0x08, 0x09).
     b. Read byte at HL.
     c. If byte ≥ 0xEF → dispatch via jp-table (token handler).
     d. Else → load_segment (parse 3 bytes, advance HL by 3, save pointer at 0x08/0x09, set timer).
6. Continue to flite_pth_cont:
     a. If bit 6 of 0x13 set (homing): check if (b01,b03) ≈ (b06,b07) ± 1. If yes → snap home (l_0E08).
     b. Otherwise: do motion update (next section).
```

## 4. Motion update — THE corrected model [verified, gg1-5.s:2079-2270]

This is where my previous implementation was fundamentally wrong.

### 4.1 Step sequence per frame:

```
A. angle += rotRate   (line 2080-2102)
   Stored in 0x04 (low) + 0x05<0:1> (high). 10-bit angle (0-1023 = 0-360°).

B. Choose magnitude A based on FRAME PARITY (line 2150-2157):
     odd frame  → A = 0x0A(ix) = vx
     even frame → A = 0x0B(ix) = vy

C. Determine PRIMARY axis from angle (line 2179-2188):
     Primary axis = X or Y depending on which dimension the angle is closer to.
     Specifically: if XOR of angle bits 7 and 8 is set → primary is Y, else X.
     (At angles near 0° or 180°, primary is X; near 90° or 270°, primary is Y.)

D. Determine sign of primary motion from quadrant (line 2197-2201):
     Quadrants 1-3 (135° to 305°) → negate magnitude.
     Quadrants 0 and 4 (else) → keep positive.

E. Apply primary motion (line 2204-2214):
     primary_position += signed_A << 7  (i.e. add A*128 to fixed-point coord)

F. Apply secondary motion via L × A multiply (line 2222-2270):
     L = angle bits within current quadrant (0-127, complemented for some quadrants)
     HL = L × A   (via c_0E97)
     secondary_position += HL  (16-bit add to fixed-point coord)
```

### 4.2 What this means in JS terms

The Z80 motion model is **functionally equivalent** to:

```js
const A = (frameCount & 1) ? e.vx : e.vy;
const angleRad = e.angle * 2 * Math.PI / 1024;
e.x += A * Math.cos(angleRad);
e.y -= A * Math.sin(angleRad);     // -sin because canvas Y is INVERTED from Z80 internal Y
```

**Both X AND Y update EVERY frame** with the SAME magnitude `A`, scaled
by `cos` and `sin`. The Z80's piecewise primary/secondary code is a
performance optimization for sin/cos LUT use; the math is the same.

**Crucial difference from current bugMotion.js:** We currently update
ONLY ONE axis per frame (X on even, Y on odd), with vx for X and vy for
Y. The Z80 updates BOTH axes per frame, and the magnitude alternates
between vx and vy. **This is roughly 2x more motion than we currently
produce — directly explaining the "curve too small" complaint.**

### 4.3 Sign convention verification

Z80 quadrant diagram (gg1-5.s:2174-2178):
```
         90
       1  | 0
    180 --+-- 0     0° = right
       2  | 3
         270
```

Z80 internal Y is inverted from canvas Y (rendering applies `cpl`). So:
- Z80 angle 90° = "up" in Z80 = canvas DOWN ❌ ... actually let me re-verify.

The renderer at gg1-5.s:2305-2316 does `add 0x4F; cpl`. So when internal
rawY INCREASES, pixel_Y DECREASES. "Increasing rawY" maps to "canvas up".

The motion code at angle 270° has primary axis Y, with NEGATED magnitude
(quadrant 3, line 2197-2201). So at angle 270°, internal_Y += -A. That
makes internal_Y DECREASE, which means pixel_Y INCREASES, which is
canvas DOWN.

So: Z80 angle 270° produces canvas-DOWN motion. ✓ (Matches the diagram.)

In JS using `Math.sin`: at 270°, sin = -1. Formula `dy = -A × sin(angle)`
gives `dy = -A × -1 = +A`. Positive dy = canvas DOWN. ✓

For angle 90°: sin = +1. `dy = -A × 1 = -A`. Negative dy = canvas UP. ✓

### 4.4 Negate-rotation flag (bit 7 of 0x13) [verified, gg1-5.s:2014-2018]

When the flag is set (bit 6 of wave byte was set), the rotation rate
loaded from segment byte 1 is `neg`-ed before being stored at `0x0C(ix)`:

```asm
ld a, (hl)               ; byte 1 of segment
bit 7, 0x13(ix)
jr z, l_0BF7
neg
l_0BF7:
ld 0x0C(ix), a
```

So pair member 1's path runs with all rotations REVERSED — clockwise
becomes counterclockwise. **Combined with starting at the partner
variant position, this produces mirrored arcs.** This is the
single biggest visual fix needed.

## 5. Coordinate transforms (rendering) [verified, gg1-5.s:2275-2330]

These convert internal position (b01 = rawY high byte, b03 = rawX high
byte, plus integer-bit-0 from low bytes b00/b02) to sprite position.

### 5.1 X axis (not-flipped) [gg1-5.s:2287-2299]
```
sprite_X = (rawX << 1) + integer_bit_0_from_low_byte    ; 0..255 (modulo)
canvas_X = sprite_X - 10                                ; per CLAUDE.md
```
For initial position (low byte = 0): `canvas_X = rawX × 2 - 10`.

### 5.2 Y axis (not-flipped) [gg1-5.s:2305-2321]
```
mid    = (~(rawY + 0x4F)) & 0xFF
final  = (mid << 1) + (1 - integer_bit_0_from_low_byte)
canvas_Y = final
```
For initial position (low byte = 0): `canvas_Y = ((~(rawY + 0x4F)) & 0xFF) × 2 + 1`.

### 5.3 Verification — variant 0
- rawX = 0x34, rawY = 0x9B
- canvas_X = 0x34 × 2 − 10 = 94
- canvas_Y = (~0xEA & 0xFF) × 2 + 1 = 0x15 × 2 + 1 = 43
- Pair 0 member 0 starts at canvas (94, 43). ✓ (Matches research_stage_init.md.)

## 6. FB TURN_HOME does NOT instant-snap [verified, gg1-5.s:1768-1846]

**Status: ✓ implemented in INT-7** (bugMotion.js — `'homing'` state). The
description below documents the Z80 behavior we're now mirroring; the
correction-table row in §10 has been moved to §11.5 implemented log.

The Z80 actually:

1. Sets disposition b_8800[obj_id] = 9 (homing/diving).
2. Reads home formation slot's row+column from `sprt_fmtn_hpos[obj_id]`.
3. Reads slot's pixel coords + offsets from `ds_hpos_loc_t` and `ds_hpos_loc_orig`.
4. Stores X/Y "step" values into 0x11/0x12.
5. Stores home position (b06=Y, b07=X).
6. Calls `c_0E5B` to compute the angle from current position to home.
7. Stores that angle into 0x04/0x05 (the enemy now FACES home).
8. Sets bit 6 of 0x13 (turns on home-check mode).

Then `l_0C05_flite_pth_cont` (line 2030-2053) checks bit 6 each frame and
tests if the enemy's current position (b01, b03) is within ±1 of home
(b06, b07). When it is, jumps to `l_0E08_imhome` for the actual snap.

**So FB starts a guided flight to the home slot, not an instant snap.**
The enemy continues through the motion loop with the new angle aimed at
home. After a few frames of flying, it arrives within 1 px and the
formation transition triggers.

## 7. Sprite frame from angle [verified, gg1-5.s:2104-2148]

The rendered sprite frame (8 directions) is computed from the 10-bit
angle:

```
1. Take e (angle low byte from before update) and c (angle high byte).
2. If quadrant 1 or 3 (bit 0 of c set): cpl e (mirror direction).
3. A = e + 21    ; offset to centre tile boundaries on 90°/270°
4. If carry → frame = 6 (vertical orientation, wings open). Skip step 5.
5. frame = ((A * 3/4) >> 5) & 0x07
   (Equivalent to A / 42 rounded; 1024 / (8 directions) = 128 angle
    units / direction, but stepped via the divide).
6. ds_sprite_code[obj_id].b0 = (current & 0xF8) | frame
7. Sprite control flips set from quadrant bits (line 2140-2148):
   bit 0 = flip-X (vertical flip), bit 1 = flip-Y (horizontal flip)
```

**For our JS port:** this should drive sprite-frame selection during
fly-in/attack instead of the current `(frameCount >> 5) & 1` time-based
toggle in `objectStates.render`. Otherwise enemies face the same way the
whole time, which looks wrong on curved trajectories.

## 8. Path termination — three modes

| Token | What happens | When used |
|-------|--------------|-----------|
| 0xFF END | Object removed from queue (case_0E49) | Death, off-screen exit |
| 0xFB TURN_HOME | Guided flight to home slot, then formation transition | Fly-in completion, attack-dive recovery |
| 0xFD JUMP / 0xF0 / 0xF7 / etc. | Pointer replaced; new path runs | Continuation/branching mid-flight |

A path that reaches its end without a terminator is undefined behavior
(would read past the data block as garbage segments or tokens). All real
paths end with FF or FB.

## 9. Edge cases

- **Slot reuse:** When an enemy is destroyed (case_0E49 sets 0x13 = 0),
  the slot becomes available. Subsequent launches will reuse it (the
  search at gg1-3.s:1736-1745 finds the first slot with bit 0 of 0x13
  clear).
- **Disposition mismatch:** if `b_8800[obj_id]` is not 3, 7, or 9 when
  `f_08D3` runs, the object is forcefully deactivated (gg1-5.s:1456).
  This handles cases like "captured" or "killed" mid-flight.
- **Home-check during normal flight:** bit 6 of 0x13 is only set after
  FB. Before FB, the home check is bypassed and the enemy flies freely.

## 10. Critical corrections from current bugMotion.js

Status legend: ✓ implemented · ⏳ pending

| Status | Original code did | Z80 actually does | Fix |
|--------|--------------------|-------------------|-----|
| ✓ | Update one axis per frame, alternating X↔Y | Update BOTH axes per frame, alternating MAGNITUDE between vx and vy | Rewrite motion update |
| ✓ | `e.x += vx × cos`, `e.y += -vy × sin` | `e.x += A × cos`, `e.y -= A × sin` where A alternates vx/vy | Use single A magnitude |
| ✓ | Skip rotation negate for pair members | Negate rotRate when bit 7 of 0x13 set (= bit 6 of wave byte) | Add `negateRotation` field; apply in loadSegment |
| ✓ | FB TURN_HOME: instant transition to 'formation' | Guided flight: aim at home, fly until within ±1 px, then snap | Added `'homing'` state with `Math.atan2`-based target-angle compute (mathematically equivalent to c_0E5B per file-header arithmetic policy) |
| ✓/⏳ | Sub-paths skipped (F7/F0 etc) | Not "skipped" — they're conditional JUMPS that REPLACE pointer | **F0 done** (2026-06-22, stage-8+ gate, pointer-replace via paths.js `.subPaths`). **F7 deferred** — gate fires only for transient members the clone never launches; needs the transient layer + FE token (research_attack_paths.md §8). |
| ⏳ | Sprite frame from frameCount | Sprite frame from current angle (8 directions + flips) | Compute frame in objectStates.render |

## 11. Implementation order suggestion

1. ✓ **Motion model rewrite** — both-axes-per-frame using alternating
   magnitude. Fixed curve size (INT-2c, commit 8d78fbb).
2. ✓ **Rotation negation** for pair member 1 — wishbone arc visual
   (INT-2c, same commit).
3. ✓ **FB TURN_HOME guided homing** — `'homing'` state, `Math.atan2`
   target-angle, `HOME_THRESHOLD = 2` canvas px (= ±1 in Z80 raw high
   byte after the rendering pipeline's ×2). INT-7.
4. ⏳ **Sprite-frame from angle** — visual polish (enemies face the right
   way during curves).
5. **Token handlers** (FD, F0, F7, etc.) — for stages 4+ and attack
   dives. Stage 1 doesn't strictly need them (verified in earlier
   research); stage 1 paths use only END (FF) and TURN_HOME (FB) when
   the F7/F0 conditions are not met. Status: FD, F0, and the attack-dive
   tokens are ✅ done; **F7 is deferred** (transient layer + FE — see
   research_attack_paths.md §8).
