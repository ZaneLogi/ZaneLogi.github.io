"use strict"
const gtimer = {
    timers: {},
    serial_no: 0,

    reset: function () {
        this.timers = {};
        this.serial_no = 0;
    },

    add: function (interval, f, repeat = -1) {
        this.timers[++this.serial_no] = {
            interval: interval,
            callback: f,
            repeat: repeat,
            times: 0,
            time: 0
        }
        return this.serial_no;
    },

    destroy: function (serial_no) {
        delete this.timers[serial_no];
    },

    update: function (time_passed) {
        for (const [no, timer] of Object.entries(this.timers)) {
            timer.time += time_passed;
            if (timer.time > timer.interval) {
                timer.time -= timer.interval;
                timer.times++;
                timer.callback();
                if (timer.repeat > -1 && timer.times == timer.repeat)
                    delete this.timers[no];
            }
        }
    },

};

const STATE = {
    SHOW_MENU: 1,
    NEXT_LEVEL: 2,
    PLAY: 3,
    EXIT: 999,
};

const SCREEN_RUNNING = 0;
const SCREEN_DONE = 1;
const SCREEN_EXIT = 2;

const game = {
    game_state: STATE.SHOW_MENU,
    resource_count: 0,
    hi_score: 20000,
    nr_of_players: 1,
    stage: 1,
    players: [],
};

function loadImage(url) {
    return new Promise((resolve, reject) => {
        let image = new Image();
        image.src = url;
        if (image.complete) {
            console.log('image.complete');
            resolve(image);
        } else {
            image.onload = function () {
                console.log('image.onload');
                resolve(image);
            }
        }
    });
}

function createOffscreenCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

const createSprite = function (sprite_sheet, x, y, w, h, force_square = false) {
    if (force_square) {
        let s = (w >= h ? w : h);
        const image = createOffscreenCanvas(s, s);
        const ctx = image.getContext('2d');
        const dstX = Math.floor((s - w) / 2);
        const dstY = Math.floor((s - h) / 2);
        // position the source to the center of the destination
        ctx.drawImage(sprite_sheet, x, y, w, h, dstX, dstY, w, h);
        return image;
    }
    else {
        const image = createOffscreenCanvas(w, h);
        const ctx = image.getContext('2d');
        ctx.drawImage(sprite_sheet, x, y, w, h, 0, 0, w, h);
        return image;
    }
};

const rotateSprite = function (sprite, angle) {
    const w = sprite.width;
    const h = sprite.height;
    const rot_sprite = createOffscreenCanvas(w, h);
    const ctx = rot_sprite.getContext('2d');
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
    return rot_sprite;
}

function get_random_int(max) {
    return Math.floor(Math.random() * max);
}

function random_choice(array) {
    return array[get_random_int(array.length)];
}

