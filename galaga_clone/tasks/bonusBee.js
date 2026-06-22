// tasks/bonusBee.js
// f_1A80 — the "clone-attack" / BONUS-BEE manager (gg1-2_fx.s:671-833).
//
// Stage-4+ feature: once few bugs remain, pluck a RESTING bee, FLASH it for ~1 s,
// then repaint it to the 0x5x sprite and launch it as a diver.
//
// Three phases, driven by state.bonusBee.tmr:
//   A. arm   (tmr==0)        — find a resting bee; tmr=0xC0; pick the stage color.
//   B. flash (tmr 0xC0→0xFF) — alternate the bee's palette every 16 frames.
//   C. launch(tmr wraps→0)   — repaint to 0x5x + dive; disable self (one per stage).
//
// Launches on the real per-color convoy path (db_04EA/0473/04AB via getConvoyPath);
// the path's 0xF2 tokens split off the 2-clone X3 convoy (BB-5). The leader returns
// home; the clones dive at the player and despawn. research_bonus_bee.md §3/§6.
//
// Self-disables after one launch (Z80 clears task_actv[0x04], gg1-2_fx.s:831);
// re-enabled each stage by applyStateTasks('playing'). One bonus-bee per stage.

import { recolorCreature } from '../gfx/resource.js';
import { getConvoyPath } from '../paths.js';
import { launchEnemyAttack } from './bugMotion.js';

// Object-ID scan ranges (gg1-2_fx.s:695 / 705): bee group first, moth fallback.
const BEE_LO = 0x08, BEE_HI = 0x2E;     // 20 wasps (yellow)
const MOTH_LO = 0x40, MOTH_HI = 0x5E;   // 16 butterflies (red moths)

// b_bugs_actv_nbr (gg1-2_fx.s:686) — active on-screen bugs.
function activeBugCount(state) {
    let n = 0;
    for (const e of state.enemies)
        if (e.alive && e.state !== 'dead' && e.state !== 'pending') n += 1;
    return n;
}

// First resting (formation) bee in [lo,hi] by objectId order (the Z80 cpi scan
// for disposition == 1 "resting").
function findRestingBee(state, lo, hi) {
    for (let id = lo; id <= hi; id += 2) {
        const e = state.enemies.find(en => en.objectId === id);
        if (e && e.alive && e.state === 'formation') return e;
    }
    return null;
}

function disable(state) {
    const bb = state.bonusBee;
    bb.obj = null; bb.tmr = 0; bb.flashFrames = null; bb.flashOn = false; bb.colorIndex = null;
    state.tasks.bonusBee = false;   // one per stage; re-armed by applyStateTasks('playing')
}

export function update(state) {
    const bb = state.bonusBee;

    // ── Gate (gg1-2_fx.s:682-688): only when active bugs < newStageParms[0x0A].
    // [0x0A] is 0 on stages 1-3 + challenge → count >= 0 always → never arms.
    if (activeBugCount(state) >= state.newStageParms[10]) return;

    // ── Phase A — arm: find a resting bee (gg1-2_fx.s:690-740) ──
    if (bb.tmr === 0) {
        const bee = findRestingBee(state, BEE_LO, BEE_HI) ||
                    findRestingBee(state, MOTH_LO, MOTH_HI);
        if (!bee) return;
        bb.obj         = bee.objectId;
        bb.tmr         = 0xC0;                          // launch delay (counts up to wrap)
        bb.clrA        = bee.type;                      // original color = the bee's normal group
        bb.clrB        = ((state.stage >> 2) % 3) + 4;  // stage color 4/5/6 (gg1-2_fx.s:725-732)
        bb.colorIndex  = bb.clrB - 4;                   // 0/1/2 → sprites.bonusBee[idx]
        bb.flashFrames = recolorCreature(bee.type, bb.clrB);  // clrB-recolored shape for the flash
        bb.flashOn     = false;
        return;
    }

    // ── tmr counts up (0xC0 → 0xFF); wrapping to 0 fires the launch ──
    const next = (bb.tmr + 1) & 0xFF;
    if (next === 0) {
        // Phase C — launch (gg1-2_fx.s:767-833). Only when the fire task is active
        // (a bonus-bee "has started"); else wait, re-counting from 0xE0.
        if (!state.tasks.playerFire) { bb.tmr = 0xE0; return; }
        const bee = state.enemies.find(en => en.objectId === bb.obj);
        if (!bee || !bee.alive || bee.state !== 'formation') { disable(state); return; }
        bee.bbeeColorIndex = bb.colorIndex;             // repaint to the 0x5x sprite (objectStates)
        // Launch on the real per-color convoy path; its 0xF2 tokens split off the
        // 2 clones mid-dive (bugMotion spawnClone). research_bonus_bee.md §6.
        const path = getConvoyPath(bb.colorIndex);
        launchEnemyAttack(state, bee.objectId, path.bytes, undefined, path.entryOffset);
        disable(state);
        return;
    }
    bb.tmr = next;

    // ── Phase B — flash (gg1-2_fx.s:742-765) ──
    // Bail if the bee was killed before it could launch.
    const bee = state.enemies.find(en => en.objectId === bb.obj);
    if (!bee || !bee.alive || bee.state !== 'formation') { disable(state); return; }
    // Alternate color every 16 frames (Z80 bit 4 of the counter). objectStates draws
    // flashFrames (clrB) when flashOn, else the bee's normal sprite (clrA).
    bb.flashOn = (bb.tmr & 0x10) !== 0;
}
