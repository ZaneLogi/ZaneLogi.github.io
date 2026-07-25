// lemmings/demos/spawner.js
//
// Standalone demo for the spawner (design_spec Chapter 13). Builds a SYNTHETIC
// stage — a flat floor between two walls, plus N hand-placed entrances — attaches
// a src/spawner.js Spawner, and runs src/simulation.js so the opening timeline
// (§13.1) and the release stream (§13.2–13.5) can be watched.
//
// Nothing here is engine logic; the spawner IS the engine (src/spawner.js). This
// file only authors the synthetic level, wires the four controls, and renders. Any
// control change rebuilds the level from frame 0 (the user's requested semantics).

import { Simulation } from '../src/simulation.js';
import { Terrain } from '../src/terrain.js';
import { ObjectMap } from '../src/object_map.js';
import { Spawner, releaseInterval, orderTable, ENTRANCES_OPEN_FRAME, INITIAL_COUNTDOWN } from '../src/spawner.js';
import { SpriteSheet } from '../src/sprite_sheet.js';
import { animationName } from '../src/lemming.js';
import { buildTerrainCanvas } from '../src/terrain_render.js';

// ─── synthetic stage geometry ────────────────────────────────────────────────
const STAGE_W = 560, STAGE_H = 160;
const FLOOR = 108;            // floor top; a spawn (entrance.y+14) drops here and lives
const ENTRANCE_Y = 40;        // entrance top-left y ⇒ spawn y = 54, a safe ~54px drop
const MAX_LEMMINGS = 20;      // the level's lemmingsCount (§11.3) — fixed for this demo
const SKY = '#0e1524';
const TERRAIN_COLOR = '#8a9b5a';
const HATCH = '#ff3fbf';
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

const state = { scale: 1, msPerFrame: 40, playing: true };
let sheet, sim, spawner, terrainCanvas, entrances, cfg;

const cv = document.getElementById('view');
const ctx = cv.getContext('2d');
const errEl = document.getElementById('error');

init();

async function init() {
  try {
    sheet = await SpriteSheet.load();
  } catch (e) {
    errEl.textContent = 'Failed to load sprites: ' + e.message;
    return;
  }
  runSelfChecks();
  wireControls();
  rebuild();                       // build from the initial control values
  requestAnimationFrame(loop);     // unkillable display loop
}

// Read the four controls into a config object (§13 parameters).
function readConfig() {
  const entranceCount = +document.getElementById('entrances').value;
  const rate = +document.getElementById('rate').value;
  const overrideOn = document.getElementById('intervalOverride').checked;
  const intervalManual = +document.getElementById('interval').value;
  const countdown = +document.getElementById('countdown').value;
  return {
    entranceCount,
    rate,
    intervalOverride: overrideOn ? intervalManual : null,
    initialCountdown: countdown,
  };
}

// Place `n` entrances evenly across the stage; entrance (x, y) is the object's
// top-left, and a release appears at (x+24, y+14) (§13.5).
function placeEntrances(n) {
  const out = [];
  const margin = 70;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (STAGE_W / 2 - 24) : Math.round(margin + i * (STAGE_W - 2 * margin) / (n - 1));
    out.push({ x, y: ENTRANCE_Y });
  }
  return out;
}

// (Re)build the whole synthetic level + simulation from the current controls and
// restart from frame 0. Called on load and on every control change.
function rebuild() {
  cfg = readConfig();
  entrances = placeEntrances(cfg.entranceCount);

  const terrain = new Terrain();
  terrain.fillRect(0, FLOOR, STAGE_W, STAGE_H - FLOOR);   // floor
  terrain.fillRect(8, FLOOR - 26, 6, 26);                 // left wall (unclimbable → pace)
  terrain.fillRect(STAGE_W - 14, FLOOR - 26, 6, 26);      // right wall
  const objectMap = new ObjectMap();

  sim = new Simulation(terrain, objectMap);
  spawner = new Spawner({
    entrances,
    maxLemmings: MAX_LEMMINGS,
    releaseRate: cfg.rate,
    intervalOverride: cfg.intervalOverride,
    initialCountdown: cfg.initialCountdown,
  });
  sim.setSpawner(spawner);

  terrainCanvas = buildTerrainCanvas(terrain, { solidColor: TERRAIN_COLOR });
  applyScale();
  updateDerivedReadouts();
  render();
}

function applyScale() {
  cv.width = STAGE_W * state.scale;
  cv.height = STAGE_H * state.scale;
  ctx.imageSmoothingEnabled = false;
}

let acc = 0, last = 0;
function loop(t) {
  if (!last) last = t;
  acc += t - last;
  last = t;
  if (state.playing) {
    while (acc >= state.msPerFrame) { sim.step(); acc -= state.msPerFrame; }
  } else {
    acc = 0;
  }
  render();
  requestAnimationFrame(loop);
}

