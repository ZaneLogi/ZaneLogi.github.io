import { state } from './state.js';
import { scoring } from './scoring.js';
import { resource } from './resource.js';
import {
    PLAYER_INIT_BLOCK,    // source T0560
    STAGE_BLOCK_INDEX,    // source T0598
    STAGE_BLOCKS,         // source $05A8/$05B4/$05C0/$05CC
    ALIEN_BIRD_PARTITION, // source T1760 — used by state0_NewGameInit + stageBirdClear + stageClearUpdate
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
    BIRD_INIT_TABLE,      // source T3F80 + T3FC0 — bird wave 1 / wave 2 init data
    BIRD_T3E80,           // source T3E80 — bird shape/delta lookup ($3560 + $35E0)
    BIRD_T3F00,           // source T3F00 — per-shape dispatch (motion + maturity)
    BIRD_T3EC0,           // source T3EC0 — shape → draw-entry LSB (encodes column count)
    BIRD_T3DC0,           // source T3DC0 — bird-fire scan-subset table (16 × 2 bytes)
    BIRD_T3DB8,           // source T3DB8 — wing-hit shape-swap table (8 bytes)
} from './data.js';

import { mothershipMixin } from './states_mothership.js';
import { introMixin }      from './states_intro.js';
import { playerMixin }     from './states_player.js';
import { explosionMixin }  from './states_explosion.js';
import { alienMixin }     from './states_alien.js';

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
// aabbHit kept here — bird methods still in states.js use it.

