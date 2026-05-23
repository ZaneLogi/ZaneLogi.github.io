# research_main_loop.md — Main loop, task sequence, game state machine

Source-of-truth references: `Code.md` `$6800-$6883` (the loop body)
and the JSR targets in that range. Citations use `$xxxx` form.

This doc covers the per-frame structure of the source — what runs in
what order, how the game state machine sequences attract / play /
death / next-player / new-wave, two-player turn-taking, and how the
JS port should structure its frame.

Prerequisites: [[research_hardware.md]] (CPU + NMI + frame-sync via
`$5B`), [[research_dvg.md]] (display-list lifecycle), [[research_position_math.md]]
(per-object state layout).

## §1. The cold path ($6800-$6809)

The first three instructions run once at power-on / reset and set up
the long-running game loop:

```
6800  JMP $7CF3                  ; safety: any path here triggers RESET
6803  JSR $6EFA                  ; zero all sound-channel registers + sound timers
6806  JSR $6ED8                  ; init: read DIP starting-ships (3 or 4),
                                 ;       clear shipShotsTimer × 4 and statusShip,
                                 ;       set asteroidsPerWave = 2, clear curAsteroidCount
6809  JSR $7168                  ; new-game / new-wave init (difficulty progression,
                                 ;       clears saucer velocity, INC max_rocks_for_ufo)
                                 ;       — fall through into the per-frame loop
```

The "JMP $7CF3 at $6800" guard means the very first byte of ROM (an
address the watchdog / debugger / corrupted-PC paths might land at)
unconditionally restarts the system. The actual `Top:` label is at
`$6803`.

`$7168` is the **new-wave entry point.** The main loop falls back to
this address (`$6883 BEQ $6809`) whenever the round ends — see §6.

## §2. The per-frame loop top ($680C-$682E)

This is the "house-keeping" preamble before any gameplay JSRs:

```
680C  LDA $2007 (SWTEST); BMI $680C    ; loop while self-test held — freezes the game
6811  LSR $5B; BCC $680C               ; frame-sync gate (see [[research_hardware.md §4]])
                                       ; — NMI ticks $5B every 4 NMIs (~62.5 Hz)
                                       ; — main loop shifts it; loops if LSB was 0
6815  LDA $2002 (HALT); BMI $6815      ; wait for DVG to finish previous frame's draw
681A  LDA $4001 (VRAM+1); EOR #$02     ; toggle "Bank A vs Bank B" marker bit at $4001
681F  STA $4001                        ;   (this is the LSB of the LABS opcode that
                                       ;    opens the display list — bit changes alternate
                                       ;    between two builds, visible as a list-version
                                       ;    indicator the DVG ignores)
6822  STA $3000 (GODVG)                ; kick DVG to draw the just-built list
6825  STA $3400 (WATCHDOG)             ; ping watchdog (this counts as "still alive")
6828  INC $5C (fastTimer)              ; 8-bit free-running per-frame counter
                                       ;   ~62.5 Hz (rolls over ~4 sec)
682A  BNE $682E                        ;   no overflow → skip
682C    INC $5D (slowTimer)            ;   overflow → tick slowTimer (~0.24 Hz)
682E  LDX #$40; AND #$02; BNE $6836    ; X = $40 if fastTimer bit 1 set
                                       ;    else $44 — double-buffer offset
6834    LDX #$44                       ;
6836  LDA #$02; STA $02; STX $03       ; store list-build cursor (low=$02, high=$40 or $44)
                                       ; so subsequent code writes to either
                                       ; $4000-$43FF or $4400-$47FF alternately
```

Key points:

- **Frame budget ≈ 16 ms.** If the rest of the loop body overruns,
  `$5B` will be incremented twice by NMI before we drain it, and the
  watchdog-trigger at `$7B7F-$7B81` fires. Empirically this is rare
  on real hardware but realistic on a port if a debug build pauses.
- **The display list is double-buffered.** `$4000-$43FF` and
  `$4400-$47FF` alternate per frame via the `fastTimer` bit. The CPU
  builds into one half while the DVG draws the other. Builds always
  start at byte offset `$00` of the active half — `$03` holds the
  high byte of the cursor.
