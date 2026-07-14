// field.js — S2 Field / battlefield  (the CENTRAL shared service)
//
// The ROM keeps a nametable mirror at $0400-$07FF that is SIMULTANEOUSLY the
// tilemap (what's drawn) and the collision grid: tile ids describe terrain, and
// bit7 of a cell is a dynamic tank-occupancy flag. Tank movement, bullet-terrain
// collision, base walls, and occupancy all read/write this one buffer — so in
// this OO port `Field` is a shared service most other objects query, matching
// the source rather than fighting it.
//
// Absorbs:
//   sub_F000_draw_stage ($F000)                      — build field from stage_XX.bin
//   tbl_DACB_block_data                              — block/terrain definitions
//   sub_D80B_write_block_tiles_and_attribute...      — block → tiles+attribute
//   sub_E181_ice_detection ($E181)                   — ice under players + occupancy
//   sub_E1FA ($E1FA)                                 — occupancy writeback (bit7)
//   sub_D706/D709_calculate_pointer, D713_divide_XY_by_08 — pixel → cell
// See docs/research_system_interaction_map.md §5 (S2), §6 (coupling).

export class Field {
  constructor() {
    // TODO: decide cell model. Source: nametable mirror $0400-$07FF; play area
    // is a grid of 16x16 blocks (each block = 2x2 tiles). [?] confirm geometry
    // against F000/tbl_DACB (map §8).
    this.tiles = null;      // terrain tile ids
    this.occupancy = null;  // bit7 overlay in source; separate grid here
  }

  loadStage(stageBytes) { /* TODO: port $F000 draw_stage */ }

  // pixel (x,y) → cell index / pointer  ($D706 / $D713)
  pixelToCell(x, y) { /* TODO */ }

  // terrain query used by tank movement & bullet collision
  terrainAt(cellX, cellY) { /* TODO */ }
  isPassable(cellX, cellY) { /* TODO: brick/steel/water block; ice passable */ }
  isIce(cellX, cellY) { /* TODO: TERRAIN.ICE — see $E181 */ }

  // --- pipeline entry points (called from Game.update, map §3) ---
  // step 1 ($E181): each tank's pixel pos -> cell; set ice flag on players; mark
  // 2x2 occupancy pre-move. Cross-cutting: also writes tank ice-flags.
  iceDetectAndMarkOccupancy(roster) { /* TODO: port $E181 */ }
  // step 4 ($E1FA): re-mark occupancy after movement.
  occupancyWriteback(roster) { /* TODO: port $E1FA */ }

  // dynamic tank occupancy (bit7) helpers used by the two entry points above.
  clearOccupancy() { /* TODO */ }
  markTankFootprint(tank) { /* TODO: occupancy bit7 writes */ }
  isOccupied(cellX, cellY) { /* TODO */ }

  // bullet hitting brick erases it; steel blocks unless bullet is upgraded ($E604)
  damageTerrain(cellX, cellY, bulletPower) { /* TODO */ }
}
