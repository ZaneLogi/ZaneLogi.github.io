// collision.js — the rules: for the frog's current row, decide safe / ride / drown / squash /
// home / pickup by span overlap against that row's objects (§6). Skipped for the single frame
// a hop is in progress; resolved against last frame's drawn positions (§7 step 3).

/** @typedef {import('./frog.js').Frog} Frog */
/** @typedef {import('./playfield.js').Playfield} Playfield */

export class Collision {
  // TODO(impl): span-overlap arithmetic per band (river carry/drown, road squash, homes land).
  /** @param {Frog} frog @param {Playfield} playfield */
  resolve(frog, playfield) { return 'safe'; }
}
