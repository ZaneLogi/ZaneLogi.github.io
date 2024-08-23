"use strict"

const LEFT = false;
const RIGHT = true;

const KEY_DOWN = 0;
const KEY_UP = 1;

const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
    key_events: [],
    firstDir: LEFT,
    keyDPressed: false,
    keyAPressed: false,
    keySpace: false,
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    window.addEventListener("keydown", (e) => this.onkeydown(e));
    window.addEventListener("keyup", (e) => this.onkeyup(e));

    this.loadResources();
};

game.loadResources = function () {
    res_loader.start(() => this.loadResourceCompletion());
};

game.loadResourceCompletion = function () {
    map.init();
    runloop.start(() => this.doFrame(), 16);
}

game.doFrame = function () {
    map.setBackgroundColor(this.canvas_ctx);
    this.processEvents();
    map.update();
    map.draw(this.canvas_ctx);
};

game.ticks = function () {
    return window.performance.now();
}

game.onkeydown = function (e) {
    this.key_events.push({ event: KEY_DOWN, code: e.code });
}

game.onkeyup = function (e) {
    this.key_events.push({ event: KEY_UP, code: e.code });
}

game.processEvents = function () {
    for (const e of this.key_events) {
        switch (e.event) {
            case KEY_DOWN:
                if (e.code == "KeyD") {
                    this.keyDPressed = true;
                    if (!this.keyAPressed) {
                        this.firstDir = RIGHT;
                    }
                }
                else if (e.code == "KeyA") {
                    this.keyAPressed = true;
                    if (!this.keyDPressed) {
                        this.firstDir = LEFT;
                    }
                }
                else if (e.code == "Space") {
                    if (!this.keySpace) {
                        this.keySpace = true;
                        map.player.jump();
                    }
                }
                break;
            case KEY_UP:
                if (e.code == "KeyD") {
                    this.keyDPressed = false;
                    if (this.firstDir == RIGHT) {
                        this.firstDir = LEFT;
                    }
                }
                else if (e.code == "KeyA") {
                    this.keyAPressed = false;
                    if (this.firstDir == LEFT) {
                        this.firstDir = RIGHT;
                    }
                }
                else if (e.code == "Space") {
                    this.keySpace = false;
                }
                break;
        }

        if (this.keyAPressed) {
            // KeyA pressed
            if (!map.player.move && this.firstDir == LEFT && !map.player.getChangeMoveDirection() && !map.player.squat) {
                // not moving
                // KeyA is the first key pressed
                // not in changing the move direction
                // not squat
                map.player.startMove();
                map.player.moveDirection = LEFT;
            } else if (!this.keyDPressed && map.player.moveSpeed > 0 && this.firstDir != map.player.moveDirection) {
                // not KeyD pressed
                // has move speed
                // LEFT is not the current move direction 
                map.player.setChangeMoveDirection();
            }
        }

        if (this.keyDPressed) {
            if (!map.player.move && this.firstDir == RIGHT && !map.player.getChangeMoveDirection() && !map.player.squat) {
                map.player.startMove();
                map.player.moveDirection = RIGHT;
            } else if (!this.keyAPressed && map.player.moveSpeed > 0 && this.firstDir != map.player.moveDirection) {
                map.player.setChangeMoveDirection();
            }
        }

        if (map.player.move && !this.keyAPressed && !this.keyDPressed) {
            // moving
            // not KeyA pressed
            // not KeyD pressed
            map.player.resetMove();
        }
    }

    this.key_events.length = 0; // empty events.
}