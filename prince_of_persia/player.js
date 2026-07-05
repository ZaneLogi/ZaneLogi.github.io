// player.js — THE player: the prince dropped into level 1 with REAL tile collision.
// He stands on ledges, is blocked by walls, and falls when unsupported — driven by the
// ported collision substrate (collision.js) and the animation engine (playseq.js /
// seqtbl.js). Position is PoP's room-relative bounded model: Char.x is a room-relative
// internal-x, Char.room is which room he's in, curr_col/curr_row are DERIVED each frame,
// and crossing a room edge swaps the drawn room + rebases Char.x (research_collision.md).
//
// Per-tick order follows play_frame / play_kid_frame (seg000.c:869/1192):
//   process_trobs (loose floors) -> control -> play_seq -> fall_accel -> fall_speed
//   -> determine_col -> set_char_collision -> check_bumped (wall recoil) -> (room cross)
//   -> check_action (freefall: do_fall / grounded: check_on_floor) -> check_press (loose-floor)
//
// Rendering reuses the motion-sandbox registration exactly (reg-point flip, content.maxy
// feet); the only new part is the room-relative coordinate maps below. GPLv3 (see NOTICE).
import { MaskSheet } from './masksheet.js';
import { FRAME_TABLE_KID } from './res/frame_table_kid.js';
import { LEVEL1 } from './res/level1.js';
import { makeCharacter, startSeq, playSeq, fallAccel, fallSpeed, charDxForward,
         DIR_RIGHT, DIR_LEFT, ACT_IN_MIDAIR, ACT_IN_FREEFALL } from './playseq.js';
import { getTile, tileIsFloor, wallType, tileDivMod, tileDivModM7, standX,
         Y_LAND, SCREENSPACE_X, TILE_SIZEX, TILE_RIGHTX, ROOM_XSPAN, ROOM_YSPAN,
         getTileAtChar, distanceToEdge, yToRowMod4,
         EDGE_WALL, EDGE_FLOOR, EDGE_CLOSER } from './collision.js';
import { controlKid, makeControl, HELD, RELEASED, FWD, NONE, BACK } from './control.js';
import { makeTrobs, processTrobs, makeLooseFall, TILE_LOOSE } from './trob.js';

// Frame flags (types.h:379-381): FRAME_WEIGHT_X = low 5 bits, FRAME_NEEDS_FLOOR = 0x40.
const FRAME_WEIGHT_X = 0x1F, FRAME_NEEDS_FLOOR = 0x40;
const frameFlags = (f) => FRAME_TABLE_KID[f][4];
// Character actions used by check_press's gate (types.h:407-414).
const ACT_HANG_CLIMB = 2, ACT_BUMPED = 5, ACT_TURN = 7;

// A MUTABLE working copy of the level: loose floors collapse into it (fg 11 -> 0), so the
// tile data itself changes just as the source's curr_room_tiles does. LEVEL1 (the shared
// module const, also used by the block-map demo) is never touched; a restart re-clones it,
// restoring every loose tile. trobs = the active transient-object list (loose floors only).
let level = structuredClone(LEVEL1);
const trobs = makeTrobs();
function resetLevel() { level = structuredClone(LEVEL1); trobs.list = []; }
const cv = document.getElementById('stage');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud');
const $ = (id) => document.getElementById(id);

const padN = (v, n) => String(v).padStart(n);
const padW = (v, n) => String(v).padEnd(n);

