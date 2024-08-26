"use strict"

class Player {
    static #MAX_MOVE = 4;

    static #SMALL_W = 24;
    static #SMALL_H = 32;
    static #BIG_W = 32;
    static #BIG_H = 64;

    #xpos;
    #ypos;
    #numOfLives;

    #sprites;
    #spriteID;

    #powerLVL;
    #inLevelAnimation;
    #inLevelAnimationType;

    #moveAnimationTime;
    #timePassed;
    #moveSpeed;
    #move;

    #moveDirection;
    #currentMaxMove;
    #changeMoveDirection;
    #newMoveDirection;
    #squat;

    #jumpState;
    #startJumpSpeed;
    #currentJumpSpeed;
    #jumpDistance;
    #currentJumpDistance;

    #currentFallingSpeed;
    #nextFallFrameID;
    #springJump;

    #onPlatformID;

    #nextBubbleTime;

    constructor(xpos, ypos) {
        this.#xpos = xpos;
        this.#ypos = ypos;
        this.#numOfLives = 3;

        this.#sprites = [];
        this.#spriteID = 1;

        this.#powerLVL = 0;
        this.#inLevelAnimation = false;
        this.#inLevelAnimationType = false;

        this.#moveDirection = RIGHT; // left: false, right: true
        this.#currentMaxMove = Player.#MAX_MOVE;
        this.#moveSpeed = 0;
        this.#move = false;
        this.#changeMoveDirection = false;
        this.#squat = false;

        this.#jumpState = 0;
        this.#startJumpSpeed = 7.65;
        this.#currentJumpSpeed = 0;
        this.#jumpDistance = 0;
        this.#currentJumpDistance = 0;

        this.#currentFallingSpeed = 2.7;
        this.#nextFallFrameID = 0;
        this.#springJump = false;

        this.#onPlatformID = -1;

        this.#nextBubbleTime = 0;

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
                this.updateYPos(-Math.floor(this.#currentJumpSpeed));
                this.#currentJumpDistance += Math.floor(this.#currentJumpSpeed);

                this.#currentJumpSpeed *= (this.#currentJumpDistance / this.#jumpDistance > 0.75 ? 0.972 : 0.986);

                if (this.#currentJumpSpeed < 2.5) {
                    this.#currentJumpSpeed = 2.5;
                }

                if (!game.keySpacee && this.#currentJumpDistance > 64 && !this.#springJump) {
                    this.#jumpDistance = 16;
                    this.#currentJumpDistance = 0;
                    this.#currentJumpSpeed = 2.5;
                }

                if (this.#jumpDistance <= this.#currentJumpDistance) {
                    this.#jumpState = 2;
                }
            } else {
                if (this.#onPlatformID == -1) {
                    // check if collide a platform
                    //...this.#onPlatformID = ...
                    if (this.#onPlatformID >= 0) {

                    }
                }
                else {
                    // still on the platform
                    // this.#onPlatformID = ...
                }

                if (this.#onPlatformID >= 0) {
                    //TODO
                }
                else if (!map.checkCollisionLB(this.#xpos - map.xpos + 2, this.#ypos + 2, this.getHitBoxY(), true)
                    && !map.checkCollisionRB(this.#xpos - map.xpos - 2, this.#ypos + 2, this.getHitBoxX(), this.getHitBoxY(), true)) {

                    if (this.#nextFallFrameID > 0) {
                        --this.#nextFallFrameID;
                    } else {
                        this.#currentFallingSpeed *= 1.05;

                        if (this.#currentFallingSpeed > this.#startJumpSpeed) {
                            this.#currentFallingSpeed = this.#startJumpSpeed;
                        }

                        this.updateYPos(Math.floor(this.#currentFallingSpeed));
                    }

                    this.#jumpState = 2;

                    this.spriteID = 5;
                } else if (this.#jumpState == 2) {
                    this.resetJump();
                } else {
                    this.checkCollisionBot(0, 0);
                }

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
            // moving, not change direction, not squat or is the small size
            if (this.#moveSpeed > this.#currentMaxMove) {
                // don't allow moveSpeed greater than currentMaxMove
                // decrease moveSpeed
                --this.#moveSpeed;
            }
            else if (this.#moveSpeed < this.#currentMaxMove &&
                game.ticks() - (100 + 35 * this.#moveSpeed) >= this.#timePassed) {
                // speed up mario,
                // when moveSpeed == 1, increase moveSpeed after 100 + 35 * 1 = 135 ms
                // when moveSpeed == 2, increase moveSpeed after 100 + 35 * 2 = 170 ms
                // when moveSpeed == 3, increase moveSpeed after 100 + 35 * 3 = 205 ms
                // until the move speed == currentMaxMove
                ++this.#moveSpeed;
                this.#timePassed = game.ticks();
            }
            else if (this.#moveSpeed == 0) {
                // it's moving, set moveSpeed = 1
                this.#moveSpeed = 1;
            }
        } else {
            // (not moving) or (change direction) or (squat (only when powerLVL > 0))
            if (this.#moveSpeed != 0 &&
                game.ticks() - (50 + 15 * (this.#currentMaxMove - this.#moveSpeed)
                    * (this.#squat && this.#powerLVL > 0 ? 6 : 1)) > this.#timePassed) {
                // slow down mario based on the squat state and the power level
                // if squat and powerLVL > 0, the moveSpeed decreases slower
                // when currentMaxMove - moveSpeed == 0, decrease moveSpeed after 50 ms
                // when currentMaxMove - moveSpeed == 1, decrease moveSpeed after 50 + 15 * 1 * 1 = 65 ms
                //    if squat and not the small size => decrease moveSpeed after 50 + 15 * 1 * 6 = 140 ms
                // when currentMaxMove - moveSpeed == 2, decrease moveSpeed after 50 + 15 * 2 * 1 = 80 ms
                //    if squat and not the small size => decrease moveSpeed after 50 + 15 * 2 * 6 = 230 ms
                // ...until moveSpeed == 0 
                --this.#moveSpeed;
                this.#timePassed = game.ticks();
                if (this.#jumpState == 0 && !map.underWater)
                    // when slowing down, show the mario brake image (id=6)
                    this.spriteID = 6;
            }

            // for change direction request, it can fulfill when moveSpeed reaches 1
            if (this.#changeMoveDirection && this.#moveSpeed <= 1) {
                this.#moveDirection = this.#newMoveDirection;
                this.#changeMoveDirection = false;
                this.#move = true;
            }
        }

        if (this.#moveSpeed > 0) {
            this.#moveDirection == RIGHT
                ? this.updateXPos(this.#moveSpeed)
                : this.updateXPos(-this.#moveSpeed);

            // ----- SPRITE ANIMATION
            if (map.underWater) {
                this.swimingAnimation();
            } else if (!this.#changeMoveDirection && this.#jumpState == 0 && this.#move) {
                // when slowing down, it always shows the brake image (id=6)
                // slowing down means stop moving or on the way to change move direction
                this.moveAnimation();
            }
            // ----- SPRITE ANIMATION
        } else if (this.#jumpState == 0) {
            // no move speed, not jump
            this.spriteID = 1;
            this.updateXPos(0);
        } else {
            this.updateXPos(0);
        }

        if (this.squat && !map.underWater && this.#powerLVL > 0) {
            this.spriteID = 7;
        }
    }

    updateXPos(dx) {
        this.checkCollisionBot(dx, 0);
        //checkCollisionCenter(dx, 0);

        if (dx > 0) {
            if (this.#xpos >= 416 && map.canMoveMap) {
                // the player is too right, move the map left
                map.moveMap(-dx);
            }
            else {
                // move the play right
                this.#xpos += dx;
            }
        } else if (dx < 0) {
            if (this.#xpos <= 192 && map.canMoveMap) {
                // the player is too left, move the map right
                if (!map.moveMap(-dx)) {
                    this.#xpos += dx;
                    if (this.#xpos < 0)
                        this.#xpos = 0;
                }
            }
            else {
                // move the playe left
                this.#xpos += dx;
            }
        }
    }

    updateYPos(dy) {
        if (dy > 0) {
            const LEFT = map.checkCollisionLB(this.#xpos - map.xpos + 2, this.#ypos + dy, this.getHitBoxY(), true);
            const RIGHT = map.checkCollisionRB(this.#xpos - map.xpos - 2, this.#ypos + dy, this.getHitBoxX(), this.getHitBoxY(), true);

            if (!LEFT && !RIGHT) {
                this.#ypos += dy;
            } else {
                if (this.#jumpState == 2) {
                    this.#jumpState = 0;
                }
                this.updateYPos(dy - 1);
            }

        } else if (dy < 0) {
            const LEFT = map.checkCollisionLT(this.#xpos - map.xpos + 2, this.#ypos + dy, false);
            const RIGHT = map.checkCollisionRT(this.#xpos - map.xpos - 2, this.#ypos + dy, this.getHitBoxX(), false);

            //if (CCore:: getMap() -> checkCollisionWithPlatform((int)fXPos, (int)fYPos, 0, 0) >= 0 || CCore:: getMap() -> checkCollisionWithPlatform((int)fXPos, (int)fYPos, getHitBoxX(), 0) >= 0) {
            //    jumpState = 2;
            //}
            if (!LEFT && !RIGHT) {
                this.#ypos += dy;
            } else {
                if (this.#jumpState == 1) {
                    if (!LEFT && RIGHT) {

                    } else if (LEFT && !RIGHT) {

                    } else {

                    }
                } else {

                }

                this.updateYPos(dy + 1);
            }
        }

        if (Math.floor(this.#ypos) % 2 == 1) {
            this.#ypos += 1;
        }

        /* TODO
        if (!map.getInEvent() && this.#ypos - this.getHitBoxY() > game.window_height) {
            CCore:: getMap() -> playerDeath(false, true);
            fYPos = -80;
        }*/
    }

    startMove() {
        this.#moveAnimationTime = game.ticks();
        this.#timePassed = game.ticks();
        this.#moveSpeed = 1;
        this.#move = true;
        if (map.underWater) {
            this.spriteID = 8;
        }
    }

    resetMove() {
        --this.#moveSpeed;
        this.#move = false;
    }

    stopMove() {
        this.#moveSpeed = 0;
        this.#move = false;
        this.#changeMoveDirection = false;
        this.#squat = false;
        this.spriteID = 1;
    }

    startRun() {
        this.#currentMaxMove = Player.#MAX_MOVE + (map.underWater ? 0 : 2);

        this.createFireBall();
    }

    resetRun() {
        this.#currentMaxMove = Player.#MAX_MOVE;
    }

    createFireBall() {
        // TODO
    }

    jump() {
        if (map.underWater) {
            this.startJump(1);
            this.#nextBubbleTime -= 65;
        } else if (this.#jumpState == 0) {
            this.startJump(4);
        }
    }

    startJump(h) {
        this.#currentJumpSpeed = this.#startJumpSpeed;
        this.#jumpDistance = 32 * h + 24;
        this.#currentJumpDistance = 0;

        if (!map.underWater) {
            this.spriteID = 5;
        } else {
            if (this.#jumpState == 0) {
                this.#moveAnimationTime = game.ticks();
                this.spriteID = 8;
                this.swimingAnimation();
            }
            //TODO:CCFG:: getMusic() -> PlayChunk(CCFG:: getMusic() -> cSWIM);
        }

        if (h > 1) {
            if (this.#powerLVL == 0) {
                //TODO:CCFG:: getMusic() -> PlayChunk(CCFG:: getMusic() -> cJUMP);
            } else {
                //TODO:CCFG:: getMusic() -> PlayChunk(CCFG:: getMusic() -> cJUMPBIG);
            }
        }

        this.#jumpState = 1;
    }

    resetJump() {
        this.#jumpState = 0;
        this.#jumpDistance = 0;
        this.#currentJumpDistance = 0;
        this.#currentFallingSpeed = 2.7;
        this.#nextFallFrameID = 0;
        this.#springJump = false;
    }

    powerUpAnimation() {

    }

    moveAnimation() {
        if (game.ticks() - 65 + this.#moveSpeed * 4 > this.#moveAnimationTime) {
            this.#moveAnimationTime = game.ticks();
            if (this.#spriteID >= 4 + 11 * this.#powerLVL) {
                this.spriteID = 2;
            }
            else {
                ++this.#spriteID;
            }
        }
    }

    swimingAnimation() {
        if (game.ticks() - 105 > this.#moveAnimationTime) {
            this.#moveAnimationTime = game.ticks();
            if (this.#spriteID % 11 == 8) {
                this.spriteID = 9;
            } else {
                this.spriteID = 8;
            }
        }

    }

    set spriteID(id) {
        this.#spriteID = id + 11 * this.#powerLVL;
    }

    get spriteID() {
        return this.#spriteID; // TODO
    }

    get move() {
        return this.#move;
    }

    get moveDirection() {
        return this.#moveDirection;
    }

    set moveDirection(moveDirection) {
        this.#moveDirection = moveDirection;
    }

    getChangeMoveDirection() {
        return this.#changeMoveDirection;
    }

    setChangeMoveDirection() {
        this.#changeMoveDirection = true;
        this.#newMoveDirection = !this.#moveDirection;
    }

    get moveSpeed() {
        return this.#moveSpeed;
    }

    set moveSpeed(moveSpeed) {
        this.#moveSpeed = moveSpeed;
    }

    get squat() {
        return this.#squat;
    }

    set squat(squat) {
        if (squat && this.#squat != squat) {
            // can squat only when powerLVL > 0
            if (this.#powerLVL > 0) {
                this.#ypos += 20;
            }
            this.#squat = squat;
        } else if (this.#squat != squat && !map.underWater) {
            if (this.#powerLVL > 0) {
                this.#ypos -= 20;
            }
            this.#squat = squat;
        }
    }

    getHitBoxX() {
        return this.#powerLVL == 0 ? Player.#SMALL_W : Player.#BIG_W;
    }

    getHitBoxY() {
        return this.#powerLVL == 0 ? Player.#SMALL_H : this.#squat ? 44 : Player.#BIG_H;
    }

    getBlockLB(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        return map.getBlockID(x + 1, y + this.getHitBoxY() + 2);
    }

    getBlockRB(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        return map.getBlockID(x + this.getHitBoxX() - 1, y + this.getHitBoxY() + 2);
    }

    getBlockLC(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        return map.getBlockID(x - 1, y + this.getHitBoxY() / 2);
    }

    getBlockRC(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        return map.getBlockID(x + this.getHitBoxX() + 1, y + this.getHitBoxY() / 2);
    }

    getBlockLT(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        return map.getBlockID(x + 1, y);
    }

    getBlockRT(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        return map.getBlockID(x + this.getHitBoxX() - 1, y);
    }

    checkCollisionBot(x, y) {
        let vLT = this.getBlockLB(this.#xpos - map.xpos + x, this.#ypos + y);

        if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
            //TODO: CCore::getMap()->blockUse(vLT->getX(), vLT->getY(), CCore::getMap()->getMapBlock(vLT->getX(), vLT->getY())->getBlockID(), 1);
        }

        vLT = this.getBlockRB(this.#xpos - map.xpos + x, this.#ypos + y);

        if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
            //TODO: CCore::getMap()->blockUse(vLT->getX(), vLT->getY(), CCore::getMap()->getMapBlock(vLT->getX(), vLT->getY())->getBlockID(), 1);
        }
    }

    checkCollisionCenter(x, y) {
        if (this.#powerLVL == 0) {
            let vLT = this.getBlockLC(this.#xpos - map.xpos + x, this.#ypos + y);

            if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
                //TODO: CCore::getMap()->blockUse(vLT->getX(), vLT->getY(), CCore::getMap()->getMapBlock(vLT->getX(), vLT->getY())->getBlockID(), 2);
            }

            vLT = this.getBlockRC(this.#xpos - map.xpos + x, this.#ypos + y);

            if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
                //CCore:: getMap() -> blockUse(vLT -> getX(), vLT -> getY(), CCore:: getMap() -> getMapBlock(vLT -> getX(), vLT -> getY()) -> getBlockID(), 2);
            }
        } else {
            let vLT = this.getBlockLC(this.#xpos - map.xpos + x, this.#ypos + y + 16);

            if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
                //CCore:: getMap() -> blockUse(vLT -> getX(), vLT -> getY(), CCore:: getMap() -> getMapBlock(vLT -> getX(), vLT -> getY()) -> getBlockID(), 2);
            }

            vLT = this.getBlockRC(this.#xpos - map.xpos + x, this.#ypos + y + 16);

            if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
                //CCore:: getMap() -> blockUse(vLT -> getX(), vLT -> getY(), CCore:: getMap() -> getMapBlock(vLT -> getX(), vLT -> getY()) -> getBlockID(), 2);
            }

            vLT = this.getBlockLC(this.#xpos - map.xpos + x, this.#ypos + y - 16);

            if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
                //CCore:: getMap() -> blockUse(vLT -> getX(), vLT -> getY(), CCore:: getMap() -> getMapBlock(vLT -> getX(), vLT -> getY()) -> getBlockID(), 2);
            }

            vLT = this.getBlockRC(this.#xpos - map.xpos + x, this.#ypos + y - 16);

            if (map.blocks[map.getMapBlock(vLT.x, vLT.y).blockID].use) {
                //CCore:: getMap() -> blockUse(vLT -> getX(), vLT -> getY(), CCore:: getMap() -> getMapBlock(vLT -> getX(), vLT -> getY()) -> getBlockID(), 2);
            }
        }
    }

    draw(ctx) {
        this.#sprites[this.#spriteID].image.draw(ctx,
            Math.floor(this.#xpos), Math.floor(this.#ypos), !this.#moveDirection);
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