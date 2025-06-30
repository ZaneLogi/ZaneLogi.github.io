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
    
    ticks: 0,
    pacman: new Pacman(),
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    window.addEventListener("keydown", (e) => this.onkeydown(e));
    window.addEventListener("keyup", (e) => this.onkeyup(e));

    this.initMap();

    Trigger.game = this;
    this.ticks = 0;
    this.gameStarted = new Trigger();
    this.gameReadyStarted = new Trigger();
    this.gameRoundStarted = new Trigger();
    this.gameStarted.start();
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
    /*this.processEvents();

    this.player.update();
    this.updateGhosts();
    this.renderScreen();*/

    this.ticks++;
    this.game_tick();
}

// disable all game loop timers
game.game_disable_timers = function () {
}

// one-time init at start of game state
game.game_init = function () {
    this.game_disable_timers();

    this.freeze = FREEZETYPE_PRELUDE;

    // draw the playfield and PLAYER ONE READY! message
    gfx.vid_clear(TILE_SPACE, COLOR_DOT);
    gfx.vid_color_text({x:9, y:0}, COLOR_DEFAULT, "HIGH SCORE");
    gfx.init_playfield();
    gfx.vid_color_text({x:9, y:14}, 0x5, "PLAYER ONE");
    gfx.vid_color_text({x:11, y:20}, 0x9, "READY!");
}

// setup state at start of a game round
game.game_round_init = function() {
    // clear the "PLAYER ONE" text
    gfx.vid_color_text({x:9, y:14}, 0x10, "          ");

    this.freeze = FREEZETYPE_READY;
}

// update dynamic background tiles
game.game_update_tiles = function() {
    // print score and hiscore

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
}

// the central Pacman and ghost behaviour function, called once per game tick
game.game_update_actors = function() {
}

game.game_tick = function () {
    const prelude_ticks_per_sec = 60;

    // initialize game state once
    if (this.gameStarted.now()) {
        this.gameReadyStarted.startAfter(2*prelude_ticks_per_sec);
        this.game_init();
    }

    // initialize new round (each time Pacman looses a life), make actors visible, remove "PLAYER ONE", start a new life
    if (this.gameReadyStarted.now()) {
        this.game_round_init();
        // after 2 seconds start the interactive game loop
        this.gameRoundStarted.startAfter(2*60+10);
    }

    if (this.gameRoundStarted.now()) {
        this.freeze &= ~FREEZETYPE_READY;
        // clear the 'READY!' message
        gfx.vid_color_text({x:11, y:20}, 0x10, "      ");
    }

    // the actually important part: update Pacman and ghosts, update dynamic
    // background tiles, and update the sprite images
    if (!this.freeze) {
        this.game_update_actors();
    }
    this.game_update_tiles();
    this.game_update_sprites();

    this.gfx_draw();
}

game.gfx_draw = function() {
    gfx.draw_playfield(this.canvas_ctx);
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

game.onkeydown = function (e) {
    this.key_events.push({ event: KEY_DOWN, code: e.code });
}

game.onkeyup = function (e) {
    this.key_events.push({ event: KEY_UP, code: e.code });
}

game.processEvents = function () {
    for (const e of this.key_events) {
        switch (e.event) {
            case KEY_DOWN:
                if (e.code == "KeyA") {
                    this.player.move(Entity.DIRECTION.LEFT);
                }
                else if (e.code == "KeyD") {
                    this.player.move(Entity.DIRECTION.RIGHT);
                }
                else if (e.code == "KeyW") {
                    this.player.move(Entity.DIRECTION.UP);
                }
                else if (e.code == "KeyS") {
                    this.player.move(Entity.DIRECTION.DOWN);
                }
                break;
            case KEY_UP:
                break;
        }
    }

    this.key_events.length = 0; // empty events.
}