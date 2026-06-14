// The U6 egg creature-spawn subsystem (OBJ_14F). Source module: seg_2E2D.c.
//
// I-egg sub-step a — DATA + DECODE (pure read, no hatching). Turns an egg entity + its
// I-6-contained embryos into a structured spawn template: the egg's Qual/Quan decode
// (time gate / alignment override / hatch chance) and each embryo's Qual/Quan/status
// decode (count / AI mode / mutant). The hatch trigger, monster gen, cull/re-arm and
// pacification land in later sub-steps (b / c / d-visual / e / f).
//
// See docs/research_egg.md §1 (data model), §7 (throne worked example), §10 (build shape).

import { ObjType, Position, Amount, Status, ContainedIn, AIMode, Alignment, MoveSpeed, Destination, Spawned, PartyMember } from '../components/components.js';
import { addMapObject, setObjectFrame, deleteMapObject } from '../world_loader.js';
import { canStandAt } from './passability.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Viewport } from '../resources/viewport.js';
import { WorldClock } from '../resources/world_clock.js';
import { AI_MOTIONLESS, AI_GRAZE, isActiveWorktype } from './ai_modes.js';
import { REF_DEX } from './move_economy.js';
import { randInt } from './npc_behaviors.js';

// --- object + status constants ------------------------------------------------

export const OBJ_EGG = 0x14F;              // 335 — the spawner (obj.h / seg_2E2D.c). Render-skipped, LOOK-able.

// Creature/object boundary used by EGG_hatches (seg_2E2D.c:266): an embryo object type
// < OBJ_156 (and != OBJ_062) is a "simple" spawn (AddMapObj, no stats/AI, lands in the
// stat-less ≥256 range); >= OBJ_156 (or == OBJ_062) is a full monster (EGG_generate, AI +
// alignment stamped). The clone has no stat-array split, so we mirror the branch by
// stamping AI/alignment + the Spawned cull tag only on full monsters.
export const OBJ_156 = 0x156, OBJ_062 = 0x062;
export const OBJ_16A = 0x16A, OBJ_16B = 0x16B;   // winged gargoyle / gargoyle (both base-EVIL)
export const OBJ_19D = 0x19D, OBJ_16D = 0x16D;   // silver serpent / tangle vine (multi-tile — bodies in d-visual)
export const OBJ_19B = 0x19B, OBJ_176 = 0x176;   // dragon / hydra (multi-tile, built in EGG_generate)
export const OBJ_1A8 = 0x1A8, OBJ_1A9 = 0x1A9, OBJ_1AA = 0x1AA, OBJ_16E = 0x16E;   // 1A8 winged-garg variant · 1A9 hydra head · ≥1AA two-part · 16E vine tentacle
export const OBJ_AMULET_SUBMISSION = 0x04C;   // Amulet of Submission (obj.h:179) — pacifies gargoyles
export const SHAMINO_SLOT = 3;                 // SHAMINO_COMMENT keys on Party[3] (u6.h:283)

// ObjStatus bits in play for eggs/embryos (u6.h:76-83). Bit 0x40 is overloaded
// CURSED/MUTANT/HATCHED, disambiguated by object type (faithful — see the clone's obj.js
// note + research_egg.md §1): on an EGG it reads as HATCHED, on an EMBRYO (a creature
// template) as MUTANT. A hatched egg ends up HATCHED|LOCAL|INVISIBLE = 0x62.
export const ST_OWNED     = 0x01;
export const ST_INVISIBLE = 0x02;
export const ST_LOCAL     = 0x20;
export const ST_HATCHED   = 0x40;          // egg: latched (already hatched this arming)
export const ST_MUTANT    = 0x40;          // embryo: two-headed variant (EGG_generate typParam |= 0x8000)

// Alignment codes — bits 0x60 of NPCStatus (u6.h:115-121); matches components.js Alignment.
export const ALIGN_NEUTRAL = 0x00, ALIGN_EVIL = 0x20, ALIGN_GOOD = 0x40, ALIGN_CHAOTIC = 0x60;

// Time gates — EGG_hatches Qual/10 (seg_2E2D.c:216-224).
export const TIME_ANYTIME = 0, TIME_DAY = 1, TIME_NIGHT = 2;

// --- pure decode --------------------------------------------------------------

