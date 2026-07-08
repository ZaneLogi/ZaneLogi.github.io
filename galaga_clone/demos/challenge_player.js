// demos/challenge_player.js — BONUS-STAGE path player.
//
// Plays the bonus/challenge-stage fly-through paths, one wave at a time. Pick a bonus
// stage (round 1-8) + a wave (1-5); the page resolves that wave's two members — LEFTY
// and RIGHTY — through the real launcher join (paths.js getChallengeWave →
// PATH_INDEX/VARIANTS) and flies each through the motion interpreter (pathrunner.js).
// Every bonus-stage path is token-free (segments + END), so PathRunner runs it directly.

import { getChallengeWave, CHALLENGE_ROUND_STAGES } from '../paths.js';
import { PathRunner } from '../pathrunner.js';

// segment-trail palette (cycles by segment index — bonus paths vary in segment count)
const PALETTE = ['#7cb6ff', '#68d391', '#f6ad55', '#fc8181', '#c792ea', '#4dd0e1', '#f7cc5f', '#f78fb2'];
const LEFTY_HUE = '#7cb6ff', RIGHTY_HUE = '#f6ad55';
const s8  = (b) => (b > 127 ? b - 256 : b);
const hex = (arr) => Array.from(arr, (x) => x.toString(16).padStart(2, '0')).join(' ');
const h2  = (x) => '0x' + x.toString(16).padStart(2, '0').toUpperCase();
const h4  = (x) => '0x' + x.toString(16).padStart(4, '0').toUpperCase();

// decode a token-free path block into its 3-byte steering segments (stops at END 0xFF)
function decodeSegments(bytes) {
  const segs = [];
  let i = 0;
  while (i < bytes.length && bytes[i] !== 0xFF) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    segs.push({ b0, b1, b2, vy: (b0 >> 4) & 0x0F, vx: b0 & 0x0F, rot: s8(b1), dur: b2 });
    i += 3;
  }
  return segs;
}

// short on-screen-position descriptor, from resolved canvas coords
function describePos(cx, cy) {
  const vert  = cy < 100 ? 'top' : cy > 180 ? 'bottom' : 'mid';
  const horiz = cx < 75 ? 'left' : cx > 149 ? 'right' : 'center';
  return `${vert}-${horiz}`;
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
  ctx.rotate(-ang);                                  // face heading (canvas-Y inverted)
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
  ctx.strokeStyle = 'rgba(120,120,120,0.28)'; ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    const gy = (28 + r * 16) * SCALE;
    ctx.beginPath(); ctx.moveTo(40 * SCALE, gy); ctx.lineTo(184 * SCALE, gy); ctx.stroke();
  }
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
  if (showRighty) drawTrail(mR, true);               // righty dashed, under lefty
  drawTrail(mL, false);
  if (showRighty) drawHead(mR, false);
  drawHead(mL, true);
}

// ── driver: fixed-timestep loop — bank real elapsed time, consume it in 60 Hz frames ──
const TICK_MS = 1000 / 60;
const SPEEDS  = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
let mL, mR, wave = null, playing = true, showRighty = true, speed = 1, raf = 0, acc = 0, last = 0;
let round = 0, waveIdx = 0;

function loadWave() {
  wave = getChallengeWave(round, waveIdx);
  mL = new PathRunner(wave.lefty.bytes,  wave.lefty.start,  wave.lefty.negateRotation);
  mR = new PathRunner(wave.righty.bytes, wave.righty.start, wave.righty.negateRotation);
  acc = 0;
  buildMemberCards(); buildCodeBoxes(); buildWaveTable();
  updateReadout(); highlightSegs(); render();
}

function tick(now) {
  raf = 0;
  if (last === 0) last = now;
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  if (playing) {
    acc += dt * speed;
    let stepped = false;
    while (acc >= TICK_MS) { mL.step(); if (showRighty) mR.step(); acc -= TICK_MS; stepped = true; }
    if (stepped) { render(); updateReadout(); highlightSegs(); }
  } else {
    acc = 0;
  }
  loop();
}
function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }

// ── panel: the two members' decode cards ────────────────────────────────────────
function memberCard(m, who, hue, active) {
  const dashStyle = who === 'righty' ? 'dashed' : 'solid';
  return `<div class="member ${who} ${active ? '' : 'off'}">
    <div class="who"><span>${who}</span>
      <span class="swatch" style="border-top-color:${hue}; border-top-style:${dashStyle}"></span></div>
    <div class="kv">
      <span class="k">wave-byte</span><span class="v">${h2(m.waveByte)}</span>
      <span class="k">path</span><span class="v">${h4(m.pathAddr)} · idx ${m.pathIndex}</span>
      <span class="k">variant</span><span class="v">${m.variant} · member ${m.member}</span>
      <span class="k">start</span><span class="v">${describePos(m.canvasX, m.canvasY)} (${m.canvasX},${m.canvasY})</span>
      <span class="k">mirror</span><span class="v">${m.negateRotation ? 'yes (rot negated)' : 'no'}</span>
      <span class="k">gate</span><span class="v">${m.launchGated ? 'frame&7==0' : 'immediate'}</span>
    </div></div>`;
}
function buildMemberCards() {
  document.getElementById('members').innerHTML =
    memberCard(wave.lefty, 'lefty', LEFTY_HUE, true) +
    memberCard(wave.righty, 'righty', RIGHTY_HUE, showRighty);
}

