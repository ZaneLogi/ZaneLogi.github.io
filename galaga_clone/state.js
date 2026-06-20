// Shared mutable game state — analogous to Galaga's shared RAM.
// All tasks read and write from this object.

import { getObjectIdForSlot } from './paths.js';

// ── Formation home-position tables (db_fmtn_hpos_orig, gg1-2.s:949) ──────────
// X conversion (verified against harbaum/galagino): canvas_X = sprite_X − 16.
//   Column sprite X from ROM: [0x31,0x41,...,0xC1] = [49,65,...,193]
//   Column canvas X after −16 offset: [33, 49, 65, 81, 97, 113, 129, 145, 161, 177].
//
// Y conversion (also harbaum/galagino — see paths.js rawYToCanvasY):
// canvas_Y = sprite_Y_byte − 40 (formation has bit 8 = 0).
//   Row sprite_Y from c_12C3 conversion: ~(rawY+0x4F) & 0xFF, then ×2.
//   Row sprite_Y values: 60, 76, 92, 104, 116, 128 (one per row 0-5).
//   Row canvas_Y after −40 offset: 20, 36, 52, 64, 76, 88.
const _COL_X = [33, 49, 65, 81, 97, 113, 129, 145, 161, 177];
const _ROWS = [
    { y: 20, type: 'boss',      cols: [3,4,5,6]              },
    { y: 36, type: 'boss',      cols: [3,4,5,6]              },
    { y: 52, type: 'butterfly', cols: [0,1,2,3,4,5,6,7,8,9] },
    { y: 64, type: 'butterfly', cols: [0,1,2,3,4,5,6,7,8,9] },
    { y: 76, type: 'wasp',      cols: [0,1,2,3,4,5,6,7,8,9] },
    { y: 88, type: 'wasp',      cols: [0,1,2,3,4,5,6,7,8,9] },
];

