import { state } from './state.js';
import { input } from './input.js';
import { scoring } from './scoring.js';
import {
    PLAYER_INIT_BLOCK,    // source T0560
    STAGE_BLOCK_INDEX,    // source T0598
    STAGE_BLOCKS,         // source $05A8/$05B4/$05C0/$05CC
    FORMATION_INDEX,      // source T063A
    ALIEN_CONTROL_INIT,   // source T1500
    ALIEN_MOVE_PTR_INIT,  // source T1520
    ALIEN_FORMATIONS,     // source T1540
    ALIEN_BIRD_PARTITION, // source T1760
    MOTION_PATH_BASE,     // source T1000
    MOTION_DIRECTIONS,    // source T1700
    ANIMATION_TABLE,      // source T16A0
    SHAPE_LSB_TABLE,      // source T1600
    PATTERN_COL_TABLE,    // source T3300
    PATTERN_ROW_TABLE,    // source T3310
    PATTERN_ADDR_TABLE,   // source T3330
    PATH_ROM_LOW,         // 0x1000-0x13FF — drift + early swoops
    PATH_ROM_HIGH,        // 0x2C00-0x2FFF — late swoops + angry patterns
} from './data.js';

// L0400 — Code.md:GameStateMachine. JT1 jump table → JS switch
// (research_code_flow.md §5.1).

// Offset of $05A8 inside the packed STAGE_BLOCKS slice (data.js exports the
// four 12-byte blocks $05A8/$05B4/$05C0/$05CC as one 48-byte array).
// STAGE_BLOCK_INDEX (source T0598) stores LSBs in the $A8..$CC range;
// subtract $A8 to get the slice index.
const STAGE_BLOCK_BASE = 0xA8;

// Per-alien path pointers carry full ROM addresses. Path data lives in two
// ROM regions: 0x1000-0x13FF (drift + early swoops T1020-T13D0) and
// 0x2C00-0x2FFF (late swoops + angry T2E00/T2E40). Dispatch on ptr range.
function getPathByte(ptr) {
    if (ptr < 0x1400) return PATH_ROM_LOW[ptr - 0x1000] ?? 0;
    return PATH_ROM_HIGH[ptr - 0x2C00] ?? 0;
}

// Return { w, h } bounding box for an alien from its controlA draw-mode bits.
// Used for AABB collision (research_rendering.md §6.1, §2.4).
function alienBox(controlA) {
    const mode = controlA & 7;
    if (mode === 1) return { w: 16, h: 8  };   // 2×1
    if (mode === 3) return { w: 8,  h: 16 };   // 1×2
    if (mode === 4) return { w: 16, h: 16 };   // 2×2
    return { w: 8, h: 8 };                      // 1×1 (mode 0)
}

