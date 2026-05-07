import { gfx } from './gfx.js';
import { state } from './state.js';
import { runloop } from './runloop.js';

// research_rendering.md §5 — per-frame: clear → drawBackground → walk objects.
// Skeleton draws a debug grid in place of the BG tile-grid and a placeholder
// rectangle in place of drawObject(state.player).

export const render = {
    frame() {
        gfx.clear();
        this.drawDebugGrid();
        gfx.drawObjectPlaceholder(state.player, "#0f0");
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

    drawHud() {
        const hud = document.getElementById('hud');
        if (!hud) return;
        hud.textContent =
            `tick=${runloop.tickCount}  ` +
            `state=${state.gameState}  ` +
            `counterA5=${state.counterA5}  ` +
            `player=(${state.player.x},${state.player.y})\n` +
            `keys: ←/→ move · space fire · shift barrier · 5 coin · 1 start`;
    },
};
