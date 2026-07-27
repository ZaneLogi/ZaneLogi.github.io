// lemmings/assets/animation_metadata.js
//
// Runtime metadata for the lemming animations — consumed together with
// `lemmings_atlas.png`. Frame counts, sprite dimensions, FOOT ANCHORS,
// loop/once mode, and each animation's row (atlasY) in the atlas image.
//
// ─── PROVENANCE ──────────────────────────────────────────────────────────
// frames / w / h / footX / footY / loop : transcribed from Lemmix
//   `src/Styles.Base.pas`, TLemmingAnimationSet.InitMetadata. Lemmix's own
//   note there: "foot positions from ccexplore's emails" — ccexplore's
//   reverse-engineering, the same authority Throng's docs/design_spec.md uses.
// atlasY : the animation's top row in `lemmings_atlas.png`, produced by
//   `tools/extract_atlas.py` (one animation per row, in this table's order).
//
// ─── DECODE FIELDS LIVE IN THE EXTRACTOR, NOT HERE ───────────────────────
// The MAIN.DAT byte `offset` and `bpp` — how pixels are *packed inside the
// original file* — are decode-time concerns and live only in
// `tools/extract_atlas.py`. Once the atlas is built they are never read at
// runtime, so they are deliberately kept out of this table: the demo consumes
// the atlas PNG, never MAIN.DAT.
//
// ─── HOW TO USE (design_spec.md §2.1, §1.4 — anchors are NORMATIVE) ───────
// A lemming's (x, y) is its FOOT. To draw frame k of an animation:
//     srcX = k * w,   srcY = atlasY,   srcW = w,  srcH = h      // in the atlas
//     dstX = lemming.x - footX,        dstY = lemming.y - footY // on screen
// The same anchor origin also positions the fixed 13×13 cursor hit box
// (§18.2), so the anchors decide which lemming a click selects — normative,
// not cosmetic.
//
// ─── ORDER IS PRESERVED ──────────────────────────────────────────────────
// The 28 entries are in MAIN.DAT section-0 / atlas-row order. Left- and
// right-facing forms are separate rows ("_rtl" = facing left) but share the
// same anchor. Keep this order in sync with `tools/extract_atlas.py` — the two
// must agree or atlasY will not line up with the image.
//
// `loop` : true  = cycles (design_spec §14 "Loop")
//          false = plays once and holds its last frame ("Once")

export const LEMMING_ANIMATIONS = [
  //  name              frames   w    h  footX footY   loop     atlasY
  { name: 'walking',       frames:  8, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY:   0 },
  { name: 'jumping',       frames:  1, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY:  10 },
  { name: 'walking_rtl',   frames:  8, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY:  20 },
  { name: 'jumping_rtl',   frames:  1, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY:  30 },
  { name: 'digging',       frames: 16, w: 16, h: 14, footX:  8, footY: 12, loop: true,  atlasY:  40 },
  { name: 'climbing',      frames:  8, w: 16, h: 12, footX:  8, footY: 12, loop: true,  atlasY:  54 },
  { name: 'climbing_rtl',  frames:  8, w: 16, h: 12, footX:  8, footY: 12, loop: true,  atlasY:  66 },
  { name: 'drowning',      frames: 16, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY:  78 },
  { name: 'hoisting',      frames:  8, w: 16, h: 12, footX:  8, footY: 12, loop: false, atlasY:  88 },
  { name: 'hoisting_rtl',  frames:  8, w: 16, h: 12, footX:  8, footY: 12, loop: false, atlasY: 100 },
  { name: 'building',      frames: 16, w: 16, h: 13, footX:  8, footY: 13, loop: true,  atlasY: 112 },
  { name: 'building_rtl',  frames: 16, w: 16, h: 13, footX:  8, footY: 13, loop: true,  atlasY: 125 },
  { name: 'bashing',       frames: 32, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY: 138 },
  { name: 'bashing_rtl',   frames: 32, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY: 148 },
  { name: 'mining',        frames: 24, w: 16, h: 13, footX:  8, footY: 13, loop: true,  atlasY: 158 },
  { name: 'mining_rtl',    frames: 24, w: 16, h: 13, footX:  8, footY: 13, loop: true,  atlasY: 171 },
  { name: 'falling',       frames:  4, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY: 184 },
  { name: 'falling_rtl',   frames:  4, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY: 194 },
  { name: 'umbrella',      frames:  8, w: 16, h: 16, footX:  8, footY: 16, loop: true,  atlasY: 204 },
  { name: 'umbrella_rtl',  frames:  8, w: 16, h: 16, footX:  8, footY: 16, loop: true,  atlasY: 220 },
  { name: 'splatting',     frames: 16, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY: 236 },
  { name: 'exiting',       frames:  8, w: 16, h: 13, footX:  8, footY: 13, loop: false, atlasY: 246 },
  { name: 'vaporizing',    frames: 14, w: 16, h: 14, footX:  8, footY: 14, loop: false, atlasY: 259 },
  { name: 'blocking',      frames: 16, w: 16, h: 10, footX:  8, footY: 10, loop: true,  atlasY: 273 },
  { name: 'shrugging',     frames:  8, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY: 283 },
  { name: 'shrugging_rtl', frames:  8, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY: 293 },
  { name: 'ohnoing',       frames: 16, w: 16, h: 10, footX:  8, footY: 10, loop: false, atlasY: 303 },
  { name: 'exploding',     frames:  1, w: 32, h: 32, footX: 16, footY: 25, loop: false, atlasY: 313 },
];

// ─── Mask animations (MAIN.DAT section 1) — NOT YET EXTRACTED ─────────────
// Terrain-removal masks (1bpp: a set bit removes terrain, design_spec §16.1)
// plus the countdown digits (HUD art, §21). These are NOT in the sprite atlas.
// When built, the masks will be baked as bit arrays the simulation reads
// directly, and the digits as HUD art — each with its own coordinates then.
// Dimensions below are from Lemmix `Msk(...)`; their section-1 byte offsets
// live with the (future) mask extractor, not in this runtime table.
export const LEMMING_MASKS = [
  //  name           frames   w    h
  { name: 'bash',       frames: 4, w: 16, h: 10 },
  { name: 'bash_rtl',   frames: 4, w: 16, h: 10 },
  { name: 'mine',       frames: 2, w: 16, h: 13 },
  { name: 'mine_rtl',   frames: 2, w: 16, h: 13 },
  { name: 'explosion',  frames: 1, w: 16, h: 22 },
  { name: 'countdown',  frames: 5, w:  8, h:  8 }, // digits 5..0
];
