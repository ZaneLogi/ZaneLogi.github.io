// Player ship — L0876 PlayerUpdate (movement + bullet + shield) and the
// death cycle (L0AEA / L0B15 / L0B60). Spread into the `states` object
// in states.js the same way states_mothership.js and states_intro.js do.
//
// Methods use `this.foo()`, so they can call existing helpers
// (`_enterIntroMode` from introMixin, etc.) and existing helpers can
// call back into player methods (`alienVsPlayerCollision` /
// `enemyBulletUpdate` invoke `this.onPlayerHit()`).
//
// See `docs/research_player_movement.md` (L0876 family) and
// `docs/research_player_ship.md` (L0AEA / L0B15 / L0B60 death cycle)
// for the full source-citation map.

import { state } from './state.js';
import { input } from './input.js';
import { scoring } from './scoring.js';
import { PARTICLE_SPRITES } from './data.js';

// Particle frame offsets within PARTICLE_SPRITES (mirrors the private
// constants in states_mothership.js and states.js — kept local to each
// consumer to avoid a data.js manual edit; data.js is auto-generated).
const PARTICLE_T1B60 = 0;    // frame 0 — densest cloud
const PARTICLE_T1B70 = 16;   // frame 1 — medium
const PARTICLE_T1B80 = 32;   // frame 2 — sparse

