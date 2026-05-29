// Tile graphics decode: U6 tile pixels (16x16 indexed-colour) keyed by tile ID.
// Copied-then-owned from ../ultima6/tile.js, stripped of the DOM/canvas helper
// (getTileImage) — the GPU atlas build lives in the render layer (I-1c). Pure
// CPU pixel decode only. Palette indices 0xFF mark colourkey-transparent pixels.

import { decompressCompressedFile } from './lzw.js';

export class Tiles {
  constructor() {
    this.alltiles = null;   // maptiles (decompressed) ++ objtiles (raw)
    this.tileindex = null;  // 2 bytes per tile -> page offset
    this.masktype = null;   // 1 byte per tile -> format (0x00/0x05/0x0A)
    this.animmask = null;   // shoreline alpha mask (optional)
    this.looks = null;      // tile-id -> display name (optional)
    this.cache = new Array(0x800);
  }

  // Required files: maptiles.vga, objtiles.vga, tileindx.vga, masktype.vga.
  // Optional: animmask.vga + look.lzd (skipped when tileOnly).
  init(fileMap, tileOnly = false) {
    const objtiles = fileMap.get('objtiles.vga');
    this.tileindex = fileMap.get('tileindx.vga');

    const maptiles = decompressCompressedFile(fileMap.get('maptiles.vga'));
    this.alltiles = new Uint8Array(maptiles.length + objtiles.length);
    this.alltiles.set(maptiles, 0);
    this.alltiles.set(objtiles, maptiles.length);

    this.masktype = decompressCompressedFile(fileMap.get('masktype.vga'));

    if (!tileOnly) {
      const rawAnimMask = fileMap.get('animmask.vga');
      if (rawAnimMask) this.animmask = decompressCompressedFile(rawAnimMask);
      const rawLook = fileMap.get('look.lzd');
      if (rawLook) this.parseLook(decompressCompressedFile(rawLook));
    }
  }

  getTileOffset(index) {
    const lo = this.tileindex[index * 2];
    const hi = this.tileindex[index * 2 + 1];
    return ((hi << 8) | lo) * 16;
  }

  getTileFormat(index) { return this.masktype[index]; }

  getTileData(index) {
    const offset = this.getTileOffset(index);
    const format = this.getTileFormat(index);
    if (format === 0x00 || format === 0x05) {
      return { format, pixels: new Uint8Array(this.alltiles.buffer, offset, 256) };
    }
    if (format === 0x0a) {
      const tileLength = this.alltiles[offset] * 16;
      return { format, pixels: new Uint8Array(this.alltiles.buffer, offset, tileLength) };
    }
    throw new Error('Unknown tile format: ' + format.toString(16));
  }

  // Format 0x0A: run-length-ish packed tile, expanded to a full 16x16 buffer.
  decodePixelBlockTile(src) {
    const out = new Uint8Array(16 * 16).fill(0xff);
    let ptr = 0;
    ptr++; // src[0] = size in 16-byte pages (unused here)

    const vertLowByte = (src[ptr] >> 4);
    const vertHighByte = (src[ptr + 1] & 0x0f);
    let dstOffset = 16 * Math.floor((vertLowByte | (vertHighByte << 4)) / 11);

    while (true) {
      const b0 = src[ptr++];
      ptr++;             // b1 (unused beyond displacement nibble in b0)
      const b2 = src[ptr++];
      if (b2 === 0) break;
      dstOffset += (b0 & 0x0f);
      for (let i = 0; i < b2; i++) out[dstOffset++] = src[ptr++];
    }
    return out;
  }

  // 256-byte (16x16) indexed-colour buffer for a tile id, cached.
  getTilePixels(index) {
    if (!this.cache[index]) {
      const tileData = this.getTileData(index);
      if (tileData.format === 0x00 || tileData.format === 0x05) {
        this.cache[index] = tileData.pixels;
      } else if (tileData.format === 0x0a) {
        this.cache[index] = this.decodePixelBlockTile(tileData.pixels);
      } else {
        this.cache[index] = new Uint8Array(256).fill(0xff);
      }
      if (this.animmask && index >= 16 && index < 48) {
        this.processAnimMask(index, this.cache[index]);
      }
    }
    return this.cache[index];
  }

  processAnimMask(i, pixels) {
    const data = this.animmask;
    let dataOffset = (i - 16) * 64;
    let pixelOffset = 0;
    let clen = data[dataOffset++];
    let displacement = 0;
    do {
      if (displacement > 0) pixelOffset += displacement;
      if (clen > 0) { pixels.fill(0xff, pixelOffset, pixelOffset + clen); pixelOffset += clen; }
      displacement = data[dataOffset++];
      clen = data[dataOffset++];
    } while (displacement !== 0 && clen !== 0);
  }

  parseLook(data) {
    this.looks = new Array(2048);
    let offset = 0;
    for (let i = 0; i < 2048; i++) {
      const tileId = data[offset] + data[offset + 1] * 256;
      offset += 2;
      const start = offset;
      while (data[offset] !== 0) offset++;
      offset++;
      const name = new TextDecoder().decode(data.subarray(start, offset - 1));
      for (let j = i; j <= tileId && j < 2048; j++) this.looks[j] = name;
      i = tileId;
    }
  }

  getTileLook(index, quantity = 1) {
    if (!this.looks || index < 0 || index >= this.looks.length) return 'Unknown';
    const look = this.looks[index] || 'Unknown';
    const isPlural = quantity >= 1;
    return look.replace(/\\es/g, isPlural ? 'es' : '').replace(/\\s/g, isPlural ? 's' : '');
  }
}
