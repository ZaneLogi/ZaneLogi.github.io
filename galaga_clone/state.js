// Shared mutable game state — analogous to Galaga's shared RAM.
// All tasks read and write from this object.

import { getObjectIdForSlot } from './paths.js';

// ── Formation home-position tables (db_fmtn_hpos_orig, gg1-2.s:949) ──────────
// The Z80 sprite hardware has a 10 px horizontal offset from our canvas:
//   canvas_X = sprite_X - 10
// Column sprite X from ROM: [0x31,0x41,...,0xC1] = [49,65,...,193]
// Column canvas X after offset: sprite_X - 10.
// Row pixel Y: derived via pixel_Y = 2 × (~(rawY + 0x4F) & 0xFF).
const _COL_X = [39, 55, 71, 87, 103, 119, 135, 151, 167, 183];
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
            list.push({
                type:     row.type,
                alive:    true,
                hitFlag:  false,            // set by bulletUpdate, read by enemyStatus (f_1DB3)
                homeX:    _COL_X[ci],
                homeY:    row.y,
                colIdx:   ci,
                rowIdx:   ri,
                objectId: getObjectIdForSlot(ri, ci),  // Z80 sprt_fmtn_hpos byte offset

                // ── Motion state (step 7+, 'pending' added INT-3a) ──────
                // 'pending'   = alive but not yet on screen (Z80 status 0x80
                //               equivalent — enemy is "in the roster" but
                //               hasn't been spawned via fly-in yet)
                // 'formation' = sit at homeX/Y + offsets (post-fly-in resting)
                // 'flying'    = follow path bytecode; render at (x, y)
                // 'dead'      = no render, no logic
                //
                // Initial state is 'pending' — enemies become visible only
                // when launchEnemy (fly-in) transitions them to 'flying',
                // and then to 'formation' when the path's END/FB fires.
                // Matches the Z80 model: stage starts with formation empty,
                // fly-in fills it pair-by-pair.
                state:      'pending',
                x:          0,
                y:          0,
                vx:         0,             // signed px/frame, lo-nibble of segment byte0
                vy:         0,             // signed px/frame, hi-nibble of segment byte0
                angle:      0,             // 10-bit (0–1023), 1024/circle
                rotRate:    0,             // signed, added to angle each frame
                pathBase:   null,          // Uint8Array of current path bytecode
                pathOffset: 0,             // current byte offset into pathBase
                segTimer:   0,             // frames until next segment load (0 = load now)

                // ── Bomb-drop state (step 8 phase 8d/e) ────────────────
                // Mirror of Z80 0x0E (bomb-drop counter) and 0x0F
                // (per-enemy enable bits, srl'd each cycle). Both 0 means
                // "not bombing" — F6 FREE_FLIGHT token in attack paths
                // arms them via bugMotion's loadSegment.
                bombCounter: 0,
                bombEnable:  0,
            });
        }
    }
    return list;
}

