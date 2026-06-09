// In-memory verification for I-9a — the pathfinding cost map (computeResistance).
// Pure synthetic fixtures, no U6 data needed. Open tests/test_pathfinding.html via
// the dev server; results log to console + page.
//
// Mirrors __ComputeResistance (seg_1E0F.c:1866-1922): base terrain cost, door
// open/closed/locked + behind-block, pass-through +1, object footprint spread
// (2x2 auto-extension), NPCs-are-not-obstacles, and the wet-tile rescue arm.

import { TileFlags } from '../assets/tile_flags.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Position, Renderable, ObjType, Actor, AIMode, Destination, Schedule, PartyMember, MoveSpeed } from '../components/components.js';
import { computeResistance, findPath, AREA } from '../systems/pathfinding.js';
import { Paths } from '../resources/paths.js';
import { Schedules } from '../resources/schedules.js';
import { WorldClock } from '../resources/world_clock.js';
import { canStandAt } from '../systems/passability.js';
import { npcStep, doOnPath, atDestination } from '../systems/npc_path.js';
import { installNpcTickSystem } from '../systems/npc_tick_system.js';
import { stepCostAt, BASE_COST } from '../systems/move_economy.js';
import { installNpcScheduleSystem } from '../systems/npc_schedule_system.js';
import * as AI from '../systems/ai_modes.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// Build a minimal world: TileRegistry (synthetic flag planes), MapLevel stub
// (terrainAt lookup), SpatialIndex (populated with object/NPC entities).
//   tileFlags[tileId] = { terrain, tile, flag2 } — bytes for the three planes.
//   entities[] = { x, y, obj, frame, tile, actor } — obj = objNumber, tile = tileId.
// `moveSpeed: true` registers MoveSpeed and tags each actor entity with it (I-14b) —
// off by default so the I-9 pathfinding tests keep the old flat one-step-per-tick rate
// (the accumulator is disabled when MoveSpeed isn't registered). Per-entity `dex` sets
// the dexterity (default 15 = the reference walker).
function setupWorld({ terrainAt = {}, tileFlags = {}, entities = [], moveSpeed = false } = {}) {
  const data = new Uint8Array(0x1C00);
  for (const [tile, planes] of Object.entries(tileFlags)) {
    const t = Number(tile);
    if (planes.terrain !== undefined) data[0x0000 + t] = planes.terrain;  // TerrainType
    if (planes.tile    !== undefined) data[0x0800 + t] = planes.tile;     // TileFlag
    if (planes.flag2   !== undefined) data[0x1400 + t] = planes.flag2;    // D_B3EF
  }
  const reg = new TileRegistry({ tiles: null, flags: new TileFlags(data), palette: new Uint8Array(0) });

  const mapLevel = Object.create(MapLevel.prototype);
  mapLevel.tileAt = (x, y) => terrainAt[`${x},${y}`] ?? 0;   // tile 0 = no flags = cost 1

  reg.baseTile = { objToTile: new Uint16Array(0x400) };   // stub: tileId = 0 + frame (I-9c npcStep render update)

  const world = new World(1024)
    .registerComponent(Position)
    .registerComponent(Renderable)
    .registerComponent(ObjType)
    .registerComponent(Actor)
    .registerComponent(AIMode)
    .registerComponent(Destination)
    .registerComponent(PartyMember);                   // step-aside checks world.has(blocker, PartyMember)
  if (moveSpeed) world.registerComponent(MoveSpeed);   // I-14b: enable the DEXTE-paced accumulator

  const spatial = new SpatialIndex(1024);
  world.setResource(reg);
  world.setResource(spatial);
  world.setResource(mapLevel);
  world.setResource(new Paths());

  const handles = [];
  for (const e of entities) {
    const h = world.create();
    world.add(h, Position, { x: e.x, y: e.y, z: 0 });
    world.add(h, ObjType, { objNumber: e.obj ?? 0, frame: e.frame ?? 0 });
    world.add(h, Renderable, { tileId: e.tile ?? 0 });
    if (e.actor) world.add(h, Actor, { npcId: e.npcId ?? 0 });
    if (e.aimode !== undefined) world.add(h, AIMode, { mode: e.aimode });
    if (moveSpeed && e.actor) world.add(h, MoveSpeed, { dexterity: e.dex ?? 15, credit: 0 });
    spatial.insert(e.x, e.y, h);
    handles.push(h);
  }
  return { world, handles };
}

// All fixtures center the work area at (20,20): origin = (20-16)&0x3f8 = 0, so the
// 40x40 window covers world cells (0,0)..(39,39) and area coord == world coord.
const C = 20;
const costAt = (world, x, y) => computeResistance(world, C, C).costAt(x, y);
const IMPASS = 0xff;

// ── work-area origin (seg_1E0F.c:1871-1872) ──
{
  const { world } = setupWorld();
  const r = computeResistance(world, 20, 20);
  check('origin: center (20,20) -> origin (0,0)', r.originX === 0 && r.originY === 0);
  check('area is 40', r.area === AREA && AREA === 40);
  const r2 = computeResistance(world, 300, 367);
  check('origin: (300,367) -> ((c-16)&0x3f8)',
    r2.originX === ((300 - 0x10) & 0x3f8) && r2.originY === ((367 - 0x10) & 0x3f8));
}

// ── base terrain cost: (TerrainType>>4)+1, impassable -> 0xff ──
{
  const { world } = setupWorld({
    terrainAt: { '3,3': 50, '4,4': 11 },
    tileFlags: { 50: { terrain: 0x30 }, 11: { terrain: 0x02 } },  // 50: cost nibble 3; 11: impassable
  });
  check('terrain: empty cell (tile 0) -> cost 1', costAt(world, 1, 1) === 1);
  check('terrain: cost-nibble 3 tile -> cost 4', costAt(world, 3, 3) === 4);
  check('terrain: impassable tile -> 0xff', costAt(world, 4, 4) === IMPASS);
}

// ── doors: frame<8 routable (+1), frame>=8 locked (0xff), + behind-block ──
{
  // Non-DoubleV door (faces E/W): behind = the cell to the WEST.
  const { world } = setupWorld({
    tileFlags: { 210: {} },   // door tile, no DoubleV flag
    entities: [{ x: 5, y: 5, obj: 0x129, frame: 4, tile: 210 }],   // closed-unlocked
  });
  check('door closed-unlocked (frame 4): routable, cost+1', costAt(world, 5, 5) === 2);
  check('door (E/W facing): cell to the WEST blocked', costAt(world, 4, 5) === IMPASS);
}
{
  const { world } = setupWorld({
    tileFlags: { 211: { tile: 0x40 } },   // door tile WITH DoubleV (IsTileDoubleV)
    entities: [{ x: 5, y: 5, obj: 0x12a, frame: 0, tile: 211 }],   // open (frame 0)
  });
  check('door open (frame 0): still routable, cost+1', costAt(world, 5, 5) === 2);
  check('door (N/S facing, DoubleV): cell to the NORTH blocked', costAt(world, 5, 4) === IMPASS);
}
{
  const { world } = setupWorld({
    tileFlags: { 212: {} },
    entities: [{ x: 5, y: 5, obj: 0x12c, frame: 8, tile: 212 }],   // locked (frame 8)
  });
  check('door locked (frame 8): blocked 0xff', costAt(world, 5, 5) === IMPASS);
}

