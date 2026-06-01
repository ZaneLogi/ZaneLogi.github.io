// Boot: bring-your-own-data load. Dropzone -> U6DB (IndexedDB) -> decoders ->
// resources + ECS entities on a World, then render (terrain + world objects + NPCs).
// Decode correctness needs the user's own U6 files (legal: nothing is bundled).

import { World, TurnClock } from './ecs/world.js';
import { U6DB } from './u6db.js';
import { decodePalette } from './assets/palette.js';
import { Tiles } from './assets/tiles.js';
import { U6Map } from './assets/map.js';
import { TileFlags } from './assets/tile_flags.js';
import { AnimData } from './assets/anim.js';
import { BaseTile } from './assets/basetile.js';
import { decodeObjlist } from './assets/objlist.js';
import { TileRegistry } from './resources/tile_registry.js';
import { MapLevel } from './resources/map_level.js';
import { SpatialIndex } from './resources/spatial_index.js';
import { unzip } from './assets/zip.js';
import { TileRenderer } from './view/renderer.js';
import { Camera } from './resources/camera.js';
import { WorldClock } from './resources/world_clock.js';
import { makeRenderSystem } from './systems/render_system.js';
import { makeCameraSystem } from './systems/camera_system.js';
import { makeTileAnimationSystem } from './systems/tile_animation_system.js';
import { makePaletteCycleSystem } from './systems/palette_cycle_system.js';
import { makeWorldRenderSystem } from './systems/world_render_system.js';
import { makeWorldClockSystem } from './systems/world_clock_system.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, Schedule, Container, ContainedIn, PartyMember } from './components/components.js';
import { Party } from './resources/party.js';
import { Schedules } from './resources/schedules.js';
import { ActorIndex } from './resources/actor_index.js';
import { installNpcScheduleSystem } from './systems/npc_schedule_system.js';
import { installAvatarMovement } from './systems/avatar_move_system.js';
import { installMoveFollowers, settleParty } from './systems/move_followers.js';
import { loadActors, ensureRegionsInView, makeStreamingSystem, inventoryOf } from './world_loader.js';
import { installDevHud } from './view/dev_hud.js';
import { installDevProbe } from './view/dev_probe.js';
import { UIStack } from './view/ui_stack.js';
import { openInspector } from './view/inspector.js';
import { forEachOccupiedCell } from './systems/tile_footprint.js';

// Gating set for terrain + flags (I-1b) + world objects (I-2) + NPC schedules (I-5).
// Names are the original U6 filenames, lowercased.
const REQUIRED = ['maptiles.vga', 'objtiles.vga', 'tileindx.vga', 'masktype.vga', 'animmask.vga', 'animdata', 'u6pal', 'chunks', 'map', 'tileflag', 'basetile', 'objlist', 'schedule', 'look.lzd'];
// look.lzd holds the display/look strings the inspector + NPC names need, so it's
// REQUIRED (not just a rendering nice-to-have). OPTIONAL is empty for now.
const OPTIONAL = [];

// OBJBLK region files (64 surface objblk[col][row] + 5 dungeon objblk[level]i).
// Demand-loaded per region from U6DB, so they gate by presence-count, not the
// all-or-nothing REQUIRED set.
const OBJBLK_NAMES = [];
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
  OBJBLK_NAMES.push(`objblk${String.fromCharCode(97 + c)}${String.fromCharCode(97 + r)}`);
for (let d = 0; d < 5; d++) OBJBLK_NAMES.push(`objblk${String.fromCharCode(97 + d)}i`);

const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);   // these + any objblk* are extracted from a dropped zip
const isKnown = (base) => KNOWN.has(base) || base.startsWith('objblk');

const checklistEl = document.getElementById('checklist');
const checklistSummaryEl = document.getElementById('checklist-summary');
const checklistBodyEl = document.getElementById('checklist-body');
const logEl = document.getElementById('log');
let loaded = false;

function log(msg, cls = '') {
  console.log(msg);
  logEl.innerHTML += `<span class="${cls}">${msg}</span>\n`;
}

