import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';

const expectedFiles = ["maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal"];
const fileMap = new Map();
const tileManager = new TileManager();

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const checklistDiv = document.getElementById("fileChecklist");
const tooltip = document.getElementById("tooltip");

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

function drawAllTiles(ctx, palette) {
  const cols = 32;
  const rows = Math.ceil(2048 / cols);
  canvas.width = cols * 16;
  canvas.height = rows * 16;

  for (let i = 0; i < 2048; i++) {
    const x = (i % cols) * 16;
    const y = Math.floor(i / cols) * 16;
    const tilePixels = tileManager.getTilePixels(i);
    drawTile(ctx, tilePixels, x, y, palette);
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const tileX = Math.floor((e.clientX - rect.left) / 16);
    const tileY = Math.floor((e.clientY - rect.top) / 16);
    const tileIndex = tileY * cols + tileX;
    if (tileIndex >= 0 && tileIndex < 2048) {
      const format = tileManager.getTileFormat(tileIndex);
      tooltip.style.left = e.pageX + 10 + "px";
      tooltip.style.top = e.pageY + 10 + "px";
      tooltip.style.display = "block";
      tooltip.innerText = `Tile ${tileIndex} (0x${tileIndex.toString(16)})\nFormat: 0x${format.toString(16)}`;
    } else {
      tooltip.style.display = "none";
    }
  });
}

async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    tileManager.init(fileMap);

    const u6pal = fileMap.get("u6pal");
    const palette = loadU6Palette(u6pal);

    drawAllTiles(ctx, palette);
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
