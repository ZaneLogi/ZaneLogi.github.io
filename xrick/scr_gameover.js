"use strict"

const screen_gameover = {
    seq: 0,
    period: 0,
    tm: 0,
};

screen_gameover.do_frame = function() {
    if (this.seq == 0) {
        draw_context.draw_tilesBank = 0;
        this.seq = 1;
        this.period = game.game_period; /* save period, */
        game.update_game_period(50);     /* and use our own */

        game.setmusic("sounds/gameover.wav", 1);
    }

    switch (this.seq) {
    case 1:  /* display banner */
        framebuffer.clear();
        this.tm = Date.now();

        draw_context.draw_tllst = screen_gameovertxt;
        draw_context.draw_tllst_index = 0;
        draw_setfb(120, 80);

        draw_tilesList();

        this.seq = 2;
        break;

    case 2:  /* wait for key pressed */
        if (control.control_status & CONTROL_FIRE)
            this.seq = 3;
        else if (Date.now() - this.tm > SCREEN_TIMEOUT)
            this.seq = 4;
        break;

    case 3:  /* wait for key released */
        if (!(control.control_status & CONTROL_FIRE))
            this.seq = 4;
        break;
    }

    if (control.control_status & CONTROL_EXIT)  /* check for exit request */
        return SCREEN_EXIT;

    if (this.seq == 4) {  /* we're done */
        framebuffer.clear();
        this.seq = 0;
        game.update_game_period(this.game_period);
        return SCREEN_DONE;
    }

    return SCREEN_RUNNING;
};