async function updateChecklist() {
  const present = {};
  for (const n of [...REQUIRED, ...OPTIONAL]) present[n] = await U6DB.has(n);
  const ready = REQUIRED.every((n) => present[n]);

  let objblkCount = 0;
  for (const n of OBJBLK_NAMES) if (await U6DB.has(n)) objblkCount++;

  let body = 'Required:\n';
  for (const n of REQUIRED) body += `  ${present[n] ? '✓' : '✗'} ${n}\n`;
  if (OPTIONAL.length) {
    body += '\nOptional:\n';
    for (const n of OPTIONAL) body += `  ${present[n] ? '✓' : '—'} ${n}\n`;
  }
  body += `\nOBJBLK regions: ${objblkCount}/${OBJBLK_NAMES.length}`;
  checklistBodyEl.textContent = body;

  const missing = REQUIRED.filter((n) => !present[n]).length;
  checklistSummaryEl.className = ready ? 'ok' : 'miss';
  checklistSummaryEl.textContent = ready
    ? `✓ Ready · ${REQUIRED.length} required + ${objblkCount}/${OBJBLK_NAMES.length} regions — click to update files`
    : `✗ Missing ${missing} of ${REQUIRED.length} required files — drop them below`;

  // The panel doubles as the dropzone: expanded (showing the dropzone) while files
  // are missing, collapsed to just the status line once ready. Click the summary to
  // re-expand for updating.
  checklistEl.open = !ready;
  if (ready && !loaded) { loaded = true; await load(); }
}

async function buildFileMap() {
  const fileMap = new Map();
  for (const n of [...REQUIRED, ...OPTIONAL]) {
    const bytes = await U6DB.get(n);
    if (bytes) fileMap.set(n, bytes);
  }
  return fileMap;
}

async function load() {
  log('Decoding…', 'warn');
  const fileMap = await buildFileMap();

  const palette = decodePalette(fileMap.get('u6pal'), /* useTransparent */ true);

  const tiles = new Tiles();
  tiles.init(fileMap);   // animmask + look decoded when present (both presence-guarded inside)

  const flags = new TileFlags(fileMap.get('tileflag'));

  const u6map = new U6Map();
  u6map.init(fileMap);

  let anim = null;
  if (fileMap.has('animdata')) { anim = new AnimData(); anim.init(fileMap.get('animdata')); }

  const baseTile = new BaseTile(fileMap.get('basetile'));
  const objlist = decodeObjlist(fileMap.get('objlist'));
  const schedules = Schedules.fromBytes(fileMap.get('schedule'));

  const world = new World();
  world.setResource(new TileRegistry({ tiles, flags, palette, anim, baseTile }));
  world.setResource(new MapLevel(u6map, 0));
  world.setResource(new SpatialIndex());
  world.setResource(schedules);
  world.setResource(new ActorIndex());           // I-6a: slot-id -> NPC handle (populated by loadActors)
  // I-3: turn-driver + game-clock. idleInterval = 100ms => 1 game-minute per
  // 0.1s real => full game-day in ~2.4 min. Start date is a stand-in until
  // save-load lands (research_save_load.md). D_2C55 is stored but unconsumed
  // until the lighting step (research_map_render.md §"Lighting + visibility model").
  world.setResource(new TurnClock(100));
  world.setResource(new WorldClock({ Time_H: 9, Time_M: 0, Date_D: 1, Date_M: 1, Date_Y: 161 }));
  world.registerComponent(Position).registerComponent(Renderable)
       .registerComponent(ObjType).registerComponent(Status)
       .registerComponent(Amount).registerComponent(Actor)
       .registerComponent(Schedule)
       .registerComponent(Container).registerComponent(ContainedIn)
       .registerComponent(PartyMember);
  world.setResource(new Party());                 // I-8b: singleton party state (activeIndex, mode)
  const uiStack = new UIStack(world, document.getElementById('ui-root'));
  window.__U6 = { world, tileRegistry: world.getResource(TileRegistry), mapLevel: world.getResource(MapLevel), spatial: world.getResource(SpatialIndex), clock: world.getResource(WorldClock), party: world.getResource(Party), schedules, objlist, actorIndex: world.getResource(ActorIndex), inventoryOf: (h) => inventoryOf(world, h), uiStack };

  const { actors, scheduled, party } = loadActors(world, objlist);
  log(`\nLoaded ${actors} on-map NPCs from objlist (${scheduled} with schedules, ${party} party members).`, 'ok');

  // I-5e: NPC schedule system. Hooks WorldClock.onHour; snaps eligible NPCs to
  // their resolved slot position. Returned stats object is mutated each tick.
  const npcScheduleStats = installNpcScheduleSystem(world);
  window.__U6.npcScheduleStats = npcScheduleStats;

  await startRender(world, { npcScheduleStats, objlist, schedules, uiStack });
}

