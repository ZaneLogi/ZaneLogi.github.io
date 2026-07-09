// collision_kernel.js — the ROUTINE-LEVEL-IDENTICAL port of SDLPoP's kid-vs-environment
// collision kernel. Unlike collision.js (pure helpers), this module mirrors the C's GLOBAL
// STATE model: get_tile sets side-effect globals (curr_room/tile_col/…), the per-column
// collision buffers are module-level arrays, and every routine reads/writes those globals
// exactly as seg004.c/seg006.c do. This is deliberate — it is what makes the clone
// line-by-line comparable to the source (and value-diffable against a live DOS hook), which
// is the whole point of un-substituting the old Char.x-clamp stand-in.
//
// Bind the kid + level once (bindKernel), then the routines run over Char (=== the player's
// `ch`, same object) and `level`. Citations are SDLPoP (C:\Z_Temp\SDLPoP\src), segNNN.c:line.
// GPLv3 (see NOTICE).
import { FRAME_TABLE_KID } from './res/frame_table_kid.js';
import { charDxForward, startSeq, playSeq } from './playseq.js';
import {
  SCREENSPACE_X, TILE_SIZEX, TILE_MIDX, TILE_RIGHTX, TILE_SIZEY, FIRST_ONSCREEN_COLUMN,
  SCREEN_TILECOUNTX, ROOM_XSPAN, X_BUMP, Y_LAND, TILE_WALL, DIR_FRONT, DIR_BEHIND,
  wallType, tileIsFloor, EDGE_WALL, EDGE_FLOOR, EDGE_CLOSER,
} from './collision.js';

// ---- bound state (the "current character" + world) ------------------------------------
// Char is the C's global `Char` (here always the Kid — no guards yet). It IS the player's
// `ch` object (same reference), so kernel writes to Char.x land on ch.x with no sync.
let Char = null, level = null, getSprite = null, getDrawnRoom = null;
export function bindKernel(opts) { Char = opts.Char; getSprite = opts.getSprite; getDrawnRoom = opts.getDrawnRoom; }
export function setLevel(lv) { level = lv; }          // resetLevel reassigns the clone -> re-point
// drawn_room is read LIVE via getDrawnRoom() (never cached) — a cached copy went stale on restart /
// teleport (which set the player's drawnRoom without a sync call), computing a cross-boundary wall's
// face a full room-width off and flinging Char.x to the wrong room.

// ---- side-effect globals mirroring the C ----------------------------------------------
// get_tile writes these (seg006.c:28); collision routines read them right after a get_tile.
let curr_room = 0, tile_col = 0, tile_row = 0, curr_tilepos = 0, curr_tile2 = 0;
// load_frame_to_obj (seg008.c:1728) + get_tile_div_mod (seg006.c:799).
let obj_x = 0, obj_y = 0, obj_xl = 0, obj_direction = 0, obj_id = 0, cur_frame = null;
// set_char_collision (seg006.c:1012).
let char_x_left = 0, char_x_left_coll = 0, char_x_right = 0, char_x_right_coll = 0;
let char_width_half = 0, char_height = 0, char_top_y = 0, char_top_row = 0, char_bottom_row = 0;
let char_col_left = 0, char_col_right = 0;
// the wall-face anchor (seg004.c:34) + edge classification (types.h:1421).
let coll_tile_left_xpos = 0;
export let edge_type = EDGE_FLOOR;   // live binding: player reads it after get_edge_distance
// per-column collision buffers (seg004.c:20-31) — one entry per on-screen column (0..9).
const curr_row_coll_flags = new Array(10).fill(0),  curr_row_coll_room = new Array(10).fill(-1);
const above_row_coll_flags = new Array(10).fill(0), above_row_coll_room = new Array(10).fill(-1);
const below_row_coll_flags = new Array(10).fill(0), below_row_coll_room = new Array(10).fill(-1);
const prev_coll_flags = new Array(10).fill(0),      prev_coll_room = new Array(10).fill(-1);
let collision_row = 0, prev_collision_row = 0, left_checked_col = 0, right_checked_col = 0;
let bump_col_left_of_wall = -1, bump_col_right_of_wall = -1;
let infrontx = 0, jumped_through_mirror = 0;