// --- view / render mapping ---------------------------------------------------------
// A 320x200 DOS frame at an integer zoom, mapped with the DOS obj_x/obj_y convention:
// internal-x -> 2 px/unit (obj_x = 2*internal, so a tile is 28 px), internal-y -> 1 px/unit.
// A room (140 x-units) = 280 px; that leaves 40 px in the 320 frame, split into a 20 px
// margin each side. Those margins show SLIVERS of the neighbour rooms (the DOS layout):
// drawRoom draws cols -1..10, so col -1 = the left room's col 9 and col 10 = the right
// room's col 0 (getTile hops the link; a void link reads as a wall = a solid cap). Internal-y
// stays 1:1, so the sprite registration is untouched. Coord pipeline: research_collision.md §2.1.
const BASE_W = 320, BASE_H = 200;
let zoom = 2;
let sx, sy, spriteScale, ROOM_X0, ROOM_Y0;              // set by applyZoom()
function applyZoom() {
  cv.width = BASE_W * zoom; cv.height = BASE_H * zoom;
  sx = 2 * zoom; sy = 1 * zoom; spriteScale = zoom;     // 2 px/internal-x (28 px tile), 1 px/internal-y
  ROOM_X0 = 20 * zoom; ROOM_Y0 = 6 * zoom;              // 20 px side margins (neighbour slivers); small top margin
}
// internal (room-relative) -> screen px. x measured from the room's col-0 left edge (58);
// y measured from the room's top (y_land[0] = -8), so y_land[r+1] lands on row r's floor.
const screenX = (ix) => ROOM_X0 + (ix - SCREENSPACE_X) * sx;
const screenY = (iy) => ROOM_Y0 + (iy - Y_LAND[0]) * sy;

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
  startSeq(ch, 'freefall');                // seq_7_fall (falling entry)
  playSeq(ch);
}

const spriteOf = (frame) => {
  const image = FRAME_TABLE_KID[frame][0];
  return image === 255 ? null : sheet.get(401 + image);
};

// --- collision physics (ported seg005.c / seg006.c) -------------------------------
// determine_col (seg006.c:122): Char.curr_col is DERIVED from Char.x each frame, taken at
// the frame's weight point (dx_weight, seg006.c:547).
function dxWeight(ch) {
  const [, , frameDx, , flags] = FRAME_TABLE_KID[ch.frame];
  return charDxForward(ch, frameDx - (flags & FRAME_WEIGHT_X));
}
function determineCol(ch) {
  ch.curr_col = tileDivModM7(dxWeight(ch));
  // Keep the char's own-tile column in [0,9] of his current room, ALWAYS. determine_col samples
  // ~10 units behind Char.x (the weight point), which at a tile/room edge — or when a fast run
  // frame overshoots the boundary — reads a phantom neighbour column (e.g. -1). That would make
  // clampToWall compute the wrong wall face and let the char slip through into the next room.
  // Room crossing is decided by Char.x (crossRooms), not curr_col, so clamping never blocks a
  // legitimate crossing; it's the clone's stand-in for the bump system keeping the char valid.
  ch.curr_col = Math.max(0, Math.min(9, ch.curr_col));
}

// Does a wall of this wall_type block the char's facing direction?
//   wall_type 1 = wall at right, 2 = at left, 3 = obstacle at left, 4 = both sides.
function wallBlocksFacing(wt, facingRight) {
  if (wt === 4) return true;
  return facingRight ? (wt === 1) : (wt === 2 || wt === 3);
}

// --- sub-tile wall collision, Char.x-based (§5b: Char.x detection feeds the bump below) --------
// Char.x IS the char's leading edge in the facing direction (set_char_collision, seg006.c:1021:
// char_x_right = Char.x facing right, char_x_left = Char.x facing left). So working in Char.x
// (not the weight-point curr_col) gives sub-tile wall approach that's symmetric and stable.
//
// wallAheadFace(ch): the internal-x the leading edge can advance to before a blocking wall in
// the facing direction — the wall's near face — or null if no wall ahead. Keyed off the LEADING
// EDGE column `tileDivMod(Char.x)`, NOT the weight-point curr_col: at a wall the weight point
// lags ~10 units behind and can sit in the wall while the edge is safely past it (facing away),
// so a curr_col-based test mis-fires. The wall column is the edge's own column if a fast frame
// overshot the edge into it, else the next column ahead; the limit is that column's near edge.
function wallAheadFace(ch) {
  const facingRight = ch.direction >= DIR_RIGHT;
  const isWall = (col) => wallBlocksFacing(wallType(getTile(level, ch.room, col, ch.curr_row)), facingRight);
  const edgeCol = tileDivMod(ch.x);                       // column of the leading edge (Char.x)
  let wallCol;
  if (isWall(edgeCol)) wallCol = edgeCol;                 // edge overshot INTO the wall
  else { wallCol = facingRight ? edgeCol + 1 : edgeCol - 1; if (!isWall(wallCol)) return null; }
  return facingRight ? (SCREENSPACE_X + wallCol * TILE_SIZEX)          // wall's LEFT edge
                     : (SCREENSPACE_X + (wallCol + 1) * TILE_SIZEX);   // wall's RIGHT edge
}

