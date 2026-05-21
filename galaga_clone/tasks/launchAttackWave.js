// f_2916 + f_1B65 — wave launcher (fly-in) + bomber attack manager.
//
// Two phases run sequentially after page load:
//
//   Phase 1 (fly-in)  — runs once. Walks state.waveTable pull-based, same
//                       as step 7 phase 3c. When done, transitions to phase 2.
//   Phase 2 (attack)  — continuous. Mirrors Z80 f_1B65 (gg1-2_fx.s:857):
//                       per-type timers decide when wasp / butterfly / boss
//                       breaks formation to dive at the player.
//
// Z80 reference for phase 2: see architecture.html §5b "ATTACK-DIVE
// LAUNCHER" research block. Several inputs are FAKED here (see TODO list
// below) — replace during the integration phase when stage data + game
// state machine exist.
//
// Step 9 phase INT-2a: state.waveTable is now built by gameController on
// transition to 'playing' (via paths.js buildWaveTable(state.stage)).
// INT-2a's builder returns the same 3-pair test wave for any stage; INT-2b
// will add real per-stage variation from d_combat_stg_dat.

import { launchEnemy, launchEnemyAttack } from './bugMotion.js';
import { ATTACK_PATH_YELLOW, ATTACK_PATH_RED } from '../paths.js';

// ── Phase 2: continuous attack mode (f_1B65 stand-in) ────────────────
// PHASE 8f FAKES — replace during integration:
//   TODO (1): gate flags (glbl_enemy_enbl, fire-button, captured-boss)
//             hardcoded "always-on". Z80 skips f_1B65 in demo mode etc.
//   TODO (2): per-type reload values are constants. Z80 reads them from
//             ds_new_stage_parms[1..3] (per-stage difficulty scaling).
//   TODO (3): MAX_BOMBERS cap is constant. Z80 reads ds_new_stage_parms[4].
//   TODO (4): boss attacks use the yellow path solo. Z80 has 3-pass
//             wingman-escort selection (capture squad). Step 9 territory
//             when integrated with tractor-beam.
//   TODO (5): module-scoped cursor/timers — should live on state.* so
//             stage transitions reset cleanly.

const ATTACK_RATE_GATE     = 16;     // Z80: frame counter 0x0F mask, ~3.75 Hz max
const ATTACK_RELOAD_YELLOW = 180;    // ~3 s between yellow launches
const ATTACK_RELOAD_RED    = 240;    // ~4 s between red launches
const ATTACK_RELOAD_BOSS   = 360;    // ~6 s between boss launches
const MAX_BOMBERS          = 4;      // active-diver cap

// Z80 b_8800 ID ranges per type:
//   Yellow (capture-capable bee — wasp rows 4-5 in our table): 0x08–0x2E
//   Red    (free-flight bomber moth — butterfly rows 2-3):     0x40–0x5E
//   Boss:                                                      0x00–0x06 + 0x30–0x36
const BOSS_IDS = [0x00, 0x02, 0x04, 0x06, 0x30, 0x32, 0x34, 0x36];

// ── State reset (step 9 phase INT-3b) ─────────────────────────────────
// Called by gameController on transition into 'stageStart' so cursors and
// timers are fresh per stage. (Previously these were module-scope vars; INT-3b
// moved them into state.* so per-stage resets work cleanly for INT-5 cycling.)
export function resetWaveState(state) {
    state.flyInCursor           = 0;
    state.flyInCooldown         = 0;
    state.waveLauncherFlyInDone = false;
    state.attackTimers.yellow   = ATTACK_RELOAD_YELLOW;
    state.attackTimers.red      = ATTACK_RELOAD_RED;
    state.attackTimers.boss     = ATTACK_RELOAD_BOSS;
}

// ── Per-tick dispatch ────────────────────────────────────────────────
export function update(state) {
    if (!state.waveLauncherFlyInDone) {
        runFlyInWave(state);
        return;
    }
    runAttackMode(state);
}

function runFlyInWave(state) {
    if (state.flyInCursor >= state.waveTable.length) {
        state.waveLauncherFlyInDone = true;   // signal to gameController
        return;
    }
    if (countFlying(state) > 0) { state.flyInCooldown = 30; return; }
    if (state.flyInCooldown > 0) { state.flyInCooldown -= 1; return; }

    const entry = state.waveTable[state.flyInCursor];
    launchEnemy(state, entry.id1, entry.path1);
    launchEnemy(state, entry.id2, entry.path2);
    state.flyInCursor += 1;
}

function runAttackMode(state) {
    // Decrement timers every tick (Z80 decrements per-vblank).
    for (const type of ['yellow', 'red', 'boss']) {
        if (state.attackTimers[type] > 0) state.attackTimers[type] -= 1;
    }

    // Rate gate: only attempt dispatch every 16 frames.
    if ((state.frameCount & (ATTACK_RATE_GATE - 1)) !== 0) return;

    // Active-diver cap (Z80 b_bugs_flying_nbr >= max_bombers).
    if (countFlying(state) >= MAX_BOMBERS) return;

    // Dispatch first type whose timer is ready (Z80 djnz over 3 timers).
    for (const type of ['yellow', 'red', 'boss']) {
        if (state.attackTimers[type] > 0) continue;
        if (tryLaunchAttack(state, type)) {
            state.attackTimers[type] = reloadFor(type);
        } else {
            state.attackTimers[type] = ATTACK_RATE_GATE;   // retry next gate
        }
        return;     // one launch per gate (Z80 returns after one fire)
    }
}

function reloadFor(type) {
    if (type === 'yellow') return ATTACK_RELOAD_YELLOW;
    if (type === 'red')    return ATTACK_RELOAD_RED;
    return ATTACK_RELOAD_BOSS;
}

function tryLaunchAttack(state, type) {
    let pathBytes, candidate;

    if (type === 'boss') {
        // Boss IDs are two ranges — scan the explicit list.
        pathBytes = ATTACK_PATH_YELLOW;     // capture-capable path
        candidate = state.enemies.find(e =>
            BOSS_IDS.includes(e.objectId) &&
            e.state === 'formation' && e.alive
        );
    } else {
        const [idMin, idMax] = (type === 'yellow') ? [0x08, 0x2E] : [0x40, 0x5E];
        pathBytes = (type === 'yellow') ? ATTACK_PATH_YELLOW : ATTACK_PATH_RED;
        // Z80 picks first STAND_BY in slot order — first-found = first
        // available in formation order.
        candidate = state.enemies.find(e =>
            e.objectId >= idMin && e.objectId <= idMax &&
            e.state === 'formation' && e.alive
        );
    }

    if (!candidate) return false;
    return !!launchEnemyAttack(state, candidate.objectId, pathBytes);
}

function countFlying(state) {
    let n = 0;
    for (const e of state.enemies) {
        if (e.state === 'flying') n += 1;
    }
    return n;
}
