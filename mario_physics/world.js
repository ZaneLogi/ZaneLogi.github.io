import { resolveCollision } from './collision.js';
import { TILES } from './tiles.js';
import { Animator } from './animator.js';

const BUMP_DURATION = 0.18; // seconds for a bumped block's up-and-down hop
const BUMP_HEIGHT = 10;     // peak rise of the hop, in pixels

export class World {
  constructor(levelMap) {
    this.levelMap = levelMap;
    this.objects = [];

    // One shared animator per animated tile type, so every tile of that type
    // shimmers in sync (advanced once per update, drawn at each tile position).
    this.tileAnimators = {};
    for (const id in TILES) {
      const look = TILES[id].look;
      if (look?.frames) {
        this.tileAnimators[id] = new Animator({ loop: { frames: look.frames, fps: look.fps } });
      }
    }

    // Active block-bump hops, keyed by "tx,ty" -> { t } (elapsed seconds).
    this.bumps = new Map();
  }

  addActor(actor, actorAnimator) {
    this.objects.push({actor: actor, animator: actorAnimator});
  }

  update(input, dt) {
    for (const obj of this.objects) {
      const actor = obj.actor;
      actor.applyInput(input, dt);                              // 1. intent  -> velocity
      actor.contacts = resolveCollision(actor, this.levelMap, dt); // 2. integrate + collide + respond
      this.reactToContacts(actor);                             // 3. world reacts to the contact
      actor.updateAnimationState();                             // 4. velocity + contacts -> anim state
      obj.animator.update(actor.currentState, dt);
    }

    // Tile shimmer and block-bump hops run on the same fixed clock.
    for (const id in this.tileAnimators) this.tileAnimators[id].update("loop", dt);
    for (const [key, bump] of this.bumps) {
      bump.t += dt;
      if (bump.t >= BUMP_DURATION) this.bumps.delete(key);
    }
  }

  // A rising actor that bumped a tile from below triggers that tile's onBump.
  // The world owns the response; the resolver only reported the contact.
  reactToContacts(actor) {
    const b = actor.contacts.bumped;
    if (!b) return;
    const id = this.levelMap.tileData[b.ty]?.[b.tx];
    TILES[id]?.onBump?.(this, b.tx, b.ty, actor);
  }

  // Start a block's up-and-down hop (ignored if it is already hopping).
  bumpTile(tx, ty) {
    const key = tx + "," + ty;
    if (!this.bumps.has(key)) this.bumps.set(key, { t: 0 });
  }

  // Replace a tile's id (e.g. a spent ? block -> used block).
  setTile(tx, ty, id) {
    this.levelMap.setTile(tx, ty, id);
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
        const id = level[y]?.[x];
        const look = TILES[id]?.look;
        if (!look) continue; // empty or off-map — nothing to draw
        const { sx, sy } = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
        // A bumped block hops up and back over its hop duration.
        const bump = this.bumps.get(x + "," + y);
        const yOff = bump ? -Math.sin((bump.t / BUMP_DURATION) * Math.PI) * BUMP_HEIGHT : 0;
        const dx = Math.round(sx), dy = Math.round(sy + yOff);
        if (look.frames) {
          this.tileAnimators[id].draw(ctx, dx, dy);
        } else if (look.color) {
          ctx.fillStyle = look.color;
          ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
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