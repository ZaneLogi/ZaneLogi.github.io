import { U6DB } from './u6db.js';

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

// === Shader Source ===
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

  setFromU6(u6pal) {
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

  generateAtlas(tileCount, tileSize, tilesPerRow) {
    const tilesPerCol = Math.ceil(tileCount / tilesPerRow);
    this.width = tilesPerRow * tileSize;
    this.height = tilesPerCol * tileSize;
    this.data = new Uint8Array(this.width * this.height);

    for (let i = 0; i < tileCount; i++) {
      const index = i;
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
  }
};

IndexedTextureManager.generateAtlas(tileCount, tileSize, tilesPerRow);
IndexedTextureManager.createTexture(gl);

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
    PaletteManager.setFromU6(u6pal);
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
