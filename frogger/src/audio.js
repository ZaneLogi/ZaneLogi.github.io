// audio.js — the sound service (§5.2). PLACEHOLDER: the trigger sites call this API today,
// but the Web Audio "PSG" + sequencer over dat_sfx.js are ported later. No-ops for now, so
// a jingle-timed screen (RoundClear/GameOver) falls back to its fixed §10 duration.

// SFX ids — filled in when dat_sfx.js is built (the arcade AY-3-8910 sound data).
export const SFX = {};

export class Audio {
  request(_id) {}
  tick() {}
  isPlaying(_id) { return false; }
  playMusic() {}
  stopMusic() {}
}
