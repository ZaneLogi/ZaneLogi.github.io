// Dev-only NPC inspection + camera helpers, attached to window.__U6 for console / preview-eval
// use. The inspect helpers are READ-ONLY (they never touch entities, the camera, or the clock);
// the camera helpers (lookAtNpc / followNpc / stopFollow) write ONLY the camera — view state,
// not the simulation. Persisted (Zane 2026-06-05, built while validating the render-to-fit
// teleport guard) so the schedule/dungeon inspection isn't re-derived as ad-hoc eval each
// session.
//
// Dungeon caveat (why the z checks matter): dungeon levels (z != 0) are NOT loaded. An NPC
// currently on a dungeon level isn't instantiated/ticked/rendered, and an NPC scheduled INTO
// a dungeon would be teleported onto an unloaded level (it vanishes from the surface).
// inspectNpc() flags it per-NPC; scanDungeonSchedules() lists the whole offending set; the
// camera helpers warn when the target is on a dungeon level (you'd center on empty surface).
//
// Usage (in the browser console or preview-eval):
//   __U6.inspectNpc(100)          -> identity + position(z) + schedule(per-slot z) + dungeonSafe
//   __U6.scanDungeonSchedules()   -> every loaded NPC on / scheduled to a dungeon level
//   __U6.teleportSuppressed(100)  -> would the I-9h visibility guard suppress its teleport now?
//   __U6.lookAtNpc(100)           -> pan the camera once to center that NPC
//   __U6.followNpc(100)           -> keep the camera centered on it every frame...
//   __U6.stopFollow()             -> ...until you call this

import { Position, ObjType, AIMode, Destination, Renderable, Actor } from '../components/components.js';
import { ActorIndex } from '../resources/actor_index.js';
import { Schedules } from '../resources/schedules.js';
import { Viewport } from '../resources/viewport.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Camera } from '../resources/camera.js';
import { tryMoveTo } from '../systems/drunk_walk.js';
import { AI_MOTIONLESS } from '../systems/ai_modes.js';

// Wrap-aware Chebyshev on the toroidal 1024 overworld axis (matches npc_path.js).
const cheby = (ax, ay, bx, by) => {
  const dx = Math.min((ax - bx) & 1023, (bx - ax) & 1023);
  const dy = Math.min((ay - by) & 1023, (by - ay) & 1023);
  return Math.max(dx, dy);
};

