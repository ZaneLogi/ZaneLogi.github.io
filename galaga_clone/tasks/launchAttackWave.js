// f_2916 + f_1B65 — wave launcher (fly-in) + bomber attack manager.
//
// Two phases run sequentially, gated by state.atkWvEnbl:
//
//   Phase 1 (fly-in)  — runs once per stage. Walks state.waveStream
//                       byte-by-byte (the runtime token stream built by
//                       paths.buildWaveStream). Mirrors Z80 f_2916
//                       (gg1-3.s:1658) line-by-line. Sets
//                       state.waveLauncherFlyInDone when 0x7F is consumed.
//   Phase 2 (attack)  — continuous bomber dispatch. Port of Z80 f_1B65
//                       (gg1-2_fx.s:857) — see runAttackMode below for
//                       per-phase change history.
//
// Phase-1 logic is Z80-faithful (per research_stage_init.md).
// Phase-2 status (per research_attack_paths.md §9):
//   ✅ Phase A: MAX_BOMBERS from per-stage data (c_2C00 → newStageParms[4])
//   ✅ Phase B: initial timers from c_2C00 hardcoded constants + Z80
//              dispatcher iteration order [boss, red, yellow]
//   ✅ Phase C: 16-frame DEC cadence + reload values from f_0857 (see
//              tasks/bomberConfig.js)
//   ✅ Phase D: entry guards (playerFire-active gate)
//   ⚠ Phase F: boss_pool / capture squad bypass (gg1-2_fx.s:871-921)
//              — boss attacks currently use ATTACK_PATH_YELLOW solo
//              instead of the 3-bug escort/capture mission

import { launchEnemy, launchEnemyAttack } from './bugMotion.js';
import { ATTACK_PATH_YELLOW, ATTACK_PATH_RED, resolveWaveByte } from '../paths.js';

// ── Phase 2 constants ─────────────────────────────────────────────────
// Phase A INT-7: MAX_BOMBERS now sourced per-stage from
// state.newStageParms[4] (= ds_new_stage_parms[0x04] in Z80 terms).
// Phase B INT-7: initial timer values match Z80 c_2C00 hardcoded
// constants (set in resetWaveState below).
// Phase C INT-7: timer DEC cadence is now 16-frame-faithful (Z80
// f_1B65 dec's only when frame_cnt & 0x0F == 0); reload values come
// from state.attackReloads, recomputed every frame by bomberConfig.
const ATTACK_RATE_GATE = 16;     // Z80: frame counter 0x0F mask

// Z80 b_8800 ID ranges per type:
//   Yellow (capture-capable bee — wasp rows 4-5 in our table): 0x08–0x2E
//   Red    (free-flight bomber moth — butterfly rows 2-3):     0x40–0x5E
//   Boss:                                                      0x00–0x06 + 0x30–0x36
const BOSS_IDS = [0x00, 0x02, 0x04, 0x06, 0x30, 0x32, 0x34, 0x36];

