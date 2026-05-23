# research_collisions.md — Collision detection, asteroid splitting, scoring

Source-of-truth references: `Code.md` `$69F0-$6B90` (collision dispatch
+ kernel + resolution) and `RAMUse.md` (status-byte semantics).
Citations use `$xxxx` form.

Prerequisites: [[research_position_math.md]] (position model, signed
velocities), [[research_main_loop.md §3]] (`$69F0` is task #14 in the
per-frame JSR chain).

## §1. Overview

Asteroids' collision detection is **purely geometric** — no pixel
readback, no tile lookup, no DVG-list inspection. Source compares
object positions in game-coord space and tests against per-target
distance thresholds.

The threshold shape is a **bounding-box intersected with a Manhattan
diamond**: `|dx| ≤ r` AND `|dy| ≤ r` AND `|dx| + |dy| ≤ 1.5r`. This
approximates a circle of radius `r` using only one subtraction and
one addition per axis — no multiplication, well-suited to 6502.

The radius `r` depends on the asteroid size (encoded in status byte
low bits) plus per-source-object adjustments (the ship has a larger
hitbox than ship-shots; the large saucer is bigger than the small).

## §2. Dispatch — who tests against whom

The `$69F0 collisions` entry runs once per frame from the main loop
(task #14 in [[research_main_loop.md §3]]).

### Outer loop — the "shooter / hit-target" set ($69F0-$69FC)

```
69F0  LDX #$07                       ; X = 7..0
69F2  LDA $021B,X                    ; status of slot ($021B + X)
69F5  BEQ $69F9                      ; skip empty
69F7  BPL $69FD                      ; live, go check (skip if exploding)
69F9  DEX
69FA  BPL $69F2                      ; next slot
69FC  RTS
```

X indexes into the **8-slot block at `$021B-$0222`**:

| X | RAM slot      | Object        |
|---|---------------|---------------|
| 0 | `$021B`       | Ship          |
| 1 | `$021C`       | Saucer        |
| 2 | `$021D`       | Saucer shot 1 |
| 3 | `$021E`       | Saucer shot 2 |
| 4 | `$021F`       | Ship shot 1   |
| 5 | `$0220`       | Ship shot 2   |
| 6 | `$0221`       | Ship shot 3   |
| 7 | `$0222`       | Ship shot 4   |

So the outer X-loop walks ship → saucer → saucer-shots → ship-shots.
Asteroids (slots `$00-$1A`, status at `$0200-$021A`) are NOT outer-X
candidates — they are only ever the target (inner Y).

The "live + non-exploding" filter `BEQ` skip + `BPL` continue means
exploding objects (status with high bit set) don't participate.

### Inner loop — the "target" set ($69FD-$6A09)

```
69FD  LDY #$1C                        ; Y = $1C (saucer slot)
69FF  CPX #$04                        ; X >= 4 ? (ship-shot)
6A01  BCS $6A0A                       ;   yes — start scan at $1C
6A03  DEY                             ; X < 4 — adjust Y
6A04  TXA
6A05  BNE $6A0A                       ;   X != 0 (saucer or saucer-shot) — start at $1B (ship)
6A07  DEY
6A08  BMI $69F9                       ;   X = 0 (ship) — start at $1A (top asteroid), so saucer + ship aren't checked
```

Y starts at:

| Outer X (slot)         | Y start | What Y scans                          |
|------------------------|---------|---------------------------------------|
| 0 (ship)               | `$1A`   | Asteroids only (no ship-vs-saucer at this site) |
| 1 (saucer)             | `$1B`   | Ship + asteroids                      |
| 2-3 (saucer shots)     | `$1B`   | Ship + asteroids                      |
| 4-7 (ship shots)       | `$1C`   | Saucer + ship + asteroids             |

Y then decrements through the listed range, scanning every active
slot. Each X/Y pair is tested by the kernel at `$6A0A` (§3).

**Edge cases worth noting:**

- Ship-vs-saucer (X=0, would need Y=$1C) is skipped here. That
  collision lives at `$6B73+` inside the resolution path,
  triggered by saucer-shot-vs-ship instead — or possibly handled
  elsewhere in the source (TBD if it surfaces during implementation).
- Ship-shot-vs-ship-shot, saucer-shot-vs-saucer-shot: never tested.
  Shots pass through each other freely.
- Ship-shot-vs-saucer-shot: never tested. Shots are immune to each
  other across "owner" lines too.

## §3. The collision kernel ($6A0A-$6A95)

Operates on (outer X, inner Y) pair. X identifies a "shooter / hit
victim" (ship, saucer, or shot); Y identifies an asteroid (most
cases) or ship/saucer (when X is a shot).

