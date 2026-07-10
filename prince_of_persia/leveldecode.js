// leveldecode.js — decode ONE Prince of Persia level from LEVELS.DAT into the same
// runtime shape as res/level1.js, entirely in the browser. This is the shared level
// module: the level viewer decodes a user-dropped LEVELS.DAT with it, and (once the
// shared fixups land) both the player and the viewer import alter_mods + pot_types
// from here.
//
// Faithful port of tools/extract_level.py (itself a port of SDLPoP level_type, GPLv3,
// types.h:228 — see the project NOTICE). Level N is DAT resource 2000+N, stored as a
// verbatim 2305-byte level_type dump (no image decode). We keep the fields the engine
// reads and drop the rest; extract_level.py documents the full KEEP/DROP rationale and
// the field-offset provenance.

import { readResource, listResources } from './dat.js';

const sbyte = (v) => (v > 127 ? v - 256 : v);

const TILES_6_CLOSER = 6;    // drop button
const TILES_15_OPENER = 15;  // raise button

// Decode level `n` (1-based) from raw LEVELS.DAT bytes (Uint8Array) → the level1.js shape:
//   { number, usedRooms, start:{room,pos,dir}, rooms:[{links,guard,fg,bg}], doorLinks:[…] }
export function decodeLevel(datBytes, n) {
  const d = readResource(datBytes, 2000 + n);
  if (!d) throw new Error(`level ${n}: resource ${2000 + n} not found in DAT`);
  if (d.length !== 2305)
    throw new Error(`level ${n}: payload ${d.length} bytes, expected 2305 (sizeof level_type)`);

  // level_type field slices (types.h:228 — offsets verified in extract_level.py)
  const fg = d.subarray(0, 720), bg = d.subarray(720, 1440);
  const dl1 = d.subarray(1440, 1696), dl2 = d.subarray(1696, 1952);
  const rlk = d.subarray(1952, 2048);
  // used_rooms is stored as 25 in several levels' data, but PoP clamps it to ROOMCOUNT (24) on load
  // (reset_level_unused_fields, seg000.c:1172) — the extra room is not real. Clamp so we never emit a
  // bogus 25th room (its links/tiles read past the arrays as empty).
  const used = Math.min(d[2048], 24);
  const sRoom = d[2112], sPos = d[2113], sDir = sbyte(d[2114]);
  const gTile = d.subarray(2119, 2143), gDir = d.subarray(2143, 2167);
  const gSkill = d.subarray(2215, 2239), gColor = d.subarray(2263, 2287);

  // doorlink accessors (seg007.c:720-746)
  const dlTile = (i) => dl1[i] & 0x1F;
  const dlRoom = (i) => ((dl1[i] & 0x60) >> 5) + ((dl2[i] & 0xE0) >> 3);
  const dlNext = (i) => !(dl1[i] & 0x80);       // bit 7 clear = the chain continues
  const dlTimer = (i) => dl2[i] & 0x1F;

  // The doorlink table is 256 entries but only those reachable from a button are ever
  // read (trigger_button walks i, i+1, … while .next). Trim to the last reachable index.
  let maxIdx = -1;
  for (let r = 0; r < used; r++)
    for (let pos = 0; pos < 30; pos++) {
      const t = fg[r * 30 + pos] & 0x1F;
      if (t === TILES_6_CLOSER || t === TILES_15_OPENER) {
        let i = bg[r * 30 + pos], steps = 0;
        while (i < 256 && steps < 256) { if (i > maxIdx) maxIdx = i; if (!dlNext(i)) break; i++; steps++; }
      }
    }
  const doorLinks = [];
  for (let i = 0; i <= maxIdx; i++)
    doorLinks.push({ room: dlRoom(i), tile: dlTile(i), timer: dlTimer(i), next: dlNext(i) });

  // per-room records
  const rooms = [];
  for (let r = 1; r <= used; r++) {
    const base = (r - 1) * 30, lb = (r - 1) * 4;
    const fgrid = [], bgrid = [];
    for (let row = 0; row < 3; row++) {
      const fr = [], br = [];
      for (let c = 0; c < 10; c++) { fr.push(fg[base + row * 10 + c] & 0x1F); br.push(bg[base + row * 10 + c]); }
      fgrid.push(fr); bgrid.push(br);
    }
    const gt = gTile[r - 1];
    const guard = gt >= 30 ? null
      : { tile: gt, dir: sbyte(gDir[r - 1]), skill: gSkill[r - 1] & 0x0F, color: gColor[r - 1] & 0x0F };
    rooms.push({
      links: { left: rlk[lb], right: rlk[lb + 1], up: rlk[lb + 2], down: rlk[lb + 3] },
      guard, fg: fgrid, bg: bgrid,
    });
  }

  return { number: n, usedRooms: used, start: { room: sRoom, pos: sPos, dir: sDir }, rooms, doorLinks };
}

