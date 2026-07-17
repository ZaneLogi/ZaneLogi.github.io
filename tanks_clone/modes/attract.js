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
import { drawHugeText, writeText, drawNumber } from '../text.js';
import { TEXT } from '../assets/dat_text.js';
import { BTN, BTN_SS, GAME_MODE, SECOND_LOOP, SCREEN_H, TANK_STATE, DIR }
  from '../constants.js';

// Where Attract starts when it is entered. This is the loc_C095-vs-loc_C0A2
// distinction, and it is LOAD-BEARING — see enter(). Flow doc §6c/§7.5.
export const ATTRACT_AT = Object.freeze({
  SCROLL: 'SCROLL',   // loc_C095: redraw the title, zero the editor counter, scroll
  MENU: 'MENU',       // loc_C0A2: straight to the menu, counter PRESERVED
});

const TITLE_SCROLL_END = 0xF0;   // $C7BE CMP #$F0 — 240 frames ≈ 4.0 s
const DEMO_TIMEOUT_HI = 0x0A;    // $CA34 CMP #$0A — 10 hi-ticks = 640 frames ≈ 10.6 s

// ram_bg_palette_id ($4D) = con_bg_pal_03, set by both $D16D and $C9C0. Its
// palette 0 is [$0F, $16, $16, $30] — black, red, red, white: the title's bricks.
// Palette 0 is what the whole screen gets, because sub_D47E clears the attribute
// table to $00 along with the tiles and the title never writes another attribute.
const BG_PAL_TITLE = 0x03;

const CURSOR_X = 0x48;          // $C9C7 — 72
const CURSOR_Y_BASE = 0x8B;     // $CA8C — 139
const CURSOR_ROW_PX = 0x10;     // $CA87-$CA8A ASL x4 — 16px between menu options

// sub_CA85_write_cursor_position ($CA85). The cursor's Y IS the selection — there
// is no separate "highlighted option" variable, just game_mode * $10 + $8B, giving
// 139 / 155 / 171. The option rows are 17/19/21 (y = 136/152/168), and a tank
// centred on 139 spans 132..147 (Renderer.drawSprite), so it lands level with its
// text line. $CA2F runs this EVERY frame, not only when Select is pressed.
function writeCursorPosition(game) {
  game.roster.tanks[0].y = (game.gameMode * CURSOR_ROW_PX) + CURSOR_Y_BASE;
}

