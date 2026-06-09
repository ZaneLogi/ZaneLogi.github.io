// TileRegistry resource — the ~2048 tile definitions, keyed by tile ID:
// graphics (pixel decode), flags, palette, animation remap. This is tile-TYPE
// data shared across every object of a tile, so it lives here, not on per-entity
// Renderable components (see ../docs/architecture_ecs.md §4).
// The render layer (I-1c) reads pixels+palette to build the GPU atlas and flags
// for layer routing; this resource is GL-free.

export class TileRegistry {
  constructor({ tiles, flags, palette, anim = null, baseTile = null }) {
    this.tiles = tiles;       // Tiles      — pixel decode
    this.flags = flags;       // TileFlags  — per-tile flag bits
    this.palette = palette;   // Uint8Array(256*4) RGBA
    this.anim = anim;         // AnimData | null — animated-tile frame remap
    this.baseTile = baseTile; // BaseTile | null — objNumber -> base tile index
    this.animDirty = false;   // set each frame by TileAnimationSystem; read by render systems
  }

  pixels(tileId) { return this.tiles.getTilePixels(tileId); }

  // Render tile for an object: baseTile[objNumber] + frame (source TILE_FRAME).
  tileForObject(objNumber, frame) { return this.baseTile.tileFor(objNumber, frame); }

  isForeground(t)        { return this.flags.isForeground(t); }        // IsTileFor
  isBackground(t)        { return this.flags.isBackground(t); }        // IsTileBa — render bottom
  isDoubleHeight(t)      { return this.flags.isDoubleHeight(t); }      // IsTileDoubleV
  isDoubleWidth(t)       { return this.flags.isDoubleWidth(t); }       // IsTileDoubleH
  isBreakthrough(t)      { return this.flags.isBreakthrough(t); }      // IsTileBr — AI/movement, not render
  isTileIgnore(t)        { return this.flags.isTileIgnore(t); }        // IsTileIg
  isTerrainWet(t)        { return this.flags.isTerrainWet(t); }        // IsTerrainWet
  isTerrainImpassable(t) { return this.flags.isTerrainImpassable(t); } // IsTerrainImpass
  isTerrainWall(t)       { return this.flags.isTerrainWall(t); }       // IsTerrainWall
  isTerrainDamage(t)     { return this.flags.isTerrainDamage(t); }     // IsTerrainDamage
  terrainCost(t)         { return this.flags.terrainCost(t); }         // TerrainType[t] >> 4
}
