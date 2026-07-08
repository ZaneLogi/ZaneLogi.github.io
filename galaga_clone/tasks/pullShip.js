// f_20F2 — pull the captured ship up the beam toward the boss, spinning it.
//
// Enabled by tractorBeam (l_233D) once the ship is inside the beam. Each frame
// it spins the ship (c_2188_ship_spin) and walks it toward the boss in X and up
// in Y; when the ship reaches the boss it CONNECTS (capture completes). Mirrors
// f_20F2 (gg1-3.s:205-318) + c_2188_ship_spin (gg1-3.s:330-380).
//
// 4c-i scope: on connect the ship is lost (player.alive=false → general respawn)
// and the beam ends + boss retreats. 4c-ii replaces the retreat with the
// carry-home + the captured-ship slave (f_19B2 / db_flv_cboss).

import { BOSS_CARRYHOME_PATH } from '../paths.js';

const PULL_SPEED = 1;   // ±1 px/frame (Z80 inc/dec of the ship sprite posn)

export function update(state) {
    if (!state.capture.pullGate) { state.tasks.pullShip = false; return; }

    const p    = state.player;
    const boss = state.enemies.find(e => e.objectId === state.captureBossId);

    // Boss gone mid-pull (shot): abort the pull so the ship isn't left frozen.
    // Normally tractorBeam (f_2222, dispatched just before this task) catches the
    // kill first and clears pullGate → the gate at the top of update returns
    // before reaching here. This is the defensive backstop. A kill sets
    // boss.alive=false but leaves boss.state, so the state test alone misses it.
    if (!boss || !boss.alive || (boss.state !== 'flying' && boss.state !== 'homing')) {
        abortPull(state);
        return;
    }

    // Spin the ship: cycle sprite frames 0..6 at ~15 Hz (c_2188 tumbling).
    p.captureFrame = (state.frameCount >> 2) % 7;

    // Walk X toward the boss's column, Y up toward the boss (Z80 ±1 steps).
    if      (p.x < boss.x) p.x += PULL_SPEED;
    else if (p.x > boss.x) p.x -= PULL_SPEED;

    if (p.y > boss.y) {
        p.y -= PULL_SPEED;
        return;
    }

    // ── Connected (Z80 l_2141 / l_2305) — the ship reached the boss ────────
    onConnect(state, boss);
}

// Capture completes (Z80 l_2141 / f_2222 l_2305). The player ship is lost (→
// general respawn); the beam ends but the mission is NOT released — the boss
// flies home carrying the ship and the captured slave joins the formation
// (f_19B2 / fighterCaptured).
function onConnect(state, boss) {
    const p = state.player;
    state.capture.pullGate        = 0;
    state.capture.fighterCaptured = 1;   // Z80 captr_status+4 = 1
    state.tasks.pullShip          = false;

    p.alive = false; p.controlLocked = false; p.captureFrame = null;

    state.beam              = null;      // Z80 f_2222 ends (l_2305)
    state.tasks.tractorBeam = false;

    // Spawn the captured slave, glued to the boss (fighterCaptured / f_19B2).
    state.capturedSlave = {
        bossId: boss.objectId,
        x: boss.x, y: boss.y + 16,
        colIdx: boss.colIdx, rowIdx: boss.rowIdx,
        state: 'carryhome', alive: true,
    };

    // Boss carries the ship home: load db_flv_cboss, un-halt → bugMotion drives
    // it (descend → FB home to its formation slot).
    boss.captureHalted = false;
    boss.captureDiving = false;
    boss.pathBase      = BOSS_CARRYHOME_PATH;
    boss.pathOffset    = 0;
    boss.segTimer      = 0;
    boss.state         = 'flying';

    state.gameTimers[1]         = 6;     // "FIGHTER CAPTURED" text timer (Z80 game_tmrs[1])
    state.tasks.fighterCaptured = true;  // enable f_19B2
    // captureActive / captureBossId stay set until the slave settles (cleared by
    // fighterCaptured on settle).
}

// Pull aborted (boss vanished before connect): release the player + close the
// beam without a capture.
function abortPull(state) {
    const p = state.player;
    state.capture.pullGate = 0;
    state.tasks.pullShip   = false;
    p.controlLocked        = false;
    p.captureFrame         = null;
    endCaptureBeam(state, null);
}

// Close the beam, release the boss to retreat, clear the mission (Z80 l_22E3).
function endCaptureBeam(state, boss) {
    state.beam              = null;
    state.tasks.tractorBeam = false;
    boss = boss || state.enemies.find(e => e.objectId === state.captureBossId);
    if (boss) {
        boss.captureHalted = false;   // un-freeze → path resumes (retreat)
        boss.captureDiving = false;
    }
    state.captureActive = false;
    state.captureBossId = null;
}
