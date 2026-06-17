// systems/cast_spell.js — I-spellbook cast dispatch + effects.
//
// A spell registry keyed by spell number (mirroring the useHandlers registry, command-
// dispatch's USE table). `castSpell` looks up the highlighted spell's effect; an
// unimplemented or empty slot fizzles ("Nothing happens."). The implemented effects route
// into already-ported subsystems — see research_spellbook.md §3/§6.
//
// `ctx` carries the shared pieces from main.js: { message, avatarRef, tileSize, objlist } +
// the UI callbacks for the casts that need them: pickHealTarget (Heal), and — sub-step c —
// armSpellCursor (Telekinesis / Unlock Magic) + promptPhase (Gate Travel). No-target effects
// run immediately; targeted ones hand off to a callback that resolves the target later.

import { Camera } from '../resources/camera.js';
import { MapLevel } from '../resources/map_level.js';
import { Position, AIMode } from '../components/components.js';
import { AI_SLEEP, AI_SCHEDULE } from './ai_modes.js';
import { giveToInventory } from '../world_loader.js';
import { maxHP } from './stat_formulas.js';
import { MoonGates } from '../resources/moon_gates.js';
import { gateTravel } from './moongate_runtime.js';
import { Locate, Mass_Awaken, Create_Food, Heal, Telekinesis, Unlock_Magic, Gate_Travel } from '../resources/spells.js';

const OBJ_FOOD = 0x081;          // Create Food gives OBJ_081 (C_1944_2B9A, seg_1944.c:1717)
const MASS_AWAKEN_RADIUS = 5;    // clone: a tight avatar-centred area (source targets a cell + Explosion AOE)

// rand(lo,hi) inclusive — the OSI_rand analog (Math.random, not a seeded RNG; fine for these).
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// The active member's live tile, or null.
function avatarTile(world, ctx) {
  const h = ctx.avatarRef?.handle;
  const i = h !== undefined ? world.resolve(h) : -1;
  if (i === -1) return null;
  const pos = world.store(Position);
  return { x: pos.x[i], y: pos.y[i], z: pos.z[i] };
}

// --- Locate (C_1944_42AC, SPELL_35) — sextant readout from the VIEWPORT origin -----------
// Source reads MapX/MapY (the map window's top-left tile, NOT the avatar's own tile), with a
// dungeon <<2, then `(origin - 0x168/0x130) >> 3`. The clone's MapX/MapY is the camera's
// top-left tile (its world-pixel origin / tileSize). (After a manual drag-pan the camera
// isn't avatar-centred, so the reading reflects where you're looking — source can't drag-pan,
// so there it's always avatar-centred; ≤1 sextant-unit difference, research_spellbook.md §3.2.)
function castLocate(world, ctx) {
  const cam = world.getResource(Camera);
  const ts = ctx.tileSize || 16;
  let mapX = Math.floor(cam.worldX / ts), mapY = Math.floor(cam.worldY / ts);
  if (world.getResource(MapLevel).level) { mapX <<= 2; mapY <<= 2; }    // dungeon (source's MapZ)
  const ns = (mapY - 0x168) >> 3, ew = (mapX - 0x130) >> 3;
  ctx.message(`${Math.abs(ns)}° ${ns > 0 ? 'S' : 'N'}, ${Math.abs(ew)}° ${ew > 0 ? 'E' : 'W'}`);
}

// --- Mass Awaken (C_1944_256A, SPELL_25) — wake sleepers in range ------------------------
// Source fires a missile to a picked cell, then Explosion()'s each creature in the AOE:
// ClrAsleep + restore the disguised shape. The clone simplifies to a NO-target avatar-centred
// area (research_spellbook.md §3.5): any NPC at AI_SLEEP within MASS_AWAKEN_RADIUS on the
// active level goes back to AI_SCHEDULE (re-engages its routine). Shape-disguise restore is
// moot (the clone has no disguise spell yet).
function castMassAwaken(world, ctx) {
  const a = avatarTile(world, ctx);
  if (!a) { ctx.message('Nothing happens.'); return; }
  const pos = world.store(Position), ai = world.store(AIMode);
  let woke = 0;
  for (const id of world.query(AIMode, Position)) {
    if (ai.mode[id] !== AI_SLEEP || pos.z[id] !== a.z) continue;
    if (Math.max(Math.abs(pos.x[id] - a.x), Math.abs(pos.y[id] - a.y)) > MASS_AWAKEN_RADIUS) continue;
    ai.mode[id] = AI_SCHEDULE;
    woke++;
  }
  ctx.message(woke ? 'Those nearby stir and awaken.' : 'Nothing happens.');
}

