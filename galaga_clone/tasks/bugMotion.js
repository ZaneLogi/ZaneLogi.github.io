// CPU1 f_08D3 — per-tick path interpreter for flying enemies.
//
// The original arcade ran path interpretation on a second Z80 (CPU1) in
// parallel with CPU0's task scheduler. We're single-threaded so this task
// stands in for that work, slotted right after objectStates in TASK_TABLE.
//
// Per-tick sequence per enemy in 'flying' state (gg1-5.s:1422–2234):
//   1. Decrement segment timer
//   2. If timer hit 0, load next 3-byte segment from path bytecode
//      (or dispatch token if byte ≥ 0xEF)
//   3. Add rotation rate to angle (10-bit, 1024 / circle)
//   4. (sprite frame from angle — handled by objectStates render later)
//   5. Apply angle-based velocity to position — alternating X / Y per frame
//      (matches Z80 frame-parity trick at gg1-5.s:2150–2234, gives
//       effective ½-rate per axis)
//
// Position updates are ANGLE-BASED. The Z80 motion code at
// gg1-5.s:2150-2270 uses sin/cos of the current 10-bit angle to scale
// the per-axis velocity into a position delta. Per research_path_data.md
// §4 — verified against Z80 lines 2150-2270 — both axes update EVERY
// FRAME, with the velocity magnitude alternating between vx and vy by
// frame parity (gg1-5.s:2150-2157 chooses 0x0A or 0x0B based on
// `frame_cnt & 0x01`):
//
//     A = (frame_cnt & 1) ? vx : vy        // alternating magnitude
//     canvas_dx =  A × cos(angle)
//     canvas_dy = -A × sin(angle)          // negate: canvas Y inverted
//                                          //         from Z80 internal Y
//
// Why "both axes" rather than "one axis per frame": the Z80 piecewise
// trick (gg1-5.s:2179-2270) splits the update into a "primary" axis
// (the one closest to the angle direction, gets velocity directly) and
// a "secondary" axis (gets velocity × sin/cos of the within-quadrant
// angle). The two-step structure is a performance optimization — net
// effect is dx = A × cos(angle), dy = -A × sin(angle). Single-axis-
// per-frame (the previous JS implementation) gave roughly half the
// motion, which made all curves look "small".
//
// Z80 angle convention (gg1-5.s:2174-2178): 0° = right, 90° = canvas-up,
// 180° = left, 270° = canvas-down. 10-bit angle (0–1023 = 0–360°).
//
// Arithmetic policy — Z80 BEHAVIOR is faithful, ARITHMETIC is JS-native:
//   - Math.sin / Math.cos / Math.atan2 in place of Z80's fixed-point sin/cos
//     LUT (gg1-5.s:0E97 multiply + tables) and fixed-point atan2 (c_0E5B at
//     gg1-5.s:2543). The JS FPU has 52-bit mantissa precision vs. Z80's
//     8-bit fixed-point divide; mathematically equivalent for our purposes,
//     more precise in edge cases. This applies project-wide for trig.
//   - Bit-exact CONTRACTS still come from Z80: angle convention (0°=right,
//     90°=canvas-up etc.), pair-mirror negate-rotation flag, frame-parity
//     velocity alternation, segment timer dec, etc. Don't simplify these.
//
// Other trade-offs vs Z80:
//   - F7/F0 CALL (fly-in sub-path call/return) are still skipped. For
//     STAGE 1 this is correct (those tokens are gated and skip in stage 1
//     — see research_stage_init.md / research_path_data.md §2.2). For
//     stages 4+ fly-in paths, F7/F0 sub-call support is still needed.
//   - FD JUMP, FA LOOP_TOP — implemented for attack-dive paths in
//     Phase E (research_attack_paths.md). FD is unconditional; FA gates
//     on state.contBmbFlag (continuous-bombing mode). Translates the
//     embedded Z80 absolute address to a JS offset via path.z80Base.
//   - FB TURN_HOME — implemented as 'homing' state with guided flight
//     (matches Z80 case_0AA0). Earlier instant-snap was a JS shortcut.

// (No paths.js import — callers pass pre-resolved path info now.)

// Decode signed 8-bit byte (used for rotRate — segment byte 1).
function byteSigned(b) {
    return b > 127 ? b - 256 : b;
}

// Z80 internal-Y high byte → canvas Y. Local copy of paths.js rawYToCanvasY
// (CLAUDE.md "Coordinate system") kept here to preserve this module's
// no-paths.js-import boundary (see note above). Used by the FC dive-Y
// trigger to convert FC's raw screen-Y arg into our canvas space.
// −32 = galagino corner −40 + 8 (renderer draws centered) — see paths.js.
function rawYToCanvasY(rawY) {
    return ((~(rawY + 0x4F)) & 0xFF) * 2 + 1 - 32;
}

// (vx/vy nibbles in segment byte 0 are UNSIGNED magnitudes 0-15. The
// Z80 segment-load at gg1-5.s:1996-2011 stores them via `and 0x0F` —
// no sign extension. Direction comes from the angle, not from a sign
// bit on the magnitude.)

