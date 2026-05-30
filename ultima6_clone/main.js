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
import { canStandAt } from './systems/passability.js';
import { forEachOccupiedCell } from './systems/tile_footprint.js';
import { Position, Renderable, ObjType, Status, Amount, Actor } from './components/components.js';
import { loadActors, ensureRegionsInView, makeStreamingSystem } from './world_loader.js';

// Gating set for terrain + flags (I-1b) + world objects (I-2). Names are the
// original U6 filenames, lowercased.
const REQUIRED = ['maptiles.vga', 'objtiles.vga', 'tileindx.vga', 'masktype.vga', 'animmask.vga', 'animdata', 'u6pal', 'chunks', 'map', 'tileflag', 'basetile', 'objlist'];
const OPTIONAL = ['look.lzd'];   // tile display names only (getTileLook); rendering doesn't need it

// OBJBLK region files (64 surface objblk[col][row] + 5 dungeon objblk[level]i).
// Demand-loaded per region from U6DB, so they gate by presence-count, not the
// all-or-nothing REQUIRED set.
const OBJBLK_NAMES = [];
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
  OBJBLK_NAMES.push(`objblk${String.fromCharCode(97 + c)}${String.fromCharCode(97 + r)}`);
for (let d = 0; d < 5; d++) OBJBLK_NAMES.push(`objblk${String.fromCharCode(97 + d)}i`);

const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);   // these + any objblk* are extracted from a dropped zip
const isKnown = (base) => KNOWN.has(base) || base.startsWith('objblk');

const dropzone = document.getElementById('dropzone');
const checklistEl = document.getElementById('checklist');
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

  let out = 'Required:\n';
  for (const n of REQUIRED) out += `  ${present[n] ? '✓' : '✗'} ${n}\n`;
  out += '\nOptional:\n';
  for (const n of OPTIONAL) out += `  ${present[n] ? '✓' : '—'} ${n}\n`;
  out += `\nOBJBLK regions: ${objblkCount}/${OBJBLK_NAMES.length}\n`;
  out += `\nReady: ${ready ? 'YES' : 'NO'}`;
  checklistEl.textContent = out;

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

  const world = new World();
  world.setResource(new TileRegistry({ tiles, flags, palette, anim, baseTile }));
  world.setResource(new MapLevel(u6map, 0));
  world.setResource(new SpatialIndex());
  // I-3: turn-driver + game-clock. idleInterval = 100ms => 1 game-minute per
  // 0.1s real => full game-day in ~2.4 min. Start date is a stand-in until
  // save-load lands (research_save_load.md). D_2C55 is stored but unconsumed
  // until the lighting step (research_map_render.md §"Lighting + visibility model").
  world.setResource(new TurnClock(100));
  world.setResource(new WorldClock({ Time_H: 9, Time_M: 0, Date_D: 1, Date_M: 1, Date_Y: 161 }));
  world.registerComponent(Position).registerComponent(Renderable)
       .registerComponent(ObjType).registerComponent(Status)
       .registerComponent(Amount).registerComponent(Actor);
  window.__U6 = { world, tileRegistry: world.getResource(TileRegistry), mapLevel: world.getResource(MapLevel), spatial: world.getResource(SpatialIndex), clock: world.getResource(WorldClock), objlist };

  diagnostics(world);
  const npcCount = loadActors(world, objlist);
  log(`\nLoaded ${npcCount} on-map NPCs from objlist.`, 'ok');
  await startRender(world);
}

// I-2b verification: the world is now ECS entities + a spatial index.
function verifyWorld(world) {
  const spatial = world.getResource(SpatialIndex);
  let total = 0, npcs = 0;
  for (const _ of world.query(Position)) total++;
  for (const _ of world.query(Actor)) npcs++;
  log('\nI-2b world built:', 'ok');
  log(`  entities: ${total} (${npcs} NPCs, ${total - npcs} world objects)`);
  log(`  spatial: ${spatial.cells.size} occupied cells, ${spatial.loadedRegions.size} regions loaded`);
  const here = spatial.at(307, 352);   // the Avatar's start cell
  log(`  cell (307,352) holds ${here ? here.length : 0} entit${here && here.length === 1 ? 'y' : 'ies'}`);
}

