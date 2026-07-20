// audio.js — Audio: the $EA7E sound engine, ported.
//
// Layer 2 of the audio architecture (docs/research_audio.md). The ROM's
// sub_EA7E_sound_driver ($EA7E) is a bytecode SFX sequencer: gameplay raises a
// request flag (ram_sfx_*, $0300-$031B), and once per frame the driver walks that
// sound's stream (note / duration / loop tokens), maintaining four "$4000-style"
// register bytes it pokes at one of the 4 APU channels.
//
// We keep the streams verbatim (assets/dat_sfx.js) and PORT the interpreter's
// timing/rules; we DROP the register pokes (decode the register bytes to Web Audio
// voice params instead) and — per Zane's add-on — the 4-channel priority
// arbitration: each active sound gets its own voice (unlimited voices, no cutoff).
// Governing test + every verdict: research_audio.md §7.
//
// Layer 1 (the voice backend) is the "small Web Audio APU":
//   pulse 1/2 -> OscillatorNode(PeriodicWave, 4 duties) -> GainNode
//   triangle  -> OscillatorNode('triangle')             -> GainNode
//   noise     -> AudioBufferSourceNode(15-bit LFSR)      -> GainNode
// validated first in demo/audio_test.html.

import { PITCH_TABLE, SFX_STREAMS, SFX } from './assets/dat_sfx.js';
export { SFX };

const DPAD = 0xF0;   // con_btns_Dpad — the four d-pad bits (Up/Down/Left/Right)

// --- NES 2A03 hardware constants (the chip, not ROM data — cf. palette.js) ---
const NTSC_CPU = 1789773;                       // NTSC CPU / APU base clock (Hz)
const DUTIES = [0.125, 0.25, 0.5, 0.75];        // $4000 bits DD
// $400E low nibble -> noise timer period (NTSC CPU cycles per LFSR shift).
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160,
                       202, 254, 380, 508, 762, 1016, 2034, 4068];

// freq = CPU / (16*(T+1)) for pulse, CPU / (32*(T+1)) for triangle.
const pulseFreq = T => NTSC_CPU / (16 * (T + 1));
const triFreq   = T => NTSC_CPU / (32 * (T + 1));

// Mix levels — tuned by ear (Zane). Master keeps a headroom margin for the
// unlimited-voice overlap.
const MASTER = 0.30;
const PULSE_MAX = 0.22;
const TRI_LEVEL = 0.34;
const NOISE_MAX = 0.26;

// The pulse SWEEP unit ($4001/regB) is clocked by the frame counter's half-frame
// signal (~120 Hz). It bends the timer period each tick, which IS the "pew" of the
// shot and the warble of the tank engines — player-observable, so we port it. Tunable
// by ear; the exact 4-step/5-step rate is a couple % either way.
const SWEEP_CLOCK_HZ = 120;

// PeriodicWave per duty: Fourier coeffs of a pulse high for fraction d
//   a_n (cos) = sin(2π n d)/(nπ);  b_n (sin) = (1 - cos(2π n d))/(nπ).
function buildDutyWaves(ctx) {
  const N = 40;
  return DUTIES.map(d => {
    const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
      real[n] = Math.sin(2 * Math.PI * n * d) / (n * Math.PI);
      imag[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (n * Math.PI);
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  });
}

// One NES noise buffer via the real 15-bit LFSR (feedback = b0 ^ b(mode?6:1)).
// Looped; the gain envelope controls duration. Noise is random, so a loop seam or
// a mid-sound buffer swap is inaudible.
function renderNoise(ctx, periodIndex, mode, seconds = 0.5) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const rate = NTSC_CPU / NOISE_PERIODS[periodIndex], step = rate / sr;
  const tap = mode ? 6 : 1;
  let lfsr = 1, acc = 0;
  for (let i = 0; i < len; i++) {
    acc += step;
    while (acc >= 1) {
      const fb = (lfsr ^ (lfsr >> tap)) & 1;
      lfsr = (lfsr >> 1) | (fb << 14);
      acc -= 1;
    }
    d[i] = (lfsr & 1) ? 0.4 : -0.4;
  }
  return buf;
}

// $4000/$4004 (or $400C) bit4 = constant-volume flag. Constant -> hold vol/15;
// envelope -> start full and decay 15->0 over 15·(period+1) quarter-frames
// (~240 Hz), re-derived as a gain ramp time (research_audio.md §6).
function decodeVolume(regA) {
  if (regA & 0x10) return { level: (regA & 0x0F) / 15, envSec: 0 };
  return { level: 1.0, envSec: 15 * ((regA & 0x0F) + 1) / 240 };
}

