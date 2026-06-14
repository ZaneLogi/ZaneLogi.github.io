// Blue moongate runtime (I-moongate sub-step c). Three ports:
//
//   spawnBlueGates  — C_0A33_121A (seg_0A33.c:621): maintain a blue gate (OBJ_055)
//                     at each active endpoint on the current level while a moon is up.
//   checkGateEntry  — C_1E0F_184D blue branch (seg_1E0F.c:726): after the avatar steps
//                     onto a gate, pick Trammel vs Felucca by phase and travel.
//   gateTravel      — C_101C_0A3A (seg_101C.c:368): teleport the party to D_2C74[slot].
//
// Kept deviations (research_moongate.md §4/§9):
//   - DROPPED the AreaX/AREA_W spawn bound (a 1990 DOS memory-streaming artifact, not a
//     mechanic): a gate lives at EVERY active endpoint on the current level, not just the
//     ~40x40 resident window. Source spawns immediately on area-recache (C_101C_0306:193)
//     anyway, so "all active slots" reproduces its immediacy without coupling to region
//     streaming. Consequence: spawnBlueGates RECONCILES (delete strays + add missing)
//     rather than per-slot spawn/despawn, so a relocated/cleared endpoint can't leave a
//     stale gate (source's incremental form can) — and an UNBURIED (all-zero) slot is
//     skipped, so dropping the bound doesn't spawn a junk gate at (0,0).
//   - Hard-cut teleport (no PartyEnter/PartyExit), shared via teleportParty.
//   - The D_2CC3 solo-mode gate is skipped (no solo mode), as in I-19.
//   - Music (MUS_*) is deferred (no audio subsystem).

import { MoonGates } from '../resources/moon_gates.js';
import { MapLevel } from '../resources/map_level.js';
import { WorldClock } from '../resources/world_clock.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { Position, ObjType, Amount } from '../components/components.js';
import { addMapObject, deleteMapObject, moveMapObject, dropToMap, objAtCell, findObjectsByTypeQuality } from '../world_loader.js';
import { teleportParty } from './level_change.js';
import { canStandAt } from './passability.js';
import { OBJ_BLUE_GATE, OBJ_RED_GATE, OBJ_MOONSTONE, D_171C, D_174E, D_1780, SHRINE_OF_SPIRITUALITY } from '../assets/moon_tables.js';

const OBJ_DOORWAY = 0x12D, OBJ_PASSAGE = 0x12E;   // can't cast a red gate onto these (C_27A1_5789:2673)

// C_0A33_121A — reconcile the blue gates on the ACTIVE level to the live network.
// Desired = every active (buried) endpoint on this level, IFF a moon is up. Then:
// delete any OBJ_055 on this level not at a desired cell, and add one at each desired
// cell that lacks it. Idempotent — safe to call on the hour-hook, at load, on level
// change, and after bury/GET (sub-step d).
export function spawnBlueGates(world) {
  const moons = world.getResource(MoonGates);
  const level = world.getResource(MapLevel).level;
  const pos = world.store(Position);

  // Desired gate cells on this level (skip unburied all-zero slots; gate off at night).
  const desired = new Map();   // "x,y" -> [x,y,z]
  if (moons.anyMoonUp()) {
    for (let s = 0; s < 8; s++) {
      if (!moons.isSlotActive(s)) continue;
      const [x, y, z] = moons.gateDest(s);
      if (z !== level) continue;
      desired.set(`${x},${y}`, [x, y, z]);
    }
  }

  // Delete strays on this level; note which desired cells already hold a gate.
  const present = new Set();
  for (const h of findObjectsByTypeQuality(world, OBJ_BLUE_GATE)) {
    const i = world.resolve(h);
    if (i === -1 || !world.has(h, Position) || pos.z[i] !== level) continue;
    const key = `${pos.x[i]},${pos.y[i]}`;
    if (desired.has(key)) present.add(key);
    else deleteMapObject(world, h);
  }

  // Add the missing ones (frame 1 = the spawned gate, TypeFrame(OBJ_055,1)).
  for (const [key, [x, y, z]] of desired)
    if (!present.has(key)) addMapObject(world, { objNumber: OBJ_BLUE_GATE, frame: 1, x, y, z });
}

// C_101C_0828 PartyTeleport — the gate-travel teleport. Beyond the shared party move it
// CONSUMES a red gate (OBJ_054) at the SOURCE tile on EVERY teleport (the red network's
// single-use mechanic; seg_101C.c:304-306). Used by blue + red travel + the midnight
// override (all of which go through PartyTeleport in source). The USE-ladder path uses
// teleportParty directly — C_101C_089E does NOT delete a source red gate.
export function partyTeleport(world, x, y, z, ctx) {
  const ai = ctx.avatarRef?.handle !== undefined ? world.resolve(ctx.avatarRef.handle) : -1;
  if (ai !== -1) {
    const pos = world.store(Position);
    const src = objAtCell(world, pos.x[ai], pos.y[ai], OBJ_RED_GATE);   // C_1184_07A7(OBJ_054, MapX, MapY)
    if (src !== null) deleteMapObject(world, src);
  }
  teleportParty(world, x, y, z, ctx);
}

