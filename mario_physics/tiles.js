// ----------------------
// TILES
// ----------------------
// Type definitions for grid-fixed things — the Type Object pattern, mirroring
// ACTOR_TYPES but for the tile map. Keyed by the id stored in the level grid,
// each entry declares whether the tile blocks movement (`solid`) and how it
// looks (`look`). A flat-colour tile carries `look.color`; a sprite tile will
// carry `look.frames` (added when the ? block lands). Adding a new tile is a new
// entry here, not new collision or draw code.
export const TILES = {
  0: { solid: false },                             // empty
  1: { solid: true, look: { color: "#654321" } },  // ground
  2: { solid: true, look: { color: "#883300" } },  // platform / step

  // ? block: animated (shimmer), and reacts when head-bumped from below —
  // it hops and spends itself into a used block. onBump is the tile's response,
  // handed the world so it can drive the hop and the state flip.
  3: {
    solid: true,
    look: { frames: ["blockq_0", "blockq_1", "blockq_2"], fps: 6 },
    onBump: (world, tx, ty) => {
      world.bumpTile(tx, ty);
      world.setTile(tx, ty, 5);
    },
  },

  // Breakable brick: hops when head-bumped but doesn't spend itself — an empty
  // brick bumps on every hit. Breaking (big Mario -> shards) is deferred until
  // there's a power state; for now it only ever hops, which is exactly small
  // Mario's behaviour.
  4: {
    solid: true,
    look: { frames: ["brick1"] },
    onBump: (world, tx, ty) => world.bumpTile(tx, ty),
  },

  // Used / empty block (no dedicated sprite in the asset set — flat bronze).
  5: { solid: true, look: { color: "#a56a20" } },
};

// Whether a tile id blocks movement. Unknown ids — including out-of-bounds,
// which the level map reads as undefined — default to solid, preserving the
// original "anything that isn't explicitly empty is solid" edge behaviour.
export function isSolid(id) {
  const t = TILES[id];
  return t ? t.solid : true;
}
