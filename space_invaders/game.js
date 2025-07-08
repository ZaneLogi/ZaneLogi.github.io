"use strict"

const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    sys_evt.init();
    resource.init();

    this.initGame();

    runloop.start(() => this.doFrame(), 1000/60); // 60 FPS
}

game.doFrame = function () {
    this.processEvents();

    this.drawAlien();
    this.nextCursorAlien();
}

game.initGame = function() {
    this.level_data = Object.assign({}, init_data);
    this.level_data.aliens = new Array(55).fill(1);
}

game.drawSprite = function(x , y, image) {
    this.canvas_ctx.drawImage(image, x - 32, this.window_height - 1 - y);
}

game.drawAlien = function() {
    const alienCurIndex = this.level_data.alien_cur_index;
    if (this.level_data.aliens[alienCurIndex] != 0) {
        const alienType = Math.floor(this.level_data.alien_row/2);
        const alienFrame = this.level_data.alien_frame;
        const x = this.level_data.alien_cursor_x;
        const y = this.level_data.alien_cursor_y;
        const image = resource.alienImages[alienType][alienFrame];

        /*this.canvas_ctx.fillStyle = "#000000";
        this.canvas_ctx.fillRect(x,
            this.window_height - 1 - y - this.level_data.ref_alien_dy, 16, 8);*/

        this.drawSprite(x, y, image);
    }
}

game.nextCursorAlien = function() {
    for (let i = 0; i < 55; i++) {
        if (this.level_data.alien_cur_index >= 54) {
            this.level_data.alien_cur_index = 0;
            this.moveRefAlien();
        }
        else {
            this.level_data.alien_cur_index++;
        }

        if (this.level_data.aliens[this.level_data.alien_cur_index] != 0) {
            this.setAlienCoords();
            break;
        }
    }
}

game.moveRefAlien = function() {
    const LEFT_BOUND = 34, RIGHT_BOUND = 254;

    let leftSide = 999, rightSide = -999;
    for (let i = 0; i < 55; ) {
        let x = this.level_data.ref_alien_x;
        for (let j = 0; j < 11; j++, i++, x += 16) {
            if (this.level_data.aliens[i] != 0) {
                if (x < leftSide) {
                    leftSide = x;
                }
                if (x + 16 > rightSide) {
                    rightSide = x + 16;
                }
            }
        }
    }

    if (leftSide < LEFT_BOUND || rightSide >= RIGHT_BOUND) {
        this.level_data.ref_alien_dx = -this.level_data.ref_alien_dx;
        //this.level_data.ref_alien_y -= 8;
        this.level_data.ref_alien_dy = 8;
    }
    else {
        this.level_data.ref_alien_dy = 0;
    }

    this.level_data.alien_frame = 1 - this.level_data.alien_frame;
    this.level_data.ref_alien_x += this.level_data.ref_alien_dx;
}

game.setAlienCoords = function() {
    const alienIndex = this.level_data.alien_cur_index;
    const row = Math.floor(alienIndex/11);
    const col = alienIndex % 11;
    const x = this.level_data.ref_alien_x + col * 16;
    const y = this.level_data.ref_alien_y + row * 16;

    this.level_data.alien_row = row;
    this.level_data.alien_cursor_x = x;
    this.level_data.alien_cursor_y = y;
}

const input = {
    enabled: false,
    has_input: false,

    enable: function() {
        this.enabled = true;
        this.has_input = false;
        this.input_dir = DIR.LEFT;
    },

    disable: function() {
        this.enabled = false;
        this.has_input = false;
    },
};

game.processEvents = function () {
    if (input.enabled) {
        for (const e of sys_evt.events) {
            switch(e.type) {
                case sys_evt.KEY_DOWN:
                {
                    const code = e.context.code;
                    if (code == "KeyA") {
                        input.input_dir = DIR.LEFT;
                    }
                    else if (code == "KeyD") {
                        input.input_dir = DIR.RIGHT;
                    }
                    else if (code == "KeyW") {
                        input.input_dir = DIR.UP;
                    }
                    else if (code == "KeyS") {
                        input.input_dir = DIR.DOWN;
                    }

                    input.has_input = true;
                    break;
                }
                case sys_evt.KEY_UP:
                {
                    break;
                }
            }
        }
    }

    sys_evt.reset();
}