- **Watchdog is pinged once per frame** — sufficient by design; NMI
  doesn't ping it.

## §3. The task sequence ($683C-$6873)

After the preamble, the CPU walks **15 ordered JSRs**. Some always
run, some are gated.

| # | Addr  | JSR target | Label                | Gating              | Purpose |
|---|-------|------------|----------------------|---------------------|---------|
| 1 | $683C | `$6885`    | `playerMgmt`         | always              | Credits, "wait between players", trigger new ship via $6960 |
| 2 | $683F | (BCS to $6803) | —                | playerMgmt CF=1     | "Reset to cold path" — when credits exhausted / game restart |
| 3 | $6841 | `$765C`    | `attractText`        | always              | numPlayers-conditional text drawing (attract / current player) |
| 4 | $6844 | `$6D90`    | `highScoreMgmt`      | always              | High-score table management |
| 5 | $6847 | (BPL to $6864) | —                | highScoreMgmt N=0   | Skip the rest if no high-score entry in progress |
| 6 | $6849 | `$73C4`    | `highScoreEntry`     | (N=1)               | High-score initial entry input handler |
| 7 | $684C | (BCS to $6864) | —                | highScoreEntry CF=1 | Skip gameplay if still entering initials |
| 8 | $684E | LDA $5A; BNE $685E | —             | delayBeforePlay=0   | **The "inter-life pause" gate** — only run ship/saucer/fire if delay is 0 |
| 9 | $6852 | `$6CD7`    | `playerFire`         | !delayBeforePlay    | Read SWFIRE, spawn ship shot |
|10 | $6855 | `$6E74`    | `shipControl`        | !delayBeforePlay    | Read SWHYPER + SWROTLEFT/RIGHT, run hyperspace and direction update |
|11 | $6858 | `$703F`    | `shipSpawnPhys`      | !delayBeforePlay    | Spawn-respawn timer, thrust accumulator → velocity update |
|12 | $685B | `$6B93`    | `saucerSpawn`        | !delayBeforePlay    | Saucer spawn (every 4th frame) + active-saucer dispatch to $6C34 |
|13 | $685E | `$6F57`    | `asteroidUpdate`     | always              | Per-object motion (asteroids + ship + saucer + shots) — see [[research_position_math.md §3]] |
|14 | $6861 | `$69F0`    | `collisions`         | always              | Geometric distance tests, splits, scoring, explosion spawn |
|15 | $6864 | `$724F`    | `scoreLivesDraw`     | always              | Emit DVG bytes for score + lives display (top of screen) |
|16 | $6867 | `$7555`    | `soundDispatch`      | always              | Per-frame sound updates (saucer/fire/thrust/thump/explosion). See [[research_sound.md]] (R-G — deferred). |
|17 | $686A | (helper)   | `LDA #$7F; TAX`      | always              | Set up params for next JSR |
|18 | $686D | `$7C03`    | `listBuildHelper`    | always              | Position-bytes → DVG-coords + write to current list cursor (see [[research_dvg.md §10]]) |
|19 | $6870 | `$77B5`    | `advanceRNG`         | always              | LFSR advance — game's random source (`$5F`) |
|20 | $6873 | `$7BC0`    | `emitHalt`           | always              | Writes `$B0` (HALT opcode) to terminate the display list |

After the JSR chain, the wave-progression check (§6) decides whether
to continue or roll over to a new wave.

**Notes on individual entries:**

- **playerMgmt $6885** is the gameplay sequencer: when `numPlayers
  == 0`, runs the attract/credit logic; when `numPlayers > 0`,
  decrements `delayBeforePlay` or — when delay hits 0 — JMPs to
  `$6960` for new-ship spawning logic.
- **asteroidUpdate $6F57** is misnamed by tradition. It iterates X
  from `$22` down through all 35 object slots (`$22` is the
  highest-index ship-shot at `slot $1F+3`; `$1A` is the highest
  asteroid; `$1B` is ship; `$1C` is saucer), running the position
  update for each non-zero status. See [[research_position_math.md §3]]
  for the dispatch detail.
