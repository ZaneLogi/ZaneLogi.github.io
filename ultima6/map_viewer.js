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
  // using the updated devicePixelRatio.
  // essentially overriding the browser’s zoom effect by always rendering at the full pixel density.
  //const dpr = window.devicePixelRatio || 1;

  // canvas.width matches its CSS layout size,
  // And the content will be rendered at the zoomed-in CSS size, even if pixelated.
  const dpr = 1;

  const displayWidth  = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);

  console.log(`Resize canvas to ${displayWidth}x${displayHeight} (DPR: ${dpr})`);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    resizeMapToCanvas();
  }
}

let mapW = 0, mapH = 0, map;
let mapTileIndices, mapTilePositions;
let objectTileIndices, objectTilePositions;

// Map from static tile ID to list of indices in map[]
const tileUsageMap = new Map();
const objTileUsageMap = new Map();

function resizeMapToCanvas() {
  mapW = Math.ceil(canvas.width / tileSize);
  mapH = Math.ceil(canvas.height / tileSize);

  console.log("Map", mapW, mapH, "from resizeMapToCanvas");

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
  updateObjects();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // trigger first time

let mapOriginX = 276;
let mapOriginY = 367;

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

let objectsInView = [];
let actorsInView = [];

function findObjectAtTile(mx, my, objectsInView) {
  return objectsInView.find(obj =>
    (obj.x - mapOriginX) === mx && (obj.y - mapOriginY) === my
  );
}

function updateObjects() {
  if (u6map.chunks == null) return;

  objTileUsageMap.clear();

  const xstart = mapOriginX;
  const ystart = mapOriginY;
  const xend = xstart + mapW;
  const yend = ystart + mapH;

  console.log(`Update objects in view: x1:${xstart}, y1:${ystart}, x2:${xend}, y2:${yend}, w:${mapW}, h:${mapH}`);

  const objects = [];
  const actors = [];

  const chunkX0 = Math.floor(xstart / 128); // from 0 to 7
  const chunkY0 = Math.floor(ystart / 128);
  const chunkX1 = Math.floor((xend - 1) / 128);
  const chunkY1 = Math.floor((yend - 1) / 128);

  for (let chunkY = chunkY0; chunkY <= chunkY1; chunkY++) {
    for (let chunkX = chunkX0; chunkX <= chunkX1; chunkX++) {
      const chunkObjs = ObjManager.surfaceObjs[chunkY%8][chunkX%8];

      console.log(`--Processing chunk (${chunkX}, ${chunkY}), found ${chunkObjs.length} objects`);

      for (const obj of chunkObjs) {
        if (obj.in_container() || obj.in_inventory()) continue;

        const ox = obj.x;
        const oy = obj.y;

        // Check if inside current view
        if (ox >= xstart && ox < xend && oy >= ystart && oy < yend) {
          objects.push(obj);
        }
      }
    }
  }

  console.log(`--Found ${objects.length} objects in view`);
  objectsInView = objects;

  // TODO: as allow map wrapping, need to handle this case

  for (let ytile = ystart; ytile < yend; ytile++) {
    for (let xtile = xstart; xtile < xend; xtile++) {
      for (const actor of ObjManager.actors) {
        if (actor.z === 0 && actor.x === xtile && actor.y === ytile)
          actors.push(actor);
      }
    }
  }

  console.log(`--Found ${actors.length} actors in view`);
  actorsInView = actors;

  // Optional: sort by Z (or depth)
  //objects.sort((a, b) => a.z - b.z);

  // === Build instance data ===
  objectTileIndices = [];
  objectTilePositions = [];

  // draw sequence:
  // draw force-lower objects first (something like a boat, a carrier...)
  // draw lower objects
  // draw actors
  // draw upper objects
  const drawObject = function(obj, forceLower, topTile) {
    const tileInfo = obj.tile_info.info
    if (!forceLower && tileInfo.isForceLowerTile() && !topTile) return;
    if (forceLower && !tileInfo.isForceLowerTile()) return;

    const baseTileIndex = obj.tile_info.tileIndex;
    let tileFlag = obj.tile_info.info;
    const ox = obj.x - xstart;
    const oy = obj.y - ystart;

    // draw the tile if it matches the top tile condition
    if (tileFlag.isTopTile() !== topTile)
      return;

    drawTile(baseTileIndex, ox, oy);

    let next = 1;

    // Double-width
    if (tileFlag?.isDoubleWidth()) {
      const tileIndex = baseTileIndex - next++;
      drawTile(tileIndex, ox-1, oy);
    }

    // Double-height
    if (tileFlag?.isDoubleHeight()) {
      const tileIndex = baseTileIndex - next++;
      drawTile(tileIndex, ox, oy-1);
    }

    // Double-width + double-height
    if (tileFlag?.isDoubleWidth() && tileFlag?.isDoubleHeight()) {
      const tileIndex = baseTileIndex - next++;
      drawTile(tileIndex, ox-1, oy-1);
    }
  }

  const drawTile = function(tileIndex, x, y) {
    const mappedTileIndex = AnimDataManager.tileIndexMap[tileIndex];
    objectTileIndices.push(mappedTileIndex);
    objectTilePositions.push(x);
    objectTilePositions.push(y);

    if (!objTileUsageMap.has(tileIndex)) objTileUsageMap.set(tileIndex, []);
    objTileUsageMap.get(tileIndex).push(objectTileIndices.length-1);
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    drawObject(obj, true, false); // force-lower objects
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    drawObject(obj, false, false); // lower objects
  }

  for (const actor of actors) {
    drawObject(actor, false, false);
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    drawObject(obj, false, true); // top tiles
  }

  objectTileIndices = new Uint16Array(objectTileIndices);
  objectTilePositions = new Float32Array(objectTilePositions);

  Shader.updateObjectBuffers(objectTileIndices, objectTilePositions);
}

function updateFrame(frame) {
  const animFrame = Math.floor(frame / 4); // Update every 4 render frames
  // Get the set of tile IDs whose animation frame changed
  const changedIndices = AnimDataManager.update(animFrame);

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

  if (modifiedIndices.size !== 0) {
    //console.log(modifiedIndices.size);
    Shader.updateTileIndexBuffer(mapTileIndices, modifiedIndices);
  }

  //
  // for obj tile index buffer
  let needToUpdate = false;
  for (const tileID of changedIndices) {
    const positions = objTileUsageMap.get(tileID);
    if (!positions) continue;

    const updatedIndex = AnimDataManager.tileIndexMap[tileID];

    for (const i of positions) {
      if (objectTileIndices[i] !== updatedIndex) {
        objectTileIndices[i] = updatedIndex;
        needToUpdate = true;
      }
    }
  }

  if (needToUpdate) {
    Shader.updateObjTileIndexBuffer(objectTileIndices);
  }
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
    updateObjects();
    pendingMapUpdate = false;
  }

  updateFrame(frame);

  Shader.render(frame, PaletteManager, mapTileIndices.length, objectTileIndices?.length ?? 0);

  frame++;
}