// Tokens that consume extra bytes after the opcode — must be skipped
// past so we don't mis-read the args as segment data. Defaults to 0
// (the token byte alone) for unlisted opcodes.
//
// Most attack/fly-in tokens now have dedicated cases above; the generic
// skip-path (this map) only still stubs the fly-in CALL tokens F7/F0.
// Entries below are documentation — for [H] tokens the dedicated case
// advances the pointer itself. Some annotations predate the handlers and
// were corrected when each was ported (e.g. F8 is 0-arg, F3 is an 8-byte
// LUT). [H] = has a dedicated handler.
//
//   0xFD JUMP            · 2-byte address  (case_0B46, gg1-5.s:1885)  [H]
//   0xFC RTN_FMTN/DIVE   · 1-byte Y ref    (case_0B4E, gg1-5.s:1896)  [H]  ← bee dive-to-Y
//   0xFA LOOP_TOP        · 2-byte alt addr (case_0BD1, gg1-5.s:1984)  [H]
//   0xF8 (Y→top)         · 0-byte          (case_0B87, gg1-5.s:1929)  [H]
//   0xF7 ATTACK_TURN     · 2-byte sub addr (case_0B98, gg1-5.s:1947)       ← fly-in CALL, skipped
//   0xF6 FREE_FLIGHT     · 1-byte heading  (case_0BA8, gg1-5.s:1963)  [H]
//   0xF3 BREAK_TARGETED  · 8-byte LUT      (case_0A01, gg1-5.s:1661)  [H]
//   0xF0 ATTACK_WAVE     · 2-byte sub addr (case_0955, gg1-5.s:1529)       ← fly-in CALL, skipped
//   0xEF BOMB_MODE       · 2-byte alt addr (case_094E, gg1-5.s:1523)  [H]
//
// Step 8 phase 8a additions: FC, F8, F6, F3, EF — these only appear in
// attack-context paths (db_flv_atk_yllw / _red); fly-in paths don't use
// them, so the bug was latent. See architecture.html §5b research item [2].
//
// Step 8 phase 8c addition: FA — research had it as "0-byte / conditional"
// but the path bytes always have a 2-byte address after FA (the alt-pattern
// pointer). Handler conditionally loads it; either way, 2 path bytes are
// consumed. Caught when phase 8c test mis-read 0x9E as a segment opcode
// at offset 18 of ATTACK_PATH_YELLOW, producing vy=-7 (strong upward) and
// flying the enemy off-screen instead of snapping to formation at FB.
const TOKEN_ARG_BYTES = {
    0xFD: 2,
    0xFC: 1,
    0xFA: 2,
    0xF8: 1,
    0xF7: 2,
    0xF6: 1,
    0xF3: 8,    // case_0A01 (gg1-5.s:1717): `ld a,#9; rst 0x10` advances HL
                // by 9 (token + 8-byte LUT). Earlier value of 2 was wrong
                // and caused RED path to misread offsets 12-19 as 2 fast-
                // spinning fake segments at offset 9.
    0xF2: 2,    // SPAWN (case_097B) — 2-byte sub-path address (handled explicitly below)
    0xF0: 2,
    0xEF: 2,
};

// case_0AA0 / FB TURN_HOME (gg1-5.s:1768-1846): redirect the bug toward its LIVE
// formation slot and enter 'homing' (tracks the oscillating slot in update()).
// Extracted into a helper so the FD/FA out-of-array fallback (the bonus-bee convoy
// leaders' cross-region home-tails) can reuse it. See research_attack_paths.md §5b.
function turnHome(e, state) {
    const fo = state.formation;
    const ox = fo.oscillateX + (fo.pulseOffsets[e.colIdx] ?? 0);
    const oy =                  (fo.pulseOffsets[10 + e.rowIdx] ?? 0);
    const dx = (e.homeX + ox) - e.x;
    const dy = (e.homeY + oy) - e.y;
    if (Math.abs(dx) <= HOME_THRESHOLD && Math.abs(dy) <= HOME_THRESHOLD) {
        e.state = 'formation';                 // already at the slot — snap
        e.x = e.homeX + ox; e.y = e.homeY + oy;
        e.vx = e.vy = e.rotRate = 0;
        e.pathBase = null;
        return;
    }
    const angleRad = Math.atan2(-dy, dx);
    const norm     = (angleRad + 2 * Math.PI) % (2 * Math.PI);
    e.angle    = Math.round(norm / (2 * Math.PI) * 1024) & 0x3FF;
    e.rotRate  = 0;
    e.pathBase = null;
    e.state    = 'homing';
    e.homeOscX = ox;
    e.homeOscY = oy;
}

// case_097B "split off bonus bee" (gg1-5.s:1564-1633): a convoy leader, on a 0xF2
// token, spawns a CLONE into a 0x38-0x3E transient slot — copying its sprite/color
// (bbeeColorIndex), position, and rotation flag — that runs the embedded sub-path
// (subOffset, within the leader's own CONVOY_REGION array). Clones never bomb and
// despawn on FF / off-screen (bbeeClone). research_bonus_bee.md §6.2.
function spawnClone(leader, state, subOffset) {
    for (let id = 0x38; id <= 0x3E; id += 2) {
        const c = state.enemies.find(en => en.objectId === id);
        if (!c || (c.state !== 'pending' && c.state !== 'dead')) continue;
        c.state          = 'flying';
        c.alive          = true;
        c.x = leader.x;   c.y = leader.y;          // start where the leader is
        c.vx = leader.vx; c.vy = leader.vy;
        c.angle          = leader.angle;
        c.rotRate        = 0;
        c.negateRotation = leader.negateRotation;
        c.bbeeColorIndex = leader.bbeeColorIndex;  // identical 0x5x sprite + color
        c.bbeeClone      = true;                   // FF / off-screen → despawn
        c.pathBase       = leader.pathBase;        // same CONVOY_REGION array
        c.pathOffset     = subOffset;
        c.segTimer       = 0;                       // load first segment next tick
        c.fcDiveTargetY  = null;
        c.bombCounter = 0; c.bombEnable = 0;        // clones don't bomb (no F6)
        return;
    }
    // no free slot → no clone (Z80 l_09FA_bonusbee_creat_fail)
}