- **collisions $69F0** runs in the same X-loop pattern; details TBD
  in [[research_collisions.md]] (R-E).
- **List-building is distributed**, not concentrated in one routine.
  The per-frame DVG vector RAM list is populated piecemeal via the
  helper `$7C03` (LABS-emit helper — writes a 4-byte LABS opcode
  per call; the matching JSR opcode is emitted by a separate
  helper, likely `$7CDE` based on its call pattern right after
  `$7C03` at sites like `$73FC`. To confirm during per-object
  port. See [[research_dvg.md §10]]).
  Callers of `$7C03`: `scoreLivesDraw $724F` (score + lives +
  copyright, 3 emit sites at `$725E` / `$72A2` / `$72BF`), per-object
  draw routines reached during the gameplay block (`$6CD7` / `$6E74`
  / `$703F` / `$6B93` / `$6F57`), text helpers (`$77F6 PrintPackedMsg`,
  `$73C4 highScoreEntry`), and a single closing emit at `$686D`.
  Per-object globalScale values are confirmed during the per-object
  port steps (I-8 ship, I-9 asteroid, I-10 saucer, I-12 HUD/attract)
  by reading the `LDA/STA $00` immediately before each `JSR $7C03`.
  Starting-point estimates from demo-driven visual matching live in
  [[research_vector_rom.md §3.6]] (asteroids) and `progress.md`
  "Per-object globalScale" section.
  **Note (2026-05-23):** `$7555` was previously mislabeled
  `mainListBuild` in this doc and across the research set. It is the
  per-frame sound-channel update routine — fully disassembled at
  `$7555-$75CC`, writes `$3A00` (SNDTHUMP), `$3C00-$3C04`
  (saucer/fire/thrust), `$3600` (SNDEXP). Detailed analysis deferred
  to R-G.
- **emitHalt $7BC0** is two stores of `$B0` to `($02),Y` then `INY` —
  emits a 2-byte HALT word into the display list. This is the
  list-terminator that the DVG looks for.

## §4. The "delayBeforePlay" gate ($5A)

`delayBeforePlay` (`$5A`) is the **inter-life / inter-player delay
counter**. Decremented from `$80` (≈ 2 sec at 62.5 Hz) when the
current player has died or the next player is rotating in.

While `$5A != 0`:

- Skips `playerFire`, `shipControl`, `shipSpawnPhys`, `saucerSpawn`.
- Asteroids and existing shots **continue moving** (asteroid update
  + collisions still run).
- Drawing continues (the screen shows the field of debris).

Effect: the player loses the ship, sees the explosion finish, then
~2 seconds of just the asteroids drifting before the next ship
spawns. Visible as the pause between deaths.

Set in three places (see Code.md):

