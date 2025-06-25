"use strict"

class Entity {
    static DIRECTION = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };

    xpos; // unit: tile
    ypos; // unit: tile
    xoffset; // unit: pixel -3, -2, -1, 0, 1, 2, 3, 4
    yoffset; // unit: pixel -3, -2, -1, 0, 1, 2, 3, 4

    color;
    currentDirection;
    
    constructor() {
        this.xpos = 0;
        this.ypos = 0;
        this.xoffset = 0;
        this.yoffset = 0;
    }

    setPosition(x, y) {
        this.xpos = x;
        this.ypos = y;
    }

    move() {
        switch (this.currentDirection) {
        case Entity.DIRECTION.UP:
            this.yoffset -= 1;
            if (this.yoffset < -3) {
                this.yoffset = 4;
                this.ypos -= 1;
            }
            break;
        case Entity.DIRECTION.DOWN:
            this.yoffset += 1;
            if (this.yoffset > 4) {
                this.yoffset = -3;
                this.ypos += 1;
            }
            break;
        case Entity.DIRECTION.RIGHT:
            this.xoffset += 1;
            if (this.xoffset > 4) {
                this.xoffset = -3;
                this.xpos += 1;
            }
            if (this.xpos > 27) {
                this.xpos = 0;
            }
            break;
        case Entity.DIRECTION.LEFT:
            this.xoffset -= 1;
            if (this.xoffset < -3) {
                this.xoffset = 4;
                this.xpos -= 1;
            }
            if (this.xpos < 0) {
                this.xpos = 27;
            }
            break;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.xpos * TILE_WIDTH + 1 + this.xoffset,
            this.ypos * TILE_HEIGHT + 1 + this.yoffset,
            TILE_WIDTH - 2, TILE_HEIGHT - 2
        );
    }

    testCollision(other) {
        return (
            this.xpos === other.xpos &&
            this.ypos === other.ypos
        );
    }

}
