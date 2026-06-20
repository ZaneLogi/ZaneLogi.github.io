// f_2222 — boss tractor beam.
//
// Enabled by captorDive (f_21CB) once the capture boss is halted in position.
// Animates the beam for its duration, then ends. Mirrors f_2222 (gg1-3.s:458).
//
// SUB-STEP STATUS:
//   4a (this) — beam LIFECYCLE only: grow/animate the beam over its phases,
//               then end. No graphics yet.
//   4b        — render the beam cone with the decoded char tiles (0x17-0x1A).
//   4c/4d     — the ship-capture half plugs into the STUB SEAM below.
//
// The beam state lives on state.beam = { x, topY, phase, timer } (null = none).

import { charCanvas } from '../gfx/resource.js';
import { BEAM_CONE } from '../paths.js';

const BEAM_PHASES = 0x0B;  // Z80 captr_status[1] low nibble grows 0..0x0B
// Per-phase frame count is NOT a constant — it comes from new_stage_parms[6]
// (the Z80 _b_captr_flag), so the beam grows faster on harder stages (12
// frames/phase on stage 1, dropping to 3 by the late stages). See update().

// The cone is the d_23A1 arrangement of tiles 0x4E-0x7F (paths.js BEAM_CONE),
// blank = 0x24. The cone's PALETTE is cycled every 15 Hz to shimmer (see render).
const BEAM_BLANK = 0x24;

// Grab window: at full extent the Z80 (l_231C, gg1-3.s:632-634) sets
// captr_status+2 = 0x40 — a HARDCODED 64-frame hold (NOT a strip-time, NOT from
// captr_flag). The ship-in-beam test runs every one of those frames; capture
// can ONLY happen here. Same on every stage (only the grow/shrink per-strip
// speed scales with captr_flag).
const GRAB_WINDOW = 0x40;

// f_2222 beam lifecycle, faithful to the Z80 captr_status+1/+2 machine. Three
// modes via beam.mode: 'grow' → 'grab' → 'shrink'. The per-strip timer (beam.timer
// ⇔ captr_status+2) reloads from new_stage_parms[6] (captr_flag) for grow AND
// shrink (Z80 l_226A); the grab window uses the fixed 0x40 instead.
export function update(state) {
    const beam = state.beam;
    if (!beam) { state.tasks.tractorBeam = false; return; }

    // While the pull (f_20F2) runs, f_2222 keeps the beam drawn but does NOT
    // advance it — it holds at full extent until connect (gg1-3.s:583-630).
    if (state.capture.pullGate) return;

    // ── GRAB window (Z80 +1 = 0x40, +2 = 0x40) ───────────────────────────
    // The cone is fully extended; the ship-in-beam test (l_233D) runs each of
    // the 0x40 frames — capture happens ONLY here, never during grow/shrink.
    if (beam.mode === 'grab') {
        if (state.player.alive && !state.player.controlLocked && shipInBeam(state, beam)) {
            startCapture(state);
            return;
        }
        if (--beam.timer > 0) return;
        // Grab window elapsed with no capture → retract.
        beam.mode  = 'shrink';
        beam.timer = state.newStageParms[6];
        return;
    }

    // ── GROW / SHRINK share the per-strip timer (Z80 l_226A reloads +2 from
    //    captr_flag = new_stage_parms[6] for every strip) ──────────────────
    if (--beam.timer > 0) return;            // Z80 `dec (hl); jp nz`
    beam.timer = state.newStageParms[6];

    if (beam.mode === 'grow') {
        // Add one cone strip (Z80 captr_status+1 nibble 0→0x0B).
        beam.phase += 1;
        if (beam.phase < BEAM_PHASES) return;
        // Fully grown → enter the 0x40-frame grab window at full extent
        // (Z80 l_231C). Capture is tested there, not during the grow.
        beam.mode  = 'grab';
        beam.timer = GRAB_WINDOW;
        return;
    }

    // SHRINK one strip. The Z80 does NOT pop the beam off: at full extent
    // (bit 6 set) it writes blank tiles bottom-to-top over the next 0x0B strips
    // (l_22C1/l_22C5/l_22CC, gg1-3.s:567-581). Reducing beam.phase drops the
    // LOWEST cone strip first (render draws e=0..phase-1, top→bottom), so the
    // cone withdraws UPWARD toward the boss — same erase order. At phase 0,
    // close the beam + release the boss (Z80 l_22AB → l_22E3, gg1-3.s:560-613).
    beam.phase -= 1;
    if (beam.phase > 0) return;
    endBeamNoCapture(state);
}

