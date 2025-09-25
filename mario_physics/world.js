export class World {
  constructor(levelMap) {
    this.levelMap = levelMap;
    this.actors = [];
  }

  addActor(actor) {
    this.actors.push(actor);
  }

  update(input) {
    for (const actor of this.actors) {
      actor.update(input, this.levelMap);
    }
  }

  draw(ctx) {
    ctx.clearRect(0,0,640,480);

    const level = this.levelMap.tileData;
    const TILE_SIZE = this.levelMap.tileSize;

    // Draw level
    for (let y = 0; y < level.length; y++) {
      for (let x = 0; x < level[0].length; x++) {
        if (level[y][x] === 1) {
          ctx.fillStyle = "#654321";
          ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    const player = this.actors[0]; // assuming first actor is the player
    // Draw player
    ctx.fillStyle = "red";
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }
}