import { U6DB } from './u6db.js';
import { TileManager } from './tile.js';
import { U6Map } from './u6map.js'

const expectedFiles = ["maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal", "chunks", "map", "animdata"];
const fileMap = new Map();
const tileManager = new TileManager();
const u6map = new U6Map();
const u6pal = new Array(256);
let allSet = false;

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

function loadU6Palette(fileMap) {
  const paletteData = fileMap.get("u6pal");
  for (let i = 0; i < 256; i++) {
    u6pal[i] = [
      paletteData[i * 3] << 2,
      paletteData[i * 3 + 1] << 2,
      paletteData[i * 3 + 2] << 2
    ];
  }
}

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
  const {
      number_of_tiles_to_animate,
      tile_to_animate,
      first_anim_frame,
      and_masks,
      shift_values
  } = parseAnimData(animMaskData);

  // update 'tileIndexMap'
  const gameCounter = 0;

  for (let i = 0; i < number_of_tiles_to_animate; i++) {
      const mask = and_masks[i];
      const shift = shift_values[i];

      const current_anim_frame = (gameCounter & mask) >> shift;

      const target_index = tile_to_animate[i];
      const source_index = first_anim_frame[i] + current_anim_frame;

      tileIndexMap[target_index] = tileIndexMap[source_index];
    }
}

/*
here is the suggestion from ChatGPT for the palette update

function updateAllTilesWithNewPalette(newPalette) {
  for (let i = 0; i < tileManager.imageCache.length; i++) {
    if (tileManager.imageCache[i]) {
      tileManager.getTileImage(i, newPalette, true); // force re-render tile
    }
  }
  // 重新畫地圖
  onCanvasResized();
}
*/

const U6_ANIM_SRC_TILE = [
  0x16,0x16,0x1a,0x1a,0x1e,0x1e,0x12,0x12,
	0x1a,0x1e,0x16,0x12,0x16,0x1a,0x1e,0x12,
	0x1a,0x1e,0x1e,0x12,0x12,0x16,0x16,0x1a,
	0x12,0x16,0x1e,0x1a,0x1a,0x1e,0x12,0x16
];

const tileIndexMap = Array.from({length:2048}, (_, i) => i);

function drawTile(ctx, tileIndex, x, y, palette) {
  const tileCanvas = tileManager.getTileImage(tileIndex, palette);
  ctx.drawImage(tileCanvas, x, y);
}

let viewportX = 64 * 16;
let viewportY = 196 * 16;

function drawMap(ctx, palette) {
  const xstart = Math.floor(viewportX / 16);
  const ystart = Math.floor(viewportY / 16);
  const xend = xstart + Math.floor((canvas.width+15)/16) + 1;
  const yend = ystart + Math.floor((canvas.height+15)/16) + 1;

  const ox = -(viewportX % 16);
  const oy = -(viewportY % 16);

  const WORLD_TILES = 1024;

  for (let ytile = ystart, cury = oy; ytile < yend; ytile++, cury += 16) {
    for (let xtile = xstart, curx = ox; xtile < xend; xtile++, curx += 16) {
      const x_coord = xtile % WORLD_TILES;
      const y_coord = ytile % WORLD_TILES;

      const chunk_index = u6map.superChunks.get(y_coord >> 3, x_coord >> 3);
      console.assert(chunk_index<1024);

      const chunk_offset = chunk_index * 64;
      const tile_index = u6map.chunks[chunk_offset + (y_coord & 7) * 8 + (x_coord & 7)];
      console.assert(tile_index<2048);

      // todo: need to use animmask.vga to make this work for the animation
      //if (tile_index >= 16 && tile_index < 48) //lay down the base tile for shoreline tiles
      //{
      // drawTile(ctx, tileIndexMap[U6_ANIM_SRC_TILE[tile_index - 16] / 2], curx, cury, palette);
      //}

      drawTile(ctx, tileIndexMap[tile_index], curx, cury, palette);
    }
  }
}


let isCanvasDragging = false;
let dragCanvasOffsetX = 0;
let dragCanvasOffsetY = 0;
let lastViewportX, lastViewportY;

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;

  // lock the pointer event，even the cursor is out of canvas, still can receive pointerup/pointermove
  canvas.setPointerCapture(e.pointerId);

  isCanvasDragging = true;

  const rect = canvas.getBoundingClientRect();
  dragCanvasOffsetX = e.clientX - rect.left;
  dragCanvasOffsetY = e.clientY - rect.top;
  lastViewportX = viewportX;
  lastViewportY = viewportY;

  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!isCanvasDragging) return;

  viewportX = lastViewportX - (e.clientX - dragCanvasOffsetX);
  viewportY = lastViewportY - (e.clientY - dragCanvasOffsetY);

  if (viewportX < 0) viewportX += 16384;
  else if (viewportX >= 16384) viewportX -= 16384;

  if (viewportY < 0) viewportY += 16384;
  else if (viewportY >= 16384) viewportY -= 16384;

  onCanvasResized();
});

canvas.addEventListener("pointerup", (e) => {
  // release pointer capture
  canvas.releasePointerCapture(e.pointerId);
  isCanvasDragging = false;
});


async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    tileManager.init(fileMap);
    u6map.init(fileMap);

    loadU6Palette(fileMap);
    loadAnimData(fileMap);

    allSet = true;
    onCanvasResized();
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

export function onCanvasResized() {
  if (allSet) {
    drawMap(ctx, u6pal);
  }
}

loadFromIndexedDB();


// debug purpose for all exports
function exposeDebugIfDev() {
  if (typeof window !== 'undefined' && window.DEV_MODE) {
    import(import.meta.url).then(mod => {
      window.debug = mod;
      console.log("[DEV] All exports available as window.debug");
    });
  }
}

exposeDebugIfDev();
