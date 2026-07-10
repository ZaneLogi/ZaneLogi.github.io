// player.js — THE player: the prince dropped into level 1 with REAL tile collision.
// He stands on ledges, is blocked by walls, and falls when unsupported — driven by the
// ported collision substrate (collision.js) and the animation engine (playseq.js /
// seqtbl.js). Position is PoP's room-relative bounded model: Char.x is a room-relative
// internal-x, Char.room is which room he's in, curr_col/curr_row are DERIVED each frame,
// and crossing a room edge swaps the drawn room + rebases Char.x (research_collision.md).
//
// Per-tick order follows play_frame / play_kid_frame (seg000.c:869/1192):
//   process_trobs (loose floors) -> control -> play_seq -> fall_accel -> fall_speed
//   -> determine_col (UNCLAMPED) -> set_char_collision -> check_bumped (wall recoil)
//   -> check_gate_push (a closing gate shoves a stand/crouch/turn char out)
//   -> check_action (freefall: do_fall / grounded: check_on_floor) -> check_press (loose-floor)
//   -> leave_room (the room CROSS is LAST, matching exit_room's place after the kid frame,
//      seg000.c:881). curr_col is unclamped so check_action reads across a boundary via get_tile's
//      link-hop; the cross is applied after. Substrate faithfulness: research_position_room.md.
//
// Rendering reuses the motion-sandbox registration exactly (reg-point flip, content.maxy
// feet); the only new part is the room-relative coordinate maps below. GPLv3 (see NOTICE).
import { MaskSheet } from './masksheet.js';
import { FRAME_TABLE_KID } from './res/frame_table_kid.js';
import { LEVEL1 } from './res/level1.js';
import { makeCharacter, startSeq, playSeq, fallAccel, fallSpeed, charDxForward,
         DIR_RIGHT, DIR_LEFT, ACT_IN_MIDAIR, ACT_IN_FREEFALL } from './playseq.js';
import { getTile, getTileModif, tileIsFloor, wallType, tileDivMod, tileDivModM7, standX,
         Y_LAND, SCREENSPACE_X, TILE_SIZEX, ROOM_XSPAN, ROOM_YSPAN, TILE_WALL,
         DIR_FRONT, getTileAtChar, getTileInFrontOfChar, getTileAboveChar, getTileFrontAboveChar,
         getTileBehindAboveChar, getTileBehindChar, canGrab, distanceToEdge, yToRowMod4, EDGE_WALL, EDGE_FLOOR } from './collision.js';
import { controlKid, makeControl, HELD, RELEASED, IGNORE, FWD, NONE, BACK } from './control.js';
import { makeTrobs, processTrobs, makeLooseFall, triggerButton,
         TILE_LOOSE, TILE_OPENER, TILE_CLOSER } from './trob.js';
// The routine-level-identical collision kernel (seg004.c/seg006.c). Replaces the old Char.x-clamp
// substitute: determine_col / set_char_collision / the per-column buffer scan (check_collisions) /
// the bump dispatch (check_bumped) / get_edge_distance all run the source's own arithmetic, so the
// wall face is the faithful inset (coll_tile_left_xpos + TILE_MIDX ± wall_dist), not the raw tile edge.
import { bindKernel, setLevel as kSetLevel,
         determine_col, load_frame_to_obj, set_char_collision, check_collisions,
         check_bumped, check_gate_push, check_action, get_edge_distance, edge_type,
         get_tile_at_char as k_get_tile_at_char, get_tile_infrontof_char as k_get_tile_infrontof_char,
         get_tile_behind_char as k_get_tile_behind_char, load_fram_det_col,
         currModif, curr_tile2, curr_room, curr_tilepos } from './collision_kernel.js';

// Frame flags (types.h:379-381): FRAME_WEIGHT_X = low 5 bits, FRAME_NEEDS_FLOOR = 0x40.
const FRAME_WEIGHT_X = 0x1F, FRAME_NEEDS_FLOOR = 0x40;
const frameFlags = (f) => FRAME_TABLE_KID[f][4];
// Character actions used by check_press's gate (types.h:407-414).
const ACT_HANG_CLIMB = 2, ACT_BUMPED = 5, ACT_HANG_STRAIGHT = 6, ACT_TURN = 7;
// Tile types the grab/hang tests special-case (types.h): doortop-with-floor and plain doortop.
const TILE_DOORTOP_FLOOR = 7, TILE_DOORTOP = 12;
// Pick-up-able item tiles (types.h): the sword lying on the floor + a potion.
const TILE_POTION = 10, TILE_SWORD = 22;

// A MUTABLE working copy of the level: loose floors collapse into it (fg 11 -> 0), so the
// tile data itself changes just as the source's curr_room_tiles does. LEVEL1 (the shared
// module const, also used by the block-map demo) is never touched; a restart re-clones it,
// restoring every loose tile. trobs = the active transient-object list (loose floors only).
let level = structuredClone(LEVEL1);
const trobs = makeTrobs();
function resetLevel() { level = structuredClone(LEVEL1); trobs.list = []; kSetLevel(level); }  // re-point the kernel at the fresh clone
const cv = document.getElementById('stage');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud');
const $ = (id) => document.getElementById(id);

const padN = (v, n) => String(v).padStart(n);
const padW = (v, n) => String(v).padEnd(n);

// --- view / render mapping ---------------------------------------------------------
// FAITHFUL horizontal scale: a tile is 32 px on screen. types.h:1427 spells the split out —
// TILE_SIZEX=14 in the internal coord system, but "a tile is 32 pixels wide in screen space".
// PoP converts internal-x -> screen in TWO steps: obj_x = internal*2 - 116 (28 px/tile logical,
// seg008.c:1736), THEN calc_screen_x_coord = *320/280 (seg008.c:1850) -> 32 px/tile (applied to the
// kid via chtab_flip_clip, NOT to tiles which are native 32). Net factor = 32/14 = 16/7 per
// internal-x unit = `sx` below. Internal-y is 1:1 (TILE_SIZEY=63 == the screen pixel height), so
// `sy` = 1 and the sprite registration is untouched.
// A room (10 tiles) = 320 px = the full DOS screen width. To keep this flat 2D view legible we add a
// SLIVER of each neighbour room in a margin on all four sides — drawRoom draws cols -1..10 AND rows
// -1..3, and getTile link-hops so col -1 = the left room's col 9, col 10 = the right room's col 0,
// row -1 = the ABOVE room's row 2 (the source's `draw_tile_aboveroom`, seg008.c:148), row 3 = the
// BELOW room's row 0, and the four corners = the diagonal rooms; a void link reads as a wall (solid
// cap). Each margin is darkened so it reads as adjacent. These slivers are the flat-2D stand-in for
// what the source's pseudo-3D draw shows in-frame (a wall / portcullis / a passage to the next room,
// and the bottom of the room above). Side margins = one tile (32 px); top/bottom = MARGIN_Y px (a
// thinner peek since a row is 63 px tall). Coords: research_collision.md §2.1.
const TILE_PX = 32, MARGIN_PX = TILE_PX, MARGIN_Y = 24; // 32 px/tile; a 1-tile L/R sliver, a 24 px T/B sliver
const ROOM_H = Y_LAND[3] - Y_LAND[0];                  // 189 internal-y = the 3 rows' screen height (sy = 1)
const BASE_W = 10 * TILE_PX + 2 * MARGIN_PX;           // 320 room + 2*32 margins = 384
const BASE_H = ROOM_H + 2 * MARGIN_Y;                  // 189 room + 2*24 margins = 237
let zoom = 1;                                          // default 1x: a native 384x237 frame (32 px tiles)
let sx, sy, spriteScale, ROOM_X0, ROOM_Y0;              // set by applyZoom()
function applyZoom() {
  cv.width = BASE_W * zoom; cv.height = BASE_H * zoom;
  sx = (TILE_PX / TILE_SIZEX) * zoom;                  // 32/14 per internal-x = the *320/280 stretch -> 32 px tile
  sy = 1 * zoom; spriteScale = zoom;                    // internal-y 1:1 (63 px row); sprite at native px * zoom
  ROOM_X0 = MARGIN_PX * zoom; ROOM_Y0 = MARGIN_Y * zoom; // one-tile L/R sliver + a MARGIN_Y top/bottom sliver
}
// internal (room-relative) -> screen px. x measured from the room's col-0 left edge (58);
// y measured from the room's top (y_land[0] = -8), so y_land[r+1] lands on row r's floor.
const screenX = (ix) => ROOM_X0 + (ix - SCREENSPACE_X) * sx;
const screenY = (iy) => ROOM_Y0 + (iy - Y_LAND[0]) * sy;

