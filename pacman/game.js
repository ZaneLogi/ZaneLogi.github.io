"use strict"

const SCREEN_WIDTH = 224;
const SCREEN_HEIGHT = 288;
const TILE_WIDTH = 8;
const TILE_HEIGHT = 8;
const SCREEN_TILE_WIDTH = 28;
const SCREEN_TILE_HEIGHT = 36;

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
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    window.addEventListener("keydown", (e) => this.onkeydown(e));
    window.addEventListener("keyup", (e) => this.onkeyup(e));

    this.initMap();

    runloop.start(() => this.doFrame(), 20);
}

game.initMap = function () {
    let currentDots = 0;

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
            case 'O':
                currentDots++;
                // pass through
            default:
                game_map[y][x] = 0x00; // movable
                break;
            }
        }
    }

    this.player = new Player();
    this.ghostBlinky = new GhostBlinky();

    this.player.reset();
    this.ghostBlinky.reset();
}

let done = false;

game.doFrame = function () {
    this.processEvents();

    if (!done) {
        this.player.update();
        this.updateGhosts();
        this.renderScreen();
    }
}

game.updateGhosts = function () {
    this.ghostBlinky.update();
}

game.renderScreen = function () {
    const rc = { x: 0, y: 0, w: TILE_WIDTH, h: TILE_HEIGHT };

    for (let sy = 0, y = 0; sy < SCREEN_HEIGHT; sy += TILE_HEIGHT, y++) {
        for (let sx = 0,x = 0; sx < SCREEN_WIDTH; sx += TILE_WIDTH, x++) {
            rc.x = sx, rc.y = sy;
            const c  = screen_map[y][x];
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

                this.canvas_ctx.fillStyle = "#ffffff";
                this.canvas_ctx.fillRect(rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6);
                break;
            case 'O':
                this.canvas_ctx.fillStyle = "#000000";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);

                this.canvas_ctx.fillStyle = "#ffffff";
                this.canvas_ctx.fillRect(rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4);
                break;
            default:
                this.canvas_ctx.fillStyle = "#000000";
                this.canvas_ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
                break;
            }
        }
    }

    this.ghostBlinky.draw(this.canvas_ctx);
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