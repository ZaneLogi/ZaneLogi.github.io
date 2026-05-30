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
// Why zones reproduce the chain: U6 tiles are one cell each, so tiles in different
// cells never share pixels — only WITHIN a cell does order matter, and the four
// zones give exactly ShowObject's within-cell order. The one case they don't capture
// is multiple objects of the SAME zone stacked in ONE cell (then emission order
// stands in for source's chain LIFO); see the research doc.

import { Camera } from '../resources/camera.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Position, Renderable } from '../components/components.js';
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
    // streamed in). Entities are static in I-2 — movement (I-5/I-6) will set dirty too.
    if (tileX === lastTileX && tileY === lastTileY && !reg.animDirty && !spatial.dirty) return;
    lastTileX = tileX; lastTileY = tileY; spatial.dirty = false;

    const bg = [], normal = [], fgHot = [], fgExt = [];   // flat [tileId, col, row, ...]
    const emit = (tile, col, row, isExt) => {
      if (col < -1 || col > cols || row < -1 || row > rows) return;
      const list = reg.isBackground(tile) ? bg
                 : reg.isForeground(tile) ? (isExt ? fgExt : fgHot)
                 : normal;
      list.push(rm(tile), col, row);
    };

    // Walk visible cells in scan order, +1 margin on right/bottom so off-screen
    // objects whose up-left extensions reach into view are caught.
    for (let row = tileY; row <= tileY + rows + 1; row++) {
      for (let col = tileX; col <= tileX + cols + 1; col++) {
        const ents = spatial.at(col, row);
        if (!ents) continue;
        const c = col - tileX, r = row - tileY;
        // Iterate the cell's entities in REVERSE of load order. The array is NPCs
        // first (loadActors), then objblk order; source's per-cell chain draws the
        // first-processed object LAST (chain tail = top), with NPCs (tied position,
        // loaded first) ahead of objects and objblk storing the top item first. So
        // first-loaded must draw on top → NPCs stand ON carpets/floor. (This is the
        // within-cell same-zone order the painter's-algorithm doc flagged.)
        for (let k = ents.length - 1; k >= 0; k--) {
          const i = world.resolve(ents[k]);
          if (i === -1) continue;
          forEachOccupiedCell(reg, rend.tileId[i], c, r, emit);
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
