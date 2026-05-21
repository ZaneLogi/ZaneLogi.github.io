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
//   5. Apply velocity to position — alternating X / Y per frame
//      (matches Z80 frame-parity trick at gg1-5.s:2150–2234, gives
//       effective ½-rate per axis)
//
// Phase 2 simplifications still in place:
//   - float positions (Z80 uses 9.7 fixed-point — exact precision not needed)
//   - tokens other than END (0xFF) are skipped — full token semantics
//     (HOME, JUMP, BREAK_*) come in phase 3
//
// Phase 2 test: auto-spawn one transient enemy on first run using a real
// Galaga path block (db_flv_01E8) selected via the verified PATH_INDEX +
// VARIANTS tables in paths.js.

import { getPathByIndex } from '../paths.js';

// Decode signed 4-bit nibble (Z80 two's complement).
function nibSigned(n) {
    return n > 7 ? n - 16 : n;
}

// Decode signed 8-bit byte.
function byteSigned(b) {
    return b > 127 ? b - 256 : b;
}

// Tokens that consume extra bytes after the opcode — must be skipped
// past so we don't mis-read the args as segment data. Defaults to 0
// (the token byte alone) for unlisted opcodes.
//
//   0xFD JUMP         · 2-byte address      (case_0B46, gg1-5.s:1885)
//   0xF7 ATTACK_TURN  · 2-byte sub address  (case_0B98, gg1-5.s:1947)
//   0xF0 ATTACK_WAVE  · 2-byte sub address  (case_0955, gg1-5.s:1529)
const TOKEN_ARG_BYTES = {
    0xFD: 2,
    0xF7: 2,
    0xF0: 2,
};

// Read next segment (or dispatch token) at e.pathOffset.
// Updates vx, vy, rotRate, segTimer (or transitions e.state on token).
function loadSegment(e) {
    while (e.pathOffset < e.pathBase.length) {
        const b0 = e.pathBase[e.pathOffset];

        // Token range: 0xEF–0xFF (gg1-5.s:1475 — cp #0xEF; jp c)
        if (b0 >= 0xEF) {

            // Behavioural tokens that terminate the fly-in.
            //   0xFF END        · case_0E49 — make creature inactive
            //   0xFB TURN_HOME  · case_0AA0 — Z80: redirect motion toward
            //                     home then continue. Phase 3e simplifies
            //                     this to immediate snap-to-home; gives
            //                     token-bearing paths a clean termination
            //                     instead of running off-screen for ~6 s.
            if (b0 === 0xFF || b0 === 0xFB) {
                e.state    = 'formation';
                e.pathBase = null;
                e.vx       = 0;
                e.vy       = 0;
                e.rotRate  = 0;
                return;
            }

            // Everything else: no-op for now, but skip past any argument
            // bytes so .dw addresses don't get mis-read as segments.
            // Full semantics for the remaining 14 tokens come later.
            const argBytes = TOKEN_ARG_BYTES[b0] ?? 0;
            e.pathOffset += 1 + argBytes;
            continue;
        }

        // Normal 3-byte segment.
        e.vx       = nibSigned(b0 & 0x0F);
        e.vy       = nibSigned((b0 >> 4) & 0x0F);
        e.rotRate  = byteSigned(e.pathBase[e.pathOffset + 1]);
        e.segTimer = e.pathBase[e.pathOffset + 2];
        e.pathOffset += 3;
        return;
    }
    // Ran off the end without END token — defensive: deactivate.
    e.state = 'dead';
}

// ── Public launch helper ──────────────────────────────────────────────
// Put a formation enemy into a fly-in path. Looks up the enemy by its
// objectId (Z80 sprt_fmtn_hpos byte offset) and configures the flight
// state from the chosen path's variant.
//
// Will be called by:
//   - spawnTestEnemy() below (phase 3b test harness)
//   - launchAttackWave (phase 3c, when wave-launcher is wired)
//
// Returns the enemy object on success, or null if the ID isn't found,
// the enemy is already flying, or the path index isn't ported.
export function launchEnemy(state, objectId, pathIndex) {
    const path = getPathByIndex(pathIndex);
    if (!path) return null;

    const e = state.enemies.find(en => en.objectId === objectId);
    if (!e || e.state === 'flying') return null;

    e.state      = 'flying';
    e.x          = path.startX;
    e.y          = path.startY;
    e.vx         = 0;
    e.vy         = 0;
    e.angle      = path.startAngle;
    e.rotRate    = 0;
    e.pathBase   = path.bytes;
    e.pathOffset = 0;
    e.segTimer   = 0;             // 0 → load first segment on tick 0
    return e;
}

// ── Per-tick interpreter ───────────────────────────────────────────────
// (Phase 3c: launchAttackWave drives spawning now — no auto test spawn.)
export function update(state) {
    for (const e of state.enemies) {
        if (e.state !== 'flying') continue;

        // Step 1: decrement segment timer (Z80: dec 0x0D(ix))
        if (e.segTimer > 0) e.segTimer -= 1;

        // Step 2: if timer hit 0, load next segment (may transition to dead)
        if (e.segTimer === 0) {
            loadSegment(e);
            if (e.state !== 'flying') continue;
        }

        // Step 3: add rotation rate to angle (10-bit wrap)
        e.angle = (e.angle + e.rotRate + 1024) & 0x3FF;

        // Step 5: apply velocity — alternate X / Y by frame parity.
        // Matches Z80 gg1-5.s:2150–2234 — gives effective ½-rate per axis.
        if (state.frameCount & 1) {
            e.y += e.vy;
        } else {
            e.x += e.vx;
        }
    }
}
