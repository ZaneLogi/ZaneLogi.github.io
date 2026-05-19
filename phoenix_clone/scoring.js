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

// Add `pts` (decimal) to the BCD score for `player` (0 or 1), then repaint.
// Source routes kills through a $4370-$437F buffer drained by L2700; for
// step 8 we add directly (buffer model lands with sound support).
// TODO: replace placeholder 50-point kill with per-alien score from source.
function addPoints(pts, player) {
    const score = player === 0 ? state.score1 : state.score2;
    // BCD → integer → add → BCD
    let val = (score[0] & 0x0F)
            + ((score[0] >> 4) & 0x0F) * 10
            + (score[1] & 0x0F) * 100
            + ((score[1] >> 4) & 0x0F) * 1000
            + (score[2] & 0x0F) * 10000
            + ((score[2] >> 4) & 0x0F) * 100000;
    val = Math.min(val + pts, 999999);
    score[0] = ((Math.floor(val / 10) % 10) << 4) | (val % 10);
    score[1] = ((Math.floor(val / 1000) % 10) << 4) | (Math.floor(val / 100) % 10);
    score[2] = ((Math.floor(val / 100000) % 10) << 4) | (Math.floor(val / 10000) % 10);
    printNumber(player);
}

// L0367 UpdateLivesScreen. Source writes a single character tile at
// $42A2 (P1) and $4062 (P2) where tile = lives | $20 (so lives=3 → tile
// $23 = digit "3"). The pre-shifted ship icon ($7F) is laid down once
// by T1800 row 2 at the adjacent cell and never overwritten.
//
// Port cell mapping (display_col = 25 - source_col, row stays):
//   source $42A2 (col 21, row 2) → STATIC_TEXT_ROWS[2].tiles[4]   (P1)
//   source $4062 (col  3, row 2) → STATIC_TEXT_ROWS[2].tiles[22]  (P2)
// Adjacent $7F ship icons already live at tiles[3] / tiles[21].
function updateLivesScreen() {
    const tiles = state.staticTextRows[LIVES_ROW].tiles;
    tiles[LIVES_COL_P1] = 0x20 | (state.player1Lives & 0x0F);
    tiles[LIVES_COL_P2] = 0x20 | (state.player2Lives & 0x0F);
}
const LIVES_ROW    = 2;     // staticTextRows[2] = T1800 row 3 (y=16)
const LIVES_COL_P1 = 4;
const LIVES_COL_P2 = 22;

// L2700 UpdateScoresAndSound. Drains the per-enemy score-pending buffer at
// $4370-$437F into Score1/Score2, then UpdateSoundControlHW + UpdateSounds.
// Buffer model and sound deferred per research_hardware.md §5.
function update() {
}

export const scoring = { printNumber, eraseDigits, addPoints, updateLivesScreen, update };
