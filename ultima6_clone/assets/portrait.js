// assets/portrait.js
//
// Conversation portrait decoder (I-12c). Full format + source decode in
// docs/research_portraits.md. A portrait is a 56x64 one-byte-per-pixel indexed
// bitmap, LZW-compressed, stored as one object in a lib_32 file
// (portrait.a / .b / .z). Pixel bytes index the in-game u6pal palette — there is
// NO dedicated portrait palette. Reuses assets/lzw.js (decompressCompressedFile,
// same call the tile loader uses for maptiles.vga) + the RGBA palette.
//
// Lazy by design: the raw file bytes load at boot (OPTIONAL set in main.js), but
// a portrait is decoded + palette-mapped to an ImageData only on first show, then
// cached (decode-once). The project's first lazy-decoded asset — ~200 portraits
// exist, only a handful are seen per session.

import { decompressCompressedFile } from './lzw.js';

const W = 56, H = 64, PIXELS = W * H;   // 3584 = 0xE00 (u6tech.txt §"Portraits")

// One lib_32 portrait file: a uint32 offset table at byte 0 (count = off[0]/4),
// then per-object LZW blocks. research_portraits.md §"Container — plain lib_32".
class PortraitLib {
  constructor(bytes) {
    this.bytes = bytes || null;
    this.offsets = null;
    this.count = 0;
    if (this.bytes && this.bytes.byteLength >= 4) this._parse();
  }
  _parse() {
    const b = this.bytes;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    this.count = dv.getUint32(0, true) / 4;
    this.offsets = [];
    for (let i = 0; i < this.count; i++) this.offsets.push(dv.getUint32(i * 4, true));
    this.offsets.push(b.byteLength);                        // sentinel: last block ends at EOF
  }
  // Decode block `index` to 3584 palette indices, or null (out of range / bad block).
  decode(index) {
    if (!this.offsets || index < 0 || index >= this.count) return null;
    try {
      const block = this.bytes.subarray(this.offsets[index], this.offsets[index + 1]);
      const px = decompressCompressedFile(block);
      return px.length === PIXELS ? px : null;
    } catch { return null; }
  }
}

export class Portraits {
  // { a, b, z } are the raw file bytes (Uint8Array | undefined); palette is the
  // RGBA Uint8Array(256*4) from assets/palette.js (reg.palette).
  constructor({ a, b, z, palette, avatarPortrait = 0 } = {}) {
    this.a = new PortraitLib(a);
    this.b = new PortraitLib(b);
    this.z = new PortraitLib(z);
    this.palette = palette || null;
    this.avatarPortrait = avatarPortrait | 0;   // D_2CCB — the Avatar's char-creation portrait choice (I-18f)
    this.cache = new Map();   // npcId -> ImageData | null (null = no portrait, cached)
  }

  // ImageData(56x64) for an NPC number (the actor slot / npcId, NOT the ObjType),
  // or null. Caches the result. Pixel→RGBA forces opaque alpha (portraits are full
  // images; u6pal's colourkey alpha is for tiles, not portraits).
  imageData(npcId) {
    if (this.cache.has(npcId)) return this.cache.get(npcId);
    const px = this._pixels(npcId);
    let img = null;
    if (px && this.palette) {
      img = new ImageData(W, H);
      const pal = this.palette, d = img.data;
      for (let i = 0; i < PIXELS; i++) {
        const c = px[i] * 4, di = i * 4;
        d[di] = pal[c]; d[di + 1] = pal[c + 1]; d[di + 2] = pal[c + 2]; d[di + 3] = 255;
      }
    }
    this.cache.set(npcId, img);
    return img;
  }

  // npcId -> {file, index} per C_2FC1_1C19 (seg_2FC1.c:734/755) — the a/b split for NPCs;
  // the Avatar (npcId 1) -> portrait.z[D_2CCB-1], where D_2CCB (this.avatarPortrait) is the
  // char-creation portrait choice from the objlist globals (I-18f). D_2CCB==0 (an uncreated
  // character, as in factory data) -> the clone falls back to a default male face (see _pixels);
  // source returns no portrait. a[0] is a generic mount, not an NPC (verified).
  _pixels(npcId) {
    if (npcId === 1) {                           // Avatar -> portrait.z[D_2CCB-1] (seg_2FC1.c:755)
      // D_2CCB is the char-creation portrait choice. In a real save it's 1-based and picks the
      // player's portrait. The clone loads *factory* U6 data (no char-creation flow), where D_2CCB
      // is 0 ("character not yet created" — the real game forces creation at seg_0903.c:594). So
      // 0 -> default to D_2CCB 7 (portrait.z[6]), a male face that matches the factory avatarSex
      // (D_2CCA 0 = male), giving the Avatar a sensible face instead of a blank box. A real save
      // (D_2CCB > 0) shows the player's actual portrait.
      const idx = (this.avatarPortrait || 7) - 1;
      return this.z.decode(idx);
    }
    let idx = npcId;
    if (idx) idx -= 1;                           // 1-based NPC -> 0-based (0 stays 0)
    if (idx >= 0x62) return this.b.decode(idx - 0x62);
    return this.a.decode(idx);
  }
}
