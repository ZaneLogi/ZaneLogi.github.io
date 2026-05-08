// Mutable game state. Field names mirror Phoenix source RAM labels where
// possible (research_code_flow.md §5.3, RAMUse.md). Game-object data lives
// on the objects themselves (research_rendering.md §4).

import { STATIC_TEXT_ROWS } from './data.js';

export const state = {
    init() {
        // RAM-labeled fields ($43xx region)
        this.gameOrAttract        = 1;  // $43A2 — 0=attract, 1=game; force game for skeleton
        this.gameAndDemoOrSplash  = 0;  // $43A3 — 0=P1, 1=P2 (selects active score row in state 1)
        this.gameState            = 0;  // $43A4 — 8-state machine
        this.counterA5            = 0;  // $43A5 — state-1 frame countdown
        this.counter9a            = 0;  // $439A — free-running frame counter
        this.levelAndRound        = 0;  // $43B8 — low nibble = JT4 stage index

        this.player1Lives = 3;          // $4390
        this.player2Lives = 0;          // $4391

        // $4383-$4385 / $4387-$4389 — 3-byte packed BCD (low, mid, high).
        // Each byte holds two digits; PrintNumber ($00C4) draws low-nibble
        // first then high-nibble, walking screen-RAM left.
        this.score1 = [0, 0, 0];
        this.score2 = [0, 0, 0];

        // Per-stage block — mirror of $43AB-$43B6 (12 bytes), populated by
        // InitGlobalLevelData ($0580) on each state-2 entry. Decoded byte
        // roles in research_stage_structure.md §4.1; index 9 = CounterB4
        // (alien-stage countdown), index 11 = bird/mothership countdown.
        this.stageBlock = new Uint8Array(12);

        // $43BA AliensLeft / $43BB BirdsLeft. Drive scoring + the
        // less-than-5-aliens speed-up flag, but NOT stage-clear (that's
        // counterB4 / stageBlock[9]). Defaults are written by stage-clear
        // paths from T1760; new game starts in stage 0 with 16 aliens.
        this.aliensLeft = 0x10;
        this.birdsLeft  = 0;

        // Player ship — position is now reset by InitPlayerDataStructure
        // ($0547) on every state-2 entry. Tiles are the player-ship-intact
        // shape from $1770; color-map switches (#CM1 / #CM7) in the source
        // shape are ignored for now (uniform debug palette).
        // alive=false until a combat stage handler (L2000/L3400) runs the
        // PlayerUpdate path. Mirrors source: state-2 init writes the player
        // data structure but doesn't draw; only PlayerUpdate ($0876, called
        // from L2000 and L3400) draws the ship. So during boot, score-flash,
        // state-2 init, and stage-0 fade-in (L0834 — no PlayerUpdate call)
        // the ship stays invisible. It first appears when stage 1 combat
        // begins.
        //
        // Tiles are T1400 frame #1 (`30 31 / 40 41`) — the bare regular
        // ship sprite, 2×2 = 16w × 16h. The 4×4 / 32-pixel block at T1770
        // is the SHIELDED variant; the source draws shields as a separate
        // overlay via DrawShields ($0AA0) only when the shield counter is
        // active. Source's PlayerShape = $10 (T0560 byte 1) selects T1400
        // frame #5 to handle X & 7 sub-pixel shifting; we drop that here
        // and always use frame #1 since canvas drawImage takes integer X/Y
        // (research_rendering.md §2.2).
        this.player = {
            x: 0,
            y: 0,
            alive: false,
            w: 16,
            h: 16,
            tiles: [0x30, 0x31, 0x40, 0x41],
        };

        // 16 alien slots, mirror of $4B70-$4BAF (4 bytes per alien:
        // controlA, controlB, X, Y). InitAlienControlStates ($05EC) sets
        // controlA/B from T1500; InitAlienPositions ($0610) sets x/y from
        // the T1540+ formation table chosen via T063A. controlA bit 3 =
        // draw-enabled; bits 0-2 dispatch the draw-mode (1×1 / 2×1 / 1×2 /
        // 2×2) per Bit3Controller ($0740) and T0759. See gfx.js / render.js.
        this.aliens = Array.from({ length: 16 }, () => ({
            x: 0, y: 0, controlA: 0, controlB: 0, alive: false,
        }));
        // Per-alien movement-pattern pointer (mirror of $4B50-$4B6F, 2
        // bytes per alien). Copied from T1520 by $0650 each state-2.
        // Stored as a 16-bit ROM address (high byte from T1520[i*2], low
        // byte from T1520[i*2+1]); AlienMovementUpdate ($0D1C) walks
        // MOTION_PATH_BASE at offset (ptr - 0x1000), advancing one byte
        // per 8-px grid crossing. End-of-list (path byte = 0) resets to
        // (alienPathSeedHi, alienPathSeedLo) below — see L0DDE.
        this.alienMovePtr = new Uint16Array(16);

        // L2000 4-frame round-robin counter — mirror of ($435F & 3).
        // Each combat-stage frame increments and dispatches a different
        // sub-set of work (research_enemy_motion.md §1):
        //   lane 0: draw + behavior + alien-vs-player collision
        //   lane 1: enemy bullets + AlienMovementUpdate
        //   lane 2: AlienAnimationUpdate + L2560 (enemy fire trigger)
        //   lane 3: enemy bullets + L0A6C + L0FC0
        // Step 6 only runs lanes 1 and 2 (motion + anim).
        this.combatLane = 0;

        // Path-list reset target — mirror of $4394 (MSB) / $4395 (LSB).
        // L0DDE writes these into a per-alien path pointer when its
        // current path byte is 0 (end-marker). Init'd at state-2 end by
        // copying the high byte of alienMovePtr[0] (= T1520[stage*2])
        // and clearing the low byte — mirrors L0506 ($0506-$0513).
        // For all stages T1520 = (0x10, 0x00), so the seed always points
        // at T1000 / MOTION_PATH_BASE[0]. AlienBehaviorUpdate ($3000 —
        // deferred) is what would mutate these to redirect aliens onto
        // a swoop pattern; with $3000 unported, the seed is constant.
        this.alienPathSeedHi = 0x10;
        this.alienPathSeedLo = 0x00;

        this.bgScrollY = 0;           // $5800 scroll register (research_hardware.md §4)

        // Cold-init mirror of $0008 → $0050 → $01D0 (research_code_flow.md §1).
        // The 8085 boot sequence clears VRAM/scroll/sound regs (no-op in port —
        // canvas-clear-per-frame replaces the VRAM model; sound regs not yet
        // wired) and then calls PrintTextLines on T1800 to lay down the three
        // score/coin rows. In the port that "PrintTextLines" reduces to copying
        // the parsed records (STATIC_TEXT_ROWS in data.js, T1800 in source)
        // into the object-list as static FG rows. See research_rendering.md §4.3.
        this.staticTextRows = STATIC_TEXT_ROWS.map(r => ({ ...r, w: 208, h: 8 }));
    },
};
