// assets/converse.js
//
// Conversation-script loader (I-13d). NPC dialogue scripts live in two lib_32
// files converse.a / converse.b (LZW blocks), keyed by NPC number. Mirrors the
// I-12 portrait loader (assets/portrait.js): raw file bytes load at boot, a
// script is decompressed only on first talk, then cached. Source: LoadConversation
// (seg_2FC1.c:783) — id 0..0x62 -> .a[id]; 0x63..0xDF -> .b[id-0x63]; generic
// (>=0xE0: Wisp/Guard/Gargoyle) deferred. docs/research_i13_conversation_vm.md.

import { decompressCompressedFile } from './lzw.js';

// One lib_32: a uint32 offset table at byte 0 (count = firstNonZeroOffset/4), then
// per-NPC blocks. A 0 offset = no script for that NPC. A block is either LZW
// (4-byte inflated-size header < 0x2800, then stream — decompressCompressedFile)
// or stored raw (header >= 0x2800 or 0; script is the bytes after the header) —
// the same split LoadConversation makes (seg_2FC1.c:819-827).
class ConverseLib {
  constructor(bytes) {
    this.bytes = bytes || null;
    this.dv = null;
    this.count = 0;
    if (this.bytes && this.bytes.byteLength >= 4) this._parse();
  }
  _parse() {
    const b = this.bytes;
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let first = 0;
    for (let i = 0; i + 4 <= b.byteLength; i += 4) { const o = this.dv.getUint32(i, true); if (o !== 0) { first = o; break; } }
    this.count = Math.floor(first / 4);
  }
  _block(index) {
    if (!this.dv || index < 0 || index >= this.count) return null;
    const off = this.dv.getUint32(index * 4, true);
    if (off === 0) return null;
    let endOff = this.bytes.byteLength;                       // sentinel: EOF
    for (let i = index + 1; i < this.count; i++) { const o = this.dv.getUint32(i * 4, true); if (o !== 0) { endOff = o; break; } }
    return this.bytes.subarray(off, endOff);
  }
  decode(index) {
    const block = this._block(index);
    if (!block || block.byteLength < 4) return null;
    const size = (block[0] | (block[1] << 8) | (block[2] << 16) | (block[3] << 24)) >>> 0;
    try {
      if (size > 0 && size < 0x2800) return decompressCompressedFile(block);
      return block.subarray(4);                               // raw (uncompressed) script
    } catch { return null; }
  }
}

export class ConversationScripts {
  // { a, b } are the raw converse.a / converse.b bytes (Uint8Array | undefined).
  constructor({ a, b } = {}) {
    this.a = new ConverseLib(a);
    this.b = new ConverseLib(b);
    this.cache = new Map();   // npcId -> Uint8Array | null
  }
  // Decompressed script for an NPC number, or null (no script / out of range /
  // generic-deferred). Cached (decode-once).
  get(npcId) {
    if (this.cache.has(npcId)) return this.cache.get(npcId);
    let script = null;
    if (npcId >= 0 && npcId <= 0x62) script = this.a.decode(npcId);
    else if (npcId >= 0x63 && npcId <= 0xdf) script = this.b.decode(npcId - 0x63);
    // npcId >= 0xe0 (generic Wisp/Guard/Gargoyle) deferred — research_i13_conversation_vm.md.
    this.cache.set(npcId, script);
    return script;
  }
  has(npcId) { return this.get(npcId) != null; }
}
