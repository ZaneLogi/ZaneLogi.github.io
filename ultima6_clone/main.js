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
import { decodeObjlist, applyNewGameDefaults } from './assets/objlist.js';
import { Portraits } from './assets/portrait.js';
import { ConversationScripts } from './assets/converse.js';
import { TileRegistry } from './resources/tile_registry.js';
import { MapLevel } from './resources/map_level.js';
import { SpatialIndex } from './resources/spatial_index.js';
import { unzip } from './assets/zip.js';
import { TileRenderer } from './view/renderer.js';
import { Camera } from './resources/camera.js';
import { Viewport } from './resources/viewport.js';
import { WorldClock } from './resources/world_clock.js';
import { WorldSpeed } from './resources/world_speed.js';
import { MoonGates } from './resources/moon_gates.js';
import { makeRenderSystem } from './systems/render_system.js';
import { makeCameraSystem } from './systems/camera_system.js';
import { makeTileAnimationSystem } from './systems/tile_animation_system.js';
import { makePaletteCycleSystem } from './systems/palette_cycle_system.js';
import { makeWorldRenderSystem } from './systems/world_render_system.js';
import { makeWorldClockSystem } from './systems/world_clock_system.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, Schedule, Container, ContainedIn, PartyMember, AIMode, Destination, Alignment, MoveSpeed, Spawned } from './components/components.js';
import { Party } from './resources/party.js';
import { Paths } from './resources/paths.js';
import { Schedules } from './resources/schedules.js';
import { ActorIndex } from './resources/actor_index.js';
import { installNpcScheduleSystem } from './systems/npc_schedule_system.js';
import { installMoonPhaseSystem } from './systems/moon_phase_system.js';
import { installNpcTickSystem } from './systems/npc_tick_system.js';
import { installEggPartFollowSystem, hatchAroundAvatar, cullAroundAvatar } from './systems/egg.js';
import { installAvatarMovement } from './systems/avatar_move_system.js';
import { installMoveFollowers, settleParty } from './systems/move_followers.js';
import { loadActors, ensureRegionsInView, makeStreamingSystem, inventoryOf } from './world_loader.js';
import { installDevHud } from './view/dev_hud.js';
import { installDevProbe } from './view/dev_probe.js';
import { installNpcInspect } from './view/dev_npc_inspect.js';
import { UIStack } from './view/ui_stack.js';
import { openInspector } from './view/inspector.js';
import { openInventoryWindow, openMovePicker } from './view/inventory_picker.js';
import { openPartyRoster, openZStats, openRecipientPicker, makePartyMemberList } from './view/party_status.js';
import { openSpellbook } from './view/spellbook_window.js';
import { reagentMaskFromCarried } from './resources/spells.js';
import { castSpell as dispatchCast } from './systems/cast_spell.js';
import { MessageLog } from './resources/message_log.js';
import { installMessageChannel } from './view/message_channel.js';
import { Commands } from './resources/commands.js';
import { makePickAtCell } from './systems/cell_pick.js';
import { installCommandDispatch } from './systems/command_dispatch.js';
import { Books } from './resources/books.js';
import { registerUseHandlers } from './systems/use_handlers.js';
import { setActiveLevel } from './systems/level_change.js';
import { installBlueGateSpawn, checkGateEntry, castRedGate } from './systems/moongate_runtime.js';
import { checkDungeonEntry } from './systems/use_ladder.js';   // I-19g: walk onto a dungeon/cave hole -> descend
import { installMoongateHud } from './view/moongate_hud.js';
import { serializeWorld, restoreWorld } from './systems/persistence/snapshot.js';

// Gating set for terrain + flags (I-1b) + world objects (I-2) + NPC schedules (I-5) +
// conversation portraits/scripts (I-12/I-13). Names are the original U6 filenames, lowercased.
const REQUIRED = ['maptiles.vga', 'objtiles.vga', 'tileindx.vga', 'masktype.vga', 'animmask.vga', 'animdata', 'u6pal', 'chunks', 'map', 'tileflag', 'basetile', 'objlist', 'schedule', 'look.lzd', 'portrait.a', 'portrait.b', 'converse.a', 'converse.b'];
// look.lzd holds the display/look strings the inspector + NPC names need. portrait.{a,b}
// hold the NPC conversation portraits (56x64 one-byte-per-pixel, LZW blocks in a lib_32;
// docs/research_portraits.md); converse.{a,b} hold the NPC conversation scripts (LZW lib_32,
// keyed by NPC number — .a ids 0..0x62, .b 0x63..0xDF; docs/research_i13_conversation_vm.md).
// Both are still decoded LAZILY per-NPC (decode-once on first talk) — but REQUIRED to be
// PRESENT: I-13's conversation experience needs them, so a complete drop gates readiness
// (decision 2026-06-07, Zane — supersedes I-12's "portraits are OPTIONAL/never block Britain").
// OPTIONAL files are stored + loaded raw but do NOT gate readiness. portrait.z holds the
// Avatar's own portrait (char-creation choice in the save); the talk target is never the
// Avatar, so it stays deferred/optional (research_portraits.md). book.dat holds the in-game
// book/sign text read by LOOK (seg_27a1.c C_27A1_078F: an offset table keyed by the object's
// quality → raw NUL-terminated text); OPTIONAL so it never gates Britain — the LOOK book-read
// simply no-ops when it's absent.
const OPTIONAL = ['portrait.z', 'book.dat'];

