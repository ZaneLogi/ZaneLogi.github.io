# Phoenix Mothership Stage — Fade-In, Combat, Shield Blocks, Destruction

> **Status note (2026-05-18):** This doc was written at the START of
> step 12 to plan the work. Sections §1-§9 are research-time notes —
> kept as-is (still accurate as source citations). Sections §10
> (Open questions) and §11 (Sub-step plan) have been updated
> post-step-12 to reflect what was resolved, what deviated from the
> plan, and what was deferred. Live "what's missing" doc:
> `progress.md` § "What's missing (post-step-12)".

Source-of-truth: a local clone of the computerarcheology.com Phoenix
project (8085 disassembly produced from the original ROM).

- **Disassembly** — `Code.md` (labels like `L22B4`, `T1B40`).
- **RAM map** — `RAMUse.md` (every `$43xx` / `$4Bxx` label resolves
  there).

These files live in the local ComputerArcheology Phoenix clone — see
`../CLAUDE.md` for the per-PC path.

Every claim is tagged **[verified]** with an address citation,
**[inferred]** when reasoning beyond what the listing makes explicit,
or **[uncertain]** when the source itself is ambiguous.

This doc covers JT4 stages **8 / 9 / A / B** (mothership intro,
fade-in, combat) plus GameStates **6** (`$2400` particle explosion) and
**7** (`$244C` score display) — i.e. the final third of the 5-stage
round cycle. The bird and alien stages are documented separately in
`research_bird_stage.md` and `research_enemy_motion.md`.

For top-level context — JT1 / JT4 / round structure — read
`research_stage_structure.md §3` first. For the bonus-explosion
machinery this stage reuses, see `research_enemy_motion.md §1.0.6`.

---

## 1. The mothership round in one diagram

```
   JT4 stage   $43B8  Handler        What runs
   ─────────   ─────  ────────       ─────────────────────────────
   8           $...8  $2230          spiral-fill wipe, exit to T1C00
                                     starfield (NOT black like 4/6)
   ↓
   9           $...9  $22B4          mothership lone fade-in
                                     (stars scroll, CounterB4 70→28)
   ↓
   A           $...A  $22CA          mothership + aliens fade-in
                                     (CounterB4 28→C0, falls into $0834)
   ↓
   B           $...B  $2000 + $24A0  full combat: aliens swoop + fire,
                                     shield-block barrier above
                                     mothership is destructible,
                                     mothership fires back
   │
   ├── pilot hit → GameState 6 ($2400) → particle explosion → 7
   │                                                         │
   └── all aliens cleared without pilot hit → JT4 wrap ──────┴── round + 1

   GameState 7 ($244C) → mothership score display → round + 1, next round's stage 0
```

The mothership-pilot kill is the **only win condition** that triggers
the bonus particle-explosion + score display. If the player just
shoots all 16 aliens without ever cracking the conveyor belt, control
returns through `$21BA` → `$21D7` → re-init alien data with
`AliensLeft = 16` (no GameState 6), and the LR-wrap at end-of-cycle
advances the round. [verified `Code.md:$21BA-$21D7`]

---

## 2. JT4 stage 8 — spiral-fill exit to mothership starfield

Stages 4, 6, **8** all dispatch to `$2230` (same spiral-fill handler
the bird stages use). The per-stage difference is **only at the exit
branch** `$2292`:

```
2292: LD   HL,$43B8           ; LevelAndRound
2295: LD   A,(HL)
2296: AND  $08                 ; mask bit 3
2298: JP   Z,$22F0             ; stages 4/6 (bit 3 == 0): ClearBackground
229B: LD   HL,$1C00            ; stage 8 (bit 3 == 1): T1C00 starfield
229E: LD   DE,$4B3F            ; → end of BG screen memory
22A1: LD   B,$47
       (copies T1C00..T1C8D into $4AF8..$4B3F in reverse,
        i.e. the bottom 36 rows × 26 cols of BG plane)
22B0: JP   $22E0               ; CounterB9 := $71, scroll register := $71
```

[verified `Code.md:$2292-$22B3`]

So stage 8's spiral-fill exit:

- Leaves CounterB9 at `$71` (mid-scroll position) instead of `$00`
- Fills the BG plane with `T1C00` — a static mothership-era
  starfield, denser than the normal `T1F00` swimming starfield
- Then `$22E0` writes CounterB9 back to the `$5800` hardware scroll
  register, locking the starfield at scroll offset `$71`

Comparison to stages 4/6 (`$22F0` path): those wipe the BG plane to
zero (`ClearBackground`) and reset CounterB9 to `$00`, then `$22E2`
writes the scroll register. **Birds appear against solid black;
mothership appears against starfield.** [verified, see also
`research_bird_stage.md §7`]

The `$2230` spiral-fill machinery itself (counter logic, asterisk →
blank phase, `$2260` cell-write loop) is already documented in
`research_bird_stage.md §7` and ported as `stageSpiralFill` /
`spiralDrawCells` / `spiralFillExit`. Only `spiralFillExit` needs to
grow a stage-8 branch.

### 2.1 Port mapping

`spiralFillExit` currently always runs the `$22F0` ClearBackground
path (since stages 4/6 are the only ones reachable through it
pre-step-12). Step 12 adds the bit-3 split:

```js
spiralFillExit() {
    if ((state.levelAndRound & 0x08) === 0) {
        // existing $22F0 path — black BG, CounterB9 = 0
        clearBackground();
        state.counterB9 = 0;
    } else {
        // $229B path — copy T1C00 starfield to BG plane bottom 36 rows,
        // leave CounterB9 unchanged at $71 from last $22E0 write
        copyT1C00StarfieldToBG();
        state.counterB9 = 0x71;
    }
    state.levelAndRound += 1;
    state.gameState = 2;
}
```

