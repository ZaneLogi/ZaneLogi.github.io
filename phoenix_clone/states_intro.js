// Intro mode — splash screen (step 14) + attract demo (step 15).
//
// L002D + L00E3 (SplashAndDemo) port. Mixed into the `states` object
// in states.js the same way states_mothership.js folds in state-6/7.
// Step 14 lands the splash visuals + coin-up path; step 15 will extend
// introFrame with the GameDemo dispatch + scripted input injection
// (research_splash_attract.md §4-§5).

import { state } from './state.js';
import { input } from './input.js';
import { scoring } from './scoring.js';
import { COPYRIGHT_TEXT, SCORE_TABLE_ROWS,
         SCORE_ICON_T0A40, SCORE_ICON_T0A48, SCORE_ICON_T3C00,
         INTRO_BIRD_FRAMES } from './data.js';

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
        if (c98 >= 0x0300 && c98 <= 0x06AF) this._drawIntroBird(c98);      // $21DC — animated bird, fixed center
        else state.introBird.shape = 0;                                    // port: source only calls DrawBirdObject from $21DC, so outside the range no bird draws
        // 14.G — Source dispatches GameDemo $03B0 from $03E6 to $1510
        // (three back-to-back attract demos, see Code.md $0798-$0805).
        // Step 15 will port it; until then the proper $1510 loop point
        // sits at the end of a ~62 s blank window after bird ends.
        // **Placeholder shortcut**: loop back at $06B0 (= bird end + 1)
        // so the cycle is ~28 s instead of ~90 s. Step 15 removes this
        // line and $1510 becomes the active trigger again.
        if (c98 === 0x06B0) this._loopBackToSplashStart();
        if (c98 === 0x1510) this._loopBackToSplashStart();  // source-faithful trigger; reached only after step 15 removes the $06B0 shortcut

        // 14.H — 1-player coin + start path (simplified from source's
        // $17E0 CoinChecking + $0288 PromptForStartGame). No DIP/coinage
        // halving, no 2P-start prompt, no "PUSH" text rows. Digit-5
        // increments coinCount (cap 99); Digit-1 starts only when at
        // least one coin is credited (decrements then sets gameOrIntro=1).
        // Counter98 is NOT reset on coin-up in source either (it's only
        // zeroed at game-over $0B7F-$0B84); leave it ticking.
        if (input.coinEdge()) {
            state.coinCount = Math.min(state.coinCount + 1, 99);
            scoring.updateCoinScreen();
        }
        if (input.startEdge() && state.coinCount > 0) {
            state.coinCount -= 1;
            scoring.updateCoinScreen();
            state.player1Lives = 3;          // port: hard-coded lives until $0350 DIP-read lands
            state.gameOrIntro  = 1;
        }
    },

    // $01E1 PrintCopyright — call ClearForeAndBackground ($0140), then
    // PrintTextLines(T1960, 3 rows). Fires twice: at counter98 == $0001
    // (one-shot at attract entry) and == $01B0 (between score-table phase
    // and BG-scroll/bird phase). The second call's ClearForeAndBackground
    // wipes the score-average table + sprite icons so the bird phase
    // ($0300-$06AF) doesn't show them — matches arcade behavior.
    //
    // Port deviation: source's ClearForeAndBackground wipes BOTH FG and BG
    // planes; the port leaves state.staticTextRows (score header) and
    // state.bgTiles intact since the staticTextRows are draw-unconditional
    // in render.frame (source re-paints them each frame via $06ED inside
    // $06F0), and bgTiles get repainted by bgUpdate at counter98 >= $01C0.
    // The cleared content (scoreTableRows + scoreIconSprites) is intro-
    // only, never re-painted in source after $01B0.
    _printCopyright() {
        state.copyrightRows = COPYRIGHT_TEXT.map(r => ({ ...r, w: 208, h: 8 }));
        for (const row of state.scoreTableRows) row.tiles.fill(0);
        state.scoreIconSprites.length = 0;
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

    // $21DC DrawIntroBirdAnimationFrame — animated bird at fixed screen
    // position $49EF (= canvas (80, 120)). Two superimposed cadences from
    // Counter98 LSB:
    //   field3 = LSB & 0x07         → per-frame wing-flap sub-cycle
    //   shape  = T233A[(LSB & 0xF8) >> 3]  → updates every 8 frames
    // T233A walks egg ($01) → cracking ($02..$06) → first wing ($07) →
    // wing-flap cycle ($07/$0A × 4) → mature shapes ($09/$08) → walk
    // back down → $FF sentinel. The 32-byte extraction includes 9
    // trailing code bytes ($2351-$2359) that produce invalid shape
    // indices; render.drawIntroBird's bounds check skips those frames
    // (matches source — the bird briefly "blinks" at high LSB values).
    _drawIntroBird(counter98) {
        const lsb = counter98 & 0xFF;
        state.introBird.field3 = lsb & 0x07;
        state.introBird.shape  = INTRO_BIRD_FRAMES[(lsb & 0xF8) >> 3];
    },

    // 14.G splash-loop wrap. Source dispatches three attract-demo runs
    // ($03E6-$07A0, $0800-$0B60, $0C00-$1510) via GameDemo $03B0 — step
    // 15 territory. Until that lands, the splash cycle ends here: zero
    // Counter98 so the next tick re-enters at $0001 (PrintCopyright +
    // slow-print), and clear BG + introBird + scoreIcons so the new
    // cycle types out fresh. scoreTableRows + copyrightRows are
    // re-painted by the next $0001/$0002+ dispatch so no clear needed.
    _loopBackToSplashStart() {
        state.counter98 = 0;
        state.bgTiles.fill(0);
        state.scoreIconSprites.length = 0;
        state.introBird.shape = 0;
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
        state.fgOverlay.clear();
        // 14.I — `player1Lives = 3` workaround dropped: the coin/start
        // path (14.H) now resets lives at game-start, mirroring source's
        // $02B6 CALL $0350 GetPlayerLivesFromDip inside PromptForStartGame.

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
        // Intro bird re-populated by _drawIntroBird at counter98 >= $0300
        // next cycle; clear here so it doesn't draw at counter98 in
        // [$0000, $02FF].
        state.introBird.shape = 0;
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
