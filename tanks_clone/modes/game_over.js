// modes/game_over.js — the GAME OVER screen.
//
// Absorbs: sub_C5D9 ($C5D9). Full decode: docs/research_game_over.md §2.
// See docs/research_game_flow.md §4 [7], §6d.

import { Mode, DONE } from '../mode.js';
import { BTN_SS, HUGE_TEXT } from '../constants.js';
import { Tilemap } from '../tilemap.js';
import { drawHugeText } from '../text.js';
import { SFX } from '../assets/dat_sfx.js';

// Fallback only — if audio was never unlocked (no user gesture reached the game), the
// jingle can't gate the screen, so fall back to a fixed wait. With audio on, the real
// $C630 gate (wait on the game-over jingle) runs. See update().
const NO_AUDIO_FALLBACK_FRAMES = 200;

export class GameOver extends Mode {
  enter() {
    const g = this.game;
    g.frm.hi = 0;   // $C617
    this.t = 0;
    // $C5E6 sub_D47E_clear_0400_07FF fills $00 -> a fresh (blank) Tilemap. $C5F9 draws
    // huge "GAME", $C60C huge "OVER" (sub_D8D2 — the brick-glyph letters, text.js). The
    // bg palette is inherited: sub_C5D9 sets none, and the Tally left it con_bg_pal_00
    // ($CEF4), so render() draws with g.bgPaletteId.
    this.screen = new Tilemap();
    drawHugeText(this.screen, HUGE_TEXT.GAME.str, HUGE_TEXT.GAME.x, HUGE_TEXT.GAME.y);   // $C5E9-$C5F9
    drawHugeText(this.screen, HUGE_TEXT.OVER.str, HUGE_TEXT.OVER.x, HUGE_TEXT.OVER.y);   // $C5FC-$C60C
    // $C61B-$C621 — the 3-part game-over jingle (pulse1 + pulse2 + triangle). game_over_1
    // is the one the exit gate waits on ($C62D).
    g.audio.play(SFX.GAME_OVER_1);   // $C61B
    g.audio.play(SFX.GAME_OVER_2);   // $C61E
    g.audio.play(SFX.GAME_OVER_3);   // $C621
  }

  update() {
    const g = this.game;
    // $C627-$C62B: Start/Select skips the screen. HallOfFame has no such escape.
    if (g.input.pressed(0, BTN_SS)) return DONE;

    // $C62D-$C630: `LDA ram_sfx_game_over_1 / BNE` — "wait until sound is played". The
    // JINGLE is the timer: audio is not passive output, it GATES this transition. Fall
    // back to a fixed wait only if audio never unlocked (isPlaying is always false then,
    // which would otherwise collapse the screen instantly). Flow doc §6d/§7.8.
    if (!g.audio.enabled) return ++this.t >= NO_AUDIO_FALLBACK_FRAMES ? DONE : null;
    return g.audio.isPlaying(SFX.GAME_OVER_1) ? null : DONE;
  }

  // $C60F sub_D7B4 ships $0400 to the nametable; here that is one drawTilemap of the
  // screen built in enter(). Palette inherited (con_bg_pal_00 from the Tally).
  /** @param {import('../renderer.js').Renderer} renderer */
  render(renderer) {
    renderer.drawTilemap(this.screen, this.game.bgPaletteId, 0, 0);
  }

  exit() {
    // $C63E sub_EA51_clear_sound_engine_data — silence any jingle parts still ringing
    // (game_over_1 gated the exit, but 2/3 may outlast it). The BG clear ($C632) is
    // plumbing: the next mode (title / hall of fame) redraws from scratch.
    this.game.audio.clear();
    super.exit();
  }
}
