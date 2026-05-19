// Intro mode — splash screen (step 14) + attract demo (step 15).
//
// L002D + L00E3 (SplashAndDemo) port. Mixed into the `states` object
// in states.js the same way states_mothership.js folds in state-6/7.
// Step 14 lands the splash visuals + coin-up path; step 15 will extend
// introFrame with the GameDemo dispatch + scripted input injection
// (research_splash_attract.md §4-§5).

import { state } from './state.js';
import { input } from './input.js';
import { COPYRIGHT_TEXT, SCORE_TABLE_ROWS,
         SCORE_ICON_T0A40, SCORE_ICON_T0A48, SCORE_ICON_T3C00 } from './data.js';

export const introMixin = {
    // L002D + L00E3 entry — called by main.tick() each frame while
    // state.gameOrIntro === 0. Source L00E3 increments Counter98 then
    // runs a dispatch chain against threshold values (research_splash_attract.md §1).
    // 14.B wires the first phase (PrintCopyright at $0001 and $01B0);
    // 14.C-F will fill in SlowPrintScoreAverageTable, score-icon tiles,
    // intro bird animation, and BG scroll.
    introFrame() {
        // L00E6 — AddOneToMem on Counter98+1. Source treats $4398:$4399
        // as a 16-bit MSB:LSB counter; AddOneToMem advances the 16-bit
        // value across the byte boundary.
        state.counter98 = (state.counter98 + 1) & 0xFFFF;

        // L00E9-L010C — splash dispatch by Counter98 threshold. Each phase
        // tested in source-order; multiple can fire per frame (range checks
        // overlap). Z-checks fire on a single specific frame, NC-checks
        // fire whenever Counter98 falls within the range.
        const c98 = state.counter98;
        if (c98 === 0x0001 || c98 === 0x01B0) this._printCopyright();   // $01E1
        if (c98 >= 0x0002 && c98 <= 0x00FF) this._slowPrintScoreTable(c98); // $0196 (T1860 only)
        if (c98 === 0x0120) this._drawScoreIcons();                        // $0BCA
        if (c98 === 0x01B8) this.initGlobalLevelData();                    // $0580 — set up stageBlock for BG fill
        if (c98 >= 0x01C0 && c98 <= 0x049F) this.bgUpdate();               // $0078 → $06F0 (scroll + paint)

        // Skeleton bridge — Digit-1 (start) skips the splash and jumps to
        // game mode. 14.H replaces this with the proper $17E0 CoinChecking
        // + $0288 PromptForStartGame chain (insert coin → "PUSH 1PLAYER"
        // prompt → press start → DecrementCoins sets gameOrIntro := 1 +
        // GetPlayerLivesFromDip seeds player1Lives).
        if (input.startEdge()) {
            state.gameOrIntro = 1;
            // Counter98 is NOT reset on coin-up in source (it's only zeroed
            // at game-over in $0B7F-$0B84). Leave it ticking; once back in
            // intro mode after game-over, state5_GameOver will zero it.
        }
    },

    // $01E1 PrintCopyright — call ClearForeAndBackground ($0140), then
    // PrintTextLines(T1960, 3 rows). For 14.B the port only needs to
    // populate state.copyrightRows; ClearForeAndBackground's broader
    // effects (FG/BG plane wipe + per-stage counter resets) are no-ops
    // at this point (nothing else paints intro content yet — landed in
    // 14.C-F).
    _printCopyright() {
        state.copyrightRows = COPYRIGHT_TEXT.map(r => ({ ...r, w: 208, h: 8 }));
    },

    // $0196 SlowPrintScoreAverageTable — one char per frame. Each frame:
    //   state := Counter98 LSB & $1F   (0..31)
    //   bail if state < 6              (source skips the first 6 frames of
    //                                    each 32-frame row sub-cycle)
    //   row   := (Counter98 LSB >> 5) & 7   (0..7 — selects T1860 + N*32)
    //   col   := state - 6                  (0..25 — index into row tiles)
    //   paint SCORE_TABLE_ROWS[row].tiles[col] into state.scoreTableRows[row]
    //
    // Source's full range is [$0002, $011F] which also covers T1960 (the
    // first copyright row) at $0100..$011F. Port skips that range — those
    // chars are already painted by PrintCopyright at $0001, so re-walking
    // them is a no-op visually. Dispatch in introFrame guards against it
    // by limiting to counter98 <= $00FF.
    _slowPrintScoreTable(counter98) {
        const stateInRow = counter98 & 0x1F;
        if (stateInRow < 6) return;
        const row = (counter98 >> 5) & 0x07;
        const col = stateInRow - 6;
        state.scoreTableRows[row].tiles[col] = SCORE_TABLE_ROWS[row].tiles[col];
    },

    // $0BCA DrawScoreAverageTableTiles — one-shot at counter98 == $0120.
    // Paints 5 sprite groups at fixed canvas positions:
    //   alien #3 left/right halves at (24,128)/(32,128)         FG tiles $64/$65
    //   T0A40 4×2 alien block at anchor (16,144)                FG plane
    //   T3C00 6×2 bird block at anchor (8,168)                  BG plane
    //   T0A48 2×2 alien pilot at anchor (24,192)                BG plane
    // Tile data is column-major in source (Draw4x2/Draw6x2/Draw2x2 walk
    // [c0r0, c0r1, c1r0, c1r1, ...]), so the index → (col, row) mapping is
    // col = i >> 1, row = i & 1.
    _drawScoreIcons() {
        const sprites = state.scoreIconSprites;
        sprites.length = 0;
        sprites.push({ x: 24, y: 128, tile: 0x64, plane: 'fg' });
        sprites.push({ x: 32, y: 128, tile: 0x65, plane: 'fg' });
        _blitColumnMajor(sprites, SCORE_ICON_T0A40, 16, 144, 'fg');
        _blitColumnMajor(sprites, SCORE_ICON_T3C00,  8, 168, 'bg');
        _blitColumnMajor(sprites, SCORE_ICON_T0A48, 24, 192, 'bg');
    },

    // Port-side helper — called by state5_GameOver when game-over completes
    // and we drop back into intro mode (mirrors source's $0B7F-$0B87 path:
    // Counter98 := 0, GameOrAttract := 0). Source needs no game-object
    // clears because the game-state-machine simply stops blitting; the
    // canvas port redraws from state each frame, so we have to explicitly
    // mark game objects inactive to prevent them rendering during intro.
    // Removed when 14.H lands PromptForStartGame + GetPlayerLivesFromDip
    // (lives reset moves there; counter98/gameOrIntro resets stay here).
    _enterIntroMode() {
        state.gameOrIntro  = 0;
        state.counter98    = 0;
        state.player1Lives = 3;                 // port deviation — removed in 14.H
        state.fgOverlay.clear();

        // Clear active flags on all game objects so render skips them.
        state.player.alive         = false;
        state.player.bullet.active = false;
        for (const a of state.aliens)         a.controlA &= ~0x08;
        for (const b of state.birds)          b.shape    = 0;
        for (const b of state.enemyBullets)   b.state   &= ~0x08;
        for (const e of state.explosions)     e.counter  = 0;
        for (const e of state.bonusExplosions) e.counter = 0;

        // Reset slow-print rows so the next intro cycle types them out
        // fresh. (Copyright rows get re-populated by _printCopyright at
        // counter98 == $0001 next frame, so they're self-healing.)
        for (const row of state.scoreTableRows) row.tiles.fill(0);
        // Sprite icons re-populated by _drawScoreIcons at $0120 next cycle.
        state.scoreIconSprites.length = 0;
    },
};

// Helper — push column-major tile bytes as (x, y, tile, plane) sprite
// entries onto `out`. Layout: arr[i] at (anchorX + (i>>1)*8, anchorY + (i&1)*8).
function _blitColumnMajor(out, arr, anchorX, anchorY, plane) {
    for (let i = 0; i < arr.length; i++) {
        out.push({
            x: anchorX + (i >> 1) * 8,
            y: anchorY + (i & 1) * 8,
            tile: arr[i],
            plane,
        });
    }
}
