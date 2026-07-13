# block_stacker — gameplay research (NES Tetris)

A faithful study of the **NES Tetris** gameplay logic, as the basis for a
web-canvas port. Visual assets are **not** the point — we reproduce the
*mechanics and feel*, and draw the board with Canvas APIs.

**Primary source:** `C:\Z_Temp\TetrisNESDisasm\` — CelestialAmber's
disassembly of `Tetris (U) [!].nes` (md5 `ec58574d96bee8c8927884ae6e7a2508`),
a complete, byte-matching ca65 disassembly. Every claim below cites a
`main.asm` label/line, `tetris-ram.asm`, or `constants.asm`.

**Citation convention:** `main.asm:NNNN` = line in the disassembly. Re-grep the
cited region before relying on any claim (repo rule).

---

## Architecture decision — routine-level translation

NES Tetris is a **routine-level translation** target, decided at research stage:

- Collision (`isPositionValid`, `main.asm:2392`) reads a dedicated **200-byte
  `playfield` RAM array** at `$0400` — *not* the PPU nametable. There is **zero
  screen-RAM readback** in the gameplay path.
- Every gameplay routine (rotation, DAS, gravity, lock, line-clear, scoring,
  RNG) is plain arithmetic over RAM arrays + ROM tables. Each ports 1:1 to JS.
- No hardware-only gameplay mechanism (unlike Asteroids' analog sound). Only
  **audio** is a hardware-adjacent subsystem (APU-driven, software-sequenced),
  and it is **deferred**, not part of the core port.

So: port routines as JS functions with `// main.asm:NNNN` citations; extract ROM
tables verbatim; draw the `playfield` array to canvas however we like.

**Timing contract:** NES logic runs at NMI rate (NTSC ~60.1 Hz / PAL 50 Hz).
Reproduce with a **fixed-timestep 60 Hz logical tick** (same pattern as
`mario_physics/`). `requestAnimationFrame` is the render pump only.

---

## Sub-goal status

| # | Item | Status |
|---|---|---|
| A1 | Playfield model | ✅ |
| A2 | Piece set & 19-orientation shape table | ✅ (all decoded below) |
| A3 | Rotation system | ✅ |
| A4 | Collision (`isPositionValid`) | ✅ |
| A5 | Gravity curve | ✅ |
| B1 | Controller read & edge detection | ✅ |
| B2 | DAS (auto-shift) | ✅ |
| B3 | Soft drop + scoring | ✅ |
| B4 | Frame model / tick contract | ✅ tick contract (playState + `fallTimer++` once/frame) verified; 6502 loop plumbing not reproduced |
| C1 | `playState` state machine | ✅ |
| C2 | Spawn (pos / orientation / next) | ✅ |
| C3 | Entry delay (ARE) | ✅ mechanism; 🟡 exact frame constant → validate by emulator frame-step |
| C4 | Lock & top-out | ✅ |
| C5 | RNG & piece sequence | ✅ |
| D1 | Row completion & collapse | ✅ |
| D2 | Line-clear animation | ✅ |
| D3 | Scoring | ✅ |
| D4 | Level-up thresholds | ✅ |
| D5 | Game start / init | ✅ |
| E1–E4 | Scope decisions | ⬜ **decision, not study** — see bottom |

---

## 1 · Playfield model  (A1)

- `playfield: .res $C8` at `$0400` (`tetris-ram.asm:170`) = **200 bytes = 10 wide
  × 20 tall**, row-major.
- Index = `tetriminoY*10 + tetriminoX` (`main.asm:2393-2401`).
- Cell = **tile value**. Empty = `tileEmpty $EF` (`constants.asm:108`). Any value
  `< $EF` = occupied.
- Hidden vanish zone above the visible field: the vertical bound test is
  `(yOffset + tetriminoY + 2) < $16(22)` (`main.asm:2417-2420`) → 20 playable rows.
- `playfieldForSecondPlayer` at `$0500` (2-player, out of scope).

## 2 · Piece set & shape table  (A2)

**7 pieces** (`constants.asm:111-118`): `T=0, J=1, Z=2, O=3, S=4, L=5, I=6`.

