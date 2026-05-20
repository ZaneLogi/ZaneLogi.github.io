import { state } from './state.js';
import { scoring } from './scoring.js';
import { resource } from './resource.js';
import {
    PLAYER_INIT_BLOCK,    // source T0560
    STAGE_BLOCK_INDEX,    // source T0598
    STAGE_BLOCKS,         // source $05A8/$05B4/$05C0/$05CC
    ALIEN_BIRD_PARTITION, // source T1760 — used by state0_NewGameInit + stageClearUpdate
    STARFIELD_T1C00,      // source T1C00 — starfield used by stages 0/5/7
    STARFIELD_T1F00,      // source T1F00 — starfield used by stage 2
    STARFIELD_T1D00,      // source T1D00 — mothership graphic (26x9 upside-down) used by stage 9
    PLANET_TILES,         // source T1E00 — 8 planets × 4 tiles (2x2 col-major)
    PLANET_MSB,           // source T1E20 — screen-RAM MSBs per planet entry
    PLANET_LSB_OFF,       // source T1E40 — within-column LSB offsets per entry
    PLANET_COL_LSB,       // source T1E60 — PLANET_TILES offset per column
    GALAXY_TILES,         // source T1E80 — 16 galaxies × 1 tile
    GALAXY_MSB,           // source T1EA0 — screen-RAM MSBs per galaxy
    GALAXY_LSB,           // source T1EC0 — screen-RAM LSBs per galaxy
} from './data.js';

import { mothershipMixin } from './states_mothership.js';
import { introMixin }      from './states_intro.js';
import { playerMixin }     from './states_player.js';
import { explosionMixin }  from './states_explosion.js';
import { alienMixin }     from './states_alien.js';
import { birdMixin }      from './states_bird.js';

// Debug knob — when non-null, the first state-0 transition jumps directly
// to this LevelAndRound instead of starting at $00 (stage 0, round 1).
// Null disables the override → cold-start runs the full round cycle from
// stage 0 (alien wave 1).
const DEBUG_START_LEVEL_AND_ROUND = null;

// L0400 — Code.md:GameStateMachine. JT1 jump table → JS switch
// (research_code_flow.md §5.1).

// Offset of $05A8 inside the packed STAGE_BLOCKS slice (data.js exports the
// four 12-byte blocks $05A8/$05B4/$05C0/$05CC as one 48-byte array).
// STAGE_BLOCK_INDEX (source T0598) stores LSBs in the $A8..$CC range;
// subtract $A8 to get the slice index.
const STAGE_BLOCK_BASE = 0xA8;

// getPathByte / alienBox / s8 moved to states_alien.js (alien-only helpers).
// aabbHit moved to states_bird.js — all bird methods that used it live there now.

// Read a byte from the current starfield ROM page. Source uses
// HL = ($43B2 << 8) | $43B3, with INC L wrapping at the 256-byte page
// boundary (low byte only). $1C and $1F are starfields (stages 0/5/7
// and 2). $1D is the upside-down mothership graphic — selected by
// stage 9's stage block (T05CC byte 7 = $1D) so $22B4 / starsScrollDown
// scrolls the mothership down from the top during the fade-in window
// (9 row-refills = 72 frames = counterB4=$48 to 0). research_mothership.md §3.
function readStarfield(hi, lo) {
    if (hi === 0x1C) return STARFIELD_T1C00[lo & 0xFF];
    if (hi === 0x1D) return STARFIELD_T1D00[lo & 0xFF];
    if (hi === 0x1F) return STARFIELD_T1F00[lo & 0xFF];
    return 0;
}

// Write a tile byte into the BG plane using a source-style screen-RAM
// address. Inverse of L09BA GetScreenRamAddress with the BG-plane base
// $4800 instead of FG's $4000 — same formula as the static-text-table
// coord conversion (research_rendering.md §4.3):
//   plane_off = addr - $4800;
//   display_col = 25 - ((plane_off >> 5) & 0x1F);
//   display_row = plane_off & 0x1F;
// Writes whose plane_off lands outside the 832-byte visible region
// (e.g. $4B40-$4FFF — the overflow / alien-data / stack zone in
// source) are silently dropped. The source happily writes there too;
// those bytes just don't reach the display.
//
// Port-side row remap: bgTiles is 33 rows tall, with bgTiles[0] reserved
// as the hidden top row (above the visible area; written by
// starsScrollDown). Source's display rows 0..31 map to bgTiles[1..32].
// Galaxy / planet writes therefore go to (source_row + 1).
function bgWrite(addr, tile) {
    const off = (addr - 0x4800) & 0xFFFF;
    if (off >= 832) return;
    const col = 25 - ((off >> 5) & 0x1F);
    const row = (off & 0x1F) + 1;     // +1 — skip hidden row 0
    state.bgTiles[row * 26 + col] = tile;
}