// RENDER-ONLY view-space correction (does NOT touch collision — CLAUDE.md lesson 6c). The kernel
// now stops the prince at the SOURCE's internal x, i.e. at the wall's INSET collision face
// (coll_tile_left_xpos + TILE_MIDX), which the DOS engine draws flush because its walls are drawn
// PSEUDO-3D (the visible face sits inset from the abstract tile cell). Our view draws walls FLAT at
// the tile cell, so the faithful stop leaves the prince ~6 internal units off the flat wall. We
// re-derive that offset for OUR view by drawing the prince 6 internal-x units left of his true x —
// purely cosmetic, collision is unchanged. (Facing into a wall this reads flush; the opposite-face
// case is ~1 unit different — negligible at this scale. Tweak here if the eye wants it.)
const RENDER_X_BIAS = 6;

let tint = '#e0d4a8', paused = false;   // warm cream — the prince reads clearly on the dark room
let sheet = null;

// --- the character + which room is on screen ---
const ch = makeCharacter({ x: 0, y: 0, direction: DIR_LEFT });
ch.room = level.start.room;
ch.onGetItem = () => procGetObject(ch);   // SEQ_GET_ITEM 1 -> proc_get_object (fires from pickupsword/drinkpotion)
ch.onCheckGrab = () => checkGrab(ch);      // check_grab hook: the kernel's do_fall/check_action fire this mid-fall
let drawnRoom = level.start.room;

// Level-1 START = a FALLING entry (do_startpos, seg003.c:167 -> seq_7_fall). The start
// tile (room 1, pos 0 = col 0, row 0) is empty by design: the prince drops one row and
// soft-lands on the torch-floor at (0,1), then stands. So the opening self-demonstrates
// fall -> land -> stand.
function dropAtStart() {
  resetLevel();                            // restore collapsed loose floors + clear trobs
  const s = level.start;                   // room 1, pos 0, dir -1
  ch.room = s.room; drawnRoom = s.room;
  ch.curr_col = s.pos % 10;                // 0
  ch.curr_row = (s.pos / 10) | 0;          // 0
  ch.x = standX(ch.curr_col);              // do_startpos, seg003.c:155
  ch.y = Y_LAND[ch.curr_row + 1];          // set_start_pos, seg003.c:183 (y_land[1] = 55)
  ch.direction = ~s.dir;                   // Char.direction = ~start_dir (seg003.c:157)
  ch.fall_x = 0; ch.fall_y = 0;
  ch.have_sword = 0;                       // level 1 starts swordless (do_startpos; restore after a pickup)
  ctrl1.forward = ctrl1.backward = ctrl1.shift2 = RELEASED;   // clear_saved_ctrl (seg006.c:1552): a restart resets the latch
  startSeq(ch, 'freefall');                // seq_7_fall (falling entry)
  playSeq(ch);
}

const spriteOf = (frame) => {
  const image = FRAME_TABLE_KID[frame][0];
  return image === 255 ? null : sheet.get(401 + image);
};

// --- collision physics: now the routine-level-identical kernel (collision_kernel.js) ----
// determine_col / set_char_collision / check_collisions / check_bumped / get_edge_distance all run
// in the kernel over the source's own global state. Kept here: dx_weight (the weight point, for the
// control-phase jump/grab pre-positioning) and edgeDist() — a thin adapter turning the kernel's
// get_edge_distance (returns distance, sets the module edge_type) into the { edgeType, distance }
// shape control.js + the jump code read.
function dxWeight(ch) {
  const [, , frameDx, , flags] = FRAME_TABLE_KID[ch.frame];
  return charDxForward(ch, frameDx - (flags & FRAME_WEIGHT_X));
}
function edgeDist() { const distance = get_edge_distance(); return { edgeType: edge_type, distance }; }

// (wallBlocksFacing / canBumpIntoGate / wallTypeAt / wallAheadFace / getEdgeDistance — the
// Char.x-clamp + raw-tile-edge substitutes — are GONE. Their faithful counterparts (is_obstacle,
// can_bump_into_gate, get_left/right_wall_xpos, the buffer scan, dist_from_wall_forward,
// get_edge_distance) now live in collision_kernel.js and run the source's inset wall-face math.)

// --- vertical jump-up (ported seg005.c): pressing Up while standing -----------------------
// These run in the CONTROL phase (called from controlKid via the world object), so they only
// startSeq — the tick's own playSeq (right after control) emits the new sequence's first frame.
//
// check_jump_up (seg005.c:693): choose between grabbing a ledge above and a plain jump up. First
// try to grab a ledge in FRONT and above (through the tile directly above); else a ledge STRAIGHT
// above (through the tile behind-above); else just jump up. `through` is the tile the hands pass
// in front of, the second arg is the ledge they'd land on.
function checkJumpUp(ch) {
  const facingRight = ch.direction >= DIR_RIGHT;
  const aboveRow = ch.curr_row - 1;
  const frontCol = ch.curr_col + DIR_FRONT[ch.direction + 1];
  if (canGrab(getTileAboveChar(level, ch), getTileFrontAboveChar(level, ch),
              getTileModif(level, ch.room, frontCol, aboveRow), facingRight)) {
    grabUpWithFloorBehind(ch); return;                                    // grab a ledge in front & above
  }
  if (canGrab(getTileBehindAboveChar(level, ch), getTileAboveChar(level, ch),
              getTileModif(level, ch.room, ch.curr_col, aboveRow), facingRight)) {
    jumpUpOrGrab(ch); return;                                             // grab a ledge straight above
  }
  jumpUp(ch);                                                            // nothing to grab -> jump up
}