// Decode an egg's Qual/Quan into its spawn parameters (EGG_hatches, seg_2E2D.c:216-245):
//   Qual / 10  -> time gate: 0 anytime · 1 DAY (06:00-18:00) · 2 NIGHT (19:00-05:00)
//   Qual % 10  -> alignment override ((d-1)<<5), APPLIED ONLY when d != 0 (else keep the
//                 monster's class-default alignment) — d=1 is an explicit NEUTRAL override,
//                 distinct from "no override" (alignmentOverride === null).
//   Quan       -> percent hatch chance (OSI_rand(1,100) <= Quan); == 100 => use embryo counts
//                 exactly, < 100 => each embryo count is reduced to OSI_rand(1, count).
export function decodeEgg(qual, quan) {
  const d = qual % 10;
  return {
    qual, quan,
    timeGate: Math.floor(qual / 10),
    alignmentOverride: d !== 0 ? (((d - 1) << 5) & 0x60) : null,
    hatchChance: quan,
    exactCounts: quan === 100,
  };
}

// Decode an embryo into its spawn template (EGG_hatches:249-350):
//   objNumber -> the monster OBJ_xxx to spawn
//   Quan      -> number of monsters to spawn (:256)
//   Qual      -> the combat AI mode stamped on each spawn (NPCMode/NPCComMode, :335) — carried
//                RAW, never gated on whether a handler exists yet (research_egg.md §9.1 pt 5).
//   MUTANT    -> status bit 0x40 set => two-headed variant (:253-254).
export function decodeEmbryo(objNumber, qual, quan, status) {
  return {
    objNumber,
    count: quan,
    aiMode: qual,
    mutant: (status & ST_MUTANT) !== 0,
  };
}

// --- world read path (rides I-6 containment) ----------------------------------

// Is this on-map entity an egg (OBJ_14F)?
export function isEgg(world, handle) {
  const i = world.resolve(handle);
  return i !== -1 && world.store(ObjType).objNumber[i] === OBJ_EGG;
}

// Read a live egg entity + its contained embryos into a decoded template. The embryos are
// the egg's I-6 Container contents (CONTAINED, off-map). Pure read — no mutation, no hatch
// logic, no day/night or proximity gating (those live in the hatch trigger, sub-steps b/c).
// Returns null if `eggHandle` isn't a live egg.
//
// Shape: { qual, quan, timeGate, alignmentOverride, hatchChance, exactCounts,
//          status, local, hatched, invisible, embryos: [{objNumber, count, aiMode, mutant}, …] }
export function readEgg(world, eggHandle) {
  const ei = world.resolve(eggHandle);
  if (ei === -1) return null;
  const obj = world.store(ObjType), amt = world.store(Amount), st = world.store(Status);
  if (obj.objNumber[ei] !== OBJ_EGG) return null;

  const egg = decodeEgg(amt.quality[ei], amt.quantity[ei]);
  egg.status = st.bits[ei];
  egg.local = (egg.status & ST_LOCAL) !== 0;
  egg.hatched = (egg.status & ST_HATCHED) !== 0;
  egg.invisible = (egg.status & ST_INVISIBLE) !== 0;

  // Embryos: linear scan of CONTAINED items whose holder is this egg (the inventoryOf shape,
  // but we need each embryo's Status byte for the MUTANT bit, which inventoryOf doesn't carry).
  const cin = world.store(ContainedIn);
  const embryos = [];
  for (const id of world.query(ObjType, ContainedIn)) {
    if (cin.holder[id] !== eggHandle) continue;
    embryos.push(decodeEmbryo(obj.objNumber[id], amt.quality[id], amt.quantity[id], st.bits[id]));
  }
  egg.embryos = embryos;
  return egg;
}

// Every loaded egg as a handle, optionally restricted to a level z. A thin query over
// query(ObjType, Position) by OBJ_EGG; the avatar-keyed hatch trigger (sub-step c) will
// area-bound this to the avatar's active window (research_egg.md §2 / §9.1).
export function findEggs(world, { z } = {}) {
  const obj = world.store(ObjType), pos = world.store(Position);
  const out = [];
  for (const id of world.query(ObjType, Position)) {
    if (obj.objNumber[id] !== OBJ_EGG) continue;
    if (z !== undefined && pos.z[id] !== z) continue;
    out.push(world.handleOf(id));
  }
  return out;
}

// --- hatch core (sub-step b — EGG_hatches minus the monster-gen stat roll) -----

