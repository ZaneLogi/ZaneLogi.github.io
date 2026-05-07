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

    // Skeleton-only — replaced by tile-walking drawObject() in step 1.
    drawObjectPlaceholder(obj, color) {
        const pt = this.convertCoords({ x: obj.x, y: obj.y });
        this.ctx.fillStyle = color;
        this.ctx.fillRect(pt.x, pt.y, obj.w, obj.h);
    },
};
