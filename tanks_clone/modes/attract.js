// modes/attract.js — the ATTRACT mode: title scroll -> menu -> demo, cycling.
//
// Absorbs:
//   loc_C095 ($C095) / loc_C09C ($C09C) / loc_C0A2 ($C0A2) — the title+demo loop
//   sub_D17F_draw_title_screen ($D17F), sub_D16A ($D16A)
//   sub_C7AB_scroll_title_screen ($C7AB)          -> Scroll
//   sub_C9C0_title_screen_handler ($C9C0)         -> Menu
//   sub_C3B5_demo_settings ($C3B5) + sub_C41D_demo_handler ($C41D) -> Demo
// See docs/research_game_flow.md §4 [1][2][9], §7.2.
//
// The ROM cycles loc_C09C -> loc_C0A2 -> loc_C09C, and reaches the menu early from
// either neighbour by popping its return address (PLA/PLA at $C7C3 and $C43F).
// Here that is one line per case — which is the whole of what the stack trick bought.

import { Mode, DONE } from '../mode.js';
import { BTN, GAME_MODE, SECOND_LOOP } from '../constants.js';

// Where Attract starts when it is entered. This is the loc_C095-vs-loc_C0A2
// distinction, and it is LOAD-BEARING — see enter(). Flow doc §6c/§7.5.
export const ATTRACT_AT = Object.freeze({
  SCROLL: 'SCROLL',   // loc_C095: redraw the title, zero the editor counter, scroll
  MENU: 'MENU',       // loc_C0A2: straight to the menu, counter PRESERVED
});

const TITLE_SCROLL_END = 0xF0;   // $C7BE CMP #$F0 — 240 frames ≈ 4.0 s
const DEMO_TIMEOUT_HI = 0x0A;    // $CA34 CMP #$0A — 10 hi-ticks = 640 frames ≈ 10.6 s

export class Attract extends Mode {
  enter() {
    // loc_C095 ($C095) — a FRESH arrival (boot, or back from game over): redraw the
    // title and zero ram_constr_usage_cnt ($C09A).
    //
    // The EDITOR deliberately returns to loc_C0A2 instead ($C156), skipping this.
    // That is what lets constr_usage_cnt survive editor -> menu -> editor and reach
    // the 7 the hidden cutscene needs ($CA43). Collapse the two entries into one
    // and the easter egg dies silently. Flow doc §6c.
    if (this.args.at === ATTRACT_AT.MENU) {
      this.setSub(Menu);
      return;
    }
    this.game.constrUsageCnt = 0;   // $C09A
    // TODO: sub_D17F_draw_title_screen ($D17F) — huge BATTLE / CITY into the BG.
    // It lives in the OTHER nametable ($2800, con_ppu_offset_2800), which is what
    // makes the scroll work and why re-scrolling needn't redraw it.
    this.setSub(Scroll);
  }

  update() {
    if (this.sub.update() !== DONE) return null;
    const done = this.sub;

    // Scroll ends either way -> the menu. ($C7C2 RTS, or $C7C5 JMP loc_C0A2.)
    if (done instanceof Scroll) { this.setSub(Menu); return null; }

    if (done instanceof Menu) {
      // Start -> leave attract entirely. $CA56 PLA/PLA -> JMP (tbl_CA69).
      if (done.startPressed) return DONE;
      // Otherwise it timed out: RTS ($CA3C) falls through to $C0A5/$C0A8, so in
      // the ROM *returning from the menu is what starts the demo*. Flow doc §3a.
      this.setSub(Demo);
      return null;
    }

    // Demo interrupted -> menu ($C43F PLA/PLA -> loc_C0A2). Demo ran its stage out
    // -> RTS ($C43E) -> $C0AB JMP loc_C09C -> scroll again.
    this.setSub(done.interrupted ? Menu : Scroll);
    return null;
  }
}

// --- sub_C7AB_scroll_title_screen ($C7AB) ------------------------------------
class Scroll extends Mode {
  enter() {
    // loc_C09C: sub_D16A ($D16A) clears $0400 and copies it to the nametable.
    // TODO: port sub_D16A.
    this.game.scrollY = 0;   // $C7AD
  }

  update() {
    const g = this.game;
    g.scrollY++;                                                   // $C7B4
    if (g.input.pressed(0, BTN.Start | BTN.Select)) return DONE;   // $C7B8 -> $C7C3
    return g.scrollY === TITLE_SCROLL_END ? DONE : null;           // $C7BE
  }
}

