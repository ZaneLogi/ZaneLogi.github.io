// Camera resource — the viewport's top-left position in WORLD PIXELS (not tiles),
// so scrolling is sub-tile-smooth. The RenderSystem derives the tile origin +
// sub-tile scroll offset from this each frame.

export class Camera {
  constructor(worldX = 0, worldY = 0) {
    this.worldX = worldX;
    this.worldY = worldY;
  }

  // Grab-and-drag: dragging the pointer by (dx,dy) moves the content with it, so
  // the viewport's world origin moves the opposite way.
  pan(dxPx, dyPx) {
    this.worldX -= dxPx;
    this.worldY -= dyPx;
  }
}
