// trob.js — a minimal, LOOSE-FLOOR-ONLY port of SDLPoP's transient-object ("trob")
// system (seg007.c). A trob is a tile that animates over several frames; PoP has many
// (torches, buttons, gates, spikes, potions, loose floors, …). This ports exactly ONE:
// the LOOSE FLOOR. Stand on a loose tile (type 11) and it starts shaking; after
// loose_floor_delay frames it collapses to empty — and the existing fall engine
// (player.js check_on_floor → start_fall) then drops whoever was on it.
//
// Faithful to the mechanism, minimal in scope:
//   - trigger  = check_press → make_loose_fall  (seg006.c:1683 / seg007.c:904)
//   - tick     = process_trobs → animate_loose   (seg007.c:24 / :816)
//   - collapse = remove_loose                    (seg007.c:897): tile → tiles_0_empty
// Deferred by agreement: the falling-debris chunk (add_mob / curmob, a separate mobile
// object) and the shake visual (loose_shake). The floor simply vanishes and he falls.
//
// The collapse timer is the tile's OWN modifier byte — level.rooms[r-1].bg[row][col],
// which IS the source's curr_room_modif[tilepos] (get_curr_tile loads it, animate_tile
// stores it back). A fresh loose tile has modifier 0; make_loose_fall sets it to 1, and
// animate_loose ++'s it each frame up to loose_floor_delay. The player mutates a CLONE
// of the level (never the shared LEVEL1), so a restart restores every loose tile.
//
// Citations are SDLPoP (C:\Z_Temp\SDLPoP\src), segNNN.c:line. GPLv3 (see NOTICE).

export const TILE_LOOSE = 11, TILE_EMPTY = 0;     // tiles_11_loose / tiles_0_empty
export const LOOSE_FLOOR_DELAY = 11;              // custom->loose_floor_delay (seg007.c:832)

const sbyte = (v) => (v << 24 >> 24);             // read a modifier byte as a signed 8-bit

// A fresh trob list. Each entry is a loose tile currently counting down: {room, col, row}.
// (The source's trobs[] also carries the tile TYPE, to dispatch animate_tile; loose-only
// here, so the type is implicit and the row-major tilepos is kept split as col/row.)
export const makeTrobs = () => ({ list: [] });

// make_loose_fall (seg007.c:904): start a loose tile's collapse timer. Guarded twice —
// (1) only a still-present loose tile (type 11 — this subsumes the source's
// `(curr_room_tiles & 0x20)==0` solidity test, since our fg is already masked to the
// low-5-bit type), and (2) not already counting down (`(sbyte)modifier <= 0`, i.e. the
// fresh 0) — so re-stepping a tile that's already shaking is a no-op and never resets it.
export function makeLooseFall(trobs, level, room, col, row) {
  const cell = level.rooms[room - 1];
  if ((cell.fg[row][col] & 0x1F) !== TILE_LOOSE) return;   // solid loose floor only
  if (sbyte(cell.bg[row][col]) > 0) return;                // already falling → don't restart
  cell.bg[row][col] = 1;                                    // curr_room_modif = 1
  trobs.list.push({ room, col, row });                     // add_trob(room, tilepos, 0)
}

// process_trobs (seg007.c:24) → animate_loose (seg007.c:816), loose-only. Each frame,
// for every active loose tile: load its modifier, ++ it (get_curr_tile / animate_loose,
// seg007.c:974/:819); once it reaches loose_floor_delay the tile is REMOVED (→ empty)
// and the trob dropped (remove_loose, seg007.c:897); otherwise it keeps shaking and the
// bumped modifier is stored back (animate_tile, seg007.c:87). Runs at the top of the
// player tick, mirroring process_trobs at the top of play_frame (seg000.c:869) — so a
// tile that ripens this tick is already empty when check_on_floor runs later the same tick.
export function processTrobs(trobs, level) {
  const survivors = [];
  for (const t of trobs.list) {
    const cell = level.rooms[t.room - 1];
    const mod = cell.bg[t.row][t.col] + 1;                 // ++curr_modifier
    if (mod >= LOOSE_FLOOR_DELAY) {
      cell.fg[t.row][t.col] = TILE_EMPTY;                  // remove_loose: curr_room_tiles = tiles_0_empty
      cell.bg[t.row][t.col] = 0;                           // empty-space modifier (source stores tbl_level_type
                                                           // for the empty-tile graphic; we render none, so 0)
    } else {
      cell.bg[t.row][t.col] = mod;                         // keep shaking (store the ++'d modifier)
      survivors.push(t);
    }
  }
  trobs.list = survivors;
}