// ── pass-through objects (OBJ_116 / OBJ_118): +1 cost ──
{
  const { world } = setupWorld({
    entities: [{ x: 6, y: 6, obj: 0x116, frame: 0, tile: 0 }],
  });
  check('pass-through object: cost+1 (1 -> 2)', costAt(world, 6, 6) === 2);
}

// ── impassable map object (e.g. a table): spread -> 0xff ──
{
  const { world } = setupWorld({
    tileFlags: { 200: { terrain: 0x02 } },   // object tile impassable
    entities: [{ x: 7, y: 7, obj: 0x050, frame: 0, tile: 200 }],
  });
  check('impassable object: cell -> 0xff', costAt(world, 7, 7) === IMPASS);
}

// ── object footprint spread: 2x2 sprite blocks all four cells (NW auto-extension) ──
{
  const { world } = setupWorld({
    tileFlags: {
      300: { tile: 0xC0, terrain: 0x02 },  // anchor: DoubleH+DoubleV + impassable
      299: { terrain: 0x02 },              // west quadrant
      298: { terrain: 0x02 },              // north quadrant
      297: { terrain: 0x02 },              // NW quadrant
    },
    entities: [{ x: 10, y: 10, obj: 0x060, frame: 0, tile: 300 }],   // anchor at SE corner
  });
  const r = computeResistance(world, C, C);
  check('2x2 object: anchor cell (10,10) blocked', r.costAt(10, 10) === IMPASS);
  check('2x2 object: west cell (9,10) blocked',    r.costAt(9, 10) === IMPASS);
  check('2x2 object: north cell (10,9) blocked',   r.costAt(10, 9) === IMPASS);
  check('2x2 object: NW cell (9,9) blocked',       r.costAt(9, 9) === IMPASS);
  check('2x2 object: neighbour (11,11) untouched', r.costAt(11, 11) === 1);
}

// ── additive object cost: a non-wall, non-impassable object adds its cost nibble ──
{
  const { world } = setupWorld({
    tileFlags: { 250: { terrain: 0x20 } },   // object cost nibble 2, not impassable/wall
    entities: [{ x: 12, y: 12, obj: 0x051, frame: 0, tile: 250 }],
  });
  check('additive object: base 1 + cost 2 -> 3', costAt(world, 12, 12) === 3);
}

// ── NPCs are NOT obstacles in the cost map (even an impassable-tiled NPC) ──
{
  const { world } = setupWorld({
    tileFlags: { 200: { terrain: 0x02 } },   // impassable sprite tile
    entities: [{ x: 8, y: 8, obj: 0x19a, frame: 0, tile: 200, actor: true }],
  });
  check('NPC (Actor) does not raise cost: stays 1', costAt(world, 8, 8) === 1);
}

// ── wet-impassable rescue: a non-impassable object over WET impassable terrain ──
// makes the cell walkable at the object's own cost (e.g. a raft/plank over water).
{
  const { world } = setupWorld({
    terrainAt: { '9,9': 14 },
    tileFlags: {
      14:  { terrain: 0x03 },   // base: wet + impassable (deep water)
      400: { terrain: 0x10 },   // object: cost nibble 1, NOT impassable
    },
    entities: [{ x: 9, y: 9, obj: 0x070, frame: 0, tile: 400 }],
  });
  check('wet rescue: impassable water + walkable object -> cost 2', costAt(world, 9, 9) === 2);
}

// ============================================================================
// I-9b — bucket-Dijkstra search (findPath)
// ============================================================================
// Center the work area at (20,20) so origin = (0,0) and area coord == world coord.

const STEP_DX = [0, 1, 0, -1];   // dir 0=N 1=E 2=S 3=W
const STEP_DY = [-1, 0, 1, 0];

// Walk a dir array from (sx,sy); return the final cell (to confirm it reaches target).
function walkPath(sx, sy, dirs) {
  let x = sx, y = sy;
  for (const d of dirs) { x += STEP_DX[d]; y += STEP_DY[d]; }
  return { x, y };
}

// ── already-at-target / start-outside ──
{
  const { world } = setupWorld();
  check('findPath: start == target -> [] (empty path)',
    Array.isArray(findPath(world, 5, 5, 5, 5, C, C)) && findPath(world, 5, 5, 5, 5, C, C).length === 0);
  // start outside its own window is the only null-from-bounds case (never happens for
  // per-NPC centering, but guarded): center the window far from the start.
  check('findPath: start outside the window -> null', findPath(world, 5, 5, 6, 6, 200, 200) === null);
}

// ── edge-seek: an off-window target returns a path toward the favored window edge ──
{
  const { world } = setupWorld();   // open terrain; center (20,20) -> window [0,39]
  // target far EAST -> head to the east edge (x=39 in this window).
  const east = findPath(world, 20, 20, 100, 20, C, C);
  check('edge-seek: far-east target returns a non-empty path', east !== null && east.length > 0);
  const eEnd = east && walkPath(20, 20, east);
  check('edge-seek: far-east path ends on the EAST edge (x=39)', eEnd && eEnd.x === 39);
  // target far NORTH -> head to the north edge (y=0).
  const north = findPath(world, 20, 20, 20, -50, C, C);
  const nEnd = north && walkPath(20, 20, north);
  check('edge-seek: far-north path ends on the NORTH edge (y=0)', nEnd && nEnd.y === 0);
  // target far SOUTH -> south edge (y=39).
  const sEnd = walkPath(20, 20, findPath(world, 20, 20, 20, 100, C, C) || []);
  check('edge-seek: far-south path ends on the SOUTH edge (y=39)', sEnd.y === 39);
}
{
  // edge-seek with the ONLY toward-goal edge walled off -> unreachable -> null (snap).
  const tileFlags = { 99: { terrain: 0x02 } };
  const terrainAt = {};
  for (let y = 0; y < AREA; y++) terrainAt[`30,${y}`] = 99;   // full-height wall east of the NPC
  const { world } = setupWorld({ terrainAt, tileFlags });   // target due east -> only EDGE_E
  check('edge-seek: sole toward-goal edge walled off -> null', findPath(world, 20, 20, 100, 20, C, C) === null);
}
{
  // Multi-edge (NPC #12's real case): NE goal with the NORTH edge walled but EAST open
  // -> reach the EAST edge, not snap. Source's single-favored-direction would pick the
  // (blocked) north axis and give up; the edgeMask accepts either toward-goal edge.
  const tileFlags = { 99: { terrain: 0x02 } };
  const terrainAt = {};
  for (let x = 0; x < AREA; x++) terrainAt[`${x},10`] = 99;   // full-WIDTH wall north of the NPC (blocks N edge)
  const { world } = setupWorld({ terrainAt, tileFlags });
  const dirs = findPath(world, 20, 20, 100, -50, C, C);       // target NE: EDGE_E | EDGE_N
  check('edge-seek (multi): NE goal, north walled -> still walks (non-null)', dirs !== null && dirs.length > 0);
  const end = dirs && walkPath(20, 20, dirs);
  check('edge-seek (multi): reaches the open EAST edge (x=39)', end && end.x === 39);
}

