"use strict"

const DEVTOOLS          = 1;
const XRICK             = 2;
const INIT_GAME         = 3;
const INIT_BUFFER       = 4;
const INTRO_MAIN        = 5;
const INTRO_MAP         = 6;
const PAUSE_PRESSED1    = 7;
const PAUSE_PRESSED1B   = 8;
const PAUSED            = 9;
const PAUSE_PRESSED2    = 10;
const PLAY0             = 11;
const PLAY1             = 12;
const PLAY2             = 13;
const PLAY3             = 14;
const CHAIN_SUBMAP      = 15;
const CHAIN_MAP         = 16;
const CHAIN_END         = 17;
const SCROLL_UP         = 18;
const SCROLL_DOWN       = 19;
const RESTART           = 20;
const GAMEOVER          = 21;
const GETNAME           = 22;
const EXIT              = 23;

const SCREEN_TIMEOUT = 4000;
const SCREEN_RUNNING = 0;
const SCREEN_DONE = 1;
const SCREEN_EXIT = 2;

const game_hscores = [
    { score:8000, name:"SIMES@@@@@" },
    { score:7000, name:"JAYNE@@@@@" },
    { score:6000, name:"DANGERSTU@" },
    { score:5000, name:"KEN@@@@@@@" },
    { score:4000, name:"ROB@N@BOB@" },
    { score:3000, name:"TELLY@@@@@" },
    { score:2000, name:"NOBBY@@@@@" },
    { score:1000, name:"JEZEBEL@@@" }
];

const LEFT = 1;
const RIGHT = 0;

const game_context = {
    game_lives: 0,
    game_bombs: 0,
    game_bullets: 0,
    game_score: 9999,

    game_map: 0,
    game_submap: 0,

    game_dir: 0,
    game_chsm: false,

    game_cheat1: false,
    game_cheat2: false,
    game_cheat3: false,
};

const game = {
    frames: 0,
    game_period: 20,
    game_state: INIT_GAME,
    game_waitevt: false,
    isave_frow: 0,

    sysarg_args_map: 0,
    sysarg_args_submap: 0,
};

game.onload = function() {
    framebuffer.init(document.querySelector('canvas'));
    this.msPrev = window.performance.now();
    window.requestAnimationFrame(() => this.run());

    const timer_enabled = false;
    this.timerId = timer_enabled
        ? setInterval((g) => { console.log(g.frames) }, 1000, this)
        : 0;
};

game.update_game_period = function(period) {
    this.game_period = period;
    this.msPrev = window.performance.now();
};

game.run = function() {
    if (this.game_state == EXIT) {
        console.log("game stop!");
        clearInterval(this.timerId);
        return;
    }
    window.requestAnimationFrame(() => this.run());
    const msNow = window.performance.now();
    const msPassed = msNow - this.msPrev;
    if (msPassed < this.game_period) return;
    const excessTime = msPassed % this.game_period;
    this.msPrev = msNow - excessTime;
    // TODO: for game_waitevt
    this.do_frame();
    framebuffer.updateCanvas();
    this.frames++;
};

