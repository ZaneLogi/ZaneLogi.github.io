import { resolveCollision } from './collision.js';
import { TILES } from './tiles.js';
import { Animator } from './animator.js';
import { EnvObject } from './env_object.js';

/** @typedef {import('./env_types.js').EnvType} EnvType */

const BUMP_DURATION = 0.18; // seconds for a bumped block's up-and-down hop
const BUMP_HEIGHT = 10;     // peak rise of the hop, in pixels

export class World {
  constructor(levelMap) {
    this.levelMap = levelMap;
    this.objects = [];

    // Environment objects: free-positioned solids/triggers actors are resolved
    // AGAINST, distinct from both the actor list and the tile grid. A body + a
    // look this step; solidity/reactions/motion come later. Never run through the
    // actor pipeline -- resolveCollision is never called on one.
    this.envObjects = [];

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

  // Actors leave: a stomped enemy, a collected mushroom, a spent fireball.
  removeActor(actor) {
    const i = this.objects.findIndex((o) => o.actor === actor);
    if (i >= 0) this.objects.splice(i, 1);
  }

  /**
   * Place an environment object at a free (x, y) -- the creator, symmetric with
   * addActor. Builds the instance (and its animator) from the type.
   * @param {EnvType} def  an ENV_TYPES entry.
   * @param {number} x      world x.
   * @param {number} y      world y.
   * @returns {EnvObject} the placed object, so a caller can hold onto it (a moving
   *   platform's path, say).
   */
  addEnvObject(def, x, y) {
    const obj = new EnvObject(def, x, y);
    this.envObjects.push(obj);
    return obj;
  }

  // Phase-major: every actor finishes a phase before any actor starts the next.
  // With one actor this is identical to running all four phases per actor, but it
  // is the only shape that can host actor-vs-actor work — comparing two actors is
  // meaningless if the first has already integrated and the second has not — and it
  // keeps every actor's view of the world a consistent snapshot of the last tick
  // rather than one that depends on array order.
  update(dt) {
    // 1. control — the type's controller perceives and produces intent. Kept a
    //    phase of its own so that a controller which looks at the world sees a
    //    consistent snapshot, before any movement has changed a velocity.
    for (const obj of this.objects) obj.intent = obj.actor.def.control(obj.actor);

    // 2. move — the type's movement turns intent + last tick's contacts -> velocity
    for (const obj of this.objects) obj.actor.def.move(obj.actor, obj.intent, dt);

    // 3. collide — integrate and resolve against the tiles AND solid env objects
    //    -> fresh contacts
    for (const obj of this.objects) {
      obj.actor.contacts = resolveCollision(obj.actor, this.levelMap, this.envObjects, dt);
    }

    // 4. react — the world responds to what was touched
    for (const obj of this.objects) this.reactToContacts(obj.actor);

    // 5. present — velocity + contacts -> animation
    for (const obj of this.objects) {
      obj.actor.updateAnimationState();
      obj.animator.update(obj.actor.currentState, dt);
    }

    // Environment-object animations advance on the same clock (a static object's
    // single-frame `idle` is a no-op; an animated one, e.g. a ? block, shimmers).
    for (const o of this.envObjects) o.animator.update(o.currentState, dt);

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
    if (b.kind === 'tile') {
      const id = this.levelMap.tileData[b.ty]?.[b.tx];
      TILES[id]?.onBump?.(this, b.tx, b.ty, actor);
    } else if (b.kind === 'env') {
      // Env head-bump reaction (onBump) arrives in step 3; a solid with no reaction
      // just blocks. (onLand, for a spring, will hang off groundRef then.) The
      // dispatch lives here so the world stays the decider.
      b.obj.def.onBump?.(this, b.obj, actor);
    }
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

    // Environment objects, drawn behind actors (a coin or ladder that must sit in
    // front is a later per-type layer hint). Free-positioned, so world→screen
    // straight from their own (x, y); off-screen ones draw off-canvas harmlessly.
    for (const o of this.envObjects) {
      const { sx, sy } = camera.worldToScreen(o.x, o.y);
      o.animator.draw(ctx, sx, sy, false);
    }

    // Every actor, in spawn order — the player is not special here.
    for (const obj of this.objects) {
      const { sx, sy } = camera.worldToScreen(obj.actor.x, obj.actor.y);
      obj.animator.draw(ctx, sx, sy, obj.actor.facing === -1);
    }
  }
}