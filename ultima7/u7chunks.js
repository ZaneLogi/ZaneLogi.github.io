// === Single shape ID view (debug / inspection only) ===
class ShapeIDView {
  constructor(uint16Buffer = null, index = 0) {
    this.buffer = uint16Buffer;
    this.index = index;
  }

  setTarget(uint16Buffer, index) {
    this.buffer = uint16Buffer;
    this.index = index;
    return this;
  }

  decode(out) {
    const v = this.buffer[this.index];
    out.type = v & 0x03ff;
    out.frame = (v >> 10) & 0x1f;
    out.reflected = (v >> 15) & 1;
  }

  get value() {
    return this.buffer[this.index];
  }
  set value(v) {
    this.buffer[this.index] = v & 0xffff;
  }

  get type() {
    return this.value & 0x03ff;
  }
  set type(v) {
    let val = this.buffer[this.index];
    val = (val & ~0x03ff) | (v & 0x03ff);
    this.buffer[this.index] = val;
  }

  get frame() {
    return (this.value >> 10) & 0x1f;
  }
  set frame(v) {
    let val = this.buffer[this.index];
    val = (val & ~0x7c00) | ((v & 0x1f) << 10);
    this.buffer[this.index] = val;
  }

  get reflected() {
    return (this.value >> 15) & 1;
  }
  set reflected(v) {
    let val = this.buffer[this.index];
    val = (val & ~0x8000) | ((v & 1) << 15);
    this.buffer[this.index] = val;
  }

  toString() {
    return `ShapeID(type=${this.type}, frame=${this.frame}, reflected=${this.reflected}, value=0x${this.value.toString(16)})`;
  }
}

// === High-performance array wrapper ===
class ShapeIDArray {
  constructor(buffer) {
    if (buffer instanceof Uint16Array) {
      this.buffer = buffer;
    } else if (buffer instanceof Uint8Array) {
      if (buffer.length % 2 !== 0) {
        throw new Error("Uint8Array length must be multiple of 2");
      }
      this.buffer = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    } else {
      throw new Error("buffer must be Uint8Array or Uint16Array");
    }
  }

  get length() { return this.buffer.length; }

  decodeAt(index, out) {
    const v = this.buffer[index];
    out.type = v & 0x03ff;
    out.frame = (v >> 10) & 0x1f;
    out.reflected = (v >> 15) & 1;
  }

  encodeAt(index, type, frame, reflected) {
    this.buffer[index] =
      type & 0x03ff |
      ((frame & 0x1f) << 10) |
      ((reflected & 1) << 15);
  }

  getValue(i)      { return this.buffer[i]; }
  setValue(i, v)   { this.buffer[i] = v & 0xffff; }

  // --- Debug-friendly API ---
  // Creates a new ShapeIDView (slow, avoid in hot loops)
  getView(i) {
    if (i < 0 || i >= this.buffer.length) {
      throw new RangeError("Index out of bounds");
    }
    return new ShapeIDView(this.buffer, i);
  }
}

const TILES_PER_CHUNK = 16;
const CHUNK_TILE_COUNT = TILES_PER_CHUNK * TILES_PER_CHUNK;

class U7Chunk {
  constructor(shapeArray) {
    this.shapeArray = shapeArray;
  }

  // get a tile ShapeID from the chunk (x, y: 0~15)
  get(x, y, out) {
    this.shapeArray.decodeAt(y * TILES_PER_CHUNK + x, out);
  }

  // set a tile in the chunk
  set(x, y, type, frame, reflected) {
    this.shapeArray.encodeAt(y * TILES_PER_CHUNK + x, type, frame, reflected);
  }
}

export class U7Chunks {
  constructor() {}

  load(uint8Buffer) {
    // Wrap as ShapeIDArray
    this.shapeIDs = new ShapeIDArray(uint8Buffer);

    // total chunk count
    this.chunkCount = this.shapeIDs.length / CHUNK_TILE_COUNT;
    this.chunks = new Array(this.chunkCount);

    for (let i = 0; i < this.chunkCount; i++) {
      const start = i * CHUNK_TILE_COUNT;
      const end = start + CHUNK_TILE_COUNT;
      const sub = new ShapeIDArray(this.shapeIDs.buffer.subarray(start, end));
      this.chunks[i] = new U7Chunk(sub);
    }
  }

  // get the sub-section for a chunk
  getChunk(chunkIndex) {
    if (chunkIndex < 0 || chunkIndex >= this.chunkCount) {
      throw new RangeError("Chunk index out of range");
    }
    return this.chunks[chunkIndex];
  }
}
