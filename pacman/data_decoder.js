
"use strict"

function decodeRomHwColors(data) {
    const hwColors = [];

    for (const c of data) {
        // Format: bbgggrrr
        const b = Math.floor(255 * ((c >> 6) & 0x03) / 3);
        const g = Math.floor(255 * ((c >> 3) & 0x07) / 7);
        const r = Math.floor(255 * (c & 0x07) / 7);

        hwColors.push([r, g, b, 255]);
    }

    return hwColors;
}

function decodeRomPalette(data, hwColors) {
    if (data.length !== 256) {
        throw new Error("Missing colormap data");
    }

    const palettes = [];
    for (let i = 0; i < 256; i += 4) {
        const c = data.slice(i, i + 4);

        // Check if color indices are within 0-15
        if (c.some(v => v < 0 || v > 15)) {
            throw new Error(`Color index out of range at group ${i>>2}: ${c}`);
        }

        const colorBlock = c.map((index) => Array.from(hwColors[index]));
        // first color in each color block is transparent
        colorBlock[0][3] = 0;

        palettes.push(colorBlock);
    }

    return palettes;
}

function decodeSprite(data, pacmanFmt) {
    // sprites are 16x16 pixels
    const sprite = [];

    for (let y = 0; y < 16; y++) {
        const row = [];
        for (let x = 0; x < 16; x++) {
            const idx = ((y & 8) << 1) + (((x & 8) ^ 8) << 2) + (7 - (x & 7)) + 2 * (y & 4);
            const bitmask0 = 0x08 >> (y & 3);
            const bitmask1 = 0x80 >> (y & 3);

            const c0 = (data[idx] & bitmask0) ? 1 : 0;
            const c1 = (data[idx] & bitmask1) ? 2 : 0;
            row.push(c0 + c1);
        }
        sprite.push(row);
    }

    if (pacmanFmt) {
        // Move the first 4 rows to the end (top 4 becomes bottom 4)
        const top = sprite.slice(0, 4);
        const bottom = sprite.slice(4);
        return bottom.concat(top);
    }

    return sprite;
}

function decodeRomSprite(data) {
    if (data.length != 4096) {
        throw new Error("Missing spritemap data");
    }

    const sprites = [];
    for (let i = 0, offset = 0; i < 64; i++, offset += 64) {
        const spriteData = data.slice(offset, offset + 64);
        sprites.push(decodeSprite(spriteData, true));
    }

    return sprites;
}

function decodeTile(data) {
    // characters are 8x8 pixels
    const char = [];

    for (let y = 0; y < 8; y++) {
        const row = [];
        for (let x = 0; x < 8; x++) {
            const byte = data[15 - x - 2 * (y & 4)];
            const bitmask0 = 0x08 >> (y & 3);
            const bitmask1 = 0x80 >> (y & 3);

            const c0 = (byte & bitmask0) ? 1 : 0;
            const c1 = (byte & bitmask1) ? 2 : 0;

            row.push(c0 + c1);
        }
        char.push(row);
    }

    return char; // 8x8 二維像素陣列，每個值為 0~3
}

function decodeRomTile(data) {
    const tiles = [];

    // Galaga / Pacman: 2bpp, 256 characters
    for (let i = 0; i < 256; i++) {
        const slice = data.slice(i * 16, (i + 1) * 16);
        tiles.push(decodeTile(slice));
    }

    return tiles;
}