// Read next segment (or dispatch token) at e.pathOffset.
// Updates vx, vy, rotRate, segTimer (or transitions e.state on token).
//
// Phase E INT-7: takes `state` so token handlers can read state-dependent
// flags (e.g. FA LOOP_TOP gates on state.contBmbFlag).
function loadSegment(e, state) {
    while (e.pathOffset < e.pathBase.length) {
        const b0 = e.pathBase[e.pathOffset];

        // Token range: 0xEF–0xFF (gg1-5.s:1475 — cp #0xEF; jp c)
        if (b0 >= 0xEF) {

            // Behavioural tokens that terminate the fly-in.
            //
            //   0xFF END        · case_0E49 (gg1-5.s:2517) — make creature
            //                     inactive (b_8800[id] = 0x80, sprite hidden).
            //                     For our purposes we transition to 'formation'
            //                     since fly-in paths only ever fire FF as a
            //                     defensive terminator past FB; never seen in
            //                     stage 1.
            //
            //   0xFB TURN_HOME  · case_0AA0 (gg1-5.s:1768-1846) — REDIRECT
            //                     motion toward the formation home slot.
            //                     The Z80 does NOT instant-snap; it computes
            //                     the angle from current position to home
            //                     (via c_0E5B), points the enemy that way,
            //                     and lets motion continue until within ±1 px
            //                     of home. Then it snaps. We mirror this with
            //                     a 'homing' state — see the homing block in
            //                     update() below for the per-frame check.
            if (b0 === 0xFF) {
                // Z80 case_0E49 (gg1-5.s:2517) makes the creature INACTIVE
                // (b_8800[id]=0x80, sprite hidden) — GONE, not homed. Challenge
                // (fly-through) bugs reach FF for real (their paths have no FB),
                // so they despawn here — the bonus-stage exit. Combat bugs always
                // FB-home before FF, so they never reach this; the 'formation'
                // branch is a defensive fallback only.
                if (isChallengeStage(state) || e.bbeeClone) {
                    // Challenge fly-through bugs AND bonus-bee convoy clones are
                    // transients with no home — FF makes them GONE, not homed.
                    e.state    = 'dead';
                    e.alive    = false;
                    e.pathBase = null;
                    e.vx = e.vy = e.rotRate = 0;
                    return;
                }
                e.state    = 'formation';
                e.pathBase = null;
                e.vx = e.vy = e.rotRate = 0;
                return;
            }
            if (b0 === 0xFB) {
                // Compute angle from current position to home formation slot.
                //
                // Z80 c_0E5B (gg1-5.s:2543-2604) is fixed-point atan2:
                // tracks quadrant in bit flags, picks min(|dx|,|dy|) as
                // numerator, divides via c_0EAA (8-bit fixed-point) for the
                // within-quadrant fraction, combines into the 10-bit angle.
                // Math.atan2 is mathematically equivalent and more precise
                // (52-bit mantissa vs. 8-bit divide). Same project trade-off
                // as Math.sin/Math.cos in the motion update — see file
                // header for the policy: faithful Z80 BEHAVIOR + bit-exact
                // table/state contracts, JS-native ARITHMETIC where the FPU
                // gives us better precision and simpler code.
                //
                // Sign convention matches the motion formulas in update():
                //   canvas dx = A·cos(θ), canvas dy = -A·sin(θ)
                // For θ to head TOWARD (homeX, homeY):
                //   cos(θ) ∝ (homeX − e.x)
                //   sin(θ) ∝ -(homeY − e.y)   ← canvas-Y inversion
                // → θ = atan2(-(homeY − e.y), homeX − e.x)
                // Aim at the LIVE (oscillating) slot, not the static home.
                // In the Z80 the home TARGET stays the static origin
                // (0x06/0x07), but each frame `case_2422` (gg1-3.s:826-848)
                // re-syncs the bug's offset to the formation's current
                // ds_hpos_loc_offs and the motion adds it (gg1-5.s:2297/2326),
                // so the bug arrives at the drifting slot. We model that by
                // targeting homeX+offset here and tracking the offset delta
                // each frame in the homing block below (see research_attack_
                // paths.md §5b).
                const fo = state.formation;
                const ox = fo.oscillateX + (fo.pulseOffsets[e.colIdx] ?? 0);
                const oy =                  (fo.pulseOffsets[10 + e.rowIdx] ?? 0);
                const dx = (e.homeX + ox) - e.x;
                const dy = (e.homeY + oy) - e.y;
                if (Math.abs(dx) <= HOME_THRESHOLD &&
                    Math.abs(dy) <= HOME_THRESHOLD) {
                    // Already at the slot — degenerate case; snap immediately.
                    e.state = 'formation';
                    e.x = e.homeX + ox;
                    e.y = e.homeY + oy;
                    e.vx = e.vy = e.rotRate = 0;
                    e.pathBase = null;
                    return;
                }
                const angleRad = Math.atan2(-dy, dx);
                const norm     = (angleRad + 2 * Math.PI) % (2 * Math.PI);
                e.angle    = Math.round(norm / (2 * Math.PI) * 1024) & 0x3FF;
                e.rotRate  = 0;          // fixed direction during homing
                e.pathBase = null;       // no more segments
                e.state    = 'homing';
                e.homeOscX = ox;         // track the slot's per-frame drift
                e.homeOscY = oy;         //   (case_2422 re-sync) in update()
                // Keep current vx/vy from last segment so motion continues
                // (mirrors Z80 — 0x0A/0x0B are not modified by case_0AA0).
                return;
            }

            // ── 0xF6 FREE_FLIGHT (case_0BA8, gg1-5.s:1963) ──────────────
            // The lone-moth "free flight" bombing run. Does THREE things:
            //   (1) SET HEADING from the 1-byte arg: angle 0x04/0x05 =
            //       (arg, mirrored by negateRotation) << 2  (= arg×4, our
            //       10-bit space). The moth's args 0xC0/0xB0/0xAB → 768
            //       (straight down)/704/684 — a mostly-downward run.
            //   (2) bomb-drop COUNTER 0x0E = 0x1E (30 frames to first drop).
            //   (3) bomb-drop ENABLE bitmask 0x0F = b_92C0[8] (the per-stage
            //       pattern, our state.bombDropFlags). bombUpdate consumes it
            //       bit-by-bit (willFire = bit0; then >>=1).
            // Previously this set bombCounter only + hardcoded enable=0xFF and
            // skipped the heading (a stub). Reached only in the late-stage /
            // continuous branches (p_flv_03cc / p_flv_03d7), never the normal
            // stage-1 dive. Keeps vx/vy/rotRate (continues this segment-set);
            // the next data segment's rotRate then turns from this heading.
            if (b0 === 0xF6) {
                let a = e.pathBase[e.pathOffset + 1];          // arg byte
                if (e.negateRotation) { a = (a + 0x80) & 0xFF; a = (-a) & 0xFF; }
                e.angle       = (a << 2) & 0x3FF;              // 0x04/0x05: heading = arg×4
                e.bombCounter = 0x1E;                          // 0x0E: 30 frames to first drop
                e.bombEnable  = state.bombDropFlags;           // 0x0F: per-stage drop bitmask (b_92C0[8])
                e.pathOffset += 2;                             // token + 1 arg
                continue;
            }

            // ── 0xFD JUMP (case_0B46, gg1-5.s:1885) ─────────────────────
            // Unconditional jump to the embedded Z80 absolute address.
            // We translate to a JS offset via the path's z80Base property
            // (set on ATTACK_PATH_YELLOW/RED in paths.js). This is what
            // makes attack-dive inner loops actually loop — without it,
            // execution falls through linearly to the path's tail.
            if (b0 === 0xFD) {
                const lo     = e.pathBase[e.pathOffset + 1];
                const hi     = e.pathBase[e.pathOffset + 2];
                const target = (hi << 8) | lo;
                const base   = e.pathBase.z80Base ?? 0;
                const off    = target - base;
                // Out-of-array target = a bonus-bee convoy leader's cross-region
                // home-tail (→ the bee descent in ATTACK_PATH_YELLOW) → TURN_HOME.
                // Existing attack paths always jump within their own array, so this
                // never fires for them. research_bonus_bee.md §6.
                if (off < 0 || off >= e.pathBase.length) { turnHome(e, state); return; }
                e.pathOffset = off;
                continue;
            }

            // ── 0xFA LOOP_TOP (case_0BD1, gg1-5.s:1984) ─────────────────
            // Conditional jump:
            //   contBmbFlag=false → JUMP to embedded address
            //                       (target is the path's "go home" tail
            //                        ending in FB TURN_HOME)
            //   contBmbFlag=true  → SKIP the 2 address bytes, continue
            //                       linearly (eventually hits FD JUMP that
            //                        loops the attack pass — keeping the
            //                        enemy diving and dropping bombs)
            //
            // The flag is set in launchAttackWave from b_92A0[0x0A]
            // (gg1-5.s:489): true when alive enemies < newStageParms[7]
            // AND fire-button task is active. So in early stage 1 (many
            // enemies) FA bails the attack quickly; in late stage 1
            // (≤5 enemies) it stays diving.
            //
            // Z80 also gates on task_actv[0x1D] (destroyed-capture-boss);
            // we ignore that since boss capture is step 10.
            if (b0 === 0xFA) {
                if (state.contBmbFlag) {
                    e.pathOffset += 3;
                } else {
                    const lo     = e.pathBase[e.pathOffset + 1];
                    const hi     = e.pathBase[e.pathOffset + 2];
                    const target = (hi << 8) | lo;
                    const base   = e.pathBase.z80Base ?? 0;
                    const off    = target - base;
                    // Out-of-array (convoy leader home-tail) → TURN_HOME. See FD.
                    if (off < 0 || off >= e.pathBase.length) { turnHome(e, state); return; }
                    e.pathOffset = off;
                }
                continue;
            }

            // ── 0xF2 SPAWN ("split off bonus bee", case_097B, gg1-5.s:1564) ──
            // Only the bonus-bee convoy leaders use F2: each one splits off a CLONE
            // that runs the embedded sub-path (an address WITHIN the same
            // CONVOY_REGION array). The leader keeps flying past the token.
            // research_bonus_bee.md §6.2.
            if (b0 === 0xF2) {
                const lo     = e.pathBase[e.pathOffset + 1];
                const hi     = e.pathBase[e.pathOffset + 2];
                const target = (hi << 8) | lo;
                const base   = e.pathBase.z80Base ?? 0;
                spawnClone(e, state, target - base);
                e.pathOffset += 3;       // token + 2-byte address; continue the dive
                continue;
            }

            // ── 0xF3 BREAK_TARGETED (case_0A01, gg1-5.s:1661) ───────────
            // The red-moth targeting waypoint. Mid-dive, the moth reads the
            // player ship's X and picks one of 8 turn-HOLD durations from the
            // 8-byte LUT that follows the token. It does NOT change heading —
            // it sets only the segment duration (0x0D), then continues the
            // turn the PREVIOUS segment started (the `0x12,0xFA,..` rotRate=−6
            // in db_flv_atk_red). Longer hold → bigger hook → the dive bends
            // toward where the player is standing. (Second F3 in p_flv_03d7
            // is a deeper targeting waypoint with its own LUT.)
            //
            // Z80 math (gg1-5.s:1669-1705), ported faithfully:
            //   px  = clamp(playerSpriteX, 0x1E, 0xD1)     ; targeting window
            //   a   = (px>>1) − mothRawX                   ; mothRawX = 0x03(ix)
            //   a   = a >> 1                                ; (playerX−mothX)/4,
            //                                                 signed (rra-after-sub)
            //   if negateRotation: a = −a                  ; mirrored pair member
            //   a  += 0x18 ; clamp [0,0x2F] ; idx = a/6     ; bucket 0..7 (c_0EAA /6)
            //   segTimer = LUT[idx]                         ; 0x0D duration
            //
            // The +16 sprite↔canvas offsets cancel in (player.x − e.x), so the
            // delta is clean in canvas space; only the player clamp needs
            // sprite coords. mothRawX = (e.x+16)/2 because the bug-render path
            // is half-scale (sprite_X = rawX×2 — CLAUDE.md "Coordinate
            // system"). We skip the cocktail flip-screen branch (b_9215, not
            // modelled). Pointer advances token(1)+LUT(8)=9 and we RETURN
            // without reloading vx/vy/rotRate so the moth keeps turning
            // (Z80 jp l_0BFF_flite_pth_skip_load, gg1-5.s:1715).
            if (b0 === 0xF3) {
                const px = Math.max(0x1E, Math.min(0xD1,
                                    Math.round(state.player.x) + 16));
                let a = (px >> 1) - Math.floor((e.x + 16) / 2);
                a = a >> 1;                          // signed /2 → /4 total
                if (e.negateRotation) a = -a;
                a += 0x18;                           // bias into index range
                a = a < 0 ? 0 : (a > 0x2F ? 0x2F : a);   // clamp [0,0x2F]
                const idx = Math.floor(a / 6);       // c_0EAA /6 → 0..7
                e.segTimer    = e.pathBase[e.pathOffset + 1 + idx];  // LUT[idx]
                e.pathOffset += 9;                   // skip token + 8-byte LUT
                return;                              // keep vx/vy/rotRate (hold turn)
            }

            // ── 0xF8 (case_0B87, gg1-5.s:1929) ──────────────────────────
            // "flew through the bottom of the screen to the TOP, heading
            // for home." Repositions the bug's Y to the top edge:
            // Z80 sets 0x01(ix) = 0x0138>>1 = 0x9C (internal-Y high byte).
            // rawYToCanvasY(0x9C) = ((~(0x9C+0x4F))&0xFF)*2+1−32 = 9, the
            // top of the playfield. 0-arg token (case_0B87 just inc's hl —
            // the prior TOKEN_ARG_BYTES.F8=1 was wrong, research §7c). Keeps
            // current vx/vy/rotRate; pairs with F9 + the FB tail.
            if (b0 === 0xF8) {
                e.y = 9;                 // rawYToCanvasY(0x9C)
                e.pathOffset += 1;
                continue;
            }

            // ── 0xF9 (case_0B5F, gg1-5.s:1907) ──────────────────────────
            // Sets the bug's X to its home-COLUMN coordinate so it re-enters
            // aligned above its formation slot: Z80 sets 0x03(ix) =
            // ds_hpos_spcoords[col]/2 → rawXToCanvasX → the static column X =
            // e.homeX. (We skip the cocktail flip-screen branch and the
            // cont_bmb dive-sound, neither modelled.) 0-arg token; keeps
            // current vx/vy/rotRate. With F8 above, the moth re-appears at
            // (homeX, top); the following FA→FB then homes it down to its
            // live oscillating slot.
            if (b0 === 0xF9) {
                e.x = e.homeX;
                e.pathOffset += 1;
                continue;
            }

            // ── 0xF1 (case_0968, gg1-5.s:1551) ──────────────────────────
            // "diving attacks stop and bugs go home" — the vertical companion
            // to F9, the BOSS sortie path's equivalent of the moth's F8. After
            // the dive arc takes the boss off the BOTTOM, F9 (X→home col) + F1
            // re-enter it from the TOP, then FA→FB homes it straight down.
            //
            // Z80 sets 0x01(ix) (a RAW Y) = home-row origin rawY + 0x20, then
            // the sprite chip converts it. rawYToCanvasY has slope −2 (bigger
            // rawY = HIGHER on screen — it's inverted), so +0x20 raw = −64
            // canvas px → ABOVE the top edge. (Boss: home rawY ~0x8A → slot
            // y≈45; +0x20 → rawYToCanvasY(0xAA) ≈ −19.) My first port used
            // homeY + 0x20 (DOWN to the moth row) — wrong sign; the inverted
            // raw→canvas mapping makes it go UP. Exact value is non-critical
            // (FB re-homes to the live slot); −0x40 matches the source within
            // 1px without an 8-bit wrap for any formation row. 0-arg token.
            if (b0 === 0xF1) {
                e.y = e.homeY - 0x40;
                e.pathOffset += 1;
                continue;
            }

            // ── 0xF4 (case_0A53, gg1-5.s:1724) — CAPTURE-boss aim ───────
            // The capture boss reads the PLAYER's X, clamps it to a capture
            // lane, points its heading down-and-at that spot, and arms the
            // capture-dive monitor — this is what makes it position itself over
            // the ship (unlike the escort's fixed arc). Z80 also enables task
            // 0x19 (f_21CB) + records the motion slot; our captorDive task
            // finds the boss via state.captureBossId, so we just flag it here.
            // 0-arg token. Capture path only (db_0454).
            if (b0 === 0xF4) {
                // Lane clamp: Z80 [0x29,0xC9] sprite X → center canvas [32,192]
                // (sprite_X − 9; see paths.js rawXToCanvasX).
                const targetX = Math.max(32, Math.min(192, state.player.x | 0));
                e.captureTargetX = targetX;     // beam center (4b) + aim point
                e.captureDiving  = true;        // arm captorDive (f_21CB)
                state.tasks.captorDive = true;  // Z80 case_0A53:1760 — task 0x19 on
                // Aim down-and-toward the target. c_0E5B aims at (targetX,
                // dive-depth 0x48 → y≈177). NOTE the motion is e.y -= A·sin(θ),
                // so DOWN (e.y increasing) is θ≈768, not 256 — the velocity
                // vector is (cosθ, −sinθ), hence atan2(−dy, dx) (dy>0 = below).
                const dx  = targetX - e.x;
                const dy  = Math.max(8, rawYToCanvasY(0x48) - e.y);
                const ang = Math.atan2(-dy, dx) / (2 * Math.PI) * 1024;
                e.angle   = ((ang % 1024) + 1024) % 1024;
                e.pathOffset += 1;
                continue;
            }

            // ── 0xFC RTN_FMTN/DIVE (case_0B4E, gg1-5.s:1896) ────────────
            // Bee dive: "dive until you reach screen-Y <arg>, THEN advance"
            // — arms a position-triggered segment exit. Z80 sets 0x06(ix)
            // (a screen-Y reference) from the 1-byte arg and bit 5 of
            // 0x13(ix) (the "bee/boss dive" flag); every frame after, the
            // motion step (l_0C2D, gg1-5.s:2056) force-expires the current
            // segment once the bug's Y reaches that reference, then clears
            // the flag. We store the reference in canvas space (a dedicated
            // e.fcDiveTargetY — the port keeps the homing target on
            // e.homeX/Y, so no field reuse) and do the trigger in update().
            // The flag PERSISTS across segments until the Y is reached
            // (source clears bit 5 only at l_0C3E) — so a later F6/segment
            // is also subject to it.
            //
            // skip_load (Z80 `jp l_0BFF_flite_pth_skip_load`, gg1-5.s:1903):
            // case_0B4E does NOT load a new segment — it advances the pointer
            // PAST the token/arg but KEEPS the current segment's vx/vy/rotRate,
            // so the bug keeps diving at its present velocity until the Y-trigger
            // (per-tick step below) force-expires the segment and the NEXT
            // segment is finally loaded. The Z80 leaves 0x0D==0; the following
            // `dec 0x0D` wraps 0→0xFF (gg1-5.s:1461), giving ~255 frames of
            // dive. We mirror that with a large segTimer and RETURN — crucially
            // NOT `continue`, which would read the next segment immediately and
            // (for the capture boss, whose next segment is the 00 FC FF stall)
            // zero the velocity before the dive ever happens.
            if (b0 === 0xFC) {
                e.fcDiveTargetY = rawYToCanvasY(e.pathBase[e.pathOffset + 1]);
                e.pathOffset += 2;                   // token + 1 arg → next seg
                e.segTimer     = 0xFF;               // keep current velocity
                return;                              // do NOT load next segment
            }

            // ── 0xEF BOMB_MODE / continuous-bombing (case_094E, gg1-5.s:1523) ──
            // Stage-gated branch. Reads the per-stage difficulty byte
            // newStageParms[9]:
            //   == 0  → skip the embedded 2-byte address, continue past EF
            //           (the stages where [9]==0; moth re-loops or homes).
            //   != 0  → JUMP the path pointer to the embedded address — a
            //           harder attack pass (p_flv_03d7 in the red path) where
            //           the moth keeps diving + bombing instead of going home.
            // Address is a Z80 absolute, translated to a JS offset via
            // pathBase.z80Base (same mechanism as FD JUMP / FA LOOP_TOP).
            // NOTE: [9] first becomes nonzero at STAGE 12 (rank 3), not stage
            // 8 — the source's "on/after stage 8" comment predates the data
            // (index 8 = the F0 token gates at stage 8; EF reads index 9).
            if (b0 === 0xEF) {
                if (state.newStageParms[9] !== 0) {
                    const lo     = e.pathBase[e.pathOffset + 1];
                    const hi     = e.pathBase[e.pathOffset + 2];
                    const target = (hi << 8) | lo;
                    const base   = e.pathBase.z80Base ?? 0;
                    e.pathOffset = target - base;
                } else {
                    e.pathOffset += 3;   // skip token + 2-byte address
                }
                continue;
            }

            // Everything else: no-op for now, but skip past any argument
            // bytes so .dw addresses don't get mis-read as segments.
            // Full semantics for the remaining 12 tokens come later.
            const argBytes = TOKEN_ARG_BYTES[b0] ?? 0;
            e.pathOffset += 1 + argBytes;
            continue;
        }

        // Normal 3-byte segment. vx/vy are UNSIGNED magnitudes (Z80
        // stores them via `and 0x0F` — direction comes from angle).
        e.vx       = b0 & 0x0F;
        e.vy       = (b0 >> 4) & 0x0F;

        // Z80 rotRate negation per gg1-5.s:2014-2018 — the segment's
        // signed rotation byte is negated when bit 7 of 0x13(ix) is
        // set. That bit is set by the launcher (l_29D1_finalize_object_setup,
        // gg1-3.s:1892-1894) when wave-byte bit 6 was set, marking
        // pair member 1. Result: partners sweep mirrored arcs (one
        // clockwise, one counter-clockwise) from their respective
        // start positions — Galaga's iconic symmetric pair entry.
        let rotRate = byteSigned(e.pathBase[e.pathOffset + 1]);
        if (e.negateRotation) rotRate = -rotRate;
        e.rotRate  = rotRate;

        e.segTimer = e.pathBase[e.pathOffset + 2];
        e.pathOffset += 3;
        return;
    }
    // Ran off the end without END token — defensive: deactivate.
    e.state = 'dead';
}