// ---- constant tables (verbatim) -------------------------------------------------------
// wall_dist_from_left/right[wall_type] — the sub-tile inset of a wall's near face (seg004.c:37/39).
const wall_dist_from_left  = [0, 10, 0, -1, 0, 0];
const wall_dist_from_right = [0, 0, 10, 13, 0, 0];
const TBL_LINE = [0, 10, 20];                       // tbl_line[row] flat-index base (seg006.c:105)
// tile types the kernel special-cases (types.h).
const TILE_EMPTY = 0, TILE_GATE = 4, TILE_DOORTOP_FLOOR = 7, TILE_LOOSE = 11, TILE_DOORTOP = 12,
      TILE_MIRROR = 13, TILE_CHOMPER = 18, TILE_POTION = 10;
// character actions (types.h:407) + directions.
const ACT_STAND = 0, ACT_IN_FREEFALL = 4, ACT_BUMPED = 5, ACT_HANG_CLIMB = 2, ACT_HANG_STRAIGHT = 6, ACT_TURN = 7;
const DIR_RIGHT = 0;
const facingLeft = () => Char.direction < DIR_RIGHT;

// ---- current-tile modifier (bg byte) access -------------------------------------------
// The C reads curr_room_modif[curr_tilepos]; the clone's level is 2D, so index by the same
// (curr_room, tile_row, tile_col) get_tile just resolved. Value-identical to the flat read.
function currModif()      { return curr_room > 0 ? level.rooms[curr_room - 1].bg[tile_row][tile_col] : 0; }
function setCurrModif(v)  { if (curr_room > 0) level.rooms[curr_room - 1].bg[tile_row][tile_col] = v; }

// =======================================================================================
// TILE ACCESS  (seg006.c) — get_tile with its side-effect globals + the char-relative reads
// =======================================================================================

// find_room_of_tile (seg006.c:46): normalize an out-of-range col/row by hopping the matching
// room link; a 0 link is the void (room 0). DOS-original order (cols before rows — the
// non-FIX_CORNER_GRAB branch, matching this DOS port). Mutates tile_col/tile_row/curr_room.
function find_room_of_tile() {
  for (;;) {
    if (tile_col < 0)  { tile_col += 10; if (curr_room) curr_room = level.rooms[curr_room - 1].links.left;  continue; }
    if (tile_col >= 10){ tile_col -= 10; if (curr_room) curr_room = level.rooms[curr_room - 1].links.right; continue; }
    if (tile_row < 0)  { tile_row += 3;  if (curr_room) curr_room = level.rooms[curr_room - 1].links.up;    continue; }
    if (tile_row >= 3) { tile_row -= 3;  if (curr_room) curr_room = level.rooms[curr_room - 1].links.down;  continue; }
    return curr_room;
  }
}

// get_tile (seg006.c:28): THE tile accessor. Sets curr_room/tile_col/tile_row/curr_tilepos/
// curr_tile2 as side effects; returns the tile TYPE (low 5 bits). Room 0 = the void wall.
export function get_tile(room, col, row) {
  curr_room = room; tile_col = col; tile_row = row;
  curr_room = find_room_of_tile();
  if (curr_room > 0) {
    curr_tilepos = TBL_LINE[tile_row] + tile_col;                       // informational (clone level is 2D)
    curr_tile2 = level.rooms[curr_room - 1].fg[tile_row][tile_col] & 0x1F;
  } else {
    curr_tile2 = TILE_WALL;                                             // level_edge_hit_tile (seg006.c:40)
  }
  return curr_tile2;
}

// char-relative reads (seg006.c). get_tile_infrontof_char stores the PRE-normalization column
// in `infrontx` (seg006.c:1306) — load-bearing: get_edge_distance feeds that raw -1/10 (not the
// hopped 9/0) to dist_from_wall_forward so x_bump indexes the off-screen entry directly.
function get_tile_at_char()        { return get_tile(Char.room, Char.curr_col, Char.curr_row); }
function get_tile_infrontof_char() { infrontx = DIR_FRONT[Char.direction + 1] + Char.curr_col; return get_tile(Char.room, infrontx, Char.curr_row); }
function get_tile_behind_char()    { return get_tile(Char.room, DIR_BEHIND[Char.direction + 1] + Char.curr_col, Char.curr_row); }

