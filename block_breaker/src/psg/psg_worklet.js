// AudioWorkletProcessor that owns an ayumi-js AY-3-8910 and the Arkanoid
// sound engine, and renders to the audio device.
//
// The two-clock bridge (see the discussion in this project's notes):
//   - the engine ticks at 60 Hz (like the MSX VBLANK interrupt that drove
//     SOUND_ISR_UPDATE), updating the PSG register shadow;
//   - ayumi renders one sample per `process()` at the device sample rate.
// So we tick the engine once every `sampleRate/60` samples and call
// ayumi.process() for every sample in between. Ticking on the AUDIO clock
// (not requestAnimationFrame) keeps tempo immune to frame-rate jank and
// matches the original's IRQ-driven timing.
//
// Loaded as an ES module worklet, so it can `import` the sibling modules.

import { Ayumi } from './ayumi.js';
import { SoundEngine, MSX_PSG_CLOCK } from './sound_engine.js';

class PsgWorklet extends AudioWorkletProcessor {
  constructor() {
    super();

    this.ay = new Ayumi();
    this.ay.configure(false, MSX_PSG_CLOCK, sampleRate); // false = AY-3-8910
    // Centre all three channels (mono-summed to both ears).
    for (let ch = 0; ch < 3; ch++) this.ay.setPan(ch, 0.5, false);

    this.engine = new SoundEngine();
    this.samplesPerFrame = sampleRate / 60; // 60 Hz tick cadence in samples
    this.acc = 0;
    this.gain = 0.7; // headroom; ayumi output is centred near 0 after removeDC

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'reg':     this.engine.psg.write(m.reg, m.val); break; // raw poke
      case 'sfx':     this.engine.addSound(m.id); break;          // enqueue id
      case 'silence': this.engine.psg.silence(); break;
      case 'gain':    this.gain = m.value; break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const ay = this.ay, eng = this.engine, g = this.gain;

    for (let i = 0; i < L.length; i++) {
      if (this.acc <= 0) {
        eng.isrUpdate();  // 60 Hz sequencer tick (no-op until the player lands)
        eng.flush(ay);    // register shadow -> chip
        this.acc += this.samplesPerFrame;
      }
      this.acc--;
      ay.process();
      ay.removeDC();
      L[i] = ay.left * g;
      R[i] = ay.right * g;
    }
    return true; // keep the processor alive
  }
}

registerProcessor('psg', PsgWorklet);
