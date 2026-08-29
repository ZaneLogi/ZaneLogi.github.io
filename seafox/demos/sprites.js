// seafox/demos/sprites.js
//
// Demo-only glue: bakes every sprite block at load and lays the two
// representations of design_spec § 6.1 side by side, plus a panel of checks
// that measure the bake rather than inviting anyone to eyeball it.
//
// Nothing here is game logic. The bake is src/assets/bake.js; this file just
// paints what it returns.

import { SPRITE_BLOCKS } from '../assets/sprite_blocks.js';
import { bake, boxWidth } from '../src/assets/bake.js';
import { COLOR, PALETTE_HEX, PALETTE_NAMES } from '../src/presentation/palette.js';

/** Colour the ink mask is drawn in. Deliberately not white: ink is a mask, not art. */
const INK_RGBA = 0xFFFFB48A | 0;   // little-endian ABGR: #8AB4FF opaque

const state = { scale: 4, mode: 'both', onlyUnverified: false, filter: '' };

/** @type {Uint32Array|null} Lazily built palette lookup; declared here so the
 *  grid build, which runs before the module body finishes, can reach it. */
let rgbaCache = null;

/** @type {{name: string, sprite: object, cells: HTMLElement}[]} */
const entries = [];

/**
 * Sections, in the order they are shown. First matching rule wins.
 * @type {{title: string, match: (name: string) => boolean}[]}
 */
const SECTIONS = [
  { title: 'Merchant roster — ten records, seven hulls, four hues (§ 12.5)',
    match: (n) => /^merchant\d/.test(n) },
  { title: 'Death frames — shared by every type (§ 7.4.1)',
    match: (n) => /^(sinkingShip|burst|tallColumn)/.test(n) },
  { title: 'Floating scores (§ 7.3.2)',
    match: (n) => /^score/.test(n) },
  { title: 'Effects (§ 15.4)',
    match: (n) => /^effect/.test(n) },
  { title: 'Text strips — artwork, not rendered text (§ 6.6.1)',
    match: (n) => /^strip/.test(n) },
  { title: 'Entities (§ 6.6.1)',
    match: () => true },
];

main();

function main() {
  /** @type {Object<string, object>} */
  let baked;
  try {
    baked = {};
    for (const name of Object.keys(SPRITE_BLOCKS)) baked[name] = bake(SPRITE_BLOCKS[name]);
  } catch (e) {
    document.getElementById('error').textContent = 'Bake failed: ' + e.message;
    return;
  }

  renderChecks(baked);
  buildGrid(baked);
  wireControls();
  applyState();
}

// ---------------------------------------------------------------------------
// Checks -- every claim design_spec § 6.1 and § 6.3 make about the output
// ---------------------------------------------------------------------------

/**
 * Run the invariants over every baked sprite.
 * @param {Object<string, object>} baked
 * @returns {{label: string, ok: boolean, detail: string}[]}
 */
