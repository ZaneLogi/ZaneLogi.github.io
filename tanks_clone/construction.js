// construction.js — S13 Construction / stage editor  (DEFERRED — stub only)
//
// The retail ROM ships a built-in stage editor (mode 02). Not core gameplay;
// deferred. stage_FF.bin is its default field.
//
// Absorbs (when un-deferred):
//   loc_C0AE_construction_handler ($C0AE), sub_C6D2_move_construction_cursor,
//   sub_C6C6_paste_created_block, sub_C9B0_create_default_stage_field,
//   sub_D7CC_create_default_stage_field.
// See docs/research_system_interaction_map.md §5 (S13).

export class Construction {
  constructor() { /* deferred */ }
  run() { /* no-op — port $C0AE later */ }
}
