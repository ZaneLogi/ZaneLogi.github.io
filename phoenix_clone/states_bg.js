// Background plane subsystem — starfield scroll + planet/galaxy overlays.
//
// Source: L067A StarsScrollDown + L06B0 AddPlanetsToBackground +
//         L2040 AddGalaxiesToBackground + L06F0 bgUpdate + L24C4 dispatch.
//
// The BG plane is a 26×33-cell tile buffer (33 rows = source's 32 + 1
// hidden row above the canvas; research_rendering.md §4.2 explains the
// port-only design choice). starsScrollDown decrements counterB9 every
// frame; on 8-pixel boundaries it rotates the buffer down and refills
// hidden row 0 from one of three starfield ROM pages (T1C00 / T1D00 /
// T1F00). Planets and galaxies are CounterB9-keyed overlay writes that
// fire on specific phases and walk T1E00-T1ECF lookup tables.
//
// Spread into the main `states` object in states.js the same way
// states_mothership.js / states_intro.js / states_player.js do.
// Consumers continue to call `this.bgUpdate(...)` /
// `this.bgUpdateIfAlienStage()` / `this.starsScrollDown(...)` via the
// mixin spread — no callsite changes.

import { state } from './state.js';
import {
    STARFIELD_T1C00,      // source T1C00 — starfield used by stages 0/5/7
    STARFIELD_T1F00,      // source T1F00 — starfield used by stage 2
    STARFIELD_T1D00,      // source T1D00 — mothership graphic (26x9 upside-down) used by stage 9
    PLANET_TILES,         // source T1E00 — 8 planets × 4 tiles (2x2 col-major)
    PLANET_MSB,           // source T1E20 — screen-RAM MSBs per planet entry
    PLANET_LSB_OFF,       // source T1E40 — within-column LSB offsets per entry
    PLANET_COL_LSB,       // source T1E60 — PLANET_TILES offset per column
    GALAXY_TILES,         // source T1E80 — 16 galaxies × 1 tile
    GALAXY_MSB,           // source T1EA0 — screen-RAM MSBs per galaxy
    GALAXY_LSB,           // source T1EC0 — screen-RAM LSBs per galaxy
} from './data.js';

// Read a byte from the current starfield ROM page. Source uses
// HL = ($43B2 << 8) | $43B3, with INC L wrapping at the 256-byte page
// boundary (low byte only). $1C and $1F are starfields (stages 0/5/7
// and 2). $1D is the upside-down mothership graphic — selected by
// stage 9's stage block (T05CC byte 7 = $1D) so $22B4 / starsScrollDown
// scrolls the mothership down from the top during the fade-in window
// (9 row-refills = 72 frames = counterB4=$48 to 0). research_mothership.md §3.
function readStarfield(hi, lo) {
    if (hi === 0x1C) return STARFIELD_T1C00[lo & 0xFF];
    if (hi === 0x1D) return STARFIELD_T1D00[lo & 0xFF];
    if (hi === 0x1F) return STARFIELD_T1F00[lo & 0xFF];
    return 0;
}

