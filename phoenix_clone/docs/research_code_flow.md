# Phoenix Top-Level Code Flow — Research Spine

This is the **spine** doc for the Phoenix port. It traces what runs and
in what order from cold reset through every per-frame iteration. It
delegates per-feature internals to:

- `research_stage_structure.md` — the 8-state `GameState` machine
  (this doc references its §1 for the state list and does not
  re-derive it), the 16-entry stage-cycle table, per-stage init,
  per-round difficulty.
- `research_hardware.md` — VBLANK polling (§6), sound HW writes (§5),
  video-register and scroll writes (§4 / §7.2).
- `research_coordinate_system.md` — display orientation.

Source-of-truth: `Code.md` (8085 listing) and `RAMUse.md` from the
local ComputerArcheology Phoenix clone (see `../CLAUDE.md` for the
per-PC path). Claims tagged **[verified]** with an
address citation, **[inferred]** when reasoning beyond the source, or
**[uncertain]** when the source is ambiguous.

---

## 1. Reset / cold-start path

The 8085 reset vector lands at `$0000`. The first 8 bytes are NOPs;
execution falls through to `$0008`, the documented "Start/restart and
interrupts end up at 0008" entry [verified, `Code.md:$0000`]. There
are no maskable interrupts in use (no `RST 5.5`/`6.5`/`7.5`/`TRAP`
references in the listing — see `research_hardware.md` §6), so any
soft-reset path (e.g. the `JP NC,$0000` at `$00A3` in
`WaitVBlankCoin` when `CoinCount > 9`) re-enters via the same `$0008`
landing.

### 1.1 Cold-init at `$0008` (one-shot, never re-entered in the main loop)

```
0008: LD SP,$4BFF           ; stack at top of bank-0 RAM (grows down)
000B: LD H,$50              ; HL = $5000 (video register)
000D: LD (HL),$00           ; select bank 0
000F: CALL $0050            ; InitSoundScreen — see 1.2
0012: LD HL,$1800           ; T1800 = static-text/screen-RAM table
0015: LD C,$03              ; 3 columns (== 3 rotated rows: scores + coins)
0017: CALL $01D0            ; PrintTextLines — draw score rows
001A: <fall through to MainLoop>
```

[verified, `Code.md:$0008-$0017`]

### 1.2 `InitSoundScreen` at `$0050` — clear hardware + both VRAM banks

```
0050: ($6800) := $00        ; sound B off
0054: ($6000) := $00        ; sound A off
0058: ($5800) := $00        ; scroll register := 0
005C: CALL ClearRAMBank     ; clear bank 0 ($4BF8 down to $4000)
005F: ($5000) := $01        ; select bank 1
0063: CALL ClearRAMBank     ; clear bank 1
0066: ($5000) := $00        ; back to bank 0
006A: RET
```

[verified, `Code.md:$0050-$006A`]

`ClearRAMBank` at `$006B` clears `$4000-$4BF8` (skips the top 7 stack
bytes so the return address survives) [verified, `Code.md:$006B-$0077`].
After cold-init, bank 0 is selected, both VRAM banks are zeroed, and
the score rows have been drawn.

**There is no separate "DIPs read at boot" step here.** DSW0 is read
on demand: `GetPlayerLivesFromDip` at `$0350` reads `($7800) & 3` only
when a game is started (`PromptForStartGame` calls it at `$02B6`); the
`BonusLivesAt` byte is read once per game by `ClearForeAndBackground`
at `$015F-$016A`. There is no global DIP-snapshot RAM byte — game code
reads `($7800)` directly each time.

### 1.3 ROM-table copies at boot

**None.** Phoenix uses ROM tables in place — every per-stage init
(e.g. `InitGlobalLevelData` at `$0580`, `InitPlayerDataStructure` at
`$0547`, `InitAlienPositions` at `$0610`) reads ROM-resident tables
and copies the relevant block into RAM **on stage entry**, not at
boot. The only boot-time tile work is `PrintTextLines` at `$0017`
which writes the 3 score/coin rows once. [verified, by absence — no
calls between `$0008` and `$001A` other than the two listed above.]

---

## 2. Per-frame structure (the main loop body)

`MainLoop:` at `Code.md:$001A`:

