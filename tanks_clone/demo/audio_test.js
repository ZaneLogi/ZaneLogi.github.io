// audio_test.js — the Layer-2 audio harness (loaded by audio_test.html).
//
// Drives the REAL sound engine (../audio.js) on the REAL extracted ROM streams
// (../assets/dat_sfx.js). Each button request()s a sound id; the engine runs the
// $EA7E bytecode interpreter (docs/research_audio.md) once per frame and decodes
// the register bytes to Web Audio voices (unlimited voices — one per active id,
// no 4-channel cutoff). Grouped by channel so type -> waveform is visible.
//
// Also keeps the Layer-1 interactive channel strips (poke a raw voice by decoded
// param) — sharing the engine's own AudioContext / duty waves.

import { Audio } from '../audio.js';
import { SFX_STREAMS } from '../assets/dat_sfx.js';

const NTSC_CPU = 1789773;
const DUTY_LBL = ['12.5%', '25%', '50%', '75%'];
const NOISE_PERIODS = [4,8,16,32,64,96,128,160,202,254,380,508,762,1016,2034,4068];
const pulseFreq = T => NTSC_CPU / (16 * (T + 1));
const triFreq   = T => NTSC_CPU / (32 * (T + 1));
const noiseFreq = i => NTSC_CPU / NOISE_PERIODS[i];
const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const CHAN = { 1: ['Pulse 1', 'b1'], 2: ['Pulse 2', 'b2'], 3: ['Triangle', 'b3'], 4: ['Noise', 'b4'] };

const engine = new Audio();
let peak = 0;

function log(m) {
  const el = document.getElementById('log');
  el.textContent += m + '\n'; el.scrollTop = el.scrollHeight;
}

// A stream loops forever (sustained) if it has a $F9 main-loop and no $E8 stop.
const isLoop = s => s.bytes.includes(0xF9) && !s.bytes.includes(0xE8);

// --- the real-SFX button grid, grouped by channel --------------------------
function buildSfxGrid() {
  const cols = document.getElementById('sfx-cols');
  for (const type of [1, 2, 3, 4]) {
    const [label, cls] = CHAN[type];
    const box = document.createElement('div'); box.className = 'chan';
    box.innerHTML = `<h4><span class="badge ${cls}">${label}</span></h4>`;
    SFX_STREAMS.forEach((s, id) => {
      if (s.type !== type) return;
      const b = document.createElement('button');
      b.className = 'sfxbtn'; b.dataset.id = id;
      b.innerHTML = `${s.name}${isLoop(s) ? '<span class="loop">↻</span>' : ''}`
        + `<span class="hz">$${hex2(id)}</span>`;
      b.onclick = () => {
        if (engine.isPlaying(id)) { engine.stop(id); log(`stop  ${s.name}`); }
        else { engine.play(id); log(`play  ${s.name}  ($${hex2(id)}, ${label})`); }
      };
      box.appendChild(b);
    });
    cols.appendChild(box);
  }
}

// --- Layer-1 interactive strips (share engine.ctx) -------------------------
// Small persistent voices built on the engine's AudioContext + duty waves.
function stripPulse() {
  const osc = engine.ctx.createOscillator(); osc.setPeriodicWave(engine.dutyWaves[1]);
  const gain = engine.ctx.createGain(); gain.gain.value = 0;
  osc.connect(gain); gain.connect(engine.master); osc.start();
  return {
    setDuty(i) { osc.setPeriodicWave(engine.dutyWaves[i]); },
    apply(T, V, on) {
      if (T >= 8) osc.frequency.setTargetAtTime(pulseFreq(T), engine.ctx.currentTime, 0.001);
      gain.gain.setTargetAtTime((on && T >= 8 && V > 0) ? V / 15 * 0.3 : 0, engine.ctx.currentTime, 0.004);
    },
  };
}
function stripTriangle() {
  const osc = engine.ctx.createOscillator(); osc.type = 'triangle';
  const gain = engine.ctx.createGain(); gain.gain.value = 0;
  osc.connect(gain); gain.connect(engine.master); osc.start();
  return {
    apply(T, on) {
      if (T >= 2) osc.frequency.setTargetAtTime(triFreq(T), engine.ctx.currentTime, 0.001);
      gain.gain.setTargetAtTime((on && T >= 2) ? 0.34 : 0, engine.ctx.currentTime, 0.004);
    },
  };
}
function stripNoise() {
  const gain = engine.ctx.createGain(); gain.gain.value = 0; gain.connect(engine.master);
  let src = null, ci = -1, cm = -1;
  const rebuild = (i, m) => {
    if (src) { try { src.stop(); } catch (e) {} src.disconnect(); }
    src = engine.ctx.createBufferSource(); src.buffer = engine.noiseBuffer(i, m);
    src.loop = true; src.connect(gain); src.start(); ci = i; cm = m;
  };
  return {
    apply(i, m, V, on) {
      if (i !== ci || m !== cm) rebuild(i, m);
      gain.gain.setTargetAtTime((on && V > 0) ? V / 15 * 0.3 : 0, engine.ctx.currentTime, 0.004);
    },
  };
}

