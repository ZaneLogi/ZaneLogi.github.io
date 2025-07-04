"use strict"

const GAMESTATE = {
    INTRO: 0,
    GAME: 1,
};

const FREEZETYPE = {
    PRELUDE:   (1<<0),  // game prelude is active (with the game start tune playing)
    READY:     (1<<1),  // READY! phase is active (at start of a new game round)
    EAT_GHOST: (1<<2),  // Pacman has eaten a ghost
    DEAD:      (1<<3),  // Pacman was eaten by a ghost
    WON:       (1<<4),  // game round was won by eating all dots
};

const input = {
    enabled: false,
    has_input: false,
    input_dir: DIR.LEFT,
}

input.enable = function() {
    this.enabled = true;
    this.has_input = false;
    this.input_dir = DIR.LEFT;
}
input.disable = function() {
    this.enabled = false;
    this.has_input = false;
}

const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
    gamestate: 0,

    trig_intro_started: new Trigger(),

    trig_game_started: new Trigger(),
    trig_ready_started: new Trigger(),
    trig_round_started: new Trigger(),

    trig_round_won: new Trigger(),
    trig_game_over: new Trigger(),
    trig_force_leave_house: new Trigger(),

    hiscore: 0,
    freeze: 0,
    round: 0,
    score: 0,

    pacman: new Pacman(),
    blinky: new GhostBlinky(),
    pinky: new GhostPinky(),
    inky: new GhostInky(),
    clyde: new GhostClyde(),
    fruit: new Fruit(),

    ticks: 0,
    god_mode: false,
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    sys_evt.init();
    gfx.init();

    Actor.game = this;
    Trigger.game = this;

    this.ticks = 0;
    this.trig_intro_started.start();

    runloop.start(() => this.doFrame(), 1000/60); // 60 FPS
}

game.doFrame = function () {
    this.ticks++;
    this.processEvents();

    audio.game_tick();

    if (this.trig_intro_started.now()) {
        this.gamestate = GAMESTATE.INTRO;
    }
    if (this.trig_game_started.now()) {
        this.gamestate = GAMESTATE.GAME;
    }

    // call the top-level game state update function
    switch (this.gamestate) {
        case GAMESTATE.INTRO:
            this.intro_tick();
            break;
        case GAMESTATE.GAME:
            this.game_tick();
            break;
    }

    gfx.draw(this.canvas_ctx);
}

game.intro_tick = function() {
    // on intro-state enter, enable input and draw any initial text
    if (this.trig_intro_started.now()) {
        audio.snd_clear();
        gfx.spr_clear();
        gfx.trig_gfx_fadein.start();
        input.enable();
        gfx.vid_clear(TILE_SPACE, COLOR_DEFAULT);
        gfx.vid_text(i2(3,0),  "1UP   HIGH SCORE   2UP");
        gfx.vid_color_score(i2(6,1), COLOR_DEFAULT, 0);
        if (this.hiscore > 0) {
            gfx.vid_color_score(i2(16,1), COLOR_DEFAULT, this.hiscore);
        }
        gfx.vid_text(i2(7,5),  "CHARACTER / NICKNAME");
        gfx.vid_text(i2(3,35), "CREDIT  0");
    }

    // draw the animated 'ghost image.. name.. nickname' lines
    let delay = 30;
    const names = [ "-SHADOW", "-SPEEDY", "-BASHFUL", "-POKEY" ];
    const nicknames = [ "BLINKY", "PINKY", "INKY", "CLYDE" ];
    for (let i = 0; i < 4; i++) {
        const color = 2*i + 1;
        const y = 3*i + 6;
        // 2*3 ghost image created from tiles (no sprite!)
        delay += 30;
        if (this.trig_intro_started.after_once(delay)) {
            gfx.vid_color_tile(i2(4,y+0), color, TILE_GHOST+0); gfx.vid_color_tile(i2(5,y+0), color, TILE_GHOST+1);
            gfx.vid_color_tile(i2(4,y+1), color, TILE_GHOST+2); gfx.vid_color_tile(i2(5,y+1), color, TILE_GHOST+3);
            gfx.vid_color_tile(i2(4,y+2), color, TILE_GHOST+4); gfx.vid_color_tile(i2(5,y+2), color, TILE_GHOST+5);
        }
        // after 1 second, the name of the ghost
        delay += 60;
        if (this.trig_intro_started.after_once(delay)) {
            gfx.vid_color_text(i2(7,y+1), color, names[i]);
        }
        // after 0.5 seconds, the nickname of the ghost
        delay += 30;
        if (this.trig_intro_started.after_once(delay)) {
            gfx.vid_color_text(i2(17,y+1), color, nicknames[i]);
        }
    }

    // . 10 PTS
    // O 50 PTS
    delay += 60;
    if (this.trig_intro_started.after_once(delay)) {
        gfx.vid_color_tile(i2(10,24), COLOR_DOT, TILE_DOT);
        gfx.vid_text(i2(12,24), "10 \x5D\x5E\x5F");
        gfx.vid_color_tile(i2(10,26), COLOR_DOT, TILE_PILL);
        gfx.vid_text(i2(12,26), "50 \x5D\x5E\x5F");
    }

    // blinking "press any key" text
    delay += 60;
    if (this.trig_intro_started.after(delay)) {
        if (this.trig_intro_started.since() & 0x20) {
            gfx.vid_color_text(i2(3,31), 3, "                       ");
        }
        else {
            gfx.vid_color_text(i2(3,31), 3, "PRESS ANY KEY TO START!");
        }
    }

    // FIXME: animated chase sequence

    // if a key is pressed, advance to game state
    if (input.has_input) {
        input.disable();
        gfx.trig_gfx_fadeout.start();
        this.trig_game_started.start_after(FADE_TICKS);
    }
}

