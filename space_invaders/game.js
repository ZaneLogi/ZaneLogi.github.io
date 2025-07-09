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

    input.enable();

    runloop.start(() => this.doFrame(), 1000/60); // 60 FPS
}

game.doFrame = function () {
    this.processEvents();

    if (!this.alien_is_exploding) {
        this.drawAlien();
    }
    else {
        this.exp_alien_timer--;
        if (this.exp_alien_timer == 0) {
            this.eraseRect(this.exp_alien_x, this.exp_alien_y, 16, 8);
            this.gameObjs[1].player_shot_status = 4; // the alien has exploded
            this.alien_is_exploding = false;
        }
    }
    this.runGameObjs();
    if (!this.alien_is_exploding) {
        this.nextCursorAlien();
    }
}

game.initGame = function() {
    this.level_data = Object.assign({}, init_data);
    this.level_data.aliens = new Array(55).fill(1);

    this.gameObjs = [
        {
            timer_msb: init_data.obj0_timer_msb,
            timer_lsb: init_data.obj0_timer_lsb,
            timer_extra: init_data.obj0_timer_extra,
            player_y: init_data.player_y,
            player_x: init_data.player_x,
            cb: (obj) => this.handlePlayerShip(obj),
        },
        {
            timer_msb: init_data.obj1_timer_msb,
            timer_lsb: init_data.obj1_timer_lsb,
            timer_extra: init_data.obj1_timer_extra,
            player_shot_status: init_data.player_shot_status,
            shot_start_y: init_data.obj1_y,
            shot_delta: init_data.shot_delta,
            blow_up_timer: init_data.blow_up_timer,
            fire_bounce: init_data.fire_bounce,
            cb: (obj) => this.handlePlayerShot(obj),
        }
    ];

    this.drawShield();
    this.drawBottomLine();
}

game.runGameObjs = function() {
    for (const obj of this.gameObjs) {
        let timerMsb = obj.timer_msb;
        let timerLsb = obj.timer_lsb;
        let timerExtra = obj.timer_extra;
        if (timerMsb == 0xff)
            break; // end of the loop
        if (timerMsb == 0xfe)
            continue; // skip this one
        if (timerMsb | timerLsb) {
            timerLsb--;
            if (timerLsb < 0) {
                timerLsb = 0;
                timerMsb--;
            }
            obj.timer_msb = timerMsb;
            obj.timer_lsb = timerLsb;
        }
        else if (timerExtra > 0) {
            timerExtra--;
            obj.timer_extra = timerExtra;
        }
        else {
            obj.cb(obj);
        }
    }
}

game.convertCoords = function(pt) {
    // in the original game, the origin(0, 0) is at the point(32, 255) of the canvas
    // the x direction is left to right, the y direction is bottom to top
    // so need to translate the game coordinates to the screen coordinates
    const x = pt.x;
    const y = pt.y;

    // Convert to canvas coordinates
    pt.x = x - 32;
    pt.y = this.window_height - 1 - y;

    return pt;
}

game.eraseRect = function(x, y, w, h) {
    const pt = this.convertCoords({x: x, y: y});
    this.canvas_ctx.fillStyle = "#000000";
    this.canvas_ctx.fillRect(pt.x, pt.y, w, h);
}

game.drawSprite = function(x , y, image) {
    const pt = this.convertCoords({x: x, y: y});
    this.canvas_ctx.drawImage(image, pt.x, pt.y);
}

game.drawShield = function() {
    const shieldX = 64;
    const shieldY = 56;
    const shieldW = 22;
    const distBetweenShields = 23;

    for (let i = 0, x = shieldX; i < 4; i++) {
        const pt = this.convertCoords({x: x, y: shieldY});

        this.canvas_ctx.drawImage(resource.shieldImage, pt.x, pt.y);
        x += distBetweenShields + shieldW;
    }
}

game.drawBottomLine = function() {
    this.canvas_ctx.fillStyle = "#00ff00";
    this.canvas_ctx.fillRect(0, this.window_height - 1 - 16, this.window_width, 1);
}

game.drawAlien = function() {
    const alienCurIndex = this.level_data.alien_cur_index;
    if (this.level_data.aliens[alienCurIndex] != 0) {
        const alienType = Math.floor(this.level_data.alien_row/2);
        const alienFrame = this.level_data.alien_frame;
        const x = this.level_data.alien_cursor_x;
        const y = this.level_data.alien_cursor_y;
        const image = resource.alienImages[alienType][alienFrame];

        // as the alien images have blank linkes at the left and right sides,
        // no need to erase the old one if moving horizontally
        this.drawSprite(x, y, image);

        // erase the old one if moving vertically
        if (this.level_data.ref_alien_dy > 0) {
            this.eraseRect(
                x - this.level_data.ref_alien_dx,
                y + this.level_data.ref_alien_dy,
                16, 8);
        }
    }
}

