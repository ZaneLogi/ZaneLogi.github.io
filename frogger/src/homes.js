// homes.js — the five bays: occupancy, the landing test, the two home-bay items (the bonus insect
// and, from level 2, the bobbing crocodile head), and the win check (§6, §3.4). A filled bay shows
// frog_home_0 (smile); on the win, RoundClear redraws all five as frog_home_1 (laugh), one-by-one
// (§10). The escorted lady-frog's arrival lands with the river timed events (LadyFrog).
import { HOMES, SCREEN, ROWS, TIMED } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

// The home-landing y (32): where a filled frog / a bay item sits — the same spot the arriving frog
// occupies at row MAX_ROW, so the frog "becomes" the smiling home frog in place.
const CONTENT_Y = ROWS.ANCHOR_Y[ROWS.MAX_ROW];

export class Homes {
  constructor() {
    this.filled = new Array(HOMES.COUNT).fill(false);
    this.itemBay = -1;        // the bonus insect's bay this frame (−1 = none)
    this.crocBay = -1;        // the crocodile head's bay this frame (−1 = none / below level 2)
    this.crocLethal = false;  // the croc head is reared up (lethal) this frame
    this.level = 1;
  }

  reset() { this.filled.fill(false); this.itemBay = -1; this.crocBay = -1; this.crocLethal = false; }

  // The landing test (§6): the frog's centre must fall within ±LAND_TOLERANCE px of a bay centre.
  // An occupied bay — or the crocodile bay while its head is up — is 'death'; a divider (no bay in
  // range) is 'death'. Otherwise the bay fills: 'pickup' on the insect's bay (home + bonus), plain
  // 'home' anywhere else (including the croc bay while the head is down).
  /** @param {number} centreX  the frog's centre x @returns {'home'|'pickup'|'death'} */
  land(centreX) {
    for (let bay = 0; bay < HOMES.BAY_CENTERS.length; bay++) {
      if (Math.abs(centreX - HOMES.BAY_CENTERS[bay]) > HOMES.LAND_TOLERANCE) continue;
      if (this.filled[bay]) return 'death';                            // occupied bay
      if (bay === this.crocBay && this.crocLethal) return 'death';     // croc head up
      this.filled[bay] = true;
      if (bay === this.itemBay) { this.itemBay = -1; return 'pickup'; }// ate the bonus insect
      if (bay === this.crocBay) this.crocBay = -1;                     // filled a head-down croc bay
      return 'home';
    }
    return 'death';                                                     // between bays — a divider
  }

  // The two home-bay items (§3.4), both derived from the frame counter. The bonus insect walks the
  // bays on the T_BAY timer in the fixed BAY_ORDER, skipping filled bays. From level 2 the crocodile
  // head takes a second bay — two steps ahead in the same order, so never the insect's — bobbing
  // head-down (safe) ↔ head-up (lethal, the last third of the T_BAYCROC cycle).
  /** @param {number} frame  the global tick counter */
  update(frame) {
    const s = Math.floor(frame / TIMED.T_BAY);
    const ibay = TIMED.BAY_ORDER[s % HOMES.COUNT];
    this.itemBay = this.filled[ibay] ? -1 : ibay;
    if (this.level >= 2) {
      const cbay = TIMED.BAY_ORDER[(s + 2) % HOMES.COUNT];
      this.crocBay = this.filled[cbay] ? -1 : cbay;
      this.crocLethal = frame % TIMED.T_BAYCROC >= TIMED.T_BAYCROC * 2 / 3;
    } else {
      this.crocBay = -1;
      this.crocLethal = false;
    }
  }

  allFilled() { return this.filled.every(Boolean); }

  // The home-row hedge (§3.1) + the filled smiling frogs + the two bay items. hedge_0 is a 32 px bay
  // unit (a bay opening in its middle) centred on each bay, gaps filled with 8 px hedge_1; each
  // opening's black is transparent → a black bay until a frog fills it. Filled frogs and the items
  // draw on top, seated in the openings.
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
    if (this.itemBay >= 0) renderer.drawSprite('bonus', HOMES.BAY_CENTERS[this.itemBay] - 8, CONTENT_Y);
    if (this.crocBay >= 0) {
      renderer.drawSprite(this.crocLethal ? 'crochead_1' : 'crochead_0', HOMES.BAY_CENTERS[this.crocBay] - 8, CONTENT_Y);
    }
  }
}
