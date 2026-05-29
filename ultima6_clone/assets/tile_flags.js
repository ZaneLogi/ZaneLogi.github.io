// Per-tile flag table, keyed by tile ID (0..2047). Decoded from the U6 `tileflag`
// file; layout from the legacy port's loadTileFlag (../ultima6/obj_manager.js):
// three byte-planes — flags1 at [0], flags2 at [0x800], flags3 at [0x1400].
// flags2 carries top-tile / double-size bits; flags3 carries force-lower.
// These flags are tile-type data (shared across all objects of a tile), so they
// live here in the registry, not on per-entity Renderable components.

const TILE_COUNT = 2048;

export class TileFlags {
  constructor(tileflagData) {
    this.flags1 = new Uint8Array(TILE_COUNT);
    this.flags2 = new Uint8Array(TILE_COUNT);
    this.flags3 = new Uint8Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) {
      this.flags1[i] = tileflagData[i];
      this.flags2[i] = tileflagData[0x800 + i];
      this.flags3[i] = tileflagData[0x1400 + i];
    }
  }

  isTopTile(t)        { return (this.flags2[t] & 0x10) !== 0; }
  isBoundary(t)       { return (this.flags2[t] & 0x0c) !== 0; } // 0x04 | 0x08
  isDoubleHeight(t)   { return (this.flags2[t] & 0x40) !== 0; }
  isDoubleWidth(t)    { return (this.flags2[t] & 0x80) !== 0; }
  isForceLowerTile(t) { return (this.flags3[t] & 0x04) !== 0; }
}