game.nextCursorAlien = function() {
    // move the alien cursor index to the next one.
    // if it runs over the last one,
    // it will move the reference alien first then go back to the first one.
    // if the cursor alien is not alive, move to the next until it is alive. 
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
    // the calculations of the left and right boundaries
    // from the original code, the screen start address is treated as 0x2000
    // there are 0x20 bytes for one scanline
    // left screen edge: 0x2524,  (0x2524 - 0x2000) / 0x20 = 41
    // right screen edge: 0x3ea4, (0x3ea4 - 0x2000) / 0x20 = 245

    const LEFT_BOUND = 41, RIGHT_BOUND = 245;

    // find the left-most and right-most side of the alien rack.
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

    // if reaches the boundary in the either side,
    // change the direction and move 8 pixels down
    if (leftSide < LEFT_BOUND || rightSide >= RIGHT_BOUND) {
        this.level_data.ref_alien_dx = -this.level_data.ref_alien_dx;
        this.level_data.ref_alien_y -= 8;
        this.level_data.ref_alien_dy = 8;
    }
    else {
        this.level_data.ref_alien_dy = 0;
    }

    // toggle the alien frame
    this.level_data.alien_frame = 1 - this.level_data.alien_frame;
    // move in the x direction
    this.level_data.ref_alien_x += this.level_data.ref_alien_dx;
}

game.setAlienCoords = function() {
    // based on the position of the reference alien,
    // calculate the screen position of the cursor alien with its row
    const alienIndex = this.level_data.alien_cur_index;
    const row = Math.floor(alienIndex/11);
    const col = alienIndex % 11;
    const x = this.level_data.ref_alien_x + col * 16;
    const y = this.level_data.ref_alien_y + row * 16;

    this.level_data.alien_row = row;
    this.level_data.alien_cursor_x = x;
    this.level_data.alien_cursor_y = y;
}

game.drawPlayerShip = function(obj) {
    const playerX = obj.player_x;
    const playerY = obj.player_y;
    const playerImage = resource.playerImage;
    this.drawSprite(playerX, playerY, playerImage);
}

game.movePlayerShip = function(obj) {
    if (input.left_pressed && obj.player_x > 0x30) {
        obj.player_x--;
    }
    else if (input.right_pressed && obj.player_x < 0xd9) {
        obj.player_x++;
    }
}

game.drawPlayerShot = function(obj) {
    const x = obj.shot_x;
    const y = obj.shot_y;
    const image = resource.playerShotImage;
    this.drawSprite(x, y, image);
}

game.drawShotExploding = function(obj) {
    const x = obj.shot_x;
    const y = obj.shot_y;
    const image = resource.shotExplodingImage;
    this.drawSprite(x, y, image);
}

game.drawAlienExploding = function() {
    const x = this.exp_alien_x;
    const y = this.exp_alien_y;
    const image = resource.alienExplodingImage;
    this.drawSprite(x, y, image);
}

game.handlePlayerShip = function(obj) {
    this.movePlayerShip(obj);
    this.drawPlayerShip(obj);
}

