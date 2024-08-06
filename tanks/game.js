"use strict"

const STATE = {
    SHOW_MENU: 1,
    EXIT: 999,
};

const SCREEN_RUNNING = 0;
const SCREEN_DONE = 1;
const SCREEN_EXIT = 2;

const game = {
    game_state: STATE.SHOW_MENU,
    resource_count: 0,
    hi_score: 20000,
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

game.init = function () {
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
                this.enemy_life_image = createOffscreenCanvas(7 * 2, 7 * 2);
                const ctx = this.enemy_life_image.getContext('2d');
                ctx.drawImage(this.sprite_sheet, 81 * 2, 57 * 2, 7 * 2, 7 * 2);
            }
            {
                this.player_life_image = createOffscreenCanvas(7 * 2, 8 * 2);
                const ctx = this.player_life_image.getContext('2d');
                ctx.drawImage(this.sprite_sheet, 89 * 2, 56 * 2, 7 * 2, 8 * 2);
            }
            {
                this.flag_image = createOffscreenCanvas(16 * 2, 15 * 2);
                const ctx = this.flag_image.getContext('2d');
                ctx.drawImage(this.sprite_sheet, 64 * 2, 49 * 2, 16 * 2, 15 * 2);
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
}

game.doFrame = function () {
    while (true) {
        switch (this.game_state) {
            case STATE.SHOW_MENU:
                switch (screen_showmenu.doFrame()) {
                    case SCREEN_RUNNING:
                        return;
                    case SCREEN_DONE:
                        break;
                    case SCREEN_EXIT:
                        this.game_state = STATE.EXIT;
                        return;
                }
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
