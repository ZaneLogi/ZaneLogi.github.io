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

const game_context = {
    game_lives: 0,
    game_bombs: 0,
    game_bullets: 0,
    game_score: 9999,

    game_map: 0,
    game_submap: 0,

    game_dir: 0,
    game_chsm: false,

    game_cheat1: 0,
    game_cheat2: 0,
    game_cheat3: 0,
};

const game = new function() {

    this.onload = function() {
        framebuffer.init(document.querySelector('canvas'));

        this.msPrev = window.performance.now();

        this.frames = 0;
        this.game_period = 75;
        this.game_state = GETNAME;
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
                    this.game_state = GAMEOVER;
                    break;
                case SCREEN_EXIT:
                    this.game_state = EXIT;
                    return;
                }
                break;





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
        // TODO
        game_context.game_lives = 6;
        game_context.game_bombs = 6;
        game_context.game_bullets = 6;
        game_context.game_score = 9990;
    };
}

window.onload = () => game.onload();
