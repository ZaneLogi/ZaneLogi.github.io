// lemmings/src/constants.js
//
// World and viewport dimensions (design_spec §2.2, §2.4). Fixed for every level.

export const WORLD_W = 1584;   // world width in pixels (§2.2)
export const WORLD_H = 160;    // world height in pixels (§2.2)

export const VIEWPORT_W = 320; // world view width (§2.4) — a difficulty term, not a display choice
export const VIEWPORT_H = 160; // world view height (§2.4) — equals WORLD_H, so no vertical scroll

export const SCROLL_MAX = WORLD_W - VIEWPORT_W; // 1264 — horizontal scroll range (§2.4)
