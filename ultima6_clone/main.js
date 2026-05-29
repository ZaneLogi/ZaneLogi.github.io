// Boot: bring-your-own-data load. Dropzone -> U6DB (IndexedDB) -> decoders ->
// resources + ECS entities on a World, then render (terrain + world objects + NPCs).
// Decode correctness needs the user's own U6 files (legal: nothing is bundled).

import { World } from './ecs/world.js';
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
import { makeRenderSystem } from './systems/render_system.js';
import { makeCameraSystem } from './systems/camera_system.js';
import { makeTileAnimationSystem } from './systems/tile_animation_system.js';
import { makePaletteCycleSystem } from './systems/palette_cycle_system.js';
import { makeWorldRenderSystem } from './systems/world_render_system.js';
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
  world.registerComponent(Position).registerComponent(Renderable)
       .registerComponent(ObjType).registerComponent(Status)
       .registerComponent(Amount).registerComponent(Actor);
  window.__U6 = { world, tileRegistry: world.getResource(TileRegistry), mapLevel: world.getResource(MapLevel), spatial: world.getResource(SpatialIndex), objlist };

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
  world.addRenderSystem(makeTileAnimationSystem());                // advance animdata -> reg.animDirty
  world.addRenderSystem(makePaletteCycleSystem(renderer));         // rotate water/lava palette (shimmer)
  world.addRenderSystem(makeCameraSystem(1024 * 16, 1024 * 16));   // clamp camera to world bounds
  world.addRenderSystem(makeStreamingSystem(canvas, ts));          // load regions entering the view
  world.addRenderSystem(makeRenderSystem(renderer));               // terrain: layers 0 (water base) + 1 (shore)
  world.addRenderSystem(makeWorldRenderSystem(renderer));          // objects + NPCs: per-cell painter, layers 2-5
  world.addRenderSystem(() => renderer.render());                  // present

  // drag-to-pan
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add('dragging'); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    world.getResource(Camera).pan(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });
  const end = () => { dragging = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

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
