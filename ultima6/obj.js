class ObjStatus {
  static BIT = {
    OWNED:     0x01,
    INVISIBLE: 0x02,
    CHARMED:   0x04,
    CONTAINED: 0x08,
    INVENTORY: 0x10,
    LOCAL:     0x20,
    CURSED:    0x40,
    HATCHED:   0x40,
    MUTANT:    0x40,
    LIT:       0x80,

    EQUIPPED:  0x18, // CONTAINED | INVENTORY
    LOCXYZ:    0x00,
  };

  constructor(getter, setter) {
    this._get = getter;
    this._set = setter;
  }

  get value() { return this._get(); }
  set value(v) { this._set(v & 0xFF); }

  setCoordUse(v) { this.value = (this.value & ~ObjStatus.BIT.EQUIPPED) | (v); }
  getCoordUse() { return this.value & ObjStatus.BIT.EQUIPPED; }

  isOwned()     { return (this.value & ObjStatus.BIT.OWNED)     !== 0; }
  isInvisible() { return (this.value & ObjStatus.BIT.INVISIBLE) !== 0; }
  isCharmed()   { return (this.value & ObjStatus.BIT.CHARMED)   !== 0; }
  isContained() { return (this.value & ObjStatus.BIT.CONTAINED) !== 0; }
  isInventory() { return (this.value & ObjStatus.BIT.INVENTORY) !== 0; }
  isEquipped()  { return (this.value & ObjStatus.BIT.EQUIPPED)  !== 0; }
  isLocal()     { return (this.value & ObjStatus.BIT.LOCAL)     !== 0; }
  isCursed()    { return (this.value & ObjStatus.BIT.CURSED)    !== 0; }
  isHatched()   { return (this.value & ObjStatus.BIT.HATCHED)   !== 0; }
  isMutant()    { return (this.value & ObjStatus.BIT.MUTANT)    !== 0; }
  isLit()       { return (this.value & ObjStatus.BIT.LIT)       !== 0; }

  setOwned()     { this.value |= ObjStatus.BIT.OWNED; }
  setInvisible() { this.value |= ObjStatus.BIT.INVISIBLE; }
  setCharmed()   { this.value |= ObjStatus.BIT.CHARMED; }
  setContained() { this.value |= ObjStatus.BIT.CONTAINED; }
  setInventory() { this.value |= ObjStatus.BIT.INVENTORY; }
  setEquipped()  { this.value |= ObjStatus.BIT.EQUIPPED; }
  setLocal()     { this.value |= ObjStatus.BIT.LOCAL; }
  setCursed()    { this.value |= ObjStatus.BIT.CURSED; }
  setHatched()   { this.value |= ObjStatus.BIT.HATCHED; }
  setMutant()    { this.value |= ObjStatus.BIT.MUTANT; }
  setLit()       { this.value |= ObjStatus.BIT.LIT; }

  clrInvisible() { this.value &= ~ObjStatus.BIT.INVISIBLE; }
  clrCharmed()   { this.value &= ~ObjStatus.BIT.CHARMED; }
  clrContained() { this.value &= ~ObjStatus.BIT.CONTAINED; }
  clrInventory() { this.value &= ~ObjStatus.BIT.INVENTORY; }
  clrEquipped()  { this.value &= ~ObjStatus.BIT.EQUIPPED; }
  clrLocal()     { this.value &= ~ObjStatus.BIT.LOCAL; }
  clrCursed()    { this.value &= ~ObjStatus.BIT.CURSED; }
  clrHatched()   { this.value &= ~ObjStatus.BIT.HATCHED; }
  clrMutant()    { this.value &= ~ObjStatus.BIT.MUTANT; }
  clrLit()       { this.value &= ~ObjStatus.BIT.LIT; }
}


class ObjPos {
  constructor(dataView, byteOffset = 0) {
    this.view = dataView;
    this.offset = byteOffset;
  }