// --- sub_D17F_draw_title_screen ($D17F) --------------------------------------
//
// Draws the WHOLE title screen — logo, scores, the three menu options, the Namco
// credits. All of it, once, at $C095, BEFORE the scroll. So the entire screen
// scrolls up together, and by the time sub_C9C0 (Menu) runs, every word is already
// there: the menu's only visual contribution is the cursor tank, a sprite.
//
// The ROM builds it in two ways and we build it in one, because the split is
// hardware bookkeeping. The huge letters go into $0400 and are bulk-shipped to
// nametable $2800 by $D1AF; everything after $D1B2 (which re-enables NMI) streams
// through the PPU write buffer instead. That buffer has a size limit, which is why
// $D212 / $D242 / $D263 sprinkle JSR sub_D8F6_wait_1_frm through the routine to
// spread the writes over four frames. Same picture either way, and nobody sees the
// four frames — they are spent before the scroll starts. Here: one Tilemap.
function drawTitleScreen(tm, game) {
  tm.clear();                                // $D186 sub_D47E_clear_0400_07FF
  drawHugeText(tm, 'BATTLE', 0x1A, 0x2E);    // $D189-$D199, tbl_D299
  drawHugeText(tm, 'CITY', 0x3C, 0x56);      // $D19C-$D1AC, tbl_D2A0

  // $D1B5-$D20B — the score row. $D1B5 sets ram_0060_tile_id_offset = $30 so digit
  // VALUES land on the ASCII digit tiles; $D210 puts it back to 0 afterwards.
  writeText(tm, TEXT.I_DASH);                        // $D1C5
  drawNumber(tm, game.scores[0], 4, 3);              // $D1C8-$D1D1
  writeText(tm, TEXT.HI_DASH);                       // $D1E0
  drawNumber(tm, game.hiScore, 14, 3);               // $D1E3-$D1EC
  // $D1EF-$D1F1: LDA ram_game_mode / BEQ — the test is "not 1P", NOT "is 2P". So
  // CONSTRUCTION ($02) also shows player II's score, since $D17F redraws on every
  // fresh arrival at $C095 and game_mode survives from the last run.
  if (game.gameMode !== GAME_MODE.ONE_PLAYER) {
    writeText(tm, TEXT.II_DASH);                     // $D1FF
    drawNumber(tm, game.scores[1], 23, 3);           // $D202-$D20B
  }

  writeText(tm, TEXT.ONE_PLAYER);        // $D21D
  writeText(tm, TEXT.TWO_PLAYERS);       // $D22C
  writeText(tm, TEXT.CONSTRUCTION);      // $D23B
  writeText(tm, TEXT.LOGO_NAMCOT);       // $D24D
  writeText(tm, TEXT.NAMCO_COPYRIGHT);   // $D25C
  writeText(tm, TEXT.ALL_RIGHTS);        // $D26E
}

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
    this.game.constrUsageCnt = 0;             // $C09A
    drawTitleScreen(this.game.titleMap, this.game);   // $C095 JSR $D17F
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
    this.game.scrollY = 0;   // $C7AD
    // $C7AF also zeroes ram_base_nmt, and loc_C09C calls sub_D16A ($D16A) first to
    // clear $0400 and ship it to nametable $2000. Neither is ported, because
    // together they only say "the screen being scrolled off is blank" — see render().
  }

  update() {
    const g = this.game;
    g.scrollY++;                                          // $C7B4
    if (g.input.pressed(0, BTN_SS)) return DONE;          // $C7B8 AND #con_btns_SS -> $C7C3
    return g.scrollY === TITLE_SCROLL_END ? DONE : null;  // $C7BE
  }

  // The title rises from below over 240 frames (~4.0 s), onto an empty screen.
  //
  // NOT the ROM's mechanism, and deliberately: it scrolls a NAMETABLE PAIR — the
  // title sits in $2800, $D16A blanks $2000, and ram_scroll_Y walks the PPU's view
  // from one into the other. We need no second tilemap, because the outgoing screen
  // is ALWAYS blank: $C09F is sub_C7AB's only caller and $C09C's sub_D16A clears
  // $2000 immediately before it, every single time. So "what scrolls off" is
  // provably the backdrop, and this is a faithful re-derivation rather than a
  // simplification.
  //
  // The pair's other job is equally invisible: on reaching the menu, $C9DE/$C9E4
  // set scroll_Y = 0 AND base_nmt = 2 ($2800) — the same pixels, rebased so the
  // counter needn't keep climbing. The player sees nothing happen. Flow doc §7.1.
  render(renderer) {
    renderer.drawTilemap(this.game.titleMap, BG_PAL_TITLE, 0, SCREEN_H - this.game.scrollY);
  }
}

// --- sub_C9C0_title_screen_handler ($C9C0) -----------------------------------
class Menu extends Mode {
  // THE CURSOR IS A TANK. Not a tank-shaped sprite drawn by the menu — an actual
  // entry in roster slot 0, pushed through the ordinary sub_DEA6_tanks_handler with
  // the ordinary live-tank draw. So it gets the player-1 palette for free (the
  // palette IS the slot, $DFE8), and its treads roll because something bothers to
  // animate them below. The menu owns no drawing code at all.
  enter() {
    const g = this.game;
    this.startPressed = false;
    // $C9C0-$C9C2 sets ram_bg_palette_id = con_bg_pal_03; that is BG_PAL_TITLE,
    // already what the scroll was drawing with.
    g.roster.clearAll();                    // $C9C4 sub_E413

    const cursor = g.roster.tanks[0];
    cursor.x = CURSOR_X;                    // $C9C7-$C9C9
    writeCursorPosition(g);                 // $C9CB sub_CA85
    cursor.state = TANK_STATE.NORMAL_80;    // $C9CE-$C9D0: #con_tank_flag_80 + $03
    cursor.dir = DIR.RIGHT;                 //   — one byte, alive AND facing right

    g.frm.hi = 0;                           // $C9D4 — restarts the demo timeout
    cursor.type = 0;                        // $C9D6
    cursor.wheels = 0;                      // $C9D8
    g.roster.tanks[0].stunTimer = 0;        // $C9DA
    g.roster.tanks[1].stunTimer = 0;        // $C9DC
    g.scrollY = 0;                          // $C9DE
    g.hiddenCutsceneCnt = 0;                // $C9E0
    // $C9E2-$C9E4 base_nmt = $02 — not ported; the pixels do not move. See
    // Scroll.render()'s note on why the nametable pair leaves no trace.
  }

