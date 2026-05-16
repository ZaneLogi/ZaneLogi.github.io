# Phoenix Enemy Motion — Research

How aliens move and animate during combat stages. Covers the per-frame
work split, the path-following motion model, position-keyed sprite
animation, the swoop-attack scheduler, and the stage-clear hand-off.

This doc is the upstream of step 6 implementation in `progress.md`.
Bird stages (`L3400`) and the mothership stage (`L22B4`/`L22CA`) reuse
some of the same machinery but have their own behavior code; only
references that apply to the alien combat stages (L2000) are claimed
verified here.

Source-of-truth: `Code.md` from the local ComputerArcheology Phoenix
clone (see `../CLAUDE.md` for the per-PC path). Tags as in sibling
docs: **[verified]** with an address citation, **[inferred]** when
reasoning beyond the source, **[uncertain]** when the source is
ambiguous.

Sibling docs:
- `research_stage_structure.md` §3 — JT4 dispatch (which stages use L2000)
- `research_stage_structure.md` §4.1/§4.2 — per-stage init data tables
- `research_rendering.md` §2.4 — Bit3Controller draw-side dispatch
- `research_code_flow.md` §5 — main-loop framing

---

## 1. Where motion runs in the per-frame flow

`L2000` is the JT4 handler for combat stages (`LevelAndRound & 0x0F` ∈
{0x1, 0x3, 0xB} per `research_stage_structure.md` §3) [verified,
`Code.md:$2000`].

It does the following **every frame**:

```
2000: PlayerUpdate         ($0876)   ; input + bullet + shield
2003: L0DF0                          ; player bullet → alien collision
2006: L24A0                          ; (TBD — bird/UFO machinery, not motion)
2009: A := ($435F) & 3               ; load 4-state counter
       ($435F)++                     ; increment for next frame
2011: if AliensLeft == 0 → L21BA     ; stage-clear path (see §8)
       elif AliensLeft >= 5 → L2130  ; full-formation routing
       else                  → L2146 ; depleted-formation routing
```

[verified, `Code.md:$2000-$202A`]

Then a **4-frame round-robin** dispatches one of four work lanes,
spreading per-frame CPU load across four 60Hz ticks (so each lane
fires at ≈15 Hz). The two routings differ only in *when* motion and
animation fire — the four lanes are otherwise the same:

| `$435F & 3` | Full formation (≥5, `L2130`)                      | Depleted (<5, `L2146`)                               |
|------|---------------------------------------------------|------------------------------------------------------|
| 0    | `AlienDataController $0A50` (draw/erase) → **`AlienBehaviorUpdate $3000`** → `L0F00` (alien-vs-player coll.) | `L2190`: same calls (draw → behavior → coll.) plus `L2560` (enemy-fire trigger, §7) and `EnemyBulletUpdate` |
| 1    | `L24C4` → `EnemyBulletUpdate $0C40` → **`AlienMovementUpdate $0D1C`** → `L0FC0` (kill-anim) | `L21A5`: `AlienMovementUpdate` → `AlienAnimationUpdate` → `L0A6C` → `L0FC0` → `L24C4` |
| 2    | **`AlienAnimationUpdate $0D70`** → `L2560`        | (same, via `L21A5` lane 1)                            |
| 3    | `L24C4` → `EnemyBulletUpdate` → `L0A6C` (rebuild screen-RAM addrs) → `L0FC0` | (same)                                                |

[verified, `Code.md:$2130-$21B3`]

**Implications for the JS port:**

- Motion updates fire **once per 4 frames**, not every frame. At
  60 Hz this is a 15 Hz position update — visible as a slightly
  stepped drift, exactly the original arcade feel.
- Animation likewise fires once per 4 frames, in a *different* lane
  than motion. So position update and sprite-frame update happen on
  different ticks within each 4-frame cycle.
- `L0A6C` (lanes 1/3 in depleted, lane 3 in full) rebuilds per-alien
  *screen RAM* address pointers from `(x, y)` — a no-op for the
  canvas port, which addresses by `(x, y)` directly
  (`research_rendering.md` §2.1).
- `L24A0`/`L24C4`/`L2560`/`L0F00`/`L0FC0` are gameplay glue (collision,
  kill-anim, enemy fire, etc.) outside this doc's scope; flagged here
  so the lane table reads cleanly.

### 1.0 Port lane assignment — and why we swapped

`stageAlienCombat` in `states.js` only routes work for lanes 0 and 1
(lanes 2 and 3 are no-op stubs — enemy fire / kill-anim deferred to
step 9). But the work assigned to each lane is **deliberately swapped
relative to source**:

| `combatLane & 3` | Source's L2000                                  | Our port's `stageAlienCombat`                       |
|------|--------------------------------------------------|------------------------------------------------------|
| 0    | draw + `AlienBehaviorUpdate` + alien-vs-player coll | `alienMovementUpdate` + `alienAnimationUpdate`    |
| 1    | `AlienMovementUpdate`                              | `alienBehaviorUpdate` + `alienVsPlayerCollision`  |
| 2    | `AlienAnimationUpdate`                             | (empty)                                              |
| 3    | enemy fire + screen-RAM rebuild                    | (empty)                                              |

Two deviations are baked in:

1. **Movement+animation merged on one lane.** Source runs movement on
   lane-1 and animation on lane-2 (1-frame separation). Our port runs
   both inside the port's lane-0 handler — back to back. This was an
   earlier decision driven by tick-pairing atomicity
   (`research_rendering.md` §9.2): rendering uses both alien position
   AND animation tile, and a 1-frame split caused 30 Hz tick-pair
   visual stutter.
2. **Movement-then-behavior order, not behavior-then-movement.** This
   is the *swap* — source has behavior on lane-0 and movement on
   lane-1 (behavior fires first each cycle, then movement 1 frame
   later). Our port reverses: movement fires first, behavior fires
   the next frame.

The reason for #2 is **swoop entry alignment**. `behaviorCommit`
(case-0 of the 8-state cycle) overwrites an alien's path pointer to
start a swoop. The swoop's first byte is often `dx=±4`, which can
only advance the ptr when `alien.x%8 ∈ {0, 4}`
(`research_enemy_motion.md` §3.5). Source's lane order puts commit
**before** the next movement in time, so commit fires with the
alien at whatever `x%8` the previous cycle left it at — and in our
port's lockstep formation that turns out to always be `x%8 = 7`,
which is misaligned for `dx=±4`.

By swapping movement to fire BEFORE behavior each cycle, the alien
crosses to `x%8 = 0` exactly one frame before commit reads it, so
the commit always sees a freshly-aligned alien. Side benefits:

- The earlier `behaviorCommit` x-snap workaround (`a.x = (a.x + 4) &
  0xF8`) is no longer needed — alignment is natural. Removed.
- Aliens that have swooped no longer drift offset from formation
  (the x-snap was producing ±3 px permanent offsets accumulating
  across swoops; that desync is gone).
