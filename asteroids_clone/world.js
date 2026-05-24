// asteroids_clone/world.js
//
// World geometry + coord-system conversion constants. Shared by every
// actor class (Asteroid / Ship / Saucer / Shot). See
// research_position_math.md §6 for the three-layer (game / DVG /
// canvas) coord model.

// $6FDC AND #$1F (X high-byte modulus) and $7007 CMP #$18 (Y limit).
// Game-coord domain is [0, 32) × [0, 24); positions are Float64 per
// R-C §7 port deviation.
export const WORLD_W = 32;
export const WORLD_H = 24;

// DVG visible area is 1024×768; 32 game units → 1024 DVG, 24 → 768
// (factor 32 either axis). Used by every actor's dvgPos().
export const GAME_TO_DVG = 32;
