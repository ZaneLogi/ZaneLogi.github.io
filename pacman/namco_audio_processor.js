"use strict"

const AUDIO_VOLUME = (0.5);

const NUM_VOICES           = (3);            // number of sound voices
const NUM_SOUNDS           = (3);            // max number of sounds effects that can be active at a time
const NUM_SAMPLES          = (128);          // max number of audio samples in local sample buffer

// flags for sound_t.flags
const SOUNDFLAG = {
    VOICE0: (1<<0),
    VOICE1: (1<<1),
    VOICE2: (1<<2),
    ALL_VOICES: (1<<0)|(1<<1)|(1<<2)
};

// a sound 'hardware' voice
class voice_t {
    constructor() {
        this.clear();
    }

    clear() {
        this.counter = 0;      // 20-bit counter, top 5 bits are index into wavetable ROM
        this.frequency = 0;    // 20-bit frequency (added to counter at 96kHz)
        this.waveform = 0;     // 3-bit waveform index
        this.volume = 0;       // 4-bit volume
        this.sample_acc = 0.0; // current float sample accumulator
        this.sample_div = 0.0; // current float sample divisor
    }
}

// a currently playing sound effect
class sound_t {
    constructor() {
        this.clear();
    }

    clear() {
        this.cur_tick = 0;      // current tick counter
        this.func = null;       // optional function pointer for procedural sounds
        this.num_ticks = 0;     // length of register dump sound effect in 60Hz ticks
        this.stride = 0;        // number of uint32_t values per tick (only for register dump effects)
        this.data = null;       // 3 * num_ticks register dump values
        this.flags = 0;         // combination of soundflag_t (active voices)
    }
}



class NamcoAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        console.log("AudioWorklet sample rate:", sampleRate);

        this.snd_init();

        this.port.onmessage = this.onmessage.bind(this);

        this.frame_count = 0; // number calls of process
    }

    onmessage(e) {
        const msg = e.data;
        if (msg.type === 'updateVoice') {
            Object.assign(this.voices[msg.voice], msg.data);
            console.log(`Voice ${msg.voice} updated:`, this.voices[msg.voice]);
        }
        else if (msg.type === "game_tick")  {
            // every 60 Hz tick, update the sound 'hardware registers'
            this.snd_tick();
            //console.log(`Game tick received, sound registers updated.`);
        }
        else if (msg.type === 'prelude') {
            const desc = {
                func: null,
                ptr: snd_dump_prelude,
                size: snd_dump_prelude.length,
                voice: [true, true, false]

            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'dead') {
            const desc = {
                func: null,
                ptr: snd_dump_dead,
                size: snd_dump_dead.length,
                voice: [false, false, true]

            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'eatdot1') {
            const desc = {
                func: (slot) => this.snd_func_eatdot1(slot),
                ptr: null,
                size: 0,
                voice: [false, false, true]
            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'eatdot2') {
            const desc = {
                func: (slot) => this.snd_func_eatdot2(slot),
                ptr: null,
                size: 0,
                voice: [false, false, true]
            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'eatghost') {
            const desc = {
                func: (slot) => this.snd_func_eatghost(slot),
                ptr: null,
                size: 0,
                voice: [false, false, true]
            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'eatfruit') {
            const desc = {
                func: (slot) => this.snd_func_eatfruit(slot),
                ptr: null,
                size: 0,
                voice: [false, false, true]
            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'weeooh') {
            const desc = {
                func: (slot) => this.snd_func_weeooh(slot),
                ptr: null,
                size: 0,
                voice: [false, true, false]
            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'frightened') {
            const desc = {
                func: (slot) => this.snd_func_frightened(slot),
                ptr: null,
                size: 0,
                voice: [false, true, false]
            };
            this.snd_start(msg.slot, desc);
        }
        else if (msg.type === 'stop_sound') {
            this.snd_clear();
            //console.log(`Sound stopped`);
        }
    }

    snd_func_eatdot1(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        const snd = this.sounds[slot];
        const voice = this.voices[2];
        if (snd.cur_tick == 0) {
            voice.volume = 12;
            voice.waveform = 2;
            voice.frequency = 0x1500;
        }
        else if (snd.cur_tick == 5) {
            this.snd_stop(slot);
        }
        else {
            voice.frequency -= 0x0300;
        }
    }

    snd_func_eatdot2(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        const snd = this.sounds[slot];
        const voice = this.voices[2];
        if (snd.cur_tick == 0) {
            voice.volume = 12;
            voice.waveform = 2;
            voice.frequency = 0x0700;
        }
        else if (snd.cur_tick == 5) {
            this.snd_stop(slot);
        }
        else {
            voice.frequency += 0x300;
        }
    }

    snd_func_eatghost(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        const snd = this.sounds[slot];
        const voice = this.voices[2];
        if (snd.cur_tick == 0) {
            voice.volume = 12;
            voice.waveform = 5;
            voice.frequency = 0;
        }
        else if (snd.cur_tick == 32) {
            this.snd_stop(slot);
        }
        else {
            voice.frequency += 0x20;
        }
    }

    snd_func_eatfruit(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        const snd = this.sounds[slot];
        const voice = this.voices[2];
        if (snd.cur_tick == 0) {
            voice.volume = 15;
            voice.waveform = 6;
            voice.frequency = 0x1600;
        }
        else if (snd.cur_tick == 23) {
            this.snd_stop(slot);
        }
        else if (snd.cur_tick < 11) {
            voice.frequency -= 0x200;
        }
        else {
            voice.frequency += 0x0200;
        }
    }

    snd_func_weeooh(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        const snd = this.sounds[slot];
        const voice = this.voices[1];
        if (snd.cur_tick == 0) {
            voice.volume = 6;
            voice.waveform = 6;
            voice.frequency = 0x1000;
        }
        else if ((snd.cur_tick % 24) < 12) {
            voice.frequency += 0x0200;
        }
        else {
            voice.frequency -= 0x0200;
        }
    }

    snd_func_frightened(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        const snd = this.sounds[slot];
        const voice = this.voices[1];
        if (snd.cur_tick == 0) {
            voice.volume = 10;
            voice.waveform = 4;
            voice.frequency = 0x0180;
        }
        else if ((snd.cur_tick % 8) == 0) {
            voice.frequency = 0x0180;
        }
        else {
            voice.frequency += 0x180;
        }
    }

    snd_init() {
        const samples_per_sec = sampleRate; // 44.1 kHz or 48 kHz sample rate

        this.voices = new Array(NUM_VOICES).fill().map(() => new voice_t()); // sound voices
        this.sounds = new Array(NUM_SOUNDS).fill().map(() => new sound_t()); // active sound effects

        // compute sample duration in nanoseconds
        this.sample_duration_ns = 1000000000 / samples_per_sec;

        /*
        compute number of 96kHz ticks per sample tick (the Namco sound generator
        runs at 96kHz), times 1000 for increased precision
        */
        this.voice_tick_period = 96000000 / samples_per_sec;

        this.voice_tick_accum = 0; // voice tick accumulator for 96 kHz ticks
        this.sample_accum = 0; // sample accumulator for per-frame sample generation
        
        this.sample_buffer = new Float32Array(NUM_SAMPLES);
        this.num_samples = 0; // current number of samples in the sample buffer
    }

    snd_clear() {
        // clear all sound voices
        for (let i = 0; i < NUM_VOICES; i++) {
            this.voices[i].clear();
        }

        // clear all sound effects
        for (let i = 0; i < NUM_SOUNDS; i++) {
            this.sounds[i].clear();
        }

        this.sample_accum = 0;
        this.num_samples = 0;
    }

    // start a sound effect
    snd_start = function(slot, desc) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));
        console.assert(desc);
        console.assert((desc.ptr && desc.size) || desc.func);

        this.snd_stop(slot); // stop any currently active sound in this slot
        const snd = this.sounds[slot];
        let num_voices = 0;
        for (let i = 0; i < NUM_VOICES; i++) {
            if (desc.voice[i]) {
                snd.flags |= (1<<i);
                num_voices++;
            }
        }
        if (desc.func) {
            // procedural sounds only need a callback function
            snd.func = desc.func;
        }
        else {
            console.assert(num_voices > 0);
            console.assert((desc.size % num_voices) == 0);
            snd.stride = num_voices;
            snd.num_ticks = Math.floor(desc.size / snd.stride);
            snd.data = desc.ptr;
        }
    }

    // stop a sound effect
    snd_stop = function(slot) {
        console.assert((slot >= 0) && (slot < NUM_SOUNDS));

        // silence the sound's output voices
        for (let i = 0; i < NUM_VOICES; i++) {
            if (this.sounds[slot].flags & (1<<i)) {
                this.voices[i].clear();
            }
        }

        // clear the sound slot
        this.sounds[slot].clear();
    }

/*
         Game Loop
             ↓
         snd_tick()        ← 60 Hz
             ↓
     Sound Register Update
             ↓
        snd_frame()        ← 每 Frame，傳入 delta_time
        ┌───────────────┬───────────────┐
        │               │               │
96kHz   ↓          sample_rate Hz      ↓
  snd_voice_tick()    snd_sample_tick()
        ↓                   ↓
 Phase accumulator     Mix & buffer
        ↓                   ↓
   sample_acc[]        saudio_push()

*/

    // the snd_voice_tick() function updates the Namco sound generator and must be called with 96 kHz
    snd_voice_tick() {
        for (let i = 0; i < NUM_VOICES; i++) {
            const voice = this.voices[i];

            // 20-bit phase accumulator
            voice.counter += voice.frequency;
            /*
            lookup current 4-bit sample from the waveform number and the
            topmost 5 bits of the 20-bit sample counter
            */
            const wave_index = ((voice.waveform<<5) | ((voice.counter>>15) & 0x1F)) & 0xFF;
            // get 4-bit sample value (-8 ~ +7)
            const sample = (((rom_wavetable[wave_index] & 0xF)) - 8) * voice.volume;
            // accumulate sample, later divided by sample_div
            voice.sample_acc += sample; // sample is (-8..+7 wavetable value) * 16 (volume)
            voice.sample_div += 128.0;
        }
    }

    // the snd_sample_tick() function must be called with sample frequency (e.g. 44.1kHz)
    snd_sample_tick() {
        let sm = 0;
        for (let i = 0; i < NUM_VOICES; i++) {
            const voice = this.voices[i];

            if (voice.sample_div > 0.0) {
                sm += voice.sample_acc / voice.sample_div;
                voice.sample_acc = 0;
                voice.sample_div = 0;
            }
        }

        // Normalize and apply volume
        this.sample_buffer[this.num_samples++] = sm * (1 / NUM_VOICES) * AUDIO_VOLUME;
    }

    // the sound subsystem's per-frame function
    snd_frame(frame_time_ns) {
        // for each sample to generate...
        this.sample_accum -= frame_time_ns;
        while (this.sample_accum < 0) {
            this.sample_accum += this.sample_duration_ns;
            // tick the sound generator at 96 KHz
            this.voice_tick_accum -= this.voice_tick_period;
            while (this.voice_tick_accum < 0) {
                this.voice_tick_accum += 1000;
                this.snd_voice_tick();
            }
            // generate a new sample, and push out to sokol-audio when local sample buffer full
            this.snd_sample_tick();
        }
    }

    /*
    The sound system's 60 Hz tick function (called from game tick).
    Updates the sound 'hardware registers' for all active sound effects.
    */
    snd_tick() {
        // for each active sound effect...
        for (let sound_slot = 0; sound_slot < NUM_SOUNDS; sound_slot++) {
            const snd = this.sounds[sound_slot];
            if (snd.func) {
                // procedural sound effect
                snd.func(sound_slot);
            }
            else if (snd.flags & SOUNDFLAG.ALL_VOICES) {
                // register-dump sound effect
                console.assert(snd.data);
                if (snd.cur_tick >= snd.num_ticks) {
                    this.snd_stop(sound_slot);
                    continue;
                }

                // decode register dump values into voice 'registers'
                let cur_ptr = snd.cur_tick * snd.stride;
                for (let i = 0; i < NUM_VOICES; i++) {
                    if (snd.flags & (1<<i)) {
                        const voice = this.voices[i];
                        const val = snd.data[cur_ptr++];
                        // 20 bits frequency
                        voice.frequency = val & ((1<<20)-1);
                        // 3 bits waveform
                        voice.waveform = (val>>24) & 7;
                        // 4 bits volume
                        voice.volume = (val>>28) & 0xF;
                    }
                }
            }

            snd.cur_tick++;
        }
    }




    process(inputs, outputs, parameters) {
        const output = outputs[0][0];

        //if (this.frame_count++ < 2)
        {
            //console.log(`AudioWorklet first sample: ${outputs.length}, ${outputs[0].length}, ${outputs[0][0].length}`);

            for (let i = 0; i < output.length;) {
                const sample_count = Math.min(NUM_SAMPLES, output.length - i);
                const frame_time_ns = this.sample_duration_ns * sample_count;
                this.snd_frame(frame_time_ns);

                console.assert(this.num_samples <= NUM_SAMPLES, "Sample buffer overflow");

                for (let j = 0; j < sample_count; j++) {
                    output[i + j] = this.sample_buffer[j]; // copy samples to output
                }

                this.num_samples = 0; // reset sample buffer for the next run
                i += sample_count;
            }
        }

        return true;
    }
}

registerProcessor('namco_audio_processor', NamcoAudioProcessor);

const rom_wavetable = [
  0x07, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0D, 0x0E, 0x0E, 0x0E, 0x0D, 0x0D, 0x0C, 0x0B, 0x0A, 0x09,
  0x07, 0x05, 0x04, 0x03, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x01, 0x01, 0x02, 0x03, 0x04, 0x05,
  0x07, 0x0C, 0x0E, 0x0E, 0x0D, 0x0B, 0x09, 0x0A, 0x0B, 0x0B, 0x0A, 0x09, 0x06, 0x04, 0x03, 0x05,
  0x07, 0x09, 0x0B, 0x0A, 0x08, 0x05, 0x04, 0x03, 0x03, 0x04, 0x05, 0x03, 0x01, 0x00, 0x00, 0x02,
  0x07, 0x0A, 0x0C, 0x0D, 0x0E, 0x0D, 0x0C, 0x0A, 0x07, 0x04, 0x02, 0x01, 0x00, 0x01, 0x02, 0x04,
  0x07, 0x0B, 0x0D, 0x0E, 0x0D, 0x0B, 0x07, 0x03, 0x01, 0x00, 0x01, 0x03, 0x07, 0x0E, 0x07, 0x00,
  0x07, 0x0D, 0x0B, 0x08, 0x0B, 0x0D, 0x09, 0x06, 0x0B, 0x0E, 0x0C, 0x07, 0x09, 0x0A, 0x06, 0x02,
  0x07, 0x0C, 0x08, 0x04, 0x05, 0x07, 0x02, 0x00, 0x03, 0x08, 0x05, 0x01, 0x03, 0x06, 0x03, 0x01,
  0x00, 0x08, 0x0F, 0x07, 0x01, 0x08, 0x0E, 0x07, 0x02, 0x08, 0x0D, 0x07, 0x03, 0x08, 0x0C, 0x07,
  0x04, 0x08, 0x0B, 0x07, 0x05, 0x08, 0x0A, 0x07, 0x06, 0x08, 0x09, 0x07, 0x07, 0x08, 0x08, 0x07,
  0x07, 0x08, 0x06, 0x09, 0x05, 0x0A, 0x04, 0x0B, 0x03, 0x0C, 0x02, 0x0D, 0x01, 0x0E, 0x00, 0x0F,
  0x00, 0x0F, 0x01, 0x0E, 0x02, 0x0D, 0x03, 0x0C, 0x04, 0x0B, 0x05, 0x0A, 0x06, 0x09, 0x07, 0x08,
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
  0x0F, 0x0E, 0x0D, 0x0C, 0x0B, 0x0A, 0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x00,
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
];

/*== SOUND EFFECT REGISTER DUMPS =============================================*/

/*
    Each line is a 'register dump' for one 60Hz tick. Each 32-bit number
    encodes the per-voice values for frequency, waveform and volume:

    31                              0 bit
    |vvvv-www----ffffffffffffffffffff|
      |    |              |
      |    |              +-- 20 bits frequency
      |    +-- 3 bits waveform
      +-- 4 bits volume
*/
const snd_dump_prelude = [
    0xE20002E0, 0xF0001700,
    0xD20002E0, 0xF0001700,
    0xC20002E0, 0xF0001700,
    0xB20002E0, 0xF0001700,
    0xA20002E0, 0xF0000000,
    0x920002E0, 0xF0000000,
    0x820002E0, 0xF0000000,
    0x720002E0, 0xF0000000,
    0x620002E0, 0xF0002E00,
    0x520002E0, 0xF0002E00,
    0x420002E0, 0xF0002E00,
    0x320002E0, 0xF0002E00,
    0x220002E0, 0xF0000000,
    0x120002E0, 0xF0000000,
    0x020002E0, 0xF0000000,
    0xE2000000, 0xF0002280,
    0xD2000000, 0xF0002280,
    0xC2000000, 0xF0002280,
    0xB2000000, 0xF0002280,
    0xA2000000, 0xF0000000,
    0x92000000, 0xF0000000,
    0x82000000, 0xF0000000,
    0x72000000, 0xF0000000,
    0xE2000450, 0xF0001D00,
    0xD2000450, 0xF0001D00,
    0xC2000450, 0xF0001D00,
    0xB2000450, 0xF0001D00,
    0xA2000450, 0xF0000000,
    0x92000450, 0xF0000000,
    0x82000450, 0xF0000000,
    0x72000450, 0xF0000000,
    0xE20002E0, 0xF0002E00,
    0xD20002E0, 0xF0002E00,
    0xC20002E0, 0xF0002E00,
    0xB20002E0, 0xF0002E00,
    0xA20002E0, 0xF0002280,
    0x920002E0, 0xF0002280,
    0x820002E0, 0xF0002280,
    0x720002E0, 0xF0002280,
    0x620002E0, 0xF0000000,
    0x520002E0, 0xF0000000,
    0x420002E0, 0xF0000000,
    0x320002E0, 0xF0000000,
    0x220002E0, 0xF0000000,
    0x120002E0, 0xF0000000,
    0x020002E0, 0xF0000000,
    0xE2000000, 0xF0001D00,
    0xD2000000, 0xF0001D00,
    0xC2000000, 0xF0001D00,
    0xB2000000, 0xF0001D00,
    0xA2000000, 0xF0001D00,
    0x92000000, 0xF0001D00,
    0x82000000, 0xF0001D00,
    0x72000000, 0xF0001D00,
    0xE2000450, 0xF0000000,
    0xD2000450, 0xF0000000,
    0xC2000450, 0xF0000000,
    0xB2000450, 0xF0000000,
    0xA2000450, 0xF0000000,
    0x92000450, 0xF0000000,
    0x82000450, 0xF0000000,
    0x72000450, 0xF0000000,
    0xE2000308, 0xF0001840,
    0xD2000308, 0xF0001840,
    0xC2000308, 0xF0001840,
    0xB2000308, 0xF0001840,
    0xA2000308, 0xF0000000,
    0x92000308, 0xF0000000,
    0x82000308, 0xF0000000,
    0x72000308, 0xF0000000,
    0x62000308, 0xF00030C0,
    0x52000308, 0xF00030C0,
    0x42000308, 0xF00030C0,
    0x32000308, 0xF00030C0,
    0x22000308, 0xF0000000,
    0x12000308, 0xF0000000,
    0x02000308, 0xF0000000,
    0xE2000000, 0xF0002480,
    0xD2000000, 0xF0002480,
    0xC2000000, 0xF0002480,
    0xB2000000, 0xF0002480,
    0xA2000000, 0xF0000000,
    0x92000000, 0xF0000000,
    0x82000000, 0xF0000000,
    0x72000000, 0xF0000000,
    0xE2000490, 0xF0001EC0,
    0xD2000490, 0xF0001EC0,
    0xC2000490, 0xF0001EC0,
    0xB2000490, 0xF0001EC0,
    0xA2000490, 0xF0000000,
    0x92000490, 0xF0000000,
    0x82000490, 0xF0000000,
    0x72000490, 0xF0000000,
    0xE2000308, 0xF00030C0,
    0xD2000308, 0xF00030C0,
    0xC2000308, 0xF00030C0,
    0xB2000308, 0xF00030C0,
    0xA2000308, 0xF0002480,
    0x92000308, 0xF0002480,
    0x82000308, 0xF0002480,
    0x72000308, 0xF0002480,
    0x62000308, 0xF0000000,
    0x52000308, 0xF0000000,
    0x42000308, 0xF0000000,
    0x32000308, 0xF0000000,
    0x22000308, 0xF0000000,
    0x12000308, 0xF0000000,
    0x02000308, 0xF0000000,
    0xE2000000, 0xF0001EC0,
    0xD2000000, 0xF0001EC0,
    0xC2000000, 0xF0001EC0,
    0xB2000000, 0xF0001EC0,
    0xA2000000, 0xF0001EC0,
    0x92000000, 0xF0001EC0,
    0x82000000, 0xF0001EC0,
    0x72000000, 0xF0001EC0,
    0xE2000490, 0xF0000000,
    0xD2000490, 0xF0000000,
    0xC2000490, 0xF0000000,
    0xB2000490, 0xF0000000,
    0xA2000490, 0xF0000000,
    0x92000490, 0xF0000000,
    0x82000490, 0xF0000000,
    0x72000490, 0xF0000000,
    0xE20002E0, 0xF0001700,
    0xD20002E0, 0xF0001700,
    0xC20002E0, 0xF0001700,
    0xB20002E0, 0xF0001700,
    0xA20002E0, 0xF0000000,
    0x920002E0, 0xF0000000,
    0x820002E0, 0xF0000000,
    0x720002E0, 0xF0000000,
    0x620002E0, 0xF0002E00,
    0x520002E0, 0xF0002E00,
    0x420002E0, 0xF0002E00,
    0x320002E0, 0xF0002E00,
    0x220002E0, 0xF0000000,
    0x120002E0, 0xF0000000,
    0x020002E0, 0xF0000000,
    0xE2000000, 0xF0002280,
    0xD2000000, 0xF0002280,
    0xC2000000, 0xF0002280,
    0xB2000000, 0xF0002280,
    0xA2000000, 0xF0000000,
    0x92000000, 0xF0000000,
    0x82000000, 0xF0000000,
    0x72000000, 0xF0000000,
    0xE2000450, 0xF0001D00,
    0xD2000450, 0xF0001D00,
    0xC2000450, 0xF0001D00,
    0xB2000450, 0xF0001D00,
    0xA2000450, 0xF0000000,
    0x92000450, 0xF0000000,
    0x82000450, 0xF0000000,
    0x72000450, 0xF0000000,
    0xE20002E0, 0xF0002E00,
    0xD20002E0, 0xF0002E00,
    0xC20002E0, 0xF0002E00,
    0xB20002E0, 0xF0002E00,
    0xA20002E0, 0xF0002280,
    0x920002E0, 0xF0002280,
    0x820002E0, 0xF0002280,
    0x720002E0, 0xF0002280,
    0x620002E0, 0xF0000000,
    0x520002E0, 0xF0000000,
    0x420002E0, 0xF0000000,
    0x320002E0, 0xF0000000,
    0x220002E0, 0xF0000000,
    0x120002E0, 0xF0000000,
    0x020002E0, 0xF0000000,
    0xE2000000, 0xF0001D00,
    0xD2000000, 0xF0001D00,
    0xC2000000, 0xF0001D00,
    0xB2000000, 0xF0001D00,
    0xA2000000, 0xF0001D00,
    0x92000000, 0xF0001D00,
    0x82000000, 0xF0001D00,
    0x72000000, 0xF0001D00,
    0xE2000450, 0xF0000000,
    0xD2000450, 0xF0000000,
    0xC2000450, 0xF0000000,
    0xB2000450, 0xF0000000,
    0xA2000450, 0xF0000000,
    0x92000450, 0xF0000000,
    0x82000450, 0xF0000000,
    0x72000450, 0xF0000000,
    0xE2000450, 0xF0001B40,
    0xD2000450, 0xF0001B40,
    0xC2000450, 0xF0001B40,
    0xB2000450, 0xF0001B40,
    0xA2000450, 0xF0001D00,
    0x92000450, 0xF0001D00,
    0x82000450, 0xF0001D00,
    0x72000450, 0xF0001D00,
    0x62000450, 0xF0001EC0,
    0x52000450, 0xF0001EC0,
    0x42000450, 0xF0001EC0,
    0x32000450, 0xF0001EC0,
    0x22000450, 0xF0000000,
    0x12000450, 0xF0000000,
    0x02000450, 0xF0000000,
    0xE20004D0, 0xF0001EC0,
    0xD20004D0, 0xF0001EC0,
    0xC20004D0, 0xF0001EC0,
    0xB20004D0, 0xF0001EC0,
    0xA20004D0, 0xF0002080,
    0x920004D0, 0xF0002080,
    0x820004D0, 0xF0002080,
    0x720004D0, 0xF0002080,
    0x620004D0, 0xF0002280,
    0x520004D0, 0xF0002280,
    0x420004D0, 0xF0002280,
    0x320004D0, 0xF0002280,
    0x220004D0, 0xF0000000,
    0x120004D0, 0xF0000000,
    0x020004D0, 0xF0000000,
    0xE2000568, 0xF0002280,
    0xD2000568, 0xF0002280,
    0xC2000568, 0xF0002280,
    0xB2000568, 0xF0002280,
    0xA2000568, 0xF0002480,
    0x92000568, 0xF0002480,
    0x82000568, 0xF0002480,
    0x72000568, 0xF0002480,
    0x62000568, 0xF0002680,
    0x52000568, 0xF0002680,
    0x42000568, 0xF0002680,
    0x32000568, 0xF0002680,
    0x22000568, 0xF0000000,
    0x12000568, 0xF0000000,
    0x02000568, 0xF0000000,
    0xE20005C0, 0xF0002E00,
    0xD20005C0, 0xF0002E00,
    0xC20005C0, 0xF0002E00,
    0xB20005C0, 0xF0002E00,
    0xA20005C0, 0xF0002E00,
    0x920005C0, 0xF0002E00,
    0x820005C0, 0xF0002E00,
    0x720005C0, 0xF0002E00,
    0x620005C0, 0x00000E80,
    0x520005C0, 0x00000E80,
    0x420005C0, 0x00000E80,
    0x320005C0, 0x00000E80,
    0x220005C0, 0x00000E80,
    0x120005C0, 0x00000E80,
];

const snd_dump_dead = [
    0xF1001F00,
    0xF1001E00,
    0xF1001D00,
    0xF1001C00,
    0xF1001B00,
    0xF1001C00,
    0xF1001D00,
    0xF1001E00,
    0xF1001F00,
    0xF1002000,
    0xF1002100,
    0xE1001D00,
    0xE1001C00,
    0xE1001B00,
    0xE1001A00,
    0xE1001900,
    0xE1001800,
    0xE1001900,
    0xE1001A00,
    0xE1001B00,
    0xE1001C00,
    0xE1001D00,
    0xE1001E00,
    0xD1001B00,
    0xD1001A00,
    0xD1001900,
    0xD1001800,
    0xD1001700,
    0xD1001600,
    0xD1001700,
    0xD1001800,
    0xD1001900,
    0xD1001A00,
    0xD1001B00,
    0xD1001C00,
    0xC1001900,
    0xC1001800,
    0xC1001700,
    0xC1001600,
    0xC1001500,
    0xC1001400,
    0xC1001500,
    0xC1001600,
    0xC1001700,
    0xC1001800,
    0xC1001900,
    0xC1001A00,
    0xB1001700,
    0xB1001600,
    0xB1001500,
    0xB1001400,
    0xB1001300,
    0xB1001200,
    0xB1001300,
    0xB1001400,
    0xB1001500,
    0xB1001600,
    0xB1001700,
    0xB1001800,
    0xA1001500,
    0xA1001400,
    0xA1001300,
    0xA1001200,
    0xA1001100,
    0xA1001000,
    0xA1001100,
    0xA1001200,
    0x80000800,
    0x80001000,
    0x80001800,
    0x80002000,
    0x80002800,
    0x80003000,
    0x80003800,
    0x80004000,
    0x80004800,
    0x80005000,
    0x80005800,
    0x00000000,
    0x80000800,
    0x80001000,
    0x80001800,
    0x80002000,
    0x80002800,
    0x80003000,
    0x80003800,
    0x80004000,
    0x80004800,
    0x80005000,
    0x80005800,
];