- `$7081`: when hyperspace fails (death) — `$02FA = $81`
- `$6960+`: after game-over for one player in a 2-player game (next
  player's grace period)
- New-wave init (`$7168` path): brief pause before round starts

## §5. Game state machine

Four state bytes plus the timers above form the per-frame state
machine. Symbols:

| Byte           | Range | Meaning                                                  |
|----------------|-------|----------------------------------------------------------|
| `numPlayers $1C` | 0/1/2 | 0 = attract mode; else number of human players this game |
| `curPlayer $18`  | 0/1   | Current player (used to index `$57,X` ship-count) |
| `statusShip $021B` | 0 / 1 / $A0-$FF | 0 = absent (pre-spawn or in hyperspace); 1 = alive; high bit set = explosion-anim counter |
| `statusSaucer $021C` | 0 / 1 / 2 / $80+ | 0 = absent; 1 = small saucer; 2 = large; high bit set = exploding |
| `shipSpawnTimer $02FA` | 0-$FF | Counts down between death and respawn |
| `delayBeforePlay $5A` | 0-$80 | The per-frame "inter-life" pause (§4) |
| `hyperSpaceFlag $59` | 0 / 1 / $80 | 0 = inactive; 1 = warp success in progress; $80 = warp failure (instant death) |

State transitions (from reading the dispatch sites):

```
                       ┌─────────────────────────────────────┐
                       │   ATTRACT (numPlayers = 0)          │
                       │   - Coin / Start input              │
                       │   - $765C draws attract text        │
                       └──────────┬──────────────────────────┘
                                  │  SW1START / SW2START + credits
                                  ▼
                       ┌─────────────────────────────────────┐
                       │   PRE-SPAWN (statusShip=0,          │
                       │              shipSpawnTimer>0)      │
                       └──────────┬──────────────────────────┘
                                  │  shipSpawnTimer hits 0,
                                  │  player slot has ships left
                                  ▼
                       ┌─────────────────────────────────────┐
                       │   PLAY (statusShip=1)               │
                       │   - Input (rotate/thrust/fire/hyp)  │
                       │   - Physics, collisions, drawing    │
                       └──────────┬──────────────────────────┘
                                  │  collision kill OR hyperspace fail
                                  ▼
                       ┌─────────────────────────────────────┐
                       │   EXPLODING (statusShip=$A0..)      │
                       │   - Animated debris ($7D-$94)       │
                       │   - delayBeforePlay decremented     │
                       └──────────┬──────────────────────────┘
                                  │  delayBeforePlay hits 0
                                  │  curPlayer ships > 0
                                  ▼
                              (back to PRE-SPAWN)

                                  │  curPlayer ships = 0
                                  │  AND no active ship-shots
                                  ▼
                       ┌─────────────────────────────────────┐
                       │   GAME OVER (this player)           │
                       │   - In 2P: switch to other player   │
                       │   - In 1P: high-score check         │
                       └─────────────────────────────────────┘
```

The transitions involve both the timers and the conditional gating in
the task sequence. They're not a single switch statement — they
emerge from how `playerMgmt`, `shipSpawnPhys`, `shipControl`, and
the collision/explosion routines interact.

## §6. Wave progression — the loop trailer ($6876-$6883)

After the JSR chain, the source decides whether to keep going or
trigger a new wave:

```
6876  LDA $02FB (astdWaveTimer)
6879  BEQ $687E                       ; if 0, skip dec
687B    DEC $02FB                     ;   else tick down
687E  ORA $02F6 (curAsteroidCount)    ; OR with current asteroid count
6881  BNE $680C                       ; if either non-zero, next frame
6883  BEQ $6809                       ; else BOTH zero → new wave (JSR $7168)
```

Logic:

- `astdWaveTimer` provides the "delay between waves" — set to `$7F`
  at the moment the last asteroid dies (see `$6F87-$6F89` in
  [[research_position_math.md §3]] context).
- `curAsteroidCount` is decremented each time an asteroid is
  destroyed (`$6F82 DEC $02F6`).
- When `curAsteroidCount == 0` AND `astdWaveTimer == 0` (the
  inter-wave grace period has elapsed), the loop drops to `$6883
  BEQ` which jumps back to `$6809 JSR $7168` — the new-wave init.

`$7168` (the new-wave routine, partially visible):

- Decrements `astWaveTimerReload` (`$02FC`) — speeds up the
  inter-wave pause as the player progresses, with floor at `$08`.
- Spawns a new asteroid wave (mechanics detail in
  [[research_main_loop.md]] continuation §10, deferred to R-F or
  R-E depending on how the spawn routines partition).
- Increments `max_rocks_for_ufo` (`$02FD`) — saucer probability
  growth.

## §7. Two-player turn-taking — RAMSEL and curPlayer

Asteroids supports 1- or 2-player games. Each player's per-game
state (all of `$0200-$03FF`) is **bank-swapped** in hardware via the
RAMSEL bit (`$3200` bit 3 / mask `$04`, see
[[research_hardware.md §6]]).

- `curPlayer $18`: which player is currently active (0 = P1, 1 = P2)
- `numPlayers $1C`: how many human players in this game
- `$57,X` indexed by `curPlayer`: ships remaining for each player

When one player dies and the other still has ships:

- `playerMgmt` rotates `curPlayer`, toggles RAMSEL via the
  `holdLampValues $6F` bitmap (written to `$3200` by NMI — see
  [[research_hardware.md §3]]),
- The bank-swap exposes the other player's `$0200-$03FF` state,
- The newly-active player picks up where they left off (asteroids,
  saucer, score).

The "other player's RAM" not currently mapped sits at `$0300-$03FF`
in the inactive bank. Source's NMI clears both at startup.

**Port implication:** Don't model hardware bank-swap. Keep two state
objects, swap an "active player state" pointer at the same moments
the source would write to RAMSEL. The 256-byte hardware bank size is
incidental.

## §8. Per-frame data-flow summary

Reading the JSRs as a pipeline:

```
INPUT          (NMI tick updates $5B/$5C/$5D, lamp output)
   ↓
MAIN LOOP TOP  (frame-sync, GODVG previous frame, double-buffer setup)
   ↓
playerMgmt     reads numPlayers / delayBeforePlay → may JMP to $6960 for new-ship spawn
   ↓
highScoreMgmt  reads ply1/2HighPlacement → may activate $73C4
   ↓
playerFire     reads SWFIRE, photomLimiter → spawns shot in $021F-$0222 slot
shipControl    reads SWHYPER/SWROTLEFT/SWROTRGHT → mutates direction $61, hyperSpaceFlag
shipSpawnPhys  reads SWTHRUST + direction → mutates ship velocity ($023E/$64, $0261/$65)
saucerSpawn    reads fastTimer/numPlayers/statusShip → mutates statusSaucer, saucer velocity, dispatches to $6C34
   ↓
asteroidUpdate iterates all 35 object slots; per-slot calls $6FC7 motion or $7708 explosion-anim
   ↓
collisions     iterates pairs; mutates statusShip/Asteroids/Saucer, increments score, spawns explosions
   ↓
  (per-object draws were emitted inside each object's update routine
   above — exact gs values confirmed during per-object port steps
   I-8/I-9/I-10/I-12)
scoreLivesDraw emits LABS+JSR for score + lives + copyright (3× $7C03 for the LABS halves, paired with JSRs from a separate helper)
soundDispatch  updates 6 sound channels (no DVG emission)
(closing emit) $686D — LDA #$7F; TAX; JSR $7C03 (mid-screen closing pair)
advanceRNG     advance $5F LFSR for next frame's random choices
emitHalt       writes B000 terminator at the cursor
   ↓
WAVE TRAILER   astdWaveTimer-- ; if (astdWaveTimer || curAsteroidCount) → loop ; else new wave
   ↓
(next frame)
```

## §9. Port implementation spec

The JS port models this as a fixed-timestep update at ~62.5 Hz with a
single canvas stroke per tick. The NMI is not literally simulated —
the counters `$5B/$5C/$5D` that the source uses can be tracked as
plain JS counters incremented in the right places.

```js
// runloop.js (sketch — implementation phase)

const TICK_HZ = 62.5;
const TICK_MS = 1000 / TICK_HZ;

function frame(now) {
  while (accumulator >= TICK_MS) {
    tick();
    accumulator -= TICK_MS;
  }
  render();
  requestAnimationFrame(frame);
}

function tick() {
  fastTimer = (fastTimer + 1) & 0xFF;
  if (fastTimer === 0) slowTimer = (slowTimer + 1) & 0xFF;

  // $683C — playerMgmt (credits, delay, player rotation)
  if (playerMgmt() === RESTART) { resetCold(); return; }

  // $6841 — attractText (state.numPlayers-conditional drawing setup)
  attractText();

  // $6844 — highScoreMgmt
  if (highScoreMgmt() === ENTRY_ACTIVE) {
    if (highScoreEntry() === STILL_ENTERING) {
      // skip gameplay this frame
      drawAndEmit(); return;
    }
  }

  // $684E — inter-life delay gate
  if (delayBeforePlay === 0) {
    playerFire();      // $6CD7
    shipControl();     // $6E74
    shipSpawnPhys();   // $703F
    saucerSpawn();     // $6B93
  }

  asteroidUpdate();    // $6F57 — iterates all 35 slots
  collisions();        // $69F0

  drawAndEmit();
  advanceRNG();        // $77B5

  // wave-progression trailer
  if (astdWaveTimer > 0) astdWaveTimer--;
  if (astdWaveTimer === 0 && curAsteroidCount === 0) {
    newWaveInit();     // $7168 entry — incl. saucer reset, max_rocks_for_ufo++
  }
}

function drawAndEmit() {
  // $6864-$6873 collapsed:
  //   per-object draws already emitted inside their update routines.
  //   This trailer adds score/lives, sound, the closing pair, HALT.
  dvg.beginFrame();
  scoreLivesDraw(dvg);     // $724F
  soundDispatch();         // $7555 — no DVG emit
  emitClosingPair(dvg);    // $686D — LDA #$7F; TAX; JSR $7C03
  dvg.halt();              // $7BC0
}
```

The port's `tick()` is the source's main-loop body without the
double-buffer / DVG-GO ceremony (canvas draws synchronously). The
fixed-timestep accumulator handles host-display refresh drift.

## §10. Open questions / deferred

- **The exact body of `playerMgmt $6885`** (especially the
  curPlayer-rotation path at `$6960`) needs a closer read when
  `research_player_movement.md` or a player-flow doc is written.
  This R-D characterizes its role in the loop, not its internals.
- **Per-object draw routines + `scoreLivesDraw $724F` structure** —
  sketched at the level of "they fill the display list". Per-object
  LABS placement, JSR to vector ROM, and exact globalScale per
  object are read from source as part of the per-object port steps
  (I-8 ship, I-9 asteroid, I-10 saucer, I-12 HUD/attract), not as a
  standalone investigation — same source-reading either way, so the
  factoring avoids double work.
- **NMI handler body** — covered in [[research_hardware.md §3]]; the
  earlier scouting claim that "the NMI handler body is in the
  un-disassembled 20%" was wrong (that referred to `$7CF3`, which is
  the RESET handler — also visible).
