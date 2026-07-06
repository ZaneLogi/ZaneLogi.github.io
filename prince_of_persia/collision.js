// collision.js — the PoP tile-collision *substrate* (logic): a faithful JS port of
// SDLPoP's tile accessor + collision predicates + the internal coordinate helpers.
// Everything here is PoP-agnostic over a decoded level (res/level<N>.js) — it answers
// the two questions collision needs (research_collision.md §0): WHERE am I (position ->
// tile) and WHAT is there (tile -> floor/wall). Consumed by the player (player.js) and
// the block-map demo (demos/blockmap.js). GPLv3 (see NOTICE).
//
// Citations are SDLPoP (C:\Z_Temp\SDLPoP\src), segNNN.c:line.

// --- internal coordinate system (types.h:1427-1434) ---
export const SCREENSPACE_X = 58;   // room's left edge in internal-x
export const TILE_SIZEX = 14;      // tile width in internal-x
export const TILE_MIDX = 7;        // tile mid  (get_tile_div_mod_m7 uses xpos-7)
export const TILE_RIGHTX = 13;     // tile right edge (sub-tile 0..13)
export const TILE_SIZEY = 63;      // tile height in internal-y (types.h:1430)
export const SCREEN_TILECOUNTX = 10;                 // columns per room
export const FIRST_ONSCREEN_COLUMN = 5;              // x_bump index base (types.h:1434)
export const ROOM_XSPAN = TILE_SIZEX * SCREEN_TILECOUNTX;   // 140 — one room-width in internal-x
export const ROOM_YSPAN = 189;     // one room-height in internal-y (goto_other_room, seg002.c:410/415)

// y_land[curr_row+1] = the feet-y for a character standing in curr_row (data.h:506).
export const Y_LAND = [-8, 55, 118, 181, 244];

// x_bump[col + FIRST_ONSCREEN_COLUMN] = the left-edge internal-x of column `col`
// (data.h:513). For on-screen cols 0..9 this is 58 + col*14.
export const X_BUMP = [-12, 2, 16, 30, 44, 58, 72, 86, 100, 114,
                       128, 142, 156, 170, 184, 198, 212, 226, 240, 254];

// dir_front / dir_behind (data.h:579/581): tile column offset in the char's facing /
// opposite direction. Index by (direction + 1): left(-1)->0, right(0)->1.
export const DIR_FRONT = [-1, 1];
export const DIR_BEHIND = [1, -1];

// --- tile-type collision predicates (ported seg006.c) ---
// tile_is_floor (seg006.c:951): a surface to stand on — everything EXCEPT these.
export const NOT_FLOOR = new Set([0, 9, 12, 20, 26, 27, 28, 29]);
export const tileIsFloor = (t) => !NOT_FLOOR.has(t);

// wall_type (seg006.c:1626): vertical obstacle + which side. 0 = not a wall.
export function wallType(t) {
  if (t === 4 || t === 7 || t === 12) return 1;   // gate / doortop+floor / doortop -> wall at right
  if (t === 13) return 2;                          // mirror -> wall at left
  if (t === 18) return 3;                          // chomper -> obstacle at left
  if (t === 20) return 4;                          // wall -> both sides
  return 0;
}

// can_grab (seg006.c:1606): can the char grab the `target` tile THROUGH the `through` tile? The
// through-tile is the one the hands pass in front of; the target is the ledge they land on. Ported
// with our loose_floor_delay == 11, so `!(delay > 11)` is true and a shaking loose target (modifier
// != 0) is not grabbable. Tile types: 7 doortop+floor, 11 loose, 12 doortop, 20 wall.
export function canGrab(through, target, targetModifier, facingRight) {
  if (through === 20) return 0;                            // can't grab through a wall
  if (through === 12 && facingRight) return 0;             // can't grab through a doortop facing right
  if (tileIsFloor(through)) return 0;                      // can't grab through a floor
  if (target === 11 && targetModifier !== 0) return 0;     // can't grab a shaking loose floor
  if (target === 7 && !facingRight) return 0;              // doortop+floor grabbable only from the left
  if (!tileIsFloor(target)) return 0;                      // must have a floor to grab onto
  return 1;
}

// --- get_tile: the universal accessor with auto room-crossing (seg006.c:28/46) ---
// Mirrors find_room_of_tile: an out-of-range col/row hops the matching roomlink; a
// missing neighbour is room 0 = the void, which reads as tiles_20_wall. Pure over
// `level` (res/level<N>.js). Returns the tile TYPE (0..30).
export function getTile(level, room, col, row) {
  // find_room_of_tile (seg006.c:46). Order per the FIX_CORNER_GRAB-off build:
  // col<0, col>=10, row<0, row>=3, looping until in range.
  for (;;) {
    if (col < 0)  { col += 10; room = room ? level.rooms[room - 1].links.left  : 0; continue; }
    if (col >= 10){ col -= 10; room = room ? level.rooms[room - 1].links.right : 0; continue; }
    if (row < 0)  { row += 3;  room = room ? level.rooms[room - 1].links.up    : 0; continue; }
    if (row >= 3) { row -= 3;  room = room ? level.rooms[room - 1].links.down  : 0; continue; }
    break;
  }
  if (room > 0) return level.rooms[room - 1].fg[row][col] & 0x1F;  // low 5 bits = type (seg006.c:37)
  return 20;                                                        // room 0 -> tiles_20_wall (seg006.c:40)
}