// =======================================================================================
// COORDINATES  (seg006.c) — internal-x <-> column, the weight point, sub-tile distance
// =======================================================================================

// get_tile_div_mod (seg006.c:750): internal-x -> tile column (xh), sets obj_xl (the sub-tile
// offset). The DOS table-overflow simulation (xpos<0 / >=256) is NOT reached by the wall/edge
// path (xpos stays in-range), so the floor-div branch — byte-identical to the LUT for every
// value this kernel produces — is the faithful path; overflow-compat is intentionally omitted.
function get_tile_div_mod(xpos) {
  const x = xpos - SCREENSPACE_X;
  let xl = x % TILE_SIZEX, xh = Math.trunc(x / TILE_SIZEX);
  if (xl < 0) { xh -= 1; xl += TILE_SIZEX; }
  obj_xl = xl;
  return xh;
}
function get_tile_div_mod_m7(xpos) { return get_tile_div_mod(xpos - TILE_MIDX); }

// char_dx_forward is shared with the engine (playseq.js) — Char.x ± delta by facing.
function char_dx_forward(delta) { return charDxForward(Char, delta); }

// dx_weight (seg006.c:547): the weight point ~10 units behind the leading edge.
function dx_weight() {
  const f = FRAME_TABLE_KID[Char.frame];
  return char_dx_forward(f[2] - (f[4] & 0x1F));       // cur_frame.dx - (flags & FRAME_WEIGHT_X)
}

// determine_col (seg006.c:122): curr_col derived from the weight point — UNCLAMPED.
export function determine_col() { Char.curr_col = get_tile_div_mod_m7(dx_weight()); }

// distance_to_edge (seg006.c:1328): sub-tile distance from xpos to its tile's forward edge.
function distance_to_edge(xpos) {
  get_tile_div_mod_m7(xpos);
  let distance = obj_xl;
  if (Char.direction === DIR_RIGHT) distance = TILE_RIGHTX - distance;
  return distance;
}
function distance_to_edge_weight() { return distance_to_edge(dx_weight()); }

// y_to_row_mod4 (seg006.c:804).
function y_to_row_mod4(ypos) { return Math.trunc((ypos + 60) / TILE_SIZEY) % 4 - 1; }

// =======================================================================================
// CHAR BOX  (seg008.c / seg006.c) — load_frame_to_obj + set_char_collision
// =======================================================================================

// load_frame (seg006.c): pull the current frame's table entry into cur_frame.
function load_frame() {
  const f = FRAME_TABLE_KID[Char.frame];
  cur_frame = { image: f[0], dx: f[2], dy: f[3], flags: f[4] };
}

// load_frame_to_obj (seg008.c:1728): the draw/collision anchor. obj_x = internal*2 - 116; the
// even/odd ±1 (seg008.c:1738) is collision-invariant here (obj_x is even, so obj_x/2 floors it
// away) — included for literal fidelity; it never moves char_x_left.
export function load_frame_to_obj() {
  load_frame();
  obj_direction = Char.direction;
  obj_id = cur_frame.image;
  obj_x = (char_dx_forward(cur_frame.dx) << 1) - 116;
  obj_y = cur_frame.dy + Char.y;
  if (((cur_frame.flags ^ (obj_direction & 0xFF)) & 0x80) === 0) obj_x++;
}

// set_char_collision (seg006.c:1012): the collision box in internal-x. char_x_left = obj_x/2+58
// (= the drawn x); facing right subtracts the sprite half-width so the LEADING edge is Char.x
// (facing right -> char_x_right == Char.x; facing left -> char_x_left == Char.x). FRAME_THIN
// insets both by 4. char_col_left/right are the CLAMPED [0,9] scan-helper columns (never curr_col).
export function set_char_collision() {
  const image = getSprite ? getSprite(Char.frame) : null;
  if (image == null) { char_width_half = 0; char_height = 0; }
  else { char_width_half = (image.w + 1) >> 1; char_height = image.h; }
  char_x_left = (obj_x >> 1) + 58;
  if (Char.direction >= DIR_RIGHT) char_x_left -= char_width_half;
  char_x_left_coll = char_x_left;
  char_x_right_coll = char_x_right = char_x_left + char_width_half;
  char_top_y = obj_y - char_height + 1;
  if (char_top_y >= 192) char_top_y = 0;
  char_top_row = y_to_row_mod4(char_top_y);
  char_bottom_row = y_to_row_mod4(obj_y);
  if (char_bottom_row === -1) char_bottom_row = 3;
  char_col_left = Math.max(get_tile_div_mod(char_x_left), 0);
  char_col_right = Math.min(get_tile_div_mod(char_x_right), 9);
  if (cur_frame.flags & 0x20 /*FRAME_THIN*/) { char_x_left_coll += 4; char_x_right_coll -= 4; }
}