**19 orientation states** (`constants.asm:120-140`) — NES uses **minimal states**:
T/J/L = 4 each, **S/Z/I = 2 each**, O = 1. Plus `hidden=$13` (used during
clear/curtain animations).

**Color groups** (from `tileID` in the shape table): `{T,O,I}=tile1($7B)`,
`{Z,L}=tile2($7C)`, `{J,S}=tile3($7D)`. Cosmetic only.

**`orientationTable`** (`main.asm:1759-1788`) — format per orientation:
`[yOffset, tileID, xOffset] × 4 minos`, relative to the center block.

All 19 decoded as `(col,row)` grids. Spawn orientation marked ★.

**T [tile1]**
```
$00 up      $01 right   $02 down ★   $03 left
.#.         #.          ###          .#
###         ##          .#.          ##
            #.                       .#
```
**J [tile3]**
```
$04 left    $05 up      $06 right   $07 down ★
.#          #..         ##          ###
.#          ###         #.          ..#
##                      #.
```
**Z [tile2]**
```
$08 horiz ★   $09 vert
##.           .#
.##           ##
              #.
```
**O [tile1]** — `$0A ★` = 2×2 block.

**S [tile3]**
```
$0B horiz ★   $0C vert
.##           #.
##.           ##
              .#
```
**L [tile2]**
```
$0D right   $0E down ★   $0F left   $10 up
#.          ###          ##         ..#
#.          #..          .#         ###
##                       .#
```
**I [tile1]** — `$11 vert` = 4 tall×1 wide; `$12 horiz ★` = 1 tall×4 wide
(center is the 3rd cell → sits offset-left).

**Spawn orientation per piece** — `spawnTable` (`main.asm:3013`):
`tDown, jDown, zHoriz, oFixed, sHoriz, lDown, iHoriz`. All spawn at `(x=5, y=0)`.
`spawnOrientationFromOrientation` (`main.asm:3021`) maps any orientation → its
piece's spawn orientation.

## 3 · Rotation system  (A3)

`rotate_tetrimino` (`main.asm:1465-1501`):
- **A = clockwise, B = counter-clockwise.** Target =
  `rotationTable[currentPiece*2 + (A?1:0)]`.
- **No wall kicks / no SRS.** Set new orientation → `isPositionValid` → if
  invalid, **revert** to original (`@restoreOrientationID`). Valid → rotate SFX.
- `rotationTable` (`main.asm:1503-1528`) is `[CCW_target, CW_target]` per state.
  S/Z/I map both A and B to the same toggle (2-state pieces).

Consequence: rotation that would overlap a wall/floor is simply rejected — the
characteristic NES "no kick" stiffness.

## 4 · Collision — `isPositionValid`  (A4)

`main.asm:2392-2455`. For the 4 minos of `currentPiece` at `(tetriminoX,
tetriminoY)`:
- **Floor/ceiling:** `(yOffset + tetriminoY + 2) ≥ 22` → invalid.
- **Occupancy:** read `playfield[base + yOffset*10 + xOffset]`; `< tileEmpty($EF)`
  → invalid.
- **Walls:** `(xOffset + tetriminoX) ≥ 10` → invalid (also catches negative via
  unsigned wrap).
- Returns Z flag: `beq`=valid, `bne`=invalid (callers rely on this).

## 5 · Input  (B1, B2, B3)

**Read** — `pollController` (`main.asm:5526`), raw read
`pollController_actualRead` (`main.asm:5493`):
- Reads the pad **twice and ANDs** the two results (the DPCM DMA read-glitch
  mitigation).
- Edge detect (`main.asm:5541-5551`): `heldButtons` = currently down;
  `newlyPressedButtons = (new XOR old) AND new` (rising edge).
- Bit order `A$80, B$40, Select$20, Start$10, Up$08, Down$04, Left$02, Right$01`
  (`constants.asm:39-46`). Poll happens **once per frame in NMI** (`main.asm:282`).

**DAS (horizontal auto-shift)** — `shift_tetrimino` (`main.asm:1616-1666`),
constants NTSC `DAS_RESET=16, DAS_DELAY=10` / PAL `12, 8` (`constants.asm:74-96`):
- Fresh L/R press → `autorepeatX=0`, shift immediately.
- Held → `autorepeatX++`; shift only when it **reaches 16** (initial charge = 16
  frames), then reset to 10 → repeats every **6 frames**.
