# Phoenix Clone — Complete Documentation Index

**Date:** May 2026  
**Status:** All research documents analyzed and integrated  
**Total docs:** 8 files + assembly listing (Code.md)

---

## Quick Navigation

| Document | Focus | Key Sections | Length |
|----------|-------|--------------|--------|
| **research_code_flow.md** | Main loop, dispatch, runloop architecture | §1 cold-start, §2 frame structure, §5 JS port structure | 386 lines |
| **research_player_movement.md** | Player controls, input, animation | §2 input polling, §3 movement per frame, §7 frame-by-frame | 348 lines (generated) |
| **research_coordinate_system.md** | Display rotation, tile grid, addressing | §1 resolution, §3 addressing, §7 canvas mapping | 711 lines |
| **research_hardware.md** | CPU, memory, I/O, video architecture | §1 CPU, §3 RAM layout, §7 I/O ports | 493 lines |
| **research_stage_structure.md** | Game states, stages, wave cycles | §1 state machine, §3 JT4 dispatch, §4 per-stage init | 647 lines |
| **research_enemy_motion.md** | Alien movement, path following, animation | §1 per-frame dispatch, §3 path model, §4 animation | 504 lines |
| **research_rendering.md** | Sprite decoding, tile rendering, collision | §1 rendering model, §2 tile decode, §6 AABB collision | 794 lines |
| **research_bird_stage.md** | Bird-combat dispatch ($3400), maturity (M4368), wing hit ($38E9) | §1 $3400 dispatch, §2 $32B0 init + T3F80/T3FC0, §4 maturity, §6 hit detection, §9 sub-step plan | ~400 lines |
| **research_mothership.md** | JT4 stages 8/9/A/B, GameStates 6/7, shield-block barrier (T1B40), pilot kill, bonus scoring | §2 stage 8 starfield exit, §3 $22B4 lone fade-in, §4 $22CA aliens fade-in, §5 $24A0 combat hook, §6 shield-block $2351/$2398/$23C0, §7 $2400 particle explosion, §8 $244C score display, §11 sub-step 12.0-12.10 plan | ~500 lines |
| **research_player_ship.md** | Player death cycle: GameState 4 explosion ($0AEA), L0B15 respawn/game-over decision, GameState 5 GAME OVER ($0B60), T1A00 text, L0CB4/L0CC4 hit path, shield port-deviation | §2 $0AEA dispatch, §3 $0B15 decision, §4 $0B60 + T1A00 bytes, §5 $0CB4/L0CC4 + §5.1 shield faithful-vs-visual-effect trade-off, §6 port mapping plan, §7 open reads | ~250 lines |
| **research_splash_attract.md** | Splash + attract: Counter98 timeline ($0001..$03E6+), L002D entry, PrintCopyright (T1960), SlowPrintScoreAverageTable (T1860), score-icon tiles ($0BCA), bird animation ($21DC), GameDemo + GetPlayerInputsForDemo, CoinChecking + PromptForStartGame | §1 timeline, §2 Counter98 lifecycle, §3 splash phases, §4 GameDemo, §5 demo input table, §6 coin/start path, §7 port-mapping plan | ~500 lines |
| **research_explosion_visual.md** | L0FC0 / L20E8 / L2070 / L2085 explosion visual subsystem shared by player death + mothership kill: central 4×4 pulse (T1B60/70/80 + T1B90 selector) + scattered debris walk (T2800/T2900 player, T2A00/T2B00 mothership) | §1 two-tier diagram, §2-§3 dispatch, §4 central pulse, §5 L2085 walk, §6 ROM tables, §7-§8 simulation, §9 port implementation, §10 calibration | ~760 lines |
| **Code.md** | 8085 assembly listing, full source truth | Routines at addresses $0000–$3FFF | 8249 lines |

---

## Architecture Overview

### The Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│  GAME LOGIC (State machine, player input, object updates)    │
│  research_code_flow.md §2 & §3; research_stage_structure.md  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  COORDINATE SYSTEM (Grid <→ Screen RAM <→ Canvas pixels)      │
│  research_coordinate_system.md §3–7; research_hardware.md §4  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  RENDERING & I/O (Tile blits, sound writes, input polling)    │
│  research_rendering.md §1–6; research_hardware.md §5–7        │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow per Frame

