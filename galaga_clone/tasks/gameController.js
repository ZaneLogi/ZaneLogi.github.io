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
import { charCanvas }                      from '../gfx/resource.js';

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
        fighterCaptured:     false,
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
        fighterCaptured:     false,
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
        fighterCaptured:     false,   // step 9+
    },

    // 'stageClear' (INT-5): the brief between-stages pause. The formation is
    // cleared (no enemies) and the player is frozen while the "STAGE n" splash
    // shows; only the starfield keeps moving. The ship still RENDERS (render runs
    // regardless of enable) so it stays visible. Mirrors the Z80 stg_init_splash
    // window (task_man.s:227-242).
    'stageClear': {
        starfield:           true,
        formationOscillate:  false,
        formationPulse:      false,
        objectStates:        false,
        bugMotion:           false,
        enemyStatus:         false,
        bombUpdate:          false,
        bomberConfig:        false,
        launchAttackWave:    false,
        playerMove:          false,
        playerFire:          false,
        bulletUpdate:        false,
        captorDive:          false,
        tractorBeam:         false,
        pullShip:            false,
        fighterCaptured:     false,
    },

    // Defined in §5c JS port state diagram — wired in later INT phases:
    //   'playerDying' → INT-4  (lifecycle bug fixes + respawn)
    //   'gameOver'    → INT-4  (game-over flow)
};

// Stage-clear splash hold (frames). Z80 stg_init_splash sets game_tmrs[2]=3 and
// busy-waits to 0 (task_man.s:227-242); at 2 Hz that's ~1.5 s = 90 frames @ 60 Hz.
const STAGE_SPLASH_FRAMES = 90;

// Count of enemies still "on screen" for stage-clear detection — the JS analog
// of Z80 b_bugs_actv_nbr (gctl_supv_stage, game_ctrl.s:1311). Counts only enemies
// in an ACTIVE on-screen state: alive, not 'dead', not 'pending'.
//
// 'pending' is EXCLUDED on purpose: the stage roster has 48 slots but only 40 ever
// fly in (the wave stream covers 40 object IDs — the other 8, IDs 0x00/02/04/06 and
// 0x38/3a/3c/3e, are never launched and sit in 'pending' forever). Counting those
// would peg the total at 8 and the stage could never clear. 'playing' is entered
// only after fly-in completes, so any 'pending' enemy here is one of those phantom
// slots — never a still-to-arrive one.
function activeEnemyCount(state) {
    let n = 0;
    for (const e of state.enemies) {
        if (e.alive && e.state !== 'dead' && e.state !== 'pending') n += 1;
    }
    return n;
}

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
    // Z80: c_25A2 → builds the runtime wave table at ds_8920. Per-stage AND
    // per-rank caravan now (was stage-1-only) — see paths.buildWaveStream.
    state.waveStream       = buildWaveStream(state.stage, state.rank);
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
        e.hits           = 0;       // boss 2-hit counter (4d-a)
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

    // Clear any captured-ship slave + capture-machine state from a prior stage
    // (a new stage never starts mid-capture).
    state.capturedSlave           = null;
    state.capture.pullGate        = 0;
    state.capture.fighterCaptured = 0;
    state.capture.rescueStage     = 0;
    state.player.controlLocked    = false;
    state.player.captureFrame     = null;

    // twoShip is a NEW-GAME reset, NOT a per-stage one: the Z80 never clears
    // _b_2ship on a stage change (only at game/demo init, on a kill, or never),
    // so the dual fighter CARRIES OVER into the next stage. Reset it only when a
    // fresh game begins (stage 1). (INT-5 — was unconditional, which stripped the
    // dual fighter on every advance.)
    if (state.stage === 1) state.player.twoShip = false;

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

