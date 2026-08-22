// seafox/src/presentation/speaker.js
//
// Synthesis for design_spec Chapter 18. The synthesis path is free (§ 18.10);
// the normative parts -- the pitch-to-frequency formula, duration counting
// half-periods, one pair per tick -- are in core/sound.js.
//
// `Speaker` owns the audio clock, the tick cursor, the cone filter and the
// master gain. It produces no sound itself; that is the backend's job, and a
// backend implements two methods:
//
//     burst(pitch, duration, atTime)   sound one (pitch, duration) pair
//     stopAll()                        drop what is scheduled and unplayed
//
// The backend receives the pair, not a frequency and a length.
// `OscillatorBackend` below renders it as a band-limited square.
//
// Rationale for this design is in docs/porting_decisions.md, decision 4.

import { frequencyHz, burstSeconds } from '../core/sound.js';

/**
 * @typedef {Object} SynthBackend
 * @property {(pitch: number, duration: number, atTime: number) => void} burst
 * @property {() => void} stopAll
 */

/**
 * A band-limited square per pair: one `OscillatorNode` per burst, started and
 * stopped at sample-accurate times. There is no gain envelope -- start/stop is
 * the gate.
 *
 * @implements {SynthBackend}
 */
export class OscillatorBackend {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination what the oscillators connect to.
   */
  constructor(ctx, destination) {
    /** @type {AudioContext} */
    this.ctx = ctx;
    /** @type {AudioNode} */
    this.destination = destination;
    /** @type {Set<OscillatorNode>} scheduled and not yet finished. */
    this.live = new Set();
  }

  /** @returns {string} shown in the demo's backend readout. */
  get name() {
    return 'oscillator (band-limited square)';
  }

  /**
   * @param {number} pitch
   * @param {number} duration half-periods.
   * @param {number} atTime AudioContext time.
   * @returns {void}
   */
  burst(pitch, duration, atTime) {
    const seconds = burstSeconds(pitch, duration);
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequencyHz(pitch);
    osc.connect(this.destination);
    osc.start(atTime);
    osc.stop(atTime + seconds);
    this.live.add(osc);
    osc.onended = () => {
      osc.disconnect();
      this.live.delete(osc);
    };
  }

  /** @returns {void} */
  stopAll() {
    for (const osc of this.live) {
      try { osc.stop(); } catch (e) { /* already stopped */ }
    }
    this.live.clear();
  }
}

/**
 * @type {number} § 18.9 / porting decision 1: the fixed tick rate.
 *
 * **This scheduler is correct up to 51.5 ticks/s and no further.** A burst is
 * timed in CPU cycles, so raising the tick rate shortens the silence after a
 * burst but not the burst itself; above the ceiling a burst outlasts its tick
 * and the next pair sounds on top of it. Sequence 17 (`15,200`, 19.4 ms) sets
 * the ceiling at 1000/19.4 = 51.5 Hz; sequence 3 (`100,20`, 10.3 ms) follows at
 * 97 Hz. At 30 Hz the longest burst fills 58% of a tick.
 *
 * Above 51.5 the backend needs a monophonic guard. See
 * docs/porting_decisions.md, decision 4.
 */
export const DEFAULT_TICK_HZ = 30;

/**
 * @type {number} How far ahead of `currentTime` a pair is scheduled. A pair is
 * placed on a cursor advancing one tick at a time rather than at the moment its
 * tick arrives; this is the slack that absorbs jitter in the driving loop. A
 * stall longer than this overtakes the cursor, which then resynchronises.
 */
const LOOKAHEAD_TICKS = 2;

/**
 * The audio device (§ 18.9). Fed one pair per tick by whatever drives the
 * simulation; it never sees the queue.
 *
 * Playing a sound costs no tick time: every method here only schedules, and the
 * work happens on the audio thread (§ 18.9). § 18.4's lag is unaffected — it
 * lives in the queue, not in playback.
 */
