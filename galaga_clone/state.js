// Shared mutable game state — analogous to Galaga's shared RAM.
// All tasks read and write from this object.

export const state = {

    // ── Frame counter ──────────────────────────────────────────────────────
    // Mirrors ds3_92A0_frame_cts[0] — incremented every logic tick at 60 Hz.
    // Tasks use (frameCount % N) to run at sub-rates (e.g. % 4 = 15 Hz).
    frameCount: 0,

    gameState: 'attract',  // 'attract' | 'ready' | 'playing' | 'gameover'

    // ── Game timers ────────────────────────────────────────────────────────
    // Mirrors ds4_game_tmrs — 4 countdown bytes decremented at 2 Hz by the
    // internal tickGameTimers() in main.js (equivalent of f_1DD2).
    // Tasks set these and busy-wait: while (state.gameTimers[2] > 0) { ... }
    //   [0] general purpose
    //   [1] general purpose
    //   [2] stage timer (set to 120 at stage start)
    //   [3] short delays (set to 3, 4, 8 for brief waits)
    gameTimers: [0, 0, 0, 0],

    // ── Task enable flags ──────────────────────────────────────────────────
    // Mirrors ds_cpu0_task_actv in the Z80 source.
    // Any task can flip another task's flag, exactly as in the original.
    //
    // ★ = always-on in the original (task_enable_tbl_def = 0x01)
    tasks: {
        starfield:           false,  // f_1D76  — on during gameplay only
        formationOscillate:  false,  // f_2A90  — on when stage is active
        formationPulse:      false,  // f_1DE6  — on when stage is active
        objectStates:        true,   // f_23DD  ★ always on
        enemyStatus:         false,  // f_1DB3  — on when stage is active
        bombUpdate:          true,   // f_1EA4  ★ always on
        launchAttackWave:    false,  // f_2916  — on when stage is active
        playerMove:          false,  // f_1F85  — on during gameplay
        playerFire:          false,  // f_1F04  — on during gameplay
        captorDive:          false,  // f_21CB  — enabled when boss initiates capture
        tractorBeam:         false,  // f_2222  — enabled when boss reaches player Y
        pullShip:            false,  // f_20F2  — enabled when beam locks on ship
    },

    // ── Starfield control ──────────────────────────────────────────────────
    // Mirrors ds_99B9_star_ctrl in the Z80 source.
    // scrollEnable is set true when player ship is on screen, false when destroyed.
    // speed (1–4) increases with stage number (set by new_stage.s).
    starCtrl: {
        scrollEnable: false,
        speed:        1,
    },

    // ── Rendering context (set by main.js at startup) ──────────────────────
    ctx: null,
};