// ── open grid: straight-line shortest path ──
{
  const { world } = setupWorld();
  const dirs = findPath(world, 2, 2, 5, 2, C, C);   // 3 cells east
  check('findPath: open grid path is non-null', dirs !== null);
  check('findPath: open grid path length == manhattan (3)', dirs && dirs.length === 3);
  const end = dirs && walkPath(2, 2, dirs);
  check('findPath: open grid path reaches target', end && end.x === 5 && end.y === 2);
}
{
  const { world } = setupWorld();
  const dirs = findPath(world, 3, 3, 7, 6, C, C);   // dx=4, dy=3 -> manhattan 7
  const end = dirs && walkPath(3, 3, dirs);
  check('findPath: diagonal-ish target reached via 4-dir steps', end && end.x === 7 && end.y === 6);
  check('findPath: L-path length == manhattan (7)', dirs && dirs.length === 7);
}

// ── routes AROUND a wall (longer than manhattan) ──
{
  // Vertical wall of impassable cells at x=5, y=1..8, with a gap at y=9. Start left
  // of the wall, target right of it: the path must detour down around the gap.
  const tileFlags = { 99: { terrain: 0x02 } };
  const terrainAt = {};
  for (let y = 1; y <= 8; y++) terrainAt[`5,${y}`] = 99;   // wall column, gap at y=9
  const { world } = setupWorld({ terrainAt, tileFlags });
  const dirs = findPath(world, 3, 4, 7, 4, C, C);
  const end = dirs && walkPath(3, 4, dirs);
  check('findPath: wall detour reaches target', end && end.x === 7 && end.y === 4);
  check('findPath: wall detour longer than manhattan (>4)', dirs && dirs.length > 4);
  // every step must stay off the wall cells
  let onWall = false, x = 3, y = 4;
  for (const d of (dirs || [])) { x += STEP_DX[d]; y += STEP_DY[d]; if (terrainAt[`${x},${y}`] === 99) onWall = true; }
  check('findPath: wall detour never steps on a wall cell', dirs && !onWall);
}

// ── fully blocked target -> null ──
{
  // Ring the target (10,10) with impassable cells on all 4 sides.
  const tileFlags = { 99: { terrain: 0x02 } };
  const terrainAt = { '9,10': 99, '11,10': 99, '10,9': 99, '10,11': 99 };
  const { world } = setupWorld({ terrainAt, tileFlags });
  check('findPath: target walled off on all sides -> null', findPath(world, 3, 3, 10, 10, C, C) === null);
}

// ── routes THROUGH an open/closed-unlocked door, AROUND a locked one ──
// A door sits on passable doorway floor in a FULL-HEIGHT wall (the wall is the
// door's neighbours, not the door cell). The door is DoubleV (tile flag 0x40 =
// faces N/S, a door in a vertical N-S wall you walk through E-W) so its behind-block
// lands on the wall cell to the NORTH (already 0xff), leaving both E/W approach
// cells open — the realistic doorway geometry.
{
  const tileFlags = { 99: { terrain: 0x02 }, 211: { tile: 0x40 } };
  const terrainAt = {};
  for (let y = 0; y < AREA; y++) if (y !== 4) terrainAt[`5,${y}`] = 99;   // wall col, floor gap at (5,4)
  const { world } = setupWorld({
    terrainAt, tileFlags,
    entities: [{ x: 5, y: 4, obj: 0x129, frame: 4, tile: 211 }],   // closed-unlocked door in the doorway
  });
  const dirs = findPath(world, 3, 4, 7, 4, C, C);
  const end = dirs && walkPath(3, 4, dirs);
  check('findPath: routes through a closed-unlocked door', end && end.x === 7 && end.y === 4);
  let through = false, x = 3, y = 4;
  for (const d of (dirs || [])) { x += STEP_DX[d]; y += STEP_DY[d]; if (x === 5 && y === 4) through = true; }
  check('findPath: door path actually steps on the door cell', dirs && through);
}
{
  // Same full-height wall + doorway, but the door is LOCKED (frame 8 -> 0xff). The
  // door is the only gap, so there is no route across the wall.
  const tileFlags = { 99: { terrain: 0x02 }, 212: { tile: 0x40 } };
  const terrainAt = {};
  for (let y = 0; y < AREA; y++) if (y !== 4) terrainAt[`5,${y}`] = 99;
  const { world } = setupWorld({
    terrainAt, tileFlags,
    entities: [{ x: 5, y: 4, obj: 0x12c, frame: 8, tile: 212 }],   // locked door
  });
  check('findPath: locked door in an otherwise-solid wall -> null', findPath(world, 3, 4, 7, 4, C, C) === null);
}

// ============================================================================
// I-9c — humanoid door pass-through (canStandAt) + npcStep + doOnPath
// ============================================================================

// ── humanoid NPC walks through a closed-unlocked door; player is blocked ──
{
  const { world } = setupWorld({
    tileFlags: { 210: { terrain: 0x02 } },                        // door sprite impassable
    entities: [{ x: 5, y: 5, obj: 0x129, frame: 4, tile: 210 }],  // closed-unlocked door
  });
  check('canStandAt: normal mover blocked by closed door', canStandAt(world, 5, 5) === false);
  check('canStandAt: humanoid NPC passes through closed-unlocked door',
    canStandAt(world, 5, 5, { asHumanoidNpc: true }) === true);
}
{
  const { world } = setupWorld({
    tileFlags: { 212: { terrain: 0x02 } },
    entities: [{ x: 5, y: 5, obj: 0x12c, frame: 8, tile: 212 }],  // LOCKED door (frame 8)
  });
  check('canStandAt: humanoid NPC still blocked by a LOCKED door',
    canStandAt(world, 5, 5, { asHumanoidNpc: true }) === false);
}
{
  const { world } = setupWorld({
    tileFlags: { 220: { terrain: 0x02 } },
    entities: [{ x: 5, y: 5, obj: 0x116, frame: 0, tile: 220 }],  // pass-through object
  });
  check('canStandAt: humanoid NPC passes through a pass-through object',
    canStandAt(world, 5, 5, { asHumanoidNpc: true }) === true);
}

