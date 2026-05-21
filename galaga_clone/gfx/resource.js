import { color_data }         from './dat_colors.js';
import { paletteSprite_data } from './dat_paletteSprite.js';
import { sprite1_data }       from './dat_sprite1.js';
import { sprite2_data }       from './dat_sprite2.js';

function decodeColors() {
    const out = color_data.map(c => [
        Math.floor(255 * ((c >> 0) & 0x7) / 7),  // red   (3-bit)
        Math.floor(255 * ((c >> 3) & 0x7) / 7),  // green (3-bit)
        Math.floor(255 * ((c >> 6) & 0x3) / 3),  // blue  (2-bit)
        255,
    ]);
    out[15][3] = 0;  // color index 15 = transparent
    return out;
}

function decodePalettes(colors) {
    const palettes = [];
    for (let i = 0; i < paletteSprite_data.length; i += 4) {
        const pal = [];
        for (let j = 0; j < 4; j++) pal.push(colors[paletteSprite_data[i + j]]);
        palettes.push(pal);
    }
    return palettes;
}

function decodeTile(data, offset) {
    const tile = [];
    for (let y = 0; y < 16; y++) {
        const row = [];
        for (let x = 0; x < 16; x++) {
            const idx = ((y & 8) << 1) + (((x & 8) ^ 8) << 2) + (7 - (x & 7)) + 2 * (y & 4);
            const byte = data[idx + offset];
            const bit0 = (byte & (0x08 >> (y & 3))) ? 1 : 0;
            const bit1 = (byte & (0x80 >> (y & 3))) ? 2 : 0;
            row.push(bit0 + bit1);
        }
        tile.push(row);
    }
    return tile;
}

function decodeSheet(data) {
    const tiles = [];
    for (let i = 0; i < 64; i++) tiles.push(decodeTile(data, i * 64));
    return tiles;
}

function tileToCanvas(tile, palette) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(16, 16);
    let offset = 0;
    for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
            const [r, g, b, a] = palette[tile[y][x]];
            imageData.data.set([r, g, b, a], offset);
            offset += 4;
        }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

const _colors   = decodeColors();
const _palettes = decodePalettes(_colors);
const _tiles    = [...decodeSheet(sprite1_data), ...decodeSheet(sprite2_data)];

function group(start, count, palIdx) {
    return _tiles.slice(start, start + count)
                 .map(tile => tileToCanvas(tile, _palettes[palIdx]));
}

export const colorPalettes = _palettes;
export const sprites = {
    ship:      group( 0, 8, 9),  // palette 9 — white ship
    boss:      group( 8, 8, 0),  // palette 0 — green boss
    butterfly: group(16, 8, 2),  // palette 2 — moth
    wasp:      group(24, 8, 3),  // palette 3 — bee
};