export class Speaker {
  /**
   * @param {Object} [options]
   * @param {number} [options.tickHz] ticks per second. Default 30.
   * @param {number} [options.coneHz] one-pole low-pass corner. 0 disables it.
   * @param {number} [options.volume] master gain, 0 to 1.
   * @param {(ctx: AudioContext, dest: AudioNode) => SynthBackend} [options.backend]
   */
  constructor(options = {}) {
    /** @type {number} */
    this.tickHz = options.tickHz || DEFAULT_TICK_HZ;
    /** @type {number} */
    this.coneHz = options.coneHz === undefined ? 6000 : options.coneHz;
    /** @type {number} */
    this.volume = options.volume === undefined ? 0.25 : options.volume;
    /** @type {?AudioContext} created on the first `resume`, per autoplay policy. */
    this.ctx = null;
    /** @type {?GainNode} */
    this.master = null;
    /** @type {?AudioNode} the cone, or the master when the filter is off. */
    this.cone = null;
    /** @type {?SynthBackend} */
    this.backend = null;
    /** @type {function} */
    this.makeBackend = options.backend || ((ctx, dest) => new OscillatorBackend(ctx, dest));
    /**
     * AudioContext time the next pair belongs at. Advances by exactly one tick
     * per pair, whether or not that pair sounds.
     * @type {number}
     */
    this.nextPairTime = 0;
    /** @type {number} pairs sounded since the last silence. Demo readout. */
    this.pairsSounded = 0;
  }

  /** @returns {number} seconds per tick. */
  get tickSeconds() {
    return 1 / this.tickHz;
  }

  /** @returns {boolean} */
  get isRunning() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * Build the graph and start the clock. Must be called from a user gesture the
   * first time -- browsers refuse to start an AudioContext otherwise.
   * @returns {Promise<void>}
   */
  async resume() {
    if (!this.ctx) this.build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.nextPairTime = this.ctx.currentTime + LOOKAHEAD_TICKS * this.tickSeconds;
  }

  /**
   * backend -> cone -> master -> out.
   * @returns {void}
   */
  build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.cone = this.coneHz > 0 ? this.makeCone(this.coneHz) : this.master;
    this.backend = this.makeBackend(this.ctx, this.cone);
  }

  /**
   * § 18.9's one-pole low-pass, standing in for the physical cone: an
   * `IIRFilterNode` carrying `y[n] = (1-a)x[n] + a*y[n-1]`, where
   * `a = exp(-2*pi*fc/sampleRate)`. Not a `BiquadFilterNode`, which is two-pole.
   * @param {number} fc corner frequency in Hz.
   * @returns {AudioNode} connected to the master gain.
   */
  makeCone(fc) {
    const a = Math.exp(-2 * Math.PI * fc / this.ctx.sampleRate);
    const node = this.ctx.createIIRFilter([1 - a], [1, -a]);
    node.connect(this.master);
    return node;
  }

  /**
   * Sound one pair -- the return value of `advanceSound`. Call once per tick,
   * with null on the ticks that produce nothing.
   * @param {?{pitch: number, duration: number}} pair
   * @returns {void}
   */
  tick(pair) {
    if (!this.isRunning) return;
    // A silent tick still consumes its slot on the cursor.
    const now = this.ctx.currentTime;
    const floor = now + LOOKAHEAD_TICKS * this.tickSeconds;
    if (this.nextPairTime < floor) this.nextPairTime = floor;   // resync after a stall
    const at = this.nextPairTime;
    this.nextPairTime += this.tickSeconds;
    if (!pair) return;
    this.backend.burst(pair.pitch, pair.duration, at);
    this.pairsSounded += 1;
  }

  /**
   * Drop everything scheduled and restart the cursor -- the audio counterpart of
   * § 18.4's between-rounds flush, and the only method here that cancels a
   * sound.
   * @returns {void}
   */
  silence() {
    if (!this.ctx) return;
    this.backend.stopAll();
    this.nextPairTime = this.ctx.currentTime + LOOKAHEAD_TICKS * this.tickSeconds;
    this.pairsSounded = 0;
  }

  /**
   * @param {number} v 0 to 1.
   * @returns {void}
   */
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /**
   * Rebuild the cone and the backend at a new corner frequency. Anything already
   * scheduled keeps playing through the old graph.
   * @param {number} fc Hz, or 0 for no filter.
   * @returns {void}
   */
  setCone(fc) {
    this.coneHz = fc;
    if (!this.ctx) return;
    this.cone = fc > 0 ? this.makeCone(fc) : this.master;
    this.backend = this.makeBackend(this.ctx, this.cone);
  }
}