// Spawn one full-monster creature at (x,y,z) with a stamped AI mode + alignment — the clone's
// stand-in for source's EGG_generate→AddMonster (b's PLACEHOLDER: no stat roll / no loot; the
// EGG_generate D_3522 roll is d-stats, deferred — research_egg.md §4/§10). Tags it Spawned (the
// cull key + occupancy, components.js). Gives it MoveSpeed (placeholder REF_DEX until d-stats
// rolls the real DEXTE) + Destination (its spawn cell — the LOITER/GUARD anchor; WANDER/GRAZE
// and idle modes ignore it) so ANY AI mode — including one whose handler lands later — paces
// + ticks without a retrofit (§9.1 pt 5). status = LOCAL|OWNED, matching source AddMonster
// (seg_1184.c:689-720). Returns the new handle.
export function spawnCreature(world, { objNumber, x, y, z, aiMode, alignment }) {
  const h = addMapObject(world, { objNumber, frame: 0, x, y, z, status: ST_LOCAL | ST_OWNED, quantity: 1, quality: 0 });
  world.add(h, AIMode, { mode: aiMode });
  world.add(h, Alignment, { value: alignment });
  world.add(h, MoveSpeed, { dexterity: REF_DEX, credit: 0 });
  world.add(h, Destination, { x, y, z, action: 0 });
  world.add(h, Spawned, { body: 0 });   // body=0 = standalone creature; d-visual links parts to a head
  return h;
}

// Scatter a non-firstborn spawn to a free cell in source's ±3 box (COMBAT_TryTeleport,
// seg_2337.c — research_egg.md §11). Rejects impassable/occupied cells (canStandAt, which now
// also rejects already-placed Spawned creatures so a pack doesn't stack), and — when
// `onScreenNotOk` — cells the player can see (`isOnScreen`, supplied by the trigger in
// sub-step c; defaults to "nothing is on screen" so b is testable standalone). Returns {x,y}
// or null (source DeleteObj's an unplaceable spawn). 40 random tries ≈ source's bounded retry.
export function scatterCell(world, ex, ey, ez, { rand = randInt, onScreenNotOk = false, isOnScreen = () => false } = {}) {
  for (let tries = 0; tries < 40; tries++) {
    const x = ex + rand(-3, 3), y = ey + rand(-3, 3);
    if (onScreenNotOk && isOnScreen(x, y)) continue;
    if (canStandAt(world, x, y, {})) return { x, y };
  }
  return null;
}

