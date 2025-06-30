"use strict"

class GhostPinky extends Ghost {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        super.reset();

        this.color = "#FFC0CB"; // Pink

        this.setPosition(13, 17);
        this.xoffset = 0;
        this.yoffset = 0;

        this.dotCounter = 0;
        this.dotLimit = 2;

        this.behaviorIndex = 0;
        this.behavior = Ghost.BEHAVIOR.INHOUSE;

        this.setTarget(2, 0);
        this.setDirection(Entity.DIRECTION.DOWN);

        this.lastTime = game.ticks();
    }

    checkDotLimit(mustGoOut) {
        if (this.dotCounter >= this.dotLimit || mustGoOut) {
            game.nextGhostDotCounter = game.ghostInky;

            this.setPosition(13, 14);
            this.xoffset = 0;
            this.yoffset = 0;

            this.behaviorIndex = 0;
            this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
            this.duration = Ghost.BehaviorList[this.behaviorIndex].duration;
            this.lastTime = game.ticks();

            this.setTarget(2, 0);
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

        this.updateBehavior();

        switch (this.behavior) {
        case Ghost.BEHAVIOR.CHASE:
            /*
            In chase mode, Pinky behaves as he does because he does not target Pac - Man's tile directly.
            Instead, he selects an offset four tiles away from Pac-Man in the direction Pac-Man is currently moving.
            */
            switch (game.player.currentDirection) {
            case Entity.DIRECTION.UP:    this.setTarget(game.player.xpos, game.player.ypos - 4); break;
            case Entity.DIRECTION.DOWN:  this.setTarget(game.player.xpos, game.player.ypos + 4); break;
            case Entity.DIRECTION.LEFT:  this.setTarget(game.player.xpos - 4, game.player.ypos); break;
            case Entity.DIRECTION.RIGHT: this.setTarget(game.player.xpos + 4, game.player.ypos); break;
            }
            this.color = "#FFC0CB";
            break;
        case Ghost.BEHAVIOR.SCATTER:
            this.setTarget(2, 0);
            this.color = "#FFC0CB";
            break;
        case Ghost.BEHAVIOR.FRIGHTENED:
            this.setTarget(2, 0);
            this.color = "#0000FF"; // Blue
            break;
        }

        super.update();
    }
}