function render() {
  const s = state.scale;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(terrainCanvas, 0, 0, STAGE_W, STAGE_H, 0, 0, STAGE_W * s, STAGE_H * s);

  // Entrances: a hatch marker + label, and a tick at the spawn mouth (x+24, y+14).
  for (let i = 0; i < entrances.length; i++) {
    const e = entrances[i];
    ctx.fillStyle = HATCH;
    ctx.fillRect((e.x + 8) * s, e.y * s, 32 * s, 4 * s);           // lintel
    ctx.fillRect((e.x + 20) * s, e.y * s, 8 * s, 14 * s);          // chute
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${9 * s}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(LABELS[i] || '·', (e.x + 24) * s, (e.y - 3) * s);
  }

  // Lemmings.
  for (const lem of sim.liveLemmings()) {
    const name = sheet.directional(animationName(lem.action), lem.direction < 0);
    sheet.drawFrame(ctx, name, lem.frame, lem.x * s, lem.y * s, s);
  }

  updateHud();
}

// Live HUD — the spawner's state, fixed-width so it does not jitter (UI convention).
function updateHud() {
  const pad = (v, n) => String(v).padStart(n);
  const opened = spawner.entrancesOpened;
  const nextRelease = !opened
    ? `frame ${ENTRANCES_OPEN_FRAME + spawner.countdown - 1}`   // decrements from frame 35 ⇒ 35+20−1 = 54
    : (sim.released >= MAX_LEMMINGS ? '— (complete)' : `${spawner.countdown} frame(s)`);

  document.getElementById('hud').textContent =
    `frame        ${pad(sim.frame, 4)}\n` +
    `entrances    ${opened ? 'OPEN (frame ≥ 35)' : `closed (open at ${ENTRANCES_OPEN_FRAME})`}\n` +
    `countdown    ${opened ? pad(spawner.countdown, 4) : '  — '}   next release: ${nextRelease}\n` +
    `interval     ${pad(spawner.interval(), 4)} frame(s)${spawner.intervalOverride != null ? '  (override)' : `  = (99−${spawner.rate})/2+4`}\n` +
    `released     ${pad(sim.released, 4)} / ${MAX_LEMMINGS}${sim.released >= MAX_LEMMINGS ? '   stream complete' : ''}\n` +
    `out (alive)  ${pad(sim.out, 4)}`;

  // Per-entrance release tally — recomputed from released + the rotation table,
  // showing §13.4's rotation (e.g. ABCB gives B twice as many as A/C).
  const counts = new Array(entrances.length).fill(0);
  for (let r = 0; r < sim.released; r++) counts[spawner.order[r % 4]]++;
  document.getElementById('entranceCounts').textContent =
    `rotation ${orderRotationLabel(spawner.order, entrances.length)}   ` +
    counts.map((c, i) => `${LABELS[i]}:${c}`).join('  ');
}

// The rotation as letters (AAAA / ABAB / ABCB / ABCD).
function orderRotationLabel(order, n) {
  if (n > 4) return 'AAAA (>4 → first only)';
  return order.map((idx) => LABELS[idx]).join('');
}

// Update the read-only "derived interval" hint next to the rate slider.
function updateDerivedReadouts() {
  document.getElementById('rateVal').textContent = cfg.rate;
  document.getElementById('derivedInterval').textContent = releaseInterval(cfg.rate);
  document.getElementById('countVal').textContent = cfg.entranceCount;
  // When not overriding, keep the interval field showing the derived value.
  const overrideOn = document.getElementById('intervalOverride').checked;
  document.getElementById('interval').disabled = !overrideOn;
  if (!overrideOn) document.getElementById('interval').value = releaseInterval(cfg.rate);
}

function wireControls() {
  // Any parameter change rebuilds from frame 0 (requested reset semantics).
  for (const id of ['entrances', 'rate', 'interval', 'intervalOverride', 'countdown']) {
    document.getElementById(id).addEventListener('input', () => {
      // keep the derived-interval hint live even before rebuild reads it
      document.getElementById('rateVal').textContent = document.getElementById('rate').value;
      document.getElementById('derivedInterval').textContent = releaseInterval(+document.getElementById('rate').value);
      document.getElementById('countVal').textContent = document.getElementById('entrances').value;
      rebuild();
    });
  }

  const pp = document.getElementById('playPause');
  pp.addEventListener('click', () => {
    state.playing = !state.playing;
    pp.textContent = state.playing ? '⏸ Pause' : '▶ Play';
  });
  document.getElementById('stepBtn').addEventListener('click', () => {
    state.playing = false;
    pp.textContent = '▶ Play';
    sim.step();
    render();
  });
  document.getElementById('restartBtn').addEventListener('click', rebuild);

  const scale = document.getElementById('scale');
  scale.addEventListener('input', () => {
    state.scale = +scale.value;
    document.getElementById('scaleVal').textContent = state.scale + '×';
    applyScale();
    render();
  });
}

