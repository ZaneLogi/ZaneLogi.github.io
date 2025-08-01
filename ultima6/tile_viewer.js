import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';

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

// === Shader Source ===
/*
code below is refactored by gl_InstanceID and gl_VertexID

const vsSource = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_resolution;
out vec2 v_uv;
void main() {
  vec2 normalized = (a_position / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(normalized, 0, 1);
  v_uv = a_uv;
}`;
*/
const vsSource = `#version 300 es
in float a_tileIndex;
in vec2 a_tilePos;

uniform vec2 u_resolution;
uniform float u_tileSize;
uniform float u_tilesPerRow;
uniform float u_atlasW;
uniform float u_atlasH;

out vec2 v_uv;

const vec2 quadVerts[6] = vec2[6](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(0.0, 1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

void main() {
  vec2 offset = a_tilePos * u_tileSize;
  vec2 pos = (quadVerts[gl_VertexID] * u_tileSize) + offset;

  vec2 normalized = (pos / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(normalized, 0, 1);

  float tx = mod(a_tileIndex, u_tilesPerRow);
  float ty = floor(a_tileIndex / u_tilesPerRow);
  vec2 uv0 = vec2(tx * u_tileSize / u_atlasW, ty * u_tileSize / u_atlasH);
  vec2 uv1 = uv0 + vec2(u_tileSize / u_atlasW, u_tileSize / u_atlasH);

  v_uv = mix(uv0, uv1, quadVerts[gl_VertexID]);
}`;

const fsSource = `#version 300 es
precision mediump float;
uniform sampler2D u_indexedTexture;
uniform sampler2D u_paletteTexture;
in vec2 v_uv;
out vec4 outColor;
void main() {
  float index = texture(u_indexedTexture, v_uv).r * 255.0;
  float paletteU = (index + 0.5) / 256.0;
  outColor = texture(u_paletteTexture, vec2(paletteU, 0.5));
}`;

/* original version:
float index = texture(u_indexedTexture, v_uv).r;
outColor = texture(u_paletteTexture, vec2(index, 0.5));

as WebGL normalizes values from 0–255 to the range 0.0–1.0,
'index' is the value from 0.0-1.0, need to convert it back to 0-255
so it should do ('index' * 255.0 + 0.5) / 256.0
:index = 0 → paletteU = 0.5 / 256 = center of the 0th texel
:index = 1 → paletteU = 255.5 / 256 = center of the last (255th) texel
:This ensures alignment with the exact centers of all 256 texels → no sampling error, no black pixels
*/

// === Shader Utilities ===
function createShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// === Program Setup ===
const program = gl.createProgram();
gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
gl.linkProgram(program);
gl.useProgram(program);

// === Uniforms ===
const u_resolution = gl.getUniformLocation(program, 'u_resolution');
gl.uniform2f(u_resolution, canvas.width, canvas.height);
const u_indexed = gl.getUniformLocation(program, 'u_indexedTexture');
const u_palette = gl.getUniformLocation(program, 'u_paletteTexture');
gl.uniform1i(u_indexed, 0);
gl.uniform1i(u_palette, 1);

// === Palette Manager ===
const PaletteManager = {
  texture: null,
  data: new Uint8Array(256 * 4),

  init(gl) {
    for (let i = 0; i < 256; i++) {
      this.data[i*4 + 0] = (i * 97) % 256;
      this.data[i*4 + 1] = (i * 47) % 256;
      this.data[i*4 + 2] = (i * 67) % 256;
      this.data[i*4 + 3] = 255;
    }
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    console.log("PaletteManager initialized");
  },

  setFromU6(gl, u6pal) {
    for (let i = 0; i < 256; i++) {
      this.data[i*4 + 0] = u6pal[i*3] * 4;
      this.data[i*4 + 1] = u6pal[i*3 + 1] * 4;
      this.data[i*4 + 2] = u6pal[i*3 + 2] * 4;
      this.data[i*4 + 3] = 255;
    }
    this.update(gl);
  },

  update(gl) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
  },

  getColor(index) {
    const offset = index * 4;
    return {
      r: this.data[offset],
      g: this.data[offset + 1],
      b: this.data[offset + 2],
    };
  },

  colorCycling(gl, frame) {
    const rotate = function(data, start, end) {
      const temp = new Uint8Array(4);
      const base = start * 4;
      // Copy first color into temp
      temp.set(data.subarray(base, base + 4));
      // Move colors forward (7 colors)
      data.copyWithin(base, base + 4, end * 4);
      // Put saved first color at the end
      data.set(temp, (end - 1) * 4);
    };
    let updated = false;
    // 8-entry intervals: cycle every 4 frames
    if (frame % 4 === 0) {
      rotate(this.data, 0xe0, 0xe8);
      rotate(this.data, 0xe8, 0xf0);
      updated = true;
    }
    // 4-entry intervals: cycle every 8 frames
    if (frame % 8 === 0) {
      rotate(this.data, 0xf0, 0xf4);
      rotate(this.data, 0xf4, 0xf8);
      rotate(this.data, 0xf8, 0xfc);
      updated = true;
    }
    if (updated) this.update(gl);
  },
};

PaletteManager.init(gl);

