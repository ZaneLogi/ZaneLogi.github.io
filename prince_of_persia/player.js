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
         getTileBehindAboveChar, getTileBehindChar, canGrab, distanceToEdge, yToRowMod4, EDGE_WALL } from './collision.js';
import { controlKid, makeControl, HELD, RELEASED, FWD, NONE, BACK } from './control.js';
import { makeTrobs, processTrobs, makeLooseFall, TILE_LOOSE } from './trob.js';
// The routine-level-identical collision kernel (seg004.c/seg006.c). Replaces the old Char.x-clamp
// substitute: determine_col / set_char_collision / the per-column buffer scan (check_collisions) /
// the bump dispatch (check_bumped) / get_edge_distance all run the source's own arithmetic, so the
// wall face is the faithful inset (coll_tile_left_xpos + TILE_MIDX ± wall_dist), not the raw tile edge.
import { bindKernel, setLevel as kSetLevel,
         determine_col, load_frame_to_obj, set_char_collision, check_collisions,
         check_bumped, check_action, get_edge_distance, edge_type } from './collision_kernel.js';

// Frame flags (types.h:379-381): FRAME_WEIGHT_X = low 5 bits, FRAME_NEEDS_FLOOR = 0x40.
const FRAME_WEIGHT_X = 0x1F, FRAME_NEEDS_FLOOR = 0x40;
const frameFlags = (f) => FRAME_TABLE_KID[f][4];
// Character actions used by check_press's gate (types.h:407-414).
const ACT_HANG_CLIMB = 2, ACT_BUMPED = 5, ACT_HANG_STRAIGHT = 6, ACT_TURN = 7;
// Tile types the grab/hang tests special-case (types.h): doortop-with-floor and plain doortop.
const TILE_DOORTOP_FLOOR = 7, TILE_DOORTOP = 12;

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
// A room (10 tiles) = 320 px = the full DOS screen width. To keep this flat 2D view legible we add
// ONE extra tile (32 px) of margin each side as a SLIVER of the neighbour room — drawRoom draws cols
// -1..10, so col -1 = the left room's col 9 and col 10 = the right room's col 0 (getTile hops the
// link; a void link reads as a wall = a solid cap), darkened so they read as adjacent. These slivers
// are how the 2D view conveys what the source's pseudo-3D draw shows in-frame (a wall / portcullis /
// a passage to the next room). Canvas = 32 + 320 + 32 = 384 px wide. Coords: research_collision.md §2.1.
const TILE_PX = 32, MARGIN_PX = TILE_PX;               // 32 px/tile (faithful); a 1-tile sliver each side
const BASE_W = 10 * TILE_PX + 2 * MARGIN_PX, BASE_H = 200;   // 320 room + 2*32 margins = 384
let zoom = 1;                                          // default 1x: a native 384x200 frame (32 px tiles)
let sx, sy, spriteScale, ROOM_X0, ROOM_Y0;              // set by applyZoom()
function applyZoom() {
  cv.width = BASE_W * zoom; cv.height = BASE_H * zoom;
  sx = (TILE_PX / TILE_SIZEX) * zoom;                  // 32/14 per internal-x = the *320/280 stretch -> 32 px tile
  sy = 1 * zoom; spriteScale = zoom;                    // internal-y 1:1 (63 px row); sprite at native px * zoom
  ROOM_X0 = MARGIN_PX * zoom; ROOM_Y0 = 6 * zoom;       // one-tile (32 px) sliver margin each side
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
  ctrl1.forward = ctrl1.backward = RELEASED;   // clear_saved_ctrl (seg006.c:1552): a restart resets the latch
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

// check_press (seg006.c:1683): the loose-floor (and, in the full game, button) trigger.
// For a grounded / turning / bumped actor on a frame that needs a floor, read the tile
// underfoot; a loose tile (type 11) starts its collapse timer (make_loose_fall). Minimal
// port — no hanging/climbing frames, no jumphang break-from-above, no buttons yet — just
// loose floors. Runs after check_action, exactly as in play_kid_frame (seg000.c:1215-1216).
function checkPress(ch) {
  const a = ch.action;
  if (!(a === ACT_TURN || a === ACT_BUMPED || a < ACT_HANG_CLIMB)) return;  // grounded/turn/bumped only
  if (!(frameFlags(ch.frame) & FRAME_NEEDS_FLOOR)) return;                   // needs floor contact
  if (getTileAtChar(level, ch) === TILE_LOOSE)
    makeLooseFall(trobs, level, ch.room, ch.curr_col, ch.curr_row);
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
    if (ch.x >= 201 && links.right)     gotoRoom(links.right, 'right');
    else if (ch.x <= 57 && links.left)  gotoRoom(links.left, 'left');
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
// oscillate (research_collision.md §5c). control.x is the raw axis the latch reads. control.up/down/
// shift stay simple raw HELD/RELEASED — their repeat is already gated by the frame dispatch, so the
// vertical latch (control_up/down via ctrl1) is a deferred follow-on, not ported here.
const ctrl1 = { forward: RELEASED, backward: RELEASED };
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

// rest_ctrl_1 (seg006.c:1543): restore the latched forward/backward from the previous tick.
function restCtrl1() { control.forward = ctrl1.forward; control.backward = ctrl1.backward; }

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
}

// save_ctrl_1 (seg006.c:1534): persist the latch (as control() left it) to the next tick.
function saveCtrl1() { ctrl1.forward = control.forward; ctrl1.backward = control.backward; }

const world = {
  edgeDistance: edgeDist,                   // kernel get_edge_distance -> { edgeType, distance }
  jumpUp: () => checkJumpUp(ch),            // up while standing -> jump / grab a ledge above
  climbUp: () => canClimbUp(ch),            // up while hanging -> climb onto the ledge
  hangFall: () => hangFall(ch),             // release a hang -> drop / fall
  hangAgainstWall: () => hangAgainstWall(ch),  // shift while hanging -> hang flat / let go
  runJump: () => runJump(ch),               // up while running -> the running (horizontal) jump
  downPressed: () => downPressed(ch),       // down while standing -> climb down / crouch
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
  if (!ch.testing) { check_collisions(); check_bumped(); }   // fill the buffers + edge-detect a bump -> recoil
  check_action();                          // do_fall / check_on_floor — reads across a boundary via the unclamped col
  checkPress(ch);                          // loose-floor trigger (grounded on tile 11 -> make_loose_fall)
  leaveRoom();                             // exit_room: the room cross, AFTER the kid frame (seg000.c:881)
}

// --- render the on-screen room (blocks/ledges) + the prince -----------------------
const LEDGE = 4;                     // floor-slab thickness in internal-y units

function drawRoom(room) {
  // backdrop across the full width (the room + the neighbour slivers in the side margins)
  ctx.fillStyle = '#141924';
  ctx.fillRect(0, screenY(Y_LAND[0]), cv.width, (Y_LAND[3] - Y_LAND[0]) * sy);
  // cols -1..10: col -1 = a sliver of the LEFT neighbour's col 9, col 10 = the RIGHT neighbour's
  // col 0 (getTile hops the link; a 0 link = void reads as wall = a solid cap). The slivers land
  // in the 20 px side margins and the canvas clips them.
  for (let row = 0; row < 3; row++) for (let col = -1; col <= 10; col++) {
    const t = getTile(level, room, col, row);
    const cx = screenX(SCREENSPACE_X + col * TILE_SIZEX);
    const cellTopY = screenY(Y_LAND[row]);          // ceiling of this row (= row-1 floor line)
    const floorY = screenY(Y_LAND[row + 1]);        // this row's floor line (feet rest here)
    const cellW = TILE_SIZEX * sx, cellH = floorY - cellTopY;
    if (wallType(t) === 4) {                          // solid wall block
      ctx.fillStyle = '#5b6b82'; ctx.fillRect(cx, cellTopY, cellW, cellH);
      ctx.fillStyle = '#6f8199'; ctx.fillRect(cx, cellTopY, cellW, 2 * zoom);
    } else if (t === 4) {                             // gate = portcullis (also a floor you stand on)
      ctx.fillStyle = '#7f8c5a'; ctx.fillRect(cx, floorY, cellW, LEDGE * sy);  // the floor at its base
      ctx.fillStyle = '#c9a13b';                       // brass bars, top frame -> floor
      const bars = 4, bw = Math.max(1, Math.round(zoom));
      for (let b = 0; b < bars; b++)
        ctx.fillRect(Math.round(cx + (b + 0.5) * cellW / bars - bw / 2), cellTopY, bw, floorY - cellTopY);
      ctx.fillRect(cx, cellTopY, cellW, Math.max(1, Math.round(zoom)));        // top frame bar
    } else if (tileIsFloor(t)) {                      // floor: slab with its top on the feet line
      ctx.fillStyle = (t === 11) ? '#8a7048' : '#7f8c5a';
      ctx.fillRect(cx, floorY, cellW, LEDGE * sy);
    }
  }
  // Dim the neighbour-room SLIVERS in the side margins (cols -1 / 10) so they read as adjacent
  // rooms, not the active one. A translucent wash toward the page bg darkens both margins; the
  // prince is drawn after drawRoom, so he stays full-brightness even when he overlaps a margin.
  const topY = screenY(Y_LAND[0]), h = (Y_LAND[3] - Y_LAND[0]) * sy;
  const leftEdge = screenX(SCREENSPACE_X), rightEdge = screenX(SCREENSPACE_X + ROOM_XSPAN);
  ctx.fillStyle = 'rgba(13,16,23,0.6)';             // #0d1017 @ 60%
  ctx.fillRect(0, topY, leftEdge, h);
  ctx.fillRect(rightEdge, topY, cv.width - rightEdge, h);
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
    `frame=${padN(ch.frame, 3)}  dir=${padW(dirTxt, 5)}  act=${padN(ch.action, 1)}  fall_y=${padN(ch.fall_y, 2)}`;
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
                   ctrl: () => ({ x: control.x, forward: control.forward, backward: control.backward }),  // latch state
                   place: (room, col, row, dir) => {                 // teleport for testing
                     ch.room = room; drawnRoom = room; ch.curr_col = col; ch.curr_row = row;
                     ch.x = standX(col); ch.y = Y_LAND[row + 1]; ch.direction = dir;
                     ch.fall_x = 0; ch.fall_y = 0; startSeq(ch, 'stand'); playSeq(ch);
                     ctrl1.forward = ctrl1.backward = RELEASED;      // reset the latch for a clean test
                   },
                   room: () => drawnRoom,
                   tile: (room, col, row) => level.rooms[room - 1].fg[row][col] & 0x1F,  // live tile type
                   modif: (room, col, row) => level.rooms[room - 1].bg[row][col],        // loose-timer byte
                   trobs: () => trobs.list };
  }
  requestAnimationFrame(loop);
}).catch((e) => { hud.textContent = 'load error: ' + e.message; });