`T1C00` is the second starfield (vs `T1F00` for normal stages). The
build pipeline (`tools/build_data.py`) already extracts both as
`STARFIELD_T1C00` / `STARFIELD_T1F00` — verify with `grep T1C00
data.js`. The port's 33-row BG buffer with `scrollPixel` (see
`research_rendering.md §4.2`) means the starfield write needs to land
in the buffer with the same offset the source uses; either by reusing
`addPlanetsToBackground`-style direct-row writes or by setting up
`counterB9` so the next `starsScrollDown` call paints T1C00 instead
of T1F00.

[inferred — exact port-side implementation TBD; verify `T1C00` content
against arcade footage at start of stage 8 spiral exit before
committing]

---

## 3. JT4 stage 9 — `$22B4` mothership lone fade-in

```
22B4: CALL StarsScrollDown    ; $067A — normal star-scroll tick
22B7: LD   HL,$43B4           ; CounterB4
22BA: DEC  (HL)
22BB: LD   A,(HL)
22BC: CP   $28
22BE: JP   NZ,$0848           ; if CounterB4 != $28 → normal stage-end check
22C1: LD   L,$67              ; once-only: when CounterB4 hits $28 exactly
22C3: LD   (HL),$FF           ; $4367 := $FF ("mothership partially faded in" flag)
22C5: RET
```

[verified `Code.md:$22B4-$22C5`]

So stage 9 is structurally identical to the alien stage 0/2 stars-fade
pattern (`L0834`), but with:

- **No alien fade-in.** The CALL chain at `$083F-$0845`
  (`GetAnimationChrs`, `L05FA InitAllAlienControlStates`,
  `AlienDataController`) is **not invoked**. Stage 9 just scrolls
  stars and decrements CounterB4.
- **Once-only flag write at CounterB4 == `$28`.** Sets `$4367 = $FF`
  to signal "mothership graphic should be drawn now."

`L0848` (the tail jumped to from `$22BE`) is shared with `L0834` — it
checks CounterB4 for 0, and if so bumps LevelAndRound and sets
GameState=2 (which will re-init for stage A). So the fade-in window
is governed by CounterB4 counting down from its initial value (set in
`state2_StageInit` per stage-block) to 0.

### 3.1 `$4367` "mothership partially faded in" flag

Set to `$FF` in:
- `$22C3` (stage 9: when CounterB4 hits `$28`)
- `$22D7` (stage A: when CounterB4 == `$C0` — i.e. immediately on
  stage A entry; see §4)

This is consumed elsewhere as a one-shot trigger to actually **draw
the mothership tile graphic** onto the BG plane. The disassembly
listing labels it but doesn't comment its consumer in `Code.md`.
**Action for step 12:** grep `L,$67` and `4367` in `Code.md` to locate
the draw site (likely a routine that draws the 20×9 mothership image
to `$4AC6` — the same coords `EraseMothership $246A` writes T1C00
stars to during destruction). Track down before implementing.

[uncertain — the draw site needs to be located; the flag's existence
is verified, its consumer is not yet]

### 3.2 Port mapping

```js
stageMothershipFadeIn() {                       // L22B4
    this.starsScrollDown();                     // $067A
    state.counterB4 = (state.counterB4 - 1) & 0xFF;
    if (state.counterB4 === 0x28) {
        // $4367 := $FF — trigger mothership graphic draw
        state.motherShipFadeFlag = 0xFF;
    }
    // L0848 tail: end-of-stage check
    if (state.counterB4 === 0) {
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
        state.gameState = 2;
    }
}
```

The CounterB4 initial value for stage 9 comes from the per-stage block
(`stageBlock[9]` already initialized in `state2_StageInit`). Confirm
the initial value gives ~enough frames at 60 Hz for the fade-in to
look like the arcade.

---

## 4. JT4 stage A — `$22CA` mothership + aliens fade-in

```
22CA: LD   HL,$43B4           ; CounterB4
22CD: LD   A,(HL)
22CE: CP   $C0
22D0: JP   NZ,$0834           ; if CounterB4 != $C0 → fall through to L0834
                              ; (= the alien stage 0/2 stars+fade handler)
22D3: LD   (HL),$30           ; once: reset CounterB4 to $30
22D5: LD   L,$67
22D7: LD   (HL),$FF           ; $4367 := $FF (mothership-redraw)
22D9: LD   L,$BC              ; $43BC
22DB: LD   (HL),$3F           ; $43BC := $3F
22DD: RET
```

[verified `Code.md:$22CA-$22DD`]

The interesting structural piece: **on every frame except the first**,
stage A falls through to `L0834` — the regular alien stars-scroll +
fade-in handler. So stage A piggy-backs on the existing fade-in code
path to materialize 16 aliens above the mothership.

On the **first frame** of stage A (`CounterB4 == $C0` — note this is
the initial value left over from stage 9's end, NOT $C0 freshly
written), control does the one-shot trio:

