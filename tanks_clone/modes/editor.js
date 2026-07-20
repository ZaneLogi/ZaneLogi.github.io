// modes/editor.js — the built-in stage editor. DEFERRED (stub only).
//
// Absorbs (when un-deferred): loc_C0AE ($C0AE) + loc_C0EA_construction_loop
//   ($C0EA), sub_C6D2_move_construction_cursor ($C6D2),
//   sub_C8D0_screen_borders_for_construction_tank_icon ($C8D0),
//   sub_C9B0_create_default_stage_field ($C9B0).
// See docs/research_game_flow.md §4 [10]; map §5 (S13).
//
// Deferral note: the editor ships in the retail ROM but is not core gameplay
// (map §7 lists Construction as stub-only). Until it is ported this mode returns
// immediately, so picking "CONSTRUCTION" at the menu bounces straight back to it —
// honest, visible, and not a hang.
//
// The stage editor is NOT stage_FF.bin. That file is the DEMO stage — sub_F000's
// own header says "FF = demo stage" and dispatches CMP #$FF to entry 36. What, if
// anything, the editor loads by default is still unverified (map §5 S13).

import { Mode, DONE } from '../mode.js';

export class Editor extends Mode {
  update() {
    // TODO: port loc_C0EA_construction_loop ($C0EA) — cursor movement, block
    // paste, A/B cycling ram_constr_block_id through $0..$D ($C111-$C13B).
    return DONE;
  }

  exit() {
    // $C154 INC ram_constr_usage_cnt, on the way to loc_C0A2.
    //
    // This counter is the editor's cross-phase memory and it does three things
    // (flow doc §6c): it suppresses the demo entirely ($CA38), it makes the next
    // stage use the CONSTRUCTED field instead of a real one ($C1D0), and at
    // exactly 7 it arms the hidden cutscene ($CA43). It survives editor -> menu ->
    // editor only because $C156 targets loc_C0A2, which skips the $C09A reset.
    this.game.constrUsageCnt++;
    super.exit();
  }
}
