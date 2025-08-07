import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';
import { PaletteManager } from './palette_manager.js';
import { IndexedTextureManager } from './indexed_texture_manager.js';
import { AnimDataManager } from './anim_data_manager.js';
import { U6Map } from './u6map.js'
import { ObjManager } from './obj_manager.js';
import { OBJ_U6 } from './u6objects.js';

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

let mapW = 0, mapH = 0, mapZ = 0, map;
const layerTileIndices = [], layerTilePositions = [];
let mapOriginX = 276;
let mapOriginY = 367;

// Map from static tile ID to list of indices in map[]
const tileUsageMapList = Array.from({ length: 5 }, () => new Map());

function resizeMapToCanvas() {
  mapW = Math.ceil(canvas.width / tileSize);
  mapH = Math.ceil(canvas.height / tileSize);

  console.log("Map", mapW, mapH, "from resizeMapToCanvas");

  // Reallocate data arrays
  map = new Uint16Array(mapW * mapH);
  for (let i = 0; i < map.length; i++) map[i] = i % 2048;

  const tileUsageMap = tileUsageMapList[0];

  const mapTileIndices = new Uint16Array(mapW * mapH);
  tileUsageMap.clear();  // clear old mapping
  for (let i = 0; i < mapTileIndices.length; i++) {
    const tile_index = map[i];
    // update tile usage map
    if (!tileUsageMap.has(tile_index)) tileUsageMap.set(tile_index, []);
    tileUsageMap.get(tile_index).push(i);

    mapTileIndices[i] = AnimDataManager.tileIndexMap[tile_index];
  }

  const mapTilePositions = new Float32Array(mapW * mapH * 2);
  for (let my = 0; my < mapH; my++) {
    for (let mx = 0; mx < mapW; mx++) {
      const i = my * mapW + mx;
      mapTilePositions[i * 2 + 0] = mx;
      mapTilePositions[i * 2 + 1] = my;
    }
  }

  layerTileIndices[0] = mapTileIndices;
  layerTilePositions[0] = mapTilePositions;

  // Recreate buffers
  Shader.createLayer(0, mapTileIndices, mapTilePositions);

  updateMap();
  updateObjects();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // trigger first time

const shoreline = [];

function updateMap() {
  if (u6map.chunks == null) return;

  const mapTileIndices = layerTileIndices[0];

  const tileUsageMap = tileUsageMapList[0];

  tileUsageMap.clear();  // clear old mapping

  const xstart = mapOriginX;
  const ystart = mapOriginY;
  const xend = xstart + mapW;
  const yend = ystart + mapH;

  const worldTileIndex = function(xtile, ytile, level = 0) {
    const x_coord = xtile % 1024;
    const y_coord = ytile % 1024;
    const chunk_index = u6map.superChunks.get(y_coord >> 3, x_coord >> 3);
    const chunk_offset = chunk_index * 64;
    const tile_index = u6map.chunks[chunk_offset + (y_coord & 7) * 8 + (x_coord & 7)];
    return tile_index;
  }

  const dungeonTileIndex = function(xtile, ytile, level) {
    const x_coord = xtile % 256;
    const y_coord = ytile % 256;
    level = level - 1; // dungeon levels are 1-5, but array is 0-4
    const chunk_index = u6map.dungeonChunks.get(level, y_coord >> 3, x_coord >> 3);
    const chunk_offset = chunk_index * 64;
    const tile_index = u6map.chunks[chunk_offset + (y_coord & 7) * 8 + (x_coord & 7)];
    return tile_index;
  }

  const getTileIndex = (mapZ === 0) ? worldTileIndex : dungeonTileIndex;

  const U6_ANIM_SRC_TILE = [
    0x16,0x16,0x1a,0x1a,0x1e,0x1e,0x12,0x12,
    0x1a,0x1e,0x16,0x12,0x16,0x1a,0x1e,0x12,
    0x1a,0x1e,0x1e,0x12,0x12,0x16,0x16,0x1a,
    0x12,0x16,0x1e,0x1a,0x1a,0x1e,0x12,0x16
  ];

  shoreline.length = 0; // renew the shorline information

  for (let ytile = ystart; ytile < yend; ytile++) {
    for (let xtile = xstart; xtile < xend; xtile++) {
      let tile_index = getTileIndex(xtile, ytile, mapZ);

      if (tile_index >= 16 && tile_index < 48 ) {
        // if this is a shorline tile, save it to shoreline
        // and change it with U6_ANIM_SRC_TILE
        shoreline.push({mx: xtile - xstart, my: ytile - ystart, tile_index});
        tile_index = U6_ANIM_SRC_TILE[tile_index - 16] / 2;
      }

      const i = (ytile - ystart) * mapW + (xtile - xstart);
      map[i] = tile_index;

      // update tile usage map
      if (!tileUsageMap.has(tile_index)) tileUsageMap.set(tile_index, []);
      tileUsageMap.get(tile_index).push(i);

      mapTileIndices[i] = AnimDataManager.tileIndexMap[tile_index];
    }
  }

  Shader.updateLayer(0, mapTileIndices);
}

let objectsInView = [];
let actorsInView = [];

function findObjectAtTile(mx, my, objectsInView) {
  const mapTiles = (mapZ === 0) ? 1024 : 256;
  // handle map wrapping
  return objectsInView.find(obj =>
    ((obj.x - mapOriginX) === mx || (obj.x + mapTiles - mapOriginX) === mx) &&
    ((obj.y - mapOriginY) === my || (obj.y + mapTiles - mapOriginY) === my)
  );
}

function updateObjects() {
  if (u6map.chunks == null) return;

  const xstart = mapOriginX;
  const ystart = mapOriginY;
  const xend = xstart + mapW;
  const yend = ystart + mapH;

  console.log(`Update objects in view: x1:${xstart}, y1:${ystart}, x2:${xend}, y2:${yend}, w:${mapW}, h:${mapH}`);

  const objects = [];
  const actors = [];

  const collectObjectsInSurface = function(objects, xstart, ystart, xend, yend) {
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

          // Handle map wrapping
          let insideXRange = (ox >= xstart && ox < xend);
          if (!insideXRange) insideXRange = ((ox + 1024) >= xstart && (ox + 1024) < xend);
          let insideYRange = (oy >= ystart && oy < yend);
          if (!insideYRange) insideYRange = ((oy + 1024) >= ystart && (oy + 1024) < yend);

          // Check if inside current view
          if (insideXRange && insideYRange) {
            objects.push(obj);
          }
        }
      }
    }
  }

  const collectObjectsInDungeon = function(objects, xstart, ystart, xend, yend, level) {
    level = level - 1; // dungeon levels are 1-5, but array is 0-4
    const dungeonObjs = ObjManager.dungeonObjs[level];
    console.log(`--Processing dungeon ${level}, found ${dungeonObjs.length} objects`);
    for (const obj of dungeonObjs) {
      if (obj.in_container() || obj.in_inventory()) continue;

      const ox = obj.x;
      const oy = obj.y;

      // Handle map wrapping
      let insideXRange = (ox >= xstart && ox < xend);
      if (!insideXRange) insideXRange = ((ox + 256) >= xstart && (ox + 256) < xend);
      let insideYRange = (oy >= ystart && oy < yend);
      if (!insideYRange) insideYRange = ((oy + 256) >= ystart && (oy + 256) < yend);

      // Check if inside current view
      if (insideXRange && insideYRange) {
        objects.push(obj);
      }
    }
  }

  const collectObjects = (mapZ === 0) ? collectObjectsInSurface : collectObjectsInDungeon;
  collectObjects(objects, xstart, ystart, xend, yend, mapZ);

  console.log(`--Found ${objects.length} objects in view`);
  objectsInView = objects;

  const mapTiles = (mapZ === 0) ? 1024 : 256;

  for (let ytile = ystart; ytile < yend; ytile++) {
    for (let xtile = xstart; xtile < xend; xtile++) {
      for (const actor of ObjManager.actors) {
        // Handle map wrapping
        if (actor.z === mapZ &&
          (actor.x === xtile || (actor.x + mapTiles) === xtile) &&
          (actor.y === ytile || (actor.y + mapTiles) === ytile)
        )
        actors.push(actor);
      }
    }
  }

  console.log(`--Found ${actors.length} actors in view`);
  actorsInView = actors;

  // === Build instance data ===
  const objectTileIndices = [];
  const objectTilePositions = [];
  let objTileUsageMap = null;

  // draw sequence:
  // draw force-lower objects first (something like a boat, a carrier...)
  // draw lower objects
  // draw actors
  // draw upper objects
  const drawObject = function(obj, forceLower, topTile) {
    const tileInfo = obj.tile_info.info
    if (!forceLower && tileInfo.isForceLowerTile() && !topTile) return;
    if (forceLower && !tileInfo.isForceLowerTile()) return;

    const mapTiles = (mapZ === 0) ? 1024 : 256;
    const baseTileIndex = obj.tile_info.tileIndex;
    let tileFlag = obj.tile_info.info;
    const ox = (obj.x > xstart) ? obj.x - xstart : obj.x + mapTiles - xstart;
    const oy = (obj.y > ystart) ? obj.y - ystart : obj.y + mapTiles - ystart;

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

  // bottom tiles layer
  objectTileIndices.length = 0;
  objectTilePositions.length = 0;
  objTileUsageMap = tileUsageMapList[1];
  objTileUsageMap.clear();

  // draw shorline
  for (let i = 0; i < shoreline.length; i++) {
    const data = shoreline[i];
    drawTile(data.tile_index, data.mx, data.my);
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    drawObject(obj, true, false); // force-lower objects
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    drawObject(obj, false, false); // lower objects
  }

  layerTileIndices[1] = new Uint16Array(objectTileIndices);
  layerTilePositions[1] = new Float32Array(objectTilePositions);

  Shader.createLayer(1, layerTileIndices[1], layerTilePositions[1]);

  // Actor layer
  objectTileIndices.length = 0;
  objectTilePositions.length = 0;
  objTileUsageMap = tileUsageMapList[2];
  objTileUsageMap.clear();

  for (const actor of actors) {
    drawObject(actor, false, false);
  }

  layerTileIndices[2] = new Uint16Array(objectTileIndices);
  layerTilePositions[2] = new Float32Array(objectTilePositions);

  Shader.createLayer(2, layerTileIndices[2], layerTilePositions[2]);

  // top tiles layer
  objectTileIndices.length = 0;
  objectTilePositions.length = 0;
  objTileUsageMap = tileUsageMapList[3];
  objTileUsageMap.clear();

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    drawObject(obj, false, true); // top tiles
  }

  layerTileIndices[3] = new Uint16Array(objectTileIndices);
  layerTilePositions[3] = new Float32Array(objectTilePositions);

  Shader.createLayer(3, layerTileIndices[3], layerTilePositions[3]);
}