```
1. WaitVBlankCoin (research_hardware.md §6.1)
   └─ Poll VBLANK, read IN0 (input), update IN0Current/Previous
   
2. GameStateMachine dispatch (research_code_flow.md §2.1)
   ├─ State 0: new game init
   ├─ State 1: score flash
   ├─ State 2: stage init  (research_stage_structure.md §4)
   ├─ State 3: gameplay    (research_enemy_motion.md §1)
   │  ├─ PlayerUpdate (research_player_movement.md §3)
   │  ├─ AlienUpdate (research_enemy_motion.md §1–2)
   │  └─ Collision, bullet fire (research_rendering.md §6)
   ├─ State 4: player explosion
   ├─ State 5: game over
   ├─ State 6: mothership explosion
   └─ State 7: mothership score display
   
3. UpdateScoresAndSound (research_code_flow.md §2.1)
   └─ Draw scores, write sound HW (research_hardware.md §5)
   
4. Render (research_rendering.md §1–2)
   └─ Convert tile-RAM to canvas pixels
```

---

## Cross-Document Reference Map

### Research Coordinate System

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | Hardware screen resolution (256×208 → 208×256 after rotation) | hardware.md §2; rendering.md §1.2 |
| §2 | Screen orientation (ROT90 physical rotation) | rendering.md §1.2; hardware.md §4 |
| §3 | Tile addressing & memory layout (32×26 grid, stride arithmetic) | hardware.md §3.1; rendering.md §2 |
| §4 | Object X/Y → screen-RAM conversion (snap to 8-pixel grid) | player_movement.md §5; enemy_motion.md §3 |
| §6 | Palette PROM decode (256-entry table, 2 bits/pixel) | rendering.md §2.1; hardware.md §4.3 |
| §7 | Canvas mapping (208×256 native, no scaling) | hardware.md §8; rendering.md §5 |

### Research Hardware

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | CPU: Intel 8085A @ 2.75 MHz (no interrupt usage) | code_flow.md §1.1; stage_structure.md §1 |
| §3 | RAM layout (6 KB across 2 banks, game state at $43C0–$43FF) | player_movement.md §1; enemy_motion.md §2 |
| §4 | Video memory (FG $4000–$433F, BG $4800–$4B3F, 2-bank switch) | coordinate_system.md §3; rendering.md §1 |
| §5 | Sound: MN6221AA melody chip (write-only ports $6000/$6800) | code_flow.md §2.1; stage_structure.md (N/A) |
| §6 | Frame timing: polled VBLANK, 60 Hz fixed-tick | code_flow.md §2; player_movement.md §6 |
| §7 | I/O ports: IN0 ($7000 active-low), video/scroll/sound writes | player_movement.md §2; hardware.md (detailed) |

### Research Code Flow

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | Reset/cold-start: $0008 init, stack setup | stage_structure.md §4; hardware.md §2 |
| §2 | Main loop: WaitVBlankCoin → GameStateMachine → UpdateScoresAndSound | player_movement.md §3; enemy_motion.md §1 |
| §3 | Attract mode vs game mode | stage_structure.md §1; player_movement.md (N/A) |
| §4 | No separate render pass (inline tile writes) | rendering.md §1; coordinate_system.md §2 |
| §5 | JS port structure: state.js, states.js, main.js, etc. | rendering.md §5; player_movement.md §8 |

### Research Player Movement

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | Grid data structure ($43C0–$43CB) | hardware.md §3.2; rendering.md §2 |
| §2 | Input polling & edge detection (CheckInputBits) | hardware.md §7.1; code_flow.md §2.1 |
| §3 | Movement per frame (MovePlayer, boundary checks) | player_movement.md (primary); code_flow.md §5.1 |
| §4 | Animation frames (8-frame cycle, X % 8 lookup) | rendering.md §2.2; coordinate_system.md §4 |
| §5 | Screen drawing (grid → screen RAM) | coordinate_system.md §3.4; enemy_motion.md §2 |
| §7 | Edge detection rationale (coin, shield, fire) | hardware.md §7.1; code_flow.md §2 |

