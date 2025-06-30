"use strict"

class GhostClyde extends Ghost {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        super.reset();

        this.color = "#FFA500"; // Orange

        this.setPosition(15, 17);
        this.xoffset = 0;
        this.yoffset = 0;

        this.dotCounter = 0;
        this.dotLimit = 60;

        this.behaviorIndex = 0;
        this.behavior = Ghost.BEHAVIOR.INHOUSE;

        this.setTarget(0, 35);
        this.setDirection(Entity.DIRECTION.UP);

        this.lastTime = game.ticks();
    }

    checkDotLimit(mustGoOut) {
        if (this.dotCounter >= this.dotLimit || mustGoOut) {
            game.nextGhostDotCounter = null;

            this.setPosition(13, 14);
            this.xoffset = 0;
            this.yoffset = 0;

            this.behaviorIndex = 0;
            this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
            this.setTarget(0, 35);
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
            In chase mode, Clyde's target differs based on his proximity to Pac-Man.
            When more than eight tiles away, he uses Pac-Man's tile as his target.
            If Clyde is closer than eight tiles away, he switches to his scatter mode target instead,
            and starts heading for his corner until he is far enough away to target Pac-Man again.
            */
            if (Math.abs(this.xpos - game.player.xpos) + Math.abs(this.ypos - game.player.ypos) > 8) {
                this.setTarget(game.player.xpos, game.player.ypos);
            }
            else {
                this.setTarget(0, 35);
            }
            break;
        case Ghost.BEHAVIOR.SCATTER:
            this.setTarget(0, 35);
            break;
        case Ghost.BEHAVIOR.FRIGHTENED:
            this.setTarget(0, 35);
            this.color = "#0000FF"; // Blue
            break;
        }

        super.update();
    }
}