// Mothership stage — JT4 stages 8/9/A/B + JT1 GameStates 6 / 7.
//
// Spread into the main `states` object in states.js via `...mothershipMixin`.
// Methods stay using `this.foo()` (same object identity at runtime), so
// they can call existing helpers (`starsScrollDown`, `stageAlienCombat`,
// etc.) and existing helpers can call back into mothership methods.
//
// See `docs/research_mothership.md` for the full source-citation map
// (Code.md $22B4 / $22CA / $2000+$24A0 / $2400 / $244C).

import { state } from './state.js';
import { scoring } from './scoring.js';
import { SHIELD_PROGRESSION, MOTHERSHIP_ANTENNA_ANIM, STARFIELD_T1C00, PARTICLE_SPRITES } from './data.js';

// Particle explosion frame offsets within PARTICLE_SPRITES (3 frames × 16 tiles).
const PARTICLE_T1B60 = 0;   // frame 0 — densest cloud
const PARTICLE_T1B70 = 16;  // frame 1 — medium
const PARTICLE_T1B80 = 32;  // frame 2 — sparse

// Split the 32-byte SHIELD_PROGRESSION extraction into the two source
// sub-tables. Indexed by `tile & 0x0F` for tiles in $60..$6F:
//   T1B40 — left-half belt cells  (bullet.x bit 2 == 0)
//   T1B50 — right-half belt cells (bullet.x bit 2 == 1, via L2030 path)
// 0xFF entries correspond to indices intercepted by the pilot-check
// branch ($23AC JP Z,$23C0) — those tiles never get damaged via the
// progression lookup; they either kill the pilot or no-op.
// research_mothership.md §6.3 / §6.4.
const SHIELD_T1B40 = SHIELD_PROGRESSION.slice(0,  16);
const SHIELD_T1B50 = SHIELD_PROGRESSION.slice(16, 32);