// ── npcStep: moves + reports walking; blocked returns null and doesn't move ──
{
  const { world, handles } = setupWorld({
    entities: [{ x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  const pos = world.store(Position);
  const r = npcStep(world, h, 2 /* east */, false);   // dir8 2 = E
  check('npcStep: a clear step returns a walking flag (moved)', r !== null);
  check('npcStep: position advanced east', pos.x[i] === 11 && pos.y[i] === 10);
}
{
  const { world, handles } = setupWorld({
    tileFlags: { 99: { terrain: 0x02 } },
    terrainAt: { '11,10': 99 },                          // wall directly east
    entities: [{ x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  const pos = world.store(Position);
  check('npcStep: blocked step returns null', npcStep(world, h, 2, false) === null);
  check('npcStep: blocked step does not move', pos.x[i] === 10 && pos.y[i] === 10);
}
{
  // Non-humanoid NPC (gazer OBJ_162) moves but is NOT humanoid-frame-animated (its
  // per-type facing arm isn't ported; it keeps a valid static sprite). Same gate as
  // atDestination — mirrors source routing both walk + arrival through C_1E0F_0664.
  const { world, handles } = setupWorld({
    entities: [{ x: 10, y: 10, obj: 0x162, frame: 6, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  const pos = world.store(Position), ot = world.store(ObjType);
  npcStep(world, h, 2 /* east */, false);
  check('npcStep: non-humanoid (gazer) still moves east', pos.x[i] === 11 && pos.y[i] === 10);
  check('npcStep: non-humanoid (gazer) frame left untouched (not humanoid-encoded)', ot.frame[i] === 6);
}
// ── I-14e door-phasing fix: npcStep gates door pass-through on isHumanoid (was always-on) ──
{
  // A humanoid NPC steps THROUGH a closed-unlocked door east of it; a non-humanoid (gazer)
  // is BLOCKED by the same door (no longer phases it).
  function stepIntoDoorWith(objNumber) {
    const { world, handles } = setupWorld({
      tileFlags: { 210: { terrain: 0x02 } },                                  // door sprite impassable
      entities: [
        { x: 10, y: 10, obj: objNumber, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH },
        { x: 11, y: 10, obj: 0x129, frame: 4, tile: 210 },                    // closed-unlocked door east
      ],
    });
    const h = handles[0], i = world.resolve(h), pos = world.store(Position);
    npcStep(world, h, 2 /* east */, false);
    return pos.x[i] === 11;                                                    // true = stepped onto the door cell
  }
  check('npcStep: humanoid NPC phases a closed-unlocked door', stepIntoDoorWith(0x19a) === true);
  check('npcStep: non-humanoid (gazer) is blocked by a closed door (no phasing)', stepIntoDoorWith(0x162) === false);
}

// ── doOnPath: walks a 3-step path to the goal, then arrives -> __AtDestination ──
{
  const { world, handles } = setupWorld({
    entities: [{ x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  const pos = world.store(Position), am = world.store(AIMode), ot = world.store(ObjType), paths = world.getResource(Paths);
  world.add(h, Destination, { x: 13, y: 10, z: 0, action: AI.AI_STAND_S });   // slot worktype: stand facing S
  paths.set(h, [1, 1, 1], 13, 10);                       // 3 steps east -> goal (13,10)
  check('doOnPath: step 1 advances', doOnPath(world, h) === 'step' && pos.x[i] === 11);
  check('doOnPath: step 2 advances', doOnPath(world, h) === 'step' && pos.x[i] === 12);
  check('doOnPath: step 3 advances', doOnPath(world, h) === 'step' && pos.x[i] === 13);
  const endStatus = doOnPath(world, h);
  check('doOnPath: cursor past end -> "end"', endStatus === 'end');
  check('doOnPath: arrived on slot -> worktype mode (STAND_S)', am.mode[i] === AI.AI_STAND_S);
  check('doOnPath: STAND_S sets stand frame facing south ((2<<2)|1)', ot.frame[i] === ((2 << 2) | 1));
  check('doOnPath: path cleared on arrival', !paths.has(h));
}

// ── doOnPath: a blocked step escalates AI_ONPATH -> 84 -> 85 -> 86 (abandon) ──
{
  const { world, handles } = setupWorld({
    tileFlags: { 99: { terrain: 0x02 } },
    terrainAt: { '11,10': 99 },                          // wall east of the NPC's first step
    entities: [{ x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  const am = world.store(AIMode), paths = world.getResource(Paths);
  paths.set(h, [1, 1], 12, 10);                          // wants to go east, but it's walled
  doOnPath(world, h);
  check('doOnPath: 1st block -> AI_84', am.mode[i] === AI.AI_84);
  doOnPath(world, h);
  check('doOnPath: 2nd block -> AI_85', am.mode[i] === AI.AI_85);
  doOnPath(world, h);
  check('doOnPath: 3rd block -> AI_86 + path abandoned', am.mode[i] === AI.AI_86 && !paths.has(h));
  check('doOnPath: no path -> "idle"', doOnPath(world, h) === 'idle');
}

// ── step-aside (clone-only): an ACTOR blocker is nudged out of the way + both re-plan ──
{
  const { world, handles } = setupWorld({
    entities: [
      { x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH },    // A (mover)
      { x: 11, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH },   // B (blocker)
    ],
  });
  const hA = handles[0], hB = handles[1], iA = world.resolve(hA), iB = world.resolve(hB);
  const am = world.store(AIMode), pos = world.store(Position), paths = world.getResource(Paths);
  paths.set(hA, [1, 1], 12, 10);                                  // A wants east; B sits at (11,10)
  const r = doOnPath(world, hA);
  check('step-aside: actor block → status "aside"', r === 'aside');
  // E/W mover → blocker pushed PERPENDICULAR (N/S): same column x=11, off the mover's row y=10
  check('step-aside: E-mover pushes blocker perpendicular (x stays 11, y leaves 10)',
    pos.x[iB] === 11 && pos.y[iB] !== 10);
  check('step-aside: blocked A re-plans (AI_FINDPATH)', am.mode[iA] === AI.AI_FINDPATH);
  check('step-aside: non-party blocker B re-plans too (AI_FINDPATH)', am.mode[iB] === AI.AI_FINDPATH);
  check('step-aside: A path cleared', !paths.has(hA));
}
// ── step-aside axis: an N/S mover pushes the blocker E/W (perpendicular) ──
{
  const { world, handles } = setupWorld({
    entities: [
      { x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH },     // A
      { x: 10, y: 11, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH },    // B due SOUTH
    ],
  });
  const hA = handles[0], iB = world.resolve(handles[1]);
  const pos = world.store(Position), paths = world.getResource(Paths);
  paths.set(hA, [2, 2], 10, 12);                                  // 4-dir 2 = south; A wants to go S through B
  const r = doOnPath(world, hA);
  check('step-aside: S-mover pushes blocker perpendicular (y stays 11, x leaves 10)',
    r === 'aside' && pos.y[iB] === 11 && pos.x[iB] !== 10);
}
// ── step-aside: a PARTY-member blocker also moves, but keeps its own mode (not FINDPATH) ──
{
  const { world, handles } = setupWorld({
    entities: [
      { x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH },
      { x: 11, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FOLLOW },     // B = follower
    ],
  });
  const hA = handles[0], hB = handles[1], iB = world.resolve(hB);
  world.add(hB, PartyMember, { slotIndex: 1 });
  const am = world.store(AIMode), pos = world.store(Position), paths = world.getResource(Paths);
  paths.set(hA, [1, 1], 12, 10);
  const r = doOnPath(world, hA);
  check('step-aside: party-member blocker also steps aside', r === 'aside' && !(pos.x[iB] === 11 && pos.y[iB] === 10));
  check('step-aside: party-member keeps its mode (AI_FOLLOW, not re-pathed)', am.mode[iB] === AI.AI_FOLLOW);
}
// ── step-aside loop fix: a SETTLED (worktype) blocker is moved but NOT re-pathed — so it
//    doesn't immediately walk back to the cell it was pushed off (the push↔return loop). ──
{
  const { world, handles } = setupWorld({
    entities: [
      { x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH },     // A (mover)
      { x: 11, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_LOITER },      // B settled at its slot
    ],
  });
  const hA = handles[0], iB = world.resolve(handles[1]);
  const am = world.store(AIMode), pos = world.store(Position), paths = world.getResource(Paths);
  paths.set(hA, [1, 1], 12, 10);
  const r = doOnPath(world, hA);
  check('step-aside: settled blocker steps aside', r === 'aside' && !(pos.x[iB] === 11 && pos.y[iB] === 10));
  check('step-aside: settled blocker KEEPS its worktype (not re-pathed → no walk-back loop)', am.mode[iB] === AI.AI_LOITER);
}
// ── step-aside: a boxed-in blocker can't move → fall to the faithful 84/85/86 wait ──
{
  const walls = {};
  for (const c of [[12, 10], [11, 9], [11, 11], [12, 9], [12, 11], [10, 9], [10, 11]]) walls[`${c[0]},${c[1]}`] = 99;
  const { world, handles } = setupWorld({
    tileFlags: { 99: { terrain: 0x02 } },
    terrainAt: walls,                                              // box B in on every side but A's cell
    entities: [
      { x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH },
      { x: 11, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH },
    ],
  });
  const hA = handles[0], iA = world.resolve(hA);
  const am = world.store(AIMode), paths = world.getResource(Paths);
  paths.set(hA, [1, 1], 12, 10);
  const r = doOnPath(world, hA);
  check('step-aside: boxed-in blocker → no aside, faithful wait (AI_84)', r === 'blocked' && am.mode[iA] === AI.AI_84);
}
// ── a STATIC block (no actor) never triggers step-aside → faithful wait ──
{
  const { world, handles } = setupWorld({
    tileFlags: { 99: { terrain: 0x02 } },
    terrainAt: { '11,10': 99 },                                   // a wall, not an actor
    entities: [{ x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  const am = world.store(AIMode), paths = world.getResource(Paths);
  paths.set(h, [1, 1], 12, 10);
  const r = doOnPath(world, h);
  check('step-aside: static block → "blocked" (no aside), AI_84', r === 'blocked' && am.mode[i] === AI.AI_84);
}

// ============================================================================
// I-9d — npc_tick_system end-to-end (FINDPATH -> build -> walk -> arrive)
// ============================================================================
{
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH }],
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);   // region (0,0) loaded -> active-area gate passes
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 23, y: 20, z: 0, action: AI.AI_STAND_E });   // 3 cells east, in-window; stand facing E
  const am = world.store(AIMode), pos = world.store(Position), ot = world.store(ObjType);
  const { system } = installNpcTickSystem(world);

  system();                                                // FINDPATH -> build path -> AI_ONPATH
  check('npcTick: FINDPATH builds a path -> AI_ONPATH', am.mode[i] === AI.AI_ONPATH);
  let guard = 0;
  while (am.mode[i] === AI.AI_ONPATH && guard++ < 30) system();   // step until arrival
  check('npcTick: NPC walked to its destination', pos.x[i] === 23 && pos.y[i] === 20);
  check('npcTick: arrived -> worktype mode (STAND_E)', am.mode[i] === AI.AI_STAND_E);
  check('npcTick: arrival faces the worktype direction (E, (1<<2)|1)', ot.frame[i] === ((1 << 2) | 1));
}
{
  // Far REACHABLE target -> WALKS via edge-seek + re-plan, converging without teleport.
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH }],
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);   // (20,20)..(100,20) all in region 0 (x<128)
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 100, y: 20, z: 0 });      // far east, off-window
  const am = world.store(AIMode), pos = world.store(Position);
  const { system } = installNpcTickSystem(world);
  system();   // FINDPATH -> edge-seek path -> AI_ONPATH (path built, no step yet)
  check('npcTick: far reachable target WALKS (edge-seek), not snap',
    am.mode[i] === AI.AI_ONPATH && pos.x[i] === 20);
  let px = pos.x[i], py = pos.y[i], maxStep = 0, guard = 0;
  while (!(pos.x[i] === 100 && pos.y[i] === 20) && guard++ < 600) {
    system();
    maxStep = Math.max(maxStep, Math.abs(pos.x[i] - px) + Math.abs(pos.y[i] - py));
    px = pos.x[i]; py = pos.y[i];
  }
  check('npcTick: far target reached by walking', pos.x[i] === 100 && pos.y[i] === 20);
  check('npcTick: never teleported (every turn moved <= 1 cell)', maxStep <= 1);
}
{
  // Active-area gate: an NPC whose region isn't loaded is frozen (not ticked).
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH }],
  });
  // loadedRegions intentionally empty
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 23, y: 20, z: 0 });
  const am = world.store(AIMode), pos = world.store(Position);
  const { system } = installNpcTickSystem(world);
  system();
  check('npcTick: unloaded-region NPC stays frozen (FINDPATH, unmoved)',
    am.mode[i] === AI.AI_FINDPATH && pos.x[i] === 20);
}

// ============================================================================
// I-14b — DEXTE-paced accumulator (MoveSpeed + an injected clock)
// ============================================================================
// Walk a clear straight path east and count STEPS over a fixed wall-clock window;
// the rate must track dexterity (the speed meter), and a tick with no elapsed time
// (or too little credit) must not step.
function walkEastStepsIn1000ms(dex) {
  let T = 0; const now = () => T;
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH, dex }],
    moveSpeed: true,
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 60, y: 20, z: 0 });   // far east → keeps walking (edge-seek)
  const pos = world.store(Position);
  const { system } = installNpcTickSystem(world, { now });
  system();                                            // T=0: build path (free), no step
  let steps = 0, prevX = pos.x[i], prevY = pos.y[i];
  for (let k = 0; k < 10; k++) {                        // ten 100 ms heartbeats = 1000 ms
    T += 100; system();
    if (pos.x[i] !== prevX || pos.y[i] !== prevY) steps++;
    prevX = pos.x[i]; prevY = pos.y[i];
  }
  return steps;
}
{
  const s15 = walkEastStepsIn1000ms(15);
  const s30 = walkEastStepsIn1000ms(30);
  check(`accumulator: DEX 15 ≈ 2.5 tiles/s (got ${s15} steps in 1000ms, expect 2-3)`, s15 >= 2 && s15 <= 3);
  check(`accumulator: DEX 30 ≈ 5 tiles/s (got ${s30} steps in 1000ms, expect 4-6)`, s30 >= 4 && s30 <= 6);
  check('accumulator: higher DEX steps more often', s30 > s15);
}
{
  // No elapsed time → no credit → no step; then exactly one step's worth of time → one step.
  let T = 0; const now = () => T;
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH, dex: 15 }],
    moveSpeed: true,
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 60, y: 20, z: 0 });
  const pos = world.store(Position);
  const { system } = installNpcTickSystem(world, { now });
  system();                                            // build path (free)
  const x0 = pos.x[i];
  system(); system(); system();                        // T frozen → elapsed 0 → no steps
  check('accumulator: no elapsed time → no step', pos.x[i] === x0);
  // DEX 15 needs 400 ms of credit for one step (cost 5). Feed it as two 200 ms heartbeats
  // (each ≤ the 250 ms elapsed clamp): the first is short of a step, the second crosses it.
  T += 200; system();
  check('accumulator: 200 ms (DEX 15) not yet a step', pos.x[i] === x0);
  T += 200; system();
  check('accumulator: cumulative 400 ms (DEX 15) → exactly one step', pos.x[i] === x0 + 1);
}
{
  // The elapsed clamp (MAX_ELAPSED_MS) caps a single huge gap (backgrounded tab / resumed
  // modal) to at most one step — never a multi-tile burst.
  let T = 0; const now = () => T;
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH, dex: 30 }],
    moveSpeed: true,
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 60, y: 20, z: 0 });
  const pos = world.store(Position);
  const { system } = installNpcTickSystem(world, { now });
  system();                                            // build path (free)
  const x0 = pos.x[i];
  T += 10000; system();                                // a 10 s gap → clamped → at most one tile
  check('accumulator: huge time gap → at most one step (no burst)', pos.x[i] - x0 <= 1);
}