// jump_up (seg005.c:734): jump straight up. First nudge back off a wall that's right in front
// (distance < 4), then read the tile one row above at the weight column: neither wall nor floor
// there -> open air above -> highjump; a wall or floor above -> jump into the ceiling -> jumpup.
function jumpUp(ch) {
  const { edgeType, distance } = edgeDist();
  if (distance < 4 && edgeType === EDGE_WALL) ch.x = charDxForward(ch, distance - 3);  // seg005.c:738
  const col = tileDivMod(dxWeight(ch) - 6);            // back_delta_x(0)=0 -> dx_weight()-6 (seg005.c:781)
  const above = getTile(level, ch.room, col, ch.curr_row - 1);
  startSeq(ch, (above !== TILE_WALL && !tileIsFloor(above)) ? 'highjump' : 'jumpup');   // seq_28 / seq_14
}

// grab_up_with_floor_behind (seg005.c:871): grab a ledge in front & above. Close to the edge and
// not against a wall -> grab straight (jumphangMed); else reach forward (jumphangLong). Both
// pre-position Char.x by the distance to the ledge's near edge.
function grabUpWithFloorBehind(ch) {
  const distance = distanceToEdge(ch, dxWeight(ch));            // distance_to_edge_weight
  const { edgeType, distance: edist } = edgeDist();
  if (distance < 4 && edist < 4 && edgeType !== EDGE_WALL) {
    ch.x = charDxForward(ch, distance);
    startSeq(ch, 'jumphangMed');                                // seq_8
  } else {
    ch.x = charDxForward(ch, distance - 4);
    startSeq(ch, 'jumphangLong');                               // seq_24
  }
}

// grab_up_no_floor_behind (seg005.c:727): grab a ledge straight above with no floor behind -> the
// backward-lean grab (jumpbackhang).
function grabUpNoFloorBehind(ch) {
  ch.x = charDxForward(ch, distanceToEdge(ch, dxWeight(ch)) - 10);
  startSeq(ch, 'jumpbackhang');                                 // seq_16
}

// jump_up_or_grab (seg005.c:711): grabbing straight above — too close to the edge (<6) just jumps;
// no floor behind -> jumpbackhang; else step back a tile and grab with floor behind.
function jumpUpOrGrab(ch) {
  const distance = distanceToEdge(ch, dxWeight(ch));
  if (distance < 6) { jumpUp(ch); return; }
  if (!tileIsFloor(getTileBehindChar(level, ch))) { grabUpNoFloorBehind(ch); return; }
  ch.x = charDxForward(ch, distance - TILE_SIZEX);              // go back a bit (seg005.c:720)
  determine_col();                                             // load_fram_det_col: re-derive curr_col
  grabUpWithFloorBehind(ch);
}

// can_climb_up (seg005.c:826): climb from a hang onto the ledge above — UNLESS the tile above blocks
// the pull-up, in which case play climbfail (seq_73): reach up, hit it, and drop back down. Blocked-
// above cases (seg005.c:834-841): a mirror/chomper while facing RIGHT, or a CLOSED gate while facing
// LEFT. "Closed" is the gate's own test `(modifier>>2) < 6` (a fixed threshold, distinct from
// can_bump_into_gate's char_height compare). The modifier is read at the tile-above position, which
// getTile/getTileModif link-hop across a room boundary — so a gate in the NEIGHBOUR room (e.g. room 5
// col 9 above room 1's edge) is detected correctly.
function canClimbUp(ch) {
  const above = getTileAboveChar(level, ch);                    // curr_tile2 (seg005.c:833)
  const facingRight = ch.direction >= DIR_RIGHT;
  const blockedAbove =
    ((above === 13 /*mirror*/ || above === 18 /*chomper*/) && facingRight) ||
    (above === 4 /*gate*/ && !facingRight &&
     (getTileModif(level, ch.room, ch.curr_col, ch.curr_row - 1) >> 2) < 6);   // closed gate
  startSeq(ch, blockedAbove ? 'climbfail' : 'climbup');         // seq_73 : seq_10
}

// hang_fall (seg005.c:846): let go of the ledge. No floor behind AND none underfoot -> release and
// fall (hangfall); otherwise release and drop-land onto the floor below (hangdrop), nudging back
// off a wall/doortop first.
function hangFall(ch) {
  const at = getTileAtChar(level, ch);
  if (!tileIsFloor(getTileBehindChar(level, ch)) && !tileIsFloor(at)) {
    startSeq(ch, 'hangfall'); return;                           // seq_23
  }
  if (at === TILE_WALL || (ch.direction < DIR_RIGHT && (at === TILE_DOORTOP_FLOOR || at === TILE_DOORTOP)))
    ch.x = charDxForward(ch, -7);                               // seg005.c:864
  startSeq(ch, 'hangdrop');                                     // seq_11
}

// control_hanging's Shift branch (seg005.c:798): hang flat against a wall/doortop (hangstraight),
// else — if there is no floor above to climb onto — let go (hang_fall).
function hangAgainstWall(ch) {
  const at = getTileAtChar(level, ch);
  const againstWall = at === TILE_WALL ||
    (ch.direction < DIR_RIGHT && (at === TILE_DOORTOP_FLOOR || at === TILE_DOORTOP));
  if (ch.action !== ACT_HANG_STRAIGHT && againstWall) { startSeq(ch, 'hangstraight'); return; }
  if (!tileIsFloor(getTileAboveChar(level, ch))) hangFall(ch);
}

// check_grab (seg006.c:1177): grab a ledge in mid-fall. The kernel's do_fall / check_action fire
// this (via the onCheckGrab hook) while falling — do_fall each freefall tick the feet are still
// above the floor line, check_action during the start-fall frames 102-105 (action 3). It reads the
// control layer (control_shift) + the grab helpers, so it lives here like check_get_item, not in
// the routine-for-routine kernel. Hold Shift while dropping past a grabbable ledge that's close
// enough ahead-and-above and you're not falling too fast (fall_y < 32) -> snap onto it and hang.
// Mirrors can_grab_front_above via the same collision.js helpers as check_jump_up (through = tile
// above; target = tile front-above). The -8 pre-nudge + load_fram_det_col re-derive the column at a
// slightly-back x so a ledge just ahead reads as grabbable; distance_to_edge_weight then snaps
// Char.x flush to its near edge, Char.y to the landing row, and grab_timer=12 gates the climb (as
// jump-up-grab does). Sound (sound_9_grab) / is_screaming / the FIX chomper-start are dropped.
function checkGrab(ch) {
  if (control.shift === HELD &&                                   // press Shift to grab
      ch.fall_y < 32 &&                                           // not falling too fast (MAX_GRAB_FALLING_SPEED)
      ch.alive < 0 &&                                             // not dead
      u16(Y_LAND[ch.curr_row + 1]) <= u16(ch.y + 25)) {           // near a landing row (word compare)
    const old_x = ch.x;
    ch.x = charDxForward(ch, -8);
    load_fram_det_col();                                          // re-derive curr_col at the nudged x
    const facingRight = ch.direction >= DIR_RIGHT;
    const frontCol = ch.curr_col + DIR_FRONT[ch.direction + 1];
    if (!canGrab(getTileAboveChar(level, ch), getTileFrontAboveChar(level, ch),          // can_grab_front_above
                 getTileModif(level, ch.room, frontCol, ch.curr_row - 1), facingRight)) {
      ch.x = old_x;                                               // can't grab -> undo the nudge, keep falling
    } else {
      ch.x = charDxForward(ch, distanceToEdge(ch, dxWeight(ch))); // snap flush to the ledge's near edge
      ch.y = Y_LAND[ch.curr_row + 1];                             // seat the feet at the landing row
      ch.fall_y = 0;                                              // stop the fall
      startSeq(ch, 'fallhang'); playSeq(ch);                      // seq_15: reach-up frame 80 -> hang loop
      ch.grab_timer = 12;                                         // gate the climb for 12 ticks (seg006.c:1405)
    }
  }
}

