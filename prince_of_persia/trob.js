// trob.js — the transient-object ("trob") system, a faithful port of SDLPoP's seg007.c. A trob is
// a tile that ANIMATES over several frames; each frame process_trobs ticks the active list and
// dispatches by the tile's type (animate_tile). This ports three:
//   - LOOSE FLOOR (tiles_11): stood on, it shakes for loose_floor_delay frames then collapses to
//     empty (remove_loose), and the fall engine drops whoever was on it.
//   - GATE / portcullis (tiles_4): a pressure plate raises it (rises +4/frame to 188, holds at 238,
//     then sinks -1/frame back to 0), a drop button fast-closes it. Its modifier IS its open height,
//     which the collision kernel reads via can_bump_into_gate — so the gate opens/blocks live.
//   - BUTTON (tiles_15 raise / tiles_6 drop): a live actor on it triggers a door-link CHAIN that
//     opens/closes each linked gate; the button's own trob is a short "pressed" debounce.
//
// The animation state of every animated tile is its OWN modifier byte — level.rooms[r-1].bg[row][col],
// == the source's curr_room_modif[tilepos]. Gates store open-height here; loose floors the countdown;
// a button's bg is its door-link INDEX (whose timer slot doubles as the press debounce). The player
// mutates a structuredClone of the level (never the shared LEVEL1), so a restart restores every tile.
//
// Deferred by agreement (out of this milestone): the loose falling-debris chunk (add_mob) + shake
// visual; the level-exit door animator (animate_leveldoor — trigger_1 routes to it faithfully, but a
// door trob is dropped un-animated for now); spikes/chompers/potion animators. (check_gate_push — a
// closing gate shoving a stand/crouch/turn char sideways — is now ported in collision_kernel.js.)
//
// Citations are SDLPoP (C:\Z_Temp\SDLPoP\src), segNNN.c:line. GPLv3 (see NOTICE).

export const TILE_EMPTY = 0, TILE_GATE = 4, TILE_CLOSER = 6, TILE_DEBRIS = 14, TILE_OPENER = 15;
export const TILE_LEVELDOOR_LEFT = 16, TILE_LOOSE = 11;
export const LOOSE_FLOOR_DELAY = 11;              // custom->loose_floor_delay (seg007.c:832)

const sbyte = (v) => (v << 24 >> 24);             // read a byte as signed 8-bit
// tilepos <-> (row,col): tilepos = tbl_line[row] + col = row*10 + col (seg006.c:105).
const tpRow = (tp) => (tp / 10) | 0, tpCol = (tp) => tp % 10;
const bgAt = (level, room, tp) => level.rooms[room - 1].bg[tpRow(tp)][tpCol(tp)];
const setBg = (level, room, tp, v) => { level.rooms[room - 1].bg[tpRow(tp)][tpCol(tp)] = v; };
const fgAt = (level, room, tp) => level.rooms[room - 1].fg[tpRow(tp)][tpCol(tp)] & 0x1F;

// A fresh trob list. Each entry {room, tilepos, type}: `type` is the animation state (anim_type) —
// for a gate 0 closing / 1 regular-open / 2 permanent-open / 3-8 fast-close; for loose/button >= 0
// while active, -1 when finished (process_trobs then compacts it out).
export const makeTrobs = () => ({ list: [] });

// --- door-link accessors (seg007.c:720-746) --------------------------------------------------
// level<N>.js already DECODES each raw 2-byte link into {room, tile, timer, next}, so these are
// direct field reads/writes on the mutable clone (the source's bit-unpacking is done at extract time).
// `next` = "there is a following link" (source get_doorlink_next = !(byte & 0x80)).
const getDoorlinkRoom  = (level, i) => level.doorLinks[i].room;
const getDoorlinkTile  = (level, i) => level.doorLinks[i].tile;
const getDoorlinkNext  = (level, i) => level.doorLinks[i].next;
const getDoorlinkTimer = (level, i) => level.doorLinks[i].timer;
const setDoorlinkTimer = (level, i, v) => { level.doorLinks[i].timer = v & 0x1F; };

