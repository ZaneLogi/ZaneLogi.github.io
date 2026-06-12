// objlist decode — the savegame actor table: 256 NPC slots as parallel sections
// (each 256 entries unless noted) plus party info and world globals. Section
// offsets are a fixed format ported verbatim from legacy obj_manager.js:142
// loadObjlist; the offset assertions guard against a short/misaligned file
// silently producing garbage positions.
//
// Slots 0..255 are NPCs (named party members + every speakable NPC). For I-2 the
// render needs status + x/y/z + objNumber/frame; the stats / schedule / globals are
// decoded here too (one cohesive pass over a fixed format) for I-3 (clock) and
// I-5 (schedules) rather than re-deriving these offsets later.

export function decodeObjlist(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii');
  const actors = Array.from({ length: 256 }, (_, i) => ({ id: i, name: '(undefined)' }));

  let p = 0;
  const u8 = () => dv.getUint8(p++);
  const section = (fn) => { for (let i = 0; i < 256; i++) fn(actors[i]); };
  const at = (off) => { if (p !== off) throw new Error(`objlist: offset ${p.toString(16)} != ${off.toString(16)}`); };

  // 0x0000 ObjStatus (coord-use lives at bits 0x18)
  section((a) => { a.status = u8(); });
  // 0x0100 ObjPos (3 bytes: x10 y10 z4)
  at(0x0100);
  section((a) => {
    const b1 = u8(), b2 = u8(), b3 = u8();
    a.x = ((b2 & 0x03) << 8) | b1;
    a.y = ((b3 & 0x0f) << 6) | ((b2 & 0xfc) >> 2);
    a.z = (b3 & 0xf0) >> 4;
  });
  // 0x0400 ObjShapeType (objNumber10 + frame6)
  at(0x0400);
  section((a) => {
    const b1 = u8(), b2 = u8();
    a.objNumber = ((b2 & 0x03) << 8) | b1;
    a.frame = (b2 & 0xfc) >> 2;
  });
  // 0x0600 Amount (engine-internal here) — skip
  at(0x0600); p += 512;
  // 0x0800.. single-byte stat sections
  at(0x0800); section((a) => { a.npcStatus = u8(); });
  section((a) => { a.strength = u8(); });
  section((a) => { a.dexterity = u8(); });
  section((a) => { a.intelligence = u8(); });
  // 0x0c00 Experience (u16 LE)
  at(0x0c00); section((a) => { a.exp = dv.getUint16(p, true); p += 2; });
  // 0x0e00 HP
  at(0x0e00); section((a) => { a.hp = u8(); });

  // 0x0f00 party member names (16 x 14, ascii, NUL-padded)
  at(0x0f00);
  const partyNames = [];
  for (let i = 0; i < 16; i++) {
    const chunk = bytes.subarray(p, p + 14);
    const end = chunk.indexOf(0);
    partyNames[i] = decoder.decode(end === -1 ? chunk : chunk.subarray(0, end));
    p += 14;
  }
  // 0x0fe0 party member slot ids, 0x0ff0 party size
  at(0x0fe0);
  const partyMemberIds = [];
  for (let i = 0; i < 16; i++) partyMemberIds[i] = u8();
  const partySize = u8();

  // 0x0ff1.. more single-byte sections
  at(0x0ff1); section((a) => { a.level = u8(); });
  section((a) => { a.schedule = u8(); });       // schedule index
  section((a) => { a.npcMode = u8(); });
  section((a) => { a.npcComMode = u8(); });
  at(0x13f1); section((a) => { a.mp = u8(); });
  at(0x14f1); section((a) => { a.movePts = u8(); });
  // 0x15f1 Original Shape Type (u16, shapeshift recovery) — skip
  at(0x15f1); p += 512;
  at(0x17f1); section((a) => { a.talkFlags = u8(); });
  section((a) => { a.leader = u8(); });
  section((a) => { a.npcFlag = u8(); });
  // 0x1af1 D_8C42 — pathfinding step buffer [8 paths][32 steps] (seg_0C9C.c:320,
  // u6.h:482). Saved state, but skipped: the rebuild recomputes NPC paths at runtime.
  at(0x1af1); p += 256;

  // 0x1bf1 world globals (source obj_2C4A..D_2CCC)
  at(0x1bf1);
  const g = (u6off) => dv.getUint8(p + (u6off - 0x2c4a));
  const globals = {
    isOnQuest: g(0x2c4a),
    nextSleep: g(0x2c4b),
    timeMinute: g(0x2c4c),
    timeHour: g(0x2c4d),
    dateDay: g(0x2c4e),
    dateMonth: g(0x2c4f),
    dateYear: g(0x2c50),
    karma: g(0x2c52),
    avatarSex: g(0x2cca),
    avatarPortrait: g(0x2ccb),     // D_2CCB — the Avatar's char-creation portrait choice (1-based; 0 = uncreated)
  };

  // Name the placed party members.
  const party = [];
  for (let i = 0; i < partySize; i++) {
    const idx = partyMemberIds[i];
    actors[idx].name = partyNames[i];
    party.push(idx);
  }

  return { actors, party, partySize, globals };
}

