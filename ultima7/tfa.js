// === Single TFA entry view (temporary / debug use) ===
class TFAView {
  constructor(buffer = null, index = 0) {
    this.buffer = buffer;  // Uint8Array of TFA.DAT
    this.offset = index * 3;
  }

  setTarget(buffer, index) {
    this.buffer = buffer;
    this.offset = index * 3;
    return this;
  }

  // Access raw bytes
  get tfa1() { return this.buffer[this.offset]; }
  set tfa1(v) { this.buffer[this.offset] = v & 0xff; }

  get tfa2() { return this.buffer[this.offset + 1]; }
  set tfa2(v) { this.buffer[this.offset + 1] = v & 0xff; }

  get tfa3() { return this.buffer[this.offset + 2]; }
  set tfa3(v) { this.buffer[this.offset + 2] = v & 0xff; }

  // ----- tfa1 flags -----
  get hasSfx() { return (this.tfa1 & 0x01) !== 0; }
  get hasStrangeMovement() { return (this.tfa1 & 0x02) !== 0; }
  get isAnimated() { return (this.tfa1 & 0x04) !== 0; }
  get isSolid() { return (this.tfa1 & 0x08) !== 0; }
  get isWater() { return (this.tfa1 & 0x10) !== 0; }
  get shapeHeight() { return (this.tfa1 >> 5) & 0x07; }

  // ----- tfa2 flags -----
  get shapeClass() { return this.tfa2 & 0x0F; }
  get isPoisonousOrField() { return (this.tfa2 & 0x10) !== 0; }
  get isDoor() { return (this.tfa2 & 0x20) !== 0; }
  get isBargePart() { return (this.tfa2 & 0x40) !== 0; }
  get isTransparent() { return (this.tfa2 & 0x80) !== 0; }

  // ----- tfa3 flags -----
  get shapeXSize() { return (this.tfa3 & 0x07) + 1; }
  get shapeYSize() { return ((this.tfa3 >> 3) & 0x07) + 1; }
  get isLightSource() { return (this.tfa3 & 0x40) !== 0; }
  get hasTranslucency() { return (this.tfa3 & 0x80) !== 0; }

  // Debug
  toString() {
    return `TFAView(solid=${this.isSolid}, animated=${this.isAnimated}, height=${this.shapeHeight}, ` +
            `xSize=${this.shapeXSize}, ySize=${this.shapeYSize}, class=${this.shapeClass})`;
  }
}

// === High-performance TFA array wrapper ===
export class TFA {
  constructor() {}

  load(buffer) {
    if (!(buffer instanceof Uint8Array)) {
      if (buffer instanceof ArrayBuffer) {
        buffer = new Uint8Array(buffer);
      } else {
        throw new Error("TFAArray constructor requires Uint8Array or ArrayBuffer");
      }
    }

    if (buffer.length <= 0x400 * 3) {
      throw new Error("TFA.DAT must be greater than 1024 * 3 bytes");
    }

    this.buffer = buffer;
    this._viewCache = new TFAView(this.buffer, 0); // reusable view
  }

  get length() { return 0x400; }

  // --- Reusable view for iteration / rendering ---
  getReusableView(i) {
    return this._viewCache.setTarget(this.buffer, i);
  }

  // --- Debug / temporary fresh view ---
  getView(i) {
    return new TFAView(this.buffer, i);
  }
}

function createEnum(definition) {
  const forward = Object.freeze({ ...definition });
  const reverse = Object.freeze(
    Object.fromEntries(
      Object.entries(definition).map(([k, v]) => [v, k])
    )
  );

  return Object.freeze({
    ...forward, // expose keys as direct properties
    getName(value) {
      return reverse[value] ?? null;
    },
    getValue(name) {
      return forward[name] ?? null;
    }
  });
}

export const ShapeClass = createEnum({
  unusable: 0,          // Trees
  quality: 2,
  quantity: 3,          // Can have more than 1: coins, arrows
  hp: 4,                // Breakable items (if hp != 0)
  qualityFlags: 5,      // Item quality is set of flags
  container: 6,
  hatchable: 7,         // Eggs, traps, moongates
  spellbook: 8,
  barge: 9,
  virtueStone: 11,
  monster: 12,          // Non-human
  human: 13,            // Human NPCs
  building: 14          // Roof, window, mountain
});

// ShapeClass.monster;       // 12
// ShapeClass.getName(12);   // "monster"
// ShapeClass.getValue("hp") // 4

