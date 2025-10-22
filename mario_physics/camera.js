export class Camera {
  constructor(viewWidth, viewHeight) {
    this.x = 0;
    this.y = 0;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;

    // Dead zone margins (tweak these for comfort)
    this.deadZoneX = viewWidth / 4;   // left/right safe margin
    this.deadZoneY = viewHeight / 4;  // top/bottom safe margin

    this.smoothFactor = 0.05; // How fast camera catches up
    this.snapThreshold = 1;  // Pixels at which camera snaps
  }

  // Center camera on a target actor
  follow(target, levelMap) {
    const TILE_SIZE = levelMap.tileSize;
    const mapWidth = levelMap.tileData[0].length * TILE_SIZE;
    const mapHeight = levelMap.tileData.length * TILE_SIZE;

    // Center camera on target
    const targetCenterX = target.x + target.w / 2;
    const targetCenterY = target.y + target.h / 2;

    let desiredX = this.x;
    let desiredY = this.y;

    // --- Horizontal follow with dead zone ---
    if (targetCenterX < this.x + this.deadZoneX) {
      desiredX = targetCenterX - this.deadZoneX;
    } else if (targetCenterX > this.x + this.viewWidth - this.deadZoneX) {
      desiredX = targetCenterX - (this.viewWidth - this.deadZoneX);
    }

    // --- Vertical follow with dead zone ---
    if (targetCenterY < this.y + this.deadZoneY) {
      desiredY = targetCenterY - this.deadZoneY;
    } else if (targetCenterY > this.y + this.viewHeight - this.deadZoneY) {
      desiredY = targetCenterY - (this.viewHeight - this.deadZoneY);
    }

    // --- Smooth movement with snap ---
    const diffX = desiredX - this.x;
    const diffY = desiredY - this.y;

    if (Math.abs(diffX) > this.snapThreshold) {
      this.x += diffX * this.smoothFactor;
    } else {
      this.x = desiredX;
    }

    if (Math.abs(diffY) > this.snapThreshold) {
      this.y += diffY * this.smoothFactor;
    } else {
      this.y = desiredY;
    }

    // Clamp so camera never goes outside the map
    const maxX = mapWidth - this.viewWidth;
    const maxY = mapHeight - this.viewHeight;

    this.x = Math.max(0, Math.min(this.x, maxX));
    this.y = Math.max(0, Math.min(this.y, maxY));
  }

  // Convert world → screen
  worldToScreen(x, y) {
    return {
      sx: x - this.x,
      sy: y - this.y
    };
  }
}