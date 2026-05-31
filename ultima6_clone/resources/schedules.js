// Schedules resource — wraps the decoded SCHEDULE file (assets/schedule.js)
// and exposes the hour-triggered slot lookup that drives NPC schedule
// transitions.
//
// Source semantics (seg_1E0F.c:2264-2294, C_1E0F_5165 — called once per game-
// hour from seg_0A33.c:875): scan an NPC's slots BACKWARD, return the first
// (highest-indexed) slot whose hour byte exactly matches the current hour AND
// whose day field is either 0 (any day) or equals today's day-of-week.
//
// If no slot matches this hour, the NPC stays in its current schedule mode —
// slot transitions are EVENTS, not a "what slot is current at every hour"
// map. Between events, NPCs continue whatever the last-triggered slot set.
//
// Pure: resolveSlotAt(npcId, hour, dayOfWeek) is referentially transparent.
// No internal state mutation; no dependency on game time.

import { decodeSchedule } from '../assets/schedule.js';

export class Schedules {
  constructor(decoded) {
    this.byNpc = decoded.byNpc;            // Array(256) of Array<Slot>
    this.pointers = decoded.pointers;      // Uint16Array(257), raw pointer table
    this.totalSlots = decoded.totalSlots;  // pointers[256]
  }

  static fromBytes(bytes) {
    return new Schedules(decodeSchedule(bytes));
  }

  // Returns { time, action, hour, day, x, y, z, slotIndex } or null. dayOfWeek
  // is 1..7 per source's ((Date_D - 1) % 7 + 1). A slot's `day` field is 0..7
  // where 0 is wildcard (matches any day). slotIndex is the position in
  // byNpc[npcId] — the same offset source stores in SchedIndex[npc].
  resolveSlotAt(npcId, hour, dayOfWeek) {
    const slots = this.byNpc[npcId];
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i];
      if (slot.hour !== hour) continue;
      if (slot.day !== 0 && slot.day !== dayOfWeek) continue;
      return { ...slot, slotIndex: i };
    }
    return null;
  }

  hasSchedule(npcId) {
    return this.byNpc[npcId].length > 0;
  }

  // Convenience for day-of-week derivation from the world clock's Date_D.
  // Matches source's ((Date_D - 1) % 7 + 1) at seg_1E0F.c:2284.
  static dayOfWeek(dateD) {
    return ((dateD - 1) % 7) + 1;
  }
}