// --- add_trob / find_trob (seg007.c:677/698): add a trob, or update an existing one's type ---
function findTrob(trobs, room, tp) {
  return trobs.list.findIndex((t) => t.tilepos === tp && t.room === room);
}
function addTrob(trobs, room, tp, type) {
  const i = findTrob(trobs, room, tp);
  if (i === -1) trobs.list.push({ room, tilepos: tp, type });
  else trobs.list[i].type = type;                 // change existing (seg007.c:693)
}

// =============================================================================================
// LOOSE FLOORS  (seg007.c) — make_loose_fall (arm) + animate_loose (tick)
// =============================================================================================

// make_loose_fall (seg007.c:904): start a loose tile's collapse. Guarded twice — a still-present
// loose tile, and not already counting down ((sbyte)modifier <= 0) so a re-step never restarts it.
export function makeLooseFall(trobs, level, room, col, row) {
  const cell = level.rooms[room - 1];
  if ((cell.fg[row][col] & 0x1F) !== TILE_LOOSE) return;   // solid loose floor only
  if (sbyte(cell.bg[row][col]) > 0) return;                // already falling -> don't restart
  cell.bg[row][col] = 1;                                    // curr_room_modif = 1
  addTrob(trobs, room, row * 10 + col, 0);                 // add_trob(room, tilepos, 0)
}

// animate_loose (seg007.c:816): ++modifier each frame; at loose_floor_delay -> remove_loose (fg 11 ->
// 0 empty) and drop the trob (type -1). The shake visual (loose_shake) is deferred.
function animateLoose(level, trob) {
  if (trob.type < 0) return;
  const mod = bgAt(level, trob.room, trob.tilepos) + 1;    // ++curr_modifier
  if (mod >= LOOSE_FLOOR_DELAY) {
    level.rooms[trob.room - 1].fg[tpRow(trob.tilepos)][tpCol(trob.tilepos)] = TILE_EMPTY;  // remove_loose
    setBg(level, trob.room, trob.tilepos, 0);
    trob.type = -1;
  } else {
    setBg(level, trob.room, trob.tilepos, mod);            // keep shaking
  }
}

// =============================================================================================
// GATE / PORTCULLIS  (seg007.c) — the press -> door-link chain -> per-gate open/close decision
// =============================================================================================

// trigger_gate (seg007.c:612): decide the open/close action for one gate by the pressing button type.
// Reads + mutates the gate's own modifier (its open height); returns the trob anim_type to add, or -1.
function triggerGate(level, room, tp, buttonType) {
  const mod = bgAt(level, room, tp);
  if (buttonType === TILE_OPENER) {                        // raise button
    if (mod === 0xFF) return -1;                           // permanently open -> nothing
    if (mod >= 188) { setBg(level, room, tp, 238); return -1; }   // already open -> hold at 238
    setBg(level, room, tp, (mod + 3) & 0xFC);              // snap up to the next multiple of 4
    return 1;                                              // regular open
  } else if (buttonType === TILE_DEBRIS) {                 // permanent-open trigger
    if (mod < 188) return 2;                               // permanent open
    setBg(level, room, tp, 0xFF); return -1;               // keep open
  } else {                                                 // drop button
    return mod !== 0 ? 3 : -1;                             // close fast (else already closed)
  }
}

// trigger_1 (seg007.c:639): dispatch a door-link target by its tile type. Gate -> trigger_gate;
// level-door-left -> open if closed (its animator is out of scope, so the door trob is dropped un-run).
function trigger1(level, targetType, room, tp, buttonType) {
  if (targetType === TILE_GATE) return triggerGate(level, room, tp, buttonType);
  if (targetType === TILE_LEVELDOOR_LEFT) return bgAt(level, room, tp) !== 0 ? -1 : 1;
  return -1;
}

// do_trigger_list (seg007.c:656): walk the door-link chain from `index`, triggering each linked tile
// and adding its resulting trob, until a link with no `next`. One button can drive several gates.
function doTriggerList(level, trobs, index, buttonType) {
  for (;;) {
    const room = getDoorlinkRoom(level, index);
    const tp = getDoorlinkTile(level, index);
    const result = trigger1(level, fgAt(level, room, tp), room, tp, buttonType);
    if (result >= 0) addTrob(trobs, room, tp, result);
    if (!getDoorlinkNext(level, index)) break;
    index++;
  }
}

