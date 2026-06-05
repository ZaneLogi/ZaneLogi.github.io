// NPC tick system (I-9d) — the per-turn heartbeat that walks scheduled NPCs to their
// slots. A SIM-list system (so it inherits the turn-driver's breathe<->pause gating,
// same as the avatar + clock systems). The ECS analog of source's C_1E0F_4E0A NPC
// tick, minus the move-point priority interleave (deferred): each turn we scan the
// AIMode entities and, for the active cohort, build paths for AI_FINDPATH NPCs and
// step the AI_ONPATH ones.
//
// Per-NPC 40x40 pathfinding window (Zane 2026-06-01) — findPath is centered on the
// NPC itself, not the player (source's player-centered grid would teleport on-screen
// NPCs given our wide canvas). A schedule slot inside the window is walked directly;
// a slot OUTSIDE it is reached by findPath's edge-seek (I-9e) — walk to the window
// edge nearest the goal, then re-plan from there, so the NPC walks across the map
// incrementally.
//
// I-9h walk-near / teleport-far gate (source's C_1E0F_464A order): each turn, an
// AI_FINDPATH NPC first tries the off-area teleport (tryTeleportToSlot) — which fires
// only when the NPC is far enough from the VIEW CENTER (camera) that the player can't
// see it (the clone drag-pans, so visibility tracks the camera, not the avatar). Far
// NPCs teleport straight to their post (no path build); near NPCs fall through to the
// pathfinder and walk visibly. The teleport is capped per turn (source's D_17A5 = 3).
// A genuinely UNREACHABLE in-window slot (terrain/objects wall the NPC off) falls back
// to a forced teleport (allowVisible — ignores the distance guard), matching the I-5
// snap behavior; if even the slot cell is blocked, the NPC waits till the next hour.

import { AIMode, Position, Destination } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Paths } from '../resources/paths.js';
import { Camera } from '../resources/camera.js';
import { Viewport } from '../resources/viewport.js';
import { findPath } from './pathfinding.js';
import { doOnPath, atDestination, tryTeleportToSlot } from './npc_path.js';
import * as AI from './ai_modes.js';

// Off-area teleports per turn (source's D_17A5 cap). A CPU throttle in source; here it's
// near-free and invisible (the distance guard means teleports only fire off-screen), so
// it's kept source-faithful but flagged as a drop-candidate for the post-I-9 deviation
// audit (the world is coherent either way — the cap only spreads the settle across turns).
const TELEPORT_CAP = 3;