// I-1c/I-2b: terrain + world objects on screen. Build the GPU atlas + palette, place
// the camera at Britain's default origin, demand-load the OBJBLK regions in view, then
// register CameraSystem + RenderSystem(s) and drive a continuous rAF loop. Drag to pan.
async function startRender(world) {
  const canvas = document.getElementById('screen');
  canvas.style.display = 'block';

  const reg = world.getResource(TileRegistry);
  const renderer = new TileRenderer(canvas, { tileSize: 16, tilesPerRow: 64, tileCount: 2048 });
  renderer.uploadAtlas(reg);
  renderer.uploadPalette(reg.palette);

  const camera = new Camera(276 * 16, 367 * 16);            // Britain's default origin (tiles 276,367)
  world.setResource(camera);
  window.__U6.renderer = renderer;
  window.__U6.camera = camera;

  // Demand-load the OBJBLK regions overlapping the initial viewport, then the
  // StreamingSystem keeps loading regions as the camera pans into them.
  const objCount = await ensureRegionsInView(world, camera, canvas, renderer.tileSize);
  log(`Loaded ${objCount} world objects in the initial view.`, 'ok');
  verifyWorld(world);

  const ts = renderer.tileSize;
  world.addSimSystem(makeWorldClockSystem());                      // per turn: clock.advance(1)
  world.addRenderSystem(makeTileAnimationSystem());                // advance animdata -> reg.animDirty
  world.addRenderSystem(makePaletteCycleSystem(renderer));         // rotate water/lava palette (shimmer)
  world.addRenderSystem(makeCameraSystem(1024 * 16, 1024 * 16));   // clamp camera to world bounds
  world.addRenderSystem(makeStreamingSystem(canvas, ts));          // load regions entering the view
  world.addRenderSystem(makeRenderSystem(renderer));               // terrain: layers 0 (water base) + 1 (shore)
  world.addRenderSystem(makeWorldRenderSystem(renderer));          // objects + NPCs: per-cell painter, layers 2-5
  world.addRenderSystem(() => renderer.render());                  // present

  // I-3 dev/cheat HUD: time + sun bucket + hour-fire counter + manual controls
  // (pause/resume the turn-driver, ±10m/±1h time jumps). +1h matches source's
  // debug hotkey Alt+215 (C_0A33_1355(60)). Kept across the remaining impl
  // steps as a permanent dev affordance — modern UX (corner overlay, drag-
  // safe pointer-events) the cabinet couldn't surface. Always-visible during
  // development; hide-vs-toggle (e.g. backtick hotkey) revisited when the
  // real status panel ports (seg_0A33.c:933-936).
  const hudEl = document.getElementById('clock-hud');
  const textEl = document.getElementById('clock-text');
  const controlsEl = document.getElementById('clock-controls');
  const pauseBtn = controlsEl.querySelector('[data-act="pause"]');
  hudEl.style.display = 'block';
  const clock = world.getResource(WorldClock);
  const tc = world.getResource(TurnClock);
  let hourFires = 0;
  clock.onHour(() => hourFires++);
  const pad2 = (n) => String(n).padStart(2, '0');
  world.addRenderSystem(() => {
    textEl.textContent =
      `Year ${clock.Date_Y} · M${pad2(clock.Date_M)} D${pad2(clock.Date_D)}` +
      ` · ${pad2(clock.Time_H)}:${pad2(clock.Time_M)}` +
      ` · ☀ ${clock.D_2C55} · hours fired ${hourFires}`;
  });

  // Inverse cascade for the ± buttons. Forward advance is the contract
  // (fires hooks, source-faithful); rewind is a local debug aid only — no
  // hooks fire and the hour-fires counter doesn't decrement.
  function rewind(c, minutes) {
    let m = c.Time_M - minutes;
    while (m < 0) {
      m += 60;
      c.Time_H--;
      if (c.Time_H < 0) {
        c.Time_H = 23;
        c.Date_D--;
        if (c.Date_D < 1) {
          c.Date_D = 28;
          c.Date_M--;
          if (c.Date_M < 1) { c.Date_M = 12; c.Date_Y--; }
        }
      }
    }
    c.Time_M = m;
    c.recomputeD_2C55();
  }

  let paused = false;
  controlsEl.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    if (act === 'pause') {
      paused = !paused;
      if (paused) { tc.suspend(); pauseBtn.textContent = '▶ resume'; hudEl.classList.add('paused'); }
      else        { tc.resume();  pauseBtn.textContent = '⏸ pause';  hudEl.classList.remove('paused'); }
    } else if (act === 'p10') clock.advance(10);
    else if (act === 'p60') clock.advance(60);
    else if (act === 'm10') rewind(clock, 10);
    else if (act === 'm60') rewind(clock, 60);
  });

  // drag-to-pan
  let dragging = false, lastX = 0, lastY = 0;
  const cellEl = document.getElementById('probe-cell');
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    cellEl.style.display = 'none';                              // I-4d: hide the probe highlight during drag-pan
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    world.getResource(Camera).pan(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // I-4d cell probe: hover-to-inspect overlay on the dev HUD. Shows the cell
  // under the cursor, terrain tile + key flags, any per-cell object tile id
  // covering it (via footprint expansion), and the live canStandAt verdict.
  // The integration check for I-4c — proves the flag plumbing + canStandAt
  // logic line up with real `tileflag` values on real `OBJBLK*` data. Kept
  // across the remaining impl steps like the clock HUD.
  const probeEl = document.getElementById('probe-text');
  const rendStore = world.store(Renderable);
  function describeCell(x, y) {
    const reg = world.getResource(TileRegistry);
    const lvl = world.getResource(MapLevel);
    const spatial = world.getResource(SpatialIndex);

    const tT = lvl.tileAt(x, y);
    const tFlags = [];
    if (reg.isTerrainImpassable(tT)) tFlags.push('impass');
    if (reg.isTerrainWet(tT)) tFlags.push('wet');
    if (reg.isTerrainWall(tT)) tFlags.push('wall');
    if (reg.isTerrainDamage(tT)) tFlags.push('damage');

    const objs = [];
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const ents = spatial.at(x + dx, y + dy);
        if (!ents) continue;
        for (let k = ents.length - 1; k >= 0; k--) {
          const handle = ents[k];
          const id = world.resolve(handle);
          if (id === -1) continue;
          let tile = -1;
          forEachOccupiedCell(reg, rendStore.tileId[id], x + dx, y + dy, (t, col, row) => {
            if (col === x && row === y) tile = t;
          });
          if (tile === -1) continue;
          const lbl = [];
          if (world.has(handle, Actor)) lbl.push('NPC');
          if (reg.isBreakthrough(tile)) lbl.push('br');
          if (reg.isTileIgnore(tile)) lbl.push('ig');
          if (reg.isTerrainImpassable(tile)) lbl.push('impass');
          objs.push(`t#${tile}${lbl.length ? '[' + lbl.join(',') + ']' : ''}`);
        }
      }
    }

    return {
      text: `(${x},${y}) terrain t#${tT}${tFlags.length ? '[' + tFlags.join('+') + ']' : ''} · objs:${objs.length ? '[' + objs.join(' ') + ']' : 'none'}`,
      stand: canStandAt(world, x, y),
    };
  }
  function updateProbe(e) {
    if (dragging) return;                                         // freeze probe + highlight while panning
    const cam = world.getResource(Camera);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (sx < 0 || sy < 0 || sx >= rect.width || sy >= rect.height) return;
    const W = 1024;
    const tx = (Math.floor((cam.worldX + sx) / ts) % W + W) % W;
    const ty = (Math.floor((cam.worldY + sy) / ts) % W + W) % W;
    const d = describeCell(tx, ty);
    probeEl.textContent = `${d.text} · stand=${d.stand ? 'YES' : 'NO'}`;
    probeEl.classList.toggle('pass', d.stand);
    probeEl.classList.toggle('blocked', !d.stand);
    // Position the 1px highlight rectangle on the cell. Computed from the cursor's
    // tile-snapped pixel inside the canvas (avoids wrap edge-cases with tx/ty); the
    // result is the same pixel the renderer paints the tile at.
    const offX = ((cam.worldX % ts) + ts) % ts;
    const offY = ((cam.worldY % ts) + ts) % ts;
    cellEl.style.left = (rect.left + Math.floor((sx + offX) / ts) * ts - offX) + 'px';
    cellEl.style.top  = (rect.top  + Math.floor((sy + offY) / ts) * ts - offY) + 'px';
    cellEl.style.display = 'block';
  }
  canvas.addEventListener('pointermove', updateProbe);
  canvas.addEventListener('pointerleave', () => {
    probeEl.textContent = 'hover the map…';
    probeEl.classList.remove('pass', 'blocked');
    cellEl.style.display = 'none';
  });

  let last = performance.now();
  (function loop(t) { world.frame(t - last, t); last = t; requestAnimationFrame(loop); })(last);
  log('\nRendering started — drag the map to pan.', 'ok');
}

