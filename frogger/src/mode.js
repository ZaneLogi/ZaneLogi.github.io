// mode.js — the mode contract. update and render stay separate: the fixed-timestep loop may
// run 0, 1, or 2+ updates per repaint (§6).

/** @typedef {import('./game.js').Game} Game */

export class Mode {
  /** @param {Game} game */
  constructor(game) { this.game = game; this.timer = 0; }
  enter() {}
  update() {}
  render() {}
  exit() {}
}
