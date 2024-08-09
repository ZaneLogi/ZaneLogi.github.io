"use strict"

class Explosion {
    static initSprites(spriteSheet) {
        this.images = [
            createSprite(spriteSheet, 0, 80 * 2, 32 * 2, 32 * 2),
            createSprite(spriteSheet, 32 * 2, 80 * 2, 32 * 2, 32 * 2),
            createSprite(spriteSheet, 64 * 2, 80 * 2, 32 * 2, 32 * 2)
        ];
    }

    constructor(position, interval, images) {
        this.position = { x: position.x - 16, y: position.y - 16 };
        this.active = true;

        if (interval == null)
            interval = 100;

        if (images == null) {
            this.images = [...Explosion.images];
        } else {
            this.images = [...images];
        }
        this.images.reverse();
        this.image = this.images.pop();

        gtimer.add(interval, () => this.update(), this.images.length + 1);
    }

    draw(ctx) {
        // draw current explosion frame
        ctx.drawImage(this.image, this.position.x, this.position.y);
    }

    update() {
        // Advace to the next image
        if (this.images.length > 0)
            this.image = this.images.pop();
        else
            this.active = false;
    }
}
