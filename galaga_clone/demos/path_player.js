// demos/path_player.js — the DEMO PAGE. Wires the three engines together and renders:
//   builder (../pathbuilder.js) → assembler (../pathasm.js) → interpreter (../pathrunner.js)
// The assembled path is round-tripped against the ROM extraction (../paths.js
// PATH_BY_ADDR) for the "byte-identical to ROM" badge. This file owns only presentation:
// the canvas render, the bytecode panel, the controls, and the fixed-timestep loop.
// It is the animated counterpart to SVG/path_01E8.svg. (research_path_data.md §4.)

import { PATH_01E8, SEGMENTS_01E8, STARTS_01E8 } from '../pathasm.js';
import { PathRunner } from '../pathrunner.js';
import { PATH_BY_ADDR } from '../paths.js';

const PATH = PATH_01E8;
// per-segment trail colours (presentation only; segment roles/labels come from pathasm)
const COLORS = ['#7cb6ff', '#68d391', '#f6ad55', '#fc8181'];
const SEGMENTS = SEGMENTS_01E8.map((s, i) => ({ ...s, color: COLORS[i] }));

// ── round-trip: does the assembled path byte-match the ROM extraction? ────────
function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const FAITHFUL = bytesEqual(PATH, PATH_BY_ADDR[0x01E8]);
const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join(' ');

// ── rendering ─────────────────────────────────────────────────────────────────
const PF_W = 224, PF_H = 288, SCALE = 2;
const cv = document.getElementById('pf');
cv.width = PF_W * SCALE; cv.height = PF_H * SCALE;
const ctx = cv.getContext('2d');

function drawTrail(runner, dashed) {
  // one stroke per segment index so each leg keeps its colour (like the SVG).
  const t = runner.trail;
  ctx.lineWidth = dashed ? 1.6 : 2.4;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.lineJoin = ctx.lineCap = 'round';
  let i = 0;
  while (i < t.length - 1) {
    const seg = t[i + 1].seg;
    ctx.strokeStyle = SEGMENTS[Math.min(seg, 3)].color;
    ctx.beginPath();
    ctx.moveTo(t[i].x * SCALE, t[i].y * SCALE);
    let j = i;
    while (j < t.length - 1 && t[j + 1].seg === seg) { ctx.lineTo(t[j + 1].x * SCALE, t[j + 1].y * SCALE); j++; }
    ctx.stroke();
    i = j;
  }
  ctx.setLineDash([]);
}

function drawHead(runner, filled) {
  const { x, y, angle } = runner;
  const ang = angle * (2 * Math.PI / 1024);
  ctx.save();
  ctx.translate(x * SCALE, y * SCALE);
  ctx.rotate(-ang);                                // face heading (canvas-Y inverted)
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath();
  ctx.fillStyle = filled ? '#eaeaea' : 'transparent';
  ctx.strokeStyle = '#eaeaea'; ctx.lineWidth = 1.4;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // formation-row grid hint (rows where bugs land), matching the SVG
  ctx.strokeStyle = 'rgba(120,120,120,0.28)'; ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    const gy = (28 + r * 16) * SCALE;
    ctx.beginPath(); ctx.moveTo(40 * SCALE, gy); ctx.lineTo(184 * SCALE, gy); ctx.stroke();
  }
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
  if (showPair) drawTrail(m1, true);               // member 1 dashed, under member 0
  drawTrail(m0, false);
  if (showPair) drawHead(m1, false);
  drawHead(m0, true);
}

// ── driver: fixed-timestep loop + controls ───────────────────────────────────
// One path-frame = 1/60 s of *simulated* time, decoupled from the display refresh
// (same accumulator main.js uses): we bank real elapsed wall-clock time and consume
// it in fixed TICK_MS chunks, so 1× is exactly 60 path-frames/sec on a 60/120/144 Hz
// screen alike. `speed` scales how fast wall-clock time is banked — 0.5× = 30/sec,
// 8× = 480/sec — while each step stays a whole, deterministic 60 Hz frame.
const TICK_MS = 1000 / 60;
const SPEEDS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
let m0, m1, playing = true, showPair = true, speed = 1, raf = 0, acc = 0, last = 0;

