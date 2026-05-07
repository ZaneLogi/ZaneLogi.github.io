import { gfx } from './gfx.js';
import { state } from './state.js';
import { runloop } from './runloop.js';
import { input } from './input.js';
import { resource } from './resource.js';

// research_rendering.md §5 — per-frame: clear → drawBackground → walk objects.
// Skeleton draws a debug grid in place of the BG tile-grid and a placeholder
// rectangle in place of drawObject(state.player).
//
// Press G to cycle the tile-ROM debug overlay: off → fg → bg → off.

const GRID_OFF = 0;
const GRID_FG  = 1;
const GRID_BG  = 2;

export const render = {
    gridMode: GRID_FG,   // Default ON so first boot shows the decoded tiles.

    frame() {
        if (input.gridEdge()) {
            this.gridMode = (this.gridMode + 1) % 3;
        }

        gfx.clear();
        this.drawDebugGrid();
        if (this.gridMode !== GRID_OFF) this.drawTileRomOverlay();
        gfx.drawObject(state.player);
        this.drawHud();
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
        hud.textContent =
            `tick=${runloop.tickCount}  ` +
            `state=${state.gameState}  ` +
            `counterA5=${state.counterA5}  ` +
            `player=(${state.player.x},${state.player.y})  ` +
            `grid=${gridLabel}\n` +
            `keys: ←/→ move · space fire · shift barrier · 5 coin · 1 start · g cycle tile-ROM overlay`;
    },
};