// ── General respawn (G12, sub-step 4c) ─────────────────────────────────────
// The clone had no respawn — a bomb hit (and now a capture) left the ship gone
// forever. We add a no-life-loss respawn: once the ship is lost
// (player.alive=false, set by bombUpdate or pullShip), a fresh ship reappears at
// the spawn position after a short pause. Stands in for the Z80 c_player_respawn
// flow (game_ctrl.s) without the lives/game-over machinery (deferred — see
// research_boss_capture.md Decision 2). _playerWasAlive arms the timer once on
// the death frame so the killers don't need the constant.
// Respawn wait (frames). The Z80's c_player_respawn waits out the bug-nest
// retreat (~126 frames ≈ 2.1 s via f_1D32) while "READY" shows; we don't model
// the nest animation, but use a comparable hold so the "READY" text is readable.
const RESPAWN_DELAY = 120;  // ~2 s
let _playerWasAlive = true;

function handleRespawn(state) {
    const p = state.player;
    if (p.alive) { _playerWasAlive = true; return; }
    if (_playerWasAlive) {              // ship just lost this frame → arm the timer
        _playerWasAlive = false;
        p.respawnTimer  = RESPAWN_DELAY;
        return;
    }
    if (p.respawnTimer > 0) { p.respawnTimer -= 1; return; }
    // Respawn: fresh ship at the spawn position, controls released.
    p.x = 113; p.y = 265; p.dxFlag = 0;   // center canvas X (sprite 0x7A − 9), Y (297 − 32)
    p.alive = true; p.controlLocked = false; p.captureFrame = null;
}

// The Z80's pre-launch delay is c_tdelay_3 (game_ctrl.s:868 → gg1-2.s:963):
// game_tmrs[3] = 3, busy-wait until 0, ticked at 2 Hz (½-s); the splash +
// c_player_respawn add nothing on a fresh stage (c_player_respawn's only wait,
// "while(bugs_flying)", passes instantly with no bugs). We port the MECHANISM
// (gameTimers[3] ticked to 0 arms atkWvEnbl; then Z80 plyr_respawn_rdy sets
// _b_atk_wv_enbl, game_ctrl.s:876), but the COUNT is tuned by EXPERIMENT: 5,
// NOT the ROM literal 3. With 5 the first wave snaps as the oscillation crosses
// back through ~0 (formation at its undrifted base) — the "centered" look that
// matches the original; the literal 3 snaps it at oscillateX ~+11 (drifted
// right) in our port, because our fly-in / launcher timing isn't quite frame-
// identical to the ROM's and the snap phase is sensitive to the whole chain.

export function update(state) {
    // On state transition, apply the per-state task config + any per-state
    // setup (wave table build, timers, etc.).
    if (state.gameState !== _lastState) {
        applyStateTasks(state);

        if (state.gameState === 'stageStart') {
            stgInitEnv(state);
            state.gameTimers[3] = 5;   // c_tdelay_3 mechanism; count=5 tuned by experiment (ROM literal=3) — see above
        } else if (state.gameState === 'stageClear') {
            // Arm the "STAGE n" splash pause. The stage number is already correct
            // here: a new game enters from 'attract' with state.stage = 1; a stage
            // clear bumped it in the 'playing' case (Z80 stg_init_splash _b_stgctr++).
            // On timeout we hand off to 'stageStart' (re-runs stgInitEnv for
            // state.stage → re-arms the formation + its fly-in).
            state.stageClearTimer = STAGE_SPLASH_FRAMES;
        }

        _lastState = state.gameState;
    }

    // General respawn (G12): bring a lost ship back during gameplay.
    if (state.gameState === 'playing' || state.gameState === 'stageStart') {
        handleRespawn(state);
    }

    // Per-state per-tick logic.
    switch (state.gameState) {
        case 'attract':
            // Wait for Space (rising edge) to start the game. Browser has no coin
            // slot — we collapse Z80's READY state into the start trigger. Route
            // through 'stageClear' so a new game opens with the "STAGE 1" splash
            // (faithful: stg_init_splash shows "STAGE n" at game start too), then
            // fly-in. state.stage is already 1 here → no increment on game start.
            if (state.input.fireEdge) {
                state.gameState = 'stageClear';
            }
            break;

        case 'stageStart':
            // c_tdelay_3 done (gameTimers[3] ticked to 0) → arm the launcher.
            // Before this, launchAttackWave is "enabled" via state.tasks but
            // gates on atkWvEnbl (mirrors Z80 f_2916 line 1672-1675); the
            // formation just oscillates from center during the wait.
            if (!state.atkWvEnbl && state.gameTimers[3] === 0) {
                state.atkWvEnbl = true;
            }

            // Wait for fly-in to complete (signalled by launchAttackWave
            // when its wave-stream cursor hits 0x7F). Once done, hand off
            // to 'playing' which enables continuous attack mode.
            if (state.waveLauncherFlyInDone) {
                state.gameState = 'playing';
            }
            break;

        case 'playing':
            // Stage-clear detection (Z80 gctl_supv_stage, game_ctrl.s:1306-1317):
            // the round is cleared once no enemies remain on screen. We reach
            // 'playing' only after fly-in completes, so the wave launcher is
            // already done (the Z80 `!f_2916` half is implicit). A capture in
            // progress (or a captured slave still in play) means the boss is
            // still alive, so activeEnemyCount covers it — but guard explicitly.
            if (activeEnemyCount(state) === 0 &&
                !state.capturedSlave && !state.captureActive) {
                state.stage   = (state.stage + 1) & 0xFF;   // advance (Z80 stg_init_splash _b_stgctr++)
                state.gameState = 'stageClear';
            }
            // INT-4 will add the death / game-over transition.
            break;

        case 'stageClear':
            // Hold the "STAGE n" splash, then advance. stage++ already happened
            // on entry; 'stageStart' re-runs stgInitEnv for the new stage.
            if (state.stageClearTimer > 0) {
                state.stageClearTimer -= 1;
            } else {
                state.gameState = 'stageStart';
            }
            break;

        // Other states (declared in STATE_TASKS but not yet transitioned to)
        // get wired in later INT phases.
    }
}