function runChecks(baked) {
  const names = Object.keys(baked);
  const bad = { inkHasColour: [], colourWidth: [], tightBox: [], outsideInk: [], runsWhite: [] };
  let gapFills = 0, differ = 0, colourBytes = 0, inkBytes = 0;

  for (const name of names) {
    const s = baked[name];
    inkBytes += s.ink.length;
    colourBytes += s.color.length;
    if (s.colorWidth !== s.w) bad.colourWidth.push(name);

    // The bounding box is tight: each edge row and column carries ink.
    let top = false, bottom = false, left = false, right = false;
    for (let x = 0; x < s.w; x++) {
      if (s.ink[x]) top = true;
      if (s.ink[(s.h - 1) * s.w + x]) bottom = true;
    }
    for (let y = 0; y < s.h; y++) {
      if (s.ink[y * s.w]) left = true;
      if (s.ink[y * s.w + s.w - 1]) right = true;
    }
    if (!(top && bottom && left && right)) bad.tightBox.push(name);

    let anyDiffer = false;
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const isInk = s.ink[y * s.w + x] === 1;
        const c = s.color[y * s.colorWidth + x];
        // § 6.1: every ink pixel has a non-zero colour.
        if (isInk && c === COLOR.BACKGROUND) bad.inkHasColour.push(name + '@' + x + ',' + y);
        // § 6.1: the converse does NOT hold, and that is why ink is stored.
        if (!isInk && c !== COLOR.BACKGROUND) { anyDiffer = true; gapFills++; }
        // § 6.3: a lit pixel with a lit neighbour is white.
        const hasNeighbour = (x > 0 && s.ink[y * s.w + x - 1]) ||
                             (x + 1 < s.w && s.ink[y * s.w + x + 1]);
        if (isInk && hasNeighbour && c !== COLOR.WHITE) {
          bad.runsWhite.push(name + '@' + x + ',' + y);
        }
      }
      // § 6.3.1: colour occupies exactly the row's ink span -- no column of it
      // lies left of the first lit pixel or right of the last. Measured per row
      // rather than per sprite, because a sprite whose widest row is flush would
      // hide an overhang on a narrower one.
      let inkL = -1, inkR = -1, colL = -1, colR = -1;
      for (let x = 0; x < s.w; x++) {
        if (s.ink[y * s.w + x]) { if (inkL < 0) inkL = x; inkR = x; }
        if (s.color[y * s.colorWidth + x] !== COLOR.BACKGROUND) {
          if (colL < 0) colL = x;
          colR = x;
        }
      }
      if (inkL !== colL || inkR !== colR) bad.outsideInk.push(name + '@row' + y);
    }
    if (anyDiffer) differ++;
  }

  const first = (a) => a.length ? a.slice(0, 3).join(', ') + (a.length > 3 ? ' …' : '') : '';
  return [
    { label: 'every ink pixel has a non-zero colour (§ 6.1)',
      ok: !bad.inkHasColour.length, detail: first(bad.inkHasColour) },
    { label: 'a run of two or more adjacent pixels is white (§ 6.3)',
      ok: !bad.runsWhite.length, detail: first(bad.runsWhite) },
    { label: 'colour shares the ink bounding box — colorWidth === w (§ 6.3.1)',
      ok: !bad.colourWidth.length, detail: first(bad.colourWidth) },
    { label: 'on every row, colour spans exactly the ink — neither edge bleeds (§ 6.3.1)',
      ok: !bad.outsideInk.length, detail: first(bad.outsideInk) },
    { label: 'every ink bounding box is tight on all four edges (§ 6.3)',
      ok: !bad.tightBox.length, detail: first(bad.tightBox) },
    { label: 'ink is NOT recoverable from colour (§ 6.1)',
      ok: differ > 0,
      detail: differ + ' of ' + names.length + ' sprites have colour where ink is 0, ' +
              gapFills + ' pixels in all — chroma cells filling the gap between ' +
              'isolated pixels (§ 6.3.1)' },
    { label: 'baked size vs source',
      ok: true,
      detail: (inkBytes + colourBytes) + ' bytes baked from ' +
              sourceBytes() + ' stored — ' +
              ((inkBytes + colourBytes) / sourceBytes()).toFixed(1) + '× , which is why the bake runs at load' },
  ];
}

/** @returns {number} total bytes of source bitmap across every block. */
function sourceBytes() {
  let n = 0;
  for (const k of Object.keys(SPRITE_BLOCKS)) {
    n += SPRITE_BLOCKS[k].byteWidth * SPRITE_BLOCKS[k].rows;
  }
  return n;
}

/**
 * @param {Object<string, object>} baked
 * @returns {void}
 */
