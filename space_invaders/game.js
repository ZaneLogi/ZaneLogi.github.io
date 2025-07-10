"use strict"

const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    // https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently
    // CanvasSettings objects with will read frequently equal to true tell the user agent that
    // the webpage is likely to perform many readback operations
    // and that it is advantageous to use a software canvas.
    this.canvas_ctx = this.canvas.getContext('2d', {willReadFrequently: true});
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

    this.runGameObjs();

    if (this.level_data.num_aliens == 0) {
        // all aliens gone, end of turn
    }
    else if (!this.alien_is_exploding) {
        this.nextCursorAlien();
    }

    this.adjustShotReloadRate();
}

game.initGame = function() {
    this.level_data = Object.assign({}, init_data);
    this.level_data.aliens = new Array(55).fill(1);
    this.aShotReloadRate = 8;

    this.gameObjs = [
        // Game object 0: Move/draw the player
        Object.assign({}, init_player_ship_data),
        // Game object 1: Move/draw the player shot
        Object.assign({}, init_player_shot_data),
        // Game object 2: Alien rolling-shot (targets player specifically)
        Object.assign({}, init_rolling_shot_data),
        // Game object 3: Alien plunger-shot
        Object.assign({}, init_plunger_shot_data),
        // Game object 4: Flying Saucer OR squiggly shot
        Object.assign({}, init_squiggly_shot_data),
    ];

    this.gameObjs[0].cb = (obj) => this.handlePlayerShip(obj);
    this.gameObjs[1].cb = (obj) => this.handlePlayerShot(obj);
    this.gameObjs[2].cb = (obj) => this.handleRollingShot(obj);
    this.gameObjs[3].cb = (obj) => this.handlePlungerShot(obj);
    this.gameObjs[4].cb = (obj) => this.handleSquigglyShot(obj);

    this.gameObjs[2].images = resource.alienShotImages[0];
    this.gameObjs[3].images = resource.alienShotImages[1];
    this.gameObjs[4].images = resource.alienShotImages[2];

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

game.adjustShotReloadRate = function() {
    let score = 0; // todo
    score = (score >> 8); // high byte
    for (let i = 0; i < alien_reload_score_table.length; i++) {
        if (score <= alien_reload_score_table[i]) {
            this.aShotReloadRate = shot_reload_rate[i];
            return;
        }
    }

    this.aShotReloadRate = shot_reload_rate[alien_reload_score_table.length];
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
    this.canvas_ctx.fillRect(0, this.window_height - 1 - 17, this.window_width, 1);
}

game.drawPlayerShip = function(obj) {
    const playerX = obj.player_x;
    const playerY = obj.player_y;
    const playerImage = resource.playerImage;
    this.drawSprite(playerX, playerY, playerImage);
}

game.drawPlayerBlowup = function(obj) {
    const x = obj.player_x;
    const y = obj.player_y;
    const image = resource.playerBlowupImages[obj.player_alive];
    this.drawSprite(x, y, image);
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

game.drawAlienShot = function(obj) {
    const pt = this.convertCoords({x: obj.shot_x, y: obj.shot_y});
    const imageIndex = obj.shot_step_cnt % 4;
    this.canvas_ctx.drawImage(obj.images[imageIndex], pt.x, pt.y);
}

game.drawAlienShotExploding = function(obj) {
    const x = obj.shot_x;
    const y = obj.shot_y;
    const image = resource.alienShotExplodingImage;
    this.drawSprite(x, y, image);
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

game.movePlayerShip = function(obj) {
    if (input.left_pressed && obj.player_x > 0x30) {
        obj.player_x--;
    }
    else if (input.right_pressed && obj.player_x < 0xd9) {
        obj.player_x++;
    }
}

game.handlePlayerShip = function(obj) {
    if (obj.player_alive != 0xff) {
        // the player ship is blowing up
        obj.exp_animate_timer--; // Decrement the blow-up delay
        if (obj.exp_animate_timer != 0)
            return;
        this.level_data.player_ok = 0;
        this.level_data.enable_alien_fire = false; // disable alien shots
        this.level_data.alien_fire_delay = 0x30; // reset the delay
        obj.exp_animate_timer = 5;
        obj.exp_animate_cnt--;
        if (obj.exp_animate_cnt != 0) {
            obj.player_alive = (obj.player_alive + 1 ) & 0x01; // toggle (0, 1, 0, 1 ...)
            this.drawPlayerBlowup(obj);
        }
        else {
            // Blow up finished
            this.eraseRect(obj.player_x, obj.player_y, 16, 8);

            // reset
            Object.assign(obj, init_player_ship_data);
        }
    }
    else {
        this.level_data.player_ok = 1;
        if (this.level_data.alien_fire_delay > 0) {
            this.level_data.alien_fire_delay--;
        }
        else {
            this.level_data.enable_alien_fire = true;
        }
        this.movePlayerShip(obj);
        this.drawPlayerShip(obj);
    }
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
            target_x = x1;
            break;
        }
    }

    if (!found)
        return false;

    let target_y = 0;
    // the aliens are moving down
    if (this.level_data.ref_alien_dy > 0) {
        // the aliens after the cursor one are not moving down yet.
        if (index > this.level_data.alien_cur_index) {
            // on the top part of the 16 x 16 area
            target_y = bottom_y + 15;
        }
        else {
            // on the bottom part of the 16 x 16 area
            target_y = bottom_y + 7
        }
    }
    else {
        // on the top part of the 16 x 16 area
        target_y = bottom_y + 15;
    }

    this.level_data.aliens[index] = 0;
    this.eraseRect(target_x, target_y, 16, 8);

    this.exp_alien_y = target_y;
    this.exp_alien_x = target_x;

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
        else {
            // before drawing the new shot, check if there is something
            const pt = this.convertCoords({x: obj.shot_x, y: obj.shot_y});
            const imageData = this.canvas_ctx.getImageData(pt.x, pt.y + 4, 1, 4); // see the comment of the canvas context creation
            const data = imageData.data;
            let collision = false;
            for (let i = 0; i < 16; i += 4) {
                // 4 pixels, if not transparent, check (r,g,b)
                if (data[i+3] != 0 && (data[i] != 0 || data[i+1] != 0 || data[i+2] != 0)) {
                    collision = true;
                    break;
                }
            }

            if (collision) {
                if (this.checkShotHit(obj)) {
                    // an alien is hit
                    obj.player_shot_status = 5;
                    this.alien_is_exploding = true;
                    this.exp_alien_timer = init_data.exp_alien_timer; // set timer value (0x10)
                    this.drawAlienExploding();
                }
                else {
                    // hit something other than aliens
                    obj.player_shot_status = 3; // mark player shot hit something other than alien
                }
            }
            else {
                this.drawPlayerShot(obj);
            }
        }

        // remove the old shot image
        this.eraseRect(obj.shot_x, prev_y - 4, 1, 4);
    }
    else if (obj.player_shot_status == 3) {
        if (--obj.blow_up_timer == 0x0f) {
            obj.shot_y -= 2;
            obj.shot_x -= 3;

            this.drawShotExploding(obj);
        }
        else if (obj.blow_up_timer == 0) {
            // end of blow up
            obj.player_shot_status = 0;
            obj.blow_up_timer = init_player_shot_data.blow_up_timer; // reset the blow up timer value (0x10)
            this.eraseRect(obj.shot_x, obj.shot_y, 8, 8);
        }
    }
    else if (obj.player_shot_status == 5) {
        this.exp_alien_timer--;
        if (this.exp_alien_timer == 0) {
            this.eraseRect(this.exp_alien_x, this.exp_alien_y, 16, 8);
            obj.player_shot_status = 4; // the alien has exploded
        }
    }
    else if (obj.player_shot_status == 4) {
        obj.player_shot_status = 0;
        this.level_data.num_aliens--;
        this.alien_is_exploding = false;
    }
}

