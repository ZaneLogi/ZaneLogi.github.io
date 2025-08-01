import { U6DB } from './u6db.js';
import { PaletteManager } from './palette_manager.js';
import { IndexedTextureManager } from './indexed_texture_manager.js';

// === Global WebGL Setup ===
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
if (!gl) alert("WebGL2 not supported");

// === Constants ===
const tileSize = 16;
const tileCount = 256;
const tilesPerRow = 16;
const tilesPerCol = 16;
const atlasW = tilesPerRow * tileSize;
const atlasH = tilesPerCol * tileSize;

import { program } from './palette_viewer_shader.js';

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

// === Generate Map Data (64x64) ===
const mapW = 16, mapH = 16;
const map = new Uint16Array(mapW * mapH);
for (let i = 0; i < map.length; i++) map[i] = i;

// === Build VBO ===
const positions = [], uvs = [];
for (let my = 0; my < mapH; my++) {
  for (let mx = 0; mx < mapW; mx++) {
    const tileIndex = map[my * mapW + mx];
    const tx = tileIndex % tilesPerRow;
    const ty = Math.floor(tileIndex / tilesPerRow);
    const u0 = (tx * tileSize) / atlasW;
    const v0 = (ty * tileSize) / atlasH;
    const u1 = ((tx + 1) * tileSize) / atlasW;
    const v1 = ((ty + 1) * tileSize) / atlasH;
    const x0 = mx * tileSize;
    const y0 = my * tileSize;
    const x1 = x0 + tileSize;
    const y1 = y0 + tileSize;
    positions.push(x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1);
    uvs.push(u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1);
  }
}

function makeBuffer(attr, size, data) {
  const loc = gl.getAttribLocation(program, attr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

makeBuffer('a_position', 2, positions);
makeBuffer('a_uv', 2, uvs);

// === Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left));
  const y = Math.floor((e.clientY - rect.top));
  if (x >= 0 && x < atlasW && y >= 0 && y < atlasH) {
    const index = IndexedTextureManager.getIndex(x, y);
    const color = PaletteManager.getColor(index);
    tooltip.style.left = e.pageX + 10 + "px";
    tooltip.style.top = e.pageY + 10 + "px";
    tooltip.style.display = "block";
    tooltip.innerHTML = `Index ${index}<br>RGB(${color.r}, ${color.g}, ${color.b})<br>
      <div style="width: 20px; height: 20px;
        background-color: rgb(${color.r}, ${color.g}, ${color.b});
        border: 1px solid #000;
        margin-top: 4px;"></div>
`;
  } else {
    tooltip.style.display = "none";
  }
});

// === Animation ===
let frame = 0;
function animate() {
  requestAnimationFrame(animate);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(u_resolution, canvas.width, canvas.height);

  PaletteManager.colorCycling(gl, frame);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);

  frame++;
}

animate();

// === File Handling ===
const expectedFiles = ["u6pal"];
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