const strips = {};
function wireStrip(cardId, kind) {
  const card = document.getElementById(cardId);
  const st = { duty: 1, mode: false, on: false };
  const q = s => card.querySelector(s);
  if (kind === 'pulse') {
    const box = q('[data-duty]');
    DUTY_LBL.forEach((lbl, i) => {
      const b = document.createElement('button'); b.textContent = lbl;
      if (i === 1) b.classList.add('on');
      b.onclick = () => { st.duty = i; strips[cardId].voice.setDuty(i);
        box.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i)); refresh(); };
      box.appendChild(b);
    });
  }
  function refresh() {
    if (!strips[cardId].voice) return;
    if (kind === 'pulse') {
      const V = +q('[data-vol]').value, T = +q('[data-timer]').value;
      q('[data-vol-v]').textContent = V;
      q('[data-timer-v]').textContent = T + '  ·  ' + pulseFreq(T).toFixed(0) + ' Hz';
      const r0 = (st.duty << 6) | 0x30 | (V & 0x0F), r2 = T & 0xFF, r3 = 0x08 | ((T >> 8) & 7);
      q('[data-regs]').innerHTML = `$4000=<b>${hex2(r0)}</b> $4002=<b>${hex2(r2)}</b> $4003=<b>${hex2(r3)}</b>`;
      strips[cardId].voice.apply(T, V, st.on);
    } else if (kind === 'tri') {
      const T = +q('[data-timer]').value;
      q('[data-timer-v]').textContent = T + '  ·  ' + triFreq(T).toFixed(0) + ' Hz';
      q('[data-regs]').innerHTML = `$400A=<b>${hex2(T & 0xFF)}</b> $400B=<b>${hex2(0x08 | ((T >> 8) & 7))}</b>`;
      strips[cardId].voice.apply(T, st.on);
    } else {
      const i = +q('[data-period]').value, V = +q('[data-vol]').value;
      q('[data-period-v]').textContent = i + '  ·  ' + noiseFreq(i).toFixed(0) + ' Hz';
      q('[data-vol-v]').textContent = V;
      q('[data-regs]').innerHTML = `$400C=<b>${hex2(0x30 | (V & 0x0F))}</b> $400E=<b>${hex2((st.mode ? 0x80 : 0) | (i & 0x0F))}</b>`;
      strips[cardId].voice.apply(i, st.mode ? 1 : 0, V, st.on);
    }
  }
  card.querySelectorAll('input[type=range]').forEach(el => el.oninput = refresh);
  const gate = q('[data-gate]');
  gate.onclick = () => { st.on = !st.on; gate.textContent = st.on ? 'ON' : 'OFF'; gate.classList.toggle('on', st.on); refresh(); };
  const mode = q('[data-mode]');
  if (mode) mode.onclick = () => { st.mode = !st.mode; mode.textContent = st.mode ? 'SHORT (metallic)' : 'LONG (tonal)'; refresh(); };
  strips[cardId] = { state: st, refresh, voice: null };
}
wireStrip('c-p1', 'pulse'); wireStrip('c-tri', 'tri'); wireStrip('c-noise', 'noise');

// --- boot ------------------------------------------------------------------
document.getElementById('enable').addEventListener('click', () => {
  if (engine.enabled) return;
  engine.enable();
  strips['c-p1'].voice = stripPulse();
  strips['c-tri'].voice = stripTriangle();
  strips['c-noise'].voice = stripNoise();
  buildSfxGrid();
  Object.values(strips).forEach(s => s.refresh());
  // drive the engine at ~60 Hz (a test tool; the game uses its fixed-timestep loop)
  setInterval(() => engine.tick(), 1000 / 60.0988);
  // meter + button-highlight refresh
  setInterval(() => {
    const n = engine.activeCount(); peak = Math.max(peak, n);
    document.getElementById('v-now').textContent = n;
    document.getElementById('v-peak').textContent = peak;
    document.querySelectorAll('.sfxbtn').forEach(b =>
      b.classList.toggle('on', engine.isPlaying(+b.dataset.id)));
  }, 80);
  document.getElementById('stage').classList.remove('disabled-veil');
  const eb = document.getElementById('enable'); eb.textContent = '✔ Audio enabled'; eb.disabled = true;
  log('engine enabled @ ' + engine.ctx.sampleRate + ' Hz — ' + SFX_STREAMS.length + ' streams');
});
document.getElementById('stopall').addEventListener('click', () => {
  engine.clear(); peak = 0;
  Object.keys(strips).forEach(k => { strips[k].state.on = false;
    const g = document.querySelector('#' + k + ' [data-gate]');
    if (g) { g.textContent = 'OFF'; g.classList.remove('on'); } strips[k].refresh(); });
  log('stop all');
});

// expose for deterministic register-trace testing
window.engine = engine; window.SFX_STREAMS = SFX_STREAMS;
