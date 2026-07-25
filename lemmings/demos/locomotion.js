// lemmings/demos/locomotion.js
//
// Demo-only glue: the locomotion gallery. Runs each scenario (demos/scenarios.js)
// as its own headless src/simulation.js instance and renders it through the
// reusable src/ modules — one small panel per lemming↔terrain behavior. Nothing
// here is game logic; it drives the shared simulation + renderer for observation.

import { SCENARIOS } from './scenarios.js';
import { Simulation } from '../src/simulation.js';
import { Terrain } from '../src/terrain.js';
import { ObjectMap } from '../src/object_map.js';
import { SpriteSheet } from '../src/sprite_sheet.js';
import { animationName } from '../src/lemming.js';
import { buildTerrainCanvas, paintObjectMapDebug } from '../src/terrain_render.js';

const SKY = '#0e1524';
const TERRAIN_COLOR = '#8a9b5a';
const RESPAWN_DELAY = 12;              // frames to hold an empty stage before respawning

const state = { scale: 4, msPerFrame: 58, playing: true, showTriggers: true, showFoot: false };
/** @type {Array<{scenario: any, sim: Simulation, objectMap: ObjectMap, terrainCanvas: HTMLCanvasElement, comp: HTMLCanvasElement, cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, meta: HTMLElement, emptyFor: number}>} */
const panels = [];
let sheet;

const grid = document.getElementById('grid');
const errEl = document.getElementById('error');

init();

async function init() {
  try {
    sheet = await SpriteSheet.load();
  } catch (e) {
    errEl.textContent = 'Failed to load sprites: ' + e.message;
    return;
  }

  for (const scenario of SCENARIOS) {
    // Build this stage's world (terrain buffer + object map) and its simulation.
    const terrain = new Terrain();
    const objectMap = new ObjectMap();
    scenario.build(terrain, objectMap);
    const sim = new Simulation(terrain, objectMap);
    scenario.spawn(sim);

    const terrainCanvas = buildTerrainCanvas(terrain, { solidColor: TERRAIN_COLOR });

    // DOM: figure → canvas + caption (title + live meta).
    const fig = document.createElement('figure');
    const box = document.createElement('div');
    box.className = 'box';
    const cv = document.createElement('canvas');
    box.appendChild(cv);
    const cap = document.createElement('figcaption');
    cap.innerHTML =
      `<span class="name">${scenario.title}</span>` +
      `<span class="hint">${scenario.hint}</span>` +
      `<span class="meta"></span>`;
    fig.appendChild(box);
    fig.appendChild(cap);
    grid.appendChild(fig);

    const panel = {
      scenario, sim, objectMap, terrainCanvas,
      comp: document.createElement('canvas'),
      cv, ctx: cv.getContext('2d'),
      meta: cap.querySelector('.meta'),
      emptyFor: 0,
    };
    buildComposite(panel);
    panels.push(panel);
  }

  wireControls();
  applyScale();
  requestAnimationFrame(loop);   // unkillable display loop; paints one frame immediately via render()
}

// Compose the static background for a panel's view once: sky, terrain silhouette,
// and (for hazard stages, if enabled) the object-map trigger overlay. Rebuilt only
// when the "show triggers" toggle changes.
function buildComposite(panel) {
  const { view } = panel.scenario;
  const comp = panel.comp;
  comp.width = view.w;
  comp.height = view.h;
  const c = comp.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.fillStyle = SKY;
  c.fillRect(0, 0, view.w, view.h);
  c.drawImage(panel.terrainCanvas, view.x, view.y, view.w, view.h, 0, 0, view.w, view.h);
  if (state.showTriggers && panel.scenario.showTriggers) {
    c.save();
    c.translate(-view.x, -view.y);            // paintObjectMapDebug draws in world coords
    paintObjectMapDebug(c, panel.objectMap);
    c.restore();
  }
}

