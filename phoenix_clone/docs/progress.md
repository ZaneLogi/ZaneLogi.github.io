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
| 3 | Background tile-grid + scrolling | ⏳ | Step originally placed early in the plan but skipped past in favor of getting combat working. Resumed in the post-step-8 plan (after stage transition lands). `state.bgTiles[]`, `state.bgScrollY`, `drawBackground()` first then FG on top. |
| 4 | Input poll + main-loop skeleton (empty handlers) | ✅ | State 0/1/2/3 timing matches L0430/L04AC/L0515/L0800 (state 1 = 128 frames; per L04BD Counter9A is zeroed every state-1 frame except the $7F first iteration). Score-flash paints/erases the active player's 6 digits via `scoring.printNumber`/`eraseDigits` based on bit 3 of CounterA5 (L04C4); `UpdateScoresAndSound` (L2700) wired as a stub — buffer at $4370-$437F is empty until enemies hit, sound deferred. Coin debounce (WaitVBlankCoin tail) lands with attract mode. |
| 5 | State 0 → 1 (score flash) → 2 (stage 0 init) → 3 (stage 0 fade-in → stage 1 sit) | ✅ | State 2 ports L0515 chain: $0580 InitGlobalLevelData (T0598 + STAGE_BLOCKS), $0547 InitPlayerDataStructure (T0560 → player x/y), $0532 alien-data init ($05EC T1500 → controlA/B, $0650 T1520 move-ptr carried unused, $0610 T063A → T1540+ formation lookup). State 3 dispatches JT4; stage 0 ports L0834 fade-in (counterB4 decrement, GetAnimationChrs walks controlB through $6C/$6D/$6E/$6F/$68 in 4-frame phases below counterB4=$15, L05FA per-frame all-alien rewrite, L0848 stage-clear → LevelAndRound++ + GameState=2). Stage 1 (L2000) is a no-op stub — aliens sit in formation with controlA=$09 controlB=$60 (T1420 shape #1) until step 6. Render dispatch mirrors Bit3Controller: low3=0 Draw 1×1 (controlB raw, fade-in), low3=1 Draw 2×1 (T1420[controlB..+1] horizontal), 3 Draw 1×2, 4 Draw 2×2. Player.alive guards drawing until state 2 runs. Deferred: $06F0 background scroll → step 3 (stub means screen stays black for the first ~$EA frames of stage 0); alien motion and T1520 consumption → step 6; player input/fire and L2000 body → step 7; attack swoops → step 8. |
| 6 | Alien combat motion + animation (`L2000` body) | ✅ | `AlienMovementUpdate $0D1C` (path-following, 8-px grid advance) and `AlienAnimationUpdate $0D70` (path+(x,y) → `controlB`) ported and driven from `stageAlienCombat`. Two port-specific corrections vs. the source's lane model (both documented in `research_rendering.md` §9): variant-mode dispatches draw at tile-aligned `(x & ~7, y & ~7)` so pre-shift tile offsets aren't double-counted by `drawImage`; and movement+animation collapse onto the same lane so `alien.x` and `alien.controlB` always update atomically (fixes a 30 Hz tick-pairing stutter). Known faithful artifact: 1-frame half-alien at fade-in→combat transition (research_rendering.md §9.4). Defers: `AlienBehaviorUpdate $3000` swoops, `EnemyBulletUpdate`/`L2560` fire, kill mechanic — bundled with player firing in step 7+. |
| 7 | Player movement + bullet (`PlayerUpdate $0876`) | ✅ | `playerUpdate()` ports L0876 chain: L0900 left/right movement (boundaries $0C–$C0), L0926+T1600 pre-shifted tile variant selection (non-linear lookup, draw at `X & ~7` same as alien snap-draw), shield counter ($FF on barrier edge, decrement each frame), `playerBulletUpdate()` for L0930 (spawn at PlayerX+4 / PlayerY-8, move −8Y/frame, deactivate at Y<$1F). `render.drawPlayer()` added (2×2 tiles at tile-snapped X). Canvas port: T1600 lookup preserved (correct cycle phase); Y variant and T0B38 column-split skipped (canvas drawImage takes exact coords). Input import fix also landed here. |
| 8 | Alien combat (state 3 stage 1, `$2000`) + AABB collision | ✅ | `AlienBehaviorUpdate $3000` swoop scheduler ported source-faithfully: 8-state Counter93 dispatch, T3300/T3310/T3330 pattern lookup with L/R asymmetry + Y-band-or-phase-count branch (`behaviorPickPattern` mirrors `L31B4` byte-for-byte), ptr-LSB sync gate in `behaviorPickAlien` (`L315A`), `behaviorScanAdvance` + `behaviorCommit` matching against `alienSwoopLsb`. Closed-loop swoop paths traversed via two 1 KB `PATH_ROM_LOW`/`PATH_ROM_HIGH` slices covering $1000-$13FF (T1020-T13D0) and $2C00-$2FFF (T2C00-T2FA0), labeled per-pattern + `PATTERNS` dict export. AABB collision: `playerBulletCollision`, `alienVsPlayerCollision` (currently disabled — see Known issues), `onAlienHit`, `onPlayerHit`. `stageClearUpdate`. `scoring.js` ported. **Lane swap**: movement+animation on lane-0, behavior on lane-1 (source: opposite). The swap is what makes swoop dx=±4 alignment work without port-specific x-snap hacks; lets all sub-states stay source-faithful (`research_enemy_motion.md §1.0`). **2×2 sprite rendering**: tile order is column-major (`[UL, LL, UR, LR]`, not row-major) because Phoenix's CRT is rotated; partial-sprite variants from source's tile-persistence cycle substituted with last-known-full controlB and drawn at exact `(x, y)` (`research_rendering.md §2.5`). Open issues tracked under "Known deferred issues" below. |
| 8a-e | Swoop pipeline hardening | ✅ | **8a**: re-enabled `behaviorAngryPattern` (debug `return;` removed). **8b**: source-faithful `behaviorCooldown` port — L30BA tick-down of three secondary timers + new `cooldownReseed` helper implementing L30E4 + L3112 (primary cooldown derived from `Counter9A` high byte + `computeLevelFactor` + secondary-timer state). **8c**: source-faithful `behaviorSwoopCount` port — L3124 cap formula `((LR RRCA RRCA) & 0x0F) + 5` with "reset to 5 if ≥ 0x11" branch, `alienPhaseCount`-shrinking cap, and `roll < cap ? roll : 1` selection. **8d**: stage 4+ stop-gap — `stageClearUpdate` wraps `LevelAndRound` to next round's stage 0 instead of advancing into unimplemented stages (spiral-fill/birds/mothership), keeping play looping through alien waves until step 11 lands. **8e**: `state2_StageInit` zero-fills all 12 modeled fields in `$4350-$435B` (L32B0 mirror) so `alienPhaseCount` and friends reset between stages — fixes a latent bug where the angry-wave triple on wave-1 would have suppressed all future angry waves. Timing interlock between lane swap, movement+animation merge, and Counter93 dispatch phase documented at `research_enemy_motion.md §1.0.1` with `⚠` pointers from `stageAlienCombat`, `alienMovementUpdate`, `alienAnimationUpdate`, and `alienBehaviorUpdate`. |
| 8f | L2146 depleted-formation routing | ✅ | Source-faithful port of the `$435E` sticky flag + L2146 dispatch. When `AliensLeft<5` and the masked counter reaches 0, `aliensLeftFlag` (mirror of `$435E`) latches `$FF`; subsequent frames OR lanes 2 and 3 into the existing lane-0/lane-1 handlers, doubling movement and behavior to every-2-frames instead of every-4. Flag cleared by L32B0 zero-fill at state-2 init. New `state.aliensLeftFlag` field. Lane mapping preserves the §1.0 lane swap and §1.0.1 interlock (none of the three interlocked knobs touched). Port-side detail in `research_enemy_motion.md §1.0.3`. |
| 9 | Alien bullet (`L2560` / `EnemyBulletUpdate`) + re-enable `alienVsPlayerCollision` | ⏳ | Add enemy fire trigger and bullet update lanes; re-enable alien-vs-player collision once state-4 player-explosion has lives/explosion-anim coverage (may need its own sub-step). Slots into existing combat lane structure (lane 2 in full-formation, doubled to lanes 0,2 in depleted via the L2146 mapping). |
| 10 | Stage→stage transition visual | ⏳ | Fade-out + JT4 stage advance — symmetric to step-5's L0834 fade-in. Same GetAnimationChrs / controlA/B phasing machinery. Remove step-8d `LevelAndRound` wrap stop-gap when the full transition lands (or when step 11 lands, whichever first). |
| 11 | Birds (`$3400`) + mothership (`$22B4`/`$22CA`) + shield-block tile-swapping | ⏳ | Renumbered from old step 9. Pulls in still-open mothership research. Closes out the 5-stage round cycle; remove the 8d wrap stop-gap as part of this. |
| – | Sound (MN6221AA bit-field synthesis) | ⏸️ | Per `research_hardware.md` §5; only matters for audio fidelity |

## Known deferred issues

Items where the port currently deviates from source behavior in a way
the user can observe at runtime. Listed here (not buried in step rows)
so they don't get lost. Resolve in step 9 or a dedicated cleanup pass.

- **Lane swap: movement+animation on lane-0, behavior on lane-1.**
  Source has behavior on lane-0 and movement+animation on lanes 1+2.
  Our port runs movement+animation on lane-0 and behavior on lane-1
  (a 1-frame shift). This is **required for swoop alignment**: it
  puts alien grid-crossings one frame before `behaviorCommit` reads
  the alien's position, so dx=±4 swoop pattern bytes land on aligned
  `x%8 ∈ {0, 4}`. Documented at `states.js:stageAlienCombat` and
  `research_enemy_motion.md §1.0`. Why source's lane order works in
  arcade Phoenix without this swap is an open question (likely
  source's much longer `L30E4`-seeded cooldown shifts the phase
  before commits start firing).

- **`alienVsPlayerCollision` disabled.** Returns at the top. When
  enabled, it routes to `gameState=4` (player-explosion), but
  state-4 is a stub: no lives counter, no explosion sprite, no
  game-over. Visually the player just briefly vanishes and reappears
  during a swoop, which is confusing. Re-enable as part of step 9
  (alien bullet) once lives / explosion-anim / game-over are in
  place — may need a sub-step.

- **Stage 4+ stop-gap: LR wraps to next round's stage 0.** Step 8d
  added a wrap in `stageClearUpdate` so when `LevelAndRound`'s stage
  nibble reaches 4 (spiral-fill, where step 11's stages begin), it
  resets to 0 and the round nibble bumps. Lets play loop indefinitely
  through alien waves while bird/mothership stages are unimplemented.
  **Remove this wrap when step 11 lands** (or when step 10's stage
  transition cleanly hands off into the unimplemented stages) so the
  full 5-stage round cycle plays through.

- **Movement and animation merged into one lane.** Source runs
  movement on lane-1 and animation on lane-2 (1 frame apart in
  source's lane numbering); port runs both back-to-back inside
  `stageAlienCombat`'s lane-0 handler (which is the post-swap lane —
  see first item). Documented decision
  (`research_rendering.md §9.2`) — listed here for visibility, not
  for fixing.

- **2×2 sprite rendering deviation.** Source's `SHAPE_LSB_TABLE`
  cycle includes "partial" variants (some tiles = 0) that rely on
  tile persistence in screen RAM to complete the sprite from the
  previous frame's tiles. Our canvas clears per frame, so partial
  variants render with missing halves. Port-side fix: keep each
  alien's last-known FULL `controlB` and substitute it when current
  controlB is partial; draw at exact `(x, y)` instead of source's
  snap-draw + pre-shifted tiles. See `render.js drawAlien` case 4
  and `research_rendering.md §2.5`.

## Open research (gating future steps)

- **Bird-stage motion + egg hatching** (`L3400`) — gates step 11 bird stages; the alien-side motion is documented in `research_enemy_motion.md`
- **Mothership stage** (`$22B4` / `$22CA` fade-ins, `$2400` / `$244C` explosion+score) — gates step 11

## Conventions for editing this doc

- Update in the same commit as the code/doc change being tracked.
- Don't cite commit SHAs — `git log --grep="step N"` is the authoritative answer to "when was X done." SHAs in checked-in docs go stale on rebases.
- Sub-task breakdowns live only for steps in 🚧 status; remove once the step closes.
- Deviations from the research docs go under the affected step row, then trigger a research-doc update in the same commit (research docs are currently-true only).
