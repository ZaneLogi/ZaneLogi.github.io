// PaletteCycleSystem — U6's continuous palette-register cycling (the water/lava/
// force-field shimmer), one of the three render channels named in ../CLAUDE.md.
// Rotates the cycling palette ranges (indices 0xE0-0xFC) on source's 4/8-frame
// schedule and re-uploads the palette texture. Independent of the tile-index layers,
// so it animates even while the camera is static (the shader just samples the
// updated palette). Ported from the legacy palette_manager.colorCycling.

import { TileRegistry } from '../resources/tile_registry.js';

// Rotate palette entries [start, end) forward by one (first colour wraps to the end).
// pal is Uint8Array(256*4) RGBA.
function rotate(pal, start, end) {
  const tmp = pal.slice(start * 4, start * 4 + 4);
  pal.copyWithin(start * 4, start * 4 + 4, end * 4);
  pal.set(tmp, (end - 1) * 4);
}

export function makePaletteCycleSystem(renderer) {
  let frame = 0;
  return (world) => {
    const pal = world.getResource(TileRegistry).palette;
    let updated = false;
    if (frame % 4 === 0) {          // 8-entry groups cycle every 4 frames
      rotate(pal, 0xe0, 0xe8);
      rotate(pal, 0xe8, 0xf0);
      updated = true;
    }
    if (frame % 8 === 0) {          // 4-entry groups cycle every 8 frames
      rotate(pal, 0xf0, 0xf4);
      rotate(pal, 0xf4, 0xf8);
      rotate(pal, 0xf8, 0xfc);
      updated = true;
    }
    frame++;
    if (updated) renderer.uploadPalette(pal);
  };
}