// ── State reset ──────────────────────────────────────────────────────
// Called by gameController.stgInitEnv on transition into 'stageStart'.
// Phase-1 launcher state (waveStream, waveStreamCursor, atkWvEnbl,
// attkwvCtr, bugsFlying, waveLauncherFlyInDone) is reset by stgInitEnv
// itself; this helper only resets phase-2 timers.
//
// Phase B INT-7: initial timer values from Z80 c_2C00 (new_stage.s:100-103):
//   ld bc, #0x0216
//   ld (b_92C0+0x01), bc       ; b_92C0[1]=0x16, b_92C0[2]=0x02
//   ld (b_92C0+0x00), bc       ; b_92C0[0]=0x16, b_92C0[1]=0x02 (overwrite)
// Final state: b_92C0[0]=0x16 (boss), [1]=0x02 (red), [2]=0x02 (yellow).
//
// Per-type indexing verified via f_1B65 djnz loop + d_1BD1 case-table
// at gg1-2_fx.s:923-970:
//   - b_92C0[0] hits 0 → A=2 → case_bmbr_boss
//   - b_92C0[1] hits 0 → A=1 → case_bmbr_red
//   - b_92C0[2] hits 0 → A=0 → case_bmbr_yellow
//
// Z80 stores these as 16-frame ticks (since the dispatcher dec's only
// when frame_cnt & 0x0F == 0). Phase C wired the matching cadence so
// the values are now stored directly in 16-frame ticks (no × 16 scaling).
//
// IMPORTANT: these constants are the SAME for every stage and rank.
// They are NOT sourced from per-stage data. The per-stage parameters
// (newStageParms[1..3]) drive the *reload* lookup in f_0857 → c_08AD/
// c_08BE — see tasks/bomberConfig.js (Phase C INT-7).
export function resetWaveState(state) {
    state.attackTimers.boss   = 0x16;   // 22 ticks × 16 = 352 frames = 5.87 s
    state.attackTimers.red    = 0x02;   //  2 ticks × 16 =  32 frames = 0.53 s
    state.attackTimers.yellow = 0x02;   //  2 ticks × 16 =  32 frames = 0.53 s
}

// ── Per-tick dispatch ────────────────────────────────────────────────
export function update(state) {
    // Z80 f_2916 gate (gg1-3.s:1672-1675): bail early if the attack-wave
    // enable flag is clear. Set false during stage init by stgInitEnv,
    // flipped to true by gameController after a settle delay (mirrors
    // plyr_respawn_rdy hand-off at game_ctrl.s:876).
    if (!state.atkWvEnbl) return;

    // Z80 f_08D3 caches the count of flying enemies at start of frame
    // (gg1-5.s:1428-1432, "capture the (previous) count and zero the
    // current count"). f_2916's wave-start handler reads this to decide
    // whether to advance past 0x7E. We do the count here so phase-1
    // sees a fresh value each frame. (When bugMotion is rewritten, this
    // can move there to better mirror the Z80 task ordering.)
    //
    // 'homing' enemies are counted too — they're still in flight (post-FB
    // guided approach to formation) and the inter-wave gate must wait
    // for them to land before launching the next wave. Z80 b_8800
    // disposition byte = 9 ("homing/diving") during this state, which
    // f_08D3 counts the same as 3 ("flying") at gg1-5.s:1448-1456.
    //
    // Phase E INT-7: also count alive-on-screen for the continuous-bombing
    // flag (Z80 b_bugs_actv_nbr at gg1-5.s:483 — number used by the cont_bmb
    // gate at line 480-489). Anything that's been launched and not yet
    // killed counts (formation + flying + homing).
    let n = 0;
    let aliveOnScreen = 0;
    for (const e of state.enemies) {
        if (e.state === 'flying' || e.state === 'homing') n += 1;
        if (e.alive && e.state !== 'pending' && e.state !== 'dead') aliveOnScreen += 1;
    }
    state.bugsFlying = n;

    // Z80 b_92A0[0x0A] (gg1-5.s:489):
    //   cont_bmb_flag = (num_bugs < newStageParms[7]) AND fire-button-active
    // For stage 1 rank A, newStageParms[7] = 6 → fires when ≤5 enemies remain.
    // Read by bugMotion's FA LOOP_TOP handler (case_0BD1).
    state.contBmbFlag = (aliveOnScreen < state.newStageParms[7]) && state.tasks.playerFire;

    if (!state.waveLauncherFlyInDone) {
        runFlyInWave(state);
        return;
    }
    runAttackMode(state);
}