// trigger_button (seg007.c:749): a live actor on a button arms its door-link chain. `modifier` is the
// button's own bg = the starting door-link index; that link's timer slot doubles as the press debounce
// (get/set_doorlink_timer). A jammed event (timer 0x1F) does nothing. `buttonType` = the button tile
// (opener/closer). Standing re-runs do_trigger_list each frame (that is what HOLDS a raise-gate open).
export function triggerButton(level, trobs, room, tp, buttonType, modifier) {
  const linkTimer = getDoorlinkTimer(level, modifier);
  if (linkTimer === 0x1F) return;                          // jammed
  setDoorlinkTimer(level, modifier, 5);
  if (linkTimer < 2) addTrob(trobs, room, tp, 1);          // the button's own "pressed" trob (fresh press)
  doTriggerList(level, trobs, modifier, buttonType);
}

// animate_door (seg007.c:343) + gate_stop (seg007.c:412): raise/lower the gate by its anim_type.
// 0 closing (-1/frame; stop at 0), 1 regular open (+4/frame to 188 -> hold 238 -> flip to closing),
// 2 permanent open (+4 to 188 -> 0xFF), 3-8 fast close (step the type up + subtract gate_close_speeds).
const DOOR_DELTA = [-1, 4, 4];
const GATE_CLOSE_SPEEDS = [0, 0, 0, 20, 40, 60, 80, 100, 120];
function animateDoor(level, trob) {
  let animType = trob.type;
  if (animType < 0) return;
  let mod = bgAt(level, trob.room, trob.tilepos);
  if (animType >= 3) {                                     // fast closing
    if (animType < 8) { animType++; trob.type = animType; }
    mod -= GATE_CLOSE_SPEEDS[animType];
    if (mod < 0) { mod = 0; trob.type = -1; }
  } else if (mod === 0xFF) {
    trob.type = -1;                                        // permanently open -> gate_stop
  } else {
    mod += DOOR_DELTA[animType];
    if (animType === 0) {                                  // closing
      if (mod === 0) trob.type = -1;                       // fully closed -> gate_stop
    } else {                                               // opening
      if (mod >= 188) {
        if (animType < 2) { mod = 238; trob.type = 0; }    // regular open -> hold 238, then auto-close
        else { mod = 0xFF; trob.type = -1; }               // permanent open
      }
    }
  }
  setBg(level, trob.room, trob.tilepos, mod);
}

// animate_button (seg007.c:790): the button's own trob — count its door-link timer down; the button
// "un-presses" (trob dropped) a few frames after the actor steps off. Purely the pressed-state timer
// (the gate open/close is driven by the gate trobs above); no visual is rendered for the button today.
function animateButton(level, trob) {
  if (trob.type < 0) return;
  const idx = bgAt(level, trob.room, trob.tilepos);        // the button's bg = its door-link index
  const timer = getDoorlinkTimer(level, idx) - 1;
  setDoorlinkTimer(level, idx, timer);
  if (timer < 2) trob.type = -1;
}

// =============================================================================================
// process_trobs (seg007.c:24) -> animate_tile (seg007.c:48): tick every active trob, dispatching by
// the TILE type at its position, then compact out the finished ones (type -1). Runs at the TOP of the
// player tick (like process_trobs at the top of play_frame, seg000.c:869).
// =============================================================================================
export function processTrobs(trobs, level) {
  for (const trob of trobs.list) {
    const type = fgAt(level, trob.room, trob.tilepos);
    if (type === TILE_LOOSE) animateLoose(level, trob);
    else if (type === TILE_GATE) animateDoor(level, trob);
    else if (type === TILE_OPENER || type === TILE_CLOSER) animateButton(level, trob);
    else trob.type = -1;                                   // unhandled tile (e.g. a collapsed loose / an exit door) -> drop
  }
  trobs.list = trobs.list.filter((t) => t.type >= 0);      // drop finished trobs
}