// I-6 verification: dump party inventories (I-6a) + a sampling of object
// containers (I-6b). All inspection lives in the console; entries are reachable
// interactively via window.__U6.inventoryOf(handle).
function verifyInventory(world, objlist) {
  const actorIndex = world.getResource(ActorIndex);

  // ContainedIn total + breakdown (NPC-held vs object-held).
  const csStore = world.store(ContainedIn);
  let totalContained = 0, npcHeld = 0, objHeld = 0;
  for (const id of world.query(ContainedIn)) {
    totalContained++;
    const holder = csStore.holder[id];
    if (world.has(holder, Actor)) npcHeld++; else objHeld++;
  }
  log(`\nI-6 inventory: ${totalContained} ContainedIn (${npcHeld} NPC-held, ${objHeld} object-held).`, 'ok');

  // Party inventory dump (I-6a).
  console.group('I-6a — party inventory dump');
  for (let i = 0; i < objlist.partySize; i++) {
    const slotId = objlist.party[i];
    const a = objlist.actors[slotId];
    const handle = actorIndex.get(slotId);
    if (handle === undefined) { console.log(`#${slotId} ${a.name}: off-map (no entity)`); continue; }
    const items = inventoryOf(world, handle);
    console.log(`#${slotId} ${a.name} @ (${a.x},${a.y},${a.z}): ${items.length} item${items.length === 1 ? '' : 's'}`, items);
  }
  console.groupEnd();

  // Object-container dump (I-6b). Walk query(Container), skip NPCs, show
  // type + position + contents for the first 12 to keep the log finite.
  console.group('I-6b — object container dump (first 12 non-NPC containers)');
  const objStore = world.store(ObjType);
  const posStore = world.store(Position);
  let shown = 0;
  for (const id of world.query(Container)) {
    if (world.has(world.handleOf(id), Actor)) continue;
    if (shown++ >= 12) break;
    const handle = world.handleOf(id);
    const items = inventoryOf(world, handle);
    const hasPos = world.has(handle, Position);
    const posStr = hasPos ? `@(${posStore.x[id]},${posStore.y[id]},${posStore.z[id]})` : '@(nested)';
    console.log(`obj#${objStore.objNumber[id]}/f${objStore.frame[id]} ${posStr}: ${items.length} item${items.length === 1 ? '' : 's'}`, items);
  }
  console.groupEnd();
}

