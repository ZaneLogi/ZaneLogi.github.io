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

// $72FE +$0400 / 8 = +128 DVG-y offset added to every playfield slot's
// DVG-y before LABS emit. See research_hud_coords.md §2 + §3 — shifts
// the playfield's natural [0, 768) Y range onto the cabinet's visible
// [128, 896) rectangle. HUD callsites use $7C03 directly without this
// offset (research_hud_coords.md §2.3).
export const PLAYFIELD_Y_OFFSET = 128;