// =======================================================================================
// WALL FACES  (seg004.c) — the sub-tile near-face x, via the wall_dist tables
// =======================================================================================

// can_bump_into_gate (seg004.c:373): a gate blocks only while its open height (modif>>2)+6 is
// below the character; a raised gate lets him walk under. char_height = current sprite height.
function can_bump_into_gate() { return ((currModif() >> 2) + 6) < char_height; }

// xpos_in_drawn_room (seg004.c:254): offset a neighbour-room tile's x by one room-width when it
// is being read across the drawn-room boundary (the straddle), so its face lands in Char.x space.
function xpos_in_drawn_room(xpos) {
  const drawnRoom = getDrawnRoom();
  if (curr_room !== drawnRoom) {
    const L = level.rooms[drawnRoom - 1].links;
    if (curr_room === L.left)  xpos -= TILE_SIZEX * SCREEN_TILECOUNTX;
    else if (curr_room === L.right) xpos += TILE_SIZEX * SCREEN_TILECOUNTX;
  }
  return xpos;
}

// get_left_wall_xpos / get_right_wall_xpos (seg004.c:131/141): the near-face internal-x of a wall
// at (room,col,row), anchored at coll_tile_left_xpos (tile-mid) + the per-type wall_dist inset.
function get_left_wall_xpos(room, column, row) {
  const type = wallType(get_tile(room, column, row));
  return type ? wall_dist_from_left[type] + coll_tile_left_xpos : 0xFF;
}
function get_right_wall_xpos(room, column, row) {
  const type = wallType(get_tile(room, column, row));
  return type ? coll_tile_left_xpos - wall_dist_from_right[type] + TILE_RIGHTX : 0;
}

// =======================================================================================
// BUFFER SCAN  (seg004.c) — fill the per-column buffers + edge-detect a fresh bump
// =======================================================================================

// move_coll_to_prev (seg004.c:76): copy the row the char was ON into prev_coll_*, and clear the
// three current-row buffers (with the FIX_COLL_FLAGS zero-out, which SDLPoP enables by default).
function move_coll_to_prev() {
  let flagsSrc, roomSrc;
  if (collision_row === prev_collision_row || collision_row + 3 === prev_collision_row || collision_row - 3 === prev_collision_row) {
    flagsSrc = curr_row_coll_flags; roomSrc = curr_row_coll_room;
  } else if (collision_row + 1 === prev_collision_row || collision_row - 2 === prev_collision_row) {
    flagsSrc = above_row_coll_flags; roomSrc = above_row_coll_room;
  } else {
    flagsSrc = below_row_coll_flags; roomSrc = below_row_coll_room;
  }
  for (let c = 0; c < 10; c++) {
    prev_coll_room[c] = roomSrc[c]; prev_coll_flags[c] = flagsSrc[c];
    below_row_coll_room[c] = -1; above_row_coll_room[c] = -1; curr_row_coll_room[c] = -1;
    curr_row_coll_flags[c] = 0; below_row_coll_flags[c] = 0; above_row_coll_flags[c] = 0;  // FIX_COLL_FLAGS
  }
}

// get_row_collision_data (seg004.c:110): for one row, pack each scanned column's wall flags
// (low nibble = a wall's LEFT face is within char_x_right_coll; high nibble = its RIGHT face is
// beyond char_x_left_coll) and store which room the wall is in. coll_tile_left_xpos walks the row.
function get_row_collision_data(row, roomBuf, flagsBuf) {
  const room = Char.room;
  coll_tile_left_xpos = X_BUMP[left_checked_col + FIRST_ONSCREEN_COLUMN] + TILE_MIDX;
  for (let column = left_checked_col; column <= right_checked_col; column++) {
    const left_wall_xpos  = get_left_wall_xpos(room, column, row);
    const right_wall_xpos = get_right_wall_xpos(room, column, row);
    let flags = (left_wall_xpos < char_x_right_coll) ? 0x0F : 0;
    if (right_wall_xpos > char_x_left_coll) flags |= 0xF0;
    flagsBuf[tile_col] = flags;                     // tile_col = the normalized [0,9] col (get_tile side effect)
    roomBuf[tile_col] = curr_room;
    coll_tile_left_xpos += TILE_SIZEX;
  }
}

