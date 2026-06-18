// systems/use_drawbridge.js
//
// I-10e — USE the crank to raise/lower the castle drawbridge. Port of
// C_27A1_433D ("use crank", seg_27a1.c:2056) → C_27A1_3F47 ("try to activate
// drawbridge", seg_27a1.c:1942), the most geometry-heavy USE handler.
//
// The bridge is a run of OBJ_10D tiles whose FRAME encodes both position and
// state: a raised bridge is one row [6=left, 7=middle…, 8=right]; a lowered
// bridge is several rows spanning south across the moat [3=left, 4=mid…, 5=right]
// with a final shore row [0=left, 1=mid…, 2=right]. So open/close is NOT a frame-
// toggle — it DELETES every bridge tile and RE-ADDS the run in the other shape
// (source does the same; the cells occupied change). Built on the I-10d map
// add/delete primitives.
//
// CLONE DEVIATION (flagged): source decides how far the bridge extends with a
// hardcoded shore-tile whitelist D_1D0A = {0x10,0x1C,0x20,0x2C,0xD6} (extend over
// non-whitelist cells, stop at a whitelist cell). We instead extend while the
// terrain is WET and stop at the first non-wet cell (reg.isTerrainWet, the I-4
// flag) — the representation-native equivalent of "span the water, land on the
// shore", robust to our full-width tile ids rather than source's byte values.

import { Commands } from '../resources/commands.js';
import { ObjType, Amount, Position } from '../components/components.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { addMapObject, deleteMapObject, findObjectsByTypeQuality, objAtCell } from '../world_loader.js';

const OBJ_10D = 0x10D;   // drawbridge tile (269)
const OBJ_120 = 0x120;   // crank (288)

// Find the bridge anchor for a crank's quality: the OBJ_10D corner tile, frame 6
// (raised) or 3 (lowered top-left), topmost-then-leftmost. Source relies on
// SearchArea's scan order returning the corner; we pick it explicitly. (Only the
// left/corner tiles carry the quality — C_27A1_3F47 SetQual's just those.)
function findBridgeAnchor(world, quality, near) {
  const objs = world.store(ObjType), pos = world.store(Position);
  let best = null, bi = -1;
  for (const h of findObjectsByTypeQuality(world, OBJ_10D, quality, near)) {
    const i = world.resolve(h);
    const f = objs.frame[i];
    if (f !== 3 && f !== 6) continue;
    if (best === null || pos.y[i] < pos.y[bi] || (pos.y[i] === pos.y[bi] && pos.x[i] < pos.x[bi])) { best = h; bi = i; }
  }
  return best;
}