- `behaviorScanAdvance` and `behaviorPickAlien` can use the
  source-faithful match key `alienSwoopLsb` ($4356) instead of our
  earlier port-specific `alienPathSeedLo` workaround.

The trade-off is that we deviate from source on lane ordering — the
individual sub-state handlers (`behaviorCommit`, `behaviorPickAlien`,
etc.) are byte-for-byte faithful to source, but the *frame within
each 4-frame cycle* on which each runs has shifted by one.
`alienMovementUpdate` and `alienAnimationUpdate` themselves are
byte-faithful too; only the lane they live in differs.

Why source's lane order works in arcade Phoenix despite this same
math: open question. Likely candidates: (a) source's much longer
cooldown (`L30E4` seeded from `Counter9A` high byte + level factor,
≈40-47 case-2 firings vs our stubbed 6) lets cumulative drift shift
the phase before commits start firing; (b) MAME emulation timing
differs subtly from real hardware; (c) the arcade has the same
"stuck swoop" potential but the random pattern picker rarely lands
on dx=±4-leading patterns when misaligned. Reproducing this exactly
is a research effort we deferred.

### 1.1 Functions that affect alien movement

"Movement" here means anything that writes to `alien.x` / `alien.y` or
to the path pointer at `$4B50+i*2` — i.e. the state that determines
where the alien will be next frame. Useful when debugging "why is this
alien at this position".

**Direct** — they write `(x, y)` or the path pointer:

| Function                              | Lane     | What it writes                                                                                          |
|---------------------------------------|----------|---------------------------------------------------------------------------------------------------------|
| `AlienMovementUpdate ($0D1C)`         | 1        | `x += dx, y += dy` from `MOTION_DIRECTIONS[pathByte]`; path ptr += 1 on grid crossing                   |
| `AlienAnimationUpdate ($0D70)` → L0DDE| 2        | On `pathByte == 0`, rewrites path ptr to `($4394, $4395)` (drift seed). Only mover that *resets* the ptr |
| `AlienBehaviorUpdate ($3000)` → commit `$3264` | 0 | When pipeline ready (`$4350 ≥ 5`), overwrites matching aliens' path ptrs with the chosen swoop pattern address |
| `InitAlienPositions ($0610)`          | state-2  | Initial `(x, y)` from `ALIEN_FORMATIONS` (T1540+)                                                       |
| `$0650` (in $0532 init chain)         | state-2  | Initial path ptr for each alien from `ALIEN_MOVE_PTR_INIT` (T1520)                                      |
| `L0506`                               | state-2  | Seeds `$4394` from MSB of `alienMovePtr[0]` — the reset target L0DDE will use                            |

**Indirect** — they don't move aliens themselves, but change whether
the three direct functions act on a given alien:

| Function | Lane | Effect on movement |
|---|---|---|
| `L0DF0` (player bullet vs alien) | every frame | Clears `controlA` bit-3 → all three movers early-return for that slot |
| `L0F00` (alien body vs player)   | 0 | Same: clears bit-3 |

Data tables that drive the math (not functions, but on the critical
path for "where will this alien be next frame"):

- `MOTION_DIRECTIONS` (T1700) — `(dx, dy)` per path byte
- `MOTION_PATH_BASE` (T1000) — drift loop bytes
- `PATH_ROM_LOW` (0x1000-0x13FF) and `PATH_ROM_HIGH` (0x2C00-0x2FFF) —
  the two slices that hold all 36 closed-loop swoop pattern byte
  sequences (T1020-T13D0 in low, T2C00-T2FA0 in high), plus the drift
  loop T1000. Pattern-boundary labels embedded in `data.js`; pattern
  label → ROM address dictionary exported as `PATTERNS`
- `ALIEN_FORMATIONS` (T1540+) — starting `(x, y)` values
- `$4394 / $4395` (`alienPathSeedHi / alienPathSeedLo`) — runtime reset
  target rewritten by L0DDE; `$4395` is incremented once per L3264 call
  so the reset lands on a different drift-loop entry point each cycle

## 2. Per-alien data layout

The combat stage uses two parallel arrays of 16 entries each:

| RAM range            | Stride | Per-alien fields                                |
|----------------------|--------|-------------------------------------------------|
| `$4B70 - $4BAF`      | 4 bytes | `controlA`, `controlB`, `x`, `y`                |
| `$4B50 - $4B6F`      | 2 bytes | path-pointer MSB, path-pointer LSB              |
| `$4BB0 - $4BEF`      | 4 bytes | screen-RAM mirror addresses (canvas port skips) |

[verified, `Code.md:$0A50-$0A53`, `$0D1C-$0D1F`, `RAMUse.md`]

The 4-byte alien struct already matches the `state.aliens[i]` shape in
the JS port (`controlA`, `controlB`, `x`, `y`); the 2-byte path pointer
matches `state.alienMovePtr[i]` (currently a 16-bit LE value).

`controlA` bit assignments observed during combat:

- **bit 3** — draw enable. `Bit3Controller` (`$0740`) ignores aliens
  with bit 3 clear; `AlienMovementUpdate` and `AlienAnimationUpdate`
  also early-return when bit 3 is clear (`Code.md:$0D35`, `$0D8B`).
  This is the master "active" flag — set by `T1500` init and by the
  fade-in handler `L0834`.
- **bit 4** — "drawn on screen RAM, eligible for delete next frame."
  Set by `Bit3Controller` after a draw (`$074D OR $18`); cleared by
  `Bit4Controller` after a delete (`$0726 AND $EF`). The canvas port
  has no double-buffer, so this bit is informational only (we
  clear-and-redraw every frame).
- **bits 0-2 (low3)** — draw-mode dispatch (1×1, 2×1, 1×2, 2×2). See
  `research_rendering.md` §2.4 for the full table.
- **bits 5-7** — unused during normal alien combat (`T1500` and
  `T16A0` write only bits 0-2 and 3-4; never seen set in combat
  paths). Reserved for non-alien object types in the same data
  structure model (e.g. mothership / shield blocks).

## 3. The path-following motion model

### 3.1 Per-alien step (`AlienMovementUpdate $0D1C`)

```
0D1C: BC := $4B70           ; alien data (controlA of alien 0)
0D1F: HL := $4B50           ; path pointer of alien 0
L0D22:
       CALL L0D30           ; advance one alien by one step
       BC += 4              ; next alien struct
       HL += 2              ; next path pointer
       loop until BC == $4BB0  (16 aliens)
```

The per-alien step at `L0D30`:

1. Load `(HL, HL+1)` → `DE` = path pointer (a ROM address into
   `T1000`-area). [verified, `Code.md:$0D30-$0D38`]
2. Skip if `controlA` bit 3 not set. [verified, `Code.md:$0D32-$0D37`]
3. Read the byte at `DE` → `A` = current path-list **index**
   (a small 1-byte value into `T1700`).
4. `A := A * 2`, address `T1700 + A` in HL → 2-byte `(dx, dy)` entry.
   [verified, `Code.md:$0D3B-$0D40`]
