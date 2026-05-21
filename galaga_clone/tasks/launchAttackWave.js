// f_2916 — pull from runtime wave table, launch enemy pairs.
//
// Z80 model (gg1-3.s:1658): c_25A2 builds the per-stage wave table at
// ds_8920 once at stage start; f_2916 then walks it pair-by-pair,
// pull-based — only advancing when b_bugs_flying_nbr reaches 0 (every
// previously-launched enemy has reached HOME) plus a 2-frame gap via
// ds4_game_tmrs[0]. When the final-wave token (0x7F) is reached, f_2916
// disables itself in the task table.
//
// Phase 3c implements the cursor + pull-based timing only — wave table
// is hardcoded inline. Real stage data + the c_25A2 builder come in
// phase 3d (or step 7 phase 4 if it grows).
//
// The "pair" is two enemies launched on the same tick with different
// IDs and (in the original) variant-mirrored paths. For phase 3c we
// only have 3 ported paths so each pair member uses the same path
// index — the proper variant pairing is a follow-up tweak.

import { launchEnemy } from './bugMotion.js';

// ── Hardcoded test wave (phase 3c, pair-mirroring updated in 3d-A) ────
// Each entry = one pair = two simultaneously-launched enemies.
// Object IDs from getObjectIdForSlot — see paths.js SPRT_FMTN_HPOS:
//   slot (row 0, col 3) → ID 0x00 (boss)
//   slot (row 0, col 6) → ID 0x02 (boss)
//   slot (row 0, col 4) → ID 0x04 (boss)
//   slot (row 0, col 5) → ID 0x06 (boss)
//   slot (row 2, col 0) → ID 0x38 (butterfly corner)
//   slot (row 2, col 9) → ID 0x3A (butterfly corner)
//
// Pair 1 demonstrates real Galaga variant-mirroring: PATH_INDEX entries
// 10 and 22 both reference path 0x022B but with variants 4 and 5 — same
// bytecode, start positions 32 px apart (canvas X=34 vs 66). Pairs 2 and
// 3 remain single-variant (both members on the same PATH_INDEX entry,
// so they overlap visually) — left as A/B contrast against pair 1.
const TEST_WAVE = [
    { id1: 0x00, path1: 10, id2: 0x02, path2: 22 },   // ★ real pair: 0x022B var 4/5
    { id1: 0x04, path1: 0,  id2: 0x06, path2: 0  },   // ★ token-bearing: 0x001D (FB → snap home ~1.4 s)
    { id1: 0x38, path1: 6,  id2: 0x3A, path2: 6  },   // single-variant: 0x01E8 (long ~6 s tail)
];

// ── Cursor state (module-scoped for phase 3c) ─────────────────────────
// Z80 keeps cursor + counter in ds_plyr_actv. We'll move to state.* in
// phase 3d when stage data drives multiple waves and the cursor needs
// to reset per stage.
let _cursor    = 0;     // index of next pair to launch
let _cooldown  = 0;     // frames to wait after current pair lands

export function update(state) {
    if (_cursor >= TEST_WAVE.length) return;       // wave complete

    // Pull-based: don't advance while any enemy is mid-flight.
    if (countFlying(state) > 0) {
        _cooldown = 30;                            // refresh post-land delay
        return;
    }
    if (_cooldown > 0) {
        _cooldown -= 1;
        return;
    }

    // Launch the next pair.
    const pair = TEST_WAVE[_cursor];
    launchEnemy(state, pair.id1, pair.path1);
    launchEnemy(state, pair.id2, pair.path2);
    _cursor += 1;
}

function countFlying(state) {
    let n = 0;
    for (const e of state.enemies) {
        if (e.state === 'flying') n += 1;
    }
    return n;
}
