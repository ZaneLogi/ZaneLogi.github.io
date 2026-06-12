// CameraSystem — keeps the camera's world position in the toroidal range of the
// ACTIVE level so the float never drifts after long scrolling. The wrap extent
// follows MapLevel (I-19a): overworld wraps at 1024 tiles, dungeons at 256 —
// MapLevel.tileAt wraps to match, so this is hygiene, not clamping. A later step
// swaps this for follow-the-avatar.

import { Camera } from '../resources/camera.js';
import { MapLevel } from '../resources/map_level.js';

export function makeCameraSystem(tileSize) {
  return (world) => {
    const cam = world.getResource(Camera);
    const px = world.getResource(MapLevel).tilesWide * tileSize;   // 1024*ts overworld / 256*ts dungeon
    // Wrap to the level's torus AND snap to whole pixels. The tile shader samples the R8
    // atlas with NEAREST, so a FRACTIONAL scroll offset (the camera on a half-pixel — which
    // render-to-fit's odd canvas size + centerOn's `-canvas.width/2` produces) makes a tile's
    // right/bottom edge sample ACROSS the atlas-tile boundary into the neighbour → 1px bleed
    // lines between tiles. Integer pixels keep each 16px tile mapped 1:1 to its 16 atlas
    // texels (the legacy ../ultima6 port has no sub-tile scroll, so it never bleeds). NEAREST
    // quantises to whole pixels regardless, so the snap costs no scroll smoothness.
    cam.worldX = Math.round(((cam.worldX % px) + px) % px);
    cam.worldY = Math.round(((cam.worldY % px) + px) % px);
  };
}
