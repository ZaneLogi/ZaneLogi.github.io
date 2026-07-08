// pathasm.js — the ASSEMBLER: galaga fly-in paths re-expressed as readable PathBuilder
// calls, assembled to the very bytes the ROM extraction (paths.js) holds.
//
// This is the layer that turns "which path, made of what" into a byte-stream, using the
// builder engine (pathbuilder.js). Right now just the one demo path 01E8; more paths are
// added here as the demo grows. demos/path_player.js round-trips each assembly
// byte-for-byte against paths.js PATH_BY_ADDR — so this stays honest to the ROM.

import { PathBuilder } from './pathbuilder.js';
import { VARIANTS } from './paths.js';

// path 01E8 (gg1-5.s:229; PATH_INDEX entry 6, variant 0) — four 3-byte steering
// segments. byte0 0xYX = vy hi / vx lo. The `label` names each segment's role.
export const SEGMENTS_01E8 = [
  { vx: 3, vy: 2, rot:  0, dur:  16, label: 'descend' },
  { vx: 3, vy: 2, rot:  1, dur:  64, label: 'gentle bend' },
  { vx: 2, vy: 2, rot: 12, dur:  55, label: 'hard hook' },
  { vx: 3, vy: 2, rot:  0, dur: 255, label: 'long tail' },
];

export const PATH_01E8 = (() => {
  const b = new PathBuilder('01E8');
  for (const s of SEGMENTS_01E8) b.seg(s);
  return b.end().build();
})();

// path 01E8 is PATH_INDEX variant 0, so its pair members launch from the real
// VARIANTS[0] / VARIANTS[1] rows (paths.js) — member 1 flies with rotation negated.
export const STARTS_01E8 = { member0: VARIANTS[0], member1: VARIANTS[1] };

// ── Reference example: a TOKEN-BEARING path with sub-paths ─────────────────────
// path 001D (gg1-5.s:82; PATH_INDEX entry 0, variant 0). Unlike 01E8 (pure segments +
// END), this fly-in carries control tokens AND two jump-target sub-paths. It shows the
// full assembly surface — named token methods + `.subPath(addr, builder)` — and how
// galaga's ABSOLUTE Z80 jump addresses are the keys the sub-paths attach under (the
// F0/F7 handlers in bugMotion.js look their target up by that address). Not used by the
// demo; here as the worked reference for how a sub-path-bearing path assembles.

// F7 (ATTACK_TURN) target 0x004B — the transient swoop: two segments, a BREAK-formation
// token carrying its 8-byte targeting table, then a tail + END. (paths.js:106)
const sub_004B = new PathBuilder('004B')
  .seg({ vx: 3, vy: 2, rot: -16, dur: 38 })
  .seg({ vx: 3, vy: 2, rot: 20, dur: 19 })
  .breakFormation([0x0D, 0x0B, 0x0A, 0x08, 0x06, 0x04, 0x03, 0x01])
  .seg({ vx: 3, vy: 2, rot: -1, dur: 255 })
  .end();

// F0 (ATTACK_WAVE) target 0x005E — the stage-8+ wave: dive in, then turn home. (paths.js:90)
const sub_005E = new PathBuilder('005E')
  .seg({ vx: 4, vy: 4, rot: -28, dur: 24 })
  .turnHome()
  .seg({ vx: 4, vy: 4, rot: 0, dur: 255 })
  .end();

export const PATH_001D = new PathBuilder('001D')
  .seg({ vx: 3, vy: 2, rot: 6, dur: 22 })
  .seg({ vx: 3, vy: 2, rot: 0, dur: 25 })
  .attackTurn(0x004B)                        // F7 → sub_004B (transient members only)
  .seg({ vx: 3, vy: 2, rot: -16, dur: 2 })
  .attackWave(0x005E)                        // F0 → sub_005E (stage 8+)
  .seg({ vx: 3, vy: 2, rot: -16, dur: 36 })
  .turnHome()                                // FB → guided flight to the formation slot
  .seg({ vx: 3, vy: 2, rot: 0, dur: 255 })
  .end()
  .subPath(0x004B, sub_004B)                 // attach F7's target by its Z80 address
  .subPath(0x005E, sub_005E)                 // attach F0's target by its Z80 address
  .build();

// path 001D is also PATH_INDEX variant 0 → same pair launch rows as 01E8.
export const STARTS_001D = { member0: VARIANTS[0], member1: VARIANTS[1] };

