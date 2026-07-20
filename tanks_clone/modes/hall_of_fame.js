// modes/hall_of_fame.js — the HI-SCORE screen.
//
// Absorbs: sub_C44B ($C44B), and sub_C295 ($C295) on the way out. Reached only when
// sub_D97D_check_hiscore_beaten ($D97D) says so — the CALLER decides ($C286-$C292), not
// this screen. Full decode: docs/research_game_over.md §3. See flow doc §4 [8].

import { Mode, DONE } from '../mode.js';
import { HUGE_TEXT, HUGE_HISCORE, HOF_PAL_BASE, HOF_PAL_MASK, BG_PAL_TITLE } from '../constants.js';
import { Tilemap } from '../tilemap.js';
import { drawHugeText } from '../text.js';
import { SFX } from '../assets/dat_sfx.js';

// Fallback only, if audio never unlocked — see update(). Flow doc §6d/§7.8.
const NO_AUDIO_FALLBACK_FRAMES = 240;

export class HallOfFame extends Mode {
  enter() {
    const g = this.game;
    g.frm.hi = 0;   // $C479
    this.t = 0;
    // $C458 sub_D47E fills $00 -> a fresh (blank) Tilemap. $C46B huge "HISCORE" (sub_D8D2),
    // $C46E the huge hi-score NUMBER (sub_D951). render() draws with the cycling palette.
    this.screen = new Tilemap();
    drawHugeText(this.screen, HUGE_TEXT.HISCORE.str, HUGE_TEXT.HISCORE.x, HUGE_TEXT.HISCORE.y); // $C45B-$C46B
    drawHugeHiscore(this.screen, g.hiScore);   // $C46E sub_D951_draw_huge_hiscore
    // $C47D-$C483 — the 3-part hi-score jingle. hiscore_1 is the exit gate ($C492).
    g.audio.play(SFX.HISCORE_1);   // $C47D
    g.audio.play(SFX.HISCORE_2);   // $C480
    g.audio.play(SFX.HISCORE_3);   // $C483
  }

  update() {
    const g = this.game;
    // $C489-$C490 — the colour flash: cycle bg_palette_id through con_bg_pal_05..08 on
    // (frm_cnt_lo & 3) + 5. render() reads it, so the screen strobes.
    g.bgPaletteId = (g.frm.lo & HOF_PAL_MASK) + HOF_PAL_BASE;

    // $C492-$C495: waits on ram_sfx_hiscore_1 — "wait until sound is played". NOTE THE
    // ASYMMETRY with GameOver: there is NO skip button here ($C627 has one, this loop
    // does not). The jingle is the ONLY exit. Fall back to a fixed wait only if audio
    // never unlocked (else isPlaying stays false and this screen would flash past).
    if (!g.audio.enabled) return ++this.t >= NO_AUDIO_FALLBACK_FRAMES ? DONE : null;
    return g.audio.isPlaying(SFX.HISCORE_1) ? null : DONE;
  }

  // $C46B/$C471 draw into $0400 and ship it up; here that is one drawTilemap of the
  // screen built in enter(), with this frame's cycled palette.
  /** @param {import('../renderer.js').Renderer} renderer */
  render(renderer) {
    renderer.drawTilemap(this.screen, this.game.bgPaletteId, 0, 0);
  }

  exit() {
    // $C497 bg_palette_id = con_bg_pal_00 — stop the flash before the title. sub_C295
    // ($C295: clear $0400 + ship it up) is plumbing: the next mode (title) redraws anyway.
    this.game.bgPaletteId = BG_PAL_TITLE;
    this.game.audio.clear();   // silence any hiscore parts still ringing past hiscore_1
    super.exit();
  }
}

// sub_D951_draw_huge_hiscore ($D951): the hi-score as HUGE digits, right-aligned in a
// 7-digit field from px (0x10, 0x64). The ROM skips leading-zero digits, advancing X by
// 0x20 per skip ($D965-$D96A); with an int score String() already has no leading zeros,
// so the first digit lands at 0x10 + (7 - len) * 0x20. drawHugeText uses offset 0
// because the font is ASCII-indexed — the '2' glyph is charCode $32, i.e. the ROM's
// digit-value 2 + offset $30. (score is capped at 7 digits by the BCD array.)
function drawHugeHiscore(tm, value) {
  const digits = String(value).slice(-HUGE_HISCORE.fieldDigits);
  const startX = HUGE_HISCORE.x0 + (HUGE_HISCORE.fieldDigits - digits.length) * HUGE_HISCORE.digitPx;
  drawHugeText(tm, digits, startX, HUGE_HISCORE.y);
}
