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

const game = new function() {

    this.onload = function() {
        framebuffer.init(document.querySelector('canvas'));

        this.msPrev = window.performance.now();

        this.frames = 0;
        this.game_period = 75;
        this.game_state = INIT_GAME;
        this.game_waitevt = false;

        window.requestAnimationFrame(() => this.run());

        this.timerId = setInterval((g) => {
            console.log(g.frames)
            }, 1000, this);
    };

    this.set_game_period = function(period) {
        this.game_period = period;
        this.msPrev = window.performance.now();
    }

    this.run = function() {
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
        this.frame();

        framebuffer.updateCanvas();

        this.frames++;
    };

    this.frame = function() {
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
                this.game_state = INTRO_MAIN;
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

    this.init = function() {
        // E_RICK_STRST(0xff);

        game_context.game_lives = 6;
        game_context.game_bombs = 6;
        game_context.game_bullets = 6;
        game_context.game_score = 0;

        const sysarg_args_map = 0;
        const sysarg_args_submap = 0;

        game_context.game_map = sysarg_args_map;

        if (sysarg_args_submap == 0) {
            game_context.game_submap = map_maps[game_context.game_map].submap;
            map_context.map_frow = map_maps[game_context.game_map].row;
        }
        else {
            /* dirty hack to determine frow */
            game_context.game_submap = sysarg_args_submap;
            let i = 0;
            while (i < MAP_NBR_CONNECT &&
               (map_connect[i].submap != game_context.game_submap ||
                map_connect[i].dir != RIGHT))
              i++;
            map_connect.map_frow = map_connect[i].rowin - 0x10;
            //ent_ents[1].y = 0x10 << 3;
        }

        /*ent_ents[1].x = map_maps[game_map].x;
        ent_ents[1].y = map_maps[game_map].y;
        ent_ents[1].w = 0x18;
        ent_ents[1].h = 0x15;
        ent_ents[1].n = 0x01;
        ent_ents[1].sprite = 0x01;
        ent_ents[1].front = FALSE;
        ent_ents[ENT_ENTSNUM].n = 0xFF;
        */
        map_resetMarks();

        map_init();
        /*
        isave();
        */
    };
}

window.onload = () => game.onload();