function random_shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = get_random_int(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function nearest(num, base) {
    // Round number to nearest divisible
    return Math.round(num / base) * base;
}

function intersectRect(src, dst) {
    if (src.x >= dst.x + dst.w)
        return false;
    if (src.x + src.w <= dst.x)
        return false;
    if (src.y >= dst.y + dst.h)
        return false;
    if (src.y + src.h <= dst.y)
        return false;

    return true;
}

game.init = function () {
    this.load_resources();
}

game.load_resources = function () {
    this.canvas = document.querySelector('canvas');
    this.canvasContext = this.canvas.getContext('2d');

    // load sprite sheet
    loadImage(spriteSheetURL).then(
        image => {
            console.log("sprite is ready.");
            {
                this.sprite_sheet = createOffscreenCanvas(192, 224);
                const ctx = this.sprite_sheet.getContext('2d');
                ctx.drawImage(image, 0, 0, 96, 112, 0, 0, 192, 224);
            }
            {
                this.enemy_life_image = createSprite(this.sprite_sheet, 81 * 2, 57 * 2, 7 * 2, 7 * 2);
                this.player_life_image = createSprite(this.sprite_sheet, 89 * 2, 56 * 2, 7 * 2, 8 * 2);
                this.flag_image = createSprite(this.sprite_sheet, 64 * 2, 49 * 2, 16 * 2, 15 * 2);
            }
            {
                // this is used in intro screen
                this.player_image = createOffscreenCanvas(13 * 2, 13 * 2);
                const ctx = this.player_image.getContext('2d');
                ctx.save();
                ctx.translate(13, 13);
                ctx.rotate(Math.PI / 2);
                ctx.translate(-13, -13);
                ctx.drawImage(this.sprite_sheet, 0, 0, 13 * 2, 13 * 2, 0, 0, 13 * 2, 13 * 2);
            }

            Player.initSprites(this.sprite_sheet);
            Enemy.initSprites(this.sprite_sheet);
            Level.initSprites(this.sprite_sheet);
            Castle.initSprites(this.sprite_sheet);
            Tank.initSprites(this.sprite_sheet);
            Bullet.initSprites(this.sprite_sheet);
            Explosion.initSprites(this.sprite_sheet);

            this.loadResourceCompletion(1);
        }).catch(error => {
            console.log(error);
        });

    // load font face
    const fontPromise = (new FontFace('prstart', 'url(prstart.ttf)')).load();
    fontPromise.then(font => {
        console.log("font is ready.");
        document.fonts.add(font);
        this.loadResourceCompletion(1);
    }).catch(error => {
        console.log(error);
    });
};

game.loadResourceCompletion = function (progress) {
    this.resource_count += progress;
    if (this.resource_count < 2)
        return;

    console.log("all resources are loaded.");

    this.castle = new Castle();

    runloop.start();
};

game.writeInBricks = function (ctx, text, x, y) {
    const alphabet = {
        "a": "0071b63c7ff1e3",
        "b": "01fb1e3fd8f1fe",
        "c": "00799e0c18199e",
        "e": "01fb060f98307e",
        "g": "007d860cf8d99f",
        "i": "01f8c183060c7e",
        "l": "0183060c18307e",
        "m": "018fbffffaf1e3",
        "o": "00fb1e3c78f1be",
        "r": "01fb1e3cff3767",
        "t": "01f8c183060c18",
        "v": "018f1e3eef8e08",
        "y": "019b3667860c18"
    };

    const bmask = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

    // the image of the brick is 16 x 16 pixels
    // the sub-image of the small brick is 8 x 8 pixels
    const brick1Rect = { x: 56 * 2, y: 64 * 2, w: 4 * 2, h: 4 * 2 };
    const brick2Rect = { x: 60 * 2, y: 64 * 2, w: 4 * 2, h: 4 * 2 };
    const brick3Rect = { x: 60 * 2, y: 68 * 2, w: 4 * 2, h: 4 * 2 };
    const brick4Rect = { x: 56 * 2, y: 68 * 2, w: 4 * 2, h: 4 * 2 };
    const dstRect = { x: 0, y: 0, w: 8, h: 8 };

    /*
    // test code to draw a brick on the top left corner
    ctx.drawImage(this.sprite_sheet, brick1Rect.x, brick1Rect.y, 8, 8, 0, 0, 8, 8);
    ctx.drawImage(this.sprite_sheet, brick2Rect.x, brick2Rect.y, 8, 8, 9, 0, 8, 8);
    ctx.drawImage(this.sprite_sheet, brick3Rect.x, brick3Rect.y, 8, 8, 9, 9, 8, 8);
    ctx.drawImage(this.sprite_sheet, brick4Rect.x, brick4Rect.y, 8, 8, 0, 9, 8, 8);
    */
    let bits = 0;
    let bcount = 0;

    for (const ch of text) {
        dstRect.x = 0;
        dstRect.y = 0;
        let letter_w = 0; // use to calculate the width of the letter
        const bitStream = alphabet[ch];
        let bitStreamIndex = 0;
        // 7 width x 8 height small bricks
        for (let j = 1; j <= 8; j++) {
            for (let i = 0; i < 7; i++) {
                if (bcount == 0) {
                    // get the next bits
                    const c1 = bitStream.charCodeAt(bitStreamIndex++);
                    const c2 = bitStream.charCodeAt(bitStreamIndex++);
                    // convert from ascii character to number
                    bits = ((c1 <= '9'.charCodeAt(0) ? c1 - '0'.charCodeAt(0) : c1 - 'a'.charCodeAt(0) + 10) << 4)
                        | (c2 <= '9'.charCodeAt(0) ? c2 - '0'.charCodeAt(0) : c2 - 'a'.charCodeAt(0) + 10);
                    bcount = 8;
                }

                if (bits & bmask[bcount - 1]) {
                    // base on the position to draw the subimage from a brick image
                    if (i % 2 == 0 && j % 2 == 0) {
                        ctx.drawImage(this.sprite_sheet,
                            brick1Rect.x, brick1Rect.y, 8, 8,
                            x + dstRect.x, y + dstRect.y, 8, 8);
                    } else if (i % 2 == 1 && j % 2 == 0) {
                        ctx.drawImage(this.sprite_sheet,
                            brick2Rect.x, brick2Rect.y, 8, 8,
                            x + dstRect.x, y + dstRect.y, 8, 8);
                    } else if (i % 2 == 1 && j % 2 == 1) {
                        ctx.drawImage(this.sprite_sheet,
                            brick3Rect.x, brick3Rect.y, 8, 8,
                            x + dstRect.x, y + dstRect.y, 8, 8);
                    } else {
                        ctx.drawImage(this.sprite_sheet,
                            brick4Rect.x, brick4Rect.y, 8, 8,
                            x + dstRect.x, y + dstRect.y, 8, 8);
                    }
                    if (dstRect.x > letter_w) {
                        letter_w = dstRect.x;
                    }
                }

                bcount--;
                dstRect.x += 8;
            }
            dstRect.x = 0;
            dstRect.y += 8;
        }
        x += letter_w + 16; // increase x to the next letter
    }
};

game.doFrame = function () {
    while (true) {
        switch (this.game_state) {
            case STATE.SHOW_MENU:
                switch (screen_showmenu.doFrame()) {
                    case SCREEN_RUNNING:
                        return;
                    case SCREEN_DONE:
                        this.game_state = STATE.NEXT_LEVEL;
                        this.stage = 4; // set the start stage
                        this.players = []; // clear players
                        break;
                    case SCREEN_EXIT:
                        this.game_state = STATE.EXIT;
                        return;
                }
                return;

            case STATE.NEXT_LEVEL:
                this.canvasContext.fillStyle = "rgb(0, 0, 0)";
                this.canvasContext.fillRect(0, 0, game.canvas.width, game.canvas.height);

                this.bullets = [];
                this.enemies = [];
                this.bonuses = [];
                this.castle.rebuild();
                gtimer.reset();

                // load level
                this.stage += 1;
                this.timefreeze = false;

                this.level = new Level(this.stage);

                this.reloadPlayers();

                this.game_state = STATE.PLAY;

                this.draw(this.canvasContext);

                return;

            case STATE.PLAY:
                // update players
                // keep moving in the same direction first
                let moved = false;
                switch (this.players[0].direction) {
                    case Tank.DIR.UP:
                        if (control.CHKBIT(CONTROL_UP) && !control.CHKBIT(CONTROL_DOWN))
                            this.players[0].move(Tank.DIR.UP), moved =true;
                        break;
                    case Tank.DIR.DOWN:
                        if (control.CHKBIT(CONTROL_DOWN) && !control.CHKBIT(CONTROL_UP))
                            this.players[0].move(Tank.DIR.DOWN), moved = true;
                        break;
                    case Tank.DIR.LEFT:
                        if (control.CHKBIT(CONTROL_LEFT) && !control.CHKBIT(CONTROL_RIGHT))
                            this.players[0].move(Tank.DIR.LEFT), moved = true;
                        break;
                    case Tank.DIR.RIGHT:
                        if (!moved && control.CHKBIT(CONTROL_RIGHT))
                            this.players[0].move(Tank.DIR.RIGHT), moved =true;
                        break;
                }
                // move to other directions?
                if (!moved && control.CHKBIT(CONTROL_UP) && !control.CHKBIT(CONTROL_DOWN))
                    this.players[0].move(Tank.DIR.UP), moved = true;
                if (!moved && control.CHKBIT(CONTROL_DOWN) && !control.CHKBIT(CONTROL_UP))
                    this.players[0].move(Tank.DIR.DOWN), moved = true;
                if (!moved && control.CHKBIT(CONTROL_LEFT) && !control.CHKBIT(CONTROL_RIGHT))
                    this.players[0].move(Tank.DIR.LEFT), moved = true;
                if (!moved && control.CHKBIT(CONTROL_RIGHT) && !control.CHKBIT(CONTROL_LEFT))
                    this.players[0].move(Tank.DIR.RIGHT), moved = true;

                if (control.CHKBIT(CONTROL_FIRE))
                    this.players[0].fire();

                this.players[0].update();

                // update enemies

                // update bullets
                this.bullets = this.bullets.filter(bullet => {
                    if (bullet.state == Bullet.STATE.REMOVED)
                        return false;
                    else {
                        bullet.update();
                        return true;
                    }
                });

                // update bonus

                // update label

                // update timers
                gtimer.update(runloop.frame_period);

                // draw everything
                this.draw(this.canvasContext);
                return;


            case STATE.EXIT:
                return;

            default: // unknown game state
                console.log("unknown game state %d", this.game_state);
                // bail out
                this.game_state = STATE.EXIT;
                return;
        }
    }
};

game.shieldPlayer = function (player, shield = true, duration = null) {
    // add / remove shield
    // duration: in ms. if null, do not remove shield automatically
    player.shielded = shield;
    if (shield)
        player.timer_no_shield = gtimer.add(100, () => player.toggleShieldImage())
    else
        gtimer.destroy(player.timer_no_shield);

    if (shield && duration != null)
        gtimer.add(duration, () => this.shieldPlayer(player, false), 1);
}

game.respawnPlayer = function (player, clear_scores = false) {
    player.reset();

    if (clear_scores) {
        player.trophies = { bonus: 0, enemy0: 0, enemy1: 0, enemy2: 0, enemy3: 0, };
    }

    this.shieldPlayer(player, true, 4000);
}

game.reloadPlayers = function () {
    if (this.players.length == 0) {
        // first player
        let x = 8 * Level.TILE_SIZE + Math.floor((Level.TILE_SIZE * 2 - 26) / 2);
        let y = 24 * Level.TILE_SIZE + Math.floor((Level.TILE_SIZE * 2 - 26) / 2);
        this.players[0] = new Player(this.level, { x: x, y: y }, Tank.DIR.UP, Player.PLAYER1);

        // second player
        if (this.nr_of_players == 2) {
            x = 16 * Level.TILE_SIZE + Math.floor((Level.TILE_SIZE * 2 - 26) / 2);
            this.players[1] = new Player(this.level, { x: x, y: y }, Tank.DIR.UP, Player.PLAYER2);
        }
    }

    for (const player of this.players) {
        player.level = this.level;
        this.respawnPlayer(player, true);
    }
};

game.draw = function (ctx) {
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillRect(0, 0, 416, 416);

    this.level.draw(ctx, [Level.TILE.BRICK, Level.TILE.STEEL, Level.TILE.FROZE, Level.TILE.WATER]);

    this.castle.draw(ctx);

    // enemy.draw

    // label.draw

    for (const player of this.players) {
        player.draw(ctx);
    }

    for (const bullet of this.bullets) {
        bullet.draw(ctx);
    }

    // bonus.draw

    this.level.draw(ctx, [Level.TILE.GRASS]);

    // game_over.draw

    this.drawSideBar(ctx);
}

game.drawSideBar = function (ctx) {
    ctx.fillStyle = "rgb(100, 100, 100)";
    ctx.fillRect(416, 0, 64, 416);

    // draw enemy lives

    // players' lives

};