### Research Stage Structure

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | GameState machine (0–7) | code_flow.md §2; enemy_motion.md §1 |
| §2 | LevelAndRound packing (stage nibble + round nibble) | code_flow.md §5; rendering.md (palette) |
| §3 | JT4 dispatch (16 stage handlers, 5 unique types) | code_flow.md §2; enemy_motion.md §1 |
| §4 | Per-stage init (GameState 2): player, aliens, parameters | player_movement.md §1; enemy_motion.md §2 |
| §5–8 | Difficulty scaling, alien formations, waves | enemy_motion.md §3; rendering.md (N/A) |
| §9 | Bird-boss maturity state ($4368) | hardware.md §3.2; rendering.md §2 |

### Research Enemy Motion

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | Per-frame dispatch (4-frame round-robin, 15 Hz motion update) | code_flow.md §2; stage_structure.md §3 |
| §2 | Per-alien data layout ($4B70–$4BEF) | hardware.md §3.2; rendering.md §2.4 |
| §3 | Path-following motion (T1700 motion table, T1000–T13D0 paths) | coordinate_system.md §4; rendering.md §2 |
| §4 | Sprite animation (position-keyed, 4-frame cadence) | rendering.md §2; code_flow.md §5 |
| §5–8 | Swoop attacks, stage-clear, bird behavior, mothership | stage_structure.md §3; rendering.md (collision) |

### Research Bird Stage

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | `$3400` bird-combat dispatch (Counter9A bit-0 parity split; `BirdsLeft<4` runs both halves) | enemy_motion.md §1 (alien `$2000` comparison) |
| §2 | `$32B0` bird init + T3F80/T3FC0 tables (8 birds × 8 bytes) | stage_structure.md §4 |
| §3 | `$3560` movement randomizer (T3E80 index from round + density + Counter9A) | stage_structure.md §8.1 |
| §4 | M4368 maturity bitfield (`$01 → $0F`); 4 advance routines `L36D2/EA/0A/36` | rendering.md §2 (shape table T3EC0) |
| §5 | T3F00 dispatch + T3E80 shape/motion lookup | rendering.md §2 |
| §6 | Hit detection: `$38E9` wing → `spawnExplosion`, `$3844` body → `spawnBonusExplosion` | enemy_motion.md §1.0.5, §1.0.6 |
| §7 | `$2230` spiral-fill intro (abbreviated) | stage_structure.md §3.2, §8.1 |
| §8 | Birds do not fire (no `$2560` invocation from `$3400`) | enemy_motion.md (alien fire model) |
| §9 | Implementation hooks — proposed sub-steps 11.1–11.6 | progress.md step 11 |
| §10 | Open questions parked for impl pass (T3F80/T3FC0 selection, offsets +3/+6, `$2600`) | — |

### Research Rendering

| Section | Topic | Cross-refs |
|---------|-------|-----------|
| §1 | No sprite chip, software tile writes | hardware.md §4; coordinate_system.md §3 |
| §2 | Tile decoding (8×8, 2 bitplanes, 256 tiles per set) | coordinate_system.md §6; hardware.md §4 |
| §3 | Coordinate conversion (identity, tile-aligned snapping) | coordinate_system.md §4; player_movement.md §5 |
| §4 | Object representation (tile list per sprite) | code_flow.md §5; player_movement.md §1 |
| §5 | Render pipeline (clear → BG scroll → FG tiles → objects) | code_flow.md §2; hardware.md §4 |
| §6 | AABB collision detection | enemy_motion.md §1; stage_structure.md (N/A) |

---

## Key Findings Summary

### Timing & Update Rates