// ============================================================================
// I-14c — stepCostAt (SubTerrainMov: terrain-weighted step cost)
// ============================================================================
{
  const { world } = setupWorld({
    terrainAt: { '6,5': 7 },                                    // (6,5) is a costly terrain tile (id 7)
    tileFlags: { 7: { terrain: 0x30 }, 9: { terrain: 0x20 } },  // terrainCost: tile7=3, tile9=2
    entities: [{ x: 7, y: 5, obj: 0x0e8, frame: 0, tile: 9 }],  // an object (tile 9) stacked at (7,5)
  });
  check('stepCostAt: open ground = BASE_COST', stepCostAt(world, 5, 5) === BASE_COST);
  check('stepCostAt: costly terrain adds its nibble (5+3)', stepCostAt(world, 6, 5) === BASE_COST + 3);
  check('stepCostAt: stacked object adds its nibble (5+2)', stepCostAt(world, 7, 5) === BASE_COST + 2);
}
{
  // Integration: same dexterity, costlier terrain → fewer steps over a fixed window. Uses a
  // UNIFORM terrain (override tileAt) so the pathfinder can't route around it, an in-window
  // goal (no edge-seek re-plans), and a modest cost (path stays under the pathfinder cap).
  function stepsUniform(terrainTile, terrainByte) {
    let T = 0; const now = () => T;
    const { world, handles } = setupWorld({
      tileFlags: { [terrainTile]: { terrain: terrainByte } },
      entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH, dex: 30 }],
      moveSpeed: true,
    });
    world.getResource(MapLevel).tileAt = () => terrainTile;                 // uniform field
    world.getResource(SpatialIndex).loadedRegions.add(0);
    const h = handles[0], i = world.resolve(h);
    world.add(h, Destination, { x: 38, y: 20, z: 0 });                      // in-window goal
    const pos = world.store(Position);
    const { system } = installNpcTickSystem(world, { now });
    system();
    let steps = 0, px = pos.x[i], py = pos.y[i];
    for (let k = 0; k < 12; k++) { T += 200; system(); if (pos.x[i] !== px || pos.y[i] !== py) steps++; px = pos.x[i]; py = pos.y[i]; }
    return steps;
  }
  const open = stepsUniform(0, 0x00);     // cost 5 (BASE)
  const rough = stepsUniform(4, 0x20);    // terrain nibble 2 → cost 7
  check(`stepCostAt: costlier terrain slows the walk (open ${open} > rough ${rough})`, open > rough);
}