export const state = {

    // ── Frame counter ──────────────────────────────────────────────────────
    // Mirrors ds3_92A0_frame_cts[0] — incremented every logic tick at 60 Hz.
    // Tasks use (frameCount % N) to run at sub-rates (e.g. % 4 = 15 Hz).
    frameCount: 0,

    // 'attract' | 'stageStart' | 'playing' | 'playerDying' | 'stageClear' | 'gameOver'
    // Driven by tasks/gameController.js (the JS-port state machine driver —
    // see architecture.html §5c "JS port state diagram"). INT-1 wires only
    // 'attract' and 'playing'; other states defined for future INT phases.
    gameState: 'attract',

    // ── Stage / wave table (step 9 phase INT-2a) ──────────────────────────
    // stage     = current stage number (Z80 _b_stgctr, mirror at 0x9881).
    //             Starts at 1 — Z80 also bumps from 0 to 1 on first stage init.
    // waveTable = per-stage fly-in wave entries; populated by gameController on
    //             transition to 'playing' via paths.js buildWaveTable(stage).
    //             Consumed by launchAttackWave.runFlyInWave.
    //             INT-2a: builder returns the same 3-pair wave for any stage.
    //             INT-2b: real per-stage variation from d_combat_stg_dat.
    stage:     1,
    waveTable: [],

    // ── Wave-launcher state (step 9 phases INT-2b + INT-3b) ───────────────
    // INT-2b: waveLauncherFlyInDone — set true when wave-cursor exhausts.
    //         gameController polls this to transition 'stageStart'→'playing'.
    // INT-3b: cursors and timers moved here from launchAttackWave's module
    //         scope so they reset cleanly per stage (resetWaveState helper).
    //   flyInCursor   — index of next pair to launch in state.waveTable
    //   flyInCooldown — frames to wait after current pair lands (pull-based)
    //   attackTimers  — per-type countdown for continuous-attack mode
    //                   (yellow / red / boss reload values come from
    //                    launchAttackWave constants — see resetWaveState)
    waveLauncherFlyInDone: false,
    flyInCursor:           0,
    flyInCooldown:         0,
    attackTimers:          { yellow: 180, red: 240, boss: 360 },

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
        gameController:      true,   // JS-port state machine driver (no Z80 counterpart) — see tasks/gameController.js
        starfield:           true,   // f_1D76     — on during gameplay only
        formationOscillate:  true,   // f_2A90     — on when stage is active
        formationPulse:      false,  // f_1DE6     — on when stage is active
        objectStates:        true,   // f_23DD     ★ always on
        enemyStatus:         true,   // f_1DB3     — on when stage is active
        bombUpdate:          true,   // f_1EA4     ★ always on
        launchAttackWave:    true,   // f_2916     — on when stage is active
        playerMove:          true,   // f_1F85     — on during gameplay
        playerFire:          true,   // f_1F04     — on during gameplay
        bulletUpdate:        true,   // CPU1 rckt  — on during gameplay (no CPU0 counterpart)
        bugMotion:           true,   // CPU1 f_08D3 — path interpreter for flying enemies (no CPU0 counterpart)
        captorDive:          false,  // f_21CB     — enabled when boss initiates capture
        tractorBeam:         false,  // f_2222     — enabled when boss reaches player Y
        pullShip:            false,  // f_20F2     — enabled when beam locks on ship
    },

    // ── Starfield control ──────────────────────────────────────────────────
    // Mirrors ds_99B9_star_ctrl in the Z80 source.
    // scrollEnable is set true when player ship is on screen, false when destroyed.
    // speed (1–4) increases with stage number (set by new_stage.s).
    starCtrl: {
        scrollEnable: false,
        speed:        1,
    },

    // ── Player ship ────────────────────────────────────────────────────────
    // Mirrors ds_sprite_posn[$62] / ds_plyr_actv in the Z80 source.
    // Spawn sprite X = 0x7A = 122 (c_133A, gg1-2.s:1058); canvas X = 122 - 10 = 112.
    // dxFlag mirrors b_92A0[3]: toggles each held frame → alternates 1/2 px step.
    player: {
        x:      112,   // canvas X (sprite 0x7A=122 minus 10 px hardware offset)
        y:      208,   // fixed canvas Y (near bottom of 256 px playfield)
        dxFlag: 0,     // toggles each held frame: first=1 px, then 1/2 px alternating
        alive:  true,
    },

    // ── Player bullets ────────────────────────────────────────────────────
    // Galaga limits to 2 simultaneous bullets — slot scan in c_1F0F
    // (gg1-2_fx.s:1873–1884). Pre-allocated; alive=false means slot is free.
    bullets: [
        { x: 0, y: 0, alive: false },
        { x: 0, y: 0, alive: false },
    ],

    // ── Enemy bombs ───────────────────────────────────────────────────────
    // Galaga has 8 bomb slots (b_8800 + 0x68..0x7F). Vector frozen at drop
    // (NOT homing). Y velocity is constant 2/3 px/frame down (so vy is
    // implicit, not stored). Pre-allocated; alive=false means slot is free.
    // See architecture.html §5b "BOMB SUBSYSTEM" for f_1EA4 details.
    bombs: Array.from({ length: 8 }, () => ({ x: 0, y: 0, vx: 0, alive: false })),

    // ── Raw input state (updated by main.js before each update tick) ───────
    // fireEdge is true on the rising edge of fire (mirrors hardware debounce
    // in the Z80 IO chip); playerFire reads it so holding Space doesn't
    // auto-repeat.
    input: {
        left:     false,
        right:    false,
        fire:     false,
        fireEdge: false,
    },

    // ── Enemy objects ──────────────────────────────────────────────────────
    // 48 enemies: 8 boss + 20 butterfly + 20 wasp.
    // Each: { type, alive, hitFlag, homeX, homeY, colIdx, rowIdx }
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