// ── Reference example: a REGION path (labels + base + entry points) ────────────
// ATTACK_PATH_BOSS (gg1-5.s:335-369). The attack/convoy/boss paths use galaga's OTHER
// layout: one contiguous array + a `z80Base`, where jumps carry absolute Z80 addresses
// the interpreter resolves by offset (addr − base). Because these paths SHARE sub-paths,
// you author them with `.label()` / `.entry()` and jump BY NAME — build() resolves each
// label to base+offset (the ROM's absolute address) and packages `.z80Base` + `.entries`.
// Contrast PATH_001D above (fly-in): absolute-address `.subPath()`, no labels, no base.
//
// This region bundles the escort-sortie and capture-boss paths into ONE array that SHARES
// the home tail: `home_tail` is reached by `.loopTop('home_tail')` from BOTH entries — one
// label, no duplication. Two named entry points come out at their ROM offsets (escort=5 =
// ATTACK_PATH_BOSS.entryOffset, capture=72 = CAPTURE_ENTRY_OFFSET). Not used by the demo;
// here as the region-mode reference.
export const REGION_BOSS = new PathBuilder({ base: 0x40C })
  // p_flv_040C (z80 0x40C) — the SHARED home tail (FA target from both entries)
  .label('home_tail').turnHome().seg({ vx: 2, vy: 1, rot: 0, dur: 255 }).end()
  // db_flv_0411 (z80 0x411) — ESCORT-SORTIE entry
  .entry('escort').seg({ vx: 2, vy: 1, rot: 24, dur: 20 })
  // p_flv_0414 (z80 0x414) — the dive arc
  .label('dive_arc')
    .seg({ vx: 2, vy: 1, rot: 3, dur: 0x2A }).seg({ vx: 2, vy: 1, rot: 16, dur: 0x40 })
    .seg({ vx: 2, vy: 1, rot: 1, dur: 0x20 }).seg({ vx: 2, vy: 1, rot: -2, dur: 0x71 })
  // p_flv_0420 (z80 0x420) — home the X/Y, then FA → the shared home tail
  .label('to_home').reenterColumn().diveHome().loopTop('home_tail')            // ★ shared jump #1
  // p_flv_0425 (z80 0x425) — EF gate → harder pass; else re-loop the dive arc
  .label('gate').bombMode('harder').freeFlight(0xAB).seg({ vx: 2, vy: 1, rot: 2, dur: 0x20 }).jump('dive_arc')
  // p_flv_0430 (z80 0x430) — the harder / continuous pass
  .label('harder').freeFlight(0xB0)
    .seg({ vx: 3, vy: 2, rot: 4, dur: 0x1A }).seg({ vx: 3, vy: 2, rot: 3, dur: 0x1D })
    .seg({ vx: 3, vy: 2, rot: 26, dur: 0x25 }).seg({ vx: 3, vy: 2, rot: 3, dur: 0x10 })
    .seg({ vx: 3, vy: 2, rot: -3, dur: 0x48 }).jump('to_home')
  // db_fltv_rogefgter (z80 0x444) — rogue-fighter path, kept verbatim to keep offsets aligned
  .label('rogue')
    .seg({ vx: 2, vy: 1, rot: 24, dur: 20 }).seg({ vx: 2, vy: 1, rot: 3, dur: 0x2A })
    .seg({ vx: 2, vy: 1, rot: 16, dur: 0x40 }).seg({ vx: 2, vy: 1, rot: 1, dur: 0x20 })
    .seg({ vx: 2, vy: 1, rot: -2, dur: 0x78 }).end()
  // db_0454 (z80 0x454) — CAPTURE-BOSS entry; also FA → the shared home tail
  .entry('capture').seg({ vx: 2, vy: 1, rot: 24, dur: 20 }).captureDive().seg({ vx: 2, vy: 1, rot: 0, dur: 4 })
    .dive(0x48).seg({ vx: 0, vy: 0, rot: -4, dur: 255 }).seg({ vx: 3, vy: 2, rot: 0, dur: 0x30 })
    .reenterTop().reenterColumn().loopTop('home_tail').jump('gate')               // ★ shared jump #2
  .build();

// ── The two bomber attack regions (same shape as REGION_BOSS) ─────────────────
// Same region layout as REGION_BOSS — one contiguous array + a z80Base, jumps by label —
// but each carries a SINGLE entry (offset 0, the launcher default; no explicit
// entryOffset) and a self-jumping loop body that returns through a shared tail. Labels
// are named after their Z80 address (the source's own p_flv_XXXX convention).

