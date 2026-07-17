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
//
// A frame is either a NAME (a BMP, resolved through the resource loader) or a
// DRAWABLE the caller already built — anything with `draw(ctx, x, y, mirror)`.
// Mario's frames are composed from the ROM's CHR synchronously and arrive as
// drawables; the Goomba and the animated tiles are still BMPs by name.
export class Animator {
  constructor(spriteSet) {
    this.set = spriteSet;

    // One Sprite per unique frame NAME, built once up front (this also registers
    // each image with the resource loader, as the old animator did). Drawables are
    // already built and need no entry.
    this.frames = {};
    for (const state in spriteSet) {
      for (const f of spriteSet[state].frames) {
        if (typeof f === 'string' && !this.frames[f]) this.frames[f] = new Sprite([f], [0], true);
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
  //
  // A state marked `freeze: true` does NEITHER — it keeps the frame index the
  // previous state left behind, and holds it. That is a third behaviour, not a
  // variant of the other two, and SMB has all three: AnimationControl advances the
  // counter, NonAnimatedActs zeroes it, and GetCurrentAnimOffset only reads it.
  // Mario's fall is the third — the walk cycle stopped mid-stride.
  update(state, dt) {
    const def = this.set[state] ?? this.set.idle;

    if (def.freeze) {
      this.state = state;
      // Guard the borrowed index: a frozen state need not be as long as the one it
      // inherited from.
      this.frameIndex = Math.min(this.frameIndex, def.frames.length - 1);
    } else if (state !== this.state) {
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
    const f = this.current;
    const d = typeof f === 'string' ? this.frames[f].image : f;
    d.draw(ctx, x, y, flip);
  }
}