5. Apply `dx` then `dy` to alien `(x, y)`, with end-of-list
   short-circuit when `dx == 0`. [verified, `Code.md:$0D41-$0D5A`]
6. After the position update: if low 3 bits of the post-update
   coordinate are zero — i.e. the alien just crossed an 8-pixel
   tile boundary — `INC` the path pointer at the original `DE`,
   advancing to the next index in the path list.
   [verified, `Code.md:$0D55-$0D59`, `$0D62-$0D66`]

This is **path-following at 1-2 pixels/frame** (sub-cell), with the
path advancing every 8 pixels (one tile cell). At the 4-frame
cadence (§1) and a typical step of `dx=±1`, that works out to one
path-index advance every ~32 frames (~½ s).

### 3.2 The motion table `T1700`

16 entries × 2 bytes (`dx`, `dy`), index 0 unused:

| Index | (dx, dy) | Meaning                  |
|-------|----------|--------------------------|
| 1     | +1, 0    | right                    |
| 2     | -1, 0    | left                     |
| 3     | +4, 0    | right fast               |
| 4     | -4, 0    | left fast                |
| 5     | 0, -4    | up                       |
| 6     | 0, +4    | down                     |
| 7     | +4, -2   | upper-right diag         |
| 8     | -4, -2   | upper-left diag          |
| 9     | +4, +2   | lower-right diag         |
| 0xA   | -4, +2   | lower-left diag          |
| 0xB-E | 0, +4    | down (×4 dups)           |
| 0xF   | -1, -1   | upper-left slow          |
| 0x10-13 | -4, 0  | left fast (×4 dups)      |
| 0x14-17 | +4, 0  | right fast (×4 dups)     |
| 0x18  | +4, -4   | upper-right fast diag    |
| 0x19  | +4, +4   | lower-right fast diag    |
| 0x1A  | -4, +4   | lower-left fast diag     |
| 0x1B  | -4, -4   | upper-left fast diag     |
| 0x1C-1F | mixed | swoop terminators        |

[verified, `Code.md:$1700-$173F`]

The duplicated entries (0xB-0xE all `0,+4`; 0x10-13 all `-4,0`; etc.)
exist because **the path index also keys the animation table** (§4) —
the duplication lets the motion be the same while the sprite cycles
through frames.

### 3.3 The path-list tables (`T1000`-`T13D0`)

Each path list is a sequence of 1-byte indices into `T1700`,
null-terminated. The path-pointer in `$4B50` walks this list one byte
at a time as the alien crosses 8-pixel boundaries.

The base list at `T1000`:

```
1000: 01 01 01 01 02 02 02 02 02 02 02 02 01 01 01 01 00
       ──────────  ────────────────────  ──────────  end
       right ×4    left ×8               right ×4
```

[verified, `Code.md:$1000-$1010`]

This is the **default formation drift**: 4 cells right (32 px), 8
cells left (-64 px), 4 cells right (back to start), repeat. End-marker
at `$1010` triggers the path-reset at `L0DDE` (§3.4).

`T1020` through `T13D0` are 18 numbered "closed-loop patterns" used
during attack swoops (`L3000` selects them — see §6). They follow the
same encoding (1-byte `T1700` indices, null-terminated).

### 3.4 End-of-list and per-stage path seed

When the animation update (§4) reads a path byte and finds `A == 0`,
it calls `L0DDE` which:

1. Backs up the per-alien path pointer by 2 to its slot in `$4B50`.
2. Writes `($4394, $4395)` over it — the per-stage **path seed**.
3. Re-reads the first byte of the new path.

[verified, `Code.md:$0D90-$0D91`, `$0DDE-$0DED`]

`$4394` is set at stage init (`L0506` at `$050E-$0511`) by copying the
MSB from `$4B50` — i.e. from the **first alien's** initial path
pointer, which came from `T1520[stage*2]`. `$4395` is left as zero
(part of the `$4392-$4397` zone cleared by the same routine).
[verified, `Code.md:$0506-$0513`]

`T1520` for all 16 stages is `(0x10, 0x00)` [verified,
`Code.md:$1520-$153F`], so `($4394, $4395) = ($10, $00)` and the path
reset always points back at `T1000`. Different aliens can be at
different positions in `T1000` at any given moment (they advance
independently as each crosses its own 8-pixel boundaries), but they
all share the same loop.

The reset target `($4394, $4395)` is a **stage-mutable global**, not a
constant — `L3000` and other behavior code overwrite it during attack
sequences to redirect aliens onto a swoop pattern, then restore it
when the swoop ends. See §6.

### 3.5 Grid-alignment requirement for fast motion bytes

The ptr-advance condition is `(coord & 7) == 0` after the move, where
*coord* is `y` for diagonal/vertical motion (`L0D55`) and `x` for
pure-horizontal motion (`L0D62`). This means **the alien must land on
a multiple of 8** for the path pointer to advance to the next byte.

Whether that's reachable from a given starting position depends on
the motion's step size via a simple modular-arithmetic property:

> With step `D` and modulus 8, the value `coord % 8` cycles through
> `gcd(D, 8)` distinct values starting from any fixed initial value.
> It will eventually reach 0 if and only if `(starting coord) % gcd(D, 8) == 0`.

Filling this in for every motion direction the source uses:

| Step `D`       | `gcd(D, 8)` | Reachable `coord%8` starts | Notes                                |
|----------------|-------------|----------------------------|--------------------------------------|
| ±1 (drift)     | 1           | `{0,1,2,3,4,5,6,7}` (any)  | Always advances within 8 steps       |
| ±2 (diagonal)  | 2           | `{0,2,4,6}` (even only)    | Used in `(±4, ±2)` and similar bytes |
| ±4 (fast)      | 4           | `{0,4}` only               | The dangerous case — see below       |

Implications for the design of the swoop patterns (`T1020-T13D0`,
`T2C00-T2FA0`):

- **`dx=±1` drift bytes are universally safe.** That's why
  `MOTION_PATH_BASE` (T1000) is built entirely from indices 1 and 2:
  the formation drift can never get stuck regardless of where each
  alien is sub-pixel-wise within the 8-pixel grid.
- **`dx=±4` fast bytes only work when alien `x%8 ∈ {0, 4}`** at the
  time the byte starts executing. If `x%8 ∈ {1,2,3,5,6,7}`, repeated
  +4 (or -4) just oscillates `x%8` between two non-zero values and
  the ptr never advances — the alien gets stuck sliding horizontally
  forever at its current `y`.
- **`(dx=±4, dy=±2)` diagonal bytes** advance on the `(y & 7) == 0`
  check (since both dx and dy are nonzero, source uses Y in `L0D55`).
  These work when `y%8 ∈ {0, 2, 4, 6}` — every other y line, since
  `gcd(2, 8) = 2`.