function reset() {
  m0 = new PathRunner(PATH, STARTS_01E8.member0, false);
  m1 = new PathRunner(PATH, STARTS_01E8.member1, true);   // member 1 steps in lockstep (both start at frame 0)
  acc = 0;
  updateReadout(); highlightSeg(); render();
}

function tick(now) {
  raf = 0;
  if (last === 0) last = now;
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250;                     // clamp long gaps (first frame / tab-away)
  if (playing) {
    acc += dt * speed;                         // bank real time, scaled by speed
    let stepped = false;
    while (acc >= TICK_MS) { m0.step(); if (showPair) m1.step(); acc -= TICK_MS; stepped = true; }
    if (stepped) { render(); updateReadout(); highlightSeg(); }
  } else {
    acc = 0;                                   // don't bank time while paused
  }
  loop();
}
function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }

// ── bytecode panel + readout (the live version of the SVG's section 1) ────────
const rowsEl = document.getElementById('rows');
SEGMENTS.forEach((s, i) => {
  const b0 = ((s.vy & 0x0F) << 4) | (s.vx & 0x0F);
  const row = document.createElement('div');
  row.className = 'row'; row.dataset.seg = i;
  row.innerHTML =
    `<span class="chip" style="background:${s.color}"></span>` +
    `<span class="mono bytes">${hex([b0, s.rot & 0xFF, s.dur & 0xFF])}</span>` +
    `<span class="decode">vx ${s.vx} · vy ${s.vy} · rot ${s.rot >= 0 ? '+' : ''}${s.rot} · ${s.dur}f</span>` +
    `<span class="tag">${s.label}</span>`;
  rowsEl.appendChild(row);
});
const endRow = document.createElement('div');
endRow.className = 'row end';
endRow.innerHTML = `<span class="chip"></span><span class="mono bytes">FF</span><span class="decode">END</span>`;
rowsEl.appendChild(endRow);

const badge = document.getElementById('badge');
badge.textContent = FAITHFUL ? '✓ byte-identical to ROM' : '✗ MISMATCH vs ROM';
badge.className = 'badge ' + (FAITHFUL ? 'ok' : 'bad');
document.getElementById('bytes-line').textContent = hex(PATH);

function highlightSeg() {
  const active = m0.done ? -1 : m0.segIdx;
  rowsEl.querySelectorAll('.row').forEach((r) => r.classList.toggle('active', +r.dataset.seg === active));
}
function updateReadout() {
  const deg = (m0.angle * 360 / 1024).toFixed(0);
  document.getElementById('readout').textContent =
    m0.done
      ? `done · ${m0.frame} frames`
      : `frame ${m0.frame} · seg ${m0.segIdx + 1}/4 · vx ${m0.vx} vy ${m0.vy} rot ${m0.rot >= 0 ? '+' : ''}${m0.rot} · angle ${deg}° · (${m0.x.toFixed(0)},${m0.y.toFixed(0)})`;
}

// ── controls ──────────────────────────────────────────────────────────────────
const playBtn = document.getElementById('play');
playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; };
document.getElementById('restart').onclick = () => { reset(); playing = true; playBtn.textContent = '⏸ Pause'; };
document.getElementById('speed').oninput = (e) => { speed = SPEEDS[+e.target.value]; document.getElementById('speedval').textContent = speed + '×'; };
document.getElementById('pair').onchange = (e) => { showPair = e.target.checked; render(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; loop(); } });

reset();      // draws the initial frame synchronously (visible even if the tab starts hidden)
loop();

// dev hook (mirrors lunar_lander's window.LL) — drive the demo from console/eval.
window.PP = {
  get m0() { return m0; }, get m1() { return m1; }, reset, render,
  seek(n) { reset(); playing = false; playBtn.textContent = '▶ Play';
            for (let i = 0; i < n; i++) { m0.step(); m1.step(); }
            render(); updateReadout(); highlightSeg(); return m0.frame; },
};
