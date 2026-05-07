import { fgtilesData, bgtilesData, promsData } from './data.js';

// Tile-ROM decode for Phoenix:
//   - 4096 bytes per ROM = two 2KB ICs concatenated, one bitplane each
//   - For tile T byte i: bp0 = rom[T*8 + i], bp1 = rom[2048 + T*8 + i]
//   - Pixel value at intermediate (col=i, row=b) = ((bp1>>(7-b))&1)<<1 | ((bp0>>(7-b))&1)
//   - Source storage is rotated+flipped relative to display orientation;
//     the inverse is an anti-diagonal flip: intermediate (x, y) → display
//     (col=7-y, row=7-x), i.e. grid[(7-x)*8 + (7-y)].
//   - Equivalent to Phoenix.js:getBackground8x8Data's rotateCCW + flipHorizontal
//     pair in the upstream computerarcheology Phoenix dir.
//
// Palette (256 pens):
//   - 512 bytes promsData = two 256-byte PROMs (mmi6301.ic40 + ic41) concatenated
//   - Each pen index is *indirected* through a 7-bit bitswap before looking up
//     the PROM byte (per MAME phoenix_v.cpp): output bits, MSB-to-LSB, come from
//     input bit positions 6, 5, 1, 0, 4, 3, 2. The first 32 bytes of each
//     32-byte block in the PROM are zeros — without the bitswap, the lower pens
//     of every color group land on those zeros and render as black.
//   - For PROM[promIdx]: lo = proms[promIdx], hi = proms[256 + promIdx].
//     Bit-to-channel mapping is R=bit 0, G=bit 2, B=bit 1 of each PROM byte
//     (G and B swapped from the obvious order — verified empirically against
//     known Phoenix colors: red body, yellow center stripes, white wings).
//     Channel value = (lo bit | (hi bit) << 1) → 2-bit value (0..3) → CHANNEL_LEVELS.
//   - Per-tile pen = (colorAttr << 2) | pixelValue, where
//     colorAttr = (tileIdx >> 5) | (isFG ? 0x08 : 0) | (paletteBank << 4).
//     The tileIdx>>5 mirrors the 32-tile-per-color-group layout (CM0..CM7).
//   - paletteBank toggles via $5000 video-register bit 1 (Hardware.md);
//     hardcoded to 0 for now until the register is wired up.

const TILE_W = 8;
const TILE_H = 8;
const TILES_PER_ROM = 256;
const PLANE_SIZE = 2048;
const PROM_SIZE = 256;
const CHANNEL_LEVELS = [0x00, 0x55, 0xAA, 0xFF];

export const resource = {
    palette: null,        // Array<[r, g, b]>, length 256
    fgTileImages: null,   // Array<ImageBitmap>, length 256
    bgTileImages: null,

    async init() {
        this.palette = this.decodePalette(promsData);
        this.fgTileImages = await this.decodeTileSet(fgtilesData, true);
        this.bgTileImages = await this.decodeTileSet(bgtilesData, false);
    },

    decodePalette(proms) {
        const palette = new Array(PROM_SIZE);
        for (let pen = 0; pen < PROM_SIZE; pen++) {
            // Phoenix MAME-style pen-to-PROM indirection: 7-bit bitswap mapping
            // input bit positions [6, 5, 1, 0, 4, 3, 2] to output bits MSB→LSB.
            const promIdx = (((pen >> 2) & 1)     )   // input bit 2 → output bit 0
                          | (((pen >> 3) & 1) << 1)   // input bit 3 → output bit 1
                          | (((pen >> 4) & 1) << 2)   // input bit 4 → output bit 2
                          | (((pen     ) & 1) << 3)   // input bit 0 → output bit 3
                          | (((pen >> 1) & 1) << 4)   // input bit 1 → output bit 4
                          | (pen & 0x60);             // input bits 5, 6 unchanged
            const lo = proms[promIdx];
            const hi = proms[PROM_SIZE + promIdx];
            const r = ( lo       & 1) | (( hi       & 1) << 1);
            const g = ((lo >> 2) & 1) | (((hi >> 2) & 1) << 1);
            const b = ((lo >> 1) & 1) | (((hi >> 1) & 1) << 1);
            palette[pen] = [
                CHANNEL_LEVELS[r],
                CHANNEL_LEVELS[g],
                CHANNEL_LEVELS[b],
            ];
        }
        return palette;
    },

    async decodeTileSet(rom, isFG) {
        const images = new Array(TILES_PER_ROM);
        for (let t = 0; t < TILES_PER_ROM; t++) {
            const grid = this.decodeTilePixels(rom, t);
            images[t] = await this.gridToImageBitmap(grid, t, isFG);
        }
        return images;
    },

    decodeTilePixels(rom, tileIdx) {
        const grid = new Uint8Array(TILE_W * TILE_H);
        const base0 = tileIdx * TILE_H;
        const base1 = PLANE_SIZE + base0;
        for (let y = 0; y < TILE_H; y++) {
            const bp0 = rom[base0 + y];
            const bp1 = rom[base1 + y];
            for (let x = 0; x < TILE_W; x++) {
                const bit = 7 - x;
                const px = (((bp1 >> bit) & 1) << 1) | ((bp0 >> bit) & 1);
                grid[(7 - x) * TILE_W + (7 - y)] = px;
            }
        }
        return grid;
    },

    async gridToImageBitmap(grid, tileIdx, isFG) {
        const paletteBank = 0;
        const colorAttr = ((tileIdx >> 5) & 7)
                        | (isFG ? 0x08 : 0x00)
                        | (paletteBank << 4);
        const paletteBase = colorAttr << 2;

        const bytes = new Uint8ClampedArray(TILE_W * TILE_H * 4);
        for (let i = 0; i < grid.length; i++) {
            const v = grid[i];
            const off = i * 4;
            if (v === 0) continue;   // pixel value 0 = transparent
            const c = this.palette[paletteBase + v];
            bytes[off    ] = c[0];
            bytes[off + 1] = c[1];
            bytes[off + 2] = c[2];
            bytes[off + 3] = 0xFF;
        }
        return await createImageBitmap(new ImageData(bytes, TILE_W, TILE_H));
    },
};