// disable all game loop timers
game.game_disable_timers = function () {
    this.trig_round_won.disable();
    this.trig_game_over.disable();
    this.trig_force_leave_house.disable();
}

// one-time init at start of game state
game.game_init = function () {
    input.enable();
    this.game_disable_timers();

    this.round = 0;
    this.freeze = FREEZETYPE.PRELUDE;
    this.num_lives = NUM_LIVES;
    this.global_dot_counter_active = false;
    this.global_dot_counter = 0;
    this.num_dots_eaten = 0;
    this.score = 0;

    // draw the playfield and PLAYER ONE READY! message
    gfx.vid_clear(TILE_SPACE, COLOR_DOT);
    gfx.vid_color_text({x:9, y:0}, COLOR_DEFAULT, "HIGH SCORE");
    gfx.game_init_playfield();
    gfx.vid_color_text({x:9, y:14}, 0x5, "PLAYER ONE");
    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");

    this.ghosts = [this.blinky, this.pinky, this.inky, this.clyde];
}

// setup state at start of a game round
game.game_round_init = function() {
    gfx.spr_clear();

    // clear the "PLAYER ONE" text
    gfx.vid_color_text({x:9, y:14}, 0x10, "          ");

    /* if a new round was started because Pacman has "won" (eaten all dots),
        redraw the playfield and reset the global dot counter
    */
    if (this.num_dots_eaten == NUM_DOTS) {
        this.round++;
        this.num_dots_eaten = 0;
        gfx.game_init_playfield();
        this.global_dot_counter_active = false;
    }
    else {
        /* if the previous round was lost, use the global dot counter
           to detect when ghosts should leave the ghost house instead
           of the per-ghost dot counter
        */
        if (this.num_lives != NUM_LIVES) {
            this.global_dot_counter_active = true;
            this.global_dot_counter = 0;
        }
        this.num_lives--;
    }
    console.assert(this.num_lives >= 0);

    this.freeze = FREEZETYPE.READY;
    this.num_ghosts_eaten = 0;
    this.game_disable_timers();

    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");

    // the force-house timer forces ghosts out of the house if Pacman isn't
    // eating dots for a while
    this.trig_force_leave_house.start();

    // Pacman starts running to the left
    this.pacman.init();

    for (const ghost of this.ghosts) {
        ghost.init();
    }

    this.fruit.init();
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
    if (this.fruit.trig_fruit_eaten.after_once(2*60)) {
        gfx.vid_fruit_score(FRUIT.NONE);
    }

    // remaining lives at bottom left screen
    for (let i = 0; i < NUM_LIVES; i++) {
        const color = (i < this.num_lives) ? COLOR_PACMAN : 0;
        gfx.vid_draw_tile_quad(i2(2+2*i,34), color, TILE_LIFE);
    }

    // bonus fruit list in bottom-right corner
    {
        let x = 24;
        for (let i = this.round - NUM_STATUS_FRUITS + 1; i <= this.round; i++) {
            if (i >= 0) {
                const fruit = levelspec(i).bonus_fruit;
                const tile_code = fruit_tiles_colors[fruit][0];
                const color_code = fruit_tiles_colors[fruit][2];
                gfx.vid_draw_tile_quad(i2(x,34), color_code, tile_code);
                x -= 2;
            }
        }
    }

    // if game round was won, render the entire playfield as blinking blue/white
    if (this.trig_round_won.after(1*60)) {
        if (this.trig_round_won.since() & 0x10) {
            gfx.vid_color_playfield(COLOR_DOT);
        }
        else {
            gfx.vid_color_playfield(COLOR_WHITE_BORDER);
        }
    }
}