// getTileModif: the bg MODIFIER byte at a tile (curr_room_modif in source), with the same
// room-crossing as getTile. can_grab reads it to reject grabbing a shaking loose floor.
export function getTileModif(level, room, col, row) {
  for (;;) {
    if (col < 0)  { col += 10; room = room ? level.rooms[room - 1].links.left  : 0; continue; }
    if (col >= 10){ col -= 10; room = room ? level.rooms[room - 1].links.right : 0; continue; }
    if (row < 0)  { row += 3;  room = room ? level.rooms[room - 1].links.up    : 0; continue; }
    if (row >= 3) { row -= 3;  room = room ? level.rooms[room - 1].links.down  : 0; continue; }
    break;
  }
  return room > 0 ? level.rooms[room - 1].bg[row][col] : 0;
}

// --- x <-> column (get_tile_div_mod / _m7, seg006.c:697/750) ---
// Floor-divide the internal-x into a tile column. get_tile_div_mod_m7 evaluates the
// same on (xpos - 7), the tile-mid point determine_col samples at.
export function tileDivMod(xpos) {
  return Math.floor((xpos - SCREENSPACE_X) / TILE_SIZEX);   // xh (column)
}
export function tileDivModM7(xpos) {
  return tileDivMod(xpos - TILE_MIDX);
}
// sub-tile offset 0..13 of xpos within its column (the `xl` of get_tile_div_mod).
export function tileMod(xpos) {
  return ((xpos - SCREENSPACE_X) % TILE_SIZEX + TILE_SIZEX) % TILE_SIZEX;
}

// standX(col): the room-relative Char.x a character standing in `col` rests at
// (do_startpos, seg003.c:155): x_bump[col+5] + TILE_SIZEX.
export const standX = (col) => X_BUMP[col + FIRST_ONSCREEN_COLUMN] + TILE_SIZEX;

// tiles_20_wall — the void / solid-wall tile type.
export const TILE_WALL = 20;

// --- edge classification (types.h:1421-1424) — get_edge_distance's edge_type ---
export const EDGE_CLOSER = 0, EDGE_WALL = 1, EDGE_FLOOR = 2;

// --- char-relative tile accessors (seg006.c) — pure over (level, ch) ---
// ch carries {room, curr_col, curr_row, direction}. Facing: right = dir 0, left = dir -1;
// DIR_FRONT/DIR_BEHIND are indexed by (direction + 1).
export const getTileAtChar = (level, ch) =>
  getTile(level, ch.room, ch.curr_col, ch.curr_row);                                   // seg006.c:1007
export const getTileInFrontOfChar = (level, ch) =>
  getTile(level, ch.room, ch.curr_col + DIR_FRONT[ch.direction + 1], ch.curr_row);     // seg006.c:1305
export const getTileBehindChar = (level, ch) =>
  getTile(level, ch.room, ch.curr_col + DIR_BEHIND[ch.direction + 1], ch.curr_row);    // seg006.c:1318
// the row-above variants (curr_row - 1), used by the jump-up / grab tests.
export const getTileAboveChar = (level, ch) =>
  getTile(level, ch.room, ch.curr_col, ch.curr_row - 1);                               // seg006.c:1644
export const getTileFrontAboveChar = (level, ch) =>
  getTile(level, ch.room, ch.curr_col + DIR_FRONT[ch.direction + 1], ch.curr_row - 1); // seg006.c:1654
export const getTileBehindAboveChar = (level, ch) =>
  getTile(level, ch.room, ch.curr_col + DIR_BEHIND[ch.direction + 1], ch.curr_row - 1);// seg006.c:1649

// distance_to_edge (seg006.c:1328): the sub-tile distance from `xpos` to the edge of its
// tile in the char's facing direction (0..13). The caller passes dx_weight() as xpos.
export function distanceToEdge(ch, xpos) {
  const xl = tileMod(xpos - TILE_MIDX);            // obj_xl of get_tile_div_mod_m7
  return ch.direction >= 0 ? (TILE_RIGHTX - xl) : xl;   // facing right -> distance to right edge
}

// y_to_row_mod4 (seg006.c:804): map an internal-y to its room row (used to re-derive
// curr_row after a vertical room crossing).
export const yToRowMod4 = (y) => Math.floor((y + 60) / TILE_SIZEY) % 4 - 1;