```
001A: CALL WaitVBlankCoin   ; $0080 — busy-wait VBLANK + read IN0 + tick coin
001D: LD A,($43A2)          ; GameOrAttract (0=attract, 1=1P, 2=2P)
0020: AND A
0021: JP Z,$002D            ; → attract path (L002D)
; --- game path ---
0024: CALL GameStateMachine ; $0400 — JT1 dispatch on GameState 0..7
0027: CALL UpdateScoresAndSound ; $2700 — score draw + sound HW writes
002A: JP MainLoop           ; back to $001A
```

[verified, `Code.md:$001A-$002A`]

### 2.1 The three frame phases

Every frame, regardless of mode, runs in three phases:

| Phase | Routine | Address | What |
|-------|---------|---------|------|
| **VBLANK + input** | `WaitVBlankCoin` | `Code.md:$0080` | Busy-wait `($7800) bit 7` set→clear, then read `($7000)` into `IN0Current` (`$43A0`) and shift previous to `IN0Previous` (`$43A1`). Tick `Counter9A+1` (`$009A`). Coin-debounce: if `($7000) bit 0` edge 1→0 and `CoinCount<9`, increment `CoinCount` (`$438F`) and the on-screen coin tile at `($4142)`. |
| **Game logic** | `GameStateMachine` (game) or attract-path body (attract) | `Code.md:$0400` / `Code.md:$002D` | One pass through the active state handler (see §3). |
| **Score + sound** | `UpdateScoresAndSound` | `Code.md:$2700` | Game mode only (early-RETs at `$2705` if `GameOrAttract == 0`). Drains the per-enemy score-pending buffer at `$4370-$437F`, adds to `Score1`/`Score2` BCD, calls `UpdateSoundControlHW` at `$27A8` (writes `SoundControlA/B` mirrors → `$6000`/`$6800`) then `UpdateSounds` at `$3A10` (synth/melody bit-field update). |

[verified, `Code.md:$001A-$002A`, `$0080-$00B5`, `$2700-$2743`]

### 2.2 The attract-path frame

When `GameOrAttract == 0` (`Code.md:$002D-$0049`):

```
002D: ($6000) := $0F, ($6800) := $0F  ; mute both sound ports
0035: CALL UpdateSoundControlRAM       ; sync RAM mirrors $438C/$438D to $0F
0039: CALL CoinChecking ($17E0)        ; read CoinCount and convert to credits
003C: AND A
003D: JP Z,$0046                       ; no credits → splash/demo
0040: CALL PromptForStartGame ($0288)  ; have credits → "PUSH ... PLAYER BUTTON"
0043: JP MainLoop
0046: CALL SplashAndDemo ($00E3)       ; copyright / table / Phoenix-theme / game-demo
0049: JP MainLoop
```

[verified, `Code.md:$002D-$0049`]

**Attract mode never calls `GameStateMachine` directly** — it has its
own per-frame body. The exception is `GameDemo` at `$03B0` (called
from `SplashAndDemo` once `Counter98 >= $03E6`), which **does** call
`GameStateMachine` after injecting simulated input into `IN0Current`
(`Code.md:$03CE-$03D9`). So during demo playback the per-frame
sequence is `WaitVBlankCoin → SplashAndDemo → GetPlayerInputsForDemo
→ GameStateMachine` — game logic runs, but `UpdateScoresAndSound` is
**not** called (because `GameOrAttract == 0` short-circuits at
`$2705`), which is why demo plays silent and without scoring.

### 2.3 No render phase

There is no separate "render" pass. All drawing happens **inline in
the state handler** as direct writes into the foreground/background
tile-RAM windows (`$4000-$433F` FG, `$4800-$4B3F` BG). The "old screen
pointer" pattern (`OldPlayerShipMSB/LSB` at `$43E0+`) is used to erase
the previous frame's tile cell before writing the new one.
`research_hardware.md` §3 covers why we **skip this in the JS port**
(canvas is cleared each frame).

---

## 3. The 8 GameState handlers at-a-glance

The state list itself is in `research_stage_structure.md` §1 (state
value → address). What each handler **does at the top level** and the
key sub-routines it calls:

