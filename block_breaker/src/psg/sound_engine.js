// Arkanoid MSX sound — the AY-3-8910 register model + the seam to ayumi-js.
//
// Two halves live here:
//
//   1. `Psg` — a faithful model of the chip's register file. The Z80 engine
//      keeps a 14-byte shadow of the PSG registers (SOUNDS_REGS_BUFFER @
//      0xE5C4) and, each 60 Hz tick, flushes the dirty ones to the chip via
//      `out (0A0h)/(0A1h)` (SOUND_ISR_UPDATE, sound_src.asm:509). Here the
//      shadow is a Uint8Array and the flush is `flushToAyumi`, which decodes
//      the 14 registers into ayumi's setter API. ayumi does the oscillation.
//      This half is COMPLETE — it's the hardware-facing seam.
//
//   2. `SoundEngine` — the Arkanoid sequencer that WRITES that shadow: the
//      sound queue (ADD_SOUND, disassembly.asm:2566), the descriptor decode
//      (PLAY_SOUND, sound_src.asm:202) and the bytecode player + effects
//      (SOUND_ISR_UPDATE). Only the queue is ported so far; the player is a
//      marked skeleton for the next increment. Until it lands, `isrUpdate`
//      is a no-op and the worklet simply flushes whatever registers were
//      poked directly — enough to exercise the whole Web Audio path.
//
// PSG register map (AY-3-8910):
//   0/1   ch A tone period  (lo 8 bits / hi 4 bits, 12-bit total)
//   2/3   ch B tone period
//   4/5   ch C tone period
//   6     noise period (5-bit)
//   7     mixer: b0-2 = tone-disable A/B/C, b3-5 = noise-disable A/B/C
//                (ACTIVE LOW: 1 = that source is off), b6-7 = I/O port dir
//   8/9/10  ch A/B/C amplitude (b0-3 = level 0..15, b4 = 1 -> use envelope)
//   11/12   envelope period (16-bit)
//   13      envelope shape (4-bit) — WRITING it retriggers the envelope

export const MSX_PSG_CLOCK = 1789772; // AY-3-8910 on MSX = 3.579545 MHz / 2

// ---------------------------------------------------------------------------
// 1. The chip register file + the flush to ayumi-js.
// ---------------------------------------------------------------------------

export class Psg {
  constructor() {
    this.regs = new Uint8Array(14); // shadow of PSG registers 0..13
    // Writing R13 (envelope shape) restarts the envelope on real hardware, so
    // we must only push it to ayumi on the flush where it was actually
    // written — this flag mirrors the SOUND_REG_MASK bit the Z80 sets for R13.
    this._shapeDirty = false;
  }

  // Raw register poke — the fundamental operation (one `out` pair on hardware).
  write(reg, val) {
    if (reg === 13) this._shapeDirty = true;
    this.regs[reg] = val & 0xff;
  }

  read(reg) { return this.regs[reg]; }

  silence() {
    this.regs.fill(0);
    this.regs[7] = 0x3f; // all tone+noise disabled (active low), I/O bits clear
  }

  // --- convenience writers, all expressed as register pokes so they stay
  // --- faithful to what the sequencer actually does ---

  setTone(ch, period12) {
    this.write(2 * ch, period12 & 0xff);
    this.write(2 * ch + 1, (period12 >> 8) & 0x0f);
  }

  setNoisePeriod(p) { this.write(6, p & 0x1f); }

  // enable=true routes tone/noise into a channel (clears the active-low bit).
  enableTone(ch, enable) {
    const m = this.regs[7];
    this.write(7, enable ? (m & ~(1 << ch)) : (m | (1 << ch)));
  }
  enableNoise(ch, enable) {
    const m = this.regs[7];
    this.write(7, enable ? (m & ~(1 << (ch + 3))) : (m | (1 << (ch + 3))));
  }

  // level 0..15; useEnv=true makes the channel follow the envelope generator.
  setVolume(ch, level, useEnv = false) {
    this.write(8 + ch, (level & 0x0f) | (useEnv ? 0x10 : 0));
  }

  setEnvelopePeriod(p) {
    this.write(11, p & 0xff);
    this.write(12, (p >> 8) & 0xff);
  }
  setEnvelopeShape(shape) { this.write(13, shape & 0x0f); }

  // Decode the 14-register shadow into ayumi's API — the JS analog of the
  // `out (0A0h)/(0A1h)` flush loop at sound_src.asm:lb5a3h. ayumi's tone /
  // noise / volume / envelope-period setters just store their value, so
  // re-pushing them every flush is harmless; only the envelope SHAPE is
  // guarded, because writing it restarts the envelope on real hardware.
  flushToAyumi(ay) {
    const r = this.regs;
    for (let ch = 0; ch < 3; ch++) {
      ay.setTone(ch, r[2 * ch] | ((r[2 * ch + 1] & 0x0f) << 8));
      const amp = r[8 + ch];
      ay.setVolume(ch, amp & 0x0f);
      // R7 bits are active-low disables -> pass straight through as tOff/nOff.
      ay.setMixer(ch, (r[7] >> ch) & 1, (r[7] >> (ch + 3)) & 1, (amp >> 4) & 1);
    }
    ay.setNoise(r[6] & 0x1f);
    ay.setEnvelope(r[11] | (r[12] << 8));
    if (this._shapeDirty) {
      ay.setEnvelopeShape(r[13] & 0x0f);
      this._shapeDirty = false;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. The Arkanoid sequencer (queue ported; bytecode player = next increment).
// ---------------------------------------------------------------------------

const MAX_QUEUED = 7; // SOUNDS_COUNT cap (disassembly.asm:2592-2594)

export class SoundEngine {
  constructor() {
    this.psg = new Psg();
    this.queue = []; // SOUNDS_BUFFER — sound codes waiting to be started
    // TODO(next increment): the playback state the bytecode player needs —
    //   SOUND_BUFFER_1/2 stream structs + SOUND_PTR_1/2   (sound.asm)
    //   TBL_SOUND_PARAMS descriptor table                  (sound_src.asm:7)
    //   SOUND_SEQUENCES bytecode                            (sound_src.asm:1154)
    //   period/volume/delay effect states                  (sound_src.asm:892+)
  }

  // ADD_SOUND (disassembly.asm:2566): append a sound code, capped at 7.
  // (The game also suppresses SFX while lasers fire — LASERS_FIRING check;
  // that gate belongs to the caller, not modelled here.)
  addSound(id) {
    if (id === 0) return;
    if (this.queue.length >= MAX_QUEUED) return;
    this.queue.push(id & 0xff);
  }

  // SOUND_ISR_UPDATE (sound_src.asm:509), run once per 60 Hz tick.
  // TODO(next increment): drain the queue via PLAY_SOUND into the two stream
  // structs, advance both streams through their bytecode, and run the
  // period/volume/delay effect generators — all writing this.psg. For now a
  // no-op, so the worklet flushes only registers poked directly.
  isrUpdate() {
    // not yet ported — see class TODO
  }

  flush(ay) { this.psg.flushToAyumi(ay); }
}
