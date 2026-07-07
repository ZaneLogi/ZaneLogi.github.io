// demos/flyin_player.js — COMBAT FLY-IN path player.
//
// Plays the six token-bearing fly-in leaders (PATH_INDEX 0-5) the normal-play caravan
// launches. Pick a path + a 3-way MODE (Formation / Stage 8+ / Transient); the page resolves
// the path's two pair members via paths.js getFlyInPath and flies each through PathRunner's
// opt-in token layer ({ tokens:true, mode, subPaths }). FB is a stop → "homing" badge; F0/F7
// follow their sub-path jumps; FE (transient) turns toward a fixed stand-in player.

import { getFlyInPath, FLYIN_COUNT } from '../paths.js';
import { PathRunner } from '../pathrunner.js';

const PALETTE = ['#7cb6ff', '#68d391', '#f6ad55', '#fc8181', '#c792ea', '#4dd0e1', '#f7cc5f', '#f78fb2'];
const LEFTY_HUE = '#7cb6ff', RIGHTY_HUE = '#f6ad55';
const s8  = (b) => (b > 127 ? b - 256 : b);
const hex = (arr) => Array.from(arr, (x) => x.toString(16).padStart(2, '0')).join(' ');
const h4  = (x) => '0x' + x.toString(16).padStart(4, '0').toUpperCase();
const PLAYER_X = 112, PLAYER_Y = 250;                 // fixed stand-in player (FE reference)

// short on-screen-position descriptor from resolved canvas coords
function describePos(cx, cy) {
  const vert  = cy < 100 ? 'top' : cy > 180 ? 'bottom' : 'mid';
  const horiz = cx < 75 ? 'left' : cx > 149 ? 'right' : 'center';
  return `${vert}-${horiz}`;
}

// ── execution walk: the rows that ACTUALLY play in this mode, in order ──────────
// Follows the mode's branch (skip/jump the F7/F0 gates), assigning each segment a running
// ordinal so the panel colour matches the trail's segIdx. Stops at FB (homing) or FF.
function execRows(fly, mode) {
  const rows = [];
  let bytes = fly.bytes, i = 0, seg = -1, main = true, guard = 0;
  while (i < bytes.length && guard++ < 300) {
    const b0 = bytes[i], off = i, arr = main ? 'main' : 'sub';
    if (b0 >= 0xEF) {
      if (b0 === 0xFF) { rows.push({ tok: 'FF', off, arr, label: 'despawn — transient leaves', bytes: [0xFF] }); break; }
      if (b0 === 0xFB) { rows.push({ tok: 'FB', off, arr, label: 'turn-home → STOP (homing)', bytes: [0xFB] }); break; }
      if (b0 === 0xF7 || b0 === 0xF0) {
        const target = (bytes[i + 2] << 8) | bytes[i + 1];
        const take = (b0 === 0xF7 && mode === 'transient') || (b0 === 0xF0 && mode === 'stage8');
        const name = b0 === 0xF7 ? 'F7' : 'F0';
        if (take) {
          rows.push({ tok: name, off, arr, label: `jump → ${h4(target)}`, take: true, bytes: [b0, bytes[i + 1], bytes[i + 2]] });
          rows.push({ subLabel: `${h4(target)} — ${name === 'F7' ? 'F7 transient swoop' : 'F0 stage-8+ attack wave'}` });
          bytes = fly.subPaths[target]; i = 0; main = false; continue;
        }
        const why = b0 === 0xF7 ? 'not transient' : 'stages 1-7';
        rows.push({ tok: name, off, arr, label: `skipped (${why})`, skip: true, bytes: [b0, bytes[i + 1], bytes[i + 2]] });
        i += 3; continue;
      }
      if (b0 === 0xFE) { rows.push({ tok: 'FE', off, arr, label: 'player-region hold', bytes: Array.from(bytes.slice(i, i + 9)) }); i += 9; continue; }
      rows.push({ tok: '??', off, arr, bytes: [b0] }); i += 1; continue;
    }
    seg += 1;
    rows.push({ seg, off, arr, b0, b1: bytes[i + 1], b2: bytes[i + 2], vy: (b0 >> 4) & 0xf, vx: b0 & 0xf, rot: s8(bytes[i + 1]), dur: bytes[i + 2] });
    i += 3;
  }
  return rows;
}

// ── rendering ─────────────────────────────────────────────────────────────────
const PF_W = 224, PF_H = 288, SCALE = 2;
const cv  = document.getElementById('pf');
cv.width = PF_W * SCALE; cv.height = PF_H * SCALE;
const ctx = cv.getContext('2d');