// ── Phase 1: fly-in byte-stream walker ───────────────────────────────
// Z80 f_2916 main loop, gg1-3.s:1658-1745. Reads the byte at the cursor
// and dispatches: 0x7F → end-of-stage, 0x7E → wave start, else →
// path-byte launch.
//
// Walks state.waveStream (built by paths.buildWaveStream). Pair members
// are just two consecutive (path_byte, object_id) pairs in the stream;
// pair structure is implicit in the byte order, not a separate field.
function runFlyInWave(state) {
    if (state.waveStreamCursor >= state.waveStream.length) {
        // Defensive: should not happen — 0x7F should terminate first.
        state.waveLauncherFlyInDone = true;
        return;
    }

    const b = state.waveStream[state.waveStreamCursor];

    // ── 0x7F: end-of-stage marker (gg1-3.s:1664-1665 → l_2A29) ───────
    if (b === 0x7F) {
        // l_2A29 (gg1-3.s:1897-1911) WAITS here for the last wave's bugs to
        // land before completing: "if (bugs_flying_nbr > 0) return". Only
        // when bugsFlying==0 (formation fully formed) does it disable f_2916,
        // enable f_1B65 (dives) + f_1A80, and set _b_nestlr_inh. We mirror
        // that — hold at the marker until the formation is complete, so dives
        // don't start mid-fly-in and the oscillate→breathe handoff can fire.
        if (state.bugsFlying > 0) return;
        state.waveLauncherFlyInDone = true;   // → gameController enters 'playing' (dives)
        state.formation.nestlrInh   = true;   // → oscillate coasts to center, hands off to f_1DE6
        return;
    }

    // ── 0x7E: wave-start marker (gg1-3.s:1668-1709, l_2944_attack_wave_start) ──
    if (b === 0x7E) {
        // Wait for the previous wave's enemies to fully land (the Z80
        // gate is "if bugs_flying_nbr != 0 → set game_tmrs[0] = 2 and
        // return"). game_tmrs[0] is decremented at 2 Hz by tickGameTimers,
        // so this also imposes a ~1-sec inter-wave pause once bugs land.
        if (state.bugsFlying > 0) {
            state.gameTimers[0] = 2;
            return;
        }
        if (state.gameTimers[0] > 0) return;

        // Both gates clear: advance past the marker and bump the wave
        // counter (mirrors gg1-3.s:1704-1709).
        state.waveStreamCursor += 1;
        state.attkwvCtr        += 1;
        return;
    }

    // ── Path byte: gate, decode, launch ──────────────────────────────
    // Z80 l_2953_next_pair (gg1-3.s:1718-1733):
    //   if (byte & 0x80) == 0 → wait for frame_cnt & 0x07 == 0
    // The gate applies per-byte, not per-pair. With the gate, consecutive
    // gated bytes fire 8 frames apart; an ungated byte (bit 7 set) fires
    // the very next frame after a gated one.
    if ((b & 0x80) === 0) {
        if ((state.frameCount & 0x07) !== 0) return;
    }

    // Read object ID (next byte in the stream) and decode the wave byte
    // into a complete launch info struct.
    const objectId = state.waveStream[state.waveStreamCursor + 1];
    const pathInfo = resolveWaveByte(b);

    if (!pathInfo) {
        // Defensive: byte refers to an unported path. Skip the pair so
        // we don't get stuck. Should never happen for stage 1.
        state.waveStreamCursor += 2;
        return;
    }

    const e = launchEnemy(state, objectId, pathInfo);
    if (e) {
        // Z80 l_29D1_finalize_object_setup (gg1-3.s:1824-1894):
        //   bit 6 of wave byte → 0x13(ix) bit 7  (negate-rotation flag,
        //                                         consumed when loading
        //                                         each segment's rotRate;
        //                                         see gg1-5.s:2014-2018)
        //   bit 0 of wave byte → 0x0E(ix)        (bomb-drop counter init,
        //                                         0x08 for "top entry"
        //                                         enemies, 0x44 for "sides")
        e.negateRotation = pathInfo.negateRotation;
        e.bombCounter    = pathInfo.bombCounterInit;
    }

    // Advance past path byte + object ID.
    state.waveStreamCursor += 2;
}

