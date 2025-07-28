import { decompressCompressedFile } from './lzw_decoder.js';

export class TileManager {
  constructor() {
    this.alltiles;
    this.tileindex;
    this.masktype;
    this.cache = Array(0x800);
    this.imageCache = Array(0x800);
  }

  init(fileMap) {
    const objtiles = fileMap.get("objtiles.vga");
    this.tileindex = fileMap.get("tileindx.vga");

    const rawMapTiles = fileMap.get("maptiles.vga");
    const maptiles = decompressCompressedFile(rawMapTiles);

    const rawMaskType = fileMap.get("masktype.vga");
    this.masktype = decompressCompressedFile(rawMaskType);

    this.alltiles = new Uint8Array(maptiles.length + objtiles.length);
    this.alltiles.set(maptiles, 0);
    this.alltiles.set(objtiles, maptiles.length);
  }

  getTileOffset(index) {
    const lo = this.tileindex[index * 2];
    const hi = this.tileindex[index * 2 + 1];
    return (hi << 8 | lo) * 16;
  }

  getTileFormat(index) {
    return this.masktype[index];
  }

  getTileData(index) {
    const offset = this.getTileOffset(index);
    const format = this.getTileFormat(index);
    if (format === 0x00 || format === 0x05) {
      return { format, pixels: new Uint8Array(this.alltiles.buffer, offset, 256) };
    }
    if (format === 0x0A) {
      const tileLength = this.alltiles[offset] * 16;
      return { format, pixels: new Uint8Array(this.alltiles.buffer, offset, tileLength) };
    }
    throw new Error("Unknown tile format: " + format.toString(16));
  }

  decodePixelBlockTile(src) {
    const out = new Uint8Array(16 * 16).fill(0xFF);
    let ptr = 0;

    const tileDataLengthDiv16 = src[ptr++]; // the size in 16-byte pages of the tile data
    let dstOffset = 0;

    while (true) {
      const b0 = src[ptr++]; // b0, b1: displacement
      const b1 = src[ptr++];
      const b2 = src[ptr++]; // b2: length
      if (b2 === 0) break;

      const skipPixels = b0 & 0x0F;
      dstOffset += skipPixels;

      for (let i = 0; i < b2; i++) {
        out[dstOffset++] = src[ptr++];
      }
    }

    return out;
  }

  getTilePixels(index) {
    if (!this.cache[index]) {
      const tileData = this.getTileData(index);

      if (tileData.format === 0x00 || tileData.format === 0x05) {
        this.cache[index] = tileData.pixels;
      }
      else if (tileData.format === 0x0A) {
        this.cache[index] = this.decodePixelBlockTile(tileData.pixels);
      }
      else {
        this.cache[index] = new Uint8Array(256).fill(0xFF);
      }
    }

    return this.cache[index];
  }

  getTileImage(index, palette, forceUpdate = false) {
    //if (index >= 16 && index < 48) // the base tile for shoreline tiles
    //  index = U6_ANIM_SRC_TILE[index-16]/2;

    if (!this.imageCache[index]) {
      // Create offscreen canvas for 16x16 tile
      const offscreen = document.createElement("canvas");
      offscreen.width = 16;
      offscreen.height = 16;
      this.imageCache[index] = offscreen;
      forceUpdate = true;
    }

    if (forceUpdate) {
      const tilePixels = this.getTilePixels(index);
      const ctx = this.imageCache[index].getContext("2d");
      const imageData = ctx.createImageData(16, 16);
      const rgba = imageData.data;

      for (let i = 0; i < 256; i++) {
        const color = tilePixels[i];
        const base = i * 4;
        if (color === 0xFF) {
          rgba[base + 3] = 0;
        } else {
          const [r, g, b] = palette[color];
          rgba[base] = r;
          rgba[base + 1] = g;
          rgba[base + 2] = b;
          rgba[base + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    return this.imageCache[index];
  }
}