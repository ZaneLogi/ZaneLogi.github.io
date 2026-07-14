// audio.js — S11 Audio  (DEFERRED — stub only, low priority per Zane 2026-07-15)
//
// The ROM has a bytecode sound engine: sub_EA7E_sound_driver ($EA7E) is ticked
// once per frame inside the NMI and interprets control bytes (con_se_cb_*: loops,
// stop, main-loop) from sfx data streams (_off000_sfx_* near $ED..). Unlike the
// analog-hardware sound of some arcade ports, this IS ported code — fully
// portable to WebAudio later. Kept as a no-op stub for now.
//
// Absorbs (when un-deferred): sub_EA7E_sound_driver, sub_EA51_clear_sound_engine_data,
//   sub_ECAF/ECBE/ECD0 sfx data pointer handling, the sfx data tables.
// See docs/research_system_interaction_map.md §5 (S11).

export class Audio {
  constructor() { /* deferred */ }
  tick() { /* no-op — port $EA7E later */ }
  play(sfxId) { /* no-op */ }
  clear() { /* no-op */ }
  // pipeline step 16 ($DB0B): engine SFX from whether players are moving.
  movementSfx(roster) { /* no-op — port $DB0B later */ }
}