// Hatch one egg — the EGG_hatches port (C_2E2D_0760, seg_2E2D.c:203-365) MINUS the monster-gen
// stat roll (d-stats) and the multi-tile body assembly (d-visual). Order of operations matches
// source: Armageddon → day/night gates (early return, no latch) → re-hatch gate → hatch roll →
// embryo loop (firstborn on the egg cell, the rest scattered) → unconditional SetHatched+SetInvisible.
//
// opts:
//   rand(a,b)        injectable RNG (tests drive the OSI_rand calls deterministically)
//   forceHatch       ForceHatching — the teleport/PartyEnter path force-hatches regardless of
//                    distance (sub-step c wires this onto teleportParty); affects onScreenNotOk only here
//   forceGarglGraze  the f party/amulet scan result — gargoyle embryos hatch AI_GRAZE when true
//   armageddon       IsArmageddon (clone has no Armageddon spell yet → defaults false)
//   isOnScreen(x,y)  the scatter's player-visibility test (sub-step c supplies the real one)
//   timeH            current hour, only if no WorldClock resource is present (tests)
//
// Returns { rolled, latched, alreadyHatched, reason, spawns: [handles] } for testability/bookkeeping.
export function hatchEgg(world, eggHandle, opts = {}) {
  const ei = world.resolve(eggHandle);
  if (ei === -1) return { rolled: false, latched: false, reason: 'stale', spawns: [] };
  const obj = world.store(ObjType), amt = world.store(Amount), st = world.store(Status), pos = world.store(Position);
  if (obj.objNumber[ei] !== OBJ_EGG) return { rolled: false, latched: false, reason: 'not-egg', spawns: [] };

  const { rand = randInt, forceHatch = false, forceGarglGraze = false, armageddon = false, isOnScreen = () => false } = opts;
  const clock = world.getResource(WorldClock);
  const timeH = clock ? clock.Time_H : (opts.timeH ?? 12);

  // 1. Armageddon gate (seg_2E2D.c:213) — nothing hatches after the world-wipe spell.
  if (armageddon) return { rolled: false, latched: false, reason: 'armageddon', spawns: [] };

  const eggX = pos.x[ei], eggY = pos.y[ei], eggZ = pos.z[ei];
  const eggQual = amt.quality[ei], eggQuan = amt.quantity[ei];
  const local = (st.bits[ei] & ST_LOCAL) !== 0;
  const timeGate = Math.floor(eggQual / 10);

  // 2/3. Day/night gates (seg_2E2D.c:216-224). These RETURN before the latch, so an egg
  // out of its window neither hatches NOR sets HATCHED — it stays armed for its window.
  if (timeGate === TIME_DAY && !(timeH >= 6 && timeH <= 18)) return { rolled: false, latched: false, reason: 'not-day', spawns: [] };
  if (timeGate === TIME_NIGHT && (timeH > 5 && timeH < 19)) return { rolled: false, latched: false, reason: 'not-night', spawns: [] };

  // onScreenNotOk (seg_2E2D.c:226-229): a LOCAL egg lets monsters spawn on-screen (the throne
  // ambush); else a force-hatch (teleport) allows it, a normal walk-in keeps them off-screen.
  const onScreenNotOk = local ? false : !forceHatch;
  const alignOverride = (((eggQual % 10) - 1) << 5) & 0x60;   // valid only when (eggQual%10) != 0
  const spawns = [];
  const alreadyHatched = (st.bits[ei] & ST_HATCHED) !== 0;
  let rolled = false;
  let atkplr = false;   // did an attack-the-player monster (EVIL/CHAOTIC) hatch from this non-LOCAL egg? (Shamino warning, f)

  // 4. Re-hatch gate (seg_2E2D.c:241) — the spawn body runs once per arming.
  if (!alreadyHatched) {
    // 5. Hatch roll (seg_2E2D.c:245): OSI_rand(1,100) <= Quan.
    rolled = rand(1, 100) <= eggQuan;
    if (rolled) {
      // isFirstBorn is set ONCE per egg (seg_2E2D.c:247, BEFORE the embryo loop) — only the very
      // first monster of the first embryo stays on the egg cell; every later spawn (rest of this
      // embryo AND all of any further embryos) scatters. (Was per-embryo here → a 2nd embryo's
      // first monster wrongly stacked on the egg cell; caught live on the dragon+drake egg.)
      let isFirstBorn = true;
      // 6. Embryo loop (seg_2E2D.c:249-350).
      for (const em of readEgg(world, eggHandle).embryos) {
        let count = em.count;
        if (eggQuan !== 100) count = rand(1, count);          // <100% → each count randomized (:257-258)
        if (em.objNumber === OBJ_19D) count = 1;              // silver serpent: one body (:259-260)

        const isGargoyle = em.objNumber === OBJ_16A || em.objNumber === OBJ_16B;
        const isFullMonster = em.objNumber >= OBJ_156 || em.objNumber === OBJ_062;
        // npcMod base: gargoyle pacification (f) overrides to GRAZE; else MOTIONLESS until the
        // embryo Qual fills it (:262-263, :334-335). One value per embryo, reused for its pack.
        let npcMod = (isGargoyle && forceGarglGraze) ? AI_GRAZE : AI_MOTIONLESS;
        if (npcMod === AI_MOTIONLESS) npcMod = em.aiMode;

        for (let n = 0; n < count; n++) {
          // Placement (:284-289): firstborn stays on the egg cell; the rest scatter ±3.
          let sx = eggX, sy = eggY;
          if (!isFirstBorn) {
            const cell = scatterCell(world, eggX, eggY, eggZ, { rand, onScreenNotOk, isOnScreen });
            if (cell === null) continue;                      // unplaceable → dropped (source DeleteObj)
            sx = cell.x; sy = cell.y;
          }
          isFirstBorn = false;

          if (isFullMonster) {
            const alignment = (eggQual % 10) !== 0 ? alignOverride : ALIGN_NEUTRAL;   // class default = d-stats (placeholder NEUTRAL)
            const head = spawnCreature(world, { objNumber: em.objNumber, x: sx, y: sy, z: eggZ, aiMode: npcMod, alignment });
            spawns.push(head);
            // Is_ATKPLR (u6.h:122) = alignment & EVIL-bit; a non-LOCAL egg's hostile spawn arms
            // Shamino's warning (seg_2E2D.c:277). NOTE: a Qual%10==0 egg uses the NEUTRAL placeholder
            // (class-default alignment is d-stats-deferred), so a few warnings under-fire until then.
            if ((alignment & ALIGN_EVIL) && !local) atkplr = true;
            // d-visual: assemble the multi-tile body around the head (em.count = raw embryo Quan,
            // the serpent's segment count — unaffected by the count-randomization above).
            if (isMultiTileHead(em.objNumber))
              for (const p of buildMultiTileBody(world, head, em.objNumber, sx, sy, eggZ, em.mutant, em.count)) spawns.push(p);
          } else {
            // Simple spawn (:266-271): a plain map object, no stats/AI (source's si>=0x100 skip).
            // Not Spawned-tagged — it joins the map-object pool, which source's stream-out cull
            // doesn't reap (only the monster pool). Rare for eggs; placed all the same.
            spawns.push(addMapObject(world, { objNumber: em.objNumber, frame: 0, x: sx, y: sy, z: eggZ, quantity: 1, quality: 0, status: 0 }));
          }
        }
      }
    }
  }

  // 8. Latch off (seg_2E2D.c:363-364) — UNCONDITIONAL once past the gates: SetHatched +
  // SetInvisible even on a failed roll (so a <100% egg won't re-roll until re-armed) or an
  // already-hatched egg (no-op). The egg is render-skipped regardless; INVISIBLE is for fidelity.
  st.bits[ei] |= ST_HATCHED | ST_INVISIBLE;
  return { rolled, latched: true, alreadyHatched, reason: 'ok', spawns, atkplr };
}