// ── Public launch helper (fly-in) ─────────────────────────────────────
// Put a 'pending' enemy into a fly-in path. Looks up the enemy by its
// objectId (Z80 sprt_fmtn_hpos byte offset) and seeds its flight state
// from a PRE-RESOLVED path-info object.
//
// pathInfo shape: { bytes, startX, startY, startAngle }
//   — produced by paths.resolveWaveByte() (wave-data driven) or
//     paths.getPathByIndex() (direct index lookup, e.g. dev tests).
//
// Will be called by:
//   - launchAttackWave fly-in entries
//
// INT-3a: only accepts enemies in 'pending' state — fly-in is the
// "first appearance" path. Enemies already landed are in 'formation';
// those use launchEnemyAttack to break formation and dive.
//
// Returns the enemy object on success, or null if pathInfo is missing
// or the ID isn't in 'pending' state.
export function launchEnemy(state, objectId, pathInfo) {
    if (!pathInfo) return null;

    const e = state.enemies.find(en => en.objectId === objectId);
    if (!e || e.state !== 'pending') return null;

    e.state      = 'flying';
    e.x          = pathInfo.startX;
    e.y          = pathInfo.startY;
    e.vx         = 0;
    e.vy         = 0;
    e.angle      = pathInfo.startAngle;
    e.rotRate    = 0;
    e.pathBase   = pathInfo.bytes;
    e.pathOffset = 0;
    e.segTimer   = 0;             // 0 → load first segment on tick 0
    e.fcDiveTargetY = null;       // no FC dive-Y armed at launch
    return e;
}