### Step 1: Load + early-out ($6A0A-$6A12)

```
6A0A  LDA $0200,Y                    ; Y's status
6A0D  BEQ $6A07                      ; empty → next Y
6A0F  BMI $6A07                      ; exploding → next Y
6A11  STA $0B                        ; save status (for size lookup in §4)
```

### Step 2: Compute absolute |dx| ($6A13-$6A32)

The pattern is the 6502 standard 16-bit signed subtract + absolute-
value with sign-extension trick:

```
6A13  LDA hposl[Y]                   ; dx_lo = hposl[Y] - hposl[X]
6A16  SEC
6A17  SBC hposl[X]
6A1A  STA $08                        ; $08 = dx_lo
6A1C  LDA hposh[Y]                   ; dx_hi = hposh[Y] - hposh[X] (with borrow)
6A1F  SBC hposh[X]
6A22  LSR A; ROR $08; ASL A          ; extract sign bit into A
6A26  BEQ $6A34                      ; dx_hi was 0 → dx is small positive
6A28  BPL $6A97                      ; dx_hi positive but not 0 → too far → skip
6A2A  EOR #$FE                       ; check if dx_hi == $FF
6A2C  BNE $6A97                      ; else → too far → skip
6A2E  LDA $08
6A30  EOR #$FF                       ; one's-complement → ≈ abs(dx_lo)
6A32  STA $08                        ; $08 = |dx| (now strictly positive)
```

Same pattern repeats for vertical at `$6A34-$6A53`, producing `$09 =
|dy|` and using vposl[Y] - vposl[X] and vposh[Y] - vposh[X].

The check `dx_hi must be 0 or $FF` enforces a **proximity gate**: the
two objects must be within ±256 sub-tile units (i.e., within one
high-byte tile) on each axis before the radius test even runs. This
makes the kernel O(targets) cheap — most pairs are dismissed in 6
instructions.

### Step 3: Radius lookup ($6A55-$6A75)

```
6A55  LDA #$2A                       ; small radius = 42
6A57  LSR $0B                        ; status[Y] bit 0 → carry
6A59  BCS $6A63                      ; if set, use small
6A5B  LDA #$48                       ; medium radius = 72
6A5D  LSR $0B                        ; status[Y] bit 1 → carry
6A5F  BCS $6A63                      ; if set, use medium
6A61  LDA #$84                       ; else large = 132
6A63  CPX #$01                       ; X = ship?
6A65  BCS $6A69                      ;   no, skip ship adjustment
6A67  ADC #$1C                       ;   yes — A += 28
6A69  BNE $6A77                      ; (branch only true if X is shot or saucer/saucer-shot)
6A6B  ADC #$12                       ;   X = saucer-shot path — A += 18
6A6D  LDX $021C                      ; (statusSaucer)
6A6E  DEX
6A6F  BEQ $6A75                      ;   small saucer — done
6A73  ADC #$12                       ;   large saucer — A += another 18
6A75  LDX #$01                       ; (restore X)
6A77  ... (move to test phase)
```

Combined radius table:

| Asteroid size | Base r | + Ship X=0 | + Saucer shot vs saucer-1 | + Saucer shot vs saucer-2 |
|---------------|--------|-----------|--------------------------|--------------------------|
| Small  (bit 0)| 42     | 70        | 60 (= 42+18)            | 78 (= 42+18+18)          |
| Medium (bit 1)| 72     | 100       | 90                       | 108                      |
| Large  (none) | 132    | 160       | 150                      | 168                      |

Asteroid-size encoding in `status[Y]` (low 2 bits, **first-set-bit
wins**):

| status[Y] low nibble | Size  | Radius |
|----------------------|-------|--------|
| `xxxx xx_1`          | Small | 42     |
| `xxxx x10`           | Medium| 72     |
| `xxxx x00`           | Large | 132    |