| State | Handler | Top-level behaviour | Key sub-routines |
|-------|---------|---------------------|------------------|
| 0 `L0430` | `Code.md:$0430` | **Game-start init.** Sets next state := 1, `CounterA5 := $80` (score-flash duration). Resolves player-bank: from `GameAndDemoOrSplash`, may call `CopyMemoryBank` ($0460) to swap state into bank 0/1 for 2P transitions. RETs immediately on the same frame after seeding state 1. | `CopyMemoryBank` ($0460), `L04A0` (P2 swap) |
| 1 `L04AC` | `Code.md:$04AC` | **Per-frame score-flash. Lasts exactly 128 frames** (CounterA5 counts $80 → $00). Each tick: `CounterA5--`, then pre-emptively writes `GameState := 2`; if counter ≠ 0 restores `GameState := 1`. On bit-3 of counter: paint or erase the active player's score row at `$4261`/`$4021`. The first iteration (`A == $7F`) jumps to `$07F0` for one-time setup (reset scroll register from `CounterB9`, `ClearForeground`, `SetBitsVideoRegister`); this adds no extra delay. | `PrintNumber` ($00C4), `L07F0` |
| 2 `L0515` | `Code.md:$0515` | **Per-stage init (one frame).** Sets palette bit (`SetBitsVideoRegister` $041E), writes `GameState := 3`, copies the 12-byte stage block via `InitGlobalLevelData` ($0580), resets player struct via `InitPlayerDataStructure` ($0547), inits aliens via `$0532`, clears working RAM via `$0506`, falls into bird-init at `$32B0`. See `research_stage_structure.md` §4 for full per-stage RAM block decoding. | `$041E`, `$0580`, `$0547`, `$09A0`, `$0532`, `$0A6C`, `$0506`, `$32B0` |
| 3 `L0800` | `Code.md:$0800` | **Normal gameplay (per-frame).** Indexes JT4 by `(LevelAndRound bits 0-3) * 2` and `JP (HL)` to one of 5 distinct stage handlers (alien fade-in `$0834`, alien combat `$2000`, spiral-fill `$2230`, bird combat `$3400`, mothership fade-in `$22B4`/`$22CA`). All gameplay sub-stages run inside this state. See `research_stage_structure.md` §3 for the JT4 mapping. | JT4 dispatch → 5 sub-handlers |
| 4 `L0AEA` | `Code.md:$0AEA` | **Player-ship particle explosion (per-frame).** Forces scroll register and `CounterB9` low-3-bits to 0. `CounterA5--`; CP $20 selects the explosion-animation phase (`L0BBA` early, `ClearForeground` at $20, `L0BA0` late). On counter == 0, jumps to `L0B15` for the respawn-vs-game-over decision: speculatively sets `GameState := 5`, indexes the active player's lives via `GameAndDemoOrSplash + $90` → `Player1Lives`/`Player2Lives` (`$4390`/`$4391`); if lives 0 (pre- or post-decrement) leaves `GameState=5` (GAME OVER), otherwise decrements lives, redraws via `UpdateLivesScreen` ($0367), and writes `GameState := 0` — respawn re-enters state 0 (not state 3 directly), so the player waits ~130 frames (state 0 → score-flash → stage-init) before regaining control. | `DrawImageCbyB` ($0AD6), `L0B15` (decision), `UpdateLivesScreen` ($0367) |
| 5 `L0B60` | `Code.md:$0B60` | **GAME OVER text (per-frame).** `CounterA5++`. At `A == $40` clears background (`$03A0`); at `A == $80` writes `GameState := 0` (returning to "new game start") **only if both `Player1Lives` and `Player2Lives` are 0** — otherwise a player still has a life and the swap-bank path runs. Otherwise calls `PrintTextLines` to keep the "GAME OVER" banner visible. | `PrintTextLines` ($01D0), `ClearBackground` ($03A0), `CopyMemoryBank` ($0460) |
| 6 `L2400` | `Code.md:$2400` | **Mothership particle explosion (per-frame).** Counts down `CounterA5` via the `$242C` helper; below `$20` runs `EraseMothership` ($246A); at `$20` jumps to `$2520` to render the bonus-score readout for the mothership kill. Triggers transition to state 7 via the bonus-score path. See `research_stage_structure.md` §5.3 for round-bump behaviour. | `$242C`, `EraseMothership` ($246A), `$2520`, `$2552` |
| 7 `L244C` | `Code.md:$244C` | **Mothership score display (per-frame).** `CounterA5--`. On bit-0 odd, calls `$06F0` (scroll + background fill) to keep starfield moving. On `CounterA5 == 0`: writes `GameState := 2`, masks `LevelAndRound` low nibble to 0 and adds `$10` (round++), sets `AliensLeft := $10`, jumps to `ClearForeground`. **Only path that advances the round nibble.** | `$06F0`, `ClearForeground` ($0380) |

[verified, all entries — addresses cross-checked against `Code.md`.]