// --- voices (Layer 1) -------------------------------------------------------
class PulseVoice {
  constructor(eng) {
    this.eng = eng; this._duty = -1;
    this.osc = eng.ctx.createOscillator();
    this.osc.setPeriodicWave(eng.dutyWaves[1]); this._duty = 1;
    this.gain = eng.ctx.createGain(); this.gain.gain.value = 0;
    this.osc.connect(this.gain); this.gain.connect(eng.master); this.osc.start();
  }
  // sweep = regB ($4001): bit7 enable, bits6-4 divider period, bit3 negate, bits2-0
  // shift. When enabled it steps the timer period every (period+1) half-frames, which
  // reads as a pitch bend; when the period leaves [8, $7FF] the channel is muted.
  setNote(T, duty, level, envSec, sweep = 0) {
    const t = this.eng.ctx.currentTime, g = this.gain.gain, f = this.osc.frequency;
    if (duty !== this._duty) { this.osc.setPeriodicWave(this.eng.dutyWaves[duty]); this._duty = duty; }
    f.cancelScheduledValues(t); g.cancelScheduledValues(t);
    if (T < 8) { g.linearRampToValueAtTime(0.0001, t + 0.005); return; }

    // frequency: swept trajectory, or a steady tone
    let muteAt = Infinity;
    if ((sweep & 0x80) && (sweep & 0x07)) {
      const div = ((sweep >> 4) & 0x07) + 1, neg = sweep & 0x08, shift = sweep & 0x07;
      let p = T, dt = 0;
      f.setValueAtTime(pulseFreq(p), t);
      for (let i = 0; i < 64; i++) {                                 // cap the step count
        const target = neg ? p - (p >> shift) : p + (p >> shift);
        dt += div / SWEEP_CLOCK_HZ;
        if (p < 8 || target > 0x7FF) { muteAt = dt; break; }         // out of range -> silence
        p = target;
        f.setValueAtTime(pulseFreq(p), t + dt);
      }
    } else {
      f.setValueAtTime(pulseFreq(T), t);
    }

    // gain: brief attack, then either the sweep-mute cut or the envelope decay
    const peak = level * PULSE_MAX;
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(peak, t + 0.002);
    const decayEnd = envSec > 0 ? 0.002 + envSec : Infinity;
    if (muteAt < decayEnd) {                                         // sweep silences it first
      g.setValueAtTime(peak, t + Math.max(0.002, muteAt - 0.004));
      g.linearRampToValueAtTime(0.0001, t + muteAt);                 // 4 ms into the mute
    } else if (envSec > 0) {
      g.linearRampToValueAtTime(0.0001, t + 0.002 + envSec);
    }
  }
  stop() { this.eng._teardown(this); }
}

class TriangleVoice {
  constructor(eng) {
    this.eng = eng;
    this.osc = eng.ctx.createOscillator(); this.osc.type = 'triangle';
    this.gain = eng.ctx.createGain(); this.gain.gain.value = 0;
    this.osc.connect(this.gain); this.gain.connect(eng.master); this.osc.start();
  }
  setNote(T) {
    const t = this.eng.ctx.currentTime, g = this.gain.gain;
    if (T < 2) { g.cancelScheduledValues(t); g.linearRampToValueAtTime(0.0001, t + 0.005); return; }
    this.osc.frequency.setValueAtTime(triFreq(T), t);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(TRI_LEVEL, t + 0.003);
  }
  stop() { this.eng._teardown(this); }
}

class NoiseVoice {
  constructor(eng) {
    this.eng = eng; this._idx = -1; this._mode = -1; this.src = null; this.osc = null;
    this.gain = eng.ctx.createGain(); this.gain.gain.value = 0;
    this.gain.connect(eng.master);
  }
  setNote(idx, mode, level, envSec) {
    const t = this.eng.ctx.currentTime, g = this.gain.gain;
    if (idx !== this._idx || mode !== this._mode) {
      if (this.src) { try { this.src.stop(); } catch (e) {} this.src.disconnect(); }
      this.src = this.eng.ctx.createBufferSource();
      this.src.buffer = this.eng.noiseBuffer(idx, mode);
      this.src.loop = true; this.src.connect(this.gain); this.src.start();
      this._idx = idx; this._mode = mode;
    }
    const peak = level * NOISE_MAX;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(peak, t + 0.002);
    if (envSec > 0) g.linearRampToValueAtTime(0.0001, t + 0.002 + envSec);
  }
  stop() { this.eng._teardown(this); }
}

