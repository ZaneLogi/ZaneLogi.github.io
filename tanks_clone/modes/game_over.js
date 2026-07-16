// modes/game_over.js — the GAME OVER screen.
//
// Absorbs: sub_C5D9 ($C5D9).
// See docs/research_game_flow.md §4 [7], §6d.

import { Mode, DONE } from '../mode.js';
import { BTN } from '../constants.js';

// NOT SOURCE. The ROM has no frame count here — it waits for the jingle (see
// update()). Delete this and the wait when sub_EA7E lands. Flow doc §6d/§7.8.
const SFX_STUB_FRAMES = 200;

export class GameOver extends Mode {
  enter() {
    this.game.frm.hi = 0;   // $C617
    this.t = 0;
    // TODO: $C5E6 sub_D47E_clear_0400_07FF (fills $00 — NOT sub_D7CC, which fills
    //       the grey $11; different routines, map §5 S2);
    //       $C5F9 huge tbl_D343 "GAME", $C60C huge tbl_D348 "OVER" ($D8D2);
    //       $C60F sub_D7B4_copy_400h_to_nametable.
    // TODO: $C61B-$C621 ram_sfx_game_over_1/2/3.
  }

  update() {
    // $C627-$C62B: Start/Select skips the screen. HallOfFame has no such escape.
    if (this.game.input.pressed(0, BTN.Start | BTN.Select)) return DONE;

    // $C62D-$C630: `LDA ram_sfx_game_over_1 / BNE` — "wait until sound is played".
    // The JINGLE is the timer here, not a frame count: audio is not a passive
    // output, it GATES this transition. Audio is a deferred stub, so we wait a
    // constant instead. Flow doc §6d/§7.8.
    // NOT SOURCE: replace with `if (this.game.audio.isPlaying(SFX.GAME_OVER)) return null`
    // once $EA7E is ported.
    return ++this.t >= SFX_STUB_FRAMES ? DONE : null;
  }

  exit() {
    // TODO: $C632-$C63E clear the BG + sub_EA51_clear_sound_engine_data.
    super.exit();
  }
}