// --- multi-tile bodies (sub-step d-visual) ------------------------------------
// seg_0903.c DirIncrX/DirIncrY — direction → cell offset (0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW).
const DIR_X = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_Y = [-1, -1, 0, 1, 1, 1, 0, -1];
// Silver serpent (EGG_hatches :291-315): D_28A9 curve frames / D_28AD tail frames / D_28B1,B5 offsets.
const SERP_FRAME = [0xD, 0xA, 0xB, 0xC], SERP_TAIL = [0x1, 0x3, 0x5, 0x7];
const SERP_OX = [0, -1, -1, 0], SERP_OY = [1, 1, 0, 0];

// Does this head object type have a multi-tile body to assemble?
//   winged gargoyle (OBJ_16A/1A8): a single 2x2 footprint-sprite (frame 0x13, a dW+dH tile) —
//     handled as ONE entity, no parts (source EGG_generate :154-155 just SetFrame).
//   two-part (>= OBJ_1AA): body + one east part.   dragon/hydra/serpent/vine: linked parts.
export function isMultiTileHead(objType) {
  return objType === OBJ_16A || objType === OBJ_1A8 || objType >= OBJ_1AA ||
         objType === OBJ_19B || objType === OBJ_176 || objType === OBJ_19D || objType === OBJ_16D;
}

// Create one body PART: a single-cell, stat-less, AI-less map object tagged Spawned{body,ox,oy}
// so it (1) blocks like its creature, (2) culls with the head (e), (3) tracks the head when it
// moves (the part-follow pass). status 0 = non-LOCAL, mirroring source's ClrLocal on parts
// (the clone culls by the Spawned tag + radius, not the LOCAL bit). ox/oy = offset from the head.
function addPart(world, headHandle, objNumber, frame, x, y, z, ox, oy) {
  const h = addMapObject(world, { objNumber, frame, x, y, z, status: 0, quantity: 1, quality: 0 });
  world.add(h, Spawned, { body: headHandle, ox, oy });
  return h;
}

// Assemble a multi-tile creature's body around its already-spawned head at (x,y,z). Sets the
// head's body frame + places the linked part entities (each relative to the head). Mirrors
// EGG_generate :154-189 (dragon/hydra/two-part/winged-gargoyle) + EGG_hatches :291-330
// (silver serpent / tangle vine). `embryoQuan` is the raw embryo Quan (serpent segment count).
// Parts place UNCONDITIONALLY (source AddMapObj's them regardless of terrain — they're geometry,
// not movers). Returns the part handles (for the caller's spawn list + the cull pass).
export function buildMultiTileBody(world, headHandle, objType, x, y, z, isMutant, embryoQuan) {
  const parts = [];
  const hi = world.resolve(headHandle);
  if (hi === -1) return parts;

  // Winged gargoyle / 1A8: a single 2x2 footprint-sprite — just set frame 0x13, no parts
  // (the dW+dH tile renders 2x2 + the I-4 footprint path blocks all 4 cells; it moves atomically).
  if (objType === OBJ_16A || objType === OBJ_1A8) { setObjectFrame(world, headHandle, 0x13); return parts; }

  if (objType >= OBJ_1AA) {
    // Two-part creature: body frame 6 + ONE east part (frame 0xe, or 2 if mutant). :156-163.
    setObjectFrame(world, headHandle, 6);
    parts.push(addPart(world, headHandle, objType, isMutant ? 2 : 0xe, x + 1, y, z, 1, 0));
  } else if (objType === OBJ_19B) {
    // Dragon: body f0 + head(N) + tail(S) + left wing(W) + right wing(E). :164-182.
    setObjectFrame(world, headHandle, 0);
    parts.push(addPart(world, headHandle, OBJ_19B, 0x08, x,     y - 1, z,  0, -1));   // head N
    parts.push(addPart(world, headHandle, OBJ_19B, 0x10, x,     y + 1, z,  0,  1));   // tail S
    parts.push(addPart(world, headHandle, OBJ_19B, 0x18, x - 1, y,     z, -1,  0));   // L wing W
    parts.push(addPart(world, headHandle, OBJ_19B, 0x20, x + 1, y,     z,  1,  0));   // R wing E
  } else if (objType === OBJ_176) {
    // Hydra: body f0 + 8 heads OBJ_1A9 (frames 0..7) around the body. :183-189.
    setObjectFrame(world, headHandle, 0);
    for (let k = 0; k < 8; k++)
      parts.push(addPart(world, headHandle, OBJ_1A9, k, x + DIR_X[k], y + DIR_Y[k], z, DIR_X[k], DIR_Y[k]));
  } else if (objType === OBJ_16D) {
    // Tangle vine: vine f0 + 4 tentacles OBJ_16E at the cardinals (k=0,2,4,6). EGG_hatches :316-330.
    setObjectFrame(world, headHandle, 0);
    for (let k = 0; k < 8; k += 2)
      parts.push(addPart(world, headHandle, OBJ_16E, (k & 2) ? 0 : 1, x + DIR_X[k], y + DIR_Y[k], z, DIR_X[k], DIR_Y[k]));
  } else if (objType === OBJ_19D) {
    // Silver serpent: head f0 + a curl of (embryoQuan+1) segments; the last gets a tail frame.
    // Offsets aren't cumulative (a fixed 2x2 curl), per source. EGG_hatches :291-315.
    setObjectFrame(world, headHandle, 0);
    for (let i = 0; i <= embryoQuan; i++) {
      const m = i & 3;
      const frame = (i === embryoQuan) ? SERP_TAIL[m] : SERP_FRAME[m];
      parts.push(addPart(world, headHandle, OBJ_19D, frame, x + SERP_OX[m], y + SERP_OY[m], z, SERP_OX[m], SERP_OY[m]));
    }
  }
  return parts;
}