// get_edge_distance (seg004.c:378): the sub-tile distance to the edge ahead + its type — the input
// to the safe-step decision (control.js). Ported for the cases the player reaches: a WALL ahead
// (distance to its near face, keyed off the leading edge like `wallAheadFace`), a FLOOR ahead (a
// full careful step, 11), or an empty tile ahead = a LEDGE (distance to the current tile's forward
// edge, so a step stops right at the drop). The gate/doortop/loose/closer/sword/potion branches
// (seg004.c:401-431) are out of scope. The char is standing when this is read, so curr_col/curr_row
// are current. Returns { edgeType, distance }. This replaces the old `blockedForward` run-gate: the
// wall case with `distance < 8` IS forward_pressed's "step instead of run" rule (seg005.c:577), and
// the step now lands the char FLUSH (no more parking ~4 back after a bump).
function getEdgeDistance(ch) {
  // Decide by the tile DIRECTLY in front (curr_col + facing), as the source does (seg004.c:400).
  // Keying off the leading edge (wallAheadFace) would (a) find a wall ACROSS an empty tile and step
  // the char off a ledge toward it, and (b) MISS a wall a tile away or across a room boundary (it
  // only scans the leading-edge column ±1) — which falsely "blocked" a left-facing char at a room
  // edge. So compute the front column's near face directly, in the char's own room coordinates.
  const facingRight = ch.direction >= DIR_RIGHT;
  const frontCol = ch.curr_col + (facingRight ? 1 : -1);
  const front = getTile(level, ch.room, frontCol, ch.curr_row);          // hops the room link if off-room
  if (wallType(front) !== 0) {                          // a wall directly in front -> distance to its near face
    const face = facingRight ? (SCREENSPACE_X + frontCol * TILE_SIZEX)          // wall's LEFT edge
                             : (SCREENSPACE_X + (frontCol + 1) * TILE_SIZEX);   // wall's RIGHT edge
    const distance = Math.abs(face - ch.x);
    return distance <= TILE_RIGHTX ? { edgeType: EDGE_WALL, distance }
                                   : { edgeType: EDGE_FLOOR, distance: 11 };  // wall a full tile+ off -> step as floor
  }
  if (tileIsFloor(front)) return { edgeType: EDGE_FLOOR, distance: 11 };      // floor in front -> full step
  return { edgeType: EDGE_CLOSER, distance: distanceToEdge(ch, dxWeight(ch)) }; // empty in front = a ledge
}

// set_char_collision (seg006.c:1012): the character's collision box in internal-x. The FORWARD
// edge stays Char.x — char_x_right_coll = Char.x facing right, char_x_left_coll = Char.x facing
// left, on the frameDx==0 contact frames — so it does NOT change the forward wall stop (that's
// still keyed off Char.x below). char_width_half = (sprite width + 1)/2 gives the box only its
// BACKWARD extent, which the deferred trailing-edge / guard collision would use (§5b writeup).
// Anchored at the drawn x (char_dx_forward(frame.dx) = obj_x/2 + 58) so it tracks the sprite.
function setCharCollision(ch) {
  const [, , frameDx, , flags] = FRAME_TABLE_KID[ch.frame];
  const sp = spriteOf(ch.frame);
  const wHalf = sp ? (sp.w + 1) >> 1 : 0;               // char_width_half (0 for a blank frame, seg006.c:1015)
  let xl = charDxForward(ch, frameDx);                  // char_x_left = char_dx_forward(frame.dx)
  if (ch.direction >= DIR_RIGHT) xl -= wHalf;           // facing right (seg006.c:1023)
  let xr = xl + wHalf;
  if (flags & 0x20 /*FRAME_THIN*/) { xl += 4; xr -= 4; } // seg006.c:1038
  ch.char_x_left_coll = xl; ch.char_x_right_coll = xr; ch.char_width_half = wHalf;
}

