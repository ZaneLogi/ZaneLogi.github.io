import { isSolid } from "./tiles.js";

export class LevelMap {
  constructor(tileData, tileSize = 16) {
    this.tileData = tileData; // 2D array of tile IDs
    this.tileSize = tileSize;
  }

  // Convert world position -> tile index
  worldToTile(x, y) {
    return {
      tx: Math.floor(x / this.tileSize),
      ty: Math.floor(y / this.tileSize)
    };
  }

  // Return true if the tile at (x, y) is solid, per the TILES table.
  isSolidAt(x, y) {
    const { tx, ty } = this.worldToTile(x, y);
    return isSolid(this.tileData[ty]?.[tx]);
  }

  // Overwrite the tile id at a grid cell (e.g. a ? block becoming a used block).
  setTile(tx, ty, id) {
    if (this.tileData[ty]) this.tileData[ty][tx] = id;
  }

  // Return bounding box of a tile
  getTileRect(tx, ty) {
    return {
      x: tx * this.tileSize,
      y: ty * this.tileSize,
      w: this.tileSize,
      h: this.tileSize
    };
  }
}