requestAnimationFrame(animate);


// === Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = Math.floor((e.clientX - rect.left) / tileSize);
  const my = Math.floor((e.clientY - rect.top) / tileSize);

  if (mx >= 0 && mx < mapW && my >= 0 && my < mapH) {
    const obj = findObjectAtTile(mx, my, objectsInView); // 你需要把 objectsInView 暴露出來

    if (obj) {
      tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
      tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
      tooltip.style.display = "block";
      tooltip.innerHTML =
        `🧱 Object<br>` +
        `#${obj.obj_number} Frame:${obj.obj_frame}<br>` +
        `Tile:#${ObjManager.objToTile[obj.obj_number]}<br>` +
        `Qty: ${obj.quantity} Quality: ${obj.quality}<br>` +
        `Status: ${obj.status.toString(16)}`;
      return;
    }
  }

  tooltip.style.display = "none";
});


// === File Handling ===
const expectedFiles = [
  "maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal", "animdata",
  "chunks", "map", "basetile", "tileflag", "objlist",
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
    PaletteManager.setFromU6(gl, u6pal, true);

    console.log("load animdata");
    AnimDataManager.init(fileMap);

    console.log("load tiles");
    tileManager.init(fileMap);
    IndexedTextureManager.update(gl, tileManager);

    console.log("load map");
    u6map.init(fileMap);
    updateMap();

    console.log("load objects");
    ObjManager.init(fileMap);
    updateObjects();
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