function buildEnemies() {
    const list = [];
    for (let ri = 0; ri < _ROWS.length; ri++) {
        const row = _ROWS[ri];
        for (const ci of row.cols) {
            list.push({
                type:     row.type,
                alive:    true,
                hitFlag:  false,            // set by bulletUpdate, read by enemyStatus (f_1DB3)
                hits:     0,                // boss 2-hit counter: 0 = green, 1 = blue (4d-a)
                homeX:    _COL_X[ci],
                homeY:    row.y,
                colIdx:   ci,
                rowIdx:   ri,
                objectId: getObjectIdForSlot(ri, ci),  // Z80 sprt_fmtn_hpos byte offset

                // ── Motion state (step 7+, 'pending' added INT-3a,
                //                  'homing' added INT-7) ──────────────────
                // 'pending'   = alive but not yet on screen (Z80 status 0x80
                //               equivalent — enemy is "in the roster" but
                //               hasn't been spawned via fly-in yet)
                // 'flying'    = follow path bytecode; render at (x, y)
                // 'homing'    = post-FB guided approach to formation slot.
                //               Path bytecode exhausted; angle is fixed
                //               (set once at FB by atan2 to home), motion
                //               continues with last vx/vy until within
                //               HOME_THRESHOLD px of (homeX, homeY), then
                //               snaps to 'formation'. Z80 case_0AA0
                //               (gg1-5.s:1768-1846).
                // 'formation' = sit at homeX/Y + offsets (post-fly-in resting)
                // 'dead'      = no render, no logic
                //
                // Initial state is 'pending' — enemies become visible only
                // when launchEnemy (fly-in) transitions them to 'flying',
                // then to 'homing' when the path's FB fires (or directly
                // to 'formation' on FF / instant-snap edge cases).
                // Matches the Z80 model: stage starts with formation empty,
                // fly-in fills it pair-by-pair.
                state:      'pending',
                x:          0,
                y:          0,
                vx:         0,             // signed px/frame, lo-nibble of segment byte0
                vy:         0,             // signed px/frame, hi-nibble of segment byte0
                angle:      0,             // 10-bit (0–1023), 1024/circle
                rotRate:    0,             // signed, added to angle each frame
                pathBase:   null,          // Uint8Array of current path bytecode
                pathOffset: 0,             // current byte offset into pathBase
                segTimer:   0,             // frames until next segment load (0 = load now)

                // ── Bomb-drop state (step 8 phase 8d/e) ────────────────
                // Mirror of Z80 0x0E (bomb-drop counter) and 0x0F
                // (per-enemy enable bits, srl'd each cycle). Both 0 means
                // "not bombing" — F6 FREE_FLIGHT token in attack paths
                // arms them via bugMotion's loadSegment.
                bombCounter: 0,
                bombEnable:  0,

                // ── Pair-mirror flag (step 9 phase INT-2c, launcher rewrite) ──
                // Mirror of Z80 0x13(ix) bit 7 — set by launchAttackWave
                // when wave-byte bit 6 is set. Consumed by bugMotion when
                // loading each segment's rotRate (negate if true) — see
                // gg1-5.s:2014-2018. Produces mirrored arcs for pair
                // partners. NOT YET READ (bugMotion rewrite is the next
                // phase); set here so the data plumbing is correct.
                negateRotation: false,

                // ── Homing offset-tracking (the case_2422 mirror, INT-7) ──
                // While 'homing', e.x/e.y carry the formation's live offset
                // so the bug tracks the oscillating slot instead of snapping
                // to the static home then popping by oscillateX. Seeded at
                // FB, drift-followed each frame. See research_attack_paths.md
                // §5b.
                homeOscX: 0,
                homeOscY: 0,

                // ── FC dive-Y target (case_0B4E, bee dive) ─────────────
                // When armed (a canvas-Y set by the FC token), the motion
                // step force-expires the current segment once the bug dives
                // to this depth — "dive until Y, then turn for home." null =
                // not armed. Mirror of Z80 0x06(ix)+bit 5 of 0x13(ix); the
                // port keeps it separate from the homing target (homeX/Y).
                fcDiveTargetY: null,

                // ── Capture-boss state (sub-step 4) ────────────────────
                // captureDiving  — armed by the F4 token; this boss is on a
                //   capture run aiming at the player.
                // captureHalted  — set by captorDive (f_21CB) when it reaches
                //   beam position; frozen (bugMotion skips its motion) until
                //   the beam ends, then it resumes its path to retreat.
                // captureTargetX — the beam/aim X (player X clamped to a lane).
                captureDiving:  false,
                captureHalted:  false,
                captureTargetX: null,
            });
        }
    }
    return list;
}

