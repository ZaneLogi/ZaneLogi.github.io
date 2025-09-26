export class World {
  constructor(levelMap) {
    this.levelMap = levelMap;
    this.actors = [];
  }

  addActor(actor) {
    this.actors.push(actor);
  }

  update(input, dt) {
    for (const actor of this.actors) {
      actor.update(input, this.levelMap, dt);
    }
  }

  draw(ctx, camera) {
    const vpW = camera.viewWidth;
    const vpH = camera.viewHeight;
    ctx.clearRect(0, 0, vpW, vpH);

    const level = this.levelMap.tileData;
    const TILE_SIZE = this.levelMap.tileSize;

    // Draw visible tiles only
    const startX = Math.floor(camera.x / TILE_SIZE);
    const startY = Math.floor(camera.y / TILE_SIZE);
    const endX = Math.ceil((camera.x + vpW) / TILE_SIZE);
    const endY = Math.ceil((camera.y + vpH) / TILE_SIZE);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        if (level[y]?.[x] === 1) {
          const { sx, sy } = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
          ctx.fillStyle = "#654321";
          ctx.fillRect(Math.round(sx), Math.round(sy), TILE_SIZE, TILE_SIZE);
        }
        else if (level[y]?.[x] === 2) {
          const { sx, sy } = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
          ctx.fillStyle = "#883300";
          ctx.fillRect(Math.round(sx), Math.round(sy), TILE_SIZE, TILE_SIZE);
        }
      }
    }

    const player = this.actors[0]; // assuming first actor is the player
    // Draw player
    const { sx, sy } = camera.worldToScreen(player.x, player.y);
    ctx.fillStyle = "red";
    ctx.fillRect(sx, sy, player.w, player.h);
  }
}