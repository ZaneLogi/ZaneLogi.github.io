# research_position_math.md — Position, velocity, sub-pixel motion, screen wrap

Source-of-truth references: `RAMUse.md` (object-table layout) and
`Code.md` `$6FC7-$7016` (canonical asteroid position update) in the
ComputerArcheology Asteroids listing. Citations use `$xxxx` addresses
or RAM-label form.

This doc covers how the source represents game-world position and
velocity, how it advances both each frame, how toroidal screen wrap
is implemented, the ship's special dual-precision velocity, and how
the model ports to JS.

## §1. Position model — 16-bit (high, low) byte pairs

Every game object stores position in **four parallel arrays** indexed
by the object slot:

| Array        | Address       | Range  | Units                          |
|--------------|---------------|--------|--------------------------------|
| `hposhX`     | `$0269-$028B` | 0-31   | High byte of X (screen tile)   |
| `hposlX`     | `$02AF-$02D1` | 0-255  | Low byte of X (sub-tile)       |
| `vposhX`     | `$028C-$02AE` | 0-23   | High byte of Y (screen row)    |
| `vposlX`     | `$02D2-$02F4` | 0-255  | Low byte of Y (sub-row)        |

Effective position is a 16-bit unsigned value per axis:

```
game_x = (hposh << 8) | hposl     // 0 .. 8191
game_y = (vposh << 8) | vposl     // 0 .. 6143
```

The valid screen range is **32 high-byte units wide × 24 high-byte
units tall**, with 8 bits of sub-tile resolution per axis. Each
high-byte step covers 1/32 of the screen horizontally or 1/24
vertically; the low byte interpolates within that step.

This is a Q8.0 fixed-point representation if you read it as integer
sub-tile units, or Q5.8 / Q5.8 (after axis-specific masking) if you
read it as fractional tile units.

**Object inventory** (each gets a slot in every position/velocity
array, `X` register holds the index):

| Slot range  | Object         | Count |
|-------------|----------------|-------|
| `$00-$1A`   | Asteroids      | 27    |
| `$1B`       | Ship           | 1     |
| `$1C`       | Saucer         | 1     |
| `$1D-$1E`   | Saucer shots   | 2     |
| `$1F-$22`   | Ship shots     | 4     |

(Status flags share the same indexing scheme at `$0200-$0222`; see
[[research_main_loop.md]] for the dispatch story.)

## §2. Velocity model — signed 8-bit

Per-axis velocity is a single byte:

| Array        | Address       | Range                |
|--------------|---------------|----------------------|
| `horzVelX`   | `$0223-$0245` | Signed: `$00-$3F` positive (rightward), `$C0-$FF` negative (leftward) |
| `vertVelX`   | `$0246-$0268` | Signed: `$00-$3F` positive (upward), `$C0-$FF` negative (downward)    |

The "valid" magnitude range is **±63** (`$00-$3F` and `$C0-$FF`). The
code reads velocity as standard 6502 signed byte (top bit = sign), so
two's-complement arithmetic handles addition. The source restricts
the magnitude to ±63 for two reasons:

1. **Bounded per-frame motion.** A velocity of 1 advances 1 low-byte
   step per frame — at 62.5 Hz the object crosses one *high-byte*
   tile every 256/62.5 ≈ 4 seconds. Max magnitude 63 covers a full
   tile every ~4 frames. This keeps everything within the wrap rules.
2. **Reserves the dead band `$40-$BF`.** Never written, so collision
   and clamp routines can use `BPL` / `BMI` confidently — high bit
   alone determines sign.

Sub-pixel motion is the natural consequence: velocity 1 means
"low-byte +1 per frame" — only after 256 frames does it cross into
the next high-byte tile.

## §3. Position update — the canonical pattern ($6FC7-$7016)