| What | When | Frequency | Source |
|------|------|-----------|--------|
| Input polling | WaitVBlankCoin | Every frame (60 Hz) | hardware.md §6.1; code_flow.md §2.1 |
| Player movement | MovePlayer (L0900) | Every frame (60 Hz) | player_movement.md §3.3 |
| Player animation | L0926 | Every frame (60 Hz) | player_movement.md §4 |
| Alien movement | AlienMovementUpdate (L0D1C) | Every 4th frame (15 Hz) | enemy_motion.md §1 |
| Alien animation | AlienAnimationUpdate (L0D70) | Every 4th frame (15 Hz), offset | enemy_motion.md §4 |
| Sound writes | UpdateScoresAndSound (L2700) | Every frame (60 Hz) | code_flow.md §2.1 |
| Background scroll | (per-frame increment) | Every frame (60 Hz) | coordinate_system.md §5 |

### RAM Structure (6 KB total)

```
$0000–$3FFF   ROM (16 KB, not mapped in JS)
$4000–$433F   FG tile screen (832 B)
$4340–$43FF   Game state: player, bullets, scores, input (192 B)
$4400–$47FF   More game state / counters (1 KB)
$4800–$4B3F   BG tile screen (832 B)
$4B40–$4BEF   Aliens (16 × 4-byte slots) + paths (176 B)
$4BF0–$4BFF   Stack (grows down, never used for game state)
```

[Source: hardware.md §3]

### Coordinate Systems (Three Different Ones!)

| System | Origin | Units | Range | Used For |
|--------|--------|-------|-------|----------|
| **Grid** | Top-left (in raw memory layout) | 1 byte per dimension | X 0–255, Y 0–255 | Object position storage ($43C2, $4B70, etc.) |
| **Display** | Top-left (portrait cabinet view) | Pixels (8-aligned for tiles) | X 0–207, Y 0–255 | Tile rendering, player sees this |
| **Screen RAM addr** | From memory-stride arithmetic | Pointer arithmetic (+1 = down, +32 = left) | 32×26 tile cells | Low-level tile writes |

[Source: coordinate_system.md §2–4]

### The Big Quirks

1. **No sprite chip** — all objects software-blitted as tile writes (hardware.md §4; rendering.md §1)
2. **8 pre-shifted shape variants** — account for sub-tile motion (rendering.md §1.1)
3. **8-frame animation cycle** — player sprite frame = X % 8 (player_movement.md §4)
4. **4-frame round-robin** — alien updates fire every 4th frame at ~15 Hz (enemy_motion.md §1)
5. **Polled VBLANK, no interrupts** — single per-frame tick, no concurrency (hardware.md §6)
6. **Two tile planes** — FG + BG, both 32×26, BG scrolls (hardware.md §4; rendering.md §1)
7. **Display rotated 90°** — cabinet has portrait monitor, not standard arcade landscape (coordinate_system.md §2)
8. **Active-low input byte** — button press = bit becomes 0, not 1 (hardware.md §7.1)
9. **Path-following aliens** — not free-roaming, follow ROM motion tables (enemy_motion.md §3)
10. **Shield button is 4th button** — Phoenix-specific, tied to shield state machine (hardware.md §7.1; player_movement.md §3.2)

---

## Implementation Roadmap

### Phase 1: Infrastructure (Steps 1–3 in code_flow.md §5.4)

- [ ] Tile ROM decode → `tileImages[256]`
- [ ] Canvas setup (208×256 portrait)
- [ ] Player ship hardcoded at default position, drawObject test
- [ ] Cold-init (PrintTextLines) → score/coin rows visible
- [ ] BG tile-grid + scroll setup

### Phase 2: Core Movement (Steps 4–5)

- [ ] Input poll + IN0Current/Previous
- [ ] Main-loop skeleton (empty state handlers)
- [ ] State 0 → 1 → 2 (score flash + stage init)
- [ ] Alien object list created, render at fixed positions

### Phase 3: Gameplay (Steps 6–9)

- [ ] Player movement (L0900 ported, boundaries respected)
- [ ] Alien fade-in animation (L0834)
- [ ] Bullet + fire logic (L0930)
- [ ] Alien combat + collision (L2000)
- [ ] Bird combat (L3400) + mothership (L22B4/L22CA)

