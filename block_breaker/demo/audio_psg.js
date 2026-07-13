import { Ayumi } from '../src/psg/ayumi.js';
import { Psg, MSX_PSG_CLOCK } from '../src/psg/sound_engine.js';

// --- helpers ---------------------------------------------------------------
const SR = 44100;
const periodForHz = (hz) => Math.round(MSX_PSG_CLOCK / (16 * hz)); // AY tone period

// Render `n` samples of the left channel for a given register setup.
function render(setup, n = 16384) {
  const ay = new Ayumi();
  ay.configure(false, MSX_PSG_CLOCK, SR);
  for (let ch = 0; ch < 3; ch++) ay.setPan(ch, 0.5, false);
  const psg = new Psg();
  psg.silence();
  setup(psg);
  psg.flushToAyumi(ay);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) { ay.process(); ay.removeDC(); buf[i] = ay.left; }
  return buf;
}
const WARMUP = 2048; // skip DC-filter / FIR warm-up
function rms(buf) {
  let s = 0; for (let i = WARMUP; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / (buf.length - WARMUP));
}
function fundamentalHz(buf) {           // rising zero-crossings per second
  let cross = 0, prev = buf[WARMUP];
  for (let i = WARMUP + 1; i < buf.length; i++) {
    if (prev <= 0 && buf[i] > 0) cross++;
    prev = buf[i];
  }
  return cross / ((buf.length - WARMUP) / SR);
}

// --- self-test -------------------------------------------------------------
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); }

// 1. Tone + pitch: proves the clock constant, period math, tone path & flush.
{
  const buf = render((p) => { p.setTone(0, periodForHz(440)); p.enableTone(0, true); p.setVolume(0, 15); });
  const r = rms(buf), f = fundamentalHz(buf);
  const pitchOk = Math.abs(f - 440) / 440 < 0.05;
  check('tone A-440', r > 0.01 && pitchOk, `rms=${r.toFixed(3)}  measured=${f.toFixed(1)} Hz (want ~440)`);
}
// 2. Mixer is active-low: tone DISABLED must be ~silent. Proves R7 semantics.
{
  const buf = render((p) => { p.setTone(0, periodForHz(440)); p.enableTone(0, false); p.setVolume(0, 15); });
  const r = rms(buf);
  check('mixer off = silent', r < 0.002, `rms=${r.toFixed(4)} (want ~0)`);
}
// 3. Noise: proves the LFSR/noise path via R6 + R7 noise-enable.
{
  const buf = render((p) => { p.setNoisePeriod(5); p.enableNoise(0, true); p.setVolume(0, 15); });
  const r = rms(buf);
  check('noise', r > 0.01, `rms=${r.toFixed(3)}`);
}
// 4. Envelope drives amplitude: volume nibble is 0, so ANY output proves the
//    envelope generator is feeding the channel (amp bit4 / R11-13 path).
{
  const buf = render((p) => {
    p.setTone(0, periodForHz(440)); p.enableTone(0, true);
    p.setVolume(0, 0, true);            // level 0 but follow-envelope on
    p.setEnvelopePeriod(1500); p.setEnvelopeShape(0x0e); // repeating triangle
  });
  const r = rms(buf);
  check('envelope amplitude', r > 0.01, `rms=${r.toFixed(3)} (level=0, env on)`);
}

// render results
const testsEl = document.getElementById('tests');
let passed = 0;
for (const t of results) {
  if (t.ok) passed++;
  const div = document.createElement('div');
  div.className = 'test ' + (t.ok ? 'pass' : 'fail');
  div.innerHTML = `<span class="tag">${t.ok ? '✓' : '✗'}</span>` +
                  `<span>${t.name}</span><span class="detail">— ${t.detail}</span>`;
  testsEl.appendChild(div);
}
const all = passed === results.length;
const sum = document.getElementById('summary');
sum.textContent = `${passed}/${results.length} passed` + (all ? '  ✓ ALL PASS' : '  ✗ FAILURES');
sum.style.color = all ? '#4ade80' : '#f87171';
console.log(`[audio_psg selfTest] ${passed}/${results.length} passed`,
            results.map((t) => `${t.ok ? 'PASS' : 'FAIL'} ${t.name}: ${t.detail}`));

// --- live audio (AudioWorklet) --------------------------------------------
let node = null;
const R7_TONE_A = 0x3e;   // tone A on, everything else off (active low)
const R7_NOISE_A = 0x37;  // noise A on, tones off
const R7_TONES_ABC = 0x38; // all 3 tones on, noise off

const post = (msg) => node && node.port.postMessage(msg);
const reg = (r, v) => post({ type: 'reg', reg: r, val: v });
function setTone(ch, hz) { const p = periodForHz(hz); reg(2*ch, p & 0xff); reg(2*ch+1, (p>>8)&0x0f); }