// --- running jump (ported seg005.c) + Down->crouch/climb-down -----------------------------
// These run in the CONTROL phase (called from controlRunning / controlStanding via the world
// object), so they only startSeq / nudge Char.x — the tick's own playSeq emits the new frame.

// run_jump (seg005.c:898): the running (horizontal) jump — Up held during the run cycle at frame >= 7.
// First auto-ALIGNS Char.x to the take-off edge: scan up to 2 tiles forward for a spike / non-floor
// (the gap's near edge) and, if the alignment nudge lands in the source's takeoff window, shift Char.x
// so the leap launches from the brink; outside the window it returns (no jump — the run keeps going and
// re-checks next frame). On flat ground the scan finds no edge and it jumps straight (no alignment).
const TILE_SPIKE = 2;
const u16 = (v) => v & 0xFFFF;                          // the source's (word) reinterpret cast
function runJump(ch) {
  if (ch.frame < 7) return;                             // only from run frame 7+ (seg005.c:900)
  const xpos = charDxForward(ch, 4);
  let col = tileDivModM7(xpos);
  for (let tilesForward = 0; tilesForward < 2; tilesForward++) {   // this tile + the next
    col += DIR_FRONT[ch.direction + 1];
    const t = getTile(level, ch.room, col, ch.curr_row);
    if (t === TILE_SPIKE || !tileIsFloor(t)) {          // found the take-off edge
      let posAdj = distanceToEdge(ch, xpos) + TILE_SIZEX * tilesForward - TILE_SIZEX;
      if (u16(posAdj) < u16(-8) || posAdj >= 2) {       // outside the takeoff window (seg005.c:909)
        if (posAdj < 128) return;                       // too far to align -> don't jump (always taken: posAdj <= 13)
        posAdj = -3;
      }
      ch.x = charDxForward(ch, posAdj + 4);
      break;
    }
  }
  startSeq(ch, 'runjump');                              // seq_4_run_jump
}

// down_pressed (seg005.c:464): the Down key while standing — climb down to a hang, or crouch. If a
// drop is right in FRONT and the char is at that brink (dist < 3), nudge back off it (no crouch).
// Else if a drop is BEHIND and he is far enough from the back edge (>= 8) with a grabbable ledge there
// (can_grab) that isn't a closed gate unless facing right, align Char.x and climb down (seq_68).
// Otherwise crouch (crouch() = seq_50_crouch = the `stoop` sequence).
function downPressed(ch) {
  const facingRight = ch.direction >= DIR_RIGHT;
  if (!tileIsFloor(getTileInFrontOfChar(level, ch)) && distanceToEdge(ch, dxWeight(ch)) < 3) {
    ch.x = charDxForward(ch, 5);                         // step back off the front brink (seg005.c:469)
    determine_col();                                     // load_fram_det_col: re-derive curr_col
    return;
  }
  const behind = getTileBehindChar(level, ch);
  if (!tileIsFloor(behind) && distanceToEdge(ch, dxWeight(ch)) >= 8) {
    const at = getTileAtChar(level, ch);                 // curr_tile2 = the ledge to grab onto
    const atModif = getTileModif(level, ch.room, ch.curr_col, ch.curr_row);
    if (canGrab(behind, at, atModif, facingRight) &&
        (facingRight || at !== 4 /*gate*/ || (atModif >> 2) >= 6)) {    // not a closed gate unless facing right
      ch.x = charDxForward(ch, distanceToEdge(ch, dxWeight(ch)) - 9);   // align to the ledge (seg005.c:485)
      startSeq(ch, 'climbdown');                         // seq_68_climb_down
      return;
    }
  }
  startSeq(ch, 'stoop');                                 // crouch() -> seq_50_crouch
}

// (set_char_collision, the bump DETECTION [check_collisions/get_row_collision_data + the per-column
// buffers], and the bumped/bumped_floor/bumped_fall dispatch are now in collision_kernel.js — the
// faithful buffer scan replaces the old Char.x-clamp, and the wall face carries the wall_dist inset.)

// (land / do_fall / start_fall / check_on_floor / check_action — the fall/floor collision
// routines — are now the identical bodies in collision_kernel.js. start_fall picks the faithful
// per-context fall sequence [stepfall/jumpfall/rjumpfall + set_fall drift, seqtbl.js] instead of
// the old freefall collapse; check_on_floor ejects from a wall via in_wall instead of the "don't
// fall on a wall" stand-in. The old fall_x=0 stopgap is gone — set_fall re-establishes it faithfully.)

// --- item pickup (ported seg005.c / seg006.c): the sword (and potions) --------------------
// Run in the CONTROL phase (from control_standing / control_crouched via world.getItem). They read the
// tile at / in-front-of / behind the char through the KERNEL's char-relative get_tile_* so curr_tile2 /
// curr_room / curr_tilepos reflect the (link-hopped) tile — the same globals get_item / do_pickup then
// read, mirroring the C's global-state sequence.

// check_get_item (seg005.c:620): is there a sword/potion to pick up? If the item is AT the char (with
// floor behind to back onto), step back 14 so it becomes the tile IN FRONT; then, if the tile in front
// is the item, get_item() and report handled. Returns false when there is nothing to grab.
function checkGetItem(ch) {
  const atChar = k_get_tile_at_char();
  if (atChar === TILE_POTION || atChar === TILE_SWORD) {
    if (!tileIsFloor(k_get_tile_behind_char())) return false;
    ch.x = charDxForward(ch, -14);
    load_fram_det_col();                                  // re-derive curr_col at the new x
  }
  const inFront = k_get_tile_infrontof_char();            // sets curr_tile2 / curr_tilepos / curr_room = the in-front tile
  if (inFront === TILE_POTION || inFront === TILE_SWORD) {
    getItem(ch);
    return true;
  }
  return false;
}

// get_item (seg005.c:640): the two-step. Not crouched yet -> align to the item's edge, nudge, and
// crouch() (= the `stoop` sequence). Already crouched (frame 109) -> do_pickup + the pickup animation
// (sword -> pickupsword/seq_91; potion -> drinkpotion/seq_78). curr_tile2 here is the in-front item
// (get_edge_distance's last read lands on it), exactly as the source reads it.
function getItem(ch) {
  if (ch.frame !== 109 /*frame_109_crouch*/) {
    const { edgeType, distance } = edgeDist();
    if (edgeType !== EDGE_FLOOR) ch.x = charDxForward(ch, distance);
    if (ch.direction >= DIR_RIGHT) ch.x = charDxForward(ch, (curr_tile2 === TILE_POTION ? 1 : 0) - 2);
    startSeq(ch, 'stoop');                                // crouch()
  } else if (curr_tile2 === TILE_SWORD) {
    doPickup(ch, -1);
    startSeq(ch, 'pickupsword');                          // seq_91_get_sword
  } else {                                                // potion
    doPickup(ch, currModif() >> 3);
    startSeq(ch, 'drinkpotion');                          // seq_78_drink
  }
}

