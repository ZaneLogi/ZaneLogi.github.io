// lunar_lander/demos/screen.js — in-game screen layout (WIP, built step by step)
//
// Target: composite the in-game components on a faithful 1024×768 DVG field
// (origin bottom-left, Y-up). Backing store follows asteroids_clone/main.js
// (CSS size × DPR); all drawing stays in 1024×768 logical coords.
//
// Step 1 — HUD base: the $5458 vector composite (the 2×3 in-game HUD label grid)
//          drawn byte-faithfully at its native position, exactly as hud.html.
// Step 2 — values, in the ROM's own glyphs, on the three row baselines
//          (748/720/692 → canvas y 20/48/76):
//            • left column  — left-aligned at x=184
//            • right column — right-aligned to x=864
//          TIME uses the colon glyph $55B2 (two dots, half-width) between MM/SS.

import { ROM598, ROM599 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const W = 1024, H = 768;
const DIGIT_W = 12;            // a digit/letter glyph advances 12 logical units
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

// Named non-alphanumeric glyphs (outside the letter/digit blocks).
const GLYPH = {
  SPACE:       'S_5726',
  COLON:       'S_55B2',   // two stacked dots; advance 6 (= half a digit) — TIME's MM:SS separator
  ARROW_RIGHT: 'S_5566',
  ARROW_LEFT:  'S_5576',
  ARROW_UP:    'S_5586',
  ARROW_DOWN:  'S_5598',
};

// Character → glyph subroutine. Digits 1-9 follow the alphabet ($572A…$5794);
// 0 reuses the letter O ($5688); space and colon are named above.
const CHAR_GLYPH = { ' ': GLYPH.SPACE, ':': GLYPH.COLON, '0': 'S_5688' };
[0x572A, 0x5732, 0x5742, 0x5750, 0x575E, 0x576C, 0x577A, 0x5784, 0x5794]
  .forEach((a, i) => { CHAR_GLYPH[String(i + 1)] = 'S_' + a.toString(16).toUpperCase(); });

// Draw a string with the ROM's glyphs at canvas baseline (px, py); glyphs rise
// (canvas y-down). Zero-length bright vectors (e.g. the colon dots) draw as dots.
// Returns the total advance width in logical units.
function drawText(str, px, py, scale, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  let penX = 0;
  for (const ch of str) {
    const key = CHAR_GLYPH[ch] || GLYPH.SPACE;
    const cur = { x: 0, y: 0 }; const segs = [];
    runList(ROM598, [{ op: 'LABS', x: 0, y: 0, globalScale: 0 }, { op: 'JSR', target: key }],
            cur, 0, (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
    for (const s of segs) {
      const x0 = px + (penX + s.fx) * scale, y0 = py - s.fy * scale;
      if (s.fx === s.tx && s.fy === s.ty) {           // a point (colon dot)
        ctx.beginPath(); ctx.arc(x0, y0, Math.max(1, scale), 0, 7); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(px + (penX + s.tx) * scale, py - s.ty * scale); ctx.stroke();
      }
    }
    penX += cur.x || DIGIT_W;
  }
  return penX;
}

// Right-justify a string so it ends at canvas x = rightX.
function drawTextRight(str, rightX, py, scale, color) {
  drawText(str, rightX - str.length * DIGIT_W * scale, py, scale, color);
}

// Draw an arrow glyph with its pen at x=px, vertically centered on the digit
// band of the row whose digit baseline is digitPy. (Digits occupy fy 0..12,
// center 6; the arrow glyphs carry their own y-offset, so we re-center them.)
function drawArrowCentered(key, px, digitPy, color) {
  const c = { x: 0, y: 0 }; const segs = []; let mn = 1e9, mx = -1e9;
  runList(ROM598, [{ op: 'LABS', x: 0, y: 0, globalScale: 0 }, { op: 'JSR', target: key }], c, 0,
          (fx, fy, tx, ty) => { segs.push({ fx, fy, tx, ty }); mn = Math.min(mn, fy, ty); mx = Math.max(mx, fy, ty); });
  const py = digitPy - 6 + (mn + mx) / 2;   // align arrow's y-center to the digit band's center
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs) { ctx.beginPath(); ctx.moveTo(px + s.fx, py - s.fy); ctx.lineTo(px + s.tx, py - s.ty); ctx.stroke(); }
}

// Terrain: the 15 tiles $5000-$507E in address order. Best-effort match to the
// snapshot — address order lands the tall peak (~tile 7) and the flat pad
// $506C (~tile 13) where the snapshot has them. The real sequence + draw-scale
// are CPU-side, so this is a silhouette approximation: chained and uniformly
// scaled to fill the screen width, sitting at the bottom.
const TILES = ['S_5000', 'S_500A', 'S_5010', 'S_5016', 'S_5020', 'S_5026', 'S_502E', 'S_5038',
  'S_5040', 'S_504C', 'S_516E', 'S_5058', 'S_5060', 'S_506C', 'S_5072', 'S_507E'];
//                              ^ flat pad $516E inserted at the deepest valley ($504C/$5058)

// Flat-line segments inside each of the 15 terrain tiles — [xStart, xEnd] offsets
// from the tile's own start (0–256). Pure flat-pad glyphs ($516E/$519C) excluded;
// $5026 has no flat.
//
// Landing multiplier is derived from the flat's WIDTH:
//     multiplier = 1 + 64 / (xEnd - xStart)
//   width 64 → 2X, 32 → 3X, 16 → 5X.  width 128 → 1.5 (plain terrain, not a marked
//   pad); 4X (~21 wide) doesn't occur. Trailing comment: each flat's height (DVG y,
//   rel. to tile start; y<0 = low valley pad, y>0 = high shelf) and its multiplier.
const TILE_FLATS = {
  S_5000: [[0, 32], [40, 72], [80, 96]],   // y 0/-32/-64  · 3X/3X/5X
  S_500A: [[0, 32]],                       // y 0          · 3X
  S_5010: [[96, 128]],                     // y +80        · 3X
  S_5016: [[32, 64]],                      // y -64        · 3X
  S_5020: [[32, 96]],                      // y -32        · 2X (mid pad)
  S_5026: [],                              // (continuous rise — no flat)
  S_502E: [[0, 32]],                       // y 0          · 3X
  S_5038: [[0, 32], [40, 72], [80, 96]],   // y 0/-32/-64  · 3X/3X/5X
  S_5040: [[128, 160], [192, 224]],        // y -160/-384  · 3X/3X
  S_504C: [[128, 160]],                    // y -416       · 3X
  S_5058: [[64, 80], [224, 256]],          // y +224/+384  · 5X/3X
  S_5060: [[192, 256]],                    // y -352       · 2X (joins $506C)
  S_506C: [[128, 256]],                    // y -32        · plain terrain (128 wide)
  S_5072: [[32, 64], [160, 192]],          // y +224/+416  · 3X/3X
  S_507E: [[32, 96]],                      // y -32        · 2X
};
function drawTerrain(color) {
  const segs = []; const c = { x: 0, y: 0 };
  runList(ROM598, [{ op: 'LABS', x: 0, y: 0, globalScale: 0 }, ...TILES.map(k => ({ op: 'JSR', target: k }))],
          c, 0, (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
  let a = 1e9, b = -1e9, e = 1e9, d = -1e9;
  for (const s of segs) { a = Math.min(a, s.fx, s.tx); b = Math.max(b, s.fx, s.tx); e = Math.min(e, s.fy, s.ty); d = Math.max(d, s.fy, s.ty); }
  const sc = W / (b - a);                 // X: fit the full wrapping profile to screen width
  const ox = -a * sc;                     // left edge at x=0
  // Y: map the terrain's height range into the snapshot's vertical band — peak at
  // TERRAIN_TOP, lowest valley at TERRAIN_BASE (tunable; from the snapshot).
  const TERRAIN_TOP = 404, TERRAIN_BASE = 739;
  const sy = (TERRAIN_BASE - TERRAIN_TOP) / (d - e);
  const yAt = y => TERRAIN_BASE - (y - e) * sy;     // y=e (lowest) → BASE; y=d (peak) → TOP
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(ox + s.fx * sc, yAt(s.fy));
    ctx.lineTo(ox + s.tx * sc, yAt(s.ty));
    ctx.stroke();
  }
}

// Draw a 034599 lander pose centered at canvas (cx, cy), Y-flipped, at `scale`.
function drawLander(key, cx, cy, scale, color) {
  const segs = []; const c = { x: 0, y: 0 };
  runList(ROM599, [{ op: 'LABS', x: 0, y: 0, globalScale: 0 }, { op: 'JSR', target: key }], c, 0,
          (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
  let a = 1e9, b = -1e9, e = 1e9, d = -1e9;
  for (const s of segs) { a = Math.min(a, s.fx, s.tx); b = Math.max(b, s.fx, s.tx); e = Math.min(e, s.fy, s.ty); d = Math.max(d, s.fy, s.ty); }
  const bcx = (a + b) / 2, bcy = (e + d) / 2;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(cx + (s.fx - bcx) * scale, cy - (s.fy - bcy) * scale);
    ctx.lineTo(cx + (s.tx - bcx) * scale, cy - (s.ty - bcy) * scale);
    ctx.stroke();
  }
}

function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Terrain backdrop (15 tiles, address order, fit to width — see drawTerrain).
  drawTerrain('rgba(140,255,140,0.85)');

  // HUD base: the $5458 composite at its native DVG position (draws the 2×3
  // label grid). Byte-faithful, same as hud.html.
  const segs = []; const cur = { x: 0, y: 0 };
  runList(ROM598, ROM598['S_5458'], cur, 0, (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }));
  ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(s.fx, H - s.fy);          // DVG y-up → canvas y-down
    ctx.lineTo(s.tx, H - s.ty);
    ctx.strokeStyle = `rgba(0,255,0,${Math.max(0.4, s.bri / 15)})`;
    ctx.stroke();
  }

  // Values. Rows: SCORE/ALTITUDE y=20, TIME/H-SPEED y=48, FUEL/V-SPEED y=76.
  const v = 'rgba(0,255,0,0.95)';
  const LEFT_X = 184;                  // left value column (from $5458 padding)
  const RIGHT_X = 885;                 // right value edge — from snapshot (~13.5% right margin)

  drawText('0000', LEFT_X, 20, 1, v);   // SCORE  — 4 digits, left-aligned
  drawText('00:07', LEFT_X, 48, 1, v);  // TIME   — MM : SS (colon = $55B2)
  drawText('0739', LEFT_X, 76, 1, v);   // FUEL   — 4 digits, left-aligned

  drawTextRight('2072', RIGHT_X, 20, 1, v);   // ALTITUDE
  drawTextRight('104', RIGHT_X, 48, 1, v);    // HORIZONTAL SPEED
  drawTextRight('59', RIGHT_X, 76, 1, v);     // VERTICAL SPEED

  // Direction arrows after the two speed values (pen at the value's right edge;
  // each arrow glyph's own left margin supplies the gap), centered on the digits.
  drawArrowCentered(GLYPH.ARROW_RIGHT, RIGHT_X, 48, v);   // HORIZONTAL SPEED →
  drawArrowCentered(GLYPH.ARROW_DOWN, RIGHT_X, 76, v);    // VERTICAL SPEED ↓

  // Lander — zoom-out (far) stand pose $4DB6 at native scale (1.0); the snapshot
  // shows the far/small lander (~16 DVG), matching this set's native ~15 units.
  drawLander('S_4DB6', 236, 140, 1, 'rgba(0,255,0,1)');
}

// Backing store = displayed CSS size × DPR (same as asteroids_clone/main.js);
// drawing stays in 1024×768 logical coords. Setting canvas.width/height resets
// the transform, so re-apply the DVG→device-pixel scale here, then redraw.
function syncBackingStore() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || W;
  const cssH = canvas.clientHeight || H;
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

function draw() { syncBackingStore(); render(); }
window.addEventListener('resize', draw);
draw();
