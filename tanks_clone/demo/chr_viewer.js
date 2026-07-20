// chr_viewer.js -- browse all 512 CHR tiles with the ROM's own palettes.
//
// The first look at what the port actually has to draw with. Two 256-tile
// pattern tables, each rendered through a real palette from the ROM
// (tbl_D555 sprites / tbl_D565 background), not invented colours.

import { CHR, CHR_SPRITE_BASE, CHR_BG_BASE, SPRITE_PALETTES, BG_PALETTE_SETS }
  from '../assets/dat_chr.js';
import { decodeTiles, paintTile, imageDataToCanvas } from '../tiles.js';
import { nesHex } from '../palette.js';

const SHEET = 128;   // 16 tiles x 8px -- both modes land on 128x128
const MARGIN = 22;   // room for the row/col labels

const tiles = decodeTiles(CHR);

const ui = {
  zoom: document.getElementById('zoom'),
  grid: document.getElementById('grid'),
  ids: document.getElementById('ids'),
  spritePals: document.getElementById('spritePals'),
  bgPals: document.getElementById('bgPals'),
  bgSet: document.getElementById('bgSet'),
};

const state = {
  zoom: 3,
  grid: true,
  ids: true,
  spritePal: 0,
  bgSet: 0,
  bgPal: 0,
  // Every sprite in this ROM is 8x16 ($2000 bit 5), so 8x16 is the honest
  // default -- the 8x8 view is raw tile order and reads as garbage.
  mode: '8x16',
};

// Who each sprite palette is FOR. Decoded from sub_DFB6's dispatch, not guessed:
//   $DFB6  CPX #$02 / BCC -> slots 0,1 are players, 2..7 enemies
//   $DFE8  TXA / STA spr_A_palette -- a player's SLOT INDEX *is* its palette
//   $DFBA  tank_type & $04 (bonus tank) -> frm_cnt_lo>>3 &1 + 2 -> flashes 2<->3
//   $DFCD  normal enemy -> tbl_E003[((frm_cnt_lo*4) + tank_type) & 7] -> {2,0,0,1,2,1,2,2}
// Palette 3 is also the sprite-text palette ($C947 GAME OVER, $C8FD PAUSE).
const SPRITE_PAL_ROLE = [
  'P1 tank ($DFE8 TXA, slot 0)',
  'P2 tank ($DFE8 TXA, slot 1)',
  'enemy tanks (tbl_E003)',
  'bonus-tank flash + sprite text ($C947/$C8FD)',
];

// --- sheet building --------------------------------------------------------

/** Lay 256 tiles into a 128x128 ImageData. 8x8 = 16x16 grid; 8x16 = 16x8 pairs. */
function buildSheet(base, palette, transparent, mode) {
  const img = new ImageData(SHEET, SHEET);
  if (mode === '8x16') {
    // 8x16 sprite mode pairs tiles (even, even+1) vertically -- 128 pairs.
    for (let p = 0; p < 128; p++) {
      const col = p % 16, row = (p / 16) | 0;
      paintTile(img, tiles[base + p * 2], palette, col * 8, row * 16, transparent);
      paintTile(img, tiles[base + p * 2 + 1], palette, col * 8, row * 16 + 8, transparent);
    }
  } else {
    for (let i = 0; i < 256; i++) {
      const col = i % 16, row = (i / 16) | 0;
      paintTile(img, tiles[base + i], palette, col * 8, row * 8, transparent);
    }
  }
  return img;
}

/** Checkerboard so sprite transparency reads as transparent, not black. */
function checker(ctx, x, y, w, h) {
  const S = 8;
  for (let r = 0; r * S < h; r++) {
    for (let c = 0; c * S < w; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#1b1b24' : '#232330';
      ctx.fillRect(x + c * S, y + r * S, Math.min(S, w - c * S), Math.min(S, h - r * S));
    }
  }
}

