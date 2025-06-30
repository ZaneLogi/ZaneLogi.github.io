"use strict"

const DIR = { RIGHT:0, DOWN:1, LEFT:2, UP:3 };

class Actor {
    constructor() {
        this.dir;
        this.pos;
        this.animTick;
    }
}

class Pacman extends Actor {
    constructor() {
        super();
    }

    init() {
        this.dir = DIR.LEFT;
        this.pos = {x:14*8, y:26*8+4};
    }
}

class GhostX extends Actor {
    constructor() {
        super();
    }
}