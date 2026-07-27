// lemmings/main.js
//
// The game shell for the playable front door (index.html). Loads the lemming sprite
// atlas, builds the synthetic easy level (src/level_easy.js), attaches the Ch 13
// spawner, enables the Ch 19 level layer (end conditions / clock / scoring), and runs
// the frame pump under a requestAnimationFrame loop at the §2.6 cadence — rendering the
// 320×160 viewport (§2.4) with horizontal camera scrolling (§2.4, range 0…1264).
//
// This file is the shell (loop + render + camera). The DOM skill panel & HUD (Ch 22)
// live in panel.js; input wiring (assignment, rate, pause, nuke) is added on top. Only
// the lemming sprites come from source art — everything else here is authored (see the
// note in index.html).

import { Simulation } from './src/simulation.js';
import { Spawner } from './src/spawner.js';
import { SpriteSheet } from './src/sprite_sheet.js';
import { animationName, ACTION } from './src/lemming.js';
import { cursorHitsLemming } from './src/assignment.js';
import { buildTerrainCanvas } from './src/terrain_render.js';
import { buildEasyLevel } from './src/level_easy.js';
import { burstParticles, PARTICLE_HOLD, PARTICLE_COLORS } from './src/particle_burst.js';
import { Panel } from './panel.js';
import { VIEWPORT_W, VIEWPORT_H, SCROLL_MAX } from './src/constants.js';

// §18.2 — the "working" actions that make a lemming a prioritized cursor candidate.
const WORKING = new Set([ACTION.BLOCKING, ACTION.BUILDING, ACTION.SHRUGGING,
  ACTION.BASHING, ACTION.MINING, ACTION.DIGGING, ACTION.OHNOING]);
// §18.3 — only the four terrain-work skills fall back to the secondary candidate.
const FALLBACK = new Set(['builder', 'basher', 'miner', 'digger']);

const SKY = '#0e1524';
const TERRAIN_COLOR = '#8a9b5a';
const MS_PER_FRAME = 58;        // §2.6 — the normal frame is 58 ms (≈17.24 fps)
const SCROLL_SPEED = 6;         // camera world-px per animation frame
const EDGE = 0.07;              // mouse within this fraction of an edge scrolls (§25 method — free)

// §21.5 selection cursor — an authored focused reticle (the cursor is not DOS art; art is
// free). Shown when the §18.2 hit-test finds a lemming under the cursor, else plain.
const CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'>" +
  "<g fill='none' stroke='#ffe14d' stroke-width='1.6'>" +
  "<path d='M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3'/>" +   // corner brackets
  "<path d='M8 3v3M8 10v3M3 8h3M10 8h3'/></g></svg>";       // gapped cross-hair
const CURSOR_FOCUSED = `url("data:image/svg+xml,${encodeURIComponent(CURSOR_SVG)}") 8 8, crosshair`;

const game = {
  scale: 2,                     // integer display scale (§2.4 — free); adjustable later
  camX: 0,                      // scroll offset: world x at the viewport's left edge (§2.4)
  sim: null, sheet: null, terrainCanvas: null, level: null,
  cursor: null,                 // {wx, wy} world position of the cursor over the canvas
};

const cv = document.getElementById('view');
const ctx = cv.getContext('2d');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const keys = { left: false, right: false };
let mouseXFrac = null;          // cursor x within the canvas, 0…1, or null when outside
let panel = null;

init();

