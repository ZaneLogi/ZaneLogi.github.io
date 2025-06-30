"use strict"

class GhostBlinky extends Ghost {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        super.reset();

        this.color = "#FF0000"; // Red

        this.setPosition(13, 14);
        this.xoffset = 0;
        this.yoffset = 0;

        this.dotCounter = 0;
        this.dotLimit = 0;

        this.behaviorIndex = 0;
        this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
        this.duration = Ghost.BehaviorList[this.behaviorIndex].duration;

        this.setTarget(25, 0);
        this.setDirection(Entity.DIRECTION.LEFT);

        this.lastTime = game.ticks();
    }
    
    checkDotLimit(mustGoOut) {
    }

    update() {
        this.updateBehavior();

        switch (this.behavior) {
        case Ghost.BEHAVIOR.CHASE:
            /*
            Of all the ghosts' targeting schemes for chase mode,
            Blinky's is the most simple and direct,
            using Pac-Man's current tile as his target.
            */
            this.setTarget(game.player.xpos, game.player.ypos);
            this.color = "#FF0000";
            break;
        case Ghost.BEHAVIOR.SCATTER:
            this.setTarget(25, 0);
            this.color = "#FF0000";
            break;
        case Ghost.BEHAVIOR.FRIGHTENED:
            this.setTarget(25, 0);
            this.color = "#0000FF"; // Blue
            break;
        }
        
        super.update();
    }

}