function updateFrame(frame) {
  const animFrame = Math.floor(frame / 4); // Update every 4 render frames
  // Get the set of tile IDs whose animation frame changed
  const changedIndices = AnimDataManager.update(animFrame);

  // Record which positions in mapTileIndices[] are actually modified
  const modifiedIndices = new Set();

  const mapTileIndices = layerTileIndices[0];
  const tileUsageMap = tileUsageMapList[0];

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
    Shader.updateLayer(0, mapTileIndices, modifiedIndices);
  }

  //
  // for obj tile index buffer.
  for (let i = 1; i < tileUsageMapList.length; i++) {
    let needToUpdate = false;
    const objectTileIndices = layerTileIndices[i];
    const objTileUsageMap = tileUsageMapList[i];
    if (objTileUsageMap.size === 0) continue;

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
      Shader.updateLayer(i, objectTileIndices);
    }
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

  Shader.render(frame, PaletteManager);

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
    const showTooltip = (html) => {
      tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
      tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
      tooltip.style.display = "block";
      tooltip.innerHTML = html;
    };

    const actor =findObjectAtTile(mx, my, actorsInView);
    if (actor) {
      showTooltip(
        `🧍 Actor<br>` +
        `#${actor.id} ${actor.name}<br>` +
        `x:${mapOriginX+mx}, y:${mapOriginY+my}`);
      return;
    }

    const obj = findObjectAtTile(mx, my, objectsInView);
    if (obj) {
      showTooltip(
        `🧱 Object<br>` +
        `#${obj.obj_number} Frame:${obj.obj_frame}<br>` +
        `Tile:#${ObjManager.objToTile[obj.obj_number]+obj.obj_frame}<br>` +
        `Qty: ${obj.quantity} Quality: ${obj.quality}<br>` +
        `Status: ${obj.status.toString(16)}<br>` +
        `x:${mapOriginX+mx}, y:${mapOriginY+my}`);
      return;
    }

    const tileIndex = map[my * mapW + mx];
    showTooltip(
      `🗺️ Tile<br>` +
      `#${tileIndex}<br>` +
      `x:${mapOriginX+mx}, y:${mapOriginY+my}<br>` +
      `Name: ${tileManager.getTileLook(tileIndex)}`);
    return;
  }

  tooltip.style.display = "none";
});