// --- avatar-keyed hatch trigger (sub-step c) ----------------------------------

// Wrap-aware Chebyshev on the active level's torus (1024 overworld / 256 dungeon — both
// powers of two, so & (wrap-1) gives the shortest signed span across the seam).
function chebyWrap(ax, ay, bx, by, wrap) {
  const dx = Math.min((ax - bx) & (wrap - 1), (bx - ax) & (wrap - 1));
  const dy = Math.min((ay - by) & (wrap - 1), (by - ay) & (wrap - 1));
  return Math.max(dx, dy);
}

// Walk an item's containment chain to its OUTERMOST holder handle (a party member, for a carried
// item — possibly nested in a bag). Mirrors source's GetAssoc unwind. Bounded for safety.
function outermostHolder(world, handle) {
  const cin = world.store(ContainedIn);
  let h = handle;
  for (let guard = 0; guard < 32; guard++) {
    const i = world.resolve(h);
    if (i === -1 || !world.has(h, ContainedIn)) break;
    h = cin.holder[i];
  }
  return h;
}

// Should gargoyle embryos hatch pacified (AI_GRAZE)? The gargoyle-pacification scan
// (seg_2E2D.c:231-239): true if any party member IS a gargoyle (OBJ_16A/16B) OR the party
// carries the Amulet of Submission (OBJ_04C). This is the in-world plot pacification expressed
// entirely in the spawn layer. Sub-step f.
export function shouldPacifyGargoyles(world) {
  if (!world.isRegistered(PartyMember)) return false;
  const obj = world.store(ObjType);
  const party = new Set();
  for (const i of world.query(PartyMember)) {
    if (obj.objNumber[i] === OBJ_16A || obj.objNumber[i] === OBJ_16B) return true;   // a gargoyle walks with you
    party.add(world.handleOf(i));
  }
  // Amulet of Submission anywhere in the party's inventory (FindInvType(1, OBJ_04C, -1)).
  if (world.isRegistered(ContainedIn))
    for (const i of world.query(ContainedIn, ObjType))
      if (obj.objNumber[i] === OBJ_AMULET_SUBMISSION && party.has(outermostHolder(world, world.handleOf(i)))) return true;
  return false;
}

// Shamino's approach warning (seg_2E2D.c:351-360): the FIRST time an attack-the-player monster
// (EVIL/CHAOTIC alignment, Is_ATKPLR = align & 0x20) hatches from a NON-LOCAL egg, Shamino — if
// he's in the party (slot 3), alive, within 6 tiles (SHAMINO_COMMENT) — calls out the compass
// direction. Gated once per session by `_shaminoWarned` (source's D_17B6) + a 3/4 RNG roll.
let _shaminoWarned = false;
export function resetShaminoWarning() { _shaminoWarned = false; }   // new game / save-load (+ test isolation)

