// TileAnimationSystem — advances the animdata tile-frame remap once per render
// frame and records whether any animated tile changed (TileRegistry.animDirty).
// Both the terrain RenderSystem and the WorldRenderSystem read that flag to rebuild
// only when needed; centralising the advance here stops them double-advancing the
// shared anim state. Runs first among the render systems.

import { TileRegistry } from '../resources/tile_registry.js';

export function makeTileAnimationSystem() {
  let frame = 0;
  return (world) => {
    const reg = world.getResource(TileRegistry);
    reg.animDirty = reg.anim ? reg.anim.update(frame >> 2).size > 0 : false;  // /4: legacy anim-frame divisor
    frame++;
  };
}
