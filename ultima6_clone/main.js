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
import { makeRenderSystem } from './systems/render_system.js';
import { makeCameraSystem } from './systems/camera_system.js';
import { makeTileAnimationSystem } from './systems/tile_animation_system.js';
import { makePaletteCycleSystem } from './systems/palette_cycle_system.js';
import { makeWorldRenderSystem } from './systems/world_render_system.js';
import { makeWorldClockSystem } from './systems/world_clock_system.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, Schedule, Container, ContainedIn, PartyMember, AIMode, Destination, Alignment, MoveSpeed } from './components/components.js';
import { Party } from './resources/party.js';
import { Paths } from './resources/paths.js';
import { Schedules } from './resources/schedules.js';
import { ActorIndex } from './resources/actor_index.js';
import { installNpcScheduleSystem } from './systems/npc_schedule_system.js';
import { installNpcTickSystem } from './systems/npc_tick_system.js';
import { installAvatarMovement } from './systems/avatar_move_system.js';
import { installMoveFollowers, settleParty } from './systems/move_followers.js';
import { loadActors, ensureRegionsInView, makeStreamingSystem, inventoryOf } from './world_loader.js';
import { installDevHud } from './view/dev_hud.js';
import { installDevProbe } from './view/dev_probe.js';
import { installNpcInspect } from './view/dev_npc_inspect.js';
import { UIStack } from './view/ui_stack.js';
import { openInspector } from './view/inspector.js';
import { openInventoryWindow } from './view/inventory_picker.js';
import { MessageLog } from './resources/message_log.js';
import { installMessageChannel } from './view/message_channel.js';
import { Commands } from './resources/commands.js';
import { makePickAtCell } from './systems/cell_pick.js';
import { installCommandDispatch } from './systems/command_dispatch.js';
import { registerUseHandlers } from './systems/use_handlers.js';

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
// Avatar, so it stays deferred/optional (research_portraits.md).
const OPTIONAL = ['portrait.z'];

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
  document.getElementById('app').style.display = 'grid';   // reveal the shell (boot log lives in it now)
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
  // I-3: turn-driver heartbeat (idle sample interval). I-14d DECOUPLES the game clock from
  // it — the clock now advances on its own real-time cadence scaled by WorldSpeed
  // (world_clock_system.js CLOCK_MIN_PER_REAL_SEC), so the 100 ms heartbeat is just the
  // sim-sampling rate, not the clock rate (the old "1 min per 0.1s" runaway is gone). Start
  // date is a stand-in until save-load (research_save_load.md). D_2C55 is stored but
  // unconsumed until the lighting step (research_map_render.md §"Lighting + visibility model").
  world.setResource(new TurnClock(100));
  world.setResource(new WorldClock({ Time_H: 9, Time_M: 0, Date_D: 1, Date_M: 1, Date_Y: 161 }));
  world.setResource(new WorldSpeed(1));           // I-14d: master pace scalar (NPC rate + clock); slider-driven
  world.registerComponent(Position).registerComponent(Renderable)
       .registerComponent(ObjType).registerComponent(Status)
       .registerComponent(Amount).registerComponent(Actor)
       .registerComponent(Schedule)
       .registerComponent(Container).registerComponent(ContainedIn)
       .registerComponent(PartyMember)
       .registerComponent(AIMode).registerComponent(Destination)    // I-9: NPC pathfinding state
       .registerComponent(Alignment)                                // I-11a: NPCStatus alignment (carried from objlist)
       .registerComponent(MoveSpeed);                               // I-14: DEXTE-paced accumulator state
  world.setResource(new Party());                 // I-8b: singleton party state (activeIndex, mode)
  world.setResource(new Paths());                 // I-9c: per-NPC pathfinding state (handle -> {dirs, counter, ...})
  world.setResource(new MessageLog());            // I-10a: gameplay message channel (CON_printf analog)
  world.setResource(new Commands());              // I-10b: object-action dispatch registries
  const uiStack = new UIStack(world, document.getElementById('ui-root'));
  window.__U6 = { world, tileRegistry: world.getResource(TileRegistry), mapLevel: world.getResource(MapLevel), spatial: world.getResource(SpatialIndex), clock: world.getResource(WorldClock), party: world.getResource(Party), schedules, objlist, actorIndex: world.getResource(ActorIndex), inventoryOf: (h) => inventoryOf(world, h), uiStack };

  const { actors, scheduled, party } = loadActors(world, objlist);
  log(`\nLoaded ${actors} on-map NPCs from objlist (${scheduled} with schedules, ${party} party members).`, 'ok');

  // I-5e: NPC schedule system. Hooks WorldClock.onHour; snaps eligible NPCs to
  // their resolved slot position. Returned stats object is mutated each tick.
  const npcScheduleStats = installNpcScheduleSystem(world);
  window.__U6.npcScheduleStats = npcScheduleStats;

  // I-12c: conversation portraits — raw bytes (OPTIONAL set) decoded lazily by the
  // dialog window through u6pal (research_portraits.md). Absent files -> blank box.
  const portraits = new Portraits({
    a: fileMap.get('portrait.a'), b: fileMap.get('portrait.b'), z: fileMap.get('portrait.z'),
    palette,
  });

  // I-13d: conversation scripts — raw converse.a/.b bytes, decoded lazily per-NPC
  // by the conversation VM on talk (assets/converse.js).
  const scripts = new ConversationScripts({ a: fileMap.get('converse.a'), b: fileMap.get('converse.b') });

  await startRender(world, { npcScheduleStats, objlist, schedules, uiStack, portraits, scripts });
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
async function startRender(world, { npcScheduleStats, objlist, schedules, uiStack, portraits, scripts } = {}) {
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
  } else {
    camera.worldX = 276 * ts; camera.worldY = 367 * ts;     // fall back to Britain's default origin
    log('Avatar not on-map (party slot 0) — camera at default origin; movement disabled.', 'warn');
  }
  window.__U6.renderer = renderer;
  window.__U6.camera = camera;
  window.__U6.avatarRef = avatarRef;

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
  // I-9d: NPC pathfinding tick. Each turn, AI_FINDPATH NPCs build a path in their own
  // 40x40 window and walk it (AI_ONPATH); far/unreachable slots snap. Sim-list system
  // so it inherits the turn-driver gating (breathe<->pause). Runs after the avatar
  // step (so NPCs react in the same turn) and before the clock advance.
  const npcTick = installNpcTickSystem(world, { avatarRef });
  world.addSimSystem(npcTick.system);
  window.__U6.npcTickStats = npcTick.stats;
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
    speedEl:      document.getElementById('world-speed'),         // I-14d WORLD_SPEED slider
    speedLabelEl: document.getElementById('world-speed-label'),
    npcScheduleStats,
    npcTickStats: npcTick.stats,
  });

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
    avatarRef, reg, objlist, message, uiStack, portraits, scripts,
  });
  window.__U6.cmd = cmd;            // dev: live dispatch({verb, target}) + isPending()
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

  // I-10j step 2 — digit-key inventory access. Top-row `1`..`PartySize` opens that party
  // member's inventory window (1 = Avatar); the window's onDigit re-opens for member n
  // (member switch — the window unwinds its own chain first, then we open the new member).
  // `0` (party roster) is deferred. TOP-ROW only (`e.code` Digit*) so the NUMPAD digits
  // stay avatar-diagonal movement. onVerb is a console placeholder until DROP migrates
  // (step 3) / give lands (step 4).
  function openMemberInventory(n) {                       // n = 1..PartySize
    const idx = n - 1;
    if (idx < 0 || idx >= objlist.partySize) return;      // dynamic bound (source ch-'1' < PartySize)
    const holder = actorIndex.get(objlist.party[idx]);
    if (holder === undefined) return;
    openInventoryWindow(world, holder, uiStack, {
      reg, objlist,
      onDigit: openMemberInventory,                       // in-window member switch
      onVerb: (verb, item) => {
        if (verb === 'drop') cmd.armDrop(item.handle);              // D → arm the map cursor for the cell (reach 7)
        else if (verb === 'give') cmd.armGive(item.handle, holder); // M → arm a recipient; holder = the giver member
      },
    });
  }
  document.addEventListener('keydown', (e) => {
    if (!uiStack.isEmpty()) return;                       // a window owns digits while open (its onKey)
    if (probe.isDragging()) return;
    if (!/^Digit[1-9]$/.test(e.code)) return;             // top-row only; numpad = avatar diagonals
    const n = parseInt(e.key, 10);
    if (cmd.isAwaitingGiveRecipient()) {                  // I-10j give: digit = recipient member n
      const idx = n - 1;
      cmd.giveTo(idx < objlist.partySize ? (actorIndex.get(objlist.party[idx]) ?? null) : null);
      e.preventDefault();
      return;
    }
    if (cmd.isPending()) return;                          // a map verb is armed → digit inert
    openMemberInventory(n);                               // open member n's inventory
    e.preventDefault();
  });
  window.__U6.openMemberInventory = openMemberInventory;  // dev

  // I-9h first-tick alignment: the schedule system only fires on an hour ROLLOVER, so at
  // load NPCs sit at their objlist positions (doing nothing) until the clock crosses the
  // next hour — wrong if their current-hour slot differs from where they loaded. Fire the
  // hourly hooks once for the CURRENT hour: resolveSlotAt sets each eligible NPC's
  // Destination + AI_FINDPATH, and the first turn (<=idleInterval later) resolves movement
  // — far NPCs teleport (off-screen, invisible), near ones walk. The world starts coherent.
  // (Source forces a full teleport-settle at time-jumps via AllowNPCTeleport; that forced
  // load-settle is deferred to save-load, when genuine mid-route NPCs exist to handle.)
  const clock = world.getResource(WorldClock);
  for (const cb of clock.hourlyHooks) cb(clock);

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