// Open/close the bridge anchored at `anchorH`. Returns the source result code:
// 0 nothing · 1 closed · 2 opened · 3 can't close · 4 can't open.
function activateBridge(world, anchorH) {
  const objs = world.store(ObjType), amts = world.store(Amount), pos = world.store(Position);
  const reg = world.getResource(TileRegistry);
  const lvl = world.getResource(MapLevel);
  const spatial = world.getResource(SpatialIndex);

  const ai = world.resolve(anchorH);
  const objQual = amts.quality[ai];
  const objFrm = objs.frame[ai];
  const objX = pos.x[ai], objY = pos.y[ai];

  // tile helpers (clone-native)
  const isShore = (x, y) => !reg.isTerrainWet(lvl.tileAt(x, y));     // shore = land = stop extending
  const bridgeAt = (x, y) => objAtCell(world, x, y, OBJ_10D);        // __SearchTypeAt OBJ_10D
  // occupancy (C_27A1_3E59): a non-bridge object/actor sharing the cell
  const blockedAt = (x, y) => {
    const ents = spatial.at(x, y);
    if (!ents) return false;
    for (const h of ents) { const i = world.resolve(h); if (i !== -1 && objs.objNumber[i] !== OBJ_10D) return true; }
    return false;
  };
  const add = (x, y, frame, q = 0) => addMapObject(world, { objNumber: OBJ_10D, frame, x, y, quality: q });
  const moveToHead = (h) => { const i = world.resolve(h); if (i !== -1) { spatial.remove(pos.x[i], pos.y[i], h); spatial.insertAtHead(pos.x[i], pos.y[i], h); } };

  // ---- try CLOSE (anchor is lowered, frame 3) ----
  if (objFrm === 3) {
    // refuse if anything is standing on the lowered bridge
    for (let ty = objY, row = bridgeAt(objX, ty); row !== null; ty++, row = bridgeAt(objX, ty))
      for (let tx = objX, cur = row; cur !== null; tx++, cur = bridgeAt(tx, ty))
        if (blockedAt(tx, ty)) return 3;

    // raised row sits one row UP from the lowered top row
    let tx = objX, ty = objY;
    add(objX - 1, objY - 1, 6, objQual);                  // left corner
    let last = null, cur = bridgeAt(tx, ty);
    while (cur !== null) {
      deleteMapObject(world, cur);
      last = add(tx, objY - 1, 7);                          // middle
      tx++;
      cur = bridgeAt(tx, ty);
    }
    if (last !== null) deleteMapObject(world, last);        // drop the overshoot middle
    add(tx - 1, objY - 1, 8);                               // right end
    // delete the remaining lowered rows (objY+1 down)
    for (let yy = objY + 1, r = bridgeAt(objX, yy); r !== null; yy++, r = bridgeAt(objX, yy))
      for (let xx = objX, c = r; c !== null; xx++, c = bridgeAt(xx, yy))
        deleteMapObject(world, c);
    return 1;
  }

  // ---- try OPEN (anchor is raised, frame 6) ----
  if (objFrm === 6) {
    // width: count raised tiles walking +x from the anchor (bp_04 = tiles + 1)
    let span = 1;
    for (let tx = objX, cur = anchorH; cur !== null; tx++) { span++; cur = bridgeAt(tx + 1, objY); }
    const mids = span - 4;                                  // middle-tile count per lowered row

    // clearance: every lowered cell over water must be free; stop at shore
    for (let ty = objY + 1; !isShore(objX + 1, ty); ty++)
      for (let k = 0, tx = objX + 1; k < mids; k++, tx++)
        if (blockedAt(tx, ty)) return 4;

    // delete the raised row
    for (let tx = objX, cur = anchorH; cur !== null; tx++) { deleteMapObject(world, cur); cur = bridgeAt(tx + 1, objY); }

    // lay the lowered span: water rows [3,4…,5], then the shore row [0,1…,2] + MoveObj
    let ty = objY + 1;
    for (; !isShore(objX + 1, ty); ty++) {
      let tx = objX + 1;
      add(tx++, ty, 3, objQual);                            // left (carries quality)
      for (let k = 0; k < mids; k++) add(tx++, ty, 4);      // middles
      add(tx, ty, 5);                                       // right
    }
    // shore row: frames 0 / 1 / 2, refreshing any entity already standing there
    let tx = objX + 1;
    add(tx++, ty, 0, objQual);
    { const e = bridgeAt(tx - 1, ty); if (e !== null) moveToHead(e); }
    for (let k = 0; k < mids; k++) {
      add(tx++, ty, 1);
      const e = bridgeAt(tx - 1, ty); if (e !== null) moveToHead(e);
    }
    add(tx, ty, 2);
    { const e = bridgeAt(tx, ty); if (e !== null) moveToHead(e); }
    return 2;
  }

  return 0;
}

// USE crank (C_27A1_433D): find the drawbridge by the crank's quality, activate it.
// (The cosmetic crank-turning tile animation, SetTileAnimation TIL_3F1/3FC, is a
// hardware/animation effect — deferred, not gameplay.)
function useCrank({ world, target, message }) {
  const i = world.resolve(target.entity);
  if (i === -1) return;
  const pos = world.store(Position);
  const quality = world.store(Amount).quality[i];
  // Window the bridge search to the crank's ~40x40 active area + level (source's
  // SearchArea bound — see world_loader.findObjectsByTypeQuality).
  const anchor = findBridgeAnchor(world, quality, { x: pos.x[i], y: pos.y[i], z: pos.z[i] });
  if (anchor === null) { message('There is no drawbridge here.'); return; }
  switch (activateBridge(world, anchor)) {
    case 1: message('You close the drawbridge.'); break;
    case 2: message('You open the drawbridge.'); break;
    case 3: message("You can't close the drawbridge."); break;
    case 4: message("You can't open the drawbridge."); break;
    default: message('Nothing happens.');
  }
}

export function registerCrank(world) {
  world.getResource(Commands).registerUse([OBJ_120], useCrank);
}