- **`$77B5 advanceRNG`** — body is in the ~20% un-disassembled
  region. Likely an 8-bit LFSR using `$5F` as state. Defer to a
  small standalone investigation when it matters (probably during
  hyperspace teleport or saucer-direction work).

## §11. Citations summary

| Topic                                   | Address(es) |
|-----------------------------------------|-------------|
| Cold path (sound init, ship init)       | `$6803-$6809` |
| New-game/wave entry                     | `$7168`     |
| Frame-sync gate                         | `$6811-$6813` |
| DVG HALT wait                           | `$6815-$6818` |
| Double-buffer VRAM toggle               | `$681A-$6820` |
| GODVG kick                              | `$6822`     |
| Watchdog ping                           | `$6825`     |
| Fast / slow timer update                | `$6828-$682C` |
| Build-cursor pointer setup              | `$682E-$683A` |
| Task sequence — 15 JSRs                 | `$683C-$6873` (table in §3) |
| Wave-progression trailer                | `$6876-$6883` |
| playerMgmt entry                        | `$6885`     |
| New-ship spawn entry                    | `$6960`     |
| asteroidUpdate dispatch                 | `$6F57`     |
| shipControl                             | `$6E74`     |
| shipSpawnPhys                           | `$703F`     |
| saucerSpawn                             | `$6B93`     |
| collisions                              | `$69F0`     |
| Score/lives drawing                     | `$724F`     |
| Sound-channel updates (per frame)       | `$7555`     |
| List-build helper                       | `$7C03` (see [[research_dvg.md §10]]) |
| Halt emitter                            | `$7BC0`     |
| RNG advance                             | `$77B5`     |
| Sound-channel reset                     | `$6EFA`     |
| Number-of-starting-ships init           | `$6ED8`     |
| Inter-life delay byte                   | `$5A`       |
| Wave timer                              | `$02FB-$02FC` |
| Current asteroid count                  | `$02F6`     |
| Saucer-spawn growth                     | `$02FD`     |