- **Patterns chain motion such that the alignment invariant is
  preserved across byte boundaries.** When the trace simulator walks
  T13D0 starting from `(168, 48)` (formation entry, x%8=0, y%8=0),
  every intermediate `(x, y)` lands on `x%8 ∈ {0, 4}` and `y%8 ∈
  {0, 2, 4, 6}`. The closed loop is a coordinated sequence of
  motion bytes designed to keep alignment intact for the entire
  ~128-step trajectory.

**Where alignment comes from — the entry condition.** All `T15xx`
formation positions are at `x%8 = 0` (multiples of 8). During drift,
each alien's `x%8` cycles `0→1→2→...→7→0` at `dx=±1`, taking 8
movement updates per ptr advancement. The alien's ptr advances to
the next byte of `T1000` *only* on the frames where `x%8 == 0`.

This is the crucial link to `behaviorPickAlien` (`L315A`, §6.4): the
source picks an alien whose `ptr.LSB == $4356` (saved
`alienPathSeedLo` from the previous commit cycle). The match
implies the alien's ptr last advanced to that LSB at some prior
moment, which is also when the alien was last at `x%8 = 0`. The 3
counter93 ticks between pickAlien and commit (~12 frames = 3
movement updates) then bring the alien to `x%8 ∈ {0, 4}` at the
commit moment — exactly the alignment the swoop's leading `dx=±4`
bytes need.

**Without this gate** (as in our port's current `behaviorPickAlien`),
aliens are committed at arbitrary `x%8` and Case-B stuck behavior
shows up roughly 75% of the time when the chosen pattern starts
with `dx=±4`. Trace simulation in `tools/` (or via `preview_eval`)
makes this empirically reproducible — see `progress.md` "Known
deferred issues" for the in-port consequence.

## 4. Position-keyed sprite animation

`AlienAnimationUpdate` (`$0D70`) walks the same 16-alien array and
writes a new `controlB` (= sprite-tile lookup index) into each entry
based on the **current path index** and the alien's **current x/y**.

### 4.1 Per-alien step (`L0D86`)

1. Load path pointer `DE` from `$4B50 + i*2`. [verified,
   `Code.md:$0D86-$0D88`]
2. Skip if `controlA` bit 3 clear. [verified, `Code.md:$0D8A-$0D8D`]
3. Read path byte `A := (DE)`. If `A == 0`, call `L0DDE` to reset and
   re-read. [verified, `Code.md:$0D8F-$0D91`]
4. `T16A0[A*3 .. A*3+2]` = 3-byte animation entry:
   - byte 0: low 3 bits of `controlA` (draw mode — 0=1×1, 1=2×1,
     3=1×2, 4=2×2), ORed in over `controlA & 0xF8`. [verified,
     `Code.md:$0D9C-$0DA0`]
   - byte 1: calc-mode flag — `0x01` (use both X and Y bits),
     `0x02` (use X only), `0x04` (use Y only). Decoded by two RRCAs
     looking at carry. [verified, `Code.md:$0DA5-$0DAE`]
   - byte 2: LSB of `T1600` base address.
5. Compute an offset `o` into `T1600` based on the calc-mode flag:
   - `0x04` (Y): `o = ((y >> 1) & 0x03) + base`
   - `0x01` (XY): `o = (x & 0x04) + ((y >> 1) & 0x03) + base`
   - `0x02` (X): `o = ((x >> 1) & 0x03) + base`

   [verified, `Code.md:$0DAF-$0DD1`]
6. `controlB := T1600[o]`. [verified, `Code.md:$0DD2-$0DD7`]

### 4.2 The animation table `T16A0`

Entries are 3 bytes each, indexed by path-list value (the same byte
that drives motion in §3). Examples:

| Path val | T16A0 entry | Meaning                                   |
|---------|-------------|-------------------------------------------|
| 0x01    | 01 02 08    | 2×1, X-keyed, base T1608                  |
| 0x02    | 01 02 08    | 2×1, X-keyed, base T1608 (same as 1)      |
| 0x05    | 03 04 14    | 1×2, Y-keyed, base T1614                  |
| 0x07    | 04 01 88    | 2×2, XY-keyed, base T1688                 |
| 0x0B    | 03 04 70    | 1×2, Y-keyed, base T1670                  |
| 0x10-17 | 01 02 30..4C| 2×1, X-keyed (8 bases — left/right walk)  |
| 0x18-1F | 04 04 50..6C| 2×2, Y-keyed (8 bases — diagonal swoops)  |

[verified, `Code.md:$16A0-$16FF`]

So the **draw mode itself** changes per path entry: while drifting
(`T1000` indices 1, 2) the alien is 2×1 horizontal (16×8); while
diving diagonally (indices 0x18-0x1F) it switches to 2×2 (16×16).

### 4.3 The shape table `T1600`

`T1600` is a flat array of LSBs into `T1420` (the alien-shape table
documented in `research_rendering.md` §2.4). Example for the default
drift path (which uses `T1608` base):

```
T1608: 20 22 24 26
T160C: 28 2A 2C 2E
T1610: 30 32 34 36
```

For path index `0x01`/`0x02` (right/left), `controlB` cycles through
`{0x20, 0x22, 0x24, 0x26}` based on `(x >> 1) & 3` — wing flap
animation locked to position, not time. [verified, `Code.md:$1608-$1617`]

`T1420 + 0x20` = alien shape #1 (`60 61` — top half of the bird-like
sprite); `T1420 + 0x22` = shape #2 (`62 63`); etc. So the 4 frames
form a flap cycle.

### 4.4 Net effect

- Motion = path bytecode → (dx, dy) → integrate position.
- Animation = same path bytecode → mode + base → look up `T1600` →
  `controlB` → render via `Bit3Controller` next time it fires.
- Both are deterministic functions of `(path index, x, y)`. No
  per-alien animation phase counter.
- The "wing flap" emerges naturally because the alien moves through
  several x-positions per path-index, and `T1600` is keyed on
  `(x >> 1) & 3`, so the sprite cycles 4 frames per path index.

### 4.5 JS port: snap-draw required for variant modes

`AlienAnimationUpdate` writes a variant tile that has its sprite content
**pre-shifted** by a sub-pixel amount. To reconstruct the correct visual
position, the canvas port must draw at the **tile-snapped** position
`(x & ~7, y & ~7)`, not at exact `(x, y)`. Drawing at exact position
double-counts the sub-pixel offset and produces ~4 px jitter on X drift.

This is the **snap-draw rule**: variant content provides the sub-pixel
offset; the snap position provides the coarse 8-px step; together they
match the source's visible position.

The same rule applies to the player ship (T1600 cycling in
`playerUpdate` + draw at `(X & ~7, Y)` in `render.drawPlayer`).

See `research_rendering.md` §9.3 for the full analysis.

## 5. Stage-init recap (where the data comes from)

The `state-2` init at `L0515` (already implemented in step 5) wires
all of the above. Quick reference, by data table:

