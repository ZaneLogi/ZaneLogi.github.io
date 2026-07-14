// input.js — S10 Input
//
// Absorbs: sub_D689_read_joy_regs ($D689), sub_E451_convert_Dpad_buttons ($E451)
// Mirrors ram_btn_hold ($06) and ram_btn_press ($08), 2 bytes each (P1/P2).
// In the ROM the joypad is sampled inside the NMI; here `sample()` is called
// once per frame from Game.tick() (the re-derived NMI role — see map §1).
// See docs/research_system_interaction_map.md §5 (S10).

import { BTN } from './constants.js';

export class Input {
  constructor() {
    this.hold = [0, 0];   // ram_btn_hold  — currently-held bitmask per player
    this.press = [0, 0];  // ram_btn_press — newly-pressed this frame (edge)
    this._down = new Set(); // raw keyboard state
    // TODO: keymap P1 (WASD+JK), P2 (arrows+numpad) → BTN.* masks
    this._keymap = { /* 'KeyW': [0, BTN.Up], ... */ };
  }

  attach(target = window) {
    target.addEventListener('keydown', (e) => this._down.add(e.code));
    target.addEventListener('keyup', (e) => this._down.delete(e.code));
  }

  // Once per frame: compute hold, and press = newly-down since last frame ($D689).
  sample() { /* TODO: port $D689 edge detection */ }

  held(player, mask) { return (this.hold[player] & mask) !== 0; }
  pressed(player, mask) { return (this.press[player] & mask) !== 0; }

  // Dpad bitmask → facing direction (into the low nibble of tank_flags). $E451.
  static dpadToDirection(mask) { /* TODO: port $E451 */ return 0; }
}
