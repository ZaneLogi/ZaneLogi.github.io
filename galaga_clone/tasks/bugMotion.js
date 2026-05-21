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

// (vx/vy nibbles in segment byte 0 are UNSIGNED magnitudes 0-15. The
// Z80 segment-load at gg1-5.s:1996-2011 stores them via `and 0x0F` —
// no sign extension. Direction comes from the angle, not from a sign
// bit on the magnitude.)

// Tokens that consume extra bytes after the opcode — must be skipped
// past so we don't mis-read the args as segment data. Defaults to 0
// (the token byte alone) for unlisted opcodes.
//
// FD and FA are handled by dedicated cases above (Phase E INT-7) — the
// entries here are documentation only; the generic skip-path never sees
// those opcodes. Same for FB / FF / F6 (handled via dedicated cases).
//
//   0xFD JUMP            · 2-byte address  (case_0B46, gg1-5.s:1885)  [HANDLED]
//   0xFC RTN_FMTN/DIVE   · 1-byte origin Y (case_0B4E, gg1-5.s:1896)
//   0xFA LOOP_TOP        · 2-byte alt addr (case_0BD1, gg1-5.s:1984)  [HANDLED]
//   0xF8 BEAM_ON         · 1-byte Y value  (case_0B87, gg1-5.s:1935)
//   0xF7 ATTACK_TURN     · 2-byte sub addr (case_0B98, gg1-5.s:1947)
//   0xF6 FREE_FLIGHT     · 1-byte velocity (case_0BA8, gg1-5.s:1963)  [HANDLED]
//   0xF3 BREAK_TARGETED  · 2-byte sub addr (case_0A01, gg1-5.s:1661)
//   0xF0 ATTACK_WAVE     · 2-byte sub addr (case_0955, gg1-5.s:1529)
//   0xEF BOMB_MODE       · 2-byte alt addr (case_094E, gg1-5.s:1523)
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
    0xF0: 2,
    0xEF: 2,
};

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
                const dx = e.homeX - e.x;
                const dy = e.homeY - e.y;
                if (Math.abs(dx) <= HOME_THRESHOLD &&
                    Math.abs(dy) <= HOME_THRESHOLD) {
                    // Already at home — degenerate case; snap immediately.
                    e.state = 'formation';
                    e.x = e.homeX;
                    e.y = e.homeY;
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
                // Keep current vx/vy from last segment so motion continues
                // (mirrors Z80 — 0x0A/0x0B are not modified by case_0AA0).
                return;
            }

            // Behavioural token for attack-dive bombing.
            //   0xF6 FREE_FLIGHT · case_0BA8 — arms the bomb-drop counter
            //                       and per-enemy enable bits. Z80 also
            //                       sets a 2-byte angle from the arg byte;
            //                       step 8 phase 8d/e simplifies that to
            //                       just bomb-state initialisation —
            //                       motion redirect is polish for later.
            //                       The 1-byte arg (rot/velocity hint) is
            //                       consumed but ignored. bombUpdate.js
            //                       reads bombCounter / bombEnable.
            if (b0 === 0xF6) {
                e.bombCounter = 0x1E;     // 30 frames to first drop attempt
                e.bombEnable  = 0xFF;     // all 8 enable bits set (aggressive)
                e.pathOffset += 2;        // skip token + 1 arg
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
                e.pathOffset = target - base;
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
                    e.pathOffset = target - base;
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
export function launchEnemyAttack(state, objectId, attackBytes) {
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
    e.angle      = 0;
    e.rotRate    = 0;
    e.pathBase   = attackBytes;
    e.pathOffset = 0;
    e.segTimer   = 0;             // 0 → load first segment on tick 0

    // Z80 c_1083 (gg1-2.s:206-216): negateRotation is RECOMPUTED per
    // attack launch from objectId bit 1 — left pair members get false,
    // right pair members get true. The launcher unconditionally
    // overwrites whatever fly-in's pair-mirror logic left in 0x13(ix)
    // bit 7. Without this, attackers whose fly-in set negateRotation=true
    // execute the attack path mirrored, sending them in the wrong
    // direction (e.g. red butterflies flying UP and off the top edge
    // instead of diving down).
    e.negateRotation = (objectId & 0x02) !== 0;

    // Phase E INT-7: F6 spawn-arming workaround removed. Bombs are now
    // armed by the F6 FREE_FLIGHT token at offset 34 (yellow) when it
    // actually fires inside the FD JUMP loop. In normal mode (most of
    // stage 1), FA at offset 17 jumps to the FB tail before reaching F6
    // — so attackers don't drop bombs unless cont_bmb has kicked in
    // (≤5 enemies left). Matches Z80 stage 1 behavior.
    e.bombCounter = 0;
    e.bombEnable  = 0;

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

export function update(state) {
    for (const e of state.enemies) {
        // Both 'flying' (executing path bytecode) and 'homing' (post-FB
        // guided approach to formation slot) get per-tick motion updates.
        if (e.state !== 'flying' && e.state !== 'homing') continue;

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

        // Homing arrival check (Z80 case_0AA0's home-detect at
        // gg1-5.s:2030-2053 — bit 6 of 0x13(ix) is set during FB,
        // l_0C05_flite_pth_cont compares (b01,b03) to home (b06,b07)
        // each frame and snaps when within ±1).
        if (e.state === 'homing' &&
            Math.abs(e.x - e.homeX) <= HOME_THRESHOLD &&
            Math.abs(e.y - e.homeY) <= HOME_THRESHOLD) {
            e.state = 'formation';
            e.x = e.homeX;
            e.y = e.homeY;
            e.vx = e.vy = 0;
        }
    }
}
