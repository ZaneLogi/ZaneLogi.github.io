// audio/sequencer.js — Layer 2 of the sound subsystem (§5.2): the public Audio API + the data-driven
// sequencer. It walks the arcade note streams (assets/dat_sfx.js) and drives the Layer-1 PSG (./psg.js).
// Dependency is one-way: this file imports ./psg.js, never the reverse.
//
// Stream byte = ccc_nnnnn, decoded by (b & 0x1F):
//   0x00 = REST       — silence for the note's length.
//   0x1F = COMMAND    — ccc picks it: 0 set note-set (+arg), 1 set tempo (+arg), 2 set volume (+arg),
//                       3..7 end of song.
//   else = NOTE       — nnnnn = note (1..30); ccc = length → 2^(ccc-1) length-units.
// A note's frequency = NOTE_FREQS[NOTE_SETS[set] + note - 1]  (the -1 reproduces the arcade's
// off-by-one — FAITHFUL_PITCH toggles it; drop it for the "written" pitches, a semitone higher). A length-unit
// lasts `tempo` sound-ticks and a tick is 1/TICK_HZ s; tempo is song-global. Events are scheduled
// ahead on the PSG's sample-accurate clock, so playback is decoupled from the game's frame rate.
import { PSG } from './psg.js';
import { SONGS, NOTE_FREQS, NOTE_SETS, TEMPOS, TICK_HZ } from '../../assets/dat_sfx.js';

const FAITHFUL_PITCH = true;   // reproduce the arcade's off-by-one (heard = a semitone below the written score)
const PEAK = 0.28;             // gain at AY volume 15
const gainForVol = (v) => (v / 15) * PEAK;

// Which song each request() id plays. The short gameplay SFX (hop / plunk / squash / …) are a separate
// ROM mechanism, not yet extracted, so their ids fall through to a no-op for now.
const REQUEST_SONG = { level_complete: 'levelcomplete', game_over: 'gameover' };

export const SFX = REQUEST_SONG;

export class Audio {
  constructor() {
    this.psg = null;
    this._music = null;          // { endTime } while the theme is looping
    this._until = new Map();     // request id → schedule end time (for isPlaying)
  }

  _ensure() {
    if (!this.psg) this.psg = new PSG();
    this.psg.resume();
    return this.psg;
  }

  // Tempo is song-global (voice A sets it once up front). Return the first tempo command's value.
  _tempo(streams) {
    for (const s of streams) {
      for (let i = 0; i < s.length;) {
        const b = s[i++], n = b & 0x1F, ccc = b >> 5;
        if (n === 0x1F) { if (ccc === 1) return TEMPOS[s[i]]; if (ccc <= 2) i++; else break; }
      }
    }
    return TEMPOS[12];
  }

  // Schedule one voice stream on `voice`, from time `start`; return the time it ends.
  _voice(voice, bytes, start, tempo) {
    let t = start, set = 0, vol = 7;
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i++], n = b & 0x1F, ccc = b >> 5;
      if (n === 0x1F) {                                    // command
        if (ccc === 0) set = bytes[i++];
        else if (ccc === 1) tempo = TEMPOS[bytes[i++]];
        else if (ccc === 2) vol = bytes[i++];
        else break;                                        // 3..7 = end of song
        continue;
      }
      const dur = (1 << (ccc - 1)) * tempo / TICK_HZ;      // seconds
      if (n === 0) voice.noteOff(t);                       // rest
      else {
        const f = NOTE_FREQS[NOTE_SETS[set] + n - (FAITHFUL_PITCH ? 1 : 0)];
        if (f) { voice.setFreq(f, t); voice.noteOn(gainForVol(vol), t); voice.noteOff(t + dur); }
      }
      t += dur;
    }
    return t;
  }

  // Schedule all three voices of a song from `start`; return the latest voice end time.
  _song(streams, start) {
    const tempo = this._tempo(streams);
    let end = start;
    streams.forEach((bytes, v) => {
      if (bytes.length > 1) end = Math.max(end, this._voice(this.psg.tone[v], bytes, start, tempo));
    });
    return end;
  }

  playMusic() {
    const p = this._ensure();
    this._music = { endTime: this._song(SONGS.main, p.now + 0.06) };
  }

  stopMusic() {
    this._music = null;
    if (this.psg) for (const v of this.psg.voices) v.noteOff();
  }

  request(id) {
    const key = REQUEST_SONG[id];
    if (!key || !SONGS[key]) return;                       // SFX not extracted yet → no-op
    const p = this._ensure();
    this._until.set(id, this._song(SONGS[key], p.now + 0.03));
  }

  // §7 step 6. Loop the theme: when the current schedule is nearly spent, seamlessly append the next
  // repetition (called every game frame — decoupled from the audio clock the events are scheduled on).
  tick() {
    const m = this._music;
    if (m && this.psg && this.psg.now >= m.endTime - 0.1) m.endTime = this._song(SONGS.main, m.endTime);
  }

  isPlaying(id) {
    const end = this._until.get(id);
    return !!end && !!this.psg && this.psg.now < end;
  }
}
