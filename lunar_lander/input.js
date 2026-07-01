// lunar_lander/input.js
//
// The ONLY module that reads input devices / the settings DOM. It produces a
// device-independent INTENT object; the lander and physics steppers only CONSUME
// it (they never touch the keyboard) — the decoupling seam (CLAUDE.md). This
// mirrors the source, which reads the switches (ROTRHT/ROTLFT/ABORTSW/POTIN) into
// variables that ROTSHP/THRLVL/ACCEL then read.
//
// Keys: ←/→ rotate (held) · ↑ throttle — SPRING-LOADED: hold to ramp up, release to ramp down,
//   step by step, from wherever it currently sits (deviation — the cabinet's pot has no ramp at
//   all, THRLVL just reads its position verbatim, :897; a digital key can't set a pot position,
//   so this is our choice of how to fake one) · A abort (emergency thrust) · SPACE = START.

export class Input {
  constructor() {
    this.keys = new Set();
    this._startEdge = false;               // SPACE pressed since last poll (edge)
    this._resetEdge = false;               // Reset button clicked since last poll (edge)

    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) {
        e.preventDefault();                // don't scroll the page
      }
      if (e.repeat) return;                // ignore auto-repeat for edges
      this.keys.add(e.code);
      if (e.code === 'Space') this._startEdge = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    const resetBtn = document.getElementById('reset');   // bottom-HUD Reset button
    if (resetBtn) resetBtn.addEventListener('click', () => { this._resetEdge = true; });
  }

  // Per-frame flight intent, consumed by the active physics stepper.
  //   rotate: -1 (left) / 0 / +1 (right) — held, continuous.
  //   thrHeld: is ↑ down right now — the physics stepper ramps THRUST toward 15 while true,
  //     toward 0 while false (spring-loaded; see the file header). abort: bool.
  read() {
    const k = this.keys;
    return {
      rotate: (k.has('ArrowLeft') ? -1 : 0) + (k.has('ArrowRight') ? 1 : 0),
      thrHeld: k.has('ArrowUp'),
      abort: k.has('KeyA'),
    };
  }

  // SPACE edge (the cabinet START switch), consumed once → the IDLE→PLAY trigger.
  startPressed() {
    const p = this._startEdge;
    this._startEdge = false;
    return p;
  }

  // Reset-button edge, consumed once → the PLAY→IDLE (back to start screen) trigger.
  resetPressed() {
    const p = this._resetEdge;
    this._resetEdge = false;
    return p;
  }

  // Settings from the HTML panel, read at New Game (not per frame): the PLYMOD
  // radio + the start-fuel slider. This is the "select mode/fuel via HTML, not the
  // SELECT button" deviation (physics/profiles stay faithful — CLAUDE.md).
  settings() {
    const mode = document.querySelector('input[name=mode]:checked');
    const fuel = document.getElementById('fuel');
    return {
      plymod: mode ? Number(mode.value) : 0,
      startFuel: fuel ? Number(fuel.value) : 750,
    };
  }
}
