// NPC pathfinding (I-9) — cost map (this file, I-9a) + bucket-Dijkstra search
// (I-9b lands `findPath` below). Port of source's `__ComputeResistance`
// (C_1E0F_436A, seg_1E0F.c:1866-1922) and the bucket-priority search C_1E0F_2D37.
//
// The cost map and the search are deliberately split: `computeResistance` builds
// the per-cell movement-cost grid (all the U6-specific gameplay logic lives here),
// and the search (I-9b) walks that grid. Swapping the search (e.g. bucket-Dijkstra
// -> A*) is then a contained change to the search alone — the cost grid and every
// downstream consumer (path-follow, the AI state machine, facing) are untouched.
//
// Work area: a 40x40 tile window (AREA_W = AREA_H = 40, source's DOS active-area
// paging limit) centered on a map position. Kept as a gameplay-faithful radius per
// CLAUDE.md §"Modern-browser UX" + the note-branch I-8 warm-up (schedule data + NPC
// pacing + off-area teleport are all tuned against it). See research_npc_ai.md
// §"Pathfinding".

import { TileRegistry } from '../resources/tile_registry.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { ObjType, Renderable, Actor } from '../components/components.js';
import { forEachOccupiedCell } from './tile_footprint.js';

export const AREA = 40;          // AREA_W = AREA_H (seg_1E0F.c)
const IMPASS = 0xff;             // 0xff = "can't path through this cell"

// Door object range + the two pass-through object types (obj.h). Doors encode
// open/closed/locked in the FRAME: 0-3 open, 4-7 closed-unlocked, 8-11 locked,
// 12-15 magically locked (C_27A1_2A44). frame<8 is routable, frame>=8 blocks.
const OBJ_DOOR_LO = 0x129, OBJ_DOOR_HI = 0x12c;
const OBJ_PASS_A = 0x116, OBJ_PASS_B = 0x118;