const DIR_NAME = (dx, dy) => ((dy < 0 ? 'north' : dy > 0 ? 'south' : '') + (dx > 0 ? 'east' : dx < 0 ? 'west' : '')) || 'nearby';

// Is Shamino near enough to comment? slot-3 party member, within 6 tiles of (ax,ay).
function shaminoComment(world, ax, ay, wrap) {
  if (!world.isRegistered(PartyMember)) return false;
  const pm = world.store(PartyMember), pos = world.store(Position);
  for (const i of world.query(PartyMember, Position))
    if (pm.slotIndex[i] === SHAMINO_SLOT) return chebyWrap(pos.x[i], pos.y[i], ax, ay, wrap) < 6;
  return false;
}

// EGG_hatchArea analog (C_2E2D_0DFE, seg_2E2D.c:367-385), keyed on the AVATAR (research_egg.md §9.1).
// Scans eggs on the avatar's level within `scanRadius` (the clone's stand-in for source's 40x40
// SearchArea) and hatches each that passes EGG_hatchArea's gate (:381): forceHatch (the teleport /
// PartyEnter path), OR farther than `nearRadius` (off-screen — monsters appear at the edge + walk
// in), OR LOCAL (the on-top-of-you ambush). The camera is deliberately ignored — only the avatar
// triggers hatching, so panning the god-view renders regions without populating them (§9.1 pt 1).
// `nearRadius` is the avatar-centered visible bubble (the I-9h Viewport.nearRadius); `scanRadius`
// is a ring just beyond it. Returns { hatched, spawned }.
export function hatchAroundAvatar(world, ax, ay, az, opts = {}) {
  if (!world.isRegistered(Spawned)) return { hatched: 0, spawned: 0 };   // egg subsystem absent (e.g. minimal test worlds)
  const { rand = randInt, forceHatch = false } = opts;
  const vp = world.getResource(Viewport);
  const nearRadius = opts.nearRadius ?? (vp ? vp.nearRadius : 32);
  const scanRadius = opts.scanRadius ?? (nearRadius + 12);
  const wrap = world.getResource(MapLevel)?.tilesWide ?? 1024;
  const forceGarglGraze = opts.forceGarglGraze ?? shouldPacifyGargoyles(world);
  const pos = world.store(Position), st = world.store(Status);
  const isOnScreen = (x, y) => chebyWrap(x, y, ax, ay, wrap) <= nearRadius;   // scatter's on-screen test (§9.1 pt 3)
  let hatched = 0, spawned = 0;
  let warnX = null, warnY = null;   // first attack-the-player hatch → Shamino's direction call-out (f)
  for (const h of findEggs(world, { z: az })) {
    const i = world.resolve(h);
    const dist = chebyWrap(pos.x[i], pos.y[i], ax, ay, wrap);
    if (dist > scanRadius) continue;                              // outside the avatar's active area
    const local = (st.bits[i] & ST_LOCAL) !== 0;
    if (!(forceHatch || dist > nearRadius || local)) continue;    // EGG_hatchArea gate (:381)
    const ex = pos.x[i], ey = pos.y[i];
    const r = hatchEgg(world, h, { rand, forceHatch, forceGarglGraze, isOnScreen });
    if (r.rolled) hatched++;
    spawned += r.spawns.length;
    if (r.atkplr && warnX === null) { warnX = ex; warnY = ey; }
  }

  // Shamino's warning (seg_2E2D.c:351-360): once per session, if a hostile pack hatched off a
  // non-LOCAL egg and Shamino is near, call out the direction (a 3/4 roll). opts.message is the
  // CON_printf channel (MessageLog); absent in tests. Text is clone-authored — the source string
  // (D_356A_0128) lives in packed message data not decoded here.
  if (warnX !== null && opts.message && !_shaminoWarned && shaminoComment(world, ax, ay, wrap) && rand(0, 3) !== 0) {
    opts.message(`Shamino: "I sense creatures approaching from the ${DIR_NAME(warnX - ax, warnY - ay)}!"`);
    _shaminoWarned = true;
  }
  return { hatched, spawned };
}

// --- cull + re-arm (sub-step e) -----------------------------------------------

