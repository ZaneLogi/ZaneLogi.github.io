"use strict"

class Player extends Entity {
    constructor() {
        super();
        this.color = "#FFFF00"; // Yellow
        this.reset();
    }

    move(direction) {
        this.nextDirection = direction;
    }

    reset() {
        this.xpos = 13;
        this.ypos = 26;
        this.currentDirection = Entity.DIRECTION.LEFT;
        this.nextDirection = Entity.DIRECTION.LEFT;
    }

    update() {
        /*const c = screen_map[this.ypos][this.xpos];
        if (c === 'o' || c === 'O') {
            game_map[this.ypos][this.xpos] = 0;
            if (game->nextGhostDotCounter != nullptr)
                game->nextGhostDotCounter->dotCounter++;

            game->notEatDotsTimer = SDL_GetTicks();

            if (c == 'O') {
                game->ghostBlinky.setFrightened();
                game->ghostPinky.setFrightened();
                game->ghostInky.setFrightened();
                game->ghostClyde.setFrightened();
            }
        }*/

        if (this.currentDirection != this.nextDirection) {
            switch (this.nextDirection) {
            case Entity.DIRECTION.UP:
                if (!(game_map[this.ypos - 1][this.xpos] & 0x80))
                    this.currentDirection = this.nextDirection;
                break;
            case Entity.DIRECTION.DOWN:
                if (!(game_map[this.ypos + 1][this.xpos] & 0x80))
                    this.currentDirection = this.nextDirection;
                break;
            case Entity.DIRECTION.LEFT:
                if (!(game_map[this.ypos][this.xpos - 1] & 0x80))
                    this.currentDirection = this.nextDirection;
                break;
            case Entity.DIRECTION.RIGHT:
                if (!(game_map[this.ypos][this.xpos + 1] & 0x80))
                    this.currentDirection = this.nextDirection;
                break;
            }        
        }

        switch (this.currentDirection) {
        case Entity.DIRECTION.UP:
            if (this.yoffset > 0 || !(game_map[this.ypos - 1][this.xpos] & 0x80))
                super.move();
            if (this.xoffset < 0) this.xoffset++;
            else if (this.xoffset > 0) this.xoffset--;
            break;
        case Entity.DIRECTION.DOWN:
            if (this.yoffset < 0 || !(game_map[this.ypos + 1][this.xpos] & 0x80))
                super.move();
            if (this.xoffset < 0) this.xoffset++;
            else if (this.xoffset > 0) this.xoffset--;
            break;
        case Entity.DIRECTION.LEFT:
            if (this.xoffset > 0 || !(game_map[this.ypos][this.xpos - 1] & 0x80))
                super.move();
            if (this.yoffset < 0) this.yoffset++;
            else if (this.yoffset > 0) this.yoffset--;
            break;
        case Entity.DIRECTION.RIGHT:
            if (this.xoffset < 0 || !(game_map[this.ypos][this.xpos + 1] & 0x80))
                super.move();
            if (this.yoffset < 0) this.yoffset++;
            else if (this.yoffset > 0) this.yoffset--;
            break;
        }
    }

}