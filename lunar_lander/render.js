// lunar_lander/render.js
//
// The render layer — the second "seam" (CLAUDE.md "Planned gameplay module
// layout"). It is the ONE place that (a) turns decoded DVG shape coordinates
// into canvas strokes and (b) owns the camera transform. Modules never touch a
// canvas draw API or re-implement scaling; they call a draw helper with a shape
// KEY, so every vector shape stays single-sourced in the *_rom_data.js files.
//
// This is how "direct dvg draw calls" avoids the duplicate-vector-data worry:
// direct-draw is only about WHEN drawing happens (each module in its own
// render(), no VG-RAM display list). The DATA is still referenced by key from
// the generated ROM tables — the ROM's "library referenced by JSRL" model,
// minus the list machinery. Guard rule: NO vector-coordinate literals in any
// module; decode once (the build scripts) and reference everywhere.
//
// Two coordinate spaces:
//   • WORLD  — scape + lander live here (DVG units); the camera scrolls/scales it.
//   • SCREEN — the HUD lives here (fixed 1024×768; the source's absolute-LABS grid,
//              drawn without the scape scroll — $5458's LABS(100,748)).
// DVG space is Y-up, origin bottom-left (CLAUDE.md "Screen / coordinate space");
// canvas is Y-down, so Y is flipped in both transforms.

import { runList } from './dvg.js';
import { VROM } from './vector_rom_data.js';

export const SCREEN_W = 1024, SCREEN_H = 768;

// DVG intensity (bri 0-15) → phosphor-green stroke. Per-segment so the beam
// brightness is faithful (the DVG sets intensity per vector).
function strokeFor(bri) {
  const a = 0.30 + 0.70 * (bri / 15);
  return `rgba(150,255,170,${a.toFixed(3)})`;
}

// Walk a decoded shape once, handing each visible segment (shape-local DVG
// coords) to emit(fx,fy,tx,ty,bri). Shared by both draw helpers so the dvg
// traversal is written a single time.
function eachSegment(ROM, key, gs, xFlip, yFlip, emit) {
  runList(ROM, ROM[key], { x: 0, y: 0 }, gs, emit, xFlip, yFlip);
}

// WORLD-space draw: shape origin sits at world (wx,wy); the camera scrolls+scales.
// Used by landscape.js (terrain) and lander.js (craft).
export function drawShapeWorld(ctx, cam, ROM, key,
                               { wx = 0, wy = 0, gs = 0, xFlip = false, yFlip = false, width = 1.6 } = {}) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width;
  eachSegment(ROM, key, gs, xFlip, yFlip, (fx, fy, tx, ty, bri) => {
    ctx.strokeStyle = strokeFor(bri);
    ctx.beginPath();
    ctx.moveTo((wx + fx - cam.x) * cam.scale, SCREEN_H - (wy + fy - cam.y) * cam.scale);
    ctx.lineTo((wx + tx - cam.x) * cam.scale, SCREEN_H - (wy + ty - cam.y) * cam.scale);
    ctx.stroke();
  });
}

// SCREEN-space draw: shape centred at pixel (cx,cy), fixed pixel scale — no
// camera. Used by display_info.js (HUD glyph grid) and the step-0 seam test.
export function drawShapeScreen(ctx, ROM, key,
                                { cx = 0, cy = 0, pxScale = 1, gs = 0, xFlip = false, yFlip = false, width = 1.6 } = {}) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width;
  eachSegment(ROM, key, gs, xFlip, yFlip, (fx, fy, tx, ty, bri) => {
    ctx.strokeStyle = strokeFor(bri);
    ctx.beginPath();
    ctx.moveTo(cx + fx * pxScale, cy - fy * pxScale);
    ctx.lineTo(cx + tx * pxScale, cy - ty * pxScale);
    ctx.stroke();
  });
}

// Ink bounding box of a font glyph at scale `gs` (shape-local DVG units).
function glyphBBox(key, gs) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  runList(VROM, VROM[key] || VROM.Char_Space, { x: 0, y: 0 }, gs, (fx, fy, tx, ty) => {
    any = true;
    minX = Math.min(minX, fx, tx); maxX = Math.max(maxX, fx, tx);
    minY = Math.min(minY, fy, ty); maxY = Math.max(maxY, fy, ty);
  });
  return any ? { minX, maxX, minY, maxY } : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
}

// SCREEN-space vector-font text (the `VROM` A-Z + space glyphs). Fixed pitch
// (widest glyph + tracking) for the arcade's monospace look; `cy` is the
// baseline. Used for the start prompt now; the HUD reuses it at step 4.
export function drawText(ctx, str, { cx = 0, cy = 0, pxScale = 4, gs = 0, tracking = 3, width = 1.8, align = 'center' } = {}) {
  const chars = [...String(str).toUpperCase()];
  const keyFor = ch => (ch === ' ' ? 'Char_Space' : (VROM['Char_' + ch] ? 'Char_' + ch : 'Char_Space'));
  let maxW = 0;
  for (const ch of chars) { const b = glyphBBox(keyFor(ch), gs); maxW = Math.max(maxW, b.maxX - b.minX); }
  const pitch = maxW + tracking;                              // units per cell
  const totalU = pitch * chars.length;
  const x0 = align === 'center' ? -totalU / 2 : (align === 'right' ? -totalU : 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width;
  chars.forEach((ch, i) => {
    const gx = cx + (x0 + i * pitch) * pxScale;
    runList(VROM, VROM[keyFor(ch)], { x: 0, y: 0 }, gs, (fx, fy, tx, ty, bri) => {
      ctx.strokeStyle = strokeFor(bri);
      ctx.beginPath();
      ctx.moveTo(gx + fx * pxScale, cy - fy * pxScale);
      ctx.lineTo(gx + tx * pxScale, cy - ty * pxScale);
      ctx.stroke();
    });
  });
}