game.do_frame = function() {
    while (true) {
        switch (this.game_state) {
        case DEVTOOLS:
            switch (devtools.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_state = INIT_GAME;
                break;
            case SCREEN_EXIT:
                this.game_state = EXIT;
                return;
            }
            break;

        case XRICK:
            switch (screen_xrick.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_state = DEVTOOLS;
                break;
            case SCREEN_EXIT:
                this.game_state = EXIT;
                return;
            }
            break;

        case INIT_GAME:
            this.init();
            this.game_state = INIT_BUFFER;
            break;

       case INTRO_MAIN:
            switch (screen_introMain.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_state = INTRO_MAP;
                break;
            case SCREEN_EXIT:
                this.game_state = EXIT;
                return;
            }
            break;

        case INTRO_MAP:
            switch (screen_introMap.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_waitevt = false;
                this.game_state = INIT_BUFFER;
                break;
           case SCREEN_EXIT:
                this.game_state = EXIT;
                return;
           }
           break;

        case INIT_BUFFER:
            framebuffer.clear();
            draw_map();                     /* draw the map onto the buffer */
            draw_drawStatus();              /* draw the status bar onto the buffer */
            draw_infos();                   /* draw the info bar onto the buffer */
            this.game_state = PLAY0;
            return;

        case PAUSE_PRESSED1:
            // show the screen pause text
            screen_pause(true);
            this.game_state = PAUSE_PRESSED1B;
            break;

        case PAUSE_PRESSED1B:
            // wait the release of the key PAUSE
            if (control.control_status & CONTROL_PAUSE)
                return;
            this.game_state = PAUSED;
            break;

        case PAUSED:
            // wait the press of the key PAUSE to resume the game
            if (control.control_status & CONTROL_PAUSE)
                this.game_state = PAUSE_PRESSED2;
            if (control.control_status & CONTROL_EXIT)
                this.game_state = EXIT;
            return;

        case PAUSE_PRESSED2:
            // wait the release of the key PAUSE to resume the game
			if (!(control.control_status & CONTROL_PAUSE)) {
				this.game_waitevt = false;
				screen_pause(false);
				//syssnd_pause(FALSE, FALSE);
				this.game_state = PLAY2;
			}
		    return;

        case PLAY0:
            this.play0();
            break;

        case PLAY1:
            if (control.control_status & CONTROL_PAUSE) {
                //syssnd_pause(TRUE, FALSE);
                this.game_waitevt = true;
                this.game_state = PAUSE_PRESSED1;
            }
            else
                this.game_state = PLAY2;
            break;

        case PLAY2:
            if (E_RICK_STTST(E_RICK_STDEAD)) {  /* rick is dead */
                if (game_context.game_cheat1 || --game_context.game_lives) {
                    this.game_state = RESTART;
                } else {
                    this.game_state = GAMEOVER;
                }
            }
            else if (game_context.game_chsm)  /* request to chain to next submap */
                this.game_state = CHAIN_SUBMAP;
            else
                this.game_state = PLAY3;
            break;

        case PLAY3:
            this.play3();
            return;

        case CHAIN_SUBMAP:
            if (map_chain())
                this.game_state = CHAIN_END;
            else {
                game_context.game_bullets = 0x06;
                game_context.game_bombs = 0x06;
                game_context.game_map++; // next map
          
                if (game_context.game_map == 0x04) {
                    /* reached end of game */
                    /* FIXME @292?*/
                }
          
                this.game_state = CHAIN_MAP;
            }
            break;
        
        case CHAIN_MAP:
            switch (screen_introMap()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                if (game_context.game_map >= 0x04) {  /* reached end of game */
                    this.sysarg_args_map = 0;
                    this.sysarg_args_submap = 0;
                    this.game_state = GAMEOVER;
                }
                else {  /* initialize game */
                    E_RICK_ENT.x = map_maps[game_context.game_map].x;
                    E_RICK_ENT.y = map_maps[game_context.game_map].y;
                    map_context.map_frow = map_maps[game_context.game_map].row;
                    game_context.game_submap = map_maps[game_context.game_map].submap;
                    this.game_state = CHAIN_END;
                }
                break;
            case SCREEN_EXIT:
                this.game_state = EXIT;
                return;
            }
            break;

        case CHAIN_END:
            map_init();                     /* initialize the map */
            this.isave();                   /* save data in case of a restart */
            ent_clprev();                   /* cleanup entities */
            draw_map();                     /* draw the map onto the buffer */
            draw_drawStatus();              /* draw the status bar onto the buffer */
            this.game_state = PLAY3;
            return;

        case SCROLL_UP:
            switch (scroll_up()) {
            case SCROLL_RUNNING:
                return;
            case SCROLL_DONE:
                this.game_state = PLAY0;
                break;
            }
            break;
          
        case SCROLL_DOWN:
            switch (scroll_down()) {
            case SCROLL_RUNNING:
                return;
            case SCROLL_DONE:
                this.game_state = PLAY0;
                break;
            }
            break;

        case RESTART:
            this.restart();
            this.game_state = PLAY0;
            return;

        case GAMEOVER:
            switch (screen_gameover.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_state = GETNAME;
                break;
            case SCREEN_EXIT:
                this.game_state = EXIT;
                break;
            }
            break;

        case GETNAME:
            switch (screen_getname.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_state = INIT_GAME;
                return;
            case SCREEN_EXIT:
                this.game_state = EXIT;
                break;
            }
            break;

        case EXIT:
           return;

        default: // unknown game state
            console.log("unknown game state %d", this.game_state);
            // bail out
            this.game_state = EXIT;
            return;
        }
    }
};