function drawTrail(runner, dashed) {
  const t = runner.trail;
  ctx.lineWidth = dashed ? 1.6 : 2.4;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.globalAlpha = dashed ? 0.7 : 1;
  let i = 0;
  while (i < t.length - 1) {
    const seg = Math.max(0, t[i + 1].seg);
    ctx.strokeStyle = PALETTE[seg % PALETTE.length];
    ctx.beginPath();
    ctx.moveTo(t[i].x * SCALE, t[i].y * SCALE);
    let j = i;
    while (j < t.length - 1 && t[j + 1].seg === t[i + 1].seg) { ctx.lineTo(t[j + 1].x * SCALE, t[j + 1].y * SCALE); j++; }
    ctx.stroke();
    i = j;
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

function drawHead(runner, filled) {
  const { x, y, angle } = runner;
  const ang = angle * (2 * Math.PI / 1024);
  ctx.save();
  ctx.translate(x * SCALE, y * SCALE);
  ctx.rotate(-ang);
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath();
  ctx.fillStyle = filled ? '#eaeaea' : 'transparent';
  ctx.strokeStyle = '#eaeaea'; ctx.lineWidth = 1.4;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const x = PLAYER_X * SCALE, y = PLAYER_Y * SCALE;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#68d391'; ctx.fillStyle = 'rgba(104,211,145,0.15)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - 6, y + 5); ctx.lineTo(x + 6, y + 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#68d391'; ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'center';
  ctx.fillText('player · FE ref', x, y + 16);
  ctx.restore();
}

function render() {
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(120,120,120,0.28)'; ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    const gy = (28 + r * 16) * SCALE;
    ctx.beginPath(); ctx.moveTo(40 * SCALE, gy); ctx.lineTo(184 * SCALE, gy); ctx.stroke();
  }
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
  if (mode === 'transient') drawPlayer();
  if (showPair) drawTrail(mR, true);
  drawTrail(mL, false);
  if (showPair) drawHead(mR, false);
  drawHead(mL, true);
}

// ── driver ──────────────────────────────────────────────────────────────────────
const TICK_MS = 1000 / 60;
const SPEEDS  = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
let mL, mR, flyL, flyR, rows = [], playing = true, showPair = true, speed = 1, raf = 0, acc = 0, last = 0;
let pathIdx = 0, mode = 'formation';

function loadPath() {
  flyL = getFlyInPath(pathIdx, 0);
  flyR = getFlyInPath(pathIdx, 1);
  const opts = { tokens: true, mode, playerX: PLAYER_X };
  mL = new PathRunner(flyL.bytes, flyL.start, flyL.negate, { ...opts, subPaths: flyL.subPaths });
  mR = new PathRunner(flyR.bytes, flyR.start, flyR.negate, { ...opts, subPaths: flyR.subPaths });
  rows = execRows(flyL, mode);
  acc = 0;
  buildMemberCards(); buildCodeBox(); buildModeNote();
  updateReadout(); highlight(); render();
}

function tick(now) {
  raf = 0;
  if (last === 0) last = now;
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  if (playing) {
    acc += dt * speed;
    let stepped = false;
    while (acc >= TICK_MS) { mL.step(); if (showPair) mR.step(); acc -= TICK_MS; stepped = true; }
    if (stepped) { render(); updateReadout(); highlight(); buildMemberCards(); }
  } else { acc = 0; }
  loop();
}
function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }

// ── member decode cards ─────────────────────────────────────────────────────────
const endBadge = (r) => {
  if (!r.done) return '<span class="badge flying">flying</span>';
  if (r.ended === 'homing') return '<span class="badge homing">▣ homing → formation slot</span>';
  return '<span class="badge despawned">✕ despawned (left screen)</span>';
};
function memberCard(fly, runner, who, hue, active) {
  const dash = who === 'righty' ? 'dashed' : 'solid';
  return `<div class="member ${who} ${active ? '' : 'off'}">
    <div class="who"><span>member ${fly.member}</span>
      <span class="swatch" style="border-top-color:${hue}; border-top-style:${dash}"></span></div>
    <div class="kv">
      <span class="k">path</span><span class="v">${h4(fly.pathAddr)} · idx ${fly.pathIndex}</span>
      <span class="k">variant</span><span class="v">${fly.variant}</span>
      <span class="k">start</span><span class="v">${describePos(fly.canvasX, fly.canvasY)} (${fly.canvasX},${fly.canvasY})</span>
      <span class="k">mirror</span><span class="v">${fly.negate ? 'yes (rot negated)' : 'no'}</span>
    </div>${endBadge(runner)}</div>`;
}
function buildMemberCards() {
  document.getElementById('members').innerHTML =
    memberCard(flyL, mL, 'lefty', LEFTY_HUE, true) +
    memberCard(flyR, mR, 'righty', RIGHTY_HUE, showPair);
}

