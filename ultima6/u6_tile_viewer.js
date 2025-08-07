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
  const PaletteManager = {
    data: new Uint8Array(256 * 4),
    
    getColor(index) {
      const offset = index * 4;
      return {
        r: this.data[offset],
        g: this.data[offset + 1],
        b: this.data[offset + 2],
      };
    },
  };

  const data = PaletteManager.data;
  for (let i = 0; i < 256; i++) {
    data[i*4 + 0] = u6pal[i*3] * 4;
    data[i*4 + 1] = u6pal[i*3 + 1] * 4;
    data[i*4 + 2] = u6pal[i*3 + 2] * 4;
    data[i*4 + 3] = 255;
  }

  return PaletteManager;
}

function drawAllTiles(ctx, palette) {
  const cols = 32;
  const rows = Math.ceil(2048 / cols);
  canvas.width = cols * 16;
  canvas.height = rows * 16;

  for (let i = 0; i < 2048; i++) {
    const x = (i % cols) * 16;
    const y = Math.floor(i / cols) * 16;
    const tileImage = tileManager.getTileImage(i, palette);
    ctx.drawImage(tileImage, x, y);
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
    tileManager.init(fileMap, true);

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
