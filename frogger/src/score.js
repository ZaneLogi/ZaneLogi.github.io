// score.js — the running total, the awards, and the single extra life (§6).
// Hop points are forward-progress-only (a new furthest row), which prevents farming.
import { SCORE } from './constants.js';

export class Score {
  constructor() { this.reset(); }

  reset() { this.value = 0; this.furthestRow = 0; this._extraGiven = false; this.grantedLife = false; }

  add(points) { this.value += points; this._checkExtra(); }

  // A new frog re-earns its hop points from the start row — reset the furthest-row gate without
  // touching the running total (unlike reset(), which is a whole new game).
  newFrog() { this.furthestRow = 0; }

  hop(row) { if (row > this.furthestRow) { this.furthestRow = row; this.add(SCORE.HOP); } }
  home() { this.add(SCORE.HOME); }
  bonus() { this.add(SCORE.BONUS); }
  allHomes() { this.add(SCORE.ALL_HOMES); }

  // Sets grantedLife once when the threshold is first crossed; Game consumes it.
  _checkExtra() {
    if (!this._extraGiven && this.value >= SCORE.EXTRA_LIFE) { this._extraGiven = true; this.grantedLife = true; }
  }
}
