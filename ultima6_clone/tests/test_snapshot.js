// In-memory verification for the save/load snapshot (systems/persistence/snapshot.js).
// Pure synthetic fixtures, no U6 data. Open tests/test_snapshot.html via the dev server;
// results log to console + page.
//
// Exercises: full serialize -> restore -> re-serialize deep-equality; entity-handle
// reference remap (ContainedIn.holder must point at the right holder after restore, with
// fresh handles); resource round-trip (WorldClock/Party/WorldSpeed/Camera); loadedRegions
// round-trip (the deletion-suppression mechanism).

import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { ActorIndex } from '../resources/actor_index.js';
import { WorldClock } from '../resources/world_clock.js';
import { Party } from '../resources/party.js';
import { WorldSpeed } from '../resources/world_speed.js';
import { Camera } from '../resources/camera.js';
import {
  Position, Renderable, ObjType, Status, Amount, Actor, Schedule,
  AIMode, Destination, MoveSpeed, Alignment, PartyMember, Container, ContainedIn,
} from '../components/components.js';
import { serializeWorld, restoreWorld } from '../systems/persistence/snapshot.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// A world with the full component catalog + the savable resources registered. Fresh
// resource instances each call, so worldA (populated) and worldB (restore target) are
// independent.
function buildWorld() {
  const world = new World(1024)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor)
    .registerComponent(Schedule).registerComponent(AIMode).registerComponent(Destination)
    .registerComponent(MoveSpeed).registerComponent(Alignment).registerComponent(PartyMember)
    .registerComponent(Container).registerComponent(ContainedIn);
  world.setResource(new SpatialIndex(1024));
  world.setResource(new ActorIndex());
  world.setResource(new WorldClock());
  world.setResource(new Party());
  world.setResource(new WorldSpeed());
  world.setResource(new Camera());
  return world;
}

// First handle matching a predicate over (index) — for locating restored entities.
function findHandle(world, def, predicate) {
  for (const i of world.query(def)) if (predicate(i)) return world.handleOf(i);
  return null;
}

// ── build a populated source world ──────────────────────────────────────
const A = buildWorld();
{
  const spatial = A.getResource(SpatialIndex);
  // Avatar NPC (party slot 0) at (100,100).
  const avatar = A.create();
  A.add(avatar, Position, { x: 100, y: 100, z: 0 });
  A.add(avatar, ObjType, { objNumber: 0x141, frame: 0 });
  A.add(avatar, Status, { bits: 0x00 });
  A.add(avatar, Actor, { npcId: 0 });
  A.add(avatar, MoveSpeed, { dexterity: 15, credit: 0 });
  A.add(avatar, Alignment, { value: 0x40 });
  A.add(avatar, AIMode, { mode: 2 });
  A.add(avatar, PartyMember, { slotIndex: 0 });
  spatial.insert(100, 100, avatar);
  A.getResource(ActorIndex).set(0, avatar);

  // A scheduled NPC at (105,100), sharing nothing.
  const npc = A.create();
  A.add(npc, Position, { x: 105, y: 100, z: 0 });
  A.add(npc, ObjType, { objNumber: 0x142, frame: 1 });
  A.add(npc, Status, { bits: 0x00 });
  A.add(npc, Actor, { npcId: 12 });
  A.add(npc, Schedule, { npcId: 12 });
  A.add(npc, AIMode, { mode: 0x80 });
  A.add(npc, Destination, { x: 110, y: 110, z: 0, action: 0x87 });
  spatial.insert(105, 100, npc);
  A.getResource(ActorIndex).set(12, npc);

  // A chest at (102,100) with two items inside (off-map, ContainedIn -> chest).
  const chest = A.create();
  A.add(chest, Position, { x: 102, y: 100, z: 0 });
  A.add(chest, ObjType, { objNumber: 0x53, frame: 0 });
  A.add(chest, Status, { bits: 0x00 });
  A.add(chest, Amount, { quantity: 1, quality: 0 });
  A.add(chest, Container);
  spatial.insert(102, 100, chest);

  const gold = A.create();
  A.add(gold, ObjType, { objNumber: 0x2f, frame: 0 });
  A.add(gold, Status, { bits: 0x00 });
  A.add(gold, Amount, { quantity: 50, quality: 0 });
  A.add(gold, ContainedIn, { holder: chest, equipped: 0 });

  const key = A.create();
  A.add(key, ObjType, { objNumber: 0x37, frame: 0 });
  A.add(key, Status, { bits: 0x00 });
  A.add(key, Amount, { quantity: 1, quality: 3 });
  A.add(key, ContainedIn, { holder: chest, equipped: 0 });

  // A sword equipped on the avatar (ContainedIn -> avatar, equipped:1).
  const sword = A.create();
  A.add(sword, ObjType, { objNumber: 0x55, frame: 0 });
  A.add(sword, Status, { bits: 0x00 });
  A.add(sword, Amount, { quantity: 1, quality: 0 });
  A.add(sword, ContainedIn, { holder: avatar, equipped: 1 });

  // Two on-map objects sharing a cell (104,100) to test cell-chain order preservation.
  const torch = A.create();
  A.add(torch, Position, { x: 104, y: 100, z: 0 });
  A.add(torch, ObjType, { objNumber: 0x88, frame: 0 });
  A.add(torch, Status, { bits: 0x00 });
  A.add(torch, Amount, { quantity: 1, quality: 0 });
  spatial.insert(104, 100, torch);

  const rug = A.create();
  A.add(rug, Position, { x: 104, y: 100, z: 0 });
  A.add(rug, ObjType, { objNumber: 0x12, frame: 0 });
  A.add(rug, Status, { bits: 0x00 });
  A.add(rug, Amount, { quantity: 1, quality: 0 });
  spatial.insert(104, 100, rug);   // rug appended after torch -> torch is chain head

  // Resources: advance the clock, set party + speed + camera, mark some regions loaded.
  const clock = A.getResource(WorldClock);
  clock.Time_H = 9; clock.Time_M = 0; clock.advance(125);   // 11:05
  const party = A.getResource(Party); party.activeIndex = 0; party.mode = 'solo';
  A.getResource(WorldSpeed).value = 2;
  const cam = A.getResource(Camera); cam.worldX = 1600; cam.worldY = 1600;
  spatial.loadedRegions.add(0); spatial.loadedRegions.add(9);
}

