import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';
import { PaletteManager } from './palette_manager.js';
import { IndexedTextureManager } from './indexed_texture_manager.js';
import { AnimDataManager } from './anim_data_manager.js';

const tileManager = new TileManager();

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

import { program } from './tile_viewer_shader.js';

// === Uniforms ===
const u_resolution = gl.getUniformLocation(program, 'u_resolution');
gl.uniform2f(u_resolution, canvas.width, canvas.height);
const u_indexed = gl.getUniformLocation(program, 'u_indexedTexture');
const u_palette = gl.getUniformLocation(program, 'u_paletteTexture');
gl.uniform1i(u_indexed, 0);
gl.uniform1i(u_palette, 1);

// === Palette Manager ===
PaletteManager.init(gl);

// === IndexedTextureManager ===
IndexedTextureManager.init(gl, tileCount, tileSize, tilesPerRow);

// === Generate Map Data (64x32) ===
const mapW = 64, mapH = 32;
const map = new Uint16Array(mapW * mapH);
for (let i = 0; i < map.length; i++) map[i] = i;

const mapTileIndices = new Uint16Array(mapW * mapH);
for (let i = 0; i < mapTileIndices.length; i++) {
  mapTileIndices[i] = map[i];
}
const mapTilePositions = new Float32Array(mapW * mapH * 2);
for (let my = 0; my < mapH; my++) {
  for (let mx = 0; mx < mapW; mx++) {
    const i = my * mapW + mx;
    mapTilePositions[i * 2 + 0] = mx;
    mapTilePositions[i * 2 + 1] = my;
  }
}

function makeInstancedBuffer(attr, size, type, data, isInteger = false) {
  const loc = gl.getAttribLocation(program, attr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  gl.enableVertexAttribArray(loc);

  if (isInteger) {
    gl.vertexAttribIPointer(loc, size, type, 0, 0); // 注意是 IPointer（整數）
  } else {
    gl.vertexAttribPointer(loc, size, type, false, 0, 0);
  }

  gl.vertexAttribDivisor(loc, 1);
  return buf;
}

const tileIndexBuffer = makeInstancedBuffer('a_tileIndex', 1, gl.UNSIGNED_SHORT, mapTileIndices, true);
const tilePosBuffer = makeInstancedBuffer('a_tilePos', 2, gl.FLOAT, mapTilePositions);

function updateTileIndexBuffer(frame) {
  AnimDataManager.update(frame);

  gl.bindBuffer(gl.ARRAY_BUFFER, tileIndexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, AnimDataManager.tileIndexMap);
}

gl.uniform1f(gl.getUniformLocation(program, "u_tileSize"), tileSize);
gl.uniform1f(gl.getUniformLocation(program, "u_tilesPerRow"), tilesPerRow);
gl.uniform1f(gl.getUniformLocation(program, "u_atlasW"), atlasW);
gl.uniform1f(gl.getUniformLocation(program, "u_atlasH"), atlasH);


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
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(u_resolution, canvas.width, canvas.height);

  PaletteManager.colorCycling(gl, frame);

  updateTileIndexBuffer(frame);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, map.length); // 6 個 vertex、N 個 instance

  frame++;
}

requestAnimationFrame(animate);


// === Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left));
  const y = Math.floor((e.clientY - rect.top));

  // 計算 tile 網格位置
  const tileX = Math.floor(x / tileSize);
  const tileY = Math.floor(y / tileSize);

  if (tileX >= 0 && tileX < mapW && tileY >= 0 && tileY < mapH) {
    const mapIndex = tileY * mapW + tileX;
    const tileIndex = mapTileIndices[mapIndex];

    tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
    tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
    tooltip.style.display = "block";
    tooltip.innerHTML = `Tile [${tileX}, ${tileY}]<br>Index: ${tileIndex}`;
  } else {
    tooltip.style.display = "none";
  }
});


// === File Handling ===
const expectedFiles = ["maptiles.vga", "objtiles.vga", "tileindx.vga",
  "masktype.vga", "u6pal", "animdata", "animmask.vga"];
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