export const playerMixin = {
    // L0876 — PlayerUpdate. Called every combat frame (not lane-gated).
    // research_player_movement.md §3.
    //
    // Source $08C4 MovePlayer dispatches on PlayerState bit-3:
    //   bit-3 CLEAR ($08CA JP Z,$0AA0): jump straight to DrawShields,
    //     which decrements ShieldCount and paints the 4×4 T1770 sprite.
    //     L0900 movement + L0926 animation are SKIPPED — $0AA0's body
    //     ($0AA0-$0AC1) never calls them. Player is frozen.
    //   bit-3 SET: fall through $08CD-$08E8 (ShieldCount nonzero → DEC
    //     only; ShieldCount zero + button pressed → activate, write $FF,
    //     immediate DEC to $FE), then $08EB CALL L0900 + $08F3 JP L0926.
    //
    // Bullet update ($0930) lives in L08A0 just after MovePlayer returns
    // ($08A6 CALL $0930), independent of which branch ran — so bullets
    // are fired/advanced during shield too.
    //
    // Port models PlayerState bit-3 implicitly via ShieldCount value:
    //   ACTIVE   sc > $C0  — bit-3 clear in source; skip move + anim
    //   COOLDOWN $C0 ≥ sc > 0 — bit-3 set; ShieldCount decrements but
    //                         button gate at $08D1 JP NZ,$08EA blocks
    //                         re-activation
    //   READY    sc == 0   — button check armed
    playerUpdate() {
        const sc = state.player.shieldCount;

        if (sc > 0xC0) {
            // ACTIVE phase: skip L0900 + L0926. Decrement ShieldCount;
            // on expire ($C0 transition) run ShieldsExpired ($0B48)
            // side effects.
            const next = (sc - 1) & 0xFF;
            if (next === 0xC0) {
                // $0B57-$0B59 ShieldsExpired: PlayerShipX := (X & ~7) | 3.
                // PlayerState/Shape resets at $0B4E/$0B51 — port doesn't
                // track those (research_player_ship.md §5.1 explains why
                // bit-3 PlayerState isn't modeled; the ShieldCount value
                // alone encodes the active/cooldown phase).
                state.player.x = ((state.player.x & ~7) | 3) & 0xFF;
            }
            state.player.shieldCount = next;
        } else {
            // COOLDOWN or READY — bit-3 set in source. L0900 + L0926 run.
            //
            // L0900 — left/right movement. Level-checked (held = continuous).
            // Boundaries from source: DEC when X >= $0D (min reachable = $0C);
            //                         INC when X <  $C0 (max reachable = $C0).
            // Note: research doc listed $0D–$BF as valid range but the assembly
            // allows one step past each: min=$0C, max=$C0. Verify if collision
            // detection cares about the extra pixel at each edge.
            if (input.leftPressed && state.player.x >= 0x0D) {
                state.player.x = (state.player.x - 1) & 0xFF;
            } else if (input.rightPressed && state.player.x < 0xC0) {
                state.player.x = (state.player.x + 1) & 0xFF;
            }

            // L0926 + T1600 — select pre-shifted tile variant. T1600 is a non-linear
            // lookup: X%8=0→frame5, X%8=4→frame1, etc. tileBase = 0x30+(T1600[v]>>1).
            // Draw at (X & ~7, Y) so the tile content provides the sub-pixel offset.
            // Same pattern as drawAlien: snap-draw + variant content = exact pixel pos.
            const T1600 = [0x10, 0x14, 0x18, 0x1C, 0x00, 0x04, 0x08, 0x0C];
            const shape = T1600[state.player.x & 7];
            const tileBase = 0x30 + (shape >> 1);
            const p = state.player;
            p.tiles[0] = tileBase;
            p.tiles[1] = tileBase + 1;
            p.tiles[2] = tileBase + 0x10;
            p.tiles[3] = tileBase + 0x11;

            // Shield button — only checked in READY (sc == 0). In COOLDOWN
            // (0 < sc ≤ $C0) source's $08D1 JP NZ,$08EA bypasses the
            // button check and just decrements.
            if (sc > 0) {
                state.player.shieldCount = (sc - 1) & 0xFF;
            } else if (input.barrierEdge()) {
                // $08DC-$08E8 activate path: clear PlayerState bit-3, write
                // ShieldCount := $FF, fall through to $08EA DEC (HL) →
                // $FE. Port writes the post-DEC value $FE so the very next
                // frame enters the ACTIVE branch at sc = $FE (frame
                // selector ($FE & $0C) >> 2 = 3 → T17A0 blink, matches
                // source's first DrawShields frame after activation).
                state.player.shieldCount = 0xFE;
            }
        }

        // L0930 — bullet update. Source $08A6 calls $0930 unconditionally
        // after MovePlayer ($08C4) returns, so bullets fire/advance during
        // both ACTIVE and COOLDOWN/READY phases.
        this.playerBulletUpdate();
    },

    // L0930 + L0964 — fire and move the primary player bullet.
    // research_player_movement.md §6.
    playerBulletUpdate() {
        const p = state.player;
        const b = p.bullet;
        if (b.active) {
            // L0964: move up 8 grid units per frame; deactivate when Y < $1F.
            b.y = (b.y - 8) & 0xFF;
            if (b.y < 0x1F) b.active = false;
        } else if (input.fireEdge()) {
            // L0930 spawn: bullet X = PlayerShipX + 4, Y = PlayerShipY - 8.
            b.x = (p.x + 4) & 0xFF;
            b.y = (p.y - 8) & 0xFF;
            b.active = true;
            // TODO: use 0x50 + (b.x & 7) (T1620[X%8]) for correct sub-pixel
            // variant at spawn. Visually negligible (bullet moves too fast).
        }
    },

    // L097A — port equivalent for $439E/$439F (mapped player left/right
    // tile columns). Source maintains these as RAM state each frame; this
    // port computes them on the fly since enemyFireScanAndSpawn is the only
    // caller (would also be needed for re-enabled L0CB4 player-hit path,
    // step 9-followup). Promote to state field if more callers appear.
    //
    // T0B38 (research_player_movement.md §7): symmetric delta table indexed
    // by X%8. left = X - leftDelta, right = X + rightDelta = X + leftDelta + 8.
    mappedPlayerX() {
        const T0B38_LEFT = [0, 1, 2, 3, 3, 2, 1, 0];
        const x = state.player.x & 0xFF;
        const lDelta = T0B38_LEFT[x & 7];
        return {
            left:  (x - lDelta) & 0xFF,
            right: (x + lDelta + 8) & 0xFF,
        };
    },

    // Called when the player ship is hit (alien body or enemy bullet).
    // Mirrors source $0CC4: GameState := 4, CounterA5 := $60, hide ship.
    //
    // Port-deviation §5.1 shield gate: source uses tile-level absorption
    // (bullet's screen-RAM read at $0CA8 sees shield tile $E8 → JP L096E)
    // before ever reaching $0CB4. The canvas port has no FG screen RAM, so
    // we add an explicit flag check here.
    //
    // Gate is `shieldCount > 0xC0` (ACTIVE phase only) — matches source's
    // "shield tile is on screen" window. During COOLDOWN (0 < sc ≤ $C0)
    // the source's tile-absorption stops working (ShieldsExpired wiped
    // the shield tiles) and the player is vulnerable again. Port matches
    // that here by treating only ACTIVE as protective. Side-effect: in
    // the port the shield ALSO blocks alien-body hits during ACTIVE (where
    // source does not, since alien sprites overwrite the shield tile and
    // the alien-body check at $0CF4 doesn't read tiles); the simpler
    // single-gate semantics are an acceptable trade for the ~1 s active
    // window. Documented in research_player_ship.md §5.1.
    onPlayerHit() {
        if (state.player.shieldCount > 0xC0) return;

        state.player.alive         = false;
        state.player.bullet.active = false;   // freeze the in-flight bullet
        state.counterA5            = 0x60;    // 96-frame explosion window
        state.gameState            = 4;
        // $4363 ParticleExplosion := $10 — port skips (L2070 deferred,
        // and CounterA5 alone drives the L20E8 frame selector).
    },

    // L0AEA — player explosion + L0B15 respawn/game-over decision.
    // CounterA5 ticks $60 → $00 (96 frames, ~1.6 s). Phase dispatch:
    //   == 0     → L0B15 (respawn or game over)
    //   == $20   → ClearForeground equivalent (one-shot mid-explosion wipe)
    //   <  $20   → L0BA0 late phase (stages 4-8 only: scroll reset + clear BG)
    //   >  $20   → L0BBA early phase: particle frame draw on bit-0 odd, bit-1 clear ticks
    //
    // Source's L0BBA alternates between L0FC0 (alien + bonus explosion
    // anims) on bit-0 even, L2070 (T2800/T2900 serpentine) on bit-0 odd
    // + bit-1 set, and L20E8 (T1B90 4×4 particle) on bit-0 odd + bit-1
    // clear. Port reuses L0FC0 and L20E8; the serpentine scatter is the
    // second instance of the research_mothership.md §10 deviation (also
    // documented at research_player_ship.md §2.5).
    state4_PlayerExplosion() {
        state.counterA5 = (state.counterA5 - 1) & 0xFF;
        const a5 = state.counterA5;

        if (a5 === 0) {
            return this._playerRespawnDecision();   // L0B15
        }
        if (a5 === 0x20) {
            // $0B0A — $0380 ClearForeground wipes the FG screen RAM
            // ($4200-$433F). Port has no FG screen RAM mirror so we
            // clear every state.* field that contributes to FG-plane
            // rendering: aliens, birds, enemy bullets, player bullet,
            // accumulated particle overlay, plus the alien-kill /
            // bonus-kill explosion slots ($4370-$437F mirrors). Without
            // this, alien sprites stay visible all the way into state 5
            // "GAME OVER" — source wipes them here so the game-over
            // banner sits on a (mostly) clean screen.
            state.fgOverlay.clear();
            for (const a of state.aliens) {
                a.controlA &= ~0x08;
                a.alive = false;
            }
            for (const b of state.birds) b.shape = 0;
            for (const b of state.enemyBullets) b.state &= ~0x08;
            state.player.bullet.active = false;
            for (const e of state.explosions)      e.counter = 0;
            for (const e of state.bonusExplosions) e.counter = 0;
            return;
        }
        if (a5 < 0x20) {
            // L0BA0 — late phase. Only acts on intro stages (4-8); on
            // combat stages (0-3, A-B) returns early so the starfield
            // and existing state survive.
            const stage = state.levelAndRound & 0x0F;
            if (stage >= 4 && stage < 9) {
                state.counterB9 = 0;
                state.bgTiles.fill(0);   // $03A0 ClearBackground
            }
            return;
        }
        // a5 in $21..$5F — L0BBA early phase.
        if ((a5 & 0x01) === 0) {
            // L0FC0 — alien-kill + bonus explosion animations. Source
            // ticks these every other frame so the explosion the alien
            // or bird spawned at the moment of the player death (when
            // the collision called killAlienRegular or onBirdHit) plays
            // out its ~12-16-frame animation. Without this, the sprite
            // freezes on the spawn frame for ~1 s until the $20 wipe.
            this.explosionUpdate();
            this.bonusExplosionUpdate();
        } else if ((a5 & 0x02) === 0) {
            // bit-0 odd AND bit-1 clear → L20E8 player particle frame.
            this._drawPlayerParticleFrame(a5);
        }
        // bit-0 odd AND bit-1 set → L2070 serpentine scatter (port skipped).
    },

    // $20E8 + T1B90 selector port — particle frame at player's hit position.
    // Sibling of states_mothership.js _drawParticleFrame; anchor differs
    // (player.x/y at hit time vs mothership belt-row). Player.x/y are
    // never overwritten during state 4, so they still hold the pre-hit
    // values even though .alive is false.
    _drawPlayerParticleFrame(counterA5) {
        // 4×4 sprite (32×32 px) centered on the 16×16 player ship.
        const cx = state.player.x & ~7;
        const cy = state.player.y & ~7;
        const START_COL = (cx >> 3) - 1;
        const START_ROW = (cy >> 3) - 1;

        // T1B90 selector — (CounterA5 >> 2) & $0E maps to a frame:
        //   0 → T1B80 sparse, 2 → T1B70, 4 → T1B60 densest, 6 → T1B70.
        // 8..E → source's "deletion" path; in port we clear the 4×4
        // region (functionally equivalent to source's screen-RAM erase).
        const tableIdx = (counterA5 >> 2) & 0x0E;
        let frameOff;
        if      (tableIdx === 0) frameOff = PARTICLE_T1B80;
        else if (tableIdx === 2) frameOff = PARTICLE_T1B70;
        else if (tableIdx === 4) frameOff = PARTICLE_T1B60;
        else if (tableIdx === 6) frameOff = PARTICLE_T1B70;
        else {
            for (let dc = 0; dc < 4; dc++) {
                for (let dr = 0; dr < 4; dr++) {
                    state.fgOverlay.delete(`${(START_COL + dc) * 8},${(START_ROW + dr) * 8}`);
                }
            }
            return;
        }

        // 4×4 column-major (DrawImageCbyB layout).
        for (let dc = 0; dc < 4; dc++) {
            for (let dr = 0; dr < 4; dr++) {
                const tile = PARTICLE_SPRITES[frameOff + dc * 4 + dr];
                if (tile === 0) continue;
                state.fgOverlay.set(`${(START_COL + dc) * 8},${(START_ROW + dr) * 8}`, tile);
            }
        }
    },

    // L0B15 — respawn-vs-game-over decision (fires at CounterA5 == 0).
    // Speculatively writes GameState := 5 (GAME OVER); if lives remain
    // after decrement, overwrites with GameState := 0 (cold-path respawn
    // through 0 → 1 → 2 → 3, ~130 frames before regaining control).
    _playerRespawnDecision() {
        state.gameState = 5;                              // speculative
        if (state.player1Lives === 0) return;             // pre-decrement zero (defensive)
        state.player1Lives--;
        scoring.updateLivesScreen();
        if (state.player1Lives === 0) return;             // last life lost → GAME OVER
        state.gameState = 0;                              // respawn via cold path
        state.fgOverlay.clear();
    },

    // L0B60 — GAME OVER banner state. CounterA5 enters at 0 (carried
    // from L0AEA's final tick) and increments UP each frame.
    //   == $40 → ClearBackground (one-shot wipe of the BG plane)
    //   == $80 → drop back into intro mode + reset Counter98 (mirrors
    //            source $0B7F-$0B84). The lives-reset workaround below is
    //            still needed until 14.H ports PromptForStartGame +
    //            GetPlayerLivesFromDip — at that point lives reset moves
    //            to coin-up handling and is removed from here.
    //   else   → repaint the GAME OVER banner row (port: nothing to do
    //            since render.frame draws state.gameOverRow each tick
    //            while gameState === 5).
    // Banner is drawn between entry and $80 (~2.1 s).
    // Two-player swap-bank path at $0B7E is a no-op in this 1P-only port.
    state5_GameOver() {
        state.counterA5 = (state.counterA5 + 1) & 0xFF;
        const a5 = state.counterA5;

        if (a5 === 0x40) {
            state.bgTiles.fill(0);              // $03A0 ClearBackground
            return;
        }
        if (a5 === 0x80) {
            state.gameState = 0;                // $0B77 — GameState := 0
            this._enterIntroMode();             // $0B7F-$0B87 + port-side game-object clears
        }
        // a5 in (0,$40) ∪ ($40,$80): render.frame() repaints gameOverRow.
    },
};