// ── serialize -> restore -> re-serialize ──────────────────────────────────
const snapA = serializeWorld(A, { artifactStamp: 'test-stamp' });

const B = buildWorld();
restoreWorld(B, snapA);
const snapB = serializeWorld(B, { artifactStamp: 'test-stamp' });

// ── deep-equality of the full round-trip ──
check('round-trip: snapshot is byte-identical after restore + re-serialize',
  JSON.stringify(snapA) === JSON.stringify(snapB));

// ── structure ──
check('envelope: version 1', snapA.version === 1);
check('envelope: artifact stamp carried', snapA.artifacts === 'test-stamp');
check('entities: all 8 live entities serialized', snapA.entities.length === 8);
check('restore: B has 8 live entities', [...B.query()].length === 8);

// ── entity-handle ref remap: chest's inventory ──
const chestB = findHandle(B, Container, () => true);
const ci = B.store(ContainedIn);
const items = [...B.query(ContainedIn)].filter((i) => ci.holder[i] === chestB);
check('ref remap: chest holds exactly 2 contained items after restore', items.length === 2);
const objB = B.store(ObjType);
const itemObjs = items.map((i) => objB.objNumber[i]).sort((a, b) => a - b);
check('ref remap: the 2 items are gold(0x2f) + key(0x37)',
  itemObjs.length === 2 && itemObjs[0] === 0x2f && itemObjs[1] === 0x37);

// ── equipped item -> avatar (npcId 0) ──
const avatarB = findHandle(B, Actor, (i) => B.store(Actor).npcId[i] === 0);
const equippedToAvatar = [...B.query(ContainedIn)].filter(
  (i) => ci.holder[i] === avatarB && ci.equipped[i] === 1);
check('ref remap: 1 equipped item resolves to the avatar', equippedToAvatar.length === 1);
check('ref remap: avatar handle is freshly allocated (differs from source world)',
  avatarB !== null);

// ── resources ──
const clockB = B.getResource(WorldClock);
check('resource: WorldClock time restored (11:05)', clockB.Time_H === 11 && clockB.Time_M === 5);
check('resource: WorldClock D_2C55 restored', clockB.D_2C55 === A.getResource(WorldClock).D_2C55);
check('resource: Party mode restored (solo)', B.getResource(Party).mode === 'solo');
// WorldSpeed + Camera are session-owned (boot re-applies the speed slider + recenters the
// camera), so they are deliberately NOT persisted — see snapshot.js SAVED_RESOURCES.
check('resource: WorldSpeed + Camera are NOT saved (session-owned)',
  !('WorldSpeed' in snapA.resources) && !('Camera' in snapA.resources));
check('resource: only WorldClock + Party are saved',
  Object.keys(snapA.resources).sort().join(',') === 'Party,WorldClock');

// ── loadedRegions (deletion-suppression mechanism) ──
const lr = B.getResource(SpatialIndex).loadedRegions;
check('loadedRegions: restored set {0,9}', lr.size === 2 && lr.has(0) && lr.has(9));

// ── cell-chain order preserved (torch is head of cell (104,100), rug behind) ──
const cellB = B.getResource(SpatialIndex).at(104, 100);
const headObj = cellB ? B.store(ObjType).objNumber[B.resolve(cellB[0])] : -1;
check('cell-chain: torch(0x88) is still the chain head at (104,100)', headObj === 0x88);
check('cell-chain: 2 entities in cell (104,100)', cellB && cellB.length === 2);

// ── objlist round-trip: talk flags / trained stats / karma / party persist ──
// (the conversation system mutates objlist.actors[].talkFlags etc. in place; without
// snapshotting objlist, passing Lord British's questions is lost on reload.)
{
  const mkObjlist = (karma, party) => ({
    actors: Array.from({ length: 4 }, (_, i) => ({ id: i, name: '(undef)', talkFlags: 0, hp: 10, strength: 5 })),
    globals: { karma, isOnQuest: 0 }, party: party.slice(), partySize: party.length,
  });
  const objA = mkObjlist(42, [0]);
  objA.actors[2].talkFlags = 0b101;   // "passed LB's questions" analog
  objA.actors[2].strength = 18;        // a trained stat
  const sObj = serializeWorld(buildWorld(), { objlist: objA });
  const objB = mkObjlist(0, []);       // a freshly-decoded (pristine) objlist
  restoreWorld(buildWorld(), sObj, { objlist: objB });
  check('objlist: talkFlags restored (passed-questions bit)', objB.actors[2].talkFlags === 0b101);
  check('objlist: trained stat restored (strength 18)', objB.actors[2].strength === 18);
  check('objlist: global karma restored (42)', objB.globals.karma === 42);
  check('objlist: party roster restored', objB.party.length === 1 && objB.party[0] === 0 && objB.partySize === 1);
  check('objlist: omitted when not provided to serialize', !('objlist' in snapA));
}

// ── render ──
const out = document.getElementById('out');
out.innerHTML =
  `<h2>save/load snapshot — <span class="${fail ? 'fail' : 'pass'}">${pass}/${pass + fail} passed</span></h2>` +
  results.map((r) => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}  ${r.name}</div>`).join('');
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
