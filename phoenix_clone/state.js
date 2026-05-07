// Mutable game state. Field names mirror Phoenix source RAM labels where
// possible (research_code_flow.md §5.3, RAMUse.md). Game-object data lives
// on the objects themselves (research_rendering.md §4).

export const state = {
    init() {
        // RAM-labeled fields ($43xx region)
        this.gameOrAttract = 1;       // $43A2 — 0=attract, 1=game; force game for skeleton
        this.gameState     = 0;       // $43A4 — 8-state machine
        this.counterA5     = 0;       // $43A5 — state-1 frame countdown
        this.counter9a     = 0;       // $439A — free-running frame counter
        this.levelAndRound = 0;       // $43B8 — low nibble = JT4 stage index

        this.player1Lives  = 3;       // $4390
        this.player2Lives  = 0;       // $4391

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
    },
};
