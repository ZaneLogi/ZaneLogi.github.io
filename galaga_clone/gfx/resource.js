import { color_data }         from './dat_colors.js';
import { paletteSprite_data } from './dat_paletteSprite.js';
import { paletteChar_data }   from './dat_paletteChar.js';
import { sprite1_data }       from './dat_sprite1.js';
import { sprite2_data }       from './dat_sprite2.js';
import { character_data }     from './dat_character.js';

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

function decodePalettes(palData, colors) {
    const palettes = [];
    for (let i = 0; i < palData.length; i += 4) {
        const pal = [];
        for (let j = 0; j < 4; j++) pal.push(colors[palData[i + j]]);
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
const _palettes = decodePalettes(paletteSprite_data, _colors);
const _tiles    = [...decodeSheet(sprite1_data), ...decodeSheet(sprite2_data)];

function group(start, count, palIdx) {
    return _tiles.slice(start, start + count)
                 .map(tile => tileToCanvas(tile, _palettes[palIdx]));
}

export const colorPalettes = _palettes;

// ── Projectile + explosion sprites ─────────────────────────────────────
// Namco sprite hardware treats tile-pixel value 0 as transparent regardless of
// what the palette maps it to. The four ENEMY palettes happen to map index 0 to
// the master transparent slot (15), so the generic tileToCanvas works for them —
// but the projectile/explosion palettes (e.g. the bomb's 0x0B) do NOT, so force
// value-0 transparent here.
// flipV mirrors top↔bottom (Z80 sprite ctrl bit 0 = "flip about the X axis",
// i.e. up/down). flipH mirrors left↔right (bit 1).
function spriteTile(code, palIdx, flipV = false, flipH = false) {
    const tile = _tiles[code], pal = _palettes[palIdx];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(16, 16);
    let o = 0;
    for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
            const v = tile[flipV ? 15 - y : y][flipH ? 15 - x : x];
            const [r, g, b] = pal[v];
            img.data.set([r, g, b, v === 0 ? 0 : 255], o);   // tile value 0 = transparent
            o += 4;
        }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

// Player missile + enemy bomb are BOTH sprite tile 0x30; c_game_or_demo_init
// (gg1-2.s:761-782) writes code 0x30 to both, color 0x09 to the 2 rocket slots
// and color 0x0B to the 8 bomb slots. (Rocket also has rotated variants
// 0x31/0x33 — straight-fire uses 0x30.)
export const missile = spriteTile(0x30, 0x09);              // player shot (ctrl 0 — head up)
export const bomb    = spriteTile(0x30, 0x0B, true);       // enemy bomb (ctrl 1 = flipX/up-down — head DOWN toward the player)
// Bug explosion: tiles 0x41-0x44 at palette 0x0A (f_1DB3 gg1-2_fx.s:1517 sets the
// dying sprite's color to 0x0A; case_24B2 gg1-3.s:945 advances code = count+1
// over 0x41..0x44 then a score popup).
// A 2×2 (32×32) doubled sprite = 4 consecutive tiles. The quadrant order is the
// standard Namco gfx_offs {{0,1},{2,3}} ROTATED 90° CW — because the cabinet is
// rotated and our sprite decode produces upright tiles (same reason decodeChar
// rotates 90° CW). Confirmed visually against the explosion tiles:
//   TL=base+2, TR=base+0, BL=base+3, BR=base+1.
function doubledTile(base, palIdx) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const quad = [[0, 0, 2], [16, 0, 0], [0, 16, 3], [16, 16, 1]];  // [dx, dy, tileOffset]
    for (const [dx, dy, off] of quad) ctx.drawImage(spriteTile(base + off, palIdx), dx, dy);
    return canvas;
}

// Bug explosion (case_24B2 gg1-3.s:945): frames 0x41-0x43 are single 16×16, then
// the FINAL frame 0x44 expands to a 32×32 2×2 (dblh|dblw set at l_24DA, with a
// −8,−8 recenter) — the big debris spread — before the score popup. Palette 0x0A.
export const explosionBug = [
    spriteTile(0x41, 0x0A),
    spriteTile(0x42, 0x0A),
    spriteTile(0x43, 0x0A),
    doubledTile(0x44, 0x0A),
];

// Player-ship explosion (hitd_fghtr_hit gg1-5.s:744-754): base tile 0x20, palette
// 0x0B, dblh|dblw → a 2×2 (32×32) sprite from the start. case_243C (gg1-3.s:850)
// advances the code +4 every 4 frames over the 0x0F counter → 0x20/24/28/2C.
export const explosionShip = [0x20, 0x24, 0x28, 0x2C].map(b => doubledTile(b, 0x0B));

export const sprites = {
    ship:         group( 0, 8, 9),  // palette 9 — white ship
    shipCaptured: group( 0, 8, 7),  // palette 7 — red captured ship (Z80 color map 7)
    boss:         group( 8, 8, 0),  // palette 0 — green boss
    bossBlue:     group( 8, 8, 1),  // palette 1 — blue boss (2-hit, 4d-a)
    butterfly:    group(16, 8, 2),  // palette 2 — moth
    wasp:         group(24, 8, 3),  // palette 3 — bee
};

// ── Character tiles (8×8) — dat_character.js ───────────────────────────
// Galaga's playfield/text/beam graphics are 8×8 2bpp chars (256 chars ×
// 16 bytes). The packing mirrors the sprite decode's bit convention but
// for a single 16-byte 8×8 cell (no 4-quadrant interleave): byte index
// = (7−x) + 2·(y&4) within the char, plane 0 at bit (0x08>>(y&3)),
// plane 1 at bit (0x80>>(y&3)). char palettes come from dat_paletteChar.
function decodeChar(data, offset, bitReverse = false) {
    // Step 1 — decode the glyph as STORED, per the computerarcheology GFX1
    // interleave: for stored-row sy, byte[sy] holds the right 4 columns
    // (sx≥4), byte[sy+8] the left 4 (sx<4); within a byte high nibble = plane 0,
    // low nibble = plane 1, so a column's plane bits are (0x80>>(sx&3)) and
    // (0x08>>(sx&3)).
    //
    // The upper 128 codes (0x80-0xFF) are the cocktail / flipped-screen
    // duplicate set: each byte is stored BIT-REVERSED (the hardware shifts the
    // pixels out in reverse order for the flipped half, so the ROM pre-reverses
    // them). Decoding those with the normal masks fragments every glyph at the
    // 4-column byte seam (the "vertical shift" artifact); reading the MIRRORED
    // bit positions — plane 0 = (0x01<<sh), plane 1 = (0x10<<sh) — un-reverses
    // them so the upper half decodes as cleanly as the lower. The text block
    // 0x80-0xAE comes out byte-identical to 0x00-0x2E. Verified in
    // gfx/char_viewer.html (lower half normal, upper half bit-reversed).
    const stored = [];
    for (let sy = 0; sy < 8; sy++) {
        const row = [];
        for (let sx = 0; sx < 8; sx++) {
            const byte = data[offset + sy + (sx < 4 ? 8 : 0)];
            const sh   = sx & 3;
            const bit0 = (byte & (bitReverse ? (0x01 << sh) : (0x80 >> sh))) ? 1 : 0;
            const bit1 = (byte & (bitReverse ? (0x10 << sh) : (0x08 >> sh))) ? 2 : 0;
            row.push(bit0 + bit1);
        }
        stored.push(row);
    }
    // Step 2 — rotate 90° CLOCKWISE. The arcade monitor is rotated, so glyphs
    // are stored on their side (stored-left = glyph-top). CW rotation maps the
    // stored left column to the output top row: tile[i][j] = stored[7−j][i].
    const tile = [];
    for (let i = 0; i < 8; i++) {
        const row = [];
        for (let j = 0; j < 8; j++) row.push(stored[7 - j][i]);
        tile.push(row);
    }
    return tile;
}

function charToCanvas(tile, palette) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(8, 8);
    let offset = 0;
    for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
            const [r, g, b, a] = palette[tile[y][x]];
            imageData.data.set([r, g, b, a], offset);
            offset += 4;
        }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// Codes 0x00-0x7F decode normally; 0x80-0xFF are the cocktail bit-reversed
// duplicates and need the mirrored bit read (see decodeChar).
const _charTiles    = [];
for (let i = 0; i < 256; i++) _charTiles.push(decodeChar(character_data, i * 16, i >= 0x80));
const _charPalettes = decodePalettes(paletteChar_data, _colors);  // 64 char palettes

export const charPalettes = _charPalettes;
export const CHAR_PALETTE_COUNT = _charPalettes.length;

// Lazily build + cache an 8×8 char canvas for (code, palIdx).
const _charCache = new Map();
export function charCanvas(code, palIdx = 0) {
    const key = code * 256 + palIdx;
    let c = _charCache.get(key);
    if (!c) {
        c = charToCanvas(_charTiles[code & 0xFF], _charPalettes[palIdx % _charPalettes.length]);
        _charCache.set(key, c);
    }
    return c;
}
