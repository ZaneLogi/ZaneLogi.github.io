// Shared mutable game state — analogous to Galaga's shared RAM.
// All tasks read and write from this object.

// ── Formation home-position tables (db_fmtn_hpos_orig, gg1-2.s:949) ──────────
// Column pixel X: stored directly in ROM.
// Row pixel Y: derived via pixel_Y = 2 × (~(rawY + 0x4F) & 0xFF).
const _COL_X = [49, 65, 81, 97, 113, 129, 145, 161, 177, 193];
const _ROWS = [
    { y:  60, type: 'boss',      cols: [3,4,5,6]              },
    { y:  76, type: 'boss',      cols: [3,4,5,6]              },
    { y:  92, type: 'butterfly', cols: [0,1,2,3,4,5,6,7,8,9] },
    { y: 104, type: 'butterfly', cols: [0,1,2,3,4,5,6,7,8,9] },
    { y: 116, type: 'wasp',      cols: [0,1,2,3,4,5,6,7,8,9] },
    { y: 128, type: 'wasp',      cols: [0,1,2,3,4,5,6,7,8,9] },
];

function buildEnemies() {
    const list = [];
    for (let ri = 0; ri < _ROWS.length; ri++) {
        const row = _ROWS[ri];
        for (const ci of row.cols) {
            list.push({ type: row.type, alive: true, homeX: _COL_X[ci], homeY: row.y, colIdx: ci, rowIdx: ri });
        }
    }
    return list;
}

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
        starfield:           true,   // f_1D76  — on during gameplay only
        formationOscillate:  true,   // f_2A90  — on when stage is active
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

    // ── Enemy objects ──────────────────────────────────────────────────────
    // 48 enemies: 8 boss + 20 butterfly + 20 wasp.
    // Each: { type, alive, homeX, homeY, colIdx, rowIdx }
    enemies: buildEnemies(),

    // ── Formation movement state ───────────────────────────────────────────
    formation: {
        // f_2A90 — L/R oscillation
        oscillateX:   0,   // current pixel offset applied to all enemy X
        oscillateDir: 1,   // +1 = drifting right, -1 = drifting left

        // f_1DE6 — expand/contract pulse
        // pulseOffsets[0-9]  = per-column X offsets (cols 0-9)
        // pulseOffsets[10-15] = per-row Y offsets (rows 0-5)
        pulseOffsets: new Array(16).fill(0),
        pulseCounter: 0,   // 0x00-0x1F expanding; 0xA0-0x81 contracting
        // Live bitmap (d_1E64 row 0); rotated by formationPulse each tick.
        pulseBitmap: [0xFF,0x77,0x55,0x14,0x10,0x10,0x14,0x55,0x77,0xFF,
                      0x00,0x10,0x14,0x55,0x77,0xFF],
    },

    // ── Rendering context (set by main.js at startup) ──────────────────────
    ctx: null,
};
