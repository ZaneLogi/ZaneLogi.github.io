// I-1b boot: bring-your-own-data load. Dropzone -> U6DB (IndexedDB) -> decoders
// -> TileRegistry + MapLevel resources on a World. No rendering yet (I-1c).
// Final decode-correctness check needs the user's own U6 files (legal: nothing bundled).

import { World } from './ecs/world.js';
import { U6DB } from './u6db.js';
import { decodePalette } from './assets/palette.js';
import { Tiles } from './assets/tiles.js';
import { U6Map } from './assets/map.js';
import { TileFlags } from './assets/tile_flags.js';
import { AnimData } from './assets/anim.js';
import { TileRegistry } from './resources/tile_registry.js';
import { MapLevel } from './resources/map_level.js';
import { unzip } from './assets/zip.js';
import { TileRenderer } from './view/renderer.js';
import { Camera } from './resources/camera.js';
import { makeRenderSystem } from './systems/render_system.js';
import { makeCameraSystem } from './systems/camera_system.js';
import { makeEntityRenderSystem } from './systems/entity_system.js';
import { Position, Renderable } from './components/components.js';

// Gating set for terrain + flags (I-1b). Names are the original U6 filenames, lowercased.
const REQUIRED = ['maptiles.vga', 'objtiles.vga', 'tileindx.vga', 'masktype.vga', 'u6pal', 'chunks', 'map', 'tileflag'];
const OPTIONAL = ['animdata', 'animmask.vga', 'look.lzd'];
const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);   // only these are extracted from a dropped zip

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

  let out = 'Required:\n';
  for (const n of REQUIRED) out += `  ${present[n] ? '✓' : '✗'} ${n}\n`;
  out += '\nOptional:\n';
  for (const n of OPTIONAL) out += `  ${present[n] ? '✓' : '—'} ${n}\n`;
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
  tiles.init(fileMap, /* tileOnly */ !(fileMap.has('animmask.vga') && fileMap.has('look.lzd')));

  const flags = new TileFlags(fileMap.get('tileflag'));

  const u6map = new U6Map();
  u6map.init(fileMap);

  let anim = null;
  if (fileMap.has('animdata')) { anim = new AnimData(); anim.init(fileMap.get('animdata')); }

  const world = new World();
  world.setResource(new TileRegistry({ tiles, flags, palette, anim }));
  world.setResource(new MapLevel(u6map, 0));
  window.__U6 = { world, tileRegistry: world.getResource(TileRegistry), mapLevel: world.getResource(MapLevel) };

  diagnostics(world);
  startRender(world);
}

// I-1c: terrain on screen. Build the GPU atlas + palette from TileRegistry, place
// the camera at Britain's default origin, register CameraSystem + RenderSystem, and
// drive a continuous rAF frame loop. Drag the canvas to pan.
function startRender(world) {
  const canvas = document.getElementById('screen');
  canvas.style.display = 'block';

  const reg = world.getResource(TileRegistry);
  const renderer = new TileRenderer(canvas, { tileSize: 16, tilesPerRow: 64, tileCount: 2048 });
  renderer.uploadAtlas(reg);
  renderer.uploadPalette(reg.palette);

  world.setResource(new Camera(276 * 16, 367 * 16));        // Britain's default origin (tiles 276,367)
  world.registerComponent(Position).registerComponent(Renderable);
  spawnDemoEntities(world);

  world.addRenderSystem(makeCameraSystem(1024 * 16, 1024 * 16));
  world.addRenderSystem(makeRenderSystem(renderer));         // terrain: layers 0 (water base) + 1 (shore)
  world.addRenderSystem(makeEntityRenderSystem(renderer));   // entities: layers 2 (lower) + 3 (top)
  world.addRenderSystem(() => renderer.render());            // present
  window.__U6.renderer = renderer;
  window.__U6.camera = world.getResource(Camera);

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

// Spawn a few demo entities to exercise the ECS render path — one of each
// expansion shape (single / double-width / double-height), so the per-tile layer
// routing (pillar-bug fix) is observable. Tiles chosen by scanning TileRegistry flags.
function spawnDemoEntities(world) {
  const reg = world.getResource(TileRegistry);
  let single = 0, dw = 0, dh = 0;
  for (let t = 256; t < 2048; t++) {
    const w = reg.isDoubleWidth(t), h = reg.isDoubleHeight(t);
    if (!dh && h && !w) dh = t;
    if (!dw && w && !h) dw = t;
    if (!single && !w && !h && reg.tiles.getTileLook(t) !== 'Unknown') single = t;
    if (single && dw && dh) break;
  }
  const spawn = (x, y, tile) => {
    if (!tile) return;
    const e = world.create();
    world.add(e, Position, { x, y, z: 0 });
    world.add(e, Renderable, { tileId: tile });
    log(`  entity tile ${tile} ("${reg.tiles.getTileLook(tile)}") at (${x},${y})`);
  };
  log('\nSpawning demo entities (single / double-W / double-H):', 'warn');
  spawn(285, 374, single || 0x100);
  spawn(288, 374, dw);
  spawn(291, 375, dh);
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
  log(`  tile ${tBritain}: ${px.length}-byte pixel buffer; flags top=${reg.isTopTile(tBritain)} dblH=${reg.isDoubleHeight(tBritain)} dblW=${reg.isDoubleWidth(tBritain)} forceLower=${reg.isForceLowerTile(tBritain)}`);
  if (reg.tiles.looks) log(`  tile ${tBritain} look = "${reg.tiles.getTileLook(tBritain)}"`);

  // A few sample tiles' flags, so a bad flag-plane offset would show up.
  log('  sample flags: ' + [16, 256, 512].map((t) => `#${t}{top:${+reg.isTopTile(t)},dW:${+reg.isDoubleWidth(t)},dH:${+reg.isDoubleHeight(t)}}`).join(' '));

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
        if (KNOWN.has(base)) {
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