// ============================================================================
// I-9f — teleport-to-previous-target on reschedule (blocked NPC catches up)
// ============================================================================
// Builds a minimal world with WorldClock + a synthetic Schedules and fires an
// hour-rollover so installNpcScheduleSystem's tick runs.
function setupScheduleWorld({ npcId, pos, dest, mode, slot }) {
  const reg = new TileRegistry({ tiles: null, flags: new TileFlags(new Uint8Array(0x1C00)), palette: new Uint8Array(0) });
  reg.baseTile = { objToTile: new Uint16Array(0x400) };
  const mapLevel = Object.create(MapLevel.prototype); mapLevel.tileAt = () => 0;
  const world = new World(1024)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Actor).registerComponent(AIMode).registerComponent(Destination)
    .registerComponent(Schedule).registerComponent(PartyMember);
  const spatial = new SpatialIndex(1024);
  world.setResource(reg); world.setResource(spatial); world.setResource(mapLevel);
  spatial.loadedRegions.add(((pos.x >> 7) & 7) | (((pos.y >> 7) & 7) << 3));   // NPC's current region loaded
  const schedules = Object.create(Schedules.prototype);
  schedules.byNpc = []; schedules.byNpc[npcId] = [slot];
  world.setResource(schedules);
  const clock = new WorldClock({ Time_H: slot.hour - 1, Time_M: 59, Date_D: 1 });
  world.setResource(clock);
  const h = world.create();
  world.add(h, Position, { x: pos.x, y: pos.y, z: 0 });
  world.add(h, ObjType, { objNumber: 0x19a, frame: 0 });
  world.add(h, Renderable, { tileId: 0 });
  world.add(h, Actor, { npcId });
  world.add(h, AIMode, { mode });
  world.add(h, Destination, { x: dest.x, y: dest.y, z: 0 });
  world.add(h, Schedule, { npcId });
  spatial.insert(pos.x, pos.y, h);
  const stats = installNpcScheduleSystem(world);
  return { world, clock, h, stats };
}
{
  // Blocked en route: at (45,50), its previous target (Destination) was (50,50) and
  // it never got there. A new slot fires at hour 19 -> (60,60).
  const { world, clock, h, stats } = setupScheduleWorld({
    npcId: 5, pos: { x: 45, y: 50 }, dest: { x: 50, y: 50 }, mode: AI.AI_86,
    slot: { time: 19, action: 0x93, hour: 19, day: 0, x: 60, y: 60, z: 0 },
  });
  const i = world.resolve(h), pos = world.store(Position), am = world.store(AIMode), dest = world.store(Destination);
  const spatial = world.getResource(SpatialIndex);
  clock.advance(1);   // 18:59 -> 19:00 -> schedule tick fires
  check('reschedule: blocked NPC snapped to its PREVIOUS target (50,50)', pos.x[i] === 50 && pos.y[i] === 50);
  check('reschedule: then re-targeted to the new slot (60,60)', dest.x[i] === 60 && dest.y[i] === 60);
  check('reschedule: mode set to AI_FINDPATH', am.mode[i] === AI.AI_FINDPATH);
  check('reschedule: spatial index moved with it (left 45,50; now at 50,50)',
    !spatial.at(45, 50) && (spatial.at(50, 50) || []).includes(h));
  check('reschedule: stats.reclaimed == 1', stats.reclaimed === 1);
}
{
  // Control: it DID reach its previous target (50,50) -> no teleport, just re-target.
  const { world, clock, h, stats } = setupScheduleWorld({
    npcId: 6, pos: { x: 50, y: 50 }, dest: { x: 50, y: 50 }, mode: AI.AI_SCHEDULE,
    slot: { time: 19, action: 0x93, hour: 19, day: 0, x: 70, y: 70, z: 0 },
  });
  const i = world.resolve(h), pos = world.store(Position), am = world.store(AIMode), dest = world.store(Destination);
  clock.advance(1);
  check('reschedule: NPC already at prev target is NOT reclaimed', stats.reclaimed === 0);
  check('reschedule: stays put then re-targets to new slot', pos.x[i] === 50 && pos.y[i] === 50 && dest.x[i] === 70 && dest.y[i] === 70);
  check('reschedule: mode set to AI_FINDPATH (control)', am.mode[i] === AI.AI_FINDPATH);
}

