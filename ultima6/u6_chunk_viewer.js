import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';

const expectedFiles = ["maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal", "chunks"];
const fileMap = new Map();
const tileManager = new TileManager();

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
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

function loadU6Palette(u6pal) {
  const palette = [];
  for (let i = 0; i < 256; i++) {
    palette.push([
      u6pal[i * 3] << 2,
      u6pal[i * 3 + 1] << 2,
      u6pal[i * 3 + 2] << 2
    ]);
  }
  return palette;
}

function drawTile(ctx, tilePixels, x, y, palette) {
  const imageData = ctx.createImageData(16, 16);
  const data = imageData.data;
  const buf = tilePixels;

  for (let i = 0; i < 256; i++) {
    const color = buf[i];
    const base = i * 4;
    if (color === 0xFF) {
      data[base + 3] = 0;
    } else {
      const [r, g, b] = palette[color];
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
      data[base + 3] = 255;
    }
  }

  ctx.putImageData(imageData, x, y);
}

function drawChunk(ctx, chunkData, x, y, palette) {
  for (let offset = 0, yoff = y; offset < 64; yoff += 16) {
    for (let w = 0, xoff = x; w < 8; w++, xoff += 16, offset++) {
      const tileIndex = chunkData[offset];
      const tilePixels = tileManager.getTilePixels(tileIndex);
      drawTile(ctx, tilePixels, xoff, yoff, palette);
    }
  }
}

async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    tileManager.init(fileMap);

    const u6pal = fileMap.get("u6pal");
    const palette = loadU6Palette(u6pal);

    const chunks = fileMap.get("chunks");
    for (let i = 512; i < 512 + 128; i++) {
      const offset = i * 64;
      const chunkData = chunks.slice(offset, offset + 64);
      const x = ((i-512) % 8) * 8 * 16;
      const y = Math.floor((i-512) / 8) * 8 * 16;
      drawChunk(ctx, chunkData, x, y, palette);
    }
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