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
    this.loadedRegions = new Set();  // surface region ids whose OBJBLK has been loaded
    this.loadedDungeons = new Set(); // dungeon levels (1..5) whose OBJBLK has been loaded (I-19c)
    this.dirty = true;               // a render rebuild is needed (set on insert)
  }

  key(x, y) { return y * this.width + x; }

  // Append at the cell's chain TAIL. Used by INITIAL LOAD (loadRegion), where
  // records iterate in OBJBLK file order — pushing in that order makes
  // spatial.at[0] = first-loaded = chain head, matching source's
  // __ObjectsDeserialize merge (the inner-while-loop preserves file order for
  // the batch; first-in-file lands at the head position; seg_1184.c:1370+).
  insert(x, y, handle) {
    const k = this.key(x, y);
    const arr = this.cells.get(k);
    if (arr) arr.push(handle);
    else this.cells.set(k, [handle]);
    this.dirty = true;               // a region streamed in / object moved -> render rebuilds
  }

  // Insert at the cell's chain HEAD. Used by RUNTIME MOVE/DROP (NPC schedule
  // snap, avatar step, GET/DROP, throw, magic teleport) — anything that mirrors
  // source's AddMapObj (seg_1184.c:658-659) or MoveObj (seg_1184.c:971-973),
  // both of which splice the arriving object at the chain head of the
  // destination cell. The U6 design intent: the most-recently-placed entity
  // sits at the chain head and gets picked first by FindLoc (= our forward
  // iteration of spatial.at), so LOOK/USE target what the player just did.
  insertAtHead(x, y, handle) {
    const k = this.key(x, y);
    const arr = this.cells.get(k);
    if (arr) arr.unshift(handle);
    else this.cells.set(k, [handle]);
    this.dirty = true;
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
