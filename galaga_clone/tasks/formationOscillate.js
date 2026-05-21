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
}