// check_collisions (seg004.c:42): fill the 3-row band + edge-detect a bump (a wall flag going
// 0 -> nonzero, in the same room as last frame). A turn never bumps (seg004.c:44).
export function check_collisions() {
  bump_col_left_of_wall = bump_col_right_of_wall = -1;
  if (Char.action === ACT_TURN) return;
  collision_row = Char.curr_row;
  move_coll_to_prev();
  prev_collision_row = collision_row;
  right_checked_col = Math.min(get_tile_div_mod_m7(char_x_right_coll) + 2, 11);
  left_checked_col = get_tile_div_mod_m7(char_x_left_coll) - 1;
  get_row_collision_data(collision_row,     curr_row_coll_room,  curr_row_coll_flags);
  get_row_collision_data(collision_row + 1, below_row_coll_room, below_row_coll_flags);
  get_row_collision_data(collision_row - 1, above_row_coll_room, above_row_coll_flags);
  for (let column = 9; column >= 0; column--) {
    if (curr_row_coll_room[column] >= 0 && prev_coll_room[column] === curr_row_coll_room[column]) {
      if ((prev_coll_flags[column] & 0x0F) === 0 && (curr_row_coll_flags[column] & 0x0F) !== 0) bump_col_left_of_wall = column;
      if ((prev_coll_flags[column] & 0xF0) === 0 && (curr_row_coll_flags[column] & 0xF0) !== 0) bump_col_right_of_wall = column;
    }
  }
}

// =======================================================================================
// BUMP  (seg004.c) — is_obstacle filter + the bumped/bumped_floor/bumped_fall dispatch
// =======================================================================================

// is_obstacle (seg004.c:231): filter the tile at the bump column. A potion isn't a wall; a gate
// is a wall only if can_bump_into_gate; a chomper only if closed (modif==2); a mirror hit by a
// right-to-left run-jump breaks instead of blocking. Sets coll_tile_left_xpos (straddle-offset).
function is_obstacle() {
  if (curr_tile2 === TILE_POTION) return 0;
  else if (curr_tile2 === TILE_GATE) { if (!can_bump_into_gate()) return 0; }
  else if (curr_tile2 === TILE_CHOMPER) { if (currModif() !== 2) return 0; }
  else if (curr_tile2 === TILE_MIRROR && Char.charid === 0 /*kid*/ &&
           Char.frame >= 39 && Char.frame < 44 /*run-jump*/ && facingLeft()) {
    setCurrModif(0x56); jumped_through_mirror = -1; return 0;
  }
  coll_tile_left_xpos = xpos_in_drawn_room(X_BUMP[tile_col + FIRST_ONSCREEN_COLUMN]) + TILE_MIDX;
  return 1;
}

// is_obstacle_at_col (seg004.c:218): read the bump-column tile in the room the buffer recorded,
// then filter it. tile_row wraps to [0,3) like the source.
function is_obstacle_at_col(col) {
  let row = Char.curr_row;
  if (row < 0) row += 3;
  if (row >= 3) row -= 3;
  get_tile(curr_row_coll_room[col], col, row);
  return is_obstacle();
}

// bumped_fall (seg004.c:298): bumped with no floor to catch him -> tip into a fall.
function bumped_fall() {
  if (Char.action === ACT_IN_FREEFALL) { Char.fall_x = 0; }
  else { startSeq(Char, 'bumpfall'); playSeq(Char); }
}

