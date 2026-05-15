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

## 6. Attack swoops — `AlienBehaviorUpdate $3000` overview

This is the **path-switching** scheduler: every 4 frames (lane 0 of
§1) it advances `Counter93 ($4393)` and dispatches one of 8 sub-states
based on the low 3 bits.

```
T3018 (jump table, 8 × 2 bytes):
    0 → L3264 (counter init / bookkeeping)
    1 → L3028 ("Angry pattern A/B" — bumps formation downward)
    2 → L30BA (decrement attack cooldown timers)
    3 → L3124 (decide how many aliens swoop together this round)
    4 → L315A (pick which aliens — uses GetRandomNumber)
    5 → L31B4 (pick which closed-loop pattern T1020-T13D0)
    6 → L322C (commit the swoop — overwrite per-alien path ptr)
    7 → L3012 (ret — do nothing)
```

[verified, `Code.md:$3000-$3026`]

Net effect: every 8 × 4 = 32 frames (~0.5 s), the scheduler decides
whether to start a new swoop, picks 1-N aliens at random, picks one of
18 closed-loop patterns, and overwrites their path pointers to point
into the chosen pattern.

The chosen aliens then follow the swoop pattern via the same
`AlienMovementUpdate` machinery in §3 — no separate "swoop motion"
code path. When the swoop pattern hits its end-marker, `L0DDE` resets
to `($4394, $4395)`. **`L3000` rewrites `$4394`/`$4395` during the
swoop window** so the aliens that finish the swoop go back to `T1000`,
not into another swoop loop. [inferred from `Code.md:$3196`,
`$323C`-`$3286`; not yet exhaustively traced]

**For step 6 we will not implement `L3000`.** This means stage 1
combat will show formation drift only — no swoops. Swoops land in a
later step (likely combined with player firing / collision so the
gameplay loop is testable end-to-end).

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
- **`L3000` $4394/$4395 manipulation** — the swoop scheduler clearly
  reads/writes these, but which sub-state does the rewrite and which
  restores it isn't fully traced. Not a blocker for step 6, but
  needs answering before swoops can be ported.
- **Path pattern semantics for `T1020`-`T13D0`** — the comments call
  them "closed-loop" patterns and they each contain ~30-100 bytes of
  T1700 indices. Whether they self-loop or rely on the L0DDE reset to
  the formation list is not yet confirmed by trace; a likely picture
  is that swoops temporarily reseed `($4394, $4395)` with the swoop
  pattern's address and then restore on swoop end.
