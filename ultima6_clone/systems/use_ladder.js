// systems/use_ladder.js (I-19d ladder + I-19g dungeon/cave entry)
//
// Every surface/dungeon level-change ENTRY funnels through C_101C_089E
// (seg_101C.c:326). In source, TWO triggers reach it — the clone only had the
// first until I-19g:
//   - USE a ladder (OBJ_131)        → seg_27a1.c:3097 USE switch          (I-19d)
//   - walk onto a dungeon/cave hole → seg_1E0F.c:769-785, the C_1E0F_184D
//                                     dungeon/cave branch (auto, no verb)   (I-19g)
//
// (Source has NO USE case for the OBJ_146/OBJ_134 holes — they are walk-onto only;
// the clone matches that, so there is no USE-on-hole handler.)
//
// The engine is enterLevelChange(); the wrappers below just feed it the entrance
// entity.

import { teleportParty } from './level_change.js';
import { Position, ObjType, Amount } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';

export const OBJ_LADDER = 0x131;             // obj.h:677
// Dungeon/cave entrance "holes": OBJ_146 (obj.h:679, most dungeons + the named
// caves) and OBJ_134 (obj.h:643, the Ant Mound mouth). The specific dungeon is the
// object's quality (D_17E2 name index, seg_1E0F.c:686); the engine doesn't need it.
export const DUNGEON_ENTRANCES = [0x146, 0x134];

// C_101C_089E (seg_101C.c:326) — the shared level-change core. `entity` is the
// resolved entity index of the ladder/hole. Decides the z direction, rescales x/y
// across the 1024↔256 surface/dungeon size change, then hard-cut-teleports the whole
// party (teleportParty). Returns the direction (-1 up / +1 down), 0 if no avatar —
// so a non-zero return also means "the party moved".
export function enterLevelChange(world, entity, { avatarRef, recenter, moveFollowers }) {
  const pos = world.store(Position);
  const objs = world.store(ObjType);
  const ai = avatarRef?.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (ai === -1) return 0;
  const ex = pos.x[entity], ey = pos.y[entity];
  const objNumber = objs.objNumber[entity];
  const frame = objs.frame[entity];
  const quality = world.store(Amount).quality[entity];
  const curZ = pos.z[ai];                                  // = MapZ

  // z_incr (seg_101C.c:331-334): UP (-1) only when already in a dungeon AND (at the
  // deepest level 5, OR the object is an up-ladder = OBJ_131 frame 1). Otherwise DOWN
  // (+1). A surface hole (curZ 0) always descends — the `curZ &&` short-circuits, so
  // an entrance's frame is irrelevant at the surface. The OBJ_131 gate on the frame-1
  // test mirrors source's `ObjShapeType == TypeFrame(OBJ_131,1)` exactly (a frame-1
  // hole is never an up-ladder).
  const zIncr = (curZ && (curZ === 5 || (objNumber === OBJ_LADDER && frame === 1))) ? -1 : 1;
  const nz = curZ + zIncr;
  let nx = ex, ny = ey;                                    // land on the entrance cell (:335-336)

  if (nz === 1 && zIncr === 1) {                           // surface → dungeon: /4 (:340-341)
    nx = ((ex >> 2) & 0xf8) + (ex & 7);
    ny = ((ey >> 2) & 0xf8) + (ey & 7);
  } else if (nz === 0 && zIncr === -1) {                   // dungeon → surface: *4 + quality (:343-352)
    nx = ((ex << 2) & 0x3e0) + (ex & 7);
    ny = ((ey << 2) & 0x3e0) + (ey & 7);
    if (quality & 1) nx += 8;
    if (quality & 2) nx += 0x10;
    if (quality & 4) ny += 8;
    if (quality & 8) ny += 0x10;
  }
  // dungeon ↔ dungeon: nx/ny stay on the entrance cell (no rescale — both 256-wide).

  // The hard-cut party teleport + level switch + camera follow (shared with moongate
  // travel; systems/level_change.js teleportParty).
  teleportParty(world, nx, ny, nz, { avatarRef, recenter, moveFollowers });
  return zIncr;
}

// USE a ladder (OBJ_131) → change level (I-19d, seg_27a1.c:3097). Thin wrapper.
export function useLadder({ world, target, message, avatarRef, recenter, moveFollowers }) {
  const li = world.resolve(target.entity);
  if (li === -1) return;
  const dir = enterLevelChange(world, li, { avatarRef, recenter, moveFollowers });
  if (dir) message(dir < 0 ? 'You climb up.' : 'You climb down.');
}

// C_1E0F_184D dungeon/cave branch (seg_1E0F.c:769-785) — the faithful WALK-IN
// trigger. Run after the avatar's successful step (the clone's analog of source
// calling C_1E0F_184D at the tail of the advance, seg_1E0F.c:934): scan the avatar's
// new cell for a dungeon/cave hole; if one is there, descend. Returns true if it
// entered (so the caller can mirror source's single-dispatch — a moongate OR a hole,
// not both). Skips the avatar itself, exactly like the gate check.
export function checkDungeonEntry(world, ctx) {
  const { avatarRef } = ctx;
  const ai = avatarRef?.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (ai === -1) return false;
  const pos = world.store(Position);
  const objs = world.store(ObjType);
  const ents = world.getResource(SpatialIndex).at(pos.x[ai], pos.y[ai]);
  if (!ents) return false;
  for (const h of [...ents]) {                 // copy: enterLevelChange mutates the index
    if (h === avatarRef.handle) continue;      // Party[Active] == objNum → skip the avatar
    const i = world.resolve(h);
    if (i === -1) continue;
    if (DUNGEON_ENTRANCES.includes(objs.objNumber[i])) {
      ctx.message?.('You enter.');
      enterLevelChange(world, i, ctx);
      return true;
    }
  }
  return false;
}