function applyScale() {
  const s = state.scale;
  let maxW = 0;
  for (const p of panels) {
    const { view } = p.scenario;
    p.cv.width = view.w * s;
    p.cv.height = view.h * s;
    p.ctx.imageSmoothingEnabled = false;
    if (view.w * s > maxW) maxW = view.w * s;
  }
  document.documentElement.style.setProperty('--cell', (maxW + 22) + 'px');
  render();
}

let acc = 0, last = 0;
function loop(t) {
  if (!last) last = t;
  acc += t - last;
  last = t;
  if (state.playing) {
    while (acc >= state.msPerFrame) { tick(); acc -= state.msPerFrame; }
  } else {
    acc = 0;
  }
  render();
  requestAnimationFrame(loop);
}

// One simulation frame across every panel, plus respawn bookkeeping.
function tick() {
  for (const p of panels) {
    p.sim.step();
    if (p.sim.liveCount() === 0) {
      if (++p.emptyFor >= RESPAWN_DELAY) respawn(p);
    } else {
      p.emptyFor = 0;
    }
  }
}

// Clear a stage's finished lemmings and spawn a fresh walker. Counters (saved /
// removed) persist across respawns so the caption shows a running tally.
function respawn(p) {
  p.sim.lemmings.length = 0;
  p.scenario.spawn(p.sim);
  p.emptyFor = 0;
}

function render() {
  for (const p of panels) renderPanel(p);
}

function renderPanel(p) {
  const s = state.scale;
  const { view } = p.scenario;
  const { ctx } = p;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(p.comp, 0, 0, view.w, view.h, 0, 0, view.w * s, view.h * s);

  for (const lem of p.sim.liveLemmings()) {
    const name = sheet.directional(animationName(lem.action), lem.direction < 0);
    const fx = (lem.x - view.x) * s;
    const fy = (lem.y - view.y) * s;
    sheet.drawFrame(ctx, name, lem.frame, fx, fy, s);
    if (state.showFoot) {
      ctx.fillStyle = 'rgba(255,70,70,0.95)';
      ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 2, 2);
    }
  }
  updateMeta(p);
}

// Live readout. Fields are padded to a fixed width (monospace + pre in the CSS) so
// the text never jitters as the action word changes length (UI convention).
function updateMeta(p) {
  const live = p.sim.liveLemmings();
  let stateText;
  if (live.length) {
    const lem = live[0];
    const arrow = lem.direction > 0 ? '→' : lem.direction < 0 ? '←' : '·';
    stateText = lem.action.padEnd(10) + ' ' + arrow;
  } else {
    stateText = '(respawning)'.padEnd(12);
  }
  const lost = p.sim.removed - p.sim.saved;
  p.meta.textContent = `${stateText}  saved ${String(p.sim.saved).padStart(2)}  lost ${String(lost).padStart(2)}`;
}

function wireControls() {
  document.getElementById('speed').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.msPerFrame = +b.dataset.ms;
    for (const btn of e.currentTarget.querySelectorAll('button')) btn.classList.toggle('on', btn === b);
  });

  const pp = document.getElementById('playPause');
  pp.addEventListener('click', () => {
    state.playing = !state.playing;
    pp.classList.toggle('on', state.playing);
    pp.textContent = state.playing ? '⏸ Pause' : '▶ Play';
  });

  document.getElementById('stepBtn').addEventListener('click', () => {
    state.playing = false;
    pp.classList.remove('on');
    pp.textContent = '▶ Play';
    tick();
    render();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    for (const p of panels) respawn(p);
    render();
  });

  const scale = document.getElementById('scale');
  const scaleVal = document.getElementById('scaleVal');
  scale.addEventListener('input', () => {
    state.scale = +scale.value;
    scaleVal.textContent = state.scale + '×';
    applyScale();
  });

  document.getElementById('triggers').addEventListener('change', (e) => {
    state.showTriggers = e.target.checked;
    for (const p of panels) buildComposite(p);
    render();
  });
  document.getElementById('foot').addEventListener('change', (e) => {
    state.showFoot = e.target.checked;
    render();
  });
}