- `CounterB4 := $30` — restart the counter at a smaller value
  (~48 frames at 60 Hz = ~0.8s fade-in window for aliens, vs. stage
  9's longer one for the mothership alone)
- `$4367 := $FF` — re-trigger mothership-graphic draw (the spiral
  exit cleared the BG, so it needs to land again now that aliens are
  also fading in)
- `$43BC := $3F` — purpose unverified. Likely a per-stage palette /
  variant index used by the alien-draw or the mothership-draw. **Trace
  during impl.**

### 4.1 Implication: CounterB4 entry value for stage A

For the `CP $C0` to fire as the one-shot trigger, **CounterB4 must
equal `$C0` when stage A starts.** Two possibilities:

1. Stage 9's `L0848` tail decrements CounterB4 to 0 then advances to
   stage A via GameState=2 → `state2_StageInit` resets CounterB4 from
   the stage-A block to `$C0`. [most likely]
2. Stage A doesn't go through `state2_StageInit` and the CounterB4
   value from stage 9 carries over. [inconsistent with the rest of
   the JT4 dispatch model — every other stage advance goes through 2]

The stage-block table at `STAGE_BLOCKS` (or wherever the port
extracted T0598 to) must have `stageBlock[A][9] = $C0`. Verify by
grepping `data.js` for `STAGE_BLOCKS` and reading the 10th byte
(index 9) of the stage-A entry. [inferred, verify before impl]

### 4.2 Port mapping

```js
stageMothershipPlusAliensFadeIn() {                // L22CA
    if (state.counterB4 !== 0xC0) {
        // every other frame: piggy-back on alien stars+fade handler
        return this.stageAlienFadeIn();             // L0834
    }
    // first frame: one-shot setup
    state.counterB4 = 0x30;
    state.motherShipFadeFlag = 0xFF;                // $4367
    state.unknown43BC = 0x3F;                       // $43BC purpose TBD
}
```

Wire into `state3_Gameplay` as `case 0xA: this.stageMothershipPlusAliensFadeIn()`.

---

## 5. JT4 stage B — `$2000` combat with mothership extras

Stages 1, 3, **B** all dispatch to `$2000` (alien combat). The
mothership-specific work is **injected as one extra call** at `$2006`:

```
2000: CALL PlayerUpdate            ; $0876 — player ship, bullet, shield
2003: CALL $0DF0                   ; player-bullet → alien collision
2006: CALL $24A0                   ; ← MOTHERSHIP HOOK (no-op for stages < 8)
2009: LD   HL,$435F                ; ...normal alien-combat tail
```

The rest of `$2000` (lane round-robin, movement, animation, behavior,
fire-spawn, stage-clear) is unchanged. The 16 aliens above the
mothership swoop and shoot identically to a normal alien wave.

### 5.1 `$24A0` — the mothership hook

```
24A0: LD   A,($43B8)               ; LevelAndRound
24A3: AND  $0F                     ; mask game stage
24A5: CP   $08
24A7: RET  C                       ; return if stage < 8 (no-op for 1/3)
24A8: LD   DE,$43C4                ; PlayerBulletState
24AB: LD   HL,$43E6                ; AbovePlayerBulletMSB (= $43E6)
24AE: CALL $2351                   ; → shield-block collision (see §6)
24B1: LD   A,($439B)               ; Counter9A+1
24B4: AND  $03
24B6: CP   $03
24B8: RET  NZ                      ; return unless counter9A+1 low-2 == $03
24B9: JP   $24F2                   ; → mothership return fire (see §5.2)
```

[verified `Code.md:$24A0-$24B9`]

Two responsibilities:

- **Shield-block collision** (`$2351` — §6). Every frame on stages
  ≥ 8: check whether the player bullet is currently passing through
  the conveyor-belt barrier above the mothership. If so, damage the
  belt and (eventually) the mothership.
- **Mothership return fire** (`$24F2` — §5.2). On 1 frame in 4 (gated
  by `Counter9A+1 & 0x03 == 0x03`): roll a random number, possibly
  spawn an enemy bullet from the mothership position.

### 5.2 `$24F2` — mothership return fire

```
24F2: CALL GetRandomNumber        ; $30AA
24F5: ADD  $60
24F7: NOP
24F8: LD   B,A
24F9: LD   HL,$439B               ; Counter9A+1
24FC: AND  $0E
24FE: AND  (HL)
24FF: RET  NZ                     ; gate: random & $0E & Counter9A+1 must be 0
2500: LD   A,($439E)              ; M439E (mothership X bound L)
2503: CP   B
2504: RET  NC                     ; gate: random+$60 must be > M439E
2505: LD   A,($439F)              ; M439F (mothership X bound R)
2508: CP   B
2509: RET  C                      ; gate: random+$60 must be <= M439F
250A: LD   A,B
250B: SUB  $04
250D: LD   B,A                    ; B = X coord of bullet
250E: LD   A,($43B9)              ; CounterB9
2511: CPL
2512: INC  A                      ; A = -CounterB9
2513: AND  $F8
2515: ADD  $48                    ; A = Y coord (mothership Y minus scroll)
2517: LD   C,A
2518: PUSH HL
2519: PUSH HL
251A: JP   $25B7                  ; spawn enemy bullet
```

[verified `Code.md:$24F2-$251A`]

Reuses the alien-fire spawn tail (`$25B7` — already ported as part of
`enemyFireScanAndSpawn`). The X coord is `random + $60 - $04`, gated
to land within `[M439E, M439F]` (likely the mothership's left/right
bounds, set during fade-in). The Y coord is computed from CounterB9
(the scroll register), so the bullet emerges from below the mothership
tracking the current scroll position.

### 5.3 Port mapping

```js
stageMothershipCombat() {
    // shared alien-combat pre-amble
    this.playerUpdate();
    this.playerBulletCollision();       // L0DF0
    this.motherShipHook();              // L24A0

    // continue with normal alien combat tail (counter advance,
    // lane dispatch, movement/animation/behavior/fire)
    this.stageAlienCombat();            // shared with stages 1/3
}

motherShipHook() {                              // L24A0
    const stage = state.levelAndRound & 0x0F;
    if (stage < 8) return;
    this.shieldBlockCollision();        // L2351 (§6)
    if (((state.counter9aHi) & 0x03) === 0x03) {
        this.motherShipFire();          // L24F2
    }
}
```

Or — since `$2000` is reached by JT4 dispatch identically for stages
1, 3, B — the cleaner factoring is to leave `stageAlienCombat` alone
and have `state3_Gameplay`'s case B call `motherShipHook` between
`playerBulletCollision` and the lane dispatch. **Implementation
choice; either is faithful.**

---

## 6. Shield-block destructible barrier (`$2351` family)

The "shield blocks" are a row of destructible tiles directly above
the mothership. Source disassembly calls this the "purple conveyor
belt" in comments. The player must hit the belt repeatedly (each hit
swaps in a more-damaged tile) until enough holes open up to expose
the alien pilot at the mothership center, then one more bullet through
a hole hits the pilot → mothership explodes → bonus score.

