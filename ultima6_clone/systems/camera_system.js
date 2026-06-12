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
    cam.worldX = ((cam.worldX % px) + px) % px;
    cam.worldY = ((cam.worldY % px) + px) % px;
  };
}