game.getAlienCoords = function(alienIndex) {
    const row = Math.floor(alienIndex/11);
    const col = alienIndex % 11;
    let x = this.level_data.ref_alien_x + col * 16;
    let y = this.level_data.ref_alien_y + row * 16;

    if (alienIndex > this.level_data.alien_cur_index) {
        x -= this.level_data.ref_alien_dx;
        y += this.level_data.ref_alien_dy;
    }

    return {x: x, y: y};
}

game.handleAlienShot = function(obj, other1StepCnt, other2StepCnt) {
    // Bit 0 set if shot is blowing up, bit 7 set if active
    if ((obj.shot_status & 0x80) == 0) {
        // not active
        if (!this.level_data.enable_alien_fire) {
            return;
        }

        obj.shot_step_cnt = 0;

        // Make sure it isn't too soon to fire another shot
        if (other1StepCnt != 0 && this.aShotReloadRate > other1StepCnt) {
            return; // Too soon to fire again
        }

        if (other2StepCnt != 0 && this.aShotReloadRate > other2StepCnt) {
            return; // Too soon to fire again
        }

        let column;
        if (obj.shot_track == 1) {
            // A 1 means this shot does not track the player
            column = column_fire_table[obj.shot_column_offset];
        }
        else {
            // A 0 means this shot tracks the player
            // Start a shot right over the player
            const targetX = this.gameObjs[0].player_x + 8;
            column = Math.floor((targetX - this.level_data.ref_alien_x) / 16);
            if (column < 0) column = 0;
            else if (column > 10) column = 10;
        }

        let found = -1;
        for (let row = 0, off = 0; row < 5; row++, off += 11) {
            if (this.level_data.aliens[off+column] != 0) {
                found = off + column;
                break;
            }
        }

         if (found < 0) {
            return; // No alien is alive in target column ... out
        }

        const pt = this.getAlienCoords(found);
        obj.shot_y = pt.y - 10;
        obj.shot_x = pt.x + 7;
        obj.shot_status |= 0x80;
        obj.shot_step_cnt = 1; // Give this shot 1 step (it just started)
        return;
    }
    else if (obj.shot_status & 0x01) {
        // do shot-is-blowing-up sequence
        --obj.shot_blow_cnt;
        if (obj.shot_blow_cnt == 3) {
            // erase the shot
            this.eraseRect(obj.shot_x, obj.shot_y, 3, 8);

            obj.shot_y -= 2;
            obj.shot_x -= 2;

            this.drawAlienShotExploding(obj);
        }
        else if (obj.shot_blow_cnt == 0) {
            this.eraseRect(obj.shot_x, obj.shot_y, 6, 8);
        }
        else {
            return; // just wait
        }
    }
    else {
        // Move the alien shot
        obj.shot_step_cnt++;

        // erase the old one
        this.eraseRect(obj.shot_x, obj.shot_y, 3, 8);

        obj.shot_y -= 1;

        if (obj.shot_y < 21) {
            obj.shot_status |= 0x01; // end it
        }

        const pt = this.convertCoords({x: obj.shot_x, y: obj.shot_y});
        const imageData = this.canvas_ctx.getImageData(pt.x, pt.y + 7, 3, 1);
        const data = imageData.data;
        let collision = false;
        for (let i = 0; i < 12; i += 4) {
            // 3 pixels, if not transparent, check (r,g,b)
            if (data[i+3] != 0 && (data[i] != 0 || data[i+1] != 0 || data[i+2] != 0)) {
                collision = true;
                break;
            }
        }

        if (collision) {
            if (0x1e < obj.shot_y && obj.shot_y < 0x27) {
                this.gameObjs[0].player_alive = 0;
            }
            obj.shot_status |= 0x01; // end it
        }

        this.drawAlienShot(obj);
    }
}

game.handleRollingShot = function(obj) {
    if (obj.shot_column_offset-- == 0)
        return; // run the shot next time

    this.handleAlienShot(obj, this.gameObjs[3].shot_step_cnt, this.gameObjs[4].shot_step_cnt);
    // Test if shot has cycled through blowing up
    if (obj.shot_blow_cnt == 0) {
        // The rolling-shot has blown up. Reset the data structure.
        Object.assign(obj, init_rolling_shot_data);
    }
}

game.handlePlungerShot = function(obj) {
    if (this.num_aliens <= 1) // One alien left? Skip plunger shot?
        return;

    // todo: shotSync

    this.handleAlienShot(obj, this.gameObjs[2].shot_step_cnt, this.gameObjs[4].shot_step_cnt);
    // Test if shot has cycled through blowing up
    if (obj.shot_blow_cnt == 0) {
        let column_offset = obj.shot_column_offset;

        // The rolling-shot has blown up. Reset the data structure.
        Object.assign(obj, init_plunger_shot_data);

        column_offset++;
        if (column_offset == 0x10) {
            column_offset = init_plunger_shot_data.shot_column_offset;
        }
        obj.shot_column_offset = column_offset;
    }
}

game.handleSquigglyShot = function(obj) {

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
