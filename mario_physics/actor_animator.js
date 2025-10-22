import { Sprite } from "../mario/sprite.js";

export class ActorAnimator {
  constructor() {
    this.loadSprites();
    this.currentSpriteID = 1; // default to small idle
    this.currentSprite = this.sprites[this.currentSpriteID];
    this.lastState = "idle";
  }

  update(state, dt) {
    switch(state) {
      case "idle":
        this.currentSprite = this.sprites[1]; break;
      case "walk":
      case "run":
        if (this.lastState !== state) {
          this.currentSpriteID = 2;
          this.currentSprite = this.sprites[2];
          this.moveAnimationTime = 0;
        }
        else {
          this.moveAnimationTime += dt;
          if (this.moveAnimationTime >= 0.1) {
            this.moveAnimationTime -= 0.1;
            this.currentSpriteID++;
            if (this.currentSpriteID > 4) this.currentSpriteID = 2;
            this.currentSprite = this.sprites[this.currentSpriteID];
          }
        }
        break;
      case "jump":
      case "fall":
        this.currentSprite = this.sprites[5]; break;
      case "skid":
        this.currentSprite = this.sprites[6]; break;
      case "squat":
        this.currentSprite = this.sprites[7]; break;
      case "dead":
        this.currentSprite = this.sprites[0]; break;
      default:
        this.currentSprite = this.sprites[1]; break;
    }

    this.lastState = state;
  }

  draw(ctx, x, y, flip=false) {
    this.currentSprite.image.draw(ctx, x, y, flip);
  }

  loadSprites() {
    const sprites = [];
    this.sprites = sprites;
    // ----- 0
    sprites.push(new Sprite(["mario/mario_death"], [0], true));
    // ----- 1
    sprites.push(new Sprite(["mario/mario"], [0], true));
    // ----- 2
    sprites.push(new Sprite(["mario/mario_move0"], [0], true));
    // ----- 3
    sprites.push(new Sprite(["mario/mario_move1"], [0], true));
    // ----- 4
    sprites.push(new Sprite(["mario/mario_move2"], [0], true));
    // ----- 5
    sprites.push(new Sprite(["mario/mario_jump"], [0], true));
    // ----- 6 when slowing down, show the mario brake image
    sprites.push(new Sprite(["mario/mario_st"], [0], true));
    // ----- 7
    sprites.push(new Sprite(["mario/mario"], [0], true)); // SQUAT, same as 1
  }
}