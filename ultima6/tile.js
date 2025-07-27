import { decompressCompressedFile } from './lzw_decoder.js';

export class TileManager {
  constructor() {
    this.alltiles;
    this.tileindex;
    this.masktype;
    this.cache = Array(0x800);
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
      return { format, pixels: this.alltiles.slice(offset, offset + 256) };
    }
    if (format === 0x0A) {
      const tileLength = this.alltiles[offset] * 16;
      return { format, pixels: this.alltiles.slice(offset, offset + tileLength) };
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
}