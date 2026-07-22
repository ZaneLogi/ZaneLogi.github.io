// homes.js — the five bays: occupancy, the landing test, the bonus-insect bay item, and the win
// check (§6, §3.4). A filled bay shows frog_home_0 (smile); on the win, RoundClear redraws all
// five as frog_home_1 (laugh), one-by-one (§10, step 7). Only the level-1 bonus insect lives here
// now; the crocodile-head bay hazard (from L2) and the escorted lady-frog's arrival land with the
// level ramp / river timed events.
import { HOMES, SCREEN, ROWS, TIMED } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

// The home-landing y (32): where a filled frog / the bonus insect sits in the bay — the same spot
// the arriving frog occupies at row MAX_ROW, so the frog "becomes" the smiling home frog in place.
const CONTENT_Y = ROWS.ANCHOR_Y[ROWS.MAX_ROW];

export class Homes {
  constructor() { this.filled = new Array(HOMES.COUNT).fill(false); this.itemBay = -1; }

  reset() { this.filled.fill(false); this.itemBay = -1; }

  // The landing test (§6): the frog's centre must fall within ±LAND_TOLERANCE px of a bay centre
  // AND the bay be empty — then it fills the bay. Landing there while the bonus insect is present
  // is a 'pickup' (home + bonus). Otherwise the frog hit a divider or an occupied bay → 'death'.
  /** @param {number} centreX  the frog's centre x @returns {'home'|'pickup'|'death'} */
  land(centreX) {
    for (let bay = 0; bay < HOMES.BAY_CENTERS.length; bay++) {
      if (Math.abs(centreX - HOMES.BAY_CENTERS[bay]) > HOMES.LAND_TOLERANCE) continue;
      if (this.filled[bay]) return 'death';                            // landed on an occupied bay
      this.filled[bay] = true;
      if (this.itemBay === bay) { this.itemBay = -1; return 'pickup'; } // ate the bonus insect
      return 'home';
    }
    return 'death';                                                     // between bays — a divider
  }

  // The bonus-insect bay item (§3.4): it walks the five bays on the T_BAY timer in the fixed
  // BAY_ORDER, skipping any bay already filled (no insect shows there that step). Level 1 is
  // always the insect; the L2 insect / crocodile alternation lands with the level ramp.
  /** @param {number} frame  the global tick counter */
  update(frame) {
    const bay = TIMED.BAY_ORDER[Math.floor(frame / TIMED.T_BAY) % HOMES.COUNT];
    this.itemBay = this.filled[bay] ? -1 : bay;
  }

  allFilled() { return this.filled.every(Boolean); }

  // The home-row hedge (§3.1) + the filled smiling frogs + the bonus insect. hedge_0 is a 32 px
  // bay unit (a bay opening in its middle) centred on each bay, gaps filled with 8 px hedge_1;
  // each opening's black is transparent → a black bay until a frog fills it. Filled frogs and the
  // insect draw on top, seated in the openings.
  /** @param {Renderer} renderer */
  render(renderer) {
    const covered = (x) => HOMES.BAY_CENTERS.some((c) => x >= c - 16 && x < c + 16);
    for (let x = 0; x < SCREEN.WIDTH; x += 8) {
      if (!covered(x)) renderer.drawSprite('hedge_1', x, HOMES.BAY_Y);
    }
    for (const c of HOMES.BAY_CENTERS) renderer.drawSprite('hedge_0', c - 16, HOMES.BAY_Y);
    HOMES.BAY_CENTERS.forEach((c, bay) => {
      if (this.filled[bay]) renderer.drawSprite('frog_home_0', c - 8, CONTENT_Y);
    });
    if (this.itemBay >= 0) {
      renderer.drawSprite('bonus', HOMES.BAY_CENTERS[this.itemBay] - 8, CONTENT_Y);
    }
  }
}