export const mothershipMixin = {
    // L22B4 — JT4 stage 9: mothership lone fade-in. Stars scroll
    // continuously (CALL StarsScrollDown $067A); CounterB4 decrements
    // each frame. When CounterB4 hits $28 (= 40), the one-shot flag at
    // $4367 ("mothership partially faded in") gets set in source — port
    // skips this because no other source routine reads it (only writers
    // are $22C3 and $22D7; likely vestigial / sound-related). When
    // CounterB4 hits 0, advance LR + set GameState=2 to re-init for
    // stage A (L0848 tail).
    //
    // The mothership graphic appears automatically: stage 9's stage
    // block (T05CC byte 7 = $1D, byte 9 = $48) routes starsScrollDown's
    // refill to T1D00 (upside-down mothership 26×9) instead of a
    // starfield. 72 frames / 8 px per refill = 9 row-refills = the
    // mothership scrolled into view from the top.
    // research_mothership.md §3.
    stageMothershipFadeIn() {                       // L22B4
        this.starsScrollDown();                     // $067A

        // $22B7-$22BA — DEC (HL=$43B4) = stageBlock[9] = CounterB4.
        const counterB4 = (state.stageBlock[9] - 1) & 0xFF;
        state.stageBlock[9] = counterB4;

        // $22BC: CP $28 + JP NZ,$0848 — once-only side-effect at $28
        // (set $4367 flag in source; vestigial, omitted in port).

        // L0848 tail: when CounterB4 reaches 0, advance LR and queue
        // state-2 re-init for the next stage.
        if (counterB4 === 0) {
            state.levelAndRound = (state.levelAndRound + 1) & 0xFF;
            state.gameState = 2;
        }
    },

    // L22CA — JT4 stage A: mothership + aliens fade-in. Piggy-backs on
    // stageAlienFadeIn (L0834) for every frame except the first. On the
    // first frame (CounterB4 == $C0, the initial value set by stage A's
    // stage block T05B4 byte 9), runs a one-shot:
    //   - CounterB4 := $30 (shorter window: 48 frames for aliens to fade)
    //   - $4367 := $FF (vestigial — no source reader; port omits)
    //   - $43BC := $3F (vestigial — no source reader; port omits)
    //
    // The mothership graphic from stage 9 (currently at rows 1-9) gets
    // pushed DOWN ~6 more rows during this fade-in window: stage A's
    // stage block sets starfieldMsb=$1C (T1C00 starfield), so the
    // bgUpdate calls inside stageAlienFadeIn refill hidden row 0 with
    // regular stars while shifting the buffer down. Net effect:
    // mothership ends at rows 7-15 (upper-middle = combat position
    // matching source's EraseMothership target $4AC6).
    // research_mothership.md §4.
    stageMothershipPlusAliensFadeIn() {              // L22CA
        if (state.stageBlock[9] !== 0xC0) {
            // $22D0 JP NZ,$0834 — every frame except the first.
            const wasOne = state.stageBlock[9] === 1;
            this.stageAlienFadeIn();

            // Port-only one-time shift at stage A → B transition.
            // In source, $24E0 (mothership scroll) fires during stage B
            // shortly after combat starts and shifts the mothership
            // down by ~1 row, matching arcade visual position. Port
            // hasn't implemented $24E0's continuous-scroll dynamics yet
            // (would require dynamic belt/antenna row tracking), so
            // compensate at the transition: rotate bgTiles down by 1
            // and refill the new hidden row with starfield. This puts
            // the mothership at bgTiles[7-15] instead of [6-14], so
            // belt at row 11 (= canvas y 80-87) matches arcade. The
            // existing counterB9 isn't touched.
            if (wasOne) {
                const tiles = state.bgTiles;
                for (let r = 32; r >= 1; r--) {
                    for (let c = 0; c < 26; c++) {
                        tiles[r * 26 + c] = tiles[(r - 1) * 26 + c];
                    }
                }
                // Fill the new hidden row with 0 (transparent). It scrolls
                // out-of-view quickly during stage B; the exact content
                // doesn't matter visually.
                for (let c = 0; c < 26; c++) tiles[c] = 0;
            }
            return;
        }
        // $22D3 — first frame one-shot.
        state.stageBlock[9] = 0x30;
        // $22D7 / $22DB vestigial flag writes ($4367, $43BC) omitted.
    },

    // L24C4 — mothership-stage replacement for the alien-stage bgUpdate.
    // Routed through bgUpdateIfAlienStage when (LR & 0x0F) >= 8.
    //
    // Per-call work:
    //   - $24CE CALL $24E0 — mothership-side scroll (gated: only fires
    //     when (m43AA & 0x0F) == 0 AND counterB9 >= $A0; deferred —
    //     scroll would shift the belt off bgTiles row 11, which would
    //     break beltAnimate's hardcoded row index. Re-enable as a
    //     follow-up that tracks belt-row position dynamically).
    //   - $24D1 INC (HL=$43AA) — bump the cadence counter
    //   - $24D6 AND $03 → $24D8 JP Z,$22FA — every 4th call: belt anim
    //   - $24DB JP $2322 — other 3 of 4: antenna/pilot anim (deferred
    //     to 12.5b; antenna draw at fixed BG cell needs the rotated
    //     bgTiles to keep the antenna position stable).
    //
    // Cadence: bgUpdateIfAlienStage fires on lanes 0 + 3 of the 4-lane
    // round-robin = 30 Hz during stage B alien-combat. So m43AA ticks
    // at 30 Hz, and beltAnimate fires at 30/4 = 7.5 Hz.
    // research_mothership.md §7 (touches §6 belt mechanic).
    motherShipBgUpdate() {                          // L24C4 stage>=8 branch
        // $24E0 mothership scroll — deferred (see method-doc above).
        // TODO: this.motherShipScroll(); when belt-row tracking added.

        state.m43AA = (state.m43AA + 1) & 0xFF;     // $24D1-$24D5
        if ((state.m43AA & 0x03) === 0) {           // $24D6-$24D8
            this.beltAnimate();                     // $22FA
        } else {
            this.motherShipAntennaAnimate();        // $2322
        }
    },

    // L2322 — mothership antenna + alien-pilot animation. Increments
    // $43A7, masks to 0-7 (8-frame cycle), looks up T1BC0 frame data
    // (8 tiles per frame, 2 cols × 4 rows column-major), draws to
    // BG cell at $49A6 = (col 12, row 7 in source coords).
    //
    // Port equivalent: T1BC0 data lives in MOTHERSHIP_ANTENNA_ANIM
    // (data.js, 64 bytes). After stages 9+A (15 refills), the antenna
    // region of T1D00 lands at bgTiles rows 7-10 cols 12-13 — so the
    // 2x4 image writes to those 8 cells.
    //
    // Note: row 10 col 12-13 are on the BELT row. The antenna anim
    // writes there 3 of every 4 frames; beltAnimate writes there
    // 1 of every 4 frames. They alternate, producing a composite
    // visual where the antenna's bottom edge overlays the belt's
    // pilot-protect area. Source-faithful per Code.md $24C4 dispatch.
    // research_mothership.md §7 + this method-doc.
    motherShipAntennaAnimate() {                     // L2322
        state.m43A7 = (state.m43A7 + 1) & 0xFF;     // $2325-$2326
        const frame = state.m43A7 & 0x07;           // $2327
        const off = frame * 8;                       // $2329-$232C

        // T1BC0 layout: 8 bytes per frame, first 4 = col 0 rows 0..3,
        // next 4 = col 1 rows 0..3. Source uses DrawImageCbyB which
        // walks down a column with INC L (= INC source-RAM L = +1 row),
        // then RightOneColumn for the next column.
        // With the stage A → B one-time shift in place, belt is at
        // bgTiles[11] = canvas y 80-87 and the mothership graphic
        // occupies bgTiles[7-15]. Source's $49A6 (col 12, source row 7)
        // maps to bgTiles[8] post-shift; the 4-row antenna image goes
        // there + 3 rows below (rows 8-11). But row 11 is the belt!
        // To match source's "antenna sits above belt" arrangement and
        // avoid corrupting belt cells, write antenna to bgTiles rows
        // 7-10 (= antenna at canvas y 48-79, just above belt at 80-87).
        const ANTENNA_ROW = 7;
        const ANTENNA_COL = 12;
        for (let dc = 0; dc < 2; dc++) {            // C=2 cols
            for (let dr = 0; dr < 4; dr++) {        // B=4 rows
                const idx = (ANTENNA_ROW + dr) * 26 + (ANTENNA_COL + dc);
                state.bgTiles[idx] = MOTHERSHIP_ANTENNA_ANIM[off + dc * 4 + dr];
            }
        }
    },

    // L22FA — belt animation. Walks 18 belt cells left-to-right,
    // applying a 2-bit shift-register transform that propagates each
    // cell's low 2 bits into the next cell's high 2 bits (within the
    // low nibble). Forces all output cells into $60-$6F range via
    // OR $60. Visual effect: belt patterns "scroll" horizontally.
    //
    // Source addresses (in BG memory): walks $4AAA → $488A in $20
    // strides, which maps to display (col 4..21, row 11). Seed value
    // for the shift register comes from the rightmost cell ($488A =
    // col 21, row 11). Port hardcodes the same row + col range.
    //
    // Bit ops (Code.md $2303-$2312):
    //   D = (oldC & 0x03) << 2           ; low 2 bits → bits 2,3
    //   newC = cell at HL                ; overwrites oldC
    //   A = ((newC & 0x0C) >> 2) | D | $60
    //   write A to cell at HL
    //   continue with C = old A (= the cell just written) for next iter
    //
    // So each iteration: cell's new low nibble = (own bits 2,3) at
    // bits 0,1 + (previous cell's bits 0,1) at bits 2,3 + high nibble 6.
    //
    // Important: this rewrites ALL 18 cells unconditionally, including
    // damaged ones. So damage states ($6C, $64, etc.) get cycled away
    // as the animation propagates — player must land hits faster than
    // the animation "heals" them. Source-faithful behavior.
    // research_mothership.md §6 + new note in this method-doc.
    beltAnimate() {                                  // L22FA
        // bgTiles row 11 after stages 9+A + the port-only one-time shift
        // at stage A → B transition (see stageMothershipPlusAliensFadeIn).
        // Without that extra shift, belt would be at bgTiles[10]; with it,
        // belt at bgTiles[11] = canvas y 80-87, matching arcade visual
        // position. Cols 4-21 match T1D00 row 4's belt layout.
        const BELT_ROW = 11;
        const COL_START = 4;
        const COL_END   = 21;
        const SEED_COL  = COL_END;

        // $22FF/$2302 — seed C from rightmost belt cell.
        let C = state.bgTiles[BELT_ROW * 26 + SEED_COL];

        // $2303-$231F walk — 18 iterations, left-to-right.
        for (let c = COL_START; c <= COL_END; c++) {
            const idx = BELT_ROW * 26 + c;
            const D = (C & 0x03) << 2;              // $2304-$2308
            C = state.bgTiles[idx];                 // $2309 LD C,(HL)
            const newCell = ((C & 0x0C) >> 2) | D | 0x60;  // $230A-$2310
            state.bgTiles[idx] = newCell;           // $2312 LD (HL),A
        }
    },

    // L24A0 — mothership hook injected into L2000 alien-combat per-frame.
    // For stage < 8: returns immediately (no-op for normal alien combat
    // at stages 1, 3). For stage >= 8: runs shield-block collision and
    // (in 12.6) mothership return fire.
    // research_mothership.md §5.1.
    motherShipHook() {                              // L24A0
        if ((state.levelAndRound & 0x0F) < 8) return;
        this.shieldBlockCollision();                // L2351
        // L24B1-L24B9 — mothership return fire on (Counter9A+1 & 3) == 3.
        // Source's "Counter9A+1" = $439B = port's `state.counter9a & 0xFF`
        // (see getRandomNumber comment for the byte mapping).
        if (((state.counter9a & 0xFF) & 0x03) === 0x03) {
            this.motherShipFire();                  // L24F2
        }
    },

    // L24F2 — mothership return fire. Picks a random X in $60..$6F (via
    // getRandomNumber + $60); rate-gates via (X & $0E) AND Counter9A+1
    // (must be 0); accepts only when X is in [PlayerLeft, PlayerRight]
    // so the mothership's fire tracks the player; computes bullet
    // Y from CounterB9; spawns through the shared enemy-bullet pipeline.
    //
    // Net firing rate: low. The random byte is 4 bits (port's
    // getRandomNumber returns 0..15), so X is always in $60..$6F (= canvas
    // x 96..111 — narrow center band). Player must be in that band AND
    // the bit-AND gate must pass. Source-faithful behavior — mothership
    // only fires when player is roughly under the center of its body.
    //
    // Bullet Y formula: $48 + ((-CounterB9) & $F8). With CounterB9=$F9
    // (post-stage-A), -$F9 = $07, $07 & $F8 = 0, so bullet Y = $48 = 72
    // (= just below the belt at canvas y 80-87 with the 12.5b shift). As
    // $24E0 (deferred) shifts the mothership down over time, bullet Y
    // will track naturally via this formula.
    // research_mothership.md §5.2.
    motherShipFire() {                              // L24F2
        // $30AA + $24F5: random + $60.
        const B = (this.getRandomNumber() + 0x60) & 0xFF;

        // $24FC-$24FF: rate gate.
        const counter9aP1 = state.counter9a & 0xFF;
        if (((B & 0x0E) & counter9aP1) !== 0) return;

        // $2500-$2509: player-tracking X bounds.
        const { left: playerLeft, right: playerRight } = this.mappedPlayerX();
        if (playerLeft >= B) return;            // $2504 RET NC
        if (playerRight < B) return;            // $2509 RET C

        // $250A-$250D: bullet X = candidate - 4.
        const bulletX = (B - 4) & 0xFF;

        // $250E-$2515: bullet Y = $48 + ((-CounterB9) & $F8).
        const bulletY = (0x48 + ((-state.counterB9) & 0xF8)) & 0xFF;

        // $251A → $25B7: spawn via shared enemy-bullet pipeline.
        this.spawnEnemyBulletAtXY(bulletX, bulletY);
    },

    // L2351 / L237B / L2398 — shield-block collision. Checks the BG tile
    // at the position one tile above the player bullet; damages the
    // tile or (in 12.7) triggers pilot kill.
    //
    // Source's address math (Code.md $2355-$2369):
    //   HL_FG = ($43E6, $43E7) = FG screen-RAM addr "above player bullet"
    //   HL_BG = HL_FG + $0800 (MSB+8) — FG plane ($40xx) → BG plane ($48xx)
    //           same display position
    //   HL_BG.L = (HL_BG.L + CounterB9>>3) & $1F  — scroll-row adjustment
    //
    // Port equivalent: derive the BG-tile cell from the bullet's canvas
    // (x, y - 8) using the port's `(r - 1) * 8 + scrollPixel` row math
    // (see render.drawBackground). The port's bgTiles buffer is already
    // "live" — scroll is baked in by render-time shift, no separate
    // CounterB9 wrap needed at lookup time.
    //
    // Tile dispatch:
    //   $4C..$4F (corner pieces) → $237B path: tile -= 1; if becomes
    //     $4B, clear to 0 + retile left neighbor's $5E → $4F
    //   $60..$6F (belt segments) → $2398 path: pick T1B40 or T1B50 by
    //     bullet.x bit 2, run pilot-check gate, otherwise look up next
    //     progressively-damaged tile. Pilot-kill path → GameState 6
    //     stubbed (12.7).
    //   anything else (including $7X pilot tile direct) → no-op
    //
    // The bullet is deactivated on any hit (bit 3 of bullet state cleared
    // in source; `state.player.bullet.active = false` here).
    // research_mothership.md §6.
    shieldBlockCollision() {                        // L2351
        const bullet = state.player.bullet;
        if (!bullet.active) return;

        // BG-cell column from bullet X (each tile = 8 px).
        const col = (bullet.x >> 3) & 0x1F;
        if (col >= 26) return;

        // BG-cell row at canvas y = bullet.y - 8. Inverse of
        // drawBackground's `y = (r - 1) * 8 + scrollPixel`.
        const yCanvas = bullet.y - 8;
        const r = Math.floor((yCanvas - state.scrollPixel) / 8) + 1;
        if (r < 1 || r >= 33) return;

        const idx = r * 26 + col;
        const tile = state.bgTiles[idx];

        // $236C-$2370 — corner-piece dispatch (tiles $4C-$4F). These
        // are the "yellow" body corner caps. Damaged by decrement; when
        // a $4C decrements past $4B to 0, the body shrinks upward by
        // one row, with the cell ABOVE re-tiled to a new corner cap.
        if ((tile & 0xFC) === 0x4C) {
            bullet.active = false;                  // $237C AND $F7 / $237E LD (DE),A
            const dec = (tile - 1) & 0xFF;          // $2385 DEC A
            if (dec === 0x4B) {                     // $2387 CP $4B
                // $238A: clear tile + retile the row ABOVE (source's
                // $238C DEC L = decrement source-RAM L = move one row
                // UP in canvas. Port's bgTiles row stride is 26).
                state.bgTiles[idx] = 0;
                const above = idx - 26;
                if (above >= 0 && state.bgTiles[above] === 0x5E) {
                    state.bgTiles[above] = 0x4F;
                }
            } else {
                state.bgTiles[idx] = dec;           // $2386 LD (HL),A
            }
            return;
        }

        // $2373-$2377 — belt dispatch (tiles $60-$6F).
        if ((tile & 0xF0) === 0x60) {
            bullet.active = false;                  // $2399 AND $F7 / $239B LD (DE),A

            // $239F-$23A2 — bullet.x bit 2 selects which T1Bxx table /
            // pilot-check gate. Bit 0 → L2030 path (right-half tile).
            const rightHalf = (bullet.x & 0x04) !== 0;

            let progTable;
            let pilotCheckFires;
            if (rightHalf) {
                // L2030: AND $03 / CP $01 / DE := T1B50 / JP $23AC.
                progTable = SHIELD_T1B50;
                pilotCheckFires = ((tile & 0x03) === 0x01);
            } else {
                // Direct $23A5-$23A9: AND $0C / CP $04 / DE := T1B40.
                progTable = SHIELD_T1B40;
                pilotCheckFires = ((tile & 0x0C) === 0x04);
            }

            if (pilotCheckFires) {
                // $23AC JP Z,$23C0 — pilot-kill branch. Check the BG
                // tile one row UP (idx - 26 in port's row-major bgTiles)
                // for $70..$7F pilot range. If present, trigger
                // GameState 6 (particle explosion) per source $23C7.
                const above = idx - 26;
                if (above >= 0 && (state.bgTiles[above] & 0xF0) === 0x70) {
                    state.gameState = 6;                 // $23CA
                    state.counterA5 = 0x60;              // $23CD
                    // $23D1 vestigial flag write ($4363 particle-start) omitted.
                }
                // Pilot kill OR pilot not exposed: don't damage the tile
                // (matches source's $23C6 RET NZ + no $23B5 write).
                return;
            }

            // $23AF-$23B5 — normal damage: tile & $0F indexes the picked
            // progression table; write the next tile back to BG.
            const next = progTable[tile & 0x0F];
            if (next !== 0xFF) {
                state.bgTiles[idx] = next;
            }
            // $23B6-$23B8 vestigial $4366 sound flag write — port omits.
        }
    },

    // L2400 — GameState 6: mothership particle explosion.
    // Triggered by $23C0 (pilot hit) which sets GameState=6 + CounterA5=$60.
    //
    // Source's per-frame work (Code.md $2400-$2426):
    //   - $242C (tick): snap counterB9 to 8-px boundary, derive particle
    //     anchor, decrement CounterA5. Returns A = new CounterA5.
    //   - if A == 0  → $2552 (transition to GameState 7)
    //   - if A < $20 → $246A (EraseMothership — paint T1C00 stars over
    //                  the mothership area)
    //   - if A == $20 → $2520 (bonus score calc + display)
    //   - else (A in $21..$5F) → animate particles via $20E8 or position
    //                            table draw
    //
    // Port simplification (12.7 minimum): omit particle animation +
    // bonus score popup (visual polish, not loop-closure). Keep CounterA5
    // tick, EraseMothership when A < $20, transition to state 7 at 0.
    // research_mothership.md §7.
    state6_MothershipExplosion() {                  // L2400
        // $242C — tick CounterA5 (+ scroll snap; port omits the scroll
        // register write since rendering uses scrollPixel directly).
        state.counterB9 = state.counterB9 & 0xF8;
        state.counterA5 = (state.counterA5 - 1) & 0xFF;
        const a5 = state.counterA5;

        if (a5 === 0) {
            // $2403 JP Z,$2552 — transition to GameState 7.
            return this._gameState6To7();
        }
        if (a5 === 0x20) {
            // $240B JP Z,$2520 — bonus score calc + ClearForeground.
            return this._motherShipBonusScore();
        }
        if (a5 < 0x20) {
            // $2408 JP C,$246A — erase the mothership progressively.
            return this._eraseMothership();
        }
        // a5 in $21..$5F: particle animation. Source dispatches to
        // $20E8 on EVEN ticks (T1B90-selected sprite) and $2085 on
        // ODD ticks (T2A00/T2B00 position-table draw). Port: even ticks
        // only for now (position-table draw deferred — visual is fine
        // with just the central particle frame cycling).
        if ((a5 & 1) === 0) {
            this._drawParticleFrame(a5);
        }
    },

    // $20E8 + T1B90 selector — particle frame draw (even-CounterA5 path).
    //
    // Source's T1B90 selector indexes by (CounterA5 >> 2) & $0E to pick
    // one of three particle frames (T1B60/T1B70/T1B80) or a deletion
    // image (T17F0, treated as "no draw" here):
    //   index 0 → T1B80 (frame 2 — sparse)
    //   index 2 → T1B70 (frame 1)
    //   index 4 → T1B60 (frame 0 — densest)
    //   index 6 → T1B70 (frame 1)
    //   index 8..E → deletion (skip draw)
    //
    // The sprite is 4×4 FG tiles drawn via fgOverlay (= render.drawSpiral
    // Overlay path) at a fixed mothership-center position. Each call
    // first clears the previous frame's overlay entries from the 4×4
    // region, then writes the new frame's non-zero tiles.
    //
    // Port simplification: source's $20E8 also walks the position via
    // CounterB9 (D += 8, scroll math) — port draws at a fixed center
    // position. Result: particle pulses in place rather than drifting,
    // visually close enough for the loop-closer.
    // research_mothership.md §7.2.
    _drawParticleFrame(counterA5) {
        // Fixed mothership-center position. Mothership occupies bgTiles
        // rows 7-15 cols 3-22; center of belt area = roughly (col 11, row 10).
        // KNOWN DEVIATION: source's $20E8 computes position from CounterB9
        // and walks it down each tick (the mothership scrolls down during
        // the explosion). Port doesn't scroll the mothership in state 6,
        // so the particle currently appears LOWER than the pilot
        // (= where it would naturally be after a scroll). Fix is part of
        // the same dynamic-row-tracking work that'll replace the 12.5b
        // one-time shift (deferred to 12.10 when $24E0 lands).
        const START_COL = 11;
        const START_ROW = 10;

        // Clear the previous frame's 4×4 region from fgOverlay.
        for (let dc = 0; dc < 4; dc++) {
            for (let dr = 0; dr < 4; dr++) {
                state.fgOverlay.delete(`${(START_COL + dc) * 8},${(START_ROW + dr) * 8}`);
            }
        }

        // T1B90 selector — map (CounterA5 >> 2) & $0E to frame offset.
        const tableIdx = (counterA5 >> 2) & 0x0E;
        let frameOff;
        if      (tableIdx === 0) frameOff = PARTICLE_T1B80;
        else if (tableIdx === 2) frameOff = PARTICLE_T1B70;
        else if (tableIdx === 4) frameOff = PARTICLE_T1B60;
        else if (tableIdx === 6) frameOff = PARTICLE_T1B70;
        else                     return;     // 8..E → deletion (skip)

        // Draw 4×4 column-major (matches source DrawImageCbyB).
        for (let dc = 0; dc < 4; dc++) {
            for (let dr = 0; dr < 4; dr++) {
                const tile = PARTICLE_SPRITES[frameOff + dc * 4 + dr];
                if (tile === 0) continue;    // transparent — skip
                state.fgOverlay.set(`${(START_COL + dc) * 8},${(START_ROW + dr) * 8}`, tile);
            }
        }
    },

    // $2520 — bonus score calc + ClearForeground at CounterA5 == $20.
    //
    // Source flow ($2520-$254D):
    //   - PUSH DE / CALL ClearForeground / POP DE
    //   - skillBonus = (CounterB9 + $60) >> 1
    //   - roundContrib = LR & $F0
    //   - combined = roundContrib + skillBonus (capped at $90)
    //   - DAA → BCD
    //   - Store at $439D ($00), $439E (00)
    //   - PrintNumber 4 digits at screen pos derived from DE
    //
    // Port simplification (12.8):
    //   - ClearForeground: hide aliens (clear alive + controlA bit 3),
    //     deactivate bullets, clear fgOverlay. Aliens render directly
    //     from state.aliens each frame in port (no FG-buffer), so
    //     "clearing" means marking them invisible.
    //   - Bonus score: compute combined value, interpret as BCD
    //     (high nibble × 10 + low nibble), multiply by 100 (the
    //     two trailing "00" digits), add to player score via
    //     scoring.addPoints. The popup at the mothership position
    //     deferred (12.9) — score still increments at the top.
    // research_mothership.md §9.
    _motherShipBonusScore() {                       // L2520
        // ClearForeground equivalent (port).
        for (const a of state.aliens) {
            a.alive = false;
            a.controlA &= ~0x08;
        }
        state.player.bullet.active = false;
        for (const b of state.enemyBullets) b.state = 0;
        state.fgOverlay.clear();

        // Compute bonus score per $2525-$253C.
        const skillBonus = (((state.counterB9 + 0x60) & 0xFF) >> 1) & 0xFF;
        const rawAdd = (state.levelAndRound & 0xF0) + skillBonus;
        const combined = rawAdd > 0xFF || rawAdd >= 0x90 ? 0x90 : rawAdd;
        // DAA-equivalent: treat high nibble as tens digit, low nibble
        // as ones digit (BCD interpretation). For our value range
        // ($00..$90) the low nibble is rarely in $A-$F (only on
        // un-normalized binary sums), so this approximates source's
        // DAA without explicit BCD-correction.
        const bcdDecimal = ((combined >> 4) * 10) + (combined & 0x0F);
        const pts = bcdDecimal * 100;     // "$XX 00" 4-digit BCD = XX × 100

        // Credit the active player.
        const player = state.gameAndDemoOrSplash;
        scoring.addPoints(pts, player);
    },

    // $2552 — transition from GameState 6 to 7.
    _gameState6To7() {
        state.gameState = 7;
        state.counterA5 = 0x40;
        // $4363/$436B vestigial flag writes omitted.
    },

    // $246A EraseMothership — overlays a 20×9 T1C00 starfield image at
    // the mothership area. Source dest = $4AC6 = port (col 3, row 7) per
    // bgWrite. With the 12.5b one-time shift, port's mothership graphic
    // occupies bgTiles rows 7-15. Erase span: rows 7-15 cols 3-22.
    //
    // Source uses DrawImageCbyB column-major (9 tiles down per column,
    // 20 columns wide); port replicates the same byte-walk order so the
    // resulting starfield pattern matches source.
    _eraseMothership() {                            // L246A
        let off = 0;
        for (let dc = 0; dc < 20; dc++) {
            for (let dr = 0; dr < 9; dr++) {
                const idx = (7 + dr) * 26 + (3 + dc);
                state.bgTiles[idx] = STARFIELD_T1C00[off++ & 0xFF];
            }
        }
    },

    // L244C — GameState 7: mothership score display.
    // Triggered by $2552 with CounterA5 = $40 (~64 frames at 60Hz).
    //
    // Source per-frame work (Code.md $244C-$2466):
    //   - DEC CounterA5
    //   - if low bit was 1 → $06F0 (bgUpdate — keep stars scrolling)
    //   - if CounterA5 != 0 → return
    //   - CounterA5 hit 0: advance to next round.
    //     - GameState := 2
    //     - LR := (LR & $F0) + $10 (next round, stage 0)
    //     - AliensLeft := 16
    //     - ClearForeground
    //
    // research_mothership.md §8.
    state7_MothershipScore() {                      // L244C
        state.counterA5 = (state.counterA5 - 1) & 0xFF;
        const oddTick = ((state.counterA5 + 1) & 0x01) === 0x01;   // low bit of OLD counterA5
        if (oddTick) {
            this.bgUpdate();                         // $06F0
            return;
        }
        if (state.counterA5 !== 0) return;
        // Timer expired: advance to next round.
        state.gameState = 2;
        state.levelAndRound = ((state.levelAndRound & 0xF0) + 0x10) & 0xFF;
        state.aliensLeft = 0x10;
        // $0380 ClearForeground — port: drop the FG overlay map.
        state.fgOverlay.clear();
    },
};