// Which levels a LEVELS.DAT contains: index entries whose id is 2000+N (N ≥ 1) and whose
// payload is a full level_type (2305 bytes). Returns sorted level numbers — populates the
// viewer's <select>.
export function listLevels(datBytes) {
  return listResources(datBytes)
    .filter((r) => r.id >= 2001 && r.id < 2100 && r.size === 2305)
    .map((r) => r.id - 2000)
    .sort((a, b) => a - b);
}

// --- shared level-load fixup + potion palette (imported by both the player and the level viewer) ---

// alter_mods_allrm / load_alter_mod (seg008.c): the level-LOAD tile-modifier fixup, run once when a
// level is (re)loaded. LEVELS.DAT stores DESIGN-time modifiers; the engine rewrites a few tile types'
// modifiers into their runtime encoding before play. We port the cases that matter for collision /
// gameplay (the WALL case is render-only wall-connection bits — a view-space deviation we skip,
// CLAUDE.md lesson 6c):
//   - POTION (10): modifier <<= 3. The stored low bits ARE the potion effect type (1 heal, 2 life,
//     3 slow-fall, 4 flip, 5 hurt, 6 open); the runtime keeps the type in the HIGH bits (>>3, read by
//     do_pickup / the pot_types annotation) and the low 3 bits become the bubble-animation phase. So
//     without this, every potion reads as type 0 (no effect). Level-1 potions are stored 1 -> 8 = HEAL.
//   - GATE (4): stored==1 -> 188 (loads OPEN), else -> 0 (loads CLOSED). The modifier then IS the
//     gate's open height (can_bump_into_gate / animate_door read it). Room-5 col-9's gate is stored 1,
//     so it loads open (a raw 1 would wrongly read as closed).
//   - LOOSE (11): -> 0 (the collapse countdown starts fresh; make_loose_fall arms it to 1).
// Mutates `lv` in place — callers pass a clone they own (the player clones LEVEL1; the viewer clones
// the freshly-decoded level).
export function alterModsAllrm(lv) {
  for (const room of lv.rooms) {
    if (!room) continue;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 10; col++) {
      const t = room.fg[row][col] & 0x1F;
      if (t === 10)      room.bg[row][col] = (room.bg[row][col] << 3) & 0xFF;   // potion: type moves to the high bits
      else if (t === 4)  room.bg[row][col] = (room.bg[row][col] === 1) ? 188 : 0;  // gate: open (188) or closed (0)
      else if (t === 11) room.bg[row][col] = 0;                                  // loose: fresh countdown
    }
  }
}

// pot_types (screenshot.c:181) — the potion effect -> colour + short label, keyed by the runtime
// modifier's HIGH bits (modifier >> 3, after alter_mods' <<3). SDLPoP uses this exact mapping for its
// own on-screen potion annotation; the colours are the EGA bright palette (12 red / 10 green / 9 blue /
// 7 light-gray). Both the player and the viewer draw a potion as an abstract bottle tinted by this.
export const POT_TYPES = [
  { color: '#a8a8a8', text: 'x'    },   // 0 empty / no effect
  { color: '#ff5555', text: '+1'   },   // 1 heal   (small red)
  { color: '#ff5555', text: '+++'  },   // 2 life   (big red)
  { color: '#55ff55', text: 'slow' },   // 3 slow fall (green)
  { color: '#55ff55', text: 'flip' },   // 4 upside-down (green)
  { color: '#5555ff', text: '-1'   },   // 5 hurt   (blue)
  { color: '#5555ff', text: 'trig' },   // 6 open / trigger (blue)
];
