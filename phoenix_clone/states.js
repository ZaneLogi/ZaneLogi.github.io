import { state } from './state.js';
import { scoring } from './scoring.js';
import {
    PLAYER_INIT_BLOCK,    // source T0560
    STAGE_BLOCK_INDEX,    // source T0598
    STAGE_BLOCKS,         // source $05A8/$05B4/$05C0/$05CC
    FORMATION_INDEX,      // source T063A
    ALIEN_CONTROL_INIT,   // source T1500
    ALIEN_MOVE_PTR_INIT,  // source T1520
    ALIEN_FORMATIONS,     // source T1540
    MOTION_PATH_BASE,     // source T1000
    MOTION_DIRECTIONS,    // source T1700
    ANIMATION_TABLE,      // source T16A0
    SHAPE_LSB_TABLE,      // source T1600
} from './data.js';

// L0400 — Code.md:GameStateMachine. JT1 jump table → JS switch
// (research_code_flow.md §5.1).

// Offset of $05A8 inside the packed STAGE_BLOCKS slice (data.js exports the
// four 12-byte blocks $05A8/$05B4/$05C0/$05CC as one 48-byte array).
// STAGE_BLOCK_INDEX (source T0598) stores LSBs in the $A8..$CC range;
// subtract $A8 to get the slice index.
const STAGE_BLOCK_BASE = 0xA8;

// MOTION_PATH_BASE is rooted at source T1000 = $1000. Per-alien path
// pointers (state.alienMovePtr[i]) carry full ROM addresses; subtract
// this to index the JS array. Reset target (alienPathSeedHi/Lo) is
// also a ROM address.
const PATH_BASE_ADDR = 0x1000;

