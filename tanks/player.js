"use strict"

class Player {
    static initSprites(spriteSheet) {
        const W = 13 * 2;
        const H = 13 * 2;
        let ctx;

        this.image_up = createOffscreenCanvas(W, H);
        ctx = this.image_up.getContext('2d');
        ctx.drawImage(spriteSheet, 0, 0, W, H, 0, 0, W, H);

        this.image_right = createOffscreenCanvas(W, H);
        ctx = this.image_right.getContext('2d');
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(spriteSheet, 0, 0, W, H, 0, 0, W, H);
        ctx.restore();

        this.image_down = createOffscreenCanvas(W, H);
        ctx = this.image_down.getContext('2d');
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(spriteSheet, 0, 0, W, H, 0, 0, W, H);
        ctx.restore();

        this.image_left = createOffscreenCanvas(W, H);
        ctx = this.image_left.getContext('2d');
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(spriteSheet, 0, 0, W, H, 0, 0, W, H);
        ctx.restore();
    }

    constructor(level, type, position, direction) {
        this.start_positin = position;
        this.start_direction = direction;

        this.lives = 3;

        this.score = 0;

        this.trophies = {
            bonus: 0,
            enemy0: 0,
            enemy1: 0,
            enemy2: 0,
            enemy3: 0,
        };


    }
}