// AABB overlap test (research_rendering.md §6.1).
function aabbHit(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Decode a signed-byte motion delta. T1700 packs (dx, dy) as 8-bit
// two's-complement (e.g. $FF = -1, $FC = -4).
function s8(b) {
    return b & 0x80 ? b - 0x100 : b;
}

export const states = {
    dispatch() {
        switch (state.gameState) {
            case 0: this.state0_NewGameInit(); break;
            case 1: this.state1_ScoreFlash(); break;
            case 2: this.state2_StageInit(); break;
            case 3: this.state3_Gameplay(); break;
            case 4: this.state4_PlayerExplosion(); break;
            case 5: this.state5_GameOver(); break;
            case 6: this.state6_MothershipExplosion(); break;
            case 7: this.state7_MothershipScore(); break;
        }
    },

    // L0430 — one-shot seed; arms CounterA5 and routes to state 1.
    state0_NewGameInit() {
        state.counterA5 = 0x80;       // 128-frame countdown (research_code_flow.md §5.5)
        state.gameState = 1;
    },

    // L04AC — score flash for 128 frames (CounterA5 $80 → $00). Per L04BD,
    // source also zeroes Counter9A every frame (re-incremented next tick by
    // WaitVBlankCoin), so it stays ≈0 throughout state 1. The L04B8
    // first-iteration jump to $07F0 — scroll-reg reset, ClearForeground,
    // SetBitsVideoRegister — is a no-op until steps 3 / 5 land those models.
    // L04C4 — bit 3 of (post-decrement) counterA5 toggles paint vs erase of
    // the active player's 6 score digits (~8 frames per phase, 8 flashes).
    // L04C9 CALL $06E8 (paint path only) re-paints T1800 row 0 labels — no-op
    // here since render.frame() redraws all staticTextRows every frame.
    state1_ScoreFlash() {
        state.counterA5--;
        if (state.counterA5 === 0) {
            state.gameState = 2;
            return;
        }
        if (state.counterA5 !== 0x7F) state.counter9a = 0;
        if ((state.counterA5 & 0x08) === 0) scoring.printNumber(state.gameAndDemoOrSplash);
        else                                scoring.eraseDigits(state.gameAndDemoOrSplash);
    },

    // L0515 — per-stage init, one frame. Source order:
    //   $041E SetBitsVideoRegister  → palette bit from $43B8 (TODO; canvas
    //                                 port has no $5000 register yet)
    //   GameState := 3
    //   $0580 InitGlobalLevelData   → copy 12-byte per-stage block
    //   $0547 InitPlayerDataStructure → copy T0560 → player struct
    //   $09A0                        → skipped (canvas draws from x/y direct;
    //                                 source builds screen-RAM mirror addresses)
    //   $0532 init alien data        → control states + move ptrs + positions
    //   $0A6C                        → skipped (alien screen-RAM mirror)
    //   $0506                        → TODO (clears $4392-$4397 scratch)
    //   $32B0                        → TODO (clears $4350-$437F + bird init)
    state2_StageInit() {
        state.gameState = 3;
        this.initGlobalLevelData();
        this.initPlayerDataStructure();
        this.initAlienData();
        // L0506 — clear $4392-$4397 and seed ($4394) from $4B50 MSB.
        // L32B0 — clear $4350-$437F (AlienBehaviorUpdate scratch region).
        // Source zero-fills 48 bytes; port mirrors that for every field it
        // models in this range. Critical: alienPhaseCount ($4357) MUST reset
        // here, otherwise after 3 angry waves on wave-1 the angry gate
        // (M4357 < 3) fails for the rest of the game and no further waves
        // get angry attacks.
        state.combatLane = 0;
        state.alienPathSeedHi    = (state.alienMovePtr[0] >> 8) & 0xFF;
        state.alienPathSeedLo    = 0;
        state.counter93          = 0;
        state.alienBehaviorState  = 0;  // $4350
        state.alienSwoopPatternHi = 0;  // $4351
        state.alienSwoopPatternLo = 0;  // $4352
        state.alienSwoopCount     = 0;  // $4353
        state.alienSwoopTarget   = 0xFF;// $4354 (port: 0xFF sentinel for "no target", source: 0)
        state.alienCooldown      = 0;   // $4355 — first behaviorCooldown call will L30E4-reseed
        state.alienSwoopLsb       = 0;  // $4356 — saved match key, fresh per stage
        state.alienPhaseCount     = 0;  // $4357 — angry-wave cap (was the carry-over bug)
        state.alienPhaseTimer     = 0;  // $4358 — angry-pattern countdown; 0 triggers re-seed
        state.alienCooldownTimer1 = 0;  // $4359
        state.alienCooldownTimer2 = 0;  // $435A
        state.alienCooldownTimer3 = 0;  // $435B
        state.aliensLeftFlag      = 0;  // $435E — depleted-formation sticky flag
    },

    // L0580 InitGlobalLevelData — index STAGE_BLOCK_INDEX (source T0598)
    // by stage low nibble, copy the 12-byte block at $05xx into
    // $43AB-$43B6. research_stage_structure.md §4.1.
    initGlobalLevelData() {
        const stage = state.levelAndRound & 0x0F;
        const blockOffset = STAGE_BLOCK_INDEX[stage] - STAGE_BLOCK_BASE;
        for (let i = 0; i < 12; i++) {
            state.stageBlock[i] = STAGE_BLOCKS[blockOffset + i];
        }
    },

    // L0547 InitPlayerDataStructure — source copies all 32 bytes of T0560
    // (= PLAYER_INIT_BLOCK) into $43C0 (player + bullets). Step 5 only
    // consumes the player x/y; bullet slots get wired in step 7. alive
    // stays false here — the ship doesn't appear until a combat-stage
    // handler runs PlayerUpdate (see state.player comment).
    initPlayerDataStructure() {
        state.player.x           = PLAYER_INIT_BLOCK[2];   // PlayerShipX = $64 = 100
        state.player.y           = PLAYER_INIT_BLOCK[3];   // PlayerShipY = $D8 = 216
        state.player.shieldCount = 0;
        state.player.bullet.active = false;
        state.player.bullet.x      = PLAYER_INIT_BLOCK[6]; // $00
        state.player.bullet.y      = PLAYER_INIT_BLOCK[7]; // $D0
    },

    // L0532 init alien data — three sub-routines:
    //   $05EC InitAlienControlStates → write ALIEN_CONTROL_INIT[stage]
    //                                  (controlA, controlB) to all
    //                                  AliensLeft slots (source T1500)
    //   $0650                        → write ALIEN_MOVE_PTR_INIT[stage]
    //                                  move-pattern ptr to all AliensLeft
    //                                  slots (source T1520; unused yet)
    //   $0610 InitAlienPositions     → formation table → x,y per alien
    initAlienData() {
        const stage = state.levelAndRound & 0x0F;
        const controlA = ALIEN_CONTROL_INIT[stage * 2];
        const controlB = ALIEN_CONTROL_INIT[stage * 2 + 1];
        // T1520 stores big-endian (MSB at +0, LSB at +1) — see source $0650
        // ($065B-$065D loads D from MSB then E from LSB).
        const movePtr  = (ALIEN_MOVE_PTR_INIT[stage * 2] << 8)
                       |  ALIEN_MOVE_PTR_INIT[stage * 2 + 1];

        // L0610 formation lookup. RRCA(LevelAndRound) & 0x0F selects the
        // FORMATION_INDEX (source T063A) entry; bit 0 of LevelAndRound
        // thus picks which round-row (after rotating to bit 7 it's masked
        // off). Equivalent in JS: (LevelAndRound >> 1) & 0x0F.
        const formationIdx = (state.levelAndRound >> 1) & 0x0F;
        const formationLsb = FORMATION_INDEX[formationIdx];
        // Formation table at $15xx; ALIEN_FORMATIONS starts at $1540.
        const formationOffset = formationLsb - 0x40;

        // Note: alive stays false here. In source, per-stage init only
        // writes the data structure — the aliens become visible when the
        // per-frame stage handler calls AlienDataController ($0A50) which
        // dispatches Bit3Controller. L0834 (fade-in) only calls it once
        // counterB4 drops below $15; L2000 (combat) calls it every frame.
        // Mirror that here by leaving alive=false in init and setting it
        // inside the stage handlers.
        for (let i = 0; i < state.aliensLeft; i++) {
            const a = state.aliens[i];
            a.controlA = controlA;
            a.controlB = controlB;
            a.x = ALIEN_FORMATIONS[formationOffset + i * 2];
            a.y = ALIEN_FORMATIONS[formationOffset + i * 2 + 1];
            a.alive = false;
            state.alienMovePtr[i] = movePtr;
        }
        for (let i = state.aliensLeft; i < 16; i++) {
            state.aliens[i].alive = false;
        }
    },

    // L0800 — JT4 sub-dispatch on (LevelAndRound & 0x0F).
    // research_stage_structure.md §3 maps each stage to its handler.
    state3_Gameplay() {
        const stage = state.levelAndRound & 0x0F;
        switch (stage) {
            case 0x0:
            case 0x2:
                this.stageAlienFadeIn();           // L0834
                break;
            case 0x1:
            case 0x3:
            case 0xB:
                this.stageAlienCombat();           // L2000 — stub
                break;
            // 0x4 / 0x6 / 0x8 spiral-fill ($2230) → step 9
            // 0x5 / 0x7 bird combat ($3400)      → step 9
            // 0x9 / 0xA mothership fade-ins      → step 9
        }
    },

    // L0834 — Game level 0 and 2: stars scrolling down and 'aliens fade in'.
    // CounterB4 = stageBlock[9] (= $43B4); decrements every frame. Once it
    // drops below $15, GetAnimationChrs walks E through 5 tile values; all
    // aliens get rewritten with (controlA=$08, controlB=E) each frame so
    // they appear to morph in lockstep. L0848 tail bumps the stage and
    // returns to GameState 2 once the counter hits 0.
    stageAlienFadeIn() {
        // $06F0 — TODO: update scroll register and fill background
        // (background star scrolling, step 3). Stubbed for now; the screen
        // stays black for the first ~$EA frames of stage 0.

        const counterB4 = (state.stageBlock[9] - 1) & 0xFF;
        state.stageBlock[9] = counterB4;
        if (counterB4 >= 0x15) return;

        // L085A GetAnimationChrs — control-B walks $6C → $6D → $6E → $6F → $68
        // as counterB4 drops through 4-frame phases. control-A stays $08
        // throughout (Bit3 "Draw 1×1", which writes control-B as the raw
        // tile byte — see render.js).
        let controlB;
        if      (counterB4 >= 0x11) controlB = 0x6C;
        else if (counterB4 >= 0x0D) controlB = 0x6D;
        else if (counterB4 >= 0x09) controlB = 0x6E;
        else if (counterB4 >= 0x05) controlB = 0x6F;
        else                         controlB = 0x68;

        // L05FA — rewrite (controlA, controlB) for every active alien;
        // alive=true mirrors the AlienDataController $0A50 call at $0845
        // that makes the aliens actually paint to screen RAM this frame.
        for (let i = 0; i < state.aliensLeft; i++) {
            const a = state.aliens[i];
            a.controlA = 0x08;
            a.controlB = controlB;
            a.alive = true;
        }

        // L0848 stage-clear tail.
        if (counterB4 === 0) {
            state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
            state.gameState = 2;
        }
    },

    // L2000 — combat handler for stages 1/3/B.
    //
    // Source per-frame work: PlayerUpdate ($0876), bullet-vs-alien scan
    // ($0DF0 — runs every frame, not lane-gated), then a 4-lane round-robin:
    //   lane 0: AlienDataController + AlienBehaviorUpdate + alien-vs-player
    //   lane 1: enemy-bullets + AlienMovementUpdate + L0FC0
    //   lane 2: AlienAnimationUpdate + L2560
    //   lane 3: enemy-bullets + L0A6C + L0FC0
    // JS port: movement+animation merged into lane 1 for tick-pair atomicity
    // (research_rendering.md §9.2). Lanes 2/3 are empty stubs.
    //
    // ⚠ TIMING IS INTERLOCKED — see research_enemy_motion.md §1.0.1 before
    // changing lane assignments, the movement/animation merge, or the
    // Counter93 dispatch phase in alienBehaviorUpdate. These three knobs
    // were tuned together and a change in any one can silently break the
    // others (e.g. swoops never returning to formation, controlB=0xFF
    // reaching the renderer). Verified via empirical regression 2026-05-16.
    //
    // alive=true loop mirrors AlienDataController ($0A50): in source it paints
    // aliens to screen RAM gated by Bit3Controller; here alive=true enables
    // render.js drawAlien for this frame.
    stageAlienCombat() {
        // Stage-clear check: if no aliens remain, drain the post-clear
        // counter instead of running normal combat (mirrors L2015 JZ L21BA).
        if (state.aliensLeft === 0) {
            this.stageClearUpdate();
            return;
        }

        state.player.alive = true;
        this.playerUpdate();          // L0876 — every frame, not lane-gated
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) !== 0) a.alive = true;
        }

        // Bullet-vs-alien scan: runs every frame outside the lane router
        // ($0DF0 in source, called before the lane switch at $200E).
        this.playerBulletCollision();

        const lane = state.combatLane & 3;
        state.combatLane = (state.combatLane + 1) & 0xFF;
        // ⚠ PORT-SPECIFIC LANE SWAP — see research_enemy_motion.md §6.10
        // (swoop alignment via lane-order swap):
        //   Source's L2000 has behavior on lane-0 and movement on lane-1,
        //   so behaviorCommit fires at counter93=8 BEFORE the next
        //   movement crosses the alien to a tile boundary — meaning the
        //   alien is at x%8=7 when commit writes a dx=±4 swoop pattern,
        //   producing a stuck horizontal slide (§3.5 alignment).
        //   Our port swaps: movement runs in lane-0, behavior in lane-1.
        //   This makes movement (which can advance the alien past a grid
        //   boundary) fire ONE FRAME BEFORE behaviorCommit, so commit
        //   sees alien at x%8=0 (just crossed) and the upcoming dx=±4
        //   swoop bytes can advance the ptr naturally. Replaces the
        //   x-snap workaround that was in behaviorCommit; removes the
        //   ±3 pixel jolt + drift-desync side effects.

        // L2017-L202A — depleted-formation flag latch + dispatch select.
        // Source: when AliensLeft<5 AND masked counter==0, set $435E:=$FF.
        // Once $435E is non-zero, the router takes the L2146 path (2-state
        // bit-0 dispatch) instead of L2130 (4-state full lane round-robin).
        // The flag is sticky for the rest of the stage; cleared by L32B0's
        // zero-fill at the next state-2 init.
        if (state.aliensLeft < 5 && lane === 0) {
            state.aliensLeftFlag = 0xFF;
        }
        const depleted = state.aliensLeft < 5 && state.aliensLeftFlag !== 0;

        // Full-formation (L2130, AliensLeft≥5 or 1-frame pre-latch window):
        //   lane 0: movement + animation
        //   lane 1: behavior + collision
        //   lanes 2/3: empty (reserved for enemy fire — L2560/EnemyBulletUpdate)
        //
        // Depleted (L2146, AliensLeft<5 after latch): doubles work onto
        // lanes 2/3 by reusing the lane-0/lane-1 handlers. Preserves the
        // §1.0.1 invariant that movement fires the frame before behavior.
        //   counter 0,2 (bit-0=0): movement + animation  (port-swapped from L2190)
        //   counter 1,3 (bit-0=1): behavior + collision  (port-swapped from L21A5)
        if (lane === 0 || (lane === 2 && depleted)) {
            this.alienMovementUpdate();
            this.alienAnimationUpdate();
        } else if (lane === 1 || (lane === 3 && depleted)) {
            this.alienBehaviorUpdate();
            this.alienVsPlayerCollision();
        }
    },

    // L0DF0 — bullet-vs-alien scan. Called every frame (not lane-gated).
    // research_rendering.md §6.1.
    playerBulletCollision() {
        const b = state.player.bullet;
        if (!b.active) return;
        // Bullet bounding box: 8×8 tile at (b.x, b.y).
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ax = a.x & ~7;
            const ay = a.y & ~7;
            const { w, h } = alienBox(a.controlA);
            if (aabbHit(ax, ay, w, h, b.x, b.y, 8, 8)) {
                this.onAlienHit(a);
                b.active = false;
                break;   // one bullet hits one alien (source L0E18 breaks after first hit)
            }
        }
    },

    // L0CF4 — alien-body-vs-player collision. Runs in lane-1 of the
    // port (paired with behaviorUpdate; lane-0 in the source, but
    // lane-swapped here — see stageAlienCombat).
    //
    // ⚠ DISABLED: when this fires, `onPlayerHit` routes to gameState=4
    // (player-explosion), but our state-4 handler is just a stub that
    // re-spawns after 128 frames — there's no lives counter, no
    // explosion sprite, no proper game-over. Visually the player just
    // briefly vanishes and reappears, which is confusing while
    // observing swoop trajectories. Re-enable when step 9 lands the
    // lives / explosion-anim / game-over pieces.
    alienVsPlayerCollision() {
        return;
        // eslint-disable-next-line no-unreachable
        if (!state.player.alive) return;
        const px = state.player.x & ~7;
        const py = state.player.y;
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ax = a.x & ~7;
            const ay = a.y & ~7;
            const { w, h } = alienBox(a.controlA);
            if (aabbHit(ax, ay, w, h, px, py, 16, 16)) {
                this.onPlayerHit();
                return;   // one hit per lane-0 tick is enough
            }
        }
    },

    // Called when a player bullet hits an alien (bullet-vs-alien path).
    // Clears the alien's draw-enable bit, decrements aliensLeft, adds score.
    onAlienHit(alien) {
        alien.controlA &= ~0x08;   // Bit4Controller delete path clears this in source
        alien.alive = false;
        state.aliensLeft = Math.max(0, state.aliensLeft - 1);
        // TODO: look up per-alien score from source score table (L0E10 path).
        // Placeholder: 50 points per kill.
        scoring.addPoints(50, state.gameAndDemoOrSplash);
    },

    // Called when the player ship is hit (alien body or enemy bullet).
    // Minimal stub: hide ship, arm explosion timer, route to state 4.
    onPlayerHit() {
        state.player.alive = false;
        state.playerExplosionTimer = 128;   // ~2 s at 60 Hz
        state.gameState = 4;
    },

    // L21BA — post-stage-clear countdown. Decrements stageBlock[11] ($43B6)
    // each tick; when it drops below $A0, advances to the next stage via GameState=2.
    // research_enemy_motion.md §8.
    stageClearUpdate() {
        const cnt = (state.stageBlock[11] - 1) & 0xFF;
        state.stageBlock[11] = cnt;
        if (cnt >= 0xA0) return;

        state.gameState = 2;
        state.player.shieldCount = 0;
        state.levelAndRound = (state.levelAndRound + 1) & 0xFF;

        // ⚠ STEP 8D STOP-GAP: stages 4-A (spiral-fill, bird combat, mothership)
        // are not implemented yet (step 9 territory). Without this wrap, LR
        // advances to 4 after the wave-2 combat clear and state3_Gameplay's
        // switch falls through with no work → screen "freezes". For now,
        // skip stages 4-F back to stage 0 of the next round so play continues.
        // Remove this block when step 9 lands.
        if ((state.levelAndRound & 0x0F) >= 4) {
            state.levelAndRound = (state.levelAndRound + 0x10) & 0xF0;
        }

        // T1760[(LevelAndRound >> 1) & 7]: positive → alien count; bit 7 set → bird count.
        const waveIdx = (state.levelAndRound >> 1) & 7;
        const waveByte = ALIEN_BIRD_PARTITION[waveIdx];
        if (waveByte & 0x80) {
            state.birdsLeft  = waveByte & 0x7F;
            state.aliensLeft = 0;
        } else {
            state.aliensLeft = waveByte;
            state.birdsLeft  = 0;
        }
    },

    // L0D1C / L0D30 — AlienMovementUpdate. Walks 16 alien slots; for
    // each: read current path byte from `getPathByte(ptr)`, look up
    // MOTION_DIRECTIONS[idx*2..+1] for (dx, dy), apply to (x, y). When
    // the post-update coordinate's low 3 bits go zero (8-pixel grid
    // line crossed), advance the path pointer one byte. End-of-list
    // reset is handled by alienAnimationUpdate (matches source —
    // L0DDE only fires from $0D86, never from $0D30).
    //
    // Three branches based on whether dx, dy, or both are zero — the
    // grid-cross test runs against the *coordinate that was actually
    // updated last*. Mirrors source:
    //   default (both nonzero):    update X then Y, test Y  ($0D55)
    //   dx == 0   ($0D43 → $0D4F): update Y only,  test Y  ($0D55)
    //   dy == 0   ($0D48 → $0D5E): update X only,  test X  ($0D62)
    //
    // Runs in lane-0 of stageAlienCombat (port-side lane swap — source
    // runs this in lane-1). Critical that movement runs BEFORE
    // behaviorUpdate (lane-1) within each 4-frame cycle so commits
    // happen the frame after a grid crossing — see stageAlienCombat
    // comment and research_enemy_motion.md §3.5 for why.
    // ⚠ Timing-sensitive: research_enemy_motion.md §1.0.1.
    alienMovementUpdate() {
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            const ptr = state.alienMovePtr[i];
            const idx = getPathByte(ptr);
            const rawDx = MOTION_DIRECTIONS[idx * 2];
            const rawDy = MOTION_DIRECTIONS[idx * 2 + 1];
            const dx = s8(rawDx);
            const dy = s8(rawDy);
            let crossed;
            if (rawDy === 0) {
                a.x = (a.x + dx) & 0xFF;
                crossed = (a.x & 7) === 0;
            } else if (rawDx === 0) {
                a.y = (a.y + dy) & 0xFF;
                crossed = (a.y & 7) === 0;
            } else {
                a.x = (a.x + dx) & 0xFF;
                a.y = (a.y + dy) & 0xFF;
                crossed = (a.y & 7) === 0;
            }
            if (crossed) state.alienMovePtr[i] = (ptr + 1) & 0xFFFF;
        }
    },

    // L0D70 / L0D86 — AlienAnimationUpdate. Walks 16 alien slots; for
    // each: read current path byte; if 0 (end-marker), reset pointer to
    // (alienPathSeedHi, alienPathSeedLo) per L0DDE and re-read. Then
    // look up ANIMATION_TABLE[pathByte*3 .. +2] = (drawMode, calcStyle,
    // t1600Base). Compute SHAPE_LSB_TABLE offset based on calcStyle
    // (XY/X/Y bits of alien position), write the looked-up byte to
    // controlB, and OR drawMode into controlA's low 3 bits — note that
    // the draw mode itself can change per path step (e.g. 2×1 horizontal
    // drift switches to 2×2 during diagonal swoops).
    //
    // Runs in lane-0 of stageAlienCombat after alienMovementUpdate
    // (port-side lane swap — see stageAlienCombat comment). Source
    // runs animation in lane-2.
    // ⚠ Timing-sensitive: research_enemy_motion.md §1.0.1.
    alienAnimationUpdate() {
        for (let i = 0; i < 16; i++) {
            const a = state.aliens[i];
            if ((a.controlA & 0x08) === 0) continue;
            let ptr = state.alienMovePtr[i];
            let pathByte = getPathByte(ptr);
            if (pathByte === 0) {
                // L0DDE — reset to per-stage path seed (always T1000 / formation drift).
                ptr = ((state.alienPathSeedHi << 8) | state.alienPathSeedLo) & 0xFFFF;
                state.alienMovePtr[i] = ptr;
                pathByte = getPathByte(ptr);
            }
            const drawMode  = ANIMATION_TABLE[pathByte * 3];
            const calcStyle = ANIMATION_TABLE[pathByte * 3 + 1];
            const t1600Base = ANIMATION_TABLE[pathByte * 3 + 2];
            // Calc-style decode mirrors $0DA7-$0DAE: RRCA twice; first
            // carry (bit 0) → XY mode, second carry (bit 1) → X mode,
            // else (bit 2) → Y mode. Order matters when multiple bits
            // are set (e.g. $03 picks XY because bit 0 is checked first).
            // The sub-position bits select one of N pre-shifted tile
            // variants. Drawing strategy in the port (per drawMode):
            //   1 (2×1) / 3 (1×2): snap-draw at (x & ~7, y & ~7) — the
            //     variant tile content carries the sub-pixel offset.
            //   4 (2×2):           draw at exact (x, y), with a port-
            //     specific full-sprite substitution when the variant
            //     has partial (zero) tiles — see render.js drawAlien
            //     case 4 and research_rendering.md §2.5.
            let off;
            if      (calcStyle & 0x01) off = (a.x & 0x04) + ((a.y >> 1) & 0x03) + t1600Base;
            else if (calcStyle & 0x02) off = ((a.x >> 1) & 0x03) + t1600Base;
            else                       off = ((a.y >> 1) & 0x03) + t1600Base;
            a.controlA = (a.controlA & 0xF8) | (drawMode & 0x07);
            a.controlB = SHAPE_LSB_TABLE[off & 0xFF];
        }
    },

    // $30AA — pseudo-random 4-bit value. Uses Counter9A high byte ($439A)
    // rotated left 3 bits, low 3 bits added to PlayerX, masked to 0x0F.
    getRandomNumber() {
        const lo  = state.counter9a & 0xFF;          // $439B — LSB, changes every frame
        const rot = ((lo << 3) | (lo >> 5)) & 0xFF;
        return ((rot & 7) + state.player.x) & 0x0F;
    },

    // L3074 — level-based timing factor C (≈24–31 for stage 1, round 0).
    // Used by L305C to seed the angry-pattern phase timer M4358.
    computeLevelFactor() {
        const lr = state.levelAndRound & 0xFF;
        // Step 1: RRCA on LR → low 3 bits → 7 minus that
        const r1 = ((lr >> 1) | ((lr & 1) << 7)) & 0xFF;
        let   c  = 7 - (r1 & 7);
        // Step 2: high nibble of LR (capped at $70) → 7 minus that, add to C
        const a2 = lr < 0x80 ? lr : 0x70;
        c       += 7 - ((a2 >> 4) & 7);
        // Step 3: AliensLeft contribution
        const al = state.aliensLeft;
        c       += al >= 5 ? (al - 5) : 0x10;
        // Step 4: random jitter 0–7
        c       += this.getRandomNumber() & 7;
        return c & 0xFF;
    },

    // L3000 — AlienBehaviorUpdate. Increments Counter93, dispatches on
    // (Counter93 & 7) via the T3018 jump table to one of 8 sub-states.
    // Runs in lane-1 of stageAlienCombat (port-side lane swap — source
    // runs this in lane-0). The swap puts movement BEFORE behavior
    // each 4-frame cycle, so any commit fires the frame AFTER an alien
    // crossed a grid boundary — that alignment is what lets dx=±4 swoop
    // bytes advance their ptr (research_enemy_motion.md §3.5 / §6).
    // research_enemy_motion.md §6 covers the per-sub-state logic.
    //
    // ⚠ Counter93 dispatch phase is post-increment in the port and is NOT
    // source-faithful (source is pre-increment: LD A,(HL); INC (HL); AND
    // $07). The deviation is intentional — it is part of the interlocked
    // timing tuning explained in research_enemy_motion.md §1.0.1. Do not
    // "fix" this to match source without re-validating the lane swap; a
    // change here reproduces an "aliens never return to formation" bug.
    alienBehaviorUpdate() {
        state.counter93 = (state.counter93 + 1) & 0xFF;
        switch (state.counter93 & 7) {
            case 0: this.behaviorCommit();       break;  // L3264
            case 1: this.behaviorAngryPattern(); break;  // L3028
            case 2: this.behaviorCooldown();     break;  // L30BA stub
            case 3: this.behaviorSwoopCount();   break;  // L3124
            case 4: this.behaviorPickAlien();    break;  // L315A
            case 5: this.behaviorPickPattern();  break;  // L31B4
            case 6: this.behaviorScanAdvance(); break;  // L322C
            case 7: break;                               // L3012 RET
        }
    },

    // L3028 — angry-pattern two-level timer (sub-state 1).
    // Up to 3 angry attacks per round; each sends all 16 aliens on T2E00/T2E40.
    // Timer seed: M4357*4 + computeLevelFactor() + 7 (L305C).
    behaviorAngryPattern() {
        if (state.alienPhaseCount >= 3 || state.alienBehaviorState >= 4) return;
        if (state.alienPhaseTimer === 0) {
            const c = this.computeLevelFactor();
            state.alienPhaseTimer = ((state.alienPhaseCount << 2) + c + 7) & 0xFF;
            return;
        }
        state.alienPhaseTimer--;
        if (state.alienPhaseTimer !== 0) return;
        state.alienPhaseCount++;
        state.alienBehaviorState  = 4;
        state.alienSwoopCount     = 16;
        state.alienSwoopTarget    = 0x50;
        state.alienSwoopPatternHi = 0x2E;
        state.alienSwoopPatternLo = (state.player.x & 1) ? 0x00 : 0x40;
    },

    // L30BA — cooldown timers (sub-state 2). Source-faithful port.
    //
    // Pipeline:
    //   1. Tick down 3 secondary timers ($4359/$435A/$435B) unconditionally
    //      via L30DA — these gate the C-rotation in L30E4's reseed.
    //   2. If alienBehaviorState != 0, return (pipeline busy).
    //   3. If primary cooldown ($4355) == 0, call L30E4 to reseed it.
    //   4. Otherwise decrement primary cooldown; if it hits 0, set
    //      alienBehaviorState = 1 to kick off the swoop pipeline.
    //
    // The reseed (L30E4) computes:
    //   C = computeLevelFactor() + (0x0F - clamp(Counter9A high byte, 0x0F))
    //   For each of {$4359, $435A, $435B}: if the slot is 0, rotate C right
    //     by 1; for the FIRST 0-slot encountered (B starts at 1), also write
    //     0x0C into it.
    //   alienCooldown = ((C >> 2) & 0x3F) + 1
    //
    // Net behavior at stage 1: primary cooldown values in roughly 1-12
    // range, giving 1-12 case-2 firings (= 32-384 frames = ~0.5-6.4s)
    // between successive swoop pipeline kicks. Matches arcade pacing
    // (1-4 s typical) and varies with Counter9A and level.
    behaviorCooldown() {
        // L30DA × 3 — tick secondary timers unconditionally (decrement if non-zero).
        if (state.alienCooldownTimer1 !== 0) state.alienCooldownTimer1--;
        if (state.alienCooldownTimer2 !== 0) state.alienCooldownTimer2--;
        if (state.alienCooldownTimer3 !== 0) state.alienCooldownTimer3--;

        if (state.alienBehaviorState !== 0) return;          // pipeline busy

        if (state.alienCooldown === 0) {
            this.cooldownReseed();                            // L30E4
            return;
        }
        state.alienCooldown = (state.alienCooldown - 1) & 0xFF;
        if (state.alienCooldown === 0) {
            state.alienBehaviorState = 1;                     // kick off swoop pipeline
        }
    },

    // L30E4 — reseed primary cooldown $4355 from Counter9A high byte +
    // level factor, modulated by the state of the 3 secondary timers.
    // See behaviorCooldown comment for derivation; L3112 inlined here.
    cooldownReseed() {
        // L3074 — level-derived factor (≈24-31 on stage 1, round 0).
        let c = this.computeLevelFactor();
        // Counter9A high byte ($439A), clamped to max 0x0F.
        const c9aHi = (state.counter9a >> 8) & 0xFF;
        const clamped = c9aHi >= 0x10 ? 0x0F : c9aHi;
        c = (c + (0x0F - clamped)) & 0xFF;

        // L3112 × 3 inlined. B starts at 1; the FIRST 0-valued secondary
        // timer gets written to 0x0C, and B decrements (so only one slot
        // is written per reseed). C rotates right for every slot that's
        // 0 (regardless of whether it was the writable one).
        let b = 1;
        const slots = ['alienCooldownTimer1', 'alienCooldownTimer2', 'alienCooldownTimer3'];
        for (const slot of slots) {
            if (state[slot] !== 0) continue;        // RET NZ — skip when non-zero
            c = (c >> 1) & 0x7F;                    // RRCA + AND $7F
            if (b === 0) continue;                  // L3112 RET Z — skip the write
            b--;
            state[slot] = 0x0C;
        }

        // Final: $4355 = ((C >> 2) & 0x3F) + 1, range 1-64.
        state.alienCooldown = ((c >> 2) & 0x3F) + 1;
    },

    // L3124 — compute swoop count into $4353 (gates on $4350 == 1).
    // Source-faithful port. research_enemy_motion.md §6.5.
    //
    // Formula:
    //   raw = ((LevelAndRound RRCA RRCA) & 0x0F) + 5
    //   if raw >= 0x11: raw = 5            ; source RESETS to 5 (not min/cap)
    //   cap = raw - alienPhaseCount         ; angry waves shrink the cap
    //   roll = getRandomNumber + 1          ; uniform 1..16
    //   swoopCount = (roll < cap) ? roll : 1
    //
    // Stage 1 (LR=1): RRCA×2 → 0x40 & 0xF = 0 → raw = 5 → cap = 5 pre-angry,
    //   shrinking to 2 after 3 angry waves. P(swoop=1)=13/16, P(2..4)=1/16
    //   each; average ~1.4 aliens per swoop. After 3 angry waves cap=2 forces
    //   swoopCount=1 always.
    behaviorSwoopCount() {
        if (state.alienBehaviorState !== 1) return;
        state.alienBehaviorState = 2;

        const lr = state.levelAndRound & 0xFF;
        // RRCA × 2 — rotate right twice; bits 1,0 wrap to bits 7,6.
        const r1 = ((lr >> 1) | ((lr & 1) << 7)) & 0xFF;
        const r2 = ((r1 >> 1) | ((r1 & 1) << 7)) & 0xFF;
        let raw = (r2 & 0x0F) + 5;
        if (raw >= 0x11) raw = 5;
        const cap = (raw - state.alienPhaseCount) & 0xFF;

        const roll = (this.getRandomNumber() + 1) & 0xFF;   // 1..16
        state.alienSwoopCount = (roll < cap) ? roll : 1;
    },

    // L315A — pick which alien to swoop (gates on $4350 == 2).
    //
    // Source L315A walks all 16 alien slots starting from a random
    // index and picks the FIRST alien that satisfies:
    //   (controlA & 0x08) != 0       ; alive
    //   ptr.MSB == alienPathSeedHi   ; in the drift page (0x10xx)
    //   ptr.LSB == $4356             ; ptr matches saved match key
    // If no alien matches, state stays at 2 and the pipeline stalls
    // until next cycle.
    //
    // After the lane-order swap in stageAlienCombat (movement runs on
    // lane-0, BEFORE behavior on lane-1), the timing relationship
    // between alien crossings and commit firings matches what source
    // expects: aliens land at LSB == alienSwoopLsb after end-of-list
    // reset, AND alien.x%8 == 0 at commit time (because movement just
    // crossed). So both the ptr-match check and the dx=±4 alignment
    // gating happen naturally here, exactly as source intends.
    behaviorPickAlien() {
        if (state.alienBehaviorState !== 2) return;

        const matchHi = state.alienPathSeedHi;        // $4394 (= 0x10)
        const matchLo = state.alienSwoopLsb;          // $4356 (source-faithful after lane swap)
        const startIdx = this.getRandomNumber() & 0x0F;

        for (let n = 0; n < 16; n++) {
            const i = (startIdx + n) & 0x0F;
            const a = state.aliens[i];
            if (!(a.controlA & 0x08)) continue;       // skip dead
            const ptr = state.alienMovePtr[i];
            if (((ptr >> 8) & 0xFF) !== matchHi) continue;
            if ((ptr & 0xFF) !== matchLo) continue;
            // Match — pick this alien. Store target in source format.
            state.alienSwoopTarget   = 0x50 + i * 2;
            state.alienBehaviorState = 3;
            return;
        }
        // No matching alien — pipeline stalls; case-4 retries next 32-frame cycle.
    },

    // L31B4 — pick swoop pattern for the chosen alien (gates on $4350 == 3).
    // research_enemy_motion.md §6.4.
    //
    // Source-faithful port of the three-stage T3300/T3310/T3330 lookup:
    //   1. Compute |alienX - playerX| and L/R relationship (alien left or
    //      right of player). Bucket the X distance into 8 bins of 32 px.
    //   2. Stage 1: colMul4 = (T3300[bucket] + lrOffset) * 4
    //      where lrOffset = 4 if alien is LEFT of player, else 0.
    //   3. Stage 2: rowIdx = colMul4 + phaseOrYBand
    //      phaseOrYBand = Y-band (0/1/2/3 at $58/$78/$98) when swoopCount==1
    //                     alienPhaseCount (& 3) otherwise (angry waves)
    //      T3330 LSB = T3310[rowIdx]
    //   4. Stage 3: rand6 = random & 0x06 (= 0, 2, 4, or 6) selects 1 of 4
    //      pattern candidates within the row.
    //      Final pattern (MSB, LSB) = T3330[T3310_value + rand6 - 0x30] / +1
    //   Tables in port: PATTERN_COL_TABLE (T3300, 8 bytes),
    //   PATTERN_ROW_TABLE (T3310, 32 bytes — lower 16 for alien-right,
    //   upper 16 for alien-left), PATTERN_ADDR_TABLE (T3330+, 208 bytes
    //   covering byte offsets 0x30-0xFF).
    behaviorPickPattern() {
        if (state.alienBehaviorState !== 3) return;

        // Resolve alien index. Port stores raw 0-15 in alienSwoopTarget;
        // source stores $50 + i*2. Accept both formats.
        const i = state.alienSwoopTarget >= 0x50
            ? (state.alienSwoopTarget - 0x50) >> 1
            : state.alienSwoopTarget;
        const a = state.aliens[i];
        if (!a || !(a.controlA & 0x08)) {
            state.alienBehaviorState = 5;
            return;
        }

        // L/R relationship and absolute X distance.
        // Source L31C8-L31D4: if playerX >= alienX then C=4 (alien LEFT of
        // player or same X), else C=0 (alien RIGHT of player). The labels
        // can be counter-intuitive: "left of player" means alien.x < player.x.
        let lrOffset, diff;
        if (state.player.x >= a.x) {
            lrOffset = 4;                       // alien LEFT of player
            diff     = state.player.x - a.x;
        } else {
            lrOffset = 0;                       // alien RIGHT of player
            diff     = a.x - state.player.x;
        }

        // X distance bucket. Source L31D7-L31DA: RLCA×3, AND $07 — i.e.
        // bring the high 3 bits of |diff| to the low 3. Equivalent to
        // (diff >> 5) & 7 for diff < 256. 8 buckets of 32 px each.
        const bucket = (diff >> 5) & 7;

        // Stage 1: T3300[bucket] → column index, + lrOffset, × 4.
        // Max value: (3 + 4) << 2 = 28 (fits in T3310's 32-entry range).
        const colMul4 = (PATTERN_COL_TABLE[bucket] + lrOffset) << 2;

        // Stage 2 prep: phase or Y-band (source L3210).
        let phaseOrYBand;
        if (state.alienSwoopCount === 1) {
            // Y-band: thresholds match source CP $58/$78/$98 at L3210.
            const y = a.y;
            if      (y < 0x58) phaseOrYBand = 0;
            else if (y < 0x78) phaseOrYBand = 1;
            else if (y < 0x98) phaseOrYBand = 2;
            else               phaseOrYBand = 3;
        } else {
            // Multi-alien swoop (incl. angry wave): use alienPhaseCount.
            phaseOrYBand = state.alienPhaseCount & 0x03;
        }

        // Stage 2 lookup: T3310[colMul4 + phaseOrYBand] → T3330 byte offset.
        // Max idx: 28 + 3 = 31, within PATTERN_ROW_TABLE's 32 entries.
        const t3310Idx   = (colMul4 + phaseOrYBand) & 0xFF;
        const t3330Lsb   = PATTERN_ROW_TABLE[t3310Idx];

        // Stage 3: random pick (0, 2, 4, or 6) within the 4-candidate row.
        const rand6      = Math.floor(Math.random() * 256) & 0x06;

        // Final byte offset into T3330+. Source addressing uses the LSB
        // directly with H=$33; in JS we subtract 0x30 since
        // PATTERN_ADDR_TABLE starts at $3330. Max offset:
        // (0xF8 + 6) - 0x30 = 0xCE; PATTERN_ADDR_TABLE is 208 bytes (0-207).
        const t3330Off   = (t3330Lsb + rand6) - 0x30;
        const msb        = PATTERN_ADDR_TABLE[t3330Off];
        const lsb        = PATTERN_ADDR_TABLE[t3330Off + 1];

        state.alienSwoopPatternHi = msb;
        state.alienSwoopPatternLo = lsb;
        state.alienBehaviorState  = 5;
    },

    // L322C — scan-and-advance gate for angry pattern (sub-state 6).
    // Guards on M4350==4; checks every active alien's move pointer against
    // (M4394=0x10, M4356=alienSwoopLsb). Any mismatch → return early.
    // All match → M4350=6, letting behaviorCommit fire on the next case-0 tick.
    // L322C — scan-and-advance gate for angry pattern (sub-state 6).
    // Source-faithful: matches against alienSwoopLsb ($4356, saved by
    // most recent commit). After the lane-order swap in stageAlienCombat
    // (movement on lane-0, behavior on lane-1), alien ptrs naturally
    // land at LSB == alienSwoopLsb after end-of-list reset — the same
    // phase relationship the source assumes.
    behaviorScanAdvance() {
        if (state.alienBehaviorState !== 4) return;
        const matchHi = state.alienPathSeedHi;  // M4394 = 0x10
        const matchLo = state.alienSwoopLsb;    // M4356 — saved by last commit
        for (let i = 0; i < 16; i++) {
            if (!(state.aliens[i].controlA & 0x08)) continue;
            const ptr = state.alienMovePtr[i];
            if (((ptr >> 8) & 0xFF) !== matchHi || (ptr & 0xFF) !== matchLo) return;
        }
        state.alienBehaviorState = 6;
    },

    // L3264 — commit: advance $4395, then write swoop pattern pointer to matching aliens.
    // research_enemy_motion.md §6.2.
    behaviorCommit() {
        // Save old $4395 value as the match key ($4356), then cycle $4395 0-15.
        const oldLsb = state.alienPathSeedLo;
        state.alienSwoopLsb      = oldLsb;
        state.alienPathSeedLo    = (oldLsb + 1) & 0x0F;

        if (state.alienBehaviorState < 5) return;   // pipeline not yet ready

        // Source L3264: walks alienSwoopCount aliens starting at alienSwoopTarget,
        // checking each one's ptr against ($4394, $4356). Only matching aliens
        // get the new swoop pattern written. For normal swoops typically count=1
        // so a single alien is committed; for angry swoops count=16 so all are.
        //
        // Source stores $4354 as the move-ptr table LSB ($50 + i*2). Our
        // behaviorPickAlien stores the raw alien index (0-15); behaviorAngry
        // stores the sentinel $50 (= start at alien 0, since (0x50-0x50)/2 = 0).
        const matchHi  = state.alienPathSeedHi;
        const newPtr   = (state.alienSwoopPatternHi << 8) | state.alienSwoopPatternLo;
        const startIdx = state.alienSwoopTarget >= 0x50
            ? (state.alienSwoopTarget - 0x50) >> 1
            : state.alienSwoopTarget;
        const count = state.alienSwoopCount;
        for (let n = 0; n < count; n++) {
            const i = (startIdx + n) & 0x0F;
            const a = state.aliens[i];
            // NOTE: source L3264 does NOT skip dead aliens here — it only
            // checks ptr MSB/LSB. We add the bit-3 guard defensively (a
            // dead alien's ptr wouldn't normally match anyway, so this is
            // a harmless extra filter). Leaving as-is for safety; flag if
            // ever debugging an apparent "no swoop fired" with a dead
            // alien that should have been overwritten.
            if (!(a.controlA & 0x08)) continue;
            const ptr = state.alienMovePtr[i];
            if (((ptr >> 8) & 0xFF) === matchHi && (ptr & 0xFF) === oldLsb) {
                state.alienMovePtr[i] = newPtr;
                // NOTE: previously this also snapped alien.x to the
                // nearest multiple of 8 to align dx=±4 swoop bytes
                // (workaround for a phase-mismatch between commit and
                // alien crossings). That workaround caused a ±3 px
                // visual jolt and drift desync. The lane-order swap in
                // stageAlienCombat (movement on lane-0, behavior on
                // lane-1) now puts movement one frame BEFORE the
                // commit firing, so the alien crosses to x%8=0 right
                // before commit reads it — alignment is natural and
                // no snap is needed.
            }
        }
        state.alienBehaviorState = 0;
    },

    // L0876 — PlayerUpdate. Called every combat frame (not lane-gated).
    // research_player_movement.md §3.
    playerUpdate() {
        // L0900 — left/right movement. Level-checked (held = continuous).
        // Boundaries from source: DEC when X >= $0D (min reachable = $0C);
        //                         INC when X <  $C0 (max reachable = $C0).
        // Note: research doc listed $0D–$BF as valid range but the assembly
        // allows one step past each: min=$0C, max=$C0. Verify if collision
        // detection cares about the extra pixel at each edge.
        if (input.leftPressed && state.player.x >= 0x0D) {
            state.player.x = (state.player.x - 1) & 0xFF;
        } else if (input.rightPressed && state.player.x < 0xC0) {
            state.player.x = (state.player.x + 1) & 0xFF;
        }

        // L0926 + T1600 — select pre-shifted tile variant. T1600 is a non-linear
        // lookup: X%8=0→frame5, X%8=4→frame1, etc. tileBase = 0x30+(T1600[v]>>1).
        // Draw at (X & ~7, Y) so the tile content provides the sub-pixel offset.
        // Same pattern as drawAlien: snap-draw + variant content = exact pixel pos.
        const T1600 = [0x10, 0x14, 0x18, 0x1C, 0x00, 0x04, 0x08, 0x0C];
        const shape = T1600[state.player.x & 7];
        const tileBase = 0x30 + (shape >> 1);
        const p = state.player;
        p.tiles[0] = tileBase;
        p.tiles[1] = tileBase + 1;
        p.tiles[2] = tileBase + 0x10;
        p.tiles[3] = tileBase + 0x11;

        // Shield — MovePlayer ($08C4) $08D4–$08E8.
        // Source activates on CheckInputBits 1→0 transition (= barrierEdge()).
        // On activation, source CLEARS bit3 of PlayerState, routing MovePlayer
        // to DrawShields ($0AA0) on subsequent frames — skipping L0900 above.
        // ⚠ STOP: DrawShields ($0AA0) is not traced. Whether the player can
        // move while shielded depends on its internals. In the real game the
        // player CAN move during shield, so $0AA0 likely re-runs its own
        // movement. Keeping L0900 active during shield as a placeholder;
        // check DrawShields before step 9.
        if (state.player.shieldCount > 0) {
            state.player.shieldCount--;
            // DrawShields visual deferred (step 9 / mothership research).
        } else if (input.barrierEdge()) {
            state.player.shieldCount = 0xFF;   // ~4.25 s at 60 Hz
        }

        // L0930 — bullet update (runs every frame regardless of shield state;
        // called from L08A0 after MovePlayer returns, so shield doesn't gate it).
        this.playerBulletUpdate();
    },

    // L0930 + L0964 — fire and move the primary player bullet.
    // research_player_movement.md §6.
    playerBulletUpdate() {
        const p = state.player;
        const b = p.bullet;
        if (b.active) {
            // L0964: move up 8 grid units per frame; deactivate when Y < $1F.
            b.y = (b.y - 8) & 0xFF;
            if (b.y < 0x1F) b.active = false;
        } else if (input.fireEdge()) {
            // L0930 spawn: bullet X = PlayerShipX + 4, Y = PlayerShipY - 8.
            b.x = (p.x + 4) & 0xFF;
            b.y = (p.y - 8) & 0xFF;
            b.active = true;
            // TODO: use 0x50 + (b.x & 7) (T1620[X%8]) for correct sub-pixel
            // variant at spawn. Visually negligible (bullet moves too fast).
        }
    },

    // L0AEA — player explosion + respawn. Stub: wait ~128 ticks then respawn.
    // Real source: plays explosion animation, decrements lives, game-over if 0.
    state4_PlayerExplosion() {
        state.playerExplosionTimer--;
        if (state.playerExplosionTimer <= 0) {
            state.player.x     = PLAYER_INIT_BLOCK[2];
            state.player.y     = PLAYER_INIT_BLOCK[3];
            state.player.alive = true;
            state.gameState    = 3;
        }
    },
    state5_GameOver()            {},   // L0B60
    state6_MothershipExplosion() {},   // L2400
    state7_MothershipScore()     {},   // L244C

    // L002D — SplashAndDemo path; stub for skeleton (gameOrAttract forced to 1).
    attractFrame() {},
};