// ── bytecode panel (execution order for this mode) ────────────────────────────────
function buildCodeBox() {
  const html = rows.map((r) => {
    if (r.subLabel) return `<div class="sub-label">${r.subLabel}</div>`;
    if (r.seg !== undefined) {
      return `<div class="row" data-arr="${r.arr}" data-off="${r.off}">
        <span class="chip" style="background:${PALETTE[r.seg % PALETTE.length]}"></span>
        <span class="mono bytes">${hex([r.b0, r.b1, r.b2])}</span>
        <span class="decode">vx ${r.vx} · vy ${r.vy} · rot ${r.rot >= 0 ? '+' : ''}${r.rot} · ${r.dur}f</span></div>`;
    }
    const cls = 'row tok' + (r.skip ? ' skip' : '');
    return `<div class="${cls}" data-arr="${r.arr}" data-off="${r.off}">
      <span class="chip"></span>
      <span class="mono bytes">${hex(r.bytes)}</span>
      <span class="decode">${r.tok} · ${r.label || ''}</span></div>`;
  }).join('');
  document.getElementById('codeboxes').innerHTML = `<div class="codebox"><div class="rows">${html}</div></div>`;
  document.getElementById('code-h').textContent = `Path bytecode — ${h4(flyL.pathAddr)}, ${mode} mode`;
}
function highlight() {
  const isMain = mL.bytes === flyL.bytes;
  const wantArr = isMain ? 'main' : 'sub';
  document.querySelectorAll('#codeboxes .row').forEach((el) => {
    const on = !mL.done && el.dataset.arr === wantArr && +el.dataset.off === mL.loadedAt;
    el.classList.toggle('active', on);
  });
}

const MODE_NOTES = {
  formation: 'Formation — F7 and F0 both skip (gates off); the leader flies its arc and FB turn-homes into formation.',
  stage8:    'Stage 8+ — newStageParms[8]≠0 gates F0 ON: the leader jumps to its attack-wave sub-path (a dive), then FB homes.',
  transient: 'Transient — (objId&0x38)==0x38 gates F7 ON: the leader jumps to its swoop sub-path — FE holds a turn toward the player region — then FF despawns. F0 is never reached (F7 preempts it).',
};
function buildModeNote() { document.getElementById('mode-note').textContent = MODE_NOTES[mode]; }

function updateReadout() {
  const segCount = rows.filter((r) => r.seg !== undefined).length;
  const fmt = (r) => r.done ? `done (${r.ended}) · ${r.frame}f` : `f${r.frame} seg ${r.segIdx + 1}/${segCount} · (${r.x.toFixed(0)},${r.y.toFixed(0)})`;
  const parts = [`m0 ${fmt(mL)}`];
  if (showPair) parts.push(`m1 ${fmt(mR)}`);
  document.getElementById('readout').textContent = parts.join('   ·   ');
}

// ── controls ──────────────────────────────────────────────────────────────────────
const pathSel = document.getElementById('path');
for (let i = 0; i < FLYIN_COUNT; i++) {
  const f = getFlyInPath(i, 0);
  const o = document.createElement('option');
  o.value = String(i); o.textContent = `idx ${i} — ${h4(f.pathAddr)}`;
  pathSel.appendChild(o);
}

const playBtn = document.getElementById('play');
playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; };
document.getElementById('restart').onclick = () => { loadPath(); playing = true; playBtn.textContent = '⏸ Pause'; };
pathSel.onchange = (e) => { pathIdx = +e.target.value; loadPath(); };
document.querySelectorAll('#modes input').forEach((inp) => {
  inp.onchange = () => {
    mode = inp.value;
    document.querySelectorAll('#modes label').forEach((l) => l.classList.toggle('on', l.dataset.mode === mode));
    loadPath();
  };
});
document.getElementById('speed').oninput = (e) => { speed = SPEEDS[+e.target.value]; document.getElementById('speedval').textContent = speed + '×'; };
document.getElementById('pair').onchange  = (e) => { showPair = e.target.checked; buildMemberCards(); render(); updateReadout(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; loop(); } });

loadPath();
loop();

// dev hook — drive the demo from the console.
window.FP = {
  get mL() { return mL; }, get mR() { return mR; }, get rows() { return rows; },
  select(idx, m) { pathIdx = idx % FLYIN_COUNT; if (m) { mode = m;
      document.querySelectorAll('#modes label').forEach((l) => l.classList.toggle('on', l.dataset.mode === mode));
      document.querySelector(`#modes input[value="${m}"]`).checked = true; }
    pathSel.value = String(pathIdx); loadPath(); },
  seek(n) { loadPath(); playing = false; playBtn.textContent = '▶ Play';
    for (let i = 0; i < n; i++) { mL.step(); mR.step(); }
    render(); updateReadout(); highlight(); buildMemberCards(); return mL.frame; },
};
