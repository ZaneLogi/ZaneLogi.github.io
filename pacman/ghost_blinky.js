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

        this.behaviorIndex = 0;
        this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;

        this.setTarget(25, 0);

        this.lastTime = game.ticks();
    }

    update() {
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
            Of all the ghosts' targeting schemes for chase mode,
            Blinky's is the most simple and direct,
            using Pac-Man's current tile as his target.
            */
            this.setTarget(game.player.xpos, game.player.ypos);
            break;
        case Ghost.BEHAVIOR.SCATTER:
            this.setTarget(25, 0);
            break;
        case Ghost.BEHAVIOR.FRIGHTENED:
            this.setTarget(25, 0);
            this.color = "#0000FF"; // Blue
            break;
        }
        
        super.update();
    }

}