// New-game initialization for an UNCREATED factory copy (gated on D_2CCB==0).
//
// GAME.EXE has no character-creation code — it execs the external ultima6.exe when
// D_2CCB==0 (seg_0903.c:594), which isn't in the decompile and which writes the avatar's
// chosen stats + the initial world state. A pristine U6 copy therefore boots with zeroed
// world globals (karma/clock) AND a PLACEHOLDER avatar slot (STR/DEX/INT 15/15/15 but
// EXP 9999 / level 8). This synthesizes the new-game starting state so the clone — which
// has no creation flow — presents a sensible freshly-created avatar.
//
// Keyed on D_2CCB (the char-creation portrait choice; 0 == "not yet created"). A CREATED
// character — i.e. ANY real save (D_2CCB>0) — is left completely untouched, so its real
// karma (even a legitimate 0), clock (even midnight 00:00), and stats all survive. A clone
// snapshot restores its saved actors/globals over the top regardless (snapshot.js restore).

// World-global defaults = GAME.EXE's D_2C4A.c program-start initializers (the "blank slate"
// the objlist overwrites). Filled only where the objlist read zero. Full table (MapX/Y
// 307/352, D_2C55 7, …) in research_save_load.md §"New-game initialization".
export const D_2C4A_DEFAULTS = Object.freeze({
  karma: 75,
  timeMinute: 0, timeHour: 8,
  dateDay: 4, dateMonth: 7, dateYear: 161,
});

// U6's Avatar is objlist actor slot 1 (GAME.EXE + Nuvie use fixed slot-1 offsets: STR 0x901,
// EXP 0xc02, level 0xff2). Nuvie's update_objlist_for_new_game_u6 (save/SaveGame.cpp) writes
// a created avatar's EXP 0x172 (=370) + level 3; STR/DEX/INT keep the template's 15/15/15
// base, and magic/HP derive from the stat formulas. See the reference_nuvie_source memory.
const AVATAR_SLOT = 1;
const NEWGAME_AVATAR_EXP = 0x172;   // 370
const NEWGAME_AVATAR_LEVEL = 3;

// Apply the new-game starting state to an uncreated factory objlist. Mutates + returns it.
export function applyNewGameDefaults(objlist) {
  if (objlist.globals.avatarPortrait !== 0) return objlist;   // D_2CCB>0 -> real character; leave everything
  for (const [k, v] of Object.entries(D_2C4A_DEFAULTS)) {
    if (!objlist.globals[k]) objlist.globals[k] = v;           // world globals: fill where the objlist read zero
  }
  const avatar = objlist.actors[AVATAR_SLOT];                  // avatar stats: hard-set (the placeholder is non-zero)
  if (avatar) { avatar.exp = NEWGAME_AVATAR_EXP; avatar.level = NEWGAME_AVATAR_LEVEL; }
  return objlist;
}