export const bgMixin = {
    // L067A StarsScrollDown — every frame: decrement counterB9, then on
    // 8-pixel scroll boundaries rotate bgTiles down one row and refill
    // hidden row 0 (canvas y = -8..-1) with 26 fresh bytes from
    // T1C00 / T1F00 (pointer in stageBlock[7..8] = $43B2/$43B3).
    //
    // Why this differs from source: source's L067A writes one row into
    // a 32-row plane and lets the scroll register wrap modulo 256 px.
    // That puts the row-fill briefly visible at display row 0/1 — an
    // artifact the arcade hides because its score row is opaque, but
    // the port shows because its score row has transparent gaps. The
    // 33-row + hidden-row design moves the fill fully off-screen.
    starsScrollDown() {
        state.counterB9 = (state.counterB9 - 1) & 0xFF;
        state.bgScrollY = state.counterB9;        // legacy mirror; unused
        // scrollPixel walks 0 → 7 as counterB9 walks (X) → (X-7) within
        // an 8-pixel band. We derive it from counterB9 so existing fill
        // timing (counterB9 & 7 == 0) stays aligned.
        state.scrollPixel = (8 - (state.counterB9 & 7)) & 7;

        if ((state.counterB9 & 0x07) !== 0) return;

        // 8-pixel boundary: rotate buffer down and refill the new row 0.
        // bgTiles[r] := bgTiles[r-1] for r = 32 down to 1. Old bgTiles[32]
        // (which was about to scroll off the bottom) is overwritten by
        // bgTiles[31]'s content. New bgTiles[0] gets fresh ROM data.
        const tiles = state.bgTiles;
        for (let r = 32; r >= 1; r--) {
            for (let c = 0; c < 26; c++) {
                tiles[r * 26 + c] = tiles[(r - 1) * 26 + c];
            }
        }
        // Refill hidden row 0 with 26 fresh starfield bytes from T1C00 /
        // T1F00; advance the ROM pointer so the next refill picks up
        // where this one left off. With gcd(26, 256) = 2, the pointer
        // cycle is 128 fills = 1024 px of scroll before the star pattern
        // truly repeats.
        const hi = state.stageBlock[7];
        let lo = state.stageBlock[8];
        for (let c = 0; c < 26; c++) {
            tiles[c] = readStarfield(hi, lo);
            lo = (lo + 1) & 0xFF;
        }
        state.stageBlock[8] = lo;
    },

    // L06B0 AddPlanetsToBackground — periodically paint a 2x2 planet
    // sprite onto the BG plane. Fires only on frames where CounterB9
    // matches the stage's planet-match counter (stageBlock[0] = $43AB);
    // each fire advances the match counter by stageBlock[1] ($43AC)
    // so the next planet lands at a deterministic CounterB9 phase, and
    // bumps a pair of index counters (stageBlock[2..3]) that walk the
    // T1E20 / T1E40 / T1E60 lookups for screen-RAM addr + tile-data ptr.
    addPlanetsToBackground() {
        if (state.counterB9 !== state.stageBlock[0]) return;

        // L06B9-L06C4 — advance the match counter and bump indices.
        state.stageBlock[0] = (state.stageBlock[0] + state.stageBlock[1]) & 0xFF;
        state.stageBlock[2] = (state.stageBlock[2] + 1) & 0xFF;
        state.stageBlock[3] = (state.stageBlock[3] + 1) & 0xFF;
        const B = state.stageBlock[2];
        const A = state.stageBlock[3];

        // L06C5-L06D0 — planet MSB + LSB-offset lookups (5-bit indexed).
        const idx = A & 0x1F;
        const D = PLANET_MSB[idx];
        // L06D1-L06DA — E_final = T1E40[idx] + 2 + ((counterB9 >> 3) & $1E)
        const lsbOff = PLANET_LSB_OFF[idx];
        const E = (lsbOff + 2 + ((state.counterB9 >> 3) & 0x1E)) & 0xFF;

        // L06DB-L06E3 — tile-list ptr inside T1E00 region. Source loads
        // L = T1E60[B & 0x1F] with H still at $1E from L06DB, so the
        // tile ptr = $1E00 | T1E60[B & 0x1F]. T1E60 values are multiples
        // of 4 in 0..28 range → indexes one of 8 planet tile-lists.
        const tileOff = PLANET_COL_LSB[B & 0x1F];

        // L06E4 → $07DC — 2x2 column-major draw at DE in source.
        // ⚠ PORT DEVIATION — same as galaxies: column from source addr,
        // but the row placement is shifted into the hidden+top region so
        // the planet spawns "from above" and scrolls down naturally:
        //   bgTiles[0, col  ] = UL  (tiles[0])  — hidden above canvas
        //   bgTiles[1, col  ] = LL  (tiles[1])  — top visible row
        //   bgTiles[0, col+1] = UR  (tiles[2])  — hidden above canvas
        //   bgTiles[1, col+1] = LR  (tiles[3])  — top visible row
        // At spawn time (scrollPixel = 0), only LL/LR are on screen —
        // the player sees just the bottom half of the planet appearing
        // at the very top edge. As scrollPixel ticks 1..7, UL/UR reveals
        // gradually from above. On the next 8-boundary buffer shift,
        // the whole planet ends up at bgTiles[1..2] (fully visible at
        // the top), and continues drifting downward each shift after.
        //
        // bgTiles[0] is also the row starsScrollDown refills each shift;
        // since addPlanetsToBackground runs AFTER starsScrollDown in
        // bgUpdate, planet writes overwrite the freshly-refilled star
        // content at row 0 the same frame they fire.
        const addr = (D << 8) | E;
        const off = (addr - 0x4800) & 0xFFFF;
        if (off >= 832) return;
        const col = 25 - ((off >> 5) & 0x1F);
        state.bgTiles[0 * 26 + col] = PLANET_TILES[tileOff    ];
        state.bgTiles[1 * 26 + col] = PLANET_TILES[tileOff + 1];
        if (col + 1 < 26) {
            state.bgTiles[0 * 26 + (col + 1)] = PLANET_TILES[tileOff + 2];
            state.bgTiles[1 * 26 + (col + 1)] = PLANET_TILES[tileOff + 3];
        }
    },

    // L2040 AddGalaxiesToBackground — periodically paint a single 1x1
    // galaxy tile onto the BG plane. Same match-fire pattern as planets
    // but with separate counters (stageBlock[4..6] = $43AF/$43B0/$43B1)
    // and a SUBTRACT-not-add increment, so the match counter walks
    // backwards through the 8-bit space.
    addGalaxiesToBackground() {
        if (state.counterB9 !== state.stageBlock[4]) return;

        // L2049-L2051 — advance the match counter (SUB, not ADD) and
        // bump the galaxy index.
        state.stageBlock[4] = (state.stageBlock[4] - state.stageBlock[5]) & 0xFF;
        state.stageBlock[6] = (state.stageBlock[6] + 1) & 0xFF;
        const A = state.stageBlock[6];
        const idx = A & 0x1F;

        // L2052-L2061 — three table lookups (tile, MSB, LSB) all 5-bit-
        // indexed on the same A.
        const tile = GALAXY_TILES[idx];
        const D    = GALAXY_MSB[idx];
        // L2062-L206A — E_final = T1EC0[idx] + 1 + ((counterB9 >> 3) & $1F)
        const E = (GALAXY_LSB[idx] + 1 + ((state.counterB9 >> 3) & 0x1F)) & 0xFF;

        // ⚠ PORT DEVIATION — column from source addr, row forced to the
        // top of the visible BG buffer (bgTiles[1] = display y = 0..7 +
        // scrollPixel). Source's row formula relies on bgScrollY's mod-256
        // wrap to coincidentally land galaxies at display y=8 each time;
        // the 33-row design doesn't have that wrap, so source's row would
        // place galaxies at literal mid-screen positions. Forcing row=1
        // restores the "spawn at top, scroll down" behavior the arcade
        // shows (and matches starsScrollDown which writes to the top row).
        const addr = (D << 8) | E;
        const off = (addr - 0x4800) & 0xFFFF;
        if (off >= 832) return;
        const col = 25 - ((off >> 5) & 0x1F);
        state.bgTiles[1 * 26 + col] = tile;
    },

    // L06F0 — three-stage BG update chain: scroll register + tile content.
    // Order matches source ($067A → $2040 → $06B0). Galaxies and planets
    // both compare against the CounterB9 that StarsScrollDown just
    // decremented, so the order matters: scroll first to advance the
    // counter, then the two overlay fills.
    bgUpdate() {
        this.starsScrollDown();
        this.addGalaxiesToBackground();
        this.addPlanetsToBackground();
    },

    // L24C4 — BG update gated by stage low nibble.
    //   stage < 8  (alien fade-ins + combat + spiral-fill + bird combat):
    //              call L06F0 (= bgUpdate); the planets/galaxies/stars
    //              starfield is the right overlay for these stages.
    //   stage >= 8 (mothership stages):
    //              call L24E0 instead — different BG handling for
    //              mothership wipe / shield blocks.
    //
    // Source call sites:
    //   - L2160 / L2180 — full-formation combat lanes 1 + 3 of L2130
    //   - L21A5         — depleted-formation bit-0=1 dispatch of L2146
    //   - L21BA         — stage-clear bit-0=1 path
    //
    // This is why the BG scrolls smoothly during alien combat — not just
    // during fade-in — even though L2000 itself never calls L06F0 directly.
    bgUpdateIfAlienStage() {
        const stage = state.levelAndRound & 0x0F;
        if (stage < 8) this.bgUpdate();
        else           this.motherShipBgUpdate();   // $24C4 stage>=8 branch
    },
};
