// ----------------------
// ENV_TYPES
// ----------------------
// Type definitions for ENVIRONMENT objects -- the Type Object pattern, a third
// registry beside ACTOR_TYPES (mobile things) and TILES (grid cells). An
// environment object is a solid or trigger that actors are resolved AGAINST; it
// is never itself run through resolveCollision. A type is a composition of
// capability facets, each serviced by one phase of the tick:
//
//   size / sprites   a body + a look          -- present   (this step)
//   solid            snapped against          -- collide   (step 2)
//   onBump / onLand  reacts to a contact      -- react     (step 3)
//   onOverlap        a passable trigger       -- sense      (step 4)
//   update           self-driven motion       -- env-motion(step 5)
//
// Adding an environment object is a table entry that picks the facets it needs --
// never engine code. The brick below is solid (the resolver collides actors
// against it, step 2) and hops when head-bumped (onBump, step 3), drawn from the
// ROM's own CHR at 1x (16x16). Still to come: onLand (springs), onOverlap
// (ladders), update (moving platforms).

import { buildMetatile } from './background_frames.js';
import { AREA_PALETTES } from './assets/dat_tiles.js';

// The overworld ("ground") area's four background palettes ($3F00-$3F0F). Brick
// tile $47 uses only pixel indices 2 and 3, so those two entries set its colour:
// index 2 = $17 (burnt orange, the brick face), index 3 = $0f (black, the mortar).
// Ground palettes 1 and 3 are identical at 2/3, so either renders it the same; 0
// (green) and 2 (blue) would miscolour it. The bright orange $27 is the ? block's
// (index 1), which this tile never touches. Verified in demo/chr_viewer.html.
const GROUND = AREA_PALETTES.find((p) => p.name === 'ground').entries;
const BRICK_PALETTE = GROUND[3];

// Normal breakable brick: background metatile $47,$47,$47,$47 -- one crosshatch
// tile repeated 2x2 (SMBDIS.ASM Palette1_MTiles `.db $47,$47,$47,$47 ;breakable
// brick`). The item-carrying "brick w/ line" swaps the top row to $45.
const BRICK = buildMetatile([0x47, 0x47, 0x47, 0x47], BRICK_PALETTE);

/**
 * @typedef {Object} EnvType  An environment-object blueprint. Every facet is
 *   optional except `size` and `sprites`, and each is serviced by one phase of
 *   the tick (see this file's header).
 * @property {{w: number, h: number}} size  drawn extent, in px.
 * @property {boolean} [solid]              collided against by the resolver.
 * @property {Object} sprites               a sprite-set, `{ state: { frames, fps? } }`.
 * @property {function} [onBump]            (world, self, actor) — head-bump reaction.
 */

/** @type {Object.<string, EnvType>} */
export const ENV_TYPES = {
  brick: {
    // `size` is the drawn extent, 16x16 -- the CHR's own size at 1x, which is also
    // Mario's width, so he reads exactly one brick wide (SMB's proportion).
    size: { w: 16, h: 16 },

    // The resolver collides actors against it.
    solid: true,

    // A sprite-set, same shape the Animator plays for actors and animated tiles.
    sprites: { idle: { frames: [BRICK] } },

    // Head-bumped from below: hop, like the grid brick. Small Mario only bounces a
    // brick; breaking it (big Mario -> shards) needs a power state and is deferred.
    onBump: (world, self, actor) => self.bump(),
  },
};