// ── Public launch helper (attack-dive) ────────────────────────────────
// Put a formation enemy into an attack-dive path. Like launchEnemy()
// but uses the enemy's current visible formation position as the start
// point — attack dives spawn from the enemy's slot, not from a variant
// table off-screen position.
//
// Will be called by:
//   - launchAttackWave attack entries (phase 8c test, phase 8e real launcher)
//
// INT-3a: only accepts enemies in 'formation' state — attacks pull from
// landed enemies. Pending enemies (haven't flown in yet) are excluded.
//
// Returns the enemy on success, or null if not found, not in 'formation'
// state, or attackBytes missing.
export function launchEnemyAttack(state, objectId, attackBytes, negateOverride, entryOffset) {
    if (!attackBytes) return null;

    const e = state.enemies.find(en => en.objectId === objectId);
    if (!e || e.state !== 'formation') return null;

    // Snapshot the enemy's current visible formation position so the
    // attack starts where the player saw it (no jump-to-home).
    const f = state.formation;
    e.state      = 'flying';
    e.x          = e.homeX + f.oscillateX + (f.pulseOffsets[e.colIdx] ?? 0);
    e.y          = e.homeY +                (f.pulseOffsets[10 + e.rowIdx] ?? 0);
    e.vx         = 0;
    e.vy         = 0;
    // Initial dive heading. Z80 j_108A (gg1-2.s:243-244) sets the angle
    // field 0x04/0x05(ix) = 0x0100 ("90 degrees" per the source comment)
    // for every attack launch. Was hardcoded 0 here (a placeholder) —
    // which seeds "pointing right", so the header's +24 rotation swept the
    // moth hard LEFT (and the mirrored pair member UP). 0x100 makes the
    // pair dive DOWN and split symmetrically left/right. Same 10-bit angle
    // space as the fly-in seed (paths.js startAngle = rotHi<<8).
    e.angle      = 0x100;
    e.rotRate    = 0;
    e.pathBase   = attackBytes;
    // Entry into the path. Most arrays start at their header (offset 0). The
    // boss-path region has two entries: the escort sortie at .entryOffset (=5)
    // and the capture boss at CAPTURE_ENTRY_OFFSET (=72), passed explicitly.
    e.pathOffset = entryOffset ?? attackBytes.entryOffset ?? 0;
    e.segTimer   = 0;             // 0 → load first segment on tick 0
    e.fcDiveTargetY = null;       // no FC dive-Y armed at launch
    e.captureDiving = false;      // F4 arms this for a capture boss
    e.captureHalted = false;      // captorDive sets it at the beam position
    e.captureTargetX = null;

    // Z80 c_1083 (gg1-2.s:206-216): negateRotation is RECOMPUTED per
    // attack launch from objectId bit 1 — left pair members get false,
    // right pair members get true. The launcher unconditionally
    // overwrites whatever fly-in's pair-mirror logic left in 0x13(ix)
    // bit 7. Without this, attackers whose fly-in set negateRotation=true
    // execute the attack path mirrored, sending them in the wrong
    // direction (e.g. red butterflies flying UP and off the top edge
    // instead of diving down).
    //
    // negateOverride: boss ESCORTS don't use their own bit 1 — the whole
    // sortie (boss + wingmen) inherits the BOSS's rotation flag so the group
    // sweeps together, not mirrored against each other (Z80 j_1CAE stashes
    // the boss's flag in Cy' and c_1D03/l_1D16 OR's it into every escort's
    // pool-slot index bit 7, gg1-2_fx.s:1177-1185 / 1305-1307). Solo boss
    // and moth/bee dives pass undefined → use the object's own bit 1.
    e.negateRotation = (negateOverride !== undefined)
        ? negateOverride
        : (objectId & 0x02) !== 0;

    // Z80 j_108A (gg1-2.s:314-323): EVERY attack launch arms the bomb counter
    // (0x0E = 0x1E) AND the enable bitmask (0x0F = b_92C0[8] = bombDropFlags, set
    // whenever enemies are enabled — i.e. all through a stage). So every diving
    // enemy can bomb, not just continuous-bombing-loop ones — F6 merely RE-arms it
    // for the loop. (This previously set 0/0 on the belief that the Z80 only bombs
    // in the cont-bmb endgame — WRONG: j_108A arms at launch, so normal dives bomb.
    // Caught playtesting 2026-06-21: no bombs even at rank D. The drop is still
    // gated downstream by the enable bitmask + Y≥152 + fire-button, case_0DF5.)
    e.bombCounter = 0x1E;
    e.bombEnable  = state.bombDropFlags;

    return e;
}