// === IndexedTextureManager ===
const IndexedTextureManager = {
  texture: null,
  data: null,
  width: 0,
  height: 0,

  init(gl) {
    this.generateAtlas(tileCount, tileSize, tilesPerRow);
    this.createTexture(gl);
  },

  generateAtlas(tileCount, tileSize, tilesPerRow) {
    const tilesPerCol = Math.ceil(tileCount / tilesPerRow);
    this.width = tilesPerRow * tileSize;
    this.height = tilesPerCol * tileSize;
    this.data = new Uint8Array(this.width * this.height);

    for (let i = 0; i < tileCount; i++) {
      const index = i % 256;
      const tx = i % tilesPerRow;
      const ty = Math.floor(i / tilesPerRow);
      const baseX = tx * tileSize;
      const baseY = ty * tileSize;
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const dstX = baseX + x;
          const dstY = baseY + y;
          this.data[dstY * this.width + dstX] = index;
        }
      }
    }
  },

  createTexture(gl) {
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      this.width, this.height, 0,
      gl.RED, gl.UNSIGNED_BYTE, this.data
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  },

  getIndex(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.data[y * this.width + x];
  },

  blitTile(srcPixels, xTile, yTile) {
    let dstOffset = yTile * 16 * this.width + xTile * 16;
    for (let ty = 0, srcOffset = 0; ty < tileSize; ty++, srcOffset += 16) {
      this.data.set(srcPixels.subarray(srcOffset, srcOffset + tileSize), dstOffset);
      dstOffset += this.width;
    }
  },

  update(gl) {
    for (let i = 0; i < tileCount; i++) {
      const tileIndex = i;
      const pixels = tileManager.getTilePixels(tileIndex);
      const xTile = i % tilesPerRow;
      const yTile = Math.floor(i / tilesPerRow);
      this.blitTile(pixels, xTile, yTile);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RED, gl.UNSIGNED_BYTE, this.data);
  },
};

IndexedTextureManager.init(gl);

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
function makeInstancedBuffer(attr, size, type, data) {
  const loc = gl.getAttribLocation(program, attr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); // 可動態更新

  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, type, false, 0, 0);
  gl.vertexAttribDivisor(loc, 1); // 每 instance 用一次
  return buf;
}

const tileIndexBuffer = makeInstancedBuffer('a_tileIndex', 1, gl.FLOAT, new Float32Array(mapTileIndices));
const tilePosBuffer = makeInstancedBuffer('a_tilePos', 2, gl.FLOAT, mapTilePositions);

const AnimDataManager = {
  tileIndexMap: Uint16Array.from({ length: 2048 }, (_, i) => i),
  data: null,

  update(frame) {
    if (this.data === null)
      return;

    const {
      number_of_tiles_to_animate,
      tile_to_animate,
      first_anim_frame,
      and_masks,
      shift_values
    } = this.data; 

    for (let i = 0; i < number_of_tiles_to_animate; i++) {
      const mask = and_masks[i];
      const shift = shift_values[i];

      const current_anim_frame = (frame & mask) >> shift;

      const target_index = tile_to_animate[i];
      const source_index = first_anim_frame[i] + current_anim_frame;

      this.tileIndexMap[target_index] = source_index;
    }
  },
};

function updateTileIndexBuffer(frame) {
  AnimDataManager.update(frame);
  for (let i = 0; i < map.length; i++) {
    mapTileIndices[i] = AnimDataManager.tileIndexMap[i];
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, tileIndexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(mapTileIndices));
}

gl.uniform1f(gl.getUniformLocation(program, "u_tileSize"), tileSize);
gl.uniform1f(gl.getUniformLocation(program, "u_tilesPerRow"), tilesPerRow);
gl.uniform1f(gl.getUniformLocation(program, "u_atlasW"), atlasW);
gl.uniform1f(gl.getUniformLocation(program, "u_atlasH"), atlasH);


/*
code below is refactored by gl_InstanceID and gl_VertexID

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
*/
// === Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left));
  const y = Math.floor((e.clientY - rect.top));
  if (x >= 0 && x < atlasW && y >= 0 && y < atlasH) {
    const index = IndexedTextureManager.getIndex(x, y);
    const color = PaletteManager.getColor(index);
    tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
    tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
    tooltip.style.display = "block";
    tooltip.innerHTML = `Index ${index}<br>RGB(${color.r}, ${color.g}, ${color.b})<br>
      <div style="width: 20px; height: 20px;
        background-color: rgb(${color.r}, ${color.g}, ${color.b});
        border: 1px solid #000;
        margin-top: 4px;"></div>`;
  } else {
    tooltip.style.display = "none";
  }
});


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


function parseAnimData(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const number_of_tiles_to_animate = view.getUint16(offset, true); offset += 2;

  const tile_to_animate = new Uint16Array(0x20);
  for (let i = 0; i < 0x20; i++) {
    tile_to_animate[i] = view.getUint16(offset, true);
    offset += 2;
  }

  const first_anim_frame = new Uint16Array(0x20);
  for (let i = 0; i < 0x20; i++) {
    first_anim_frame[i] = view.getUint16(offset, true);
    offset += 2;
  }

  const and_masks = new Uint8Array(0x20);
  for (let i = 0; i < 0x20; i++) {
    and_masks[i] = view.getUint8(offset++);
  }

  const shift_values = new Uint8Array(0x20);
  for (let i = 0; i < 0x20; i++) {
    shift_values[i] = view.getUint8(offset++);
  }

  return {
    number_of_tiles_to_animate,
    tile_to_animate,
    first_anim_frame,
    and_masks,
    shift_values
  };
}

function loadAnimData(fileMap) {
  const animMaskData = fileMap.get("animdata");
  AnimDataManager.data = parseAnimData(animMaskData);
}



// === File Handling ===
const expectedFiles = ["maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal", "animdata"];
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
    const tileIndexMap = loadAnimData(fileMap);

    console.log("load tiles");
    tileManager.init(fileMap);
    IndexedTextureManager.update(gl);
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
