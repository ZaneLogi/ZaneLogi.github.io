// hud.js — score / hi-score / lives / level / timer bar, drawn in the monospace font (§4.1).
import { HUD } from './constants.js';

/** @typedef {import('./game.js').Game} Game */

export class Hud {
  /** @param {Game} game */
  render(game) {
    const r = game.renderer;
    r.drawText('1-UP', HUD.ONE_UP[0], HUD.ONE_UP[1], '#E0E000');
    r.drawText(String(game.score.value).padStart(5, '0'), HUD.SCORE[0], HUD.SCORE[1], '#fff');
    r.drawText('HI-SCORE', HUD.HI_LABEL[0], HUD.HI_LABEL[1], '#E00000');
    r.drawText(String(game.hiScore).padStart(5, '0'), HUD.HI_VALUE[0], HUD.HI_VALUE[1], '#fff');
    // TODO(impl): lives (blk_0 icons), the timer bar (blk_2..5 green / blk_6..9 red),
    // and the level markers (blk_1) — §4.1.
  }
}
