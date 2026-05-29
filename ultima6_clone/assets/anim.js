// Animated-tile frame remap: U6 `animdata` drives a tile-id -> current-frame-id
// table (~29 entries: water, fountains, flags, fields, NPCs). Copied-then-owned
// from ../ultima6/anim_data_manager.js as an instantiable class. The render layer
// advances frames; this just decodes and computes the per-frame remap.

const TILE_COUNT = 2048;

export class AnimData {
  constructor() {
    this.tileIndexMap = Uint16Array.from({ length: TILE_COUNT }, (_, i) => i);
    this.data = null;
  }

  init(animdata) { this.data = this._parse(animdata); }

  _parse(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    const count = view.getUint16(offset, true); offset += 2;
    const readU16 = (n) => { const a = new Uint16Array(n); for (let i = 0; i < n; i++) { a[i] = view.getUint16(offset, true); offset += 2; } return a; };
    const readU8 = (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = view.getUint8(offset++); return a; };
    const tile_to_animate = readU16(0x20);
    const first_anim_frame = readU16(0x20);
    const and_masks = readU8(0x20);
    const shift_values = readU8(0x20);
    return { count, tile_to_animate, first_anim_frame, and_masks, shift_values };
  }

  // Advance to `frame`; returns the set of tile ids whose frame changed.
  update(frame) {
    if (!this.data) return new Set();
    const { count, tile_to_animate, first_anim_frame, and_masks, shift_values } = this.data;
    const changed = new Set();
    for (let i = 0; i < count; i++) {
      const cur = (frame & and_masks[i]) >> shift_values[i];
      const target = tile_to_animate[i];
      const source = first_anim_frame[i] + cur;
      if (this.tileIndexMap[target] !== source) {
        this.tileIndexMap[target] = source;
        changed.add(target);
      }
    }
    return changed;
  }
}
