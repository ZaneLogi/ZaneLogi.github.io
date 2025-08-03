import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';
import { PaletteManager } from './palette_manager.js';
import { IndexedTextureManager } from './indexed_texture_manager.js';
import { AnimDataManager } from './anim_data_manager.js';
import { U6Map } from './u6map.js'
import { ObjManager } from './obj_manager.js';

const tileManager = new TileManager();
const u6map = new U6Map();

// === Global WebGL Setup ===
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
if (!gl) alert("WebGL2 not supported");

// === Constants ===
const tileSize = 16;
const tileCount = 2048;
const tilesPerRow = 64;
const tilesPerCol = 32;
const atlasW = tilesPerRow * tileSize;
const atlasH = tilesPerCol * tileSize;

import { Shader } from './map_viewer_renderer.js';
Shader.init(canvas, tileSize, tilesPerRow, atlasW, atlasH);

// === Palette Manager ===
PaletteManager.init(gl);

// === IndexedTextureManager ===
IndexedTextureManager.init(gl, tileCount, tileSize, tilesPerRow);

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth  = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    resizeMapToCanvas();
  }
}

let mapW = 0, mapH = 0;
let map = null, mapTileIndices, mapTilePositions;

// Map from static tile ID to list of indices in map[]
const tileUsageMap = new Map();

function resizeMapToCanvas() {
  mapW = Math.ceil(canvas.width / tileSize);
  mapH = Math.ceil(canvas.height / tileSize);

  console.log("Map", mapW, mapH);

  // Reallocate data arrays
  map = new Uint16Array(mapW * mapH);
  for (let i = 0; i < map.length; i++) map[i] = i % 2048;

  mapTileIndices = new Uint16Array(mapW * mapH);
  tileUsageMap.clear();  // clear old mapping
  for (let i = 0; i < mapTileIndices.length; i++) {
    const tile_index = map[i];
    // update tile usage map
    if (!tileUsageMap.has(tile_index)) tileUsageMap.set(tile_index, []);
    tileUsageMap.get(tile_index).push(i);

    mapTileIndices[i] = AnimDataManager.tileIndexMap[tile_index];
  }

  mapTilePositions = new Float32Array(mapW * mapH * 2);
  for (let my = 0; my < mapH; my++) {
    for (let mx = 0; mx < mapW; mx++) {
      const i = my * mapW + mx;
      mapTilePositions[i * 2 + 0] = mx;
      mapTilePositions[i * 2 + 1] = my;
    }
  }

  // Recreate buffers
  Shader.createBuffers(mapTileIndices, mapTilePositions);

  updateMap();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // trigger first time

let mapOriginX = 128;
let mapOriginY = 128;

function updateMap() {
  if (u6map.chunks == null) return;

  tileUsageMap.clear();  // clear old mapping

  const xstart = mapOriginX;
  const ystart = mapOriginY;
  const xend = xstart + mapW;
  const yend = ystart + mapH;
  const WORLD_TILES = 1024;

  for (let ytile = ystart; ytile < yend; ytile++) {
    for (let xtile = xstart; xtile < xend; xtile++) {
      const x_coord = xtile % WORLD_TILES;
      const y_coord = ytile % WORLD_TILES;

      const chunk_index = u6map.superChunks.get(y_coord >> 3, x_coord >> 3);
      const chunk_offset = chunk_index * 64;
      const tile_index = u6map.chunks[chunk_offset + (y_coord & 7) * 8 + (x_coord & 7)];

      const i = (ytile - ystart) * mapW + (xtile - xstart);
      map[i] = tile_index;

      // update tile usage map
      if (!tileUsageMap.has(tile_index)) tileUsageMap.set(tile_index, []);
      tileUsageMap.get(tile_index).push(i);

      mapTileIndices[i] = AnimDataManager.tileIndexMap[tile_index];
    }
  }

  Shader.updateTileIndexBuffer(mapTileIndices);
}

function updateFrame(frame) {
  const animFrame = Math.floor(frame / 8); // Update every 8 render frames
  // Get the set of tile IDs whose animation frame changed
  const changedIndices = AnimDataManager.update(frame);

  // Record which positions in mapTileIndices[] are actually modified
  const modifiedIndices = new Set();

  // Track how many positions are modified in this frame
  for (const tileID of changedIndices) {
    const positions = tileUsageMap.get(tileID);
    if (!positions) continue;

    const updatedIndex = AnimDataManager.tileIndexMap[tileID];

    for (const i of positions) {
      if (mapTileIndices[i] !== updatedIndex) {
        mapTileIndices[i] = updatedIndex;
        modifiedIndices.add(i);
      }
    }
  }

  if (modifiedIndices.size === 0) {
    // No changes this frame; skip buffer update
    return;
  }

  console.log(modifiedIndices.size);

  Shader.updateTileIndexBuffer(mapTileIndices, modifiedIndices);
}

const times = [];
const time_samples = 60;
let lastTimestamp = null;
const frameRateDiv = document.getElementById("frameRate");

// === Animation ===
let frame = 0;
function animate(timestamp) {
  if (lastTimestamp !== null) {
    const delta = timestamp - lastTimestamp;
    times.push(delta);
  }
  lastTimestamp = timestamp;

  if (times.length == time_samples) {
    times.shift();// remove first timestamp
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const refreshRate = Math.round(1000 / avg);
    frameRateDiv.textContent = `Estimated Refresh Rate: ${refreshRate} Hz\n(avg interval: ${avg.toFixed(3)} ms)`;
  }

  requestAnimationFrame(animate);

  if (pendingMapUpdate) {
    updateMap();
    pendingMapUpdate = false;
  }

  updateFrame(frame);

  Shader.render(frame, AnimDataManager, PaletteManager, map);
  frame++;
}

requestAnimationFrame(animate);


// === Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left)/16);
  const y = Math.floor((e.clientY - rect.top)/16);
  if (x >= 0 && x < Shader.mapW && y >= 0 && y < Shader.mapH) {
    const index = Shader.map[y * Shader.mapW + x];
    tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
    tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
    tooltip.style.display = "block";
    tooltip.innerHTML = `Tile Index ${index}`;
  } else {
    tooltip.style.display = "none";
  }
});