// C_101C_0A3A GateTravel — teleport the party to blue endpoint `slot`. An unburied
// (all-zero) slot leaves the party put (source's `if(x||y||z) … else stay`).
export function gateTravel(world, slot, ctx) {
  const [x, y, z] = world.getResource(MoonGates).gateDest(slot);
  if (x || y || z) partyTeleport(world, x, y, z, ctx);
}

// C_1E0F_184D — post-move gate-entry check, run after the avatar's successful step
// (the clone's analog of source calling it at the tail of the advance, seg_1E0F.c:934).
// Scans the objects on the avatar's NEW cell; on a blue gate, pick the moon by phase
// proximity to 7 and travel (incl. the 00:00-00:09 Shrine-of-Spirituality override).
// On a red gate, teleport to its fixed-ROM destination (Qual-indexed). The gate entity
// sits only at its anchor cell, so the D_0658==0 "anchor tile only" guard is satisfied
// for free.
export function checkGateEntry(world, ctx) {
  const { avatarRef } = ctx;
  const ai = avatarRef?.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (ai === -1) return;
  const pos = world.store(Position);
  const objs = world.store(ObjType);
  const ents = world.getResource(SpatialIndex).at(pos.x[ai], pos.y[ai]);
  if (!ents) return;
  const moons = world.getResource(MoonGates);
  const clock = world.getResource(WorldClock);

  for (const h of [...ents]) {                 // copy: gateTravel mutates the index mid-iteration
    if (h === avatarRef.handle) continue;      // Party[Active] == objNum -> skip the avatar itself
    const i = world.resolve(h);
    if (i === -1) continue;
    const type = objs.objNumber[i];

    if (type === OBJ_BLUE_GATE) {
      // 00:00-00:09 override: drawn to the Shrine of Spirituality (seg_1E0F.c:731-735).
      if (clock.Time_H === 0 && clock.Time_M < 10) {
        const [sx, sy, sz] = SHRINE_OF_SPIRITUALITY;
        partyTeleport(world, sx, sy, sz, ctx);
        ctx.message?.('You are drawn into the moongate...');
        return;
      }
      // Which moon is "fuller" (phase nearest 7)? Ties broken by Time_M vs phase order.
      const t = moons.trammelPhase, f = moons.feluccaPhase;
      const bp = Math.abs(7 - t) - Math.abs(7 - f);
      let slot;
      if (bp < 0) slot = moons.trammelSlot;                              // Trammel wins
      else if (bp === 0 && (clock.Time_M < 30) === (t < f)) slot = moons.trammelSlot;   // tie -> Trammel
      else slot = moons.feluccaSlot;                                     // Felucca wins
      ctx.message?.('You enter the moongate.');
      gateTravel(world, slot, ctx);
      return;
    }

    if (type === OBJ_RED_GATE) {                 // seg_1E0F.c:753-766
      const di = world.store(Amount).quality[i];
      ctx.message?.('You step into the red moongate.');
      if (di) partyTeleport(world, D_171C[di - 1], D_174E[di - 1], D_1780[di - 1], ctx);
      else partyTeleport(world, pos.x[ai], pos.y[ai], pos.z[ai], ctx);   // Qual 0 = dead gate: stay (still consumed)
      return;
    }
  }
}

// --- (d) bury / relocate (USE moonstone) -----------------------------------------
// Buryable terrain (C_27A1_3425): TIL_001..007 + TIL_010..06F (grass/dirt/etc.).
function isBuryable(tile) {
  return (tile >= 0x001 && tile <= 0x007) || (tile >= 0x010 && tile <= 0x06F);
}

// USE a moonstone (OBJ_049) -> C_27A1_3425 (seg_27a1.c:1563). If the active member
// stands on buryable terrain, bury the stone at its feet: write D_2C74[frame] (frame =
// the lunar phase = the slot) to that cell, MoveObj the stone there, and reconcile the
// blue gates so the endpoint relocates. Else "Cannot be buried here!". Registered as
// the OBJ_049 USE handler (use_handlers.js), so the USE dispatch threads avatarRef.
// Deviations: the clone's USE is map-based, so this fires on an adjacent GROUND stone
// (source also USEs from inventory — the inventory-USE front-end is deferred); the
// C_155D_0748 carry-weight recompute + the avatar MoveObj-to-self are dropped (no-ops
// here). research_moongate.md §6.
export function useMoonstone({ world, target, message, avatarRef }) {
  const ai = avatarRef?.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (ai === -1) return;
  const pos = world.store(Position);
  const x = pos.x[ai], y = pos.y[ai], z = pos.z[ai];
  if (!isBuryable(world.getResource(MapLevel).tileAt(x, y))) { message('Cannot be buried here!'); return; }
  const si = world.resolve(target.entity);
  if (si === -1) return;
  const frame = world.store(ObjType).frame[si];           // moonstone frame = lunar phase = D_2C74 slot
  if (frame > 7) return;                                   // 8 phase glyphs (0..7)
  world.getResource(MoonGates).D_2C74[frame] = [x, y, z];  // relocate the endpoint
  // Bury the stone at the avatar's feet — MoveObj if it's already on the map, else drop it
  // there (it was USEd from inventory; source's MoveObj handles both — seg_27a1.c:1581).
  if (world.has(target.entity, Position)) moveMapObject(world, target.entity, x, y, z);
  else dropToMap(world, target.entity, x, y, z);
  spawnBlueGates(world);                                   // gate follows the endpoint
  message('You bury the moonstone.');
}

