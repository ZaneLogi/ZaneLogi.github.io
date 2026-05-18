// Mothership stage — JT4 stages 8/9/A/B + JT1 GameStates 6 / 7.
//
// Spread into the main `states` object in states.js via `...mothershipMixin`.
// Methods stay using `this.foo()` (same object identity at runtime), so
// they can call existing helpers (`spiralFillExit`, `stageAlienCombat`,
// `bgUpdate`, etc.) and existing helpers can call back into mothership
// methods without any wiring changes.
//
// See `docs/research_mothership.md` for the full source-citation map
// (Code.md $22B4 / $22CA / $2000+$24A0 / $2400 / $244C). Sub-step
// plan in §11; this file is the 12.0 skeleton.

export const mothershipMixin = {
    // L2400 — GameState 6: mothership particle explosion. Triggered by
    // $23C0 (pilot hit). Ports in step 12.7.
    state6_MothershipExplosion() {},

    // L244C — GameState 7: mothership score display. Triggered by $2552.
    // Ports in step 12.9.
    state7_MothershipScore() {},
};
