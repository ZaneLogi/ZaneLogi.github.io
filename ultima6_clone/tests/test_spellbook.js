// In-memory verification for I-spellbook — the spell ROM data (resources/spells.js),
// the cast registry + no-cursor effects (systems/cast_spell.js: Locate, Mass Awaken,
// Create Food, Heal), and (sub-step c) the targeted/digit casts. Pure logic, no U6 data /
// no rendering. Open tests/test_spellbook.html via the dev server; results log to console.

import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Camera } from '../resources/camera.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, PartyMember, ContainedIn, Container, AIMode } from '../components/components.js';
import { inventoryOf } from '../world_loader.js';
import { AI_SLEEP, AI_SCHEDULE, AI_COMMAND } from '../systems/ai_modes.js';
import {
  SPELL_NAME, REAGENTS_NEEDED, reagentParts, reagentsFor, circleOf, namedSpellsByCircle,
  reagentMaskFromCarried, IMPLEMENTED, REAGENT, Locate, Mass_Awaken, Create_Food, Heal,
  Telekinesis, Unlock_Magic, Gate_Travel,
} from '../resources/spells.js';
import { castSpell, CAST_REGISTRY } from '../systems/cast_spell.js';
import { maxHP } from '../systems/stat_formulas.js';
import { MoonGates } from '../resources/moon_gates.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// ── data (sub-step a): the ROM tables match source ──────────────────────────────
{
  check('data: SpellName has 128 slots (16/circle)', SPELL_NAME.length === 128);
  check('data: Reagents_needed has 128 slots', REAGENTS_NEEDED.length === 128);
  const byName = {};
  SPELL_NAME.forEach((n, i) => { if (n) byName[n] = i; });
  check('data: spell numbers map (Create Food/Heal/Telekinesis/Unlock/Mass Awaken/Locate/Gate Travel)',
    byName['Create Food'] === 0x00 && byName['Heal'] === 0x06 && byName['Telekinesis'] === 0x15 &&
    byName['Unlock Magic'] === 0x17 && byName['Mass Awaken'] === 0x25 && byName['Locate'] === 0x35 &&
    byName['Gate Travel'] === 0x64);
  check('data: 80 named spells across 8 circles', namedSpellsByCircle().reduce((s, g) => s + g.entries.length, 0) === 80 && namedSpellsByCircle().length === 8);
  check('data: circleOf — 0x00→1, 0x15→2, 0x64→7, 0x79→8', circleOf(0x00) === 1 && circleOf(0x15) === 2 && circleOf(0x64) === 7 && circleOf(0x79) === 8);
  // reagent display order (descending bit value) matches the source help text
  const abbr = (n) => reagentParts(reagentsFor(n)).map((p) => p.abbr).join(' ');
  check('data: reagent order Create Food = "GS GA MR"', abbr(0x00) === 'GS GA MR');
  check('data: reagent order Telekinesis = "BM BP MR"', abbr(0x15) === 'BM BP MR');
  check('data: reagent order Gate Travel = "SA BP MR"', abbr(0x64) === 'SA BP MR');
  check('data: Help (0x07) + Armageddon (0x70) have no reagents', reagentsFor(0x07) === 0 && reagentsFor(0x70) === 0);
  check('data: IMPLEMENTED = the 7 wired spells', IMPLEMENTED.size === 7 &&
    [Create_Food, Heal, Telekinesis, Unlock_Magic, Mass_Awaken, Locate, Gate_Travel].every((n) => IMPLEMENTED.has(n)));
  // reagent have-mask from carried obj numbers (ReagType: MR=0x045, SA=0x048)
  check('data: reagentMaskFromCarried(MR+SA) = bits 0 and 7', reagentMaskFromCarried([0x045, 0x048]) === (REAGENT.MR | REAGENT.SA));
  check('data: reagentMaskFromCarried(none)', reagentMaskFromCarried([]) === 0);
}

