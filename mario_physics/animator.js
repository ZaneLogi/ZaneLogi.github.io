import { Sprite } from "../mario/sprite.js";

// ----------------------
// Animator
// ----------------------
// Plays a sprite-set for any thing — an actor, a block, a pickup. A sprite-set
// maps each state to its frames and playback rate:
//
//   { idle: { frames: ["a"] },
//     walk: { frames: ["b","c","d"], fps: 10 }, ... }
//
// The animator holds no knowledge of what it is animating; the caller tells it
// which state to show each step, and the animator advances frames over time.
// Frame-cycling lives here and nowhere else, so a new thing's animation is a
// sprite-set passed in, not new animator code.
export class Animator {
  constructor(spriteSet) {
    this.set = spriteSet;

    // One drawable Sprite per unique frame name, built once up front (this also
    // registers each image with the resource loader, as the old animator did).
    this.frames = {};
    for (const state in spriteSet) {
      for (const name of spriteSet[state].frames) {
        if (!this.frames[name]) this.frames[name] = new Sprite([name], [0], true);
      }
    }

    this.state = null;      // current state being played
    this.frameIndex = 0;    // index within the current state's frames
    this.timer = 0;         // time accumulated toward the next frame
    // Show something sensible before the first update().
    this.current = (spriteSet.idle ?? Object.values(spriteSet)[0]).frames[0];
  }

  // Show `state` this step. On a state change, restart at its first frame;
  // otherwise advance the cycle by `dt` at the state's fps (default 10).
  update(state, dt) {
    const def = this.set[state] ?? this.set.idle;

    if (state !== this.state) {
      this.state = state;
      this.frameIndex = 0;
      this.timer = 0;
    } else if (def.frames.length > 1) {
      const step = 1 / (def.fps ?? 10);
      this.timer += dt;
      while (this.timer >= step) {
        this.timer -= step;
        this.frameIndex = (this.frameIndex + 1) % def.frames.length;
      }
    }

    this.current = def.frames[this.frameIndex];
  }

  draw(ctx, x, y, flip = false) {
    this.frames[this.current].image.draw(ctx, x, y, flip);
  }
}