// --- the bump: wall collision with the faithful recoil (§5b) ------------------------
// We substitute the source's per-column collision buffers (check_collisions/get_row_collision_data)
// with the Char.x DETECTION below — what that defers is written up in research_collision.md §5b —
// but on top of it run the faithful bumped/bumped_floor/bumped_fall dispatch so a wall hit plays
// the real recoil (seq_47_bump) or tips into a fall (seq_45_bumpfall), instead of a dead stop.

// bumped_fall (seg004.c:298): bumped a wall with no floor to catch him -> tip into a fall.
function bumpedFall(ch) {
  if (ch.action === ACT_IN_FREEFALL) { ch.fall_x = 0; return; }   // already falling: just kill x-drift
  ch.x = charDxForward(ch, -4);                                   // skid back off the wall
  startSeq(ch, 'bumpfall'); playSeq(ch);                          // seq_45_bumpfall -> freefall
}

// bumped_floor (seg004.c:311): grounded wall bump. Floor far below (>=15) -> it's really a fall;
// else seat the feet and pick the hard bump (jump/fall-onset frames) or the normal recoil.
function bumpedFloor(ch) {
  if (Y_LAND[ch.curr_row + 1] - ch.y >= 15) { bumpedFall(ch); return; }
  ch.y = Y_LAND[ch.curr_row + 1];
  if (ch.fall_y >= 22) { ch.x = charDxForward(ch, -5); return; }  // heavy-landing bump (no recoil seq)
  ch.fall_y = 0;
  const f = ch.frame;
  const hard = (f === 24 || f === 25 || (f >= 40 && f < 43) || (f >= 102 && f < 107));
  startSeq(ch, hard ? 'hardbump' : 'bump');                       // seq_46_hardbump / seq_47_bump
  playSeq(ch);
}

// checkBumped (replaces clampToWall): detect the forward edge (Char.x) passing the wall face this
// tick, pin Char.x to the face (= bumped()'s push-back, seg004.c:266), then dispatch the recoil by
// the char's floor state. Skips a turn (check_collisions returns early on action 7, seg004.c:44),
// so the turn's own dx carries him off the face. The recoil (seq_47's dx(-4)) leaves him ~4 units
// back; forward_pressed then safe_steps him flush to the wall (step4), no re-run/bump oscillation.
function checkBumped(ch) {
  if (ch.action === 7 /*actions_7_turn*/) return;
  if (ch.testing) return;               // test-foot: the peer-over lean reaches over the edge on purpose
  const face = wallAheadFace(ch);
  if (face === null) return;
  const past = ch.direction >= DIR_RIGHT ? (ch.x > face) : (ch.x < face);
  if (!past) return;
  ch.x = face;                                   // bumped(): pin Char.x to the wall face (seg004.c:269)
  determineCol(ch);                              // curr_col at the pinned x, for the floor decision
  // bumped()'s floor test uses the tile the char STANDS on — the wall's neighbour on his side, NOT
  // the wall itself (seg004.c:270-288 steps tile_col off the wall by ±1). Without this, a bump where
  // curr_col lands on the wall reads tile_is_floor(wall)=false and wrongly plays bumpfall.
  let col = ch.curr_col;
  if (wallType(getTile(level, ch.room, col, ch.curr_row)) !== 0)
    col += (ch.direction >= DIR_RIGHT) ? -1 : +1;   // facing right: char is left of the wall; left: right
  if (ch.action !== ACT_IN_FREEFALL && tileIsFloor(getTile(level, ch.room, col, ch.curr_row)))
    bumpedFloor(ch);                             // grounded -> recoil (seq_47/46)
  else
    bumpedFall(ch);                              // no floor -> tip into a fall (seq_45)
  determineCol(ch);                              // re-derive at the recoiled position for the rest of the tick
}

