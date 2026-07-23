// audio/psg.js — Layer 1 of the sound subsystem (§5.2): a tiny Web Audio "PSG" modelling the arcade
// AY-3-8910's voices — 3 square-wave tone channels + 1 noise channel. It speaks ONLY decoded params
// (frequency in Hz, gain 0..1) and knows NOTHING about notes, tempo, songs, the ROM, or Frogger —
// the sequencer (Layer 2, ./sequencer.js) drives it. Reusable across AY-based ports.
//
// Each tone channel is a continuously-running square OscillatorNode gated by a GainNode (the AY tone
// generator runs free; volume gates it). The noise channel is a looping random-sample buffer, gated
// the same way. noteOn/noteOff ramp the gate; rampFreq schedules a pitch glide (the descending "pew").
//
// DEPENDENCY RULE: this file imports NOTHING project-specific (pure Web Audio). If it ever needs a
// note number, a tempo, or ROM data, the boundary has leaked — that belongs in the sequencer.

const ATTACK = 0.005;   // s — short gate ramps so note edges don't click
const RELEASE = 0.02;
const FLOOR = 0.0001;   // exponential ramps can't touch 0

// A generic gated voice: a source node (oscillator or noise buffer) running continuously into a
// GainNode that acts as both the volume level and the on/off gate.
class Voice {
  /** @param {AudioContext} ctx @param {AudioNode} out @param {AudioScheduledSourceNode} src */
  constructor(ctx, out, src) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;            // silent until noteOn
    this.src = src;
    this.src.connect(this.gain).connect(out);
    this.src.start();                    // runs forever; the gain gates it
    this.level = 0.2;                    // default "on" gain (0..1)
  }

  setVolume(g) { this.level = g; }       // set the "on" gain level

  noteOn(level = this.level, t = this.ctx.currentTime) {
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + ATTACK);
  }

  noteOff(t = this.ctx.currentTime) {
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + RELEASE);
  }

  // noteOn, then an exponential decay to silence over `decay` s — the plucked-note envelope.
  pluck(level = this.level, decay = 0.4, t = this.ctx.currentTime) {
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(FLOOR, t);
    g.exponentialRampToValueAtTime(Math.max(level, FLOOR * 2), t + ATTACK);
    g.exponentialRampToValueAtTime(FLOOR, t + decay);
  }
}

// A square-wave tone channel (an AY tone generator).
class ToneVoice extends Voice {
  constructor(ctx, out) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 440;
    super(ctx, out, osc);
    this.osc = osc;
  }

  setFreq(hz, t = this.ctx.currentTime) { this.osc.frequency.setValueAtTime(hz, t); }

  // Glide from `fromHz` to `toHz` over `secs`, anchored at time `t` — the descending "pew"
  // (a software pitch-bend). Both ends clamped above 0 (exponential ramps can't reach 0).
  glide(fromHz, toHz, secs, t = this.ctx.currentTime) {
    const f = this.osc.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(fromHz, 1), t);
    f.exponentialRampToValueAtTime(Math.max(toHz, 1), t + secs);
  }
}

// The noise channel (an AY noise generator): a looping buffer of random samples. It has no pitch —
// setFreq/rampFreq are no-ops so the sequencer can address any voice uniformly.
class NoiseVoice extends Voice {
  constructor(ctx, out) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);   // ~1 s of noise, looped
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    super(ctx, out, src);
  }

  setFreq() {}
  glide() {}
}

// The PSG: owns the AudioContext + a master gain, and holds the AY's voice set (3 tone + 1 noise).
// Construct it from within a user gesture (browsers gate AudioContext on interaction); call resume()
// on that gesture too.
export class PSG {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;       // headroom for up to 4 voices summing
    this.master.connect(this.ctx.destination);
    this.tone = [
      new ToneVoice(this.ctx, this.master),
      new ToneVoice(this.ctx, this.master),
      new ToneVoice(this.ctx, this.master),
    ];
    this.noise = new NoiseVoice(this.ctx, this.master);
    this.voices = [...this.tone, this.noise];
  }

  resume() { if (this.ctx.state === 'suspended') return this.ctx.resume(); }

  get now() { return this.ctx.currentTime; }
}
