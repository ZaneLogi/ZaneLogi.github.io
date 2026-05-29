// TileRegistry resource — the ~2048 tile definitions, keyed by tile ID:
// graphics (pixel decode), flags, palette, animation remap. This is tile-TYPE
// data shared across every object of a tile, so it lives here, not on per-entity
// Renderable components (see ../docs/architecture_ecs.md §4).
// The render layer (I-1c) reads pixels+palette to build the GPU atlas and flags
// for layer routing; this resource is GL-free.

export class TileRegistry {
  constructor({ tiles, flags, palette, anim = null }) {
    this.tiles = tiles;       // Tiles      — pixel decode
    this.flags = flags;       // TileFlags  — per-tile flag bits
    this.palette = palette;   // Uint8Array(256*4) RGBA
    this.anim = anim;         // AnimData | null — animated-tile frame remap
  }

  pixels(tileId) { return this.tiles.getTilePixels(tileId); }

  isTopTile(t)        { return this.flags.isTopTile(t); }
  isDoubleHeight(t)   { return this.flags.isDoubleHeight(t); }
  isDoubleWidth(t)    { return this.flags.isDoubleWidth(t); }
  isForceLowerTile(t) { return this.flags.isForceLowerTile(t); }
}
