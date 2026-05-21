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
//   0xFD JUMP            · 2-byte address  (case_0B46, gg1-5.s:1885)
//   0xFC RTN_FMTN/DIVE   · 1-byte origin Y (case_0B4E, gg1-5.s:1896)
//   0xFA LOOP_TOP        · 2-byte alt addr (case_0BD1, gg1-5.s:1984)
//   0xF8 BEAM_ON         · 1-byte Y value  (case_0B87, gg1-5.s:1935)
//   0xF7 ATTACK_TURN     · 2-byte sub addr (case_0B98, gg1-5.s:1947)
//   0xF6 FREE_FLIGHT     · 1-byte velocity (case_0BA8, gg1-5.s:1963)
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
    0xF3: 2,
    0xF0: 2,
    0xEF: 2,
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

// ── Public launch helper (fly-in) ─────────────────────────────────────
// Put a 'pending' enemy into a fly-in path. Looks up the enemy by its
// objectId (Z80 sprt_fmtn_hpos byte offset) and configures the flight
// state from the chosen path's variant.
//
// Will be called by:
//   - launchAttackWave fly-in entries (phase 3c)
//
// INT-3a: only accepts enemies in 'pending' state — fly-in is the
// "first appearance" path. Enemies that have already landed are in
// 'formation'; those use launchEnemyAttack to break formation and dive.
//
// Returns the enemy object on success, or null if the ID isn't found,
// not in 'pending' state, or the path index isn't ported.
export function launchEnemy(state, objectId, pathIndex) {
    const path = getPathByIndex(pathIndex);
    if (!path) return null;

    const e = state.enemies.find(en => en.objectId === objectId);
    if (!e || e.state !== 'pending') return null;

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

    // Phase 8e simplification: arm bomb-drop state at spawn instead of
    // waiting for the F6 FREE_FLIGHT token. The Z80 path is structured
    // to FD JUMP back to an inner loop early, keeping the enemy on-screen
    // until F6 eventually fires. We don't implement FD JUMP yet, so the
    // path runs linearly past F6's offset (34) only after the enemy has
    // already left the screen — bombs would drop into the void.
    // TODO: remove this when FD JUMP is wired (F6 will fire on time).
    e.bombCounter = 0x1E;
    e.bombEnable  = 0xFF;

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