canvas.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});

// === list view ===
function populateList(items) {
  const listView = document.getElementById('myListView');
  listView.innerHTML = ''; // clear existing

  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    let textContent = null;
    if (typeof item === 'string') {
      div.textContent = item;
      textContent = item;
    } else {
      const objTileIndex = ObjManager.objToTile[item.obj_number] + item.obj_frame;
      const canvas = tileManager.getTileImage(objTileIndex, PaletteManager)
      div.appendChild(canvas);

      const textSpan = document.createElement('span');
      const tileName = tileManager.getTileLook(objTileIndex);
      const text = `${item.quantity > 1 ? item.quantity + ' ' : ''}${tileName}`;
      textSpan.textContent = text;
      div.appendChild(textSpan);

      textContent = text;
    }
    div.addEventListener('click', () => {
      console.log(`Clicked item #${index}: ${textContent}`);
    });
    listView.appendChild(div);
  });
}

// Example usage
const testItems = [
  "maptiles.vga",
  "objtiles.vga",
  "tileindex.vga",
  "masktype.vga",
  "u6pal",
  "chunks",
  "map",
  "objlist"
];

populateList(testItems);

// === dialog window ===
const displayArea = document.getElementById('displayArea');
const textInput = document.getElementById('textInput');

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, m =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m])
  );
}

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const raw = textInput.value.trim();
    if (raw) {
      const safe = escapeHTML(raw);
      const colored = safe
        .replace(/hello/g, '<span style="color: red">hello</span>')
        .replace(/world/g, '<span style="color: blue">world</span>');

      displayArea.innerHTML += colored + "<br>";
      textInput.value = '';
    }
  }
});