// do_pickup (seg006.c:1671): record what's being picked up (proc_get_object reads it), disable Shift
// auto-repeat, and ERASE the item tile -> plain floor at the resolved (curr_room, curr_tilepos).
function doPickup(ch, objType) {
  ch.pickup_obj_type = objType;
  control.shift2 = IGNORE;                                // disable automatic repeat
  const tp = curr_tilepos;
  level.rooms[curr_room - 1].fg[(tp / 10) | 0][tp % 10] = 1;   // tiles_1_floor
  level.rooms[curr_room - 1].bg[(tp / 10) | 0][tp % 10] = 0;
}

// proc_get_object (seg006.c:1857): the SEQ_GET_ITEM 1 effect. For the SWORD, set have_sword. Potion
// effects (heal / life / feather / upside-down) are out of scope (no HP/effect subsystem), so a potion
// is a no-op — the drink animation plays and the potion vanished in do_pickup.
function procGetObject(ch) {
  if (ch.charid !== 0 /*kid*/ || ch.pickup_obj_type === 0) return;
  if (ch.pickup_obj_type === -1) ch.have_sword = -1;     // got the sword (sound + flash not modeled)
}

// check_press (seg006.c:1683): the loose-floor + button trigger. For a grounded / turning / bumped
// actor on a frame that needs a floor, read the tile underfoot: a raise/drop BUTTON (15/6) triggers
// its door-link chain (trigger_button); a LOOSE tile (11) starts its collapse (make_loose_fall). The
// tile read goes through the KERNEL's get_tile_at_char so curr_room / curr_tilepos / currModif reflect
// the link-hopped tile — exactly the globals trigger_button then reads. (Still a grounded-only slice:
// the hanging/climbing tile-above and the frame-79 loose-break-from-above branches stay deferred.)
// Runs after check_action, as in play_kid_frame (seg000.c:1215-1216).
function checkPress(ch) {
  const a = ch.action;
  if (!(a === ACT_TURN || a === ACT_BUMPED || a < ACT_HANG_CLIMB)) return;  // grounded/turn/bumped only
  if (!(frameFlags(ch.frame) & FRAME_NEEDS_FLOOR)) return;                   // needs floor contact
  const tile = k_get_tile_at_char();                                         // sets curr_room/curr_tilepos/currModif
  if (tile === TILE_OPENER || tile === TILE_CLOSER) {
    // the kid is alive (died_on_button is skipped): press its button type with its bg door-link index
    triggerButton(level, trobs, curr_room, curr_tilepos, tile, currModif());
  } else if (tile === TILE_LOOSE) {
    makeLooseFall(trobs, level, ch.room, ch.curr_col, ch.curr_row);
  }
}

// --- room-relative bounded position: swap the room at an edge (research_collision.md §6) --
// goto_other_room (seg002.c:390): hop the roomlink + rebase Char.x/y into the new room
// (left +140 / right -140 / up +189 / down -189), and swap the on-screen room.
function gotoRoom(nextRoom, dir) {
  ch.room = nextRoom;
  if (dir === 'right')     ch.x -= ROOM_XSPAN;   // 140
  else if (dir === 'left') ch.x += ROOM_XSPAN;
  else if (dir === 'down') ch.y -= ROOM_YSPAN;   // 189
  else if (dir === 'up')   ch.y += ROOM_YSPAN;
  if (dir === 'up' || dir === 'down') ch.curr_row = yToRowMod4(ch.y);
  else determine_col();                          // re-derive curr_col in the new room
  drawnRoom = ch.room;                           // redraw_screen(1) — the room on screen swaps (kernel reads drawnRoom live)
}

// leave_room (seg002.c:423). FAITHFUL order, run AFTER the kid frame (exit_room in play_frame,
// seg000.c:881 — see tick()). The tests, in the source's order:
//   1. UP — Char.y-based (seg002.c:428): only while NOT bumped/freefall/midair, when the feet reach
//      the row above the room (Char.y in (-16,10) ~ y_land[0]=-8). This is what lets a two-floor
//      climb cross UP into the room above (the climb-frame block below only stops HORIZONTAL leave).
//   2. DOWN — Char.y-based (seg002.c:434): the feet fell below the room (Char.y >= 211 ~ y_land[4]=244).
//   3. Blocked frames -> NO horizontal leave (seg002.c:436-461): climb-up 135-149, stand-up-from-
//      crouch 110-119, and a turn (action 7). (The turn/stand-up wiggle Char.x with their own dx
//      while stationary; the climb straddles a boundary on purpose.)
//   4. HORIZONTAL by facing, on the LEADING EDGE Char.x (seg002.c:462-483; char_x_right facing right /
//      char_x_left facing left, both == Char.x): facing right -> right at >=201, left at <=57; facing
//      left -> left at <=54, right at >=198.
// goto_other_room rebases (±140 / ±189). A 0 link is the void (no cross).
function leaveRoom() {
  const links = level.rooms[ch.room - 1].links;
  const a = ch.action;
  if (a !== ACT_BUMPED && a !== ACT_IN_FREEFALL && a !== ACT_IN_MIDAIR && ch.y > -16 && ch.y < 10) {
    if (links.up) gotoRoom(links.up, 'up');                  // 1. UP (seg002.c:428)
    return;
  }
  if (ch.y >= 211) {
    if (links.down) gotoRoom(links.down, 'down');            // 2. DOWN (seg002.c:434)
    return;
  }
  if (ch.frame >= 135 && ch.frame < 150) return;             // 3. no horizontal during climb-up (seg002.c:438)
  if (ch.frame >= 110 && ch.frame < 120) return;             //    ... nor stand-up-from-crouch (seg002.c:440)
  if (a === ACT_TURN) return;                                //    ... nor a turn (seg002.c:459)
  const facingRight = ch.direction >= DIR_RIGHT;             // 4. HORIZONTAL, leading-edge Char.x
  if (facingRight) {
    // seg002.c:472 — before leaving RIGHT the source reads col 9 of THIS room: a doortop (7/12) there
    // blocks the crossing (return -1; you stand/bump against it). The clone had dropped this guard —
    // restored, and extended to a still-BLOCKING closed gate. (The source leans on check_bumped to stop
    // you at a gate, but the gate's inset collision face x=201 coincides with the right-boundary
    // threshold, also 201, so a post-bump safe_step would slip through into the next room.) The
    // gate-block test IS check_bumped's own can_bump_into_gate — (modif>>2)+6 < char_height, char_height =
    // the current frame's sprite height (spriteOf(ch.frame).h) — so leave_room and the bump agree exactly.
    const col9 = getTile(level, ch.room, 9, ch.curr_row);
    const sp = spriteOf(ch.frame);
    const col9blocks = col9 === TILE_DOORTOP_FLOOR || col9 === TILE_DOORTOP ||
      (col9 === 4 /*gate*/ && sp && ((getTileModif(level, ch.room, 9, ch.curr_row) >> 2) + 6) < sp.h);
    if (ch.x >= 201 && links.right && !col9blocks) gotoRoom(links.right, 'right');
    else if (ch.x <= 57 && links.left)             gotoRoom(links.left, 'left');
  } else {
    if (ch.x <= 54 && links.left)       gotoRoom(links.left, 'left');
    else if (ch.x >= 198 && links.right) gotoRoom(links.right, 'right');
  }
}

