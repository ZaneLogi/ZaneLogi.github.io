// mode.js — the Mode contract
//
// A Mode may own a CHILD Mode and drive it with this identical protocol; that is
// the whole of the hierarchy (an HSM — no library, no second concept). Attract
// and Session both do. Flow doc §7.2/§7.3.

// update()'s return value. null = stay in this mode, DONE = I'm finished.
// A mode never names its successor — flow.js does. Flow doc §7.4(2): if modes
// returned modes, attract.js would import editor.js and editor.js would import
// attract.js, a real ES-module cycle with no build step to untangle it.
export const DONE = Symbol('done');

/**
 * @typedef {import('./game.js').Game} Game
 * @typedef {import('./renderer.js').Renderer} Renderer
 */
export class Mode {
  /** @param {Game} game  @param {object} [args] */
  constructor(game, args = {}) {
    this.game = game;
    this.args = args;
    this.sub = null;      // optional child Mode
    this.parent = null;   // set by a parent's setSub — lets a child reach shared
                          // parent state (e.g. Attract owns the title its subs draw)
  }

  enter() {}                  // once, on entry. Replaces the legacy `if (seq == 0)`.
  update() { return null }    // one logic tick @ NTSC_FPS. null | DONE.
  exit() { this.sub?.exit() } // once, on leaving.

  // 0..n times per logic tick, and it MUST NOT mutate state — the fixed-timestep
  // accumulator runs update() 0, 1 or 2+ times per repaint, so anything that
  // changes the world from in here would run a variable number of times per frame.
  // (This split is not a preference: see flow doc §7.4(1). The ROM has it too —
  // sub_DEA6_tanks_handler is deliberately OUTSIDE the $C2E6 pipeline.)
  /** @param {Renderer} renderer */
  render(renderer) { this.sub?.render(renderer) }

  // Swap the child mode. Fresh instance every entry, so state is clean BY
  // CONSTRUCTION — the "remember to reset your seq before returning DONE" bug
  // class cannot exist here. Flow doc §7.4(3).
  setSub(Cls, args = {}) {
    this.sub?.exit();
    this.sub = new Cls(this.game, args);
    this.sub.parent = this;
    this.sub.enter();
  }
}