// === File Handling ===
const expectedFiles = [
  "maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga",
  "u6pal", "animdata", "animmask.vga",
  "chunks", "map", "basetile", "tileflag", "objlist", "look.lzd"
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

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (e) => {
  const canvasRect = canvas.getBoundingClientRect();
  const mx = Math.floor((e.clientX - canvasRect.left) / tileSize);
  const my = Math.floor((e.clientY - canvasRect.top) / tileSize);

  if (e.button === 2) {
    const obj = findObjectAtTile(mx, my, objectsInView);
    //console.log(obj);
    if ((obj?.obj_number !== OBJ_U6.LADDER) && (obj?.obj_number !== OBJ_U6.CAVE))
      return;

    if (obj.obj_frame === 0 || obj.obj_number === OBJ_U6.CAVE) {
      // go down a level
      if (mapZ === 0) {
        // handle the transition from the surface to the first dungeon level
        // surface => 8 x 16 = 128 chunks for one direction
        // dungeon => 32 chunks for one direction
        // 128 / 32 = 4 for one direction => ratio 4 : 1
        // 4 x 4 surface chunks map to one dungeon chunk
        const nxtile = (obj.x & 0x07) | ((obj.x >> 2) & 0xF8);
        const nytile = (obj.y & 0x07) | ((obj.y >> 2) & 0xF8);
        const xOffset = (obj.x - mapOriginX + 1024) % 1024;
        const yOffset = (obj.y - mapOriginY + 1024) % 1024;
        mapZ = 1;
        mapOriginX = nxtile - xOffset;
        mapOriginY = nytile - yOffset;
        if (mapOriginX < 0) mapOriginX += 256;
        if (mapOriginY < 0) mapOriginY += 256;
      }
      else {
        //dungeon ladders line up so we simply drop straight down
        mapZ++;
      }
    }
    else {
      // go up a level
      console.assert(obj.obj_number === OBJ_U6.LADDER, "Only ladders can go up");
      console.assert(obj.obj_frame === 1, "Ladder frame should be 1 for going up");
      console.assert(mapZ > 0, "Cannot go up from surface");

      if (mapZ === 1) {
        // use obj.quality to tell us which surface chunk to come up in.
        const nxtile = Math.floor(obj.x / 8) * 8 * 4 + ((obj.quality & 0x03) * 8) + (obj.x - Math.floor(obj.x / 8) * 8);
        const nytile = Math.floor(obj.y / 8) * 8 * 4 + (((obj.quality >> 2) & 0x03) * 8) + (obj.y - Math.floor(obj.y / 8) * 8);
        const xOffset = (obj.x - mapOriginX + 256) % 256;
        const yOffset = (obj.y - mapOriginY + 256) % 256;
        mapZ = 0;
        mapOriginX = nxtile - xOffset;
        mapOriginY = nytile - yOffset;
        if (mapOriginX < 0) mapOriginX += 1024;
        if (mapOriginY < 0) mapOriginY += 1024;
      }
      else {
        mapZ--;
      }
    }
    pendingMapUpdate = true;
    return;
  }

  if (e.button !== 0) return; // not left button

  const actor = findObjectAtTile(mx, my, actorsInView);
  if (actor) {
    populateList(actor.obj_list);
  } else {
    const obj = findObjectAtTile(mx, my, objectsInView);
    if (obj) populateList(obj.obj_list);
  }

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

  const mapTiles = (mapZ === 0) ? 1024 : 256;

  if (mapOriginX < 0) mapOriginX += mapTiles;
  else if (mapOriginX >= mapTiles) mapOriginX -= mapTiles;

  if (mapOriginY < 0) mapOriginY += mapTiles;
  else if (mapOriginY >= mapTiles) mapOriginY -= mapTiles;

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
