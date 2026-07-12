# research: ball ↔ brick collision (`CHECK_BRICK_HIT_AND_BOUNCE_BALL`)

Research for the **ball ↔ blocks demo**. Goal: port the Arkanoid-MSX brick
collision faithfully so a ball fired into a box of blocks bounces off them with
the real arithmetic — including the corner disambiguation
(`RESOLVE_CORNER_COLLISION`) and the sub-step impact-point interpolation
(`TICKS_TO_HIT`) we located last turn.

Demo shape (agreed): **indestructible blocks**, a **curated layout**, and an
enclosure of **3 real playfield walls (top/left/right) + a bottom row of
unbreakable bricks**. Keeping the real walls exercises the wall-bounce code
*alongside* the brick code; the bottom brick row contains the ball via **real
brick collision**, not a hardcoded bottom-wall fiction — so `ball.js`'s `y≥184`
lost path and paddle path stay dormant by geometry, needing no code change. The
ball bounces indefinitely against the curated interior blocks. No scoring, lives,
capsules, or removal. Full layout in §8 "Demo layout".

All citations are into the external disassembly
`C:\Z_Temp\arkanoid_msx_disasm`. `file:line` = line in that file;
`;xxxx` in quoted rows = the Z80 address. **VERIFIED** = read from the
instructions. (Items once marked *TO-VERIFY (impl)* — "stated per header/one case,
transcribe when coding" — are all now ported + verified; the port is complete S1–S6.)

---

## 1. Where it lives, and the hook point

- Routine: `check_brick_hit_and_bounce_ball.asm:116` `CHECK_BRICK_HIT_AND_BOUNCE_BALL`
  (Z80 `9c2d`). ~2200 lines; the bulk is four near-duplicated direction blocks
  plus shared impact-point helpers.
- **Caller / hook** — `disassembly.asm:7443-7482`, inside `UPDATE_BALL_POSITION`'s
  multiplier loop:

  ```
  ld b,(iy+SPEED_MULTIPLIER) ; B = speedMultiplier
  inc b                      ; run at least once  → loops (mult+1) times
  l9a36h:
    ...add Y_SPEED to ball Y; add X_SPEED to ball X...   ; one unit-vector step
    call CHECK_BRICK_HIT_AND_BOUNCE_BALL                 ; ← brick check per sub-step
    ld a,(DOH_BEEN_HIT); or a; ret nz                    ; stop-flag: bail out of remaining steps
    djnz l9a36h
  ```

  This is exactly the loop in [`src/ball.js:164`](../src/ball.js) whose comment
  says *"The source calls CHECK_BRICK_HIT inside the multiplier loop; omitted
  here."* **The port re-instates that hook** — a per-unit-step brick check —
  rather than one check per rendered frame. **VERIFIED.**

  `DOH_BEEN_HIT` (`0xe2b9`) doubles as a generic "this ball is handled, stop
  stepping it" flag — but **for normal bricks it stays 0**, so the `mult+1` loop
  keeps sub-stepping *after* a hit (a fast ball can hit several bricks — or a border —
  in one frame). The port models this by having `ball.js`'s loop **ignore**
  `brickCheck`'s return (no `break`) — [`src/ball.js`](../src/ball.js). And there is
  no double-bounce against the walls: every brick/border bounce flips the relevant
  speed axis, and `ACTION_9941`'s wall clamps are gated on that speed's sign
  (`disassembly.asm:7248/7268`), so the flip disqualifies them. **VERIFIED** (S5b/S6) —
  this corrects the earlier sketch that had the loop `break` on a hit.

## 2. Architecture fit — routine-level translation, one data-layout substitute

Consistent with `block_breaker/CLAUDE.md`: this is coordinate math, no screen-RAM
readback. One coincidence-style substitute (per the root `CLAUDE.md` framework):

- `BRICK_EXISTS_AT_ROWCOL` (`disassembly.asm:8347`) reads a **word-per-cell
  "unrolled" table** `BRICK_LEVEL_BITMASK` (`0xac10`) indexed `32*row + 2*col`,
  plus a `BRICK_BIT_CHECK_JUMP_TABLE` for the bit test — an MSX bit-addressing
  optimization over the packed 17-byte `BRICK_MAP` (`bricks.asm:21`). This is a
  data-layout trick, **not** a gameplay mechanism. Substitute: a plain
  `brickExistsAt(row, col)` over our decoded grid (same result, no RAM mirror).
  **VERIFIED** the input/output contract (row/col in, present-bit out); the
  internal table layout is intentionally not replicated.

## 3. Coordinate model — contact point, grid, brick rectangle

The routine never uses the ball center. It uses the **leading contact edge**,
direction-dependent (`check_brick_hit_and_bounce_ball.asm:57-65`, header):

| moving | offset | seen in code |
|--------|--------|--------------|
| up     | `Y − 24` | `:138` (up-right), `:409` (up-left) — **VERIFIED** |
| down   | `Y − 19` | `:635` (down-right), `:827` (down-left) — **VERIFIED** (S3) |
| right  | `X − 12` | `:165` (up-right) — **VERIFIED** |
| left   | `X − 17` | `:417` (up-left) — **VERIFIED** |

Cross-checked against the decoded ball sprite (§8 "Ball sprite"): the up/down and
left/right offset spreads are both **5px = the ball's decoded extent**, so the
*ball component* of these offsets is confirmed against real geometry. The
remaining component (the ~12-24 base) is the brick-grid pixel origin, transcribed
verbatim per block (see the brick-rectangle note below).

Grid conversion (**VERIFIED** up-right `:139-169`, up-left `:410-421`):

```
BRICK_ROW = (BALL_Y − Yoff) >> 3      // 8 px tall  (one char)
BRICK_COL = (BALL_X − Xoff) >> 4      // 16 px wide ("a brick is 2 chars", :210)
```

Grid extent: **11 columns** (`col` compared `cp 11`, `:221`) × **12 rows**
(`CURR` `< 12` `:145`; `PREV` `< 13` `:189`) — matches the level-viewer's 11×12.

**Brick rectangle (for rendering ↔ collision agreement).** The impact-point
reconstruction encodes the brick's own pixel faces, e.g. `16*col + 12` (left
face, ball moving right) at `:1809`/`:1814`, `8*row + …` for the Y edges at
`:1330`/`:2218`. The exact face constants vary by approach direction and include
ball-radius fudge (12 vs 16, 18/19/20/24). **Design rule for the demo: derive
each rendered block's rectangle from these same constants**, so render and
collision are consistent *by construction* rather than by a second hand-measured
layout.

