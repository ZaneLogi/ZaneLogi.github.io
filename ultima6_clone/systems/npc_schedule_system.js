// NPC schedule system (I-5e) — composes the I-5 primitives:
//   I-3 WorldClock.onHour       → fires once per game-hour rollover
//   I-5b Schedules.resolveSlotAt → returns the slot triggered this hour, or null
//   I-5d SpatialIndex.hasRegionAt → active-area gate (NPCs in unloaded regions are
//                                   skipped — their schedule isn't simulated until
//                                   the player has been to their region)
//   I-4   canStandAt             → don't snap onto a blocked target
//
// Source: this is the schedule-arm of C_1E0F_5165 (seg_1E0F.c:2264-2294). Source
// also dispatches AI_FINDPATH after setting SchedIndex, which kicks pathfinding to
// walk the NPC toward the slot's xyz. The clone's I-5 scope is SCHEDULE RESOLUTION
// ONLY — we snap directly to the slot position when valid. Walk animation between
// hours lands at I-6 (pathfinding).
//
// Order note: NPCs are iterated in entity-id order. If two NPCs target the same
// cell this hour, the first iterates snaps and the second is blocked by the first.
// Pathfinding (I-6) handles this kind of conflict properly; for now, blocked NPCs
// just stay put and retry next hour.

import { WorldClock } from '../resources/world_clock.js';
import { Schedules } from '../resources/schedules.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Position, Schedule } from '../components/components.js';
import { canStandAt } from './passability.js';

// Per-tick counters. The returned reference is read by the dev HUD (I-5f) every
// frame; mutated in place by each hour-tick so the HUD shows the latest stats.
export function installNpcScheduleSystem(world) {
  const stats = {
    lastHour: null,        // game-hour of the most recent tick (or null pre-tick)
    snapped: 0,            // NPCs whose position changed this tick
    alreadyAtTarget: 0,    // slot triggered but NPC already at the target xyz
    blocked: 0,            // slot triggered + active, but canStandAt rejected the target
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

  const hour = clock.Time_H;
  const dayOfWeek = Schedules.dayOfWeek(clock.Date_D);

  let snapped = 0, alreadyAtTarget = 0, blocked = 0, inactive = 0, noTrigger = 0;

  for (const i of world.query(Schedule, Position)) {
    const oldX = pos.x[i], oldY = pos.y[i], oldZ = pos.z[i];

    // Active-area gate: keyed off CURRENT position, not target. NPCs whose region
    // isn't loaded are frozen until the player visits that region. See
    // CLAUDE.md / earlier I-5d discussion for the rationale.
    if (!spatial.hasRegionAt(oldX, oldY)) { inactive++; continue; }

    const slot = schedules.resolveSlotAt(sched.npcId[i], hour, dayOfWeek);
    if (slot === null) { noTrigger++; continue; }

    // Idempotent same-cell trigger (e.g. SLEEP slot fires daily at the same bed).
    if (oldX === slot.x && oldY === slot.y && oldZ === slot.z) {
      alreadyAtTarget++;
      continue;
    }

    const handle = world.handleOf(i);
    if (!canStandAt(world, slot.x, slot.y, { actorId: handle })) {
      blocked++;
      continue;
    }

    // Snap. Spatial index must move with position so render + collision stay correct.
    spatial.remove(oldX, oldY, handle);
    pos.x[i] = slot.x;
    pos.y[i] = slot.y;
    pos.z[i] = slot.z;
    spatial.insert(slot.x, slot.y, handle);
    snapped++;
  }

  stats.lastHour = hour;
  stats.snapped = snapped;
  stats.alreadyAtTarget = alreadyAtTarget;
  stats.blocked = blocked;
  stats.inactive = inactive;
  stats.noTrigger = noTrigger;
  stats.ticks++;

  console.log(
    `[NpcSchedule] hour ${String(hour).padStart(2, '0')}: ` +
    `snapped=${snapped} already=${alreadyAtTarget} blocked=${blocked} ` +
    `inactive=${inactive} noTrigger=${noTrigger}`
  );
}
