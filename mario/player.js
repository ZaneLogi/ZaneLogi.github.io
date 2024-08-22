"use strict"

class Player {
    #xpos;
    #ypos;
    #numOfLives;

    #sprites;
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

        this.#sprites = [];
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

        this.loadSprites();
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

            if (this.#jumpState == 1) {
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

    loadSprites() {
        // ----- 0
        this.#sprites.push(new Sprite(["mario/mario_death"], [0], true));
        // ----- 1
        this.#sprites.push(new Sprite(["mario/mario"], [0], true));
        // ----- 2
        this.#sprites.push(new Sprite(["mario/mario_move0"], [0], true));
        // ----- 3
        this.#sprites.push(new Sprite(["mario/mario_move1"], [0], true));
        // ----- 4
        this.#sprites.push(new Sprite(["mario/mario_move2"], [0], true));
        // ----- 5
        this.#sprites.push(new Sprite(["mario/mario_jump"], [0], true));
        // ----- 6
        this.#sprites.push(new Sprite(["mario/mario_st"], [0], true));
        // ----- 7
        this.#sprites.push(new Sprite(["mario/mario"], [0], true)); // SQUAT, same as 1
        // ----- 8
        this.#sprites.push(new Sprite(["mario/mario_underwater0"], [0], true));
        // ----- 9
        this.#sprites.push(new Sprite(["mario/mario_underwater1"], [0], true));
        // ----- 10
        this.#sprites.push(new Sprite(["mario/mario_end"], [0], true));
        // ----- 11
        this.#sprites.push(new Sprite(["mario/mario_end1"], [0], true));
        // ---------- BIG
        // ----- 12
        this.#sprites.push(new Sprite(["mario/mario1"], [0], true));
        // ----- 13
        this.#sprites.push(new Sprite(["mario/mario1_move0"], [0], true));
        // ----- 14
        this.#sprites.push(new Sprite(["mario/mario1_move1"], [0], true));
        // ----- 15
        this.#sprites.push(new Sprite(["mario/mario1_move2"], [0], true));
        // ----- 16
        this.#sprites.push(new Sprite(["mario/mario1_jump"], [0], true));
        // ----- 17
        this.#sprites.push(new Sprite(["mario/mario1_st"], [0], true));
        // ----- 18 // SQUAT
        this.#sprites.push(new Sprite(["mario/mario1_squat"], [0], true));
        // ----- 19
        this.#sprites.push(new Sprite(["mario/mario1_underwater0"], [0], true));
        // ----- 20
        this.#sprites.push(new Sprite(["mario/mario1_underwater1"], [0], true));
        // ----- 21
        this.#sprites.push(new Sprite(["mario/mario1_end"], [0], true));
        // ----- 22
        this.#sprites.push(new Sprite(["mario/mario1_end1"], [0], true));
        // ----- 23
        this.#sprites.push(new Sprite(["mario/mario2"], [0], true));
        // ----- 24
        this.#sprites.push(new Sprite(["mario/mario2_move0"], [0], true));
        // ----- 25
        this.#sprites.push(new Sprite(["mario/mario2_move1"], [0], true));
        // ----- 26
        this.#sprites.push(new Sprite(["mario/mario2_move2"], [0], true));
        // ----- 27
        this.#sprites.push(new Sprite(["mario/mario2_jump"], [0], true));
        // ----- 28
        this.#sprites.push(new Sprite(["mario/mario2_st"], [0], true));
        // ----- 29 // SQUAT
        this.#sprites.push(new Sprite(["mario/mario2_squat"], [0], true));
        // ----- 30
        this.#sprites.push(new Sprite(["mario/mario2_underwater0"], [0], true));
        // ----- 31
        this.#sprites.push(new Sprite(["mario/mario2_underwater1"], [0], true));
        // ----- 32
        this.#sprites.push(new Sprite(["mario/mario2_end"], [0], true));
        // ----- 33
        this.#sprites.push(new Sprite(["mario/mario2_end1"], [0], true));
        // ----- 34
        this.#sprites.push(new Sprite(["mario/mario2s"], [0], true));
        // ----- 35
        this.#sprites.push(new Sprite(["mario/mario2s_move0"], [0], true));
        // ----- 36
        this.#sprites.push(new Sprite(["mario/mario2s_move1"], [0], true));
        // ----- 37
        this.#sprites.push(new Sprite(["mario/mario2s_move2"], [0], true));
        // ----- 38
        this.#sprites.push(new Sprite(["mario/mario2s_jump"], [0], true));
        // ----- 39
        this.#sprites.push(new Sprite(["mario/mario2s_st"], [0], true));
        // ----- 40 // SQUAT
        this.#sprites.push(new Sprite(["mario/mario2s_squat"], [0], true));
        // ----- 41
        this.#sprites.push(new Sprite(["mario/mario2s_underwater0"], [0], true));
        // ----- 42
        this.#sprites.push(new Sprite(["mario/mario2s_underwater1"], [0], true));
        // ----- 43
        this.#sprites.push(new Sprite(["mario/mario2s_end"], [0], true));
        // ----- 44
        this.#sprites.push(new Sprite(["mario/mario2s_end1"], [0], true));
        // ----- 45
        this.#sprites.push(new Sprite(["mario/mario_s0"], [0], true));
        // ----- 46
        this.#sprites.push(new Sprite(["mario/mario_s0_move0"], [0], true));
        // ----- 47
        this.#sprites.push(new Sprite(["mario/mario_s0_move1"], [0], true));
        // ----- 48
        this.#sprites.push(new Sprite(["mario/mario_s0_move2"], [0], true));
        // ----- 49
        this.#sprites.push(new Sprite(["mario/mario_s0_jump"], [0], true));
        // ----- 50
        this.#sprites.push(new Sprite(["mario/mario_s0_st"], [0], true));
        // ----- 51 // SQUAT
        this.#sprites.push(new Sprite(["mario/mario_s0"], [0], true));
        // ----- 52
        this.#sprites.push(new Sprite(["mario/mario_s0_underwater0"], [0], true));
        // ----- 53
        this.#sprites.push(new Sprite(["mario/mario_s0_underwater1"], [0], true));
        // ----- 54
        this.#sprites.push(new Sprite(["mario/mario_s0_end"], [0], true));
        // ----- 55
        this.#sprites.push(new Sprite(["mario/mario_s0_end1"], [0], true));
        // ----- 56
        this.#sprites.push(new Sprite(["mario/mario_s1"], [0], true));
        // ----- 57
        this.#sprites.push(new Sprite(["mario/mario_s1_move0"], [0], true));
        // ----- 58
        this.#sprites.push(new Sprite(["mario/mario_s1_move1"], [0], true));
        // ----- 59
        this.#sprites.push(new Sprite(["mario/mario_s1_move2"], [0], true));
        // ----- 60
        this.#sprites.push(new Sprite(["mario/mario_s1_jump"], [0], true));
        // ----- 61
        this.#sprites.push(new Sprite(["mario/mario_s1_st"], [0], true));
        // ----- 62 // SQUAT
        this.#sprites.push(new Sprite(["mario/mario_s1"], [0], true));
        // ----- 63
        this.#sprites.push(new Sprite(["mario/mario_s1_underwater0"], [0], true));
        // ----- 64
        this.#sprites.push(new Sprite(["mario/mario_s1_underwater1"], [0], true));
        // ----- 65
        this.#sprites.push(new Sprite(["mario/mario_s1_end"], [0], true));
        // ----- 66
        this.#sprites.push(new Sprite(["mario/mario_s1_end1"], [0], true));
        // ----- LOAD SPRITE
        // ----- 67
        this.#sprites.push(new Sprite(["mario/mario_lvlup"], [0], true));
    }
}