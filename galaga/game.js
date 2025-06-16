const game = {
    canvas: null,
    canvas_ctx: null,
    window_width: 0,
    window_height: 0,
};

game.init = function () {
    this.canvas = document.querySelector('canvas');
    this.canvas_ctx = this.canvas.getContext('2d');
    this.window_width = this.canvas.width;
    this.window_height = this.canvas.height;

    function getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    for (let y = 0; y < this.window_height; y += 8) {
        for (let x = 0; x < this.window_width; x += 8) {
            let r = getRandomInt(64);
            let g = getRandomInt(64);
            let b = getRandomInt(64);

            this.canvas_ctx.fillStyle = `rgb(${r} ${g} ${b})`
            this.canvas_ctx.fillRect(x, y, 8, 8);
        }
    }

    this.colors = this.parse_colors(color_data);

    this.palettes = this.parse_palettes(this.colors, paletteSprite_data);

    const spriteList = this.parse_spritemap([sprite1_data, sprite2_data]);

    for (let sprIdx = 0; sprIdx < 16; sprIdx++) {
        const drawY = sprIdx * 32;
        for (let i = 0; i < 8; i++) {
            this.draw_sprite(i * 32, drawY, spriteList[sprIdx * 8 + i], this.palettes[9]);
        }
    }

    this.currentSprite = 0;
    this.spriteList = spriteList;
    this.seqence = [
        0, 1, 2, 3, 4, 5,
        6, 5, 4, 3, 2, 1,
        0, 1, 2, 3, 4, 5,
        6, 5, 4, 3, 2, 1,
    ];

    runloop.start(() => this.doFrame(), 200);
};

game.parse_colors = function(colorData) {
    const colors = []
    for (const c of colorData) {
        // bbgggrrr
        const b = Math.floor(255 * ((c>>5) & 0x6) / 7);
        const g = Math.floor(255 * ((c>>3) & 0x7) / 7);
        const r = Math.floor(255 * ((c>>0) & 0x7) / 7);
        colors.push(`rgb(${r} ${g} ${b})`);
    }
    return colors;
}

game.parse_palettes = function(colors, colorIndices) {
    const palettes = [];

    for (let i = 0; i < colorIndices.length; i += 4) {
        const pal = [];
        pal.push(colors[colorIndices[i]]);
        pal.push(colors[colorIndices[i+1]]);
        pal.push(colors[colorIndices[i+2]]);
        pal.push(colors[colorIndices[i+3]]);
        palettes.push(pal);
    }

    return palettes;
}

game.parse_spritemap = function(spriteData) {
    const sprites = [];

    for (const data of spriteData) {
        if (data.length != 4096) {
            throw new Error("Missing spritemap data");
        }

        for (let i = 0; i < 64; i++) {
            const spr = this.decode_sprite(data, i * 64)
            sprites.push(spr);
        }
    }

    return sprites;
};

game.decode_sprite = function(spriteBytes, offset) {
    const sprite = [];

    for (let y = 0; y < 16; y++) {
        const row = [];
        for (let x = 0; x < 16; x++) {
            const idx = ((y & 8) << 1) + (((x & 8) ^ 8) << 2) + (7 - (x & 7)) + 2 * (y & 4);
            const byte = spriteBytes[idx + offset];

            const bit0 = (byte & (0x08 >> (y & 3))) ? 1 : 0;
            const bit1 = (byte & (0x80 >> (y & 3))) ? 2 : 0;

            row.push(bit0 + bit1);
        }
        sprite.push(row);
    }

    return sprite;
};

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
};

game.doFrame = function () {
    const ANIM_X = 256, ANIM_Y = 0;

    const spriteIndex = this.seqence[this.currentSprite];
    let mirrorX, mirrorY;

    if (this.currentSprite < 6) {
        mirrorX = false; mirrorY = false;
    }
    else if (this.currentSprite < 12) {
        mirrorX = true; mirrorY = false;
    }
    else if (this.currentSprite < 18) {
        mirrorX = true; mirrorY = true;
    }
    else {
        mirrorX = false; mirrorY = true;
    }

    for (let i = 0; i < 16; i++) {
        this.draw_sprite(ANIM_X, ANIM_Y + i * 32, this.spriteList[spriteIndex + i * 8], this.palettes[2], mirrorX, mirrorY);
    }

    this.currentSprite = (this.currentSprite + 1) % this.seqence.length;
};