function drawPanel(cv, base, palette, transparent, mode) {
  const z = state.zoom;
  const size = SHEET * z;
  cv.width = MARGIN + size;
  cv.height = MARGIN + size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#0e0e14';
  ctx.fillRect(0, 0, cv.width, cv.height);

  if (transparent) checker(ctx, MARGIN, MARGIN, size, size);
  else { ctx.fillStyle = nesHex(palette[0]); ctx.fillRect(MARGIN, MARGIN, size, size); }

  const sheet = imageDataToCanvas(buildSheet(base, palette, transparent, mode));
  ctx.drawImage(sheet, 0, 0, SHEET, SHEET, MARGIN, MARGIN, size, size);

  const cellH = (mode === '8x16' ? 16 : 8) * z;
  const cellW = 8 * z;

  if (state.grid) {
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 1;
    for (let c = 0; c <= 16; c++) {
      const x = MARGIN + c * cellW + 0.5;
      ctx.beginPath(); ctx.moveTo(x, MARGIN); ctx.lineTo(x, MARGIN + size); ctx.stroke();
    }
    for (let r = 0; r * cellH <= size; r++) {
      const y = MARGIN + r * cellH + 0.5;
      ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(MARGIN + size, y); ctx.stroke();
    }
  }

  if (state.ids) {
    ctx.fillStyle = '#6a6a7a';
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 0; c < 16; c++) {
      ctx.fillText(c.toString(16).toUpperCase(), MARGIN + c * cellW + cellW / 2, MARGIN / 2);
    }
    ctx.textAlign = 'right';
    const rows = Math.round(size / cellH);
    for (let r = 0; r < rows; r++) {
      // 8x8: row label = the tile's high nibble. 8x16: two tiles per cell, so
      // label the row's FIRST tile id instead.
      const label = mode === '8x16'
        ? (r * 32).toString(16).toUpperCase().padStart(2, '0')
        : r.toString(16).toUpperCase();
      ctx.fillText(label, MARGIN - 5, MARGIN + r * cellH + cellH / 2);
    }
  }
}

// --- hover readout ---------------------------------------------------------

function hookHover(cv, out, base, label) {
  const clear = () => { out.innerHTML = '&nbsp;'; };
  cv.addEventListener('mouseleave', clear);
  cv.addEventListener('mousemove', (e) => {
    const rect = cv.getBoundingClientRect();
    const z = state.zoom;
    const x = (e.clientX - rect.left) * (cv.width / rect.width) - MARGIN;
    const y = (e.clientY - rect.top) * (cv.height / rect.height) - MARGIN;
    const size = SHEET * z;
    if (x < 0 || y < 0 || x >= size || y >= size) return clear();

    const col = Math.floor(x / (8 * z));
    const mode = base === CHR_SPRITE_BASE ? state.mode : '8x8';
    if (mode === '8x16') {
      const row = Math.floor(y / (16 * z));
      const p = row * 16 + col;
      const top = p * 2;
      out.innerHTML = `${label} pair <b>$${hex2(top)}/$${hex2(top + 1)}</b> `
        + `· col ${col.toString(16).toUpperCase()} row ${row} · CHR $${hex4(base * 16 + top * 16)}`;
    } else {
      const row = Math.floor(y / (8 * z));
      const t = row * 16 + col;
      out.innerHTML = `${label} tile <b>$${hex2(t)}</b> `
        + `· col ${col.toString(16).toUpperCase()} row ${row.toString(16).toUpperCase()} `
        + `· CHR $${hex4(base * 16 + t * 16)}`;
    }
  });
}

const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, '0');

// --- palette pickers -------------------------------------------------------

/** A choice button that shows the palette's four real colours. */
function palButton(idx, colors, pressed, onPick, role) {
  const b = document.createElement('button');
  b.className = 'pal';
  b.setAttribute('aria-pressed', String(pressed));
  b.title = colors.map((c) => '$' + hex2(c)).join(' ') + (role ? ` -- ${role}` : '');
  const n = document.createElement('b');
  n.textContent = idx;
  b.appendChild(n);
  for (const c of colors) {
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = nesHex(c);
    b.appendChild(sw);
  }
  b.onclick = () => onPick(idx);
  return b;
}