// I-1c/I-2b: terrain + world objects on screen. Build the GPU atlas + palette, place
// the camera at Britain's default origin, demand-load the OBJBLK regions in view, then
// register CameraSystem + RenderSystem(s) and drive a continuous rAF loop. Drag to pan.
async function startRender(world, { npcScheduleStats, objlist, schedules, uiStack } = {}) {
  const canvas = document.getElementById('screen');
  canvas.style.display = 'block';

  const reg = world.getResource(TileRegistry);
  const renderer = new TileRenderer(canvas, { tileSize: 16, tilesPerRow: 64, tileCount: 2048 });
  renderer.uploadAtlas(reg);
  renderer.uploadPalette(reg.palette);
  const ts = renderer.tileSize;

  // I-8a: the camera follows the active party member (Avatar = party slot 0),
  // centered on its cell — source keeps MapX/MapY (the view center) = the active
  // member's position (seg_1E0F.c:817-818). centerOn() is reused on every step.
  const camera = new Camera();
  world.setResource(camera);
  const actorIndex = world.getResource(ActorIndex);
  const avatarRef = { handle: actorIndex.get(objlist.party[0]) };
  const posStore = world.store(Position);
  const centerOn = (tx, ty) => {
    camera.worldX = tx * ts + ts / 2 - canvas.width / 2;
    camera.worldY = ty * ts + ts / 2 - canvas.height / 2;
  };
  const avatarIdx = avatarRef.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (avatarIdx !== -1) {
    centerOn(posStore.x[avatarIdx], posStore.y[avatarIdx]);
  } else {
    camera.worldX = 276 * ts; camera.worldY = 367 * ts;     // fall back to Britain's default origin
    log('Avatar not on-map (party slot 0) — camera at default origin; movement disabled.', 'warn');
  }
  window.__U6.renderer = renderer;
  window.__U6.camera = camera;
  window.__U6.avatarRef = avatarRef;

  // Demand-load the OBJBLK regions overlapping the initial viewport, then the
  // StreamingSystem keeps loading regions as the camera pans into them.
  const { objects: objCount, items: itemCount, contained: containedCount } = await ensureRegionsInView(world, camera, canvas, renderer.tileSize);
  log(`Loaded ${objCount} world objects + ${itemCount} carried + ${containedCount} container-held in the initial view.`, 'ok');
  verifyInventory(world, objlist);

  // I-8a: avatar movement. installAvatarMovement wires the keydown handler
  // (8-dir; arrows = cardinals, numpad = diagonals) and returns the per-turn move
  // system. Registered BEFORE the clock so the avatar steps, then time advances
  // within the same turn. Ignored while a modal (inspector) is open.
  // I-8d: after the avatar (active leader) steps, the companions take one step
  // toward their formation slots behind it (MoveFollowers). onMove composes the
  // camera recenter + the follow step.
  const moveFollowers = installMoveFollowers(world);
  const avatarMoveSystem = avatarIdx !== -1
    ? installAvatarMovement(world, {
        avatarRef,
        onMove: (x, y) => { centerOn(x, y); moveFollowers(avatarRef.handle, 0); },
        onIdle: () => settleParty(world),               // I-8e: party plants its feet when idle
        isBlocked: () => !uiStack.isEmpty(),
      })
    : null;
  if (avatarMoveSystem) world.addSimSystem(avatarMoveSystem);     // consume the pending step
  world.addSimSystem(makeWorldClockSystem());                      // per turn: clock.advance(1)
  world.addRenderSystem(makeTileAnimationSystem());                // advance animdata -> reg.animDirty
  world.addRenderSystem(makePaletteCycleSystem(renderer));         // rotate water/lava palette (shimmer)
  world.addRenderSystem(makeCameraSystem(1024 * 16, 1024 * 16));   // clamp camera to world bounds
  world.addRenderSystem(makeStreamingSystem(canvas, ts));          // load regions entering the view
  world.addRenderSystem(makeRenderSystem(renderer));               // terrain: layers 0 (water base) + 1 (shore)
  world.addRenderSystem(makeWorldRenderSystem(renderer));          // objects + NPCs: per-cell painter, layers 2-5
  world.addRenderSystem(() => renderer.render());                  // present

  // I-3 dev HUD: clock text + ±/pause controls + I-5f schedule-stats line.
  // Permanent dev affordance per CLAUDE.md §"Modern-browser UX".
  installDevHud(world, {
    hudEl:        document.getElementById('clock-hud'),
    textEl:       document.getElementById('clock-text'),
    controlsEl:   document.getElementById('clock-controls'),
    npcStatsEl:   document.getElementById('npc-stats'),
    npcScheduleStats,
  });

  // I-4d cell probe + I-5f per-NPC schedule line + canvas drag-to-pan.
  // Returned handle exposes isDragging() + getLastCell() for the I-7 hotkey.
  const probe = installDevProbe(world, {
    canvas, ts,
    probeEl: document.getElementById('probe-text'),
    cellEl:  document.getElementById('probe-cell'),
    objlist, schedules,
  });

  // I-7c: "look" hotkey. Hover any cell, press I -> inspector opens on the
  // source-faithful pick for that cell. Gated on:
  //   (a) UIStack is empty — when a modal is open, the substrate's own
  //       keydown handler is in front and routes keys to the top modal.
  //   (b) probe not mid-drag — no spurious inspect mid-pan.
  //
  // Pick rule, derived from source's mkMouseSelection -> C_2337_08F1
  // (seg_2337.c:365) + COMBAT_canSee (seg_2337.c:340):
  //   1. Gather candidates from 4 anchor cells (own + 3 SE neighbors whose
  //      double-tile may extend back into (x,y)). Source's NextLoc
  //      (seg_1184.c:211) walks a single chain that already includes these.
  //   2. Within each candidate, iterate spatial.at FORWARD — spatial.at[0]
  //      is the chain head, matching source's FindLoc first-walk order.
  //      Under our insert rules: initial-load is in OBJBLK file order
  //      (insert/push); runtime move is at-head (insertAtHead).
  //   3. IsTileIgnore tiles are DEPRIORITIZED, not absolutely skipped — source's
  //      C_2337_08F1 first-pass saves the first Ignore-flagged candidate as a
  //      fallback (objNum_3) and only returns it if no canSee object is found
  //      anywhere in the chain. So Ignore tiles act like "carpet under a sword"
  //      — invisible to LOOK when there's a real target above, but pickable
  //      when they're all the cell has (e.g. an egg sitting alone on the floor).
  //   4. NPCs override objects — C_2337_08F1's second pass keeps walking for an
  //      NPC and any NPC wins. We track firstNpc / firstObj / firstIgObj
  //      separately and return firstNpc ?? firstObj ?? firstIgObj.
  const rendStore = world.store(Renderable);
  const inspectAtCell = (x, y) => {
    const spatial = world.getResource(SpatialIndex);
    let firstObj = null, firstNpc = null, firstIgObj = null;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const ents = spatial.at(x + dx, y + dy);
        if (!ents) continue;
        for (const handle of ents) {
          const i = world.resolve(handle);
          if (i === -1) continue;
          let landedTile = -1;
          forEachOccupiedCell(reg, rendStore.tileId[i], x + dx, y + dy,
            (t, c, r) => { if (c === x && r === y) landedTile = t; });
          if (landedTile === -1) continue;
          if (world.has(handle, Actor)) {
            if (firstNpc === null) firstNpc = handle;
          } else if (reg.isTileIgnore(landedTile)) {
            if (firstIgObj === null) firstIgObj = handle;
          } else if (firstObj === null) {
            firstObj = handle;
          }
        }
      }
    }
    const pick = firstNpc ?? firstObj ?? firstIgObj;
    if (pick !== null) openInspector(world, pick, uiStack, { reg, objlist });
  };
  document.addEventListener('keydown', (e) => {
    if (!uiStack.isEmpty()) return;
    if (probe.isDragging()) return;
    if (e.key.toLowerCase() !== 'i') return;
    const cell = probe.getLastCell();
    if (!cell) return;
    inspectAtCell(cell.x, cell.y);
    e.preventDefault();
  });

  let last = performance.now();
  (function loop(t) { world.frame(t - last, t); last = t; requestAnimationFrame(loop); })(last);
  log('\nRendering started — drag the map to pan. Hover a cell + press I to inspect.', 'ok');
}