// GET a moonstone -> the picked-up stone's endpoint stops spawning (seg_27a1.c:887-891:
// D_2C74[frame] = 0,0,0). Called from the GET verb handler after the stone goes to
// inventory; reconciles the gates so the now-dead endpoint's gate disappears.
export function clearMoonstoneSlot(world, frame) {
  if (frame > 7) return;
  world.getResource(MoonGates).D_2C74[frame] = [0, 0, 0];
  spawnBlueGates(world);
}

// --- (e) red gate / Orb of the Moons --------------------------------------------
// Cast a red moon gate at target cell (tx,ty) — the placement half of C_27A1_5789
// (seg_27a1.c:2658-2685). The cast cell must be in the 5x5 around the active member;
// its offset becomes the gate's Qual (-> D_171C dest), with the self + two horizontal
// neighbors remapped to a dead Qual 0 (research_moongate.md §2.2). Placement is refused
// off standable terrain or onto a doorway/passage marker (OBJ_12D/12E). Returns true on
// a successful cast. (The "Where:" 5x5 pick UI is the command-dispatch cast cursor.)
// The Orb's 5x5 directional-pad index (seg_27a1.c:2662-2666): the own cell + its two
// horizontal neighbors = a dead "stay-put" gate (Qual 0); every other cell maps to
// (dy+2)*5 + (dx+3). Pure (testable); dx/dy are the cast cell offset from the avatar.
export function castDi(dx, dy) {
  return (dy === 0 && Math.abs(dx) <= 1) ? 0 : (dy + 2) * 5 + (dx + 3);
}

export function castRedGate(world, tx, ty, ctx) {
  const ai = ctx.avatarRef?.handle !== undefined ? world.resolve(ctx.avatarRef.handle) : -1;
  if (ai === -1) return false;
  const pos = world.store(Position);
  const dx = tx - pos.x[ai], dy = ty - pos.y[ai];
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { ctx.message?.('Out of range.'); return false; }   // outside the 5x5
  const di = castDi(dx, dy);
  if (!canStandAt(world, tx, ty) ||
      objAtCell(world, tx, ty, OBJ_DOORWAY) !== null || objAtCell(world, tx, ty, OBJ_PASSAGE) !== null) {
    ctx.message?.('Nothing happens.'); return false;
  }
  addMapObject(world, { objNumber: OBJ_RED_GATE, frame: 1, x: tx, y: ty, z: pos.z[ai], quality: di });
  ctx.message?.('A red moon gate appears.');
  return true;
}

// USE the Orb of the Moons (OBJ_057) -> the USE dispatch's OBJ_057 case (seg_27a1.c:3109)
// + C_27A1_5789 (seg_27a1.c:2642). The Orb only works when HELD: source refuses it on the
// ground (`GetCoordUse == LOCXYZ -> D_0DDC[11] "Not usable"`) and only calls the cast
// handler otherwise. Then gated on TalkFlags[5] bit 5 (objlist.actors[5].talkFlags) — set
// by Lord British's conversation (the clone's VM ports the setFlag opcode). When enabled,
// arm the 5x5 "Where:" destination pick (command_dispatch cast cursor); castRedGate runs on
// the confirm. Dev: __U6.enableOrb() sets the flag for testing without the LB talk.
export function useOrb({ world, target, message, avatarRef, armOrbCast, objlist }) {
  if (target?.entity != null && world.has(target.entity, Position)) { message('Not usable.'); return; }   // on the ground (LOCXYZ)
  const tf = objlist?.actors?.[5]?.talkFlags || 0;
  if (!((tf >> 5) & 1)) { message("You can't figure out how to use it."); return; }
  if (armOrbCast) armOrbCast();
  else message('Where?');
}

// Re-export so the entry check can be extended for red gates in sub-step e without a
// second import site in main.js.
export { OBJ_RED_GATE, OBJ_MOONSTONE, D_171C, D_174E, D_1780 };

// Install the blue-gate runtime: register the hourly spawn-reconcile + return a sim
// system that re-reconciles whenever the ACTIVE LEVEL changes (entering a dungeon must
// spawn slot 6's z=1 gate immediately, not wait for the next hour). The onHour hook
// must be registered AFTER the moon-phase recompute (main.js order) so anyMoonUp() is
// fresh. The level-watch starts at `null` so its first sim tick always reconciles —
// covering both a fresh load and a restore-into-dungeon (where startRender sets the
// active level after install).
export function installBlueGateSpawn(world) {
  world.getResource(WorldClock).onHour(() => spawnBlueGates(world));
  let lastLevel = null;
  return function blueGateSyncSystem() {
    const level = world.getResource(MapLevel).level;
    if (level !== lastLevel) { lastLevel = level; spawnBlueGates(world); }
  };
}