// ── panel: bytecode listings (one per distinct member path) ─────────────────────
function codeBox(m, title) {
  const segs = decodeSegments(m.bytes);
  const rows = segs.map((s, i) =>
    `<div class="row" data-seg="${i}">
       <span class="chip" style="background:${PALETTE[i % PALETTE.length]}"></span>
       <span class="mono bytes">${hex([s.b0, s.b1, s.b2])}</span>
       <span class="decode">vx ${s.vx} · vy ${s.vy} · rot ${s.rot >= 0 ? '+' : ''}${s.rot} · ${s.dur}f</span>
     </div>`).join('');
  return `<div class="codebox" data-path="${m.pathAddr}">
    <div style="font-size:12px; color:#8a8a8a; margin:0 0 4px">${title}</div>
    <div class="rows">${rows}
      <div class="row end"><span class="chip"></span><span class="mono bytes">FF</span><span class="decode">END · fly-through</span></div>
    </div></div>`;
}
function buildCodeBoxes() {
  const el = document.getElementById('codeboxes');
  if (wave.lefty.pathAddr === wave.righty.pathAddr) {
    // same path block for both members (a mirror pair) — show it once
    el.innerHTML = codeBox(wave.lefty, `${h4(wave.lefty.pathAddr)} — both members (righty mirrors rotation)`);
    document.getElementById('code-h').textContent = 'Path bytecode — shared';
  } else {
    el.innerHTML = codeBox(wave.lefty,  `${h4(wave.lefty.pathAddr)} — lefty`) +
                   codeBox(wave.righty, `${h4(wave.righty.pathAddr)} — righty`);
    document.getElementById('code-h').textContent = 'Path bytecode — lefty & righty';
  }
}
function highlightSegs() {
  const boxes = document.querySelectorAll('#codeboxes .codebox');
  const setActive = (box, runner) => {
    const active = runner.done ? -1 : runner.segIdx;
    box.querySelectorAll('.row[data-seg]').forEach((r) => r.classList.toggle('active', +r.dataset.seg === active));
  };
  if (boxes.length === 1) setActive(boxes[0], mL);          // shared: track lefty
  else if (boxes.length === 2) { setActive(boxes[0], mL); setActive(boxes[1], mR); }
}

// ── panel: the round's 5-wave choreography (click a row to jump to it) ───────────
function buildWaveTable() {
  const tbl = document.getElementById('wavetbl');
  const rows = [];
  for (let w = 0; w < 5; w++) {
    const cw = getChallengeWave(round, w);
    const cell = (m) => `${h4(m.pathAddr)}<br><span class="hint">${describePos(m.canvasX, m.canvasY)}</span>`;
    rows.push(`<tr class="${w === waveIdx ? 'cur' : ''}" data-w="${w}">
      <td>${w + 1}</td><td class="lp">${cell(cw.lefty)}</td><td class="rp">${cell(cw.righty)}</td></tr>`);
  }
  tbl.innerHTML = rows.join('');
  tbl.querySelectorAll('tr').forEach((tr) => tr.onclick = () => {
    waveIdx = +tr.dataset.w;
    document.getElementById('wave').value = String(waveIdx);
    loadWave();
  });
}

function updateReadout() {
  const fmt = (m, r) => r.done
    ? `done · ${r.frame}f`
    : `f${r.frame} seg ${r.segIdx + 1}/${decodeSegments(m.bytes).length} · (${r.x.toFixed(0)},${r.y.toFixed(0)})`;
  const parts = [`lefty ${fmt(wave.lefty, mL)}`];
  if (showRighty) parts.push(`righty ${fmt(wave.righty, mR)}`);
  document.getElementById('readout').textContent = parts.join('   ·   ');
}

// ── controls + selector population ──────────────────────────────────────────────
const stageSel = document.getElementById('stage');
CHALLENGE_ROUND_STAGES.forEach((st, r) => {
  const o = document.createElement('option');
  o.value = String(r); o.textContent = `round ${r + 1} — stage ${st}`;
  stageSel.appendChild(o);
});
const waveSel = document.getElementById('wave');
for (let w = 0; w < 5; w++) {
  const o = document.createElement('option');
  o.value = String(w); o.textContent = `wave ${w + 1}`;
  waveSel.appendChild(o);
}

const playBtn = document.getElementById('play');
playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; };
document.getElementById('restart').onclick = () => { loadWave(); playing = true; playBtn.textContent = '⏸ Pause'; };
stageSel.onchange = (e) => { round = +e.target.value; buildWaveTable(); loadWave(); };
waveSel.onchange  = (e) => { waveIdx = +e.target.value; loadWave(); };
document.getElementById('speed').oninput = (e) => { speed = SPEEDS[+e.target.value]; document.getElementById('speedval').textContent = speed + '×'; };
document.getElementById('pair').onchange  = (e) => { showRighty = e.target.checked; buildMemberCards(); render(); updateReadout(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; loop(); } });

loadWave();      // draws the initial frame synchronously (visible even if the tab starts hidden)
loop();

// dev hook — drive the demo from the console.
window.CP = {
  get mL() { return mL; }, get mR() { return mR; }, get wave() { return wave; },
  select(r, w) { round = r & 7; waveIdx = ((w % 5) + 5) % 5;
                 stageSel.value = String(round); waveSel.value = String(waveIdx); loadWave(); },
  seek(n) { loadWave(); playing = false; playBtn.textContent = '▶ Play';
            for (let i = 0; i < n; i++) { mL.step(); mR.step(); }
            render(); updateReadout(); highlightSegs(); return mL.frame; },
};
