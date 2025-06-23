"use strict"

const resource = {
}

resource.init = function() {
    this.initPalettes();
    this.initImageList();
    this.initSpriteList();
}

resource.initPalettes = function() {
    this.colors = [];
    for (const c of color_data) {
        // bbgggrrr
        const b = Math.floor(255 * ((c>>5) & 0x6) / 7);
        const g = Math.floor(255 * ((c>>3) & 0x7) / 7);
        const r = Math.floor(255 * ((c>>0) & 0x7) / 7);
        this.colors.push([r, g, b, 255]);
    }

    this.colors[15][3] = 0; // make it a transparent color

    this.palettes = [];
    this.colorPalettes = [];

    for (let i = 0; i < paletteSprite_data.length; i += 4) {
        const pal = [];
        for (let j = 0; j < 4; j++) {
            const [r, g, b, a] = this.colors[paletteSprite_data[i+j]];
            pal.push(`rgb(${r}, ${g}, ${b}`);
        }
        this.palettes.push(pal);

        const colorPal = [];
        for (let j = 0; j < 4; j++) {
            colorPal.push(this.colors[paletteSprite_data[i+j]]);
        }
        this.colorPalettes.push(colorPal);
    }
}

resource.initImageList = function() {
    this.imageList = this.parse_spritemap([sprite1_data, sprite2_data]);
}

resource.parse_spritemap = function(spriteData) {
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
}

resource.decode_sprite = function(spriteBytes, offset) {
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
}

resource.createOffscreenCanvas = function (width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

resource.createImage = function (width, height, pixelData, palette) {
    const offscreenCanvas = this.createOffscreenCanvas(width, height);
    const canvas_ctx = offscreenCanvas.getContext('2d');

    const imageData = canvas_ctx.createImageData(width, height);
    const data = imageData.data;

    let offset = 0;

    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            data.set(palette[pixelData[y][x]], offset);
            offset += 4;
        }
    }

    canvas_ctx.putImageData(imageData, 0, 0);

    return offscreenCanvas;
}

resource.createSprite = function(width, height, spriteData, palette) {
    const sprite = [];

    for (const pixelData of spriteData) {
        sprite.push(this.createImage(width, height, pixelData, palette))
    }

    return sprite;
}

resource.initSpriteList = function() {
    this.spaceShip = this.createSprite(16, 16, this.imageList.slice(0,8), this.colorPalettes[9]);
    this.bossSprite = this.createSprite(16, 16, this.imageList.slice(8, 16), this.colorPalettes[0]);
    this.butterflySprite = this.createSprite(16, 16, this.imageList.slice(16, 24), this.colorPalettes[2]);
    this.waspSprite = this.createSprite(16, 16, this.imageList.slice(24, 32), this.colorPalettes[3])
}