// ─── headless self-check (§13 invariants) — deterministic, no rendering ───────
function runSelfChecks() {
  const checks = [];
  const build = (entranceCount, over = {}) => {
    const terrain = new Terrain(); terrain.fillRect(0, FLOOR, STAGE_W, STAGE_H - FLOOR);
    const s = new Simulation(terrain, new ObjectMap());
    const sp = new Spawner({
      entrances: placeEntrances(entranceCount),
      maxLemmings: over.max ?? MAX_LEMMINGS,
      releaseRate: over.rate ?? 50,
      intervalOverride: over.intervalOverride ?? null,
      initialCountdown: over.countdown ?? INITIAL_COUNTDOWN,
    });
    s.setSpawner(sp);
    return { s, sp };
  };

  // (1) interval formula (§13.3).
  checks.push(['interval: 99→4, 50→28, 1→53',
    releaseInterval(99) === 4 && releaseInterval(50) === 28 && releaseInterval(1) === 53]);

  // (2) order tables (§13.4).
  checks.push(['orderTable 1/2/3/4/5 correct',
    JSON.stringify(orderTable(1)) === '[0,0,0,0]' &&
    JSON.stringify(orderTable(2)) === '[0,1,0,1]' &&
    JSON.stringify(orderTable(3)) === '[0,1,2,1]' &&
    JSON.stringify(orderTable(4)) === '[0,1,2,3]' &&
    JSON.stringify(orderTable(5)) === '[0,0,0,0]']);

  // (3) first release lands at frame 54 — the countdown (20) decrements on every
  // open frame INCLUDING frame 35, so 20 ticks span frames 35..54.
  {
    const { s } = build(1);
    let firstFrame = -1;
    for (let i = 0; i < 60 && firstFrame < 0; i++) { s.step(); if (s.released === 1) firstFrame = s.frame; }
    checks.push(['first release at frame 54 (frame 35 = first tick)', firstFrame === 54]);
  }

  // (3b) the spawn RECORD (§13.5): a rightward Faller at entrance +(24,14). Tested
  // at creation via a direct spawner call — the sim would have already fallen it a
  // few px by phase 5 the same frame, so we read the raw lemming here.
  {
    const sp = new Spawner({ entrances: placeEntrances(1), maxLemmings: MAX_LEMMINGS, releaseRate: 50 });
    sp.entrancesOpened = true; sp.countdown = 1;   // pretend it opened earlier; one tick left
    const raw = sp.step(0);                          // released 0 → countdown 1→0 → release
    const e = placeEntrances(1)[0];
    checks.push(['spawn: Faller at entrance +(24,14), dir +1',
      !!raw && raw.action === 'falling' && raw.direction === 1 && raw.x === e.x + 24 && raw.y === e.y + 14]);
  }

  // (4) entrance rotation for 3 entrances is ABCB… (§13.4): the first 8 releases go
  // to entrance indices [0,1,2,1,0,1,2,1].
  {
    const { s } = build(3, { max: 8, rate: 99 });   // rate 99 ⇒ interval 4, quick stream
    const seen = [];
    for (let i = 0; i < 400 && s.released < 8; i++) {
      const before = s.released; s.step();
      if (s.released > before) seen.push(s.lemmings[s.lemmings.length - 1].x);
    }
    const ent = placeEntrances(3);
    const expected = [0, 1, 2, 1, 0, 1, 2, 1].map((idx) => ent[idx].x + 24);
    checks.push(['3 entrances rotate ABCB', JSON.stringify(seen) === JSON.stringify(expected)]);
  }

  // (5) the stream stops at maxLemmings (§13.7): release never exceeds the cap.
  {
    const { s } = build(1, { max: 5, rate: 99 });
    for (let i = 0; i < 300; i++) s.step();
    checks.push(['stops at maxLemmings (5)', s.released === 5]);
  }

  // (6) interval override replaces the formula (synthetic knob).
  {
    const { sp } = build(1, { rate: 50, intervalOverride: 7 });
    checks.push(['interval override wins over rate', sp.interval() === 7]);
  }

  const tbody = document.querySelector('#checkTable tbody');
  let pass = 0;
  for (const [label, ok] of checks) {
    if (ok) pass++;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td class="${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</td>`;
    tbody.appendChild(tr);
  }
  const sum = document.getElementById('checkSummary');
  sum.textContent = `${pass} / ${checks.length} checks pass`;
  sum.className = pass === checks.length ? 'pass' : 'fail';
}