// OBJBLK region files (64 surface objblk[col][row] + 5 dungeon objblk[level]i).
// Demand-loaded per region from U6DB, so they gate by presence-count, not the
// all-or-nothing REQUIRED set.
const OBJBLK_NAMES = [];
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
  OBJBLK_NAMES.push(`objblk${String.fromCharCode(97 + c)}${String.fromCharCode(97 + r)}`);
for (let d = 0; d < 5; d++) OBJBLK_NAMES.push(`objblk${String.fromCharCode(97 + d)}i`);

const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);   // these + any objblk* are extracted from a dropped zip
const isKnown = (base) => KNOWN.has(base) || base.startsWith('objblk');

// save/load (systems/persistence/snapshot.js). A pending save dropped via Import is
// stashed in U6DB under this reserved key and consumed once on the next boot; the '__'
// prefix keeps it out of the artifact checklist + the zip basename filter.
const RESTORE_KEY = '__pending_restore.json';

// A cheap, stable fingerprint of the loaded data set (FNV-1a over objlist bytes), stamped
// into each save so Import can warn when a save is loaded against different U6 files.
function artifactStamp(fileMap) {
  const b = fileMap.get('objlist');
  if (!b) return null;
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return `objlist:${b.length}:${(h >>> 0).toString(16)}`;
}

// Read + consume (one-shot) a pending save stashed by Import. Returns the parsed snapshot
// or null. Deleting the key means a later plain reload starts a fresh game, not a re-restore.
async function consumePendingRestore(stamp) {
  const bytes = await U6DB.get(RESTORE_KEY);
  if (!bytes) return null;
  await U6DB.del(RESTORE_KEY);
  let snap = null;
  try { snap = JSON.parse(new TextDecoder().decode(bytes)); }
  catch (err) { log(`save: could not parse pending save (${err.message}) — starting fresh`, 'miss'); return null; }
  if (snap && snap.artifacts && stamp && snap.artifacts !== stamp)
    log('⚠ this save was made against different U6 data files — restoring anyway', 'warn');
  return snap;
}

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

// Export = serialize the live world to a downloaded JSON file; Import = stash a chosen
// JSON under RESTORE_KEY and reload, so the boot path's consumePendingRestore -> restoreWorld
// applies it. (systems/persistence/snapshot.js; Blob-download pattern per ../ultima6/map_viewer.js.)
function installSaveControls(world, stamp, objlist, notify) {
  const root = document.getElementById('save-controls');
  if (!root) return;
  const exportBtn = root.querySelector('[data-act="export"]');
  const importBtn = root.querySelector('[data-act="import"]');
  const fileInput = document.getElementById('save-file');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    const snap = serializeWorld(world, { artifactStamp: stamp, objlist });
    const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url; a.download = `u6save-${ts}.json`; a.click();
    URL.revokeObjectURL(url);
    if (notify) notify(`Saved ${snap.entities.length} entities → ${a.download}`);
  });
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      await U6DB.set(RESTORE_KEY, new Uint8Array(await file.arrayBuffer()));
      log(`save: ${file.name} queued — reloading to restore…`, 'ok');
      location.reload();
    });
  }
}