[Full roadmap: code_flow.md §5.4]

---

## Cross-File Dependency Graph

```
Code.md (source truth)
├── research_code_flow.md
│   ├── research_stage_structure.md
│   │   └── research_enemy_motion.md
│   │       └── research_rendering.md
│   └── research_hardware.md
│       └── research_coordinate_system.md
│           └── research_rendering.md
└── research_player_movement.md
    └── research_hardware.md
```

To implement, start at top, work downward. Each level depends on the previous.

---

## Frequently Searched Items

### "Where is X defined?"

| Item | Location |
|------|----------|
| Player data structure | hardware.md §3.2; player_movement.md §1.1; Code.md $43C0 |
| Alien data structure | hardware.md §3.2; enemy_motion.md §2; Code.md $4B70 |
| GameState machine | stage_structure.md §1; Code.md $0400; hardware.md §3.2 |
| Input byte layout | hardware.md §7.1; player_movement.md §2.1 |
| Tile addressing | coordinate_system.md §3.4; hardware.md §4 |
| Motion table (T1700) | enemy_motion.md §3.2; Code.md $1700 |
| Animation frame lookup | player_movement.md §4.2; Code.md $1600 |
| Per-stage init data | stage_structure.md §4.1; Code.md $0598 |
| Palette PROM | coordinate_system.md §6.1; Code.md proms section |
| Shield state | hardware.md §3.2 ($4362); player_movement.md §3.2 |

### "How does X work?"

| Item | See |
|------|-----|
| How does the player move? | player_movement.md §3; Code.md $08C4 |
| How do aliens move? | enemy_motion.md §3; Code.md $0D1C |
| How is collision detected? | rendering.md §6; Code.md $0E10 |
| How does the display rotate? | coordinate_system.md §2; hardware.md §4 |
| How are sprites drawn? | rendering.md §1–2; Code.md $0718 |
| Why is there a 4-frame delay? | enemy_motion.md §1; Code.md $2000–$202A |
| How does the main loop work? | code_flow.md §2; Code.md $001A |

---

## Document Quality Notes

| Doc | Verification Status | Coverage | Notes |
|-----|-------------------|----------|-------|
| research_code_flow.md | High | Frame structure, dispatch | Spine doc; everything else hangs off this |
| research_player_movement.md | High | Input, movement, animation | Newly generated; verified against Code.md |
| research_coordinate_system.md | High–medium | Addressing, rendering | Most items [verified]; scroll pacing ⚠ |
| research_hardware.md | High | CPU, memory, I/O | Detailed; parts from MAME cross-check |
| research_stage_structure.md | High | State machine, init, waves | Every claim [verified] with address |
| research_enemy_motion.md | High | Path-following, animation | Detailed; alien motion + explosion/bonus machinery (bird/mothership covered separately) |
| research_rendering.md | High | Sprite decode, collision | Detailed; includes optional PROM color check |
| research_bird_stage.md | Medium–high | Bird `$3400` dispatch, maturity, wing-hit | Verified for dispatch + RAM + hit entry; T3F80/T3FC0 selection + offsets +3/+6 + `$2600` flagged as open (§10) |
| research_mothership.md | High | JT4 stages 8/9/A/B, GameStates 6/7, shield-block + pilot kill + explosion + score | All open questions resolved post-step-12 (§10 has resolution notes). §11 sub-step plan collapsed to outcomes + 4 port deviations. §1-§9 preserved as research-time notes. |
| research_explosion_visual.md | High | L20E8 central 4×4 pulse + L2085 scattered-debris walk shared by player + mothership explosions | Every claim [verified] against `Code.md $2085-$20E2` + ROM tables T2800/T2900/T2A00/T2B00. Walk math cross-checked byte-for-byte with `tools/simulate_l2085.py`. §9-§10 cover port implementation + calibration. |

---

## Additional Resources

- **Local disassembly clone:** `Code.md` (8085 listing + comments)
- **Original source:** https://www.computerarcheology.com/Arcade/Phoenix/
- **MAME driver:** https://github.com/mamedev/mame/blob/master/src/mame/phoenix/
- **Reference port:** `space_invaders/` (simpler, but same architecture pattern)

