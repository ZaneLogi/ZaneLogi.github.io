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

const GAME_PERIOD = 75;

const GAME_BOMBS_INIT = 6;
const GAME_BULLETS_INIT = 6;

const game_context = {
    game_lives: 0,
    game_bombs: 0,
    game_bullets: 0,
    game_score: 9999,

    game_map: 0,
    game_submap: 0,

    game_dir: 0,
    game_chsm: false,

    game_cheat1: false, // infinite lives, bullets, bombs
    game_cheat2: false, // invincible
    game_cheat3: false, // draw entities with their rectangles

    sound_muted: true, // muted in the beginning
    sound_volume: 1, // 0: silent, 1: highest volume
};

const game = {
    frames: 0,
    game_period: 40, //GAME_PERIOD,
    game_state: DEVTOOLS,
    game_waitevt: false,
    isave_frow: 0,

    sysarg_args_map: 0,
    sysarg_args_submap: 0,

    cheat1_pressed: false,
    cheat2_pressed: false,
    cheat3_pressed: false,

    toggle_mute_pressed: false,
};

game.onload = function() {
    this.load_audio_data();

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
    this.frames = 0;
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

    this.handle_cheat1();
    this.handle_cheat2();
    this.handle_cheat3();

    this.handle_toggle_mute();
    this.handle_volume_down();
    this.handle_volume_up();

    framebuffer.updateCanvas();
    this.frames++;
};

game.handle_cheat1 = function() {
    if (this.cheat1_pressed) {
        if (!(control.control_status & CONTROL_CHEAT1))
            this.cheat1_pressed = false;
    }
    else if (control.control_status & CONTROL_CHEAT1) {
        this.cheat1_pressed = true;
        game_context.game_cheat1 = !game_context.game_cheat1;
        draw_infos();
    }
}

game.handle_cheat2 = function() {
    if (this.cheat2_pressed) {
        if (!(control.control_status & CONTROL_CHEAT2))
            this.cheat2_pressed = false;
    }
    else if (control.control_status & CONTROL_CHEAT2) {
        this.cheat2_pressed = true;
        game_context.game_cheat2 = !game_context.game_cheat2;
        draw_infos();
    }
}

game.handle_cheat3 = function() {
    if (this.cheat3_pressed) {
        if (!(control.control_status & CONTROL_CHEAT3))
            this.cheat3_pressed = false;
    }
    else if (control.control_status & CONTROL_CHEAT3) {
        this.cheat3_pressed = true;
        game_context.game_cheat3 = !game_context.game_cheat3;
        draw_infos();
    }
}

game.handle_toggle_mute = function() {
    if (this.toggle_mute_pressed) {
        if (!(control.control_status & CONTROL_TOGGLE_MUTE))
            this.toggle_mute_pressed = false;
    }
    else if (control.control_status & CONTROL_TOGGLE_MUTE) {
        this.toggle_mute_pressed = true;
        this.toggle_mute();
        draw_infos();
    }
}

game.handle_volume_down = function() {
    if (control.control_status & CONTROL_VOLUME_DOWN)
        this.set_volume(-0.1);
}

game.handle_volume_up = function() {
    if (control.control_status & CONTROL_VOLUME_UP)
        this.set_volume(0.1);
}

