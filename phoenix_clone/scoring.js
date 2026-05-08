import { state } from './state.js';

// L00C4 PrintNumber + L04F4 erase. Source writes tiles into screen-RAM at
// the active player's lowest-digit address (P1 $4261, P2 $4021), walking
// left via LeftOneColumn ($0210 — `E += 32` = one display column left).
// In the JS port the same cells live in T1800 row 2 (y=8): col 6 / col 24
// for the P1 / P2 lowest digit respectively.

const SCORE_ROW = 1;                // staticTextRows[1] = T1800 row 2 (y=8)
const RIGHTMOST_COL = [6, 24];      // P1=$4261 → col 6; P2=$4021 → col 24

// L00C4 — paint 6 BCD digits (low → high, walking left).
function printNumber(player) {
    const tiles = state.staticTextRows[SCORE_ROW].tiles;
    const right = RIGHTMOST_COL[player];
    const score = (player === 0) ? state.score1 : state.score2;
    for (let i = 0; i < 3; i++) {
        tiles[right - 2 * i    ] = 0x20 |  (score[i]       & 0x0F);
        tiles[right - 2 * i - 1] = 0x20 | ((score[i] >> 4) & 0x0F);
    }
}

// L04F4-$0505 — write 0x00 to 6 cells walking left.
function eraseDigits(player) {
    const tiles = state.staticTextRows[SCORE_ROW].tiles;
    const right = RIGHTMOST_COL[player];
    for (let i = 0; i < 6; i++) tiles[right - i] = 0;
}

// L2700 UpdateScoresAndSound. Drains the per-enemy score-pending buffer at
// $4370-$437F into Score1/Score2, then UpdateSoundControlHW + UpdateSounds.
// Buffer is empty until enemies start dying (steps 7-8) and sound is
// deferred per research_hardware.md §5 — body lands then.
function update() {
}

export const scoring = { printNumber, eraseDigits, update };