### 6.1 `$2351` — shield-block collision detection

Called from `$24A0` with `DE = $43C4` (PlayerBulletState), `HL =
$43E6` (AbovePlayerBulletMSB).

```
2351: LD   A,(DE)                ; player bullet state
2352: AND  $08
2354: RET  Z                     ; return if bullet inactive
2355: LD   A,(HL)                ; MSB of "above player bullet"
2356: INC  L
2357: LD   L,(HL)                ; LSB
2358: ADD  $08
235A: LD   H,A                   ; HL = screen-RAM cell 8 rows above bullet
235B: LD   A,($43B9)             ; CounterB9
235E: RRCA × 3                   ; ÷ 8 (scroll-pixel offset)
2361: ADD  L
2362: AND  $1F                   ; preserve column wrap-around
2364: LD   B,A
2365: LD   A,L                   ; preserve high bits (row)
2366: AND  $E0
2368: OR   B
2369: LD   L,A                   ; HL now points to BG tile under belt
236A: LD   A,(HL)                ; read the BG tile
236B: LD   B,A
236C: AND  $FC                   ; mask low 2 bits
236E: CP   $4C
2370: JP   Z,$237B               ; if tile in $4C..$4F → §6.2
2373: AND  $F0
2375: CP   $60
2377: JP   Z,$2398               ; if tile in $60..$6F → §6.3 (the belt)
237A: RET                        ; otherwise miss
```

[verified `Code.md:$2351-$237A`]

The interesting piece: the X-axis position of the lookup is shifted by
`CounterB9 >> 3` — i.e. the belt scrolls with the background. So
player-bullet hit-testing on the belt is **scroll-aware**: the bullet
must visually overlap the belt cell at the current scroll offset.

### 6.2 `$237B` — special tile $4C..$4F hit (corner pieces)

```
237B: LD   A,(DE)
237C: AND  $F7                   ; clear bit 3 of PlayerBulletState (= deactivate bullet)
237E: LD   (DE),A
237F: LD   A,$FF
2381: LD   ($4366),A             ; M4366 := $FF (hit-detected flag, for sound)
2384: LD   A,B                   ; original tile value
2385: DEC  A                     ; tile -= 1 (cycle to next "more-damaged" tile)
2386: LD   (HL),A                ; write back to BG
2387: CP   $4B
2389: RET  NZ
238A: LD   (HL),$00              ; if tile was $4C-1=$4B, clear to $00 instead
238C: DEC  L                     ; check tile one column left
238D: LD   A,(HL)
238E: CP   $5E
2390: RET  NZ
2391: LD   (HL),$4F              ; if it was $5E, swap to $4F
2393: RET
```

[verified `Code.md:$237B-$2393`]

So the corner-piece path: deactivate the bullet, set the hit flag,
decrement the tile code (which advances the visual "damage" frame),
and if the tile hits $4B, swap to blank ($00). The adjacent-cell
check at $238C/$2391 maintains visual continuity when a corner is
removed (re-tiling the neighbor).

### 6.3 `$2398` — main belt-segment hit

```
2398: LD   A,(DE)
2399: AND  $F7                   ; deactivate bullet
239B: LD   (DE),A
239C: INC  E
239D: INC  E                     ; DE = PlayerBulletState + 2 (probably Y?)
239E: LD   A,(DE)
239F: AND  $04
23A1: LD   A,B                   ; restore original tile
23A2: JP   NZ,$2030              ; if (DE+2 & $04) → $2030 (sound? unverified)
23A5: AND  $0C                   ; low 4 bits of tile
23A7: CP   $04
23A9: LD   DE,$1B40              ; T1B40 = shield-damage progression table
23AC: JP   Z,$23C0               ; if low4 was 4 → §6.4 (pilot hit!)
23AF: AND  $0F                   ; otherwise compute index into T1B40
23B0: ADD  E
23B2: LD   E,A
23B3: LD   A,(DE)                ; fetch next-damage tile from T1B40
23B5: LD   (HL),A                ; write back
23B6: LD   A,$FF
23B8: LD   ($4366),A             ; M4366 := $FF
23BB: RET
```

[verified `Code.md:$2398-$23BB`]

The belt has tiles in the `$60..$6F` range. When hit, the low 4 bits
of the original tile are used as an index into **`T1B40`** (the
shield-damage progression table) to fetch the next "more-damaged"
tile. After enough hits, the tile reaches a state that exposes the
pilot underneath — and the next bullet through that gap takes the
`$23AC` branch to `$23C0`.

### 6.4 `T1B40` — shield-damage progression

```
T1B40:
  1B40: 6C    ; #9
  1B41: 6D    ; #10
  1B42: 6E    ; #11
  1B43: 6F    ; #12
  1B44: FF FF FF FF
  1B48: 6C 6D 6E 6F 64 65 66 67 63 FF
  1B52: 63 61 67 FF
  1B56: 67 65 6B FF
  1B5A: 6B 69 6F FF
  1B5E: 6F 6D
```

[verified `Code.md:$1B40-$1B5F`]

[uncertain — the table is dense and the index math at `$23AF` masks
only the low 4 bits, so the lookup is from `T1B40 + (tile & 0x0F)`.
Need to trace which input tiles produce which output tiles to build a
clean table for the JS port. Recommend reading `bgtiles.md` for the
actual tile graphics that correspond to codes $60..$6F and $4C..$4F
before implementing — the visual progression should match arcade
footage.]

### 6.5 `$23C0` — pilot hit (the win condition)

