// hud.js — score / hi-score (top) + lives / timer bar / level (bottom), drawn in the monospace
// font and the 8×8 blk_* tiles (§4.1). The bottom strip renders whenever Play / Death / RoundClear
// show the live playfield.
import { HUD, LIVES } from './constants.js';

/** @typedef {import('./game.js').Game} Game */
/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Hud {
  /** @param {Game} game */
  render(game) {
    const r = game.renderer;
    // Top strip (§4.1): player label + score, hi-score.
    r.drawText('1-UP', HUD.ONE_UP[0], HUD.ONE_UP[1], '#E0E000');
    r.drawText(String(game.score.value).padStart(5, '0'), HUD.SCORE[0], HUD.SCORE[1], '#fff');
    r.drawText('HI-SCORE', HUD.HI_LABEL[0], HUD.HI_LABEL[1], '#E00000');
    r.drawText(String(game.hiScore).padStart(5, '0'), HUD.HI_VALUE[0], HUD.HI_VALUE[1], '#fff');
    // Bottom strip (§4.1): reserve lives, the timer bar, the level markers.
    this._lives(r, game.lives);
    this._timerBar(r, game.timer);
    this._level(r, game.level);
  }

  // One blk_0 frog icon per RESERVE life (lives − 1; the last life is the frog in play), left→right,
  // capped at LIVES.HUD_MAX icons so a big stack can't overrun into the level markers (§4.1).
  /** @param {Renderer} r @param {number} lives */
  _lives(r, lives) {
    const n = Math.min(lives - 1, LIVES.HUD_MAX);
    for (let i = 0; i < n; i++) r.drawSprite('blk_0', HUD.LIVES[0] + i * HUD.LIVES_STEP, HUD.LIVES[1]);
  }

  // The timer bar (§4.1): 8 px tiles, right-anchored near the TIME label and draining leftward —
  // full tiles (blk_2 green / blk_6 red in the warning phase) plus one narrowing end tile
  // (blk_3→5 / blk_7→9) for the sub-tile fraction. The partial sprites fill their right side, so
  // the draining (leftmost) tile joins seamlessly onto the full tiles to its right.
  /** @param {Renderer} r @param {import('./timer.js').Timer} timer */
  _timerBar(r, timer) {
    const [x, y] = HUD.TIMER_BAR;
    const T = HUD.TILE;
    const right = x + HUD.TIMER_W;
    const px = Math.max(0, Math.min(HUD.TIMER_W, timer.fraction() * HUD.TIMER_W));
    const full = timer.warning ? 'blk_6' : 'blk_2';
    const partial = timer.warning ? ['blk_9', 'blk_8', 'blk_7'] : ['blk_5', 'blk_4', 'blk_3']; // 2·4·6 px
    const nFull = Math.floor(px / T);
    for (let k = 0; k < nFull; k++) r.drawSprite(full, right - T * (k + 1), y);
    const frac = px - nFull * T;
    if (frac >= 1) {
      const p = frac <= 2 ? partial[0] : frac <= 4 ? partial[1] : partial[2];
      r.drawSprite(p, right - T * nFull - T, y);
    }
    r.drawText('TIME', HUD.TIME_LABEL[0], HUD.TIME_LABEL[1], '#E0E000');
  }

  // One blk_1 marker per level, growing leftward from the right edge (capped so it can't overrun
  // into the timer bar).
  /** @param {Renderer} r @param {number} level */
  _level(r, level) {
    for (let i = 0; i < Math.min(level, 12); i++) r.drawSprite('blk_1', HUD.LEVEL_END[0] - i * HUD.LEVEL_STEP, HUD.LEVEL_END[1]);
  }
}