  get raw() {
    return this.view.getUint32(this.offset, true);
  }
  set raw(v) {
    this.view.setUint32(this.offset, v >>> 0, true);
  }

  get x() { return this.getCoordX(); }
  set x(value) { this.setCoordX(value); }
  get y() { return this.getCoordY(); }
  set y(value) { this.setCoordY(value); }
  get z() { return this.getCoordZ(); }
  set z(value) { this.setCoordZ(); }

  getCoordX() {
    return (this.raw >> 8) & 0x3FF;
  }
  setCoordX(x) {
    this.raw = (this.raw & ~(0x3FF << 8)) | ((x & 0x3FF) << 8);
  }

  getCoordY() {
    return (this.raw >> 18) & 0x3FF;
  }
  setCoordY(y) {
    this.raw = (this.raw & ~(0x3FF << 18)) | ((y & 0x3FF) << 18);
  }

  getCoordZ() {
    return (this.raw >> 28) & 0xF;
  }
  setCoordZ(z) {
    this.raw = (this.raw & ~(0xF << 28)) | ((z & 0xF) << 28);
  }
}

class ObjShapeType {
  constructor(dataView, byteOffset = 4) {
    this.view = dataView;
    this.offset = byteOffset;
  }

  get raw() {
    return this.view.getUint32(this.offset, true);
  }
  set raw(v) {
    this.view.setUint32(this.offset, v >>> 0, true);
  }

  get type() { return this.getType(); }
  set type(value) { this.setType(value); }
  get frame() { return this.getFrame(); }
  set frame(value) { this.setFrame(value); }

  getType() {
    return (this.raw >> 0) & 0x3FF;  // bits 0-9
  }
  setType(value) {
    this.raw = (this.raw & ~0x3FF) | (value & 0x3FF);
  }

  getFrame() {
    return (this.raw >> 10) & 0x3F;  // bits 10-15
  }
  setFrame(value) {
    this.raw = (this.raw & ~(0x3F << 10)) | ((value & 0x3F) << 10);
  }
}


class ObjAmount {
  constructor(dataView, byteOffset = 4) {
    this.view = dataView;
    this.offset = byteOffset;
  }

  get raw() {
    return this.view.getUint32(this.offset, true);
  }
  set raw(v) {
    this.view.setUint32(this.offset, v >>> 0, true);
  }

  get quantity() {
    return (this.raw >> 16) & 0xFF;
  }
  set quantity(v) {
    this.raw = (this.raw & ~(0xFF << 16)) | ((v & 0xFF) << 16);
  }

  get quality() {
    return (this.raw >> 24) & 0xFF;
  }
  set quality(v) {
    this.raw = (this.raw & ~(0xFF << 24)) | ((v & 0xFF) << 24);
  }

  // Optional: convenience methods to add/subtract quantity and quality with wrapping
  addQuantity(v) {
    this.quantity = (this.quantity + v + 256) % 256;
  }

  addQuality(v) {
    this.quality = (this.quality + v + 256) % 256;
  }

  subQuantity(v) {
    this.quantity = (this.quantity - v + 256) % 256;
  }

  subQuality(v) {
    this.quality = (this.quality - v + 256) % 256;
  }

  // Static pack method remains unchanged (optional utility)
  static pack(quality, quantity) {
    return ((quality & 0xFF) << 8) | (quantity & 0xFF);
  }
}


