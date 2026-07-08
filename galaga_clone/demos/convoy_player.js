// demos/convoy_player.js — BONUS-BEE X3 CONVOY test bench.
//
// The 5th and final attack-path bench. Same faithful-by-construction contract as its
// siblings: it DRIVES the real interpreter (bugMotion.js's update()), it does NOT
// re-implement the tokens. Pin the inputs and the convoy is identical every run.
//
// The bonus-bee convoy is the one EMERGENT dive: a single wasp is plucked from the
// formation, repainted, and launched as the LEADER of a 3-bug "X3" attack — but the
// 2 wingmen-"clones" are NOT launched by a separate routine. They split off from the
// leader's OWN path: the leader bytecode embeds two 0xF2 SPAWN tokens, and each one
// copies the leader (sprite/color/position) into a free corner slot (0x38-0x3E) and
// starts it on an embedded sub-path. So the convoy is a property of the path DATA.
// (Manager f_1A80, gg1-2_fx.s:681; SPAWN case_097B, gg1-5.s:1564.) research_bonus_bee.md.
//
// The COLOR index (0/1/2) is the whole story: it selects the leader path, the clone
// sub-path(s), and the sprite base — a genuinely different convoy each way:
//   0 → db_04EA, base 0x50, both clones run p_flv_0502  (F3 player-aim)
//   1 → db_0473, base 0x58, both clones run p_flv_0499  (plain dive)
//   2 → db_04AB, base 0x60, the two clones run DIFFERENT sub-paths (04c6 / 04cf)
//
// Faithful by construction: a wrong convoy here is a wrong convoy in the game.

import { state } from '../state.js';
import { update as stepBugs, launchEnemyAttack } from '../tasks/bugMotion.js';
import { getObjectIdForSlot, loadStageParms, getConvoyPath } from '../paths.js';

const PF_W = 224, PF_H = 288, SCALE = 2;
const PLAYER_Y = 265;                                 // fixed ship row (Z80 sprite_Y 297)
const MAX_FRAMES = 1500;                              // backstop
const LEADER_HUE = '#7cb6ff', LEADER_HEAD = '#eaeaea';
const CLONE_HUES = ['#68d391', '#f6ad55'];            // clone 0 = green, clone 1 = amber
const LEADER_ROWS = [4, 5];                           // wasps — the bonus-bee is plucked here (bee group scanned first)
const CLONE_SLOTS = [0x38, 0x3A, 0x3C, 0x3E];         // corner "clone/transient" IDs (gg1-5.s:1568)

// COLOR index → what it selects (getConvoyPath resolves the leader path + offset).
const COLORS = [
  { idx: 0, base: 0x50, leader: 'db_04EA', clones: 'p_flv_0502 (F3 aim)', aim: true },
  { idx: 1, base: 0x58, leader: 'db_0473', clones: 'p_flv_0499 (dive)',   aim: false },
  { idx: 2, base: 0x60, leader: 'db_04AB', clones: 'p_flv_04c6 / 04cf',   aim: false },
];

const cv = document.getElementById('pf');
cv.width = PF_W * SCALE; cv.height = PF_H * SCALE;
const ctx = cv.getContext('2d');

// ── scenario state ──────────────────────────────────────────────────────────────
let color = 1, row = 4, col = 5, playerX = 112;       // Zane observed color 1 (base 0x58) in play
let actors = [];                                      // [{ e, trail, role, hue }] — actors[0] = leader
let spawns = [];                                      // {x,y} marker per F2 clone split-off
let frame = 0, done = false, ended = 'flying';
let playing = true, speed = 1, raf = 0, acc = 0, last = 0;
const TICK_MS = 1000 / 60, SPEEDS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];

const leader   = () => actors[0]?.e ?? null;
const aiming   = () => COLORS[color].aim;             // player-X matters (color-0 clones F3)