// ── world builder for the cast effects ───────────────────────────────────────────
function buildWorld({ camX = 0, camY = 0, level = 0 } = {}) {
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor)
    .registerComponent(PartyMember).registerComponent(ContainedIn).registerComponent(Container)
    .registerComponent(AIMode);
  world.setResource(new SpatialIndex(256));
  world.setResource(new MapLevel(null, level));
  const reg = new TileRegistry({ baseTile: { tileFor: () => 0 } });
  reg.tileForObject = () => 0;                         // giveToInventory reads this — keep it inert
  world.setResource(reg);
  world.setResource(new Camera(camX, camY));
  return world;
}
function placeAvatar(world, { x = 50, y = 50, z = 0 } = {}) {
  const e = world.create();
  world.add(e, Position, { x, y, z });
  world.add(e, ObjType, { objNumber: 0x141, frame: 0 });
  world.add(e, Actor, { npcId: 0 });
  world.add(e, PartyMember, { slotIndex: 0 });
  world.add(e, AIMode, { mode: AI_COMMAND });
  return world.handleOf(world.resolve(e));
}
function placeSleeper(world, { x, y, z = 0 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z });
  world.add(e, ObjType, { objNumber: 0x142, frame: 0 });
  world.add(e, Actor, { npcId: 1 });
  world.add(e, AIMode, { mode: AI_SLEEP });
  return world.handleOf(world.resolve(e));
}
function ctxFor(world, avatar, extra = {}) {
  const msgs = [];
  return { ctx: { message: (m) => msgs.push(m), avatarRef: { handle: avatar }, tileSize: 16, ...extra }, msgs };
}

// ── cast registry: exactly the 7 implemented spells ──────────────────────────────
{
  const wired = [Locate, Mass_Awaken, Create_Food, Heal, Telekinesis, Unlock_Magic, Gate_Travel];
  check('registry: all 7 implemented spells wired', wired.every((n) => CAST_REGISTRY.has(n)) && CAST_REGISTRY.size === 7);
}

// ── Locate (C_1944_42AC): sextant from the camera/viewport origin ────────────────
{
  // camX/camY in world pixels; mapX=floor(camX/16). Origin at (0x130*16, 0x168*16) → "0 N, 0 W".
  const world = buildWorld({ camX: 0x130 * 16, camY: 0x168 * 16 });
  const av = placeAvatar(world);
  const { ctx, msgs } = ctxFor(world, av);
  castSpell(world, Locate, ctx);
  check('locate: origin reads "0° N, 0° W"', msgs.some((m) => m === '0° N, 0° W'));

  // 8 tiles south + 16 east of the origin: ns=(368-360)>>3=1 S, ew=(320-304)>>3=2 E.
  const w2 = buildWorld({ camX: 320 * 16, camY: 368 * 16 });
  placeAvatar(w2);
  const { ctx: c2, msgs: m2 } = ctxFor(w2, null);
  castSpell(w2, Locate, c2);
  check('locate: (320,368) reads "1° S, 2° E"', m2.some((m) => m === '1° S, 2° E'));
}

// ── Create Food (C_1944_2B9A): gives OBJ_081 ×rand(1,10) to the active member ─────
{
  const world = buildWorld();
  const av = placeAvatar(world);
  const { ctx, msgs } = ctxFor(world, av);
  castSpell(world, Create_Food, ctx);
  const inv = inventoryOf(world, av);
  check('create food: one food stack (OBJ_081) added to the pack', inv.length === 1 && inv[0].objNumber === 0x081);
  check('create food: quantity in [1,10]', inv[0].quantity >= 1 && inv[0].quantity <= 10);
  check('create food: message reports the count', msgs.some((m) => /^You create \d+ food\.$/.test(m)));
}

// ── Mass Awaken (C_1944_256A): wake sleepers in the avatar's area, level-scoped ───
{
  const world = buildWorld();
  const av = placeAvatar(world, { x: 50, y: 50, z: 0 });
  const near = placeSleeper(world, { x: 52, y: 53, z: 0 });   // Chebyshev 3 ≤ 5 → wakes
  const far = placeSleeper(world, { x: 60, y: 60, z: 0 });    // Chebyshev 10 > 5 → stays
  const other = placeSleeper(world, { x: 51, y: 51, z: 1 });  // different level → stays
  const ai = world.store(AIMode);
  const { ctx, msgs } = ctxFor(world, av);
  castSpell(world, Mass_Awaken, ctx);
  check('mass awaken: near sleeper wakes (AI_SLEEP→AI_SCHEDULE)', ai.mode[world.resolve(near)] === AI_SCHEDULE);
  check('mass awaken: far sleeper stays asleep', ai.mode[world.resolve(far)] === AI_SLEEP);
  check('mass awaken: off-level sleeper stays asleep', ai.mode[world.resolve(other)] === AI_SLEEP);
  check('mass awaken: message on success', msgs.some((m) => /awaken/i.test(m)));

  const w2 = buildWorld();
  placeAvatar(w2);
  const { ctx: c2, msgs: m2 } = ctxFor(w2, null);
  castSpell(w2, Mass_Awaken, c2);
  check('mass awaken: nobody nearby → "Nothing happens."', m2.includes('Nothing happens.'));
}