// AABB overlap test (research_rendering.md §6.1).
function aabbHit(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

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

    // $32B0 ports — clears all 8 bird struct slots, then on bird stages
    // (BirdsLeft > 0) copies the last `birdsLeft` 8-byte rows from the
    // selected init table into the corresponding bird slots. Selection:
    //   bit 1 of LevelAndRound == 0 → T3F80 (bird wave 1, stages 4/5)
    //   bit 1 of LevelAndRound == 1 → T3FC0 (bird wave 2, stages 6/7)
    // The "trailing slots" behaviour is source-faithful: surviving birds
    // re-spawn at the table-tail positions, dead birds stay at struct head
    // as zeros (an edge case in practice — $2204 resets BirdsLeft to 8 at
    // every transition, so this only matters at cold start with a custom
    // BirdsLeft, e.g. debug-start). research_bird_stage.md §2.
    initBirdData() {
        // Clear all 8 birds and the maturity byte ($4368). Source zeroes
        // these unconditionally before the BirdsLeft check.
        for (const b of state.birds) {
            b.shape = 0; b.screenMsb = 0; b.screenLsb = 0; b.field3 = 0;
            b.advanceCtr = 0; b.gridX = 0; b.field6 = 0; b.gridY = 0;
        }
        state.maturity = 0;

        if (state.birdsLeft === 0) return;

        // Table base: bit 1 of LevelAndRound picks which 64-byte half of
        // BIRD_INIT_TABLE to copy from (see comment above).
        const tableBase = (state.levelAndRound & 0x02) ? 64 : 0;
        // Trailing-slot offset: $4B70 + (8 - birdsLeft)*8 in source; mirror
        // by indexing into `state.birds` starting at `8 - birdsLeft`.
        const slotBase  = 8 - state.birdsLeft;
        for (let i = 0; i < state.birdsLeft; i++) {
            const b = state.birds[slotBase + i];
            const off = tableBase + (slotBase + i) * 8;
            b.shape      = BIRD_INIT_TABLE[off + 0];
            b.screenMsb  = BIRD_INIT_TABLE[off + 1];
            b.screenLsb  = BIRD_INIT_TABLE[off + 2];
            b.field3     = BIRD_INIT_TABLE[off + 3];
            b.advanceCtr = BIRD_INIT_TABLE[off + 4];
            b.gridX      = BIRD_INIT_TABLE[off + 5];
            b.field6     = BIRD_INIT_TABLE[off + 6];
            b.gridY      = BIRD_INIT_TABLE[off + 7];
        }
    },

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

    // $3462 — bird-stage-clear tail. Runs in place of normal half-flock
    // dispatch when BirdsLeft hits 0. Source flow:
    //   3462: A = Counter9A+1; RRCA; RET C    ; odd parity: nothing
    //   3467: CALL EnemyBulletUpdate           ; residual bullets fall
    //   346A: CALL L0FC0                       ; explosion anim tick
    //   346D: JP   L2204                       ; countdown + LR advance
    //
    // Note: does NOT call bgUpdate ($06F0) — BG stays black during the
    // pause, unlike alien-stage-clear which keeps stars scrolling. This
    // matches arcade behavior; the bird stage's background is black.
    //
    // Port note: the L2204 countdown body is inline here rather than
    // calling stageClearUpdate, because stageClearUpdate runs
    // bgUpdateIfAlienStage (which would fill bgTiles with stars during
    // the bird-clear pause — wrong for bird stages). The stop-gap wrap
    // is duplicated for the same reason.
    stageBirdClear() {
        if ((state.counter9a & 1) !== 0) return;   // odd parity: nothing

        // Residual physics during the pause.
        this.enemyBulletUpdate();
        this.explosionUpdate();
        this.bonusExplosionUpdate();

        // L2204 countdown.
        const cnt = (state.stageBlock[11] - 1) & 0xFF;
        state.stageBlock[11] = cnt;
        if (cnt >= 0xA0) return;

        state.gameState = 2;
        state.player.shieldCount = 0;
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
        // (Stop-gap removed in 12.10 — stages 8-B are all reachable now.)

        const waveIdx = (state.levelAndRound >> 1) & 7;
        const waveByte = ALIEN_BIRD_PARTITION[waveIdx];
        if (waveByte & 0x80) {
            state.birdsLeft  = waveByte & 0x7F;
            state.aliensLeft = 0;
        } else {
            state.aliensLeft = waveByte;
            state.birdsLeft  = 0;
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

    // L3400 — bird-combat handler for JT4 stages 5 and 7.
    // research_bird_stage.md §1 (dispatch structure).
    //
    // Architectural note: $3400 is NOT a Counter93 lane round-robin like
    // $2000 (alien combat). It runs a fixed call sequence at the top, then
    // forks on `BirdsLeft`:
    //   - == 0  → $3462 stage-clear tail (residual physics + countdown).
    //              Deferred to step 11.5; for now we just stop work and let
    //              the global stop-gap wrap LR. With no hit detection yet
    //              (step 11.4), this branch is unreachable in normal play.
    //   - <  4  → both half-flock updates every frame (analogue of the alien
    //              `AliensLeft<5` speed-up, but implicit from the count).
    //   - >= 4  → split into two halves by `Counter9A+1` bit 0 (= 30 Hz per
    //              half-flock). Even parity: birds 0..3 + bullets. Odd
    //              parity: birds 4..7 + explosion animation tick.
    //
    // 11.2 scope = dispatch skeleton + player render. The per-bird update
    // engine (drawFirst4/Second4 bodies, $3560 randomizer, $3498/$34AA
    // L35B0 dispatch, $3930 player-relative scan, $3800 collision) is
    // **stubbed** here as TODO comments — birds will appear as static
    // placeholder tiles via render.drawBirds() until step 11.3 wires up
    // the movement/animation engine.
    stageBirdCombat() {
        // $3400 head — every frame regardless of BirdsLeft.
        state.player.alive = true;
        this.playerUpdate();                          // L0876
        // $3403 / $3409 — bird collision detection (source calls $3800
        // twice, before and after $2600). The port collapses to a single
        // call: $2600 is mostly NOP'd in source and the port doesn't
        // touch the bird positions between the two scans, so the second
        // call would always re-scan the same positions.
        this.birdBulletCollision();                   // $3800
        // $2600 — port-side approximation. Source's `$2600` builds an
        // adjusted CounterB9 value and writes it to the `$5800` BG
        // scroll register. The hardware shifts the entire BG plane;
        // since birds in source are drawn to BG memory, they scroll
        // with it. Crucially, source has TWO paths:
        //   - main ($2618-$2649): `CounterB9 -= D` (scroll down)
        //   - alt  ($2650-$2662): `CounterB9 += T3ED0[...]` (scroll up)
        // The path is chosen by comparing M4BD1 vs M4BD3 (extended bird
        // storage maintained by `$26D0`/`$26AA`/`$2668`). The net effect
        // is a back-and-forth oscillation of the scroll register —
        // birds visibly bob up AND down, not just descend monotonically.
        //
        // Port-side simplification: instead of porting the full M4BD0+
        // extended-storage state machine (~50 lines), use bit 6 of
        // Counter9A's low byte as a coarse direction toggle. Bit 6
        // flips every 64 frames (~1 sec at 60 Hz), so counterB9 walks
        // ±64 around a center value, producing ~2-second
        // up-down-up-down cycles that visually approximate the source's
        // oscillation. With the M4BD0+ state machine, source's exact
        // amplitude / period differ but the visual character (bobbing
        // birds) is preserved.
        //
        // Bird stages in arcade Phoenix have NO visible starfield, no
        // planets, no galaxies — so we DON'T call `bgUpdate` here
        // (which would write those into bgTiles). bgTiles stays at the
        // zeros from state-2 init → solid black BG.
        // research_bird_stage.md §10 item 6 (closed, port-side).
        // Bird-count-dependent scroll, mirroring source's $2476 reseed
        // where M4BD1 grows with `(8 - BirdsLeft)`. Larger M4BD1 →
        // main path (DOWN/decrement) fires more aggressively → larger
        // scroll amplitude. So full flock = small bounded oscillation;
        // last bird = continuous downward drift.
        //
        // Port simplification (not the full $2600 state machine — see
        // research_bird_stage.md §10 item 12):
        //   BirdsLeft >= 2: counterB9 oscillates in signed [-SCROLL_MAX..0]
        //                   (downward bob only — render.drawBird handles
        //                   wrap via split-draw when baseY >= 240).
        //   BirdsLeft == 1: counterB9 decrements monotonically each
        //                   frame → continuous downward scroll. The
        //                   last bird visually exits the bottom edge
        //                   and re-emerges from the top via split-
        //                   draw, cycling forever until killed.
        //
        // SCROLL_MAX = 100 keeps all 8 birds visible: bird 7 (top row)
        // baseY ∈ [0..100], bird 0 (bottom row) baseY ∈ [112..212].
        // No wrap with full flock. Source's bidirectional bob isn't
        // reproduced exactly, but the visual character (birds bobbing
        // vertically, last bird wraps around) matches arcade footage.
        if (state.birdsLeft <= 1) {
            state.counterB9 = (state.counterB9 - 1) & 0xFF;
        } else {
            const SCROLL_MAX = 100;
            const scrollDir = (state.counter9a & 0x40) ? +1 : -1;
            let cbSigned = state.counterB9 >= 128 ? state.counterB9 - 256 : state.counterB9;
            cbSigned = Math.max(-SCROLL_MAX, Math.min(0, cbSigned + scrollDir));
            state.counterB9 = cbSigned & 0xFF;
        }
        // $3980 — bird-body-vs-player collision (shield-aware). Source
        // calls this once per bird-stage frame from $340C. The prior
        // TODO marked this "cosmetic" — wrong; this is the actual
        // bird-kills-player path. See birdVsPlayerCollision.
        this.birdVsPlayerCollision();

        // $340F-$3413 — BirdsLeft check. When all birds are gone, hand
        // off to the bird-stage-clear tail ($3462) for the post-clear
        // pause + countdown.
        if (state.birdsLeft === 0) {
            return this.stageBirdClear();        // $3462
        }

        // $3416-$3418 — fork on BirdsLeft >= 4.
        // `Counter9A+1` bit 0 is the parity gate (source $342A/$3438 reads
        // $439B and RRCAs the bit-0 into carry). $439B is the **LSB** of
        // the 16-bit Counter9A (per AddOneToMem at $0200: HL=$439B is
        // incremented first, with carry into $439A). So $439B flips bit 0
        // every frame, giving smooth per-frame alternation between the
        // two half-flocks. **Bug fixed 2026-05-17**: my first port read
        // (counter9a >> 8) & 1 which is the MSB ($439A, flips every 256
        // frames) — that froze half the flock for ~4 seconds at a time.
        const counter9bBit0 = state.counter9a & 1;

        if (state.birdsLeft < 4) {
            // $341B-$3434 — depleted flock: both halves move + dispatch
            // every frame; bullets fire on even parity, explosions on odd.
            // TODO 11.3-followup: drawFirst4/Second4 horizontal-movement
            //   step (separate from $35B0; the source `DrawFirst4BirdObjects
            //   $3474` body includes its own per-bird X update before the
            //   draw — that body isn't ported yet).
            this.birdRandomize();                     // $3560
            this.birdMaturityDispatchFirst4();        // $3498
            this.birdMaturityDispatchSecond4();       // $34AA
            if (counter9bBit0) {
                // $342E JP C $0FC0 — explosion animation tick on odd parity.
                this.explosionUpdate();
                this.bonusExplosionUpdate();
            } else {
                // $3431 CALL $3930 + $3434 JP $0C40 — bird fire scan
                // + enemy bullet update on even parity.
                this.birdFireScanAndSpawn();          // $3930
                this.enemyBulletUpdate();
            }
        } else {
            // $3438-$345B — full-flock parity split. Each frame, ONE
            // half-flock gets updated; over 2 frames, all 8 birds get a
            // motion step (= 30 Hz per bird).
            this.birdRandomize();                     // $3560 fires in both halves
            if (counter9bBit0) {
                // Odd parity: source draws birds 4..7, $34AA dispatch,
                // then JP $0FC0 (explosion animation tick).
                this.birdMaturityDispatchSecond4();   // $34AA
                this.explosionUpdate();
                this.bonusExplosionUpdate();
            } else {
                // Even parity: source draws birds 0..3, $3498 dispatch,
                // CALL $3930, JP $0C40 (enemy bullets).
                this.birdMaturityDispatchFirst4();    // $3498
                this.birdFireScanAndSpawn();          // $3930
                this.enemyBulletUpdate();
            }
        }
    },

    // $3930 — bird-fire scan and spawn. Picks a subset of birds via T3DC0
    // (indexed by $4BD2 bits 4..1; port substitutes counter9a), gates by
    // counter9a bit 1 ($3A00 rate gate = effective 15 Hz fire attempt),
    // and for each candidate checks shape>=5 (working wings) + gridX
    // inside a player-relative X-band that widens as BirdsLeft shrinks.
    // The first eligible bird spawns ONE enemy-bullet into the first-free
    // slot (round-capped at 3/4/5). Spawn position derives the bullet's
    // randomized Y from bird.screenLsb + counter — bullets appear at
    // varied vertical positions, not at the bird's actual Y (source
    // behavior; documented in research_bird_stage.md §8.4).
    //
    // Reuses enemyBullets[] / enemyBulletUpdate() — no separate bird-bullet
    // pool, just shared bullets ticked at +4 y/tick and deactivated at y>=$F9.
    // research_bird_stage.md §8.
    birdFireScanAndSpawn() {
        // $3A00 — bit-1 gate (every 2nd of 2-frame even-parity windows;
        // net cadence = once per 4 frames ≈ 15 Hz).
        if ((state.counter9a & 0x02) === 0) return;

        // $3942-$394B — fire X-band derived from mapped player position.
        // D = $0C - BirdsLeft → small flock = wider band.
        const D = (0x0C - state.birdsLeft) & 0xFF;
        const { left, right } = this.mappedPlayerX();
        const bandLo = (left  - D) & 0xFF;  // source B = M439E - D
        const bandHi = (right + D) & 0xFF;  // source C = M439F + D

        // $3933-$393C — T3DC0 entry pick. Source uses $4BD2 & $1E (M4BD0+
        // state machine not ported — see research §10 item 1). Substitute
        // with counter9a so the index cycles through all 16 subsets every
        // 32 frames; visible character (bullets from different birds over
        // time) is preserved.
        const idx     = state.counter9a & 0x1E;
        const loopCnt = BIRD_T3DC0[idx];
        const startLsb = BIRD_T3DC0[idx + 1];
        const startBird = (startLsb - 0x70) >> 3;   // bird index 0..7

        // $394C loop — first eligible bird wins (source's $25DD/$25FD
        // POP+POP+RET unwinds two stack frames after one spawn).
        const round   = (state.levelAndRound >> 4) & 0x0F;
        const slotCap = round < 1 ? 3 : round < 2 ? 4 : 5;

        for (let i = 0; i < loopCnt; i++) {
            const birdIdx = startBird + i;
            if (birdIdx >= 8) break;
            const bird = state.birds[birdIdx];

            // $395C filter.
            if (bird.shape < 5) continue;
            // gridX in [bandLo, bandHi). Mod-256 compare unwraps cleanly
            // because the X-band stays in the visible range (~ $09..$C8).
            if (bird.gridX < bandLo || bird.gridX >= bandHi) continue;

            // $25CD — first-free slot up to round cap.
            let slot = -1;
            for (let j = 0; j < slotCap; j++) {
                if ((state.enemyBullets[j].state & 0x08) === 0) { slot = j; break; }
            }
            if (slot < 0) return;   // source POP+POP+RET — no spawn this call

            // $395C / $25E0 — spawn coords. After source's intermediate
            // -4/+4 trick: bullet.x = bird.gridX, bullet.y = randomized
            // value spread across most of the visible vertical range.
            const bulletX = bird.gridX & 0xFF;
            const randY   = (((state.counter9a + bird.screenLsb) & 0x1F) << 3) + 0x08;
            const bulletY = (randY + 0x0C) & 0xFF;

            const b = state.enemyBullets[slot];
            b.state = 0x08;
            b.shape = 0x58 + (((bulletX >> 1) & 0x03) + (bulletY & 0x04));
            b.x     = bulletX;
            b.y     = bulletY;
            return;   // only ONE bullet per dispatched frame
        }
    },

    // $3800 — bird collision detection (player bullet → bird).
    //
    // Source does tile-mask collision via screen RAM: read the BG plane
    // byte where the bullet currently lives, look up T3B60 mask for that
    // tile, AND with a bullet-sub-cell mask. If non-zero, the bullet
    // pixel overlaps the bird sprite → either CALL $3844 (body hit) or
    // fall through to L38BC → $38E9 (wing hit) depending on which tile
    // range was hit.
    //
    // The port uses a coarser approach: AABB between the player bullet
    // and each live bird's drawn-sprite bounding box, with a wing-vs-
    // body split based on bullet distance from the bird's center. Width
    // is taken from T3EC0[shape] (= draw-routine entry LSB, same lookup
    // render.drawBird uses), height is always 16 px.
    //
    // Wing-vs-body split:
    //   - Sprite width < 5 cols: no wings (egg/small bird) → any hit is
    //     a body kill via onBirdHit.
    //   - Sprite width >= 5 cols: bullet within ±(width/4)*8 px of bird
    //     center → body kill. Bullet farther out (on either side) →
    //     wing hit via onBirdWingHit (= bird shrinks, regrows over time
    //     via the maturity engine).
    birdBulletCollision() {
        const b = state.player.bullet;
        if (!b.active) return;
        for (let i = 0; i < 8; i++) {
            const bird = state.birds[i];
            if (bird.shape === 0) continue;
            const pos = this.birdCanvasPos(bird);
            if (!pos) continue;
            const lsb = BIRD_T3EC0[bird.shape] ?? 0;
            const widthCols = (0x58 - lsb) >> 3;       // 1..7
            if (widthCols < 1 || widthCols > 7) continue;
            const widthPx = widthCols * 8;
            if (!aabbHit(pos.x, pos.y, widthPx, 16, b.x, b.y, 8, 8)) continue;

            // Bullet overlaps bird bounding box. Pick wing vs body.
            if (widthCols >= 5) {
                const birdCenterX = pos.x + (widthPx >> 1);
                const bulletCenterX = b.x + 4;
                const distFromCenter = Math.abs(bulletCenterX - birdCenterX);
                const bodyHalfWidth = widthPx >> 2;     // = widthPx / 4
                if (distFromCenter > bodyHalfWidth) {
                    this.onBirdWingHit(bird, i);
                    b.active = false;
                    break;                              // one bullet, one bird
                }
            }
            this.onBirdHit(bird, i);
            b.active = false;
            break;
        }
    },

    // Helper: convert a bird's BG-plane screen-RAM addr ($48xx-$4Bxx) to
    // its canvas (x, y) — same math drawBird uses, INCLUDING the
    // CounterB9-driven Y scroll offset, so collision boxes track the
    // visible sprite (not the unshifted memory position). Returns null
    // if the address falls outside the 832-byte visible BG plane.
    birdCanvasPos(bird) {
        const off = ((bird.screenMsb << 8) | bird.screenLsb) - 0x4800;
        if (off < 0 || off >= 832) return null;
        const col = 25 - ((off >> 5) & 0x1F);
        const row = off & 0x1F;
        const scrollY = (-state.counterB9) & 0xFF;
        return { x: col * 8, y: ((row * 8) + scrollY) & 0xFF };
    },

    // $38BC / $38E9 wing-hit path — bullet glances bird wing. Source
    // outcome depends on bird.shape:
    //   - shape ∈ {$0B, $0C, $0D}: tile-swap via T3DB8 (bird keeps
    //     flying but its visible sprite changes to a "wing-damaged"
    //     variant). Source code at $38C7-$38E8:
    //         side    = (PlayerBulletX < bird.gridX) ? 4 : 0
    //         newShape = T3DB8[ side | (bird.shape - $0B) ]
    //         bird.shape = newShape
    //     Then fall through to $38E9.
    //   - any other shape ($01-$0A, $0E, $0F): no shape change at all
    //     ($38CA / $38CF early-exits to $38E9). Bird keeps flying with
    //     its current sprite unchanged.
    //   - $38E9 always: set M4366 := $FF (wing-hit sound flag) +
    //     spawnExplosion (alien-slot, counter=$07, scoreBcd=$02 = 20 pts).
    //   - BirdsLeft NEVER decremented.
    //
    // The previous port behavior — always downgrade to shape 1 — was
    // too aggressive: source only ever moves shape WITHIN {$0B-$0E},
    // not all the way back to egg. The 2026-05-17 fix replaces the
    // shape=1 reset with the source-faithful T3DB8 lookup (gated on
    // shape ∈ {$0B-$0D}; for other shapes, only the explosion +
    // 20 pts fire).
    //
    // Port deviation (kept): collision detection itself is AABB +
    // center-distance wing/body split (`birdBulletCollision`), not
    // source's tile-mask check via T3B60/T3BB0. That deviation only
    // affects WHICH bullets register as wing-hits — once we're inside
    // this function, the response now matches source byte-for-byte.
    onBirdWingHit(bird, idx) {
        // $38C7-$38D1 — shape-gate for tile swap.
        if (bird.shape >= 0x0B && bird.shape <= 0x0D) {
            // $38D8-$38DC — side derived from PlayerBulletX vs gridX
            // via `CP (HL); RLA`. Carry flag from CP is set when
            // PlayerBulletX < bird.gridX (bullet hits LEFT side of bird).
            const side = (state.player.bullet.x < bird.gridX) ? 4 : 0;
            const idxInTable = side | (bird.shape - 0x0B);
            const newShape   = BIRD_T3DB8[idxInTable];
            // T3DB8 only has 6 valid entries ($FF padding at offsets
            // 3 and 7); the source's early-exits at $38CA/$38CF prevent
            // those from ever being indexed. Guard anyway.
            if (newShape !== 0xFF) {
                bird.shape = newShape;
            }
        }
        // $38E9 — always-on tail: wing-hit explosion + 20 pts.
        const pos = this.birdCanvasPos(bird) || { x: 0, y: 0 };
        // Alien explosion is 24w × 16h — center on the bird's current
        // sprite. Width derived from the (possibly just-updated) shape
        // via the same T3EC0 lookup drawBird uses.
        const lsb = BIRD_T3EC0[bird.shape] ?? 0x40;
        const widthCols = Math.max(1, Math.min(7, (0x58 - lsb) >> 3));
        const widthPx = widthCols * 8;
        const ex = (pos.x + (widthPx >> 1) - 12) & 0xFF;
        const ey = (pos.y + 4 -  8) & 0xFF;
        this.spawnExplosion(0x07, 0x02, ex, ey);
        scoring.addPoints(20, state.gameAndDemoOrSplash);
    },

    // $3844 body-hit path — bird killed by player bullet. Source:
    //   - Clear bird tile in BG screen RAM (LD (DE),$00 at $3851)
    //   - DEC BirdsLeft at $385C
    //   - Compute scoreBcd from bird.shape (cached at $3850 before the
    //     slot is cleared) and bird[+4] (= advanceCtr at $3857). See
    //     $385D-$388D + $3894 in Code.md.
    //   - JP $38FB / $38F8 — populate first-free explosion slot
    //     (bonus-slot for shape >= $0B, alien-slot for shape < $0B)
    //   - On bonus-explosion animation END at $3A37: M4368 := $00,
    //     M4366 := $00 (reset maturity + wing-hit flag)
    //
    // Source scoring table (research_bird_stage.md §6.3):
    //   shape <  $0B → scoreBcd = $05 → 50 pts, alien-slot explosion
    //                  (no popup; matches "egg / cracking" kill)
    //   shape == $0F → scoreBcd = $10 → 100 pts, bonus-slot popup
    //                  (matches "mature bird in formation/drift")
    //   shape == $0E → scoreBcd = ((advanceCtr >> 1) & $7C) + $30
    //                  (typically $30-$78 → 300-780 pts), bonus-slot
    //   shape == $0D → above >> 1 (typically 150-380 pts), bonus-slot
    //   shape == $0C → above >> 1 (same as $0D — second halving is
    //                  gated `JP NC,$38FB` on shape >= $0C; only $0B
    //                  takes the third halving), bonus-slot
    //   shape == $0B → above >> 2 (typically 75-195 pts), bonus-slot
    //
    // The variable shapes ($0B-$0E) cover transient diving/swooping
    // states; in arcade play, most body kills land on shape $0F (100 pts)
    // and the egg path (50 pts) with occasional bonus values when you
    // catch a bird mid-swoop. Some computed scoreBcd values produce
    // invalid BCD nibbles (e.g. $38 >> 1 = $1C); the popup renders the
    // raw nibble through the same $20|nibble tile lookup as digit '0'-'9'
    // (so $0C displays as the tile right after '9'), and addPoints
    // takes the literal hi*10 + lo decode (matches the L37B0 display
    // semantics — invalid BCD is a source-side artifact, not corrected
    // here so the score on display always equals the score awarded).
    //
    // Maturity reset: port does it immediately on kill rather than at
    // bonus-explosion-animation end. Visible difference is ~16 frames
    // (the bonus sprite's life); the player sees `mat=00` in the HUD
    // right after a kill instead of after a half-second delay. Same
    // net behaviour — surviving birds re-process maturity from $00.
    onBirdHit(bird, idx) {
        // Cache shape + advanceCtr before clearing the slot ($3850-$3857).
        const shape  = bird.shape;
        const advCtr = bird.advanceCtr;

        bird.shape = 0;                                // free the slot
        state.birdsLeft = Math.max(0, state.birdsLeft - 1);
        state.maturity = 0;                            // $3A37 cleanup

        // $385D-$388D / $3894 — scoreBcd + slot-type decision.
        let scoreBcd;
        let isBonus;
        if (shape < 0x0B) {
            // $3894 — egg / cracking / small-bird kill.
            scoreBcd = 0x05;
            isBonus  = false;
        } else if (shape === 0x0F) {
            // $386F JP Z,$38FB — mature bird, default BC=$1010.
            scoreBcd = 0x10;
            isBonus  = true;
        } else {
            // $3874-$388D — compute from advanceCtr.
            let c = (((advCtr >> 1) & 0x7C) + 0x30) & 0xFF;
            if (shape <= 0x0D) c = (c >> 1) & 0xFF;     // $0B/$0C/$0D — halve once
            if (shape === 0x0B) c = (c >> 1) & 0xFF;    // $0B — halve again
            scoreBcd = c;
            isBonus  = true;
        }

        // BCD → decimal × 10 (matches L37B0 popup's hi/lo nibble render).
        const hi = (scoreBcd >> 4) & 0x0F;
        const lo =  scoreBcd       & 0x0F;
        const points = (hi * 10 + lo) * 10;

        const pos = this.birdCanvasPos(bird) || { x: 0, y: 0 };
        if (isBonus) {
            // 48w × 16h bonus sprite — center on the bird:
            //   ex = bird-center - sprite-half-width  = (px+4) - 24
            //   ey = bird-center - sprite-half-height = (py+4) -  8
            const ex = (pos.x + 4 - 24) & 0xFF;
            const ey = (pos.y + 4 -  8) & 0xFF;
            this.spawnBonusExplosion(0x10, scoreBcd, ex, ey);
        } else {
            // 24w × 16h alien-slot sprite (no popup), matches $38F8 path.
            // Source loads B=$0D as the slot counter ($3894 BC=$0D05).
            const ex = (pos.x + 4 - 12) & 0xFF;
            const ey = (pos.y + 4 -  8) & 0xFF;
            this.spawnExplosion(0x0D, scoreBcd, ex, ey);
        }

        scoring.addPoints(points, state.gameAndDemoOrSplash);
    },

    // $3498 — call $35B0 for birds 0..3.
    birdMaturityDispatchFirst4() {
        for (let i = 0; i < 4; i++) this.birdUpdate(state.birds[i]);
    },

    // $34AA — call $35B0 for birds 4..7.
    birdMaturityDispatchSecond4() {
        for (let i = 4; i < 8; i++) this.birdUpdate(state.birds[i]);
    },

    // $35B0 — per-bird update dispatcher. Walks the T3F00 entry for the
    // bird's current shape and chains a motion routine then a maturity-
    // advance routine, both pulled from the entry.
    //
    // Source uses a PUSH/RET-as-call trick on the 8085 stack: push 4
    // payload bytes (B,C,D,E from T3F00[shape] bytes 0..3), then push the
    // two routine addresses (bytes 4..5 = maturity, bytes 6..7 = motion),
    // then RET → pops the LAST push (motion). When motion routine RETs,
    // it pops the NEXT entry (maturity). Maturity routines start with
    // POP DE / POP BC / POP HL to recover the payloads. Port translates
    // this to a normal function call sequence: motion(bird, B, C, D, E),
    // then maturity(bird, B, C, D, E). Same semantic, no stack abuse.
    //
    // Per-frame work BEFORE the dispatch:
    //   - Read bird[+0] = shape. If 0, return (slot empty / dead bird).
    //   - Read bird[+4] = advanceCtr. If non-zero, DEC it. (If zero,
    //     don't DEC and don't reset — gates the maturity-advance fire.)
    //
    // research_bird_stage.md §5.1 (T3F00), §4 (maturity gates), §1.4
    // (motion routines).
    birdUpdate(bird) {
        const shape = bird.shape;
        if (shape === 0) return;
        if (bird.advanceCtr !== 0) {
            bird.advanceCtr = (bird.advanceCtr - 1) & 0xFF;
        }
        const base = shape << 3;                      // T3F00[shape] base
        const b = BIRD_T3F00[base + 0];
        const c = BIRD_T3F00[base + 1];
        const d = BIRD_T3F00[base + 2];
        const e = BIRD_T3F00[base + 3];
        // Bytes 4..5 = "first call" address ($35D1-$35D4 PUSH) — the
        // maturity-advance routine. Bytes 6..7 = "second call" address
        // ($35D6-$35D9 PUSH) — the motion routine. Source RETs into the
        // second push first, so MOTION fires first, then maturity when
        // motion returns and pops the next stack frame.
        const maturityAddr = (BIRD_T3F00[base + 4] << 8) | BIRD_T3F00[base + 5];
        const motionAddr   = (BIRD_T3F00[base + 6] << 8) | BIRD_T3F00[base + 7];
        switch (motionAddr) {
            case 0x36C0: this.birdMotion36C0(bird); break;
            case 0x35E0: this.birdMotion35E0(bird); break;
            // Shape 0 falls through (all $FF — RET Z handled above);
            // any unknown value silently skipped.
        }
        switch (maturityAddr) {
            case 0x36D2: this.birdMaturity36D2(bird, b, c, d, e); break;
            case 0x36EA: this.birdMaturity36EA(bird, b, c, d, e); break;
            case 0x370A: this.birdMaturity370A(bird, b, c, d, e); break;
            case 0x36CC: /* no-op — shapes C/D, stack-unwind only */    break;
        }
    },

    // $36D2 — maturity advance for shapes 1, 2, 3 (OR $01 into M4368).
    // Gate: bird[+4] (advanceCtr) must be 0 — i.e. countdown finished.
    // Writes B → bird[+4] (reset countdown), D → bird[+0] (new shape).
    birdMaturity36D2(bird, b, c, d, e) {
        if (bird.advanceCtr !== 0) return;
        bird.advanceCtr = b;
        bird.shape = d;
        state.maturity = (state.maturity | 0x01) & 0xFF;
    },

    // $36EA — maturity advance for shapes 4, 5, 8, 9, B, E (OR $02).
    // Gates: bird[+4] == 0 AND (bird[+6] & $0F) == 0.
    birdMaturity36EA(bird, b, c, d, e) {
        if (bird.advanceCtr !== 0) return;
        if ((bird.field6 & 0x0F) !== 0) return;
        bird.advanceCtr = b;
        bird.shape = d;
        state.maturity = (state.maturity | 0x02) & 0xFF;
    },

    // $370A — maturity advance for shapes 6, 7, A, F (OR $04, and
    // conditionally OR $08 with shape/counter override). Same gate as
    // $36EA; after the OR $04, an additional gate on (M436F & E) & $F0
    // decides whether to take the OR $08 override path. With M436F = 0
    // (cold start, before $3560 has produced randomness), the override
    // fires unconditionally — but $3560 runs every frame in
    // stageBirdCombat, so by the time a bird reaches shape 6/7/A/F,
    // M436F is randomized and the override fires probabilistically.
    birdMaturity370A(bird, b, c, d, e) {
        if (bird.advanceCtr !== 0) return;
        if ((bird.field6 & 0x0F) !== 0) return;
        bird.advanceCtr = b;
        bird.shape = d;
        state.maturity = (state.maturity | 0x04) & 0xFF;
        // Override gate: (M436F & E) & $F0 must be 0 to fire OR $08.
        if (((state.m436F & e) & 0xF0) !== 0) return;
        // Override: install shape = E & $0F, advanceCtr = C, OR $08.
        bird.shape = e & 0x0F;
        bird.advanceCtr = c;
        state.maturity = (state.maturity | 0x08) & 0xFF;
    },

    // $36C0 — anim-cycle motion for shapes 1, 5, 6, 7, 8, 9, A. Only
    // ticks bird[+3] (anim phase 0..7) on even-advanceCtr frames.
    birdMotion36C0(bird) {
        if ((bird.advanceCtr & 1) !== 0) return;
        bird.field3 = (bird.field3 + 1) & 0x07;
    },

    // $35E0 — main sweep motion for shapes 2, 3, 4, B, C, D, E, F.
    //
    // Geometry: each bird oscillates horizontally between a current X
    // (bird[+5]) and a target X (bird[+7]). bird[+6] is the per-tick
    // step size AND the direction encoding:
    //   bird[+6] <  $10  → main path: gridX += step, screen moves right
    //                      (screenLsb -= $20 on anim-overflow)
    //   bird[+6] >= $10  → alt path:  gridX -= step, screen moves left
    //                      (screenLsb += $20 on anim-borrow)
    // When the bird reaches its target (gridY == gridX), $3672 / $3695
    // pick a new target from `PlayerShipX & $F8` plus randomness via
    // `M436D` — that's the player-tracking dive that gives Phoenix's
    // birds their characteristic "swoop toward the ship" behavior.
    //
    // bird[+3] (anim phase) is also bumped by step each tick and wraps
    // at 8 — this drives the egg/wing animation cycle for the static
    // shapes (the 4-frame T3E08 lookup uses bird[+3] >> 1).
    //
    // Screen address (bird[+1]:bird[+2]) updates use source's screen-RAM
    // semantics: `$20` in screenLsb = high 5 bits = 1 display column.
    // Subtracting $20 with no borrow = +1 col display (right); with
    // borrow = +1 col + screenMsb-- (wrap to previous row of cols).
    // Adding $20 = -1 col display (left); carry → screenMsb++.
    //
    // Helpers are split per source label to keep the dispatch readable;
    // each helper's HL convention is documented in its comment.
    // research_bird_stage.md §10 item 7.
    birdMotion35E0(bird) {
        const f6 = bird.field6;
        if (f6 >= 0x10) {
            this._birdMotion3628(bird, f6);
            return;
        }
        // Main path: bird[+6] < $10
        const b = f6;                          // save step
        bird.gridX  = (bird.gridX  + b) & 0xFF;  // bird[+5] += b
        const sum = (bird.field3 + b) & 0xFF;
        bird.field3 = sum;
        if (sum < 0x08) {
            this._birdMotion366A(bird, b);
            return;
        }
        bird.field3 = sum & 0x07;              // wrap anim phase
        // bird[+2] -= $20  (with borrow → bird[+1]--)
        let lsbNew = bird.screenLsb - 0x20;
        if (lsbNew < 0) {
            bird.screenLsb = (lsbNew + 0x100) & 0xFF;
            bird.screenMsb = (bird.screenMsb - 1) & 0xFF;
        } else {
            bird.screenLsb = lsbNew;
        }
        // Fall through to $3604
        this._birdMotion3604(bird, b);
    },

    // $3604 — main-path tail. Computes (bird[+7] - bird[+5]) and uses
    // it (after some bit-shifting) to pick the next bird[+6] step.
    // bird[+6] is reset to $10 unconditionally first; the subsequent
    // writes overwrite that based on three conditions:
    //   - exact target match (a == 0)  → $3672 (pick new target X)
    //   - bit-shifted diff < B (orig)  → bird[+6] = (diff & $1F) + 1
    //   - else if M436E == B           → bird[+6] = M436E (no-op write)
    //   - else                         → bird[+6] = B + 1
    // The randomization via M436E lets the swoop amplitude wobble each
    // sweep without becoming pathological.
    _birdMotion3604(bird, b) {
        const c = bird.gridX;                  // saved bird[+5]
        const a0 = bird.gridY;                 // bird[+7] target
        bird.field6 = 0x10;                    // tentative: switch to alt mode
        const diff = (a0 - c) & 0xFF;
        if (diff === 0) {
            this._birdMotion3672(bird);
            return;
        }
        let a = (diff - 1) & 0xFF;
        a = ((a >> 3) | (a << 5)) & 0xFF;      // RRCA × 3
        a &= 0x1F;
        const cpBorrow = a < b;                // CP B
        a = (a + 1) & 0xFF;
        bird.field6 = a;
        if (cpBorrow) return;
        a = state.m436E;
        bird.field6 = a;
        if (a === b) return;
        bird.field6 = (b + 1) & 0xFF;
    },

    // $366A — main-path helper for "anim phase didn't overflow yet."
    // If bird[+6] was already 0 (step disabled), bump it to 1 to start
    // motion next frame. Otherwise return — anim phase is still pre-8,
    // no column step needed.
    _birdMotion366A(bird, b) {
        if (b !== 0) return;
        bird.field6 = (bird.field6 + 1) & 0xFF;
    },

    // $3672 — pick a new target X (bird[+7]) when the bird has reached
    // its sweep limit on the main path. Clamps to `min(gridX,
    // PlayerShipX & $F8)`, then subtracts (M436D pre-add) to seed the
    // sweep amplitude. M436D advances by $08 each call (source-faithful
    // — sets up the next bird's sweep with a different starting offset).
    _birdMotion3672(bird) {
        let b = bird.gridX;
        const px = state.player.x & 0xF8;
        if (px < b) b = px;
        const cVal = state.m436D;
        state.m436D = (state.m436D + 0x08) & 0xFF;
        const a = (b - cVal) & 0xFF;
        const borrow = b < cVal;
        bird.gridY = 0x08;                     // unconditional fallback
        if (borrow) return;
        if (a < 0x08) return;
        bird.gridY = a;
    },

    // $3628 — alt path (bird[+6] >= $10). Mirror of main path but
    // direction-reversed: screen moves left, anim phase decrements.
    // Low nibble of bird[+6] = step magnitude; high nibble bit-4 stays
    // set (so subsequent ticks stay in alt path).
    _birdMotion3628(bird, f6) {
        let a = f6 & 0x0F;
        if (a === 0) {
            this._birdMotion3744(bird);
            return;
        }
        const b = a;
        bird.gridX = (bird.gridX - b) & 0xFF;
        const newAnim = (bird.field3 - b) & 0xFF;
        const animBorrow = bird.field3 < b;
        bird.field3 = newAnim;
        if (!animBorrow) {
            this._birdMotion3695(bird, b);
            return;
        }
        bird.field3 = newAnim & 0x07;
        // bird[+2] += $20  (with carry → bird[+1]++)
        let lsbNew = bird.screenLsb + 0x20;
        if (lsbNew > 0xFF) {
            bird.screenLsb = lsbNew & 0xFF;
            bird.screenMsb = (bird.screenMsb + 1) & 0xFF;
        } else {
            bird.screenLsb = lsbNew;
        }
        // Fall through to $3648
        this._birdMotion3648(bird, b);
    },

    // $3648 — alt-path tail. Computes (bird[+5] - bird[+7]) with the
    // same bit-shift / CP / M436E logic as $3604, then OR's $10 into
    // the result so the next tick stays in alt path.
    _birdMotion3648(bird, b) {
        const v5 = bird.gridX;
        let a = (v5 - bird.gridY) & 0xFF;
        a = ((a >> 3) | (a << 5)) & 0xFF;      // RRCA × 3
        a &= 0x1F;
        const cpBorrow = a < b;
        a = (a + 1) & 0xFF;
        if (!cpBorrow) {
            const me = state.m436E;
            if (me !== b) {
                a = (b + 1) & 0xFF;
            } else {
                a = me;
            }
        }
        bird.field6 = (a | 0x10) & 0xFF;
    },

    // $3695 — alt-path target-reached check. Only fires when bird[+7]
    // == bird[+5] (sweep limit). Clears bird[+6] so the next tick exits
    // alt path naturally, then picks a new bird[+7] target additively
    // (capped at $C8).
    //
    // ⚠ Source reads B = bird[+5] then A = bird[+7] then `CP B; RET NZ`
    // — comparing gridY against the just-read gridX. (My port previously
    // compared against the step parameter `b`, which broke the alt→main
    // transition: 2026-05-17 fix.)
    //
    // ⚠ The PlayerShipX clamp uses **max**(playerX, bird[+5]) here, but
    // $3672's analogous clamp uses **min** — source $3695's `JP C` at
    // $36A7 skips `B = A` when A < B (so B ends up as max), while
    // $3672's `JP NC` at $367C skips when A >= B (B ends up as min).
    // The two routines drive the LEFT and RIGHT sweep targets
    // respectively.
    _birdMotion3695(bird, b) {
        // bird[+7] vs bird[+5] — NOT vs step parameter.
        if (bird.gridY !== bird.gridX) return;
        const bx = bird.gridX;                 // captured for downstream
        bird.field6 = 0;
        const px = state.player.x & 0xF8;
        // max(px, bx)
        let bb = bx;
        if (px >= bx) bb = px;
        const cVal = state.m436D;
        state.m436D = (state.m436D + 0x08) & 0xFF;
        // Source: A = (m436D pre-add) + $08; then ADD A,B → effective
        // (m436D + 8 + B). The "$08" is added between the m436D read
        // and the post-read store, but the value used downstream is
        // the POST-store one (= pre-add + 8).
        const sum = (cVal + 0x08 + bb);
        bird.gridY = 0xC8;                     // unconditional fallback
        if (sum > 0xFF) return;
        if ((sum & 0xFF) >= 0xC8) return;
        bird.gridY = sum & 0xFF;
    },

    // $3744 — alt-path transition when bird[+6]'s low nibble hits 0.
    // Resets bird[+6] to $11 (alt path, step 1), bumps bird[+5] DOWN,
    // resets anim phase to $07, and steps the screen LSB by +$20 (with
    // carry into MSB). This is the "kick the bird back into motion"
    // path when the alt-path step magnitude underflows to 0.
    _birdMotion3744(bird) {
        bird.field6 = 0x11;
        bird.gridX = (bird.gridX - 1) & 0xFF;
        bird.field3 = 0x07;
        let lsbNew = bird.screenLsb + 0x20;
        if (lsbNew > 0xFF) {
            bird.screenLsb = lsbNew & 0xFF;
            bird.screenMsb = (bird.screenMsb + 1) & 0xFF;
        } else {
            bird.screenLsb = lsbNew;
        }
    },

    // $3560 — bird randomizer. Picks a T3E80 entry from (LevelAndRound
    // round bits + BirdsLeft density + Counter9A bit + PRNG byte) and
    // exposes the entry's (shape, delta) to motion/maturity via M436E/D,
    // plus a bit-mixed PRNG byte via M436F. Runs once per half-flock
    // dispatch in stageBirdCombat. research_bird_stage.md §3.
    birdRandomize() {
        // 4-bit PRNG output (port's getRandomNumber is masked to $0F —
        // see comment at $30AA implementation). Source returns a full
        // byte; the port's narrowing is a pre-existing limitation that
        // doesn't break maturity/motion gates.
        const rnd = this.getRandomNumber() & 0xFF;
        // C = rnd << 2 (after 2 RLCAs on a value with high nibble 0,
        // this is just shift-left; high bits don't wrap).
        const c = (rnd << 2) & 0xFF;
        // 4 RLCAs total: nibble swap. With high nibble = 0, result is
        // rnd << 4. OR with original rnd → byte with both nibbles = rnd.
        const m436f = (((rnd << 4) | rnd) & 0xFF);
        state.m436F = m436f;

        // Round contribution: cap LevelAndRound at $30 if >= $40, mask
        // to bits 5..4, RRCA once (→ bits 4..3 of B).
        let lrCapped = state.levelAndRound;
        if (lrCapped >= 0x40) lrCapped = 0x30;
        let bAcc = (lrCapped & 0x30) >> 1;            // bits 4..3
        // Density contribution: min(BirdsLeft - 1, 3) << 1 → bits 3..2.
        let dens = (state.birdsLeft - 1) & 0xFF;
        if (dens >= 4) dens = 3;
        bAcc = ((bAcc << 1) | (dens << 1)) & 0xFF;
        // Counter9A parity contribution: source reads $439A (= MSB byte
        // of the 16-bit counter, flips every 256 frames). After RLCA × 2
        // and AND $20, the resulting bit-5 of the contribution flips
        // every 8 × 256 = 2048 frames (~34 s) — a long-period jitter on
        // the T3E80 lookup. **Bug fixed 2026-05-17**: previous port
        // mistakenly read $439B (LSB, fast); the lookup over-randomized.
        let c9 = ((state.counter9a >> 8) & 0xFF) << 2;
        c9 &= 0x20;
        bAcc = (bAcc | c9) & 0xFF;
        // Final index: bAcc + $80 → T3E80 entry. Subtract $80 since
        // BIRD_T3E80 is extracted starting at $3E80 (relative offset 0).
        const off = ((bAcc + 0x80) - 0x80) & 0xFF;
        if (off >= BIRD_T3E80.length) {
            state.m436E = 0;
            state.m436D = 0;
            return;
        }
        state.m436E = BIRD_T3E80[off];
        const byte1 = BIRD_T3E80[off + 1] ?? 0;
        state.m436D = (byte1 + c) & 0xF8;
    },

    // playerBulletCollision / alienVsPlayerCollision / killAlienRegular
    // moved to states_alien.js — spread via ...alienMixin.

    // $3980 — bird-body-vs-player collision (source's "scan upward from
    // player using PlayerBullet position as a probe" trick). Source flow:
    //   - $3980 gates the scan on M4BD2 in [$0C, $1C) (port skips this
    //     timing gate — bird positions themselves provide the natural
    //     "near player" filter via AABB).
    //   - Backs up PlayerBulletState to $4BC0+ ($3989-$3998), then sets
    //     PlayerBullet position = PlayerShip position ($399B-$39A7),
    //     activates the bullet bit-3, and runs $3800 in a loop walking
    //     up one row per iteration ($39C3 loop).
    //   - $3800 detects bird sprites by reading the tile at the probe
    //     position; on hit, $3851 zeroes the bird's shape (kills it) +
    //     $385C decrements BirdsLeft + awards points/bonus explosion.
    //   - When the bullet gets deactivated by a kill ($39CC JP Z,$39F0),
    //     dispatches on ShieldCount: sc >= $C0 → SUB $01 (extra shield
    //     dec, bird kill cost), continue; sc < $C0 → JP $0CC4 player dies.
    //
    // Port simplification: direct AABB between each bird's bounding box
    // and the player's 2×2 ship hitbox. Faithful in OUTCOME (bird dies,
    // shield-aware player fate) but skips the screen-RAM tile-probe
    // mechanism — same trade-off as enemyBulletUpdate and
    // alienVsPlayerCollision use elsewhere (port has no FG screen RAM).
    //
    // Wired in stageBirdCombat after birdBulletCollision, replacing the
    // prior "cosmetic TODO" stub. Source's $3980 fires from $340C inside
    // L3400 each bird-stage frame; port matches by calling once per
    // bird-stage tick.
    birdVsPlayerCollision() {
        if (!state.player.alive) return;
        const px = state.player.x & ~7;
        const py = state.player.y;
        for (let i = 0; i < 8; i++) {
            const bird = state.birds[i];
            if (bird.shape === 0) continue;
            const pos = this.birdCanvasPos(bird);
            if (!pos) continue;
            const lsb = BIRD_T3EC0[bird.shape] ?? 0;
            const widthCols = (0x58 - lsb) >> 3;
            if (widthCols < 1 || widthCols > 7) continue;
            const widthPx = widthCols * 8;
            if (!aabbHit(pos.x, pos.y, widthPx, 16, px, py, 16, 16)) continue;

            // Hit. Kill the bird via the standard onBirdHit path ($3851
            // zeroes shape + $385C decrements BirdsLeft + awards points
            // + spawns bonus explosion when shape >= $0B). This fires
            // even on shielded hits — source $3800 always kills the
            // bird before $39F0 dispatches on shield.
            this.onBirdHit(bird, i);

            if (state.player.shieldCount > 0xC0) {
                // $39F8-$39FA — extra shield-counter decrement. The
                // bird kill "costs" one frame of shield duration on top
                // of the per-frame DrawShields dec.
                state.player.shieldCount = (state.player.shieldCount - 1) & 0xFF;
            } else {
                // $39F5 JP C,$0CC4 — no shield, player dies.
                this.onPlayerHit();
            }
            return;
        }
    },

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