The remaining bits in `status[Y]` (high 4 bits) encode the asteroid's
**shape rotation / animation frame** (per [[research_position_math.md
§3]] which showed the asteroid-update routine increments the upper
nibble of status by `$10` per rotation step).

### Step 4: Threshold tests ($6A77-$6A8F)

Three tests in sequence — collision requires all three to pass.

```
6A77  CMP $08                        ; r vs |dx|
6A79  BCC $6A97                      ; r < |dx| → no hit
6A7B  CMP $09                        ; r vs |dy|
6A7D  BCC $6A97                      ; r < |dy| → no hit
6A7F  STA $0B                        ; $0B = r
6A81  LSR A                          ; A = r/2
6A82  CLC
6A83  ADC $0B                        ; A = r + r/2 = 1.5*r
6A85  STA $0B                        ; $0B = 1.5*r
6A87  LDA $09                        ; |dy|
6A89  ADC $08                        ; |dy| + |dx|
6A8B  BCS $6A97                      ; carry-out → too big → no hit
6A8D  CMP $0B                        ; (|dx|+|dy|) vs 1.5*r
6A8F  BCS $6A97                      ; >= 1.5*r → no hit
6A91  JSR $6B0F                      ; HIT — resolve
```

Three conditions:

```
|dx|       <  r        (bounding-box X)
|dy|       <  r        (bounding-box Y)
|dx|+|dy|  <  1.5*r    (Manhattan diamond, approximates circle)
```

Geometry visualization (radius 100 example):

```
                         |
                       50│  +1.5r
                  ┌──────┼──────┐   <- top of BB
                  │   ╱  │  ╲   │
                  │  ╱   │   ╲  │   diamond corners at (r, 0), (0, r), etc.
              ─50─┤────╱─0─╲────│─50──
                  │  ╲   │   ╱  │
                  │   ╲  │  ╱   │
                  └──────┼──────┘   <- bottom of BB
                       50│  +1.5r
                         |
```

The intersection: BB clips the diamond's corners; diamond's edges
clip the BB's corners. Net hitbox is an octagon roughly approximating
a circle of radius `r`.

## §4. Wrap-awareness — none

Important: **the proximity gate in §3 step 2 enforces dx_hi ∈ {0,
$FF} only — it is NOT wrap-aware.**

If ship is at `hposh = 30` and asteroid at `hposh = 1`, the visual
distance across the screen wrap is small (2 tiles), but the
arithmetic dx_hi = 1 - 30 = $E3 (not $FF), so the proximity gate
rejects the pair → no collision tested.

This is a minor known inaccuracy in the original game: objects on
opposite sides of a screen-wrap edge don't collide until they
visually overlap *without* wrapping. In practice it's rarely visible
because asteroid density across the wrap line is low.

**Port choice:** Match source behavior (faithful) or fix with
wrap-aware modular distance. Recommend matching — the wrap-aware fix
changes gameplay subtly. If we later want to fix it, the change is
localized: compute `dx = mod(asteroid.x - ship.x + 16, 32) - 16` to
get the shortest-wrap distance.

## §5. Collision resolution — `$6B0F`

The kernel JSRs to `$6B0F` when both threshold tests pass. The
resolution routine:

