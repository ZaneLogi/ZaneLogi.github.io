// RenderSystem — draws terrain. Same shape as Origin's Pass-2 cell loop
// (C_0A33_09CE), canvas-sized and continuous instead of 11x11 on-demand.
//
// Coastlines are a TWO-LAYER composite, exactly as the legacy/Origin do it:
//   layer 0 (base):    every cell; shore cells (16..47) are replaced with their
//                      animated water-base tile (SHORE_TO_WATER).
//   layer 1 (overlay): only shore cells, drawing the actual shore graphic on top.
//                      Its animmask-transparent pixels let the water base show
//                      through, giving the beach/bank blend.
// Tile ids are remapped through the animdata frame table (TileRegistry.anim) before
// drawing — raw water/animated tiles are transparent bases that must be remapped to
// their opaque frame (also gives animated water). Buffers are re-filled only when
// the tile origin moves OR an animated frame advances; render runs every frame.

import { Camera } from '../resources/camera.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';

// Shore tile (16..47) -> its animated water-base tile (legacy map_viewer.js:150-167).
const SHORE_TO_WATER = [
  0x16, 0x16, 0x1a, 0x1a, 0x1e, 0x1e, 0x12, 0x12,
  0x1a, 0x1e, 0x16, 0x12, 0x16, 0x1a, 0x1e, 0x12,
  0x1a, 0x1e, 0x1e, 0x12, 0x12, 0x16, 0x16, 0x1a,
  0x12, 0x16, 0x1e, 0x1a, 0x1a, 0x1e, 0x12, 0x16,
];

export function makeRenderSystem(renderer) {
  const ts = renderer.tileSize;
  let cols = 0, rows = 0;
  let basePos = null, baseIdx = null;       // layer 0: full grid
  let shoreIdx = null, shorePos = null;     // layer 1: sparse (shore cells only)
  let lastTileX = NaN, lastTileY = NaN;
  let frame = 0;

  return (world) => {
    const cam = world.getResource(Camera);
    const map = world.getResource(MapLevel);
    const reg = world.getResource(TileRegistry);
    const remap = reg.anim ? reg.anim.tileIndexMap : null;
    const rm = remap ? (t) => remap[t] : (t) => t;

    let animChanged = false;
    if (reg.anim) animChanged = reg.anim.update(frame >> 2).size > 0;   // /4: legacy anim-frame divisor
    frame++;

    const cw = renderer.canvas.width, ch = renderer.canvas.height;
    const needCols = Math.ceil(cw / ts) + 1;   // +1 row/col covers the sub-tile scroll
    const needRows = Math.ceil(ch / ts) + 1;
    let relayout = false;
    if (needCols !== cols || needRows !== rows) {
      cols = needCols; rows = needRows;
      const n = cols * rows;
      basePos = new Float32Array(n * 2);
      baseIdx = new Uint16Array(n);
      shoreIdx = new Uint16Array(n);
      shorePos = new Float32Array(n * 2);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; basePos[i * 2] = c; basePos[i * 2 + 1] = r;
      }
      relayout = true;
      lastTileX = NaN;
    }

    const tileX = Math.floor(cam.worldX / ts);
    const tileY = Math.floor(cam.worldY / ts);
    renderer.setScroll(cam.worldX - tileX * ts, cam.worldY - tileY * ts);

    if (relayout || animChanged || tileX !== lastTileX || tileY !== lastTileY) {
      let sc = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let t = map.tileAt(tileX + c, tileY + r);
        if (t >= 16 && t < 48) {
          shoreIdx[sc] = rm(t);                       // shore graphic -> overlay layer
          shorePos[sc * 2] = c; shorePos[sc * 2 + 1] = r;
          sc++;
          t = SHORE_TO_WATER[t - 16] >> 1;            // base layer -> water
        }
        baseIdx[r * cols + c] = rm(t);
      }
      if (relayout) renderer.setLayer(0, baseIdx, basePos);
      else renderer.updateLayer(0, baseIdx);
      // Shore overlay count varies with the view, so (re)create it each fill.
      renderer.setLayer(1, shoreIdx.subarray(0, sc), shorePos.subarray(0, sc * 2));
      lastTileX = tileX; lastTileY = tileY;
    }
    // Layers 0/1 set here; the entity system sets 2/3; a present step renders.
  };
}