async function load() {
  document.getElementById('app').style.display = 'grid';   // reveal the shell
  document.getElementById('dev-block').hidden = false;     // I-18a: reveal the floating dev panel (boot log lives in it)
  log('Decoding…', 'warn');
  const fileMap = await buildFileMap();
  const stamp = artifactStamp(fileMap);
  const snapshot = await consumePendingRestore(stamp);   // null on a fresh boot

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
  applyNewGameDefaults(objlist);   // uncreated factory copy (D_2CCB==0) -> new-game state: globals (karma 75, clock) + avatar EXP 370/level 3 (research_save_load.md)
  const schedules = Schedules.fromBytes(fileMap.get('schedule'));

  const world = new World();
  world.setResource(new TileRegistry({ tiles, flags, palette, anim, baseTile }));
  world.setResource(new MapLevel(u6map, 0));
  world.setResource(new SpatialIndex());
  world.setResource(schedules);
  world.setResource(new ActorIndex());           // I-6a: slot-id -> NPC handle (populated by loadActors)
  // I-3: turn-driver heartbeat (idle sample interval). I-14d DECOUPLES the game clock from
  // it — the clock now advances on its own real-time cadence scaled by WorldSpeed
  // (world_clock_system.js CLOCK_MIN_PER_REAL_SEC), so the 100 ms heartbeat is just the
  // sim-sampling rate, not the clock rate (the old "1 min per 0.1s" runaway is gone). The
  // start time/date are SEEDED from the objlist globals (D_2C4A.c defaults for a factory
  // copy: 08:00, day 4/7/161); a restored save overwrites this WorldClock below. D_2C55 is
  // stored but unconsumed until the lighting step (research_map_render.md §"Lighting").
  world.setResource(new TurnClock(100));
  world.setResource(new WorldClock({
    Time_H: objlist.globals.timeHour, Time_M: objlist.globals.timeMinute,
    Date_D: objlist.globals.dateDay, Date_M: objlist.globals.dateMonth, Date_Y: objlist.globals.dateYear,
  }));
  world.setResource(new WorldSpeed(1));           // I-14d: master pace scalar (NPC rate + clock); slider-driven
  world.setResource(new MoonGates());             // I-moongate: blue-network endpoints (D_2C74, seeded from constants) + moon phases
  world.registerComponent(Position).registerComponent(Renderable)
       .registerComponent(ObjType).registerComponent(Status)
       .registerComponent(Amount).registerComponent(Actor)
       .registerComponent(Schedule)
       .registerComponent(Container).registerComponent(ContainedIn)
       .registerComponent(PartyMember)
       .registerComponent(AIMode).registerComponent(Destination)    // I-9: NPC pathfinding state
       .registerComponent(Alignment)                                // I-11a: NPCStatus alignment (carried from objlist)
       .registerComponent(MoveSpeed)                                // I-14: DEXTE-paced accumulator state
       .registerComponent(Spawned);                                 // I-egg: egg-hatched temporary creatures (cull key + occupancy)
  world.setResource(new Party());                 // I-8b: singleton party state (activeIndex, mode)
  world.setResource(new Paths());                 // I-9c: per-NPC pathfinding state (handle -> {dirs, counter, ...})
  world.setResource(new MessageLog());            // I-10a: gameplay message channel (CON_printf analog)
  world.setResource(new Commands());              // I-10b: object-action dispatch registries
  const uiStack = new UIStack(world, document.getElementById('ui-root'));
  window.__U6 = { world, tileRegistry: world.getResource(TileRegistry), mapLevel: world.getResource(MapLevel), spatial: world.getResource(SpatialIndex), clock: world.getResource(WorldClock), party: world.getResource(Party), schedules, objlist, actorIndex: world.getResource(ActorIndex), inventoryOf: (h) => inventoryOf(world, h), uiStack };

  if (snapshot) {
    // Restore replaces the artifact-derived entity load: the full snapshot is authoritative,
    // and its loadedRegions gate the streamer so pristine objblk neither overwrites mutations
    // nor resurrects deletions (research_save_load.md §"Object deletion"). NPCs + world objects
    // come from the save; static content (tiles/map/schedule table) still comes from artifacts.
    restoreWorld(world, snapshot, { objlist });
    const clk = world.getResource(WorldClock);
    log(`\nRestored save: ${snapshot.entities.length} entities, clock ${String(clk.Time_H).padStart(2, '0')}:${String(clk.Time_M).padStart(2, '0')}.`, 'ok');
  } else {
    const { actors, scheduled, party } = loadActors(world, objlist);
    log(`\nLoaded ${actors} on-map NPCs from objlist (${scheduled} with schedules, ${party} party members).`, 'ok');
  }

  // I-5e: NPC schedule system. Hooks WorldClock.onHour; snaps eligible NPCs to
  // their resolved slot position. Returned stats object is mutated each tick.
  const npcScheduleStats = installNpcScheduleSystem(world);
  window.__U6.npcScheduleStats = npcScheduleStats;

  // I-moongate (b): moon-phase clock. Registers the WorldClock.onHour recompute +
  // does an initial sync (so a restored game's phases are valid before the next hour).
  installMoonPhaseSystem(world);

  // I-12c: conversation portraits — raw bytes (OPTIONAL set) decoded lazily by the
  // dialog window through u6pal (research_portraits.md). Absent files -> blank box.
  const portraits = new Portraits({
    a: fileMap.get('portrait.a'), b: fileMap.get('portrait.b'), z: fileMap.get('portrait.z'),
    palette, avatarPortrait: objlist.globals.avatarPortrait,   // I-18f: D_2CCB -> the Avatar's ZSTATS face
  });

  // I-13d: conversation scripts — raw converse.a/.b bytes, decoded lazily per-NPC
  // by the conversation VM on talk (assets/converse.js).
  const scripts = new ConversationScripts({ a: fileMap.get('converse.a'), b: fileMap.get('converse.b') });
  // I-book: BOOK.DAT book/sign text (OPTIONAL — null when not dropped; LOOK-read no-ops then).
  const books = new Books(fileMap.get('book.dat'));

  await startRender(world, { npcScheduleStats, objlist, schedules, uiStack, portraits, scripts, books, restored: !!snapshot, artifactStamp: stamp });
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
async function startRender(world, { npcScheduleStats, objlist, schedules, uiStack, portraits, scripts, books, restored, artifactStamp } = {}) {
  const canvas = document.getElementById('screen');   // shown via the #app shell reveal in load()

  // I-10a: gameplay message channel. Render-flush installer (mirrors installDevHud);
  // window.__U6.message lets the I-10b dispatcher + live preview-eval emit lines.
  const message = installMessageChannel(world, { el: document.getElementById('messages') });
  window.__U6.message = message;

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

  // Render-to-fit (Design 1, dpr=1): size the canvas drawing buffer to its on-screen CSS
  // box so the map fills the available space — more of Britain on a big window, fewer
  // tiles on a small one, always 1:1 crisp (dpr pinned to 1, matching legacy
  // map_viewer.js's deliberate choice for a variable-viewport tile renderer). The render
  // systems already derive their visible cols/rows from canvas.width/height each frame, so
  // resizing the buffer is all that's needed. The Viewport resource mirrors the extent for
  // sim systems (the I-9h teleport guard). See resources/viewport.js.
  const viewport = new Viewport();
  world.setResource(viewport);
  function fitCanvas() {
    const w = Math.floor(canvas.clientWidth), h = Math.floor(canvas.clientHeight);
    if (w === 0 || h === 0) return false;                  // not laid out yet (app still hidden)
    if (w === canvas.width && h === canvas.height) return false;
    canvas.width = w; canvas.height = h;                   // grows/shrinks the GL drawing buffer
    renderer.resize(w, h);                                 // gl.viewport + u_resolution
    viewport.cols = Math.ceil(w / ts);
    viewport.rows = Math.ceil(h / ts);
    return true;
  }
  fitCanvas();                                             // fit before the initial center + region load

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
    // I-19f: a save made in a dungeon restores the avatar at z>0 — bring the active level
    // with it (else terrain/render show the surface). loadedDungeons was re-marked by
    // restoreWorld, so this won't re-load the (already-restored) dungeon objects.
    if (restored && posStore.z[avatarIdx] !== 0) setActiveLevel(world, posStore.z[avatarIdx]);
  } else {
    camera.worldX = 276 * ts; camera.worldY = 367 * ts;     // fall back to Britain's default origin
    log('Avatar not on-map (party slot 0) — camera at default origin; movement disabled.', 'warn');
  }
  window.__U6.renderer = renderer;
  window.__U6.camera = camera;
  window.__U6.avatarRef = avatarRef;

  // I-19a dev hook: jump the active level (and optionally the avatar's cell) to eyeball
  // dungeon terrain before the ladder handler exists. setLevel(z[, x, y]) sets the active
  // level + the avatar's Position.z, moves it (if x/y given) and recenters. Object loading
  // (I-19c) + the z-filter (I-19b) are not wired yet, so on a dungeon level you see terrain
  // (correct, 256-wrap) possibly with surface objects bleeding through until I-19b lands.
  window.__U6.setLevel = (z, x, y) => {
    setActiveLevel(world, z);
    const ai = avatarRef.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
    if (ai !== -1) {
      if (x !== undefined) posStore.x[ai] = x;
      if (y !== undefined) posStore.y[ai] = y;
      posStore.z[ai] = z;
      centerOn(posStore.x[ai], posStore.y[ai]);
    }
    return `active level → ${z}`;
  };

  // Keep the buffer fitted as the window (or panel reflow) changes the map cell's size;
  // recenter on the avatar so the view grows/shrinks symmetrically around the player. The
  // rAF render loop redraws next frame and the streaming system loads newly-revealed regions.
  const mapRegion = document.getElementById('map-region');
  if (mapRegion && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!fitCanvas()) return;
      const ai = avatarRef.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
      if (ai !== -1) centerOn(posStore.x[ai], posStore.y[ai]);
    });
    ro.observe(mapRegion);
  }

  // Demand-load the OBJBLK regions overlapping the initial viewport, then the
  // StreamingSystem keeps loading regions as the camera pans into them.
  const { objects: objCount, items: itemCount, contained: containedCount } = await ensureRegionsInView(world, camera, canvas, renderer.tileSize);
  log(`Loaded ${objCount} world objects + ${itemCount} carried + ${containedCount} container-held in the initial view.`, 'ok');
  verifyInventory(world, objlist);

  // I-egg (c): hatch the avatar's STARTING area on boot — the avatar's initial placement is its
  // "entry into new territory" (source hatches on area-load, seg_101C.c:191). This fires the
  // opening throne-room gargoyle ambush (the LOCAL egg at (307,350), research_egg.md §7) and any
  // off-screen eggs in the start region. Camera pans afterward never hatch — only avatar moves do.
  if (avatarIdx !== -1) hatchAroundAvatar(world, posStore.x[avatarIdx], posStore.y[avatarIdx], posStore.z[avatarIdx], { message });

  // I-8a: avatar movement. installAvatarMovement wires the keydown handler
  // (8-dir; arrows = cardinals, numpad = diagonals) and returns the per-turn move
  // system. Registered BEFORE the clock so the avatar steps, then time advances
  // within the same turn. Ignored while a modal (inspector) is open.
  // I-8d: after the avatar (active leader) steps, the companions take one step
  // toward their formation slots behind it (MoveFollowers). onMove composes the
  // camera recenter + the follow step.
  const moveFollowers = installMoveFollowers(world);
  // I-moongate (c): the gate-entry context (avatar/camera/follow + message channel) the
  // post-move check + GateTravel need — the same shape the USE dispatch threads.
  const moonCtx = { avatarRef, recenter: centerOn, moveFollowers, message };
  const avatarMoveSystem = avatarIdx !== -1
    ? installAvatarMovement(world, {
        avatarRef,
        onMove: (x, y) => {
          centerOn(x, y); moveFollowers(avatarRef.handle, 0);
          // C_1E0F_184D post-move tile check: a moongate travels (I-moongate c); else a
          // dungeon/cave hole descends (I-19g). Source dispatches one special object per
          // tile (breaks), so `||` skips the hole check when a gate already fired.
          checkGateEntry(world, moonCtx) || checkDungeonEntry(world, moonCtx);
          // I-egg (c): hatch eggs around the avatar's CURRENT cell (checkGateEntry may have just
          // teleported it; a teleport already force-hatched the dest, so this live-pos scan is then
          // a harmless idempotent no-op). Off-screen/LOCAL eggs in the avatar's area hatch + walk in.
          const ai = world.resolve(avatarRef.handle);
          if (ai !== -1) {
            hatchAroundAvatar(world, posStore.x[ai], posStore.y[ai], posStore.z[ai], { message });   // I-egg (c/f): hatch + Shamino's approach warning
            cullAroundAvatar(world, posStore.x[ai], posStore.y[ai], posStore.z[ai]);   // I-egg (e): reap spawns left behind + re-arm/delete their eggs
          }
        },
        onIdle: () => settleParty(world),               // I-8e: party plants its feet when idle
        isBlocked: () => !uiStack.isEmpty(),
      })
    : null;
  if (avatarMoveSystem) world.addSimSystem(avatarMoveSystem);     // consume the pending step
  // I-moongate (c): blue-gate spawn — registers the hourly reconcile + a per-turn
  // level-change watch that re-spawns on entering/leaving a dungeon (slot 6 is z=1).
  // Registered after installMoonPhaseSystem (load()) so its onHour runs after the phase
  // recompute; the returned sim system's first tick reconciles the initial gate set.
  world.addSimSystem(installBlueGateSpawn(world));
  // I-9d: NPC pathfinding tick. Each turn, AI_FINDPATH NPCs build a path in their own
  // 40x40 window and walk it (AI_ONPATH); far/unreachable slots snap. Sim-list system
  // so it inherits the turn-driver gating (breathe<->pause). Runs after the avatar
  // step (so NPCs react in the same turn) and before the clock advance.
  const npcTick = installNpcTickSystem(world, { avatarRef });
  world.addSimSystem(npcTick.system);
  window.__U6.npcTickStats = npcTick.stats;
  world.addSimSystem(installEggPartFollowSystem(world));           // I-egg d-visual: multi-tile parts track their head (after the NPC tick that moved it)
  world.addSimSystem(makeWorldClockSystem());                      // per turn: clock.advance(1)
  world.addRenderSystem(makeTileAnimationSystem());                // advance animdata -> reg.animDirty
  world.addRenderSystem(makePaletteCycleSystem(renderer));         // rotate water/lava palette (shimmer)
  world.addRenderSystem(makeCameraSystem(ts));                     // wrap camera to the ACTIVE level (I-19a: 1024/256-tile torus)
  world.addRenderSystem(makeStreamingSystem(canvas, ts));          // load regions entering the view
  world.addRenderSystem(makeRenderSystem(renderer));               // terrain: layers 0 (water base) + 1 (shore)
  world.addRenderSystem(makeWorldRenderSystem(renderer));          // objects + NPCs: per-cell painter, layers 2-5
  world.addRenderSystem(() => renderer.render());                  // present

  // I-3 dev HUD: clock text + ±/pause controls + I-5f schedule-stats line.
  // Permanent dev affordance per CLAUDE.md §"Modern-browser UX".
  installDevHud(world, {
    hudEl:        document.getElementById('clock-strip'),   // I-18a: readout + .paused tint live in the strip now
    textEl:       document.getElementById('clock-text'),
    controlsEl:   document.getElementById('clock-controls'),
    npcStatsEl:   document.getElementById('npc-stats'),
    speedEl:      document.getElementById('world-speed'),         // I-14d WORLD_SPEED slider
    speedLabelEl: document.getElementById('world-speed-label'),
    npcScheduleStats,
    npcTickStats: npcTick.stats,
  });

  // I-moongate (h/g): the composited sky strip (clock panel) + the gate/phase readout
  // (dev panel). Both ride on the moon-phase clock (b).
  installMoongateHud(world, {
    skyEl:     document.getElementById('sky-view'),
    readoutEl: document.getElementById('moon-readout'),
    reg,
  });
  window.__U6.moonGates = world.getResource(MoonGates);   // dev: live D_2C74 + phases
  window.__U6.checkGateEntry = () => checkGateEntry(world, moonCtx);   // dev: run the post-move gate-entry check at the avatar's cell
  window.__U6.checkDungeonEntry = () => checkDungeonEntry(world, moonCtx);   // dev (I-19g): run the post-move dungeon/cave-entry check at the avatar's cell
  window.__U6.castRedGate = (tx, ty) => castRedGate(world, tx, ty, moonCtx);   // dev: cast a red gate at (tx,ty) (skips the Orb USE/5x5-pick UI)
  // dev: enable the Orb of the Moons without the Lord British conversation (sets
  // TalkFlags[5] bit 5, the in-game gate the LB setFlag opcode would set). I-moongate e.
  window.__U6.enableOrb = () => { objlist.actors[5].talkFlags = (objlist.actors[5].talkFlags || 0) | (1 << 5); return 'Orb enabled (TalkFlags[5] bit 5 set)'; };

  // I-18a: dev-panel toggle (strip "dev" button + backtick key). Plain show/hide — the panel
  // is NOT a UIStack modal (it must keep updating while the world ticks + never grab keys).
  const devBlock = document.getElementById('dev-block');
  const devToggle = document.getElementById('dev-toggle');
  const syncDevToggle = () => { if (devToggle) devToggle.textContent = devBlock.hidden ? 'dev ▸' : 'dev ▾'; };
  const toggleDev = () => { devBlock.hidden = !devBlock.hidden; syncDevToggle(); };
  if (devToggle) devToggle.addEventListener('click', toggleDev);
  document.addEventListener('keydown', (e) => {
    if (e.key !== '`') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;   // don't steal typing
    toggleDev();
    e.preventDefault();
  });
  syncDevToggle();

  // I-4d cell probe + I-5f per-NPC schedule line + canvas drag-to-pan.
  // Returned handle exposes isDragging() + getLastCell() for the I-7 hotkey.
  // `isVerbArmed` forward-refs `cmd` (assigned below) so the probe suppresses
  // drag-to-pan while a verb is armed — that state confirms with a click (I-10f).
  let cmd;
  const probe = installDevProbe(world, {
    canvas, ts,
    probeEl: document.getElementById('probe-text'),
    cellEl:  document.getElementById('probe-cell'),
    objlist, schedules,
    isVerbArmed: () => cmd?.isPending() ?? false,
  });

  // Read-only NPC inspection helpers on window.__U6 (inspectNpc / scanDungeonSchedules /
  // teleportSuppressed) — console/preview-eval tooling for schedules + the dungeon-safety
  // and teleport-guard checks. See view/dev_npc_inspect.js.
  installNpcInspect(world);

  // The inspector hotkey (I-7c) and the I-10b command dispatch share ONE cell
  // pick — the source-faithful 3-tier mkMouseSelection -> C_2337_08F1 rule now
  // lives in systems/cell_pick.js (generalized from the old inline inspectAtCell).
  const pickAtCell = makePickAtCell(world, reg);

  // I-10b: object-action dispatch core + verb-first front-end. Press U to arm
  // "Use" / L for "Look" (the #probe-cell highlight recolors + tags); confirm the
  // highlighted cell with Enter OR a left-click, Esc cancels; results + refusals
  // print to the message channel.
  cmd = installCommandDispatch(world, {
    pickAtCell, probe, canvas,
    cellEl: document.getElementById('probe-cell'),
    avatarRef, reg, objlist, message, uiStack, portraits, scripts, books,
    recenter: centerOn, moveFollowers,          // I-19d: the ladder handler teleports the party + follows the camera
  });
  window.__U6.books = books;        // dev: Books.get(quality) → raw BOOK.DAT text
  window.__U6.cmd = cmd;            // dev: live dispatch({verb, target}) + isPending()
  window.__U6.probe = probe;        // dev: isDragging() + getLastCell() (level-aware cursor cell)
  window.__U6.pickAtCell = pickAtCell;
  window.__U6.openInventoryWindow = (holder, onVerb) =>     // dev: open the I-10j verb-aware window
    openInventoryWindow(world, holder ?? avatarRef.handle, uiStack, { reg, objlist, onVerb: onVerb ?? ((v, i) => console.log('[inv]', v, i.handle)) });

  // I-10c: register the USE object-type handlers (door now; crank etc. follow).
  registerUseHandlers(world);
  window.__U6.commands = world.getResource(Commands);                          // dev: inspect the registries
  window.__U6.stores = { obj: world.store(ObjType), pos: world.store(Position), rend: world.store(Renderable), amount: world.store(Amount), status: world.store(Status) };
  window.__U6.findByObj = (objNumber) => {                                     // dev: locate every entity of an obj type
    const s = world.store(ObjType), ps = world.store(Position), as = world.store(Amount), cs = world.store(ContainedIn);
    const r = [];
    for (const id of world.query(ObjType)) {
      if (s.objNumber[id] !== objNumber) continue;
      const h = world.handleOf(id);
      const onMap = world.has(h, Position);
      r.push({ frame: s.frame[id], quality: as.quality[id], x: onMap ? ps.x[id] : undefined, y: onMap ? ps.y[id] : undefined, holder: world.has(h, ContainedIn) ? cs.holder[id] : undefined });
    }
    return r;
  };

  // Inspect hotkey (I): hover any cell, press I -> the full detail inspector modal
  // for the pick (NPC / item / container — obj#/status/position/contents). This is a
  // CLONE tool, deliberately DISTINCT from LOOK (L): source's LOOK is a pure scroll
  // verb (a description line, never a panel — C_27A1_0C67), so L prints a line and I
  // owns the structured detail / inventory view. Gated on (a) no modal open, (b) not
  // mid-pan, (c) no verb armed (the dispatch front-end owns the keyboard while aiming).
  document.addEventListener('keydown', (e) => {
    if (!uiStack.isEmpty()) return;
    if (probe.isDragging()) return;
    if (cmd.isPending()) return;
    if (e.key.toLowerCase() !== 'i') return;
    const cell = probe.getLastCell();
    if (!cell) return;
    const pick = pickAtCell(cell.x, cell.y);
    if (pick !== null) openInspector(world, pick, uiStack, { reg, objlist });
    e.preventDefault();
  });

  // I-spellbook: `c` opens the spellbook modal (same gate as `I`). The reagent tint reads the
  // party's carried reagents (informational only — no reagent gate). Sub-step a: EVERY spell
  // fizzles; the cast registry (no-target + targeted effects) replaces `castSpell` in b/c.
  function carriedReagentMask() {
    const objNums = new Set();
    const walk = (holder) => {
      for (const it of inventoryOf(world, holder)) {
        objNums.add(it.objNumber);
        if (world.has(it.handle, Container)) walk(it.handle);   // recurse into carried bags
      }
    };
    for (const id of world.query(PartyMember)) walk(world.handleOf(id));
    return reagentMaskFromCarried(objNums);
  }
  // Heal's party-member target (research_spellbook.md §3.4): a roster picker over the whole
  // party (the clone heals party-only, not source's at-range creature cursor). Calls onPick(slot).
  function pickHealTarget(onPick) {
    const el = document.createElement('div');
    el.className = 'ui-modal';
    const head = document.createElement('div');
    head.className = 'ui-name';
    head.textContent = 'Heal whom?';
    el.appendChild(head);
    const lc = makePartyMemberList({ reg, objlist, showHp: true, onSelect: (slot) => { uiStack.pop(); onPick(slot); } });
    el.appendChild(lc.el);
    const hint = document.createElement('div');
    hint.className = 'ui-hint';
    hint.textContent = '↑↓ select · Enter · Esc cancel';
    el.appendChild(hint);
    uiStack.push({ el, onKey: (e) => lc.onKey(e) });
  }
  // Gate Travel's phase pick (research_spellbook.md §3.3): source's "To phase " 1–8 prompt.
  // A digit-capture modal; on 1–8 → onPhase(n), Esc cancels (UIStack default pop).
  function promptPhase(onPhase) {
    const el = document.createElement('div');
    el.className = 'ui-modal';
    const head = document.createElement('div');
    head.className = 'ui-name';
    head.textContent = 'Gate Travel';
    el.appendChild(head);
    const body = document.createElement('div');
    body.className = 'ui-meta';
    body.textContent = 'To which moon phase? (1–8)';
    el.appendChild(body);
    const hint = document.createElement('div');
    hint.className = 'ui-hint';
    hint.textContent = '1-8 · Esc cancel';
    el.appendChild(hint);
    uiStack.push({ el, onKey: (e) => { if (/^[1-8]$/.test(e.key)) { e.preventDefault(); uiStack.pop(); onPhase(parseInt(e.key, 10)); } } });
  }
  // I-spellbook cast dispatch: no-target casts run immediately; Heal opens the roster picker;
  // Telekinesis/Unlock Magic arm the map cursor (cmd.armSpell); Gate Travel takes a phase digit.
  const castCtx = {
    message, avatarRef, tileSize: ts, objlist, pickHealTarget,
    recenter: centerOn, moveFollowers,                       // teleportParty (Gate Travel)
    armSpellCursor: (spellNum) => cmd.armSpell(spellNum),
    promptPhase,
  };
  function castSpell(spellNum) { dispatchCast(world, spellNum, castCtx); }
  document.addEventListener('keydown', (e) => {
    if (!uiStack.isEmpty()) return;
    if (probe.isDragging()) return;
    if (cmd.isPending()) return;
    if (e.key.toLowerCase() !== 'c') return;
    e.preventDefault();
    openSpellbook(uiStack, { haveMask: carriedReagentMask(), onCast: castSpell });
  });

  // I-18c/d/e — `P` opens the on-demand party roster (icon + name + HP). Selecting a member opens its
  // ZSTATS, stacked on the roster; `Tab` from ZSTATS opens that member's inventory (Tab/Esc returns), a
  // digit switches member in place, and in the inventory `D` drops / `G` gives. Gate matches `I`.
  function openMemberView(slot, rosterDepth) {
    // digit n → switch to member n: unwind the member view (ZSTATS + any open inventory) back to the
    // roster, then open member n's ZSTATS. Wired into BOTH faces — ZSTATS's onMember and the inventory's
    // onDigit — so the inventory's "1-N switch" hint is honoured. rosterDepth = the roster's stack depth.
    const switchMember = (n) => {
      const s = objlist.party[n - 1];
      if (s === undefined || n - 1 >= objlist.partySize) return;
      while (uiStack.depth() > rosterDepth) uiStack.pop();
      openMemberView(s, rosterDepth);
    };
    // The inventory is the `Tab` face of the member view. D → drop (detonate the whole modal chain to
    // the bare map, then arm the drop cursor — the accepted DROP asymmetry). G → an in-stack recipient
    // picker (party minus this giver); on a pick, give + rebuild this list (item gone) and stay here.
    const openInv = (cursorHandle) => {
      const holder = actorIndex.get(slot);
      if (holder === undefined) return;
      openInventoryWindow(world, holder, uiStack, {
        reg, objlist, tabBack: true, onDigit: switchMember, cursorHandle,
        holderStr: objlist.actors[slot]?.strength,   // I-18i: STR for the weight/encumbrance footer (root member only)
        onEquip: (item) => {                          // I-18j: `E` toggles ready/unready (the picker unwound to baseDepth first)
          cmd.equipToggle(item.handle, holder, objlist.actors[slot]?.strength);
          openInv(item.handle);                       // reopen the member view, rebuilt — keep the cursor on this item
        },
        onMove: (item, baseDepth) => {                // I-18k: `M` opens the "move to…" picker (move item in/out of a bag)
          if (item.equipped) { message('You must unready it first.', 'miss'); return; }   // a worn item can't go straight into a container
          const opened = openMovePicker(uiStack, world, {
            reg, objlist, item, holder, message,
            onMoved: () => { while (uiStack.depth() > baseDepth) uiStack.pop(); openInv(); },   // unwind the inv chain + reopen rebuilt
          });
          if (!opened) message('Nowhere to put it.', 'miss');   // top-level item + no containers
        },
        onVerb: (verb, item) => {
          if (verb !== 'drop') return;
          while (uiStack.depth() > 0) uiStack.pop();            // detonate the chain back to the map
          cmd.armDrop(item.handle);
        },
        onUse: (item) => {                            // inventory USE: detonate to the bare map (the handler
          while (uiStack.depth() > 0) uiStack.pop();  // may arm a map follow-up — the Orb's "Where:" cast cursor)
          cmd.useItem(item.handle);
        },
        onGive: (item) => {
          openRecipientPicker(uiStack, {
            reg, objlist, giverSlot: slot,
            onPick: (recipientSlot) => {
              cmd.giveItem(item.handle, holder, actorIndex.get(recipientSlot));
              uiStack.pop();        // the picker
              uiStack.pop();        // the now-stale inventory
              openInv();            // rebuild the giver's inventory (item gone), stay here
            },
          });
        },
      });
    };
    openZStats(uiStack, { reg, objlist, portraits, slot, onTab: openInv, onMember: switchMember });
  }
  document.addEventListener('keydown', (e) => {
    if (!uiStack.isEmpty()) return;
    if (probe.isDragging()) return;
    if (cmd.isPending()) return;
    if (e.key.toLowerCase() !== 'p') return;
    e.preventDefault();
    openPartyRoster(uiStack, { reg, objlist, onSelect: (slot) => openMemberView(slot, uiStack.depth()) });
  });

  // I-18e: the bare-map top-row-digit inventory handler + the whole map-give apparatus
  // (armGive/giveTo/isAwaitingGiveRecipient) were RETIRED here. Inventory access is now P → roster →
  // ZSTATS → Tab, and GIVE is the in-stack recipient-picker (openMemberView above). Bare-map top-row
  // digits are now unused (numpad stays avatar diagonals).

  // I-9h first-tick alignment: the schedule system only fires on an hour ROLLOVER, so at
  // load NPCs sit at their objlist positions (doing nothing) until the clock crosses the
  // next hour — wrong if their current-hour slot differs from where they loaded. Fire the
  // hourly hooks once for the CURRENT hour: resolveSlotAt sets each eligible NPC's
  // Destination + AI_FINDPATH, and the first turn (<=idleInterval later) resolves movement
  // — far NPCs teleport (off-screen, invisible), near ones walk. The world starts coherent.
  // (Source forces a full teleport-settle at time-jumps via AllowNPCTeleport; that forced
  // load-settle is deferred to save-load, when genuine mid-route NPCs exist to handle.)
  // On a RESTORED game the saved AIMode/Destination already reflect the correct per-NPC
  // state for the saved hour, so skip the load-time re-resolve (it would re-path mid-route
  // NPCs). A fresh load still needs it to align NPCs to the current hour.
  const clock = world.getResource(WorldClock);
  if (!restored) for (const cb of clock.hourlyHooks) cb(clock);

  installSaveControls(world, artifactStamp, objlist, message);   // Export/Import buttons (save/load)

  let last = performance.now();
  (function loop(t) { world.frame(t - last, t); last = t; requestAnimationFrame(loop); })(last);
  log('\nRendering started — drag the map to pan. Hover a cell + press I to inspect.', 'ok');
  message('Welcome to Britannia. Drag the map to explore; hover a cell and press I to inspect.');
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
  let pendingSave = null;             // a dropped .json is a save to restore, not a U6 artifact
  for (const file of e.dataTransfer.files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'json') { pendingSave = new Uint8Array(await file.arrayBuffer()); log(`queued save ${file.name}`); continue; }
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
  if (pendingSave) {                            // stash the save (after any artifacts above) + restore on reload
    await U6DB.set(RESTORE_KEY, pendingSave);
    log('save queued — reloading to restore…', 'ok');
    location.reload();
    return;
  }
  if (loaded) { location.reload(); return; }   // already running → reload to apply the updated data
  await updateChecklist();
});

updateChecklist();
