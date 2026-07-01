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

// WORLD-space draw of a PRE-COMPUTED segment list (world DVG coords) through the
// camera. For terrain: landscape.js owns the geometry (and the future height/pad
// queries) and hands the segments here; render.js owns the canvas + transform.
// One beginPath (terrain strokes are uniform brightness), so it's cheap per frame.
export function drawSegmentsWorld(ctx, cam, segs, { color = 'rgba(150,255,170,0.92)', width = 1.6 } = {}) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of segs) {
    ctx.moveTo((s.fx - cam.x) * cam.scale, SCREEN_H - (s.fy - cam.y) * cam.scale);
    ctx.lineTo((s.tx - cam.x) * cam.scale, SCREEN_H - (s.ty - cam.y) * cam.scale);
  }
  ctx.stroke();
}

// SCREEN-space draw of a PRE-COMPUTED segment list (shape-local DVG coords),
// centred at pixel (cx,cy). For the lander pose + flame (precomputed with flips /
// synthesized). Per-segment bri unless `color` overrides.
export function drawSegmentsScreen(ctx, segs, { cx = 0, cy = 0, pxScale = 1, color = null, width = 1.6 } = {}) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width;
  for (const s of segs) {
    ctx.strokeStyle = color || strokeFor(s.bri == null ? 12 : s.bri);
    ctx.beginPath();
    ctx.moveTo(cx + s.fx * pxScale, cy - s.fy * pxScale);
    ctx.lineTo(cx + s.tx * pxScale, cy - s.ty * pxScale);
    ctx.stroke();
  }
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

// Measure the total DVG-cursor advance of a run of glyph KEYS chained back-to-back
// (the source's $5458 model: each glyph's trailing dark move steps to the next
// char origin — verified in discovery_rom_data.js). Returns width in DVG units.
function glyphRunWidth(ROM, keys, gs) {
  const cur = { x: 0, y: 0 };
  for (const k of keys) runList(ROM, [{ op: 'JSR', target: k }], cur, gs, () => {});
  return cur.x;
}

// SCREEN-space run of ROM glyph shapes along a baseline (px,py), each advancing by
// its own native width — the value renderer for the HUD (SCORE/TIME/FUEL/speeds).
// `align`: 'left' → first char at x; 'right' → the run ends at x (units digit fixed,
// number grows left — the MAME-measured right-column behaviour). Zero-length bright
// vectors (the colon dots) render as dots. Baseline is Y-up (glyph rises above py).
export function drawGlyphString(ctx, ROM, keys,
                                { x = 0, y = 0, pxScale = 1, gs = 0, align = 'left', color = null, width = 1.6 } = {}) {
  const x0 = align === 'right' ? x - glyphRunWidth(ROM, keys, gs) * pxScale : x;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width;
  const cur = { x: 0, y: 0 };
  for (const k of keys) {
    runList(ROM, [{ op: 'JSR', target: k }], cur, gs, (fx, fy, tx, ty, bri) => {
      const col = color || strokeFor(bri);
      if (fx === tx && fy === ty) {                 // zero-length vector = a dot (colon)
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x0 + fx * pxScale, y - fy * pxScale, Math.max(1, pxScale * 0.6), 0, 7);
        ctx.fill();
        return;
      }
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0 + fx * pxScale, y - fy * pxScale);
      ctx.lineTo(x0 + tx * pxScale, y - ty * pxScale);
      ctx.stroke();
    });
  }
}

// SCREEN-space arrow glyph, vertically centred on a digit row. The arrow glyphs
// ($5566/$5576/$5586/$5598) carry their own y-offset within the HUD grid; here we
// re-centre them on the digit band (digits occupy fy 0..12, centre 6) whose baseline
// is `baselineY`, and place the pen at `x` — the MAME-measured speed-arrow spot.
export function drawArrowGlyph(ctx, ROM, key, { x = 0, baselineY = 0, pxScale = 1, gs = 0, color = null, width = 1.6 } = {}) {
  const segs = []; let mn = Infinity, mx = -Infinity;
  eachSegment(ROM, key, gs, false, false, (fx, fy, tx, ty, bri) => {
    segs.push({ fx, fy, tx, ty, bri });
    mn = Math.min(mn, fy, ty); mx = Math.max(mx, fy, ty);
  });
  const cy = baselineY - (6 - (mn + mx) / 2) * pxScale;   // align arrow's y-centre to the digit band's centre (6)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width;
  for (const s of segs) {
    ctx.strokeStyle = color || strokeFor(s.bri);
    ctx.beginPath();
    ctx.moveTo(x + s.fx * pxScale, cy - s.fy * pxScale);
    ctx.lineTo(x + s.tx * pxScale, cy - s.ty * pxScale);
    ctx.stroke();
  }
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