// I-1b verification surface: prove the decode end-to-end with concrete values the
// user can sanity-check against the game.
function diagnostics(world) {
  const reg = world.getResource(TileRegistry);
  const lvl = world.getResource(MapLevel);

  log('\nDecode OK. Diagnostics:', 'ok');
  log(`  palette[0] = rgb(${reg.palette[0]}, ${reg.palette[1]}, ${reg.palette[2]})`);
  log(`  palette[255] alpha = ${reg.palette[255 * 4 + 3]} (0 = colourkey)`);

  // Tile at Britain's default overworld origin (276, 367) — see research_i1_render_slice.md.
  const tBritain = lvl.tileAt(276, 367);
  log(`  mapLevel.tileAt(276,367) = tile ${tBritain}`);
  const px = reg.pixels(tBritain);
  log(`  tile ${tBritain}: ${px.length}-byte pixel buffer; flags fg=${reg.isForeground(tBritain)} bg=${reg.isBackground(tBritain)} dblH=${reg.isDoubleHeight(tBritain)} dblW=${reg.isDoubleWidth(tBritain)}`);
  if (reg.tiles.looks) log(`  tile ${tBritain} look = "${reg.tiles.getTileLook(tBritain)}"`);

  // A few sample tiles' flags, so a bad flag-plane offset would show up.
  log('  sample flags: ' + [16, 256, 512].map((t) => `#${t}{fg:${+reg.isForeground(t)},bg:${+reg.isBackground(t)},dW:${+reg.isDoubleWidth(t)},dH:${+reg.isDoubleHeight(t)}}`).join(' '));

  log('\nI-1b plumbing complete — resources on window.__U6.', 'ok');
}

// --- dropzone: store dropped files into IndexedDB (bring-your-own-data) ---
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
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
  await updateChecklist();
});

updateChecklist();
