// lemmings/demos/skill_stage.js
//
// Shared demo harness for the single-skill stages. Each skill page (skill_*.html)
// hands runStage() one scenario from skill_scenarios.js; this drives it on the
// headless src/simulation.js and renders it. Unlike the Phase-1 gallery, the
// terrain buffer MUTATES during play (diggers/bashers/miners/builders reshape it),
// so the background is redrawn from the buffer every frame rather than composited
// once.
//
// The skill is applied through src/assignment.js — auto-assigned to the scenario's
// target after a beat (so it walks first), and re-assignable by clicking a lemming
// (the faithful 13×13 hit box, §18.2) or the Assign button. The stage periodically
// resets so it re-demonstrates on a loop.

import { Simulation } from '../src/simulation.js';
import { Terrain } from '../src/terrain.js';
import { ObjectMap } from '../src/object_map.js';
import { SpriteSheet } from '../src/sprite_sheet.js';
import { paintObjectMapDebug } from '../src/terrain_render.js';
import { animationName } from '../src/lemming.js';
import { assignSkill, cursorHitsLemming } from '../src/assignment.js';

const SKY = [14, 21, 36];
const TERR = [138, 155, 90];

// All skill pages, for the shared cross-nav (built at runtime so every page links
// to every other without hand-maintained markup).
const SKILL_PAGES = [
  ['blocker', 'Blocker'], ['digger', 'Digger'], ['builder', 'Builder'],
  ['basher', 'Basher'], ['miner', 'Miner'], ['climber', 'Climber'],
  ['floater', 'Floater'], ['bomber', 'Bomber'],
];

function buildNav(currentId) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const parts = ['<a href="./locomotion.html">↤ locomotion gallery</a>'];
  for (const [id, label] of SKILL_PAGES) if (id !== currentId) parts.push(`<a href="./skill_${id}.html">${label}</a>`);
  nav.innerHTML = parts.join(' ');
}

/**
 * Boot a single-skill stage into the page (expects #stage, #hud, and the control
 * elements from skill_stage.html's markup).
 * @param {import('./skill_scenarios.js').SkillScenario} scenario
 */
export async function runStage(scenario) {
  const errEl = document.getElementById('error');
  let sheet;
  try { sheet = await SpriteSheet.load(); }
  catch (e) { errEl.textContent = 'Failed to load sprites: ' + e.message; return; }

  const view = scenario.view;
  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d');
  const bg = document.createElement('canvas');   // view-sized terrain+overlay, rebuilt each frame
  bg.width = view.w; bg.height = view.h;
  const bgctx = bg.getContext('2d');

  const state = { scale: 3, msPerFrame: 58, playing: true, showTriggers: true, framesSinceAssign: 0, assigned: false, resetFor: 0 };
  let terrain, objectMap, sim, primary;

  function reset() {
    terrain = new Terrain();
    objectMap = new ObjectMap();
    scenario.build(terrain, objectMap);
    sim = new Simulation(terrain, objectMap);
    primary = scenario.spawn(sim) || sim.lemmings[0];
    state.budget = { [scenario.skill]: scenario.skillBudget ?? 9 };
    state.assigned = false;
    state.framesSinceAssign = 0;
    state.resetFor = 0;
  }

  // Assign the scenario's skill to a target lemming (default: the primary).
  function assign(target = primary) {
    if (assignSkill(target, scenario.skill, { objectMap, budget: state.budget })) {
      state.assigned = true;
      state.framesSinceAssign = 0;
    }
  }

  function tick() {
    sim.step();
    // Auto-assign after a short beat so the lemming is seen walking first.
    if (!state.assigned && sim.frame >= (scenario.autoAssignAfter ?? 8)) assign();
    if (state.assigned) state.framesSinceAssign++;
    // Loop: reset when the target is gone, or periodically to re-demonstrate.
    const done = (primary && primary.isRemoved) || state.framesSinceAssign > (scenario.loopFrames ?? 220);
    if (done) { if (++state.resetFor > 14) reset(); }
    else state.resetFor = 0;
  }

  function render() {
    const s = state.scale;
    // 1) terrain silhouette for the view, straight from the (mutating) buffer.
    const img = bgctx.createImageData(view.w, view.h);
    const data = img.data;
    for (let py = 0; py < view.h; py++) {
      for (let px = 0; px < view.w; px++) {
        const solid = terrain.hasTerrain(view.x + px, view.y + py);
        const o = (py * view.w + px) * 4;
        const c = solid ? TERR : SKY;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    bgctx.putImageData(img, 0, 0);
    // 2) object-map overlay (triggers, steel, one-way, blocker field).
    if (state.showTriggers) {
      bgctx.save();
      bgctx.translate(-view.x, -view.y);
      paintObjectMapDebug(bgctx, objectMap);
      bgctx.restore();
    }
    // 3) blit scaled, then draw lemmings on top.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, view.w, view.h, 0, 0, view.w * s, view.h * s);
    for (const lem of sim.liveLemmings()) {
      const name = sheet.directional(animationName(lem.action), lem.direction < 0);
      sheet.drawFrame(ctx, name, lem.frame, (lem.x - view.x) * s, (lem.y - view.y) * s, s);
    }
    updateHud();
  }

  function updateHud() {
    const left = state.budget ? (state.budget[scenario.skill] ?? 0) : 0;
    const act = primary && !primary.isRemoved ? primary.action : '(gone)';
    document.getElementById('hud').textContent =
      `skill ${scenario.skill.padEnd(8)}  budget ${String(left).padStart(2)}  ` +
      `target ${act.padEnd(9)}  saved ${String(sim.saved).padStart(2)}`;
  }

  // ── controls ──
  function wire() {
    document.getElementById('speed').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
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
      state.playing = false; pp.classList.remove('on'); pp.textContent = '▶ Play';
      tick(); render();
    });
    document.getElementById('assignBtn').addEventListener('click', () => { assign(); render(); });
    document.getElementById('resetBtn').addEventListener('click', () => { reset(); render(); });
    const scale = document.getElementById('scale'), scaleVal = document.getElementById('scaleVal');
    scale.addEventListener('input', () => {
      state.scale = +scale.value; scaleVal.textContent = state.scale + '×';
      cv.width = view.w * state.scale; cv.height = view.h * state.scale; render();
    });
    document.getElementById('triggers').addEventListener('change', (e) => { state.showTriggers = e.target.checked; render(); });

    // Click a lemming to assign the skill to it (faithful 13×13 hit box, §18.2).
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const wx = view.x + (e.clientX - r.left) / state.scale;
      const wy = view.y + (e.clientY - r.top) / state.scale;
      let hit = null;
      for (const lem of sim.liveLemmings()) if (cursorHitsLemming(lem, wx, wy)) hit = lem;  // last in list wins
      if (hit) { assign(hit); render(); }
    });
  }

  reset();
  cv.width = view.w * state.scale; cv.height = view.h * state.scale;
  document.getElementById('title').textContent = scenario.title;
  document.getElementById('hint').textContent = scenario.hint;
  buildNav(scenario.id);
  wire();

  let acc = 0, last = 0;
  function loop(t) {
    if (!last) last = t;
    acc += t - last; last = t;
    if (state.playing) { while (acc >= state.msPerFrame) { tick(); acc -= state.msPerFrame; } }
    else acc = 0;
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