// ============================================================================
// I-9g — arrival worktypes / facing (__AtDestination)
// ============================================================================
// atDestination reads Destination.action and applies the worktype on arrival. Helper
// spawns one NPC at `pos` with a Destination (`dest` xyz + `action`).
function setupArrivalNpc({ pos, dest, action, frame = 0, obj = 0x19a }) {
  const { world, handles } = setupWorld({
    entities: [{ x: pos.x, y: pos.y, obj, frame, tile: 0, actor: true, aimode: AI.AI_ONPATH }],
  });
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: dest.x, y: dest.y, z: 0, action });
  return { world, h, i, am: world.store(AIMode), ot: world.store(ObjType), pos2: world.store(Position) };
}

// ── STAND_*/GUARD_* on the slot: set the worktype mode + face the right way ──
{
  // STAND_N..STAND_W -> facing 0..3 -> stand frame (facing<<2)|1; GUARD_* faces the same.
  const cases = [
    ['STAND_N', AI.AI_STAND_N, 0], ['STAND_E', AI.AI_STAND_E, 1],
    ['STAND_S', AI.AI_STAND_S, 2], ['STAND_W', AI.AI_STAND_W, 3],
    ['GUARD_N', AI.AI_GUARD_N, 0], ['GUARD_E', AI.AI_GUARD_E, 1],
    ['GUARD_S', AI.AI_GUARD_S, 2], ['GUARD_W', AI.AI_GUARD_W, 3],
  ];
  for (const [name, action, facing] of cases) {
    const { world, h, i, am, ot } = setupArrivalNpc({ pos: { x: 10, y: 10 }, dest: { x: 10, y: 10 }, action });
    atDestination(world, h);
    check(`atDestination: ${name} on slot -> mode = ${name}`, am.mode[i] === action);
    check(`atDestination: ${name} faces dir ${facing} (frame (${facing}<<2)|1)`, ot.frame[i] === ((facing << 2) | 1));
  }
}

// ── not on the slot: worktype attempt is overridden back to AI_FINDPATH (keep walking) ──
{
  const { world, h, i, am, ot } = setupArrivalNpc({ pos: { x: 10, y: 10 }, dest: { x: 12, y: 10 }, action: AI.AI_STAND_N });
  atDestination(world, h);
  check('atDestination: off-slot STAND -> mode reverts to AI_FINDPATH', am.mode[i] === AI.AI_FINDPATH);
  // facing was still set in the STAND arm before the override (source sets it unconditionally).
  check('atDestination: off-slot STAND still set the facing frame (N)', ot.frame[i] === ((0 << 2) | 1));
}

// ── non-humanoid NPC (gazer OBJ_162): STAND sets the mode but NOT the humanoid frame ──
// Source C_1E0F_0664 dispatches facing by type; the gazer's arm is frame=facing directly
// (seg_1E0F.c:410), not the humanoid walk+facing<<2. We've only ported the humanoid arm,
// so a non-humanoid keeps its sprite (per-type facing deferred) instead of mis-encoding.
{
  const { world, h, i, am, ot } = setupArrivalNpc({ pos: { x: 10, y: 10 }, dest: { x: 10, y: 10 }, action: AI.AI_STAND_N, obj: 0x162, frame: 6 });
  const before = ot.frame[i];
  atDestination(world, h);
  check('atDestination: non-humanoid (gazer) STAND -> worktype mode set', am.mode[i] === AI.AI_STAND_N);
  check('atDestination: non-humanoid (gazer) sprite frame left untouched', ot.frame[i] === before && before === 6);
}

// ── pose worktypes force isAtDest even when off the exact slot (sprite swap deferred) ──
{
  const { world, h, i, am } = setupArrivalNpc({ pos: { x: 10, y: 10 }, dest: { x: 12, y: 10 }, action: AI.AI_EAT });
  atDestination(world, h);
  check('atDestination: AI_EAT holds position off-slot -> mode stays AI_EAT', am.mode[i] === AI.AI_EAT);
}
{
  const { world, h, i, am } = setupArrivalNpc({ pos: { x: 10, y: 10 }, dest: { x: 12, y: 10 }, action: AI.AI_SLEEP });
  atDestination(world, h);
  check('atDestination: AI_SLEEP holds position off-slot -> mode stays AI_SLEEP', am.mode[i] === AI.AI_SLEEP);
}

// ── doOnPath: path runs out >1 tile short of a FAR goal -> re-plan (not arrive) ──
{
  const { world, h, i, am, ot } = setupArrivalNpc({ pos: { x: 10, y: 10 }, dest: { x: 30, y: 10 }, action: AI.AI_STAND_S });
  const paths = world.getResource(Paths);
  paths.set(h, [1], 30, 10);                 // 1-step edge-seek hop toward a far goal (30,10)
  doOnPath(world, h);                         // step east -> (11,10)
  const status = doOnPath(world, h);          // cursor past end -> end-of-path branch
  check('doOnPath: ran out far from goal -> "end"', status === 'end');
  check('doOnPath: far-from-goal end re-plans (AI_FINDPATH), not arrive', am.mode[i] === AI.AI_FINDPATH);
  check('doOnPath: far-from-goal end did NOT apply the worktype', am.mode[i] !== AI.AI_STAND_S);
}

// ── npc tick: schedule fired while already ON the slot -> empty path -> worktype ──
{
  const { world, handles } = setupWorld({
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH }],
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 20, y: 20, z: 0, action: AI.AI_GUARD_W });   // already standing on it
  const am = world.store(AIMode), ot = world.store(ObjType);
  const { system } = installNpcTickSystem(world);
  system();                                   // FINDPATH -> findPath returns [] -> atDestination
  check('npcTick: already-on-slot -> worktype mode (GUARD_W)', am.mode[i] === AI.AI_GUARD_W);
  check('npcTick: already-on-slot faces the worktype dir (W)', ot.frame[i] === ((3 << 2) | 1));
}

