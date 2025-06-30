"use strict"

class GhostInky extends Ghost {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        super.reset();

        this.color = "#C0FFFF"; // Cyan

        this.setPosition(11, 17);
        this.xoffset = 0;
        this.yoffset = 0;

        this.dotCounter = 0;
        this.dotLimit = 30;

        this.behaviorIndex = 0;
        this.behavior = Ghost.BEHAVIOR.INHOUSE;

        this.setTarget(27, 35);
        this.setDirection(Entity.DIRECTION.UP);

        this.lastTime = game.ticks();
    }

    checkDotLimit(mustGoOut) {
        if (this.dotCounter >= this.dotLimit || mustGoOut) {
            game.nextGhostDotCounter = game.ghostClyde;

            this.setPosition(13, 14);
            this.xoffset = 0;
            this.yoffset = 0;

            this.behaviorIndex = 0;
            this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
            this.setTarget(27, 35);
            this.setDirection(Entity.DIRECTION.LEFT);
        }
    }

    update() {
        if (this.behavior === Ghost.BEHAVIOR.INHOUSE) {
            if (this.currentDirection === Entity.DIRECTION.UP && this.ypos === 16 && this.yoffset === 0) {
                this.currentDirection = Entity.DIRECTION.DOWN;
            }
            else if (this.currentDirection === Entity.DIRECTION.DOWN && this.ypos === 18 && this.yoffset === 0) {
                this.currentDirection = Entity.DIRECTION.UP;
            }

            super.move();
            return;
        }

        const now = game.ticks();
        if (now - this.lastTime > Ghost.BehaviorList[this.behaviorIndex].duration
            && this.xoffset === 0 && this.yoffset === 0)
        {
            if (Ghost.BehaviorList[this.behaviorIndex].duration > 0) {
                this.behaviorIndex++;
                this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
            }
            
            this.lastTime = now;
        }

        switch (this.behavior) {
        case Ghost.BEHAVIOR.CHASE:
            /*
            To locate Inky's target,
            we first start by selecting the position two tiles in front of Pac-Man in his current direction of travel,
            similar to Pinky's targeting method. From there, imagine drawing a vector from Blinky's position to this tile,
            and then doubling the length of the vector. The tile that this new, extended vector ends on will be Inky's actual target.
            */
            let x1, y1;
            switch (game.player.currentDirection) {
            case Entity.DIRECTION.UP:    x1 = game.player.xpos, y1 = game.player.ypos - 2; break;
            case Entity.DIRECTION.DOWN:  x1 = game.player.xpos, y1 = game.player.ypos + 2; break;
            case Entity.DIRECTION.LEFT:  x1 = game.player.xpos - 2, y1 = game.player.ypos; break;
            case Entity.DIRECTION.RIGHT: x1 = game.player.xpos + 2, y1 = game.player.ypos; break;
            }

            this.setTarget(
                game.ghostBlinky.xpos + 2 * (x1 - game.ghostBlinky.xpos),
                game.ghostBlinky.ypos + 2 * (y1 - game.ghostBlinky.ypos)
            );
            break;
        case Ghost.BEHAVIOR.SCATTER:
            this.setTarget(27, 35);
            break;
        case Ghost.BEHAVIOR.FRIGHTENED:
            this.setTarget(27, 35);
            this.color = "#0000FF"; // Blue
            break;
        }

        super.update();
    }
}