// === File Handling ===
const expectedFiles = [
  "maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal", "animdata",
  "chunks", "map", "objlist",
];
// Add OBJBLKAA to OBJBLKHH (8x8 surface)
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const name = `OBJBLK${String.fromCharCode(65 + col)}${String.fromCharCode(65 + row)}`;
    expectedFiles.push(name.toLowerCase());
  }
}
// Add OBJBLKAI to OBJBLKEI (5 dungeon)
for (let i = 0; i < 5; i++) {
  const name = `OBJBLK${String.fromCharCode(65 + i)}I`;
  expectedFiles.push(name.toLowerCase());
}

const fileMap = new Map();
const checklistDiv = document.getElementById("fileChecklist");

document.getElementById("resetBtn").onclick = async () => {
  await U6DB.clear();
  await updateChecklist();
  location.reload();
};

async function updateChecklist() {
  let ready = true;
  let result = "📦 Required Files:\n";
  for (const name of expectedFiles) {
    const data = await U6DB.get(name);
    if (data) {
      result += `✅ ${name.padEnd(15)} (${data.length} bytes)\n`;
    } else {
      result += `⛔ ${name.padEnd(15)} (missing)\n`;
      ready = false;
    }
  }
  result += `\n🎯 Ready: ${ready ? "YES" : "NO"}`;
  checklistDiv.textContent = result;
}

document.getElementById("dropzone").addEventListener("dragover", e => e.preventDefault());
document.getElementById("dropzone").addEventListener("drop", async (e) => {
  e.preventDefault();
  for (const file of e.dataTransfer.files) {
    const data = await file.arrayBuffer();
    const uint8 = new Uint8Array(data);
    fileMap.set(file.name.toLowerCase(), uint8);
    await U6DB.set(file.name, uint8);
  }
  await updateChecklist();
  tryInitializeViewer();
});


let isCanvasDragging = false;
let dragCanvasOffsetX = 0;
let dragCanvasOffsetY = 0;
let lastMapX, lastMapY;
let pendingMapUpdate = false; 

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;

  // lock the pointer event，even the cursor is out of canvas,
  // still can receive pointerup/pointermove
  canvas.setPointerCapture(e.pointerId);

  isCanvasDragging = true;

  const rect = canvas.getBoundingClientRect();
  dragCanvasOffsetX = e.clientX - rect.left;
  dragCanvasOffsetY = e.clientY - rect.top;
  lastMapX = mapOriginX;
  lastMapY = mapOriginY;

  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!isCanvasDragging) return;

  mapOriginX = lastMapX - Math.floor((e.clientX - dragCanvasOffsetX));
  mapOriginY = lastMapY - Math.floor((e.clientY - dragCanvasOffsetY));

  if (mapOriginX < 0) mapOriginX += 1024;
  else if (mapOriginX >= 1024) mapOriginX -= 1024;

  if (mapOriginY < 0) mapOriginY += 1024;
  else if (mapOriginY >= 1024) mapOriginY -= 1024;

  pendingMapUpdate = true;
});

canvas.addEventListener("pointerup", (e) => {
  // release pointer capture
  canvas.releasePointerCapture(e.pointerId);
  isCanvasDragging = false;
});


async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    const u6pal = fileMap.get("u6pal");
    console.log("load u6pal");
    PaletteManager.setFromU6(gl, u6pal);

    console.log("load animdata");
    AnimDataManager.init(fileMap);

    console.log("load tiles");
    tileManager.init(fileMap);
    IndexedTextureManager.update(gl, tileManager);

    console.log("load map");
    u6map.init(fileMap);
    updateMap();

    ObjManager.init(fileMap);
    console.log(ObjManager.actors.slice(0, 5));
  }
}

async function loadFromIndexedDB() {
  for (const name of expectedFiles) {
    const data = await U6DB.get(name);
    if (data) fileMap.set(name, data);
  }
  await updateChecklist();
  tryInitializeViewer();
}

loadFromIndexedDB();
