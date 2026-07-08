// f_21CB — capture boss dives into position, then opens the tractor beam.
//
// Enabled by the F4 token (state.tasks.captorDive = true) when the capture boss
// begins its dive (gg1-2_fx.s capture path db_0454 → case_0A53:1760). Each frame
// it watches the diving capture boss; once it has descended into beam position
// it HALTS the boss, hands off to the tractor beam (f_2222), and disables
// itself — mirroring f_21CB (gg1-3.s:392-445).
//
// "In position" test (the key f_21CB cue): f_21CB waits while `0x0A(ix) != 0`
// — and 0x0A/0x0B are the segment's vx/vy (gg1-5.s:2150-2157). So it's waiting
// for the scripted dive to stop TRANSLATING the boss. The capture path
// (db_0454) ends its dive with the segment `0x00,0xfc,0xff` (vx=vy=0): the boss
// stops moving and just sits. THAT stall is the cue to open the beam where it
// stopped. So we halt when the capture boss's velocity has gone to zero.
//
// Once the dive stops, the Z80 SPINS the boss to face straight down before the
// beam: f_21CB sets 0x0C(ix)=±0x0C each frame (direction from bit 0 of the
// angle high byte) which the motion step (l_0C46, gg1-5.s:2080) adds to the
// heading, and waits until the heading is within 0x10 of DOWN (the gg1-3.s:420
// `(0x05:0x04)>>1 − 0x78 < 0x10` test). We reproduce that here: drive e.rotRate
// (bugMotion applies it) and gate the beam on the heading reaching down.

export function update(state) {
    // No active mission → make sure we're off (Z80 l_221A clears cflag too).
    if (!state.captureActive || state.captureBossId == null) {
        state.tasks.captorDive = false;
        state.captureBossId = null;   // tidy: drop the locator if the kill (l_07DF) cleared cflag mid-dive
        return;
    }

    const boss = state.enemies.find(e => e.objectId === state.captureBossId);

    // Z80 l_221A (gg1-3.s:392-399,441-445): f_21CB reads the capture boss's
    // disposition b_8800[cobj] each frame; if it isn't 0x09 ("in a diving
    // attack") the boss is gone — shot, or finished and went home — so abort the
    // mission and re-enable capture selection. A kill sets boss.alive=false but
    // LEAVES boss.state ('flying'); the state test alone misses it, so test alive.
    if (!boss || !boss.alive || (boss.state !== 'flying' && boss.state !== 'homing')) {
        state.tasks.captorDive = false;
        state.captureActive = false;
        state.captureBossId = null;
        return;
    }

    // Still being set up / already halted — nothing to do.
    if (!boss.captureDiving || boss.captureHalted) return;

    // ── Gate 1 (Z80 f_21CB:409-411): while `0x0A(ix)` (segment vx) != 0 the
    // dive is still translating — wait. The capture path's stall segment
    // (0x00,0xfc,0xff) zeroes vx; that's the "dive stopped" cue. (Source tests
    // only 0x0A; the stall zeroes vy too, so motion has fully stopped.)
    if (boss.vx !== 0) return;

    // ── Gate 2 (Z80 f_21CB:413-426): the dive has stopped — now spin the boss
    // to face straight DOWN before opening the beam. Each frame set the rotation
    // step ±0x0C (bugMotion adds it to e.angle); direction = bit 0 of the angle
    // high byte (Z80 `bit 0,0x05(ix)`), which is the short way to down for a
    // down-pointing aim. Hold until the heading is within 0x10 of DOWN. vx/vy
    // stay 0 (stall segment), so the boss rotates in place without translating.
    const DOWN = 768;          // 10-bit canvas-down (= Z80 0x300 in the angle units)
    const SPIN_STEP = 0x0C;    // Z80 0x0C per-frame rotation step
    const SPIN_WINDOW = 0x10;  // Z80 cp #0x10 — within this of down = in position
    let dist = (boss.angle - DOWN) % 1024;
    if (dist < 0) dist += 1024;
    dist = Math.min(dist, 1024 - dist);            // shortest angular distance to DOWN
    if (dist > SPIN_WINDOW) {
        boss.rotRate = ((boss.angle >> 8) & 1) ? -SPIN_STEP : SPIN_STEP;
        return;                                    // keep spinning
    }

    // ── In position (gg1-3.s:428-440) ──────────────────────────────────
    // Heading is down: stop the spin, halt the boss, and open the beam below it.
    boss.rotRate = 0;          // Z80: 0x0C(ix) = 0 (stop spinning)
    boss.captureHalted = true;
    state.beam = {
        // Beam X = the aimed player-X (Z80 captr_status+0, stored by the F4
        // aim at case_0A53:1745), NOT the boss's drifted X. The boss dives
        // toward this column, so they're close — but the beam (and the later
        // ship-in-beam test, l_233D) is anchored on the aim point, so use it.
        x:     (boss.captureTargetX ?? boss.x) | 0,
        topY:  boss.y | 0,    // beam emanates downward from the halted boss
        phase: 0,             // grows 0..BEAM_PHASES, then shrinks back to 0
        timer: 1,             // Z80 captr_status+2 init = 1 (f_21CB:438) → first
                              //   phase advances on frame 1, then parm[6]/phase
        mode:  'grow',        // 'grow' → 'grab' (0x40-frame full-extent capture
                              //   window) → 'shrink' (retract strip-by-strip).
                              //   See tractorBeam.update.
    };
    state.tasks.captorDive  = false;   // Z80: task 0x19 = 0 (f_21CB off)
    state.tasks.tractorBeam = true;    // Z80: task 0x18 = 1 (f_2222 on, beam starts)
}
