"use strict"

class Block {
    #sprite;
    #blockID;
    #collision;
    #death;
    #use;
    #visible;

    constructor(blockID, sprite, collision, death, use, visible) {
        this.#blockID = blockID || 0;
        this.#sprite = sprite;
        this.#collision = collision || false;
        this.#death = death || false;
        this.#use = use || false;
        this.#visible = visible || false;
    }

    draw(ctx, x, y) {
        this.#sprite.image.draw(ctx, x, y);
    }

    get blockID() {
        return this.#blockID;
    }

    set blockID(value) {
        this.#blockID = value;
    }

    get sprite() {
        return this.#sprite;
    }

    get collision() {
        return this.#collision;
    }

    get death() {
        return this.#death;
    }

    get use() {
        return this.#use;
    }

    get visible() {
        return this.#visible;
    }
}