"use strict"

class IMG {
    #image;

    constructor(res_id) {
        this.#image = resource["res/images/" + res_id];
        console.assert(this.#image, "No resource " + res_id);
    }

    draw(ctx, x, y, mirror) {
        mirror = mirror || false;

        if (!mirror) {
            ctx.drawImage(this.#image, x, y);
        } else {
            this.drawFlipH(ctx, x, y);
        }

    }

    drawVert(ctx, x, y) {

    }

    drawFlipV(ctx, x, y) {
        // flip image vertically
        ctx.save();
        ctx.scale(1, -1);
        ctx.translate(0, -this.#image.height);
        ctx.drawImage(this.#image, x, -y);
        ctx.restore();
    }

    drawFlipH(ctx, x, y) {
        // flip image horizontally
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-this.#image.width, 0);
        ctx.drawImage(this.#image, -x, y);
        ctx.restore();
    }
}