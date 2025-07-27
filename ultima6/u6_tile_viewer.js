import { U6DB } from './u6db.js';
import { lzwDecode } from './lzw_decoder.js';

const expectedFiles = ["maptiles.vga", "objtiles.vga", "tileindx.vga", "masktype.vga", "u6pal"];
const fileMap = new Map();

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");

document.getElementById("resetBtn").onclick = async () => {
  await U6DB.clear();
  location.reload();
};

document.getElementById("dropzone").addEventListener("dragover", e => e.preventDefault());
document.getElementById("dropzone").addEventListener("drop", async (e) => {
  e.preventDefault();
  for (const file of e.dataTransfer.files) {
    const data = await file.arrayBuffer();
    const uint8 = new Uint8Array(data);
    fileMap.set(file.name.toLowerCase(), uint8);
    console.log(file.name);
    await U6DB.set(file.name, uint8);
  }
  tryInitializeViewer();
});

function isValidCompressedFile(data) {
  if (data.length < 6) return false;
  if (data[3] !== 0) return false;
  const uncompressedSize = data[0] + (data[1] << 8) + (data[2] << 16);
  if (uncompressedSize <= data.length - 4) return false;
  const check = data[4] + ((data[5] & 1) << 8);
  return check === 0x100;
}

function decompressCompressedFile(data) {
  if (!isValidCompressedFile(data)) throw new Error("Invalid compressed file");

  const compressedData = data.slice(4);
  return lzwDecode(compressedData, 8);
}

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

function getTileOffset(index, tileindex_vga) {
  const lo = tileindex_vga[index * 2];
  const hi = tileindex_vga[index * 2 + 1];
  return (hi << 8 | lo) * 16;
}

function getTileFormat(index, masktype_vga) {
  return masktype_vga[index];
}

function getTileData(index, tileindex_vga, masktype_vga, alltiles) {
  const offset = getTileOffset(index, tileindex_vga);
  const format = getTileFormat(index, masktype_vga);
  if (format === 0x00 || format === 0x05) {
    return { format, pixels: alltiles.slice(offset, offset + 256) };
  }
  if (format === 0x0A) {
    const tileLength = alltiles[offset] * 16;
    return { format, pixels: alltiles.slice(offset, offset + tileLength) };
  }
  throw new Error("Unknown tile format: " + format.toString(16));
}

function decodePixelBlockTile(src) {
  const out = new Uint8Array(16 * 16).fill(0xFF);
  let ptr = 0;

  const tileDataLengthDiv16 = src[ptr++]; // the size in 16-byte pages of the tile data
  let dstOffset = 0;

  while (true) {
    const b0 = src[ptr++]; // b0, b1: displacement
    const b1 = src[ptr++];
    const b2 = src[ptr++]; // b2: length
    if (b2 === 0) break;

    const skipPixels = b0 & 0x0F;
    dstOffset += skipPixels;

    for (let i = 0; i < b2; i++) {
      out[dstOffset++] = src[ptr++];
    }
  }

  return out;
}

function drawTile(ctx, tileData, x, y, palette) {
  const imageData = ctx.createImageData(16, 16);
  const data = imageData.data;
  let buf = new Uint8Array(256).fill(0xFF);

  if (tileData.format === 0x00 || tileData.format === 0x05) {
    buf = tileData.pixels;
  } else if (tileData.format === 0x0A) {
    buf = decodePixelBlockTile(tileData.pixels);
  }

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

function drawAllTiles(ctx, alltiles, tileindex_vga, masktype_vga, palette) {
  const cols = 32;
  const rows = Math.ceil(2048 / cols);
  canvas.width = cols * 16;
  canvas.height = rows * 16;

  for (let i = 0; i < 2048; i++) {
    const x = (i % cols) * 16;
    const y = Math.floor(i / cols) * 16;
    const tile = getTileData(i, tileindex_vga, masktype_vga, alltiles);
    drawTile(ctx, tile, x, y, palette);
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const tileX = Math.floor((e.clientX - rect.left) / 16);
    const tileY = Math.floor((e.clientY - rect.top) / 16);
    const tileIndex = tileY * cols + tileX;
    if (tileIndex >= 0 && tileIndex < 2048) {
      const format = getTileFormat(tileIndex, masktype_vga);
      tooltip.style.left = e.pageX + 10 + "px";
      tooltip.style.top = e.pageY + 10 + "px";
      tooltip.style.display = "block";
      tooltip.innerText = `Tile ${tileIndex} (0x${tileIndex.toString(16)})\\nFormat: 0x${format.toString(16)}`;
    } else {
      tooltip.style.display = "none";
    }
  });
}

async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    const objtiles = fileMap.get("objtiles.vga");
    const tileindex = fileMap.get("tileindx.vga");
    const u6pal = fileMap.get("u6pal");

    const rawMapTiles = fileMap.get("maptiles.vga");
    const maptiles = decompressCompressedFile(rawMapTiles);

    const rawMaskType = fileMap.get("masktype.vga");
    const masktype = decompressCompressedFile(rawMaskType);

    const alltiles = new Uint8Array(maptiles.length + objtiles.length);
    alltiles.set(maptiles, 0);
    alltiles.set(objtiles, maptiles.length);

    const palette = loadU6Palette(u6pal);
    drawAllTiles(ctx, alltiles, tileindex, masktype, palette);
  }
}

async function loadFromIndexedDB() {
  for (const name of expectedFiles) {
    const data = await U6DB.get(name);
    console.log(name, data?.length);
    if (data) fileMap.set(name, data);
  }
  tryInitializeViewer();
}

loadFromIndexedDB();