// ── Phase 2: continuous bomber dispatch (f_1B65 port) ────────────────
// Phase A INT-7: MAX_BOMBERS sourced from per-stage data (newStageParms[4]).
// Phase B INT-7: initial timers + iteration order match Z80 c_2C00 / d_1BD1.
// Phase C INT-7: timer DEC runs at 16-frame cadence (gate-first); reload
//                values read from state.attackReloads (recomputed every
//                frame by tasks/bomberConfig.js — port of f_0857).
// Phase C INT-7 (bugfix): single-loop early-exit dispatch matching the
//                Z80 djnz pattern at gg1-2_fx.s:927-953.
// Phase D INT-7: dispatcher entry guards (gg1-2_fx.s:858-869).
//
// Still TODO (research_attack_paths.md §9):
//   - boss_pool / capture squad bypass (Phase F / step 10)
function runAttackMode(state) {
    // Z80 f_1B65 entry guards (gg1-2_fx.s:858-869):
    //   if (glbl_enemy_enbl != 0):
    //     if (task_actv[0x15] == 0 || task_actv[0x1D] != 0) return
    // Mapping:
    //   - glbl_enemy_enbl: no port equivalent yet; treat as always-true.
    //   - task_actv[0x15] = state.tasks.playerFire (f_1F04).
    //   - task_actv[0x1D] = destroyed-capture-boss task (f_2000); doesn't
    //     exist in our port (Phase F territory), so always passes.
    // Simplified: require playerFire enabled before any attack dispatch.
    // Without this, dev-panel toggling playerFire off would still let
    // attackers dive, which doesn't match Z80.
    if (!state.tasks.playerFire) return;

    // Z80 f_1B65 runs only when frame_cnt & 0x0F == 0 (gg1-2_fx.s:923+).
    if ((state.frameCount & (ATTACK_RATE_GATE - 1)) !== 0) return;

    const maxBombers = state.newStageParms[4];

    // Z80 djnz loop at gg1-2_fx.s:927-931 — single pass over b_92C0[0..2]:
    //   dec (hl); if zero → fire/gate; else inc l; djnz
    // First non-zero timer to hit 0 (or first already-at-0) gets handled.
    // All later types are NOT dec'd this tick — they keep their values
    // across the gated-by-max-bombers period.
    for (const type of ['boss', 'red', 'yellow']) {
        if (state.attackTimers[type] > 0) state.attackTimers[type] -= 1;
        if (state.attackTimers[type] !== 0) continue;

        // This type's timer is at 0 — Z80 falls through to l_1BB4.
        // Z80 max-bombers gate (gg1-2_fx.s:935-945):
        //   if (bugs_flying_nbr >= max_bombers) inc(hl); ret
        // The inc brings the timer back to 1, so the SAME type is
        // re-checked next tick — boss/red/yellow positions don't get
        // permanently stuck at 0.
        if (state.bugsFlying >= maxBombers) {
            state.attackTimers[type] = 1;
            return;
        }

        // Z80 l_1BC0 (gg1-2_fx.s:947-953): timer reload from
        // b_92C0[n+4] happens BEFORE case_bmbr_* dispatch. Even if
        // case_bmbr_* finds no candidate, the timer is reloaded.
        state.attackTimers[type] = state.attackReloads[type];
        tryLaunchAttack(state, type);
        return;
    }
}

function tryLaunchAttack(state, type) {
    let pathBytes, candidate;

    if (type === 'boss') {
        pathBytes = ATTACK_PATH_YELLOW;
        candidate = state.enemies.find(e =>
            BOSS_IDS.includes(e.objectId) &&
            e.state === 'formation' && e.alive
        );
    } else {
        const [idMin, idMax] = (type === 'yellow') ? [0x08, 0x2E] : [0x40, 0x5E];
        pathBytes = (type === 'yellow') ? ATTACK_PATH_YELLOW : ATTACK_PATH_RED;
        candidate = state.enemies.find(e =>
            e.objectId >= idMin && e.objectId <= idMax &&
            e.state === 'formation' && e.alive
        );
    }

    if (!candidate) return false;
    return !!launchEnemyAttack(state, candidate.objectId, pathBytes);
}
