// Mutable game state. Field names mirror Phoenix source RAM labels where
// possible (research_code_flow.md §5.3, RAMUse.md). Game-object data lives
// on the objects themselves (research_rendering.md §4).

import { T1800 } from './data.js';

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

        // Player ship — fg-tile shape from $1770 (player-ship-intact),
        // 4×4 tiles laid out row-major. Color-map switches (#CM1 / #CM7)
        // in the source shape are ignored for now — debug palette is
        // applied uniformly until PROM-driven palette lands.
        this.player = {
            x: 100,                   // PlayerShipX default
            y: 216,                   // PlayerShipY default
            w: 32,
            h: 32,
            tiles: [
                0xEC, 0xED, 0xEE, 0xEF,
                0xFC, 0x30, 0x31, 0xFF,
                0xFD, 0x40, 0x41, 0xFE,
                0xF4, 0xF5, 0xF6, 0xF7,
            ],
        };

        this.bgScrollY = 0;           // $5800 scroll register (research_hardware.md §4)

        // Cold-init mirror of $0008 → $0050 → $01D0 (research_code_flow.md §1).
        // The 8085 boot sequence clears VRAM/scroll/sound regs (no-op in port —
        // canvas-clear-per-frame replaces the VRAM model; sound regs not yet
        // wired) and then calls PrintTextLines on T1800 to lay down the three
        // score/coin rows. In the port that "PrintTextLines" reduces to copying
        // the parsed T1800 records (data.js, populated by build_data.py) into
        // the object-list as static FG rows. See research_rendering.md §4.3.
        this.staticTextRows = T1800.map(r => ({ ...r, w: 208, h: 8 }));
    },
};