// Decode a signed-byte motion delta. T1700 packs (dx, dy) as 8-bit
// two's-complement (e.g. $FF = -1, $FC = -4).
function s8(b) {
    return b & 0x80 ? b - 0x100 : b;
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
    //   $32B0                        → TODO (clears $4350-$437F + bird init)
    state2_StageInit() {
        state.gameState = 3;
        this.initGlobalLevelData();
        this.initPlayerDataStructure();
        this.initAlienData();
        // L0506 — clear $4392-$4397 and seed ($4394) from $4B50 MSB.
        // Step 6 only consumes alienPathSeedHi/Lo; the rest of the
        // $4392-$4397 zone (Counter93, behavior-state scratch) is owned
        // by AlienBehaviorUpdate $3000 and lands when swoops do.
        state.combatLane = 0;
        state.alienPathSeedHi = (state.alienMovePtr[0] >> 8) & 0xFF;
        state.alienPathSeedLo = 0;
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

    // L0547 InitPlayerDataStructure — source copies all 32 bytes of T0560
    // (= PLAYER_INIT_BLOCK) into $43C0 (player + bullets). Step 5 only
    // consumes the player x/y; bullet slots get wired in step 7. alive
    // stays false here — the ship doesn't appear until a combat-stage
    // handler runs PlayerUpdate (see state.player comment).
    initPlayerDataStructure() {
        state.player.x = PLAYER_INIT_BLOCK[2];   // PlayerShipX = $64 = 100
        state.player.y = PLAYER_INIT_BLOCK[3];   // PlayerShipY = $D8 = 216
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
            // 0x4 / 0x6 / 0x8 spiral-fill ($2230) → step 9
            // 0x5 / 0x7 bird combat ($3400)      → step 9
            // 0x9 / 0xA mothership fade-ins      → step 9
        }
    },

    // L0834 — Game level 0 and 2: stars scrolling down and 'aliens fade in'.
    // CounterB4 = stageBlock[9] (= $43B4); decrements every frame. Once it
    // drops below $15, GetAnimationChrs walks E through 5 tile values; all
    // aliens get rewritten with (controlA=$08, controlB=E) each frame so
    // they appear to morph in lockstep. L0848 tail bumps the stage and
    // returns to GameState 2 once the counter hits 0.
    stageAlienFadeIn() {
        // $06F0 — TODO: update scroll register and fill background
        // (background star scrolling, step 3). Stubbed for now; the screen
        // stays black for the first ~$EA frames of stage 0.

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

    // L2000 — combat handler for stages 1/3/B. Step 6 implements the two
    // motion lanes; firing, swoops, and collision land in steps 7-8.
    //
    // Source per-frame work: PlayerUpdate ($0876), bullet-vs-alien coll.
    // ($0DF0), L24A0, then a 4-lane round-robin keyed by ($435F & 3):
    //   lane 0: AlienDataController + AlienBehaviorUpdate + alien-vs-player
    //   lane 1: enemy-bullets + AlienMovementUpdate + L0FC0
    //   lane 2: AlienAnimationUpdate + L2560
    //   lane 3: enemy-bullets + L0A6C + L0FC0
    // research_enemy_motion.md §1. We run only lanes 1 and 2 for now.
    //
    // The alive=true loop mirrors AlienDataController ($0A50): in the
    // source, that routine is what actually paints aliens to screen RAM
    // (gated by Bit3Controller checking controlA bit 3). The canvas port
    // checks alive at draw-time, so we set alive=true for every active
    // alien (controlA bit 3 set) each frame — same gating, different
    // implementation. Player likewise stays drawn.
    stageAlienCombat() {
        state.player.alive = true;
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) !== 0) a.alive = true;
        }

        // Source separates movement (lane 1) and animation (lane 2) for
        // CPU-budget reasons on the 8085 — its screen-RAM model hides the
        // 1-tick gap because the cell only changes when animation rewrites
        // it. Our port reads alien.x and alien.controlB separately at
        // render time, so any tick-pairing drift (e.g., a dropped frame
        // shifting which lanes land in the same render) leaves controlB
        // one tick behind x and the alien visibly jitters. Run animation
        // immediately after movement in the same tick so controlB always
        // matches the current x — JS has no CPU budget to ration.
        const lane = state.combatLane & 3;
        state.combatLane = (state.combatLane + 1) & 0xFF;
        if (lane === 1) {
            this.alienMovementUpdate();
            this.alienAnimationUpdate();
        }
    },

    // L0D1C / L0D30 — AlienMovementUpdate. Walks 16 alien slots; for
    // each: read current path byte from MOTION_PATH_BASE at offset
    // (movePtr - $1000), look up MOTION_DIRECTIONS[idx*2..+1] for
    // (dx, dy), apply to (x, y). When the post-update coordinate's low
    // 3 bits go zero (8-pixel grid line crossed), advance the path
    // pointer one byte. End-of-list reset is handled by
    // alienAnimationUpdate (matches the source — L0DDE only fires from
    // $0D86, never from $0D30).
    //
    // The source has three branches based on whether dx, dy, or both
    // are zero — and the grid-cross test runs against the *coordinate
    // that was actually updated last*. Mirror the dispatch:
    //   default (both nonzero):    update X then Y, test Y  ($0D55)
    //   dx == 0   ($0D43 → $0D4F): update Y only,  test Y  ($0D55)
    //   dy == 0   ($0D48 → $0D5E): update X only,  test X  ($0D62)
    alienMovementUpdate() {
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ptr = state.alienMovePtr[i];
            const idx = MOTION_PATH_BASE[ptr - PATH_BASE_ADDR];
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
    alienAnimationUpdate() {
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            let ptr = state.alienMovePtr[i];
            let pathByte = MOTION_PATH_BASE[ptr - PATH_BASE_ADDR];
            if (pathByte === 0) {
                ptr = ((state.alienPathSeedHi << 8) | state.alienPathSeedLo) & 0xFFFF;
                state.alienMovePtr[i] = ptr;
                pathByte = MOTION_PATH_BASE[ptr - PATH_BASE_ADDR];
            }
            const drawMode  = ANIMATION_TABLE[pathByte * 3];
            const calcStyle = ANIMATION_TABLE[pathByte * 3 + 1];
            const t1600Base = ANIMATION_TABLE[pathByte * 3 + 2];
            // Calc-style decode mirrors $0DA7-$0DAE: RRCA twice; first
            // carry (bit 0) → XY mode, second carry (bit 1) → X mode,
            // else (bit 2) → Y mode. Order matters when multiple bits
            // are set (e.g. $03 picks XY because bit 0 is checked first).
            // The sub-position bits select one of N pre-shifted tile
            // variants — render.js draws at (x & ~7, y & ~7) so the
            // variant provides the sub-tile offset (see drawAlien).
            let off;
            if      (calcStyle & 0x01) off = (a.x & 0x04) + ((a.y >> 1) & 0x03) + t1600Base;
            else if (calcStyle & 0x02) off = ((a.x >> 1) & 0x03) + t1600Base;
            else                       off = ((a.y >> 1) & 0x03) + t1600Base;
            a.controlA = (a.controlA & 0xF8) | (drawMode & 0x07);
            a.controlB = SHAPE_LSB_TABLE[off & 0xFF];
        }
    },

    state4_PlayerExplosion()     {},   // L0AEA
    state5_GameOver()            {},   // L0B60
    state6_MothershipExplosion() {},   // L2400
    state7_MothershipScore()     {},   // L244C

    // L002D — SplashAndDemo path; stub for skeleton (gameOrAttract forced to 1).
    attractFrame() {},
};
