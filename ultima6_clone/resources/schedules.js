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

  // resolveActiveSlot(npcId, hour, dayOfWeek) — the slot the NPC is CURRENTLY in: the most
  // recent slot that fired at-or-before now. Walks backward hour-by-hour from now (wrapping
  // past midnight, stepping the day-of-week back) and returns the first slot the hourly
  // matcher (resolveSlotAt) would have triggered. This re-derives source's save-persisted
  // SchedIndex (seg_0C9C.c:311 reads it from the save) — the "current slot" that the per-tick
  // AI_SCHEDULE settle (seg_1E0F.c:2198) acts on — WITHOUT persisting it, so an NPC loaded or
  // streamed in mid-period can settle into its active worktype instead of waiting for the next
  // exact-hour event. The 7×24 bound is one full week: every (hour, day-of-week) pair occurs
  // exactly once in 168 consecutive hours, so any NPC with ≥1 slot is guaranteed a hit.
  // Returns { ...slot, slotIndex } or null (no slots).
  resolveActiveSlot(npcId, hour, dayOfWeek) {
    let h = hour, dow = dayOfWeek;
    for (let back = 0; back < 7 * 24; back++) {
      const slot = this.resolveSlotAt(npcId, h, dow);
      if (slot) return slot;
      if (--h < 0) { h = 23; dow = dow === 1 ? 7 : dow - 1; }
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