```
23C0: DEC  L
23C1: LD   A,(HL)                ; tile one column left
23C2: AND  $F0
23C4: CP   $70                   ; alien-pilot BG tile code
23C6: RET  NZ                    ; not actually pilot, return
23C7: LD   HL,$43A4              ; GameState
23CA: LD   (HL),$06              ; → GameState 6 (particle explosion)
23CC: INC  L                     ; CounterA5
23CD: LD   (HL),$60              ; CounterA5 := $60 (~96 frames)
23CF: LD   L,$63
23D1: LD   (HL),$FF              ; $4363 := $FF (particle-explosion start flag)
23D3: RET
```

[verified `Code.md:$23C0-$23D3`]

The win condition. When the bullet passes through a gap in the belt
and the adjacent BG tile is `$7x` (alien pilot), the game transitions
to GameState 6 (§7), arms CounterA5 to $60 frames, and sets the
particle-explosion start flag. Note that the bullet's **X position
must align with the pilot's column** — the `DEC L` + `AND $F0` /
`CP $70` check is precise: the tile to the LEFT of where the bullet
passed must be in the `$70..$7F` range.

### 6.6 Port mapping

Implementation strategy — minimum viable:

```js
shieldBlockCollision() {                    // L2351
    const bullet = state.playerBullet;
    if (!(bullet.state & 0x08)) return;     // bullet inactive

    // Map bullet position to BG-tile cell 8 rows above bullet
    // (the belt is one tile-row above the bullet's pre-hit position)
    const cell = bullet.cellAbove();
    // Apply CounterB9 >> 3 scroll offset to X
    const scrolledCell = applyBgScrollOffset(cell, state.counterB9);
    const tile = state.bgTiles[scrolledCell];

    if ((tile & 0xFC) === 0x4C) {
        // corner-piece path
        deactivateBullet();
        state.hitFlag = 0xFF;
        state.bgTiles[scrolledCell] = tile - 1;
        if (tile - 1 === 0x4B) {
            state.bgTiles[scrolledCell] = 0x00;
            // adjacent-cell touch-up
            if (state.bgTiles[scrolledCell - 1] === 0x5E) {
                state.bgTiles[scrolledCell - 1] = 0x4F;
            }
        }
        return;
    }
    if ((tile & 0xF0) === 0x60) {
        // main belt path
        deactivateBullet();
        const next = (tile & 0x0C) === 0x04
            ? this.pilotHit(scrolledCell)               // L23C0
            : SHIELD_T1B40[tile & 0x0F];                // L2398
        if (next !== undefined) state.bgTiles[scrolledCell] = next;
        state.hitFlag = 0xFF;
    }
}

pilotHit(cell) {                            // L23C0
    if ((state.bgTiles[cell - 1] & 0xF0) !== 0x70) return;
    state.gameState = 6;
    state.counterA5 = 0x60;
    state.particleExplosionStart = 0xFF;    // $4363
}
```

The trickiest bit is the **scroll-aware tile lookup** — the BG plane
in the port uses a 33-row buffer with `scrollPixel` instead of the
source's modulo-256 scroll register (see `research_rendering.md §4.2`).
The source's `(L + CounterB9 >> 3) & 0x1F` math wraps within a 32-byte
row; the port's equivalent needs to translate the bullet's screen
position to a `bgTiles` index that accounts for `scrollPixel` and the
buffer's row-0 hidden row. **Implementation detail — work out exact
mapping during 12.x, after a basic non-scrolling shield test plays.**

---

## 7. GameState 6 — `$2400` mothership particle explosion

Triggered by `$23C0` (pilot hit) or by `$22FA` / other code paths that
end the mothership stage. Per-frame:

```
2400: CALL $242C               ; tick CounterA5 + scroll, returns A
2403: JP   Z,$2552             ; if A == 0  → §9 pilot scoring
2406: CP   $20
2408: JP   C,$246A             ; if A < $20 → EraseMothership
240B: JP   Z,$2520             ; if A == $20 → §9 bonus score calc
240E: LD   B,A
240F: RRCA
2410: NOP
2411: LD   A,B
2412: JP   NC,$20E8            ; if A & 1 == 0 → spawn/move particle (§7.2)
2415: LD   A,E                 ; remaining: position-table jump
2416: SUB  $05
2418: ADD  $C0
241A: LD   C,A
241B: LD   A,D
241C: ADC  $00
241E: LD   B,A
241F: LD   A,(HL)
2420: LD   DE,$2A00            ; T2A00 — particle FG tile data
2423: LD   HL,$2B00            ; T2B00 — particle control data
2426: JP   $2085               ; DrawObjectImage variant
```

[verified `Code.md:$2400-$2426`]

So GameState 6 is a **CounterA5-driven animation**, where the counter
ticks down from $60 (set by `$23CD`) to 0:

| CounterA5 range | Behavior |
|-----------------|----------|
| `$60..$21` (most frames) | Animate particles via `$20E8` or position-table draw |
| `$20` (one frame) | Calculate + display bonus score (`$2520` — §9.1) |
| `$1F..$01` | Erase the mothership progressively (`EraseMothership $246A`) |
| `$00` (one frame) | `$2552` — transition to GameState 7 (§8) |

### 7.1 `$242C` — counter + scroll tick

```
242C: LD   HL,$43B9            ; CounterB9
242F: LD   A,(HL)
2430: AND  $F8                 ; round down to 8-pixel boundary
2432: LD   (HL),A
2433: LD   ($5800),A           ; write to scroll register
2436: LD   DE,$41C6            ; FG-screen position for particle anchor
2439: RRCA × 3                 ; CounterB9 >> 3 (scroll-pixel offset)
243C: LD   B,A
243D: LD   A,E
243E: SUB  B
243F: AND  $1F
2441: LD   B,A
2442: LD   A,E
2443: AND  $E0
2445: OR   B
2446: LD   E,A                 ; DE = scroll-adjusted particle anchor
2447: LD   L,$A5               ; CounterA5
2449: DEC  (HL)                ; tick down
244A: LD   A,(HL)
244B: RET                      ; return A = new CounterA5
```