**RESOLVED — every face constant transcribed verbatim, none inferred.** The full
set — `16col+12`/`16col+16` (X faces), `8row+18/20/24/31` + `±7` (Y edges), the wall
bounds `188`/`15` — was ported block-by-block across S2–S4 (`RESOLVE_CORNER` /
`HANDLE_CORNER_CASE_*`) and S5b (`COMPUTE_WALL_ADJACENT_HIT_POINT`). The §9 scan
catches a wrong *inside*-snap; the border-poke to x=15/189 is the *faithful* outside
case (§5c), not a wrong snap. (`COMPUTE_PRECISE_HIT_POINT`'s constants were
deliberately **not** transcribed — dead vestige, §5c.)

## 4. Algorithm structure (one direction; the other three mirror)

Header `:1-114` + up-right block `:116-350` (**VERIFIED**); up-left `:406-485`
and down-right dispatch `:414-456` spot-checked — same shape, mirrored constants.

1. **Bail if final level** (`:121` `LEVEL >= FINAL_LEVEL` → DOH, out of scope).
2. **Direction dispatch** on the sign bits of `Y_SPEED` then `X_SPEED`
   (`:126-131`) → one of four blocks: up-right / up-left / down-right / down-left.
3. **Compute cells**: `CURR_BRICK_*` from ball pos, `PREV_BRICK_*` from
   `pos − speed` (`:137-215`). Also stash `PREV_X_PX`/`PREV_Y_PX` (pixel-space
   previous position — the sub-step helpers start from here).
4. **Range guards** + special right/left-border case
   (`CHECK_BALL_REACHES_RIGHT_BORDER` `:1019`, `CHECK_RARE_OR_IMPOSSIBLE_CASE`
   `:1038`).
5. **Vertical double-impact special case** (`CHECK_VERTICAL_DOUBLE_IMPACT`
   `:1126`) when the ball crosses a full row into a specific column config.
6. **Compare `PREV` vs `CURR` cell** (`:235-271`) to classify the crossing:
   - same cell / no relevant crossing → **no hit**
   - Δcol only (same row, `X2==X1±1`) → **horizontal-face** test
   - Δrow only (`X1==X2`) → **vertical-face** test (top/bottom)
   - Δrow **and** Δcol (diagonal) → **ambiguous corner** →
     `RESOLVE_CORNER_COLLISION`
