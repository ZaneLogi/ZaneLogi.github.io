// Frogger sprite-viewer demo — loads the generated atlas + manifest and draws
// every sprite, the tinted monospace font, the frog palette-recolours, and the
// palette. Proves the runtime draw path (drawImage from the atlas), not just the
// Python extractor.
import { ATLAS, GLYPH_W, GLYPH_H, PALETTE, SPRITES, GLYPHS, FROG_RECOLOR }
  from '../assets/dat_sprites.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
cv.width = 760; cv.height = 940;

const atlas = new Image();
atlas.src = ATLAS;
await atlas.decode();

// ---- tint (flat colour, for the white font) + recolour (palette remap, frog) ----
const op = () => { const c = document.createElement('canvas'); c.width = atlas.width; c.height = atlas.height; return c; };
const tintCache = {};
function tint(hex) {
  if (tintCache[hex]) return tintCache[hex];
  const c = op(), g = c.getContext('2d');
  g.drawImage(atlas, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = hex; g.fillRect(0, 0, c.width, c.height);
  return (tintCache[hex] = c);
}
function recolor(map) {
  const c = op(), g = c.getContext('2d');
  g.drawImage(atlas, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, lut = {};
  for (const k in map) lut[parseInt(k.slice(1), 16)] = parseInt(map[k].slice(1), 16);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const t = lut[(d[i] << 16) | (d[i + 1] << 8) | d[i + 2]];
    if (t != null) { d[i] = t >> 16; d[i + 1] = (t >> 8) & 255; d[i + 2] = t & 255; }
  }
  g.putImageData(im, 0, 0); return c;
}

// ---- draw primitives ----
const blit = (src, r, dx, dy, s) => ctx.drawImage(src, r.x, r.y, r.w, r.h, dx, dy, r.w * s, r.h * s);
function text(str, x, y, hex, s = 3, track = 1) {
  const src = tint(hex);
  for (const ch of str.toUpperCase()) {
    if (ch !== ' ') { const g = GLYPHS[ch === '-' ? 'dash' : ch]; if (g) blit(src, g, x, y, s); }
    x += (GLYPH_W + track) * s;
  }
  return x;
}
ctx.textBaseline = 'top';
const head = (t, y) => { ctx.fillStyle = '#7fd77f'; ctx.font = 'bold 12px monospace'; ctx.fillText(t, 12, y); };
const lbl = (t, x, y) => { ctx.fillStyle = '#8a8a98'; ctx.font = '9px monospace'; ctx.fillText(t, x, y); };

// ---- layout ----
ctx.fillStyle = '#0e0e16'; ctx.fillRect(0, 0, cv.width, cv.height);
ctx.fillStyle = '#7fd77f'; ctx.font = 'bold 14px monospace';
ctx.fillText('FROGGER — arcade sprite atlas', 12, 8);
lbl(`${atlas.width}x${atlas.height} atlas · ${Object.keys(SPRITES).length} sprites · `
    + `${Object.keys(GLYPHS).length} glyphs · ${PALETTE.length} colours · black = transparent`, 12, 28);

// sprites grid
let y = 48; head('SPRITES', y); y += 16;
let x = 12; const GS = 2, CH = 24 * GS;
for (const name of Object.keys(SPRITES)) {
  const r = SPRITES[name], w = r.w * GS, cw = Math.max(w, 42);
  if (x + cw > cv.width - 12) { x = 12; y += CH + 16; }
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, cw, CH);
  blit(atlas, r, x + ((cw - w) >> 1), y + ((CH - r.h * GS) >> 1), GS);
  lbl(name, x, y + CH + 1);
  x += cw + 8;
}
y += CH + 26;

// font — tinted lines
head('FONT — one white set, tinted per line (monospace, x += GLYPH_W)', y); y += 16;
ctx.fillStyle = '#000'; ctx.fillRect(12, y, cv.width - 24, 128);
let ty = y + 8;
text('1-UP', 20, ty, '#E0E000'); text('HI-SCORE', 160, ty, '#C3C3D9'); ty += 24;
text('TIME 60', 20, ty, '#E00000'); text('GAME OVER', 200, ty, '#E0E000'); ty += 24;
text('0123456789', 20, ty, '#1DC300'); ty += 24;
text('ABCDEFGHIJKLM', 20, ty, '#00C3D9'); ty += 24;
text('NOPQRSTUVWXYZ-', 20, ty, '#E03ED9');
y += 128 + 26;

// frog recolour
head('FROG — green base; red / cyan via FROG_RECOLOR palette remap', y); y += 16;
for (const [nm, src] of [['green', atlas], ['red', recolor(FROG_RECOLOR.red)], ['cyan', recolor(FROG_RECOLOR.cyan)]]) {
  const rowH = 16 * 3 + 8;
  ctx.fillStyle = '#000'; ctx.fillRect(12, y, 8 * (16 * 3 + 6) + 48, rowH);
  lbl(nm, 16, y + rowH / 2 - 4);
  let fx = 56;
  for (let i = 0; i < 8; i++) { const r = SPRITES['frog_' + i]; if (r) blit(src, r, fx, y + 4, 3); fx += 16 * 3 + 6; }
  y += rowH + 6;
}
y += 12;

// palette
head('PALETTE (arcade TIA colours; grey gutter tones dropped)', y); y += 16;
let pxx = 12;
for (const c of PALETTE) {
  ctx.fillStyle = c; ctx.fillRect(pxx, y, 26, 26);
  ctx.strokeStyle = '#333'; ctx.strokeRect(pxx + 0.5, y + 0.5, 25, 25);
  pxx += 30;
}
