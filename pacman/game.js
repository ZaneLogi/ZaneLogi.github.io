"use strict"

const FREEZETYPE = {
    PRELUDE:   (1<<0),  // game prelude is active (with the game start tune playing)
    READY:     (1<<1),  // READY! phase is active (at start of a new game round)
    EAT_GHOST: (1<<2),  // Pacman has eaten a ghost
    DEAD:      (1<<3),  // Pacman was eaten by a ghost
    WON:       (1<<4),  // game round was won by eating all dots
};

const SPRITE = {
    PACMAN: 0,
    BLINKY: 1,
    PINKY: 2,
    INKY: 3,
    CLYDE: 4,
    FRUIT: 5,
    MAX: 6
};

const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,

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
    freeze: 0,
    round: 0,
    score: 0,

    pacman: new Pacman(),
    blinky: new GhostBlinky(),
    active_fruit: FRUIT.NONE,
    
    ticks: 0,
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
    this.trig_started.start();

    runloop.start(() => this.doFrame(), 1000/60); // 60 FPS
}

game.doFrame = function () {
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
            this.game.global_dot_counter = 0;
        }
        this.num_lives--;
    }
    console.assert(this.num_lives >= 0);

    this.active_fruit = FRUIT.NONE;
    this.xorshift = 0x12345678;   // random-number-generator seed
    this.freeze = FREEZETYPE.READY;
    this.num_ghosts_eaten = 0;
    this.game_disable_timers();

    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");

    // the force-house timer forces ghosts out of the house if Pacman isn't
    // eating dots for a while
    this.trig_force_leave_house.start();

    // Pacman starts running to the left
    this.pacman.init();

    // Blinky starts outside the ghost house, looking to the left, and in scatter mode
    this.blinky.init();

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
    if (this.trig_fruit_eaten.after_once(2*60)) {
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
    const pacman = this.pacman;
    let spr = gfx.sprite[0];

    if (spr.enabled) {
        spr.pos = pacman.actor_to_sprite_pos();
        pacman.spr_anim_pacman();
    }

    spr = gfx.sprite[1];
    if (spr.enabled) {
        spr.pos = this.blinky.actor_to_sprite_pos();
        this.blinky.spr_anim_ghost();
    }

    // hide or display the currently active bonus fruit
    if (this.active_fruit == FRUIT.NONE) {
        const spr = gfx.sprite[SPRITE.FRUIT];
        spr.enabled = false;
    }
    else {
        const spr = gfx.sprite[SPRITE.FRUIT];
        spr.enabled = true;
        spr.pos = i2(13 * TILE_WIDTH, 19 * TILE_HEIGHT + Math.floor(TILE_HEIGHT/2));
        spr.tile = fruit_tiles_colors[this.active_fruit][1];
        spr.color = fruit_tiles_colors[this.active_fruit][2];
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
    this.blinky.update();
}

game.game_tick = function () {
    const prelude_ticks_per_sec = 10;
    const ready_start_ticks_per_sec = 30;

    // initialize game state once
    if (this.trig_started.now()) {
        this.trig_ready_started.start_after(2*prelude_ticks_per_sec);
        //snd_start(0, &snd_prelude);
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
        //snd_start(1, &snd_weeooh);
    }

    // activate/deactivate bonus fruit
    if (this.trig_fruit_active.now()) {
        this.active_fruit = levelspec(this.round).bonus_fruit;
    }
    else if (this.trig_fruit_active.after_once(FRUITACTIVE_TICKS)) {
        this.active_fruit = FRUIT.NONE;
    }

    // stop frightened sound and start weeooh sound
    //if (after_once(state.game.pill_eaten, levelspec(state.game.round).fright_ticks)) {
    //    snd_start(1, &snd_weeooh);
    //}

    // if game is frozen because Pacman ate a ghost, unfreeze after a while
    //if (state.game.freeze & FREEZETYPE_EAT_GHOST) {
    //    if (after_once(state.game.ghost_eaten, GHOST_EATEN_FREEZE_TICKS)) {
    //        state.game.freeze &= ~FREEZETYPE_EAT_GHOST;
    //    }
    //}

    // play pacman-death sound
    //if (after_once(state.game.pacman_eaten, PACMAN_EATEN_TICKS)) {
    //    snd_start(2, &snd_dead);
    //}

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
        vid_color_text(i2(9,20), 0x01, "GAME  OVER");
        //input_disable();
        //start_after(&state.gfx.fadeout, GAMEOVER_TICKS);
        //start_after(&state.intro.started, GAMEOVER_TICKS+FADE_TICKS);
    }

    this.gfx_draw();
}

game.gfx_draw = function() {
    gfx.draw_playfield(this.canvas_ctx);

    for (let i = 0; i < SPRITE.MAX; i++) {
        const spr = gfx.sprite[i];
        if (spr.enabled) {
            gfx.draw_sprite(this.canvas_ctx, spr);
        }
    }
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