function renderChecks(baked) {
  const results = runChecks(baked);
  const el = document.getElementById('checks');
  el.innerHTML = results.map((r) => {
    const mark = r.ok ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>';
    const tail = r.detail ? '  <span class="note">' + r.detail + '</span>' : '';
    return mark + '  ' + r.label + tail;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

/**
 * @param {Object<string, object>} baked
 * @returns {void}
 */
function buildGrid(baked) {
  const host = document.getElementById('sections');
  const names = Object.keys(baked);
  const taken = new Set();

  for (const section of SECTIONS) {
    const members = names.filter((n) => !taken.has(n) && section.match(n));
    if (!members.length) continue;
    members.forEach((n) => taken.add(n));

    const h2 = document.createElement('h2');
    h2.textContent = section.title + '  (' + members.length + ')';
    const grid = document.createElement('div');
    grid.className = 'grid';
    host.appendChild(h2);
    host.appendChild(grid);

    for (const name of members) grid.appendChild(makeCell(name, baked[name]));
  }
}

/**
 * @param {string} name
 * @param {object} sprite
 * @returns {HTMLElement}
 */
function makeCell(name, sprite) {
  const fig = document.createElement('figure');
  if (!sprite.verified || sprite.phaseLive) fig.classList.add('unverified');

  const pair = document.createElement('div');
  pair.className = 'pair';
  const inkBox = boxed(paint(sprite, 'ink'));
  const colorBox = boxed(paint(sprite, 'color'));
  pair.appendChild(inkBox);
  pair.appendChild(colorBox);

  const cap = document.createElement('figcaption');
  const gaps = gapFillCount(sprite);
  const gapTag = gaps ? ' <span class="gapfill">+' + gaps + ' gap</span>' : '';
  const hue = dominantHue(sprite);
  cap.innerHTML =
    '<span class="name">' + name + '</span>' +
    '<span class="meta">' + sprite.w + '×' + sprite.h + gapTag +
      ' · bw ' + sprite.byteWidth + ' · box ' + boxWidth(sprite) + '</span>' +
    '<span class="meta">phase ' + sprite.phase + ' · flip ' + sprite.flip +
      ' · ' + hue + '</span>' +
    (sprite.x !== undefined
      ? '<span class="meta">at ' + sprite.x + ',' + sprite.y + '</span>' : '') +
    (sprite.phaseLive ? '<span class="badge">parity live — draw picks</span>' : '') +
    (sprite.verified ? '' : '<span class="badge">phase/flip unverified</span>');

  fig.appendChild(pair);
  fig.appendChild(cap);
  entries.push({ name, sprite, fig, inkBox, colorBox });
  return fig;
}

/**
 * How many pixels carry colour but no ink -- the chroma cells of § 6.3.1
 * reaching into the gap right of an isolated pixel. This is the whole of the
 * difference between the two bitmaps now that they share a bounding box, so it
 * is what the caption reports.
 * @param {object} sprite
 * @returns {number}
 */
function gapFillCount(sprite) {
  let n = 0;
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      if (!sprite.ink[y * sprite.w + x] &&
          sprite.color[y * sprite.colorWidth + x] !== COLOR.BACKGROUND) n++;
    }
  }
  return n;
}

/**
 * Which hue the sprite actually shows, for the caption.
 * @param {object} sprite
 * @returns {string}
 */
function dominantHue(sprite) {
  const counts = new Map();
  for (const c of sprite.color) {
    if (c === COLOR.BACKGROUND) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const hues = [...counts.keys()].filter((c) => c !== COLOR.WHITE);
  if (!hues.length) return 'white only';
  hues.sort((a, b) => counts.get(b) - counts.get(a));
  return hues.map((c) => PALETTE_NAMES[c]).join('+');
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLElement} the canvas wrapped in its checkerboard box
 */
function boxed(canvas) {
  const box = document.createElement('div');
  box.className = 'box';
  box.appendChild(canvas);
  return box;
}

/**
 * Paint one representation at 1:1 into an offscreen canvas.
 * @param {object} sprite
 * @param {'ink'|'color'} which
 * @returns {HTMLCanvasElement} a canvas carrying a `_src` 1:1 buffer
 */
function paint(sprite, which) {
  const w = which === 'ink' ? sprite.w : sprite.colorWidth;
  const h = sprite.h;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const img = src.getContext('2d').createImageData(w, h);
  const words = new Uint32Array(img.data.buffer);

  if (which === 'ink') {
    for (let i = 0; i < w * h; i++) words[i] = sprite.ink[i] ? INK_RGBA : 0;
  } else {
    const rgba = rgbaTable();
    for (let i = 0; i < w * h; i++) words[i] = rgba[sprite.color[i]];
  }
  src.getContext('2d').putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out._src = src;
  return out;
}

/** @returns {Uint32Array} palette as little-endian RGBA words, index 0 transparent. */
function rgbaTable() {
  if (rgbaCache) return rgbaCache;
  rgbaCache = new Uint32Array(PALETTE_HEX.length);
  for (let i = 0; i < PALETTE_HEX.length; i++) {
    const v = parseInt(PALETTE_HEX[i].slice(1), 16);
    const a = i === COLOR.BACKGROUND ? 0 : 255;
    rgbaCache[i] = (a << 24) | ((v & 0xFF) << 16) | (((v >> 8) & 0xFF) << 8) | ((v >> 16) & 0xFF);
  }
  return rgbaCache;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function wireControls() {
  document.getElementById('mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.mode = b.dataset.mode;
    for (const btn of e.currentTarget.querySelectorAll('button')) {
      btn.classList.toggle('on', btn === b);
    }
    applyState();
  });
  const scale = document.getElementById('scale');
  scale.addEventListener('input', () => {
    state.scale = +scale.value;
    document.getElementById('scaleVal').textContent = state.scale + '×';
    applyState();
  });
  document.getElementById('onlyUnverified').addEventListener('change', (e) => {
    state.onlyUnverified = e.target.checked;
    applyState();
  });
  document.getElementById('filter').addEventListener('input', (e) => {
    state.filter = e.target.value.trim().toLowerCase();
    applyState();
  });
}

/** Re-scale and re-filter every cell. @returns {void} */
function applyState() {
  const s = state.scale;
  for (const e of entries) {
    const shown = (!state.onlyUnverified || !e.sprite.verified) &&
                  (!state.filter || e.name.toLowerCase().includes(state.filter));
    e.fig.style.display = shown ? '' : 'none';
    e.inkBox.style.display = state.mode === 'color' ? 'none' : '';
    e.colorBox.style.display = state.mode === 'ink' ? 'none' : '';
    drawScaled(e.inkBox.firstChild, s);
    drawScaled(e.colorBox.firstChild, s);
  }
}

/**
 * Blit a cell's 1:1 buffer up to the current zoom, nearest-neighbour.
 * @param {HTMLCanvasElement} canvas
 * @param {number} scale
 * @returns {void}
 */
function drawScaled(canvas, scale) {
  const src = canvas._src;
  canvas.width = src.width * scale;
  canvas.height = src.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
}