7. For the chosen face, `BRICK_EXISTS_AT_ROWCOL`; if present:
   snap ball to `BRICK_HIT_{X,Y}_PIXEL`, call the bounce primitive, then
   `APPLY_BRICK_HIT_EFFECT`.

### Bounce primitives — already ported

`BALL_VERTICAL_BOUNCE` (`9b5b`) and `BALL_HORIZONTAL_BOUNCE` (`9b80`) are already
in [`src/ball.js`](../src/ball.js) (`verticalBounce`/`horizontalBounce`) and used
for walls. The brick path reuses them unchanged — flip one speed axis + reflect
skewness. **No new bounce math needed**, only the *decision* of which to call and
the *snap position*.

## 5. The two mechanisms from last turn — precisely located

### 5a. Ambiguous corner — `RESOLVE_CORNER_COLLISION` (`:1661`, Z80 `a670`)

Entered only on a **diagonal** cell crossing where both a vertical-face and a
horizontal-face brick are candidates (`up_right_resolve_ambiguous_corner` `:325`,
and via `CHECK_VERTICAL_DOUBLE_IMPACT` `:1164`). It:

1. defines the candidate brick's vertical band `hit_y0/hit_y1 = 8*row + {24 up|19
   down}(+7)` (`:1671-1683`);
2. picks an auxiliary slope `(BALL_X_SLOPE, BALL_Y_SLOPE)` from
   `TBL_SPEED_FROM_SKEWNESS` (`:1689-1713`), sign-adjusted by `Y_SPEED`;
3. **sub-steps** along that slope from `PREV_Y_PX`, counting `TICKS_TO_HIT`, until
   it crosses the brick's Y edge (`:1717-1771`);
4. reconstructs X at that instant: `x = PREV_X_PX + (TICKS_TO_HIT−1)*X_SLOPE`
   (`:1779-1796`);
5. classifies x against the brick's horizontal band and **returns carry** = which
   interpretation (vertical vs horizontal face) wins (`:1801-1965`), writing
   `BRICK_HIT_{X,Y}_PIXEL`.

The caller then does `BALL_VERTICAL_BOUNCE` or `BALL_HORIZONTAL_BOUNCE` on the
carry result (`:332-349`). So: **arithmetic corner disambiguation → then the
existing vertical/horizontal bounce** — exactly as described last turn. **VERIFIED.**

`HANDLE_CORNER_CASE_VERTICAL` (`:1968`) / `HANDLE_CORNER_CASE_HORIZONTAL`
(`:2104`) and `COMPUTE_PRECISE_HIT_POINT` (`:1229`) / `COMPUTE_WALL_ADJACENT_HIT_POINT`
(`:1487`) are the same machinery used to *snap the ball to the exact face pixel*
for the double-impact and wall-adjacent cases. All four share the
`TICKS_TO_HIT` sub-step loop + `TBL_SPEED_FROM_SKEWNESS`.

### 5b. `TICKS_TO_HIT` — what it actually is (a correction worth recording)

`balls.asm:40` calls it *"a discrete sub-step counter … how many steps along an
auxiliary slope are needed before crossing a candidate brick boundary."*
**VERIFIED**, and one nuance vs how we framed it last turn:

- The **coarse anti-tunneling is the `mult+1` loop in §1**, not `TICKS_TO_HIT`.
  The ball advances **one unit-vector at a time** (max ±2 px on an axis, from the
  skewness→speed tables), and the brick check runs after **every** unit step.
  Since a brick is 8 px tall, one step can't skip a brick. So a fast ball is
  already prevented from tunneling by the per-sub-step check.
- `TICKS_TO_HIT` is a **finer, within-one-step interpolation** used to (a) pin the
  **exact impact pixel** so the ball snaps flush to the face instead of
  overlapping, and (b) **disambiguate corners** (5a). It counts slope sub-steps
  from `PREV_*_PX` to the crossing; in practice it's tiny (1–2).

Both together = no tunneling **and** accurate reflection position. Worth stating
plainly in the port so we don't over-attribute anti-tunneling to `TICKS_TO_HIT`.

### 5c. The wall-adjacent border specials (S5b) + the `COMPUTE_PRECISE_HIT_POINT` vestige

Two dispatchers guard the wall-adjacent path, called right after the prev/curr cells are
computed and **before** the face classification:

- `CHECK_BALL_REACHES_RIGHT_BORDER` (@a29a), from the two **right-moving** blocks
  (`:217` up-right, `:669` down-right): fires when `CURR_BRICK_X==11 && PREV_BRICK_X==10`
  — the ball just crossed into the right wall region. **VERIFIED.**
- `CHECK_RARE_OR_IMPOSSIBLE_CASE` (@a2ad), from the two **left-moving** blocks (`:444`
  up-left, `:860` down-left): fires when `CURR_BRICK_X==15 && PREV_BRICK_X==0` — the
  leading contact point `x−17` **wrapped** below 0 (ball past the left wall). **VERIFIED.**

Both fall into the shared body `la2bdh` (@a2bd), which classifies the row crossing:
- `Y1==Y2` (`la2dfh`) → **horizontal (wall) bounce**, no snap.
- adjacent row (`la2eeh`) → `COMPUTE_WALL_ADJACENT_HIT_POINT` decides: its **carry** =
  "the reconstructed hit-X is on the brick side (in bounds)". Carry + a brick at
  `(CURR_BRICK_Y, PREV_BRICK_X)` → snap to `BRICK_HIT_{X,Y}_PIXEL` + **vertical bounce**
  off that wall-adjacent brick; else → horizontal (wall) bounce.
- non-adjacent → the source's own "rare / impossible" branch: set carry, **no bounce**
  (the disassembly comments it "I've never seen the code arriving here"). Ported faithfully.

Once the border config matches, the body **always** reports handled (source
`set_carry_and_exit`), so `checkBrickHit` returns `true` before the normal classification.

**The `COMPUTE_PRECISE_HIT_POINT` (@a3d1) vestige — a decoded finding, not a guess.**
That ~60-line routine is `call`ed at exactly two sites — `la2dfh` (@a2e5) and
`no_brick_do_horizontal_bounce_set_carry` (@a31b) — and **neither reads back the
`BRICK_HIT_{X,Y}_PIXEL` / `VAUS_X2` it writes.** It only ever writes scratch RAM (never
`ix`/`iy`, i.e. never the ball), and both sites do `BALL_HORIZONTAL_BOUNCE` immediately
after with no `ld (ix+…)` from its output. So its entire result is **provably dead**;
the only observable effect at those sites is the horizontal bounce. This is the same
class of vestige tiburoncio catalogued in the disassembly README ("planned but not
implemented" — the red-capsule ball-acceleration, the portal transition): almost
certainly a snap of the ball to the wall/brick face whose `ld (ix+…)` writes were
removed, leaving a dead `call`. **Decision (agreed):** don't port the dead body — emit
just the horizontal bounce it guards, cited in `brick_collision.js borderBody`. Porting
~60 lines of byte-math I could never verify (output unused) would violate "test the
defining case" for zero behavioral gain.

**The vestige is visible in play.** Because `la2dfh` does *not* snap, when a border
special fires mid-multiplier-loop (a fast ball taking 2+ sub-steps) the ball sits up to
~3px past the wall face for that one frame — x reaches **15** (left, face 18) / **189**
(right, face 186) — then the flipped `xSpeed` carries it back inside. `ACTION_9941`'s
wall clamps are both gated on `X_SPEED` sign (`disassembly.asm:7248/7268`), so the flip
disqualifies them and there is **no** double-bounce. Had `COMPUTE_PRECISE_HIT_POINT`'s
snap survived, the ball would have been pinned to the face and never poked. The `[15,
189]` range is the exact, empirically-confirmed faithful boundary (§9).

### 5d. The ambiguous-corner tunnels — "identical face logic" was WRONG (two divergences)

**Retraction.** S3 originally read the four direction blocks as "identical face logic,
ported as one function." That is **wrong**, and the wrong claim *hid two bugs* — both in
the ambiguous-corner path (`aRow==1 && aCol==1`), both letting a ball **tunnel through a
solid brick**. The blocks share the crossing classification but the corner path is
**X-direction-dependent** (right vs left are mirror images, not copies). Address-cited:

- **Divergence 1 — dropped `la0b4h` fallback (carry-SET branch).** Source
  `up_right_resolve_ambiguous_corner` (`:325`): after `RESOLVE_CORNER_COLLISION` returns
  carry-set (vertical), it checks `(CURR_BRICK_Y, PREV_BRICK_X)`; if **empty** it falls to
  `up_right_no_brick` (`:350`) → check `(CURR_BRICK_Y, CURR_BRICK_X)` → **horizontal**
  bounce off the diagonal brick. The port had only the first check. Repro: **level 32**, a
  1-wide gold column entered diagonally (the vertical candidate is the empty pocket beside
  it) → no bounce → the ball wedged and drifted through. Fix: one line in the carry-set
  branch of `checkBrickHit`. **VERIFIED, but its verification was too narrow** — only level
  32, one paddle path — so it left Divergence 2 undiscovered.

- **Divergence 2 — inverted carry in `RESOLVE_CORNER_COLLISION`'s moving-right branch.**
  The port's `resolveCorner` collapsed the four source classifiers (`la725` DR / `la797h`
  UR / `la75eh` DL / `la7d7h` UL) into `xs>=0` and `xs<0`. That collapse is valid — up/down
  share carry logic for a given X — **but the moving-right (`xs>=0`) branch had the two
  middle bands swapped.** For `base < B <= base+31` (base = `16*col+12`), reconstructed
  crossing-X `B`:

  | B band | source (la725/la797h) | port (was) | port (now) |
  |---|---|---|---|
  | `B <= base` | vertical (carry set) | vertical ✓ | vertical |
  | `base < B <= base+15` | **vertical** | ❌ horizontal | vertical |
  | `base+15 < B <= base+31` | **horizontal** | ❌ vertical | horizontal |
  | `B > base+31` | horizontal (carry clear) | horizontal ✓ | horizontal |

  So a ball crossing a corner **moving right** got the wrong bounce axis in the middle
  bands. When the faithful answer was horizontal (flip X) but the port bounced vertical
  (flip Y only), `xs` stayed positive and the ball walked right **through** the 16px brick
  — e.g. **level 8**, the (2,8)H/(1,9)U/(2,9)H pocket: the ball drifted x=158→172 straight
  through the unbreakable brick over ~15 sub-steps. The `xs<0` (left) branch was already
  correct (mirror of `la75eh`). Fix: swap the two middle-band `vertical` flags to match
  `la725`. See `brick_collision.js resolveCorner`.

**Why both slipped past the S1–S6 tests.** The `ball_blocks` corner case asserts only
*that* a bounce happened (`ySpeed !== -1 || xSpeed !== 1`), never *which axis* — so it
passed with the inverted decision. The box-scan is a fully-enclosed box, where a
wrong-axis bounce still keeps the ball contained (no escape) — so it never surfaced the
drift-through. **Defining-case lesson:** a corner test must assert the *axis*, and
anti-tunnel coverage must scan the *real levels* (stacked-brick pockets), not just a
curated box.

**Verification (the defining case, done right this time).** A headless scan over **all 32
levels × 80 trajectories** (8 start-x × 10 skewness × normal/fast), ~4.1M collision
sub-steps, flagging any frame where the ball's centre is buried ≥2px inside a solid brick:
**68 penetrations on 8 levels (12, 8, 9, 4, 20, 21, 28, 32) → 0 after the fix.** Escape
scan (all levels): 0. `ball_blocks` 17/17 PASS, `ball_paddle` PASS — no regression.

## 6. `APPLY_BRICK_HIT_EFFECT` — and the indestructible-block adaptation

`disassembly.asm:7851`. Dispatches per brick type via `TBL_BRICK_ACTIONS`
(`:7923`): `action_brick_hit`, `…_and_capsule`, `action_hard_brick_hit`,
`action_unbreakable_brick_hit`, `action_reset_unused_vars`. Always first calls
`UPDATE_BALL_SPEED` (`:7852`) — the same bounce-driven acceleration already in
[`src/ball.js`](../src/ball.js) (`updateSpeed`).

**Demo = indestructible blocks → port only `action_unbreakable_brick_hit`
(`:7948`):**
- no brick removed, no score, no capsule;
- increments `ACTION_SKEWNESS_COUNTER`; **every 20 unbreakable hits →
  `CHANGE_BALLS_SKEWNESS`** (`:7956-7964`) — the same angle-perturbation
  `changeSkewness()` already in ball.js (walls use a 40-bounce version);
- then bounce.

So the effect layer collapses to: `updateSpeed()` + a 20-hit skewness perturb +
the bounce. Faithful, and it keeps the ball lively in a never-emptying box.

### 6a. S6 as implemented (DONE + verified)

`applyBrickHitEffect(ball, field)` in [`src/brick_collision.js`](../src/brick_collision.js),
called from `doBounce` after every brick bounce:

- **`UPDATE_BALL_SPEED` first** — `ball.updateSpeed()` (already was in `doBounce`).
- **Per-type dispatch, substituted.** The source keys `TBL_BRICK_ACTIONS` off a
  per-LEVEL "unrolled" action table indexed by `(BRICK_ROW, BRICK_COL)` (`@aa08-aa51`).
  We substitute a direct `field.get(row, col)` read of the hit cell — same
  coincidence-style data-layout substitute as `BRICK_EXISTS_AT_ROWCOL` (§2). The hit
  cell = the `lastQueriedRow/Col` globals (`BRICK_ROW/BRICK_COL`), set by the `exists`
  that gated the bounce — so the effect always sees the right cell, faithfully.
- **`action_unbreakable_brick_hit` (`@aaa4`)** — the only type the demo needs: bump the
  shared `unbreakableHitCount` (= `ACTION_SKEWNESS_COUNTER`, module-global like the
  source's RAM byte); **every 20th → `ball.changeSkewness()`** (the exact
  `CHANGE_BALLS_SKEWNESS` per-ball transform, already in ball.js). The two `BRICK_UNUSED`
  bytes it also writes are "never checked" (source's own comment) → dropped.
- **`action_hard_brick_bounce`'s tail dropped (no software counterpart).** Despite its
  name it does NO velocity/position change — it computes a VRAM name-table address,
  calls `UPDATE_HARD_BRICK_TABLE` (the tile's visual state), and plays a sound (`@ab06-
  ab37`). All hardware/render layer (sprites are hw-composited; sound is omitted
  project-wide), so it is not ported — the reflection already happened at the call site.

**ball.js is untouched by S6** — the per-sub-step `brickCheck` hook was already in the
multiplier loop from S5 (and deliberately does NOT `break` on a hit: `DOH_BEEN_HIT` stays
0 for normal bricks, so a fast ball keeps sub-stepping; §1). The placeholder `onHit`
callback is gone (superseded by `applyBrickHitEffect`).

**Verify:** the 20-hit test (`ball_blocks.js selfTest`) spies `changeSkewness`, resets the
counter, re-arms the same unbreakable hit 40× → exactly 2 perturbations (hit 20 & 40).
The 20 000-frame box-scan with the perturbation active stays contained (x∈[15,189],
y∈[9,107], 0 losses) and the ball now explores all **16** skewness values (vs the bounce
alone) — the "keeps the ball lively" payoff, confirmed. `ball_paddle.js selfTest` still
PASS (ball.js unchanged).

## 7. Data to extract (verbatim)

- `TBL_SPEED_FROM_SKEWNESS` (`check_brick_hit_and_bounce_ball.asm:2016`, Z80
  `a86c`) — 8 `(X_SLOPE, Y_SLOPE)` pairs indexed `2*(|skewness|−1)`; **Y always
  negative, sign fixed later from `Y_SPEED`** (`:2015`). **VERIFIED:**

  ```
  |s|:  1      2      3      4      5      6      7      8
       (4,-1) (2,-1) (1,-1) (1,-2) (-1,-2)(-1,-1)(-2,-1)(-4,-1)
  ```

  Note this is a **distinct** table from the movement `SKEWNESS_*_TO_XY` already
  in ball.js (auxiliary slope for boundary-crossing, steeper X at the extremes:
  ±4 vs the movement ±2). Extract as its own table; don't reuse the movement one.

- Brick rectangle / hit-face pixel constants — per §3, transcribed per direction
  block during impl.

## 8. Implementation plan (save-point commits, squash at end)

Per root `CLAUDE.md` multi-sub-step guidance. Each step browser-verifiable.

- **S1 — data + grid.** Extract `TBL_SPEED_FROM_SKEWNESS`; add a `BrickField`
  (decoded grid + `brickExistsAt(row,col)` + row/col↔pixel rect from §3). Also
  record + render the decoded **ball sprite** — see the "Ball sprite" S1 note below.
- **S2 — one direction, faces only.** Port entry + dispatch + `PREV`/`CURR`
  classification for **up-right**, handling only clean vertical-face &
  horizontal-face hits (no corner). Simplest end-to-end bounce off a block.
- **S3 — mirror the other three directions.** up-left / down-right / down-left,
  transcribing each block's constants (verify per §3 offsets).
- **S4 — corner machinery.** `RESOLVE_CORNER_COLLISION`,
  `HANDLE_CORNER_CASE_{VERTICAL,HORIZONTAL}`, `COMPUTE_PRECISE_HIT_POINT`, and
  the shared `TICKS_TO_HIT` sub-step loop + `TBL_SPEED_FROM_SKEWNESS`.
- **S5a — double-impact.** `CHECK_VERTICAL_DOUBLE_IMPACT` (@a328). **DONE + verified.**
- **S5b — wall-adjacent border specials (DONE + verified).**
  `CHECK_BALL_REACHES_RIGHT_BORDER` (@a29a) / `CHECK_RARE_OR_IMPOSSIBLE_CASE` (@a2ad)
  and their shared body `la2bdh`, plus `COMPUTE_WALL_ADJACENT_HIT_POINT` (@a591), wired
  into `checkBrickHit` *before* the face classification (source order: guards A/B/C →
  border → guard D → double-impact → guard E). `COMPUTE_PRECISE_HIT_POINT` (@a3d1) is a
  **dead vestige** and is not ported — see §5c.
- **S6 — effect (DONE + verified).** `APPLY_BRICK_HIT_EFFECT` (@aa05) +
  `action_unbreakable_brick_hit` (@aaa4): `updateSpeed()` + the 20-hit skewness perturb,
  dispatched on the hit cell's type. Full implementation notes + the dropped
  `action_hard_brick_bounce` VRAM/sound tail in **§6a**. NOTE: the ball.js hook this
  bullet originally described was already added in an earlier step and refined to *not*
  `break` on a hit (the source keeps sub-stepping while `DOH_BEEN_HIT`==0, §1); **S6
  therefore did not touch ball.js at all**, so the `ball_paddle.js` no-regression is
  automatic — re-ran it anyway, still PASS.
- **S7 — demo + selfTest.** `demo/ball_blocks.{html,js}` with the layout below;
  **spawn** the ball at an interior cell *above* the bottom row, already moving up
  (`glue=2`, `ySpeed=-1`, `skewness=3` — public fields, bypassing the
  paddle-coupled glue/launch flow). Headless `selfTest()` per §9.

Likely new files: `src/brick_collision.js` (the routine), `src/brick_field.js`
(grid + geometry), `demo/ball_blocks.{html,js}`. ball.js gets only the injected
hook.

### Ball sprite (decoded 2026-07-11) — S1 note

The ball is sprite **pattern `0x80`** (set at [`disassembly.asm:9230`]() and
`:7154`; color 15 = white), loaded from `SPRITE_DEFINITIONS` (ROM `0x8684`) to
VRAM `0x3800`. Pattern `0x80` → VRAM offset `(0x80 & 0xFC)*8 = 0x400`, so the 32
bytes are at ROM **`0x8A84`** ([`sprite_data.asm:131-134`]()). Only the top-left
8×8 quadrant is non-empty (MSB = leftmost pixel):

```
0x70   . █ █ █ .
0xf8   █ █ █ █ █
0xf8   █ █ █ █ █
0x70   . █ █ █ .
0x00   (rows 4-15 and the other 3 quadrants all empty)
```

**→ a 5-wide × 4-tall lozenge in the top-left corner of the 16×16 cell, with NO
transparent margin** — the visible pixels start at the sprite origin (col 0 /
row 0), *unlike* the Vaus (~10px left margin, the source of the paddle `8`-vs-`18`
story). So **sprite origin ≈ the ball's visible top-left**, which is why the
origin-based wall checks and the edge-based brick offsets refer to the same ball
and a single rendered ball can be flush against both.

- **Render decision:** draw this **exact 5×4 lozenge** (the four corners cut,
  per the pattern), anchored at `(ball.x, ball.y)` — the faithful source shape,
  not a plain rect. Retires `ball_paddle.js`'s 5×5 origin-anchored stand-in
  ([`demo/ball_paddle.js:12`](../demo/ball_paddle.js)); it was close (right anchor,
  right width, 1px too tall).
- **Cross-check (passes):** the directional contact-offset spreads equal the ball
  extent — |left−right| = |17−12| = **5 = width (exact)**; |up−down| = |24−19| =
  5 ≈ height 4. This validates the §3 contact offsets' *ball component* against
  real sprite geometry (the promised geometric cross-check); §3 covers the
  brick-grid component the ball decode does not close.

### Module boundaries — reusability

The split follows the **source's own file organization** (ball routines vs
`check_brick_hit_and_bounce_ball.asm`), and the dependency graph is a DAG with
`ball.js` as the leaf:

- **`ball.js`** — imports nothing; exports `Ball` + `PLAYFIELD`. The pure
  movement / wall / paddle core, reused *unchanged in spirit* by both demos (the
  S6 hook is inert unless a `brickCheck` is wired). **No dependency on bricks.**
- **`brick_field.js`** — the grid + row/col↔pixel geometry + `brickExistsAt`.
  Reuses `levels.js` / `palette.js` for decode; no dependency on `ball.js`.
- **`brick_collision.js`** — the ported routine. Operates on a `Ball` *instance*
  passed in (calls its public `verticalBounce` / `horizontalBounce` /
  `updateSpeed` / `changeSkewness`), and a `BrickField`. It does **not** import
  the `Ball` class. Exports e.g. `makeBrickCheck(field)` → `(ball) => boolean`.
- **demo** — the only place the three meet: `ball.brickCheck = makeBrickCheck(field)`.

So the coupling is **dependency-inverted** (the callback), there is **no circular
import** (ball.js never references bricks), and reuse is via `ball.js`'s public
methods + shared `PLAYFIELD` constants — not shared mutable state. The eventual
full game imports all three the same way. This is validated at S1 (does
`brick_field.js` stand alone?) and S6 (does the hook keep ball.js bricks-agnostic
and the paddle selfTest green?).

### Demo layout (agreed)

Not a fully-enclosed brick box (which would dodge the wall code) and not a bare
walls box (no bricks) — a **hybrid** that exercises both:

- **Enclosure = 3 real walls + a brick floor.** Top (`y<9`), left (`x<18`),
  right (`x≥186`) are the existing `ball.js` walls
  ([`src/ball.js:246`](../src/ball.js)) — kept so the wall-bounce code is
  verified. The **bottom** is a **solid row of unbreakable bricks at grid row 11**
  (cols 0-10 → spans wall-to-wall, no slip-gap at the corners). The floor is the
  *ported brick routine* catching the ball, **not** a bottom wall — so `ball.js`
  gains no bottom bounce, and `checkVausCollision` / the `lost` path
  ([`:212`](../src/ball.js) / [`:268`](../src/ball.js)) never fire: the brick grid
  sits well above the paddle band (167) and `y=184`, and the solid floor +
  per-sub-step check means the ball can't cross it.
- **Targets = curated interior unbreakable blocks** for the ball to bounce off,
  placed to drive the corner path (`RESOLVE_CORNER_COLLISION`).
- **Why hybrid wins the coverage:** the bottom row's **wall-adjacent end bricks**
  (col 0 / col 10) make the S5 wall-adjacent specials
  (`CHECK_BALL_REACHES_RIGHT_BORDER`, `COMPUTE_WALL_ADJACENT_HIT_POINT`)
  *reachable* — the exact paths a full brick ring would never exercise. One layout
  → wall bounce **+** brick bounce **+** (reachably) wall-adjacent specials.
- **Faithfulness:** containment is real unbreakable-brick collision arranged as a
  curated floor; the fiction is only in *where bricks are placed*, never in code.

## 9. Verification (the defining case)

Headless sim like `ball_paddle.js selfTest()`:
- fire the ball into the curated layout, run thousands of frames;
- **anti-tunneling assertion (the payoff):** at the end of every frame the ball's
  contact cell is **never** a solid block it should have bounced off — explicitly
  include a **fast ball** (accelerated to speedPos 15) vs a **1-cell gap / thin
  block** so `TICKS_TO_HIT` is actually exercised (per the "test the defining
  case" rule);
- no escapes: `x∈[15,189]` **and** the ball never reaches `y≥184` (the bottom brick
  row holds it — `lost` must never fire); ball stays live. The bound is **[15,189]**,
  not `[18,185]`: the border-special poke (§5c) is faithful — the ball touches x=15/189
  for one frame then recovers. Anything beyond is a real leak.

**S5b result (`ball_blocks.js selfTest`, in-page + 20 000-frame headless):** 16/16 pass
— 10 pre-existing (S1–S5a) + 4 targeted border cases (right/left × wall-face `la2dfh`
and wall-adjacent-brick `la2eeh`) + 2 containment scans (normal + fast). The 20 000-frame
scan measured `x∈[15,189]`, `y∈[9,107]` (floor holds well above 184), **0 escapes, 0
losses** for both the normal and the `speedPos=15` fast ball. `[15,189]` and `y_max=107`
are the exact empirical range — the ball reaches x=15/189 precisely at the border frames.
