"use strict"

const SCREEN_WIDTH = 224;
const SCREEN_HEIGHT = 288;

const SCREEN_TILE_WIDTH = 28;
const SCREEN_TILE_HEIGHT = 36;

const FREEZETYPE_PRELUDE   = (1<<0);  // game prelude is active (with the game start tune playing)
const FREEZETYPE_READY     = (1<<1);  // READY! phase is active (at start of a new game round)
const FREEZETYPE_EAT_GHOST = (1<<2);  // Pacman has eaten a ghost
const FREEZETYPE_DEAD      = (1<<3);  // Pacman was eaten by a ghost
const FREEZETYPE_WON       = (1<<4);  // game round was won by eating all dots

const screen_map =
[
//             1         2
//   0123456789012345678901234567
    "                            ",
    "                            ",
    "                            ",
    "+------------++------------+", // 3
    "|oooooooooooo||oooooooooooo|",
    "|o+--+o+---+o||o+---+o+--+o|",
    "|O|  |o|   |o||o|   |o|  |O|",
    "|o+--+o+---+o++o+---+o+--+o|", // 7
    "|oooooooooooooooooooooooooo|",
    "|o+--+o++o+------+o++o+--+o|",
    "|o+--+o||o+--++--+o||o+--+o|",
    "|oooooo||oooo||oooo||oooooo|", // 11
    "+----+o|+--+ || +--+|o+----+",
    "     |o|+--+ ++ +--+|o|     ",
    "     |o||          ||o|     ",
    "     |o|| +--==--+ ||o|     ", // 15
    "-----+o++ |      | ++o+-----",
    "      o   |      |   o      ",
    "-----+o++ |      | ++o+-----",
    "     |o|| +------+ ||o|     ", // 19
    "     |o||          ||o|     ",
    "     |o|| +------+ ||o|     ",
    "+----+o++ +--++--+ ++o+----+",
    "|oooooooooooo||oooooooooooo|", // 23
    "|o+--+o+---+o||o+---+o+--+o|",
    "|o+-+|o+---+o++o+---+o|+-+o|",
    "|Ooo||ooooooo  ooooooo||ooO|",
    "+-+o||o++o+------+o++o||o+-+", // 27
    "+-+o++o||o+--++--+o||o++o+-+",
    "|oooooo||oooo||oooo||oooooo|",
    "|o+----++--+o||o+--++----+o|",
    "|o+--------+o++o+--------+o|", // 31
    "|oooooooooooooooooooooooooo|",
    "+--------------------------+",
    "                            ",
    "                            "
];

const game_map = Array.from({ length: SCREEN_TILE_HEIGHT }, () => new Array(SCREEN_TILE_WIDTH).fill(0));

const LEFT = false;
const RIGHT = true;

const KEY_DOWN = 0;
const KEY_UP = 1;

const FRUIT = {
    NONE: 0,
    CHERRIES: 1,
    STRAWBERRY: 2,
    PEACH: 3,
    APPLE: 4,
    GRAPES: 5,
    GALAXIAN: 6,
    BELL: 7,
    KEY: 8,
    NUM_FRUITS: 9
};


const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
    key_events: [],
    firstDir: LEFT,
    keyDPressed: false,
    keyAPressed: false,
    keySpace: false,

    trig_started: new Trigger(),
    trig_ready_started: new Trigger(),
    trig_round_started: new Trigger(),

    trig_round_won: new Trigger(),
    trig_game_over: new Trigger(),
    trig_dot_eaten: new Trigger(),
    trig_pill_eaten: new Trigger(),
    trig_ghost_eaten: new Trigger(),
    trig_pacman_eaten: new Trigger(),
    trig_fruit_eaten: new Trigger(),
    trig_force_leave_house: new Trigger(),
    trig_fruit_active: new Trigger(),

    hiscore: 0,
    score: 0,
    
    ticks: 0,
    pacman: new Pacman(),
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    sys_evt.init();

    this.initMap();

    Actor.game = this;
    Trigger.game = this;

    this.ticks = 0;
    this.trig_started.start();
    gfx.init();

    runloop.start(() => this.doFrame(), 1000/60); // 60 FPS
}