// ── Per-tick interpreter ───────────────────────────────────────────────
// (Phase 3c: launchAttackWave drives spawning now — no auto test spawn.)
const TWO_PI_OVER_1024 = (2 * Math.PI) / 1024;

// Homing-arrival threshold (canvas px). Derived precisely from Z80:
//
// Z80 home check (gg1-5.s:2037-2053): |0x01(ix) − 0x06(ix)| ≤ 1 for Y
// AND |0x03(ix) − 0x07(ix)| ≤ 1 for X. The compared bytes are the
// BUG'S internal raw high bytes (rawY at 0x01, rawX at 0x03) — NOT
// the sprite-position registers.
//
// Conversion to canvas pixels:
//   sprite_Y_byte = (~(rawY + 0x4F)) × 2 + 1    →  Δsprite = 2·ΔrawY
//   canvas_Y      = sprite_Y_byte + 256·bit_8 − 40   →  Δcanvas = Δsprite
//   ∴  Δcanvas_Y = 2 · ΔrawY
// Same factor for X (pixel_X = rawX × 2, canvas_X = pixel_X − 16).
//
// So Z80's ±1 in raw high byte corresponds EXACTLY to ±2 in canvas px.
// The factor of 2 comes from the sprite chip's `×2` rendering doubling
// (gg1-5.s:2287-2288 for X, 2305-2321 for Y), NOT from the −40/−16
// canvas offsets — those are irrelevant to deltas.
const HOME_THRESHOLD = 2;