// this function takes care of updating all sprite images during gameplay
game.game_update_sprites = function() {
    this.pacman.update_sprite();

    for (const ghost of this.ghosts) {
        ghost.update_sprite();
    }

    this.fruit.update_sprite();
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
        for (const ghost of this.ghosts) {
            if (ghost.dot_counter < ghost.dot_limit) {
                ghost.dot_counter++;
                break;
            }
        }
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
        audio.snd_clear();
    }
    else if ((this.num_dots_eaten == 70) || (this.num_dots_eaten == 170)) {
        // at 70 and 170 dots, show the bonus fruit
        this.fruit.trig_fruit_active.start();
    }

    // play alternating crunch sound effect when a dot has been eaten
    if (this.num_dots_eaten & 1) {
        audio.snd_start(2, 'eatdot1');
    }
    else {
        audio.snd_start(2, 'eatdot2');
    }
}

// the central Pacman and ghost behaviour function, called once per game tick
game.game_update_actors = function() {
    if (this.freeze)
        return;

    this.pacman.update();

    for (const ghost of this.ghosts) {
        ghost.update();
    }
}

game.game_tick = function () {
    const prelude_ticks_per_sec = 45;
    const ready_start_ticks_per_sec = 30;

    // initialize game state once
    if (this.trig_game_started.now()) {
        gfx.trig_gfx_fadein.start();
        this.trig_ready_started.start_after(2*prelude_ticks_per_sec);
        audio.snd_start(0, 'prelude');
        this.game_init();
    }

    // initialize new round (each time Pacman looses a life), make actors visible, remove "PLAYER ONE", start a new life
    if (this.trig_ready_started.now()) {
        this.game_round_init();
        // after 2 seconds start the interactive game loop
        this.trig_round_started.start_after(2*ready_start_ticks_per_sec+10);
    }

    if (this.trig_round_started.now()) {
        this.freeze &= ~FREEZETYPE.READY;
        // clear the 'READY!' message
        gfx.vid_color_text({x:11, y:20}, 0x10, "      ");
        audio.snd_start(1, 'weeooh');
    }

    // activate/deactivate bonus fruit
    this.fruit.update();

    // stop frightened sound and start weeooh sound
    if (this.pacman.trig_pill_eaten.after_once(levelspec(this.round).fright_ticks)) {
        audio.snd_start(1, 'weeooh');
    }

    // if game is frozen because Pacman ate a ghost, unfreeze after a while
    if (this.freeze & FREEZETYPE.EAT_GHOST) {
        if (this.pacman.trig_ghost_eaten.after_once(GHOST_EATEN_FREEZE_TICKS)) {
            this.freeze &= ~FREEZETYPE.EAT_GHOST;
        }
    }

    // play pacman-death sound
    if (this.pacman.trig_pacman_eaten.after_once(PACMAN_EATEN_TICKS)) {
        audio.snd_start(2, 'dead');
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
        this.freeze |= FREEZETYPE.WON;
        this.trig_ready_started.start_after(ROUNDWON_TICKS);
    }

    if (this.trig_game_over.now()) {
        // display game over string
        gfx.vid_color_text(i2(9,20), 0x01, "GAME  OVER");
        input.disable();
        gfx.trig_gfx_fadeout.start_after(GAMEOVER_TICKS);
        this.trig_intro_started.start_after(GAMEOVER_TICKS+FADE_TICKS);
    }
}

game.processEvents = function () {
    if (input.enabled) {
        for (const e of sys_evt.events) {
            switch(e.type) {
                case sys_evt.KEY_DOWN:
                {
                    const code = e.context.code;
                    if (code == "KeyA") {
                        input.input_dir = DIR.LEFT;
                    }
                    else if (code == "KeyD") {
                        input.input_dir = DIR.RIGHT;
                    }
                    else if (code == "KeyW") {
                        input.input_dir = DIR.UP;
                    }
                    else if (code == "KeyS") {
                        input.input_dir = DIR.DOWN;
                    }

                    input.has_input = true;
                    break;
                }
                case sys_evt.KEY_UP:
                {
                    break;
                }
            }
        }
    }

    sys_evt.reset();
}