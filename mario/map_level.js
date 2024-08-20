"use strict"

class MapLevel {
    #iBlockID;
    #iNumOfUse;
    #spawnMushroom;
    #spawnStar;
    #powerUP; // -- true = powerUP, false = 1UP

    #blockAnimation;
    #iYPos;
    #bYDirection; // ----- true TOP, false BOTTOM

    constructor(iBlockID) {
        this.#iBlockID = iBlockID || 0;
        this.#iNumOfUse = 0;
        this.#spawnMushroom = false;
        this.#spawnStar = false;
        this.#powerUP = true;

        this.#blockAnimation = false;
        this.#iYPos = 0;
        this.#bYDirection = true;
    }

    startBlockAnimation() {
        this.#blockAnimation = true;
        this.#iYPos = 0;
        this.#bYDirection = true;
    }

    updateYPos() {
        if (this.#blockAnimation) {
            if (this.#bYDirection) {
                if (this.#iYPos < 10) {
                    if (this.#iYPos < 5) {
                        this.#iYPos += 2;
                    } else {
                        this.#iYPos += 1;
                    }
                }
                else {
                    this.#bYDirection = false;
                }
            }
            else {
                if (this.#iYPos > 0) {
                    if (this.#iYPos > 5) {
                        this.#iYPos -= 2;
                    } else {
                        this.#iYPos -= 1;
                    }
                }
                else {
                    this.#blockAnimation = false;
                }
            }
        }

        return this.#iYPos;
    }

    get blockID() {
        return this.#iBlockID;
    }

    set blockID(value) {
        this.#iBlockID = value;
    }

    get numOfUse() {
        return this.#iNumOfUse;
    }

    set numOfUse(value) {
        this.#iNumOfUse = value;
    }

    get spawnMushroom() {
        return this.#spawnMushroom;
    }

    set spawnMushroom(value) {
        this.#spawnMushroom = value;
    }

    get powerUP() {
        return this.#powerUP;
    }

    set powerUP(value) {
        this.#powerUP = value;
    }

    get spawnStar() {
        return this.#spawnStar;
    }

    set spawnStar(value) {
        this.#spawnStar = value;
    }

    get yPos() {
        return this.#iYPos;
    }
}
