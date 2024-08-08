"use strict"

class Enemy {
    static initSprites(spriteSheet) {
        const W = 13 * 2;
        const H = 15 * 2;
        const S = H;
        let ctx;

        this.images_up = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.drawImage(spriteSheet,
                (i % 4 + 2) * 16 * 2, Math.floor(i / 4) * 16 * 2, W, H,
                2, 0, W, H);
            this.images_up[i] = bmp;
        }

        this.images_right = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(Math.PI / 2);
            ctx.translate(-S / 2, -S / 2);
            ctx.drawImage(this.images_up[i], 0, 0, S, S, 0, 0, S, S);
            ctx.restore();
            this.images_right[i] = bmp;
        }

        this.images_down = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-S / 2, -S / 2);
            ctx.drawImage(this.images_up[i], 0, 0, S, S, 0, 0, S, S);
            ctx.restore();
            this.images_down[i] = bmp;
        }

        this.images_left = [];
        for (let i = 0; i < 8; i++) {
            const bmp = createOffscreenCanvas(S, S);
            ctx = bmp.getContext('2d');
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.translate(-S / 2, -S / 2);
            ctx.drawImage(this.images_up[i], 0, 0, S, S, 0, 0, S, S);
            ctx.restore();
            this.images_left[i] = bmp;
        }
    }

    constructor(level, type, position, direction) {
        // if true, do not fire
        this.bullet_queued = false;
    }
}