| Source addr | Init routine            | Per-alien field set      | Stage 1 value |
|-------------|-------------------------|--------------------------|---------------|
| `T1500`     | `InitAlienControlStates $05EC` | `controlA`, `controlB` | `(0x09, 0x60)` |
| `T1520`     | `L0650`                 | path-pointer (MSB, LSB)  | `(0x10, 0x00)` → T1000 |
| `T1540+`    | `InitAlienPositions $0610` (via `T063A`) | `(x, y)` | per-formation table |

[verified, `Code.md:$05EC-$066F`, `$1500-$153F`]

Plus the global path-reset seed:

| Source addr | Init routine | Field         | Stage 1 value |
|-------------|--------------|---------------|---------------|
| `T1520[0]`  | `L0506`      | `($4394)` MSB | `0x10`        |
| (cleared)   | `L0506`      | `($4395)` LSB | `0x00`        |

[verified, `Code.md:$0506-$0513`]

So at the moment the stage 1 combat handler `L2000` first runs:

- All 16 aliens have `controlA = 0x09` (Draw 2×1 + bit 3 set), so
  Bit3Controller will paint them.
- All 16 aliens have `controlB = 0x60`, so the initial sprite is
  `T1420[0x60-0x20]` = `T1420[0x40]` = shape #7 single tile (`6A 00`).
  The 2×1 layout means the right cell paints blank — visible as a
  one-tile alien.
- All path pointers point at `T1000+0` (value `0x01` — drift right).
- The first `AlienMovementUpdate` (~4 frames in) starts moving them
  right at +1 px/frame; the first `AlienAnimationUpdate` (~4 frames
  in) overwrites `controlB` with `T1608[0]` = `0x20` = shape #1
  (proper alien sprite, not the placeholder). After that, the wing
  flap cycles through shapes #1-#4 as `x` advances.

## 6. Attack swoops — `AlienBehaviorUpdate $3000`

This is the **path-switching** scheduler: every 4 frames (lane 0 of
§1) it advances `Counter93 ($4393)` and dispatches one of 8 sub-states
based on `Counter93 & 7`.

```
T3018 (jump table, 8 × 2 bytes):
    0 → L3264  commit swoop + $4395 increment (see §6.2)
    1 → L3028  "Angry pattern A/B" — bumps formation downward
    2 → L30BA  decrement attack cooldown timers
    3 → L3124  calculate swoop count → $4353 (gates on $4350==1)
    4 → L315A  pick which alien → $4354 (gates on $4350==2)
    5 → L31B4  pick closed-loop pattern → $4351/$4352 (gates on $4350==3)
    6 → L322C  scan-and-advance pipeline (gates on $4350==4)
    7 → L3012  RET — do nothing
```

[verified, `Code.md:$3000-$3026`, `$3124-$32AF`]

### 6.0 Cadence and mental model

`alienBehaviorUpdate` is called once per 4 frames (lane 0 of §1), so:

- **`Counter93` increments at 15 Hz** (60 / 4).
- **Each sub-state handler fires at 15 / 8 ≈ 1.875 Hz** (~0.53 sec
  apart), since dispatch is `Counter93 & 7`.
- **`AlienMovementUpdate` / `AlienAnimationUpdate` fire at 15 Hz** in
  the source (lanes 1 and 2 — see §1) / 15 Hz merged on lane 1 in the
  port (§9.2). So between any two commits, the body executes **8
  motion steps** before the AI gets another say.

The 8:1 ratio is the key timing insight: AI decides slowly, body
executes fast.

```
counter93:   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 ...
fires:       co an cd sc pa pp sa --  co an cd sc pa pp sa -- ...
                                   ^ wraps every 8 ticks (4.3 sec)
```

**Two distinct flows through the state machine:**

Normal swoop (more common, gated through cases 2-5-0):
```
state: 0 ──cd──> 1 ──sc──> 2 ──pa──> 3 ──pp──> 5 ──commit──> 0
       (case 2)  (case 3)  (case 4)  (case 5)   (case 0)
```

Angry wave (rare, max 3 per round, gated through cases 1-6-0):
```
state: 0 ──angry timer──> 4 ──scan──> 6 ──commit──> 0
            (case 1)        (case 6)   (case 0)
```

The two paths never interleave: case-1 only fires when state < 4, and
once state = 4 the normal pipeline cases (3-5) all early-return on
their `state == N` guards. The cooldown handler (case-2) also
early-returns when state ≠ 0, so the cooldown timer pauses while a
swoop is in flight.

