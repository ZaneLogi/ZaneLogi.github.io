import { gfx } from './gfx.js';
import { state } from './state.js';
import { runloop } from './runloop.js';
import { input } from './input.js';
import { resource } from './resource.js';
import { ALIEN_SHAPE_TABLE } from './data.js';   // source T1420

// research_rendering.md §5 — per-frame: clear → drawBackground → walk objects.
// Skeleton draws a debug grid in place of the BG tile-grid; per-object draws
// go via gfx.drawObject (player) or drawAlien (aliens; Bit3 dispatch mirror).
//
// Press G to cycle the tile-ROM debug overlay: off → fg → bg → off.

const GRID_OFF = 0;
const GRID_FG  = 1;
const GRID_BG  = 2;

export const render = {
    gridMode: GRID_OFF,   // Default OFF so first boot no shows the decoded tiles.

    frame() {
        if (input.gridEdge()) {
            this.gridMode = (this.gridMode + 1) % 3;
        }

        gfx.clear();
        this.drawDebugGrid();
        if (this.gridMode !== GRID_OFF) this.drawTileRomOverlay();
        for (const row of state.staticTextRows) gfx.drawObject(row);
        for (const alien of state.aliens) this.drawAlien(alien);
        if (state.player.alive) gfx.drawObject(state.player);
        this.drawHud();
    },

    // Mirror of Bit3Controller ($0740) draw-side. controlA bit 3 enables
    // draw; bits 0-2 dispatch the layout via T0759:
    //   low3=0  L076D  Draw 1×1  → single tile = controlB raw (fade-in path)
    //   low3=1  L0788  Draw 2×1  → ALIEN_SHAPE_TABLE[b..+1] horizontal (16w × 8h)
    //   low3=3  L07AA  Draw 1×2  → ALIEN_SHAPE_TABLE[b..+1] vertical   (8w × 16h)
    //   low3=4  L07D2  Draw 2×2  → ALIEN_SHAPE_TABLE[b..+3] grid       (16w × 16h)
    // The source's delete-then-draw double-buffer (bit 4 in controlA) is a
    // no-op in the canvas port — the per-frame canvas clear replaces it.
    //
    // ALIEN_SHAPE_TABLE indexing note: source loads `H=$14, L=controlB` so
    // the lookup address is $1400+controlB, not $1420+controlB. The source
    // T1420 table (our ALIEN_SHAPE_TABLE) happens to start at $1420, so
    // controlB values < $20 would index outside it. Subtract $20 from
    // controlB to get the array offset.
    drawAlien(alien) {
        if (!alien.alive) return;
        if ((alien.controlA & 0x08) === 0) return;
        const ctx = gfx.ctx;
        const images = resource.fgTileImages;
        const low3 = alien.controlA & 0x07;
        const b = alien.controlB;
        switch (low3) {
            case 0:                                       // L076D Draw 1×1
                if (b !== 0) ctx.drawImage(images[b], alien.x, alien.y);
                break;
            case 1: {                                     // L0788 Draw 2×1
                const idx = b - 0x20;
                const t0 = ALIEN_SHAPE_TABLE[idx], t1 = ALIEN_SHAPE_TABLE[idx + 1];
                if (t0 !== 0) ctx.drawImage(images[t0], alien.x,     alien.y);
                if (t1 !== 0) ctx.drawImage(images[t1], alien.x + 8, alien.y);
                break;
            }
            case 3: {                                     // L07AA Draw 1×2
                const idx = b - 0x20;
                const t0 = ALIEN_SHAPE_TABLE[idx], t1 = ALIEN_SHAPE_TABLE[idx + 1];
                if (t0 !== 0) ctx.drawImage(images[t0], alien.x, alien.y);
                if (t1 !== 0) ctx.drawImage(images[t1], alien.x, alien.y + 8);
                break;
            }
            case 4: {                                     // L07D2 Draw 2×2
                const idx = b - 0x20;
                const t = [
                    ALIEN_SHAPE_TABLE[idx],     ALIEN_SHAPE_TABLE[idx + 1],
                    ALIEN_SHAPE_TABLE[idx + 2], ALIEN_SHAPE_TABLE[idx + 3],
                ];
                for (let i = 0; i < 4; i++) {
                    if (t[i] === 0) continue;
                    const dx = (i & 1) * 8;
                    const dy = (i >> 1) * 8;
                    ctx.drawImage(images[t[i]], alien.x + dx, alien.y + dy);
                }
                break;
            }
        }
    },

    drawDebugGrid() {
        const ctx = gfx.ctx;
        ctx.strokeStyle = "#101010";
        ctx.lineWidth = 1;
        for (let x = 0; x <= gfx.width; x += 8) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, gfx.height);
            ctx.stroke();
        }
        for (let y = 0; y <= gfx.height; y += 8) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(gfx.width, y + 0.5);
            ctx.stroke();
        }
    },

    drawTileRomOverlay() {
        // 16×16 grid of 8×8 tiles = 128×128, top-left corner.
        const ctx = gfx.ctx;
        const images = (this.gridMode === GRID_FG)
            ? resource.fgTileImages
            : resource.bgTileImages;
        if (!images) return;
        for (let i = 0; i < 256; i++) {
            const col = i & 0x0F;
            const row = i >> 4;
            ctx.drawImage(images[i], col * 8, row * 8);
        }
    },

    drawHud() {
        const hud = document.getElementById('hud');
        if (!hud) return;
        const gridLabel = ["off", "fg", "bg"][this.gridMode];
        const stage = state.levelAndRound & 0x0F;
        const round = state.levelAndRound >> 4;
        hud.textContent =
            `tick=${runloop.tickCount}  ` +
            `state=${state.gameState}  ` +
            `stage=${stage} round=${round}  ` +
            `counterA5=${state.counterA5}  ` +
            `counterB4=${state.stageBlock[9]}  ` +
            `grid=${gridLabel}\n` +
            `keys: ←/→ move · space fire · shift barrier · 5 coin · 1 start · g cycle tile-ROM overlay`;
    },
};
