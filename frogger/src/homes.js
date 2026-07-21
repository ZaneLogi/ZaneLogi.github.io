// homes.js — the five bays: occupancy, the landing test, the bonus insect + the bay
// crocodile-head hazard, the escorted lady-frog's arrival, and the win check (§6, §3.4).
// A filled bay shows frog_home_0 (smile); on the win, RoundClear redraws all five as
// frog_home_1 (laugh), one-by-one (§10).
import { HOMES, SCREEN } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Homes {
  constructor() { this.filled = new Array(HOMES.COUNT).fill(false); }

  reset() { this.filled.fill(false); }

  // TODO(impl): the frog's centre must fall within ±6 px of a bay centre AND the bay be empty,
  // else it hit a divider / a filled bay / an open croc-head → death. Returns the outcome.
  land(frogX) { return null; }

  allFilled() { return this.filled.every(Boolean); }

  // The home-row hedge (§3.1): a hedge_0 bay unit (32 px, a bay opening in its middle) centred
  // on each bay, the gaps filled with 8 px hedge_1. Each opening's black is transparent → a
  // black bay until a landed frog fills it. (frog_home_0 per filled bay + the bay item arrive
  // with steps 4 / 6.)
  /** @param {Renderer} renderer */
  render(renderer) {
    const covered = (x) => HOMES.BAY_CENTERS.some((c) => x >= c - 16 && x < c + 16);
    for (let x = 0; x < SCREEN.WIDTH; x += 8) {
      if (!covered(x)) renderer.drawSprite('hedge_1', x, HOMES.BAY_Y);
    }
    for (const c of HOMES.BAY_CENTERS) renderer.drawSprite('hedge_0', c - 16, HOMES.BAY_Y);
  }
}