game.initMap = function () {
    this.currentDots = 0;

    for (let y = 0; y < SCREEN_TILE_HEIGHT; y++) {
        for (let x = 0; x < SCREEN_TILE_WIDTH; x++) {
            const c = screen_map[y][x];
            switch (c) {
            case '+':
            case '-':
            case '|':
            case '=':
                game_map[y][x] = 0x80; // blocked
                break;
            case 'o':
                game_map[y][x] = 0x01; // small dot
                this.currentDots++;
                break;
            case 'O':
                game_map[y][x] = 0x02; // big dot
                this.currentDots++;
                break;
            default:
                game_map[y][x] = 0x00; // empty
                break;
            }
        }
    }

    this.player = new Player();
    this.ghostBlinky = new GhostBlinky();
    this.ghostPinky = new GhostPinky();
    this.ghostInky = new GhostInky();
    this.ghostClyde = new GhostClyde();

    this.player.reset();
    this.ghostBlinky.reset();
    this.ghostPinky.reset();
    this.ghostInky.reset();
    this.ghostClyde.reset();

    this.nextGhostDotCounter = this.ghostPinky;
    this.notEatDotsTimer = this.ticks();

    this.gameover = false;
}

game.doFrame = function () {
    /*
    this.player.update();
    this.updateGhosts();
    this.renderScreen();*/

    this.ticks++;
    this.processEvents();
    this.game_tick();
}

// disable all game loop timers
game.game_disable_timers = function () {
    this.trig_round_won.disable();
    this.trig_game_over.disable();
    this.trig_dot_eaten.disable();
    this.trig_pill_eaten.disable();
    this.trig_ghost_eaten.disable();
    this.trig_pacman_eaten.disable();
    this.trig_fruit_eaten.disable();
    this.trig_force_leave_house.disable();
    this.trig_fruit_active.disable();
}

// one-time init at start of game state
game.game_init = function () {
    // input_enable();
    this.game_disable_timers();

    this.freeze = FREEZETYPE_PRELUDE;
    this.num_lives = NUM_LIVES;
    this.global_dot_counter_active = false;
    this.global_dot_counter = 0;
    this.num_dots_eaten = 0;
    this.score = 0;

    // draw the playfield and PLAYER ONE READY! message
    gfx.vid_clear(TILE_SPACE, COLOR_DOT);
    gfx.vid_color_text({x:9, y:0}, COLOR_DEFAULT, "HIGH SCORE");
    gfx.init_playfield();
    gfx.vid_color_text({x:9, y:14}, 0x5, "PLAYER ONE");
    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");
}

// setup state at start of a game round
game.game_round_init = function() {
    gfx.spr_clear();

    // clear the "PLAYER ONE" text
    gfx.vid_color_text({x:9, y:14}, 0x10, "          ");

    this.active_fruit = FRUIT.NONE;
    this.xorshift = 0x12345678;   // random-number-generator seed
    this.freeze = FREEZETYPE_READY;
    this.num_ghosts_eaten = 0;
    this.game_disable_timers();

    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");

    // the force-house timer forces ghosts out of the house if Pacman isn't
    // eating dots for a while
    this.trig_force_leave_house.start();

    // Pacman starts running to the left
    this.pacman.init();
    const SPRITE_PACMAN = 0;
    const sprite = gfx.sprite[SPRITE_PACMAN];
    sprite.enabled= true;
    sprite.color = COLOR_PACMAN;
    this.input_dir = DIR.LEFT;

    // Blinky starts outside the ghost house, looking to the left, and in scatter mode

    // Pinky starts in the middle slot of the ghost house, moving down

    // Inky starts in the left slot of the ghost house moving up

    // Clyde starts in the right slot of the ghost house, moving up
}

