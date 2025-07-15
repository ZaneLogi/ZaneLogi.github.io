"use strict"

/*
adjust: (0,0) is the center
x: -2, -1, 0, 1, 2, 3 => 6 steps
y: -2, -1, 0, 1, 2    => 5 steps
*/

class Hero extends Actor {
    constructor(stage) {
        super(stage);

        this.requestMove;
        this.digging;
        this.digCycle;
        this.holdId;
    }

    moveToTile(x, y) {
        super.moveToTile(x, y);
        this.requestMove = Actor.MOVE.NONE;
        this.digging = false;
    }

    userMove(move) {
        this.requestMove = move; // type: Actor.MOVE
    }

    update() {
        // handle digging
        if (this.digging) {// first check if the hero is digging
            const digX = (this.currentMove == Actor.MOVE.DIG_LEFT ? this.xTile - 1 : this.xTile + 1);
            if (this.canMoveTo(digX, this.yTile + 1, this.currentMove)) { // check if dig not finish && guard move to hole up
                this.digHole();
                return;
            }
            else { // if guard move to un-finish hole up
                this.finishDigging(false);
            }
        }

        // handle falling
        if (this.shouldFall() && !(this.stage.isGuardAt(this.xTile, this.yTile + 1))) {
            this.moveStep(Actor.MOVE.FALL_DOWN);
            this.currentMove = Actor.MOVE.FALL_DOWN;
            return;
        }

        // handle user input
        switch (this.requestMove) {
        case Actor.MOVE.CLIMB_UP:
            if (this.yAdjust > 0 || this.canMoveTo(this.xTile, this.yTile - 1, Actor.MOVE.CLIMB_UP)) {
                this.moveStep(Actor.MOVE.CLIMB_UP);
                this.currentMove = Actor.MOVE.CLIMB_UP;
                return;
            }
            break;
        case Actor.MOVE.CLIMB_DOWN:
            if (this.yAdjust < 0 || this.canMoveTo(this.xTile, this.yTile + 1, Actor.MOVE.CLIMB_DOWN)) {
                this.moveStep(Actor.MOVE.CLIMB_DOWN);
                this.currentMove = Actor.MOVE.CLIMB_DOWN;
                return;
            }
            break;
        case Actor.MOVE.RUN_LEFT:
            if (this.xAdjust > 0 || this.canMoveTo(this.xTile - 1, this.yTile, Actor.MOVE.RUN_LEFT)) {
                this.moveStep(Actor.MOVE.RUN_LEFT);
                this.currentMove = Actor.MOVE.RUN_LEFT;
                this.lookLeft = true;
                return;
            }
            break;
        case Actor.MOVE.RUN_RIGHT:
            if (this.xAdjust < 0 || this.canMoveTo(this.xTile + 1, this.yTile, Actor.MOVE.RUN_RIGHT)) {
                this.moveStep(Actor.MOVE.RUN_RIGHT);
                this.currentMove = Actor.MOVE.RUN_RIGHT;
                this.lookLeft = false;
                return;
            }
            break;
        case Actor.MOVE.DIG_LEFT:
            if (this.canMoveTo(this.xTile - 1, this.yTile + 1, Actor.MOVE.DIG_LEFT)) {
                this.moveStep(Actor.MOVE.DIG_LEFT);
                this.currentMove = Actor.MOVE.DIG_LEFT;
                this.lookLeft = true;
                this.digging = true;
                this.digCycle = 0;
                this.digHole();
                this.requestMove = Actor.MOVE.NONE; // set NONE, so don't do it again and again.
                return;
            }
            break;
        case Actor.MOVE.DIG_RIGHT:
            if (this.canMoveTo(this.xTile + 1, this.yTile + 1, Actor.MOVE.DIG_RIGHT)) {
                this.moveStep(Actor.MOVE.DIG_RIGHT);
                this.currentMove = Actor.MOVE.DIG_RIGHT;
                this.lookLeft = false;
                this.digging = true;
                this.digCycle = 0;
                this.digHole();
                this.requestMove = Actor.MOVE.NONE; // set NONE, so don't do it again and again.
                return;
            }
            break;
        }

        this.currentMove = Actor.MOVE.NONE;
    }

