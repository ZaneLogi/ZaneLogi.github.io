class SuperChunks {
  constructor(regions = 8, tilesPerRegion = 16) {
    this.regionSize = tilesPerRegion; // 16
    this.gridSize = regions * tilesPerRegion; // 128
    this.data = new Uint16Array(this.gridSize * this.gridSize);
  }

  // Convert tile coordinate to flat index
  _index(y, x) {
    if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) {
      throw new RangeError(`Out of bounds: y=${y}, x=${x}`);
    }
    return y * this.gridSize + x;
  }

  // Optional: from region and tile inside region
  _indexFromRegion(regionY, regionX, tileY, tileX) {
    const y = regionY * this.regionSize + tileY;
    const x = regionX * this.regionSize + tileX;
    return this._index(y, x);
  }

  // Accessors
  get(y, x) {
    return this.data[this._index(y, x)];
  }

  set(y, x, value) {
    this.data[this._index(y, x)] = value;
  }

  getFromRegion(regionY, regionX, tileY, tileX) {
    return this.data[this._indexFromRegion(regionY, regionX, tileY, tileX)];
  }

  setFromRegion(regionY, regionX, tileY, tileX, value) {
    this.data[this._indexFromRegion(regionY, regionX, tileY, tileX)] = value;
  }

  fill(value) {
    this.data.fill(value);
  }
}

class DungeonChunks {
  constructor(zones = 5, height = 32, width = 32) {
    this.zones = zones;
    this.height = height;
    this.width = width;
    this.data = new Uint16Array(zones * height * width);
  }

  // Calculate the flat index in the 1D TypedArray
  _index(z, y, x) {
    if (
      z < 0 || z >= this.zones ||
      y < 0 || y >= this.height ||
      x < 0 || x >= this.width
    ) {
      throw new RangeError(`Out of bounds: z=${z}, y=${y}, x=${x}`);
    }
    return z * this.height * this.width + y * this.width + x;
  }

  get(z, y, x) {
    return this.data[this._index(z, y, x)];
  }

  set(z, y, x, value) {
    this.data[this._index(z, y, x)] = value;
  }

  fill(value) {
    this.data.fill(value);
  }
}


export class U6Map {
  constructor() {
    this.chunks;
    this.superChunks = new SuperChunks();   // superchunks[128][128]
    this.dungeonChunks = new DungeonChunks(); // dungeon_chunks[5][32][32]
  }

  init(fileMap) {
    this.chunks = fileMap.get("chunks");

    const data = fileMap.get("map");
    const view = new DataView(data.buffer);
    let offset = 0;

    // Load 8x8 superchunks
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        offset = this.createSuperchunk(view, offset, col, row);
      }
    }

    // Load 5 dungeon levels
    for (let level = 0; level < 5; level++) {
      offset = this.createDungeon(view, offset, level);
    }
  }

  createSuperchunk(view, offset, sx, sy) {
    const baseX = sx * 16;
    const baseY = sy * 16;

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x += 2) {
        const b0 = view.getUint8(offset++);
        const b1 = view.getUint8(offset++);
        const b2 = view.getUint8(offset++);

        const index1 = b0 + ((b1 & 0x0F) << 8);
        const index2 = (b2 << 4) | (b1 >> 4);

        this.superChunks.set(baseY + y, baseX + x, index1);
        this.superChunks.set(baseY + y, baseX + x + 1, index2);
      }
    }

    return offset;
  }

  createDungeon(view, offset, level) {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x += 2) {
        const b0 = view.getUint8(offset++);
        const b1 = view.getUint8(offset++);
        const b2 = view.getUint8(offset++);

        const index1 = b0 + ((b1 & 0x0F) << 8);
        const index2 = (b2 << 4) | (b1 >> 4);

        this.dungeonChunks.set(level, y, x, index1);
        this.dungeonChunks.set(level, y, x + 1, index2);
      }
    }

    return offset;
  }
}