```
6B0F  CPX #$01                       ; ship-vs-saucer special case
6B11  BNE $6B1B                      ; (not the ship+saucer case)
6B13  CPY #$1B
6B15  BNE $6B29                      ;
6B17  LDX #$00; LDY #$1C             ; relabel
6B1B  TXA
6B1C  BNE $6B3C                      ; if X != 0, branch (handles shots)
6B1E  LDA #$81                       ; X = 0 → ship dies
6B20  STA $02FA                      ;   set shipSpawnTimer
6B23  LDX curPlayer
6B25  DEC $57,X                      ;   -1 ship for current player
6B27  LDX #$00
6B29  LDA #$A0                       ; mark target as "exploding"
6B2B  STA $021B,X                    ;   (statusShip or statusSaucer or shot's status)
6B2E  LDA #$00
6B30  STA $023E,X                    ; zero velocity X
6B33  STA $0261,X                    ; zero velocity Y
6B36  CPY #$1B                       ; was Y the ship?
6B38  BCC $6B47                      ;   no — Y is an asteroid, go split
6B3A  BCS $6B73                      ;   yes — score saucer (path at $6B73)
6B3C  LDA #$00                       ; (path for shot hitting asteroid: zero shot timer)
6B3E  STA $021B,X                    ;   ($021F-$0222 ; shipShotsTimer)
6B41  CPY #$1B                       ; was Y the ship?
6B43  BEQ $6B66                      ;   yes — handle "saucer-shot killed player"
6B45  BCS $6B73                      ;   no, but Y > $1B → Y was saucer → score it
6B47  JSR $75EC                      ; asteroid-hit score + child-spawn (visible at $75EC-$7658; see §5.1 below)
6B4A  LDA $0200,Y
6B4D  AND #$03                       ; pick out size bits
6B4F  EOR #$02                       ; flip bit 1 (large→large doesn't toggle; small→medium-ish)
6B51  LSR A
6B52  ROR A; ROR A                   ; pack into A
6B54  ORA #$3F                       ;   form sound-duration byte
6B56  STA $69                        ; sound timer for explosion
6B58  LDA #$A0
6B5A  STA $0200,Y                    ; mark asteroid as exploding
6B5D  LDA #$00
6B5F  STA $0223,Y                    ; zero asteroid horizontal velocity
6B62  STA $0246,Y                    ; zero vertical velocity
6B65  RTS
```

Three resolution paths emerging from `$6B0F`:

1. **Shot hits asteroid** (`X = 2..7`, `Y = asteroid slot`)
   — zero shot timer (`$021F+X`) and the asteroid's status →
   `$A0` (exploding), zero its velocity, call `$75EC` to add score
   + play explosion sound, then **proceed to asteroid-split** at
   `$6B47-$6B65`.
2. **Saucer-shot hits ship** (`X = 2-3 saucer-shot`, `Y = $1B
   ship`) — ship dies via `$6B29-$6B33`: status → `$A0`, velocity
   = 0, `shipSpawnTimer = $81`, decrement `ply{1,2}CurShips`, plus
   the score and sound treatment at `$6B66+`.
3. **Ship hits asteroid** (`X = 0 ship`, `Y = asteroid`) — same as
   shot-hits-asteroid plus the ship-death sequence from
   `$6B1E-$6B27`.
4. **Ship-shot hits saucer** (`X = 4-7 ship-shot`, `Y = $1C
   saucer`) — at `$6B73`: score 200 (large) or 990 (small) added
   to current player's `$52-$55` via `$7397`, then asteroid-split
   path is reused with Y rerouted (actually the saucer just sets
   exploding + zero-vel; no "split").

### Asteroid splitting ($6A9D-$6AD2)

This routine (called when a hit asteroid was large or medium and
needs to spawn smaller pieces) **copies** asteroid data from slot Y
to a target slot X with adjusted size and slightly randomized
velocity:

```
6A9D  LDA $0200,Y                    ; source status
6AA0  AND #$07                       ;   keep low 3 bits
6AA2  STA $08
6AA4  JSR $77B5                      ; advanceRNG
6AA7  AND #$18                       ; pick out 2 random bits (rotation increment)
6AA9  ORA $08                        ;   OR with kept low bits
6AAB  STA $0200,X                    ; new status
6AAE  LDA hposl[Y]
6AB1  STA hposl[X]                   ; same position as parent
6AB4  LDA hposh[Y]
6AB7  STA hposh[X]
6ABA  LDA vposl[Y]
6ABD  STA vposl[X]
6AC0  LDA vposh[Y]
6AC3  STA vposh[X]
6AC6  LDA horzVel[Y]
6AC9  STA horzVel[X]                 ; same velocity as parent (will be perturbed by caller)
6ACC  LDA vertVel[Y]
6ACF  STA vertVel[X]
6AD2  RTS
```

Note: the parent asteroid is NOT yet downgraded here — the caller
must handle that. The split routine is the "spawn a child"
primitive. The size-downgrade and velocity-perturbation happen at
the call site (`$75EC` — see §5.1 below).

The visible code at `$6B4D-$6B4F` shows the **size-downgrade
pattern**:

```
LDA $0200,Y     ; status
AND #$03        ; isolate size bits
EOR #$02        ; flip bit 1 → demote
```