game.init = function() {
    // reset the status of Rick
    E_RICK_STRST(0xff);

    // initialize the game information
    game_context.game_lives = 6;
    game_context.game_bombs = 6;
    game_context.game_bullets = 6;
    game_context.game_score = 0;

    this.sysarg_args_map = 0;
    this.sysarg_args_submap = 0;

    // initialize
    //  game_context.game_map
    //  game_context.game_submap
    //  map_context.ma_frow
    game_context.game_map = this.sysarg_args_map;

    if (this.sysarg_args_submap == 0) {
        game_context.game_submap = map_maps[game_context.game_map].submap;
        map_context.map_frow = map_maps[game_context.game_map].row;
    }
    else {
        /* dirty hack to determine frow */
        game_context.game_submap = this.sysarg_args_submap;
        let i = 0;
        while (i < MAP_NBR_CONNECT &&
           (map_connect[i].submap != game_context.game_submap ||
            map_connect[i].dir != RIGHT))
          i++;
        map_connect.map_frow = map_connect[i].rowin - 0x10;
        E_RICK_ENT.y = 0x10 << 3;
    }

    // initialize the entity Rick
    E_RICK_ENT.x = map_maps[game_context.game_map].x;
    E_RICK_ENT.y = map_maps[game_context.game_map].y;
    E_RICK_ENT.w = 0x18;
    E_RICK_ENT.h = 0x15;
    E_RICK_ENT.n = 0x01;
    E_RICK_ENT.sprite = 0x01;
    E_RICK_ENT.front = false;
    ent_ents[ENT_ENTSNUM].n = 0xFF;

    // re-activates all entities
    map_resetMarks();

    // prepare the map
    map_init();
    this.isave();
};

game.isave = function() {
    e_rick_save();
    this.isave_frow = map_context.map_frow;
};

game.irestore = function() {
    e_rick_restore();
    map_context.map_frow = this.isave_frow;
};

game.play0 = function() {
    if (control.control_status & CONTROL_END) {  /* request to end the game */
        this.game_state = GAMEOVER;
        return;
    }

    if (control.control_last == CONTROL_EXIT) {  /* request to exit the game */
        this.game_state = EXIT;
        return;
    }

    ent_action();      /* run entities */
    e_them_context.e_them_rndseed++;

    this.game_state = PLAY1;
};

game.play3 = function() {
    draw_clearStatus();  /* clear the status bar */
    ent_draw();          /* draw all entities onto the buffer */
    /* sound */
    draw_drawStatus();   /* draw the status bar onto the buffer*/

    if (!E_RICK_STTST(E_RICK_STZOMBIE)) {  /* need to scroll ? */
        if (E_RICK_ENT.y >= 0xCC) {
            this.game_state = SCROLL_UP;
            return;
        }
        if (E_RICK_ENT.y <= 0x60) {
            this.game_state = SCROLL_DOWN;
            return;
        }
    }

    this.game_state = PLAY0;
};

game.restart = function() {
    E_RICK_STRST(E_RICK_STDEAD|E_RICK_STZOMBIE);

    game_context.game_bullets = 6;
    game_context.game_bombs = 6;
  
    E_RICK_ENT.n = 1;
  
    this.irestore();
    map_init();
    this.isave();
    ent_clprev();
    draw_map();
    draw_drawStatus();
};

window.onload = () => game.onload();
