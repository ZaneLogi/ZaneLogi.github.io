// mode.js — the Mode contract
//
// The game is a mode machine. The ROM is NOT: its screen flow has no state
// variable and no dispatcher (unlike the tank_flags machine, map §4). Each phase
// there is a subroutine owning a sub_D8F6_wait_1_frm loop, and the non-linear
// transitions pop the return address off the 6502 stack (PLA/PLA) and JMP.
//
// That is 6502 plumbing, not the design, so it is RE-EXPRESSED here, not mirrored:
// mimicking it would buy a byte-for-byte match that an emulator does better.
// See CLAUDE.md "the governing test" and docs/research_game_flow.md §7 (LOCKED),
// whose §7.7 records what was rejected and why — don't re-litigate it.
//
// A Mode may own a CHILD Mode and drive it with this identical protocol; that is
// the whole of the hierarchy (an HSM — no library, no second concept). Attract
// and Session both do. Flow doc §7.2/§7.3.

// update()'s return value. null = stay in this mode, DONE = I'm finished.
// A mode never names its successor — flow.js does. Flow doc §7.4(2): if modes
// returned modes, attract.js would import editor.js and editor.js would import
// attract.js, a real ES-module cycle with no build step to untangle it.
export const DONE = Symbol('done');

export class Mode {
  constructor(game, args = {}) {
    this.game = game;
    this.args = args;
    this.sub = null;   // optional child Mode
  }

  enter() {}                  // once, on entry. Replaces the legacy `if (seq == 0)`.
  update() { return null }    // one logic tick @ NTSC_FPS. null | DONE.
  exit() { this.sub?.exit() } // once, on leaving.

  // 0..n times per logic tick, and it MUST NOT mutate state — the fixed-timestep
  // accumulator runs update() 0, 1 or 2+ times per repaint, so anything that
  // changes the world from in here would run a variable number of times per frame.
  // (This split is not a preference: see flow doc §7.4(1). The ROM has it too —
  // sub_DEA6_tanks_handler is deliberately OUTSIDE the $C2E6 pipeline.)
  render(renderer) { this.sub?.render(renderer) }

  // Swap the child mode. Fresh instance every entry, so state is clean BY
  // CONSTRUCTION — the "remember to reset your seq before returning DONE" bug
  // class cannot exist here. Flow doc §7.4(3).
  setSub(Cls, args = {}) {
    this.sub?.exit();
    this.sub = new Cls(this.game, args);
    this.sub.enter();
  }
}
