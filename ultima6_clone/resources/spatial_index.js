// SpatialIndex resource — "what entities are at cell (x,y)". A sparse
// Map<packedXY -> entity[]>, the ECS replacement for source's MapObjPtr[40][40] +
// sorted Link[] (research_world_data.md). Only occupied cells get an entry, so size
// tracks object count, not the 1024x1024 map. The render walks visible cells and
// does one O(1) lookup per cell (never scans the object stores).
//
// Also tracks loadedRegions so the demand-load loader is idempotent (architecture_ecs.md §7).
// Overworld only for now (1024-wide key); dungeon levels get their own handling later.

export class SpatialIndex {
  constructor(worldWidth = 1024) {
    this.width = worldWidth;
    this.cells = new Map();          // y*width + x  ->  entity handle[]
    this.loadedRegions = new Set();  // region ids whose OBJBLK has been loaded
    this.dirty = true;               // a render rebuild is needed (set on insert)
  }

  key(x, y) { return y * this.width + x; }

  insert(x, y, handle) {
    const k = this.key(x, y);
    const arr = this.cells.get(k);
    if (arr) arr.push(handle);
    else this.cells.set(k, [handle]);
    this.dirty = true;               // a region streamed in / object moved -> render rebuilds
  }

  // entity handle[] at a cell, or undefined if empty.
  at(x, y) { return this.cells.get(this.key(x, y)); }
}
