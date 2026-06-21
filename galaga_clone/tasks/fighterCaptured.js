// f_19B2 — captured-ship slave manager ("FIGHTER CAPTURED").
//
// Enabled by pullShip when the tractor beam connects (the ship is captured).
// While the boss flies home (db_flv_cboss) carrying the ship, this glues the
// slave to the boss; once the boss settles into the formation it settles the
// slave just above it as a red standby ship. Mirrors f_19B2 (gg1-2_fx.s:510).
//
// 4c-ii scope: carry-home glue + settle + the "FIGHTER CAPTURED" text. The slave
// is a non-firing red ship. 4d adds: the slave diving WITH its boss, the rescue
// (shoot the boss → free it → 2-ship), and shoot-slave-loses-it.

import { sprites, charCanvas } from '../gfx/resource.js';

const SLAVE_Y_OFFSET = 16;   // slave rides 16 px below the flying boss (Z80 +0x10)

// ── "FIGHTER CAPTURED" text (Z80 string idx 0x0A, gg1-2.s:1322) ────────────
// ASCII → char tile code, the c_string_out formula (gg1-2.s:1208-1217):
//   code = ascii − 0x30 ; −7 if ≥ 0x11 ; space → 0x24.
function charCode(ch) {
    if (ch === ' ') return 0x24;
    let a = ch.charCodeAt(0) - 0x30;
    if (a >= 0x11) a -= 7;
    return a;
}
const TEXT_CODES = [...'FIGHTER CAPTURED'].map(charCode);
const TEXT_PAL   = 3;                                    // char palette (verified visually)
// Z80 string position _dea 17 6 (gg1-2.s:1319): tile = playfield row R=17, col
// C=6. Tile→canvas (mrw.s:63-79): x = C*8 = 48, y = (R+2)*8 = 152. The centered
// 16-char width happens to give x=48 too; Y was a hardcoded 128 — 3 rows too
// high — corrected in the X+Y coordinate-system audit.
const TEXT_X     = (224 - TEXT_CODES.length * 8) >> 1;   // = 48 (= source col 6)
const TEXT_Y     = 152;

// ── Rescue motion (Z80 f_2000, gg1-3.s:29-194) ────────────────────────────
const RESCUE_SPIN_FRAMES = 36;   // spin duration before landing
const RESCUE_SPEED       = 2;    // px/frame for land + dock
const DOCK_OFFSET        = 16;   // rescued ship docks this far left of the player

// Drive the freed ship: spin → fly down to the player's row → slide beside it →
// 2-ship. Triggered from enemyStatus when the slave's boss is shot.
function driveRescue(state, slave) {
    const p = state.player;

    if (slave.state === 'rescue-spin') {
        slave.captureFrame = (state.frameCount >> 2) % 7;   // c_2188 tumble
        if (++slave.rescueTimer >= RESCUE_SPIN_FRAMES) {
            slave.state        = 'rescue-land';
            slave.captureFrame = null;
        }
        return;
    }
    if (slave.state === 'rescue-land') {
        if (slave.y < p.y - RESCUE_SPEED) { slave.y += RESCUE_SPEED; }
        else { slave.y = p.y; slave.state = 'rescue-dock'; }
        return;
    }
    if (slave.state === 'rescue-dock') {
        const dockX = p.x - DOCK_OFFSET;     // dock to the left of the player ship
        if      (slave.x < dockX - RESCUE_SPEED) slave.x += RESCUE_SPEED;
        else if (slave.x > dockX + RESCUE_SPEED) slave.x -= RESCUE_SPEED;
        else {
            // Docked (Z80 l_208F): the rescued ship becomes the player's 2nd
            // ship → 2-ship mode. The slave object is retired.
            state.player.twoShip          = true;
            state.player.controlLocked    = false;
            state.capture.fighterCaptured = 0;
            state.capturedSlave           = null;
            state.tasks.fighterCaptured   = false;
        }
        return;
    }
}

export function update(state) {
    const slave = state.capturedSlave;
    if (!slave) { state.tasks.fighterCaptured = false; return; }

    // 4d-c: rescue in progress (boss was shot) — spin/land/dock, ignore the
    // (now dead) boss.
    if (typeof slave.state === 'string' && slave.state.startsWith('rescue')) {
        driveRescue(state, slave);
        return;
    }

    const boss = state.enemies.find(e => e.objectId === slave.bossId);

    // Boss gone (shot). 4c-ii/4d-b: drop the slave + close the mission.
    // 4d-c replaces this with the rescue → 2-ship.
    if (!boss || !boss.alive || boss.state === 'dead') {
        state.capturedSlave           = null;
        state.capture.fighterCaptured = 0;
        state.captureActive           = false;
        state.captureBossId           = null;
        state.tasks.fighterCaptured   = false;
        return;
    }

    // The slave is GLUED to its boss: it rides the carry-home, sits above the
    // boss in formation, and DIVES WITH the boss whenever it sorties (the
    // l_1CE3 squad pairing — 4d-b: the slave follows the boss automatically, so
    // when launchAttackWave dives the boss the captured ship comes down with it).
    // Position by the boss's current state.
    const f = state.formation;
    if (boss.state === 'formation') {
        // Settled above the boss's slot, tracking the formation oscillation.
        slave.x = boss.homeX + f.oscillateX + (f.pulseOffsets[boss.colIdx] ?? 0);
        slave.y = boss.homeY - SLAVE_Y_OFFSET + (f.pulseOffsets[10 + boss.rowIdx] ?? 0);
        if (slave.state === 'carryhome') {
            // First arrival home → settle done. Z80 l_1A6A invalidates cobj
            // ONLY — it does NOT clear cflag. While a ship is held captured the
            // capture-active flag STAYS SET (one captured ship at a time): the
            // selector re-opens only on rescue / slave-loss / boss-loss, never
            // on a successful capture (f_2222 l_22E3 jumps to l_2305 before the
            // cflag=0 line). So a boss that owns a slave can't open a new beam;
            // it dives as an escort sortie bringing the slave (4d-b). The
            // slave↔boss link lives on slave.bossId from here.
            slave.state         = 'formation';
            state.captureBossId = null;   // Z80 cobj invalidate (l_1A6A); cflag stays set
        }
    } else {
        // Boss flying/homing (carry-home OR a dive sortie) → glue the slave to it.
        // NOTE (G17): the Z80 slave flies the escort path db_flv_0411 (which has
        // F6) and so can bomb in the continuous-bombing endgame; this glued model
        // never fires. On normal stages the escort sortie homes before F6, so the
        // visible behavior matches (no firing). Documented deviation.
        slave.x = boss.x;
        slave.y = boss.y - SLAVE_Y_OFFSET;
    }
}

export function render(state) {
    const ctx   = state.ctx;
    const slave = state.capturedSlave;

    if (slave && slave.alive) {
        // Red captured ship — sprite code 7 (wings-closed) normally; during the
        // rescue spin, captureFrame cycles 0..6 (c_2188 tumble).
        const frame = (slave.captureFrame != null) ? slave.captureFrame : 7;
        ctx.drawImage(sprites.shipCaptured[frame], (slave.x | 0) - 8, (slave.y | 0) - 8);
    }

    // "FIGHTER CAPTURED" while the text timer runs (Z80 game_tmrs[1], set to 6
    // at connect, ticked at 2 Hz → ~3 s).
    if (state.capture.fighterCaptured && state.gameTimers[1] > 0) {
        for (let i = 0; i < TEXT_CODES.length; i++) {
            ctx.drawImage(charCanvas(TEXT_CODES[i], TEXT_PAL), TEXT_X + i * 8, TEXT_Y);
        }
    }
}
