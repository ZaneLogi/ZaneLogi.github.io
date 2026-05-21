// f_0857 — bomber-config recomputer (port of game_ctrl.s:1386-1438).
//
// Runs every frame in 'playing' state. Three responsibilities:
//   1. Ramp up MAX_BOMBERS once gameTimers[2] drops below a threshold.
//      (Z80 lines 1387-1393: copies newStageParms[5] → newStageParms[4]
//      after ds4_game_tmrs[2] >= 0x3C — i.e., once 30 sec elapsed.)
//   2. Recompute the bomb-drop enable flags from newStageParms[0] + bug
//      count via c_08BE (line 1402).
//   3. Recompute per-type reload values for boss/red/yellow attacks. Two
//      branches:
//        - cont_bmb_flag set → memset reloads to 2 (rapid-fire, lines
//          1411-1418).
//        - cont_bmb_flag clear → look up each via the per-stage data
//          tables (lines 1421-1438).
//
// All three reload values are dynamic — they change every frame as bug
// count drops and stage time elapses, making attacks gradually faster.
// This is what gives Galaga its "the longer you live, the harder it
// gets" feel.
//
// Why a separate task: f_0857 is in the Z80 task table (gg1-2.s:718) as
// a continuously-running cooperative task — exactly the JS port pattern.
// Recomputing reloads inside runAttackMode would conflate the dispatcher
// with the config logic; keeping them split mirrors the Z80.

import {
    c_08AD,
    c_08BE,
    D_08CD_RED_RELOAD,
    D_08EB_YELLOW_RELOAD,
    D_0909_0929_BOMB_BOSS,
} from '../paths.js';

// d_0929 starts at offset 0x20 (8 rows × 4 bytes) into the combined
// d_0909+d_0929 array. See paths.js comment.
const D_0929_BOSS_RELOAD_OFFSET = 0x20;

// The MAX_BOMBERS ramp-up gate. Z80 compares ds4_game_tmrs[2] >= 0x3C,
// which (since timer counts DOWN from 0x78) means the upper-half time
// has elapsed: roughly 30 sec into a 60-sec stage. After that, the
// game permits MAX_BOMBERS to bump from newStageParms[4] to [5].
const RAMP_UP_TMR_THRESHOLD = 0x3C;

// Number of in-screen bugs (Z80 b_bugs_actv_nbr). Counted from
// state.enemies — matches the alive-on-screen formula used by
// launchAttackWave for cont_bmb_flag.
function countBugsActv(state) {
    let n = 0;
    for (const e of state.enemies) {
        if (e.alive && e.state !== 'pending' && e.state !== 'dead') n += 1;
    }
    return n;
}

export function update(state) {
    // Z80 lines 1387-1393: max_bombers ramp-up.
    // The Z80 condition `cp #0x3C; jr nc, l_0865` skips the ramp when
    // tmr >= 0x3C (early stage). Once tmr < 0x3C (later half), the
    // ramp value newStageParms[5] takes effect.
    if (state.gameTimers[2] < RAMP_UP_TMR_THRESHOLD) {
        state.newStageParms[4] = state.newStageParms[5];
    }

    // Z80 lines 1396-1402: bomb-drop enable flags. Always recomputed.
    const bugs = countBugsActv(state);
    state.bombDropFlags = c_08BE(
        D_0909_0929_BOMB_BOSS,
        0,                          // base offset (d_0909 starts at 0)
        state.newStageParms[0],
        bugs,
    );

    // Z80 lines 1404-1418: cont_bmb branch.
    if (state.contBmbFlag) {
        // Continuous-bombing mode: rapid-fire reloads (= 2 ticks each).
        state.attackReloads.boss   = 2;
        state.attackReloads.red    = 2;
        state.attackReloads.yellow = 2;
        // Z80 also kills the free-fly pulsing sound; we don't have audio yet.
        return;
    }

    // Z80 lines 1421-1438: per-type reload lookups.
    state.attackReloads.boss = c_08BE(
        D_0909_0929_BOMB_BOSS,
        D_0929_BOSS_RELOAD_OFFSET,
        state.newStageParms[1],
        bugs,
    );
    state.attackReloads.red = c_08AD(
        D_08CD_RED_RELOAD,
        state.newStageParms[2],
        state.gameTimers[2],
    );
    state.attackReloads.yellow = c_08AD(
        D_08EB_YELLOW_RELOAD,
        state.newStageParms[3],
        state.gameTimers[2],
    );
}
