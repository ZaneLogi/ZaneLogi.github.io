# SMB physics — decoded from the 6502 source

What Super Mario Bros. actually does for player movement, read off the
disassembly. This is a **characterization of the original**, not a description of
this port — see "Where the port stands" at the end for the gap between them.

Source: `SMBDIS.ASM` (doppelganger's SMB disassembly), local reference copy at a
per-PC path outside the repo. Claims below cite the routine label they come from.

## Fixed-point units

Everything hinges on these; get them wrong and every constant is off by 16×.

| Quantity | Address | Unit | Fractional partner |
|---|---|---|---|
| `Player_X_Speed` | `$57` | 1/16 px/frame | `Player_X_MoveForce` `$0705` = 1/256 speed-unit |
| `Player_Y_Speed` | `$9f` | 1 px/frame | `Player_Y_MoveForce` `$0433` = 1/256 px/frame |

**X speed is 1/16 px/frame.** `MoveObjectHorizontally` splits the speed byte into
nybbles: the high nybble (sign-extended when ≥ 8) adds to `X_Position` as whole
pixels, the low nybble shifted up adds to the *position* sub-pixel accumulator
`SprObject_X_MoveForce` (`$0400`). Total displacement per frame is `speed/16` px.

**The two X accumulators are different bytes.** `Player_X_MoveForce` (`$0705`,
used by `ImposeFriction` as the fraction of *speed*) and
`SprObject_X_MoveForce` (`$0400`, used by `MoveObjectHorizontally` as the
fraction of *position*) are distinct addresses despite the similar name. They do
not interfere — accel and sub-pixel positioning are cleanly separate.

**Y speed is whole px/frame**, with `Y_MoveForce` as its 1/256 fraction.
`ImposeGravity` adds `Y_MoveForce` into `YMF_Dummy` (`$0416`) with carry into
position, then adds the frame's downward force into `Y_MoveForce` with carry into
`Y_Speed`. So a gravity constant of `$70` means `112/256 = 0.4375 px/frame²`.

## Horizontal model

**Linear accel to a hard clamp — there is no multiplicative friction.**
`ImposeFriction` is a misnomer: one routine does both accel and decel, adding a
constant `FrictionAdderLow` to `X_MoveForce` each frame with carry into
`X_Speed`, then clamping hard against `MaximumLeftSpeed` / `MaximumRightSpeed`.
Direction comes from the controller bits; with no direction held the routine
picks its sign from the current speed and decays toward zero at the same rate.

Top speed in SMB is a **clamp**, not an equilibrium.

**Max speeds** — `MaxRightXSpdData` / `MaxLeftXSpdData`, indexed by `Y`:

| index | right | left | px/frame | meaning |
|---|---|---|---|---|
| 0 | `$28` | `$d8` | ±2.5 | running |
| 1 | `$18` | `$e8` | ±1.5 | walking |
| 2 | `$10` | `$f0` | ±1.0 | water / slow |
| 3 | `$0c` | — | 0.75 | pipe intro only (forced when `GameEngineSubroutine == 7`) |

The left table is the exact two's complement of the right one — **SMB's max speed
is symmetric**.

**Accel / decel rates** — `FrictionData`, indexed separately by `$00`:

| index | byte | px/frame² | when |
|---|---|---|---|
| 0 | `$e4` = 228 | 0.0557 | running |
| 1 | `$98` = 152 | 0.0371 | walking |
| 2 | `$d0` = 208 | 0.0508 | above walk speed (released B while fast) |

Rate is `value / 256 / 16` px/frame².

**Skid doubles the rate.** At the tail of `X_Physics`, if `PlayerFacingDir` differs
from `Player_MovingDir`, `FrictionAdderLow` is shifted left with the carry rotated
into `FrictionAdderHigh` — a 16-bit ×2. Turning around decelerates twice as hard
as stopping.

**Two indices, not one.** `X_Physics` computes `Y` (max speed) and `$00`
(friction) independently:

- Grounded, B held, input direction == moving direction → `Y=0, $00=0` (run).
- Grounded otherwise → `Y=1, $00=1` (walk); but if `Player_XSpeedAbsolute >= $21`
  (2.06 px/f) or `RunningSpeed` is set → `$00=2`, the faster bleed-down.
- `RunningTimer` (`$0a` = 10 frames, set at `SetRTmr`) holds run physics briefly
  after B is released.
- Airborne with speed `>= $19` (1.56 px/f) → `Y=0, $00=0`: run physics persist in
  the air.

**Air control is conditional.** `JumpSwimSub` calls `ImposeFriction` only if
left/right is actually held (`LRAir`); with no input there is no airborne decel,
so horizontal speed is preserved through a jump.

## Vertical model — the jump

**The jump is an impulse.** `InitJS` sets `Player_Y_Speed` directly from
`PlayerYSpdData`; there is no accumulating thrust. It fires only on a *fresh* A
press (`CheckForJumping` requires A down now and up last frame) with
`Player_State == 0` (grounded).

**Variable height comes from gravity selection, not from thrust.** Two gravity
constants are loaded at jump start: `VerticalForce` (weak, from `JumpMForceData`)
and `VerticalForceDown` (strong, from `FallMForceData`). Each frame `JumpSwimSub`
decides which is live:

- Rising **and** A held continuously (down now *and* last frame) → keep the weak
  force.
- Otherwise → copy `VerticalForceDown` over `VerticalForce`.

Once dumped to the fall force it **stays** dumped: `VerticalForce` is only
re-loaded at the next `InitJS`, so re-pressing A mid-ascent buys nothing. Holding
A doesn't push Mario up — it makes him *lighter* while he's already rising.

`DiffToHaltJump` (always 1) gives a one-frame grace: if he has risen less than a
pixel from `JumpOrigin_Y_Position`, the weak force survives an early release.

**Jump tables**, indexed by `Player_XSpeedAbsolute` at the moment of the jump:

| index | speed ≥ | `Y_Speed` | held gravity | fall gravity |
|---|---|---|---|---|
| 0 | 0 | −4 | `$20` → 0.125 | `$70` → 0.4375 |
| 1 | `$09` (0.5625) | −4 | `$20` → 0.125 | `$70` → 0.4375 |
| 2 | `$10` (1.0) | −4 | `$1e` → 0.1172 | `$60` → 0.375 |
| 3 | `$19` (1.5625) | −5 | `$28` → 0.15625 | `$90` → 0.5625 |
| 4 | `$1c` (1.75) | −5 | `$28` → 0.15625 | `$90` → 0.5625 |
| 5 | swimming | −2 | `$0d` | `$0a` |
| 6 | whirlpool | −1 | `$04` | `$09` |

`InitMForceData` is zero for every land index; only swimming (5) seeds a `$80`
fraction.

Note the run-jump is higher **despite** stronger gravity — index 3/4 raise the
launch to −5 *and* raise the held gravity to 0.15625. The launch wins.

**The boost is keyed on `Player_XSpeedAbsolute`** — the two's-complement absolute
value computed at `SetAbsSpd`. SMB's run-jump boost therefore depends on speed
*magnitude* only, and is **symmetric by direction**.

**Terminal fall is 4 px/frame** (`MovePlayerVertically` loads `#$04` as the max
before calling `ImposeGravity`). `ImposeGravity` only clamps once `Y_Speed`
reaches the max *and* `Y_MoveForce >= $80`.

## Verification

The decode reproduces SMB's three best-known jump facts from the constants alone,
using `h = v²/2g`:

| case | from the tables | height | known SMB |
|---|---|---|---|
| standing, A held | 4²/(2 × 0.125) | 64 px = **4 tiles** | 4 blocks |
| standing, A tapped | 4²/(2 × 0.4375) | 18.3 px ≈ **1.1 tiles** | ~1 block |
| full-speed run, A held | 5²/(2 × 0.15625) | 80 px = **5 tiles** | 5 blocks |

(SMB's tile is 16 px.) Apex of the held standing jump is `4/0.125` = 32 frames.

## Enemy model — the Goomba

A Goomba is not a slower Mario, and the source agrees: it shares no constant and
no routine with the player. It has its own speed table, its own gravity, and its
own terminal fall.

**Init** (`InitGoomba` → `InitNormalEnemy`): horizontal speed comes from
`NormalXSpdData`, indexed by `PrimaryHardMode` (set for the second quest and
worlds 5-8):

| mode | byte | px/frame |
|---|---|---|
| normal | `$f8` = −8 | −0.5 |
| hard | `$f4` = −12 | −0.75 |

Both are negative: **Goombas always spawn walking left.** Then `SmallBBox` sets
bounding-box control `$09`.

**The speed never changes** — there is no accel. `MoveNormalEnemy` reaches
`SteadM`, which adds `XSpeedAdderData[Y]` to the speed, and for a grounded
left-moving enemy that entry is `$00`. The adder exists for other cases (`$e8` /
`$18` = ∓1.5 px/f, used by objects with state d6 set), and it's applied to a copy:
the speed is pushed to the stack, modified, used to move, then restored. It
modulates one frame's travel without ever changing the stored speed.

**Gravity is the enemy's own, and it only runs while falling.**
`MoveD_EnemyVertically` loads `$3d` as the downward force and `$03` as the max,
so:

| | px/frame² | px/frame |
|---|---|---|
| enemy gravity | `$3d`/256 = **0.238** | — |
| enemy terminal fall | — | **3** |

Compare the player: 0.125 (rising, A held) / 0.4375 (falling), terminal 4. **SMB
does not share a gravity constant between Mario and enemies.**

Critically, `MoveNormalEnemy` in the *normal* state (d2-d0 clear) branches to
`SteadM` — horizontal movement only, **no gravity call at all**. A walking Goomba
is not falling-and-being-stopped; it simply isn't subject to gravity until
something says otherwise.

**Falling off a ledge is a state change, driven by a probe.** Each frame
`EnemyToBGCollisionDet` calls `ChkUnderEnemy`, a block-buffer lookup at offset
**(8, 18) — the enemy's bottom middle**. If a solid block is there, nothing
happens. If not, control reaches `GetSteFromD`, which looks the old state up in
`EnemyBGCStateData` (`$01, $01, $02, $02, $02, $05`); normal state `$00` maps to
`$01`. Next frame `MoveNormalEnemy` sees state `$01`, fails every earlier branch,
and falls through to `FallE` → gravity. On landing, `LandEnemyProperly` snaps the
vertical coordinate to the block top and resets the state to `$00`.

So state `$00` = grounded, `$01` = falling — the same distinction the port draws
with `contacts.ground`.

Note the probe is the bottom **middle**, not the leading edge: an SMB Goomba walks
half its width past a ledge before it starts to drop.

**Turning around is also a probe, but of its own edges.** `DoEnemySideCheck` walks
block-buffer offsets `$16`/`$17` — the enemy's left `(0, 20)` and right `(16, 20)`
edges — and only tests the one matching `Enemy_MovingDir` (1 = right, 2 = left).
A solid block there (anything `ChkForNonSolids` doesn't excuse — vine blank,
coins, hidden blocks) leads to `InvEnemyDir` → `RXSpd`, which two's-complement
negates `Enemy_X_Speed` and flips `Enemy_MovingDir` with `eor #%00000011`.

Because those offsets are the enemy's own bounding edges, this is semantically a
contact test — the port's `contacts.left` / `contacts.right` carry the same
information, just produced by a resolver instead of a buffer lookup. The port's
`reactiveWalker` is faithful in substance.

**The walk animation is one pose, mirrored.** `CheckForGoomba` inverts the sprite's
horizontal-flip attribute bits (`eor #%00000011`) whenever bit 3 of `FrameCounter`
is clear. That yields a 16-frame cycle: 8 frames flipped, 8 frames not — i.e. a
pose change every **8 frames**, or 7.5 Hz at 60 fps. The port's two mirrored BMPs
are the pre-flipped equivalent of SMB's single tile set.

## Enemy model — the Koopa

A Koopa walks on exactly the Goomba's terms: `InitNormalEnemy`, the same
`NormalXSpdData` (−0.5 px/f, −0.75 hard), the same `MoveNormalEnemy` → `SteadM`
horizontal-only path, the same enemy gravity. **A green Koopa and a Goomba are
physically identical while walking.** Everything below is what differs.

The relevant identifiers: `GreenKoopa` `$00`, an unnamed `$01`, `BuzzyBeetle`
`$02`, `RedKoopa` `$03`; the paratroopas are `$0e` (jumping), `$0f` (red), `$10`
(flying).

### Red vs green — one ID check

The famous difference is four instructions. `ChkForRedKoopa` is reached only from
`NoEToBGCollision`, i.e. when `ChkUnderEnemy`'s bottom-middle probe found nothing
underneath. There:

- **`RedKoopa` in state `$00`** → `ChkForBump_HammerBroJ` → `InvEnemyDir` →
  `RXSpd`: **turn around.**
- **anything else** → `Chk2MSBSt` → `GetSteFromD` → state `$01` → gravity next
  frame: **fall.**

Same speed, same routine, same table — the red Koopa's ledge sense is one `cmp
#RedKoopa` plus a state test. Note it requires state exactly `$00`, so a red Koopa
already falling, stunned, or shelled does not get the turn.

`InitRedKoopa` seeds state `$01` (falling) rather than `$00`, so a freshly spawned
red Koopa drops to the ground first; `LandEnemyProperly` resets it to `$00`, and
only then does the ledge behavior engage.

### Shells

**Stomped** (`HandleStompedShellE`): state → `$04`, `EnemyIntervalTimer` →
`RevivalRateData[PrimaryHardMode]` = `$10` (16) or `$0b` (11), player bounces at
`$fc` = −4 px/f.

That timer is an **interval** timer — `EnemyIntervalTimer` (`$0796`) sits at offset
`$16` from `Timers` (`$0780`), past the `$14` frame-timer cutoff, so it decrements
once per **21 frames** rather than per frame. Revival is therefore 16 × 21 = 336
frames ≈ **5.6 s** (hard mode 11 × 21 = 231 ≈ 3.85 s) — which matches the shell
timing everyone remembers, and is the check that the interval reading is right.

**Revived** (`ReviveStunned`): state → `$00`, and the direction is
**pseudorandom** — bit 0 of `FrameCounter` becomes `Enemy_MovingDir`. Speed from
`RevivedXSpeed` (`$08, $f8, $0c, $f4`) = ±0.5 normal, ±0.75 hard. A reviving shell
genuinely may go either way.

(The same timer runs `ChkKillGoomba`: at `$0e` — two interval ticks, ~0.7 s — a
stomped Goomba is erased instead of reviving.)

**Kicked** (`HandlePECollisions`, requires `state & 7 >= 2` and d7 clear): sets
d7 → moving shell, `EnemyFacePlayer` picks the direction *away* from Mario, and
`KickedShellXSpdData` (`$30`, `$d0`) sets **±3.0 px/frame**.

Mario's max run is 2.5 px/f. **A kicked shell outruns a sprinting Mario** — the
constants say so directly, and it's a second check on the 1/16-px unit.

**A moving shell falls correctly** through the same state machine: d7 set →
`SteadM` (horizontal only), and when the probe finds nothing underneath,
`Chk2MSBSt` sees d7 and sets d6 rather than overwriting the state, so gravity
applies while d7 survives. On landing, `NMovShellFallBit` clears **only** d6 —
keeping d7 — so the shell resumes sliding at full speed.

**Demoted paratroopa** (`ChkForDemoteKoopa`, ID ≥ `$09`): `Enemy_ID &=
%00000001`, state → `$00`, `EnemyFacePlayer`, speed from `DemotedKoopaXSpdData`
(`$08`, `$f8`) = ±0.5.

That mask is worth noticing: `$0e` and `$10` → `$00` (green Koopa), but `$0f` (red
paratroopa) → **`$01`** — and `$01` is not `RedKoopa` (`$03`). Since
`ChkForRedKoopa` tests only `$03`, **a red paratroopa stomped into a Koopa walks
off ledges like a green one.** Whether `$01` is *drawn* red wasn't checked here.

**Hit by a block from below** (`ChkToStunEnemies`): direction set away from the
player, speed from `EnemyBGCXSpdData` (`$10`, `$f0`) = ±1.0 px/f.

### What this would cost the port

The port has no Koopa, so none of this is a mismatch — but it bears directly on
the architecture note in `CLAUDE.md`, which says a probing actor ("is there a ledge
ahead?") would need a sense interface that doesn't exist yet.

The Goomba didn't force that, because both its probes read its own box and map onto
`contacts`. **The red Koopa does force it.** Its turn fires when the bottom-middle
probe finds no block *while it is still standing* — it never leaves the ground, so
there is no contact to react to. `!contacts.ground` cannot express it: by the time
the box has lost support the actor is already falling, which is precisely the
behavior the red Koopa exists to avoid.

So the red Koopa is the first actor that would make the port build the sense
interface it anticipated — and the Goomba's `reactiveWalker` is the last one that
gets by without it. Green Koopa and Buzzy Beetle, by contrast, are pure
`ACTOR_TYPES` entries today: `constantWalk` at 1.0 with the existing trio.

## Where the port stands

**Mario's ground-and-air movement is this source's**, horizontal and vertical, at
×2. This section is the port's scope and its deliberate deviations.

### Scope — what "SMB's movement" does and does not cover

**Movement is size-independent in SMB, and this is worth knowing rather than
assuming.** Every read of `PlayerSize` in the source is in the bounding-box
control (`SizeChk`), the crouch gate, the jump *sound*, block breakability, a
block-bump offset, fireball collision, the block-buffer probe set (`ChkCollSize`),
or graphics. **None is in `X_Physics`, `ImposeFriction`, `InitJS`, `GetYPhy`, or
`ImposeGravity`.** Big and small Mario accelerate, clamp, jump and fall
identically.

So the port's single Mario (24×32 — small Mario at ×2) already carries the
physics a big Mario would need. Size lives entirely in the **collision** layer:
`ChkCollSize` chooses one of three probe sets from (size, crouching, swimming),
and the head probe drops from +4 to +18 for small. Adding big Mario is a collision
and presentation job, not a movement one.

**Decoded but NOT ported** (all reachable from the same tables and routines):

| | why it is absent |
|---|---|
| swimming | bands 5-6 of the jump tables; no water in the port |
| climbing | `ClimbingSub`, `Climb_Y_SpeedData` |
| crouching | big-Mario-only state; changes the probe set |
| **down nullifies input** | **size-independent — applies to the Mario we have** |
| water area type | a third clamp at ±2.0 (`MaxRightXSpdData[2]`) |
| pipe-intro clamp | `$0c` → 1.5, forced when `GameEngineSubroutine == 7` |
| grow/shrink freeze | `PlayerChangeSizeFlag` → `NoMoveSub`, movement stops entirely |
| jumpspring, whirlpool | separate mechanisms |

The fourth row is the only one that is a gap in the *current* actor rather than a
missing feature. Source lines 5578-5589: pressing down while on the ground zeroes
`Left_Right_Buttons` and `Up_Down_Buttons` *before* `PlayerMovementSubs` runs, and
that check does not consult `PlayerSize`. Small Mario pressing down therefore stops
accelerating — he simply gets no crouch hitbox or sprite. Our `intent` has no down
at all, so the rule is unimplemented.

`marioMovement` implements this source's model — hard-clamp top speed, linear
accel, an impulse jump with gravity-selected variable height, conditional air
control, and a rate-doubling skid. Three non-obvious properties, each also flagged
in the code where it bites:

- **The `JumpEngine` dispatch is state-gated**, and that is easy to miss from the
  routine names. `OnGroundStateSub` reaches `GetPlayerAnimSpeed`, facing, and
  `ImposeFriction`; the airborne paths (`JumpSwimSub` / `FallingSub`) reach only
  `ImposeFriction`, and only when a direction is held. So airborne: the anim-speed
  routine never fires, facing freezes, and an un-held Mario does not decelerate.
- **The discrete integration is reproducible exactly.** `ImposeGravity` runs
  `y += vy` *before* `vy += g`. Skipping gravity while grounded gives the launch
  tick the full launch velocity and lines the port up with the ROM frame for frame
  — a full-hold standing jump peaks at 66 NES px (132 at ×2), not the 64 that
  `v²/2g` predicts.
- **`DiffToHaltJump` protects the launch tick, not an early release.** On a fresh
  press the previous-frame button bit is necessarily clear, so without the grace
  every jump would dump to fall gravity on the tick it started.

At the port's 2× scale (32 px tile vs SMB's 16), Mario's movement matches the
source:

| | SMB ×2 | port |
|---|---|---|
| terminal fall | 8.0 | 8.0 |
| max run speed | 5.0 | 5.0 |
| max walk speed | 3.0 | 3.0 |
| tap jump | ~1.4 tiles | 1.45 |
| held jump | 4.125 tiles | 4.125 |

The Goomba, same scaling:

| | SMB ×2 | port | |
|---|---|---|---|
| walk speed | 1.0 | 0.84 | ~16% slow |
| gravity | 0.477 | 0.48 | near-exact |
| terminal fall | 6.0 | 8.0 | ~33% too fast |
| walk anim | 7.5 fps | 6 | ~20% slow |

Two structural notes on the Goomba beyond the numbers:

- **The shared-gravity premise is not SMB's.** `ACTOR_TYPES.goomba` carries
  `gravity: 0.48` with the comment "shared with Mario: gravity is the world's, not
  his." SMB disagrees — enemies fall at 0.238 px/f², the player at 0.4375. The
  port's shared value happens to land almost exactly on SMB's *enemy* gravity
  (0.477 scaled) while being ~55% of SMB's *player* fall gravity — a coincidence,
  not a derivation. The port's stance here is a design call, not a fidelity claim.
- **`constantWalk` applies gravity whenever `!contacts.ground`; SMB gates it on a
  state bit** that a bottom-middle probe sets. The observable difference is the
  ledge: SMB's Goomba tips over at its center, the port's the moment its box
  clears support. Whether that's visible depends on `resolveCollision`'s ground
  test, which this pass didn't read.

**The run-jump boost is symmetric by speed, and that is faithful.** SMB indexes its
jump tables by `Player_XSpeedAbsolute` — an absolute value — so the boost depends
on speed magnitude only, not on facing. The port keys on `|vx|`, matching it.

## Not yet decoded

Present in the source, not yet decoded: `MoveDefeatedEnemy` and the
Goomba's `KillEnemyAboveBlock` path; the paratroopas' own movement before demotion
(`MoveJumpingEnemy` / `MoveJ_EnemyVertically`, `InitJumpGPTroopa`,
`MoveRedPTroopa`'s vertical patrol); hammer bro, bloober, cheep cheeps, lakitu,
spiny, podoboo, piranha plant, bullet bill, bowser; the jumpspring; whether enemy
`$01` is drawn red; swimming beyond the two table entries above; wind/whirlpool;
and the `Player_X_Scroll` → camera path.