- Large (00) ⊕ 02 = 10 → medium
- Medium (10) ⊕ 02 = 00 → large?!

Hmm, that doesn't read as a clean downgrade. The pattern is more
complex than a simple ⊕ — likely the upstream caller chooses the new
size differently. The visible code's `EOR #$02` is feeding into a
sound-duration calculation (`STA $69 sndTimeExplosion`), not the
status downgrade. **Status downgrade is performed by `$75EC` (see
§5.1) via a different path — LSR A then OR with retained
rotation bits, with branch-around for the large/small case.**

### §5.1. `$75EC` — asteroid-hit handler (decoded 2026-05-24)

Fully visible at `Code.md $75EC-$7658`. Called from `$6B47` after a
shot-vs-asteroid or ship-vs-asteroid collision is resolved. Does:
score + status downgrade + spawn 0/1/2 child asteroids.

```
75EC  STX $0D                        ; save shooter slot (X)
75EE  LDA #$50; STA $02F9 (asteroid_hit_timer)
75F3  LDA statusAsteroids[Y]; AND #$78; STA $0E   ; preserve upper rotation bits (mask $78 = bits 3-6)
75FA  LDA statusAsteroids[Y]; AND #$07            ; isolate size bits 0-2
75FF  LSR A; TAX                                  ; X = shifted size index
                                                  ;   large $00 → X=0 (carry=0)
                                                  ;   small $01 → X=0 (carry=1)
                                                  ;   medium $02 → X=1 (carry=0)
7601  BEQ $7605                                   ; X==0 → skip status update (leaves large/small status alone)
7603    ORA $0E                                   ; X==1 → re-attach rotation bits to shifted size
7605  STA statusAsteroids[Y]                      ; write back (only meaningful when not branched over)

  ; SCORING — gated by numPlayers != 0 (no score in attract mode)
7608  LDA $1C (numPlayers); BEQ $761D
760C  LDA $0D; BEQ $7614                          ; shooter-slot==0 (ship hit asteroid): score the player
760E  CMP #$04; BCC $761D                         ; shooter < 4 (saucer/saucer-shot): no score
7614  LDA $7659,X                                 ; score = scoreTable[X]
                                                  ;   $7659 = $10 BCD (large/small)
                                                  ;   $765A = $05 BCD (medium)
7617  LDX $19; CLC; JSR $7397                     ; BCD-add to current player score (tens byte)

  ; FIRST CHILD ASTEROID
761D  LDX statusAsteroids[Y]
7620  BEQ $7656                                   ; if asteroid is now empty (small was destroyed), done
7622  JSR $745A                                   ; find a free asteroid slot (X = slot or -1 if none)
7625  BMI $7656                                   ; no free slot → skip spawn
7627  INC $02F6 (curAsteroidCount)
762A  JSR $6A9D                                   ; SPLIT-COPY: copy parent state into slot X
762D  JSR $7203                                   ; PERTURB velocity: child = parent + random ±15
                                                  ; (also nudges horizontal sub-tile position by horzVel * 2 XOR hposl)
7630  LDA horzVelAsteroids[X]; AND #$1F; ASL A; EOR hposlAsteroids[X]; STA hposlAsteroids[X]

  ; SECOND CHILD ASTEROID
763C  JSR $745C                                   ; find another free slot
763F  BMI $7656                                   ; none → done
7641  INC $02F6
7644  JSR $6A9D
7647  JSR $7203
764A  LDA vertVelAsteroids[X]; AND #$1F; ASL A; EOR vposlAsteroids[X]; STA vposlAsteroids[X]

7656  LDX $0D; RTS                                ; restore X = shooter slot
```

**Key facts:**
- **Score table at `$7659`** (2 bytes): `$10` for {large, small}, `$05` for {medium}. Mapped to standard 20/50/100 scoring via the BCD-add target byte's place value (`$7397` adds to "tens" byte at `$52,X`, so `$10 BCD = 100 pts`, `$05 BCD = 50 pts`). **The "large = 20 / medium = 50 / small = 100" claim was wrong** — actually the score is 100 for large AND for small (BCD `$10`), and 50 for medium (BCD `$05`).
  *Verification TODO during I-9/I-11*: confirm against cabinet behaviour and Mikstas's annotations — the value table is 2 bytes, but classic Asteroids documents 3 distinct scores.
