// Intro mode — splash screen (step 14) + attract demo (step 15).
//
// L002D + L00E3 (SplashAndDemo) port. Mixed into the `states` object
// in states.js the same way states_mothership.js folds in state-6/7.
// Step 14 lands the splash visuals + coin-up path; step 15 will extend
// introFrame with the GameDemo dispatch + scripted input injection
// (research_splash_attract.md §4-§5).

import { state } from './state.js';
import { input } from './input.js';
import { COPYRIGHT_TEXT } from './data.js';

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
    },
};
