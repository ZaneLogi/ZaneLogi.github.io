"use strict"

class Ghost extends Entity {
    static BEHAVIOR = {
        INHOUSE: 0,
        CHASE: 1,
        SCATTER: 2,
        FRIGHTENED: 3
    };

    static BehaviorList = [
        { behavior: Ghost.BEHAVIOR.SCATTER, duration: 7000 },
        { behavior: Ghost.BEHAVIOR.CHASE, duration: 20000 },
        { behavior: Ghost.BEHAVIOR.SCATTER, duration: 7000 },
        { behavior: Ghost.BEHAVIOR.CHASE, duration: 20000 },
        { behavior: Ghost.BEHAVIOR.SCATTER, duration: 5000 },
        { behavior: Ghost.BEHAVIOR.CHASE, duration: -1 }
    ];

    constructor() {
        super();

        this.targetXPos = 0;
        this.targetYPos = 0;
        this.color = "#000000";
        this.behavior = Ghost.BEHAVIOR.CHASE;
        this.behaviorIndex = 0;

        this.dotCounter = 0;
        this.dotLimit = 0;
    }

    setTarget(x, y) {
        this.targetXPos = x;
        this.targetYPos = y;
    }

    setDirection(direction) {
        this.currentDirection = direction;
        if (this.xoffset === 0 && this.yoffset === 0) {
            this.nextDirection = direction;
        }
        else {
            this.nextDirection = this.findNextDirection(direction);
        }
    }

    reset() {
    }

    update() {
        this.move();
    }

    move() {
        /*
        Ghosts are always thinking one step into the future as they move through the maze.
        Whenever a ghost enters a new tile, it looks ahead to the next tile along its current direction of travel
        and decides which way it will go when it gets there.
    
        When it eventually reaches that tile, it will change its direction of travel to whatever it had decided on a tile beforehand.
        The process is then repeated, looking ahead into the next tile along its new direction of travel
        and making its next decision on which way to go.
        */
        if (this.behavior != Ghost.BEHAVIOR.INHOUSE && this.xoffset === 0 && this.yoffset === 0) {
            this.currentDirection = this.nextDirection;
            this.nextDirection = this.findNextDirection(this.currentDirection);
        }

        super.move();
    }

    calcX(x) {
        return (x + 28) % 28;
    }

    findNextDirection(nextDirection) {
        let leftScore = 999, rightScore = 999, upScore = 999, downScore = 999;

        let xNext, yNext;
        switch(nextDirection) {
            case Entity.DIRECTION.UP:
                xNext = this.xpos;
                yNext = this.ypos - 1;
                break;
            case Entity.DIRECTION.DOWN:
                xNext = this.xpos;
                yNext = this.ypos + 1;
                break;
            case Entity.DIRECTION.LEFT:
                xNext = this.calcX(this.xpos - 1);
                yNext = this.ypos;
                break;
            case Entity.DIRECTION.RIGHT:
                xNext = this.calcX(this.xpos + 1);
                yNext = this.ypos;
                break;
        }

        // move up
        if (nextDirection != Entity.DIRECTION.DOWN && !(game_map[yNext - 1][xNext] & 0x80))
            upScore = Math.abs(xNext - this.targetXPos) + Math.abs(yNext - 1 - this.targetYPos);

        // move down
        if (nextDirection != Entity.DIRECTION.UP && !(game_map[yNext + 1][xNext] & 0x80))
            downScore = Math.abs(xNext - this.targetXPos) + Math.abs(yNext + 1 - this.targetYPos);

        // move left
        if (nextDirection != Entity.DIRECTION.RIGHT && !(game_map[yNext][this.calcX(xNext - 1)] & 0x80))
            leftScore = Math.abs(xNext - 1 - this.targetXPos) + Math.abs(yNext - this.targetYPos);

        // move right
        if (nextDirection != Entity.DIRECTION.LEFT && !(game_map[yNext][this.calcX(xNext + 1)] & 0x80))
            rightScore = Math.abs(xNext + 1 - this.targetXPos) + Math.abs(yNext - this.targetYPos);

        if (upScore === 999 && downScore === 999 && leftScore === 999 && rightScore === 999) {
            throw new Error("Ghost cannot move in any direction, all directions are blocked.");
        }

        // the ghost prefers directions in this order: up, left, down, right.
        if (upScore <= leftScore && upScore <= rightScore && upScore <= downScore) {
            const candidates = [Entity.DIRECTION.UP];
            if (leftScore === upScore) candidates.push(Entity.DIRECTION.LEFT);
            if (downScore === upScore) candidates.push(Entity.DIRECTION.DOWN);
            if (rightScore === upScore) candidates.push(Entity.DIRECTION.RIGHT);
            if (candidates.length > 1) {
                // If multiple directions have the same score, choose one randomly.
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
            return Entity.DIRECTION.UP;
        }

        if (leftScore <= rightScore && leftScore <= downScore) {
            const candidates = [Entity.DIRECTION.LEFT];
            if (rightScore === leftScore) candidates.push(Entity.DIRECTION.RIGHT);
            if (downScore === leftScore) candidates.push(Entity.DIRECTION.DOWN);
            if (candidates.length > 1) {
                // If multiple directions have the same score, choose one randomly.
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
            return Entity.DIRECTION.LEFT;
        }

        if (downScore <= rightScore) {
            if (downScore === rightScore) {
                // If down and right have the same score, choose one randomly.
                const candidates = [Entity.DIRECTION.DOWN, Entity.DIRECTION.RIGHT];
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
            return Entity.DIRECTION.DOWN;
        }

        return Entity.DIRECTION.RIGHT;
    }

    setFrightened() {
        this.behavior = Ghost.BEHAVIOR.FRIGHTENED;
        this.duration = 5000; // 5 seconds

        switch (this.currentDirection) {
            case Entity.DIRECTION.UP: this.currentDirection = Entity.DIRECTION.DOWN; break;
            case Entity.DIRECTION.DOWN: this.currentDirection = Entity.DIRECTION.UP; break;
            case Entity.DIRECTION.LEFT: this.currentDirection = Entity.DIRECTION.RIGHT; break;
            case Entity.DIRECTION.RIGHT: this.currentDirection = Entity.DIRECTION.LEFT; break;
        }

        if (this.xoffset === 0 && this.yoffset === 0) {
            this.nextDirection = this.currentDirection;
        }
        else {
            this.nextDirection = this.findNextDirection(this.currentDirection);
        }

        this.lastTime = game.ticks();
    }

    updateBehavior() {
        const now = game.ticks();

        if (now - this.lastTime > this.duration && this.xoffset === 0 && this.yoffset === 0) {
            if (this.duration > 0) {
                if (this.behavior === Ghost.BEHAVIOR.FRIGHTENED) {
                    // back to the original behavior
                    this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
                    this.duration = Ghost.BehaviorList[this.behaviorIndex].duration;
                }
                else {
                    // move to the next behavior
                    this.behaviorIndex++;
                    this.behavior = Ghost.BehaviorList[this.behaviorIndex].behavior;
                    this.duration = Ghost.BehaviorList[this.behaviorIndex].duration;
                }
            }
            this.lastTime = now;
        }
    }

}