// Reset the singletons and launch one bonus-bee leader; clones self-spawn via 0xF2.
function loadScenario() {
  state.formation.oscillateX = 0;                     // formation at REST → deterministic
  if (Array.isArray(state.formation.pulseOffsets)) state.formation.pulseOffsets.fill(0);
  state.stage = 4;                                    // bonus-bee is a stage-4+ feature
  state.player.x = playerX;
  state.contBmbFlag = false;                          // convoy leaders home regardless (FA both-branch out-of-region)
  state.newStageParms = loadStageParms(4);
  state.bombDropFlags = 0;                            // no bombs rendered
  state.frameCount = 0;
  for (const e of state.enemies) { e.state = 'pending'; e.pathBase = null; e.bbeeClone = false; e.transient = false; }

  const leaderId = getObjectIdForSlot(row, col);
  const path = getConvoyPath(color);                  // { bytes: CONVOY_REGION, entryOffset }
  const e = state.enemies.find((en) => en.objectId === leaderId);
  actors = []; spawns = [];
  if (e) {
    e.state = 'formation';
    launchEnemyAttack(state, leaderId, path.bytes, undefined, path.entryOffset);
    e.bbeeColorIndex = color;                          // clones copy this (identical 0x5x repaint)
    actors.push({ e, trail: [{ x: e.x, y: e.y, tp: false }], role: 'leader', hue: LEADER_HUE });
  }

  frame = 0; done = false; ended = 'flying'; acc = 0;
  buildGrid(); syncControls(); buildInfo(); render(); updateReadout();
}

// advance the real interpreter by one 60 Hz tick
function stepOne() {
  if (done || !actors.length) return;
  state.frameCount += 1;
  stepBugs(state);

  // Detect clones the leader just split off (0xF2 → a corner slot goes 'flying').
  for (const id of CLONE_SLOTS) {
    if (actors.some((a) => a.e.objectId === id)) continue;
    const c = state.enemies.find((en) => en.objectId === id);
    if (c && c.state === 'flying') {
      const hue = CLONE_HUES[Math.min(actors.length - 1, CLONE_HUES.length - 1)];
      actors.push({ e: c, trail: [{ x: c.x, y: c.y, tp: false }], role: 'clone', hue });
      spawns.push({ x: c.x, y: c.y });                 // the split-off point (= leader's pos then)
    }
  }

  // Accumulate every actor's trail.
  for (const a of actors) {
    const prev = a.trail[a.trail.length - 1];
    const tp = (prev.y - a.e.y > 80) || (Math.abs(a.e.x - prev.x) > 60);
    a.trail.push({ x: a.e.x, y: a.e.y, tp });
  }

  frame += 1;
  // Done when the leader has homed AND no clone is still in flight.
  const live = actors.some((a) => a.e.state === 'flying' || a.e.state === 'homing');
  if (!live) {
    done = true;
    ended = leader().state === 'formation' ? 'homing' : 'gone';
  } else if (frame > MAX_FRAMES) {
    done = true; ended = 'timeout';
  }
}

// ── rendering ─────────────────────────────────────────────────────────────────
const colX = (c) => _COL_X[c];
const _COL_X = [40, 56, 72, 88, 104, 120, 136, 152, 168, 184];

function render() {
  ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, cv.width, cv.height);

  // formation rows (faint); light the wasp rows (leader source).
  ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    const gy = (28 + r * 16) * SCALE;
    ctx.strokeStyle = LEADER_ROWS.includes(r) ? 'rgba(180,200,150,0.35)' : 'rgba(120,120,120,0.16)';
    ctx.beginPath(); ctx.moveTo(40 * SCALE, gy); ctx.lineTo(184 * SCALE, gy); ctx.stroke();
  }
  // mark the leader's slot + the four clone corner slots.
  markSlot(row, col, '#cdd8b4', 0.95);
  for (const id of CLONE_SLOTS) {
    const s = slotOfId(id); if (s) markSlot(s.r, s.c, '#6f7680', 0.4);
  }
  ctx.strokeStyle = '#444'; ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);

  // color-0 clones aim at the ship — draw it.
  if (aiming()) drawShip(playerX, PLAYER_Y);

  drawTrails();

  // F2 split-off markers
  for (const s of spawns) {
    const sx = s.x * SCALE, sy = s.y * SCALE;
    ctx.strokeStyle = 'rgba(246,204,95,0.85)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 2 * Math.PI); ctx.stroke();
  }

  for (const a of actors) drawHead(a.e, a.role === 'leader', a.hue);
}