// bumped_floor (seg004.c:311): grounded bump. Floor far below (>=15) -> really a fall; a heavy
// landing (fall_y>=22) shoves back 5 with no recoil seq; else pick hard bump (jump/fall-onset
// frames) or the normal recoil seq_47. Sword branches are dead for the kid (never draws) but
// ported for fidelity.
function bumped_floor(push_direction) {
  if ((Char.sword | 0) !== 2 && ((Y_LAND[Char.curr_row + 1] - Char.y) & 0xFFFF) >= 15) { bumped_fall(); return; }
  Char.y = Y_LAND[Char.curr_row + 1];
  if (Char.fall_y >= 22) { Char.x = char_dx_forward(-5); return; }
  Char.fall_y = 0;
  if (!Char.alive) return;
  let seq;
  if ((Char.sword | 0) === 2) {
    if (push_direction === Char.direction) { startSeq(Char, 'bumpfwdsword'); playSeq(Char); Char.x = char_dx_forward(1); return; }
    seq = 'pushbacksword';
  } else {
    const f = Char.frame;
    seq = (f === 24 || f === 25 || (f >= 40 && f < 43) || (f >= 102 && f < 107)) ? 'hardbump' : 'bump';
  }
  startSeq(Char, seq); playSeq(Char);
}

// bumped (seg004.c:266): pin Char.x to the wall face (Char.x += delta_x), step tile_col off the
// wall to the char's standing side, then dispatch floor vs fall. (Char.alive<0 == alive.)
function bumped(delta_x, push_direction) {
  if (!(Char.alive < 0 && Char.frame !== 177 /*spiked*/)) return;
  Char.x += delta_x;
  if (push_direction < DIR_RIGHT) {                                     // pushing left
    if (curr_tile2 === TILE_WALL) get_tile(curr_room, --tile_col, tile_row);
  } else {                                                             // pushing right
    if (curr_tile2 === TILE_DOORTOP || curr_tile2 === TILE_DOORTOP_FLOOR || curr_tile2 === TILE_WALL) {
      ++tile_col;
      if (curr_room === 0 && tile_col === 10) { curr_room = Char.room; tile_col = 0; }
      get_tile(curr_room, tile_col, tile_row);
    }
  }
  if (tileIsFloor(curr_tile2)) bumped_floor(push_direction);
  else bumped_fall();
}

// check_bumped_look_left/right (seg004.c:180/199): gated by facing (or sword drawn); if the bump
// column is a real obstacle, bump toward it. The names invert: a wall on your LEFT means you
// moved RIGHT into it. (USE_JUMP_GRAB's shift-grab-run-jump is out of scope.)
function check_bumped_look_left() {
  if (((Char.sword | 0) === 2 || facingLeft()) && is_obstacle_at_col(bump_col_right_of_wall))
    bumped(get_right_wall_xpos(curr_room, tile_col, tile_row) - char_x_left_coll, DIR_RIGHT);
}
function check_bumped_look_right() {
  if (((Char.sword | 0) === 2 || Char.direction === DIR_RIGHT) && is_obstacle_at_col(bump_col_left_of_wall))
    bumped(get_left_wall_xpos(curr_room, tile_col, tile_row) - char_x_right_coll, -1 /*dir_FF_left*/);
}

// check_bumped (seg004.c:151): dispatch a detected bump. Never while hanging/climbing.
export function check_bumped() {
  if (Char.action !== ACT_HANG_CLIMB && Char.action !== ACT_HANG_STRAIGHT &&
      (Char.frame < 135 || Char.frame >= 149)) {
    if (bump_col_left_of_wall >= 0) check_bumped_look_right();
    else if (bump_col_right_of_wall >= 0) check_bumped_look_left();
  }
}

// =======================================================================================
// EDGE DISTANCE  (seg004.c) — the safe_step / forward_pressed input
// =======================================================================================

// dist_from_wall_forward (seg004.c:588): signed distance from the leading edge to a wall's near
// face ahead. Indexes x_bump[tile_col+5] with NO xpos_in_drawn_room — so at a boundary the raw
// -1/10 tile_col (kept in infrontx, restored by get_edge_distance) picks the off-screen entry.
function dist_from_wall_forward(tiletype) {
  if (tiletype === TILE_GATE && !can_bump_into_gate()) return -1;
  coll_tile_left_xpos = X_BUMP[tile_col + FIRST_ONSCREEN_COLUMN] + TILE_MIDX;
  const type = wallType(tiletype);
  if (type === 0) return -1;
  return facingLeft()
    ? char_x_left_coll - (coll_tile_left_xpos + TILE_RIGHTX - wall_dist_from_right[type])   // looking left
    : wall_dist_from_left[type] + coll_tile_left_xpos - char_x_right_coll;                   // looking right
}

