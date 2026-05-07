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

        // Object list — placeholder skeleton. Once tile decode lands
        // (step 1), `tiles[]` carries the per-8x8 tile indices and
        // drawObject walks them.
        this.player = {
            x: 100,                   // PlayerShipX default
            y: 216,                   // PlayerShipY default
            w: 16,
            h: 8,
            tiles: [],
        };

        this.bgScrollY = 0;           // $5800 scroll register (research_hardware.md §4)
    },
};
