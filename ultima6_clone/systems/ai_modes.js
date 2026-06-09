// Runtime NPC AI-mode constants (the NPCMode byte), from ai.h. This is the full
// runtime set; assets/schedule.js's AiAction is the narrower view of just the codes
// that appear in SCHEDULE *data* (0x87..0x9b). The pathfinding tier (0x80..0x86)
// and the base modes (0x00..0x02) only ever appear at runtime in an NPC's AIMode.
//
// Lifecycle (the part I-9 ports): the hourly schedule tick sets AI_FINDPATH; the
// path service builds a path and flips to AI_ONPATH; __DoOnPath walks it, escalating
// AI_ONPATH -> AI_84 -> AI_85 -> AI_86 on repeated blocks (each a "wait a turn");
// AI_86 abandons the path and re-finds. On arrival the worktype mode (0x87..) is set.

export const AI_MOTIONLESS = 0x00;   // never ticks
export const AI_FOLLOW     = 0x01;   // party companion (moved by MoveFollowers, not the dispatcher)
export const AI_COMMAND    = 0x02;   // active party member (moved by player input)

export const AI_SCHEDULE   = 0x80;   // awaiting / between schedule events
export const AI_FINDPATH   = 0x81;   // needs a path built to its scheduled xyz
export const AI_SEEKOBJ    = 0x82;   // path toward a sought object type (deferred)
export const AI_ONPATH     = 0x83;   // walking a built path
export const AI_84         = 0x84;   // blocked once  — wait + retry next tick
export const AI_85         = 0x85;   // blocked twice — wait + retry
export const AI_86         = 0x86;   // blocked thrice — abandon path, re-find

// Schedule worktypes (0x87..0x9b) — the leaf states an NPC sits in on arrival. Set
// by __AtDestination (I-9e). Mirrors assets/schedule.js AiAction; duplicated here so
// the runtime mode set is self-contained.
export const AI_STAND_N = 0x87, AI_STAND_E = 0x88, AI_STAND_S = 0x89, AI_STAND_W = 0x8a;
export const AI_GUARD_N = 0x8b, AI_GUARD_E = 0x8c, AI_GUARD_S = 0x8d, AI_GUARD_W = 0x8e;
export const AI_WANDER = 0x8f, AI_LOITER = 0x90, AI_SLEEP = 0x91, AI_SIT = 0x92;
export const AI_EAT = 0x93, AI_FARM = 0x94, AI_PLAY = 0x95, AI_CONVERSE = 0x96;
export const AI_THIEF = 0x97, AI_RINGBELL = 0x98, AI_BRAWL = 0x99, AI_9A = 0x9a, AI_VIGILANTE = 0x9b;

// Reverse lookup name for HUD/debug (sparse — only the codes we name).
const NAMES = {
  0x00: 'MOTIONLESS', 0x01: 'FOLLOW', 0x02: 'COMMAND',
  0x80: 'SCHEDULE', 0x81: 'FINDPATH', 0x82: 'SEEKOBJ', 0x83: 'ONPATH',
  0x84: 'AI_84', 0x85: 'AI_85', 0x86: 'AI_86',
  0x87: 'STAND_N', 0x88: 'STAND_E', 0x89: 'STAND_S', 0x8a: 'STAND_W',
  0x8b: 'GUARD_N', 0x8c: 'GUARD_E', 0x8d: 'GUARD_S', 0x8e: 'GUARD_W',
  0x8f: 'WANDER', 0x90: 'LOITER', 0x91: 'SLEEP', 0x92: 'SIT', 0x93: 'EAT',
  0x94: 'FARM', 0x95: 'PLAY', 0x96: 'CONVERSE', 0x97: 'THIEF', 0x98: 'RINGBELL',
  0x99: 'BRAWL', 0x9a: 'AI_9A', 0x9b: 'VIGILANTE',
};
export function aiModeName(mode) { return NAMES[mode] ?? `0x${mode.toString(16)}`; }
