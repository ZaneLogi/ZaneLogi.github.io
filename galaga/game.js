const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
}

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    resource.init();

    Enemy.createPath();
    this.enemy = new Enemy(resource.butterflySprite);

    //this.drawSpriteList();

    this.currentSprite = 0;
    this.seqence = [
        0, 1, 2, 3, 4, 5, // degree 180 - 270
        6, 5, 4, 3, 2, 1, // degree 270 - 0
        0, 1, 2, 3, 4, 5, // degree 0 - 90
        6, 5, 4, 3, 2, 1, // degree 90 - 180
    ];

    this.enemy.draw(this.canvas_ctx);

    runloop.start(() => this.doFrame(), 100);
}

game.drawSpriteList = function() {
    for (let sprIdx = 0; sprIdx < 16; sprIdx++) {
        const drawY = sprIdx * 32;
        for (let i = 0; i < 8; i++) {
            this.draw_sprite(i * 32, drawY, resource.imageList[sprIdx * 8 + i], resource.palettes[9]);
        }
    }
}

game.drawRotatedSpriteList = function() {
    const ANIM_X = 256, ANIM_Y = 0;

    const spriteIndex = this.seqence[this.currentSprite];
    let mirrorX, mirrorY;

    // frome left to up, degree 180 - 270
    if (this.currentSprite < 6) {
        mirrorX = false; mirrorY = false;
    }
    // from up to right, degree 270 - 0
    else if (this.currentSprite < 12) {
        mirrorX = true; mirrorY = false;
    }
    // from right to down, degree 0 - 90
    else if (this.currentSprite < 18) {
        mirrorX = true; mirrorY = true;
    }
    // from down to left, degree 90 - 180
    else {
        mirrorX = false; mirrorY = true;
    }

    for (let i = 0; i < 16; i++) {
        this.draw_sprite(ANIM_X, ANIM_Y + i * 32, resource.imageList[spriteIndex + i * 8], resource.palettes[2], mirrorX, mirrorY);
    }

    this.currentSprite = (this.currentSprite + 1) % this.seqence.length;
}

game.draw_sprite_with_angle = function(x, y, spriteIdx, palIdx, angle) {
    let mirrorX = false, mirrorY = false, seq = undefined;

    if (angle < 90) {
        mirrorX = true; mirrorY = true; seq = Math.floor(angle/15);
    }
    else if (angle < 180) {
        mirrorX = false; mirrorY = true; seq = 6 - Math.floor((angle-90)/15);
    }
    else if (angle < 270) {
        mirrorX = false; mirrorY = false; seq = Math.floor((angle-180)/15);
    }
    else {
        mirrorX = true; mirrorY = false; seq = 6 - Math.floor((angle-270)/15);
    }

    this.draw_sprite(x - 16, y - 16,
        resource.imageList[spriteIdx + seq], resource.palettes[palIdx],
        mirrorX, mirrorY);
}

game.draw_sprite = function(canvasX, canvasY, sprite, palette, mirrorX, mirrorY) {
    const pw = 2, ph = 2;

    if (!mirrorX) {
        if (!mirrorY) {
            let screenY = canvasY;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX += pw;
                }
                screenY += ph;
            }
        }
        else { // mirror Y
            let screenY = canvasY + 15 * ph;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX += pw;
                }
                screenY -= ph;
            }
        }
    }
    else { // mirror X
        if (!mirrorY) {
            let screenY = canvasY;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX + 15 * pw;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX -= pw;
                }
                screenY += ph;
            }
        }
        else { // mirror Y
            let screenY = canvasY + 15 * ph;
            for (let y = 0; y < 16; y++) {
                let screenX = canvasX + 15 * pw;
                for (let x = 0; x < 16; x++) {
                    this.canvas_ctx.fillStyle = palette[sprite[y][x]];
                    this.canvas_ctx.fillRect(screenX, screenY, pw, ph);
                    screenX -= pw;
                }
                screenY -= ph;
            }
        }
    }
}

game.doFrame = function () {
    this.canvas_ctx.fillStyle = `rgb(0,0,0)`;
    this.canvas_ctx.fillRect(0, 0, this.window_width, this.window_height);

    //this.drawRotatedSpriteList();
    //this.draw_sprite_with_angle(ANIM_X, ANIM_Y+16, 0, 2, 0);

    this.enemy.update();
    this.enemy.draw(this.canvas_ctx);
    Enemy.drawPath(this.canvas_ctx, 0);
}
