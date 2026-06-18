// World tile-map decode: U6 `map` (superchunk + dungeon indices) + `chunks`
// (8x8 metatiles of tile ids). Copied-then-owned from ../ultima6/u6map.js.
// The viewport->tile lookup (worldTileIndex) lives on the MapLevel resource.

class SuperChunks {
  constructor(regions = 8, tilesPerRegion = 16) {
    this.regionSize = tilesPerRegion;          // 16
    this.gridSize = regions * tilesPerRegion;  // 128
    this.data = new Uint16Array(this.gridSize * this.gridSize);
  }
  _index(y, x) { return y * this.gridSize + x; }
  get(y, x) { return this.data[this._index(y, x)]; }
  set(y, x, v) { this.data[this._index(y, x)] = v; }
}

class DungeonChunks {
  constructor(zones = 5, height = 32, width = 32) {
    this.zones = zones; this.height = height; this.width = width;
    this.data = new Uint16Array(zones * height * width);
  }
  _index(z, y, x) { return z * this.height * this.width + y * this.width + x; }
  get(z, y, x) { return this.data[this._index(z, y, x)]; }
  set(z, y, x, v) { this.data[this._index(z, y, x)] = v; }
}

export class U6Map {
  constructor() {
    this.chunks = null;                         // Uint16Array, 64 tile ids per chunk
    this.superChunks = new SuperChunks();       // [128][128] overworld chunk ids
    this.dungeonChunks = new DungeonChunks();   // [5][32][32] dungeon chunk ids
  }

  // Required files: chunks, map.
  init(fileMap) {
    this.chunks = fileMap.get('chunks');
    const data = fileMap.get('map');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++)
        offset = this._readBlock(view, offset, col * 16, row * 16, (y, x, v) => this.superChunks.set(y, x, v));
    for (let level = 0; level < 5; level++)
      offset = this._readDungeon(view, offset, level);
  }

  // 16 rows x 16 cols of chunk ids, packed 2-per-3-bytes.
  _readBlock(view, offset, baseX, baseY, set) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x += 2) {
        const b0 = view.getUint8(offset++), b1 = view.getUint8(offset++), b2 = view.getUint8(offset++);
        set(baseY + y, baseX + x, b0 + ((b1 & 0x0f) << 8));
        set(baseY + y, baseX + x + 1, (b2 << 4) | (b1 >> 4));
      }
    }
    return offset;
  }

  _readDungeon(view, offset, level) {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x += 2) {
        const b0 = view.getUint8(offset++), b1 = view.getUint8(offset++), b2 = view.getUint8(offset++);
        this.dungeonChunks.set(level, y, x, b0 + ((b1 & 0x0f) << 8));
        this.dungeonChunks.set(level, y, x + 1, (b2 << 4) | (b1 >> 4));
      }
    }
    return offset;
  }
}
