// lemmings/src/sprite_sheet.js
//
// Reusable lemming sprite renderer. Loads the extracted atlas
// (assets/lemmings_atlas.png) and draws any animation frame at a given FOOT
// position, applying the animation's foot anchor (design_spec §2.1). This is
// the primitive both the sprite demo and the eventual game renderer use to put
// a lemming on a canvas: the sim owns a foot point (x, y); this draws the sprite
// so its anchor lands there.
//
// It reads the animation table from assets/animation_metadata.js (frames, w, h,
// footX, footY, loop, atlasY) — the atlas layout is "frame k at (k*w, atlasY)".

import { LEMMING_ANIMATIONS } from '../assets/animation_metadata.js';

const ATLAS_URL = new URL('../assets/lemmings_atlas.png', import.meta.url);

export class SpriteSheet {
  constructor(image) {
    this.image = image;
    this.anims = new Map();
    for (const a of LEMMING_ANIMATIONS) this.anims.set(a.name, a);
  }

  // Load the atlas image and resolve to a ready SpriteSheet.
  static load() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(new SpriteSheet(img));
      img.onerror = () => reject(new Error('SpriteSheet: failed to load ' + ATLAS_URL.href));
      img.src = ATLAS_URL.href;
    });
  }

  // Animation metadata by name (throws on unknown name).
  get(name) {
    const a = this.anims.get(name);
    if (!a) throw new Error('SpriteSheet: unknown animation "' + name + '"');
    return a;
  }

  names() { return [...this.anims.keys()]; }

  // Resolve a base animation name to its facing variant. Mirrored animations
  // have a "<base>_rtl" (facing-left) form; symmetric ones do not — for those
  // the base name is returned regardless of facing (design_spec §14.5).
  directional(base, facingLeft) {
    if (facingLeft && this.anims.has(base + '_rtl')) return base + '_rtl';
    return base;
  }

  // Draw `name` frame `frame` so the FOOT anchor lands at (footX, footY) in the
  // context, scaled by `scale`. (footX, footY) are canvas pixels — pass the
  // lemming's on-screen foot position. `frame` is wrapped into range.
  drawFrame(ctx, name, frame, footX, footY, scale = 1) {
    const a = this.get(name);
    const f = ((frame % a.frames) + a.frames) % a.frames;
    const dx = Math.round(footX - a.footX * scale);
    const dy = Math.round(footY - a.footY * scale);
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.image,
      f * a.w, a.atlasY, a.w, a.h,        // source rect in the atlas
      dx, dy, a.w * scale, a.h * scale,   // destination rect
    );
    ctx.imageSmoothingEnabled = prevSmoothing;
  }
}