---

## End Notes

These 7 documents form a complete specification for the Phoenix arcade game. Together they provide:

- **What to build:** Game state structure, frame loop, dispatch tables
- **How to render:** Tile decode, coordinate mapping, collision
- **How to control:** Input polling, edge detection, movement boundaries
- **How it plays:** Wave cycles, alien AI, mothership boss mechanics

No guesswork required. Every section maps to an address in `Code.md` and can be verified against MAME or the original cabinet.

---

**Last updated:** May 20, 2026  
**Status:** Step 14 (splash + coin/start) ✅ done — all of 14.A-I landed plus a prompt-screen extension (T19C0 "PUSH / ONLY 1PLAYER BUTTON" replaces the splash when `coinCount > 0`). The state-5 `player1Lives = 3` workaround has been removed; 14.H's start handler is now the lives-init source. Companion fixes for the death/respawn and game-over → new-game paths landed alongside: five source-faithful clears (enemy bullets in `initPlayerDataStructure`; alien slots beyond `aliensLeft-1` in `initAlienData`; state-4 `a5==$20` FG wipe expanded to mirror `$0380 ClearForeground`; `_enterIntroMode` zeros `levelAndRound`/`counterB9`/`birdsLeft` + re-seeds `aliensLeft=16` per `$0154`; start-press zeros `score1`/`score2` per `$032E ClearAndPrintScores`), plus HiScore tracking (`state.hiScore` + `scoring.updateHiScore` — port of `$02F0 UpdateHiScore`; updates at start-press just before the score zero so the previous game's record gets a chance to bump the header column). Player-side code refactored into `states_player.js` mixin (8 methods — playerUpdate / playerBulletUpdate / mappedPlayerX / onPlayerHit / state4_PlayerExplosion / _drawPlayerParticleFrame / _playerRespawnDecision / state5_GameOver), matching the mothership 12.0 / intro 14.A pattern. **DrawShields `$0AA0` visual landed** — `SHIP_SHIELD_SPRITES` (T1770, 4 frames × 16 tiles) extracted; `playerUpdate` rewritten with the source-faithful two-phase ACTIVE/COOLDOWN state machine; `onPlayerHit` gate tightened from `> 0` to `> 0xC0` so only the ~1 s ACTIVE phase absorbs hits. `alienVsPlayerCollision` gains a parallel branch mirroring source `$0F00 → $0F74 → $0EAD` — aliens that intersect the damage zone during ACTIVE die (with bonus). Subsequent collision-detection audit surfaced two more gaps that landed in the same commit: source's normal-path alien-body hit kills BOTH alien ($0F4E JP $0EAD) and player ($0F46 CALL $0CC4) — port was only killing the player; and source's `$3980 → $39F0` bird-body-vs-player path (uses the player bullet as a screen-RAM probe) was entirely unimplemented — birds could swoop through the ship without consequence. New `birdVsPlayerCollision` in states.js + bird-stage wiring matches source's "bird always dies on contact; player dies or shield drains one frame" semantics. Three prior research claims corrected: the "255 frames ≈ 4.25 s shield duration" in `research_player_movement.md §3.4` (active is ~1 s; the 255-frame figure is the full re-fire cycle); the "source has no shield gate for alien-body hits" in `research_player_ship.md §5` ($0F00 dispatches on ShieldCount before any tile scan); and the "TODO: $3980 is cosmetic" comment in states.js stageBirdCombat (wrong — $3980 is the actual bird-kills-player path, now documented in `research_bird_stage.md §6.5`).  
**Next step:** Step 15 attract-mode demo (`$03B0 GameDemo` + `$0173 GetPlayerInputsForDemo`). Removing the `$06B0` placeholder shortcut in `introFrame` lets the source-faithful `$1510` trigger take over. After step 15, step 16 sound. Lower-priority gaps: bonus-life-at-threshold, 2-player swap, round-difficulty scaling beyond round 2.