async function init() {
  try {
    game.sheet = await SpriteSheet.load();
    game.countdown = await loadImage(new URL('./assets/countdown.png', import.meta.url).href);
  } catch (e) {
    errEl.textContent = 'Failed to load sprites: ' + e.message;
    return;
  }

  // The skill panel & HUD (Ch 22). Built once; its controls route to the CURRENT sim's
  // phase-2/8 inputs via game.sim, so a retry's fresh sim is picked up automatically.
  panel = new Panel(document.getElementById('panel'), {
    onRate: (d) => game.sim.requestRateChange(d),           // §13.6 (applied at phase 2)
    onPause: () => game.sim.setPaused(!game.sim.paused),    // §12.5
    onNuke: () => game.sim.armNuke(),                       // §19.3 (panel handles the 2-press)
    onSelect: (key) => panel.setSelected(panel.selected === key ? null : key),  // §22.5
    onMinimap: (worldX) => { game.camX = clampCam(worldX); },   // §2.5
  });

  startLevel();
  applyScale();
  wireCamera();
  wireAssignment();
  wireResults();
  // Dev hook: `?debug` exposes game + panel (and the live sim) on window for console poking.
  if (new URLSearchParams(location.search).has('debug')) {
    window.throng = { game, panel, get sim() { return game.sim; } };
  }
  requestAnimationFrame(loop);   // unkillable display loop; paints one frame immediately
}

function clampCam(x) { return Math.max(0, Math.min(SCROLL_MAX, Math.round(x))); }

// Build (or rebuild, on retry §23.5) the level and its simulation from frame 0 — the
// §11.6 level-start reset. Called once at boot and again by the Results "Play again".
function startLevel() {
  const level = buildEasyLevel();
  game.level = level;
  const sim = new Simulation(level.terrain, level.objectMap);
  sim.setSpawner(new Spawner({
    entrances: [level.entrance],
    maxLemmings: level.params.lemmingsCount,
    releaseRate: level.params.releaseRate,
  }));
  sim.configureLevel({
    maxLemmings: level.params.lemmingsCount,
    rescueCount: level.params.rescueCount,
    timeLimitMinutes: level.params.timeLimit,
    budget: paramsToBudget(level.params),
  });
  game.sim = sim;
  game.camX = level.params.screenPosition;
  game.terrainCanvas = buildTerrainCanvas(level.terrain, { solidColor: TERRAIN_COLOR });
  if (panel) panel.setSelected(null);      // clear the active skill on (re)start
  hideResults();
}

/** Load an <img> and resolve when it's ready. */
function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('failed to load ' + url));
    img.src = url;
  });
}

/** Map the level's eight *Count params to the SKILL.* budget keys the sim spends. */
function paramsToBudget(p) {
  return {
    climber: p.climberCount, floater: p.floaterCount, bomber: p.bomberCount, blocker: p.blockerCount,
    builder: p.builderCount, basher: p.basherCount, miner: p.minerCount, digger: p.diggerCount,
  };
}

function applyScale() {
  cv.width = VIEWPORT_W * game.scale;
  cv.height = VIEWPORT_H * game.scale;
  ctx.imageSmoothingEnabled = false;
}

// ── The loop: fixed-step simulation, free-running render ───────────────────────
let acc = 0, last = 0;
function loop(t) {
  if (!last) last = t;
  acc += t - last;
  last = t;
  // Step the sim at the fixed §2.6 cadence; render every animation frame.
  while (acc >= MS_PER_FRAME) { game.sim.step(); acc -= MS_PER_FRAME; }
  // Show the results overlay once the level finishes (§19.5 → §23.4).
  if (game.sim.finished && resultsEl.hidden) showResults(game.sim.result);
  updateCamera();
  render();
  requestAnimationFrame(loop);
}

// ── Camera (§2.4) — horizontal only; offset clamped to 0…SCROLL_MAX ────────────
function wireCamera() {
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') keys.left = true;
    else if (e.key === 'ArrowRight') keys.right = true;
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    else if (e.key === 'ArrowRight') keys.right = false;
  });
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    mouseXFrac = (e.clientX - r.left) / r.width;
  });
  cv.addEventListener('mouseleave', () => { mouseXFrac = null; });
}

function updateCamera() {
  let dx = 0;
  if (keys.left) dx -= SCROLL_SPEED;
  if (keys.right) dx += SCROLL_SPEED;
  if (mouseXFrac != null) {
    if (mouseXFrac < EDGE) dx -= SCROLL_SPEED;
    else if (mouseXFrac > 1 - EDGE) dx += SCROLL_SPEED;
  }
  if (dx) game.camX = clampCam(game.camX + dx);
}

