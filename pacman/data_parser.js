

function parsePalette(paletteData) {
    const palette = [];

    for (let i = 0; i < paletteData.length; i++) {
        const c = paletteData[i];

        // Format: bbgggrrr
        const b = Math.floor(255 * ((c >> 6) & 0x03) / 3);
        const g = Math.floor(255 * ((c >> 3) & 0x07) / 7);
        const r = Math.floor(255 * (c & 0x07) / 7);

        palette.push([r, g, b, 255]);
    }

    return palette;
}

function parseColormap(colormapData) {
    if (colormapData.length !== 256) {
        throw new Error("Missing colormap data");
    }

    const colormap = [];

    for (let i = 0; i < 64; i += 4) {
        const c = [
            colormapData[i],
            colormapData[i + 1],
            colormapData[i + 2],
            colormapData[i + 3]
        ];

        // Check if color indices are within 0-15
        if (c.some(v => v < 0 || v > 15)) {
            throw new Error(`Color index out of range at group ${i%4}: ${c}`);
        }

        output.push(c);
    }

    return colormap;
}

function parseSprite(data, pacmanFmt) {
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

function parseChr(data) {
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

function parseCharmap(charmapData) {
    const chars = [];

    // Galaga / Pacman: 2bpp, 256 characters
    for (let i = 0; i < 256; i++) {
        const slice = charmapData.slice(i * 16, (i + 1) * 16);
        chars.push(parseChr(slice));
    }

    return chars;
}