- **Status downgrade**: `LSR A` of the size bits then re-OR with rotation bits — but only stored when result is non-zero (medium → small case). Large and small hits leave status[Y] unchanged; presumably the caller `$6B47` already set status to `$A0` (exploding) before `$75EC` runs, and that's what gets seen by the asteroid-explosion-anim path.
- **Child count is dynamic** — up to 2 children spawned, but only as many as `$745A`/`$745C` can find free slots for, AND only if the (presumed-already-exploding) parent's status passes the `BEQ $7656` checks. Source effectively spawns 0-2 children depending on slot availability and asteroid type.
- **`$745A`/`$745C`** at `Code.md $7531-...` (fully visible) — asteroid-slot scanners returning the next free slot index or negative if none. Investigate exact body during I-9.
- **Velocity perturbation `$7203`** documented in [[research_main_loop.md §10]] context: random ±15 added to parent velocity, clamped via `$7233` to magnitude `[6, 31]` source-byte units. The 4 extra `JSR $77B5` calls in `$7203` between the X and Y perturbations are entropy-mixing to decorrelate the two axes.
- **Sub-tile position jitter** at `$7630`/`$764A`: child's low-byte position is XOR'd with `(horzVel & $1F) << 1` (and same for vertical with vposl/vertVel). Cheap per-axis decorrelation so children don't perfectly overlap at the parent's tile center.

### Scoring ($6B73-$6B90)

Visible scoring path for saucer kill:

```
6B73  LDA $02F8                      ; saucerTimeReload
6B76  STA $02F7                      ; reset saucerTimer (re-arm)
6B79  LDA $1C (numPlayers)
6B7B  BEQ $6B4A                      ; attract mode — skip scoring
6B7D  STX $0D                        ; save X
6B7F  LDX $19                        ; (other player?)
6B81  LDA $021C
6B84  LSR A                          ; statusSaucer >> 1 → carry
6B85  LDA #$99                       ; 990 = $99 (BCD)
6B87  BCS $6B8B                      ; small saucer → 990
6B89  LDA #$20                       ; large saucer → 200 = $20 (BCD)
6B8B  JSR $7397                      ; add to player score (decimal mode — see [[research_hardware.md §1]])
6B8E  LDX $0D
6B90  JMP $6B4A
```

Scoring values:

| Target           | Score (BCD) |
|------------------|-------------|
| Large saucer     | 200 (`$20`) |
| Small saucer     | 990 (`$99` → expanded by `$7397` BCD logic) |
| Large asteroid   | **100** (`$10` BCD added to tens byte) — see §5.1 |
| Medium asteroid  | **50** (`$05` BCD) — see §5.1 |
| Small asteroid   | **100** (`$10` BCD — same as large) — see §5.1 |
| Ship             | (no score) |

The source-of-truth is the 2-byte table at `$7659`: `$10, $05`,
indexed by `(sizeBits >> 1)`. **The classic "20/50/100" scoring
documentation contradicts the source** — to be reconciled during
I-11 against cabinet behaviour or Mikstas's annotations. Possible
explanations: (a) the third score lives in a different code path
(e.g. saucer-shot bonus), (b) the `$7397` BCD-add logic
re-interprets the byte differently for one size, or (c) the
documented 20/50/100 is a misremembering.

## §6. Port spec

The JS port models collision as a single per-frame pass with the
same outer/inner topology. The threshold shape — BB ∩ Manhattan — is
trivial to replicate, but we should also consider replacing it with
**either** a clean Euclidean test (modern, more accurate) **or** an
AABB test (cheapest), based on whether the octagonal shape
matters subjectively.

Recommended port: **plain Euclidean for clarity**:

