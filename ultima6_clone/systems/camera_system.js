// CameraSystem — keeps the camera's world position in the toroidal overworld
// range so the float never drifts after long scrolling. (Overworld wraps at
// worldPx; MapLevel.tileAt wraps too, so this is hygiene, not clamping.) A
// later step swaps this for follow-the-avatar.

import { Camera } from '../resources/camera.js';

export function makeCameraSystem(worldPxX, worldPxY) {
  return (world) => {
    const cam = world.getResource(Camera);
    cam.worldX = ((cam.worldX % worldPxX) + worldPxX) % worldPxX;
    cam.worldY = ((cam.worldY % worldPxY) + worldPxY) % worldPxY;
  };
}
