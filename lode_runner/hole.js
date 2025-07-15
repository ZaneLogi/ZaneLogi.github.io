"use strict"

class Hole {
    static HOLE_LIFE = 202;

    constructor(stage, x, y) {
        this.stage = stage;
        this.x = x;
        this.y = y;
        this.life = Hole.HOLE_LIFE;
    }

    update() {
        this.life--;
    }

    phase() {
        if (this.life > 20)
            return 0;
        if (this.life > 10)
            return 1;
        if (this.life > 0)
            return 2;
        return 3;
    }
}