# Progress — phoenix_clone

Implementation tracker for the Phoenix HTML5/ES6 port. The 9-step plan
is defined in [`research_code_flow.md` §5.4](research_code_flow.md);
this doc records what's been built against it and what's next.

Sibling docs:
- `../CLAUDE.md` — per-project conventions
- `research_*.md` — domain research (currently-true content only)
- `../architecture.html` *(planned)* — code-flow map / resume diagram

## Legend

| Mark | Meaning |
|------|---------|
| ✅   | Done |
| 🚧   | In progress — sub-tasks listed below |
| ⏳   | Pending — not started |
| ⏸️   | Deferred (intentional) |

## Steps

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Tile decode + render skeleton (player ship visible) | ✅ | `state.player` placeholder draws via `gfx.drawObject`; tile-ROM decoded into `resource.fgTileImages[]`/`bgTileImages[]`; debug overlay (`G` key) cycles fg/bg sheets |
| 2 | Cold-init path (`$0008` → `InitSoundScreen` → `PrintTextLines`) | ✅ | Three T1800 score / coin rows render at boot before any state-machine ticks. Static-text-table format documented in `research_rendering.md` §4.3; build pipeline extracts T1800 from `maincpu.bin` via `tools/build_data.py`. |
| 3 | Background tile-grid + scrolling | ✅ | Three sub-steps: **3.1** added 832-byte `state.bgTiles` + `state.counterB9` + skeleton `drawBackground()` + `starsScrollDown()` stub wired into `stageAlienFadeIn`. **3.2** ported `StarsScrollDown $067A` row-fill with emulated D/E register arithmetic (writes 26 tiles per 8-pixel scroll boundary from `STARFIELD_T1C00`/`T1F00`, saves advanced LSB back to `stageBlock[8]`). **3.3** ported `AddPlanetsToBackground $06B0` + `AddGalaxiesToBackground $2040` + `bgUpdate` wrapper (= `L06F0`), wired `$24C4 bgUpdateIfAlienStage` into combat lanes 0+3 and stage-clear lane-1 so BG keeps scrolling during alien combat (source: $24C4 calls $06F0 conditionally on stage < 8 — I missed this initially and had to add after Zane caught BG-frozen-in-combat from YouTube footage). **Major port deviation** (`research_rendering.md §4.2`): `bgTiles` is **33 rows** (not source's 32) with row 0 reserved as a hidden row above the canvas; `drawBackground` uses smooth 1-px-per-tick `state.scrollPixel` instead of the source's modulo-256-wrap scroll register; star-fill writes the hidden row only, and the buffer rotates down every 8 ticks. Galaxies + planets override source's row formula and force placement at the top (galaxy → `bgTiles[1]`; planet UL/UR → `bgTiles[0]` hidden, LL/LR → `bgTiles[1]` so spawn shows just the bottom half). All three port deviations are to fix a real source-era artifact (stars/galaxies/planets briefly appear at display row 0 then erase at row 1 on each scroll-cycle wrap) — confirmed present in the arcade but masked by CRT decay and motion-tracking, exposed by pixel-perfect canvas rendering. Verification trail dated 2026-05-17. |
| 4 | Input poll + main-loop skeleton (empty handlers) | ✅ | State 0/1/2/3 timing matches L0430/L04AC/L0515/L0800 (state 1 = 128 frames; per L04BD Counter9A is zeroed every state-1 frame except the $7F first iteration). Score-flash paints/erases the active player's 6 digits via `scoring.printNumber`/`eraseDigits` based on bit 3 of CounterA5 (L04C4); `UpdateScoresAndSound` (L2700) wired as a stub — buffer at $4370-$437F is empty until enemies hit, sound deferred. Coin debounce (WaitVBlankCoin tail) lands with attract mode. |
| 5 | State 0 → 1 (score flash) → 2 (stage 0 init) → 3 (stage 0 fade-in → stage 1 sit) | ✅ | State 2 ports L0515 chain: $0580 InitGlobalLevelData (T0598 + STAGE_BLOCKS), $0547 InitPlayerDataStructure (T0560 → player x/y), $0532 alien-data init ($05EC T1500 → controlA/B, $0650 T1520 move-ptr carried unused, $0610 T063A → T1540+ formation lookup). State 3 dispatches JT4; stage 0 ports L0834 fade-in (counterB4 decrement, GetAnimationChrs walks controlB through $6C/$6D/$6E/$6F/$68 in 4-frame phases below counterB4=$15, L05FA per-frame all-alien rewrite, L0848 stage-clear → LevelAndRound++ + GameState=2). Stage 1 (L2000) is a no-op stub — aliens sit in formation with controlA=$09 controlB=$60 (T1420 shape #1) until step 6. Render dispatch mirrors Bit3Controller: low3=0 Draw 1×1 (controlB raw, fade-in), low3=1 Draw 2×1 (T1420[controlB..+1] horizontal), 3 Draw 1×2, 4 Draw 2×2. Player.alive guards drawing until state 2 runs. Deferred: $06F0 background scroll → step 3 (stub means screen stays black for the first ~$EA frames of stage 0); alien motion and T1520 consumption → step 6; player input/fire and L2000 body → step 7; attack swoops → step 8. |
| 6 | Alien combat motion + animation (`L2000` body) | ✅ | `AlienMovementUpdate $0D1C` (path-following, 8-px grid advance) and `AlienAnimationUpdate $0D70` (path+(x,y) → `controlB`) ported and driven from `stageAlienCombat`. Two port-specific corrections vs. the source's lane model (both documented in `research_rendering.md` §9): variant-mode dispatches draw at tile-aligned `(x & ~7, y & ~7)` so pre-shift tile offsets aren't double-counted by `drawImage`; and movement+animation collapse onto the same lane so `alien.x` and `alien.controlB` always update atomically (fixes a 30 Hz tick-pairing stutter). Known faithful artifact: 1-frame half-alien at fade-in→combat transition (research_rendering.md §9.4). Defers: `AlienBehaviorUpdate $3000` swoops, `EnemyBulletUpdate`/`L2560` fire, kill mechanic — bundled with player firing in step 7+. |
| 7 | Player movement + bullet (`PlayerUpdate $0876`) | ✅ | `playerUpdate()` ports L0876 chain: L0900 left/right movement (boundaries $0C–$C0), L0926+T1600 pre-shifted tile variant selection (non-linear lookup, draw at `X & ~7` same as alien snap-draw), shield counter ($FF on barrier edge, decrement each frame), `playerBulletUpdate()` for L0930 (spawn at PlayerX+4 / PlayerY-8, move −8Y/frame, deactivate at Y<$1F). `render.drawPlayer()` added (2×2 tiles at tile-snapped X). Canvas port: T1600 lookup preserved (correct cycle phase); Y variant and T0B38 column-split skipped (canvas drawImage takes exact coords). Input import fix also landed here. |
| 8 | Alien combat (state 3 stage 1, `$2000`) + AABB collision | ✅ | `AlienBehaviorUpdate $3000` swoop scheduler ported source-faithfully: 8-state Counter93 dispatch, T3300/T3310/T3330 pattern lookup with L/R asymmetry + Y-band-or-phase-count branch (`behaviorPickPattern` mirrors `L31B4` byte-for-byte), ptr-LSB sync gate in `behaviorPickAlien` (`L315A`), `behaviorScanAdvance` + `behaviorCommit` matching against `alienSwoopLsb`. Closed-loop swoop paths traversed via two 1 KB `PATH_ROM_LOW`/`PATH_ROM_HIGH` slices covering $1000-$13FF (T1020-T13D0) and $2C00-$2FFF (T2C00-T2FA0), labeled per-pattern + `PATTERNS` dict export. AABB collision: `playerBulletCollision`, `alienVsPlayerCollision` (currently disabled — see Known issues), `onAlienHit`, `onPlayerHit`. `stageClearUpdate`. `scoring.js` ported. **Lane swap**: movement+animation on lane-0, behavior on lane-1 (source: opposite). The swap is what makes swoop dx=±4 alignment work without port-specific x-snap hacks; lets all sub-states stay source-faithful (`research_enemy_motion.md §1.0`). **2×2 sprite rendering**: tile order is column-major (`[UL, LL, UR, LR]`, not row-major) because Phoenix's CRT is rotated; partial-sprite variants from source's tile-persistence cycle substituted with last-known-full controlB and drawn at exact `(x, y)` (`research_rendering.md §2.5`). Open issues tracked under "Known deferred issues" below. |
| 8a-e | Swoop pipeline hardening | ✅ | **8a**: re-enabled `behaviorAngryPattern` (debug `return;` removed). **8b**: source-faithful `behaviorCooldown` port — L30BA tick-down of three secondary timers + new `cooldownReseed` helper implementing L30E4 + L3112 (primary cooldown derived from `Counter9A` high byte + `computeLevelFactor` + secondary-timer state). **8c**: source-faithful `behaviorSwoopCount` port — L3124 cap formula `((LR RRCA RRCA) & 0x0F) + 5` with "reset to 5 if ≥ 0x11" branch, `alienPhaseCount`-shrinking cap, and `roll < cap ? roll : 1` selection. **8d**: stage 4+ stop-gap — `stageClearUpdate` wraps `LevelAndRound` to next round's stage 0 instead of advancing into unimplemented stages (spiral-fill/birds/mothership), keeping play looping through alien waves until step 11 lands. **8e**: `state2_StageInit` zero-fills all 12 modeled fields in `$4350-$435B` (L32B0 mirror) so `alienPhaseCount` and friends reset between stages — fixes a latent bug where the angry-wave triple on wave-1 would have suppressed all future angry waves. Timing interlock between lane swap, movement+animation merge, and Counter93 dispatch phase documented at `research_enemy_motion.md §1.0.1` with `⚠` pointers from `stageAlienCombat`, `alienMovementUpdate`, `alienAnimationUpdate`, and `alienBehaviorUpdate`. |
| 8f | L2146 depleted-formation routing | ✅ | Source-faithful port of the `$435E` sticky flag + L2146 dispatch. When `AliensLeft<5` and the masked counter reaches 0, `aliensLeftFlag` (mirror of `$435E`) latches `$FF`; subsequent frames OR lanes 2 and 3 into the existing lane-0/lane-1 handlers, doubling movement and behavior to every-2-frames instead of every-4. Flag cleared by L32B0 zero-fill at state-2 init. New `state.aliensLeftFlag` field. Lane mapping preserves the §1.0 lane swap and §1.0.1 interlock (none of the three interlocked knobs touched). Port-side detail in `research_enemy_motion.md §1.0.3`. |
| 9 | Alien bullet (`L2560` / `EnemyBulletUpdate`) | ✅ | `enemyBulletUpdate` ports L0C40 chain (per-slot fall +4 y/tick, shape-bit-2 animation toggle, deactivate at y≥$F9). `enemyFireScanAndSpawn` ports the L2560 → L2596 → L25B7 → L25E0 chain: column-pick via `counter93 & 1`, 8-alien scan with controlA/controlB/y/x filters, round-based slot cap (3/4/5 for rounds 0/1/2+), spawn at `(alienX+4, alienY+0x0C)` with pseudo-random shape in $58-$5F. New `state.enemyBullets[5]` (mirror of $43CC-$43DF), `mappedPlayerX()` helper (L097A inline). Lane dispatch: enemyBulletUpdate on full lanes 0+3 (matches source's 30 Hz cadence from source lanes 1+3), enemyFireScanAndSpawn on full lane 2 (source lane 2); in depleted both bundled onto port lanes 1+3 mirroring source L2190. Port mapping detail in `research_enemy_motion.md §1.0.4`. **Player-hit path NOT ported** (per user direction): L0CB4/L0CC4 skipped, bullets pass through player harmlessly. Re-enabling alien-vs-player collision and the L0CB4 enemy-bullet → player path is deferred to a follow-up alongside lives / proper state-4 explosion. |
| 10 | Alien-kill explosion + stage-clear pause activity + bonus-kill popup | ✅ | Original framing was "fade-out symmetric to L0834 fade-in"; research showed source has no fade-out — it has per-kill explosions during the pause. Implemented `L0FC0` (`explosionUpdate` — 2 alien-kill slots at $4370/$4374, T17B0-driven 4-frame tile cycle) + `L38F8` (`spawnExplosion` — first-free-slot allocator wired through `onAlienHit`) + restructured `stageClearUpdate(lane)` as a `L21BA` bit-0 dispatch (residual bullets + explosions on bit-0=1 during the pause, countdown on every frame). Hoisted `combatLane` read+increment to BEFORE the `aliensLeft===0` check in `stageAlienCombat`, mirroring source `L2000` order. Fixed `onAlienHit` per-alien-type scoring: 20 pts for formation kills (`alienMovePtr < 0x1020`), 40 pts for swoops, **200 pts for bonus kills** (when alien's current path byte is 7 or 8 — the "climbing back from dive" motions, scattered through most swoop patterns). Sub-step 10.7 also landed the **bonus explosion machinery**: `state.bonusExplosions[2]` (mirror of $4378/$437C), `bonusExplosionUpdate` (port `L3758`), `spawnBonusExplosion`, `drawBonusExplosions` (6×2 sprite T17D0+T17D6 + 3-digit score popup overlay via `L37B0`-equivalent), spreading-halves animation (per-side spread = `((0x0F - counter) & 0x0E) << 2` pixels, walks 0 → 56 over 16 ticks). New `state.explosions[2]` with port-only `frameLsb` field that stores the pre-decrement tile-table lookup so `drawExplosions` matches source's pre-decrement timing despite the update/render split. New `ALIEN_EXPLOSION_ROM` data export (70 bytes at $17B0, covers T17B0 + frame data for alien frames #1-#5 + bonus halves T17D0/T17D6). Port mapping detail in `research_enemy_motion.md §1.0.5` (alien explosion) and `§1.0.6` (bonus explosion). **Player-hit path still skipped** (per step 9 carryover): bullets fall through harmlessly, `alienVsPlayerCollision` still disabled. |
| 11 | Birds (`$3400`) — stages 4-7 | ✅ | Bird-stage research in `research_bird_stage.md`. Sub-step landings: **11.1** init (`$32B0`), **11.2** dispatch (`$3400`), **11.3** update engine (`$35B0` + T3F00 + T3E80), **11.4** hit detection (`$3800`/`$38E9`/`$3844`) all landed in initial step-11 commit. **11.5 stage-clear cleanup (2026-05-18):** `stageBirdClear` ports `$3462` even-parity countdown + residual physics tail; without it the bird stage would freeze when BirdsLeft hit 0. **11.6 spiral-fill intro (2026-05-18):** `stageSpiralFill` + `spiralDrawCells` + `spiralFillExit` port `$2230` / `$2260` / `$2292` end-to-end (asterisk wipe over ~52 frames, BG cleared via `$22F0 ClearBackground` at exit, state advances). New `state.fgOverlay` Map renders overlay tiles on top of FG. **11.7 bird-fire bullets** (`$3930`/`$25B7`), **11.8 per-shape body-hit scoring** (`$385D-$388D` + `$3894`), **11.9 wing-hit T3DB8 shape swap** (`$38BC`) all landed in commit `9f53abb` (2026-05-17). **11.10 stage transitions + polish (2026-05-18):** spiral-fill + bird-clear + JT4 cases 4/6 + stop-gap narrowed `>=4` → `>=8`; player visibility fix (`initPlayerDataStructure` clears `player.alive`, mirroring source `$0552` clearing `$43E0-$43FF`); bird vertical-movement polish (bird-count-dependent counterB9 clamp + split-draw wrap in `drawBird`); palette switching wired (`$041E SetBitsVideoRegister` mirror in `state2_StageInit` writes LR bit 1 to `resource.setPaletteBank`, two pre-decoded tile-bitmap sets at init). Debug `K` cheat-key kills all live enemies in current combat stage; `DEBUG_START_LEVEL_AND_ROUND` reset to `null` for cold-start play-through. |
| 12 | Mothership (`$22B4`/`$22CA`) + shield-block tile-swapping + remove 8d wrap stop-gap | ✅ | Closes out the 5-stage round cycle. Research in `research_mothership.md`. Landed across 11 commits 2026-05-18: **12.0** mixin skeleton (`states_mothership.js`, first use of mixin pattern). **12.1** stage 8 spiral-fill → T1C00 mothership-era starfield. **12.2** stage 9 `$22B4` lone fade-in (T1D00 mothership graphic scrolls in via existing starsScrollDown — `$4367` flag confirmed vestigial / no source readers). **12.3** stage A `$22CA` mothership + aliens fade-in (one-shot first frame + piggy-back on stageAlienFadeIn). **12.4 skipped** (case B already wired by earlier alien-combat work). **12.5** shield-block collision (`$2351`/`$237B`/`$2398`) with SHIELD_T1B40/T1B50 progression tables; key bug fix during testing: source's `DEC L` is row-up in canvas (`idx-26`), not col-left. **12.5a** belt animation `$22FA` driven by m43AA cadence. **12.5b** antenna/pilot animation `$2322` from T1BC0 (8-frame cycle) + port-only one-time bgTiles shift at stage A→B (compensates for the missing `$24E0` continuous-scroll so mothership lands at arcade-faithful position). **12.6** mothership return fire `$24F2` (player-tracking via mappedPlayerX, shared `spawnEnemyBulletAtXY` helper). **12.7** pilot kill `$23C7` → GameState 6 `$2400` (particle explosion + EraseMothership) → GameState 7 `$244C` (score-display timer + next-round advance). **12.8** mothership bonus score `$2520` (BCD-decoded ((LR>>4)*16 + (counterB9+$60)/2) × 100, capped at $9000, credited to player) + K cheat triggers pilot kill on stage B. **12.9** particle explosion animation (T1B60/70/80 sprites + T1B90 selector). **12.10** ported `$21D2` stage-B respawn (mothership combat never auto-clears by alien kills); removed JT4 stop-gap entirely from both `stageClearUpdate` and `stageBirdClear`; ported `$24E0` mothership continuous-scroll + dynamic belt/antenna/particle row tracking via `findBeltRow` scan (replaces 12.5b one-time shift); particle position centered on pilot; bonus-score popup at mothership position via fgOverlay (4 BCD digits, persists through state6+7 until ClearForeground at state7 tail). **Remaining port deviations** (documented at `research_mothership.md §10`): second particle-draw path (`$2085` + T2A00/T2B00 on odd-CounterA5 ticks) deferred — explosion uses single-particle pipeline instead of source's denser dual-particle visual. |
| – | Sound (MN6221AA bit-field synthesis) | ⏸️ | Per `research_hardware.md` §5; only matters for audio fidelity |

## What's missing (post-step-12)

All 12 step rows above are ✅ done — full 5-stage round cycle plays
through end-to-end (alien × 2 → bird × 2 → mothership → next round).
What's listed below is what the arcade does that this port doesn't
yet (or does differently). Status as of 2026-05-18.

### Cross-cutting (affects all stages)

- **Player can't die.** `alienVsPlayerCollision` returns at the top
  (disabled since step 8); `enemyBulletUpdate` skips the L0CB4 → L0CC4
  player-hit check (since step 9). Net: alien bodies pass through the
  player, alien + mothership bullets fly through the player, the
  player is invincible everywhere. Re-enabling both is gated by:
  - **State 4 player-explosion animation** — currently a stub
    (`playerExplosionTimer` ticks but no visual)
  - **State 5 game over** — currently empty
  - **Lives counter** — `state.player1Lives` initialized to 3 but
    never decremented; lives icons drawn but static
  - **Bonus life at score threshold** — source awards an extra life
    at a certain score; not ported

- **Sound (entire MN6221AA bit-field synthesis)** — `research_hardware.md §5`
  documents the chip; nothing connected. Hit flags (`$4366`,
  `$4364`) are set by various paths but no audio system reads them.
  Step 13.

- **Attract mode / splash screen / coin-up flow.** Cold-start jumps
  straight to game mode (`state.gameOrAttract = 1` hardcoded). Coin
  input wired (Digit 5 key) and starts a game; no attract loop.

- **2-player mode.** Only P1 is the active player; P2's score row is
  drawn but inert. `state.gameAndDemoOrSplash` flag exists but no
  player-switch logic.

- **Round-difficulty scaling beyond round 2.** Most round-based scaling
  (alien speed, fire rate, swoop count) is hooked via `LR` reads in
  the existing code, but only rounds 0-2 have been exercised under
  test. Higher rounds may surface latent bugs.

### Per-system port deviations (intentional, documented)

- **Lane swap: movement+animation on lane-0, behavior on lane-1.**
  Source has behavior on lane-0 and movement+animation on lane-1.
  Port swaps them — required for swoop alignment so dx=±4 pattern
  bytes land at aligned `x%8 ∈ {0, 4}`. See
  `states.js:stageAlienCombat` + `research_enemy_motion.md §1.0`.
  Why source's lane order works in arcade without the swap is an
  open question.

- **Movement and animation merged into one lane.** Source runs
  them on separate lanes (1 frame apart); port runs them back-to-back
  in lane-0. See `research_rendering.md §9.2`.

- **2×2 sprite rendering deviation.** Source uses tile persistence in
  screen RAM to complete sprites across frames (its `SHAPE_LSB_TABLE`
  cycle includes "partial" variants); port has no screen-RAM buffer
  so partial variants would render with missing halves. Port keeps
  each alien's last-known full `controlB` and substitutes. See
  `render.js drawAlien` + `research_rendering.md §2.5`.

- **33-row BG buffer with smooth `scrollPixel`.** Source has a 32-row
  BG plane + hardware scroll register; port adds a hidden row 0 +
  smooth per-pixel scroll. Hides a wrap-and-erase artifact the
  arcade's CRT decay masked. See `research_rendering.md §4.2`.

- **Mothership scattered-particle explosion is visual-effect, not
  source-faithful.** Source's `$2085 + T2A00/T2B00` is a serpentine
  2D-blit with control-byte gating; port uses an angle/radius
  scatter at varying offsets for similar chaotic look. See
  `research_mothership.md §10` and the 12.x commit. **User-flagged
  topic for post-project discussion: faithful port vs visual-effect
  port trade-off.**

- **Mothership bonus-score popup at mothership position.** Done via
  fgOverlay digit tiles (12.10 piece C). Source uses PrintNumber to
  FG screen-RAM at exact source position; port places at a fixed
  mothership-center position. Functionally equivalent.

### Vestigial source flags (no readers, port skips)

These are set by source code at various points but no source routine
reads them. Port omits the writes. Listed for traceability:

- **`$4367`** "Mothership partially faded in" — set in `$22C3` / `$22D7`
- **`$43BC := $3F`** — set in `$22DB` (stage A first frame)
- **`$4363`** "Particle explosion start" — set in `$23D1`
- **`$436B`** "Mothership score display" — set in `$255B`

Not bugs — confirmed via grep that no other source code reads these
addresses (per research_mothership.md §3.1, §4, §7).

## Conventions for editing this doc

- Update in the same commit as the code/doc change being tracked.
- Don't cite commit SHAs — `git log --grep="step N"` is the authoritative answer to "when was X done." SHAs in checked-in docs go stale on rebases.
- Sub-task breakdowns live only for steps in 🚧 status; remove once the step closes.
- Deviations from the research docs go under the affected step row, then trigger a research-doc update in the same commit (research docs are currently-true only).