// ── "STAGE n" splash (Z80 stg_init_splash, task_man.s:204-211) ─────────────
// ASCII → char tile code, the c_string_out formula (gg1-2.s:1208-1217):
//   code = ascii − 0x30 ; −7 if ≥ 0x11 ; space → 0x24.
// Digits '0'-'9' → 0x00-0x09, 'A'-'Z' → 0x0A-0x23. (Mirrors fighterCaptured.js's
// charCode; kept local so the two text tasks stay independent.)
function charCode(ch) {
    if (ch === ' ') return 0x24;
    let a = ch.charCodeAt(0) - 0x30;
    if (a >= 0x11) a -= 7;
    return a;
}
const SPLASH_PAL = 3;   // char palette (matches the FIGHTER CAPTURED text)

// Both splashes occupy the Z80's READY / STAGE slot — string position _dea 16 10
// (gg1-2.s:1272 GAME OVER, 1278 READY, 1295 STAGE): tile 0x8270 = playfield row
// R=16, col C=10. Tile→canvas (mrw.s:63-79 layout): x = C*8 = 80, y = (R+2)*8 =
// 144 (the +2 skips the two top rows). Was a hardcoded CENTERED y=128 — 2 tile
// rows too high and a column off — corrected in the X+Y coordinate-system audit.
const SPLASH_X = 80;
const SPLASH_Y = 144;

function drawSplash(ctx, text) {
    const codes = [...text].map(charCode);
    for (let i = 0; i < codes.length; i++) {
        ctx.drawImage(charCanvas(codes[i], SPLASH_PAL), SPLASH_X + i * 8, SPLASH_Y);
    }
}

export function render(state) {
    const ctx = state.ctx;

    // "STAGE n" splash — new stage / game start (Z80 stg_init_splash). On a new
    // stage the Z80 shows "STAGE n" in this same center slot and SKIPS "READY"
    // (c_player_respawn's 0x8270 check, gg1-2.s:1013-1017) — so the stage-begin
    // case needs no "READY"; this branch is it.
    if (state.gameState === 'stageClear') {
        drawSplash(ctx, 'STAGE ' + state.stage);
        return;
    }

    // "READY" splash — Z80 c_player_respawn (gg1-2.s:1019): shown MID-STAGE during
    // the respawn wait after the ship is destroyed, before the new ship is live.
    // Our wait is player.respawnTimer counting down while the ship is gone.
    const p = state.player;
    if (state.gameState === 'playing' && !p.alive && p.respawnTimer > 0) {
        drawSplash(ctx, 'READY');
    }
}
