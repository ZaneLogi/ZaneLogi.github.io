// chr_viewer.js -- browse all 512 CHR tiles with the ROM's own palettes.

import { PLAYER_COLORS, AREA_PALETTES, FRAMES } from '../assets/dat_tiles.js';
import { paintTile, imageDataToCanvas } from '../chr_decoder.js';
import { tiles } from '../chr_tiles.js';
import { nesHex } from '../palette.js';

const SHEET = 128;        // 16 tiles x 8px
const MARGIN = 22;        // room for the row/col labels
const SPRITE_BASE = 0;    // PPU $0000
const BG_BASE = 256;      // PPU $1000

// PlayerColors' rows in table order. The asm comments name them; entry 0 of a
// sprite palette is never drawn, so it is shown but not used.
const SPRITE_PAL_ROLE = ['mario', 'luigi', 'fiery (both sizes)'];

// Only the whole-set tables can colour a sheet: the short ones patch a slice of
// palette RAM ($04 bytes) and have no other three palettes to show.
const BG_SETS = AREA_PALETTES.filter((p) => p.len === 0x20);

const ui = {
  zoom: document.getElementById('zoom'),
  grid: document.getElementById('grid'),
  ids: document.getElementById('ids'),
  spritePals: document.getElementById('spritePals'),
  bgPals: document.getElementById('bgPals'),
  bgSet: document.getElementById('bgSet'),
};

const state = { zoom: 3, grid: true, ids: true, spritePal: 0, bgSet: 1, bgPal: 0 };

/** Lay 256 tiles into a 128x128 ImageData, 16 across. */
function buildSheet(base, palette, transparent) {
  const img = new ImageData(SHEET, SHEET);
  for (let i = 0; i < 256; i++) {
    paintTile(img, tiles[base + i], palette, (i % 16) * 8, ((i / 16) | 0) * 8, transparent);
  }
  return img;
}

function draw(cv, base, palette, transparent) {
  const z = state.zoom;
  cv.width = MARGIN + SHEET * z;
  cv.height = MARGIN + SHEET * z;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#14141c';
  g.fillRect(0, 0, cv.width, cv.height);

  // index 0 for sprites is transparent -- show the sheet backdrop through it
  if (transparent) {
    g.fillStyle = '#1b1b26';
    g.fillRect(MARGIN, MARGIN, SHEET * z, SHEET * z);
  }
  g.drawImage(imageDataToCanvas(buildSheet(base, palette, transparent)),
    MARGIN, MARGIN, SHEET * z, SHEET * z);

  if (state.grid) {
    g.strokeStyle = '#ffffff18';
    g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const p = MARGIN + i * 8 * z + 0.5;
      g.beginPath(); g.moveTo(p, MARGIN); g.lineTo(p, MARGIN + SHEET * z); g.stroke();
      g.beginPath(); g.moveTo(MARGIN, p); g.lineTo(MARGIN + SHEET * z, p); g.stroke();
    }
  }
  if (state.ids) {
    g.fillStyle = '#6a6a7a';
    g.font = '10px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) {
      const c = MARGIN + i * 8 * z + 4 * z;
      g.fillText(i.toString(16).toUpperCase(), c, MARGIN / 2);      // low nibble
      g.fillText(`${i.toString(16).toUpperCase()}0`, MARGIN / 2, c); // high nibble
    }
  }
}

/** Which FRAMES rows use a given sprite tile -- the readout's "what is this for". */
function framesUsing(tileId) {
  return FRAMES.filter((f) => f.tiles.includes(tileId)).map((f) => `${f.size} ${f.name}`);
}

function hookHover(cv, out, base, isSprite) {
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left - MARGIN;
    const y = e.clientY - r.top - MARGIN;
    const z = state.zoom;
    if (x < 0 || y < 0 || x >= SHEET * z || y >= SHEET * z) { out.innerHTML = '&nbsp;'; return; }
    const col = ((x / z) / 8) | 0;
    const row = ((y / z) / 8) | 0;
    const id = row * 16 + col;
    const hex = `$${id.toString(16).padStart(2, '0')}`;
    const chrAddr = (base === BG_BASE ? 0x1000 : 0) + id * 16;
    const blank = tiles[base + id].every((p) => p === 0);
    let extra = blank ? ' — <b>blank</b>' : '';
    if (isSprite && !blank) {
      const uses = framesUsing(id);
      if (uses.length) extra = ` — ${uses.slice(0, 2).join(', ')}${uses.length > 2 ? ` +${uses.length - 2}` : ''}`;
    }
    out.innerHTML = `tile <b>${hex}</b> · PPU $${chrAddr.toString(16).padStart(4, '0')} · file 0x${(0x8010 + (base === BG_BASE ? 0x1000 : 0) + id * 16).toString(16)}${extra}`;
  });
  cv.addEventListener('mouseleave', () => { out.innerHTML = '&nbsp;'; });
}

/** A palette button IS its four colours. */
function palButton(entries, i, label, active, onPick) {
  const b = document.createElement('button');
  b.className = 'pal';
  b.setAttribute('aria-pressed', String(active));
  b.title = entries.map((v) => `$${v.toString(16).padStart(2, '0')}`).join(' ');
  const tag = document.createElement('b');
  tag.textContent = label;
  b.appendChild(tag);
  entries.forEach((v) => {
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = nesHex(v);
    b.appendChild(sw);
  });
  b.addEventListener('click', () => onPick(i));
  return b;
}

function renderSpritePals() {
  ui.spritePals.replaceChildren(...PLAYER_COLORS.map((pal, i) =>
    palButton(pal, i, SPRITE_PAL_ROLE[i] ?? String(i), state.spritePal === i, (n) => {
      state.spritePal = n; render();
    })));
}

function renderBgPals() {
  const set = BG_SETS[state.bgSet];
  // entries 0..3 are the background palettes ($3F00-$3F0F); 4..7 are sprites.
  ui.bgPals.replaceChildren(...set.entries.slice(0, 4).map((pal, i) =>
    palButton(pal, i, String(i), state.bgPal === i, (n) => { state.bgPal = n; render(); })));
}

function render() {
  renderSpritePals();
  renderBgPals();
  draw(document.getElementById('spriteCv'), SPRITE_BASE, PLAYER_COLORS[state.spritePal], true);
  draw(document.getElementById('bgCv'), BG_BASE, BG_SETS[state.bgSet].entries[state.bgPal], false);
}

ui.bgSet.replaceChildren(...BG_SETS.map((s, i) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = s.name;
  o.selected = i === state.bgSet;
  return o;
}));

ui.zoom.addEventListener('change', () => { state.zoom = +ui.zoom.value; render(); });
ui.bgSet.addEventListener('change', () => { state.bgSet = +ui.bgSet.value; state.bgPal = 0; render(); });
for (const [key, el] of [['grid', ui.grid], ['ids', ui.ids]]) {
  el.addEventListener('click', () => {
    state[key] = !state[key];
    el.setAttribute('aria-pressed', String(state[key]));
    render();
  });
}

hookHover(document.getElementById('spriteCv'), document.getElementById('spriteOut'), SPRITE_BASE, true);
hookHover(document.getElementById('bgCv'), document.getElementById('bgOut'), BG_BASE, false);
render();