// land (seg005.c:114): clamp feet to the floor line, pick the landing by impact speed
// (soft <22 / medium <33 / hard >=33, seg005.c:174), then emit its first frame.
function land(ch) {
  ch.y = Y_LAND[ch.curr_row + 1];
  const fy = ch.fall_y;
  startSeq(ch, fy < 22 ? 'softland' : fy < 33 ? 'medland' : 'hardland');
  playSeq(ch);
  ch.fall_y = 0;                           // seg005.c:216
}

// do_fall (seg005.c:37): once the feet reach curr_row's floor line, land on a floor or
// descend to the next row (inc_curr_row); otherwise keep falling.
function doFall(ch) {
  if (Y_LAND[ch.curr_row + 1] > ch.y) return;   // feet haven't reached the floor line yet
  const t = getTile(level, ch.room, ch.curr_col, ch.curr_row);
  if (tileIsFloor(t)) land(ch);
  else ch.curr_row++;                             // inc_curr_row (seg006.c:2152)
}

// start_fall (seg006.c:1099): drop off a ledge — descend a row, switch to freefall.
function startFall(ch) {
  ch.curr_row++;                                  // inc_curr_row
  startSeq(ch, 'freefall');                       // seq_7_fall (general grounded case)
  playSeq(ch);
  determineCol(ch);
}

// check_on_floor (seg006.c:1046): for a grounded frame that needs a floor, start a fall if
// the tile under the char isn't a floor — EXCEPT a wall. The source ejects from a wall
// (`if (get_tile_at_char() == tiles_20_wall) in_wall()`) before the floor test; a wall is a
// solid obstacle, not a hole, so you never fall *through* one. The clone's stand-in: if the
// weight-point column reads a wall (a fast run frame can overshoot the leading edge into a
// wall column for a tick), don't fall — clampToWall pins the leading edge at the face.
function checkOnFloor(ch) {
  if (ch.testing) return;               // test-foot: the weight stays on the floor; the lean must not fall
  if (!(frameFlags(ch.frame) & FRAME_NEEDS_FLOOR)) return;
  const t = getTileAtChar(level, ch);
  if (wallType(t) !== 0) return;                  // in/against a wall (solid) — not a hole
  if (!tileIsFloor(t)) startFall(ch);
}

// check_action (seg006.c:909): the collision hub — freefall lands/descends via do_fall,
// a grounded frame checks its floor.
function checkAction(ch) {
  if (ch.action === ACT_IN_FREEFALL) doFall(ch);
  else if (ch.action === ACT_IN_MIDAIR) { /* frames 102..105 check_grab — not modeled */ }
  else checkOnFloor(ch);
}

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
  else determineCol(ch);                         // re-derive curr_col in the new room
  drawnRoom = ch.room;                           // redraw_screen(1) — the room on screen swaps
}

