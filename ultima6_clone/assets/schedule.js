// SCHEDULE decode — per-NPC daily schedule slots (seg_0C9C.c:285-287). The file
// is read in two passes by source: 257 u16-LE pointer ints, then N x 5-byte
// tSchedule records. Borland TC 2.0 DOS native int is 16-bit, so
// (0x100 + 1) * sizeof(int) = 514 bytes of pointers.
//
//   Bytes 0..513:   SchedPointer[0..256] u16-LE. SchedPointer[npc] is the start
//                   slot offset for NPC `npc`; SchedPointer[256] is the sentinel
//                   (= total slot count). NPC `n` owns slots
//                   [SchedPointer[n] .. SchedPointer[n+1] - 1].
//   Bytes 514+:     Schedule[0..N-1] where N = SchedPointer[256]. Each slot is
//                   5 bytes (u6.h:469-473, struct tSchedule).
// Pointers aren't strictly monotonic at the unused tail: a "no-schedule" NPC
// may have pointers[n] past totalSlots, encoding an empty range via start>end
// (source's resolver loop at seg_1E0F.c:2264 — `for di = end-1; di >= start; di--`
// — exits immediately in that case). We expose the raw pointers; byNpc[n] uses
// slice() which is tolerant of start>end and returns [].
// Per-slot layout:
//                     byte 0      time      hour(5) | day-of-week(3), packed
//                     byte 1      action    AI_* code (see AiAction below)
//                     bytes 2..4  xyz       x(10) y(10) z(4), same packing as
//                                           ObjPos in objlist.js
//
// The `time` byte's day field is 0..7: 0 means "matches any day", 1..7 are the
// specific weekdays (per seg_1E0F.c:2264-2294 — the resolver matches when day
// field is 0 OR equals today's day-of-week).

// Schedule-tier action codes, from ai.h. The decoder doesn't validate; consumers
// can use these to interpret `action`. Combat-tier codes (0x00..0x1f) and
// pathfinding-tier (0x80..0x86) appear at runtime in NPCMode but not in
// schedule data; what lands in the schedule file is 0x87..0x9b.
export const AiAction = {
  STAND_N:  0x87, STAND_E:  0x88, STAND_S:  0x89, STAND_W:  0x8a,
  GUARD_N:  0x8b, GUARD_E:  0x8c, GUARD_S:  0x8d, GUARD_W:  0x8e,
  WANDER:   0x8f, LOITER:   0x90, SLEEP:    0x91, SIT:      0x92,
  EAT:      0x93, FARM:     0x94, PLAY:     0x95, CONVERSE: 0x96,
  THIEF:    0x97, RINGBELL: 0x98, BRAWL:    0x99,
  // ai.h comments these "RETREAT?" / VIGILANTE; observed in real schedule data.
  AI_9A:    0x9a, VIGILANTE: 0x9b,
};

const POINTER_COUNT = 257;
const POINTER_BYTES = POINTER_COUNT * 2;
const SLOT_BYTES = 5;
const NPC_COUNT = 256;

export function decodeSchedule(bytes) {
  if (bytes.byteLength < POINTER_BYTES) {
    throw new Error(`schedule: file too short for pointer table (${bytes.byteLength} < ${POINTER_BYTES})`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const pointers = new Uint16Array(POINTER_COUNT);
  for (let i = 0; i < POINTER_COUNT; i++) pointers[i] = dv.getUint16(i * 2, true);

  const totalSlots = pointers[NPC_COUNT];
  const expectedLen = POINTER_BYTES + totalSlots * SLOT_BYTES;
  if (bytes.byteLength < expectedLen) {
    throw new Error(`schedule: file too short for ${totalSlots} slots (${bytes.byteLength} < ${expectedLen})`);
  }

  const slots = new Array(totalSlots);
  for (let i = 0, p = POINTER_BYTES; i < totalSlots; i++, p += SLOT_BYTES) {
    const time = dv.getUint8(p);
    const b1 = dv.getUint8(p + 2);
    const b2 = dv.getUint8(p + 3);
    const b3 = dv.getUint8(p + 4);
    slots[i] = {
      time,
      action: dv.getUint8(p + 1),
      hour: time & 0x1f,
      day: (time >> 5) & 0x07,
      x: ((b2 & 0x03) << 8) | b1,
      y: ((b3 & 0x0f) << 6) | ((b2 & 0xfc) >> 2),
      z: (b3 & 0xf0) >> 4,
    };
  }

  // Per-NPC view: byNpc[n] is the slot subarray for NPC n (empty if no schedule).
  const byNpc = new Array(NPC_COUNT);
  for (let n = 0; n < NPC_COUNT; n++) {
    byNpc[n] = slots.slice(pointers[n], pointers[n + 1]);
  }

  return { pointers, slots, byNpc, totalSlots };
}
