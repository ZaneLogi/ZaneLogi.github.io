// audio/sequencer.js — Layer 2 of the sound subsystem (§5.2): the sound SERVICE + the data-driven
// sequencer. It walks the ROM note/SFX streams (assets/dat_sfx.js) and drives the Layer-1 PSG
// (./psg.js) — owning playback state (stream pointer, note-set, tempo, duration, priority) and the
// game-facing API (request / tick / isPlaying / playMusic / stopMusic).
//
// STILL A PLACEHOLDER: the trigger sites call this API today, but the sequencer + PSG wiring land
// later (phase B/C). No-ops for now, so a jingle-timed screen (RoundClear/GameOver) falls back to
// its fixed §10 duration. Dependency will be one-way — this file imports ./psg.js, never the reverse.

// SFX ids — filled in when dat_sfx.js is built (the arcade AY-3-8910 sound data).
export const SFX = {};

export class Audio {
  request(_id) {}
  tick() {}
  isPlaying(_id) { return false; }
  playMusic() {}
  stopMusic() {}
}