// --- keyboard -> facing-relative control (read_user_control + the control_x mapping) --
// Raw absolute arrow/shift state, converted each tick into the facing-relative snapshot
// control_kid expects (forward/backward instead of left/right), so "left while facing
// right" reads as BACKWARD with no special-casing (control.js header).
const keys = { left: false, right: false, up: false, down: false, shift: false };
const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
addEventListener('keydown', (e) => {
  if (e.key === 'Shift') keys.shift = true;
  else if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') dropAtStart();      // restart the falling entry
});
addEventListener('keyup', (e) => {
  if (e.key === 'Shift') keys.shift = false;
  else if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false;
});

const control = makeControl();
// The horizontal control latch persists across ticks (ctrl1_forward/backward, seg006.c:1534/1543).
// control.forward/backward are 3-state (RELEASED/HELD/IGNORE); ctrl1 carries them between frames so a
// held key reads as a FRESH press for exactly ONE tick (HELD), after which a safe_step latches it to
// IGNORE — the "disable automatic repeat" that makes a held run-into-wall SETTLE at a gap and a TAP
// oscillate (research_collision.md §5c). control.x is the raw axis the latch reads. control.up/down
// stay simple raw HELD/RELEASED — their repeat is already gated by the frame dispatch. control.shift2
// IS latched (like forward) — the item-pickup two-step needs it: a fresh Shift press reads HELD, and
// do_pickup latches it to IGNORE so the grab doesn't auto-repeat (seg006.c:1594). control.shift stays raw.
const ctrl1 = { forward: RELEASED, backward: RELEASED, shift2: RELEASED };
let lastDir = ch.direction;                             // facing at the last tick, to detect a turn (flipLatchOnTurn)

// Raw keyboard -> the facing-relative axis (flip_control_x, seg006.c:1520 — folded in at read time so
// the handlers only ever see forward/backward, not left/right). Sets control.x + the raw up/down/shift.
function readRawAxis() {
  const facingRight = ch.direction >= DIR_RIGHT;
  const fwdKey = facingRight ? keys.right : keys.left;         // arrow toward the facing dir
  const backKey = facingRight ? keys.left : keys.right;
  control.x = fwdKey ? FWD : (backKey ? BACK : NONE);          // control_x, facing-relative
  control.up = keys.up ? HELD : RELEASED;
  control.down = keys.down ? HELD : RELEASED;
  control.shift = keys.shift ? HELD : RELEASED;
}

// flip_control_x for the PERSISTED latch (seg006.c:1520). DOS stores control_forward/backward ABSOLUTE
// (left/right) and flips them to facing-relative every frame; we store them facing-RELATIVE, so when a
// turn flips the facing BETWEEN save and restore, the saved latch must swap to stay aligned with the new
// facing. Without this, after a turn the still-held key re-latched as a FRESH forward HELD (which the
// `>= RELEASED` guard then can't clear on release) and ran a step even if you let go mid-turn — the
// "turn-and-run is too sensitive" bug (fixed 2026-07-08). With it, the held key stays IGNORE across the
// flip, exactly as DOS's absolute latch does, so releasing during the turn cancels the run.
function flipLatchOnTurn() {
  if (ch.direction !== lastDir) {
    const t = ctrl1.forward; ctrl1.forward = ctrl1.backward; ctrl1.backward = t;
    lastDir = ch.direction;
  }
}

// rest_ctrl_1 (seg006.c:1543): restore the latched forward/backward (+ shift2) from the previous tick.
function restCtrl1() { control.forward = ctrl1.forward; control.backward = ctrl1.backward; control.shift2 = ctrl1.shift2; }

// read_user_control (seg006.c:1557): advance the 3-state latch from the raw axis. RELEASED + key-down
// -> HELD (a fresh press); IGNORE stays IGNORE while the key is held (auto-repeat off); key-up ->
// RELEASED. A HELD left by a prior tick's dispatch is untouched (the `>= RELEASED` guard is false for
// HELD = -1) — the source relies on control() downgrading HELD (to IGNORE via safe_step, or RELEASED
// via release_arrows) the same tick it consumes it.
function readUserControl() {
  if (control.forward >= RELEASED) {
    if (control.x === FWD) { if (control.forward === RELEASED) control.forward = HELD; }
    else control.forward = RELEASED;
  }
  if (control.backward >= RELEASED) {
    if (control.x === BACK) { if (control.backward === RELEASED) control.backward = HELD; }
    else control.backward = RELEASED;
  }
  // control_shift2 latch (seg006.c:1594): a fresh Shift press RELEASED->HELD; key-up -> RELEASED; an
  // IGNORE set by do_pickup stays IGNORE while Shift is held (>= RELEASED is true for IGNORE, false for HELD).
  if (control.shift2 >= RELEASED) {
    if (control.shift === HELD) { if (control.shift2 === RELEASED) control.shift2 = HELD; }
    else control.shift2 = RELEASED;
  }
}

// save_ctrl_1 (seg006.c:1534): persist the latch (as control() left it) to the next tick.
function saveCtrl1() { ctrl1.forward = control.forward; ctrl1.backward = control.backward; ctrl1.shift2 = control.shift2; }

const world = {
  edgeDistance: edgeDist,                   // kernel get_edge_distance -> { edgeType, distance }
  jumpUp: () => checkJumpUp(ch),            // up while standing -> jump / grab a ledge above
  climbUp: () => canClimbUp(ch),            // up while hanging -> climb onto the ledge
  hangFall: () => hangFall(ch),             // release a hang -> drop / fall
  hangAgainstWall: () => hangAgainstWall(ch),  // shift while hanging -> hang flat / let go
  runJump: () => runJump(ch),               // up while running -> the running (horizontal) jump
  downPressed: () => downPressed(ch),       // down while standing -> climb down / crouch
  getItem: () => checkGetItem(ch),          // shift over a sword/potion -> crouch, then pick up
};

// --- one engine tick — faithful play_kid_frame order (seg000.c:1192) --------------
function tick() {
  if (ch.grab_timer > 0) ch.grab_timer--;  // process(grab_timer): counts down a mid-fall grab (seg006.c:1405)
  processTrobs(trobs, level);              // top of play_frame: advance + collapse loose floors
  readRawAxis();                           // raw keyboard -> facing-relative axis (control.x)
  flipLatchOnTurn();                       // flip_control_x: swap the saved latch if the facing turned last tick
  restCtrl1();                             // rest_ctrl_1: restore the forward/backward latch
  readUserControl();                       // read_user_control: advance the 3-state latch (RELEASED->HELD->IGNORE)
  controlKid(ch, control, world);          // control(): pick the next sequence (consumes + mutates the latch)
  saveCtrl1();                             // save_ctrl_1: persist the latch to the next tick
  playSeq(ch);                             // play_seq -> new frame + Char.x/y
  fallAccel(ch); fallSpeed(ch);            // fall_accel / fall_speed (freefall only)
  // The faithful play_kid_frame tail (seg000.c:1205-1216): obj + box, then the kernel's buffer
  // scan + bump, then the action check. No determine_col AFTER the bump — a bumped char (action 5)
  // no-ops in check_action, so the recoil settles with the pre-bump curr_col, exactly as the source.
  load_frame_to_obj();                     // obj_x/obj_y for set_char_collision
  determine_col();                         // curr_col at the weight point (UNCLAMPED — seg006.c:122)
  set_char_collision();                    // the collision box (char_x_left/right_coll)
  if (!ch.testing) {
    check_collisions(); check_bumped();    // fill the buffers + edge-detect a bump -> recoil
    check_gate_push();                     // a closing gate shoves a stand/crouch/turn char out (seg000.c:1214)
  }
  check_action();                          // do_fall / check_on_floor — reads across a boundary via the unclamped col
  checkPress(ch);                          // loose-floor trigger (grounded on tile 11 -> make_loose_fall)
  leaveRoom();                             // exit_room: the room cross, AFTER the kid frame (seg000.c:881)
}

