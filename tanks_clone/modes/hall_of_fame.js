// modes/hall_of_fame.js — the HI-SCORE screen.
//
// Absorbs: sub_C44B ($C44B), and sub_C295 ($C295) on the way out.
// Reached only when sub_D97D_check_hiscore_beaten ($D97D) says so — the CALLER
// decides ($C286-$C292), not this screen. See docs/research_game_flow.md §4 [8].

import { Mode, DONE } from '../mode.js';

// NOT SOURCE — see update(). Flow doc §6d/§7.8.
const SFX_STUB_FRAMES = 240;

export class HallOfFame extends Mode {
  enter() {
    this.game.frm.hi = 0;   // $C479
    this.t = 0;
    // TODO: $C458 clear the BG; $C46B huge tbl_D2B5 "HISCORE" ($D8D2);
    //       $C46E sub_D951_draw_huge_hiscore; $C471 sub_D7B4_copy_400h_to_nametable.
    // TODO: $C47D-$C483 ram_sfx_hiscore_1/2/3.
  }

  update() {
    // TODO: $C489-$C490 cycle bg_palette_id through con_bg_pal_05..08 on
    //       (frm_cnt_lo & $03) + 5 — the colour cycle.

    // $C492-$C495: waits on ram_sfx_hiscore_1 — "wait until sound is played".
    // NOTE THE ASYMMETRY with GameOver: there is NO skip button here ($C627 has
    // one, this loop does not). The jingle is the ONLY exit, which is exactly why
    // stubbing Audio would otherwise hang this screen forever. Flow doc §6d/§7.8.
    // NOT SOURCE: replace with `if (this.game.audio.isPlaying(SFX.HISCORE)) return null`.
    return ++this.t >= SFX_STUB_FRAMES ? DONE : null;
  }

  exit() {
    // TODO: $C497 bg_palette_id = con_bg_pal_00; then sub_C295 ($C295) clears
    //       $0400 and copies it up, before loc_C095 redraws the title.
    super.exit();
  }
}