// The avatar-keyed lifetime pass — the clone's stand-in for source's area stream-out
// C_1184_19AA (seg_1184.c:795-840), which the no-region-unload clone can't inherit wholesale
// (research_egg.md §6 / §9.1 pt 4). Two jobs, both keyed on distance from the AVATAR:
//   1. CULL spawned creatures (the Spawned-tagged temporaries) that have drifted beyond
//      `cullRadius` — the OUTER ring (cullRadius > scanRadius > nearRadius, the two-radius
//      hysteresis: a hostile born just outside the visible bubble moves inward to attack and is
//      reaped only once the avatar leaves it outside the cull ring). Spawns ONLY — permanent
//      objlist NPCs + party carry no Spawned tag and are never touched. A multi-tile creature's
//      PARTS cull WITH their head; orphaned parts (head already gone) are reaped too.
//   2. For eggs left behind (beyond cullRadius): DELETE a LOCAL egg (one-shot ambush — source
//      DeleteObj) or RE-ARM a non-LOCAL hatched egg (ClrHatched — clears HATCHED so a return
//      re-hatches a fresh pack = U6's wilderness respawn). Only HATCHED is cleared (INVISIBLE
//      lingers, matching source ClrHatched; eggs are render-skipped regardless).
// Returns { culled, rearmed, deletedEggs }.
export function cullAroundAvatar(world, ax, ay, az, opts = {}) {
  if (!world.isRegistered(Spawned)) return { culled: 0, rearmed: 0, deletedEggs: 0 };   // egg subsystem absent (e.g. minimal test worlds)
  const vp = world.getResource(Viewport);
  const nearRadius = opts.nearRadius ?? (vp ? vp.nearRadius : 32);
  const cullRadius = opts.cullRadius ?? (nearRadius + 24);   // outer ring, > scanRadius (near+12)
  const wrap = world.getResource(MapLevel)?.tilesWide ?? 1024;
  const pos = world.store(Position), st = world.store(Status), sp = world.store(Spawned);

  // 1a. Heads/standalone spawns beyond cullRadius + orphaned parts (head gone). Collect handles
  //     first — don't delete while querying.
  const cullSet = new Set();
  for (const i of world.query(Spawned, Position)) {
    if (pos.z[i] !== az) continue;
    const body = sp.body[i];
    if (body) { if (world.resolve(body) === -1) cullSet.add(world.handleOf(i)); continue; }   // orphan part
    if (chebyWrap(pos.x[i], pos.y[i], ax, ay, wrap) > cullRadius) cullSet.add(world.handleOf(i));
  }
  // 1b. Sweep parts whose head is being culled (they cull with the body).
  for (const i of world.query(Spawned, Position)) {
    const body = sp.body[i];
    if (body && cullSet.has(body)) cullSet.add(world.handleOf(i));
  }
  let culled = 0;
  for (const h of cullSet) { deleteMapObject(world, h); culled++; }

  // 2. Eggs beyond the cull ring: delete LOCAL (one-shot) / re-arm non-LOCAL hatched (respawn).
  let rearmed = 0, deletedEggs = 0;
  for (const h of findEggs(world, { z: az })) {
    const i = world.resolve(h);
    if (chebyWrap(pos.x[i], pos.y[i], ax, ay, wrap) <= cullRadius) continue;   // still in the area
    if ((st.bits[i] & ST_LOCAL) !== 0) { deleteMapObject(world, h); deletedEggs++; }
    else if ((st.bits[i] & ST_HATCHED) !== 0) { st.bits[i] &= ~ST_HATCHED; rearmed++; }   // ClrHatched
  }
  return { culled, rearmed, deletedEggs };
}

// Part-follow pass (sim system): keep every multi-tile PART at head.pos + (ox,oy). Idle creatures
// never move so this is a no-op for them; a MOVING head (e.g. a grazing cow) drags its parts here
// the turn after it steps. An orphaned part (head culled/dead) is left for the cull pass (e) to reap.
// Register AFTER the NPC tick so parts track the head's move within the same turn.
export function installEggPartFollowSystem(world) {
  return () => {
    if (!world.isRegistered(Spawned)) return;
    const sp = world.store(Spawned), pos = world.store(Position);
    const spatial = world.getResource(SpatialIndex);
    const wrap = world.getResource(MapLevel)?.tilesWide ?? 1024;
    for (const i of world.query(Spawned, Position)) {
      const body = sp.body[i];
      if (!body) continue;                         // body 0 → a head/standalone, not a part
      const hi = world.resolve(body);
      if (hi === -1) continue;                     // head gone → orphan (cull pass reaps it)
      const tx = ((pos.x[hi] + sp.ox[i]) % wrap + wrap) % wrap;
      const ty = ((pos.y[hi] + sp.oy[i]) % wrap + wrap) % wrap;
      if (pos.x[i] === tx && pos.y[i] === ty) continue;   // already in place
      const h = world.handleOf(i);
      spatial.remove(pos.x[i], pos.y[i], h);
      pos.x[i] = tx; pos.y[i] = ty;
      spatial.insertAtHead(tx, ty, h);
    }
  };
}