// --- render the on-screen room (blocks/ledges) + the prince -----------------------
const LEDGE = 4;                     // floor-slab thickness in internal-y units

function drawRoom(room) {
  // backdrop over the whole canvas (the room + all four neighbour-room slivers)
  ctx.fillStyle = '#141924';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // cols -1..10 AND rows -1..3: getTile link-hops so the margins show the neighbour rooms — col -1/10 =
  // the left/right room's col 9/0, row -1 = the ABOVE room's row 2 (the source's draw_tile_aboveroom,
  // seg008.c:148), row 3 = the BELOW room's row 0, and the corners = the diagonal rooms (a void link
  // reads as a wall = a solid cap). The canvas clips each to a sliver. yTop(r) = row r's ceiling in
  // internal-y; r < 0 extrapolates one row-height (63) above Y_LAND[0] for the above-room row.
  const yTop = (r) => r < 0 ? Y_LAND[0] + r * 63 : Y_LAND[r];
  const roomTop = screenY(Y_LAND[0]), roomBot = screenY(Y_LAND[3]);   // active-room top / row-2 floor line
  // Draw the vertical-sliver rows (-1 above, 3 below) FIRST as background — each CLIPPED to its own margin
  // so the neighbour's tiles + floor slabs can't bleed into the active room (its ledge or its ceiling) —
  // then the active room's rows (0,1,2) ON TOP, so the active room is the foreground at both boundaries.
  // (A pure bottom-to-top reverse would fix only the bottom; clipping the slivers fixes both cleanly.)
  for (const row of [-1, 3, 0, 1, 2]) {
    const sliver = row < 0 || row > 2;
    if (sliver) {                                   // confine the above/below sliver to its own margin
      ctx.save(); ctx.beginPath();
      // The above room's floor slabs (its row-2 LEDGES) sit LEDGE px below roomTop — and the prince
      // collides with them (a jump-up bonks that ceiling), so the top clip must include them (down to
      // roomTop + LEDGE), else he's blocked by an invisible ledge. The below room only shows walls
      // (its floor is off-canvas), so its clip is just the bottom margin.
      if (row < 0) ctx.rect(0, 0, cv.width, roomTop + LEDGE * sy);
      else         ctx.rect(0, roomBot, cv.width, cv.height - roomBot);
      ctx.clip();
    }
    for (let col = -1; col <= 10; col++) {
    const t = getTile(level, room, col, row);
    const cx = screenX(SCREENSPACE_X + col * TILE_SIZEX);
    const cellTopY = screenY(yTop(row));            // ceiling of this row (= row-1 floor line)
    const floorY = screenY(yTop(row + 1));          // this row's floor line (feet rest here)
    const cellW = TILE_SIZEX * sx, cellH = floorY - cellTopY;
    if (wallType(t) === 4) {                          // solid wall block
      ctx.fillStyle = '#5b6b82'; ctx.fillRect(cx, cellTopY, cellW, cellH);
      ctx.fillStyle = '#6f8199'; ctx.fillRect(cx, cellTopY, cellW, 2 * zoom);
    } else if (t === 4) {                             // gate = portcullis; bars RETRACT by its open height
      // The gate's bg modifier is its open height (0 closed .. 188 open, 238 held, 0xFF permanent) — the
      // same byte can_bump_into_gate reads. Draw the bars hanging from the top, their bottom edge sliding
      // UP as it opens (openFrac 0 -> full bars/closed, 1 -> just the top frame/open-walk-under). Flat-2D
      // re-derivation of the source's pseudo-3D gate draw (view-space, CLAUDE.md lesson 6c). The bars sit
      // in the tile's RIGHT part (px 16..31 of the 32px tile) — the portcullis is a "wall at right"
      // (wall_type 1), so its visible face is the right side of the cell, not the whole width.
      const mod = getTileModif(level, room, col, row);
      const openFrac = Math.min(mod, 188) / 188;
      const barBottom = cellTopY + (floorY - cellTopY) * (1 - openFrac);
      const tpx = (p) => cx + cellW * p / 32;          // tile-px (0..32) -> screen x
      const GATE_L = 16, GATE_R = 31;                  // bars span the tile's right part
      ctx.fillStyle = '#7f8c5a'; ctx.fillRect(cx, floorY, cellW, LEDGE * sy);  // the floor at its base
      ctx.fillStyle = '#c9a13b';                       // brass bars (retracted from the bottom up)
      const bars = 4, bw = Math.max(1, Math.round(zoom));
      for (let b = 0; b < bars; b++)
        ctx.fillRect(Math.round(tpx(GATE_L + b * (GATE_R - GATE_L) / (bars - 1)) - bw / 2), cellTopY, bw, Math.max(0, barBottom - cellTopY));
      ctx.fillRect(Math.round(tpx(GATE_L)), cellTopY, Math.round(tpx(GATE_R) - tpx(GATE_L)) + bw, Math.max(1, Math.round(zoom)));  // top frame over the bars
    } else if (t === 15 || t === 6) {                 // pressure button: a floor with a raised plate on top
      // A button is a floor you stand on (tile_is_floor(15/6) == true), so draw the floor slab, then a
      // small coloured plate centred on it so you can SEE where the plate is. Colours match the block-map
      // demo: raise (15) = blue, drop (6) = orange. Static (the pressed-anim/debounce isn't drawn).
      ctx.fillStyle = '#7f8c5a'; ctx.fillRect(cx, floorY, cellW, LEDGE * sy);
      const bwid = Math.round(cellW * 0.55), bh = Math.max(2, Math.round(3 * zoom));
      ctx.fillStyle = (t === 15) ? '#4a90d0' : '#d07a4a';
      ctx.fillRect(Math.round(cx + (cellW - bwid) / 2), floorY - bh, bwid, bh);
    } else if (t === 22) {                            // the SWORD lying on the floor (the objective)
      // Drawn as a bright steel blade + a small brass hilt lying flat, so the milestone item is easy to
      // spot. Only drawn while the tile IS a sword — after pickup do_pickup erases it to floor (t=1).
      ctx.fillStyle = '#7f8c5a'; ctx.fillRect(cx, floorY, cellW, LEDGE * sy);   // floor base
      const blW = Math.round(cellW * 0.6), th = Math.max(2, Math.round(2 * zoom));
      const bx = Math.round(cx + (cellW - blW) / 2), by = floorY - th - Math.max(1, Math.round(zoom));
      ctx.fillStyle = '#dbe3ee'; ctx.fillRect(bx, by, blW, th);                 // steel blade
      ctx.fillStyle = '#c9a13b'; ctx.fillRect(bx - 1, by - th, Math.max(2, Math.round(2 * zoom)), th * 3);  // brass hilt
    } else if (t === 2) {                             // SPIKES (a floor tile) — labelled, though the hazard isn't wired yet
      // Spikes sit in the floor and stab upward. Not yet a hazard (no is_spike_harmful / check_spiked),
      // but drawn as red blades pointing up from the floor line (block-map palette) so you can see them.
      ctx.fillStyle = '#7f8c5a'; ctx.fillRect(cx, floorY, cellW, LEDGE * sy);   // floor base
      ctx.fillStyle = '#b04040';
      const n = 3, sh = Math.max(3, Math.round(6 * zoom)), hw = Math.max(1, (cellW / n) * 0.3);
      for (let s = 0; s < n; s++) {
        const xm = cx + (s + 0.5) * cellW / n;
        ctx.beginPath(); ctx.moveTo(xm - hw, floorY); ctx.lineTo(xm, floorY - sh); ctx.lineTo(xm + hw, floorY); ctx.closePath(); ctx.fill();
      }
    } else if (tileIsFloor(t)) {                      // floor: slab with its top on the feet line
      ctx.fillStyle = (t === 11) ? '#8a7048' : '#7f8c5a';
      ctx.fillRect(cx, floorY, cellW, LEDGE * sy);
    }
    }
    if (sliver) ctx.restore();                        // end this sliver row's clip
  }
  // Dim the neighbour-room SLIVERS in all four margins so they read as adjacent rooms, not the active
  // one. A translucent wash toward the page bg darkens each margin; the prince is drawn after drawRoom,
  // so he stays full-brightness even when he overlaps a margin. The active room keeps its row-2 floor
  // slab (the ledge, LEDGE px below roomBot) BRIGHT — so the bottom wash starts at ledgeBot and the L/R
  // strips run down to ledgeBot too. Top/bottom strips span the full width (dimming the corners as well).
  const ledgeBot = roomBot + LEDGE * sy;
  const leftEdge = screenX(SCREENSPACE_X), rightEdge = screenX(SCREENSPACE_X + ROOM_XSPAN);
  ctx.fillStyle = 'rgba(13,16,23,0.6)';             // #0d1017 @ 60%
  ctx.fillRect(0, 0, cv.width, roomTop);                          // top sliver (the above room's row 2)
  ctx.fillRect(0, ledgeBot, cv.width, cv.height - ledgeBot);      // bottom sliver (below the row-2 ledge)
  ctx.fillRect(0, roomTop, leftEdge, ledgeBot - roomTop);         // left margin (down to the ledge bottom)
  ctx.fillRect(rightEdge, roomTop, cv.width - rightEdge, ledgeBot - roomTop);  // right margin
}

