"use strict"

const screen_xrick = new function() {
    this.seq = 0;
    this.wait = 0;

    this.do_frame = function() {
        if (this.seq == 0) {
            framebuffer.clear();
            draw_img(IMG_SPLASH);
            this.seq = 1;
        }

        switch (this.seq) {
            case 1: // wait
                if (this.wait++ > 0x2) {
                    // TODO:
                    //game_setmusic("sounds/bullet.wav", 1);
                    this.seq = 2;
                    this.wait = 0;
                }
                break;
            
            case 2: // wait
                if (this.wait++ > 0x20) {
                    this.seq = 99;
                    this.wait = 0;

                }
        }

        if (control.control_status & CONTROL_EXIT)  /* check for exit request */
        	return SCREEN_EXIT;

	    if (this.seq == 99 || control.control_status & CONTROL_FIRE) {  /* we're done */
		    framebuffer.clear();
		    this.seq = 0;
		    return SCREEN_DONE;
	    }

	    return SCREEN_RUNNING;
    };
};