// --- Create Food (C_1944_2B9A, SPELL_00) — add food to the active member's pack ----------
function castCreateFood(world, ctx) {
  const holder = ctx.avatarRef?.handle;
  if (holder === undefined) { ctx.message('Nothing happens.'); return; }
  const n = rnd(1, 10);                                          // OSI_rand(1,10)
  giveToInventory(world, holder, { objNumber: OBJ_FOOD, quantity: n });
  ctx.message(`You create ${n} food.`);
}

// --- Heal (C_1944_114D via the SPELL_06 creature block) — restore a party member's HP -----
// Source heals rand(1,30), clamped to MaxHP, and targets any creature at range (a missile
// cursor). The clone targets a PARTY MEMBER via the roster picker (research_spellbook.md §3.4)
// — HP lives on the objlist actor record (stat_formulas.js: the objlist is the canonical
// store), so mutating it updates the ZSTATS/roster readout for free. A dead member fizzles
// (source's IsDead gate).
function castHeal(world, ctx) {
  if (!ctx.pickHealTarget) { ctx.message('Nothing happens.'); return; }
  ctx.pickHealTarget((slot) => {
    const actor = ctx.objlist?.actors?.[slot];
    if (!actor) { ctx.message('Nothing happens.'); return; }
    if ((actor.hp | 0) <= 0) { ctx.message('It is beyond such healing.'); return; }   // IsDead → SpellResult 2
    actor.hp = Math.min((actor.hp | 0) + rnd(1, 30), maxHP(actor.level));
    ctx.message('The wounds close.');
  });
}

// --- Telekinesis / Unlock Magic (SPELL_15 / SPELL_17) — targeted cell casts -------------
// Both resolve at a picked cell, so the effect just CLOSES the book and arms the command-
// dispatch cell cursor (ctx.armSpellCursor → cmd.armSpell); the per-spell effect lives in
// command_dispatch.runSpellTarget (it needs the cursor state machine — Telekinesis's push
// reuses MOVE stage 2). See research_spellbook.md §3.1/§3.7 + the c kept deviation.
const armCursor = (spellNum) => (world, ctx) => {
  if (ctx.armSpellCursor) ctx.armSpellCursor(spellNum);
  else ctx.message('Nothing happens.');
};

// --- Gate Travel (C_1944_305A, SPELL_64) — moon-phase teleport --------------------------
// Source prompts "To phase " (1–8), checks the blue endpoint D_2C74[phase-1] is buried, then
// GateTravel(phase-1). The clone reuses the I-moongate network: a 1–8 digit prompt (ctx.
// promptPhase) → gateTravel (the C_101C_0A3A port) to that endpoint, or fizzle if unburied.
function castGateTravel(world, ctx) {
  if (!ctx.promptPhase) { ctx.message('Nothing happens.'); return; }
  ctx.promptPhase((phase) => {
    const dest = world.getResource(MoonGates).gateDest(phase - 1);
    if (!(dest[0] || dest[1] || dest[2])) { ctx.message('Nothing happens.'); return; }   // unburied slot → no gate
    ctx.message('You step through a moongate...');
    gateTravel(world, phase - 1, ctx);            // ctx carries avatarRef + recenter + moveFollowers (teleportParty)
  });
}

// The cast registry — the 7 implemented spells (every other named spell fizzles).
const REGISTRY = new Map([
  [Locate, castLocate],
  [Mass_Awaken, castMassAwaken],
  [Create_Food, castCreateFood],
  [Heal, castHeal],
  [Telekinesis, armCursor(Telekinesis)],
  [Unlock_Magic, armCursor(Unlock_Magic)],
  [Gate_Travel, castGateTravel],
]);

// Dispatch a cast. Unimplemented / empty-slot spells fizzle, the spellbook's all-fizzle
// default (sub-step a) — so a starred-but-not-yet-registered spell (Telekinesis etc. before
// sub-step c) still fizzles rather than erroring.
export function castSpell(world, spellNum, ctx) {
  const fn = REGISTRY.get(spellNum);
  if (!fn) { ctx.message('Nothing happens.'); return; }
  fn(world, ctx);
}

// Exposed for the test harness (assert the registry covers exactly the no-cursor set this
// sub-step adds; sub-step c extends it).
export { REGISTRY as CAST_REGISTRY };
