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
} from './data.js';

// L0400 — Code.md:GameStateMachine. JT1 jump table → JS switch
// (research_code_flow.md §5.1).

// Offset of $05A8 inside the packed STAGE_BLOCKS slice (data.js exports the
// four 12-byte blocks $05A8/$05B4/$05C0/$05CC as one 48-byte array).
// STAGE_BLOCK_INDEX (source T0598) stores LSBs in the $A8..$CC range;
// subtract $A8 to get the slice index.
const STAGE_BLOCK_BASE = 0xA8;

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
        const movePtr  = ALIEN_MOVE_PTR_INIT[stage * 2]
                       | (ALIEN_MOVE_PTR_INIT[stage * 2 + 1] << 8);

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

    // L2000 — combat stub. Step 5 leaves aliens sitting in formation with
    // the controlA/B values written by state-2 init (controlA=$09 → Bit3
    // "Draw 2×1", controlB=$60 → ALIEN_SHAPE_TABLE entry for source $1460
    // = shape #7, single tile $6A). The alive=true loops mirror L2000's
    // per-frame AlienDataController ($0A50) and PlayerUpdate ($0876)
    // calls — without them, both aliens and player would stay invisible
    // since state-2 init no longer sets alive itself. Movement, firing,
    // and attack patterns land in steps 6-8.
    stageAlienCombat() {
        for (let i = 0; i < state.aliensLeft; i++) {
            state.aliens[i].alive = true;
        }
        state.player.alive = true;
    },

    state4_PlayerExplosion()     {},   // L0AEA
    state5_GameOver()            {},   // L0B60
    state6_MothershipExplosion() {},   // L2400
    state7_MothershipScore()     {},   // L244C

    // L002D — SplashAndDemo path; stub for skeleton (gameOrAttract forced to 1).
    attractFrame() {},
};
