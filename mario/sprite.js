import { IMG } from "./img.js";

export class Sprite {
    #images;
    #delays;
    #rotate;
    #currentFrame;
    #startFrame;
    #endFrame;
    #timePassed;

    constructor(nameArray, delayArray, rotate=false) {
        this.#images = nameArray.map((value) => new IMG(value));

        this.#delays = delayArray;
        this.#rotate = rotate;

        this.#currentFrame = 0;
        this.#startFrame = 0;
        this.#endFrame = nameArray.length - 1;

        this.#timePassed = 0;
    }

    get image() {
        return this.#images[this.#currentFrame];
    }
}