**Initial `Counter93` value is irrelevant.** The dispatch is a strict
mod-8 round-robin, so any starting value converges to identical
behavior within 8 ticks (≈ 32 frames). The port resets it to 0 at
`state2_StageInit` (mirrors source's `L32B0` clearing `$4350-$437F`),
but any value would work.

**Diagnostic: comment out the `this.alienBehaviorUpdate()` call** in
`stageAlienCombat` and aliens drift left-right forever in formation,
following `MOTION_PATH_BASE = [1,1,1,1, 2,2,2,2,2,2,2,2, 1,1,1,1, 0]`
(net X displacement per loop = 0). `alienPathSeedLo` stays at 0, so
end-of-list reset always lands at `0x1000` — same loop, every cycle.
Useful "safe mode" when debugging issues that are downstream of
swoops.

### 6.1 Secondary gate — `$4350` (AlienBehaviorState)

Each sub-state handler checks `$4350 == expected` before executing.
This is what makes the round-robin counter93 dispatch into a strict
sequencer: a handler fires every 0.53 sec but only does work when
its expected state value is present. The full table:

| `counter93 & 7` | Handler | Guard | Transition on success |
|---|---|---|---|
| 0 | `behaviorCommit` (`$3264`) | `≥ 5` | writes alien ptrs; state = 0 |
| 1 | `behaviorAngryPattern` (`$3028`) | `< 4` and `$4357 < 3` | (timer expired) state = 4, count = 16, target = `$50` |
| 2 | `behaviorCooldown` (`$30BA`) | `== 0` | (cooldown expired) state = 1 |
| 3 | `behaviorSwoopCount` (`$3124`) | `== 1` | state = 2 |
| 4 | `behaviorPickAlien` (`$315A`) | `== 2` | state = 3 |
| 5 | `behaviorPickPattern` (`$31B4`) | `== 3` | state = 5 (skips 4 — that slot is the angry path) |
| 6 | `behaviorScanAdvance` (`$322C`) | `== 4` | (all aliens aligned) state = 6 |
| 7 | `$3012` (RET) | — | — |

So `$4350` has three roles:

1. **Sequencer** — enforces strict order through the decision pipeline.
2. **Mutual exclusion** — at most one handler does work per counter93
   tick; the rest early-return.
3. **Mode selector** — value 4 routes through the angry path
   (case-6); values 1-3 / 5 route through the normal path (cases 3-5,
   0). The two paths never interleave.

[verified, `Code.md:$3124-$32AF`]

### 6.2 How the commit works (sub-state 0, `$3264`)

Sub-state 0 does two things every time it runs:

1. **Advance `$4395`** (= `alienPathSeedLo`): read, increment, wrap to
   0-15, write back. Saves the OLD value to `$4356` (= `alienSwoopLsb`)
   first, for use as the current-cycle LSB match key.
2. **Commit the swoop** (only when `$4350 >= 5`): walk `$4353`
   (= `alienSwoopCount`) aliens starting from `$4354`
   (= `alienSwoopTarget`, the move-ptr-table byte offset $50+i*2);
   for each alien whose path-pointer matches `($4394, $4356)`,
   overwrite the pointer with `($4351, $4352)` (the pre-chosen swoop
   pattern address). Then reset `$4350 = 0`.

The "walk count aliens from target" semantics is what makes one-by-one
normal swoops (count = 1) and angry mass swoops (count = 16) share the
same commit code path. For normal swoops the target is the picked
alien's index; for angry, target = `$50` (= start at alien 0) with
count = 16 walking the whole formation.

**Match key now source-faithful (post lane-swap).** Both
`behaviorScanAdvance` (case-6) and `behaviorCommit` (case-0) match
against `$4356` (`alienSwoopLsb` — saved by the most recent commit),
exactly as source does. An earlier port version used `alienPathSeedLo`
(current seed) instead, as a workaround for a timing mismatch in our
old lane order. The lane swap (§1.0) put movement before behavior in
each cycle, which moved alien ptr advancement one frame earlier and
restored the source's expected phase relationship — aliens now land
at `LSB == alienSwoopLsb` after end-of-list reset, matching source.

**Port-specific simplifications in commit:**
- `alienSwoopTarget` is stored as the raw alien index (0-15) when set
  by `behaviorPickAlien`, or as the source-format sentinel `$50` when
  set by `behaviorAngryPattern`. Commit normalizes via a magnitude
  check: `>= $50 → (target - $50) >> 1`, else `target`.
- Loop uses `(startIdx + n) & 0x0F` for wrap-around instead of source's
  two-counter (B for "slots before wrap", C for "remaining count").
  Functionally equivalent for `count ≤ 16`.
- An extra `if (!(a.controlA & 0x08)) continue;` skip on dead aliens.
  Source has no such check — a dead alien's ptr wouldn't normally
  match anyway, so this is defensive overhead, intentionally left in.

[verified, `Code.md:$3264-$32AF`]

### 6.3 How the alien returns to formation

`$4394` is **never changed by `L3000`** — it stays `0x10` (T1000 page)
throughout. Only `$4395` is mutated (cycling 0–15).

When a swooping alien's pattern hits `0x00`, `L0DDE` reads `($4394,
$4395)` — which still points into **T1000** (the formation drift list)
— and resets that alien's individual path pointer there. The alien
automatically rejoins formation drift with no extra bookkeeping.

The swoop patterns (T1020–T13D0) are one-shot circuits: they end with
`0x00` and do **not** self-loop in their data. The name "closed-loop"
refers to the visual trajectory (the path curves back toward the
formation area), not the data encoding.

[verified, `Code.md:$0DDE`, `$3264-$326E`, `$1060` (T1020 terminator = 0x00)]

### 6.4 Pattern selection (sub-state 5, `$31B4`)

`behaviorPickPattern` is the most elaborate handler — it routes
three input signals through three layered tables to pick one of 36
swoop patterns. Three inputs:

1. **Absolute X distance** `|alienX - playerX|` → bin into 8 buckets
   of 32 px each (source: RLCA × 3 then AND $07, equivalent to
   `(diff >> 5) & 7`).
2. **L/R relationship** — adds 4 to the column offset when alien is
   LEFT of player (= `playerX >= alienX`). Keeps swoop patterns
   curving *toward* the player from either side.
3. **Y-band or phase count** — `L3210` dispatches:
   - if `alienSwoopCount == 1` (typical normal swoop): use alien's
     Y-band (0/1/2/3 at thresholds $58/$78/$98)
   - else (multi-alien swoop / angry wave): use `alienPhaseCount`
     (the angry wave count, 0-2)

Three-stage table lookup:

| Stage | Table  | Source addr | Length | Content |
|-------|--------|-------------|--------|---------|
| 1 | T3300  | `$3300`     | 8 bytes  | bucket (0-7) → column index (0-3) |
| 2 | T3310  | `$3310`     | 32 bytes | (col*4 + lr*16 + row) → T3330 byte offset (LSB) |
| 3 | T3330+ | `$3330`     | 208 bytes | byte offset → (MSB, LSB) of pattern address |

The L/R asymmetry is encoded in T3310's structure: the lower 16
bytes (`$3310-$331F`) are used when alien is RIGHT of player; the
upper 16 (`$3320-$332F`) when alien is LEFT. The source addressing
uses `LD H,$33 / LD L,A` with `A = (T3300[bucket] + lr_offset) * 4
+ rowOrPhase + $10`, so `lr_offset = 4 → A += 16 → upper half`.

T3330 is structurally a wide table of 4-byte rows (4 candidate
patterns × 2 bytes each). The random pick within a row is
`GetRandomNumber & 0x06` (= 0, 2, 4, or 6) — added to the T3310 LSB
to select one of 4 candidate (MSB, LSB) pairs. T3310 values span
`$30-$F8`; with random max `$06` the addressed range covers
`$3330-$33FE`, hence the 208-byte extraction.

**Port status:** source-faithful as of step 8. Earlier (pre-fix) port
had four deviations: 16-px X bins instead of 32, no L/R offset, Y
row via `y >> 6` unconditionally (no phase-count branch), and
modulo wraparound on a too-small table. All four fixed by reading
the full source algorithm and extending the data extraction
(`PATTERN_ROW_TABLE` 16 → 32 bytes, `PATTERN_ADDR_TABLE` 36 → 208
bytes). See in-code commentary at `states.js:behaviorPickPattern`.

[verified, `Code.md:$31B4-$320D` and `L3210` at `$3210-$3228`]

### 6.5 Swoop count (sub-state 3, `$3124`)

Source algorithm:

```
cap = (LevelAndRound RRCA RRCA) & 0x0F     ; (level<<2 | round)
cap = min(cap + 5, 0x11)                    ; ceiling
cap -= alienPhaseCount                      ; angry waves shrink cap
roll = GetRandomNumber + 1                  ; uniform 1..16
count = (roll < cap) ? roll : 1             ; usually 1, max ~5
$4353 = count
```

The skewing in the last line is what makes "send one alien at a time"
the typical outcome: random rolls 1-16 mostly overshoot the cap
(which sits at ~5 in normal stages) and fall through to count = 1.
Cap grows with level/round; angry-wave count shrinks it.

**Port deviation:** `behaviorSwoopCount` uses a simpler formula:
`cap = min(5, 1 + (LevelAndRound >> 1))` and ignores `alienPhaseCount`.
Stage 1 always produces count = 1; late-stage multi-alien swoops are
weaker than source. Acceptable at the current port stage; revisit when
porting later levels. See in-code note at `states.js:behaviorSwoopCount`
and progress.md "Known deferred issues".

[verified, `Code.md:$3124-$314E`]

### 6.6 Angry pattern (sub-state 1, `$3028`)

Two-level timer that drives mass-formation swoops. Up to 3 angry
waves per round (`alienPhaseCount` capped at 3); each wave sends
the entire formation simultaneously on pattern T2E00 or T2E40
(picked by player X bit 0).

Pseudocode:

```
if alienPhaseCount >= 3 or alienBehaviorState >= 4: return
if alienPhaseTimer == 0:
    alienPhaseTimer = (alienPhaseCount << 2) + computeLevelFactor + 7
    return