// ── Assignment (§18) — cursor focus + click-to-assign ─────────────────────────
function wireAssignment() {
  cv.addEventListener('mousemove', (e) => { game.cursor = canvasToWorld(e); });
  cv.addEventListener('mouseleave', () => { game.cursor = null; });
  cv.addEventListener('mousedown', (e) => {
    const w = canvasToWorld(e);
    tryAssign(w.wx, w.wy, e.button === 2);          // right button → the passive lemming (§18.2)
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
}

function canvasToWorld(e) {
  const r = cv.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * cv.width;
  const sy = (e.clientY - r.top) / r.height * cv.height;
  return { wx: game.camX + sx / game.scale, wy: sy / game.scale };
}

// §18.2 — the two cursor candidates at (px,py): the LAST working lemming (prioritized)
// and the LAST non-working (non-prioritized) under the 13×13 hit box, in list order.
function hitTest(px, py, rightBtn) {
  let prio = null, non = null;
  for (const lem of game.sim.lemmings) {
    if (lem.isRemoved || !cursorHitsLemming(lem, px, py)) continue;
    if (WORKING.has(lem.action)) prio = lem; else non = lem;
  }
  return { lem1: (prio && !rightBtn) ? prio : non, lem2: non };   // primary / secondary (§18.2)
}

// §18.3 — assign the selected skill to Lemming1, falling back to Lemming2 for the four
// terrain-work skills if Lemming1 doesn't qualify.
function tryAssign(px, py, rightBtn) {
  const skill = panel.selected;
  if (!skill) return;
  const { lem1, lem2 } = hitTest(px, py, rightBtn);
  if (lem1 && game.sim.assign(lem1, skill)) return;
  if (FALLBACK.has(skill) && lem2 && lem2 !== lem1) game.sim.assign(lem2, skill);
}

// The under-cursor focus: find Lemming1 at the cursor (§18.2), swap the canvas cursor to
// the focused reticle when one is there (§21.5), and return its action for the §22.3 readout.
function cursorFocus() {
  if (!game.cursor) { cv.style.cursor = 'crosshair'; return ''; }
  const { lem1 } = hitTest(game.cursor.wx, game.cursor.wy, false);
  cv.style.cursor = lem1 ? CURSOR_FOCUSED : 'crosshair';
  return lem1 ? lem1.action : '';
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  const s = game.scale, cam = game.camX;
  ctx.imageSmoothingEnabled = false;

  // Re-sync the cached terrain silhouette when the buffer changed this frame — a
  // builder's brick, a bash/mine/dig, or a bomber crater (§3.7). Rebuilt only on
  // change, so a static level costs nothing; this also keeps the minimap current.
  if (game.level.terrain.dirty) {
    game.terrainCanvas = buildTerrainCanvas(game.level.terrain, { solidColor: TERRAIN_COLOR });
    game.level.terrain.dirty = false;
  }

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // Terrain silhouette — draw the [cam, cam+320) window scaled to fill the canvas.
  ctx.drawImage(game.terrainCanvas, cam, 0, VIEWPORT_W, VIEWPORT_H, 0, 0, cv.width, cv.height);

  drawEntrance(game.level.entrance, cam, s);
  drawExit(game.level.exit, cam, s);

  for (const lem of game.sim.liveLemmings()) {
    const name = game.sheet.directional(animationName(lem.action), lem.direction < 0);
    game.sheet.drawFrame(ctx, name, lem.frame, (lem.x - cam) * s, lem.y * s, s);
    // Countdown digit over a fused lemming (§21.3): digit from the timer, 8×8 above
    // the head. Bins + placement from Lemmix Game.pas (2625, GetCountDownDigitBounds).
    if (lem.explosionTimer > 0 && game.countdown) {
      const t = lem.explosionTimer;
      const digit = t >= 65 ? 5 : t >= 49 ? 4 : t >= 33 ? 3 : t >= 17 ? 2 : 1;
      const top = lem.y - game.sheet.get(name).footY - 12;
      ctx.drawImage(game.countdown, 0, (5 - digit) * 8, 8, 8, (lem.x - 1 - cam) * s, top * s, 8 * s, 8 * s);
    }
  }

  drawExplosions(cam, s);

  panel.update(game.sim, game, cursorFocus());
  updateStatus();
}

// Placeholder entrance hatch (authored — no source art). Lemmings emerge at (x+24,y+14).
function drawEntrance(e, cam, s) {
  const x = (e.x - cam) * s, y = e.y * s;
  ctx.fillStyle = '#b9b1a1';
  ctx.fillRect(x, y, 48 * s, 6 * s);                 // the trapdoor bar
  ctx.fillStyle = '#6f6a5c';
  ctx.fillRect(x + 16 * s, y + 6 * s, 16 * s, 5 * s); // the opening the lemmings drop from
}

// §21.4 explosion scatter (layer 5) — the procedural ballistic burst for every lemming that
// has detonated (`particleTimer > 0`). These are removed lemmings, so they aren't in
// liveLemmings(); we walk the full append-only list and use each lemming's stable list index
// as the burst seed. Off-viewport sparks are culled. The burst self-clears when the sim's
// particleTimer (§11.3) reaches 0.
function drawExplosions(cam, s) {
  const lems = game.sim.lemmings;
  for (let seed = 0; seed < lems.length; seed++) {
    const lem = lems[seed];
    if (lem.particleTimer <= 0) continue;
    const elapsed = PARTICLE_HOLD - lem.particleTimer;      // 0…51
    for (const p of burstParticles(seed, elapsed)) {
      const sx = (lem.x + p.dx - cam) * s, sy = (lem.y + p.dy) * s;
      if (sx < -s || sx > cv.width || sy < -s || sy > cv.height) continue;   // cull off-screen
      ctx.fillStyle = PARTICLE_COLORS[p.ci];
      ctx.fillRect(sx, sy, s, s);
    }
  }
}

// Placeholder exit doorway (authored). The EXIT trigger straddles y = exit.y.
function drawExit(ex, cam, s) {
  const x = (ex.x - cam) * s, y = ex.y * s;
  const h = 30 * s;
  ctx.fillStyle = '#2f6b3a';
  ctx.fillRect(x - 14 * s, y - h, 28 * s, h);         // door frame standing on the ground
  ctx.fillStyle = '#83d693';
  ctx.fillRect(x - 8 * s, y - h + 6 * s, 16 * s, h - 6 * s); // the lit opening
}

function updateStatus() {
  const sim = game.sim;
  const done = sim.finished
    ? `  —  ${sim.result.won ? 'WIN' : 'LOSE'} (${sim.result.donePct}% ≥ ${sim.result.targetPct}%${sim.result.timeUp ? ', time up' : ''})`
    : '';
  statusEl.textContent =
    `frame ${String(sim.frame).padStart(5)}   out ${String(sim.out).padStart(2)}   ` +
    `in ${String(sim.savedPercent()).padStart(3)}%   time ${sim.clockString().padStart(4)}   ` +
    `cam ${String(game.camX).padStart(4)}${done}`;
}

// ── Results overlay (Ch 23.4) — authored DOM over the viewport ─────────────────
function wireResults() {
  resultsEl.querySelector('.retry').addEventListener('click', () => startLevel());   // §23.5 retry
}

// Fill + show the overlay from the §19.6 result record when the level finishes (§23.4).
function showResults(r) {
  const outcome = resultsEl.querySelector('.outcome');
  outcome.textContent = r.won ? 'You made it!' : 'Not this time';
  outcome.className = 'outcome ' + (r.won ? 'win' : 'lose');
  resultsEl.querySelector('.figures').innerHTML =
    `Rescued <b>${r.donePct}%</b> &middot; needed <b>${r.targetPct}%</b><br>` +
    `${r.saved} of ${r.lemmingsCount} saved${r.timeUp ? ' &middot; time up' : ''}`;
  resultsEl.hidden = false;
}

function hideResults() { resultsEl.hidden = true; }
