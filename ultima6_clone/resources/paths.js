// Paths resource (I-9c) — per-NPC pathfinding state, keyed by entity handle.
// Replaces source's 8-slot shared pool (PathObject[8] / PathCounter[8] /
// PathTries[8] + the D_8C42 RLE buffer): under the per-NPC window model (Zane's
// 2026-06-01 call), each NPC owns its path, so a handle-keyed Map is the natural
// store and there's no fixed slot ceiling.
//
//   dirs    — the planned route as a plain 4-dir array (0=N 1=E 2=S 3=W), from
//             findPath. No RLE: each entry is exactly one step (source's repeat-count
//             packing is dropped, so PathTries is unneeded — `counter` indexes dirs).
//   counter — index of the next step to take.
//   goalX/Y — the destination this path was built toward (so doOnPath can tell
//             "arrived" from "path ran out at the window edge -> re-plan").
//
// Source kept a global cap of 8 concurrent paths (a feel throttle on how many NPCs
// walk vs teleport at once). Under per-NPC storage there's no storage reason for a
// cap; whether to re-impose one as a deliberate gameplay throttle is an I-9d/f
// tuning decision, not a storage constraint — see progress.md §"I-9 scope".

export class Paths {
  constructor() {
    this.byHandle = new Map();   // handle -> { dirs, counter, goalX, goalY }
  }

  set(handle, dirs, goalX, goalY) {
    this.byHandle.set(handle, { dirs, counter: 0, goalX, goalY });
    return this.byHandle.get(handle);
  }

  get(handle) { return this.byHandle.get(handle); }
  has(handle) { return this.byHandle.has(handle); }
  delete(handle) { return this.byHandle.delete(handle); }
  get size() { return this.byHandle.size; }
}