function drawTrails() {
  ctx.lineJoin = ctx.lineCap = 'round';
  // clones first (so the leader reads on top)
  for (const a of actors) {
    if (a.role === 'leader') continue;
    strokeTrail(a.trail, a.hue, 1.6, 0.85);
  }
  strokeTrail(actors[0].trail, actors[0].hue, 2.2, done ? 0.95 : 1);
}

function strokeTrail(tr, hue, w, alpha) {
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (b.tp) continue;
    ctx.globalAlpha = alpha; ctx.strokeStyle = hue; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x * SCALE, a.y * SCALE); ctx.lineTo(b.x * SCALE, b.y * SCALE); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawHead(e, isLeader, hue) {
  if (e.state !== 'flying' && e.state !== 'homing') return;   // hide despawned clones' heads
  const ang = e.angle * (2 * Math.PI / 1024);
  ctx.save(); ctx.translate(e.x * SCALE, e.y * SCALE); ctx.rotate(-ang);
  const s = isLeader ? 7 : 5.5;
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s + 2, -4.2); ctx.lineTo(-s + 2, 4.2); ctx.closePath();
  const c = isLeader ? LEADER_HEAD : hue;
  ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 1.3; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function markSlot(r, c, colr, alpha) {
  ctx.fillStyle = colr; ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.arc(colX(c) * SCALE, (28 + r * 16) * SCALE, 2.6, 0, 2 * Math.PI); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawShip(x, y) {
  ctx.save(); ctx.translate(x * SCALE, y * SCALE);
  ctx.fillStyle = '#68d391'; ctx.strokeStyle = '#68d391'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-5, 5); ctx.lineTo(5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ── driver loop ─────────────────────────────────────────────────────────────────
function tick(now) {
  raf = 0;
  if (last === 0) last = now;
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  if (playing && !done) {
    acc += dt * speed;
    let stepped = false;
    while (acc >= TICK_MS && !done) { stepOne(); acc -= TICK_MS; stepped = true; }
    if (stepped) { render(); updateReadout(); buildInfo(); }
  } else { acc = 0; }
  loop();
}
function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }

// ── panel ─────────────────────────────────────────────────────────────────────
function badge() {
  if (!done) return ['flying', 'flying'];
  const clones = actors.length - 1;
  if (ended === 'homing') return ['homing', `▣ leader homed · ${clones} clone${clones === 1 ? '' : 's'} split off + despawned`];
  if (ended === 'timeout') return ['loop', '↻ still flying at frame cap'];
  return ['gone', '✕ leader left screen'];
}
function buildInfo() {
  const C = COLORS[color];
  const leaderId = getObjectIdForSlot(row, col);
  const negate = (leaderId & 0x02) !== 0;
  document.getElementById('info').innerHTML =
    `<span class="k">color</span><span class="v">${color} · sprite base 0x${C.base.toString(16).toUpperCase()}</span>` +
    `<span class="k">leader</span><span class="v">${C.leader} · row ${row} col ${col} · id 0x${leaderId.toString(16).toUpperCase()}</span>` +
    `<span class="k">clones</span><span class="v">${C.clones}</span>` +
    `<span class="k">side</span><span class="v">${negate ? 'righty (negate)' : 'lefty (no negate)'}</span>` +
    (aiming() ? `<span class="k">player X</span><span class="v">${playerX}</span>` : '') +
    `<span class="k">in flight</span><span class="v">${actors.length} (leader + ${actors.length - 1})</span>`;
  const [cls, txt] = badge();
  const b = document.getElementById('badge'); b.className = 'badge ' + cls; b.textContent = txt;
  document.getElementById('gate-note').textContent =
    `Color ${color}: the leader flies ${C.leader}; each 0xF2 SPAWN copies it into a free 0x38–0x3E corner slot at the leader's` +
    ` current position and starts it on ${C.clones}. ` +
    (aiming() ? 'These clones read the player X (F3) and bend toward the ship.'
              : 'These clones dive on a fixed arc (no F3), then despawn on FF.') +
    ' The leader homes back to its wasp slot (FD → out-of-region → TURN_HOME).';
}
function updateReadout() {
  const l = leader();
  document.getElementById('readout').textContent = !l ? '—' : done
    ? `done · ${frame}f · ${actors.length - 1} clones · ${ended}`
    : `f${frame} · leader ${l.state} · in flight ${actors.length} · (${l.x.toFixed(0)},${l.y.toFixed(0)})`;
}

// ── leader slot grid (wasp rows) ───────────────────────────────────────────────
function buildGrid() {
  const g = document.getElementById('grid'); g.innerHTML = '';
  for (const r of LEADER_ROWS) {
    for (let c = 0; c < 10; c++) {
      const id = getObjectIdForSlot(r, c);
      const negate = (id & 0x02) !== 0;
      const cell = document.createElement('div');
      cell.className = 'cell ' + (negate ? 'right' : 'left') + (r === row && c === col ? ' sel' : '');
      cell.textContent = c;
      cell.title = `row ${r} col ${c} · id 0x${id.toString(16).toUpperCase()}`;
      cell.onclick = () => { row = r; col = c; relaunch(); };
      g.appendChild(cell);
    }
  }
}

function syncControls() {
  document.getElementById('playerCtl').classList.toggle('off', !aiming());
  document.querySelectorAll('#color label').forEach((l) => l.classList.toggle('on', +l.dataset.color === color));
}

// helper: formation (row,col) of a clone-corner objectId, for the faint markers
function slotOfId(id) {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++)
    if (getObjectIdForSlot(r, c) === id) return { r, c };
  return null;
}

