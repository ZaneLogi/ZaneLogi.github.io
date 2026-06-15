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
// We mirror source's per-cell ordering with a TYPE-BASED Z-PRIORITY plus an
// ANCHOR-POSITION tie-break, rather than rebuilding source's chain:
//   1. Z-PRIORITY — Actor entities get priority 1 (drawn last within their zone =
//      on top), all else 0. This decouples Z-order from entity index — fragile
//      once world.create() reuses freed slots — and keeps NPCs above furniture/
//      floor (Lord British on his throne, even though the throne's 2×2 extension
//      reaches into his cell). Source analog: SearchArea visits the actor and the
//      object, both head-insert, but the actor-on-top intent is what matters here.
//   2. ANCHOR (Y,X) ORDER — for equal priority, sort by the contributing object's
//      anchor position so the LOWER (Y, then X) anchor draws LAST = on top. Source
//      visits objects in (Y,X) order (the position-sorted Link[] chain, C_1184_02FA
//      / SearchArea seg_1184.c:139/369) and head-inserts each normal tile
//      (seg_1184.c:1698-1699); the blit walks head→tail (head = bottom,
//      C_0A33_09CE seg_0A33.c:363-369). So the FIRST-visited (lower Y,X) object
//      ends at the chain tail = drawn last = ON TOP. This reproduces source when a
//      2×2 EXTENSION reaches into a cell that also holds an anchored object — e.g.
//      a broken lens at (124,194) under an altar anchored at (125,195): the lens's
//      lower Y wins and draws on top, as in source. It generalizes the Actor case
//      above to the object-vs-object case.
//   3. SAME-ANCHOR TIE — JS sort is stable, so two contributions from the SAME
//      anchor cell (same Y,X) keep their emit order. We iterate `spatial.at` in
//      REVERSE so older entries (chain head — loadRegion file-order push +
//      insertAtHead at runtime) emit LATER, get drawn LATER, end up on TOP — the
//      candle-on-table / door-in-doorway case. Source's head-insert effect is
//      "first-inserted (= older) ends at the render tail = on top"; the reverse-
//      iter reproduces it without modeling Obj_11x11 explicitly.
// CAVEAT — the (Y,X) order is the source-faithful direction for the head-insert
// zones (normal, fgHot). For bg (terrain overwrite, last-write-wins) and fgExt
// (source's fg-branch TAIL-insert = newer on top) the source direction inverts,
// but MULTIPLE same-zone bg/fgExt contributions in ONE cell are rare in u6 data
// (single-per-cell is direction-independent); revisit if it ever surfaces.
//
// The cell-scan is gather-then-sort: visit each cell, scan the 4 anchor candidates
// whose footprint COULD cover it (own anchor + 3 neighbors that may extend in),
// collect each anchor's tile contribution at this cell, sort by z-priority, emit
// to zone lists.

import { Camera } from '../resources/camera.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Position, Renderable, Actor } from '../components/components.js';
import { forEachOccupiedCell } from './tile_footprint.js';

export function makeWorldRenderSystem(renderer) {
  const ts = renderer.tileSize;
  let lastTileX = NaN, lastTileY = NaN, lastLevel = -1;

  return (world) => {
    const cam = world.getResource(Camera);
    const reg = world.getResource(TileRegistry);
    const spatial = world.getResource(SpatialIndex);
    const pos = world.store(Position);
    const rend = world.store(Renderable);
    const activeZ = world.getResource(MapLevel)?.level ?? 0;   // I-19b: only draw the active level's entities (?? 0 = no/stub MapLevel)
    const wrap = activeZ === 0 ? 1024 : 256;                   // active level's toroidal width (overworld / dungeon)
    const remap = reg.anim ? reg.anim.tileIndexMap : null;
    const rm = remap ? (t) => remap[t] : (t) => t;

    const tileX = Math.floor(cam.worldX / ts), tileY = Math.floor(cam.worldY / ts);
    const cols = Math.ceil(renderer.canvas.width / ts) + 1;
    const rows = Math.ceil(renderer.canvas.height / ts) + 1;

    // Rebuild only on camera move, animation, a spatial change (e.g. a region just
    // streamed in), or a LEVEL change (I-19b — a ladder may switch level without moving
    // the camera origin). Movement (I-5e) sets spatial.dirty so NPC snaps trigger rebuild.
    if (tileX === lastTileX && tileY === lastTileY && activeZ === lastLevel && !reg.animDirty && !spatial.dirty) return;
    lastTileX = tileX; lastTileY = tileY; lastLevel = activeZ; spatial.dirty = false;

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
            // Wrap the query to the active level's toroidal width so objects past the map
            // seam still render (terrain wraps via tileAt; objects must too). Only the
            // SPATIAL lookup wraps — the footprint anchor (col+dx) + screen position
            // (col-tileX) stay un-wrapped, which keeps a 2×2 object straddling the seam
            // correct (its hotspot/extension land on adjacent screen cells).
            const ents = spatial.at((col + dx) % wrap, (row + dy) % wrap);
            if (!ents) continue;
            // Reverse iter so older entities (chain head — file-order push +
            // runtime insertAtHead) emit later within their zPri tier, get
            // drawn later, and end up on TOP. Mirrors source's ShowObject
            // non-fg "insert NEW at head of render list, walk forward" effect.
            for (let k = ents.length - 1; k >= 0; k--) {
              const handle = ents[k];
              const i = world.resolve(handle);
              if (i === -1) continue;
              if (pos.z[i] !== activeZ) continue;   // I-19b: hide other-level entities (no surface bleed in a dungeon)
              // Extract just the tile this entity contributes at (col, row), if any.
              let landed = -1;
              forEachOccupiedCell(reg, rend.tileId[i], col + dx, row + dy, (t, c, r) => {
                if (c === col && r === row) landed = t;
              });
              if (landed === -1) continue;
              const zPri = world.has(handle, Actor) ? 1 : 0;
              // ay/ax = the contributing object's ANCHOR cell (col+dx, row+dy) — the
              // key source orders objects by (Y then X). Un-wrapped (matches isExt +
              // screen pos), so a 2×2 straddling the seam stays internally consistent.
              contributions.push({ tile: landed, zPri, isExt: (dx > 0 || dy > 0), ay: row + dy, ax: col + dx });
            }
          }
        }
        if (contributions.length === 0) continue;

        // Sort to bottom→top emit order:
        //   primary  — z-priority ascending: objects (0) before Actors (1), so an
        //              Actor draws last within its zone = on top (LB on his throne).
        //   secondary — among equal priority, source's object-visit (Y,X) order:
        //              the LOWER (ay, then ax) anchor was visited FIRST and head-
        //              inserts to the chain tail = drawn last, so it must sort LAST
        //              here → compare with b - a (descending). Fixes a 2×2 extension
        //              (altar) covering a lower-Y anchored object (broken lens).
        //   stable    — same priority AND same anchor keeps reverse-scan order
        //              (candle-on-table), since JS sort is stable.
        contributions.sort((a, b) => (a.zPri - b.zPri) || (b.ay - a.ay) || (b.ax - a.ax));

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