```js
// $69F0 — collisions
// Deviation: replace BB ∩ Manhattan with clean Euclidean (visually
// indistinguishable at the radius values used; simpler code).
function collisions(state) {
  for (const shooter of [state.ship, state.saucer, ...state.saucerShots, ...state.shipShots]) {
    if (!shooter.alive) continue;
    for (const target of candidateTargets(shooter)) {
      if (!target.alive) continue;
      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const r = radiusFor(shooter, target);  // §3 step 3 table
      if (dx*dx + dy*dy < r*r) resolveHit(shooter, target);
    }
  }
}

// candidateTargets(shooter) returns the appropriate slice per §2's
// table — ship+asteroids for saucer/saucer-shots, saucer+ship+asteroids
// for ship-shots, asteroids-only for the ship.

function radiusFor(shooter, target) {
  let r;
  if (target.isAsteroid) {
    r = target.size === SMALL ? 42 : target.size === MEDIUM ? 72 : 132;
  } else if (target.isSaucer) {
    r = target.subType === SMALL_SAUCER ? 60 : 78;
  }
  if (shooter.isShip) r += 28;
  return r;
}
```

Notes:

- **Wrap-aware option** (rejected by default, see §4): substitute
  `dx = wrapDistance(target.x, shooter.x, 32)` etc. Defer until
  user-feedback suggests it.
- **Resolution dispatcher** mirrors `$6B0F`'s case split: shot vs
  asteroid → split; shot vs saucer → score + remove saucer; ship vs
  asteroid → ship dies + split; saucer-shot vs ship → ship dies; etc.
- **Asteroid split count**: a large asteroid splits into **two
  medium** (or sometimes two large per a randomized choice based on
  $77B5 RNG bits — TBD); medium splits into two small; small
  vanishes (no further split, just disappears + score).
- **Velocity perturbation** during split: `$6A9D` copies parent
  velocity verbatim, then the caller `$75EC` invokes `$7203` to add
  a random ±15 (signed byte units) to each axis, clamped to
  magnitude [6, 31]. Plus a sub-tile position jitter via XOR with
  `(vel & $1F) << 1`. Faithful port re-implements this directly.
  See §5.1.

## §7. Open questions / deferred to implementation phase

- **Score-table size mismatch.** Source's `$7659` table has 2
  entries (`$10, $05`) — large/small share `$10`, medium gets
  `$05`. Classic Asteroids docs say 20/50/100. Resolve during I-11
  (cabinet behaviour, Mikstas annotation, or BCD-add interpretation).
- **`$745A` / `$745C` slot-scanner body.** Visible at
  `Code.md $7531+` but not yet decoded — needed to know exact
  free-slot search order during `$75EC` child spawn.
- **Saucer firing direction** — saucer shots use `saucerShotDir
  $62` and the saucer's targeting logic at `$6C54-$6CC4`. Collision
  itself is shape-agnostic; the firing-direction story belongs in a
  future `research_saucer_ai.md` if it's needed.
- **Ship-vs-saucer overlap** — the outer-X table in §2 doesn't
  test ship-vs-saucer directly. Whether the game allows the ship to
  physically touch the saucer without dying is TBD; if so, the
  saucer's collision with the ship happens via saucer-shot only.

## §8. Citations summary

| Topic                                | Address(es)        |
|--------------------------------------|--------------------|
| Outer loop entry                     | `$69F0-$69FC`      |
| Outer/inner Y-start setup            | `$69FD-$6A09`      |
| Collision kernel — load + early-out  | `$6A0A-$6A12`      |
| Collision kernel — abs(dx)           | `$6A13-$6A32`      |
| Collision kernel — abs(dy)           | `$6A34-$6A53`      |
| Radius lookup + per-shooter adjust   | `$6A55-$6A75`      |
| BB + Manhattan threshold tests       | `$6A77-$6A8F`      |
| Resolution dispatcher                | `$6B0F-$6B45`      |
| Asteroid-explode + zero velocity     | `$6B47-$6B65`      |
| Ship-death via saucer-shot           | `$6B66-$6B72`      |
| Saucer score (200/990)               | `$6B73-$6B90`      |
| Asteroid-split-copy                  | `$6A9D-$6AD2`      |
| Asteroid-hit handler (score + spawn) | `$75EC-$7658` (decoded §5.1) |
| Score table (2 bytes)                | `$7659-$765A`      |
| Velocity perturbation                | `$7203-$7232` + clamp `$7233-$724E` |
| Free-slot scanners                   | `$745A`, `$745C`   |
| Score-add (BCD)                      | `$7397`            |
| Asteroid-size bits encoding          | `RAMUse.md $0200-$021A` (status, low 2 bits) |
| Object position arrays               | `RAMUse.md $0223-$02F4` (per [[research_position_math.md]]) |
