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

  // Remove a handle from (x, y)'s cell. No-op if absent. Used when an entity
  // moves between cells — caller pairs it with insert() at the new position.
  // Drops the cell entry entirely if it becomes empty, so cells.size still
  // reflects "cells holding at least one entity".
  remove(x, y, handle) {
    const k = this.key(x, y);
    const arr = this.cells.get(k);
    if (!arr) return false;
    const idx = arr.indexOf(handle);
    if (idx === -1) return false;
    arr.splice(idx, 1);
    if (arr.length === 0) this.cells.delete(k);
    this.dirty = true;
    return true;
  }

  // entity handle[] at a cell, or undefined if empty.
  at(x, y) { return this.cells.get(this.key(x, y)); }

  // Is the OBJBLK region containing (x, y) currently loaded? Used by the NPC
  // schedule system (I-5) as the "active area" predicate — NPCs outside any
  // loaded region get no schedule updates (their data isn't in memory yet).
  // Inlines world_loader's regionId(col, row) formula to keep this self-
  // contained: col = x >> 7, row = y >> 7, id = col | (row << 3) for an 8×8
  // grid of 128×128-tile regions. Valid for the 1024-wide overworld.
  hasRegionAt(x, y) {
    const id = ((x >> 7) & 7) | (((y >> 7) & 7) << 3);
    return this.loadedRegions.has(id);
  }
}