// update dynamic background tiles
game.game_update_tiles = function() {
    // print score and hiscore
    gfx.vid_color_score(i2(6,1), COLOR_DEFAULT, this.score);
    if (this.hiscore > 0) {
        gfx.vid_color_score(i2(16,1), COLOR_DEFAULT, this.hiscore);
    }

    // update the energizer pill colors (blinking/non-blinking)
    const pill_pos = [{x:1, y:6}, {x:26, y:6}, {x:1, y:26}, {x:26, y:26}];
    for (const pos of pill_pos) {
        if (this.freeze) {
            gfx.vid_color(pos, COLOR_DOT);
        }
        else {
            gfx.vid_color(pos, (this.ticks & 0x8) ? 0x10:0);
        }
    }

    // clear the fruit-eaten score after Pacman has eaten a bonus fruit


    // remaining lives at bottom left screen


    // bonus fruit list in bottom-right corner


    // if game round was won, render the entire playfield as blinking blue/white
}

// this function takes care of updating all sprite images during gameplay
game.game_update_sprites = function() {
    const pacman = this.pacman;
    const spr = gfx.sprite[0];

    if (spr.enabled) {
        spr.pos = pacman.actor_to_sprite_pos();
        pacman.spr_anim_pacman();
    }
}

/* Update the dot counters used to decide whether ghosts must leave the house.

    This is called each time Pacman eats a dot.

    Each ghost has a dot limit which is reset at the start of a round. Each time
    Pacman eats a dot, the highest priority ghost in the ghost house counts
    down its dot counter.

    When the ghost's dot counter reaches zero the ghost leaves the house
    and the next highest-priority dot counter starts counting.

    If a life is lost, the personal dot counters are deactivated and instead
    a global dot counter is used.

    If pacman doesn't eat dots for a while, the next ghost is forced out of the
    house using a timer.
*/
game.game_update_ghosthouse_dot_counters = function() {
    // if the new round was started because Pacman lost a life, use the global
    // dot counter (this mode will be deactivated again after all ghosts left the
    // house)
    if (this.global_dot_counter_active) {
        this.global_dot_counter++;
    }
    else {
        // otherwise each ghost has his own personal dot counter to decide
        // when to leave the ghost house
        /*for (int i = 0; i < NUM_GHOSTS; i++) {
            if (state.game.ghost[i].dot_counter < state.game.ghost[i].dot_limit) {
                state.game.ghost[i].dot_counter++;
                break;
            }
        }*/
    }
}

// called when a dot or pill has been eaten, checks if a round has been won
// (all dots and pills eaten), whether to show the bonus fruit, and finally
// plays the dot-eaten sound effect
game.game_update_dots_eaten = function() {
    this.num_dots_eaten++;
    if (this.num_dots_eaten == NUM_DOTS) {
        // all dots eaten, round won
        this.trig_round_won.start();
        //snd_clear();
    }
    else if ((this.num_dots_eaten == 70) || (this.num_dots_eaten == 170)) {
        // at 70 and 170 dots, show the bonus fruit
        this.trig_fruit_active.start();
    }

    // play alternating crunch sound effect when a dot has been eaten
    if (this.num_dots_eaten & 1) {
        //snd_start(2, &snd_eatdot1);
    }
    else {
        //snd_start(2, &snd_eatdot2);
    }
}

// the central Pacman and ghost behaviour function, called once per game tick
game.game_update_actors = function() {
    if (this.freeze)
        return;

    this.pacman.update();
}

game.game_tick = function () {
    const prelude_ticks_per_sec = 10;
    const ready_start_ticks_per_sec = 10;

    // initialize game state once
    if (this.trig_started.now()) {
        this.trig_ready_started.start_after(2*prelude_ticks_per_sec);
        this.game_init();
    }

    // initialize new round (each time Pacman looses a life), make actors visible, remove "PLAYER ONE", start a new life
    if (this.trig_ready_started.now()) {
        this.game_round_init();
        // after 2 seconds start the interactive game loop
        this.trig_round_started.start_after(2*ready_start_ticks_per_sec+10);
    }

    if (this.trig_round_started.now()) {
        this.freeze &= ~FREEZETYPE_READY;
        // clear the 'READY!' message
        gfx.vid_color_text({x:11, y:20}, 0x10, "      ");
    }

    // the actually important part: update Pacman and ghosts, update dynamic
    // background tiles, and update the sprite images
    this.game_update_actors();
    this.game_update_tiles();
    this.game_update_sprites();

    // update hiscore
    if (this.score > this.hiscore) {
        this.hiscore = this.score;
    }

    // check for end-round condition
    if (this.trig_round_won.now()) {
        this.freeze |= FREEZETYPE_WON;
        this.trig_ready_started.start_after(ROUNDWON_TICKS);
    }

    if (this.trig_game_over.now()) {
        // display game over string
        vid_color_text(i2(9,20), 0x01, "GAME  OVER");
        //input_disable();
        //start_after(&state.gfx.fadeout, GAMEOVER_TICKS);
        //start_after(&state.intro.started, GAMEOVER_TICKS+FADE_TICKS);
    }

    this.gfx_draw();
}