function draw() {
  ctx.fillStyle = '#0d1017'; ctx.fillRect(0, 0, cv.width, cv.height);
  drawRoom(drawnRoom);

  const [image, , frameDx, frameDy] = FRAME_TABLE_KID[ch.frame];
  const sp = spriteOf(ch.frame);
  if (sp) {
    // reg-point registration (motion sandbox / draw_mid, seg008.c:1022/1736). Rounded so the
    // silhouette stays crisp — sx = 320/140 is fractional, so raw positions are sub-pixel.
    const regX = Math.round(screenX(ch.x - RENDER_X_BIAS) + (ch.direction < DIR_RIGHT ? -frameDx : frameDx) * sx);
    const feetY = screenY(ch.y + frameDy);
    const top = Math.round(feetY - (sp.content.maxy + 1) * spriteScale);
    if (ch.direction >= DIR_RIGHT) {                 // facing right: mirror about reg point
      ctx.save(); ctx.translate(regX, top); ctx.scale(-1, 1);
      sp.draw(ctx, 0, 0, { color: tint, scale: spriteScale }); ctx.restore();
    } else {                                          // facing left (native)
      sp.draw(ctx, regX, top, { color: tint, scale: spriteScale });
    }
  }

  const dirTxt = ch.direction < DIR_RIGHT ? 'left' : 'right';
  hud.textContent =
    `room=${padN(ch.room, 2)}  col=${padN(ch.curr_col, 2)} row=${padN(ch.curr_row, 1)}  ` +
    `Char.x=${padN(ch.x, 3)} Char.y=${padN(Math.round(ch.y), 4)}  ` +
    `frame=${padN(ch.frame, 3)}  dir=${padW(dirTxt, 5)}  act=${padN(ch.action, 1)}  fall_y=${padN(ch.fall_y, 2)}  ` +
    `sword=${padW(ch.have_sword ? 'yes' : 'no', 3)}`;
}

// --- controls / loop ---
$('zoom').oninput = () => { zoom = +$('zoom').value; $('zoomval').textContent = zoom + '×'; applyZoom(); };
$('tint').oninput = () => { tint = $('tint').value; };
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'play' : 'pause'; };

// Game frame period, DOS-faithful: the source advances one game frame every base_speed = 5
// ticks of its 60 Hz timer (BASE_FPS, types.h:1373; base_speed, data.h:869 / seg003.c:367) —
// 5 * 1000/60 = 83.33 ms/frame = 12 fps. (Combat uses fight_speed = 6 -> 10 fps; no combat here.)
const TICK_MS = 83;
let last = 0, acc = 0;
function loop(ts) {
  if (!last) last = ts;
  acc += ts - last; last = ts;
  if (!paused) { let n = 0; while (acc >= TICK_MS && n < 8) { tick(); acc -= TICK_MS; n++; } }
  else { acc = 0; }
  if (sheet) draw();
  requestAnimationFrame(loop);
}

applyZoom();
MaskSheet.load('./gfx/kid_masks.json').then((s) => {
  sheet = s;
  bindKernel({ Char: ch, getSprite: spriteOf, getDrawnRoom: () => drawnRoom });  // ch + sprite dims + the LIVE drawn room
  kSetLevel(level);
  dropAtStart();                     // level-1 falling entry
  // Console handle (open with index.html#debug): step the engine deterministically.
  if (location.hash === '#debug') {
    window.POP = { ch, restart: dropAtStart, step: tick, render: draw,
                   pause: (v) => { paused = v; }, hud: () => hud.textContent,
                   keys,                                             // raw key state — set for hold/tap tests
                   ctrl: () => ({ x: control.x, forward: control.forward, backward: control.backward,
                                  shift: control.shift, shift2: control.shift2 }),  // latch state
                   place: (room, col, row, dir) => {                 // teleport for testing
                     ch.room = room; drawnRoom = room; ch.curr_col = col; ch.curr_row = row;
                     ch.x = standX(col); ch.y = Y_LAND[row + 1]; ch.direction = dir;
                     ch.fall_x = 0; ch.fall_y = 0; startSeq(ch, 'stand'); playSeq(ch);
                     ctrl1.forward = ctrl1.backward = ctrl1.shift2 = RELEASED;   // reset the latch for a clean test
                   },
                   room: () => drawnRoom,
                   tile: (room, col, row) => level.rooms[room - 1].fg[row][col] & 0x1F,  // live tile type
                   modif: (room, col, row) => level.rooms[room - 1].bg[row][col],        // loose-timer byte
                   trobs: () => trobs.list };
  }
  requestAnimationFrame(loop);
}).catch((e) => { hud.textContent = 'load error: ' + e.message; });
