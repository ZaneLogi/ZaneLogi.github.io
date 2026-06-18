// Shared humanoid facing + walk-cycle animation — the port of source's
// C_1E0F_0664 (seg_1E0F.c:276) for the humanoid sprite family (the avatar, party
// companions, and townsfolk; OBJ_178..0x19A). The sprite has 4 facings and a
// 3-step walk cycle packed into the frame: frame = walkCycle + (facing << 2), so
// the render tile is baseTile[objNumber] + frame.
//
// Used by the avatar move (I-8a) and MoveFollowers (I-8c/d) so both animate
// identically. The per-entity "walking" flag (source IsWalking, NPCFlag bit 0x80)
// is passed in and returned — the caller owns its storage (a closure for the
// singleton avatar, a per-follower map for followers).

// The sprite family this module's facing/walk encoding (frame = walkCycle + facing<<2)
// applies to: townsfolk (OBJ_178..0x183) + the avatar/companions (OBJ_199..0x19A).
// Source's C_1E0F_0664 humanoid arm (seg_1E0F.c:293-296). C_1E0F_0664 dispatches facing
// BY OBJECT TYPE — other NPC families have different frame layouts (gazer OBJ_162/167/
// 19E/184 = frame is the facing directly, seg_1E0F.c:410; animals OBJ_16A/16B; etc.).
// Those arms aren't ported, so callers (npcStep walk + atDestination arrival, the two
// clone sites that mirror source's per-step + on-arrival C_1E0F_0664 calls) gate on this
// and leave non-humanoid frames untouched rather than mis-applying the humanoid encoding.
export function isHumanoid(objNumber) {
  return (objNumber >= 0x178 && objNumber <= 0x183) || (objNumber >= 0x199 && objNumber <= 0x19a);
}

// 8-direction move → 4-way sprite facing (0=N, 1=E, 2=S, 3=W). Source MACRO_A
// (seg_1E0F.c:268): cardinals map directly (facing = dir>>1); diagonals KEEP the
// current facing unless it points more than a right angle away, then flip 180° —
// hysteresis that stops the sprite flickering while walking diagonally.
export function faceDir(curFacing, dir) {
  if (!(dir & 1)) return dir >> 1;
  return ((((dir >> 1) - curFacing + 1) & 3) > 1) ? (curFacing + 2) & 3 : curFacing;
}

// Advance one walk step: face `dir` (8-dir) and cycle the legs. Returns the new
// frame plus the updated walking flag. The walk-cycle switch is source's humanoid
// arm of C_1E0F_0664 (seg_1E0F.c:303-314): the low 2 frame bits cycle
// 1→2→1→0→… (stand → leg-out → stand → other-leg), toggling IsWalking at the ends.
export function walkStep(curFrame, dir, walking) {
  const facing = faceDir(curFrame >> 2, dir);
  let walk;
  switch (curFrame & 3) {
    case 0:  walking = false; walk = 1; break;   // ClrWalking → mid-stance
    case 1:  walk = walking ? 0 : 2; break;      // mid-stance → a leg-out frame
    case 2:  walking = true;  walk = 1; break;   // SetWalking → mid-stance
    default: walk = 1;
  }
  return { frame: walk + (facing << 2), walking };
}

// Settle the walk cycle to the stand frame, preserving facing — source's idle pass
// settle arm (seg_0A33.c:121-133). Returns the settled frame, or the same frame if
// already standing (low 2 bits === 1).
export function settleToStand(curFrame) {
  return (curFrame & 3) === 1 ? curFrame : (curFrame & ~3) | 1;
}