// ── npc tick: unreachable slot -> snap onto it, then apply the worktype ──
{
  // Ring the slot (10,10) with impassable terrain so findPath returns null; the slot cell
  // itself is open, so snapToSlot teleports the NPC there, then __AtDestination runs.
  const tileFlags = { 99: { terrain: 0x02 } };
  const terrainAt = { '9,10': 99, '11,10': 99, '10,9': 99, '10,11': 99 };
  const { world, handles } = setupWorld({
    terrainAt, tileFlags,
    entities: [{ x: 20, y: 20, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH }],
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 10, y: 10, z: 0, action: AI.AI_STAND_N });
  const am = world.store(AIMode), pos = world.store(Position);
  const { system } = installNpcTickSystem(world);
  system();
  check('npcTick: unreachable slot snapped onto (10,10)', pos.x[i] === 10 && pos.y[i] === 10);
  check('npcTick: snapped NPC gets its worktype (STAND_N)', am.mode[i] === AI.AI_STAND_N);
}

// ============================================================================
// I-9h — off-area teleport + player-distance gate (walk-near / teleport-far)
// ============================================================================
// One schedule-driven NPC (AI_FINDPATH + Destination) plus a separate avatar entity
// (no AIMode -> the tick skips it) the gate measures distance to. Everything sits in
// region 0 (coords < 128) so one loadedRegions.add(0) passes the active-area gate.
function setupGateWorld({ npc, avatar, dest, action = AI.AI_STAND_N, terrainAt = {}, tileFlags = {} }) {
  const { world, handles } = setupWorld({
    terrainAt, tileFlags,
    entities: [
      { x: npc.x, y: npc.y, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH },
      { x: avatar.x, y: avatar.y, obj: 0x19a, frame: 0, tile: 0 },   // avatar: no aimode -> not ticked
    ],
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const npcH = handles[0], avatarRef = { handle: handles[1] };
  world.add(npcH, Destination, { x: dest.x, y: dest.y, z: 0, action });
  const { system, stats } = installNpcTickSystem(world, { avatarRef });
  return { world, npcH, i: world.resolve(npcH), system, stats,
           am: world.store(AIMode), pos: world.store(Position) };
}

// ── both NPC and slot far from the avatar (>40) -> teleport straight to the slot ──
{
  const { i, system, stats, am, pos } = setupGateWorld({
    npc: { x: 100, y: 100 }, avatar: { x: 10, y: 10 }, dest: { x: 103, y: 100 }, action: AI.AI_STAND_E,
  });
  system();
  check('I-9h gate: NPC + slot both far -> teleported onto the slot', pos.x[i] === 103 && pos.y[i] === 100);
  check('I-9h gate: far teleport applies the worktype (STAND_E)', am.mode[i] === AI.AI_STAND_E);
  check('I-9h gate: one teleport counted', stats.teleported === 1);
}

// ── NPC within the near radius of the avatar -> teleport suppressed, it pathfinds ──
{
  const { i, system, stats, am, pos } = setupGateWorld({
    npc: { x: 65, y: 60 }, avatar: { x: 60, y: 60 }, dest: { x: 68, y: 60 }, action: AI.AI_STAND_E,
  });
  system();
  check('I-9h gate: NPC near avatar -> no teleport', stats.teleported === 0);
  check('I-9h gate: near NPC builds a path instead (AI_ONPATH)', am.mode[i] === AI.AI_ONPATH);
  check('I-9h gate: near NPC has not stepped yet (path built this turn)', pos.x[i] === 65 && pos.y[i] === 60);
}

// ── NPC far but its SLOT is near the avatar -> still suppressed (it walks in on-screen) ──
{
  const { i, system, stats, am } = setupGateWorld({
    npc: { x: 105, y: 60 }, avatar: { x: 60, y: 60 }, dest: { x: 62, y: 60 }, action: AI.AI_STAND_E,
  });
  system();
  check('I-9h gate: slot near avatar (NPC far) -> no teleport', stats.teleported === 0);
  check('I-9h gate: NPC walks in toward the on-screen slot (AI_ONPATH)', am.mode[i] === AI.AI_ONPATH);
}

// ── per-turn teleport cap: 5 far NPCs, at most 3 teleport in one turn (source's D_17A5) ──
{
  const entities = [{ x: 10, y: 10, obj: 0x19a, frame: 0, tile: 0 }];   // [0] = avatar (no aimode)
  for (let k = 0; k < 5; k++)
    entities.push({ x: 100, y: 100 + k * 2, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH });
  const { world, handles } = setupWorld({ entities });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const avatarRef = { handle: handles[0] };
  for (let k = 0; k < 5; k++)
    world.add(handles[1 + k], Destination, { x: 103, y: 100 + k * 2, z: 0, action: AI.AI_STAND_N });
  const { system, stats } = installNpcTickSystem(world, { avatarRef });
  system();
  check('I-9h cap: at most 3 NPCs teleport per turn', stats.teleported === 3);
}

// ── no avatarRef -> gate disabled (pre-I-9h behavior: every NPC pathfinds, none teleport) ──
{
  const { world, handles } = setupWorld({
    entities: [{ x: 100, y: 100, obj: 0x19a, frame: 0, tile: 0, actor: true, aimode: AI.AI_FINDPATH }],
  });
  world.getResource(SpatialIndex).loadedRegions.add(0);
  const h = handles[0], i = world.resolve(h);
  world.add(h, Destination, { x: 103, y: 100, z: 0, action: AI.AI_STAND_N });
  const am = world.store(AIMode);
  const { system, stats } = installNpcTickSystem(world);   // no avatarRef
  system();
  check('I-9h gate off: no avatarRef -> no teleport (pathfinds)', stats.teleported === 0 && am.mode[i] === AI.AI_ONPATH);
}

// ── first-tick alignment: firing the hourly hooks resolves the CURRENT hour (load path) ──
// main.js fires clock.hourlyHooks once at load so NPCs align to their current-hour slot
// instead of waiting for the next hour rollover. Mirror that here: no advance(), just fire.
{
  const { world, clock, h, stats } = setupScheduleWorld({
    npcId: 7, pos: { x: 45, y: 50 }, dest: { x: 45, y: 50 }, mode: AI.AI_SCHEDULE,
    slot: { time: 9, action: AI.AI_STAND_S, hour: 9, day: 0, x: 60, y: 60, z: 0 },
  });
  clock.Time_H = 9; clock.Time_M = 0;          // already at the hour, no rollover pending
  const i = world.resolve(h), am = world.store(AIMode), dest = world.store(Destination);
  for (const cb of clock.hourlyHooks) cb(clock);   // == main.js load-time first-tick alignment
  check('I-9h first-tick: load alignment sets the current-hour Destination (60,60)', dest.x[i] === 60 && dest.y[i] === 60);
  check('I-9h first-tick: load alignment kicks AI_FINDPATH', am.mode[i] === AI.AI_FINDPATH);
  check('I-9h first-tick: one NPC triggered', stats.triggered === 1);
}

// ── render ──
const out = document.getElementById('out');
out.innerHTML =
  `<h2>I-9 pathfinding (a–h) — <span class="${fail ? 'fail' : 'pass'}">${pass}/${pass + fail} passed</span></h2>` +
  results.map((r) => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}  ${r.name}</div>`).join('');
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
