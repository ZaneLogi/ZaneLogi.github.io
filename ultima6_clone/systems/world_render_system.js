// WorldRenderSystem — the per-cell painter's algorithm for world objects + NPCs:
// the faithful port of source's ShowObject (seg_1184.c:1651) + the Pass-2 cell blit.
// See docs/research_map_render.md "Painter's algorithm".
//
// Spatial-index-driven: walks the visible cells (SpatialIndex), expands each object's
// double-tiles (C_1184_35EA), and routes EACH tile by its OWN flags into one of four
// bottom-to-top zones, matching ShowObject's chain insertion order:
//   2 background  (IsTileBackground) — replaces terrain, drawn first (bottom)
//   3 normal      (neither foreground nor background)
//   4 foreground hotspot     (IsTileForeground, the object's own cell)
//   5 foreground extension   (IsTileForeground double-tile extension — chain end / top)
//
// Within-cell order (source's chain semantics — seg_1184.c:1651 ShowObject):
//   - Normal & fgHot tiles insert at HEAD; each new insert pushes the previous head
//     down. Forward chain walk draws HEAD first = bottom. So FIRST-inserted entity
//     ends up at chain TAIL = drawn LAST = ON TOP. Source's SearchArea visits NPCs
//     first via Link[] order, so NPC sprites end up at chain tail = on top — Lord
//     British visible on his throne.
//   - fgExt tiles insert at TAIL. First-inserted = chain head = drawn first (bottom).
//     So newer entity = on top (opposite of normal/fgHot).
//
// We mirror source's per-cell ordering with a TYPE-BASED Z-PRIORITY rather than the
// chain: Actor entities get priority 1 (drawn last within their zone = on top), all
// else gets 0. This decouples Z-order from entity index — which would otherwise be
// fragile once world.create() starts reusing freed slots in the object-interaction
// phase (a recycled low index could put a new object above NPCs).
//
// WITHIN-ZONE TIE-BREAK (e.g. candle on a table — both `normal` zone, both
// non-Actor): we iterate `spatial.at` in REVERSE so older entries (chain head,
// per loadRegion's file-order push + insertAtHead at runtime) emit LATER, get
// drawn LATER, and end up on TOP. This mirrors source's ShowObject
// (seg_1184.c:1676-1699): for non-foreground tiles it inserts NEW at the HEAD
// of Obj_11x11[y][x], and the render walks that list forward (first-in-list
// drawn first = bottom). So source's effect is "first-inserted (= older) ends
// up at the tail of the render list = drawn last = on top." Our reverse-iter
// reproduces that without modeling Obj_11x11 explicitly. fgExt's "newer at
// tail = top" rule (source's ShowObject fg-branch) inverts this — multi-fgExt-
// per-cell is rare in u6 data; revisit if it ever surfaces.
//
// The cell-scan is gather-then-sort: visit each cell, scan the 4 anchor candidates
// whose footprint COULD cover it (own anchor + 3 neighbors that may extend in),
// collect each anchor's tile contribution at this cell, sort by z-priority, emit
// to zone lists.

import { Camera } from '../resources/camera.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Position, Renderable, Actor } from '../components/components.js';
import { forEachOccupiedCell } from './tile_footprint.js';

export function makeWorldRenderSystem(renderer) {
  const ts = renderer.tileSize;
  let lastTileX = NaN, lastTileY = NaN;

  return (world) => {
    const cam = world.getResource(Camera);
    const reg = world.getResource(TileRegistry);
    const spatial = world.getResource(SpatialIndex);
    const pos = world.store(Position);
    const rend = world.store(Renderable);
    const remap = reg.anim ? reg.anim.tileIndexMap : null;
    const rm = remap ? (t) => remap[t] : (t) => t;

    const tileX = Math.floor(cam.worldX / ts), tileY = Math.floor(cam.worldY / ts);
    const cols = Math.ceil(renderer.canvas.width / ts) + 1;
    const rows = Math.ceil(renderer.canvas.height / ts) + 1;

    // Rebuild only on camera move, animation, or a spatial change (e.g. a region just
    // streamed in). Movement (I-5e) sets spatial.dirty so NPC snaps trigger rebuild.
    if (tileX === lastTileX && tileY === lastTileY && !reg.animDirty && !spatial.dirty) return;
    lastTileX = tileX; lastTileY = tileY; spatial.dirty = false;

    const bg = [], normal = [], fgHot = [], fgExt = [];   // flat [tileId, col, row, ...]

    // Walk visible cells in scan order. For each cell, collect all tile contributions
    // (own anchor + neighbor anchors whose 2×2 footprint reaches in), then sort by
    // type-based z-priority (Actor=1, else=0) to reproduce ShowObject's "NPC on top
    // within a cell" semantic, then route each contribution to its zone list.
    const contributions = [];      // reused per cell: {tile, zPri, isExt}
    for (let row = tileY; row <= tileY + rows + 1; row++) {
      for (let col = tileX; col <= tileX + cols + 1; col++) {
        contributions.length = 0;
        // Anchors whose footprint COULD cover (col, row): (col,row), (col+1,row),
        // (col,row+1), (col+1,row+1) — SE-anchored 2×2 max footprint per
        // research_world_data.md.
        for (let dy = 0; dy <= 1; dy++) {
          for (let dx = 0; dx <= 1; dx++) {
            const ents = spatial.at(col + dx, row + dy);
            if (!ents) continue;
            // Reverse iter so older entities (chain head — file-order push +
            // runtime insertAtHead) emit later within their zPri tier, get
            // drawn later, and end up on TOP. Mirrors source's ShowObject
            // non-fg "insert NEW at head of render list, walk forward" effect.
            for (let k = ents.length - 1; k >= 0; k--) {
              const handle = ents[k];
              const i = world.resolve(handle);
              if (i === -1) continue;
              // Extract just the tile this entity contributes at (col, row), if any.
              let landed = -1;
              forEachOccupiedCell(reg, rend.tileId[i], col + dx, row + dy, (t, c, r) => {
                if (c === col && r === row) landed = t;
              });
              if (landed === -1) continue;
              const zPri = world.has(handle, Actor) ? 1 : 0;
              contributions.push({ tile: landed, zPri, isExt: (dx > 0 || dy > 0) });
            }
          }
        }
        if (contributions.length === 0) continue;

        // Sort ascending by z-priority: 0 (objects) first → emitted first → drawn
        // first within the zone = bottom; 1 (Actors) last → emitted last → drawn
        // last = on top. JS sort is stable, so multi-Actor or multi-object ties
        // preserve scan order — deterministic across frames at a given world state.
        contributions.sort((a, b) => a.zPri - b.zPri);

        const c = col - tileX, r = row - tileY;
        if (c < -1 || c > cols || r < -1 || r > rows) continue;
        for (const ct of contributions) {
          const tile = ct.tile;
          const list = reg.isBackground(tile) ? bg
                     : reg.isForeground(tile) ? (ct.isExt ? fgExt : fgHot)
                     : normal;
          list.push(rm(tile), c, r);
        }
      }
    }

    setLayerFromList(renderer, 2, bg);
    setLayerFromList(renderer, 3, normal);
    setLayerFromList(renderer, 4, fgHot);
    setLayerFromList(renderer, 5, fgExt);
  };
}

function setLayerFromList(renderer, layer, list) {
  const n = list.length / 3;
  const idx = new Uint16Array(n);
  const pos = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    idx[i] = list[i * 3];
    pos[i * 2] = list[i * 3 + 1];
    pos[i * 2 + 1] = list[i * 3 + 2];
  }
  renderer.setLayer(layer, idx, pos);
}
