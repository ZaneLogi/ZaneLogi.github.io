import { state } from './state.js';
import { input } from './input.js';
import { gfx } from './gfx.js';

// L0400 — Code.md:GameStateMachine. JT1 jump table → JS switch
// (research_code_flow.md §5.1).

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

    // L04AC — score flash for ~128 frames (CounterA5 $80 → $00).
    state1_ScoreFlash() {
        if (state.counterA5 > 0) state.counterA5--;
        if (state.counterA5 === 0) state.gameState = 2;
    },

    // L0515 — per-stage init, one frame.
    state2_StageInit() {
        state.gameState = 3;
    },

    // L0800 — JT4 sub-dispatch on (LevelAndRound & 0x0F). Skeleton: just
    // move the placeholder ship so input is visibly wired up.
    state3_Gameplay() {
        if (input.leftPressed  && state.player.x > 16)
            state.player.x--;
        if (input.rightPressed && state.player.x < gfx.width - state.player.w - 16)
            state.player.x++;
    },

    state4_PlayerExplosion()     {},   // L0AEA
    state5_GameOver()            {},   // L0B60
    state6_MothershipExplosion() {},   // L2400
    state7_MothershipScore()     {},   // L244C

    // L002D — SplashAndDemo path; stub for skeleton (gameOrAttract forced to 1).
    attractFrame() {},
};
