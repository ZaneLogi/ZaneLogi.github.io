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

  // Return true if the tile at (x, y) is solid
  isSolidAt(x, y) {
    const { tx, ty } = this.worldToTile(x, y);
    const tileId = this.tileData[ty]?.[tx];
    return tileId !== 0; // example: 0 = empty, >0 = solid
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