// Mothership stage — JT4 stages 8/9/A/B + JT1 GameStates 6 / 7.
//
// Spread into the main `states` object in states.js via `...mothershipMixin`.
// Methods stay using `this.foo()` (same object identity at runtime), so
// they can call existing helpers (`starsScrollDown`, `stageAlienCombat`,
// etc.) and existing helpers can call back into mothership methods.
//
// See `docs/research_mothership.md` for the full source-citation map
// (Code.md $22B4 / $22CA / $2000+$24A0 / $2400 / $244C).

import { state } from './state.js';

export const mothershipMixin = {
    // L22B4 — JT4 stage 9: mothership lone fade-in. Stars scroll
    // continuously (CALL StarsScrollDown $067A); CounterB4 decrements
    // each frame. When CounterB4 hits $28 (= 40), the one-shot flag at
    // $4367 ("mothership partially faded in") gets set in source — port
    // skips this because no other source routine reads it (only writers
    // are $22C3 and $22D7; likely vestigial / sound-related). When
    // CounterB4 hits 0, advance LR + set GameState=2 to re-init for
    // stage A (L0848 tail).
    //
    // The mothership graphic appears automatically: stage 9's stage
    // block (T05CC byte 7 = $1D, byte 9 = $48) routes starsScrollDown's
    // refill to T1D00 (upside-down mothership 26×9) instead of a
    // starfield. 72 frames / 8 px per refill = 9 row-refills = the
    // mothership scrolled into view from the top.
    // research_mothership.md §3.
    stageMothershipFadeIn() {                       // L22B4
        this.starsScrollDown();                     // $067A

        // $22B7-$22BA — DEC (HL=$43B4) = stageBlock[9] = CounterB4.
        const counterB4 = (state.stageBlock[9] - 1) & 0xFF;
        state.stageBlock[9] = counterB4;

        // $22BC: CP $28 + JP NZ,$0848 — once-only side-effect at $28
        // (set $4367 flag in source; vestigial, omitted in port).

        // L0848 tail: when CounterB4 reaches 0, advance LR and queue
        // state-2 re-init for the next stage.
        if (counterB4 === 0) {
            state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
            state.gameState = 2;
        }
    },

    // L22CA — JT4 stage A: mothership + aliens fade-in. Piggy-backs on
    // stageAlienFadeIn (L0834) for every frame except the first. On the
    // first frame (CounterB4 == $C0, the initial value set by stage A's
    // stage block T05B4 byte 9), runs a one-shot:
    //   - CounterB4 := $30 (shorter window: 48 frames for aliens to fade)
    //   - $4367 := $FF (vestigial — no source reader; port omits)
    //   - $43BC := $3F (vestigial — no source reader; port omits)
    //
    // The mothership graphic from stage 9 (currently at rows 1-9) gets
    // pushed DOWN ~6 more rows during this fade-in window: stage A's
    // stage block sets starfieldMsb=$1C (T1C00 starfield), so the
    // bgUpdate calls inside stageAlienFadeIn refill hidden row 0 with
    // regular stars while shifting the buffer down. Net effect:
    // mothership ends at rows 7-15 (upper-middle = combat position
    // matching source's EraseMothership target $4AC6).
    // research_mothership.md §4.
    stageMothershipPlusAliensFadeIn() {              // L22CA
        if (state.stageBlock[9] !== 0xC0) {
            // $22D0 JP NZ,$0834 — every frame except the first.
            return this.stageAlienFadeIn();
        }
        // $22D3 — first frame one-shot.
        state.stageBlock[9] = 0x30;
        // $22D7 / $22DB vestigial flag writes ($4367, $43BC) omitted.
    },

    // L2400 — GameState 6: mothership particle explosion. Triggered by
    // $23C0 (pilot hit). Ports in step 12.7.
    state6_MothershipExplosion() {},

    // L244C — GameState 7: mothership score display. Triggered by $2552.
    // Ports in step 12.9.
    state7_MothershipScore() {},
};
