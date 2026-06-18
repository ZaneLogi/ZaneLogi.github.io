// f_2A90 — oscillate formation ±32 px left/right at 15 Hz (1 px per 4 frames)
// Runs during fly-in and attack phases; hands off to f_1DE6 at steady state.

const MAX_SWING = 32;

export function update(state) {
    if (state.frameCount % 4 !== 0) return;

    const f = state.formation;
    f.oscillateX += f.oscillateDir;

    if (f.oscillateX >= MAX_SWING) {
        f.oscillateX  =  MAX_SWING;
        f.oscillateDir = -1;
    } else if (f.oscillateX <= -MAX_SWING) {
        f.oscillateX  = -MAX_SWING;
        f.oscillateDir =  1;
    }

    // Coast-to-center stop + handoff to breathing (Z80 gg1-3.s:1998-2031).
    // Once the formation is complete (nestlrInh, set by launchAttackWave's
    // l_2A29 mirror), keep drifting until it returns to center, then disable
    // this task and enable the expand/contract pulse (f_1DE6). This re-centers
    // the collective for the dive phase — without it the formation keeps
    // drifting L/R during 'playing' instead of breathing in place.
    if (f.nestlrInh && f.oscillateX === 0) {
        state.tasks.formationOscillate = false;   // disable self (gg1-3.s:2027)
        state.tasks.formationPulse     = true;    // enable breathing (gg1-3.s:2030)
    }
}
