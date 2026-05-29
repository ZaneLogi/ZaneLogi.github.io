// MapLevel resource — the terrain A-grid for one level (overworld or a dungeon),
// plus the viewport->tile lookup. Wraps the decoded U6Map. The lookup is ported
// from the legacy port's worldTileIndex/dungeonTileIndex (../ultima6/map_viewer.js:129).
// level 0 = overworld (1024x1024 wrap, 128x128 superchunks); 1..5 = dungeons (256 wrap).

export class MapLevel {
  constructor(u6map, level = 0) {
    this.map = u6map;
    this.level = level;
  }

  worldTileIndex(xtile, ytile) {
    const x = ((xtile % 1024) + 1024) % 1024;
    const y = ((ytile % 1024) + 1024) % 1024;
    const chunk = this.map.superChunks.get(y >> 3, x >> 3);
    return this.map.chunks[chunk * 64 + (y & 7) * 8 + (x & 7)];
  }

  dungeonTileIndex(xtile, ytile, level) {
    const x = ((xtile % 256) + 256) % 256;
    const y = ((ytile % 256) + 256) % 256;
    const chunk = this.map.dungeonChunks.get(level - 1, y >> 3, x >> 3);
    return this.map.chunks[chunk * 64 + (y & 7) * 8 + (x & 7)];
  }

  // tile id at a world cell on this level (the render/camera entry point).
  tileAt(xtile, ytile) {
    return this.level === 0
      ? this.worldTileIndex(xtile, ytile)
      : this.dungeonTileIndex(xtile, ytile, this.level);
  }
}