// Build the 40x40 cost grid centered on (centerX, centerY). Returns the grid plus
// the work-area origin (so callers can convert world<->area coords) and a costAt
// helper. Each cell holds a movement cost 1..0x7f, or IMPASS (0xff).
//
// Source: __ComputeResistance (seg_1E0F.c:1866-1922). Two passes —
//   1. base terrain: impassable -> 0xff, else (TerrainType>>4)+1.
//   2. objects in the window add cost: doors, pass-throughs, and the per-tile
//      footprint spread of every other map object.
// NPCs are deliberately NOT obstacles in the cost map (source only spreads object
// slots >= 0x100; NPC slots < 0x100 are skipped). NPC-vs-NPC blocking is resolved
// at per-step move time, where a blocked NPC escalates AI_84/85/86 and re-paths.
export function computeResistance(world, centerX, centerY) {
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);
  const mapLevel = world.getResource(MapLevel);
  const ot = world.store(ObjType);
  const rend = world.store(Renderable);

  // Work-area origin: (center - 16) snapped down to a multiple of 8, masked to the
  // 1024 overworld wrap (seg_1E0F.c:1871-1872, `(MapX - 0x10) & 0x3f8`).
  const originX = (centerX - 0x10) & 0x3f8;
  const originY = (centerY - 0x10) & 0x3f8;

  const grid = new Uint8Array(AREA * AREA);
  const idx = (ax, ay) => ay * AREA + ax;

  // Pass 1 — base terrain (seg_1E0F.c:1874-1882).
  for (let ay = 0; ay < AREA; ay++) {
    for (let ax = 0; ax < AREA; ax++) {
      const tile = mapLevel.tileAt(originX + ax, originY + ay);
      grid[idx(ax, ay)] = reg.isTerrainImpassable(tile) ? IMPASS : reg.terrainCost(tile) + 1;
    }
  }

  // C_1E0F_4265 (seg_1E0F.c:1850-1864) — spread one object tile's resistance into a
  // cell. Guarded to the grid: source guards area_x/area_y > 0 before spreading NW;
  // here every cell is bounds-checked so the footprint extensions clip at the edge.
  function spread(tile, ax, ay) {
    if (ax < 0 || ay < 0 || ax >= AREA || ay >= AREA) return;
    const cur = grid[idx(ax, ay)];
    if (cur === IMPASS) {
      // Impassable base: a non-impassable object tile only "rescues" a WET cell
      // (e.g. a plank / raft over water makes it walkable at the object's own cost).
      const baseTile = mapLevel.tileAt(originX + ax, originY + ay);
      if (reg.isTerrainWet(baseTile) && !reg.isTerrainImpassable(tile))
        grid[idx(ax, ay)] = reg.terrainCost(tile) + 1;
    } else if (reg.isTerrainImpassable(tile)) {
      grid[idx(ax, ay)] = IMPASS;
    } else if (!reg.isTerrainWall(tile)) {
      let v = cur + reg.terrainCost(tile);
      if (v > IMPASS) v = IMPASS;
      grid[idx(ax, ay)] = v;
    }
    // IsTerrainWall objects add no extra cost (a wall sits on its own impassable
    // tile already handled, or is a foreground decoration) — source's final `else`
    // is empty.
  }

  // Pass 2 — objects (seg_1E0F.c:1884-1921). Iterate entity anchors in the window.
  for (let ay = 0; ay < AREA; ay++) {
    for (let ax = 0; ax < AREA; ax++) {
      const ents = spatial.at(originX + ax, originY + ay);
      if (!ents) continue;
      for (const handle of ents) {
        const i = world.resolve(handle);
        if (i === -1) continue;
        const objNum = ot.objNumber[i];
        const tile = rend.tileId[i];

        if (objNum >= OBJ_DOOR_LO && objNum <= OBJ_DOOR_HI) {
          // Door: frame<8 routable (+1 cost), frame>=8 locked (block). Either way
          // also block the cell BEHIND so a pathing NPC approaches it head-on: a
          // DoubleV door faces N/S (behind = the cell to the N), else faces E/W
          // (behind = the cell to the W). seg_1E0F.c:1889-1900.
          if (ot.frame[i] < 8 && grid[idx(ax, ay)] < IMPASS) grid[idx(ax, ay)]++;
          else grid[idx(ax, ay)] = IMPASS;
          if (reg.isDoubleHeight(tile)) { if (ay > 0) grid[idx(ax, ay - 1)] = IMPASS; }
          else                          { if (ax > 0) grid[idx(ax - 1, ay)] = IMPASS; }
        } else if (objNum === OBJ_PASS_A || objNum === OBJ_PASS_B) {
          if (grid[idx(ax, ay)] < IMPASS) grid[idx(ax, ay)]++;
        } else if (!world.has(handle, Actor)) {
          // Any other MAP OBJECT (source's slot >= 0x100): spread its resistance
          // across its footprint, auto-extending double-tile sprites NW (the same
          // 2x2 geometry the renderer uses).
          forEachOccupiedCell(reg, tile, ax, ay, spread);
        }
        // else: an Actor (NPC) — not an obstacle in the cost map.
      }
    }
  }

  return {
    grid, originX, originY, area: AREA,
    costAt(ax, ay) { return grid[ay * AREA + ax]; },
  };
}

// 4-direction step tables (seg_1E0F.c:1097-1098, D_185A/D_185E). The path is
// 4-directional (the cost-map relax only touches 4 neighbors), unlike the 8-dir
// avatar/follower movement. dir: 0=N 1=E 2=S 3=W. `dir ^ 2` reverses (N<->S, E<->W).
const STEP_DX = [0, 1, 0, -1];
const STEP_DY = [-1, 0, 1, 0];

