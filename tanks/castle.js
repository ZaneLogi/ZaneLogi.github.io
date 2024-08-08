"use strict"

class Castle {
    static STATE = {
        STANDING: 0,
        DESTROYED: 1,
        EXPLODING: 2,
    };

    static initSprites(spriteSheet) {
        const createImage = function (x, y, w, h) {
            const image = createOffscreenCanvas(w, h);
            const ctx = image.getContext('2d');
            ctx.drawImage(spriteSheet, x, y, w, h, 0, 0, w, h);
            return image;
        };

        this.img_undamaged = createImage(0, 15 * 2, 16 * 2, 16 * 2);
        this.img_destroyed = createImage(16 * 2, 15 * 2, 16 * 2, 16 * 2);
    }

    constructor() {
        this.rect = { x: 12 * 16, y: 24 * 16, w: 32, h: 32 };
        this.rebuild();
    }

    draw(ctx) {
        ctx.drawImage(this.image, this.rect.x, this.rect.y);
        if (this.state == Castle.STATE.EXPLODING) {
            // TODO draw explosion
        }

    }

    rebuild() {
        this.state = Castle.STATE.STANDING;
        this.image = Castle.img_undamaged;
        this.active = true;
    }

    destroy() {
        this.state = Castle.STATE.EXPLODING;
        // TODO this.explosion = new Explosion
        this.image = Castle.img_destroyed;
        this.active = false;
    }
}