  update() {
    const g = this.game;

    // $C9E9-$C9F3 — the treads roll: wheels EOR $04 every 4th frame. The cursor is
    // parked, so this is the ROM animating a tank that never moves, purely so the
    // menu looks alive. It is also why `wheels` is a tile offset and not a flag:
    // $DFF5 adds it straight into the sprite tile.
    if ((g.frm.lo & 0x03) === 0) g.roster.tanks[0].wheels ^= 0x04;

    if (g.input.pressed(0, BTN.Select)) {              // $C9FA
      g.gameMode = (g.gameMode + 1) % 3;               // $C9FE INC, $CA25 wrap at 3
      g.frm.hi = 0;                                    // $CA00 — reset before the demo
    }

    // TODO: the hidden-cutscene counter. It is a TWO-CONTROLLER combo, which the
    // shorthand "Down+A on controller 2" gets wrong: the D-PAD half is player 1's
    // HOLD and the BUTTON half is player 2's PRESS.
    //   $CA04 hold[0] & Down  + $CA0A press[1] & A  -> cnt += $10
    //   $CA17 hold[0] & Right + $CA1D press[1] & B  -> cnt -= 1
    // Fires at $CA4F when constrUsageCnt == 7 and the counter == $74.

    // Idle -> demo. Note the second condition: once you have used the editor, the
    // demo never starts ($CA38). Flow doc §6c.
    // TODO: the demo mode
    //if (g.frm.hi === DEMO_TIMEOUT_HI && g.constrUsageCnt === 0) return DONE;  // $CA3C RTS

    // $CA2F — every frame, after the wrap above, so the cursor tracks game_mode
    // with no "did it change?" test. There is no selection variable to keep in
    // sync: game_mode IS the selection and the cursor's Y is a pure function of it.
    writeCursorPosition(g);

    if (g.input.pressed(0, BTN.Start)) {               // $CA3F
      this.startPressed = true;
      return DONE;                                     // $CA56 PLA/PLA -> tbl_CA69
    }
    return null;
  }

  // The same title the scroll just brought up, now parked ($C9DE scroll_Y = 0),
  // plus the roster — which on this screen is just the cursor. $C9F5 calls
  // sub_DEA6_tanks_handler from the menu's own loop, the same routine the battle
  // loop calls; the menu is not a special case anywhere in the drawing path.
  render(renderer) {
    renderer.drawTilemap(this.game.titleMap, BG_PAL_TITLE, 0, 0);
    this.game.roster.handleAll(renderer, this.game.frm.lo);   // $C9F5
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

    if (g.input.pressed(0, BTN_SS)) {                   // $C422 AND #con_btns_SS
      this.interrupted = true;
      return DONE;                                      // $C43F PLA/PLA -> loc_C0A2
    }

    // TODO: sub_C642_demo_players_ai_handler ($C426) — drives the two player slots.
    g.mainBattleScript();                               // $C429 — the SAME body Battle runs
    // TODO: $C42C $E23B display_bonus, $C42F $DEA6 tanks_handler, $C432 $E0D8 bullets.

    return g.checkStageEnding() ? DONE : null;          // $C435 -> $C43E RTS
  }
}
