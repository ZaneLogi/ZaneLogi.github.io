// lemmings/src/terrain_render.js
//
// Rendering helpers derived from the substrate buffers. The renderer is strictly
// downstream of the simulation (§3.7): it reads the terrain buffer / object map
// and draws them, never the other way round.
//
//  - buildTerrainCanvas: paints the terrain SILHOUETTE (§3.7) — reusable by the
//    game (empty pixels stay transparent so a background layer shows through).
//  - paintObjectMapDebug: overlays the object-map trigger regions. This is a
//    DEBUG view; the game never draws trigger regions (they are invisible, §3.5).

import { WORLD_W, WORLD_H } from './constants.js';
import { EFFECT, CELL, ObjectMap } from './object_map.js';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Return an offscreen canvas (WORLD_W × WORLD_H) with solid pixels painted in
// solidColor and empty pixels left transparent. drawImage it over any background.
export function buildTerrainCanvas(terrain, { solidColor = '#8a9b5a' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = WORLD_W;
  cv.height = WORLD_H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(WORLD_W, WORLD_H);
  const [r, g, b] = hexToRgb(solidColor);
  const data = img.data;
  const solid = terrain.solid;
  for (let i = 0; i < solid.length; i++) {
    if (solid[i]) {
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

const DEBUG_COLORS = {
  [EFFECT.EXIT]: 'rgba(60,220,90,0.45)',
  [EFFECT.WATER]: 'rgba(60,120,240,0.5)',
  [EFFECT.FIRE]: 'rgba(255,90,30,0.55)',
  [EFFECT.STEEL]: 'rgba(200,200,210,0.45)',
  [EFFECT.ONE_WAY_LEFT]: 'rgba(210,80,220,0.45)',
  [EFFECT.ONE_WAY_RIGHT]: 'rgba(80,210,220,0.45)',
};

// Overlay the object map's trigger regions onto ctx (world coordinates). Traps
// (indices 0..127) are drawn red; NONE and blocker cells are skipped.
export function paintObjectMapDebug(ctx, objectMap) {
  const { cells, cols, rows } = objectMap;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const v = cells[cy * cols + cx];
      let color;
      if (v <= 127) color = 'rgba(240,40,40,0.5)';   // trap index
      else color = DEBUG_COLORS[v];                   // NONE/blocker → undefined
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ObjectMap.cellWorldX(cx), ObjectMap.cellWorldY(cy), CELL, CELL);
    }
  }
}
