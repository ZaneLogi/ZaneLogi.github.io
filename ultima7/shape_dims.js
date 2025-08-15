// === Single SHPDIM entry view (temporary / debug use) ===
class ShapeDimView {
  constructor(buffer = null, index = 0) {
    this.buffer = buffer;    // Uint8Array of SHPDIMS.DAT
    this.offset = index * 2; // each SHPDIM is 2 bytes
  }

  setTarget(buffer, index) {
    this.buffer = buffer;
    this.offset = index * 2;
    return this;
  }

  // Access raw bytes
  get byte0() { return this.buffer[this.offset]; }
  set byte0(v) { this.buffer[this.offset] = v & 0xff; }

  get byte1() { return this.buffer[this.offset + 1]; }
  set byte1(v) { this.buffer[this.offset + 1] = v & 0xff; }

  // ----- bitfields -----
  get yObstacle() { return (this.byte0 & 0x01) !== 0; }
  set yObstacle(v) { this.byte0 = (this.byte0 & ~0x01) | (v ? 1 : 0); }

  get yDim() { return this.byte0 >> 1; }
  set yDim(v) { this.byte0 = ((v & 0x7f) << 1) | (this.byte0 & 0x01); }

  get xObstacle() { return (this.byte1 & 0x01) !== 0; }
  set xObstacle(v) { this.byte1 = (this.byte1 & ~0x01) | (v ? 1 : 0); }

  get xDim() { return this.byte1 >> 1; }
  set xDim(v) { this.byte1 = ((v & 0x7f) << 1) | (this.byte1 & 0x01); }

  toString() {
    return `ShapeDimView(xDim=${this.xDim}, yDim=${this.yDim}, xObs=${this.xObstacle}, yObs=${this.yObstacle})`;
  }
}

// === High-performance SHPDIMS array wrapper ===
export class ShapeDims {
  constructor() {}

  load(buffer) {
    if (!(buffer instanceof Uint8Array)) {
      if (buffer instanceof ArrayBuffer) {
        buffer = new Uint8Array(buffer);
      } else {
        throw new Error("ShapeDims constructor requires Uint8Array or ArrayBuffer");
      }
    }

    if (buffer.length < 0x036a * 2) {
      throw new Error("SHPDIMS.DAT must be at least 874 * 2 bytes");
    }

    this.buffer = buffer;
    this._viewCache = new ShapeDimView(this.buffer, 0); // reusable view
  }

  get length() { return 0x036a; }

  // --- Reusable view for iteration / fast access ---
  getReusableView(i) {
    return this._viewCache.setTarget(this.buffer, i);
  }

  // --- Temporary fresh view (debug / occasional use) ---
  getView(i) {
    return new ShapeDimView(this.buffer, i);
  }
}
