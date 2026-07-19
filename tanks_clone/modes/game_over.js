// modes/game_over.js — the GAME OVER screen.
//
// Absorbs: sub_C5D9 ($C5D9). Full decode: docs/research_game_over.md §2.
// See docs/research_game_flow.md §4 [7], §6d.

import { Mode, DONE } from '../mode.js';
import { BTN_SS, HUGE_TEXT } from '../constants.js';
import { Tilemap } from '../tilemap.js';
import { drawHugeText } from '../text.js';

// NOT SOURCE. The ROM has no frame count here — it waits for the jingle ($C630, "wait
// until sound is played"). The jingle IS this screen's timer. Delete this and the wait
// when sub_EA7E (Audio) lands. Flow doc §6d/§7.8; docs/progress.md "Debt".
const SFX_STUB_FRAMES = 200;

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
    // TODO: $C61B-$C621 ram_sfx_game_over_1/2/3 — Audio (deferred; the wait below stubs it).
  }

  update() {
    const g = this.game;
    // $C627-$C62B: Start/Select skips the screen. HallOfFame has no such escape.
    if (g.input.pressed(0, BTN_SS)) return DONE;

    // $C62D-$C630: `LDA ram_sfx_game_over_1 / BNE` — "wait until sound is played". The
    // JINGLE is the timer here, not a frame count: audio is not a passive output, it
    // GATES this transition. Audio is a deferred stub, so we wait a constant instead.
    // NOT SOURCE: replace with `if (g.audio.isPlaying(SFX.GAME_OVER)) return null` once
    // $EA7E is ported. Flow doc §6d/§7.8; docs/progress.md "Debt".
    return ++this.t >= SFX_STUB_FRAMES ? DONE : null;
  }

  // $C60F sub_D7B4 ships $0400 to the nametable; here that is one drawTilemap of the
  // screen built in enter(). Palette inherited (con_bg_pal_00 from the Tally).
  /** @param {import('../renderer.js').Renderer} renderer */
  render(renderer) {
    renderer.drawTilemap(this.screen, this.game.bgPaletteId, 0, 0);
  }

  exit() {
    // TODO: $C632-$C63E clear the BG + sub_EA51_clear_sound_engine_data (Audio). The
    // next mode (title / hall of fame) redraws from scratch, so no clear is needed here.
    super.exit();
  }
}