- **Wall charge:** a blocked shift sets `autorepeatX = DAS_RESET(16)`
  (`main.asm:1664`) — stays fully charged against a wall, snaps the instant a gap
  opens.
- **Holding Down suppresses horizontal shift entirely** (`main.asm:1619-1621`).
- **`autorepeatX` (DAS charge) carries across pieces** — written only here, never
  reset on spawn/lock. Holding a direction through a lock keeps the next piece
  shifting at the repeat rate.

**Soft drop** — `drop_tetrimino` (`main.asm:1530-1599`):
- Down must be a **fresh, solo** press to engage (not while holding L/R)
  (`main.asm:1541-1550`).
- While held: drop one row every **3 frames**, accrue `holdDownPoints`
  (`main.asm:1562-1569`).
- Game-start lockout: `autorepeatY` seeded `$A0` (bit 7 set) → soft-drop
  auto-repeat suppressed for ~96 frames unless Down is tapped
  (`main.asm:1531-1537`).

**Soft-drop scoring** — `addHoldDownPoints` (`main.asm:3431-3459`): if
`holdDownPoints ≥ 2`, `score += (holdDownPoints − 1)` (BCD). So a soft drop of N
cells → **N−1 points**. Reset on Down-release (`main.asm:1559`) and after scoring
(`main.asm:3462`). (The community "push-down bug" lives in reset-timing edge
cases; only needed for frame-exact scoring.)

## 6 · Gravity  (A5)

`framesPerDropTable` indexed by `levelNumber` (`main.asm:1601-1612`). `fallTimer`
is `inc`'d each frame (`main.asm:1448`); drop when `fallTimer ≥ dropSpeed`.
Levels ≥ 29 skip the table → speed **1** (kill screen).

NTSC frames-per-row:
```
Lv 0–8:  48 43 38 33 28 23 18 13 8
Lv 9:    6
Lv10–12: 5
Lv13–15: 4
Lv16–18: 3
Lv19–28: 2
Lv29+:   1
```
PAL table is at `main.asm:1603-1606` (faster; different feel).

## 7 · Play-state machine + frame model  (C1, B4)

**Frame (NMI, once per vblank)** (`main.asm:248-288`), in order: `render` →
OAM DMA → `frameCounter++` → **advance RNG** → reset scroll →
**`pollControllerButtons`**.

**Main loop** (`main.asm:407-426`) runs game logic then waits for the next
vblank. In play, per-frame work is `gameModeState` chain **2→8** (counters →
gameover → player1 → player2 → reset-combo → start → vblank-wait,
`main.asm:462-473`); `fallTimer++` in state 2.

**Per-player `playState` switch** (`main.asm:474-488`) — runs **once per frame**:

| playState | routine | meaning |
|---|---|---|
| 0 | `unassignOrientationId` | pre-spawn |
| 1 | `playerControlsActiveTetrimino` | **live piece**: `shift → rotate → drop` (`main.asm:489-493`) |
| 2 | `lockTetrimino` | freeze into playfield / top-out |
| 3 | `checkForCompletedRows` | scan + collapse |
| 4 | `noop` | line-clear animation renders here |
| 5 | `updateLinesAndStatistics` | lines, level-up, scoring |
| 6 | `bTypeGoalCheck` | Type-B goal |
| 7 | `receiveGarbage` | 2-player only |
| 8 | `spawnNextTetrimino` | spawn + pick next |
| 10 | `updateGameOverCurtain` | game over |

Steady-state cycle: **1 → 2 → 3 → (4 anim) → 5 → 8 → 1**.

**Port tick:** fixed 60 Hz. Each tick: `fallTimer++` → read input edges → run
active `playState` once → advance RNG → render. Note the intra-frame order —
**shift, then rotate, then drop, all before gravity in the same frame.**

## 8 · Spawn, entry delay (ARE), RNG  (C2, C3, C5)

**Spawn** — `playState_spawnNextTetrimino` (`main.asm:2896`): gates on
`vramRow ≥ 32`; then `tetriminoX=5, tetriminoY=0, fallTimer=0, playState=1`;
`currentPiece = spawnOrientationFromOrientation[nextPiece]`; `nextPiece =
chooseNextTetrimino`. **Note:** the *first* piece does not use this path — it is
placed directly by `initGameState` (§12), so piece 1 has no entry delay.