    moveStep(move) {
        let centerX = Actor.MOVE.NONE; // used to adjust the center of the horizontal when the hero is moving vertically
        let centerY = Actor.MOVE.NONE; // used to adjust the cetner of the vertical when the hero is mvoing horizontally

        switch (move) {
        // the hero is moving vertically
        case Actor.MOVE.CLIMB_UP:
        case Actor.MOVE.CLIMB_DOWN:
        case Actor.MOVE.FALL_DOWN:
            if (this.xAdjust < 0) // the hero is at the left side of the center, move the hero right
                centerX = Actor.MOVE.RUN_RIGHT;
            else if (this.xAdjust > 0) // the hero is at the right side of the center, move the hero left
                centerX = Actor.MOVE.RUN_LEFT;
            break;
        // the hero is moving horizontally
        case Actor.MOVE.RUN_LEFT:
        case Actor.MOVE.RUN_RIGHT:
            if (this.yAdjust < 0) // the hero is above the center, move the hero down
                centerY = Actor.MOVE.CLIMB_DOWN;
            else if (this.yAdjust > 0) // the hero is below the center, move the hero up
                centerY = Actor.MOVE.CLIMB_UP;
            break;
        case Actor.MOVE.DIG_LEFT:
        case Actor.MOVE.DIG_RIGHT:
            // force the character in the center of the position
            this.xAdjust = 0;
            this.yAdjust = 0;
            break;
        }

        if (move == Actor.MOVE.CLIMB_UP || centerY == Actor.MOVE.CLIMB_UP) {
            if (this.yAdjust <= -2) {
                this.yTile--;
                this.yAdjust = 2;
            }
            else {
                this.yAdjust--;
            }
        }

        if (move == Actor.MOVE.CLIMB_DOWN || move == Actor.MOVE.FALL_DOWN || centerY == Actor.MOVE.CLIMB_DOWN) {
            if (this.yAdjust >= 2) {
                this.yTile++;
                this.yAdjust = -2;
            }
            else {
                this.yAdjust++;
            }
        }

        if (move == Actor.MOVE.RUN_LEFT || centerX == Actor.MOVE.RUN_LEFT) {
            if (this.xAdjust <= -2) {
                this.xTile--;
                this.xAdjust = 3;
            }
            else {
                this.xAdjust--;
            }
        }

        if (move == Actor.MOVE.RUN_RIGHT || centerX == Actor.MOVE.RUN_RIGHT) {
            if (this.xAdjust >= 3) {
                this.xTile++;
                this.xAdjust = -2;
            }
            else {
                this.xAdjust++;
            }
        }

        if (this.takeChest()) {
            //TODO: playSound(2);
        }
    }

    digHole() {
        switch (this.digCycle) {
        case 0:
        {
            const xHole = this.lookLeft ? this.xTile - 1 : this.xTile + 1;
            const yHole = this.yTile + 1;
            this.stage.setTileType(xHole, yHole, Stage.TILE.HOLE_FULL);
            break;
        }
        case 12: // the hole is dug.
            this.finishDigging(true);
            return;
        default:
            break;
        }

        this.digCycle++;
    }

    finishDigging(completed) {
        const xHole = this.lookLeft ? this.xTile - 1 : this.xTile + 1;
        const yHole = this.yTile + 1;

        if (completed) {
            this.stage.setTileType(xHole, yHole, Stage.TILE.HOLE_EMPTY);
            this.stage.addHole(xHole, yHole);
        }
        else {
            this.stage.setTileType(xHole, yHole, Stage.TILE.BLOCK);
        }

        // finish the digging move
        this.currentMove = this.lookLeft ? Actor.MOVE.RUN_LEFT : Actor.MOVE.RUN_RIGHT;
        this.digCycle = 0;
        this.digging = false;
    }
}