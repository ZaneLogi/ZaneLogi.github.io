"use strict"

const screen_introMain = new function() {
    this.seq = 0;
    this.seen = 0;
    this.first = true;
    this.period = 0;
    this.tm = 0;

    this.run = function() {
        if (this.seq == 0) {
            draw_context.draw_tilesBank = 0;
            if (this.first) this.seq = 1;
            else            this.seq = 4;
            this.period = game.game_period;
            game.set_game_period(50);
            // game_setmusic("sounds/tune5.wav", -1);
        }

        switch (this.seq) {
        case 1: /* display Rick Dangerous title and Core Design copyright */
            framebuffer.clear();
            this.tm = Date.now();
            draw_pic(0, 0, 0x140, 0xc8, pic_splash);
            this.seq = 2;
            break;

        case 2:  /* wait for key pressed or timeout */
            if (control.control_status & CONTROL_FIRE)
                this.seq = 3;
            else if (Date.now() - this.tm > SCREEN_TIMEOUT) {
                this.seen++;
                this.seq = 4;
            }
            break;

        case 3:  /* wait for key released */
            if (!(control.control_status & CONTROL_FIRE)) {
                if (this.seen++ == 0)
                    this.seq = 4;
                else
                    this.seq = 7;
            }
            break;

        case 4:  /* dispay hall of fame */
            framebuffer.clear();
            this.tm = Date.now();
        
            /* hall of fame title */
            draw_pic(0, 0, 0x140, 0x20, pic_haf);

            /* hall of fame content */
            draw_setfb(56, 40);

            for (let i = 0; i < 8; i++) {
                /*sprintf((char *)s, "%06d@@@....@@@%s",
                  game_hscores[i].score, game_hscores[i].name);
                  s[26] = '\377'; s[27] = '\377'; s[28] = '\376';*/
                let s1 = game_hscores[i].score.toString();
                let s2 = game_hscores[i].name;
                let s0 = (s1.length < 6) ? "0".repeat(6-s1.length) : "";
                let s = s0 + s1 + "@@@....@@@" + s2 + "\xFF\xFF\xFE"; 
              
                draw_context.draw_tllst = s;
                draw_tilesList();
            }
        
            this.seq = 5;
            break;

        case 5:  /* wait for key pressed or timeout */
            if (control.control_status & CONTROL_FIRE)
                this.seq = 6;
            else if (Date.now() - this.tm > SCREEN_TIMEOUT) {
                this.seen++;
                this.seq = 1;
            }
            break;
        
          case 6:  /* wait for key released */
            if (!(control.control_status & CONTROL_FIRE)) {
                if (this.seen++ == 0)
                    this.seq = 1;
                else
                    this.seq = 7;
            }
            break;
        }

        if (control.control_status & CONTROL_EXIT)  /* check for exit request */
            return SCREEN_EXIT;

        if (this.seq == 7) {  /* we're done */
            framebuffer.clear();
            this.seq = 0;
            this.seen = 0;
            this.first = false;
            game.set_game_period(this.period);
            return SCREEN_DONE;
        }
        else
            return SCREEN_RUNNING;
    };
};
