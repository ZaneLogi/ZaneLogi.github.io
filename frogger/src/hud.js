// hud.js — score / hi-score (top) + lives / timer bar / level (bottom), drawn in the monospace
// font and the 8×8 blk_* tiles (§4.1). The bottom strip renders whenever Play / Death / RoundClear
// show the live playfield.
import { HUD } from './constants.js';

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

  // Reserve lives (§4.1): one blk_0 frog icon per reserve life (lives − 1; the last life is the frog
  // in play), left→right — up to HUD.ICON_MAX icons; beyond that the field collapses to one icon + the
  // reserve count in digits (frog then number), so a big stock stays a fixed width and can't overrun
  // the level field.
  /** @param {Renderer} r @param {number} lives */
  _lives(r, lives) {
    const reserve = lives - 1;
    const [x, y] = HUD.LIVES;
    if (reserve <= HUD.ICON_MAX) {
      for (let i = 0; i < reserve; i++) r.drawSprite('blk_0', x + i * HUD.LIVES_STEP, y);
    } else {
      r.drawSprite('blk_0', x, y);
      r.drawText(String(reserve), x + HUD.TILE + 2, y, '#fff');
    }
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

  // Level (§4.1): one blk_1 marker per level, growing leftward from the right edge — up to
  // HUD.ICON_MAX markers; beyond that the field collapses to the level number in digits + one marker
  // (number then marker), right-anchored to the screen edge so it never grows into the timer/lives.
  /** @param {Renderer} r @param {number} level */
  _level(r, level) {
    const [ex, y] = HUD.LEVEL_END;
    if (level <= HUD.ICON_MAX) {
      for (let i = 0; i < level; i++) r.drawSprite('blk_1', ex - i * HUD.LEVEL_STEP, y);
    } else {
      r.drawSprite('blk_1', ex, y);
      const s = String(level);
      r.drawText(s, ex - 2 - s.length * HUD.TILE, y, '#fff');
    }
  }
}
