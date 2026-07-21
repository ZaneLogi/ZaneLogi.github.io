// homes.js — the five bays: occupancy, the landing test, the bonus insect + the bay
// crocodile-head hazard, the escorted lady-frog's arrival, and the win check (§6, §3.4).
// A filled bay shows frog_home_0 (smile); on the win, RoundClear redraws all five as
// frog_home_1 (laugh), one-by-one (§10).
import { HOMES } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Homes {
  constructor() { this.filled = new Array(HOMES.COUNT).fill(false); }

  reset() { this.filled.fill(false); }

  // TODO(impl): the frog's centre must fall within ±6 px of a bay centre AND the bay be empty,
  // else it hit a divider / a filled bay / an open croc-head → death. Returns the outcome.
  land(frogX) { return null; }

  allFilled() { return this.filled.every(Boolean); }

  // TODO(impl): hedge (hedge_0 bay units + hedge_1 fillers), frog_home_0 per filled bay,
  // the bay item (bonus insect / crochead_0·1), §3.4.
  /** @param {Renderer} renderer */
  render(renderer) {}
}