The asteroid update at `$6F57` walks slots `$22` down to `$00`
calling per-object motion when the status byte is non-zero, then
applying the carry-propagation pattern below for each active slot.
The pattern is identical for asteroids, ship, saucer, and shots (the
same code is reused by JSR'ing into segments of `$6FC7-$7016`).

### Horizontal update (`$6FC7-$6FEC`)

```
6FC7  CLC                         ; carry clear
6FC8  LDY #$00                    ; Y = sign-extension byte (default 0)
6FCA  LDA $0223,X (horzVelX)      ; A = velocity
6FCD  BPL $6FD0                   ; if positive, leave Y = 0
6FCF    DEY                       ; else Y = $FF (sign-extend negative)
6FD0  ADC $02AF,X (hposlX)        ; A = hposl + vel (+ carry=0)
6FD3  STA $02AF,X                 ; → hposl
6FD8  TYA                         ; A = sign-ext byte
6FD9  ADC $0269,X (hposhX)        ; A = hposh + signExt + carry
6FDC  CMP #$20                    ; compare to 32
6FDE  BCC $6FEC                   ; if hposh < 32, store normally
6FE0    AND #$1F                  ; else wrap (mask to 0-31)
6FE2    CPX #$1C                  ; if saucer slot, special despawn
6FE4    BNE $6FEC
6FE6    JSR $702D                 ;   saucer wrap = despawn
6FE9    JMP $6F5E
6FEC  STA $0269,X                 ; → hposh
```

The 6502 16-bit signed-add idiom in three steps:

1. `CLC` then `ADC` low byte → result + carry-out into the C flag.
2. Sign-extend the velocity into Y (`$00` for positive, `$FF` for
   negative) and `TYA`.
3. `ADC` high byte (carry input from step 1) → wrapped high byte.

### Vertical update (`$6FF1-$7016`)

Identical structure, with two differences:

- Sign extension uses `LDY #$FF` directly (no `DEY`), saving a cycle.
- Wrap is **not** a power-of-2 mask. Screen height is 24 tiles, so
  the post-add value gets compared:
  ```
  7007  CMP #$18                  ; 24
  7009  BCC $7013                 ; in range → store
  700B  BEQ $7011                 ; exactly 24 → wrap to 0 (positive overflow)
  700D  LDA #$17                  ; else 23 (negative underflow path)
  700F  BNE $7013
  7011  LDA #$00
  7013  STA $028C,X               ; → vposh
  ```
  
  The asymmetry handles the two overflow directions:
  - Positive overflow (`vposh` becomes 24): wrap to 0.
  - Negative underflow (carry-out makes `vposh` go above 24, e.g.
    `$FF`): wrap to 23 (`$17`).

## §4. Toroidal screen wrap

The two axes use **different** wrap mechanisms because of their
moduli:

| Axis | Modulus | Mechanism                                   |
|------|---------|---------------------------------------------|
| X    | 32      | `AND #$1F` (power-of-2 mask)                |
| Y    | 24      | Compare + branch (not power-of-2)           |

Both produce the visible Asteroids effect — an object that exits one
edge appears on the opposite edge with continuous velocity.

**Saucer is the one exception.** When the saucer's high byte
overflows past 31 in either direction, instead of wrapping it gets
**despawned** (`$702D`: clears `statusSaucer`, resets velocities,
arms the next-spawn timer). Saucer "wrap" is the source's signal that
the saucer has exited the play field.

The ship and ship-shots and asteroids all wrap; only the saucer
treats edge-exit as despawn.

**Port implication:** Encode the wrap modulus per-axis at the
position-update site. The X mask is straight `& 0x1F`; the Y wrap is
`if (newY >= 24) newY = (newY === 24) ? 0 : 23` (or equivalently
clamp to `[0, 23]` modulo 24 with proper sign handling). The saucer
slot gets a `if (slot === SAUCER) despawn(); return` check before
the normal wrap.

## §5. The ship's dual-precision velocity ($70AA-$70DE)

Every other object uses an 8-bit velocity. **The ship is special:**
it carries an extra "thrust accumulator" byte per axis at `$64`
(`ship_thrust_dH`) and `$65` (`ship_thrust_dV`), giving the ship a
**16-bit velocity** total: high byte at `$023E` / `$0261`, low byte
at `$64` / `$65`.

Why? Because rotation × thrust produces sub-velocity contributions.
The thrust routine at `$70AA-$70DE` reads `$61` (`direction`, 0-255
where each unit = 360°/256 ≈ 1.4°), looks up the X-component via
`$77D2` and Y-component via `$77D5` (sin/cos tables, deferred to
[[research_player_movement.md]] when written), then accumulates:

```
70AC  LDA $61                       ; direction
70AE  JSR $77D2                     ; A = x-component of thrust at direction
70B0  BPL leave_Y_zero
        DEY                         ; Y = $FF if thrust component is negative
70B4  ASL A                         ; thrust *= 2
70B6  ADC $64                       ; A += ship_thrust_dH (fractional accumulator)
70B8  TAX                           ; X = new fractional byte
70B9  TYA
70BA  ADC $023E (horzVelShip)       ; A = horzVelShip + signExt + carry
70BD  JSR $7125                     ; clamp/saturate to signed [-64, +63] (body visible at $7125-$7138)
70C0  STA $023E                     ; → horzVelShip (high byte)
70C3  STX $64                       ; → ship_thrust_dH (low byte / accumulator)
```

So each thrust frame, the ship's *velocity* gets incremented by a
sub-velocity-unit amount, with the accumulator at `$64` carrying any
fractional overflow into `$023E`. This is the same idea applied one
level up: position += velocity (where velocity is 16-bit), and the
position update at `$6FC7+` then uses the high-byte of velocity
(`$023E`) as the per-frame integer step (sub-velocity becomes
sub-pixel because position is itself 16-bit).

Effectively the ship has **24-bit precision** total along each axis:

```
ship_state_x = (hposh:hposl, horzVelShip:ship_thrust_dH)
                ^^^^^^^^^^^^                ^^^^^^^^^^^^^^^^^
                16-bit position             16-bit velocity
                ┌─────── 8-bit accumulator ──────┐
                                                  ^
                                          adds into horzVelShip at carry
```

`$7125` (called from both thrust paths) clamps the high byte against
the max-velocity cap (likely `$7F` positive / `$80` negative — the
constant is in the missing 20%, will need Mikstas's alt-disassembly
or `research_player_movement.md` to confirm).

**Port implication:** The ship gets a `vx`, `vy` velocity (treat as a
single JS number — see §7), plus the position. The two-level
accumulator (`ship_thrust_dH/dV` at the velocity level, `hposl/vposl`
at the position level) collapses to ordinary floating-point velocity
+ position. No explicit accumulator byte needed in the port.

Other objects (asteroids, saucer, shots) skip the
`ship_thrust_dH/dV` step — their velocity is set when they spawn or
split and never accumulates further.

## §6. Coordinate systems — three layers

Three distinct coordinate spaces are in play; conversions happen at
fixed boundaries. Code that mixes them up tends to produce shapes at
the wrong scale or position (e.g. the I-8c thrust-flame bug, where a
fresh cursor for the flame re-anchored at the LABS position instead
of picking up where ShipDirN's last opcode left off).

### 6.1 Game-world coordinates (Float64, narrow range)

- **Range:** x ∈ [0, 32), y ∈ [0, 24) — the source's high-byte
  position model (RAMUse.md `$0269-$02F4`), with hi/lo collapsed
  per §7.
- **Velocity:** ±0.25 game-units/tick — source's ±64-byte clamp at
  `$7125`, divided by 256.
- **Used by:** all gameplay state — `Ship.x/.y/.vx/.vy`,
  `advancePosition()`, `applyThrust()`, `applyFriction()`, the
  modular wrap (X mod 32 from `$6FDC AND #$1F`; Y mod 24 from
  `$7007 CMP #$18`).

This is the natural unit for physics math: small numbers, clean
modulo, ample Float64 precision over hours of play.

### 6.2 DVG coordinates (vector hardware)

- **Range:** x ∈ [0, 1024), y ∈ [0, 768) for the cabinet's visible
  area (1024 × 1024 nominal per R-B §3; upper line ignored, per
  R-A).
- **Origin:** bottom-left (Y-up — opposite of canvas).
- **Used by:** the DVG interpreter — vector ROM opcodes
  (VEC/SVEC/LABS), `runList`'s cursor, the dx/dy magnitudes inside
  `vector_rom_data.js`.

The DVG hardware's space. Shapes are ROM-baked at these magnitudes
(e.g. ShipDir0's `dx: +768` is raw DVG units before the scale-shift
divides it down), so the port can't rescale per-instance — it has
to convert into this space at draw time.

### 6.3 Canvas coordinates (Y-flipped DVG)

- Same 1024 × 768 backing-store dimensions as DVG visible.
- Y-axis flipped: `canvasY = canvas.height - dvgY` (see
  `main.js:toCanvasY`).
- Used only by `drawSegment` (the `ctx.moveTo` / `ctx.lineTo` calls).

CSS-size selector (400/800/1024) just scales the backing store
visually; drawing is always at 1024 × 768.

See [[research_dvg.md §3]] for the DVG-internal Y-up convention.

### 6.4 Conversion factor

```
DVG = game * 32
```

Falls out of both axes: 1024 DVG / 32 game-W = 32 horizontal,
768 DVG / 24 game-H = 32 vertical. The cabinet's 4:3 aspect matches
the world's 32:24 ratio, so the factor is symmetric — no per-axis
scaling.

Captured as `GAME_TO_DVG = 32`, `WORLD_W = 32`, `WORLD_H = 24` in
`asteroids_clone/state.js`.

### 6.5 Conversion happens at the rendering boundary

```
GAME-COORD (Float64, 0..32 × 0..24)
    │
    ├── physics, wrap, thrust/friction (game-coord)
    │
    └── Ship.dvgPos()  ──── × 32 ────►  DVG-COORD ({x, y} cursor)
                                            │
                                            ├── runList VEC/SVEC mutate cursor
                                            ├── drawAt(name, cursor, gs, xFlip, yFlip)
                                            │
                                            └── drawSegment ── Y-flip ──► CANVAS
```

The cursor passed to `renderer.drawAt` is in DVG units;
`Ship.dvgPos()` returns `{x: ship.x * 32, y: ship.y * 32}`.

For sequential draws sharing one cursor (ship + thrust flame), pass
the same cursor object — `runList` mutates it, so the second draw
picks up where the first ended. Matches the source: one LABS at
`$7C03`, then sequential JSRs into ShipDirN + ThrustDirN with no
re-anchor (see `task_seq.js:drawShip`).

### 6.6 Source's equivalent staging — `$04-$07` position bundle

The source stages the game→DVG conversion through zero-page bytes
`$04-$07`. The asteroid draw setup at `$6FB0-$6FC4`:

```
6FB0  LDA $02AF,X (hposl)  → STA $04   ; copy hposl
6FB5  LDA $0269,X (hposh)  → STA $05   ; copy hposh
6FBA  LDA $02D2,X (vposl)  → STA $06   ; copy vposl
6FBF  LDA $028C,X (vposh)  → STA $07   ; copy vposh
6FC4  JMP $7027 (asteroid draw dispatch)
```

The draw-side scale + LABS-emit at `$72FE` reads `$04-$07` and
combines them into LABS opcode coordinates. The exact bit-fiddling
(LSR / ROR chains at `$7302-$731D`) is the byte-pair-to-LABS
encoding; the conceptual conversion is the same `× 32` (the source's
high-byte units × 32 → DVG 0-1023).

### 6.7 Why three layers, not two

The source has the same three. They don't collapse because:

- **Physics wants small numbers.** Game-coord gives clean modulo
  and ample Float64 precision; DVG-coord modulo 1024 would still
  work but velocity magnitudes (~8 DVG-units/tick) feel arbitrary.
- **ROM data is fixed in DVG units.** Ship/asteroid/UFO shape
  dx/dy are baked into ROM bytes; can't be rescaled per-instance.
- **Canvas Y is flipped.** Vector hardware is Y-up, raster is
  Y-down.

So the port keeps all three, with conversion at exactly two
boundaries: `Ship.dvgPos()` (game → DVG) and `toCanvasY`
(DVG → canvas).

## §7. Port decision — faithful (hi, lo) vs JS Float64

The "open question" flagged in `progress.md` is whether the JS port
should:

- **Option A:** Preserve the source's `{hi, lo}` byte-pair model.
  Velocities are integers in `[-63, +63]`; positions are 16-bit
  ints; addition with explicit modular wrap. Byte-accurate to the
  source.
- **Option B:** Collapse to JS `Float64` for both. `pos.x` is a
  number in `[0, 32)`; velocity is a number in `[-0.25, +0.25)`
  scaled from the source's `[-63, +63]`. Cleaner code, drift-risk
  over long sessions.

### Tradeoffs

| Aspect | Option A (faithful) | Option B (Float64) |
|--------|---------------------|---------------------|
| Code volume | Higher — explicit hi/lo split | Lower — `pos.x += vx` |
| Source citations | Direct — `// $6FC7 — asteroidPositionUpdate` is the same arithmetic | Adapted — `// equivalent of $6FC7 update, hi/lo collapsed to float` |
| Determinism | Exact, byte-stable | Subject to FP rounding drift |
| Toroidal wrap | Modular int math | `(pos.x + 32) % 32` |
| Ship dual-precision | Already 24-bit; port keeps separate accumulator | Collapses into the same Float64 |
| Subjective complexity | Higher; matches the ROM | Lower; matches modern game code |

### Recommendation

**Option B (Float64) for the port**, with these conditions:

1. **Document the scaling** at the model boundary. Position is
   `x ∈ [0, 32)`, velocity is `vx ∈ [-0.25, +0.25)` (source's
   `[-63, +63]` divided by 256). Render scaling to DVG is
   `dvg_x = x * 32` (so the full 32 game-units span the 1024 DVG
   units).
2. **Use modular wrap** at update time: `x = ((x + vx) % 32 + 32) %
   32` (the double-modulo to handle negative). Asymmetric Y wrap
   collapses: `y = ((y + vy) % 24 + 24) % 24`.
3. **Saucer despawn** check is the same single conditional at
   update time.
4. **Keep ship-thrust as a single `vx`/`vy` Float64** — the source's
   `ship_thrust_dH/dV` accumulator is purely a precision artifact
   of 8-bit arithmetic, not a gameplay mechanism.

Drift risk is acceptable. JS Float64 has 52 bits of mantissa; even
at maximum velocity (~`0.25 × 62.5 Hz = 15.6` units/sec) over a
multi-hour session, the position is well within FP precision. The
source's BCD scoring (covered in [[research_hardware.md §1]]) is the
only place where exact integer arithmetic is non-negotiable, and
that stays integer.

### Cite the deviation

Per the conventions in `../CLAUDE.md`, this is a port deviation
(not a faithful 1:1 port). The deviation is recorded here and should
be cited at the affected JS sites:

```js
// $6FC7 — asteroidPositionUpdate
// Deviation per research_position_math.md §7: hi/lo byte pair
// collapsed to Float64; modular wrap replaces explicit AND #$1F
// and the CMP/BCC chain.
function updateAsteroidPosition(asteroid) {
  asteroid.x = mod(asteroid.x + asteroid.vx, 32);
  asteroid.y = mod(asteroid.y + asteroid.vy, 24);
}
```

If a later port step reveals a gameplay-mechanism dependency on
byte-accurate position math (e.g. a collision threshold that depends
on the low byte's exact value), this decision can be revisited — but
none of the collision routines surveyed so far hint at this.

## §8. Sub-pixel motion — what stays, what goes

Source's sub-pixel motion comes free from the 16-bit position with
8-bit velocity: a velocity of 1 moves the low byte by 1 each frame,
i.e. 1/256 of a high-byte tile per frame. With Float64 positions,
the same effect is automatic: `x += 0.004` (≈1/256) advances by the
exact same amount.

The behaviors that need to be preserved:

- Very slow asteroid drift (the post-large-asteroid-split velocity
  is small)
- Ship's gradual thrust acceleration (velocity grows by sub-unit
  steps each thrust frame)
- Saucer shots' slight angle variation (random initial velocity
  picks small magnitudes)

All of these arise naturally from Float64 arithmetic — no special
handling needed.

The behaviors that **do not** need to be preserved:

- The discrete byte-step quantization itself (visible as a
  per-frame jump of 1 / (1024/32) = 1 DVG-unit per low-byte step
  when rendering — at 62.5 Hz this is sub-pixel anyway and the
  CRT smoothed it out further). The smoother Float64 motion is a
  fine visual upgrade.

## §9. Hyperspace teleport — orthogonal to position math

The hyperspace mechanic (visible at `$7052-$7081`) is implemented as:

- Ship sets `hyperSpaceFlag = $59` (1 = success, $80 = death, 0 = none)
- During hyperspace, ship is removed from play (`statusShip = 0`),
  reappears at a random position with **zero velocity** on success or
  triggers an explosion on death (~1 in N chance per attempt)
- Random position picked by reading `rndValue = $5F` for both axes

No special position-math interaction — it's just an assignment to
`hposh/l, vposh/l` and zeroing velocity. The randomness model goes in
the (deferred) RNG research; the position-write itself is a straight
overwrite.

## §10. Citations summary

| Topic                              | Address(es)                            |
|------------------------------------|----------------------------------------|
| Position arrays                    | `RAMUse.md $0269-$02F4`                |
| Velocity arrays                    | `RAMUse.md $0223-$0268`                |
| Asteroid dispatch loop             | `$6F57-$6F61`                          |
| Horizontal position update         | `$6FC7-$6FEC`                          |
| Vertical position update           | `$6FF1-$7016`                          |
| Saucer-edge despawn                | `$702D-$703E`                          |
| Ship physics (thrust accumulator)  | `$703F-$70E0`, especially `$70AA-$70DE`|
| Velocity clamp                     | `$7125-$7138` (signed clamp to [-64, +63]) |
| Direction → thrust X-component LUT | `$77D2` (deferred to `research_player_movement.md`) |
| Direction → thrust Y-component LUT | `$77D5` (deferred)                     |
| Position bundle for draw dispatch  | `$6FB0-$6FC4` (asteroid example)       |
| Hyperspace state                   | `$5A`, `$59`, `$7052-$7081`           |
| Object inventory                   | `RAMUse.md $0200-$0222`                |