// --- the status panel doubles as the dropzone (whole panel is a drop target, even
//     collapsed). Dropping expands it + stores the files; if the app was already
//     loaded, reload to apply the updated data. (bring-your-own-data) ---
checklistEl.addEventListener('dragover', (e) => { e.preventDefault(); checklistEl.classList.add('drag'); });
checklistEl.addEventListener('dragleave', (e) => { if (!checklistEl.contains(e.relatedTarget)) checklistEl.classList.remove('drag'); });
checklistEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  checklistEl.classList.remove('drag');
  checklistEl.open = true;            // expand so the result is visible
  for (const file of e.dataTransfer.files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'zip') {
      // Unpack the zip; store only entries we recognise (basename-matched).
      let entries;
      try { entries = await unzip(await file.arrayBuffer()); }
      catch (err) { log(`could not read ${file.name}: ${err.message}`, 'miss'); continue; }
      for (const { name, bytes } of entries) {
        const base = name.split(/[/\\]/).pop().toLowerCase();
        if (isKnown(base)) {
          await U6DB.set(base, bytes);
          log(`unzipped ${base} (${bytes.length} bytes)`);
        }
      }
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await U6DB.set(file.name, bytes);
      log(`stored ${file.name.toLowerCase()} (${bytes.length} bytes)`);
    }
  }
  if (loaded) { location.reload(); return; }   // already running → reload to apply the updated data
  await updateChecklist();
});

updateChecklist();