// ── REGION_YELLOW — the yellow bee (gg1-5.s:285; getAttackPath('yellow')) ──────
// Two dive-and-bomb loops (`p352` / `p37C`): each dives (`.dive`), free-flight bombs
// (`.freeFlight`), and returns through the SHARED tail `p39E`, which turn-homes back to
// formation. `loopTop` conditionally routes both loops into that tail.
export const REGION_YELLOW = new PathBuilder({ base: 0x34F })
  .entry('start')
    .seg({ vx: 2, vy: 1, rot: 24, dur: 0x1E })
  .label('p352')
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0x34 })
    .seg({ vx: 2, vy: 1, rot: -5, dur: 0x26 })
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0x2 })
    .dive(0x2E)
    .seg({ vx: 2, vy: 1, rot: -6, dur: 0x3C })
    .loopTop('p39E')
    .seg({ vx: 2, vy: 1, rot: -8, dur: 0x10 })
    .seg({ vx: 2, vy: 1, rot: -6, dur: 0x5C })
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0x23 })
  .label('p36C')
    .reenterTop()
    .reenterColumn()
    .bombMode('p37C')
    .freeFlight(0xAB)
    .seg({ vx: 2, vy: 1, rot: 1, dur: 0x28 })
    .seg({ vx: 2, vy: 1, rot: 10, dur: 0x18 })
    .jump('p352')
  .label('p37C')
    .freeFlight(0xB0)
    .seg({ vx: 3, vy: 2, rot: 8, dur: 0x1E })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x19 })
    .seg({ vx: 3, vy: 2, rot: -8, dur: 0x16 })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x2 })
    .dive(0x30)
    .seg({ vx: 3, vy: 2, rot: -9, dur: 0x26 })
    .loopTop('p39E')
    .seg({ vx: 3, vy: 2, rot: -16, dur: 0xA })
    .seg({ vx: 3, vy: 2, rot: -11, dur: 0x31 })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x10 })
    .jump('p36C')
  .label('p39E')                                            // the SHARED return tail
    .seg({ vx: 2, vy: 1, rot: -8, dur: 0x10 })
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0x40 })
    .turnHome()
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0xFF })
    .end()
  .build();

// ── REGION_RED — the red moth free-flight bomber (gg1-5.s:311; getAttackPath('red')) ──
// Aims its dive at the player via F3 (`.breakTargeted` — a deltaX→duration table, NOT a
// jump), free-flight bombs, and returns through the SHARED tail `p40C`. That tail is z80
// 0x40C — the SAME ROM location REGION_BOSS labels `home_tail`; each array carries its own
// copy (faithful: shared sub-paths are duplicated per array, not cross-referenced).
export const REGION_RED = new PathBuilder({ base: 0x3A9 })
  .entry('start')
    .seg({ vx: 2, vy: 1, rot: 24, dur: 0x1D })
  .label('p3AC')
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0x28 })
    .seg({ vx: 2, vy: 1, rot: -6, dur: 0x2 })
    .breakTargeted([0x3F, 0x3B, 0x36, 0x32, 0x28, 0x26, 0x24, 0x22])   // F3 case_0A01: deltaX→duration table
    .seg({ vx: 2, vy: 1, rot: 4, dur: 0x30 })
    .seg({ vx: 2, vy: 1, rot: -4, dur: 0x30 })
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0x18 })
    .reenterTop()
    .reenterColumn()
    .loopTop('p40C')
    .bombMode('p3D7')
  .label('p3CC')
    .freeFlight(0xB0)
    .seg({ vx: 2, vy: 1, rot: 1, dur: 0x28 })
    .seg({ vx: 2, vy: 1, rot: 10, dur: 0x15 })
    .jump('p3AC')
  .label('p3D7')
    .freeFlight(0xC0)
    .seg({ vx: 3, vy: 2, rot: 8, dur: 0x10 })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x23 })
    .seg({ vx: 3, vy: 2, rot: -8, dur: 0xF })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x48 })
    .reenterTop()
    .reenterColumn()
    .loopTop('p40C')
    .freeFlight(0xB0)
    .seg({ vx: 3, vy: 2, rot: 8, dur: 0x20 })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x8 })
    .seg({ vx: 3, vy: 2, rot: -8, dur: 0x2 })
    .breakTargeted([0x34, 0x31, 0x2D, 0x29, 0x22, 0x26, 0x1F, 0x18])   // F3 case_0A01: deltaX→duration table
    .seg({ vx: 3, vy: 2, rot: 8, dur: 0x18 })
    .seg({ vx: 3, vy: 2, rot: -8, dur: 0x18 })
    .seg({ vx: 3, vy: 2, rot: 0, dur: 0x10 })
    .reenterTop()
    .reenterColumn()
    .jump('p3CC')
  .label('p40C')                                            // the SHARED return tail (= REGION_BOSS home_tail, z80 0x40C)
    .turnHome()
    .seg({ vx: 2, vy: 1, rot: 0, dur: 0xFF })
    .end()
  .build();