// --- sub_C9C0_title_screen_handler ($C9C0) -----------------------------------
class Menu extends Mode {
  enter() {
    this.startPressed = false;
    this.game.frm.hi = 0;   // $C9D4 — restarts the demo timeout on every entry
    // TODO: bg_palette_id = con_bg_pal_03 ($C9C0); base_nmt = $02 ($C9E4).
    // TODO: the I/II cursor is drawn as tank slot 0 ($C9C7-$C9E4) through the
    // ordinary sub_DEA6_tanks_handler — the menu cursor IS a tank. Its wheels EOR
    // every 4 frames ($C9E9).
  }

  update() {
    const g = this.game;

    if (g.input.pressed(0, BTN.Select)) {              // $C9FA
      g.gameMode = (g.gameMode + 1) % 3;               // $C9FE INC, $CA25 wrap at 3
      g.frm.hi = 0;                                    // $CA00 — reset before the demo
    }

    // TODO: the hidden-cutscene counter ($CA0A Down+A = +$10, $CA1D Right+B = -1),
    // read on CONTROLLER 2 (ram_btn_press + $01). Fires at $CA4F when
    // constrUsageCnt == 7 and the counter == $74.

    // Idle -> demo. Note the second condition: once you have used the editor, the
    // demo never starts ($CA38). Flow doc §6c.
    if (g.frm.hi === DEMO_TIMEOUT_HI && g.constrUsageCnt === 0) return DONE;  // $CA3C RTS

    if (g.input.pressed(0, BTN.Start)) {               // $CA3F
      this.startPressed = true;
      return DONE;                                     // $CA56 PLA/PLA -> tbl_CA69
    }
    return null;
  }
}

// --- sub_C3B5_demo_settings ($C3B5) + sub_C41D_demo_handler ($C41D) ----------
class Demo extends Mode {
  enter() {
    const g = this.game;
    this.interrupted = false;

    // $C3BD sub_C2BD_prepare_player_data — NOT sub_C2B3: the demo re-arms the
    // players but must not clear the scores shown on the title behind it.
    g.preparePlayerData();
    g.lives[1] = 3;                    // $C3C2
    g.scrollY = 0;                     // $C3C6
    g.frm.reset();                     // $C3CA / $C3CC
    g.secondLoop = SECOND_LOOP.DEMO;   // $C3DE — con_flag_demo ($02)

    // $C3D3 sets ram_stage = $FF to draw the DEMO stage, then $C3DA sets it to $1E
    // so the HUD reads "30". Two different uses of one variable, a few bytes apart.
    // TODO: field.drawStage(DEMO_STAGE) ($C3D5 sub_F000, A = $FF);
    //       huge BATTLE / CITY over it ($C3E3-$C406).
    g.stage = 0x1E;                    // $C3DA
    g.enemyLimit = 5;                  // $C41A

    // The demo is SILENT. The ROM gets that by setting ram_pause_flag = 1 ($C3B7),
    // which makes sub_EA7E drop its sfx scan to the pause slot only ($EA7E). That
    // one byte doing two jobs is 6502 plumbing; we express the FACT instead —
    // Attract simply plays no sfx. "Pausing mutes" is a SEPARATE fact, owned by
    // Battle. Flow doc §6e/§7.8.

    g.prepareStage();                  // $C40F sub_C331 — note this runs AFTER
                                       // secondLoop = DEMO above, and it also
                                       // zeroes constrUsageCnt ($C35F).
    // TODO: g.base.drawDefault() ($C412 sub_CAF5).
  }

  update() {
    const g = this.game;

    if (g.input.pressed(0, BTN.Start | BTN.Select)) {   // $C422 con_btns_SS
      this.interrupted = true;
      return DONE;                                      // $C43F PLA/PLA -> loc_C0A2
    }

    // TODO: sub_C642_demo_players_ai_handler ($C426) — drives the two player slots.
    g.mainBattleScript();                               // $C429 — the SAME body Battle runs
    // TODO: $C42C $E23B display_bonus, $C42F $DEA6 tanks_handler, $C432 $E0D8 bullets.

    return g.checkStageEnding() ? DONE : null;          // $C435 -> $C43E RTS
  }
}