// get_edge_distance (seg004.c:378): the classified forward distance + edge_type. Own tile first
// (its column is -1/10 flush at a boundary, link-hopped to the adjacent wall), then the tile in
// front. Sets the module `edge_type`; returns the distance. Gate-front / doortop-facing-right /
// loose / closer / sword / potion sub-branches ported; a plain floor gives a full step (11).
export function get_edge_distance() {
  let distance;
  determine_col();
  load_frame_to_obj();
  set_char_collision();
  let tiletype = get_tile_at_char();
  const classifyWall = () => {                                    // loc_59DD
    if (distance <= TILE_RIGHTX) edge_type = EDGE_WALL;
    else { edge_type = EDGE_FLOOR; distance = 11; }
  };
  const closer = () => { edge_type = EDGE_CLOSER; distance = distance_to_edge_weight(); };  // loc_59FB
  if (wallType(tiletype) !== 0) {
    tile_col = Char.curr_col;
    distance = dist_from_wall_forward(tiletype);
    if (distance >= 0) { classifyWall(); return distance; }
    // else fall through to the in-front branch (loc_59E8)
  }
  tiletype = get_tile_infrontof_char();
  if (tiletype === TILE_DOORTOP && Char.direction >= DIR_RIGHT) { closer(); return distance; }
  if (wallType(tiletype) !== 0) {
    tile_col = infrontx;
    distance = dist_from_wall_forward(tiletype);
    if (distance >= 0) { classifyWall(); return distance; }
  }
  if (tiletype === TILE_LOOSE) { closer(); return distance; }
  if (tiletype === 6 /*closer*/ || tiletype === 22 /*sword*/ || tiletype === TILE_POTION) {
    distance = distance_to_edge_weight();
    if (distance !== 0) edge_type = EDGE_CLOSER;
    else { edge_type = EDGE_FLOOR; distance = 11; }
    return distance;
  }
  if (tileIsFloor(tiletype)) { edge_type = EDGE_FLOOR; distance = 11; return distance; }
  closer();
  return distance;
}

// =======================================================================================
// FALL / FLOOR  (seg005.c / seg006.c) — the tile-map reads that decide fall / land / eject
// =======================================================================================

let fall_frame = 0;

// load_fram_det_col (seg006.c): reload obj + re-derive the (unclamped) column.
function load_fram_det_col() { load_frame_to_obj(); determine_col(); }
// inc_curr_row (seg006.c:2152).
function inc_curr_row() { Char.curr_row++; }
// check_grab (seg006.c:1177): the Shift-grab-a-ledge-mid-fall — a DEFERRED feature (no-op here).
function check_grab() { /* not modeled: mid-fall Shift-grab sets grab_timer + seq_15 */ }
// start_chompers (seg007.c): activate chompers on landing — OUT OF SCOPE (chomper subsystem).
function start_chompers() { /* not modeled */ }

// in_wall (seg006.c:1292): eject the char sideways out of a wall he's standing in, then re-read
// the tile at the new position (updates curr_tile2, which check_on_floor/do_fall test next).
function in_wall() {
  let delta_x = distance_to_edge_weight();
  if (delta_x >= 8 || get_tile_infrontof_char() === TILE_WALL) delta_x = 6 - delta_x;
  else delta_x += 4;
  Char.x = char_dx_forward(delta_x);
  load_fram_det_col();
  get_tile_at_char();
}

// do_fall (seg005.c:37): while the feet are above the current row's floor line, keep falling
// (check_grab); once they reach it, land on a floor, eject from a wall, else descend a row.
function do_fall() {
  if (Y_LAND[Char.curr_row + 1] > Char.y) {           // (word)y_land > (word)Char.y — signed OK (Char.y >= 0)
    check_grab();
  } else {
    if (get_tile_at_char() === TILE_WALL) in_wall();  // re-reads curr_tile2
    if (tileIsFloor(curr_tile2)) land();
    else inc_curr_row();
  }
}