**Two-frame init pattern.** State 0 → 1 → 2 → 3 each consume *one
frame each*: state 0 seeds state 1 and RETs; state 1 ticks down
`CounterA5` over many frames (the score flash); state 2 runs all
per-stage init in one frame and seeds state 3; state 3 runs gameplay
indefinitely until a kill or stage-clear path reseeds. This is
significant for the JS port — see §5.

---

## 4. Always-on per-frame routines

Things that run **every frame** regardless of `GameState`. Some run
once-per-frame at fixed positions in the main loop; others are pulled
in by every JT1 / JT4 handler.

| Routine | Address | When it runs | What |
|---------|---------|--------------|------|
| `WaitVBlankCoin` | `Code.md:$0080` | Top of every frame, both modes | Busy-waits VBLANK edges, reads `IN0` into RAM mirror (`IN0Current` / `IN0Previous`), increments `Counter9A+1` (`$009B`), debounces coin input. **This is the input-poll.** |
| `Counter9A` tick | `Code.md:$0098-$009A` (inside WaitVBlankCoin) | Top of every frame | `AddOneToMem` on `$439B` (`Counter9A+1`). Used by score-flash, sound modulation (e.g. `Counter9A+1` drives `$3B10` mothership rumble), and several attack-pattern timing checks. |
| `UpdateSoundControlHW` | `Code.md:$27A8` | Bottom of every game frame (called by `UpdateScoresAndSound`); not called in attract | Copies `SoundControlA` (`$438C`) → `$6000` and `SoundControlB` (`$438D`) → `$6800`, then bit-clears the low nibble of `($438D)` (idle the synth bits unless re-OR'd next frame). |
| `UpdateSounds` | `Code.md:$3A10` | Bottom of every game frame (called by `UpdateScoresAndSound`) | Picks the per-state ambient melody/synth bits — Phoenix theme on attract, alien-wave rumble during alien combat, mothership rumble during state 6/7, etc. See `research_hardware.md` §5 for the bit-field layout. |
| `StarsScrollDown` | `Code.md:$067A` (called inside `L06F0` at `$06F0`, which is called by every gameplay sub-stage handler that wants scrolling — `$0834`, `$22B4`, `$244C`, etc.) | Conditional — only when `L06F0` is called | `CounterB9--`, write to scroll register `($5800)`, every 8 frames also refresh the BG tile contents. |
| `CounterB9` tick | `Code.md:$067E` (inside StarsScrollDown) | Conditional, with scroll | The frame-tick that drives starfield scroll and (at low values) attack-pattern triggers in alien combat. |
| `GetPlayerInputsForDemo` | `Code.md:$0173` | Attract-path, demo phase only | When `Counter98 >= $03E6`, `GameDemo` ($03B0) injects scripted input into `IN0Current` before calling `GameStateMachine`. **This means demo gameplay re-uses the real game-logic — the input source is the only difference.** |

[verified, all addresses checked.]

**No task-table dispatcher.** Unlike Galaga (which uses a
`_b_tsk_run_tbl` of subtask flags scanned each frame), Phoenix has a
simple linear sequence: `WaitVBlankCoin → GameStateMachine →
UpdateScoresAndSound`. Sub-frame structure lives entirely *inside*
the active state handler. Nothing is "subscribed" to the frame in
Phoenix; every per-frame call is hardcoded into a calling routine.

---

## 5. JS implication for `main.js`

Phoenix's runloop is much simpler than Galaga's. There is **no task
table**, **no interrupt handler**, **no separate render phase**. The
JS port should mirror this directly:

### 5.1 Recommended runloop shape

```js
// main.js — Phoenix runloop
// L001A — Code.md:MainLoop

const TICK_HZ = 60;                     // research_hardware.md §6 — 60Hz fine
const TICK_MS = 1000 / TICK_HZ;

function tick() {
    // === Phase 1: input + frame counters ===
    // L0080 — Code.md:WaitVBlankCoin (we don't busy-wait; rAF is our VBLANK)
    sampleInput(state);                 // poll keys → state.IN0Current / IN0Previous
    state.counter9a = (state.counter9a + 1) & 0xFFFF;
    handleCoinEdge(state);              // CoinCount, DecrementCoins

    // === Phase 2: dispatch ===
    if (state.gameOrAttract === 0) {
        attractFrame(state);            // L002D path
    } else {
        gameStateDispatch(state);       // L0400 — switch on state.gameState
        updateScoresAndSound(state);    // L2700
    }
}

function gameStateDispatch(state) {
    switch (state.gameState) {
        case 0: state0_NewGameInit(state); break;        // L0430
        case 1: state1_ScoreFlash(state); break;         // L04AC
        case 2: state2_StageInit(state); break;          // L0515
        case 3: state3_Gameplay(state); break;           // L0800 — JT4 inside
        case 4: state4_PlayerExplosion(state); break;    // L0AEA
        case 5: state5_GameOver(state); break;           // L0B60
        case 6: state6_MothershipExplosion(state); break;// L2400
        case 7: state7_MothershipScore(state); break;    // L244C
    }
}

// rAF driver, fixed-timestep accumulator (mini_mario pattern)
let acc = 0, last = performance.now();
function frame(now) {
    acc += now - last; last = now;
    while (acc >= TICK_MS) { tick(); acc -= TICK_MS; }
    render(state);                       // canvas-clear + drawBackground + iterate objects
    requestAnimationFrame(frame);
}
```

[inferred, but follows directly from §2.1 verified frame structure.]

### 5.2 Recommended file structure for `phoenix_clone/`

Files marked **[render]** are detailed in `research_rendering.md`.

```
phoenix_clone/
  index.html
  main.js              # runloop + gameStateDispatch (this doc)
  state.js             # mutable game state: object list + BG tile-grid + named counters (mirrors source RAM where named)
  states.js            # all 8 GameState handlers (L0430, L04AC, L0515, L0800, L0AEA, L0B60, L2400, L244C)
  resource.js          # [render] decode tile-ROM → tileImages[256]
  shapes.js            # [render] port of $1700 shape table + $1B40 damage LUT
  gfx.js               # [render] convertCoords (identity in Phoenix), drawObject helper
  render.js            # [render] per-frame: clear → drawBackground → iterate objects
  collision.js         # [render] AABB tests; per-tile lookup for destructibles
  input.js             # sampleInput + IN0 mirror; demo input source
  hw.js                # writeSoundA/B, scroll, video-register shims (research_hardware.md §5/§7)
  stage/               # per-stage logic referenced from state 3 (each substantial enough for its own file)
    aliensFadeIn.js    # L0834 (stages 0,2)
    alienCombat.js     # L2000 (stages 1,3,B)
    spiralFill.js      # L2230 (stages 4,6,8)
    birdCombat.js      # L3400 (stages 5,7) — see research_stage_structure.md §10
    mshipFadeIn.js     # L22B4 (stage 9), L22CA (stage A)
  enemies/
    aliens.js          # alien movement-pattern interp; deferred research
    birds.js           # phoenix-bird AI; deferred research
    mothership.js      # mothership update + shield-block damage handling
  player.js            # PlayerUpdate ($0876), shield, bullet
  scoring.js           # UpdateScoresAndSound ($2700) — score buffer + BCD format
  sound.js             # UpdateSounds ($3A10) — synth/melody bit-field decode
  attract.js           # SplashAndDemo ($00E3) + GameDemo ($03B0)
  devPanel.js          # GameState force-set, frame-step, tile/sprite viewer
```

The 8 state handlers collapse into one `states.js` because each is short
(state 0 is ~10 lines of logic; state 1 is the longest at ~40). Split
a handler into its own file if it grows past ~100 lines.

The `stage/` substages stay as separate files — each will be hundreds
of lines.

The `enemies/` files hold per-enemy update / AI; the rendering of every
enemy is uniform (`drawObject` walks the object's `tiles[]`).

### 5.3 Architectural decisions (runloop / dispatch)

Rendering / sprite / collision decisions are in `research_rendering.md` —
this table covers only the runloop and dispatch concerns.

| Decision | Choice | Rationale |
|---|---|---|
| **State management** | Single mutable `state` global. Where source has named RAM bytes (e.g. `$43A4 GameState`, `$43A5 CounterA5`) the JS field name mirrors the label (`state.gameState`, `state.counterA5`). Game-object data lives on the objects themselves (`state.player`, `state.aliens[]`, etc. — see `research_rendering.md` §4) | Direct cross-reference between source and JS RAM labels. Object data on objects keeps source-routine porting mechanical |
| **State dispatch** | `switch` on `state.gameState` in a single `states.js` | Phoenix's source is a JT1 jump table — JS `switch` mirrors it. No state classes |
| **Frame pacing** | Fixed-timestep accumulator (mini_mario pattern) | Logic locked at 60 Hz; render at display rate. Survives 144 Hz monitors without timing drift |
| **Input** | Positive-logic booleans + previous-frame snapshot for edge detection | Skip source's `CPL` mask trick. Edge detection is load-bearing for coin / fire / shield / start (`research_hardware.md` §7.1) |

### 5.4 Implementation order

Bottom-up; each step produces something visible/testable before moving on:

1. **Tile decode + render skeleton.** Load tile-ROM, decode all 256 tiles into `resource.tileImages[]`. Hardcode `state.player = {x: 100, y: 216, tiles: [...]}` (matching source `PlayerShipX/Y` defaults) and call `drawObject(state.player)` through `convertCoords` — the player ship appears at the bottom-center of the canvas. Confirms decode + coords + drawImage all work end-to-end. See `research_rendering.md` §2 / §3 / §5.
2. **Cold-init path** (`$0008` → `InitSoundScreen` → `PrintTextLines`). Score / coin character tiles draw at boot.
3. **Background tile-grid + scrolling.** `state.bgTiles[]`, `state.bgScrollY`, `drawBackground()`. Render BG first, FG objects on top. Verify the scrolling starfield works.
4. **Input poll + main-loop skeleton** with empty state handlers. Frame ticks fire; nothing happens yet.
5. **State 0 → 1 (score flash) → 2 (stage init for stage 0).** Stage-0 init creates the alien object list; aliens render at fixed positions, not moving yet.
6. **Stage 0 alien fade-in** (`$0834`). Aliens fade in (per-frame animation).
7. **Player movement + bullet** (`PlayerUpdate $0876`). Ship moves and shoots; bullet renders.
8. **Alien combat** (state 3 stage 1, `$2000`) + **collision** (AABB). Alien wave fires back; player can destroy aliens.
9. **Birds** (`$3400`) and **mothership** (`$22B4` / `$22CA`) including damage-stage tile-swapping for shield blocks (see §5.6); rest of the stage cycle.

Steps 6-9 each pull in a per-feature research doc (`research_*.md` items 5-7 — currently still open).

### 5.5 Three things to get right at scaffold time

1. **State 0/1/2/3 each consume exactly one frame** for their seeding
   work (state 0 sets state := 1 and RETs; state 1 ticks `CounterA5`
   over many frames but each tick *also* writes `GameState := 2` so
   the *next* tick after countdown ends routes to state 2; state 2
   runs all init in one frame and writes `GameState := 3`). **Don't
   collapse "init + first gameplay frame" together.** The original
   wastes a frame per state transition; mirror that behaviour to
   match collision/timing edge cases.

2. **Score+sound runs only in game mode.** Attract-path frames must
   skip `UpdateScoresAndSound` (mirror the `RET Z` at `$2705`) — the
   demo plays silent because of this, and that is intentional.

3. **Input mirror semantics.** `IN0Current` (`$43A0`) is the **raw
   active-low byte**. `IN0Previous` (`$43A1`) is last frame's value.
   `CheckInputBits` at `$00BB` does `CPL ; AND mask ; AND
   (IN0Previous)` to detect 1→0 edges. `research_hardware.md` §7.1
   recommends storing positive-logic booleans in JS and skipping the
   `CPL` — fine, but **keep the previous-frame snapshot** because
   coin-debounce, bullet-fire, shield-on, and start-button all rely
   on edge detection, not level.

---

## 6. What lives at the edges (not in the main loop)

For completeness, things invoked from the main loop indirectly that
the spine doesn't trace:

- **Per-stage init internals** (`InitGlobalLevelData`, `InitAlienPositions`,
  bird-init at `$32B0`) — covered in `research_stage_structure.md` §4.
- **Alien movement patterns** (`AlienBehaviorUpdate` at `$3000`,
  pattern-pointer table `$4B50-$4B6F`, ROM tables `T14xx`) — deferred
  to per-feature enemy-motion research.
- **Bird AI / egg hatching** (`L3400`, `M4368` maturity state) —
  deferred to per-feature research; see `research_stage_structure.md`
  §10.
- **Player-bullet / enemy-bullet collision** (`$0DF0`, `$0F00`,
  `$0C40` `EnemyBulletUpdate`) — deferred to player/collision research.
- **Sound bit-field synthesis** — `research_hardware.md` §5.

These are sub-frame details inside specific GameState handlers. The
spine just needs to call into them at the right point in the dispatch
switch.