// Challenge (bonus) stages: bugs fly their patterns and EXIT off-screen — they
// never home into formation (their paths end with FF, no FB). Z80
// _b_not_chllg_stg == 0 on every 4th stage (3, 7, 11, …). During a challenge
// stage there are no attack dives (max_bombers = 0), so EVERY flying bug is a
// fly-through bug — the predicate alone disambiguates. research_stage_init.md §14.4.
function isChallengeStage(state) {
    return ((state.stage + 1) % 4) === 0;
}

export function update(state) {
    for (const e of state.enemies) {
        // Both 'flying' (executing path bytecode) and 'homing' (post-FB
        // guided approach to formation slot) get per-tick motion updates.
        if (e.state !== 'flying' && e.state !== 'homing') continue;

        // Capture boss halted in beam position (set by captorDive / f_21CB):
        // freeze in place while the tractor beam runs. pathBase/pathOffset/
        // segTimer are kept intact, so clearing the flag (beam end) resumes the
        // path exactly where it paused → F8/F9/FA retreat home.
        if (e.captureHalted) continue;

        // Steps 1-3 are 'flying'-only. 'homing' has no segments to load
        // and a fixed angle (set once when FB fired).
        if (e.state === 'flying') {
            // Step 1: decrement segment timer (Z80: dec 0x0D(ix))
            if (e.segTimer > 0) e.segTimer -= 1;

            // Step 2: if timer hit 0, load next segment (may transition
            // to formation/homing/dead via FF/FB).
            if (e.segTimer === 0) {
                loadSegment(e, state);
                if (e.state !== 'flying' && e.state !== 'homing') continue;
            }

            // Step 3: add rotation rate to angle (10-bit wrap)
            if (e.state === 'flying') {
                e.angle = (e.angle + e.rotRate + 1024) & 0x3FF;
            }
        }

        // Step 5: Z80-faithful position update. BOTH axes update each
        // frame; the velocity MAGNITUDE alternates between vx (odd
        // frames) and vy (even frames) per gg1-5.s:2150-2157. See file
        // header for the full derivation.
        const angleRad = e.angle * TWO_PI_OVER_1024;
        const A = (state.frameCount & 1) ? e.vx : e.vy;
        e.x += A * Math.cos(angleRad);
        e.y -= A * Math.sin(angleRad);

        // Challenge fly-through: a bug that has cleared the playfield is GONE.
        // The Z80 despawns it at its path's FF (case_0E49) after a long off-screen
        // tail; we despawn as soon as it's clearly past an edge so the empty-screen
        // wait between waves (the bugsFlying==0 inter-wave gate) stays short — a
        // port responsiveness tweak with the same visible result. Challenge paths
        // exit downward/sideways and stay on-screen mid-pattern, so the generous
        // margins won't clip a bug mid-flight. Combat bugs home before leaving, so
        // this never fires for them. research_stage_init.md §14.4.
        if (e.state === 'flying' && (isChallengeStage(state) || e.bbeeClone) &&
            (e.y > 304 || e.x < -24 || e.x > 248)) {
            e.state    = 'dead';
            e.alive    = false;
            e.pathBase = null;
            continue;
        }

        // FC dive-Y trigger (case_0B4E + l_0C2D, gg1-5.s:2056-2068): while a
        // dive-Y reference is armed (set by the FC token), force the current
        // segment to expire once the bug dives down to that depth, then
        // disarm. This is the bee's "dive until you reach Y, then turn for
        // home." Z80 sets 0x0D=1 (expire next step) + clears bit 5 of 0x13.
        // The bee dives DOWN = e.y increasing, so "reached" is e.y >= target.
        if (e.state === 'flying' && e.fcDiveTargetY != null && e.y >= e.fcDiveTargetY) {
            e.segTimer      = 1;       // expire next frame (Z80: 0x0D = 1)
            e.fcDiveTargetY = null;    // disarm (Z80: res 5,0x13)
        }

        // Homing arrival check (Z80 case_0AA0's home-detect at
        // gg1-5.s:2030-2053 — bit 6 of 0x13(ix) is set during FB,
        // l_0C05_flite_pth_cont compares (b01,b03) to home (b06,b07)
        // each frame and snaps when within ±1).
        // Homing tracks the LIVE oscillating slot (Z80 case_2422,
        // gg1-3.s:826-848: each frame re-syncs the per-bug offset to the
        // formation's current ds_hpos_loc_offs, and the motion adds it,
        // gg1-5.s:2297/2326). We mirror that by carrying the slot's drift
        // delta onto e.x/e.y each frame, so the bug glides onto the moving
        // formation and snaps onto it with no jump (research_attack_paths.md
        // §5b). Snap when within HOME_THRESHOLD of the live slot.
        if (e.state === 'homing') {
            const fo = state.formation;
            const ox = fo.oscillateX + (fo.pulseOffsets[e.colIdx] ?? 0);
            const oy =                  (fo.pulseOffsets[10 + e.rowIdx] ?? 0);
            e.x += ox - e.homeOscX;      // follow the slot's drift since last frame
            e.y += oy - e.homeOscY;
            e.homeOscX = ox;
            e.homeOscY = oy;
            if (Math.abs(e.x - (e.homeX + ox)) <= HOME_THRESHOLD &&
                Math.abs(e.y - (e.homeY + oy)) <= HOME_THRESHOLD) {
                e.state = 'formation';
                e.x = e.homeX + ox;
                e.y = e.homeY + oy;
                e.vx = e.vy = 0;
            }
        }
    }
}