game.gfx_draw = function() {
    gfx.draw_playfield(this.canvas_ctx);

    const spr = gfx.sprite[0];
    if (spr.enabled) {
        gfx.draw_sprite(this.canvas_ctx, spr);
    }
}

game.updateGhosts = function () {
    this.ghostBlinky.update();
    this.ghostPinky.update();
    this.ghostInky.update();
    this.ghostClyde.update();

    if (this.nextGhostDotCounter !== null) {
        const now = this.ticks();
        const mustGoOut = (now - this.notEatDotsTimer >= 4000); // 4 seconds
        this.nextGhostDotCounter.checkDotLimit(mustGoOut);
        if (mustGoOut) {
            this.notEatDotsTimer = now;
        }
    }

    if (this.player.testCollision(this.ghostBlinky) || this.player.testCollision(this.ghostPinky) ||
        this.player.testCollision(this.ghostInky) || this.player.testCollision(this.ghostClyde))
    {
        this.gameover = true;
    }
}

game.renderScreen = function () {
    const rc = { x: 0, y: 0, w: TILE_WIDTH, h: TILE_HEIGHT };

    for (let sy = 0, y = 0; sy < SCREEN_HEIGHT; sy += TILE_HEIGHT, y++) {
        for (let sx = 0,x = 0; sx < SCREEN_WIDTH; sx += TILE_WIDTH, x++) {
            rc.x = sx, rc.y = sy;
            const c  = screen_map[y][x];
            const dot = game_map[y][x];
            switch (c) {
            case '+':
            case '-':
            case '|':
                this.canvas_ctx.fillStyle = "#007fff";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
                break;
            case '=':
                this.canvas_ctx.fillStyle = "#ff0000";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
                break;
            case 'o':
                this.canvas_ctx.fillStyle = "#000000";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);

                if (dot > 0) {
                    this.canvas_ctx.fillStyle = "#ffffff";
                    this.canvas_ctx.fillRect(rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6);
                }
                break;
            case 'O':
                this.canvas_ctx.fillStyle = "#000000";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);

                if (dot > 0) {
                    this.canvas_ctx.fillStyle = "#ffffff";
                    this.canvas_ctx.fillRect(rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4);
                }
                break;
            default:
                this.canvas_ctx.fillStyle = "#000000";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
                break;
            }
        }
    }

    this.ghostBlinky.draw(this.canvas_ctx);
    this.ghostPinky.draw(this.canvas_ctx);
    this.ghostInky.draw(this.canvas_ctx);
    this.ghostClyde.draw(this.canvas_ctx);
    this.player.draw(this.canvas_ctx);
}

game.ticks = function () {
    return window.performance.now();
}

game.processEvents = function () {
    for (const e of sys_evt.events) {
        switch(e.type) {
            case sys_evt.KEY_DOWN:
            {
                const code = e.context.code;
                if (code == "KeyA") {
                    this.input_dir = DIR.LEFT;
                }
                else if (code == "KeyD") {
                    this.input_dir = DIR.RIGHT;
                }
                else if (code == "KeyW") {
                    this.input_dir = DIR.UP;
                }
                else if (code == "KeyS") {
                    this.input_dir = DIR.DOWN;
                }
                break;
            }
            case sys_evt.KEY_UP:
            {
                break;
            }
        }
    }

    sys_evt.reset();
}