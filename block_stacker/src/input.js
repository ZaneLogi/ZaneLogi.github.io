// input.js — keyboard → NES controller buttons, with per-frame edge detection.
// Port of pollController (main.asm:5493-5551): the game reads `heldButtons`
// (currently down) and `newlyPressedButtons` (rising edge), refreshed once/frame.

import { BTN } from './constants.js';

// Physical-key (event.code) → NES button bit. Arrows = D-pad; X = A (CW), Z = B (CCW).
const KEY_MAP = {
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
  ArrowDown: BTN.DOWN,
  ArrowUp: BTN.UP,
  KeyX: BTN.A,
  KeyZ: BTN.B,
  Enter: BTN.START,
  ShiftLeft: BTN.SELECT,
  ShiftRight: BTN.SELECT,
};

export class Input {
  constructor(target = window) {
    this.rawButtons = 0;          // live physical state (set by key events)
    this.heldButtons = 0;         // latched at last poll()
    this.newlyPressedButtons = 0; // rising edges since last poll()

    target.addEventListener('keydown', (e) => {
      const bit = KEY_MAP[e.code];
      if (bit === undefined) return;
      this.rawButtons |= bit;
      e.preventDefault();         // stop arrows/space from scrolling the page
    });
    target.addEventListener('keyup', (e) => {
      const bit = KEY_MAP[e.code];
      if (bit === undefined) return;
      this.rawButtons &= ~bit;
    });
  }

  // Call once per frame before running the tick. Edge detect matches
  // main.asm:5541-5551: newlyPressed = (new XOR old) AND new.
  poll() {
    const raw = this.rawButtons;
    this.newlyPressedButtons = (raw ^ this.heldButtons) & raw;
    this.heldButtons = raw;
  }
}
