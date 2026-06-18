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
//   INT-2a — added buildWaveTable seam (later replaced by buildWaveStream in INT-2c).
//   INT-2b — added 'stageStart' state. Fly-in runs during stageStart; once
//            launchAttackWave signals waveLauncherFlyInDone, we transition to
//            'playing'. Player tasks (move/fire/bullet/bomb) are off during
//            stageStart so the ship doesn't appear until fly-in completes.
//   INT-2c — ported real d_combat_stg_dat + Z80-faithful byte-stream wave table
//            (state.waveStream); rewrote launchAttackWave to walk it byte-by-byte
//            with the Z80 frame_cnt&7 launch gate. Added stgInitEnv() per
//            research_stage_init.md to mirror the Z80 stg_init_env beats.

import { buildWaveStream, loadStageParms } from '../paths.js';
import { resetWaveState }                  from './launchAttackWave.js';

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
        bomberConfig:        false,
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
        bomberConfig:        false,   // attack reloads not needed during fly-in
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
        bomberConfig:        true,    // Phase C INT-7: f_0857 recomputes reload values per frame
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

// JS-port equivalent of stg_init_env (task_man.s:256). Runs the per-stage
// init beats: build wave stream, reset per-stage counters, clear hit-flags,
// reset enemy roster. Mirrors the Z80 ZERO/SET sequence in §13.3 of
// research_stage_init.md.
//
// Operations skipped intentionally (workarounds documented in CLAUDE.md):
//   - c_2896 sprite codes/colors  → sprites hardcoded in gfx/resource.js
//   - c_12C3 formation positions  → positions hardcoded in state.js _ROWS
//   - bomber-boss sprite codes    → no boss-capture in stage 1
function stgInitEnv(state) {
    // Z80: c_25A2 → builds the runtime wave table at ds_8920.
    state.waveStream       = buildWaveStream(state.stage);
    state.waveStreamCursor = 0;

    // Z80: c_2C00 (new_stage.s:28-119) → load per-stage difficulty
    // params from bmbr_stg_cfg_dat into ds_new_stage_parms[0..10]
    // based on (stage, rank). Read by runAttackMode for MAX_BOMBERS;
    // future phases will use it for reload values, bomb-drop flags,
    // captured-boss flag, etc. (See research_attack_paths.md §9.)
    state.newStageParms = loadStageParms(state.stage, state.rank);

    // Z80: zero per-stage counters (task_man.s:283-291).
    state.atkWvEnbl    = false;   // gates the launcher; flipped after settling
    state.attkwvCtr    = 0;
    state.bugsFlying   = 0;

    // Z80: game_tmrs[0] = 2 (task_man.s:263) — first inter-wave gate value.
    state.gameTimers[0] = 2;

    // Z80: game_tmrs[2] = 0x78 (= 120) — stage-elapsed timer set by
    // new_stg_game_or_demo (game_ctrl.s:856 comment). Decremented at
    // 2 Hz by tickGameTimers, hits 0 after 60 sec. Read by f_0857
    // (bomberConfig) for column selection in c_08AD red/yellow reload
    // tables and for the MAX_BOMBERS ramp-up gate.
    state.gameTimers[2] = 0x78;

    // Z80: clear b_9200_obj_collsn_notif even bytes 0..0x5F (task_man.s:269-277)
    // Maps to per-enemy hitFlag.
    for (const e of state.enemies) {
        e.hitFlag = false;
    }

    // Z80: reset all 48 creature dispositions back to 0x80 (inactive). In our
    // model that means all enemies become 'pending' again and their flight-
    // state fields clear, so a new stage can re-launch them via the wave
    // stream. (At game-start this is done by c_sctrl_sprite_ram_clr; for
    // stage cycling the same reset is implicit because all enemies are dead
    // by stage-clear time.)
    for (const e of state.enemies) {
        e.state          = 'pending';
        e.alive          = true;
        e.x              = 0;
        e.y              = 0;
        e.vx             = 0;
        e.vy             = 0;
        e.angle          = 0;
        e.rotRate        = 0;
        e.pathBase       = null;
        e.pathOffset     = 0;
        e.segTimer       = 0;
        e.bombCounter    = 0;
        e.bombEnable     = 0;
        e.negateRotation = false;   // cleared until re-set by next launch
    }

    state.waveLauncherFlyInDone = false;

    // Reset the formation drift/breathe lifecycle for the new stage: start
    // oscillating from center, clear the stop-request, reset the pulse.
    // (STATE_TASKS['stageStart'] re-enables oscillate + disables pulse.)
    state.formation.oscillateX   = 0;
    state.formation.oscillateDir = 1;
    state.formation.nestlrInh    = false;
    state.formation.pulseCounter = 0;
    state.formation.pulseOffsets.fill(0);

    // Reset phase-2 (continuous attack) timers via the launcher's helper.
    resetWaveState(state);
}

// Module-scope previous-state tracker so we can detect TRANSITIONS
// (apply config) vs steady-state (let dev-panel toggles persist).
let _lastState = null;

// Z80 plyr_respawn_rdy (game_ctrl.s:872) sets _b_atk_wv_enbl = 1 AFTER
// the "STAGE X" text clears and the player ship is ready. We mirror that
// delay with a frame countdown so the launcher doesn't fire instantly on
// the first stageStart frame. Gives gameplay-friendly settle time and
// matches the Z80's two-phase enable.
let _atkWvEnableDelay = 0;
const ATK_WV_ENABLE_DELAY_FRAMES = 60;   // ~1 sec at 60 Hz, mirrors Z80 stage-init delay

export function update(state) {
    // On state transition, apply the per-state task config + any per-state
    // setup (wave table build, timers, etc.).
    if (state.gameState !== _lastState) {
        applyStateTasks(state);

        if (state.gameState === 'stageStart') {
            stgInitEnv(state);
            _atkWvEnableDelay = ATK_WV_ENABLE_DELAY_FRAMES;
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
            // Z80 plyr_respawn_rdy hand-off: after a settle delay, flip
            // atkWvEnbl=true so the launcher actually starts. Before this,
            // the launcher task is "enabled" via state.tasks but its first
            // line gates on atkWvEnbl (mirrors Z80 f_2916 line 1672-1675).
            if (!state.atkWvEnbl) {
                if (_atkWvEnableDelay > 0) {
                    _atkWvEnableDelay -= 1;
                } else {
                    state.atkWvEnbl = true;
                }
            }

            // Wait for fly-in to complete (signalled by launchAttackWave
            // when its wave-stream cursor hits 0x7F). Once done, hand off
            // to 'playing' which enables continuous attack mode.
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
