import { state } from './state.js';
import { input } from './input.js';
import { scoring } from './scoring.js';
import {
    PLAYER_INIT_BLOCK,    // source T0560
    STAGE_BLOCK_INDEX,    // source T0598
    STAGE_BLOCKS,         // source $05A8/$05B4/$05C0/$05CC
    FORMATION_INDEX,      // source T063A
    ALIEN_CONTROL_INIT,   // source T1500
    ALIEN_MOVE_PTR_INIT,  // source T1520
    ALIEN_FORMATIONS,     // source T1540
    ALIEN_BIRD_PARTITION, // source T1760
    ALIEN_EXPLOSION_ROM,  // source $17B0..$17F5 — T17B0 + frame tiles
    MOTION_PATH_BASE,     // source T1000
    MOTION_DIRECTIONS,    // source T1700
    ANIMATION_TABLE,      // source T16A0
    SHAPE_LSB_TABLE,      // source T1600
    PATTERN_COL_TABLE,    // source T3300
    PATTERN_ROW_TABLE,    // source T3310
    PATTERN_ADDR_TABLE,   // source T3330
    PATH_ROM_LOW,         // 0x1000-0x13FF — drift + early swoops
    PATH_ROM_HIGH,        // 0x2C00-0x2FFF — late swoops + angry patterns
    STARFIELD_T1C00,      // source T1C00 — starfield used by stages 0/5/7
    STARFIELD_T1F00,      // source T1F00 — starfield used by stage 2
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

// Debug knob — when non-null, the first state-0 transition jumps directly
// to this LevelAndRound instead of starting at $00 (stage 0, round 1).
// Set to $05 (stage 5, round 1) for fast iteration on step 11 birds,
// skipping the ~30 s of alien combat (player can't die yet, so the cost
// per iteration is otherwise high). Null disables the override.
// research_bird_stage.md §9.0.
const DEBUG_START_LEVEL_AND_ROUND = 0x05;

// L0400 — Code.md:GameStateMachine. JT1 jump table → JS switch
// (research_code_flow.md §5.1).

// Offset of $05A8 inside the packed STAGE_BLOCKS slice (data.js exports the
// four 12-byte blocks $05A8/$05B4/$05C0/$05CC as one 48-byte array).
// STAGE_BLOCK_INDEX (source T0598) stores LSBs in the $A8..$CC range;
// subtract $A8 to get the slice index.
const STAGE_BLOCK_BASE = 0xA8;

// Per-alien path pointers carry full ROM addresses. Path data lives in two
// ROM regions: 0x1000-0x13FF (drift + early swoops T1020-T13D0) and
// 0x2C00-0x2FFF (late swoops + angry T2E00/T2E40). Dispatch on ptr range.
function getPathByte(ptr) {
    if (ptr < 0x1400) return PATH_ROM_LOW[ptr - 0x1000] ?? 0;
    return PATH_ROM_HIGH[ptr - 0x2C00] ?? 0;
}

// Return { w, h } bounding box for an alien from its controlA draw-mode bits.
// Used for AABB collision (research_rendering.md §6.1, §2.4).
function alienBox(controlA) {
    const mode = controlA & 7;
    if (mode === 1) return { w: 16, h: 8  };   // 2×1
    if (mode === 3) return { w: 8,  h: 16 };   // 1×2
    if (mode === 4) return { w: 16, h: 16 };   // 2×2
    return { w: 8, h: 8 };                      // 1×1 (mode 0)
}

// AABB overlap test (research_rendering.md §6.1).
function aabbHit(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Decode a signed-byte motion delta. T1700 packs (dx, dy) as 8-bit
// two's-complement (e.g. $FF = -1, $FC = -4).
function s8(b) {
    return b & 0x80 ? b - 0x100 : b;
}

// Read a byte from the current starfield ROM page. Source uses
// HL = ($43B2 << 8) | $43B3, with INC L wrapping at the 256-byte page
// boundary (low byte only). Only $1C and $1F bases are reachable from
// alien/bird stage init; $1D (mothership upside-down image) lands here
// during step 11 — return 0 for now so a mis-init can't crash.
function readStarfield(hi, lo) {
    if (hi === 0x1C) return STARFIELD_T1C00[lo & 0xFF];
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
    state0_NewGameInit() {
        state.counterA5 = 0x80;       // 128-frame countdown (research_code_flow.md §5.5)
        state.gameState = 1;

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

    // L0547 InitPlayerDataStructure — source copies T0560 into $43C0
    // (player + bullets) and then ClearBbytesAtHL clears $43E0-$43FF
    // (the player/bullet screen-RAM address pointers). With those
    // pointers zeroed, the player ship's per-frame draw stops painting
    // tiles to FG screen RAM — so the ship visually disappears during
    // the fade-in stages (0, 2) where PlayerUpdate doesn't run.
    //
    // Port equivalent: set `state.player.alive = false`. The canvas-based
    // renderer in render.drawPlayer is gated by alive, so clearing it
    // mirrors source's "ship invisible during fade-in" behavior. Combat
    // handlers (stageAlienCombat at LR=1/3/B, stageBirdCombat at LR=5/7)
    // re-set alive=true at the top of their handler, so the ship
    // reappears at the new init position ($64, $D8 = center-bottom) the
    // moment combat starts.
    initPlayerDataStructure() {
        state.player.x           = PLAYER_INIT_BLOCK[2];   // PlayerShipX = $64 = 100
        state.player.y           = PLAYER_INIT_BLOCK[3];   // PlayerShipY = $D8 = 216
        state.player.alive       = false;                  // ← mirrors $0552 clear
        state.player.shieldCount = 0;
        state.player.bullet.active = false;
        state.player.bullet.x      = PLAYER_INIT_BLOCK[6]; // $00
        state.player.bullet.y      = PLAYER_INIT_BLOCK[7]; // $D0
    },

    // L0532 init alien data — three sub-routines:
    //   $05EC InitAlienControlStates → write ALIEN_CONTROL_INIT[stage]
    //                                  (controlA, controlB) to all
    //                                  AliensLeft slots (source T1500)
    //   $0650                        → write ALIEN_MOVE_PTR_INIT[stage]
    //                                  move-pattern ptr to all AliensLeft
    //                                  slots (source T1520; unused yet)
    //   $0610 InitAlienPositions     → formation table → x,y per alien
    initAlienData() {
        const stage = state.levelAndRound & 0x0F;
        const controlA = ALIEN_CONTROL_INIT[stage * 2];
        const controlB = ALIEN_CONTROL_INIT[stage * 2 + 1];
        // T1520 stores big-endian (MSB at +0, LSB at +1) — see source $0650
        // ($065B-$065D loads D from MSB then E from LSB).
        const movePtr  = (ALIEN_MOVE_PTR_INIT[stage * 2] << 8)
                       |  ALIEN_MOVE_PTR_INIT[stage * 2 + 1];

        // L0610 formation lookup. RRCA(LevelAndRound) & 0x0F selects the
        // FORMATION_INDEX (source T063A) entry; bit 0 of LevelAndRound
        // thus picks which round-row (after rotating to bit 7 it's masked
        // off). Equivalent in JS: (LevelAndRound >> 1) & 0x0F.
        const formationIdx = (state.levelAndRound >> 1) & 0x0F;
        const formationLsb = FORMATION_INDEX[formationIdx];
        // Formation table at $15xx; ALIEN_FORMATIONS starts at $1540.
        const formationOffset = formationLsb - 0x40;

        // Note: alive stays false here. In source, per-stage init only
        // writes the data structure — the aliens become visible when the
        // per-frame stage handler calls AlienDataController ($0A50) which
        // dispatches Bit3Controller. L0834 (fade-in) only calls it once
        // counterB4 drops below $15; L2000 (combat) calls it every frame.
        // Mirror that here by leaving alive=false in init and setting it
        // inside the stage handlers.
        for (let i = 0; i < state.aliensLeft; i++) {
            const a = state.aliens[i];
            a.controlA = controlA;
            a.controlB = controlB;
            a.x = ALIEN_FORMATIONS[formationOffset + i * 2];
            a.y = ALIEN_FORMATIONS[formationOffset + i * 2 + 1];
            a.alive = false;
            state.alienMovePtr[i] = movePtr;
        }
        for (let i = state.aliensLeft; i < 16; i++) {
            state.aliens[i].alive = false;
        }
    },

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
                this.stageSpiralFill();            // $2230 — bird-stage intro wipe
                break;
            // 0x8 spiral-fill ($2230) → step 12 (gated by stop-gap until mothership)
            // 0x9 / 0xA mothership fade-ins      → step 12
        }
    },

    // L0834 — Game level 0 and 2: stars scrolling down and 'aliens fade in'.
    // CounterB4 = stageBlock[9] (= $43B4); decrements every frame. Once it
    // drops below $15, GetAnimationChrs walks E through 5 tile values; all
    // aliens get rewritten with (controlA=$08, controlB=E) each frame so
    // they appear to morph in lockstep. L0848 tail bumps the stage and
    // returns to GameState 2 once the counter hits 0.
    stageAlienFadeIn() {
        // L0834 head — $06F0 fills + scrolls the BG plane every frame
        // during fade-in. Calls StarsScrollDown ($067A), then
        // AddGalaxiesToBackground ($2040), then AddPlanetsToBackground
        // ($06B0) — see this.bgUpdate. Note source's L2000 (combat) does
        // NOT call $06F0, so the BG is frozen during alien combat by
        // design — only fade-in / score-display / mothership update it.
        this.bgUpdate();

        const counterB4 = (state.stageBlock[9] - 1) & 0xFF;
        state.stageBlock[9] = counterB4;
        if (counterB4 >= 0x15) return;

        // L085A GetAnimationChrs — control-B walks $6C → $6D → $6E → $6F → $68
        // as counterB4 drops through 4-frame phases. control-A stays $08
        // throughout (Bit3 "Draw 1×1", which writes control-B as the raw
        // tile byte — see render.js).
        let controlB;
        if      (counterB4 >= 0x11) controlB = 0x6C;
        else if (counterB4 >= 0x0D) controlB = 0x6D;
        else if (counterB4 >= 0x09) controlB = 0x6E;
        else if (counterB4 >= 0x05) controlB = 0x6F;
        else                         controlB = 0x68;

        // L05FA — rewrite (controlA, controlB) for every active alien;
        // alive=true mirrors the AlienDataController $0A50 call at $0845
        // that makes the aliens actually paint to screen RAM this frame.
        for (let i = 0; i < state.aliensLeft; i++) {
            const a = state.aliens[i];
            a.controlA = 0x08;
            a.controlB = controlB;
            a.alive = true;
        }

        // L0848 stage-clear tail.
        if (counterB4 === 0) {
            state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
            state.gameState = 2;
        }
    },

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
        // else L24E0 — mothership BG, step 11.
    },

    // L2000 — combat handler for stages 1/3/B.
    //
    // Source per-frame work: PlayerUpdate ($0876), bullet-vs-alien scan
    // ($0DF0 — runs every frame, not lane-gated), then a 4-lane round-robin:
    //   lane 0: AlienDataController + AlienBehaviorUpdate + alien-vs-player
    //   lane 1: enemy-bullets + AlienMovementUpdate + L0FC0
    //   lane 2: AlienAnimationUpdate + L2560
    //   lane 3: enemy-bullets + L0A6C + L0FC0
    // JS port: movement+animation merged into lane 1 for tick-pair atomicity
    // (research_rendering.md §9.2). Lanes 2/3 are empty stubs.
    //
    // ⚠ TIMING IS INTERLOCKED — see research_enemy_motion.md §1.0.1 before
    // changing lane assignments, the movement/animation merge, or the
    // Counter93 dispatch phase in alienBehaviorUpdate. These three knobs
    // were tuned together and a change in any one can silently break the
    // others (e.g. swoops never returning to formation, controlB=0xFF
    // reaching the renderer). Verified via empirical regression 2026-05-16.
    //
    // alive=true loop mirrors AlienDataController ($0A50): in source it paints
    // aliens to screen RAM gated by Bit3Controller; here alive=true enables
    // render.js drawAlien for this frame.
    stageAlienCombat() {
        // L2000 head — these run every frame regardless of AliensLeft
        // (matches source order: PlayerUpdate at $2000, L0DF0 at $2003,
        // L24A0 at $2006 — all before the $435F counter read+increment
        // and the AliensLeft check at $2011).
        state.player.alive = true;
        this.playerUpdate();          // L0876
        // Bullet-vs-alien scan: source calls L0DF0 before the lane switch
        // at $200E; runs even during stage clear since the player bullet
        // can still be in flight.
        this.playerBulletCollision();
        // L24A0 stubbed (bird / UFO machinery, step 11).

        // L2009-L2010: read+increment the $435F masked counter. Source
        // advances this regardless of AliensLeft — the stage-clear path
        // (L21BA) consumes the SAME counter for its bit-0 dispatch.
        const lane = state.combatLane & 3;
        state.combatLane = (state.combatLane + 1) & 0xFF;

        // L2011-L2015: AliensLeft check. Stage-clear path (L21BA) drains
        // the post-clear countdown + runs residual bullets/explosions
        // during the pause; see stageClearUpdate.
        if (state.aliensLeft === 0) {
            this.stageClearUpdate(lane);
            return;
        }

        // alive=true loop (mirror of AlienDataController $0A50). Runs only
        // during normal combat; during stage clear no aliens have
        // controlA bit 3 set, so this would be a no-op anyway.
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) !== 0) a.alive = true;
        }
        // ⚠ PORT-SPECIFIC LANE SWAP — see research_enemy_motion.md §6.10
        // (swoop alignment via lane-order swap):
        //   Source's L2000 has behavior on lane-0 and movement on lane-1,
        //   so behaviorCommit fires at counter93=8 BEFORE the next
        //   movement crosses the alien to a tile boundary — meaning the
        //   alien is at x%8=7 when commit writes a dx=±4 swoop pattern,
        //   producing a stuck horizontal slide (§3.5 alignment).
        //   Our port swaps: movement runs in lane-0, behavior in lane-1.
        //   This makes movement (which can advance the alien past a grid
        //   boundary) fire ONE FRAME BEFORE behaviorCommit, so commit
        //   sees alien at x%8=0 (just crossed) and the upcoming dx=±4
        //   swoop bytes can advance the ptr naturally. Replaces the
        //   x-snap workaround that was in behaviorCommit; removes the
        //   ±3 pixel jolt + drift-desync side effects.

        // L2017-L202A — depleted-formation flag latch + dispatch select.
        // Source: when AliensLeft<5 AND masked counter==0, set $435E:=$FF.
        // Once $435E is non-zero, the router takes the L2146 path (2-state
        // bit-0 dispatch) instead of L2130 (4-state full lane round-robin).
        // The flag is sticky for the rest of the stage; cleared by L32B0's
        // zero-fill at the next state-2 init.
        if (state.aliensLeft < 5 && lane === 0) {
            state.aliensLeftFlag = 0xFF;
        }
        const depleted = state.aliensLeft < 5 && state.aliensLeftFlag !== 0;

        // Full-formation (L2130, AliensLeft≥5 or 1-frame pre-latch window):
        //   lane 0: movement + animation
        //   lane 1: behavior + collision
        //   lanes 2/3: empty (reserved for enemy fire — L2560/EnemyBulletUpdate)
        //
        // Depleted (L2146, AliensLeft<5 after latch): doubles work onto
        // lanes 2/3 by reusing the lane-0/lane-1 handlers. Preserves the
        // §1.0.1 invariant that movement fires the frame before behavior.
        //   counter 0,2 (bit-0=0): movement + animation  (port-swapped from L2190)
        //   counter 1,3 (bit-0=1): behavior + collision  (port-swapped from L21A5)
        if (lane === 0 || (lane === 2 && depleted)) {
            // L24C4 — bg scroll. In source, L2160 (full-formation lane 1
            // = port lane 0 after swap) and L21A5 (depleted bit-0=1 =
            // port lanes 0+2 after swap) both call $24C4. Per-frame BG
            // scroll + planet/galaxy fill is what makes the starfield
            // keep moving during combat (not only fade-in).
            this.bgUpdateIfAlienStage();
            this.alienMovementUpdate();
            this.alienAnimationUpdate();
            // Step 10: L0FC0 explosion animation lives alongside movement.
            // Source full L2130: L0FC0 is on lane 1 (with EnemyBulletUpdate +
            // AlienMovementUpdate) → port lane 0 after the swap.
            // Source depleted L21A5 (bit-0=1, counters 1+3) also runs L0FC0
            // alongside movement+animation → port bit-0=0 lanes 0+2 after
            // the swap, which matches this branch (lane 0, or lane 2 when
            // depleted). One additional call for full lane 3 lives below.
            //
            // Source L0FC0 processes ALL 4 slots in one call: alien slots
            // ($4370/$4374) via L0FD8, then bonus slots ($4378/$437C) via
            // L3758. Port keeps them as separate functions but calls both
            // together everywhere L0FC0 fires.
            this.explosionUpdate();
            this.bonusExplosionUpdate();
        } else if (lane === 1 || (lane === 3 && depleted)) {
            this.alienBehaviorUpdate();
            this.alienVsPlayerCollision();
        }

        // Step 9 — enemy fire trigger + bullet update lane placement.
        // Full-formation (L2130): EnemyBulletUpdate fires on source lanes
        // 1+3 (2 of 4 frames → 30 Hz, 4 px/tick → 120 px/s bullet fall).
        // L2560 fires on source lane 2 (1 of 4 frames → 15 Hz scan).
        // Port-swap maps source lane 1 → port lane 0 and source lane 2
        // stays as port lane 2 (animation moved to lane 0). Source lane 3
        // stays as port lane 3 (was empty after the swap).
        //
        // Step 10: source full lane 3 also has L0FC0 (alongside
        // EnemyBulletUpdate). Port port-lane 3 in full-formation hosts
        // both calls; together with the explosionUpdate in the lane-0
        // movement handler above, this gives the source-faithful 30 Hz
        // L0FC0 rate (2 of 4 frames).
        //
        // Depleted (L2146): source's L2190 (bit-0=0 / counters 0+2) bundles
        // L2560 + EnemyBulletUpdate together with behavior. Port-swap maps
        // bit-0=0 → port bit-0=1, so port lanes 1+3 host the bundle.
        // (L0FC0 in depleted lives on the OTHER bit-0 side via L21A5 —
        // already handled in the lane-0/lane-2 mvmt handler above.)
        //
        // Counter93 alignment: enemyFireScanAndSpawn reads (counter93 & 1)
        // to choose the firing column. alienBehaviorUpdate increments
        // counter93 in lane 1 (and lane 3 when depleted) BEFORE this block,
        // so enemyFireScanAndSpawn always sees the just-incremented value
        // — same alignment as source where L2560 reads counter93 after
        // lane-0 behavior runs.
        if (!depleted) {
            if (lane === 0 || lane === 3) this.enemyBulletUpdate();
            if (lane === 2) this.enemyFireScanAndSpawn();
            if (lane === 3) {
                // L24C4 — second bg-scroll site per round-robin (source
                // L2180 = full-formation lane 3). Pairs with the lane-0
                // call above to give 30 Hz BG updates (= 2 of 4 frames),
                // matching source's per-frame visual scroll cadence.
                this.bgUpdateIfAlienStage();
                this.explosionUpdate();
                this.bonusExplosionUpdate();
            }
        } else if (lane === 1 || lane === 3) {
            // L2190 bundle (port lanes 1+3): both calls fire together.
            this.enemyFireScanAndSpawn();
            this.enemyBulletUpdate();
        }
    },

    // $2230 + $2260 + $2292 — spiral-fill stage handler for JT4
    // stages 4, 6 (and 8 in step 12). Animates a center-out asterisk
    // spiral wipe over ~52 frames, then advances LevelAndRound to the
    // next stage and triggers state-2 init via GameState := 2.
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
        // $2292 — clear spiral, BG-wipe, advance stage, trigger state-2 init.
        // Source dispatch on LR bit 3:
        //   bit 3 == 0 (stages 4, 6): JP $22F0 → ClearBackground →
        //                              CounterB9 = $00
        //   bit 3 == 1 (stage 8):    fall through to T1C00 star-copy +
        //                            CounterB9 retained at $71
        // Port only handles stages 4/6 (stage 8 is gated by stop-gap
        // until step 12), so the ClearBackground branch always fires:
        // bgTiles wiped to all zeros = BG snaps to black for the
        // upcoming bird stage. Without this, leftover stars/planets/
        // galaxies from the previous alien stage persist into the bird
        // stage (which doesn't run bgUpdate to refresh them).
        state.fgOverlay.clear();
        state.bgTiles.fill(0);                // ← $03A0 ClearBackground
        state.spiralFillCounter = 0;
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
        state.gameState = 2;
        // $22E0 CounterB9 := $00.
        state.counterB9 = 0;
        // Smooth-scroll counter is a port-side companion to counterB9
        // (per render.drawBackground); reset it too so BG-rendering
        // restarts cleanly with no half-pixel offset carried over from
        // the previous stage.
        state.scrollPixel = 0;
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

        // Same stop-gap as stageClearUpdate — keep mothership stages
        // (8+) wrapping to next round's stage 0 until step 12.
        if ((state.levelAndRound & 0x0F) >= 8) {
            state.levelAndRound = (state.levelAndRound + 0x10) & 0xF0;
        }

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
        const scrollDir = (state.counter9a & 0x40) ? +1 : -1;
        state.counterB9 = (state.counterB9 + scrollDir) & 0xFF;
        // TODO 11.x: CALL $3980 (bird-vs-player relative position scan —
        //            cosmetic; affects bird color/depth shading).

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

    // L0DF0 — bullet-vs-alien scan. Called every frame (not lane-gated).
    // research_rendering.md §6.1.
    playerBulletCollision() {
        const b = state.player.bullet;
        if (!b.active) return;
        // Bullet bounding box: 8×8 tile at (b.x, b.y).
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ax = a.x & ~7;
            const ay = a.y & ~7;
            const { w, h } = alienBox(a.controlA);
            if (aabbHit(ax, ay, w, h, b.x, b.y, 8, 8)) {
                this.onAlienHit(a, i);
                b.active = false;
                break;   // one bullet hits one alien (source L0E18 breaks after first hit)
            }
        }
    },

    // L0CF4 — alien-body-vs-player collision. Runs in lane-1 of the
    // port (paired with behaviorUpdate; lane-0 in the source, but
    // lane-swapped here — see stageAlienCombat).
    //
    // ⚠ DISABLED: when this fires, `onPlayerHit` routes to gameState=4
    // (player-explosion), but our state-4 handler is just a stub that
    // re-spawns after 128 frames — there's no lives counter, no
    // explosion sprite, no proper game-over. Visually the player just
    // briefly vanishes and reappears, which is confusing while
    // observing swoop trajectories. Re-enable when step 9 lands the
    // lives / explosion-anim / game-over pieces.
    alienVsPlayerCollision() {
        return;
        // eslint-disable-next-line no-unreachable
        if (!state.player.alive) return;
        const px = state.player.x & ~7;
        const py = state.player.y;
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ax = a.x & ~7;
            const ay = a.y & ~7;
            const { w, h } = alienBox(a.controlA);
            if (aabbHit(ax, ay, w, h, px, py, 16, 16)) {
                this.onPlayerHit();
                return;   // one hit per lane-0 tick is enough
            }
        }
    },

    // Called when a player bullet hits an alien (bullet-vs-alien path).
    // Source path: L0DF0 → L0E10 → (L0E70 → L0EA0) for formation hits, or
    // (L0E58 → L0C00) for swoop hits → L0EA4 → L0EAD → L38F8-like slot
    // allocator → L0EE0 decrement AliensLeft.
    //
    // Source scoring (Code.md $0EA0 + $0C00):
    //   - Formation alien (screen tile $60-$67): counter=$0C, scoreBcd=$02
    //                                            → 20 pts, alien slot
    //   - Swoop alien, path byte != 7/8:         counter=$0C, scoreBcd=$04
    //                                            → 40 pts, alien slot
    //   - Swoop alien, current path byte 7 or 8: counter=$10, scoreBcd=$20
    //     (alien climbing back up from a dive,   → 200 pts, BONUS slot
    //      see T1700 idx 7 = X+4 Y-2,             (sprite + popup digits
    //      idx 8 = X-4 Y-2)                       via T17D0+T17D6+L37B0)
    //
    // Path-byte 7/8 appear scattered throughout most swoop patterns
    // (T1110, T1140, T11E0, T12DA, T1310, T1338, T1374, T13BC, T13E0,
    // T2C20, T2C80, T2CB0, T2DA0, T2DE0, T2E80, T2EB0, T2EE0, T2F20).
    // So bonus kills are reachable in regular stage-1 swoops — not
    // angry-pattern-specific.
    //
    // Port detection:
    //   - Formation hit: alienMovePtr in $1000..$101F (T1000 drift)
    //   - Bonus hit:    alienMovePtr OUTSIDE that range AND current
    //                   path byte is 7 or 8
    //   - Regular swoop hit: everything else
    onAlienHit(alien, alienIdx) {
        alien.controlA &= ~0x08;   // Bit4Controller delete path clears this in source
        alien.alive = false;
        state.aliensLeft = Math.max(0, state.aliensLeft - 1);

        const ptr = state.alienMovePtr[alienIdx];
        const isFormation = ptr < 0x1020;
        // Read the alien's CURRENT path byte (the next motion vector it
        // would take). Source L0C00 dereferences (HL=alienMovePtr) to
        // get this byte.
        const pathByte = isFormation ? 0 : getPathByte(ptr);
        const isBonus  = !isFormation && (pathByte === 0x07 || pathByte === 0x08);

        let scoreBcd, points;
        if (isBonus) {
            scoreBcd = 0x20;   // displays "200"
            points   = 200;
        } else if (isFormation) {
            scoreBcd = 0x02;   // displays "020" (but alien slot has no popup)
            points   = 20;
        } else {
            scoreBcd = 0x04;   // displays "040" (but alien slot has no popup)
            points   = 40;
        }

        // Center the explosion sprite on the alien's bounding box so the
        // visual replaces the alien regardless of draw mode.
        // (Source uses LeftOneColumn + an HL,$FFDF offset to land in
        // roughly the same place via screen-RAM arithmetic — see L0FE3.)
        // Alien slot: 24w × 16h sprite → x offset 12. Bonus slot:
        // 48w × 16h sprite → x offset 24.
        const { w, h } = alienBox(alien.controlA);
        const ey = (alien.y + (h >> 1) -  8) & 0xFF;
        if (isBonus) {
            const ex = (alien.x + (w >> 1) - 24) & 0xFF;
            this.spawnBonusExplosion(0x10, scoreBcd, ex, ey);
        } else {
            const ex = (alien.x + (w >> 1) - 12) & 0xFF;
            this.spawnExplosion(0x0C, scoreBcd, ex, ey);
        }

        scoring.addPoints(points, state.gameAndDemoOrSplash);
    },

    // L38F8 — find the first free alien-explosion slot ($4370 or $4374)
    // and populate it with (counter, scoreBcd, screen position). Source
    // returns silently if both slots are active (slot starvation).
    //
    // Source also writes AbovePlayerBulletMSB/LSB ($43E6/$43E7) into the
    // slot's screen-RAM fields and clears the player bullet's bit 3 — but
    // those are L38F8's "bird wing" path-specific concerns. Alien hits
    // come through L0EAD which writes the ALIEN'S screen position to the
    // slot. The port skips the bullet-deactivate since playerBulletCollision
    // already does `b.active = false` after a hit.
    //
    // Bonus-slot variant (200-pt kills) lives in spawnBonusExplosion below.
    spawnExplosion(counter, scoreBcd, x, y) {
        for (const e of state.explosions) {
            if (e.counter !== 0) continue;
            e.counter  = counter;
            e.scoreBcd = scoreBcd;
            e.x        = x & 0xFF;
            e.y        = y & 0xFF;
            // Seed frameLsb from the spawn counter so render is correct
            // even on the first frame, before explosionUpdate has run.
            // Source draws on the spawn-tick using the just-written counter
            // value; this matches that behavior independent of lane ordering.
            e.frameLsb = ALIEN_EXPLOSION_ROM[(counter & 0x0E) >> 1];
            return true;
        }
        return false;
    },

    // Bonus-slot variant of L38F8 — allocate one of the 2 bonus slots
    // ($4378 / $437C). Used for 200-pt kills (alien current path byte 7
    // or 8 at hit time, see L0C00). Source's actual allocator at L0EC3
    // walks both bonus slots looking for counter==0; if both are active,
    // it falls through to L0ED5 and clobbers slot 1 anyway. Port returns
    // false on starvation to be safe (and to match spawnExplosion's
    // contract). Slot starvation is rare in practice — bonus kills only
    // fire on path bytes 7 or 8, which are brief moments in a swoop.
    //
    // Source counter for bonus kills is $10 (16 ticks ≈ 0.27 s at 60 Hz
    // gross, but each tick advances at the L0FC0 cadence so wall-time is
    // longer); scoreBcd is $20 (= "200" displayed via L37B0's "first two
    // digits + always-0").
    spawnBonusExplosion(counter, scoreBcd, x, y) {
        for (const e of state.bonusExplosions) {
            if (e.counter !== 0) continue;
            e.counter  = counter;
            e.scoreBcd = scoreBcd;
            e.x        = x & 0xFF;
            e.y        = y & 0xFF;
            return true;
        }
        return false;
    },

    // Called when the player ship is hit (alien body or enemy bullet).
    // Minimal stub: hide ship, arm explosion timer, route to state 4.
    onPlayerHit() {
        state.player.alive = false;
        state.playerExplosionTimer = 128;   // ~2 s at 60 Hz
        state.gameState = 4;
    },

    // L21BA — stage-clear pause handler. Called from stageAlienCombat
    // when AliensLeft hits 0. Source structure (Code.md $21BA):
    //   bit-0 = 0 (counters 0, 2): JP L2204         — countdown only
    //   bit-0 = 1 (counters 1, 3):
    //       CALL EnemyBulletUpdate $0C40            — residual bullets fall
    //       CALL L0FC0                              — explosions animate
    //       CALL L24C4                              — bg scroll / mothership
    //       IF (LR & 0x0F) >= $0B: reset AliensLeft and reinit aliens
    //                              (very-late-game wraparound; unreachable
    //                              here because step-8d wraps LR before $0B)
    //       ELSE:                  JP L2204         — fall through to countdown
    //
    // Port equivalent: receive `lane` from stageAlienCombat (the same
    // $435F counter source uses), run physics on bit-0=1 frames, then
    // run the countdown decrement + LR-advance on every frame.
    //
    // No lane-swap rationale applies here — the swoop-alignment reason
    // (research_enemy_motion.md §1.0) is about combat lanes, not stage
    // clear. Port keeps source's bit-0 mapping unchanged.
    //
    // research_enemy_motion.md §8.
    stageClearUpdate(lane) {
        // L21BA bit-0 = 1 branch: residual physics during the pause.
        // Bullets in flight continue to fall; explosions from the final
        // alien kill keep animating until their counters reach 0.
        if ((lane & 1) === 1) {
            this.enemyBulletUpdate();
            this.explosionUpdate();
            this.bonusExplosionUpdate();
            // L24C4 — bg scroll during the post-clear pause too. Stars
            // keep moving while the explosions wind down + countdown
            // drains. Mothership glue (L24E0 branch) still step 11.
            this.bgUpdateIfAlienStage();
        }

        // L2204 — countdown. Source's L21CF path jumps here when
        // (LR & 0x0F) < $0B; the step-8d LR wrap keeps us under that.
        const cnt = (state.stageBlock[11] - 1) & 0xFF;
        state.stageBlock[11] = cnt;
        if (cnt >= 0xA0) return;

        state.gameState = 2;
        state.player.shieldCount = 0;
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;

        // ⚠ STOP-GAP (narrowed 2026-05-18): stages 8-A (spiral-fill before
        // mothership, mothership fade-ins) and B (mothership combat) are
        // step 12 territory. Stages 4-7 (bird spiral + bird combat) now
        // play through naturally. Without this wrap, LR advancing to 8
        // would leave state3_Gameplay with no handler → screen "freezes".
        // Remove this block entirely when step 12 lands.
        if ((state.levelAndRound & 0x0F) >= 8) {
            state.levelAndRound = (state.levelAndRound + 0x10) & 0xF0;
        }

        // T1760[(LevelAndRound >> 1) & 7]: positive → alien count; bit 7 set → bird count.
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

    // L0D1C / L0D30 — AlienMovementUpdate. Walks 16 alien slots; for
    // each: read current path byte from `getPathByte(ptr)`, look up
    // MOTION_DIRECTIONS[idx*2..+1] for (dx, dy), apply to (x, y). When
    // the post-update coordinate's low 3 bits go zero (8-pixel grid
    // line crossed), advance the path pointer one byte. End-of-list
    // reset is handled by alienAnimationUpdate (matches source —
    // L0DDE only fires from $0D86, never from $0D30).
    //
    // Three branches based on whether dx, dy, or both are zero — the
    // grid-cross test runs against the *coordinate that was actually
    // updated last*. Mirrors source:
    //   default (both nonzero):    update X then Y, test Y  ($0D55)
    //   dx == 0   ($0D43 → $0D4F): update Y only,  test Y  ($0D55)
    //   dy == 0   ($0D48 → $0D5E): update X only,  test X  ($0D62)
    //
    // Runs in lane-0 of stageAlienCombat (port-side lane swap — source
    // runs this in lane-1). Critical that movement runs BEFORE
    // behaviorUpdate (lane-1) within each 4-frame cycle so commits
    // happen the frame after a grid crossing — see stageAlienCombat
    // comment and research_enemy_motion.md §3.5 for why.
    // ⚠ Timing-sensitive: research_enemy_motion.md §1.0.1.
    alienMovementUpdate() {
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ptr = state.alienMovePtr[i];
            const idx = getPathByte(ptr);
            const rawDx = MOTION_DIRECTIONS[idx * 2];
            const rawDy = MOTION_DIRECTIONS[idx * 2 + 1];
            const dx = s8(rawDx);
            const dy = s8(rawDy);
            let crossed;
            if (rawDy === 0) {
                a.x = (a.x + dx) & 0xFF;
                crossed = (a.x & 7) === 0;
            } else if (rawDx === 0) {
                a.y = (a.y + dy) & 0xFF;
                crossed = (a.y & 7) === 0;
            } else {
                a.x = (a.x + dx) & 0xFF;
                a.y = (a.y + dy) & 0xFF;
                crossed = (a.y & 7) === 0;
            }
            if (crossed) state.alienMovePtr[i] = (ptr + 1) & 0xFFFF;
        }
    },

    // L0D70 / L0D86 — AlienAnimationUpdate. Walks 16 alien slots; for
    // each: read current path byte; if 0 (end-marker), reset pointer to
    // (alienPathSeedHi, alienPathSeedLo) per L0DDE and re-read. Then
    // look up ANIMATION_TABLE[pathByte*3 .. +2] = (drawMode, calcStyle,
    // t1600Base). Compute SHAPE_LSB_TABLE offset based on calcStyle
    // (XY/X/Y bits of alien position), write the looked-up byte to
    // controlB, and OR drawMode into controlA's low 3 bits — note that
    // the draw mode itself can change per path step (e.g. 2×1 horizontal
    // drift switches to 2×2 during diagonal swoops).
    //
    // Runs in lane-0 of stageAlienCombat after alienMovementUpdate
    // (port-side lane swap — see stageAlienCombat comment). Source
    // runs animation in lane-2.
    // ⚠ Timing-sensitive: research_enemy_motion.md §1.0.1.
    alienAnimationUpdate() {
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            let ptr = state.alienMovePtr[i];
            let pathByte = getPathByte(ptr);
            if (pathByte === 0) {
                // L0DDE — reset to per-stage path seed (always T1000 / formation drift).
                ptr = ((state.alienPathSeedHi << 8) | state.alienPathSeedLo) & 0xFFFF;
                state.alienMovePtr[i] = ptr;
                pathByte = getPathByte(ptr);
            }
            const drawMode  = ANIMATION_TABLE[pathByte * 3];
            const calcStyle = ANIMATION_TABLE[pathByte * 3 + 1];
            const t1600Base = ANIMATION_TABLE[pathByte * 3 + 2];
            // Calc-style decode mirrors $0DA7-$0DAE: RRCA twice; first
            // carry (bit 0) → XY mode, second carry (bit 1) → X mode,
            // else (bit 2) → Y mode. Order matters when multiple bits
            // are set (e.g. $03 picks XY because bit 0 is checked first).
            // The sub-position bits select one of N pre-shifted tile
            // variants. Drawing strategy in the port (per drawMode):
            //   1 (2×1) / 3 (1×2): snap-draw at (x & ~7, y & ~7) — the
            //     variant tile content carries the sub-pixel offset.
            //   4 (2×2):           draw at exact (x, y), with a port-
            //     specific full-sprite substitution when the variant
            //     has partial (zero) tiles — see render.js drawAlien
            //     case 4 and research_rendering.md §2.5.
            let off;
            if      (calcStyle & 0x01) off = (a.x & 0x04) + ((a.y >> 1) & 0x03) + t1600Base;
            else if (calcStyle & 0x02) off = ((a.x >> 1) & 0x03) + t1600Base;
            else                       off = ((a.y >> 1) & 0x03) + t1600Base;
            a.controlA = (a.controlA & 0xF8) | (drawMode & 0x07);
            a.controlB = SHAPE_LSB_TABLE[off & 0xFF];
        }
    },

    // $30AA — pseudo-random 4-bit value. Uses Counter9A high byte ($439A)
    // rotated left 3 bits, low 3 bits added to PlayerX, masked to 0x0F.
    getRandomNumber() {
        const lo  = state.counter9a & 0xFF;          // $439B — LSB, changes every frame
        const rot = ((lo << 3) | (lo >> 5)) & 0xFF;
        return ((rot & 7) + state.player.x) & 0x0F;
    },

    // L3074 — level-based timing factor C (≈24–31 for stage 1, round 0).
    // Used by L305C to seed the angry-pattern phase timer M4358.
    computeLevelFactor() {
        const lr = state.levelAndRound & 0xFF;
        // Step 1: RRCA on LR → low 3 bits → 7 minus that
        const r1 = ((lr >> 1) | ((lr & 1) << 7)) & 0xFF;
        let   c  = 7 - (r1 & 7);
        // Step 2: high nibble of LR (capped at $70) → 7 minus that, add to C
        const a2 = lr < 0x80 ? lr : 0x70;
        c       += 7 - ((a2 >> 4) & 7);
        // Step 3: AliensLeft contribution
        const al = state.aliensLeft;
        c       += al >= 5 ? (al - 5) : 0x10;
        // Step 4: random jitter 0–7
        c       += this.getRandomNumber() & 7;
        return c & 0xFF;
    },

    // L3000 — AlienBehaviorUpdate. Increments Counter93, dispatches on
    // (Counter93 & 7) via the T3018 jump table to one of 8 sub-states.
    // Runs in lane-1 of stageAlienCombat (port-side lane swap — source
    // runs this in lane-0). The swap puts movement BEFORE behavior
    // each 4-frame cycle, so any commit fires the frame AFTER an alien
    // crossed a grid boundary — that alignment is what lets dx=±4 swoop
    // bytes advance their ptr (research_enemy_motion.md §3.5 / §6).
    // research_enemy_motion.md §6 covers the per-sub-state logic.
    //
    // ⚠ Counter93 dispatch phase is post-increment in the port and is NOT
    // source-faithful (source is pre-increment: LD A,(HL); INC (HL); AND
    // $07). The deviation is intentional — it is part of the interlocked
    // timing tuning explained in research_enemy_motion.md §1.0.1. Do not
    // "fix" this to match source without re-validating the lane swap; a
    // change here reproduces an "aliens never return to formation" bug.
    alienBehaviorUpdate() {
        state.counter93 = (state.counter93 + 1) & 0xFF;
        switch (state.counter93 & 7) {
            case 0: this.behaviorCommit();       break;  // L3264
            case 1: this.behaviorAngryPattern(); break;  // L3028
            case 2: this.behaviorCooldown();     break;  // L30BA stub
            case 3: this.behaviorSwoopCount();   break;  // L3124
            case 4: this.behaviorPickAlien();    break;  // L315A
            case 5: this.behaviorPickPattern();  break;  // L31B4
            case 6: this.behaviorScanAdvance(); break;  // L322C
            case 7: break;                               // L3012 RET
        }
    },

    // L3028 — angry-pattern two-level timer (sub-state 1).
    // Up to 3 angry attacks per round; each sends all 16 aliens on T2E00/T2E40.
    // Timer seed: M4357*4 + computeLevelFactor() + 7 (L305C).
    behaviorAngryPattern() {
        if (state.alienPhaseCount >= 3 || state.alienBehaviorState >= 4) return;
        if (state.alienPhaseTimer === 0) {
            const c = this.computeLevelFactor();
            state.alienPhaseTimer = ((state.alienPhaseCount << 2) + c + 7) & 0xFF;
            return;
        }
        state.alienPhaseTimer--;
        if (state.alienPhaseTimer !== 0) return;
        state.alienPhaseCount++;
        state.alienBehaviorState  = 4;
        state.alienSwoopCount     = 16;
        state.alienSwoopTarget    = 0x50;
        state.alienSwoopPatternHi = 0x2E;
        state.alienSwoopPatternLo = (state.player.x & 1) ? 0x00 : 0x40;
    },

    // L30BA — cooldown timers (sub-state 2). Source-faithful port.
    //
    // Pipeline:
    //   1. Tick down 3 secondary timers ($4359/$435A/$435B) unconditionally
    //      via L30DA — these gate the C-rotation in L30E4's reseed.
    //   2. If alienBehaviorState != 0, return (pipeline busy).
    //   3. If primary cooldown ($4355) == 0, call L30E4 to reseed it.
    //   4. Otherwise decrement primary cooldown; if it hits 0, set
    //      alienBehaviorState = 1 to kick off the swoop pipeline.
    //
    // The reseed (L30E4) computes:
    //   C = computeLevelFactor() + (0x0F - clamp(Counter9A high byte, 0x0F))
    //   For each of {$4359, $435A, $435B}: if the slot is 0, rotate C right
    //     by 1; for the FIRST 0-slot encountered (B starts at 1), also write
    //     0x0C into it.
    //   alienCooldown = ((C >> 2) & 0x3F) + 1
    //
    // Net behavior at stage 1: primary cooldown values in roughly 1-12
    // range, giving 1-12 case-2 firings (= 32-384 frames = ~0.5-6.4s)
    // between successive swoop pipeline kicks. Matches arcade pacing
    // (1-4 s typical) and varies with Counter9A and level.
    behaviorCooldown() {
        // L30DA × 3 — tick secondary timers unconditionally (decrement if non-zero).
        if (state.alienCooldownTimer1 !== 0) state.alienCooldownTimer1--;
        if (state.alienCooldownTimer2 !== 0) state.alienCooldownTimer2--;
        if (state.alienCooldownTimer3 !== 0) state.alienCooldownTimer3--;

        if (state.alienBehaviorState !== 0) return;          // pipeline busy

        if (state.alienCooldown === 0) {
            this.cooldownReseed();                            // L30E4
            return;
        }
        state.alienCooldown = (state.alienCooldown - 1) & 0xFF;
        if (state.alienCooldown === 0) {
            state.alienBehaviorState = 1;                     // kick off swoop pipeline
        }
    },

    // L30E4 — reseed primary cooldown $4355 from Counter9A high byte +
    // level factor, modulated by the state of the 3 secondary timers.
    // See behaviorCooldown comment for derivation; L3112 inlined here.
    cooldownReseed() {
        // L3074 — level-derived factor (≈24-31 on stage 1, round 0).
        let c = this.computeLevelFactor();
        // Counter9A high byte ($439A), clamped to max 0x0F.
        const c9aHi = (state.counter9a >> 8) & 0xFF;
        const clamped = c9aHi >= 0x10 ? 0x0F : c9aHi;
        c = (c + (0x0F - clamped)) & 0xFF;

        // L3112 × 3 inlined. B starts at 1; the FIRST 0-valued secondary
        // timer gets written to 0x0C, and B decrements (so only one slot
        // is written per reseed). C rotates right for every slot that's
        // 0 (regardless of whether it was the writable one).
        let b = 1;
        const slots = ['alienCooldownTimer1', 'alienCooldownTimer2', 'alienCooldownTimer3'];
        for (const slot of slots) {
            if (state[slot] !== 0) continue;        // RET NZ — skip when non-zero
            c = (c >> 1) & 0x7F;                    // RRCA + AND $7F
            if (b === 0) continue;                  // L3112 RET Z — skip the write
            b--;
            state[slot] = 0x0C;
        }

        // Final: $4355 = ((C >> 2) & 0x3F) + 1, range 1-64.
        state.alienCooldown = ((c >> 2) & 0x3F) + 1;
    },

    // L3124 — compute swoop count into $4353 (gates on $4350 == 1).
    // Source-faithful port. research_enemy_motion.md §6.5.
    //
    // Formula:
    //   raw = ((LevelAndRound RRCA RRCA) & 0x0F) + 5
    //   if raw >= 0x11: raw = 5            ; source RESETS to 5 (not min/cap)
    //   cap = raw - alienPhaseCount         ; angry waves shrink the cap
    //   roll = getRandomNumber + 1          ; uniform 1..16
    //   swoopCount = (roll < cap) ? roll : 1
    //
    // Stage 1 (LR=1): RRCA×2 → 0x40 & 0xF = 0 → raw = 5 → cap = 5 pre-angry,
    //   shrinking to 2 after 3 angry waves. P(swoop=1)=13/16, P(2..4)=1/16
    //   each; average ~1.4 aliens per swoop. After 3 angry waves cap=2 forces
    //   swoopCount=1 always.
    behaviorSwoopCount() {
        if (state.alienBehaviorState !== 1) return;
        state.alienBehaviorState = 2;

        const lr = state.levelAndRound & 0xFF;
        // RRCA × 2 — rotate right twice; bits 1,0 wrap to bits 7,6.
        const r1 = ((lr >> 1) | ((lr & 1) << 7)) & 0xFF;
        const r2 = ((r1 >> 1) | ((r1 & 1) << 7)) & 0xFF;
        let raw = (r2 & 0x0F) + 5;
        if (raw >= 0x11) raw = 5;
        const cap = (raw - state.alienPhaseCount) & 0xFF;

        const roll = (this.getRandomNumber() + 1) & 0xFF;   // 1..16
        state.alienSwoopCount = (roll < cap) ? roll : 1;
    },

    // L315A — pick which alien to swoop (gates on $4350 == 2).
    //
    // Source L315A walks all 16 alien slots starting from a random
    // index and picks the FIRST alien that satisfies:
    //   (controlA & 0x08) != 0       ; alive
    //   ptr.MSB == alienPathSeedHi   ; in the drift page (0x10xx)
    //   ptr.LSB == $4356             ; ptr matches saved match key
    // If no alien matches, state stays at 2 and the pipeline stalls
    // until next cycle.
    //
    // After the lane-order swap in stageAlienCombat (movement runs on
    // lane-0, BEFORE behavior on lane-1), the timing relationship
    // between alien crossings and commit firings matches what source
    // expects: aliens land at LSB == alienSwoopLsb after end-of-list
    // reset, AND alien.x%8 == 0 at commit time (because movement just
    // crossed). So both the ptr-match check and the dx=±4 alignment
    // gating happen naturally here, exactly as source intends.
    behaviorPickAlien() {
        if (state.alienBehaviorState !== 2) return;

        const matchHi = state.alienPathSeedHi;        // $4394 (= 0x10)
        const matchLo = state.alienSwoopLsb;          // $4356 (source-faithful after lane swap)
        const startIdx = this.getRandomNumber() & 0x0F;

        for (let n = 0; n < 16; n++) {
            const i = (startIdx + n) & 0x0F;
            const a = state.aliens[i];
            if (!(a.controlA & 0x08)) continue;       // skip dead
            const ptr = state.alienMovePtr[i];
            if (((ptr >> 8) & 0xFF) !== matchHi) continue;
            if ((ptr & 0xFF) !== matchLo) continue;
            // Match — pick this alien. Store target in source format.
            state.alienSwoopTarget   = 0x50 + i * 2;
            state.alienBehaviorState = 3;
            return;
        }
        // No matching alien — pipeline stalls; case-4 retries next 32-frame cycle.
    },

    // L31B4 — pick swoop pattern for the chosen alien (gates on $4350 == 3).
    // research_enemy_motion.md §6.4.
    //
    // Source-faithful port of the three-stage T3300/T3310/T3330 lookup:
    //   1. Compute |alienX - playerX| and L/R relationship (alien left or
    //      right of player). Bucket the X distance into 8 bins of 32 px.
    //   2. Stage 1: colMul4 = (T3300[bucket] + lrOffset) * 4
    //      where lrOffset = 4 if alien is LEFT of player, else 0.
    //   3. Stage 2: rowIdx = colMul4 + phaseOrYBand
    //      phaseOrYBand = Y-band (0/1/2/3 at $58/$78/$98) when swoopCount==1
    //                     alienPhaseCount (& 3) otherwise (angry waves)
    //      T3330 LSB = T3310[rowIdx]
    //   4. Stage 3: rand6 = random & 0x06 (= 0, 2, 4, or 6) selects 1 of 4
    //      pattern candidates within the row.
    //      Final pattern (MSB, LSB) = T3330[T3310_value + rand6 - 0x30] / +1
    //   Tables in port: PATTERN_COL_TABLE (T3300, 8 bytes),
    //   PATTERN_ROW_TABLE (T3310, 32 bytes — lower 16 for alien-right,
    //   upper 16 for alien-left), PATTERN_ADDR_TABLE (T3330+, 208 bytes
    //   covering byte offsets 0x30-0xFF).
    behaviorPickPattern() {
        if (state.alienBehaviorState !== 3) return;

        // Resolve alien index. Port stores raw 0-15 in alienSwoopTarget;
        // source stores $50 + i*2. Accept both formats.
        const i = state.alienSwoopTarget >= 0x50
            ? (state.alienSwoopTarget - 0x50) >> 1
            : state.alienSwoopTarget;
        const a = state.aliens[i];
        if (!a || !(a.controlA & 0x08)) {
            state.alienBehaviorState = 5;
            return;
        }

        // L/R relationship and absolute X distance.
        // Source L31C8-L31D4: if playerX >= alienX then C=4 (alien LEFT of
        // player or same X), else C=0 (alien RIGHT of player). The labels
        // can be counter-intuitive: "left of player" means alien.x < player.x.
        let lrOffset, diff;
        if (state.player.x >= a.x) {
            lrOffset = 4;                       // alien LEFT of player
            diff     = state.player.x - a.x;
        } else {
            lrOffset = 0;                       // alien RIGHT of player
            diff     = a.x - state.player.x;
        }

        // X distance bucket. Source L31D7-L31DA: RLCA×3, AND $07 — i.e.
        // bring the high 3 bits of |diff| to the low 3. Equivalent to
        // (diff >> 5) & 7 for diff < 256. 8 buckets of 32 px each.
        const bucket = (diff >> 5) & 7;

        // Stage 1: T3300[bucket] → column index, + lrOffset, × 4.
        // Max value: (3 + 4) << 2 = 28 (fits in T3310's 32-entry range).
        const colMul4 = (PATTERN_COL_TABLE[bucket] + lrOffset) << 2;

        // Stage 2 prep: phase or Y-band (source L3210).
        let phaseOrYBand;
        if (state.alienSwoopCount === 1) {
            // Y-band: thresholds match source CP $58/$78/$98 at L3210.
            const y = a.y;
            if      (y < 0x58) phaseOrYBand = 0;
            else if (y < 0x78) phaseOrYBand = 1;
            else if (y < 0x98) phaseOrYBand = 2;
            else               phaseOrYBand = 3;
        } else {
            // Multi-alien swoop (incl. angry wave): use alienPhaseCount.
            phaseOrYBand = state.alienPhaseCount & 0x03;
        }

        // Stage 2 lookup: T3310[colMul4 + phaseOrYBand] → T3330 byte offset.
        // Max idx: 28 + 3 = 31, within PATTERN_ROW_TABLE's 32 entries.
        const t3310Idx   = (colMul4 + phaseOrYBand) & 0xFF;
        const t3330Lsb   = PATTERN_ROW_TABLE[t3310Idx];

        // Stage 3: random pick (0, 2, 4, or 6) within the 4-candidate row.
        const rand6      = Math.floor(Math.random() * 256) & 0x06;

        // Final byte offset into T3330+. Source addressing uses the LSB
        // directly with H=$33; in JS we subtract 0x30 since
        // PATTERN_ADDR_TABLE starts at $3330. Max offset:
        // (0xF8 + 6) - 0x30 = 0xCE; PATTERN_ADDR_TABLE is 208 bytes (0-207).
        const t3330Off   = (t3330Lsb + rand6) - 0x30;
        const msb        = PATTERN_ADDR_TABLE[t3330Off];
        const lsb        = PATTERN_ADDR_TABLE[t3330Off + 1];

        state.alienSwoopPatternHi = msb;
        state.alienSwoopPatternLo = lsb;
        state.alienBehaviorState  = 5;
    },

    // L322C — scan-and-advance gate for angry pattern (sub-state 6).
    // Guards on M4350==4; checks every active alien's move pointer against
    // (M4394=0x10, M4356=alienSwoopLsb). Any mismatch → return early.
    // All match → M4350=6, letting behaviorCommit fire on the next case-0 tick.
    // L322C — scan-and-advance gate for angry pattern (sub-state 6).
    // Source-faithful: matches against alienSwoopLsb ($4356, saved by
    // most recent commit). After the lane-order swap in stageAlienCombat
    // (movement on lane-0, behavior on lane-1), alien ptrs naturally
    // land at LSB == alienSwoopLsb after end-of-list reset — the same
    // phase relationship the source assumes.
    behaviorScanAdvance() {
        if (state.alienBehaviorState !== 4) return;
        const matchHi = state.alienPathSeedHi;  // M4394 = 0x10
        const matchLo = state.alienSwoopLsb;    // M4356 — saved by last commit
        for (let i = 0; i < 16; i++) {
            if (!(state.aliens[i].controlA & 0x08)) continue;
            const ptr = state.alienMovePtr[i];
            if (((ptr >> 8) & 0xFF) !== matchHi || (ptr & 0xFF) !== matchLo) return;
        }
        state.alienBehaviorState = 6;
    },

    // L3264 — commit: advance $4395, then write swoop pattern pointer to matching aliens.
    // research_enemy_motion.md §6.2.
    behaviorCommit() {
        // Save old $4395 value as the match key ($4356), then cycle $4395 0-15.
        const oldLsb = state.alienPathSeedLo;
        state.alienSwoopLsb      = oldLsb;
        state.alienPathSeedLo    = (oldLsb + 1) & 0x0F;

        if (state.alienBehaviorState < 5) return;   // pipeline not yet ready

        // Source L3264: walks alienSwoopCount aliens starting at alienSwoopTarget,
        // checking each one's ptr against ($4394, $4356). Only matching aliens
        // get the new swoop pattern written. For normal swoops typically count=1
        // so a single alien is committed; for angry swoops count=16 so all are.
        //
        // Source stores $4354 as the move-ptr table LSB ($50 + i*2). Our
        // behaviorPickAlien stores the raw alien index (0-15); behaviorAngry
        // stores the sentinel $50 (= start at alien 0, since (0x50-0x50)/2 = 0).
        const matchHi  = state.alienPathSeedHi;
        const newPtr   = (state.alienSwoopPatternHi << 8) | state.alienSwoopPatternLo;
        const startIdx = state.alienSwoopTarget >= 0x50
            ? (state.alienSwoopTarget - 0x50) >> 1
            : state.alienSwoopTarget;
        const count = state.alienSwoopCount;
        for (let n = 0; n < count; n++) {
            const i = (startIdx + n) & 0x0F;
            const a = state.aliens[i];
            // NOTE: source L3264 does NOT skip dead aliens here — it only
            // checks ptr MSB/LSB. We add the bit-3 guard defensively (a
            // dead alien's ptr wouldn't normally match anyway, so this is
            // a harmless extra filter). Leaving as-is for safety; flag if
            // ever debugging an apparent "no swoop fired" with a dead
            // alien that should have been overwritten.
            if (!(a.controlA & 0x08)) continue;
            const ptr = state.alienMovePtr[i];
            if (((ptr >> 8) & 0xFF) === matchHi && (ptr & 0xFF) === oldLsb) {
                state.alienMovePtr[i] = newPtr;
                // NOTE: previously this also snapped alien.x to the
                // nearest multiple of 8 to align dx=±4 swoop bytes
                // (workaround for a phase-mismatch between commit and
                // alien crossings). That workaround caused a ±3 px
                // visual jolt and drift desync. The lane-order swap in
                // stageAlienCombat (movement on lane-0, behavior on
                // lane-1) now puts movement one frame BEFORE the
                // commit firing, so the alien crosses to x%8=0 right
                // before commit reads it — alignment is natural and
                // no snap is needed.
            }
        }
        state.alienBehaviorState = 0;
    },

    // L0876 — PlayerUpdate. Called every combat frame (not lane-gated).
    // research_player_movement.md §3.
    playerUpdate() {
        // L0900 — left/right movement. Level-checked (held = continuous).
        // Boundaries from source: DEC when X >= $0D (min reachable = $0C);
        //                         INC when X <  $C0 (max reachable = $C0).
        // Note: research doc listed $0D–$BF as valid range but the assembly
        // allows one step past each: min=$0C, max=$C0. Verify if collision
        // detection cares about the extra pixel at each edge.
        if (input.leftPressed && state.player.x >= 0x0D) {
            state.player.x = (state.player.x - 1) & 0xFF;
        } else if (input.rightPressed && state.player.x < 0xC0) {
            state.player.x = (state.player.x + 1) & 0xFF;
        }

        // L0926 + T1600 — select pre-shifted tile variant. T1600 is a non-linear
        // lookup: X%8=0→frame5, X%8=4→frame1, etc. tileBase = 0x30+(T1600[v]>>1).
        // Draw at (X & ~7, Y) so the tile content provides the sub-pixel offset.
        // Same pattern as drawAlien: snap-draw + variant content = exact pixel pos.
        const T1600 = [0x10, 0x14, 0x18, 0x1C, 0x00, 0x04, 0x08, 0x0C];
        const shape = T1600[state.player.x & 7];
        const tileBase = 0x30 + (shape >> 1);
        const p = state.player;
        p.tiles[0] = tileBase;
        p.tiles[1] = tileBase + 1;
        p.tiles[2] = tileBase + 0x10;
        p.tiles[3] = tileBase + 0x11;

        // Shield — MovePlayer ($08C4) $08D4–$08E8.
        // Source activates on CheckInputBits 1→0 transition (= barrierEdge()).
        // On activation, source CLEARS bit3 of PlayerState, routing MovePlayer
        // to DrawShields ($0AA0) on subsequent frames — skipping L0900 above.
        // ⚠ STOP: DrawShields ($0AA0) is not traced. Whether the player can
        // move while shielded depends on its internals. In the real game the
        // player CAN move during shield, so $0AA0 likely re-runs its own
        // movement. Keeping L0900 active during shield as a placeholder;
        // check DrawShields before step 9.
        if (state.player.shieldCount > 0) {
            state.player.shieldCount--;
            // DrawShields visual deferred (step 9 / mothership research).
        } else if (input.barrierEdge()) {
            state.player.shieldCount = 0xFF;   // ~4.25 s at 60 Hz
        }

        // L0930 — bullet update (runs every frame regardless of shield state;
        // called from L08A0 after MovePlayer returns, so shield doesn't gate it).
        this.playerBulletUpdate();
    },

    // L0930 + L0964 — fire and move the primary player bullet.
    // research_player_movement.md §6.
    playerBulletUpdate() {
        const p = state.player;
        const b = p.bullet;
        if (b.active) {
            // L0964: move up 8 grid units per frame; deactivate when Y < $1F.
            b.y = (b.y - 8) & 0xFF;
            if (b.y < 0x1F) b.active = false;
        } else if (input.fireEdge()) {
            // L0930 spawn: bullet X = PlayerShipX + 4, Y = PlayerShipY - 8.
            b.x = (p.x + 4) & 0xFF;
            b.y = (p.y - 8) & 0xFF;
            b.active = true;
            // TODO: use 0x50 + (b.x & 7) (T1620[X%8]) for correct sub-pixel
            // variant at spawn. Visually negligible (bullet moves too fast).
        }
    },

    // L0C40 EnemyBulletUpdate — iterate the 5 bullet slots, advance each
    // active one. Source chain:
    //   L0C40 → L088B copy current→old   (skip — canvas port has no
    //                                      double-buffer screen RAM)
    //         → L0C56 → L0C84 per slot   (movement + animation, ported here)
    //         → L0C6B screen-ram address (skip — canvas addresses by (x,y))
    //         → L0CD8 EnemyBulletDataController (replaced by render.js
    //                                            drawEnemyBullets)
    //
    // Per-slot L0C84 (Code.md $0C84):
    //   - if state & 0x08 == 0: return (inactive slot)
    //   - shape ^= 0x04                  (animation: $58↔$5C, $59↔$5D, etc.)
    //   - y += 4                          (fall 4 px/tick — 30 Hz tick gives
    //                                      120 px/s in source's lane-1+3 cadence)
    //   - if y >= 0xF9: clear state bit 3 (L096E) — bullet left screen
    //   - else: L0CB4/L0CC4 player-hit check  (SKIPPED — see note below)
    //
    // ⚠ Player-hit path (L0CB4 → L0CC4 → gameState=4) intentionally skipped
    // per user direction (step 9.2). Bullets fall through the player ship
    // harmlessly. The full source-faithful collision (with state-4 player
    // explosion + lives + game-over) is deferred until those pieces exist.
    enemyBulletUpdate() {
        for (const b of state.enemyBullets) {
            if ((b.state & 0x08) === 0) continue;
            b.shape ^= 0x04;
            b.y = (b.y + 4) & 0xFF;
            if (b.y >= 0xF9) {
                b.state &= ~0x08;
            }
            // L0CB4/L0CC4 player-hit path skipped (see comment above).
        }
    },

    // L0FC0 — Handle animations for killed aliens. Iterate the 2 alien
    // explosion slots ($4370 / $4374) and animate each non-zero counter
    // through the T17B0 tile-LSB cycle. Each tick:
    //   if counter == 0: slot is free, skip.
    //   else: pick the tile-frame LSB using the PRE-decrement counter
    //         (matches source L0FDB→L0FE6 ordering: LD B,(HL); DEC (HL);
    //         use B for tile lookup), then decrement counter.
    // drawExplosions in render.js consumes frameLsb to look up the 6-tile
    // 3x2 sprite via ALIEN_EXPLOSION_ROM.
    //
    // Source L0FC0 also processes the 2 bonus slots ($4378/$437C) via
    // L3758 — that path lives in bonusExplosionUpdate below.
    explosionUpdate() {
        for (const e of state.explosions) {
            if (e.counter === 0) continue;
            // T17B0 lives in the first 8 bytes of ALIEN_EXPLOSION_ROM.
            const idx = (e.counter & 0x0E) >> 1;
            e.frameLsb = ALIEN_EXPLOSION_ROM[idx];
            e.counter = (e.counter - 1) & 0xFF;
        }
    },

    // L3758 — bonus-explosion slot animation. Used by 200-pt swoop kills
    // (alien current path byte 7 or 8 — see L0C00) and by bird wing /
    // mothership scoring (step 11 territory). Source L3758 splits per
    // tick:
    //   counter == 0           → skip (slot free)
    //   else, post-dec == 0    → erase area via L37CC
    //   else, bit-0 of post-dec:
    //       0 → JP L37B0 (draw popup score digits only this frame)
    //       1 → fall through to draw the 6×2 sprite (L3796 + Draw3x2)
    //
    // The source's per-frame alternation between digits and sprite relies
    // on screen-RAM persistence — both end up visible on the CRT because
    // each leaves the other in place. Canvas clears per frame, so port
    // collapses to "draw both every frame for active slots" in
    // drawBonusExplosions; this update routine just decrements the
    // counter. The L37CC erase is also a no-op for canvas — counter==0
    // already gates rendering.
    bonusExplosionUpdate() {
        for (const e of state.bonusExplosions) {
            if (e.counter === 0) continue;
            e.counter = (e.counter - 1) & 0xFF;
        }
    },

    // L2560 enemy-fire scan + L25B7/L25E0 spawn. Picks a formation column
    // (Counter93 bit 0 selects aliens 0-7 or 8-15), filters via L2596 for
    // an alien sitting "above" the player ship and in formation, then
    // L25B7 finds a free enemy-bullet slot (round-capped) and L25E0
    // spawns the bullet at the chosen alien's offset.
    //
    // Source (Code.md $2560-$25FD):
    //   L2560: HL=$4B70+(Counter93&1)*$20  ; column start (alien 0 or 8)
    //          E=8                          ; iterate 8 aliens
    //          D=$AD + alienPhaseCount*8    ; alien-Y upper bound
    //          C=$439F + 3                  ; player-right + 3
    //          B=$439E - $0A                ; player-left - 10
    //          for 8 aliens: L2596 filter → last match wins (B/C overwritten)
    //   L2596: alien filter
    //          controlA bit 3 set         (alive)
    //          controlB != $08 and < $88   (alive sprite, not explosion)
    //          B <= x < C                 (x inside player firing band)
    //          $80 <= y < D                (y inside formation range)
    //   L25B7: bullet-slot cap by round
    //          round 0 → cap 3, round 1 → cap 4, round 2+ → cap 5
    //          find first inactive slot (state & 0x08 == 0); if none, give up
    //   L25E0: spawn at (chosenAlien.x + 4, chosenAlien.y + 0x0C)
    //          state := 0x08
    //          shape := 0x58 + ((x >> 1) & 3) + (y & 4)   ; range $58-$5F
    enemyFireScanAndSpawn() {
        // L2560: column + bounds.
        const colStart = (state.counter93 & 1) ? 8 : 0;
        const yMax = (0xAD + state.alienPhaseCount * 8) & 0xFF;
        const { left: playerLeft, right: playerRight } = this.mappedPlayerX();
        const xMin = (playerLeft  - 0x0A) & 0xFF;
        const xMax = (playerRight + 0x03) & 0xFF;

        // Scan 8 aliens; last alien passing the filter wins (source's L25B5/B6
        // re-writes B/C each successful pass before falling into L25B7).
        let chosenX = -1, chosenY = -1;
        for (let i = 0; i < 8; i++) {
            const a = state.aliens[colStart + i];
            // L2596 filter chain (each line maps to one RET-NZ/C/NC branch).
            if ((a.controlA & 0x08) === 0) continue;   // not alive
            if (a.controlB === 0x08) continue;         // controlB = $08 marker
            if (a.controlB >= 0x88) continue;          // controlB >= $88
            if (a.x < xMin) continue;                  // x < player band
            if (a.x >= xMax) continue;                 // x >= player band
            if (a.y >= yMax) continue;                 // too low (below cap)
            if (a.y <  0x80) continue;                 // too high (above formation)
            chosenX = a.x;
            chosenY = a.y;
        }
        if (chosenX < 0) return;   // no firing candidate

        // L25B7: round-based slot cap.
        const round = (state.levelAndRound >> 4) & 0x0F;
        const slotCap = round < 1 ? 3 : round < 2 ? 4 : 5;

        // L25CD: first inactive slot within cap (else give up).
        let slot = -1;
        for (let i = 0; i < slotCap; i++) {
            if ((state.enemyBullets[i].state & 0x08) === 0) {
                slot = i;
                break;
            }
        }
        if (slot < 0) return;

        // L25E0: spawn.
        const bx = (chosenX + 0x04) & 0xFF;
        const by = (chosenY + 0x0C) & 0xFF;
        const b  = state.enemyBullets[slot];
        b.state = 0x08;
        b.shape = 0x58 + (((bx >> 1) & 0x03) + (by & 0x04));   // 0x58-0x5F
        b.x = bx;
        b.y = by;
    },

    // L097A — port equivalent for $439E/$439F (mapped player left/right
    // tile columns). Source maintains these as RAM state each frame; this
    // port computes them on the fly since enemyFireScanAndSpawn is the only
    // caller (would also be needed for re-enabled L0CB4 player-hit path,
    // step 9-followup). Promote to state field if more callers appear.
    //
    // T0B38 (research_player_movement.md §7): symmetric delta table indexed
    // by X%8. left = X - leftDelta, right = X + rightDelta = X + leftDelta + 8.
    mappedPlayerX() {
        const T0B38_LEFT = [0, 1, 2, 3, 3, 2, 1, 0];
        const x = state.player.x & 0xFF;
        const lDelta = T0B38_LEFT[x & 7];
        return {
            left:  (x - lDelta) & 0xFF,
            right: (x + lDelta + 8) & 0xFF,
        };
    },

    // L0AEA — player explosion + respawn. Stub: wait ~128 ticks then respawn.
    // Real source: plays explosion animation, decrements lives, game-over if 0.
    state4_PlayerExplosion() {
        state.playerExplosionTimer--;
        if (state.playerExplosionTimer <= 0) {
            state.player.x     = PLAYER_INIT_BLOCK[2];
            state.player.y     = PLAYER_INIT_BLOCK[3];
            state.player.alive = true;
            state.gameState    = 3;
        }
    },
    state5_GameOver()            {},   // L0B60
    state6_MothershipExplosion() {},   // L2400
    state7_MothershipScore()     {},   // L244C

    // L002D — SplashAndDemo path; stub for skeleton (gameOrAttract forced to 1).
    attractFrame() {},
};
