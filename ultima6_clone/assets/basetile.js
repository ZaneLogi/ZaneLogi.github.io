// BaseTile — maps an object number to its base tile index. The render tile for
// an object is `baseTile[objNumber] + frame` (source's TILE_FRAME macro, u6.h:285;
// legacy obj_manager.js:412 loadBaseTile). Decoded from the `basetile` file, a flat
// little-endian u16 table. This is tile-TYPE reference data shared by every object
// of a type, so it resolves objects' tiles at load time.

export class BaseTile {
  constructor(bytes) {
    const n = bytes.length >> 1;
    this.objToTile = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      this.objToTile[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    }
  }

  tileFor(objNumber, frame) { return this.objToTile[objNumber] + frame; }
}