// Install the system. Pass `avatarRef` ({ handle }) so the teleport gate can measure
// player distance; without it the gate is disabled (every NPC pathfinds — preserves the
// pre-I-9h behavior + keeps the unit tests that don't model an avatar walking). Returns
// { system, stats }: add `system` to the sim list, read `stats` (mutated each turn) from
// the dev HUD.
export function installNpcTickSystem(world, { avatarRef } = {}) {
  const stats = { active: 0, finding: 0, walking: 0, teleported: 0, snapped: 0, blocked: 0, arrived: 0 };

  function system() {
    const am = world.store(AIMode);
    const pos = world.store(Position);
    const dest = world.store(Destination);
    const spatial = world.getResource(SpatialIndex);
    const paths = world.getResource(Paths);
    let active = 0, finding = 0, walking = 0, teleported = 0, snapped = 0, blocked = 0, arrived = 0;

    // View center for the I-9h visibility gate, resolved once per turn. The gate suppresses
    // teleport for anything the player CAN SEE — and what's visible is the VIEWPORT (centered
    // on the CAMERA), not the avatar. They coincide while the camera follows the avatar, but
    // the clone's drag-to-pan (a modern-UX feature the source lacks) can move the view off the
    // avatar, so the gate must track the camera to stay correct while panned. Falls back to the
    // avatar position when there's no camera/viewport (the unit tests). Undefined -> gate off.
    let viewX, viewY;
    const cam = world.getResource(Camera);
    const vp = world.getResource(Viewport);
    if (cam && vp) {
      // camera world-pixel origin -> top-left tile; + half the visible extent = center tile
      // (16 = tile size px, matches renderer.tileSize). Wrapped onto the toroidal 1024 axis.
      viewX = (Math.floor(cam.worldX / 16) + (vp.cols >> 1)) & 0x3ff;
      viewY = (Math.floor(cam.worldY / 16) + (vp.rows >> 1)) & 0x3ff;
    } else if (avatarRef && avatarRef.handle !== undefined) {
      const ai = world.resolve(avatarRef.handle);
      if (ai !== -1) { viewX = pos.x[ai]; viewY = pos.y[ai]; }
    }
    const gateOn = viewX !== undefined;

    for (const i of world.query(AIMode)) {
      const mode = am.mode[i];
      // Only the pathfinding tier ticks here (0x81..0x86). Party (COMMAND/FOLLOW),
      // MOTIONLESS, AI_SCHEDULE (awaiting the next hour), and the stationary worktypes
      // are all skipped — party moves via the avatar/MoveFollowers, the rest are idle.
      if (mode < AI.AI_FINDPATH || mode > AI.AI_86) continue;

      // Active-area gate: NPCs whose region isn't loaded are frozen (same predicate as
      // the schedule system). Keeps the expensive path builds bounded to the explored
      // cohort near the player.
      if (!spatial.hasRegionAt(pos.x[i], pos.y[i])) continue;
      active++;

      const handle = world.handleOf(i);

      if (mode === AI.AI_86) {
        // Stuck (blocked 3x) — re-find next turn (source's path service promotes
        // AI_86 -> AI_FINDPATH). Path was already abandoned by doOnPath.
        am.mode[i] = AI.AI_FINDPATH;
        continue;
      }

      if (mode === AI.AI_FINDPATH) {
        finding++;
        const tx = dest.x[i], ty = dest.y[i];   // tz is read inside tryTeleportToSlot
        // I-9h: off-area teleport first (source's C_1E0F_464A order). Fires only when the
        // NPC is far from the view center (off-screen) and under the per-turn cap;
        // tryTeleportToSlot settles the worktype itself. Near NPCs are suppressed by its
        // distance guard and fall through to the pathfinder below.
        if (gateOn && teleported < TELEPORT_CAP &&
            tryTeleportToSlot(world, handle, viewX, viewY)) { teleported++; continue; }
        // Window centered on the NPC -> a per-NPC 40x40 work area. findPath walks an
        // in-window goal directly, or edge-seeks toward an off-window goal (then the
        // NPC re-plans at the edge). null = the goal is unreachable from here.
        const path = findPath(world, pos.x[i], pos.y[i], tx, ty, pos.x[i], pos.y[i]);
        if (path === null) {
          // Walled off from the goal in-window -> forced teleport onto the slot (allowVisible:
          // the I-5 unreachable fallback, regardless of distance). On the slot -> worktype
          // applied; if even the slot cell is blocked, give up until the next hour.
          if (tryTeleportToSlot(world, handle, viewX, viewY, true)) snapped++;
          else am.mode[i] = AI.AI_SCHEDULE;
        } else if (path.length === 0) {
          atDestination(world, handle); arrived++;   // already on the slot -> set the worktype
        } else {
          // Walks to the goal (in-window) OR to the window edge (edge-seek); on reaching
          // the path's end short of the goal, doOnPath sets AI_FINDPATH to re-plan.
          paths.set(handle, path, tx, ty);
          am.mode[i] = AI.AI_ONPATH; walking++;
        }
      } else {
        // AI_ONPATH / AI_84 / AI_85 — take (or retry) a step.
        const r = doOnPath(world, handle);
        if (r === 'step') walking++;
        else if (r === 'blocked') blocked++;
        else if (r === 'end') arrived++;
      }
    }

    stats.active = active; stats.finding = finding; stats.walking = walking;
    stats.teleported = teleported; stats.snapped = snapped; stats.blocked = blocked; stats.arrived = arrived;
  }

  return { system, stats };
}