// Draw the tractor beam below the halted boss. The Z80 f_2222 has two parts:
// the cone SHAPE is tiles 0x4E-0x7F written to TILE RAM (c_238A → 0x80xx) as the
// beam grows, and the SHIMMER is the cone's COLOUR RAM (→ 0x84xx) rewritten every
// 15 Hz with a palette index cycling 0x18→0x18→0x19→0x1A (f_2222:476-483). Those
// three char palettes hold the same cyan/blue/lavender triad rotated across
// slots 1-3, so cycling them flows the colours down the cone — that IS the
// shimmer. We blit the decoded cone tiles to canvas at the cycling palette, so
// the shimmer falls out of the palette choice (no separate fill tile needed).
export function render(state) {
    const beam = state.beam;
    if (!beam) return;
    const ctx = state.ctx;

    // Shimmer palette (Z80 f_2222:476-483): a = (frame>>2)&3, bumped to 1 when 0,
    // palette = 0x17 + a → 0x18,0x18,0x19,0x1A. (frame>>2) ticks every 4 frames,
    // so the colour rotates at 15 Hz.
    let a = (state.frameCount >> 2) & 3;
    if (a === 0) a = 1;
    const palette = 0x17 + a;

    // Draw the d_23A1 cone: entry e is a 6-tile-wide strip at depth e below the
    // boss; the beam has grown to `phase` entries (narrow at the boss, widening
    // toward the ship). Each cell is a decoded char tile (0x4E-0x7F); 0x24 skip.
    const rows = Math.min(BEAM_CONE.length, beam.phase | 0);
    const left = (beam.x | 0) - (6 * 8) / 2;   // 6 tiles wide, centered on beam X
    const top  = (beam.topY | 0) + 8;          // just below the boss
    for (let e = 0; e < rows; e++) {
        const entry = BEAM_CONE[e];
        const y = top + e * 8;
        for (let k = 0; k < 6; k++) {
            if (entry[k] === BEAM_BLANK) continue;
            ctx.drawImage(charCanvas(entry[k], palette), left + k * 8, y);
        }
    }
}

// ── Ship-in-beam test (Z80 l_233D, gg1-3.s:651-694) ────────────────────────
// True when the beam cone has grown down to the ship's row AND the ship's X is
// within the beam half-width. The −16 hardware X offset cancels in the
// subtraction, so the Z80's |beamX − shipX| < 0x1B test is identical in canvas
// coords. The "beam reached the ship" gate stands in for the Z80
// captr_status+1 == 0x40 "full extent" flag (the cone bottoming out is exactly
// when it reaches the ship's Y).
const BEAM_HALF_WIDTH = 0x1B;   // 27 px — Z80 `add a,#0x1B / cp #0x36`
function shipInBeam(state, beam) {
    const p = state.player;
    const beamBottomY = (beam.topY | 0) + beam.phase * 8;
    if (beamBottomY < p.y - 8) return false;          // cone hasn't reached the ship yet
    return Math.abs((beam.x | 0) - p.x) < BEAM_HALF_WIDTH;
}

// ── Begin capture (Z80 l_236D, gg1-3.s:682-694) ────────────────────────────
// Disable player control, arm the pull gate, and enable f_20F2 (pullShip). The
// beam stays drawn (held above) until the pull connects.
function startCapture(state) {
    state.player.controlLocked = true;   // Z80: task_actv[0x14] = 0 (no input)
    state.capture.pullGate      = 1;     // Z80: captr_status+3 = 1
    state.tasks.pullShip        = true;  // Z80: task_actv[0x1C] = 1 (f_20F2 on)
}

function endBeamNoCapture(state) {
    state.beam = null;
    state.tasks.tractorBeam = false;
    const boss = state.enemies.find(e => e.objectId === state.captureBossId);
    if (boss) {
        boss.captureHalted = false;   // un-freeze → path resumes (retreat)
        boss.captureDiving = false;
        // Force the halted stall segment (00 FC FF, dur 0xFF) to expire NOW so
        // the boss advances straight to its retreat tokens (23 00 30 / F8 / F9 /
        // FA) instead of sitting out the stall's ~255-frame leftover. Z80 l_22E3
        // sets bug_motion_que[cboss_slot].b0D = 1 (gg1-3.s:607-612) for exactly
        // this — bugMotion decrements segTimer 1→0 next tick → loadSegment.
        boss.segTimer = 1;
    }
    state.captureActive = false;      // Z80: cflag = 0
    state.captureBossId = null;
}