alienPhaseTimer--
if alienPhaseTimer != 0: return

; trigger angry wave
alienPhaseCount++
alienBehaviorState = 4
alienSwoopCount = 16
alienSwoopTarget = 0x50           ; sentinel = start at alien 0
alienSwoopPatternHi = 0x2E
alienSwoopPatternLo = (playerX & 1) ? 0x00 : 0x40
```

`computeLevelFactor` (source `L3074`): four-step level-derived value
typically in [24, 31] for stage 1. The phase timer thus seeds to
~30 on first wave, decrements once per case-1 fire (every 32 frames
≈ 0.53 sec), giving a 16-20 second wait between angry waves.

Once state = 4 is set, `behaviorScanAdvance` (case-6) becomes
active. Scan waits until all alive aliens are at ptr = (`$10`,
match-LSB), then sets state = 6 → next commit overwrites those
aliens with the angry pattern address.

**Port status: currently disabled.** `behaviorAngryPattern` early-
returns at the top. With the function enabled, aliens commit to
T2E00/T2E40 but get stuck mid-path on a dx=4 motion byte at
`0x2F36` because the swoop expects `x%8 ∈ {0, 4}` but the formation
drifts them to other phases. Root cause likely in the
ptr-advance condition vs. how the source paths assume alignment.
See `progress.md` "Known deferred issues" for details.

[verified, `Code.md:$3028-$3059`, `$305C-$306D`, `$3074-$30A8`]

### 6.7 Cooldown (sub-state 2, `$30BA`)

Source `L30BA` processes a cluster of cooldown timers at
`$4359/$435A/$435B` (separate from the angry-pattern `$4358` timer).
When one expires, the normal-swoop pipeline kicks off by setting
`alienBehaviorState = 1`. Source `L30E4` seeds the timer based on
Counter9A high byte + a level factor — adaptive pacing tied to game
progress.

**Port status: stubbed.** `behaviorCooldown` uses a single
`alienCooldown` counter decremented to zero (initial value 6 in
`state2_StageInit` and on every reset). Each case-2 fire decrements
once. Cooldown of 6 × case-2 cadence (0.53 sec) ≈ 3.2 sec between
swoops. Trivial to tune by changing the reset value. Source's level-
based seeding deferred.

[verified, `Code.md:$30BA-$30DA`, `$30E4` partial trace]

### 6.8 Scan-and-advance (sub-state 6, `$322C`)

Gate for the angry-wave commit. Only runs when `alienBehaviorState == 4`
(set by angry pattern in case-1). Walks all 16 aliens and checks that
every alive alien's path pointer matches `(alienPathSeedHi,
alienSwoopLsb)`. If all match → set state = 6, letting the next
case-0 commit fire. If any mismatch → return without state change
(pipeline stalls until next cycle).

Source-faithful in the current port: matches against
`$4356` (`alienSwoopLsb`) — the same value the next commit will use.
This is correct because the lane swap (§1.0) puts alien ptr
advancement one frame ahead of behavior, so by the time scan fires
the aliens have settled at the LSB matching what commit saved last
cycle.

[verified, `Code.md:$322C-$325E`]

### 6.9 Port investigation summary (alienBehaviorUpdate)

Sub-state-by-sub-state status of the port vs. source as of the
lane-swap fix:

| Sub-state | Handler | Port status |
|-----------|---------|-------------|
| 0 commit  | `behaviorCommit`       | source-faithful; small port-side simplifications (alien-index target format, single-counter wrap, defensive dead-alien skip) — see §6.2 |
| 1 angry   | `behaviorAngryPattern` | **disabled** — not yet re-tested after lane swap; may now work (alignment fix should apply equally), worth a verification pass — see progress.md |
| 2 cooldown| `behaviorCooldown`     | stubbed (single counter vs source's 3-timer cluster + level seeding) |
| 3 count   | `behaviorSwoopCount`   | simplified cap formula (acceptable for now) |
| 4 pick    | `behaviorPickAlien`    | source-faithful (post lane swap — the ptr-LSB-match gate now works) |
| 5 pattern | `behaviorPickPattern`  | source-faithful: full L31B4 algorithm (T3300/T3310/T3330 lookup with L/R asymmetry + Y-band-or-phase-count) |
| 6 scan    | `behaviorScanAdvance`  | source-faithful (post lane swap — matches against `alienSwoopLsb`) |
| 7 RET     | (no-op)                | n/a |

Key port deviation that makes all of this work: **the lane swap in
`stageAlienCombat`** (§1.0). Source has behavior on lane-0 / movement
on lane-1; we run movement on lane-0 / behavior on lane-1. This puts
movement one frame BEFORE behavior in each 4-frame cycle, so when
`behaviorCommit` reads the alien's position, the alien has just
crossed a grid boundary (alien.x%8 == 0) — exactly the alignment that
dx=±4 swoop pattern bytes need to advance their ptr.

**Data tables involved:** `PATTERN_COL_TABLE` (T3300, 8 bytes),
`PATTERN_ROW_TABLE` (T3310, 32 bytes), `PATTERN_ADDR_TABLE` (T3330,
208 bytes), `PATH_ROM_LOW` + `PATH_ROM_HIGH` (1024 bytes each, with
per-pattern boundary comments mirroring `code.md`), `PATTERNS`
(label → address dict). All four enlarged from the step-6-era
extraction to cover the full T3310 + T3330 span source-faithfully.

**Known deferred issues** (also in `progress.md`):
1. **Angry pattern** still `return`s at the top. The lane-swap fix
   likely covers it (the dx=4 stuck root cause was the same alignment
   issue normal swoops had), but it hasn't been re-tested after the
   swap landed. Worth removing the early-return and observing.
2. **`behaviorCooldown` is a single-counter stub.** Source's L30BA
   handles three timers ($4359/$435A/$435B) and L30E4 seeds the
   primary cooldown from `Counter9A` high byte + level factor. Port
   when bird stages land (step 9).
3. **`behaviorSwoopCount` simplified cap.** Stage 1 always produces
   count = 1; later stages get weaker multi-alien swoops than arcade.
   Acceptable at current port stage; revisit when porting later
   levels.
4. **`alienVsPlayerCollision` disabled** because state-4
   (player-explosion) is a stub without lives counter / explosion
   sprite / game-over. Re-enable when step 9 completes those.

## 7. Enemy fire — `L2560` (out of scope for step 6)

`L2560` is the bullet-spawn picker, called from lane 0/2. It scans the
alien array, looking for entries whose `(controlA & 0x08)` is set (=
active) and whose Y coordinate is in a firing band, and arms an entry
in the enemy-bullet list at `$43CC-$43DF`. [verified,
`Code.md:$2596-$25C0` partial trace]

Enemy bullets themselves are advanced by `EnemyBulletUpdate $0C40`
(lanes 1/3). Both are deferred — step 6 leaves the enemy-bullet array
empty and `L2560` un-ported.

## 8. Stage clear — `L21BA`

When `AliensLeft == 0` the per-frame dispatch lands in `L21BA`
instead of the lane router [verified, `Code.md:$2015`, `$21BA`].

`L21BA` then:

1. Decrements `($43B6)` (the last byte of the per-stage block —
   research_stage_structure.md §4.1 — which is `$FF` at stage init,
   so this gives a 96-frame ish post-clear delay).
2. When it drops below `$A0`, advances state:
   - `GameState := 2` (force re-init)
   - `ShieldCount := 0`
   - `LevelAndRound++`
   - Look up new wave size from `T1760[(LevelAndRound >> 1) & 7]`:
     - 0x10 → 16 aliens (writes `AliensLeft`)
     - 0x88 → high bit set → 8 birds (writes `BirdsLeft` instead)
3. Special-case for stage `B`: if `(LevelAndRound & 0x0F) >= 0x0B`,
   skip the level-advance and instead set `AliensLeft = 0x10` and
   re-run `L0526` to re-init alien data — this is the "second mother-
   ship pass" wrap.

[verified, `Code.md:$21BA-$21D7`, `$2204-$222B`, `$1760-$1767`]

For step 6 the only relevant bit is the first: if all aliens die,
`L21BA` runs and step 5's existing `state2` re-init handles the
subsequent stage. We don't need to port `L21BA` for the motion step —
the stage will simply continue forever (no kill mechanic yet).

## 9. Implementation impact for step 6

### 9.1 What to port

- **Mirror the 4-frame round-robin** with a `state.combatLane` counter
  (`(state.combatLane++ & 3)`) — keeps the visual cadence of the
  original. Don't run motion every frame; it would look (and play)
  faster than the arcade.
- **`AlienMovementUpdate` (§3)**: walk 16 aliens, apply `T1700[index]`
  delta to `(x, y)`, advance path pointer when `(coord & 7) == 0`.
- **Path reset (§3.4)**: when the path byte is `0`, reset the per-alien
  pointer to `(state.alienPathSeedHi, state.alienPathSeedLo)` —
  initially `(0x10, 0x00)`.
- **`AlienAnimationUpdate` (§4)**: walk 16 aliens, look up `T16A0`
  entry by current path byte, compute offset into `T1600`, write
  `controlB`. Update `controlA`'s low 3 bits (changes draw mode!).
- **Replace `stageAlienCombat` stub** in `states.js` to call
  motion+animation on the appropriate lanes, then leave
  `player.alive = true` in place.

### 9.2 What to defer

- `AlienBehaviorUpdate $3000` — no swoops. Stage 1 will show formation
  drift only. (Defer to a later step bundled with player firing.)
- `EnemyBulletUpdate $0C40`, `L2560` — no enemy fire.
- `L0F00` (alien-vs-player collision), `L0FC0` (kill animations),
  `L24A0`/`L24C4` — no kill mechanic; aliens are immortal until step 7+.
- `L21BA` (stage clear) — irrelevant until aliens can die.

### 9.3 Data tables to extract

`build_data.py` already exports `ALIEN_CONTROL_INIT (T1500)`,
`ALIEN_MOVE_PTR_INIT (T1520)`, `ALIEN_FORMATIONS (T1540+)`,
`ALIEN_SHAPE_TABLE (T1420)`. Step 6 needs three more raw slices:

| Symbol             | Source addr | Length | Use                          |
|--------------------|-------------|--------|------------------------------|
| `MOTION_DIRECTIONS`| `$1700`     | 64     | (dx, dy) deltas (T1700)      |
| `ANIMATION_TABLE`  | `$16A0`     | 96     | 3-byte mode/calc/base entries |
| `SHAPE_LSB_TABLE`  | `$1600`     | 256    | T1600 LSB-into-T1420 lookup  |
| `MOTION_PATH_BASE` | `$1000`     | 17     | T1000 only (drift list); swoop patterns deferred |

All four are pure ROM data with no decode step — same `RAW_SLICES`
shape as the existing exports.

**Additional tables landed for step 8 (swoops):**

| Symbol              | Source addr | Length | Use                                                         |
|---------------------|-------------|--------|-------------------------------------------------------------|
| `PATH_ROM_LOW`      | `$1000`     | 1024   | T1000 drift + T1020-T13D0 (18 patterns)                     |
| `PATH_ROM_HIGH`     | `$2C00`     | 1024   | T2C00-T2FA0 (18 more patterns)                              |
| `PATTERN_COL_TABLE` | `$3300`     | 8      | T3300: alien-X distance → column index                      |
| `PATTERN_ROW_TABLE` | `$3310`     | 32     | T3310: (col*4 + row) → T3330 byte offset (L/R asymmetric)   |
| `PATTERN_ADDR_TABLE`| `$3330`     | 208    | T3330: 104 (MSB, LSB) pattern address pairs, byte-addressed |
| `PATTERNS` (export) | —           | —      | Label → ROM address map for the 37 named patterns           |

### 9.4 New `state.js` fields

- `state.combatLane` (uint8, 0-3) — the `$435F & 3` mirror.
- `state.alienPathSeedHi` (uint8) — `$4394` mirror; init `0x10`.
- `state.alienPathSeedLo` (uint8) — `$4395` mirror; init `0x00`.
- `state.alienPathPtr[16]` (uint16 LE, already exists as
  `alienMovePtr`) — already initialized in step 5.
- `state.aliens[i].pathOffset` *or* keep using a single 16-bit pointer
  — TBD during impl. The source uses an absolute ROM address; the JS
  port can use either an absolute or an offset into the
  `MOTION_PATH_BASE` slice. Offset is cleaner.

## 10. Open questions

- **`L2560` firing geometry** — when does a row 1 alien fire vs.
  a row 4 alien? `D` is computed from `LevelAndRound` (gates fire-rate
  by stage progress) but the row-selection logic is partial-traced
  only.
- **`L3000` $4394/$4395 manipulation** — ✅ resolved (§6.3). `$4394`
  is never changed by L3000. `$4395` cycles 0–15 in sub-state 0.
  L3000 writes only per-alien path pointers (`$4B50+`), not the global
  seed. Returning aliens reset to T1000 via L0DDE automatically.
- **Path pattern semantics for `T1020`-`T13D0`** — ✅ resolved (§6.3).
  Patterns terminate with `0x00`; do not self-loop. L0DDE resets the
  alien to `($4394, $4395)` = T1000 (formation drift). "Closed-loop"
  refers to the visual trajectory, not the data encoding.