// land (seg005.c:114): seat the feet on the floor line, nudge back off a ledge edge, then pick
// the landing by impact speed. Spikes / take_hp / guard+sword branches are out of scope (hazard /
// HP / char-vs-char subsystems), so a kid always survives a 2-row (medium) land and a 3+-row land
// is the crushed seq. fall_x is NOT reset here (the source doesn't) — each start_fall's set_fall
// re-establishes it, so no stale drift leaks.
function land() {
  Char.y = Y_LAND[Char.curr_row + 1];
  if (!tileIsFloor(get_tile_infrontof_char()) && distance_to_edge_weight() < 3) {
    Char.x = char_dx_forward(-3);                     // landed at a ledge brink -> nudge back
  }
  let seq;
  if (Char.alive < 0) {
    if (Char.fall_y < 22) seq = 'softland';           // seq_17 (fell 1 row)
    else if (Char.fall_y < 33) seq = 'medland';       // seq_20 (fell 2 rows; -1 HP not modeled)
    else seq = 'hardland';                            // seq_22 (fell 3+ rows -> crushed)
  } else {
    seq = 'hardland';                                 // dead -> crushed
  }
  startSeq(Char, seq); playSeq(Char);
  Char.fall_y = 0;
}

// start_fall (seg006.c:1099): drop off a ledge. Descend a row, sheath, then pick the fall
// sequence by the frame fell-from (each set_fall's the forward drift), and after emitting its
// first frame, eject from / nudge off a wall directly at or in front of the char. The sword
// branch (frames 150-179, kid-pushed-off-ledge-with-sword) is out of scope -> the plain fall.
function start_fall() {
  const frame = Char.frame;
  Char.sword = 0;
  inc_curr_row();
  start_chompers();
  fall_frame = frame;
  let seq;
  if (frame === 9) seq = 'stepfall';                  // seq_7 (run frame 9)
  else if (frame === 13) seq = 'stepfall2';           // seq_19 (run frame 13)
  else if (frame === 26) seq = 'jumpfall';            // seq_18 (standing-jump land)
  else if (frame === 44) seq = 'rjumpfall';           // seq_21 (running-jump land)
  else if (frame >= 81 && frame < 86) { seq = 'stepfall2'; Char.x = char_dx_forward(5); load_fram_det_col(); }  // hangdrop
  else seq = 'stepfall';                              // seq_7 (stand/run/step/crouch, and out-of-scope sword frames)
  startSeq(Char, seq); playSeq(Char);
  load_fram_det_col();
  if (get_tile_at_char() === TILE_WALL) { in_wall(); return; }
  const tile = get_tile_infrontof_char();
  if (tile === TILE_WALL) {
    if (fall_frame !== 44 || distance_to_edge_weight() >= 6) Char.x = char_dx_forward(-1);
    else { startSeq(Char, 'patchfall'); playSeq(Char); }   // seq_104_start_fall_in_front_of_wall
    load_fram_det_col();
  }
}

// check_on_floor (seg006.c:1046): a grounded frame that needs a floor falls if the tile under the
// char isn't a floor — EXCEPT a wall, from which in_wall ejects him first (re-reading curr_tile2).
// The level-12 hidden-floors special event is omitted (level 1). `testing` is the clone-only
// test-foot guard (the peer-over lean keeps its weight on the floor and must not fall).
function check_on_floor() {
  if (Char.testing) return;
  if (FRAME_TABLE_KID[Char.frame][4] & 0x40 /*FRAME_NEEDS_FLOOR*/) {
    if (get_tile_at_char() === TILE_WALL) in_wall();
    if (!tileIsFloor(curr_tile2)) start_fall();
  }
}

// check_action (seg006.c:909): the collision hub, by action. Hanging (6) / bumped (5) check the
// floor only at the crouch frame 109; freefall (4) -> do_fall; in-midair (3) -> check_grab at the
// start-fall frames 102-105; hang-climb (2) never falls; else (stand 0 / run-jump 1) -> the floor.
export function check_action() {
  const a = Char.action;
  if (a === ACT_HANG_STRAIGHT || a === ACT_BUMPED) { if (Char.frame === 109) check_on_floor(); }
  else if (a === ACT_IN_FREEFALL) do_fall();
  else if (a === 3 /*in_midair*/) { if (Char.frame >= 102 && Char.frame <= 105) check_grab(); }
  else if (a === ACT_HANG_CLIMB) { /* hanging never falls */ }
  else check_on_floor();
}
