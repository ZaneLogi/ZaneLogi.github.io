export const AnimDataManager = {
  tileIndexMap: Uint16Array.from({ length: 2048 }, (_, i) => i),
  data: null,

  init(fileMap) {
    const animMaskData = fileMap.get("animdata");
    this.data = this.parseAnimData(animMaskData);
  },

  parseAnimData(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    const number_of_tiles_to_animate = view.getUint16(offset, true); offset += 2;

    const tile_to_animate = new Uint16Array(0x20);
    for (let i = 0; i < 0x20; i++) {
      tile_to_animate[i] = view.getUint16(offset, true);
      offset += 2;
    }

    const first_anim_frame = new Uint16Array(0x20);
    for (let i = 0; i < 0x20; i++) {
      first_anim_frame[i] = view.getUint16(offset, true);
      offset += 2;
    }

    const and_masks = new Uint8Array(0x20);
    for (let i = 0; i < 0x20; i++) {
      and_masks[i] = view.getUint8(offset++);
    }

    const shift_values = new Uint8Array(0x20);
    for (let i = 0; i < 0x20; i++) {
      shift_values[i] = view.getUint8(offset++);
    }

    return {
      number_of_tiles_to_animate,
      tile_to_animate,
      first_anim_frame,
      and_masks,
      shift_values
    };
  },

  update(frame) {
    if (this.data === null) return new Set();

    const {
      number_of_tiles_to_animate,
      tile_to_animate,
      first_anim_frame,
      and_masks,
      shift_values
    } = this.data;

    const changed = new Set();

    for (let i = 0; i < number_of_tiles_to_animate; i++) {
      const mask = and_masks[i];
      const shift = shift_values[i];

      const current_anim_frame = (frame & mask) >> shift;

      const target_index = tile_to_animate[i];
      const source_index = first_anim_frame[i] + current_anim_frame;

      if (this.tileIndexMap[target_index] !== source_index) {
        this.tileIndexMap[target_index] = source_index;
        changed.add(target_index);
      }
    }

    return changed;
  },
};