game.do_frame = function() {
    while (true) {
        switch (this.game_state) {
        case DEVTOOLS:
            switch (devtools.do_frame()) {
            case SCREEN_RUNNING:
                return;
            case SCREEN_DONE:
                this.game_state = XRICK;
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
                this.game_state = INIT_GAME;
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
            // handle the actions of entities
            this.play0();
            break;

        case PLAY1:
            // handle the screen PAUSE
            if (control.control_status & CONTROL_PAUSE) {
                //syssnd_pause(TRUE, FALSE);
                this.game_waitevt = true;
                this.game_state = PAUSE_PRESSED1;
            }
            else
                this.game_state = PLAY2;
            break;

        case PLAY2:
            // handle the dead of Rick and the map chaining
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
            // handle to draw the screen including entitis, status
            // check the map scrolling up or down
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
            switch (screen_introMap.do_frame()) {
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

    // initialize the entity Rick
    E_RICK_ENT.x = map_maps[game_context.game_map].x;
    E_RICK_ENT.y = map_maps[game_context.game_map].y;
    E_RICK_ENT.w = 0x18;
    E_RICK_ENT.h = 0x15;
    E_RICK_ENT.n = 0x01;
    E_RICK_ENT.sprite = 0x01;
    E_RICK_ENT.front = false;
    ent_ents[ENT_ENTSNUM].n = 0xFF;

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
        map_context.map_frow = map_connect[i].rowin - 0x10;
        E_RICK_ENT.y = 0x10 << 3;
    }

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

game.load_audio_data = function() {
    this.WAV_SBONUS2 = new Audio("sounds/sbonus2.wav");
    this.WAV_BULLET = new Audio("sounds/bullet.wav");
    this.WAV_BOMBSHHT = new Audio("sounds/bombshht.wav");
    this.WAV_EXPLODE = new Audio("sounds/explode.wav");
    this.WAV_STICK = new Audio("sounds/stick.wav");
    this.WAV_WALK = new Audio("sounds/walk.wav");
    this.WAV_CRAWL = new Audio("sounds/crawl.wav");
    this.WAV_JUMP = new Audio("sounds/jump.wav");
    this.WAV_PAD = new Audio("sounds/pad.wav");
    this.WAV_BOX = new Audio("sounds/box.wav");
    this.WAV_BONUS = new Audio("sounds/bonus.wav");
    this.WAV_SBONUS1 = new Audio("sounds/sbonus1.wav");
    this.WAV_DIE = new Audio("sounds/die.wav");
    this.WAV_ENTITY = [];
    this.WAV_ENTITY[0] = new Audio("sounds/ent0.wav");
    this.WAV_ENTITY[1] = new Audio("sounds/ent1.wav");
    this.WAV_ENTITY[2] = new Audio("sounds/ent2.wav");
    this.WAV_ENTITY[3] = new Audio("sounds/ent3.wav");
    this.WAV_ENTITY[4] = new Audio("sounds/ent4.wav");
    this.WAV_ENTITY[5] = new Audio("sounds/ent5.wav");
    this.WAV_ENTITY[6] = new Audio("sounds/ent6.wav");
    this.WAV_ENTITY[7] = new Audio("sounds/ent7.wav");
    this.WAV_ENTITY[8] = new Audio("sounds/ent8.wav");

    this.sounds = [
        this.WAV_SBONUS2, this.WAV_BULLET, this.WAV_BOMBSHHT, this.WAV_EXPLODE,
        this.WAV_STICK, this.WAV_WALK, this.WAV_CRAWL, this.WAV_JUMP, this.WAV_PAD,
        this.WAV_BOX, this.WAV_BONUS, this.WAV_SBONUS1, this.WAV_DIE,
        ...this.WAV_ENTITY
    ];
}

game.playsound = function(snd, loop) {
    snd.pause();
    snd.currentTime = 0;
    snd.muted = game_context.sound_muted;
    snd.volume = game_context.sound_volume;
    snd.play();
}

game.setmusic = function(name, loop) {
    if (this.music_snd) {
        this.stopmusic();
    }

    this.music_snd = new Audio();
    this.music_snd.addEventListener("canplay", () => this.music_snd.play());
    this.music_snd.addEventListener("ended",
        () => {
            if (loop < 0 || --loop > 0) {
                this.music_snd.currentTime = 0;
                this.music_snd.play();
            }
        });
    this.music_snd.muted = game_context.sound_muted;
    this.music_snd.volume = game_context.sound_volume;
    this.music_snd.src = name;
}

game.stopmusic = function() {
    // stop this.music_snd
    if (this.music_snd) {
        this.music_snd.pause();
        this.music_snd = null;
    }
}

game.toggle_mute = function() {
    game_context.sound_muted = !game_context.sound_muted;
    if (this.music_snd)
        this.music_snd.muted = game_context.sound_muted;

    for (const snd of this.sounds) {
        snd.muted = game_context.sound_muted;
    }
}

game.set_volume = function(delta) {
    let value = game_context.sound_volume + delta;
    if (value < 0) value = 0;
    else if (value > 1) value = 1;

    if (value == game_context.sound_volume)
        return;
    
    game_context.sound_volume = value;

    if (this.music_snd)
        this.music_snd.volume = game_context.sound_volume;

    for (const snd of this.sounds) {
        snd.volume = game_context.sound_volume;
    }
} 

window.onload = () => game.onload();
