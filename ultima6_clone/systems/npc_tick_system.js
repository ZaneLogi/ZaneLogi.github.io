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
//
// I-14b DEXTE-paced accumulator — the per-actor speed model (a modern rewrite of source's
// MovePts/DEXTE round economy, NOT a round-driver port; see systems/move_economy.js +
// progress.md §"I-14 scope"). Each tick integrates real elapsed time into every mobile
// NPC's MoveSpeed.credit at its rate(dexterity); PLANNING (findpath / teleport / re-find)
// is free, but an actual tile STEP is gated on the credit reaching the tile's stepCost
// and spends it. Faster (higher-DEXTE) NPCs cross the threshold more often, and the
// per-actor credit phases stagger the steps naturally — no global round-robin. The tick is
// a sim system (so it inherits the turn-driver pause), but its credit integrates wall-clock
// elapsed, clamped, so the cadence is right regardless of how often the turn fires; on
// worlds without MoveSpeed (the unit-test worlds) the accumulator is OFF and NPCs step
// every tick (the old flat rate), keeping the I-9 pathfinding tests valid.

import { AIMode, Position, Destination, MoveSpeed } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Paths } from '../resources/paths.js';
import { Camera } from '../resources/camera.js';
import { Viewport } from '../resources/viewport.js';
import { WorldSpeed } from '../resources/world_speed.js';
import { findPath } from './pathfinding.js';
import { doOnPath, atDestination, tryTeleportToSlot } from './npc_path.js';
import { rate, stepCostAt, MAX_ELAPSED_MS } from './move_economy.js';
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
export function installNpcTickSystem(world, { avatarRef, now = () => performance.now() } = {}) {
  const stats = { active: 0, finding: 0, walking: 0, teleported: 0, snapped: 0, blocked: 0, arrived: 0 };

  // I-14b accumulator state. `ms` is null on test worlds that don't register MoveSpeed →
  // the accumulator is disabled (flat rate). `now` is injectable so the accumulator tests
  // can advance time deterministically; in the app it's performance.now() (the tick is a
  // sim system, called on each turn — its credit integrates real elapsed time, clamped).
  const ms = world.isRegistered(MoveSpeed) ? world.store(MoveSpeed) : null;
  let lastBeatAt = now();

  function system() {
    const am = world.store(AIMode);
    const pos = world.store(Position);
    const dest = world.store(Destination);
    const spatial = world.getResource(SpatialIndex);
    const paths = world.getResource(Paths);
    let active = 0, finding = 0, walking = 0, teleported = 0, snapped = 0, blocked = 0, arrived = 0;

    // I-14b: real time since the last tick, fed into each NPC's movement credit below.
    // Clamped so a backgrounded tab or a resumed modal (sim suspended → tick skipped)
    // doesn't bank into a multi-tile jump. worldSpeed is the I-14d master scalar — 1 here
    // until the slider resource lands.
    const t = now();
    let elapsed = t - lastBeatAt; lastBeatAt = t;
    if (elapsed < 0) elapsed = 0; else if (elapsed > MAX_ELAPSED_MS) elapsed = MAX_ELAPSED_MS;
    const wsRes = world.getResource(WorldSpeed);   // I-14d master scalar (1 if unset, e.g. tests)
    const worldSpeed = wsRes ? wsRes.value : 1;

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

      // I-14b/c: this cell's step cost (SubTerrainMov — terrain-weighted) is both the
      // accumulator's per-step price and the credit cap. Fill this actor's movement credit
      // (DEXTE-paced) for every mobile NPC each tick; PLANNING below (findpath / teleport /
      // re-find) is free, only an actual STEP spends it. Capping at the cell's cost means an
      // NPC banks at most one step (no multi-tile burst) yet can still afford costly terrain.
      const cost = stepCostAt(world, pos.x[i], pos.y[i], pos.z[i]);
      if (ms) {
        ms.credit[i] += rate(ms.dexterity[i], worldSpeed) * elapsed;
        if (ms.credit[i] > cost) ms.credit[i] = cost;
      }

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
        // AI_ONPATH / AI_84 / AI_85 — take (or retry) a step, gated by movement credit
        // (I-14b/c). A step (or a blocked retry — source spends the move-point attempt either
        // way) costs `cost` (this cell's terrain-weighted SubTerrainMov). Not enough credit
        // yet -> the NPC waits this tick. Arrival ('end') is free (no step taken).
        if (ms && ms.credit[i] < cost) continue;
        const r = doOnPath(world, handle);
        // 'step'/'blocked'/'aside' all consume the move attempt; 'end'/'idle' don't. ('aside'
        // = the step-aside clone path: the blocker was nudged and this NPC re-plans next tick.)
        if (ms && (r === 'step' || r === 'blocked' || r === 'aside')) ms.credit[i] -= cost;
        if (r === 'step') walking++;
        else if (r === 'blocked' || r === 'aside') blocked++;
        else if (r === 'end') arrived++;
      }
    }

    stats.active = active; stats.finding = finding; stats.walking = walking;
    stats.teleported = teleported; stats.snapped = snapped; stats.blocked = blocked; stats.arrived = arrived;
  }

  return { system, stats };
}
