import { decompressCompressedFile } from './lzw_decoder.js';

export class TileManager {
  constructor() {
    this.alltiles;
    this.tileindex;
    this.masktype;
    this.cache = Array(0x800);
    this.imageCache = Array(0x800);
  }

  init(fileMap, tileOnly = false) {
    const objtiles = fileMap.get("objtiles.vga");
    this.tileindex = fileMap.get("tileindx.vga");

    const rawMapTiles = fileMap.get("maptiles.vga");
    const maptiles = decompressCompressedFile(rawMapTiles);

    this.alltiles = new Uint8Array(maptiles.length + objtiles.length);
    this.alltiles.set(maptiles, 0);
    this.alltiles.set(objtiles, maptiles.length);

    const rawMaskType = fileMap.get("masktype.vga");
    this.masktype = decompressCompressedFile(rawMaskType);

    if (!tileOnly) {
      const rawAnimMask = fileMap.get("animmask.vga");
      this.animmask = decompressCompressedFile(rawAnimMask);

      const rawLook = fileMap.get("look.lzd");
      this.parseLook(decompressCompressedFile(rawLook));
    }
  }

  parseLook(data) {
    this.looks = new Array(2048);
    let offset = 0;
    for (let i = 0; i < 2048; i++) {
      const tile_index = data[offset] + data[offset + 1] * 256;
      offset += 2;

      const start = offset;

      // Skip to next '\0'
      while (data[offset] !== 0) {
        offset++;
      }
      offset++; // skip '\0'

      // convert to string
      const lookName = new TextDecoder().decode(data.subarray(start, offset - 1));
      for (let j = i; j <= tile_index && j < 2048; j++) {
        this.looks[j] = lookName;
      }

      i = tile_index;     
    }
  }

  processAnimMask(i, pixels) {
    const data = this.animmask;
    let dataOffset = (i-16) * 64;
    let pixelOffset = 0;
    let clen = data[dataOffset++];
    let displacement = 0;

    do {
      if (displacement > 0) {
        pixelOffset += displacement;
      }

      if (clen > 0) {
        pixels.fill(0xff, pixelOffset, pixelOffset + clen);
        pixelOffset += clen;
      }

      displacement = data[dataOffset++];
      clen = data[dataOffset++];
    } while( displacement != 0 && clen != 0);
  }

  getTileLook(index, quantity = 1) {
    if (index < 0 || index >= this.looks.length) {
      return "Unknown";
    }

    const look = this.looks[index] || "Unknown";
    if (look.indexOf('\\')) {
      const isPlural = quantity >= 1;
      return look.replace(/\\es/g, isPlural ? "es" : "")
        .replace(/\\s/g, isPlural ? "s" : "");
    }
    return look;
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

    // vertical displacement is encoded in the first two bytes
    let vertLowByte = (src[ptr] >> 4); // the low byte of the vertical displacement
    let vertHighByte = (src[ptr+1] & 0x0F); // the high byte of the vertical displacement
    let dstOffset = 16 * Math.floor((vertLowByte | (vertHighByte << 4))/11);

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

      // Process animation mask for shoreline tiles
      if (this.animmask && index >= 16 && index < 48) {
        this.processAnimMask(index, this.cache[index]);
      }
    }

    return this.cache[index];
  }

  getTileImage(index, palette, forceUpdate = false) {
    if (!this.imageCache[index]) {
      // Create offscreen canvas for 16x16 tile
      const offscreen = document.createElement("canvas");
      offscreen.width = 16;
      offscreen.height = 16;
      offscreen.style.width = '16px';
      offscreen.style.height = '16px';
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
          const {r, g, b} = palette.getColor(color);
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