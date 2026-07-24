// lemmings/demos/sprite_gallery.js
//
// Demo-only glue: builds a grid of every lemming animation and cycles each at
// the game's frame rate, using the reusable src/ modules. Nothing here is
// game logic — it just drives the shared renderer for presentation.

import { SpriteSheet } from '../src/sprite_sheet.js';
import { advanceFrame } from '../src/animation.js';

// Uniform cell in sprite pixels; every sprite's foot anchor is placed on the
// same baseline so the animations line up as if standing on one floor.
const CELL_W = 40, CELL_H = 40, FOOT_X = 20, FOOT_Y = 32;

const state = { scale: 4, msPerFrame: 58, playing: true, showAnchor: false };
const cells = [];

const grid = document.getElementById('grid');
const errEl = document.getElementById('error');

init();

async function init() {
  let sheet;
  try {
    sheet = await SpriteSheet.load();
  } catch (e) {
    errEl.textContent = 'Failed to load sprites: ' + e.message;
    return;
  }
  for (const name of sheet.names()) {
    const anim = sheet.get(name);
    const fig = document.createElement('figure');
    const box = document.createElement('div');
    box.className = 'box';
    const cv = document.createElement('canvas');
    box.appendChild(cv);
    const cap = document.createElement('figcaption');
    cap.innerHTML =
      `<span class="name">${name}</span>` +
      `<span class="meta">${anim.frames}f · ${anim.w}×${anim.h} · ${anim.loop ? 'loop' : 'once*'}</span>`;
    fig.appendChild(box);
    fig.appendChild(cap);
    grid.appendChild(fig);
    cells.push({ sheet, name, anim, frame: 0, cv, ctx: cv.getContext('2d') });
  }
  wireControls();
  applyScale();
  requestAnimationFrame(loop); // unkillable display loop; paints one frame immediately via render()
}

function applyScale() {
  const s = state.scale;
  document.documentElement.style.setProperty('--cell', (CELL_W * s + 22) + 'px');
  for (const c of cells) {
    c.cv.width = CELL_W * s;
    c.cv.height = CELL_H * s;
  }
  render();
}

function wireControls() {
  document.getElementById('speed').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.msPerFrame = +b.dataset.ms;
    for (const btn of e.currentTarget.querySelectorAll('button')) {
      btn.classList.toggle('on', btn === b);
    }
  });
  const pp = document.getElementById('playPause');
  pp.addEventListener('click', () => {
    state.playing = !state.playing;
    pp.classList.toggle('on', state.playing);
    pp.textContent = state.playing ? '⏸ Pause' : '▶ Play';
  });
  const scale = document.getElementById('scale');
  const scaleVal = document.getElementById('scaleVal');
  scale.addEventListener('input', () => {
    state.scale = +scale.value;
    scaleVal.textContent = state.scale + '×';
    applyScale();
  });
  document.getElementById('anchor').addEventListener('change', (e) => {
    state.showAnchor = e.target.checked;
    render();
  });
}

let acc = 0, last = 0;
function loop(t) {
  if (!last) last = t;
  acc += t - last;
  last = t;
  if (state.playing) {
    while (acc >= state.msPerFrame) {
      for (const c of cells) {
        // Use the shared §12.4 advance; loop once-animations too for the gallery.
        const { frame, endOfAnimation } = advanceFrame(c.frame, c.anim);
        c.frame = endOfAnimation ? 0 : frame;
      }
      acc -= state.msPerFrame;
    }
  } else {
    acc = 0;
  }
  render();
  requestAnimationFrame(loop);
}

function render() {
  const s = state.scale;
  const footX = FOOT_X * s, footY = FOOT_Y * s;
  for (const c of cells) {
    const { ctx, cv } = c;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // baseline the feet stand on
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footY + 0.5);
    ctx.lineTo(cv.width, footY + 0.5);
    ctx.stroke();
    // the sprite, anchored so its foot lands on the baseline
    c.sheet.drawFrame(ctx, c.name, c.frame, footX, footY, s);
    // optional foot-anchor crosshair
    if (state.showAnchor) {
      ctx.strokeStyle = 'rgba(255,70,70,0.95)';
      ctx.beginPath();
      ctx.moveTo(footX + 0.5, footY - 6); ctx.lineTo(footX + 0.5, footY + 6);
      ctx.moveTo(footX - 6, footY + 0.5); ctx.lineTo(footX + 6, footY + 0.5);
      ctx.stroke();
    }
  }
}
