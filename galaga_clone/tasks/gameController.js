// tasks/gameController.js — JS-port game state machine driver.
//
// =============================================================================
// IMPORTANT — why this file is structured as a TASK rather than a control loop
// =============================================================================
// The Z80 implements its game state machine as a BLOCKING FOREGROUND THREAD in
// `g_main()` (game_ctrl.s:172-353):
//
//     while (game_state == ATTRACT_MODE) { }       ; spin until state changes
//     while (game_state == READY_TO_PLAY_MODE) { } ; spin until state changes
//     gctl_game_runner();                          ; in-game per-frame loop
//
// That works on Z80 because hardware VBL interrupts fire ~60 Hz regardless of
// what the main thread is doing — the interrupt handler runs the task scheduler
// (task_man.s), so background tasks like f_0977 (coin/start input) keep running
// even while g_main spins. The spin loop eventually sees state byte changes
// and exits.
//
// JavaScript is single-threaded with no preemption — a `while (...) { }` would
// freeze the browser; rAF would never fire again. So we model the state
// machine as a TASK that runs every tick: gameController.update() reads
// `state.gameState` and dispatches behaviour, returns, and runs again next tick.
//
// See architecture.html §5c "Why we can't just mirror Z80's blocking-loop
// pattern" for the full reasoning. The §5c "JS port state diagram" defines
// the 6-state contract this file implements (incrementally, per INT-1..7).
// =============================================================================
//
// Phasing:
//   INT-1  — wired 'attract' + 'playing' states; Space transitions attract→playing.
//   INT-2a — added buildWaveTable seam; gameController populates state.waveTable
//            on transition to 'playing'.
//   INT-2b — adds 'stageStart' state between attract and playing. The fly-in
//            (which is run by launchAttackWave's runFlyInWave) happens during
//            stageStart; once the wave cursor exhausts (signalled via
//            state.waveLauncherFlyInDone) we transition to 'playing'. Player
//            tasks (move/fire/bullet/bomb) are off during stageStart so the
//            ship doesn't appear until fly-in completes — matches Galaga's
//            stage-init pattern (see architecture.html §5c JS port diagram).
//   INT-2c — (future) port real d_combat_stg_dat for per-stage variation.

import { buildWaveTable }   from '../paths.js';
import { resetWaveState }   from './launchAttackWave.js';

// Per-state task-enable configurations.
// Applied ONLY on state transition — so dev-panel toggles within a state
// aren't fought by the controller. Names match keys in state.tasks.
const STATE_TASKS = {
    'attract': {
        starfield:           true,    // stars visible during attract
        formationOscillate:  false,
        formationPulse:      false,
        objectStates:        false,   // formation hidden
        bugMotion:           false,
        enemyStatus:         false,
        bombUpdate:          false,
        launchAttackWave:    false,
        playerMove:          false,   // player ship hidden
        playerFire:          false,
        bulletUpdate:        false,
        captorDive:          false,
        tractorBeam:         false,
        pullShip:            false,
    },
    'stageStart': {
        // Fly-in phase. Formation-side tasks active so enemies can fly in
        // and land in their slots. Player tasks ALSO enabled so the ship is
        // visible and the player can move + shoot during fly-in.
        //
        // Step 9 phase INT-4 — UX deviation noted: the verified Z80 behaviour
        // is "ship visible but frozen" during fly-in (player input disabled
        // until plyr_respawn_rdy runs at game_ctrl.s:872, AFTER stage init).
        // We deviate here for player-friendlier UX — matches typical web
        // Galaga ports and gives the player something to do during the ~3 sec
        // fly-in window. Documented in architecture.html §5c.
        //
        // bombUpdate stays off because fly-in paths don't have F6 FREE_FLIGHT
        // tokens — no bombs ever drop during stageStart anyway.
        starfield:           true,
        formationOscillate:  true,
        formationPulse:      false,
        objectStates:        true,
        bugMotion:           true,    // path interpreter for fly-in
        enemyStatus:         true,    // INT-4: hit registration so bullets can kill enemies
        bombUpdate:          false,   // no bombs during fly-in (no F6 in fly-in paths)
        launchAttackWave:    true,    // runs runFlyInWave during stageStart
        playerMove:          true,    // INT-4 (UX deviation): ship visible + movable
        playerFire:          true,    // INT-4 (UX deviation): bullets can spawn
        bulletUpdate:        true,    // INT-4: bullets move + collide
        captorDive:          false,
        tractorBeam:         false,
        pullShip:            false,
    },
    'playing': {
        starfield:           true,
        formationOscillate:  true,
        formationPulse:      false,   // currently dev-only
        objectStates:        true,
        bugMotion:           true,
        enemyStatus:         true,
        bombUpdate:          true,
        launchAttackWave:    true,
        playerMove:          true,
        playerFire:          true,
        bulletUpdate:        true,
        captorDive:          false,   // step 9+
        tractorBeam:         false,   // step 9+
        pullShip:            false,   // step 9+
    },

    // Defined in §5c JS port state diagram — wired in later INT phases:
    //   'stageStart'  → INT-2  (stage data + builder)
    //   'stageClear'  → INT-5  (clear detection + cycling)
    //   'playerDying' → INT-4  (lifecycle bug fixes + respawn)
    //   'gameOver'    → INT-4  (game-over flow)
};

function applyStateTasks(state) {
    const cfg = STATE_TASKS[state.gameState];
    if (!cfg) return;
    for (const key in cfg) {
        state.tasks[key] = cfg[key];
    }
}

// Module-scope previous-state tracker so we can detect TRANSITIONS
// (apply config) vs steady-state (let dev-panel toggles persist).
let _lastState = null;

export function update(state) {
    // On state transition, apply the per-state task config + any per-state
    // setup (wave table build, timers, etc.).
    if (state.gameState !== _lastState) {
        applyStateTasks(state);

        // When entering 'stageStart': build the per-stage wave table and
        // reset all launcher cursors/timers so the new stage starts fresh.
        //   INT-2b — wave table + waveLauncherFlyInDone clear
        //   INT-3b — full cursor + timer reset via resetWaveState (now that
        //            all wave state lives on state.* instead of module scope)
        if (state.gameState === 'stageStart') {
            state.waveTable = buildWaveTable(state.stage);
            resetWaveState(state);
        }

        _lastState = state.gameState;
    }

    // Per-state per-tick logic.
    switch (state.gameState) {
        case 'attract':
            // Wait for Space (rising edge) to start the game. Browser has
            // no coin slot — we collapse Z80's READY state into the start
            // trigger and go straight into stageStart (the splash + fly-in
            // window).
            if (state.input.fireEdge) {
                state.gameState = 'stageStart';
            }
            break;

        case 'stageStart':
            // INT-2b: wait for fly-in to complete (signalled by
            // launchAttackWave when its wave-cursor exhausts). Once done,
            // hand off to 'playing' which enables player tasks + continuous
            // attack mode.
            if (state.waveLauncherFlyInDone) {
                state.gameState = 'playing';
            }
            break;

        case 'playing':
            // INT-4 / INT-5 will add death + stage-clear transitions. For
            // now just let attack mode run.
            break;

        // Other states (declared in STATE_TASKS but not yet transitioned to)
        // get wired in later INT phases.
    }
}
