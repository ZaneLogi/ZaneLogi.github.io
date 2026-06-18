// Party follow — MoveFollowers (C_1E0F_1193, seg_1E0F.c:501-594). After the active
// member (leader) moves, each companion takes one step toward its formation slot
// behind the leader: a formation-offset greedy step, NOT a trail buffer and NOT
// per-follower pathfinding (see research_npc_ai.md §"Party follow + avatar movement").
//
// Per follower: compute its formation target from the offset tables rotated by the
// leader's facing, then pick the best of 8 legal directions by an "eager" score
// (contiguity bonus minus distance-to-slot) and step there. Two passes (pass 0 moves
// stragglers, pass 1 tightens). Followers walk THROUGH each other via canStandAt's
// party pass-through; the leader stays solid.
//
// Called only on the leader's turn (after a successful avatar step) — source calls
// it from the active-member move + the pass command, never from the idle pass. So
// followers freeze their walk frame when the avatar stops; I-8e settles them.

import { Position, ObjType, Renderable, PartyMember } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { canStandAt } from './passability.js';
import { walkStep, settleToStand } from './humanoid_anim.js';
import { DIR_DX, DIR_DY } from './avatar_move_system.js';

// Settle every party member's walk cycle back to the stand frame (I-8e). Source's
// idle pass (seg_0A33.c) settles ALL nearby humanoids; the party are the only
// walkers until NPC pathfinding (I-9), so we scope it to PartyMember. Called from
// the avatar's idle branch once the party has been idle past IDLE_SETTLE_MS — so the
// avatar (slot 0) and the followers all plant their feet together. Idempotent: only
// touches members actually mid-stride, and re-renders once if anything changed.
export function settleParty(world) {
  const reg = world.getResource(TileRegistry);
  const ot = world.store(ObjType);
  const rd = world.store(Renderable);
  let changed = false;
  for (const id of world.query(PartyMember)) {
    const settled = settleToStand(ot.frame[id]);     // keep facing, walk → stand (1)
    if (settled !== ot.frame[id]) {
      ot.frame[id] = settled;
      rd.tileId[id] = reg.baseTile.objToTile[ot.objNumber[id]] + settled;
      changed = true;
    }
  }
  if (changed) world.getResource(SpatialIndex).dirty = true;   // tiles changed without a move → re-render once
}

// Formation offset tables (verbatim, seg_1E0F.c:62-63), indexed by 1-based follow
// position: a diamond expanding behind the leader — slot 1 back-left, 2 back-right,
// 3 two-behind, 4/5 wider, etc.
const D_17B8 = [0, -1, 1, 0, -2, 2, -1, 1, -3, 3, 0];   // perpendicular
const D_17C3 = [0,  1, 1, 2,  2, 2,  3, 3,  3, 3, 1];   // behind

export function installMoveFollowers(world) {
  // Per-follower walk-cycle flag (source's IsWalking, NPCFlag bit 0x80). Followers
  // aren't a singleton like the avatar, so this is keyed by entity handle.
  const walking = new Map();

  // C_1E0F_1056 (seg_1E0F.c:474-499): is (cx,cy) contiguous to the placed chain
  // placed[0..followPos-1]? false on exact overlap (blocked) OR when not adjacent to
  // any placed member; true when within 1 tile of one. (Mouse/horse cases dropped —
  // none in the party.) Positions are read live, so they reflect members already
  // stepped this pass.
  function contiguous(pos, placed, followPos, cx, cy) {
    let ret = false;
    for (let k = 0; k < followPos; k++) {
      const id = world.resolve(placed[k]);
      if (id === -1) continue;
      const dx = pos.x[id] - cx, dy = pos.y[id] - cy;
      if (dx === 0 && dy === 0) return false;                 // exact overlap
      if (dx > -2 && dx < 2 && dy > -2 && dy < 2) ret = true; // within 1 tile
    }
    return ret;
  }

  // leaderHandle = the active member; aFlag 0 = leader moved (loose trailing),
  // 1 = leader stationary (tighten fully into formation).
  return function moveFollowers(leaderHandle, aFlag) {
    const li = world.resolve(leaderHandle);
    if (li === -1) return;
    const reg = world.getResource(TileRegistry);
    const pos = world.store(Position);
    const ot = world.store(ObjType);
    const rd = world.store(Renderable);
    const pm = world.store(PartyMember);
    const spatial = world.getResource(SpatialIndex);

    const x = pos.x[li], y = pos.y[li];
    const facingDir = (ot.frame[li] >> 1) & 6;     // leader facing as an 8-dir cardinal (0/2/4/6)
    const fdx = DIR_DX[facingDir], fdy = DIR_DY[facingDir];

    // Party members in slot order; the leader is skipped in the loop below.
    const members = [];
    for (const id of world.query(PartyMember)) members.push({ id, handle: world.handleOf(id), slot: pm.slotIndex[id] });
    members.sort((a, b) => a.slot - b.slot);

    for (let pass = 0; pass < 2; pass++) {
      const placed = [leaderHandle];          // index 0 = leader; followers appended as processed
      let followPos = 1;
      for (const m of members) {
        if (m.handle === leaderHandle) continue;      // the leader doesn't follow (no followPos++)
        const fx = pos.x[m.id], fy = pos.y[m.id];
        const tx = x - fdx * D_17C3[followPos] - fdy * D_17B8[followPos];   // formation target
        const ty = y + fdx * D_17B8[followPos] - fdy * D_17C3[followPos];
        placed[followPos] = m.handle;

        const contigNow = contiguous(pos, placed, followPos, fx, fy);
        const shouldMove = !contigNow ||
          (pass === 1 && (
            (aFlag && !(tx === fx && ty === fy)) ||                         // tighten onto slot
            (!aFlag && ((tx - fx) * fdx + (ty - fy) * fdy > 0))            // pull back if overshot
          ));

        if (shouldMove) {
          let newDir = -1, maxEager = 0;
          for (let dir = 0; dir < 8; dir++) {
            const cx = fx + DIR_DX[dir], cy = fy + DIR_DY[dir];
            if (!canStandAt(world, cx, cy, { actorId: m.handle, asPartyMember: true, leaderHandle })) continue;
            let eager = 256;                                                // D_17A9 damage-tile arm dropped
            if (contiguous(pos, placed, followPos, cx, cy)) eager += 256;   // reward staying contiguous
            else if (contigNow) eager = 0;                                  // don't break contiguity
            eager -= Math.abs(cx - tx) + Math.abs(cy - ty);                 // prefer closer to slot
            if (eager > maxEager) { maxEager = eager; newDir = dir; }
          }
          if (newDir >= 0) {
            const ncx = fx + DIR_DX[newDir], ncy = fy + DIR_DY[newDir];
            spatial.remove(fx, fy, m.handle);
            pos.x[m.id] = ncx; pos.y[m.id] = ncy;
            spatial.insertAtHead(ncx, ncy, m.handle);                       // MoveObj chain-head splice
            const stepped = walkStep(ot.frame[m.id], newDir, walking.get(m.handle) || false);
            walking.set(m.handle, stepped.walking);
            ot.frame[m.id] = stepped.frame;
            rd.tileId[m.id] = reg.baseTile.objToTile[ot.objNumber[m.id]] + stepped.frame;
          }
        }
        followPos++;
      }
    }
  };
}
