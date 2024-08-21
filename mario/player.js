"use strict"

class Player {
    #xpos;
    #ypos;
    #numOfLives;
    #spriteID;

    #powerLVL;
    #inLevelAnimation;
    #inLevelAnimationType;

    #moveDirection;
    #currentMaxMove;
    #moveSpeed;
    #move;
    #changeMoveDirection;
    #squat;

    #jumpState;
    #startJumpSpeed;
    #currentFallingSpeed;

    constructor(xpos, ypos) {
        this.#xpos = xpos;
        this.#ypos = ypos;
        this.#numOfLives = 3;
        this.#spriteID = 1;

        this.#powerLVL = 0;
        this.#inLevelAnimation = false;
        this.#inLevelAnimationType = false;

        this.#moveDirection = true; // left: false, right: true
        this.#currentMaxMove = 4;
        this.#moveSpeed = 0;
        this.#move = false;
        this.#changeMoveDirection = false;
        this.#squat = false;

        this.#jumpState = 0;
        this.#startJumpSpeed = 7.65;
        this.#currentFallingSpeed = 2.7;
    }

    update() {
        this.playerPhysics();
        this.movePlayer();
    }

    playerPhysics() {
        if (!map.underWater) {
            // not under water
            if (this.#jumpState == 1) {
                // jumping

            } else {
                // not jump

            }
        } else {
            // under water
            // calculate bubble time

            if  (this.#jumpState == 1) {
                // jumping

            } else {
                // not jump

            }
        }
    }

    movePlayer() {
        if (this.#move && !this.#changeMoveDirection && (!this.#squat || this.#powerLVL == 0)) {

        } else {

        }

        if (this.#moveSpeed > 0) {

        } else if (this.#jumpState == 0) {

        } else {

        }

    }
}