**Entry delay (ARE)** — the subtle timing that gives NES its cadence:
- On lock, `updatePlayfield` (`main.asm:3532`) rewinds the VRAM copy cursor:
  `vramRow = max(0, tetriminoY − 2)` (only if smaller than current).
- Render copies **4 rows/frame** to VRAM (`main.asm:2489-2492`,
  `copyPlayfieldRowToVRAM` `main.asm:2704`); `vramRow` advances until 20 → 32
  ("done").
- **Line-scan AND next-spawn both block on `vramRow ≥ 32`.**
- ⇒ delay is **variable, proportional to lock height**. Copy-completion term =
  `ceil((20 − max(0, tetriminoY−2)) / 4)` frames. A high lock redraws more rows →
  longer wait.
- 🟡 The **total** lock→spawn frame count adds fixed state-machine frames on top.
  Mechanism derived from source; **pin the exact constant by frame-stepping an
  emulator** before hard-coding (repo rule: verify timing, don't assert from
  memory). For a canvas port that redraws instantly, this delay must be
  **emulated explicitly** or the game feels too fast.

**RNG & piece sequence** — `pickRandomTetrimino` (`main.asm:2964-3003`):
1. `index = (rng_seed + spawnCount) & 7`.
2. If `index == 7` **or** the drawn piece equals the last piece (`spawnID`) →
   **reroll once**: advance RNG, `index = ((rng_seed & 7) + spawnID) mod 7`.
3. Reroll can still repeat → the classic **"roll-twice" mild repeat-avoidance**
   (drought-prone, no 7-bag).

Generator — `generateNextPseudorandomNumber` (`main.asm:5468`): **16-bit LFSR**,
taps at bits 1 & 9, advanced one bit/call, **ticked every frame** in NMI. Seed =
`$8988` at boot (`main.asm:348-351`). Sequence is deterministic from power-on but
shifts with player timing (frames elapsed). For a "feels right" clone the
roll-twice rule matters more than exact LFSR reproduction.

## 9 · Lock & top-out  (C4)

`playState_lockTetrimino` (`main.asm:3062`): re-runs `isPositionValid`;
**invalid → game over** (curtain, `playState=$0A`, `main.asm:3065-3072`). If valid,
writes the 4 minos into the `playfield` array, `updatePlayfield`,
`updateMusicSpeed`, `playState++`. Top-out happens when a freshly spawned piece at
row 0 already overlaps the stack → drop fails immediately → lock validates →
invalid.

## 10 · Line clear + animation  (D1, D2)

**Collapse** — `playState_checkForCompletedRows` (`main.asm:3188`): gated on
`vramRow ≥ 32`; processes one candidate row per frame (`lineIndex` 0–3, the ≤4
rows the piece touched). A row with no `tileEmpty` → **collapse immediately**
(shift rows above down, clear top), record in `completedRow[]`, count in
`completedLines`. 4 lines → Tetris SFX.

**Animation** — `updateLineClearingAnimation` (`main.asm:2757`): advances once
every 4 frames (`frameCounter & 3`), `rowY` 0→4, blanking columns
`leftColumns[rowY]` & `rightColumns[rowY]` = `{4,5}→{3,6}→{2,7}→{1,8}→{0,9}`
(`main.asm:2828-2831`) — a **center-out wipe**, 5 steps × 4 frames = **20-frame
pause**. Skipped if `completedLines == 0`.

## 11 · Scoring + level-up  (D3, D4)

**Line points** — `pointsTable` (`main.asm:3529`) `= 0 / 40 / 100 / 300 / 1200`
(BCD), awarded **× (levelNumber+1)** by looping the add
(`addLineClearPoints`, `main.asm:3460-3517`). Score = 3-byte BCD, capped
`$999999`.

**Level-up** (Type A, `main.asm:3378-3428`) fires when **both**:
- `lines` is a multiple of 10 (BCD ones-digit == 0), and
- `levelNumber < (lines_16bit >> 4)`.