function buildSpritePals() {
  ui.spritePals.innerHTML = '';
  const lbl = document.createElement('label');
  lbl.textContent = 'palette';
  ui.spritePals.appendChild(lbl);
  SPRITE_PALETTES.forEach((colors, i) => {
    ui.spritePals.appendChild(palButton(i, colors, i === state.spritePal, (n) => {
      state.spritePal = n; buildSpritePals(); renderSprites();
    }, SPRITE_PAL_ROLE[i]));
  });
  const role = document.createElement('span');
  role.className = 'meta';
  role.style.cssText = 'color:#8a8a9a;font-size:11.5px;flex-basis:100%';
  role.textContent = `↳ ${SPRITE_PAL_ROLE[state.spritePal]}`;
  ui.spritePals.appendChild(role);
}

function buildBgPals() {
  ui.bgPals.innerHTML = '';
  const lbl = document.createElement('label');
  lbl.textContent = 'palette';
  ui.bgPals.appendChild(lbl);
  BG_PALETTE_SETS[state.bgSet].forEach((colors, i) => {
    ui.bgPals.appendChild(palButton(i, colors, i === state.bgPal, (n) => {
      state.bgPal = n; buildBgPals(); renderBg();
    }));
  });
}

// --- render ----------------------------------------------------------------

const spriteCv = document.getElementById('spriteCv');
const bgCv = document.getElementById('bgCv');

function renderSprites() {
  drawPanel(spriteCv, CHR_SPRITE_BASE, SPRITE_PALETTES[state.spritePal], true, state.mode);
}
function renderBg() {
  drawPanel(bgCv, CHR_BG_BASE, BG_PALETTE_SETS[state.bgSet][state.bgPal], false, '8x8');
}
function renderAll() { renderSprites(); renderBg(); }

function main() {
  for (let s = 0; s < BG_PALETTE_SETS.length; s++) {
    const o = document.createElement('option');
    o.value = String(s);
    o.textContent = `con_bg_pal_${String(s).padStart(2, '0')}`;
    ui.bgSet.appendChild(o);
  }
  ui.bgSet.onchange = () => {
    state.bgSet = parseInt(ui.bgSet.value, 10);
    buildBgPals(); renderBg();
  };

  ui.zoom.onchange = () => { state.zoom = parseInt(ui.zoom.value, 10); renderAll(); };

  const toggle = (el, key) => {
    el.onclick = () => {
      state[key] = !state[key];
      el.setAttribute('aria-pressed', String(state[key]));
      renderAll();
    };
  };
  toggle(ui.grid, 'grid');
  toggle(ui.ids, 'ids');

  document.querySelectorAll('.mode').forEach((b) => {
    b.onclick = () => {
      state.mode = b.dataset.mode;
      document.querySelectorAll('.mode').forEach((o) =>
        o.setAttribute('aria-pressed', String(o.dataset.mode === state.mode)));
      renderSprites();
    };
  });

  hookHover(spriteCv, document.getElementById('spriteOut'), CHR_SPRITE_BASE, 'sprite');
  hookHover(bgCv, document.getElementById('bgOut'), CHR_BG_BASE, 'bg');

  buildSpritePals();
  buildBgPals();
  renderAll();

  console.log(`[chr_viewer] ${tiles.length} tiles decoded `
    + `(sprites ${CHR_SPRITE_BASE}..${CHR_SPRITE_BASE + 255}, bg ${CHR_BG_BASE}..${CHR_BG_BASE + 255}); `
    + `${SPRITE_PALETTES.length} sprite palettes, ${BG_PALETTE_SETS.length} bg sets`);
}

main();
