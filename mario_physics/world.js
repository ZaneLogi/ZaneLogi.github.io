export class World {
  constructor(levelMap) {
    this.levelMap = levelMap;
    this.objects = [];
  }

  addActor(actor, actorAnimator) {
    this.objects.push({actor: actor, animator: actorAnimator});
  }

  update(input, dt) {
    for (const obj of this.objects) {
      obj.actor.update(input, this.levelMap, dt);
      obj.animator.update(obj.actor.currentState, dt);
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

    const player = this.objects[0].actor; // assuming first actor is the player
    const playerAnimator = this.objects[0].animator;
    // Draw player
    const { sx, sy } = camera.worldToScreen(player.x, player.y);
    playerAnimator.draw(ctx, sx, sy, player.facing === -1);
  }
}