game.checkShotHit = function(obj) {
    const shot_y = obj.shot_y - 4; // the solid potion in the shot image

    // find the row based on the bottom line of the reference alien
    let bottom_y = this.level_data.ref_alien_y + this.level_data.ref_alien_dy - 15;
    const row = Math.floor((shot_y - bottom_y) / 16);
    if (row < 0 || row > 4)
        return false;

    bottom_y += row * 16;

    // find the column
    let x = this.level_data.ref_alien_x;
    let index = row * 11;
    let found = false;
    let dist_x = 0;
    let target_x = 0;
    for (let col = 0; col < 11; col++, index++, x += 16) {
        if (this.level_data.aliens[index] == 0)
            continue;

        let x1 = x;
        if (index > this.level_data.alien_cur_index) {
            x1 = x1 - this.level_data.ref_alien_dx;
        }

        if (x1 <= obj.shot_x && obj.shot_x < x1 + 16) {
            found = true;
            dist_x = obj.shot_x - x1;
            target_x = x1;
            break;
        }
    }

    if (!found)
        return false;

    // precise check
    const type = Math.floor(row/4); // 0 or 1
    // the aliens at the row 0, 1, 2, 3 have 2 blank lines at the both sides
    // the aliens at the row 4 have 3 blank lines at the both sides.
    if (dist_x <= 2 + type || dist_x > 14 - type)
        return false;

    let dist_y = 0;
    let target_y = 0;
    // the aliens are moving down
    if (this.level_data.ref_alien_dy > 0) {
        // the aliens after the cursor one are not moving down yet.
        if (index > this.level_data.alien_cur_index) {
            // on the top part of the 16 x 16 area
            dist_y = shot_y - (bottom_y + 8);
            target_y = bottom_y + 15;
        }
        else {
            // on the bottom part of the 16 x 16 area
            dist_y = shot_y - bottom_y;
            target_y = bottom_y + 7
        }
    }
    else {
        // on the top part of the 16 x 16 area
        dist_y = shot_y - (bottom_y + 8);
        target_y = bottom_y + 15;
    }

    if (dist_y < -4 || dist_y > 4)
        return false;

    console.log(`hit ${index}: ${target_x}, ${bottom_y}`);

    this.level_data.aliens[index] = 0;
    this.eraseRect(target_x, bottom_y + 15, 16, 16);

    this.exp_alien_y = target_y;
    this.exp_alien_x = target_x;
    this.exp_alien_timer = 0x10;

    return true;
}

game.handlePlayerShot = function(obj) {
    const playerObj = this.gameObjs[0];
    // todo: check if player alive

    // no firing till the player object starts
    if (playerObj.timer_msb | playerObj.timer_lsb)
        return;

    // 0 if available,
    // 1 if just initiated,
    // 2 moving normally,
    // 3 hit something besides alien,
    // 4 if alien has exploded (remove from active duty)
    // 5 if alien explosion is in progress, 
    if (obj.player_shot_status == 0) {
        if (!obj.fire_bounce && input.fire_pressed) {
            obj.player_shot_status = 1; // activate the player shot
            obj.fire_bounce = true; // need to release before another shot

        }
        else if (obj.fire_bounce && !input.fire_pressed) {
            obj.fire_bounce = false;
        }
    }

    if (obj.player_shot_status == 1) {
        // Init player shot
        obj.player_shot_status = 2;
        obj.shot_x = playerObj.player_x + 8;
        obj.shot_y = obj.shot_start_y;
        this.drawPlayerShot(obj);
    }
    else if (obj.player_shot_status == 2) {
        // Move player shot
        const prev_y = obj.shot_y;
        obj.shot_y += obj.shot_delta;

        if (obj.shot_y > 0xd8) {
            // Player shot leaving playfield
            obj.player_shot_status = 3; // mark player shot hit something other than alien
        }
        else if (this.checkShotHit(obj)) {
            obj.player_shot_status = 5;
            this.alien_is_exploding = true;
            this.drawAlienExploding();
        }
        else {
            this.drawPlayerShot(obj);
        }
        this.eraseRect(obj.shot_x, prev_y - 4, 1, 4);
    }
    else if (obj.player_shot_status == 3) {
        if (--obj.blow_up_timer == 0x0f) {
            // erase the shot first

            obj.shot_y -= 2;
            obj.shot_x -= 3;

            this.drawShotExploding(obj);
        }
        else if (obj.blow_up_timer == 0) {
            // end of blow up
            obj.player_shot_status = 0;
            obj.blow_up_timer = init_data.blow_up_timer;
            this.eraseRect(obj.shot_x, obj.shot_y, 8, 8);
        }
    }
    else if (obj.player_shot_status == 5) {

    }
    else if (obj.player_shot_status == 4) {
        obj.player_shot_status = 0;
    }
}

const input = {
    enabled: false,
    has_input: false,

    left_pressed: false,
    right_pressed: false,
    fire_pressed: false,

    enable: function() {
        this.enabled = true;
        this.has_input = false;
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
                        input.left_pressed = true;
                    }
                    else if (code == "KeyD") {
                        input.right_pressed = true;
                    }
                    else if (code == "KeyW") {
                        input.fire_pressed = true;
                    }

                    input.has_input = true;
                    break;
                }
                case sys_evt.KEY_UP:
                {
                    const code = e.context.code;
                    if (code == "KeyA") {
                        input.left_pressed = false;
                    }
                    else if (code == "KeyD") {
                        input.right_pressed = false;
                    }
                    else if (code == "KeyW") {
                        input.fire_pressed = false;
                    }

                    break;
                }
            }
        }
    }

    sys_evt.reset();
}