// ── Heal (C_1944_114D): party-member picker → rand(1,30) HP, clamp to maxHP ───────
{
  const world = buildWorld();
  const av = placeAvatar(world);
  const objlist = { actors: [{ hp: 5, level: 3 }, { hp: 0, level: 3 }] };   // [0] hurt, [1] dead
  // heal member 0
  const { ctx, msgs } = ctxFor(world, av, { objlist, pickHealTarget: (cb) => cb(0) });
  castSpell(world, Heal, ctx);
  check('heal: HP rose above 5', objlist.actors[0].hp > 5);
  check('heal: HP clamped to maxHP(3)=90', objlist.actors[0].hp <= maxHP(3));
  check('heal: success message', msgs.some((m) => /wounds close/i.test(m)));
  // heal a dead member → fizzle, HP unchanged
  const { ctx: c2, msgs: m2 } = ctxFor(world, av, { objlist, pickHealTarget: (cb) => cb(1) });
  castSpell(world, Heal, c2);
  check('heal: dead member fizzles (HP stays 0)', objlist.actors[1].hp === 0 && m2.some((m) => /beyond/i.test(m)));
}

// ── targeted casts (sub-step c): Telekinesis / Unlock Magic arm the map cursor ───
// (The per-cell effect — lever/crank trigger, push, magic-lock frame flip — lives in
// command_dispatch.runSpellTarget and is exercised live; here we assert the delegation.)
{
  const world = buildWorld();
  const av = placeAvatar(world);
  let armed = null;
  const { ctx } = ctxFor(world, av, { armSpellCursor: (n) => { armed = n; } });
  castSpell(world, Telekinesis, ctx);
  check('telekinesis: arms the map cursor with SPELL_15', armed === Telekinesis);
  castSpell(world, Unlock_Magic, ctx);
  check('unlock magic: arms the map cursor with SPELL_17', armed === Unlock_Magic);

  // No cursor available (e.g. cast outside the map context) → fizzle, no throw.
  const { ctx: c2, msgs: m2 } = ctxFor(world, av);   // no armSpellCursor in ctx
  castSpell(world, Telekinesis, c2);
  check('telekinesis: no cursor → fizzle', m2.includes('Nothing happens.'));
}

// ── Gate Travel (sub-step c): phase prompt → travel gated on a buried endpoint ────
{
  const world = buildWorld();
  const av = placeAvatar(world);
  world.setResource(new MoonGates());
  world.getResource(MoonGates).D_2C74[3] = [0, 0, 0];   // phase 4 unburied
  let phaseCb = null;
  const { ctx, msgs } = ctxFor(world, av, { promptPhase: (cb) => { phaseCb = cb; }, recenter: () => {}, moveFollowers: () => {} });
  castSpell(world, Gate_Travel, ctx);
  check('gate travel: opens the phase prompt', typeof phaseCb === 'function');
  phaseCb(4);                                            // choose the unburied phase
  check('gate travel: unburied phase → fizzle (no travel)', msgs.includes('Nothing happens.'));

  // no promptPhase in ctx → fizzle, no throw
  const { ctx: c2, msgs: m2 } = ctxFor(world, av);
  castSpell(world, Gate_Travel, c2);
  check('gate travel: no phase prompt → fizzle', m2.includes('Nothing happens.'));
}

// ── unimplemented spells fizzle ──────────────────────────────────────────────────
{
  const world = buildWorld();
  placeAvatar(world);
  const { ctx, msgs } = ctxFor(world, null);
  castSpell(world, 0x22, ctx);            // Fireball — not implemented
  check('fizzle: Fireball → "Nothing happens."', msgs.includes('Nothing happens.'));
}

// ── report ──
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-spellbook: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-spellbook: ${summary}</h2>` +
      results.map((r) => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__SPELLBOOK_RESULT__ = { pass, fail, results };