export const states = {
    // Mothership stage handlers (JT4 8/9/A/B + JT1 states 6/7) live in
    // states_mothership.js. Spread first so any same-name method defined
    // explicitly below this point wins (left-to-right spread semantics).
    ...mothershipMixin,
    // L002D attract path (splash + demo) lives in states_intro.js — port-side
    // umbrella name for what source calls "Attract mode". Step 14.
    ...introMixin,
    // L0876 PlayerUpdate + L0AEA/L0B15/L0B60 death cycle live in
    // states_player.js. Bundled together because all eight methods cite
    // research_player_movement.md / research_player_ship.md.
    ...playerMixin,
    // L38F8 / L0EC3 spawn + L0FC0 / L3758 update live in
    // states_explosion.js. Shared by alien-kill, bird-kill, and
    // mothership-pilot-kill paths; carved out ahead of the L2085
    // visual-effect port (research_explosion_visual.md).
    ...explosionMixin,
    // Alien subsystem (L0532/L0834/L2000/L0D1C/L0D70/L3000/L0DF0/L0F00/
    // L0C40/L2560/L21BA) lives in states_alien.js.
    ...alienMixin,
    // Bird-stage subsystem (L3400/L3462/$32B0 + motion/maturity engine)
    // lives in states_bird.js.
    ...birdMixin,

    dispatch() {
        switch (state.gameState) {
            case 0: this.state0_NewGameInit(); break;
            case 1: this.state1_ScoreFlash(); break;
            case 2: this.state2_StageInit(); break;
            case 3: this.state3_Gameplay(); break;
            case 4: this.state4_PlayerExplosion(); break;
            case 5: this.state5_GameOver(); break;
            case 6: this.state6_MothershipExplosion(); break;
            case 7: this.state7_MothershipScore(); break;
        }
    },

    // L0430 — one-shot seed; arms CounterA5 and routes to state 1.
    // Source path also runs L0350 GetPlayerLivesFromDip → L0367 UpdateLivesScreen
    // here (the DIP read is stubbed in the port — state.player1Lives is
    // hardcoded; see state.js). We still need the L0367 call to paint the
    // initial lives count over the T1800 row-2 placeholder $20 tiles.
    state0_NewGameInit() {
        state.counterA5 = 0x80;       // 128-frame countdown (research_code_flow.md §5.5)
        state.gameState = 1;
        scoring.updateLivesScreen();  // L0367 — paint $42A2 (P1) / $4062 (P2)

        // Debug-start override (research_bird_stage.md §9.0). Lands at the
        // chosen stage without going through alien waves. Mirrors what
        // $2204 would have done at a real stage transition: bumps
        // LevelAndRound, then reads T1760 to set AliensLeft / BirdsLeft.
        // Skipped on subsequent state-0 re-entries (game-over → new game)
        // because the constant is intended for cold-start iteration only;
        // a stale-state guard isn't needed since state 0 only fires once
        // per game.
        if (DEBUG_START_LEVEL_AND_ROUND !== null) {
            state.levelAndRound = DEBUG_START_LEVEL_AND_ROUND;
            const waveIdx = (state.levelAndRound >> 1) & 7;
            const waveByte = ALIEN_BIRD_PARTITION[waveIdx];
            if (waveByte & 0x80) {
                state.birdsLeft  = waveByte & 0x7F;
                state.aliensLeft = 0;
            } else {
                state.aliensLeft = waveByte;
                state.birdsLeft  = 0;
            }
        }
    },

    // L04AC — score flash for 128 frames (CounterA5 $80 → $00). Per L04BD,
    // source also zeroes Counter9A every frame (re-incremented next tick by
    // WaitVBlankCoin), so it stays ≈0 throughout state 1. The L04B8
    // first-iteration jump to $07F0 — scroll-reg reset, ClearForeground,
    // SetBitsVideoRegister — is a no-op until steps 3 / 5 land those models.
    // L04C4 — bit 3 of (post-decrement) counterA5 toggles paint vs erase of
    // the active player's 6 score digits (~8 frames per phase, 8 flashes).
    // L04C9 CALL $06E8 (paint path only) re-paints T1800 row 0 labels — no-op
    // here since render.frame() redraws all staticTextRows every frame.
    state1_ScoreFlash() {
        state.counterA5--;
        if (state.counterA5 === 0) {
            state.gameState = 2;
            return;
        }
        if (state.counterA5 !== 0x7F) state.counter9a = 0;
        if ((state.counterA5 & 0x08) === 0) scoring.printNumber(state.gameAndDemoOrSplash);
        else                                scoring.eraseDigits(state.gameAndDemoOrSplash);
    },

    // L0515 — per-stage init, one frame. Source order:
    //   $041E SetBitsVideoRegister  → palette bit from $43B8 (TODO; canvas
    //                                 port has no $5000 register yet)
    //   GameState := 3
    //   $0580 InitGlobalLevelData   → copy 12-byte per-stage block
    //   $0547 InitPlayerDataStructure → copy T0560 → player struct
    //   $09A0                        → skipped (canvas draws from x/y direct;
    //                                 source builds screen-RAM mirror addresses)
    //   $0532 init alien data        → control states + move ptrs + positions
    //   $0A6C                        → skipped (alien screen-RAM mirror)
    //   $0506                        → TODO (clears $4392-$4397 scratch)
    //   $32B0                        → ported below (clears $4350-$437F mirrors
    //                                  + $439A-$439D + $4B70-$4BAF; copies
    //                                  T3F80/T3FC0 into bird struct on bird
    //                                  stages — research_bird_stage.md §2)
    state2_StageInit() {
        state.gameState = 3;
        // L0515 $041E SetBitsVideoRegister — write (LR & $02) | (player & $01)
        // to $5000 video register. Bit 1 selects palette bank; bit 0 selects
        // memory bank (player 1/2 — not modeled in port, single bank).
        // Bit 1 of LR toggles between two color palettes every 2 stages:
        //   bank 0: LR low-nibble in {0,1,4,5,8,9} (alien wave 1, bird wave 1, etc.)
        //   bank 1: LR low-nibble in {2,3,6,7,A,B} (alien wave 2, bird wave 2, etc.)
        // resource.setPaletteBank flips the active decoded-tile bitmap set;
        // all subsequent rendering (aliens, birds, score text, player) uses
        // the new bank's colors.
        resource.setPaletteBank((state.levelAndRound >> 1) & 1);
        this.initGlobalLevelData();
        this.initPlayerDataStructure();
        this.initAlienData();
        // L0506 — clear $4392-$4397 and seed ($4394) from $4B50 MSB.
        // L32B0 — clear $4350-$437F (AlienBehaviorUpdate scratch region) +
        // $439A-$439D (Counter9A pair) + $4B70-$4BAF (bird struct).
        // Source zero-fills 48 bytes; port mirrors that for every field it
        // models in this range. Critical: alienPhaseCount ($4357) MUST reset
        // here, otherwise after 3 angry waves on wave-1 the angry gate
        // (M4357 < 3) fails for the rest of the game and no further waves
        // get angry attacks.
        state.combatLane = 0;
        state.alienPathSeedHi    = (state.alienMovePtr[0] >> 8) & 0xFF;
        state.alienPathSeedLo    = 0;
        state.counter93          = 0;
        state.alienBehaviorState  = 0;  // $4350
        state.alienSwoopPatternHi = 0;  // $4351
        state.alienSwoopPatternLo = 0;  // $4352
        state.alienSwoopCount     = 0;  // $4353
        state.alienSwoopTarget   = 0xFF;// $4354 (port: 0xFF sentinel for "no target", source: 0)
        state.alienCooldown      = 0;   // $4355 — first behaviorCooldown call will L30E4-reseed
        state.alienSwoopLsb       = 0;  // $4356 — saved match key, fresh per stage
        state.alienPhaseCount     = 0;  // $4357 — angry-wave cap (was the carry-over bug)
        state.alienPhaseTimer     = 0;  // $4358 — angry-pattern countdown; 0 triggers re-seed
        state.alienCooldownTimer1 = 0;  // $4359
        state.alienCooldownTimer2 = 0;  // $435A
        state.alienCooldownTimer3 = 0;  // $435B
        state.aliensLeftFlag      = 0;  // $435E — depleted-formation sticky flag
        // $4370-$437F is also part of the L32B0 zero-fill range. Reset
        // both the 2 alien-kill explosion slots ($4370/$4374) and the 2
        // bonus-kill explosion slots ($4378/$437C) so no leftover
        // explosions carry into the new stage.
        for (const e of state.explosions) {
            e.counter  = 0;
            e.scoreBcd = 0;
            e.x        = 0;
            e.y        = 0;
            e.frameLsb = 0;
        }
        for (const e of state.bonusExplosions) {
            e.counter  = 0;
            e.scoreBcd = 0;
            e.x        = 0;
            e.y        = 0;
        }

        // $32B0 bird-init tail. Source order: clear $4350-$437F (already
        // done above by the per-field assignments), clear $439A-$439D
        // (port has only `counter9a` modeled here from that range — left
        // alone since it's also reset by state-1's L04BD tick), early-return
        // when BirdsLeft == 0, then zero $4B70-$4BAF and copy the right
        // table slice into the trailing BirdsLeft slots.
        this.initBirdData();
    },

    // initBirdData / stageBirdClear / stageBirdCombat / birdFireScanAndSpawn /
    // birdBulletCollision / birdCanvasPos / onBirdWingHit / onBirdHit /
    // birdMaturityDispatchFirst4 / birdMaturityDispatchSecond4 / birdUpdate /
    // birdMaturity36D2 / birdMaturity36EA / birdMaturity370A / birdMotion36C0 /
    // birdMotion35E0 / _birdMotion3604 / _birdMotion366A / _birdMotion3672 /
    // _birdMotion3628 / _birdMotion3648 / _birdMotion3695 / _birdMotion3744 /
    // birdRandomize / birdVsPlayerCollision moved to states_bird.js — spread via ...birdMixin.

    // L0580 InitGlobalLevelData — index STAGE_BLOCK_INDEX (source T0598)
    // by stage low nibble, copy the 12-byte block at $05xx into
    // $43AB-$43B6. research_stage_structure.md §4.1.
    initGlobalLevelData() {
        const stage = state.levelAndRound & 0x0F;
        const blockOffset = STAGE_BLOCK_INDEX[stage] - STAGE_BLOCK_BASE;
        for (let i = 0; i < 12; i++) {
            state.stageBlock[i] = STAGE_BLOCKS[blockOffset + i];
        }
    },

    // L0547 InitPlayerDataStructure — source copies T0560 (32 bytes) into
    // $43C0..$43DF, covering PlayerState/Shape/X/Y, PlayerBullet 0/1, AND
    // all five EnemyBullet slots ($43CC..$43DF, each State=0/Shape=$58/
    // X=0/Y=$20 in T0560). The enemy-bullet state byte goes to 0 which
    // deactivates them. Then $0552 ClearBbytesAtHL clears $43E0-$43FF
    // (player + bullet old-position pointers). With those pointers zeroed,
    // the player ship's per-frame draw stops painting tiles to FG screen
    // RAM — so the ship visually disappears during the fade-in stages
    // (0, 2) where PlayerUpdate doesn't run.
    //
    // Port equivalent: set `state.player.alive = false`. The canvas-based
    // renderer in render.drawPlayer is gated by alive, so clearing it
    // mirrors source's "ship invisible during fade-in" behavior. Combat
    // handlers (stageAlienCombat at LR=1/3/B, stageBirdCombat at LR=5/7)
    // re-set alive=true at the top of their handler, so the ship
    // reappears at the new init position ($64, $D8 = center-bottom) the
    // moment combat starts. Clearing enemyBullets[*].state mirrors the
    // T0560[12..31] portion of the source copy — without this, surviving
    // bullets from before the player died would still be in flight when
    // state-3 gameplay resumes and instantly re-kill the respawning ship.
    initPlayerDataStructure() {
        state.player.x           = PLAYER_INIT_BLOCK[2];   // PlayerShipX = $64 = 100
        state.player.y           = PLAYER_INIT_BLOCK[3];   // PlayerShipY = $D8 = 216
        state.player.alive       = false;                  // ← mirrors $0552 clear
        state.player.shieldCount = 0;
        state.player.bullet.active = false;
        state.player.bullet.x      = PLAYER_INIT_BLOCK[6]; // $00
        state.player.bullet.y      = PLAYER_INIT_BLOCK[7]; // $D0
        for (const b of state.enemyBullets) b.state = 0;   // T0560[12..31] EnemyBullet state bytes
    },

    // initAlienData moved to states_alien.js — spread via ...alienMixin.

    // L0800 — JT4 sub-dispatch on (LevelAndRound & 0x0F).
    // research_stage_structure.md §3 maps each stage to its handler.
    state3_Gameplay() {
        const stage = state.levelAndRound & 0x0F;
        switch (stage) {
            case 0x0:
            case 0x2:
                this.stageAlienFadeIn();           // L0834
                break;
            case 0x1:
            case 0x3:
            case 0xB:
                this.stageAlienCombat();           // L2000 — stub
                break;
            case 0x5:
            case 0x7:
                this.stageBirdCombat();            // L3400 — birds (step 11.2)
                break;
            case 0x4:
            case 0x6:
            case 0x8:
                this.stageSpiralFill();            // $2230 — case 8 exits to T1C00 mothership starfield (§2 of research_mothership.md)
                break;
            case 0x9:
                this.stageMothershipFadeIn();      // $22B4 — mothership lone fade-in (§3 of research_mothership.md)
                break;
            case 0xA:
                this.stageMothershipPlusAliensFadeIn();   // $22CA — mothership + aliens fade-in (§4)
                break;
            // 0xB mothership combat               → step 12.4
        }
    },

    // stageAlienFadeIn moved to states_alien.js — spread via ...alienMixin.

    // L067A StarsScrollDown — decrement CounterB9, mirror to bgScrollY
    // (the $5800 scroll-register write). When bit 0-2 of the new counter
    // is non-zero, return early; on the every-8th-frame branch, fill ONE
    // display row of stars from the current starfield page ($43B2/$43B3)
    // across all 26 columns of the BG plane.
    //
    // Source counts BACKWARDS (DEC then store), so bgScrollY decreases
    // over time — the visible BG plane therefore shifts DOWN, matching
    // the routine's "StarsScrollDown" name (drawBackground does
    // `(row*8 - bgScrollY)` so a decreasing scroll raises display y →
    // stars appear to move down).
    //
    // Row-fill loop (L0685-L06AC). Ported faithfully via emulated D/E
    // register arithmetic so writes land in the exact same display cells
    // the source picks (one tile per column for a single row), and the
    // starfield pointer LSB advances by the same per-fill increment so
    // subsequent rows pick up the next slice of T1C00/T1F00:
    //   - E_initial = $21 + ((counterB9 >> 3) & $1F)  → row 0..31
    //   - inner loop subtracts $20 from E per write (moves 1 col left)
    //   - exits inner on E borrow; outer DECs D and re-enters until D=$47
    //   - 27 writes total (26 visible + 1 garbage at out-of-plane addr
    //     when E_initial ≥ $40, harmlessly dropped by bgWrite)
    // Port-side reimplementation of L067A using a 33-row BG buffer.
    //
    // Each tick advances counterB9 (= scrollPixel within the current
    // 8-pixel band). On 8-pixel boundaries (counterB9 & 7 == 0), we
    // shift the buffer down by one row and refill the new hidden row
    // (bgTiles[0], canvas y=-8..-1) with 26 fresh starfield bytes from
    // T1C00 / T1F00 (pointer in stageBlock[7..8] = $43B2/$43B3).
    //
    // Why this differs from source: source's L067A writes one row into
    // a 32-row plane and lets the scroll register wrap modulo 256 px.
    // That puts the row-fill briefly visible at display row 0/1 — an
    // artifact the arcade hides because its score row is opaque, but
    // the port shows because its score row has transparent gaps. The
    // 33-row + hidden-row design moves the fill fully off-screen.
    starsScrollDown() {
        state.counterB9 = (state.counterB9 - 1) & 0xFF;
        state.bgScrollY = state.counterB9;        // legacy mirror; unused
        // scrollPixel walks 0 → 7 as counterB9 walks (X) → (X-7) within
        // an 8-pixel band. We derive it from counterB9 so existing fill
        // timing (counterB9 & 7 == 0) stays aligned.
        state.scrollPixel = (8 - (state.counterB9 & 7)) & 7;

        if ((state.counterB9 & 0x07) !== 0) return;

        // 8-pixel boundary: rotate buffer down and refill the new row 0.
        // bgTiles[r] := bgTiles[r-1] for r = 32 down to 1. Old bgTiles[32]
        // (which was about to scroll off the bottom) is overwritten by
        // bgTiles[31]'s content. New bgTiles[0] gets fresh ROM data.
        const tiles = state.bgTiles;
        for (let r = 32; r >= 1; r--) {
            for (let c = 0; c < 26; c++) {
                tiles[r * 26 + c] = tiles[(r - 1) * 26 + c];
            }
        }
        // Refill hidden row 0 with 26 fresh starfield bytes from T1C00 /
        // T1F00; advance the ROM pointer so the next refill picks up
        // where this one left off. With gcd(26, 256) = 2, the pointer
        // cycle is 128 fills = 1024 px of scroll before the star pattern
        // truly repeats.
        const hi = state.stageBlock[7];
        let lo = state.stageBlock[8];
        for (let c = 0; c < 26; c++) {
            tiles[c] = readStarfield(hi, lo);
            lo = (lo + 1) & 0xFF;
        }
        state.stageBlock[8] = lo;
    },

    // L06B0 AddPlanetsToBackground — periodically paint a 2x2 planet
    // sprite onto the BG plane. Fires only on frames where CounterB9
    // matches the stage's planet-match counter (stageBlock[0] = $43AB);
    // each fire advances the match counter by stageBlock[1] ($43AC)
    // so the next planet lands at a deterministic CounterB9 phase, and
    // bumps a pair of index counters (stageBlock[2..3]) that walk the
    // T1E20 / T1E40 / T1E60 lookups for screen-RAM addr + tile-data ptr.
    addPlanetsToBackground() {
        if (state.counterB9 !== state.stageBlock[0]) return;

        // L06B9-L06C4 — advance the match counter and bump indices.
        state.stageBlock[0] = (state.stageBlock[0] + state.stageBlock[1]) & 0xFF;
        state.stageBlock[2] = (state.stageBlock[2] + 1) & 0xFF;
        state.stageBlock[3] = (state.stageBlock[3] + 1) & 0xFF;
        const B = state.stageBlock[2];
        const A = state.stageBlock[3];

        // L06C5-L06D0 — planet MSB + LSB-offset lookups (5-bit indexed).
        const idx = A & 0x1F;
        const D = PLANET_MSB[idx];
        // L06D1-L06DA — E_final = T1E40[idx] + 2 + ((counterB9 >> 3) & $1E)
        const lsbOff = PLANET_LSB_OFF[idx];
        const E = (lsbOff + 2 + ((state.counterB9 >> 3) & 0x1E)) & 0xFF;

        // L06DB-L06E3 — tile-list ptr inside T1E00 region. Source loads
        // L = T1E60[B & 0x1F] with H still at $1E from L06DB, so the
        // tile ptr = $1E00 | T1E60[B & 0x1F]. T1E60 values are multiples
        // of 4 in 0..28 range → indexes one of 8 planet tile-lists.
        const tileOff = PLANET_COL_LSB[B & 0x1F];

        // L06E4 → $07DC — 2x2 column-major draw at DE in source.
        // ⚠ PORT DEVIATION — same as galaxies: column from source addr,
        // but the row placement is shifted into the hidden+top region so
        // the planet spawns "from above" and scrolls down naturally:
        //   bgTiles[0, col  ] = UL  (tiles[0])  — hidden above canvas
        //   bgTiles[1, col  ] = LL  (tiles[1])  — top visible row
        //   bgTiles[0, col+1] = UR  (tiles[2])  — hidden above canvas
        //   bgTiles[1, col+1] = LR  (tiles[3])  — top visible row
        // At spawn time (scrollPixel = 0), only LL/LR are on screen —
        // the player sees just the bottom half of the planet appearing
        // at the very top edge. As scrollPixel ticks 1..7, UL/UR reveals
        // gradually from above. On the next 8-boundary buffer shift,
        // the whole planet ends up at bgTiles[1..2] (fully visible at
        // the top), and continues drifting downward each shift after.
        //
        // bgTiles[0] is also the row starsScrollDown refills each shift;
        // since addPlanetsToBackground runs AFTER starsScrollDown in
        // bgUpdate, planet writes overwrite the freshly-refilled star
        // content at row 0 the same frame they fire.
        const addr = (D << 8) | E;
        const off = (addr - 0x4800) & 0xFFFF;
        if (off >= 832) return;
        const col = 25 - ((off >> 5) & 0x1F);
        state.bgTiles[0 * 26 + col] = PLANET_TILES[tileOff    ];
        state.bgTiles[1 * 26 + col] = PLANET_TILES[tileOff + 1];
        if (col + 1 < 26) {
            state.bgTiles[0 * 26 + (col + 1)] = PLANET_TILES[tileOff + 2];
            state.bgTiles[1 * 26 + (col + 1)] = PLANET_TILES[tileOff + 3];
        }
    },

    // L2040 AddGalaxiesToBackground — periodically paint a single 1x1
    // galaxy tile onto the BG plane. Same match-fire pattern as planets
    // but with separate counters (stageBlock[4..6] = $43AF/$43B0/$43B1)
    // and a SUBTRACT-not-add increment, so the match counter walks
    // backwards through the 8-bit space.
    addGalaxiesToBackground() {
        if (state.counterB9 !== state.stageBlock[4]) return;

        // L2049-L2051 — advance the match counter (SUB, not ADD) and
        // bump the galaxy index.
        state.stageBlock[4] = (state.stageBlock[4] - state.stageBlock[5]) & 0xFF;
        state.stageBlock[6] = (state.stageBlock[6] + 1) & 0xFF;
        const A = state.stageBlock[6];
        const idx = A & 0x1F;

        // L2052-L2061 — three table lookups (tile, MSB, LSB) all 5-bit-
        // indexed on the same A.
        const tile = GALAXY_TILES[idx];
        const D    = GALAXY_MSB[idx];
        // L2062-L206A — E_final = T1EC0[idx] + 1 + ((counterB9 >> 3) & $1F)
        const E = (GALAXY_LSB[idx] + 1 + ((state.counterB9 >> 3) & 0x1F)) & 0xFF;

        // ⚠ PORT DEVIATION — column from source addr, row forced to the
        // top of the visible BG buffer (bgTiles[1] = display y = 0..7 +
        // scrollPixel). Source's row formula relies on bgScrollY's mod-256
        // wrap to coincidentally land galaxies at display y=8 each time;
        // the 33-row design doesn't have that wrap, so source's row would
        // place galaxies at literal mid-screen positions. Forcing row=1
        // restores the "spawn at top, scroll down" behavior the arcade
        // shows (and matches starsScrollDown which writes to the top row).
        const addr = (D << 8) | E;
        const off = (addr - 0x4800) & 0xFFFF;
        if (off >= 832) return;
        const col = 25 - ((off >> 5) & 0x1F);
        state.bgTiles[1 * 26 + col] = tile;
    },

    // L06F0 — three-stage BG update chain: scroll register + tile content.
    // Order matches source ($067A → $2040 → $06B0). Galaxies and planets
    // both compare against the CounterB9 that StarsScrollDown just
    // decremented, so the order matters: scroll first to advance the
    // counter, then the two overlay fills.
    bgUpdate() {
        this.starsScrollDown();
        this.addGalaxiesToBackground();
        this.addPlanetsToBackground();
    },

    // L24C4 — BG update gated by stage low nibble.
    //   stage < 8  (alien fade-ins + combat + spiral-fill + bird combat):
    //              call L06F0 (= bgUpdate); the planets/galaxies/stars
    //              starfield is the right overlay for these stages.
    //   stage >= 8 (mothership stages):
    //              call L24E0 instead — different BG handling for
    //              mothership wipe / shield blocks. Step 11 territory;
    //              stubbed here.
    //
    // Source call sites:
    //   - L2160 / L2180 — full-formation combat lanes 1 + 3 of L2130
    //   - L21A5         — depleted-formation bit-0=1 dispatch of L2146
    //   - L21BA         — stage-clear bit-0=1 path
    //
    // This is why the BG scrolls smoothly during alien combat — not just
    // during fade-in — even though L2000 itself never calls L06F0 directly.
    bgUpdateIfAlienStage() {
        const stage = state.levelAndRound & 0x0F;
        if (stage < 8) this.bgUpdate();
        else           this.motherShipBgUpdate();   // $24C4 stage>=8 branch
    },

    // stageAlienCombat moved to states_alien.js — spread via ...alienMixin.

    // $2230 + $2260 + $2292 — spiral-fill stage handler for JT4
    // stages 4, 6, 8. Animates a center-out asterisk spiral wipe over
    // ~52 frames, then advances LevelAndRound to the next stage and
    // triggers state-2 init via GameState := 2.
    //
    // Source flow (`Code.md:$2230`):
    //   A      = (HL=$439C)            ; A = counter BEFORE increment
    //   (HL)++ = (HL) + 1               ; tick counter
    //   A      = (A RRCA) & $3F         ; position advances every 2 frames
    //   if A == $0D:    JP $2292        ; phase-1 exit (advance LR)
    //   if A <  $0D:    B = $1F; CALL $2260 (draw asterisks)
    //   else:           B = $00; A -= $0E
    //                   if A == $0D: JP $2292   ; phase-2 exit (advance LR)
    //                   else:        CALL $2260 (erase)
    //
    // $2260 walks a spiral path computed from position counter `C`,
    // writing tile `B` to multiple FG-plane cells per call (count
    // grows as `C` advances). Each cell write goes to address
    // HL = $4xxx (FG plane), so the spiral overlays the score / coin
    // text during the transition.
    //
    // $2292 exit (port-simplified):
    //   Source: if LR bit 3 == 0 (stages 4/6) → ClearBackground +
    //           CounterB9 = $71; else (stage 8) → copy T1C00 starfield
    //           + CounterB9 = $00.
    //   Port: stages 4/6 only — bgTiles is already zeroed by state-2
    //         init for the next bird stage (matches ClearBackground
    //         branch). Stage 8 won't be reachable until step 12.
    //   Both: clear fgOverlay (spiral artifacts erased), reset
    //         spiralFillCounter, INC LevelAndRound, GameState := 2.
    stageSpiralFill() {
        // $2230-$223C — read counter, advance, derive position.
        const oldCounter = state.spiralFillCounter;
        state.spiralFillCounter = (state.spiralFillCounter + 1) & 0xFF;

        // RRCA(A) + AND $3F → position halves on each step regardless
        // of bit 0 (the rotate's bit-7 result is masked off by AND $3F).
        const aInitial = ((oldCounter >> 1) | ((oldCounter & 1) << 7)) & 0x3F;

        if (aInitial === 0x0D) {
            return this.spiralFillExit();        // $2239 JP Z,$2292
        }
        if (aInitial < 0x0D) {
            this.spiralDrawCells(aInitial, 0x1F);     // $223E B=$1F, $2240 JP C,$2260
            return;
        }
        // aInitial >= $0E. Phase 2 (erase).
        const aPhase2 = (aInitial - 0x0E) & 0xFF;
        if (aPhase2 === 0x0D) {
            return this.spiralFillExit();        // $2249 fall-through to $224C
        }
        this.spiralDrawCells(aPhase2, 0x00);          // $2243 B=$00, $2249 JP NZ,$2260
    },

    spiralFillExit() {
        // $2292 — clear spiral, BG-fill, advance stage, trigger state-2 init.
        // Source dispatch on LR bit 3 (research_mothership.md §2):
        //   bit 3 == 0 (stages 4, 6): JP $22F0 → ClearBackground →
        //                              CounterB9 = $00. Birds appear
        //                              against solid black BG.
        //   bit 3 == 1 (stage 8):    fall through to copy T1C00 starfield
        //                              into BG plane + CounterB9 retained
        //                              at $71. Mothership intro appears
        //                              against dense starfield.
        state.fgOverlay.clear();
        if ((state.levelAndRound & 0x08) === 0) {
            // $22F0 — ClearBackground (stages 4, 6 → upcoming bird stage)
            state.bgTiles.fill(0);
            state.counterB9 = 0;
            state.scrollPixel = 0;
        } else {
            // $229B — copy T1C00 starfield into BG plane (stage 8 → upcoming
            // mothership intro). Source's $229B loop walks DE backward from
            // $4B3F with INC L on HL (= $1Cxx page), reading T1C00 cyclically
            // and writing to BG memory until D reaches $47 — covering the
            // full visible BG region $4800-$4B3F (832 bytes) and then some.
            // Port equivalent: fill all 33 rows × 26 cols (858 bytes) of
            // bgTiles cyclically from STARFIELD_T1C00 (256 bytes).
            const tiles = state.bgTiles;
            for (let i = 0; i < tiles.length; i++) {
                tiles[i] = STARFIELD_T1C00[i & 0xFF];
            }
            // $22E0 tail leaves CounterB9 at $71 (mid-scroll-band position).
            state.counterB9 = 0x71;
            state.scrollPixel = (8 - (state.counterB9 & 7)) & 7;
        }
        state.spiralFillCounter = 0;
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
        state.gameState = 2;
    },

    // $2260 — port of the spiral-cell write loop. Given position `cIn`
    // (0..$0C) and `tileCode` ($1F asterisk for phase 1, $00 empty for
    // phase 2), computes a sequence of FG-plane addresses via the
    // source's RRCA × 3 address math, then walks columns × rows
    // writing the tile to each cell.
    //
    // Cell positions are stored in state.fgOverlay (keyed by "x,y"
    // canvas coords). Phase 2 deletes entries; phase 1 adds them.
    // render.drawSpiralOverlay paints them on top of all other FG
    // content each frame.
    spiralDrawCells(cIn, tileCode) {
        // $2261-$2263 — RRCA × 3 (rotate, bit 0 wraps to bit 7).
        let A = cIn;
        for (let i = 0; i < 3; i++) {
            A = ((A >> 1) | ((A & 1) << 7)) & 0xFF;
        }
        // $2264-$2271 — split into high-3 + low-5 bits, build HL.
        const aSaved = A;
        const lowE = aSaved & 0x1F;
        const highAndE0 = aSaved & 0xE0;
        const lSum = highAndE0 + 0xB0;
        let L = lSum & 0xFF;
        const carry = lSum > 0xFF ? 1 : 0;
        let H = (lowE + 0x41 + carry) & 0xFF;
        // $2272-$2274 — HL = (H, L - cIn).
        L = (L - cIn) & 0xFF;
        // $2275-$2279 — C = cIn + 1; E = (cIn + 1) * 2 (column count).
        let C = (cIn + 1) & 0xFF;
        let E = (C * 2) & 0xFF;

        // Outer loop: E columns ($227A/$228D-$228E).
        while (E > 0) {
            // $227A — D = C (row count for this column).
            let D = C;
            // Inner loop: each iteration writes 2 cells ($227B-$2280).
            while (D > 0) {
                this._writeFgCell(H, L, tileCode);
                L = (L + 1) & 0xFF;
                if (L === 0) H = (H + 1) & 0xFF;
                this._writeFgCell(H, L, tileCode);
                L = (L + 1) & 0xFF;
                if (L === 0) H = (H + 1) & 0xFF;
                D--;
            }
            // $2283-$228C — L -= C; L -= C; L -= $20; H -= borrow.
            const rawL = L - C - C - 0x20;
            L = rawL & 0xFF;
            H = (H - (rawL < 0 ? 1 : 0)) & 0xFF;
            E--;
        }
    },

    // FG-plane address → canvas (x, y) and store tile in fgOverlay.
    // Source addresses span $4000-$43FF (FG plane = 1024 cells, 32×32
    // in source coords but only 26 cols × 32 rows visible after the
    // 90° rotation to portrait). Uses the same `25 - (off >> 5)` /
    // `off & $1F` decode the static-text parser uses (see
    // tools/build_data.py parse_text_table). Out-of-range addresses
    // (would happen if the spiral math overflows past $43FF) are
    // silently dropped — matches arcade where they'd land in unmapped
    // RAM.
    _writeFgCell(H, L, tileCode) {
        const addr = (H << 8) | L;
        const planeOff = addr - 0x4000;
        if (planeOff < 0 || planeOff >= 1024) return;
        const col = 25 - ((planeOff >> 5) & 0x1F);
        const row = planeOff & 0x1F;
        if (col < 0 || col >= 26) return;
        const x = col * 8;
        const y = row * 8;
        const key = `${x},${y}`;
        if (tileCode === 0) {
            state.fgOverlay.delete(key);
        } else {
            state.fgOverlay.set(key, tileCode);
        }
    },

    // playerBulletCollision / alienVsPlayerCollision / killAlienRegular
    // moved to states_alien.js — spread via ...alienMixin.

    // state6_MothershipExplosion / state7_MothershipScore moved to
    // states_mothership.js (12.0) — spread into `states` via
    // `...mothershipMixin` above.
    //
    // introFrame (L002D attract path) moved to states_intro.js (14.A) —
    // spread into `states` via `...introMixin` above.
    //
    // playerUpdate / playerBulletUpdate / mappedPlayerX / onPlayerHit /
    // state4_PlayerExplosion / _drawPlayerParticleFrame /
    // _playerRespawnDecision / state5_GameOver moved to states_player.js —
    // spread into `states` via `...playerMixin` above.
    //
    // spawnExplosion / spawnBonusExplosion / explosionUpdate /
    // bonusExplosionUpdate moved to states_explosion.js — spread into
    // `states` via `...explosionMixin` above.
    //
    // initAlienData / stageAlienFadeIn / stageAlienCombat /
    // playerBulletCollision / alienVsPlayerCollision / killAlienRegular /
    // onAlienHit / stageClearUpdate / alienMovementUpdate /
    // alienAnimationUpdate / getRandomNumber / computeLevelFactor /
    // alienBehaviorUpdate / behavior* sub-states / enemyBulletUpdate /
    // enemyFireScanAndSpawn / spawnEnemyBulletAtXY moved to
    // states_alien.js — spread into `states` via `...alienMixin` above.
    //
    // initBirdData / stageBirdClear / stageBirdCombat and the full bird
    // motion + maturity engine moved to states_bird.js — spread into
    // `states` via `...birdMixin` above.

    // Debug cheat — K-key kills all live enemies in the current stage to
    // accelerate testing of stage transitions. Detects which kind of
    // combat is active by LR low nibble:
    //   1, 3     → alien combat: clear all alien slots, set AliensLeft=0
    //   5, 7     → bird combat:  clear all bird slots,  set BirdsLeft=0
    //   B        → mothership combat: trigger pilot kill directly
    //              (GameState=6, CounterA5=$60) — same effect as a
    //              player bullet hitting the exposed pilot, runs the
    //              full GameState 6→7→2 explosion+score+next-round path.
    // Other stages (fade-in, spiral, intro): no-op.
    //
    // For 1/3/5/7: once the count hits 0, the corresponding stage-clear
    // handler takes over and drives the transition naturally.
    //
    // No scoring on the alien/bird paths, no explosions — purely a
    // developer skip. The mothership path uses real GameState 6/7 so
    // the bonus score IS credited; useful for testing score-popup
    // and round advance. Remove or gate behind a debug flag before ship.
    cheatKillAll() {
        const stage = state.levelAndRound & 0x0F;
        if (stage === 0x1 || stage === 0x3) {
            // Alien combat — clear all 16 alien slots.
            for (const a of state.aliens) {
                a.alive = false;
                a.controlA &= ~0x08;
            }
            state.aliensLeft = 0;
        } else if (stage === 0x5 || stage === 0x7) {
            // Bird combat — clear all 8 bird slots.
            for (const b of state.birds) b.shape = 0;
            state.birdsLeft = 0;
            state.maturity = 0;
        } else if (stage === 0xB) {
            // Mothership combat — trigger pilot kill directly. Mirrors
            // what shieldBlockCollision's $23C7 branch sets when a real
            // bullet hits the pilot. state6/7 handlers then run the full
            // explosion + bonus-score + next-round path.
            state.gameState = 6;
            state.counterA5 = 0x60;
        }
        // Other stages: leave alone.
    },
};
