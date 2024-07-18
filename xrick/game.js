"use strict"

const DEVTOOLS      = 1;
const XRICK         = 2;
const INIT_GAME     = 3;
const INTRO_MAIN    = 5;
const INTRO_MAP     = 6;
const EXIT          = 23;
/*    , INIT_BUFFER:4,
    
    PAUSE_PRESSED1:7, PAUSE_PRESSED1B:8, PAUSED:9, PAUSE_PRESSED2:10,
    PLAY0:11, PLAY1:12, PLAY2:13, PLAY3:14,
    CHAIN_SUBMAP:15, CHAIN_MAP:16, CHAIN_END:17,
    SCROLL_UP:18, SCROLL_DOWN:19,
    RESTART:20, GAMEOVER:21, GETNAME:22, 
*/
const SCREEN_TIMEOUT = 4000;
const SCREEN_RUNNING = 0;
const SCREEN_DONE = 1;
const SCREEN_EXIT = 2;

const game_hscores = [
    [ 8000, "SIMES@@@@@" ],
    [ 7000, "JAYNE@@@@@" ],
    [ 6000, "DANGERSTU@" ],
    [ 5000, "KEN@@@@@@@" ],
    [ 4000, "ROB@N@BOB@" ],
    [ 3000, "TELLY@@@@@" ],
    [ 2000, "NOBBY@@@@@" ],
    [ 1000, "JEZEBEL@@@" ]
];

const game = new function() {

    this.onload = function() {
        framebuffer.init(document.querySelector('canvas'));

        this.msPrev = window.performance.now();

        this.frames = 0;
        this.game_period = 75;
        this.game_state = XRICK;

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

        this.frame();

        framebuffer.updateCanvas();

        this.frames++;
    };

    this.frame = function() {
        while (true) {
            switch (this.game_state) {
            case DEVTOOLS:
                switch (devtools.run()) {
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
                switch (screen_xrick.run()) {
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
                switch (screen_introMain.run()) {
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
        this.game_lives = 6;
        this.game_bombs = 6;
        this.game_bullets = 6;
        this.game_score = 0;
    };
}

window.onload = () => game.onload();