// ── controls ──────────────────────────────────────────────────────────────────
const playBtn = document.getElementById('play');
function relaunch() { loadScenario(); playing = true; playBtn.textContent = '⏸ Pause'; last = 0; loop(); }
playBtn.onclick = () => { playing = !playing; if (playing && done) return; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; if (playing) { last = 0; loop(); } };
document.getElementById('restart').onclick = relaunch;
document.getElementById('speed').oninput = (e) => { speed = SPEEDS[+e.target.value]; document.getElementById('speedval').textContent = speed + '×'; };
document.getElementById('player').oninput = (e) => { playerX = +e.target.value; document.getElementById('playerval').textContent = playerX; };
document.getElementById('player').onchange = relaunch;
document.querySelectorAll('#color input').forEach((inp) => {
  inp.onchange = () => { color = +inp.value; relaunch(); };
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; loop(); } });

loadScenario();
loop();

// dev hook — drive from console.
window.CP = {
  get actors() { return actors; }, get leader() { return leader(); }, get spawns() { return spawns; },
  set(cfg) { if (cfg.color !== undefined) color = cfg.color;
             if (cfg.row !== undefined) row = cfg.row; if (cfg.col !== undefined) col = cfg.col;
             if (cfg.playerX !== undefined) playerX = cfg.playerX;
             loadScenario(); },
  run(n) { playing = false; for (let i = 0; i < n && !done; i++) stepOne(); render(); updateReadout(); buildInfo();
           const l = leader();
           return { frame, leaderState: l?.state, clones: actors.length - 1, spawns: spawns.length,
                    ended: done ? ended : null, pos: l ? [+l.x.toFixed(0), +l.y.toFixed(0)] : null }; },
};