export class Obj {
  constructor(bufferOrFields, offset = 0) {
    if (bufferOrFields instanceof ArrayBuffer) {
      this.buffer = bufferOrFields.slice(offset, offset + 8);
    } else {
      this.buffer = new ArrayBuffer(8);
    }

    this.view = new DataView(this.buffer);

    this.objStatus = new ObjStatus(
      () => (this.view.getUint32(0, true) & 0xFF),
      (v) => {
        let low = this.view.getUint32(0, true);
        low = (low & ~0xFF) | (v & 0xFF);
        this.view.setUint32(0, low, true);
      }
    );

    this.objPos = new ObjPos(this.view, 0);
    Object.defineProperty(this, 'pos', {
      get: () => this.objPos,
      set: (v) => {
        if (typeof v === 'object' && v !== null) {
          if ('x' in v) this.objPos.setCoordX(v.x);
          if ('y' in v) this.objPos.setCoordY(v.y);
          if ('z' in v) this.objPos.setCoordZ(v.z);
        }
      }
    });

    this.objShapeType = new ObjShapeType(this.view, 4);
    Object.defineProperty(this, 'shape', {
      get: () => this.objShapeType,
      set: (v) => {
        if (typeof v === 'object' && v !== null) {
          if ('type' in v) this.objShapeType.setType(v.type);
          if ('frame' in v) this.objShapeType.setFrame(v.frame);
        }
      }
    });

    this.objAmount = new ObjAmount(this.view, 4);
    Object.defineProperty(this, 'amount', {
      get: () => this.objAmount,
      set: (v) => {
        if (typeof v === 'object' && v !== null) {
          if ('quality' in v) this.objAmount.quality = v.quality;
          if ('quantity' in v) this.objAmount.quantity = v.quantity;
        }
      }
    });

    Object.defineProperty(this, 'owner', {
      get: () => this.x,
      set: (v) => this.x = v,
    });

    Object.defineProperty(this, 'container', {
      get: () => this.x,
      set: (v) => this.x = v,
    });

    Object.defineProperty(this, 'inContainer', {
      get: () => this.status.isContained() && !this.status.isInventory(),
    });

    Object.defineProperty(this, 'inInventory', {
      get: () => this.status.isInventory(),
    });

    Object.defineProperty(this, 'status', {
      get: () => this.objStatus,
    });

    Object.defineProperty(this, 'x', {
      get: () => this.objPos.getCoordX(),
      set: (v) => this.objPos.setCoordX(v),
    });

    Object.defineProperty(this, 'y', {
      get: () => this.objPos.getCoordY(),
      set: (v) => this.objPos.setCoordY(v),
    });

    Object.defineProperty(this, 'z', {
      get: () => this.objPos.getCoordZ(),
      set: (v) => this.objPos.setCoordZ(v),
    });

    Object.defineProperty(this, 'obj_number', {
      get: () => this.shape.getType(),
      set: (v) => this.shape.setType(v),
    });
    Object.defineProperty(this, 'obj_frame', {
      get: () => this.shape.getFrame(),
      set: (v) => this.shape.setFrame(v),
    });

    // Proxy quantity and quality through amount
    Object.defineProperty(this, 'quantity', {
      get: () => this.amount.quantity,
      set: (v) => { this.amount.quantity = v; },
    });
    Object.defineProperty(this, 'quality', {
      get: () => this.amount.quality,
      set: (v) => { this.amount.quality = v; },
    });

    // Initialize fields from passed object (optional)
    if (typeof bufferOrFields === "object" && !(bufferOrFields instanceof ArrayBuffer)) {
      this.status.value = bufferOrFields.status ?? 0;
      this.x = bufferOrFields.x ?? 0;
      this.y = bufferOrFields.y ?? 0;
      this.z = bufferOrFields.z ?? 0;
      this.obj_number = bufferOrFields.obj_number ?? 0;
      this.obj_frame = bufferOrFields.obj_frame ?? 0;
      this.quantity = bufferOrFields.quantity ?? 0;
      this.quality = bufferOrFields.quality ?? 0;
    }
  }

  toString() {
    return `Obj {
      x: ${this.x}, y: ${this.y}, z: ${this.z},
      status: 0x${this.status.toString(16)},
      obj_number: ${this.obj_number},
      obj_frame: ${this.obj_frame},
      quantity: ${this.quantity},
      quality: ${this.quality}
    }`;
  }

  static fromBuffer(buffer, offset = 0) {
    return new Obj(buffer, offset);
  }

  toBuffer() {
    return this.buffer.slice(0);  // return a copy of buffer
  }

}