// --- 小蜜蜂 / "Little Bee" (German "Summ, summ, summ") melody player ---------
// Numbered notation, C major, movable-do (5=G, 3=E, ...). Played on channel A
// as a plain tone, gating volume between notes so repeats are distinct.
const DEGREE_HZ = { 1: 261.63, 2: 293.66, 3: 329.63, 4: 349.23, 5: 392.00, 6: 440.00, 7: 493.88 };
// Rhythm in eighth-note units (quarter = 2): the signature "quarter + two
// eighths" figure on 5·3 3 and 4·2 2, a four-eighth run on 1 2 3 4, then
// two quarters + a held note on 5 5 5. EIGHTH ms sets the tempo (♩=120).
const EIGHTH = 250;
const MELODY = [ // [degree, eighths]
  [5,2],[3,1],[3,1],  [4,2],[2,1],[2,1],
  [1,1],[2,1],[3,1],[4,1],  [5,2],[5,2],[5,4],
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let melodyPlaying = false;
async function playMelody() {
  if (melodyPlaying) return;
  melodyPlaying = true;
  const GAP = 30; // ms of articulation between notes
  post({ type: 'silence' });
  reg(7, R7_TONE_A);
  for (const [deg, len] of MELODY) {
    setTone(0, DEGREE_HZ[deg]);
    reg(8, 14);                       // note on
    await wait(len * EIGHTH - GAP);
    reg(8, 0);                        // brief rest -> articulation
    await wait(GAP);
  }
  post({ type: 'silence' });
  melodyPlaying = false;
}

// --- Full arrangement: melody (ch A) + root bass (ch B) + noise-drum (ch C) --
// R7 = 0x1C routes tone->A, tone->B, noise->C (active-low: A/B tone on,
// C noise on, everything else off). A per-beat grid drives all three voices;
// the drum is a short noise burst whose volume decays (kick = darker/longer,
// hat = brighter/shorter), which is how PSG percussion is made.
const MEL_HZ  = { 1: 261.63, 2: 293.66, 3: 329.63, 4: 349.23, 5: 392.00 }; // octave 4
const BASS_HZ = { 1: 65.41, 5: 98.00 };                                    // C2, G2 roots
// Bass + drum ride a steady quarter-note pulse (♩=120) while the melody keeps
// its own quarter/eighth rhythm. Bass roots follow I-V-I-V-I; the drum is a
// kick on each bar's downbeat, a hat on the off-beat.
const BASS_BEATS = [1,1, 5,5, 1,1, 5,5, 1,1];                 // root per quarter beat
const DRUM_BEATS = ['k','h','k','h','k','h','k','h','k','h']; // kick / hat per beat
async function playArrangement() {
  if (melodyPlaying) return;
  melodyPlaying = true;
  const QUARTER = EIGHTH * 2;           // 500 ms -> ♩=120
  post({ type: 'silence' });
  reg(7, 0x1c);                         // A tone + B tone + C noise
  const at = (t, fn) => setTimeout(fn, t);
  const drumHit = (kind, t0) => {
    if (!kind) return;
    const dark = kind === 'k';
    at(t0,               () => { reg(6, dark ? 22 : 3); reg(10, dark ? 14 : 10); });
    at(t0 + 40,          () => reg(10, dark ? 7 : 4));
    at(t0 + (dark ? 150 : 90), () => reg(10, 0)); // decay to silence
  };
  // melody keeps its own quarter/eighth timeline
  let t = 0;
  for (const [deg, len] of MELODY) {
    const start = t;
    at(start,      () => reg(8, 0));
    at(start + 15, () => { setTone(0, MEL_HZ[deg]); reg(8, 13); });
    t += len * EIGHTH;
  }
  const totalMs = t;
  // bass + drum on the steady quarter pulse
  BASS_BEATS.forEach((root, i) => {
    const t0 = i * QUARTER;
    at(t0,      () => reg(9, 0));
    at(t0 + 15, () => { setTone(1, BASS_HZ[root]); reg(9, 12); });
    drumHit(DRUM_BEATS[i], t0);
  });
  await wait(totalMs + 500);
  post({ type: 'silence' });
  melodyPlaying = false;
}

const sounds = {
  silence: () => post({ type: 'silence' }),
  tone: () => { post({type:'silence'}); setTone(0, 440); reg(7, R7_TONE_A); reg(8, 15); },
  noise: () => { post({type:'silence'}); reg(6, 5); reg(7, R7_NOISE_A); reg(8, 15); },
  env: () => { post({type:'silence'}); setTone(0, 220); reg(7, R7_TONE_A);
               reg(8, 0x10); reg(11, 0x00); reg(12, 0x08); reg(13, 0x0e); },
  chord: () => { post({type:'silence'}); setTone(0, 440); setTone(1, 554); setTone(2, 659);
                 reg(7, R7_TONES_ABC); reg(8, 13); reg(9, 13); reg(10, 13); },
  melody: () => playMelody(),
  arrangement: () => playArrangement(),
};

document.getElementById('enable').addEventListener('click', async (e) => {
  if (node) return;
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule('../src/psg/psg_worklet.js?v=' + Date.now());
  node = new AudioWorkletNode(ctx, 'psg', { outputChannelCount: [2] });
  node.connect(ctx.destination);
  await ctx.resume();
  e.target.textContent = 'audio ready';
  e.target.disabled = true;
  document.querySelectorAll('.snd').forEach((b) => (b.disabled = false));
  console.log('[audio_psg] worklet started, sampleRate =', ctx.sampleRate);
});

document.querySelectorAll('.snd').forEach((b) =>
  b.addEventListener('click', () => sounds[b.dataset.snd]()));