// --- an active sound: one running stream + its voice ------------------------
// The 8-byte ram_se_data block split into fields (research_audio.md §3): the
// packed register bytes stay bytes (they ARE $4000-$400F values), but the loop
// counters become per-sound fields (the ROM's are ZP globals kept disjoint by the
// data; per-sound is equivalent and can't clobber).
class ActiveSound {
  constructor(id, stream, voice) {
    this.id = id; this.stream = stream; this.type = stream.type; this.voice = voice;
    this.regA = 0; this.regB = 0; this.regC = 0; this.regD = 0;
    this.pc = 0; this.stepLen = 1; this.stepLeft = 0;
    this.loops = [0, 0, 0];
    this.done = false; this.primed = false;
    // header (loc_EB4F): {type, regA, regB, regD [, regC if type 4]}
    const b = stream.bytes;
    this.regA = b[1]; this.regB = b[2]; this.regD = b[3];
    if (this.type === 4) { this.regC = b[4]; this.pc = 5; } else { this.regC = 0; this.pc = 4; }
  }
}

// --- the engine -------------------------------------------------------------
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.dutyWaves = null;
    this._noise = new Map();               // (idx|mode<<4) -> AudioBuffer
    this.active = new Map();               // id -> ActiveSound
    this.muted = false;                    // NOT SOURCE — a web-build convenience (M key / toggle)
  }

  get enabled() { return this.ctx !== null; }

  // Web Audio needs a user gesture to start; the game calls this on first input,
  // the demo on its Enable button.
  enable() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;   // respect a pre-enable toggle
    this.master.connect(this.ctx.destination);
    this.dutyWaves = buildDutyWaves(this.ctx);
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Mute = master gain to 0. NOT a stop: the engine keeps running (tick/isPlaying stay
  // live), so the mode-gates that wait on a jingle still time correctly while muted.
  // Works before enable() too (the flag carries into enable). Both settable from the M
  // key / the on-page toggle (main.js).
  mute(on) {
    this.muted = on;
    if (this.master) this.master.gain.value = on ? 0 : MASTER;
  }
  toggleMute() { this.mute(!this.muted); return this.muted; }

  noiseBuffer(idx, mode) {
    const k = idx | (mode << 4);
    let b = this._noise.get(k);
    if (!b) { b = renderNoise(this.ctx, idx, mode); this._noise.set(k, b); }
    return b;
  }

  // Raise a sound. Like the ROM's ram_sfx_* request: a fresh request (re)starts
  // the sound in its own slot (one voice per id). No-op until enabled.
  play(id) {
    if (!this.ctx) return;
    const stream = SFX_STREAMS[id];
    if (!stream) return;
    const existing = this.active.get(id);
    if (existing) existing.voice.stop();
    const voice = this._makeVoice(stream.type);
    this.active.set(id, new ActiveSound(id, stream, voice));
  }
  request(id) { this.play(id); }              // the ROM's name for it

  // Stop a playing sound (its request cleared). One-shots also stop themselves on
  // $E8; the sustained movement sounds ($F9 loop) only stop here.
  stop(id) {
    const snd = this.active.get(id);
    if (!snd) return;
    snd.voice.stop(); snd.done = true; this.active.delete(id);
  }

  isPlaying(id) { return this.active.has(id); }
  activeCount() { return this.active.size; }

  clear() {                                   // sub_EA51 — silence everything
    for (const snd of this.active.values()) snd.voice.stop();
    this.active.clear();
  }

  // One logic frame: advance every active sound's sequencer (research_audio.md §3,
  // the two ROM passes fused per-voice — no arbitration means no cross-sound emit
  // ordering to preserve). Web Audio voices sustain on their own, so we update a
  // voice only when a note/step changes it, not every frame.
  tick() {
    if (!this.ctx) return;
    for (const snd of [...this.active.values()]) {
      if (snd.done) continue;
      if (!snd.primed) { snd.primed = true; this._readUntilStep(snd); }
      else if (--snd.stepLeft <= 0) this._readUntilStep(snd);
      if (snd.done) this.active.delete(snd.id);
    }
  }

  // sub_DB0B_player_movement_sfx_handler ($DB0B), pipeline step 16. The player hum is a
  // LEVEL flag: it plays while a player holds a direction on a live tank ($DB38 tests the
  // d-pad held AND flags != 0 — our isDrivable), and stops when neither does. Managed on
  // the moving-edge (isPlaying as the flag) so the $F9 loop isn't retriggered every frame.
  /** @param {import('./tank_roster.js').TankRoster} roster  @param {import('./input.js').Input} input */
  movementSfx(roster, input) {
    let moving = false;
    for (const t of roster.players) {                     // $DB10/$DB17 — players 0, 1
      if (t.isDrivable && (input.hold[t.slot] & DPAD) !== 0) { moving = true; break; }
    }
    if (moving) { if (!this.isPlaying(SFX.MOVEMENT_PLAYER)) this.play(SFX.MOVEMENT_PLAYER); }
    else if (this.isPlaying(SFX.MOVEMENT_PLAYER)) this.stop(SFX.MOVEMENT_PLAYER);
  }

  // --- interpreter ---------------------------------------------------------
  // Read tokens from the stream until a note or hold sets this frame's step (or
  // the sound stops). Control bytes ($E8-$F9) and duration bytes are consumed
  // along the way. loc_EB88 in the ROM.
  _readUntilStep(snd) {
    const b = snd.stream.bytes;
    for (let guard = 0; guard < 2048; guard++) {
      if (snd.pc < 0 || snd.pc >= b.length) { this._end(snd); return; }
      const op = b[snd.pc++];
      if (op === 0xE8) { this._end(snd); return; }           // stop
      if (op > 0xE8) { this._control(snd, op); continue; }   // $E9-$FF (none set a step)
      if (op === 0x60) { snd.stepLeft = snd.stepLen; return; }        // hold
      if (op < 0x60) { this._note(snd, op); snd.stepLeft = snd.stepLen; return; }  // note
      snd.stepLen = op - 0x60;                               // $61-$E7 duration
    }
    this._end(snd);                                          // runaway guard
  }

  _control(snd, op) {
    const b = snd.stream.bytes;
    const read = () => b[snd.pc++];
    switch (op) {
      case 0xE9: snd.regA = (snd.regA & 0x3F) | read(); break;   // set duty (unused)
      case 0xEA: snd.regA = (snd.regA & 0xC0) | read(); break;   // set vol/env (manual decay)
      case 0xEB: snd.regA = (snd.regA & 0xF0) | read(); break;   // set vol nibble (unused)
      case 0xEC: snd.regB = read(); break;                       // set $4001-style (unused)
      case 0xED: snd.regD = read(); break;                       // set $4003-style (unused)
      case 0xEE: snd.regA = read(); break;                       // set $4000-style full
      case 0xEF: snd.loops[0] = snd.loops[1] = snd.loops[2] = 0; break;   // clear loops
      case 0xF0: case 0xF1: case 0xF2: {                         // loop 1/2/3
        const k = op - 0xF0, count = read();
        if (++snd.loops[k] !== count) snd.pc = read();           // jump back to target
        else { snd.loops[k] = 0; snd.pc++; }                     // done: skip target byte
        break;
      }
      case 0xF9: snd.pc = read(); break;                         // main loop (unconditional)
      default: snd.pc++; break;                                  // $F3-$F8 / garbage: skip a byte
    }
  }

  // A note ($00-$5F): pitch = PITCH_TABLE[(op&$F8)>>3] >> (op&7); split into the
  // timer/period registers (bra_EB9E). regD keeps its high bits (length).
  _note(snd, op) {
    const period = PITCH_TABLE[(op & 0xF8) >> 3] >> (op & 0x07);
    snd.regC = period & 0xFF;
    snd.regD = (snd.regD & 0xF8) | ((period >> 8) & 0x07);
    this._applyVoice(snd);
  }

  _applyVoice(snd) {
    const T = ((snd.regD & 0x07) << 8) | snd.regC;
    if (snd.type <= 2) {
      const { level, envSec } = decodeVolume(snd.regA);
      snd.voice.setNote(T, snd.regA >> 6, level, envSec, snd.regB);   // regB = $4001 sweep
    } else if (snd.type === 3) {
      snd.voice.setNote(T);
    } else {                                    // noise: regC = $400E
      const { level, envSec } = decodeVolume(snd.regA);
      snd.voice.setNote(snd.regC & 0x0F, (snd.regC & 0x80) ? 1 : 0, level, envSec);
    }
  }

  _end(snd) { snd.done = true; snd.voice.stop(); }

  _makeVoice(type) {
    if (type === 3) return new TriangleVoice(this);
    if (type === 4) return new NoiseVoice(this);
    return new PulseVoice(this);              // type 1/2
  }

  // Ramp a finished voice out over a few ms, then disconnect its nodes.
  _teardown(voice) {
    const t = this.ctx.currentTime, g = voice.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(0.0001, t + 0.008);
    setTimeout(() => {
      try { voice.osc && voice.osc.stop(); voice.src && voice.src.stop(); } catch (e) {}
      voice.osc && voice.osc.disconnect();
      voice.src && voice.src.disconnect();
      voice.gain.disconnect();
    }, 40);
  }
}