// findPath(world, sx, sy, tx, ty, cx, cy) — bucket-priority Dijkstra over the cost
// grid centered on (cx, cy), from (sx, sy) to (tx, ty). Returns a plain array of
// 4-dir step values (0=N 1=E 2=S 3=W) walking start -> target, [] if already there,
// or null if no path exists / either endpoint is outside the 40x40 work area.
//
// Port of C_1E0F_2D37 (search, seg_1E0F.c:1286-1389) + C_1E0F_2A74 (relax,
// :1213-1269) + C_1E0F_25F9 (traceback, :1100-1179). Two target modes: a fixed cell
// (two-source meet-in-the-middle), and the off-window edge-seek (a single source
// flooding toward any window edge the goal lies beyond — added I-9e so far schedule
// slots WALK via re-plan instead of snapping). The sought-object mode (PTH_object) is
// still deferred. Kept faithfully bucket-Dijkstra (not a heap) so the route matches
// source's tie-break for trace-validation; only source's RLE byte-packing of the path
// is dropped in favour of a plain JS direction array (note-branch 2026-06-01: "RLE =
// storage -> drop; bucket-Dijkstra = route -> keep").
//
// Meet-in-the-middle (in-window target): two floods, from the start (side flag 0) and
// the target (side flag 0x80). PTH_map holds each visited cell's cost in the low 7
// bits and the owning flood in bit 0x80; when a relax reaches a cell owned by the
// OTHER flood, the frontiers have met and the path is traced from that cell outward to
// both sources. Edge-seek (off-window target): a single flood from the start, stopping
// at the first cell on the favored window edge; the path is start..edge only.
export function findPath(world, sx, sy, tx, ty, cx, cy) {
  const { grid: resist, originX, originY } = computeResistance(world, cx, cy);
  const A = AREA;
  const mi = (ax, ay) => ay * A + ax;
  const inArea = (ax, ay) => ax >= 0 && ax < A && ay >= 0 && ay < A;

  const startAx = sx - originX, startAy = sy - originY;
  if (!inArea(startAx, startAy)) return null;            // the mover must be inside its own window
  const tgtAx = tx - originX, tgtAy = ty - originY;
  if (startAx === tgtAx && startAy === tgtAy) return [];  // already at target

  // Edge-seek mode: when the target is OUTSIDE the window, head for a window edge
  // toward the goal instead of giving up; the NPC tick re-plans from the edge, so the
  // NPC walks across the map incrementally. Source aims for a SINGLE dominant-axis edge
  // (PTH_direct, seg_1E0F.c:1323-1327), but on real town maps that one edge is often
  // walled off right next to the NPC (verified on NPC #12) and the search then snaps.
  // Deviation: accept ANY edge the target lies beyond (the EDGE_* bits) — so a NE goal
  // can be reached via the east edge when the north edge is blocked. Only snaps when
  // every toward-goal edge is unreachable (truly boxed in on the goal's side). Trace-
  // divergence from source, justified by the walk-don't-teleport goal (CLAUDE.md
  // §"Modern-browser UX"). edgeMask 0 = in-window target (two-source meet-in-the-middle).
  const EDGE_N = 1, EDGE_E = 2, EDGE_S = 4, EDGE_W = 8;
  let edgeMask = 0;
  if (tgtAx < 0) edgeMask |= EDGE_W; else if (tgtAx >= A) edgeMask |= EDGE_E;
  if (tgtAy < 0) edgeMask |= EDGE_N; else if (tgtAy >= A) edgeMask |= EDGE_S;

  // t40x40 scratch (seg_1E0F.c:1087-1093): PTH_map = cost|side-flag per cell;
  // rank[cost] = bucket head; link = free-list / bucket links; qx/qy = queued coords.
  // POOL (the frontier pool) is sized to the whole grid (A*A) rather than source's
  // fixed 256 — a deliberate widening so an open-terrain edge-seek flood can't exhaust
  // the pool and false-give-up (snapping a far NPC that should walk). Routes are
  // identical to source wherever source's 256 cap wasn't hit.
  const POOL = A * A;
  const PTH_map = new Uint8Array(A * A).fill(0xff);
  const rank = new Int16Array(256).fill(-1);
  const link = new Int32Array(POOL);
  for (let i = 0; i < POOL; i++) link[i] = i + 1;
  link[POOL - 1] = -1;
  const qx = new Uint8Array(POOL), qy = new Uint8Array(POOL);
  let top = 0, cur = 0, min = 0, found = false, meetX = -1, meetY = -1;

  // C_1E0F_2A74 — relax/expand one neighbor at accumulated `cost`.
  function relax(cost, ax, ay, flag) {
    if (found || cost > 0x7f || !inArea(ax, ay)) return;
    const cell = PTH_map[mi(ax, ay)];
    if (cell !== 0xff && (cell & 0x80) !== flag) {   // reached a cell the OTHER flood owns
      found = true; meetX = ax; meetY = ay; return;
    }
    // Edge-seek success: reaching any window edge the target lies beyond (single-flood
    // mode only; edgeMask is 0 in the two-source case so this never fires there).
    if (edgeMask &&
        (((edgeMask & EDGE_N) && ay === 0) || ((edgeMask & EDGE_E) && ax === A - 1) ||
         ((edgeMask & EDGE_S) && ay === A - 1) || ((edgeMask & EDGE_W) && ax === 0))) {
      found = true; meetX = ax; meetY = ay; return;
    }
    if ((cell & 0x7f) <= cost) return;               // already have a cheaper/equal route here
    if (top < 0) return;                             // free pool exhausted (path too long)
    if (min < cost) min = cost;
    const node = top;
    top = link[node];
    link[node] = rank[cost];
    qx[node] = ax; qy[node] = ay;
    rank[cost] = node;
    PTH_map[mi(ax, ay)] = cost | flag;
  }

  relax(0, startAx, startAy, 0);                      // flood from the start cell (side 0)
  if (edgeMask === 0) relax(0, tgtAx, tgtAy, 0x80);   // 2nd source only when the target is in-window

  while (rank[cur] >= 0 && !found) {
    const node = rank[cur];          // pop the cheapest queued cell
    rank[cur] = link[node];
    const ax = qx[node], ay = qy[node];
    link[node] = top; top = node;    // return the node to the free pool
    let c = PTH_map[mi(ax, ay)];
    const flag = c & 0x80; c &= 0x7f;
    relax(resist[mi(ax - 1, ay)] + c, ax - 1, ay, flag);   // out-of-area neighbours are
    relax(resist[mi(ax + 1, ay)] + c, ax + 1, ay, flag);   // discarded inside relax (inArea);
    relax(resist[mi(ax, ay - 1)] + c, ax, ay - 1, flag);   // the OOB resist read is wrapped
    relax(resist[mi(ax, ay + 1)] + c, ax, ay + 1, flag);   // garbage but never used (matches src)
    if (rank[cur] < 0) {
      while (cur < min && rank[cur] < 0) cur++;             // advance to the next non-empty bucket
    }
  }

  if (!found) return null;

  // C_1E0F_25F9 — traceback from the meet cell to both sources, building the dir
  // array. First walk: follow strictly-decreasing PTH_map cost to the side-0 source
  // (start), prepending each step's REVERSED dir -> gives start..meet. Second walk:
  // from the meet, follow the side-0x80 cells (>= 0x80) down to the target,
  // appending each forward dir -> gives meet..target. Concatenated: start..target.
  const head = [];
  let dir = 0, ax = meetX, ay = meetY;
  while (PTH_map[mi(ax, ay)] !== 0) {
    let some = 0xff, pick = -1;
    for (let i = 0; i < 4; i++) {
      const nx = ax + STEP_DX[i], ny = ay + STEP_DY[i];
      if (inArea(nx, ny)) {
        const v = PTH_map[mi(nx, ny)];
        if (v < some || (v === some && dir === i)) { some = v; pick = i; }   // tie -> keep direction
      }
    }
    if (pick < 0) break;
    dir = pick;
    ax += STEP_DX[dir]; ay += STEP_DY[dir];
    head.unshift(dir ^ 2);
  }

  // Second walk: in-window targets only. Edge-seek (edgeMask != 0) is single-source, so
  // there's no target-side flood to walk to — the path is just start..edge (head).
  const tail = [];
  if (edgeMask === 0) {
    ax = meetX; ay = meetY;
    PTH_map[mi(ax, ay)] = 0xff;                        // sentinel so the >0x80 walk starts
    while (PTH_map[mi(ax, ay)] > 0x80) {
      let some = 0xff, pick = -1;
      for (let i = 0; i < 4; i++) {
        const nx = ax + STEP_DX[i], ny = ay + STEP_DY[i];
        if (inArea(nx, ny)) {
          const v = PTH_map[mi(nx, ny)];
          if (v >= 0x80 && (v < some || (v === some && dir === i))) { some = v; pick = i; }
        }
      }
      if (pick < 0) break;
      dir = pick;
      ax += STEP_DX[dir]; ay += STEP_DY[dir];
      tail.push(dir);
    }
  }

  return head.concat(tail);
}
