"use strict"

const resource = {
};

resource.init = function() {
    this.initPalettes();
    this.initSprites();
}

resource.initPalettes = function() {
    this.colors = [];
    for (const c of color_data) {
        // bbgggrrr
        const b = Math.floor(255 * ((c>>5) & 0x6) / 7);
        const g = Math.floor(255 * ((c>>3) & 0x7) / 7);
        const r = Math.floor(255 * ((c>>0) & 0x7) / 7);
        this.colors.push(`rgb(${r} ${g} ${b})`);
    }

    this.palettes = [];

    for (let i = 0; i < paletteSprite_data.length; i += 4) {
        const pal = [];
        pal.push(this.colors[paletteSprite_data[i]]);
        pal.push(this.colors[paletteSprite_data[i+1]]);
        pal.push(this.colors[paletteSprite_data[i+2]]);
        pal.push(this.colors[paletteSprite_data[i+3]]);
        this.palettes.push(pal);
    }
}

resource.initSprites = function() {
    this.spriteList = this.parse_spritemap([sprite1_data, sprite2_data]);
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