// NPC schedule system (I-5e, rewired at I-9d) — composes the I-5 primitives:
//   I-3 WorldClock.onHour       → fires once per game-hour rollover
//   I-5b Schedules.resolveSlotAt → returns the slot triggered this hour, or null
//   I-5d SpatialIndex.hasRegionAt → active-area gate (NPCs in unloaded regions skip)
//
// Source: the schedule arm of C_1E0F_5165 (seg_1E0F.c:2264-2294). On an hour match it
// sets SchedIndex to the new slot and NPCMode = AI_FINDPATH — kicking pathfinding to
// WALK the NPC toward the slot. I-5 stubbed this as a position SNAP (teleport); I-9d
// restores the source behavior: record the slot as the NPC's Destination and set
// AI_FINDPATH, then the NPC tick (systems/npc_tick_system.js) builds a path and walks
// it. (The actual snap-when-too-far fallback now lives in the NPC tick.)
//
// Party members are skipped (player-controlled — source's IsPlrControl guard); they
// have a Schedule component for data purposes but move via the avatar/MoveFollowers.

import { WorldClock } from '../resources/world_clock.js';
import { Schedules } from '../resources/schedules.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Position, Schedule, AIMode, Destination, PartyMember } from '../components/components.js';
import { AI_FINDPATH } from './ai_modes.js';

// Per-tick counters, read by the dev HUD (I-5f) every frame; mutated in place by each
// hour-tick. `triggered` = NPCs sent to AI_FINDPATH this hour (was I-5's `snapped`).
export function installNpcScheduleSystem(world) {
  const stats = {
    lastHour: null,        // game-hour of the most recent tick (or null pre-tick)
    triggered: 0,          // NPCs whose slot changed -> set AI_FINDPATH (now walk, not snap)
    alreadyAtTarget: 0,    // slot triggered but NPC already standing on it
    reclaimed: 0,          // NPCs snapped to their UNREACHED previous target before re-targeting
    inactive: 0,           // NPC's current region isn't loaded — skipped silently
    noTrigger: 0,          // no schedule slot matched this (hour, day) — idle NPCs
    ticks: 0,              // total hour-ticks observed (cumulative)
  };

  const clock = world.getResource(WorldClock);
  clock.onHour((clk) => tick(world, clk, stats));
  return stats;
}

function tick(world, clock, stats) {
  const schedules = world.getResource(Schedules);
  const spatial = world.getResource(SpatialIndex);
  const pos = world.store(Position);
  const sched = world.store(Schedule);
  const am = world.store(AIMode);
  const dest = world.store(Destination);

  const hour = clock.Time_H;
  const dayOfWeek = Schedules.dayOfWeek(clock.Date_D);

  let triggered = 0, alreadyAtTarget = 0, reclaimed = 0, inactive = 0, noTrigger = 0;

  for (const i of world.query(Schedule, Position)) {
    const handle = world.handleOf(i);
    if (world.has(handle, PartyMember)) continue;   // player-controlled — not schedule-driven

    // Active-area gate, keyed off CURRENT position (not target). NPCs whose region
    // isn't loaded are frozen until the player visits that region.
    if (!spatial.hasRegionAt(pos.x[i], pos.y[i])) { inactive++; continue; }

    const slot = schedules.resolveSlotAt(sched.npcId[i], hour, dayOfWeek);
    if (slot === null) { noTrigger++; continue; }   // between events — stays in its current mode

    // Already standing on the new slot: nothing to walk to, but the worktype still has to
    // be applied. Record it + kick AI_FINDPATH; the NPC tick's trivial (empty) path routes
    // through __AtDestination, which sets the worktype mode + facing (source likewise
    // always goes through AI_FINDPATH). No walk happens.
    if (pos.x[i] === slot.x && pos.y[i] === slot.y && pos.z[i] === slot.z) {
      dest.x[i] = slot.x; dest.y[i] = slot.y; dest.z[i] = slot.z; dest.action[i] = slot.action;
      am.mode[i] = AI_FINDPATH;
      alreadyAtTarget++;
      continue;
    }

    // Teleport-to-previous-target on reschedule (clone deviation, Zane 2026-06-02):
    // if the NPC never reached its PREVIOUS slot (blocked en route by another NPC, or
    // its route was impossible), snap it to that previous slot first — then it paths
    // from there to the new slot. Keeps NPCs on-schedule despite transient blocking
    // (source instead re-paths from wherever it's stuck). The previous slot is the
    // NPC's current Destination (set by the last slot that fired); a forced snap (no
    // canStandAt — it's reclaiming its own assigned spot, like source's teleport).
    if (pos.x[i] !== dest.x[i] || pos.y[i] !== dest.y[i] || pos.z[i] !== dest.z[i]) {
      spatial.remove(pos.x[i], pos.y[i], handle);
      pos.x[i] = dest.x[i]; pos.y[i] = dest.y[i]; pos.z[i] = dest.z[i];
      spatial.insertAtHead(dest.x[i], dest.y[i], handle);
      reclaimed++;
    }

    // Record the new destination (xyz + arrival worktype) + kick pathfinding. The NPC
    // tick takes it from here; __AtDestination applies dest.action on arrival.
    dest.x[i] = slot.x; dest.y[i] = slot.y; dest.z[i] = slot.z; dest.action[i] = slot.action;
    am.mode[i] = AI_FINDPATH;
    triggered++;
  }

  stats.lastHour = hour;
  stats.triggered = triggered;
  stats.alreadyAtTarget = alreadyAtTarget;
  stats.reclaimed = reclaimed;
  stats.inactive = inactive;
  stats.noTrigger = noTrigger;
  stats.ticks++;

  console.log(
    `[NpcSchedule] hour ${String(hour).padStart(2, '0')}: ` +
    `findpath=${triggered} atSlot=${alreadyAtTarget} reclaim=${reclaimed} idle=${noTrigger} inactive=${inactive}`
  );
}