export const state = {

    // ── Frame counter ──────────────────────────────────────────────────────
    // Mirrors ds3_92A0_frame_cts[0] — incremented every logic tick at 60 Hz.
    // Tasks use (frameCount % N) to run at sub-rates (e.g. % 4 = 15 Hz).
    frameCount: 0,

    // 'attract' | 'stageStart' | 'playing' | 'playerDying' | 'stageClear' | 'gameOver'
    // Driven by tasks/gameController.js (the JS-port state machine driver —
    // see architecture.html §5c "JS port state diagram"). INT-1 wires only
    // 'attract' and 'playing'; other states defined for future INT phases.
    gameState: 'attract',

    // ── Stage counter + difficulty rank ───────────────────────────────────
    // stage = current stage number (Z80 _b_stgctr, mirror at 0x9881).
    //         Starts at 1 — Z80 also bumps from 0 to 1 on first stage init.
    //         Stage cycling (++ on stage clear) is wired in INT-5.
    //             INT-2a: builder returns the same 3-pair wave for any stage.
    //             INT-2b: real per-stage variation from d_combat_stg_dat.
    // rank  = difficulty rank (Z80 b_mchn_cfg_rank, 0-3 from DIP switches).
    //         Default 3 = rank A (easiest, the typical Galaga DIP default).
    //         Per bmbr_stg_cfg_lut: rank 3 → sub-table 0, rank 0 → 1, etc.
    //         TODO: connect to a DIP-switch UI (step 11+).
    stage:     1,
    rank:      3,

    // ── Per-stage difficulty params (Z80 ds_new_stage_parms) ──────────────
    // 11-element Uint8Array populated by gameController.stgInitEnv via
    // paths.loadStageParms(state.stage, state.rank). Mirrors Z80 c_2C00.
    //   [0]    bomb-drop enable flags
    //   [1..3] bomber-type {0=boss, 1=red, 2=yellow} launch counter init
    //   [4]    max_bombers (initial cap — read by f_1B65 / runAttackMode)
    //   [5]    max_bombers_increase
    //   [6]    captured_boss flag init
    //   [7]    continuous_bomb_threshold
    //   [8]    stage 8+ attack-wave reload flag
    //   [9]    stage 8+ bombing reload flag
    //   [10]   clone-attack alien count (computed)
    newStageParms: new Uint8Array(11),

    // ── Wave-launcher state (Z80-faithful) ───────────────────────────────
    // Per research_stage_init.md §13. All naming mirrors the Z80 source
    // so the JS code reads as a port of f_2916 + l_2953_next_pair.
    //
    //   waveStream         ⇔ ds_8920 — flat byte stream built by
    //                                  buildWaveStream(stage). 0x7E
    //                                  marks wave start, 0x7F = end.
    //   waveStreamCursor   ⇔ _p_atkwav_tbl — current byte offset
    //                                        into waveStream that
    //                                        f_2916 will read next.
    //   atkWvEnbl          ⇔ _b_atk_wv_enbl — gates the launcher.
    //                                         Set true by gameController
    //                                         AFTER stage init settles
    //                                         (Z80 sets it in
    //                                         plyr_respawn_rdy, gg1-2_fx.s
    //                                         and game_ctrl.s:876).
    //   attkwvCtr          ⇔ _b_attkwv_ctr — current wave 0..4. Bumped
    //                                        each time the launcher
    //                                        consumes a 0x7E marker.
    //   bugsFlying         ⇔ b_bugs_flying_nbr — count of in-flight
    //                                            enemies. Cached here
    //                                            (recomputed by
    //                                            bugMotion each tick,
    //                                            mirroring f_08D3 at
    //                                            gg1-5.s:1428-1432).
    //                                            Used by the launcher's
    //                                            inter-wave gate.
    //   waveLauncherFlyInDone — JS-only signal for gameController to
    //                           transition stageStart → playing.
    //                           No direct Z80 counterpart; Z80's
    //                           equivalent is f_2916 disabling itself
    //                           on hitting 0x7F (gg1-3.s:1665).
    waveStream:            new Uint8Array(0),
    waveStreamCursor:      0,
    atkWvEnbl:             false,
    attkwvCtr:             0,
    bugsFlying:            0,
    waveLauncherFlyInDone: false,

    // ── Continuous-bombing flag (Z80 b_92A0[0x0A]) ────────────────────────
    // Set true when the alive-on-screen enemy count drops below the
    // per-stage threshold (newStageParms[7]) AND the player-fire task is
    // active. Z80 sets this in the VBL interrupt handler (gg1-5.s:480-489).
    // We compute it once per frame in launchAttackWave.update() — the
    // 1-frame stale read by bugMotion's FA handler is acceptable for a
    // ≤5-enemies threshold check.
    //
    // FA LOOP_TOP token (case_0BD1, gg1-5.s:1984) gates on this:
    //   contBmb=false → FA jumps to embedded address (= "go home" target)
    //   contBmb=true  → FA falls through (path continues, eventually
    //                   reaching FD JUMP that loops attack pass)
    contBmbFlag:           false,

    // ── Bomber-type timers and reloads (Z80 b_92C0[0..7]) ─────────────────
    // attackTimers: per-type countdown that fires the attack when reaching 0.
    //   Initial values set by resetWaveState from c_2C00 hardcoded constants.
    //   Indexing matches Z80 b_92C0[0..2] semantics: [0]=boss, [1]=red, [2]=yellow.
    //   Phase B+C: stored in 16-frame ticks (Z80 only DECs on frame mod 16).
    //
    // attackReloads: per-type reload value that gets copied into attackTimers
    //   each time an attack fires. Recomputed every frame by f_0857
    //   (bomberConfig task) via c_08AD/c_08BE lookups against the per-stage
    //   data + current bug count + elapsed stage time.
    //   Mirrors Z80 b_92C0[4..6].
    //
    // bombDropFlags: bomb-drop enable bitmask, recomputed by f_0857 from
    //   newStageParms[0] + bug count via c_08BE. Read by bombUpdate.
    //   Mirrors Z80 b_92C0[8].
    attackTimers:          { boss: 0, red: 0, yellow: 0 },
    attackReloads:         { boss: 2, red: 2, yellow: 2 },
    bombDropFlags:         0,

    // bmbr_boss_pool (gg1-2_fx.s:874) — up to 4 queued boss/escort launches,
    // populated by the boss launcher (tryLaunchBoss) and drained one-per-frame
    // by runAttackMode (drainBossPool), so a boss sortie peels off staggered
    // over consecutive frames. Each slot: { objectId, negate, path, entryOffset }
    // or null (null = Z80 0xFF empty sentinel). Reset by resetWaveState.
    bossPool:              [null, null, null, null],

    // ── Capture mission state (sub-step 4) ─────────────────────────────────
    // captureToggle  — _b_bmbr_boss_wingm (gg1-2_fx.s:1017): ++ each boss
    //   launch; capture is attempted only when it lands EVEN (every other
    //   launch), and only when no capture is already active.
    // captureActive  — _b_bmbr_boss_cflag (gg1-2_fx.s:1013): a capture mission
    //   is in progress (boss diving or beaming). Blocks starting another and
    //   forces escort-mode on subsequent boss launches until cleared.
    // captureBossId  — _b_bmbr_boss_cobj: objectId of the diving capture boss.
    // beam — tractor-beam render/anim state (4b), null when no beam:
    //   { x, phase, timer }. Set by captorDive (f_21CB) when the boss halts
    //   in position; advanced + drawn by tractorBeam (f_2222).
    captureToggle:         0,
    captureActive:         false,
    captureBossId:         null,
    beam:                  null,

    // ── Capture machine state (sub-step 4c/4d) ─────────────────────────────
    // Mirrors ds5_928A_captr_status's +3/+4 bytes + the rescue-stage reuse of
    // +1. The beam-render bytes (+0 beamX, +1 phase, +2 timer) live in
    // state.beam above; captureActive/captureBossId mirror the ds_plyr_actv
    // capture fields. (See research_boss_capture.md §2.)
    //   pullGate        ⇔ captr_status+3 — pull/spin active (f_20F2 / f_2000)
    //   fighterCaptured ⇔ captr_status+4 — 1 once the boss connects with the
    //                     ship (arms the slave + "FIGHTER CAPTURED", 4c-ii)
    //   rescueStage     ⇔ captr_status+1 reuse during f_2000 (0..3), 4d-c
    capture: { pullGate: 0, fighterCaptured: 0, rescueStage: 0 },

    // ── Captured-ship slave (sub-step 4c-ii) ───────────────────────────────
    // The player's captured ship, living as a dedicated object (not one of the
    // fixed 48 state.enemies — that array has no free slot 0/2/4/6 and its
    // objectIds collide with the boss-attack scans, so a separate object avoids
    // accidental auto-launch). null = none. Managed by the fighterCaptured task
    // (f_19B2): glued to its boss during carry-home, then settled above it in
    // the formation as a red ship (sprite code 7). bossId links it to its boss
    // (for the 4d rescue). Shape when set:
    //   { bossId, x, y, colIdx, rowIdx, state:'carryhome'|'formation', alive }
    capturedSlave: null,

    // TEMP dev aid: restrict runAttackMode to a subset of attack types so one
    // behavior can be judged in isolation. null = all three enabled (NORMAL
    // PLAY — moth, bee, AND boss; nothing disabled). Toggle live, e.g.
    //   window.state.debugAttackTypes = ['boss']    // boss sorties only
    //   window.state.debugAttackTypes = ['yellow']  // bees only
    //   window.state.debugAttackTypes = null        // everything
    // Remove (or leave null) before squash.
    debugAttackTypes:      null,

    // TEMP dev aid: when true, force EVERY boss launch to be a capture mission
    // (db_0454). false = the Z80's normal every-other toggle (capture + escort).
    // Currently false = NORMAL behavior. See tryLaunchBoss (launchAttackWave.js).
    debugForceCapture:     false,

    // ── Game timers ────────────────────────────────────────────────────────
    // Mirrors ds4_game_tmrs — 4 countdown bytes decremented at 2 Hz by the
    // internal tickGameTimers() in main.js (equivalent of f_1DD2).
    // Tasks set these and busy-wait: while (state.gameTimers[2] > 0) { ... }
    //   [0] general purpose
    //   [1] general purpose
    //   [2] stage timer (set to 120 at stage start)
    //   [3] short delays (set to 3, 4, 8 for brief waits)
    gameTimers: [0, 0, 0, 0],

    // ── Task enable flags ──────────────────────────────────────────────────
    // Mirrors ds_cpu0_task_actv in the Z80 source.
    // Any task can flip another task's flag, exactly as in the original.
    //
    // ★ = always-on in the original (task_enable_tbl_def = 0x01)
    tasks: {
        gameController:      true,   // JS-port state machine driver (no Z80 counterpart) — see tasks/gameController.js
        starfield:           true,   // f_1D76     — on during gameplay only
        formationOscillate:  true,   // f_2A90     — on when stage is active
        formationPulse:      false,  // f_1DE6     — on when stage is active
        objectStates:        true,   // f_23DD     ★ always on
        enemyStatus:         true,   // f_1DB3     — on when stage is active
        bombUpdate:          true,   // f_1EA4     ★ always on
        bomberConfig:        false,  // f_0857     — recomputes reload values; on during 'playing'
        launchAttackWave:    true,   // f_2916     — on when stage is active
        playerMove:          true,   // f_1F85     — on during gameplay
        playerFire:          true,   // f_1F04     — on during gameplay
        bulletUpdate:        true,   // CPU1 rckt  — on during gameplay (no CPU0 counterpart)
        bugMotion:           true,   // CPU1 f_08D3 — path interpreter for flying enemies (no CPU0 counterpart)
        captorDive:          false,  // f_21CB     — enabled when boss initiates capture
        tractorBeam:         false,  // f_2222     — enabled when boss reaches player Y
        pullShip:            false,  // f_20F2     — enabled when beam locks on ship
        fighterCaptured:     false,  // f_19B2     — enabled when the ship is captured (slave + text)
    },

    // ── Starfield control ──────────────────────────────────────────────────
    // Mirrors ds_99B9_star_ctrl in the Z80 source.
    // scrollEnable is set true when player ship is on screen, false when destroyed.
    // speed (1–4) increases with stage number (set by new_stage.s).
    starCtrl: {
        scrollEnable: false,
        speed:        1,
    },

    // ── Player ship ────────────────────────────────────────────────────────
    // Mirrors ds_sprite_posn[$62] / ds_plyr_actv in the Z80 source.
    // Spawn sprite X = 0x7A = 122 (c_133A, gg1-2.s:1058); canvas X = 122 − 16 = 106.
    // dxFlag mirrors b_92A0[3]: toggles each held frame → alternates 1/2 px step.
    player: {
        x:      106,   // canvas X = sprite_X 0x7A (=122) − 16 (hardware offset,
                       // verified against harbaum/galagino).
        y:      257,   // canvas Y derived from Z80 sprite_Y (gg1-2.s:1051-1062):
                       //   sprite_Y_byte = 0x29 = 41, sprite_ctrl bit 0 = 1
                       //   full sprite_Y = 256 + 41 = 297
                       //   canvas_Y = 297 − 40 = 257 (per harbaum formula
                       //   verified by ESP32 Galaga emulator gameplay)
                       // Player center at 257 → sprite (16×16) spans 249-265,
                       // 7-px gap above lives icons at canvas Y 272-288. ✓
        dxFlag: 0,     // toggles each held frame: first=1 px, then 1/2 px alternating
        alive:  true,

        // ── Capture / respawn (sub-step 4c) ────────────────────────────────
        // controlLocked — true during the tractor-beam pull: input ignored
        //   (ship still renders, moved + spun by pullShip / f_20F2).
        // captureFrame  — when non-null, the ship's spin sprite frame (0..6)
        //   during the pull (c_2188_ship_spin); null = normal upright [6].
        // respawnTimer  — frames until a fresh ship reappears after the ship is
        //   lost (captured or bomb-killed). Decremented + respawned by
        //   gameController (general respawn, no life-loss). 0 = not respawning.
        controlLocked: false,
        captureFrame:  null,
        respawnTimer:  0,

        // twoShip (Z80 _b_2ship, ds_plyr_actv) — dual-fighter mode after a
        // rescue: two ships side by side, double fire + hitbox (4d-c/4d-d).
        twoShip: false,
    },

    // ── Player bullets ────────────────────────────────────────────────────
    // Galaga limits to 2 simultaneous bullets — slot scan in c_1F0F
    // (gg1-2_fx.s:1873–1884). Pre-allocated; alive=false means slot is free.
    bullets: [
        { x: 0, y: 0, alive: false },
        { x: 0, y: 0, alive: false },
    ],

    // ── Enemy bombs ───────────────────────────────────────────────────────
    // Galaga has 8 bomb slots (b_8800 + 0x68..0x7F). Vector frozen at drop
    // (NOT homing). Y velocity is constant 2/3 px/frame down (so vy is
    // implicit, not stored). Pre-allocated; alive=false means slot is free.
    // See architecture.html §5b "BOMB SUBSYSTEM" for f_1EA4 details.
    bombs: Array.from({ length: 8 }, () => ({ x: 0, y: 0, vx: 0, alive: false })),

    // ── Raw input state (updated by main.js before each update tick) ───────
    // fireEdge is true on the rising edge of fire (mirrors hardware debounce
    // in the Z80 IO chip); playerFire reads it so holding Space doesn't
    // auto-repeat.
    input: {
        left:     false,
        right:    false,
        fire:     false,
        fireEdge: false,
    },

    // ── Enemy objects ──────────────────────────────────────────────────────
    // 48 enemies: 8 boss + 20 butterfly + 20 wasp.
    // Each: { type, alive, hitFlag, homeX, homeY, colIdx, rowIdx }
    enemies: buildEnemies(),

    // ── Formation movement state ───────────────────────────────────────────
    formation: {
        // f_2A90 — L/R oscillation
        oscillateX:   0,   // current pixel offset applied to all enemy X
        oscillateDir: 1,   // +1 = drifting right, -1 = drifting left
        // Z80 _b_nestlr_inh: set when the formation completes (last bug
        // home). Oscillate then coasts to center and hands off to the
        // breathing pulse f_1DE6 (gg1-3.s:1998-2031). See formationOscillate.js.
        nestlrInh:    false,

        // f_1DE6 — expand/contract pulse
        // pulseOffsets[0-9]  = per-column X offsets (cols 0-9)
        // pulseOffsets[10-15] = per-row Y offsets (rows 0-5)
        pulseOffsets: new Array(16).fill(0),
        pulseCounter: 0,   // 0x00-0x1F expanding; 0xA0-0x81 contracting
        // Live bitmap (d_1E64 row 0); rotated by formationPulse each tick.
        pulseBitmap: [0xFF,0x77,0x55,0x14,0x10,0x10,0x14,0x55,0x77,0xFF,
                      0x00,0x10,0x14,0x55,0x77,0xFF],
    },

    // ── Rendering context (set by main.js at startup) ──────────────────────
    ctx: null,
};
