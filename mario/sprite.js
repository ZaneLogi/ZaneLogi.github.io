"use strict"

class Sprite {
    #images;
    #delays;
    #rotate;
    #currentFrame;
    #startFrame;
    #endFrame;
    #timePassed;

    constructor(nameArray, delayArray, rotate) {
        this.#images = nameArray.map((value) => new IMG(value));

        this.#delays = delayArray;
        this.#rotate = rotate;

        this.#currentFrame = 0;
        this.#startFrame = 0;
        this.#endFrame = nameArray.length - 1;

        this.#timePassed = 0;
    }
}