[verified `Code.md:$242C-$244B`]

Two side-effects: rounds `CounterB9` to 8-pixel granularity (so the
scrolling locks during the explosion), and writes it to the scroll
register every frame. Then derives `DE` as the FG-screen address of
the particle origin (the mothership's center, scroll-adjusted).

### 7.2 `$20E8` — particle motion + draw

Called from `$2412` on even CounterA5 values. Computes new
particle position (`D += 8`, then `E += CounterB9 >> 3` with wrap),
then jumps to `DrawImageCbyB` ($0AD6) to blit a 4×4 tile image from
`T1B90` (a small lookup table at `$1B90` that selects between
particle sprites at `$1B80`, `$1B70`, `$1B60`, `$1B70` based on
`(CounterB9 >> 1) & 0x0E`).

[verified `Code.md:$20E8-$210D` and `Code.md:$1B90-$1B97`]

So during the explosion: the particle sprites cycle through 4
animation frames keyed off CounterB9 (the scroll counter), the mother-
ship erases progressively row by row, and the player's score gets
boosted via `$2520`. Total duration ~96 frames (1.6s at 60 Hz).

### 7.3 `EraseMothership $246A`

```
246A: LD   BC,$0914            ; 20×9 image
246D: LD   DE,$4AC6            ; mothership screen position
2470: LD   HL,$1C00            ; T1C00 starfield (= "erase" tiles)
2473: JP   DrawImageCbyB       ; $0AD6 — draws the 9×20 region with stars
```

[verified `Code.md:$246A-$2473`]

The "erase" is itself a normal tile blit — paint T1C00 starfield over
the 20×9 region where the mothership was. Same T1C00 used by stage 8's
spiral-fill exit (§2). Called repeatedly during CounterA5 == `$1F..$01`
which means the same image gets re-blitted ~31 frames — likely the
particle-motion drawing in `$20E8` is what produces the visual
disintegration effect, with `EraseMothership` clearing whatever's left.

[inferred — exact frame-by-frame visual effect needs arcade-footage
verification before committing visual judgement calls]

### 7.4 Port mapping

```js
state6_MothershipExplosion() {                  // L2400
    const a = this.motherShipExplosionTick();   // L242C — returns new CounterA5

    if (a === 0)        return this.motherShipPilotScoring();   // L2552 → §8
    if (a < 0x20)       return this.eraseMothership();          // L246A
    if (a === 0x20)     return this.bonusScoreCalc();           // L2520 → §9.1
    // a in $21..$60: animate particles
    if ((a & 1) === 0)  return this.spawnAndMoveParticle();     // L20E8
    // odd CounterA5: position-table draw via T2A00/T2B00
    this.drawParticleAt(/* derived from DE/HL */);
},

motherShipExplosionTick() {
    state.counterB9 = state.counterB9 & 0xF8;
    state.scrollRegister = state.counterB9;
    // derive particle anchor (scroll-adjusted from $41C6)
    state.particleAnchor = computeScrollAdjustedAnchor(state.counterB9);
    state.counterA5 = (state.counterA5 - 1) & 0xFF;
    return state.counterA5;
}
```

The particle sprites (T2A00, T2B00, T1B60..T1B80, T1B90 selector) need
to be extracted by `tools/build_data.py` if not already; check
`data.js` for existing exports.

---

## 8. GameState 7 — `$244C` mothership score display

Triggered by `$2552` (transition out of GameState 6 when CounterA5
hits 0). Per-frame:

```
244C: LD   HL,$43A5            ; CounterA5
244F: DEC  (HL)
2450: LD   A,(HL)
2451: RRCA
2452: JP   C,$06F0             ; if low bit was 1 → update scroll + BG fill
2455: AND  A
2456: RET  NZ                  ; return if non-zero
2457: DEC  L                   ; CounterA5 hit 0
2458: LD   (HL),$02            ; GameState := 2 (next stage init)
245A: LD   L,$B8               ; LevelAndRound
245C: LD   A,(HL)
245D: AND  $F0                 ; mask off stage nibble
245F: ADD  $10                 ; advance round
2461: LD   (HL),A              ; → next round's stage 0
2462: LD   L,$BA               ; AliensLeft
2464: LD   (HL),$10            ; := 16
2466: JP   ClearForeground     ; $0380
```

[verified `Code.md:$244C-$2469`]

So GameState 7 is a **pure timer** that holds the screen on the
mothership-score display for `CounterA5` frames (set to `$40` by
`$2557` in `L2552`), with `$06F0` (BG scroll + starfield) running on
odd-counter frames to keep the stars moving. When CounterA5 hits 0:

1. GameState := 2
2. LevelAndRound := `(LR & 0xF0) + 0x10` — advance the round, reset
   stage to 0
3. AliensLeft := 16
4. ClearForeground

Then on the next frame, JT1 routes to GameState 2 which reads the
new LR and initializes the next round's first alien stage.

### 8.1 `$2552` — GameState 6 → 7 transition

```
2552: LD   L,$A4               ; GameState
2554: LD   (HL),$07            ; := 7
2556: INC  L                   ; CounterA5
2557: LD   (HL),$40            ; := $40
2559: LD   L,$6B               ; $436B
255B: LD   (HL),$FF            ; flag for 'mother ship score display'
255D: RET
```

[verified `Code.md:$2552-$255D`]

Sets GameState to 7, CounterA5 to $40 (~64 frames at 60 Hz = ~1.1s
score-display window), and arms `$436B` as a display-start flag.

### 8.2 Port mapping

```js
state7_MothershipScore() {                      // L244C
    state.counterA5 = (state.counterA5 - 1) & 0xFF;
    if (state.counterA5 & 1) {
        return this.bgUpdate();                 // $06F0 — keep stars scrolling
    }
    if (state.counterA5 !== 0) return;
    // timer expired
    state.gameState = 2;
    state.levelAndRound = (state.levelAndRound & 0xF0) + 0x10;
    state.aliensLeft = 0x10;
    this.clearForeground();                     // $0380
}
```

---

## 9. Bonus scoring — `$2520` + reuse of bonus-explosion infra

### 9.1 `$2520` — pilot-kill bonus score calc + display

```
2520: PUSH DE
2521: CALL ClearForeground       ; $0380 — wipe FG, leave mothership remnant on BG
2524: POP  DE
2525: LD   A,($43B9)             ; CounterB9
2528: ADD  $60                   ; CounterB9 + $60 = score-from-skill component
252A: RRCA                       ; /2
252B: LD   B,A                   ; save
252C: LD   A,($43B8)             ; LevelAndRound
252F: AND  $F0                   ; round nibble (×16)
2531: ADD  B                     ; combine
2532: LD   B,$90                 ; cap at $90
2534: JP   C,$253D               ; if overflow → use cap
2537: CP   $90
2539: JP   NC,$253D              ; if >= $90 → use cap
253C: LD   B,A                   ; otherwise use computed value
L253D:
253D: XOR  A
253E: LD   A,B
253F: DAA                        ; BCD-adjust
2540: LD   HL,$439D              ; M439D (score buffer, first 2 BCD digits)
2543: LD   (HL),A
2544: INC  L
2545: LD   (HL),$00              ; last 2 BCD digits = $00
2547: LD   A,E
2548: SUB  $5E
254A: LD   E,A                   ; adjust screen-RAM position
254B: LD   B,$04                 ; 4 digits to print
254D: JP   PrintNumber           ; $00C4 — paint score
```

[verified `Code.md:$2520-$254D`]

Score formula:
- Base: `(LR & 0xF0)` — i.e. `round × 16` BCD-ish (rounds 0/1/2/3
  give base $00 / $10 / $20 / $30)
- Skill bonus: `(CounterB9 + $60) / 2` — the more scroll happened
  during the explosion, the higher; capped at $90

Final score range: $00 to $90 in the high 2 BCD digits, followed by
`$00` in the low 2 — i.e. **$00 to $9000 points** in the displayed
score. The DAA after the add normalizes any binary overflow into
proper BCD.

### 9.2 Reuse of step 10.7 bonus-explosion infrastructure

`research_enemy_motion.md §1.0.6` documents the bonus-explosion slot
machinery (`$4378`/`$437C` slots, `bonusExplosionUpdate` from `L3758`,
`spawnBonusExplosion` from `L0EC3`, 6×2 spreading sprite + 3-digit
popup). That infrastructure was wired for **alien-swoop kills on path
bytes 7/8 = 200 pts** (step 10.7) and **bird wing hits** (step 11.7).

For mothership pilot scoring, the equivalent path is `$2520` →
`PrintNumber $00C4`. This is **NOT the same as the bonus-explosion
popup** — it's a direct full-score-display overlay, painted once at
CounterA5 == $20 and left on screen for the rest of GameState 6
(while particles animate and mothership erases), then refreshed
during GameState 7 (~1.1s on screen).

So step 12 does **not** reuse the bonus-explosion machinery for the
mothership-pilot score. It uses `scoring.printNumber` directly with
the calculated BCD score, paints once into the FG plane at the
correct screen position, and lets it persist through state 6 + 7.

[inferred — re-verify against arcade footage; the visual could be
"score appears overlaid on mothership remnant for ~2s during the
explosion"]

---

## 10. Open questions — resolutions (post-step-12)

Original open questions and what was resolved:

1. ✅ **`$4367` consumer.** Confirmed vestigial via grep — only writers
   at `$22C3` / `$22D7`, no readers in any source routine. Port omits
   the writes. Mothership graphic appears via T1D00 scrolled into BG
   by existing `starsScrollDown` path (§3 / §3.2), not by a separate
   `$4367`-triggered draw.

2. ✅ **`$43BC := $3F` purpose.** Confirmed vestigial — only writer at
   `$22DB`, no source readers. Port omits.

3. ✅ **`$439E` / `$439F` correction.** These are **player ship**
   mapped X bounds, not mothership bounds. Source uses them in
   `$24F2` so mothership fire **tracks the player** (only fires when
   random X lands in [PlayerLeft, PlayerRight]). Original research
   doc §5.2 misread the comment. Port computes via existing
   `mappedPlayerX` helper.

4. ✅ **T1B40 progression table.** Extracted as `SHIELD_PROGRESSION`
   (32 bytes = T1B40 left-half + T1B50 right-half). Port splits into
   `SHIELD_T1B40` / `SHIELD_T1B50` arrays; bullet.x bit 2 selects
   which half. `$FF` entries correspond to indices the pilot-check
   intercepts. See states_mothership.js + 12.5 commit.

5. ✅ **Scroll-aware tile lookup.** Simpler than feared — port can
   compute directly from `bullet.x >> 3` (col) and
   `floor((bullet.y - 8 - scrollPixel) / 8) + 1` (row) using the
   render-time scrollPixel. No additional scroll math needed at lookup
   time because port's bgTiles is "live" (no separate scroll register
   to invert).

6. ✅ **Mothership graphic data.** T1D00 (256-byte extraction = 234
   bytes mothership + 22 FF padding) added to `data.js`. Renders via
   existing `starsScrollDown` mechanism when stage block sets
   `$43B2 = $1D`. No separate "mothership-draw" routine needed.

7. ✅ **Particle sprite data — complete (2026-05-20).** PARTICLE_SPRITES
   (T1B60+T1B70+T1B80, 48 bytes for central particle) extracted at
   step 12.9. T1B90 selector inlined as a JS lookup table (4 entries
   effective). T2A00 + T2B00 (mothership scatter) and T2800 + T2900
   (player scatter) documented in `research_explosion_visual.md`;
   extraction plan in §9.1 of that doc. The visual-effect port of
   odd-CounterA5 in `_drawScatteredParticles` is now unblocked for
   replacement with a source-faithful walk-decoder.

8. ✅ **Stage-block CounterB4 values.** Verified via STAGE_BLOCKS
   data: stage 9 byte 9 = $48 (72 frames lone fade-in), stage A
   byte 9 = $C0 (one-shot trigger reset to $30).

9. ⏸ **Sound deferred** — still correct. `$4366` flag-set sites
   remain no-ops in port. Step 13.

### New port-side decisions discovered during impl

- **Port deviation: 12.5b one-time stage A→B shift REMOVED in 12.10**
  after porting `$24E0` continuous-scroll + dynamic row tracking via
  `findBeltRow` scan. Belt/antenna/particle positions now derive from
  current belt row instead of hardcoded constants.

- **Directional gotcha (12.5):** source's `DEC L` in `$237B` corner-cap
  retile and `$23C0` pilot check is canvas row-UP (`idx-26` in port's
  row-major bgTiles), not col-LEFT (`idx-1`). Initial port had this
  wrong and corrupted body-cap destruction visually. Fixed via user-
  caught bug report.

- **state7 freeze bug (12.x):** source's `$2451 RRCA` checks NEW
  counterA5's bit 0, not OLD. Initial port used OLD parity which made
  counterA5 = 1 → 0 take the bgUpdate path forever (never advanced).
  Fixed via user-caught bug report.

---

## 11. Sub-step plan — outcome

All sub-steps ✅ delivered across 16 commits on 2026-05-18. Final
git log: `git log --grep="step 12" --oneline`.

| Sub-step | Outcome |
|----------|---------|
| 12.0 ✅ | Mixin skeleton landed; state6/7 stubs moved out of states.js |
| 12.1 ✅ | Stage 8 spiral-fill exit → T1C00 starfield bit-3 branch |
| 12.2 ✅ | Stage 9 `$22B4` lone fade-in (T1D00 via existing starsScrollDown) |
| 12.3 ✅ | Stage A `$22CA` + aliens fade-in (one-shot + L0834 piggyback) |
| 12.4 ✅ | Skipped — already wired in earlier alien-combat work |
| 12.5 ✅ | Shield-block collision (`$2351`/`$237B`/`$2398`); directional bug fixed via user catch |
| 12.5a ✅ | Belt animation `$22FA` via m43AA cadence |
| 12.5b ✅ | Antenna animation `$2322` from T1BC0 + (temp) one-time stage A→B shift |
| 12.6 ✅ | Mothership return fire `$24F2` (player-tracking) |
| 12.7 ✅ | Pilot kill `$23C7` → GameState 6 / 7 loop-closer (minimum) |
| 12.8 ✅ | Bonus score `$2520` (top scoreboard) + K cheat polish |
| 12.9 ✅ | Particle explosion central path (T1B60/70/80 + T1B90) |
| 12.10 ✅ | `$21D2` stage-B respawn + `$24E0` continuous-scroll + dynamic row tracking (removes 12.5b temp shift) + bonus popup at mothership + JT4 stop-gap removed |
| 12.x ✅ | Source-faithful `$2085` scattered explosion particles + state7 freeze fix |

### Port deviations from the planned sub-steps

- **12.5b stage A→B one-time shift** added (then removed in 12.10
  when `$24E0` landed): mid-step compensation for unported scroll.

- **Source-faithful `$2085` odd-CounterA5 scattered particles** —
  earlier port iteration used an angle/radius visual-effect scatter
  to avoid the (then-unanalyzed) screen-RAM-native walk. Replaced
  2026-05-21 with the actual `$2085` engine driving T2A00/T2B00,
  per `research_explosion_visual.md §5` and §9.2 Strategy 1.
  Implemented as `_drawScatteredParticles` → `_walkL2085` writing
  into `state.scatteredDebris` (separate Map so the per-call region
  wipe doesn't clobber the central particle or bonus-popup). Anchored
  at the pilot (col 12, row beltRow-2) so the simulation's window-0
  centroid lands on the mothership cockpit; verified at runtime:
  CounterA5 $41 (window 4) produces 21 cells, matching research §6.1's
  expected T2B00 L=$60 density.

- **No on-screen popup for `$2520` bonus score in 12.8** (deferred
  to 12.10) — caught up via fgOverlay popup using digit tiles.

- **Mothership-pilot-kill scoring does NOT reuse the 200-pt
  bonus-explosion infrastructure** (despite the original §9.2
  speculation). `$2520` uses direct `PrintNumber` (= port:
  `scoring.addPoints` + fgOverlay digit popup) with a BCD formula
  yielding $00..$9000 range — completely independent of the
  alien-swoop / bird-wing bonus-explosion pipeline.

---

## 12. Cross-references

- `research_stage_structure.md §3` — JT4 dispatch table (all 16
  stages), GameState machine (states 0-7)
- `research_bird_stage.md §7` — spiral-fill machinery `$2230`/`$2260`/
  `$2292` (already ported for stages 4/6; stage 8 is the third case)
- `research_enemy_motion.md §1` — `$2000` alien combat lane dispatch
  (stage B reuses it with mothership hook injected at `$2006`)
- `research_enemy_motion.md §1.0.6` — bonus-explosion infrastructure
  (NOT reused for mothership pilot scoring — see §9.2)
- `research_rendering.md §4.2` — port's 33-row BG buffer with
  `scrollPixel` (critical for §6.6 scroll-aware tile lookup)
- `research_rendering.md §6` — AABB collision baseline (shield-block
  is tile-based, not AABB, but the player-bullet state machine is the
  same)
