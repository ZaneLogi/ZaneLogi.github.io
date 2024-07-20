"use strict"

const screen_getname = {
    seq: 0,
    name: Array(10),
}

const TILE_POINTER      = 0x3A;
const TILE_CURSOR       = 0x3B;
const TOPLEFT_X         = 116;
const TOPLEFT_Y         = 64;
const NAMEPOS_X         = 120;
const NAMEPOS_Y         = 160;
const AUTOREPEAT_TMOUT  = 100;

screen_getname.do_frame = function() {
    if (this.seq == 0) {
        /* figure out if this is a high score */
        if (game_context.game_score < game_hscores[7].score)
            return SCREEN_DONE;

        /* prepare */
        draw_context.draw_tilesBank = 0;
        this.name.fill('@'.charCodeAt(0))
        this.x = 0; // the index of x axis
        this.y = 0; // ths index of y axis
        this.p = 0; // ths index of the name
        this.seq = 1;
    }

    switch (this.seq) {
    case 1:  /* prepare screen */
        framebuffer.clear();
        draw_setfb(76, 40);
        draw_tilesListImm("PLEASE@ENTER@YOUR@NAME\xFE");
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 4; j++) {
                draw_setfb(TOPLEFT_X + i * 8 * 2, TOPLEFT_Y + j * 8 * 2);
                draw_tile('A'.charCodeAt(0) + i + j * 6);
            }
        draw_setfb(TOPLEFT_X, TOPLEFT_Y + 64);
        // draw 'Y', 'Z', '.', ' ', back, 'end'
        draw_tilesListImm("Y@Z@.@@@\x3C\xFB\xFC\xFD\xFE");
        this.name_draw();
        this.pointer_show(true);
        this.seq = 2;
        break;

    case 2:  /* wait for key pressed */
        if (control.control_status & CONTROL_FIRE)
            this.seq = 3;
        if (control.control_status & CONTROL_UP) {
            if (this.y > 0) {
                this.pointer_show(false);
                this.y--;
                this.pointer_show(true);
                this.tm = Date.now();
            }
            this.seq = 4;
        }
        if (control.control_status & CONTROL_DOWN) {
            if (this.y < 4) {
                this.pointer_show(false);
                this.y++;
                this.pointer_show(true);
                this.tm = Date.now();
            }
            this.seq = 5;
        }
        if (control.control_status & CONTROL_LEFT) {
            if (this.x > 0) {
                this.pointer_show(false);
                this.x--;
                this.pointer_show(true);
                this.tm = Date.now();
            }
            this.seq = 6;
        }
        if (control.control_status & CONTROL_RIGHT) {
            if (this.x < 5) {
                this.pointer_show(false);
                this.x++;
                this.pointer_show(true);
                this.tm = Date.now();
            }
            this.seq = 7;
        }
        //if (this.seq == 2)
        //    sys_sleep(50);
        break;

    case 3:  /* wait for FIRE released */
        if (!(control.control_status & CONTROL_FIRE)) {
            if (this.x == 5 && this.y == 4) {  /* end */
                let i = 0; // the index of the insertion
                while (game_context.game_score < game_hscores[i].score)
                    i++;
                let j = 7;
                while (j > i) {
                    game_hscores[j].score = game_hscores[j - 1].score;
                    game_hscores[j].name = game_hscores[j - 1].name;
                    j--;
                }
                game_hscores[i].score = game_context.game_score;
                game_hscores[i].name = String.fromCharCode(...this.name.slice(0, this.p));
                this.seq = 99;
            }
            else {
                this.name_update();
                this.name_draw();
                this.seq = 2;
            }
        }
        //else
        //  sys_sleep(50);
        break;

    case 4:  /* wait for UP released */
        if (!(control.control_status & CONTROL_UP) ||
            Date.now() - this.tm > AUTOREPEAT_TMOUT)
            this.seq = 2;
        //else
        //    sys_sleep(50);
        break;

    case 5:  /* wait for DOWN released */
        if (!(control.control_status & CONTROL_DOWN) ||
            Date.now() - this.tm > AUTOREPEAT_TMOUT)
            this.seq = 2;
        //else
        //    sys_sleep(50);
        break;

    case 6:  /* wait for LEFT released */
        if (!(control.control_status & CONTROL_LEFT) ||
            Date.now() - this.tm > AUTOREPEAT_TMOUT)
            this.seq = 2;
        //else
        //    sys_sleep(50);
        break;

    case 7:  /* wait for RIGHT released */
        if (!(control.control_status & CONTROL_RIGHT) ||
            Date.now() - this.tm > AUTOREPEAT_TMOUT)
            this.seq = 2;
        //else
        //    sys_sleep(50);
        break;
    }

    if (control.control_status & CONTROL_EXIT)  /* check for exit request */
        return SCREEN_EXIT;

    if (this.seq == 99) {  /* seq 99, we're done */
        framebuffer.clear();
        this.seq = 0;
        return SCREEN_DONE;
    }
    else
        return SCREEN_RUNNING;
};

screen_getname.name_draw = function() {
    draw_setfb(NAMEPOS_X, NAMEPOS_Y);
    // draw the character of the name from 0 to this.p - 1
    for (let i = 0; i < this.p; i++)
        draw_tile(this.name[i]);
    // draw the tile cursor from this.p to 10
    for (let i = this.p; i < 10; i++)
        draw_tile(TILE_CURSOR);

    // clear the spaces for the tile pointer
    draw_setfb(NAMEPOS_X, NAMEPOS_Y + 8);
    for (let i = 0; i < 10; i++)
        draw_tile('@'.charCodeAt(0));
    // draw the tile pointer to indicate the position of the user input
    draw_setfb(NAMEPOS_X + 8 * (this.p < 9 ? this.p : 9), NAMEPOS_Y + 8);
    draw_tile(TILE_POINTER);
};

screen_getname.name_update = function() {
    let i = this.x + this.y * 6; // the position of the user selection
    if (i < 26 && this.p < 10) // add the character if not exceed 10 ones
        this.name[this.p++] = 'A'.charCodeAt(0) + i;
    if (i == 26 && this.p < 10) // add '.' if not exceed 10 characters
        this.name[this.p++] = '.'.charCodeAt(0);
    if (i == 27 && this.p < 10) // add a space if not exceed 10 characters
        this.name[this.p++] = '@'.charCodeAt(0);
    if (i == 28 && this.p > 0) { // remove one character if more than zero
        this.p--;
    }
}

screen_getname.pointer_show = function(show) {
    draw_setfb(TOPLEFT_X + this.x * 8 * 2, TOPLEFT_Y + this.y * 8 * 2 + 8);
    draw_tile(show ? TILE_POINTER : '@'.charCodeAt(0));
};