That `>>4` term **implicitly encodes the start-level first-threshold quirk** — no
lookup table:
- Start 9 → first level-up at **100** lines (`$0100>>4 = 16`, 9<16). ✓
- Start 18 → first at **130** lines (`$0130>>4 = 19`, 18<19). ✓ (matches
  `min(start*10+10, max(100, start*10−50))`).

After the first bump, every 10 lines. Type B counts `lines` **down** from a goal.

## 12 · Game start / init  (D5)

`gameModeState_initGameState` (`main.asm:1190-1266`):
- playfield → `tileEmpty`; `tetriminoX=5, tetriminoY=0, vramRow=0, fallTimer=0`;
  score = 0.
- `lines = 0` (Type A) or **25** (Type B goal, `main.asm:1254`).
- **`levelNumber = startLevel`** (`main.asm:1176-1177`); level menu allows **0–19**
  (0–9, +10 via A+Start, `main.asm:837-876`).
- First two pieces via `chooseNextTetrimino`, one RNG advance between
  (`main.asm:1242-1250`); `spawnID = 0`.
- `autorepeatY = $A0` → the ~96-frame soft-drop lockout at game start.

---

## Scope decisions (E) — decide before implementation

- **E1** — Type A (endless) vs Type B (25-line garbage goal). *Suggest: Type A
  first.*
- **E2** — 2-player + garbage (`pendingGarbage`, `garbageHole`,
  `playfieldForSecondPlayer`). *Suggest: drop.*
- **E3** — Endings / high-score entry / demo / stats screens. *Suggest: drop
  (cosmetic).*
- **E4** — Audio (APU music + SFX, software-sequenced). *Defer* (like
  `block_breaker`'s sound); research-first when picked up.

## Open items — frame-accurate lifecycle

The per-frame **routines** and all **ROM data** (shapes, rotation/points/gravity
tables, DAS constants, level-up formula, RNG algorithm) are decoded and
port-ready. The **emergent timing** cluster was mostly closed on a second source
pass; **one** constant genuinely remains open.

### Closed (second pass)

- **First piece skips spawn/ARE** — `initGameState` places piece 1 directly
  (`player1_currentPiece = chooseNextTetrimino`, x=5/y=0, `main.asm:1203-1244`);
  `initGameBackground_finish` sets `player1_playState = 1` (`main.asm:1173-1174`).
  Only pieces 2+ use `playState_spawnNextTetrimino`.
- **DAS charge carries across pieces** — `autorepeatX` is written *only* in
  `shift_tetrimino` (`main.asm:1628-1665`); **never** reset on spawn/lock/init.
  Hold a direction through a lock → the next piece keeps shifting at the repeat
  rate. (`autorepeatY` *does* reset on spawn, `main.asm:2944`.)
- **No lock-delay grace** — a piece locks on the gravity/soft-drop tick that
  fails to move it down; that same frame's `shift`+`rotate` already applied
  (intra-frame order), and the next frame is `playState 2` (lock, no control). No
  separate post-landing grace frame.
- **Row scan = 1 row/frame** — `checkForCompletedRows` processes one `lineIndex`
  then returns (`bmi @ret`, `main.asm:3255-3257`); 4 candidate rows → 4 frames.
- **`gameModeState` 2→8 loop** — state 8 resets to 2 (`main.asm:3771-3773`). The
  exact 6502 main-loop vblank-wait placement is *plumbing we don't reproduce*;
  the port uses a fixed tick. Load-bearing contract — **`playState` machine +
  `fallTimer++` once per 60 Hz tick** — is solid (`main.asm:1448`).

### Still genuinely open (needs empirical work, not memory)

1. **ARE (entry delay) exact frame constant** — mechanism known (`vramRow`
   rewind to `tetriminoY−2`, 4 rows/frame, spawn+scan gate on `≥32`); the
   resulting frame count per lock-height must be pinned by **frame-stepping an
   emulator** (or hand-counting the state chain and validating). Last unknown
   affecting piece-to-piece cadence.

### Port note (non-timing) — make explicit in code

- **Rendering split** — the active piece is drawn as **sprites (OAM)** and is
  **not** in the `playfield` array until it locks; the settled stack *is* the
  array. Keep the active piece out of the collision array or it self-collides.
