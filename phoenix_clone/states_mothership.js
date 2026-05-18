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
import { SHIELD_PROGRESSION } from './data.js';

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
            return this.stageAlienFadeIn();
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
            // $24DB JP $2322 — antenna/pilot animation, deferred 12.5b.
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
        // bgTiles row 10 after stages 9+A: 9 refills (stage 9) + 6
        // (stage A) = 15 total. The 5th refill (T1D00 row 4 = belt)
        // ends up at bgTiles[15 - 5] = bgTiles[10]. Cols 4-21 match
        // T1D00 row 4's belt layout (cols 0-3 = decoration / $5C end
        // cap, cols 4-21 = $60/$6A alternating belt, cols 22-25 = $5D
        // end cap + decoration).
        const BELT_ROW = 10;
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
        // L24B1-L24B9 mothership return fire — step 12.6 TODO.
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
                // $23AC JP Z,$23C0 — pilot-kill branch. Source's
                // $23C0 DEC L checks the BG tile ONE ROW UP in canvas
                // (source-RAM L decrement = -1 row). If it's in the
                // $70..$7F pilot range, set GameState=6 + CounterA5=$60.
                // Port: pilot kill deferred to step 12.7. Return without
                // damaging the tile (matches source's $23C6 RET NZ when
                // pilot isn't actually exposed).
                // TODO 12.7: if bgTiles[idx - 26] & $F0 == $70 →
                //   state.gameState = 6; state.counterA5 = 0x60;
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

    // L2400 — GameState 6: mothership particle explosion. Triggered by
    // $23C0 (pilot hit). Ports in step 12.7.
    state6_MothershipExplosion() {},

    // L244C — GameState 7: mothership score display. Triggered by $2552.
    // Ports in step 12.9.
    state7_MothershipScore() {},
};
