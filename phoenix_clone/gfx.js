import { resource } from './resource.js';

export const gfx = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,

    init() {
        this.canvas = document.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.ctx.imageSmoothingEnabled = false;
    },

    // research_rendering.md §3.3 — Phoenix source X/Y are already in display
    // orientation (X horizontal, Y vertical, Y↓). Identity mapping; the
    // cabinet ROT90 lives only in screen-RAM addressing (T0A00), which the
    // JS port doesn't reproduce.
    convertCoords(srcPt) {
        return { x: srcPt.x, y: srcPt.y };
    },

    clear() {
        this.ctx.fillStyle = "#000";
        this.ctx.fillRect(0, 0, this.width, this.height);
    },

    // Skeleton-only — kept for any object that hasn't been wired to tile data yet.
    drawObjectPlaceholder(obj, color) {
        const pt = this.convertCoords({ x: obj.x, y: obj.y });
        this.ctx.fillStyle = color;
        this.ctx.fillRect(pt.x, pt.y, obj.w, obj.h);
    },

    // research_rendering.md §5 — walk obj.tiles[] row-major, skip transparent
    // (tile index 0 = FourByFourEmpty $17F0), drawImage each cell at its
    // (obj.x + col*8, obj.y + row*8) position via convertCoords. One function
    // for every tile-driven object (player, aliens, birds, mothership, bullets).
    drawObject(obj) {
        const cols = obj.w >> 3;
        const rows = obj.h >> 3;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const tile = obj.tiles[row * cols + col];
                if (tile === 0) continue;
                const pt = this.convertCoords({
                    x: obj.x + col * 8,
                    y: obj.y + row * 8,
                });
                this.ctx.drawImage(resource.fgTileImages[tile], pt.x, pt.y);
            }
        }
    },
};