export function installNpcInspect(world) {
  const pos = world.store(Position), obj = world.store(ObjType), am = world.store(AIMode);
  const dest = world.store(Destination), rend = world.store(Renderable), actor = world.store(Actor);
  const actorIndex = world.getResource(ActorIndex);
  const schedules = world.getResource(Schedules);
  const reg = world.getResource(TileRegistry);

  const lookName = (i) => { try { return reg?.tiles?.getTileLook?.(rend.tileId[i], 1) ?? null; } catch { return null; } };
  const slotsOf = (npcId) => (schedules?.byNpc?.[npcId] || [])
    .map(s => ({ hour: s.hour, day: s.day, action: s.action, x: s.x, y: s.y, z: s.z }));

  // Live view center = the I-9h gate's reference (camera center tile; matches npc_tick_system).
  const viewCenter = () => {
    const cam = world.getResource(Camera), vp = world.getResource(Viewport);
    if (!cam || !vp) return null;
    return { x: (Math.floor(cam.worldX / 16) + (vp.cols >> 1)) & 1023,
             y: (Math.floor(cam.worldY / 16) + (vp.rows >> 1)) & 1023 };
  };

  // READ-ONLY: identity + position (incl z) + AI mode + destination + full schedule (per-slot
  // z) + a dungeonSafe verdict. `dungeonSafe` is false if the NPC is on a dungeon level now,
  // has a dungeon-bound destination, or any schedule slot is z != 0.
  function inspectNpc(npcId) {
    const handle = actorIndex?.get(npcId);
    const slots = slotsOf(npcId);
    const dungeonSlots = slots.filter(s => s.z !== 0);
    const out = {
      npcId,
      instantiated: handle !== undefined,
      schedule: { count: slots.length, levelsUsed: [...new Set(slots.map(s => s.z))], dungeonSlots, slots },
    };
    if (handle !== undefined) {
      const i = world.resolve(handle);
      const hasDest = world.has(handle, Destination);
      out.entity = {
        index: i, objNumber: obj.objNumber[i], objNumberHex: '0x' + obj.objNumber[i].toString(16),
        look: lookName(i), frame: obj.frame[i],
        position: { x: pos.x[i], y: pos.y[i], z: pos.z[i] },
        aiMode: '0x' + am.mode[i].toString(16),
        destination: hasDest ? { x: dest.x[i], y: dest.y[i], z: dest.z[i], action: dest.action[i] } : null,
      };
      out.dungeonSafe = pos.z[i] === 0 && dungeonSlots.length === 0 && !(hasDest && dest.z[i] !== 0);
    } else {
      // Not instantiated — likely a dungeon NPC we never loaded (or no such npc).
      out.dungeonSafe = dungeonSlots.length === 0;
    }
    return out;
  }

  // READ-ONLY: every loaded NPC on a dungeon level now OR with any dungeon-bound schedule slot
  // — the set that misbehaves until dungeon levels load. One row per offender.
  function scanDungeonSchedules() {
    const rows = [];
    for (const i of world.query(Actor)) {
      const npcId = actor.npcId[i];
      const dungeonSlots = slotsOf(npcId).filter(s => s.z !== 0);
      const onDungeon = pos.z[i] !== 0;
      if (onDungeon || dungeonSlots.length) {
        rows.push({ npcId, look: lookName(i), at: { x: pos.x[i], y: pos.y[i], z: pos.z[i] },
          onDungeonNow: onDungeon, dungeonSlotCount: dungeonSlots.length,
          dungeonSlotZs: [...new Set(dungeonSlots.map(s => s.z))] });
      }
    }
    return { offenders: rows.length, rows };
  }

  // READ-ONLY: would the I-9h visibility guard SUPPRESS this NPC's off-area teleport, given a
  // view center (default = the live camera center)? The safe form of the spotlight A/B test —
  // it models ONLY the visibility guard, NOT the unreachable-fallback snap (which ignores the
  // guard by design when the slot can't be pathed to).
  function teleportSuppressed(npcId, vx, vy) {
    const handle = actorIndex?.get(npcId);
    if (handle === undefined) return { error: `npc ${npcId} not instantiated` };
    const i = world.resolve(handle);
    const center = (vx !== undefined && vy !== undefined) ? { x: vx, y: vy } : viewCenter();
    if (!center) return { error: 'no camera/viewport registered' };
    const r = world.getResource(Viewport)?.nearRadius ?? 40;
    const npcDist = cheby(pos.x[i], pos.y[i], center.x, center.y);
    const hasDest = world.has(handle, Destination);
    const slotDist = hasDest ? cheby(dest.x[i], dest.y[i], center.x, center.y) : Infinity;
    return { npcId, viewCenter: center, nearRadius: r, npcDist, slotDist, suppressed: npcDist <= r || slotDist <= r };
  }

  // ── camera helpers (write the CAMERA only — view state, not the simulation) ──

  const centerCameraOn = (x, y) => {
    const cam = world.getResource(Camera);
    const canvas = (typeof document !== 'undefined') && document.getElementById('screen');
    if (!cam || !canvas) return false;
    cam.worldX = x * 16 + 8 - canvas.width / 2;     // same centering math as main.js centerOn
    cam.worldY = y * 16 + 8 - canvas.height / 2;
    return true;
  };

  // Pan the camera once to center the NPC. Warns if it's on a dungeon level (not rendered).
  function lookAtNpc(npcId) {
    const handle = actorIndex?.get(npcId);
    if (handle === undefined) return { error: `npc ${npcId} not instantiated` };
    const i = world.resolve(handle);
    if (!centerCameraOn(pos.x[i], pos.y[i])) return { error: 'no camera/canvas available' };
    return { lookingAt: npcId, at: { x: pos.x[i], y: pos.y[i], z: pos.z[i] },
             warning: pos.z[i] !== 0 ? 'on a dungeon level (z!=0) — not rendered; camera shows empty surface' : null };
  }

  // Keep the camera centered on the NPC every frame until stopFollow(). One rAF loop; calling
  // again just retargets it. It runs every frame, so it OVERRIDES the avatar-follow/resize
  // recenters and drag-to-pan while active — call stopFollow() to regain manual control. Auto-
  // stops if the NPC handle goes stale.
  let followId = null, followNpcId = null;
  function followNpc(npcId) {
    const handle = actorIndex?.get(npcId);
    if (handle === undefined) return { error: `npc ${npcId} not instantiated` };
    followNpcId = npcId;
    const tick = () => {
      const h = actorIndex?.get(followNpcId);
      const i = h !== undefined ? world.resolve(h) : -1;
      if (i === -1) { stopFollow(); return; }
      centerCameraOn(pos.x[i], pos.y[i]);
      followId = requestAnimationFrame(tick);
    };
    if (followId === null) followId = requestAnimationFrame(tick);
    const i0 = world.resolve(handle);
    return { following: npcId, stopWith: '__U6.stopFollow()',
             warning: (i0 !== -1 && pos.z[i0] !== 0) ? 'on a dungeon level (z!=0) — not rendered; camera shows empty surface' : null };
  }
  function stopFollow() {
    const was = followNpcId;
    if (followId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(followId);
    followId = null; followNpcId = null;
    return { stopped: true, wasFollowing: was };
  }

  // ── drunk-walk drive (I-15c) — WRITES the simulation: a review tool to watch the I-15
  // drunk-walk live. Parks the NPC at AI_MOTIONLESS (so the schedule tick won't fight it),
  // then each `intervalMs` takes one tryMoveTo step toward (x,y) until it's adjacent. This is
  // a fixed-cadence dev driver — it deliberately bypasses the I-14 accumulator (the real
  // consumer that paces drunk-walk by DEXTE/WORLD_SPEED is the NPC-AI step, I-17). ──
  let driveTimer = null, driveNpcId = null;
  function driveTo(npcId, x, y, intervalMs = 150) {
    const handle = actorIndex?.get(npcId);
    if (handle === undefined) return { error: `npc ${npcId} not instantiated` };
    stopDrive();
    driveNpcId = npcId;
    const i0 = world.resolve(handle);
    am.mode[i0] = AI_MOTIONLESS;                       // take it out of the schedule tick
    let walking = false;
    driveTimer = setInterval(() => {
      const h = actorIndex?.get(driveNpcId);
      const i = h !== undefined ? world.resolve(h) : -1;
      if (i === -1) { stopDrive(); return; }
      if (cheby(pos.x[i], pos.y[i], x, y) <= 1) { stopDrive(); return; }   // arrived (adjacent)
      const r = tryMoveTo(world, h, x, y, walking);
      if (r !== null) walking = r;
    }, intervalMs);
    return { driving: npcId, toward: { x, y }, stopWith: '__U6.stopDrive()',
             note: 'dev tool — drunk-walks the NPC on a fixed timer (bypasses the I-14 accumulator); parks it at AI_MOTIONLESS' };
  }
  function stopDrive() {
    const was = driveNpcId;
    if (driveTimer !== null && typeof clearInterval !== 'undefined') clearInterval(driveTimer);
    driveTimer = null; driveNpcId = null;
    return { stopped: true, wasDriving: was };
  }

  const api = { inspectNpc, scanDungeonSchedules, teleportSuppressed, lookAtNpc, followNpc, stopFollow, driveTo, stopDrive };
  if (typeof window !== 'undefined' && window.__U6) Object.assign(window.__U6, api);
  return api;
}
