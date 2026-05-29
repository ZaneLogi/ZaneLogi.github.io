// EntityRenderSystem — the ECS integration test. Draws Position+Renderable
// entities above the terrain. For each visible entity it applies Origin's
// double-tile expansion (C_1184_35EA: hotspot + tile-1/-2/-3 for DoubleW/H/2x2)
// and routes EACH resulting tile to a lower (layer 2) or top (layer 3) overlay by
// ITS OWN isTopTile flag — the pillar-bug fix (research_map_render.md:603), vs the
// legacy port routing the whole object by the base tile's flag.
//
// A few entities -> query + viewport-cull. The spatial-index-driven walk and the
// per-cell chain Z-order are deferred to the object system (many entities). Sets
// layers 2/3 only; the present step calls render().

import { Camera } from '../resources/camera.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Position, Renderable } from '../components/components.js';

export function makeEntityRenderSystem(renderer) {
  const ts = renderer.tileSize;

  return (world) => {
    const cam = world.getResource(Camera);
    const reg = world.getResource(TileRegistry);
    const remap = reg.anim ? reg.anim.tileIndexMap : null;
    const pos = world.store(Position);
    const rend = world.store(Renderable);

    const tileX = Math.floor(cam.worldX / ts), tileY = Math.floor(cam.worldY / ts);
    const cols = Math.ceil(renderer.canvas.width / ts) + 1;
    const rows = Math.ceil(renderer.canvas.height / ts) + 1;

    const low = [], top = [];   // flat [tileId, col, row, ...]
    const emit = (tile, col, row) => {
      if (col < -1 || col > cols || row < -1 || row > rows) return;
      (reg.isTopTile(tile) ? top : low).push(remap ? remap[tile] : tile, col, row);
    };

    for (const id of world.query(Position, Renderable)) {
      const col = pos.x[id] - tileX;
      const row = pos.y[id] - tileY;
      const t = rend.tileId[id];
      emit(t, col, row);                                  // hotspot
      const dw = reg.isDoubleWidth(t), dh = reg.isDoubleHeight(t);
      if (dw) {
        emit(t - 1, col - 1, row);                        // left
        if (dh) { emit(t - 2, col, row - 1); emit(t - 3, col - 1, row - 1); }  // 2x2
      } else if (dh) {
        emit(t - 1, col, row - 1);                        // DoubleV head
      }
    }

    setLayerFromList(renderer, 2, low);
    setLayerFromList(renderer, 3, top);
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