// leave_room (seg002.c:423) trigger, Char.x-based (the leading edge). Two guards + a
// direction-dependent threshold, ported from the source:
//   - NO leave during a TURN (action 7) or while STANDING UP from a crouch (frames 110-119)
//     (seg002.c:440/459). Both wiggle Char.x with their own dx while stationary; without
//     the turn guard the turn's dx shoves Char.x past the edge and crosses into the
//     neighbour — even a WALLED one, because clampToWall also skips the turn so nothing
//     pins Char.x at the wall face first (this was the "turn-at-the-left-edge teleports you
//     into the next room" bug).
//   - the horizontal threshold is on the LEADING EDGE and differs by facing (seg002.c:462-483;
//     leading edge = char_x_right facing right / char_x_left facing left, both == Char.x):
//     facing right -> cross right at Char.x >= 201, left at Char.x <= 57; facing left ->
//     cross left at Char.x <= 54, right at Char.x >= 198. (A standing turn nets only ~7 units,
//     so it can't reach these from a legitimate standing column — the guard is belt-and-braces.)
// Vertical stays curr_row-driven (the clone's fall/climb model). A 0 link is the void (no cross).
function crossRooms() {
  if (ch.action === ACT_TURN) return;                        // seg002.c:459
  if (ch.frame >= 110 && ch.frame < 120) return;             // seg002.c:440 (stand up from crouch)
  const links = level.rooms[ch.room - 1].links;
  const facingRight = ch.direction >= DIR_RIGHT;
  const crossRightAt = facingRight ? 201 : 198;              // char_x_right>=201 / char_x_left>=198
  const crossLeftAt  = facingRight ? 57  : 54;               // char_x_right<=57  / char_x_left<=54
  if (ch.x >= crossRightAt && links.right)     gotoRoom(links.right, 'right');
  else if (ch.x <= crossLeftAt && links.left)  gotoRoom(links.left, 'left');
  else if (ch.curr_row >= 3 && links.down)     gotoRoom(links.down, 'down');
  else if (ch.curr_row < 0 && links.up)        gotoRoom(links.up, 'up');
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
function buildControl() {
  const facingRight = ch.direction >= DIR_RIGHT;
  const fwdKey = facingRight ? keys.right : keys.left;         // arrow toward the facing dir
  const backKey = facingRight ? keys.left : keys.right;
  control.forward = fwdKey ? HELD : RELEASED;
  control.backward = backKey ? HELD : RELEASED;
  control.up = keys.up ? HELD : RELEASED;
  control.down = keys.down ? HELD : RELEASED;
  control.shift = keys.shift ? HELD : RELEASED;
  control.x = fwdKey ? FWD : (backKey ? BACK : NONE);          // control_x, facing-relative
}

const world = { edgeDistance: () => getEdgeDistance(ch) };

// --- one engine tick — faithful play_kid_frame order (seg000.c:1192) --------------
function tick() {
  processTrobs(trobs, level);              // top of play_frame: advance + collapse loose floors
  buildControl();
  controlKid(ch, control, world);          // play_kid/control: pick the next sequence
  playSeq(ch);                             // run it -> new frame + Char.x/y
  fallAccel(ch); fallSpeed(ch);            // gravity (freefall only)
  determineCol(ch);                        // recompute curr_col from Char.x (clamped in-room)
  setCharCollision(ch);                    // the collision box (char_x_left/right_coll)
  checkBumped(ch);                         // wall bump: pin Char.x to the face + recoil (seq_47/46/45)
  crossRooms();                            // swap the room at an open edge (rebase Char.x/y)
  checkAction(ch);                         // do_fall / check_on_floor
  checkPress(ch);                          // loose-floor trigger (grounded on tile 11 -> make_loose_fall)
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
    const regX = Math.round(screenX(ch.x) + (ch.direction < DIR_RIGHT ? -frameDx : frameDx) * sx);
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
  dropAtStart();                     // level-1 falling entry
  // Console handle (open with index.html#debug): step the engine deterministically.
  if (location.hash === '#debug') {
    window.POP = { ch, restart: dropAtStart, step: tick, render: draw,
                   pause: (v) => { paused = v; }, hud: () => hud.textContent,
                   place: (room, col, row, dir) => {                 // teleport for testing
                     ch.room = room; drawnRoom = room; ch.curr_col = col; ch.curr_row = row;
                     ch.x = standX(col); ch.y = Y_LAND[row + 1]; ch.direction = dir;
                     ch.fall_x = 0; ch.fall_y = 0; startSeq(ch, 'stand'); playSeq(ch);
                   },
                   room: () => drawnRoom,
                   tile: (room, col, row) => level.rooms[room - 1].fg[row][col] & 0x1F,  // live tile type
                   modif: (room, col, row) => level.rooms[room - 1].bg[row][col],        // loose-timer byte
                   trobs: () => trobs.list };
  }
  requestAnimationFrame(loop);
}).catch((e) => { hud.textContent = 'load error: ' + e.message; });
