// input.js — S10 Input
//
// Absorbs:
//   sub_D689_read_joy_regs ($D689)          -> sample()
//   sub_E451_convert_Dpad_buttons ($E451)   -> dpadToDirection()
//   $C2AA-$C2B0, the body of sub_C2A2_disable_buttons_if_game_over ($C2A2) -> clear()
// Mirrors ram_btn_hold ($06) and ram_btn_press ($08), 2 bytes each (P1/P2).
// See docs/research_system_interaction_map.md §5 (S10).

import { BTN, DIR } from './constants.js';

// NOT SOURCE — the Famicom has two pads; we have one keyboard. Only the key names
// are invented: the values are con_btn_*, so every masked read downstream still
// lines up 1:1 with the disassembly.
//
// P2 gets a full set, not just a d-pad, because the ROM reads its A and B for the
// hidden-cutscene counter ($CA0A / $CA1D). Its Start and Select are bound but never
// read — every menu/pause site is a non-indexed LDA ram_btn_press, i.e. P1 only
// ($C20C pause, $C9FA select, $C7B6 scroll skip, $C420 demo skip). Bound anyway:
// the pad has the buttons, and controls.js states the asymmetry rather than hiding it.
export const KEYMAP = [
  { // P1
    ArrowUp: BTN.Up, ArrowDown: BTN.Down, ArrowLeft: BTN.Left, ArrowRight: BTN.Right,
    KeyZ: BTN.B, KeyX: BTN.A, Enter: BTN.Start, ShiftRight: BTN.Select,
  },
  { // P2
    KeyW: BTN.Up, KeyS: BTN.Down, KeyA: BTN.Left, KeyD: BTN.Right,
    KeyF: BTN.B, KeyG: BTN.A, KeyQ: BTN.Start, KeyE: BTN.Select,
  },
];
const KEYMAP_ENTRIES = KEYMAP.map((map) => Object.entries(map));
const MAPPED_KEYS = new Set(KEYMAP.flatMap((map) => Object.keys(map)));

export class Input {
  constructor() {
    this.hold = [0, 0];      // ram_btn_hold ($06)  — held right now
    this.press = [0, 0];     // ram_btn_press ($08) — newly pressed this frame
    this._down = new Set();  // raw keyboard: our analog of the pads' latches
  }

  attach(target = window) {
    target.addEventListener('keydown', (e) => {
      if (!MAPPED_KEYS.has(e.code)) return;
      e.preventDefault();   // NOT SOURCE: arrows scroll the page, Enter submits.
      this._down.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (!MAPPED_KEYS.has(e.code)) return;
      e.preventDefault();
      this._down.delete(e.code);
    });
    // NOT SOURCE: a key still held when the window loses focus never gets its
    // keyup, and would stick down forever. A pad has no such failure mode.
    target.addEventListener('blur', () => this._down.clear());
  }

  // sub_D689_read_joy_regs ($D689). One call per frame, from Game.tick().
  //
  // The ROM strobes $4016 and shifts 8 bits out of each pad's latch ($D68B-$D6A1),
  // ROR'ing them into a byte so the first bit out (A) lands in bit 0 and the last
  // (Right) in bit 7 — which is exactly what con_btn_* encodes, so the mask IS the
  // byte and no reordering is needed here.
  //
  // That latch is LEVEL-based and re-strobed every NMI: a press-and-release
  // between two strobes is invisible to the game. Snapshotting a Set of held keys
  // once per tick has precisely that semantics, which is why the DOM events
  // accumulate into _down rather than into a queue. Faithful by re-derivation, not
  // by mimicry — there is no shift register here.
  sample() {
    for (let player = 0; player < 2; player++) {
      let now = 0;
      for (const [code, bit] of KEYMAP_ENTRIES[player]) {
        if (this._down.has(code)) now |= bit;
      }
      this.press[player] = now & ~this.hold[player];   // $D6A3-$D6A9 (hold EOR $FF) AND new
      this.hold[player] = now;                         // $D6AB-$D6AD
    }
  }

  held(player, mask) { return (this.hold[player] & mask) !== 0; }
  pressed(player, mask) { return (this.press[player] & mask) !== 0; }

  // $C2AA-$C2B0 — the body of sub_C2A2_disable_buttons_if_game_over.
  // The GATE (only once the eagle is gone) belongs to the caller: Tail runs it
  // every frame at $C23B. Not wired up yet — Tail is still a stub.
  clear() { this.hold = [0, 0]; this.press = [0, 0]; }

  // sub_E451_convert_Dpad_buttons ($E451) — a PRIORITY decoder, not a bitmask test.
  // Four ASLs walk bits 7..4, and the first one set wins: Right > Left > Down > Up.
  // So opposite directions held at once resolve deterministically, and this port
  // needs no SOCD filter: a real d-pad cannot press Left+Right, a keyboard can, and
  // the ROM already answers the question.
  static dpadToDirection(mask) {
    if (mask & BTN.Right) return DIR.RIGHT;   // $E451 ASL -> $E454 LDA #$03
    if (mask & BTN.Left) return DIR.LEFT;     // $E457 ASL -> $E45A LDA #$01
    if (mask & BTN.Down) return DIR.DOWN;     // $E45D ASL -> $E460 LDA #$02
    if (mask & BTN.Up) return DIR.UP;         // $E463 ASL -> $E466 LDA #$00
    return DIR.NONE;                          // $E469 LDA #$FF
  }
}
