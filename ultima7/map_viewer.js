import { fileStore } from './filestore.js';
import { WebGLIndexedRenderer } from './webgl_indexed_renderer.js';
import {
  palettes, shapesVga, worldMap, timeQueue,
  PIXELS_PER_CHUNK
} from './globals.js';

console.log("=== world_viewer ===");

const JSZip = window.JSZip;
if (!JSZip) throw new Error("JSZip not loaded");

// === Global WebGL Setup ===
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
if (!gl) alert("WebGL2 not supported");

console.log(`GL max texture size: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);

const renderer = new WebGLIndexedRenderer(canvas);
renderer.setPalette(palettes.current());


// === display framerate ===
const displayFrameRate = (() => {
  const times = [];
  const time_samples = 60;
  let lastTimestamp = null;
  const frameRateDiv = document.getElementById("frameRate");
  return (timestamp) => {
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
  };
})();

// === runloop ===
let frame = 0;
let worldX = 2724, worldY = 2244;
import {
  PIXELS_PER_TILE,
  TILES_PER_CHUNK,
  CHUNKS_PER_SUPERCHUNK,
  SUPERCHUNKS_PER_WORLD
} from "./globals.js";
const PIXELS_PER_WORLD = SUPERCHUNKS_PER_WORLD * CHUNKS_PER_SUPERCHUNK * TILES_PER_CHUNK * PIXELS_PER_TILE; // 24576

function runloop(timestamp) {
  displayFrameRate(timestamp);

  // render something here
  const frameBuffer = renderer.getBuffer();

  if (shapesVga.shapes) {
    timeQueue.trigger(timestamp);

    if ((frame % 8) === 0) {
      //palettes.rotateColors(0xfc, 0xfc+3);
      //palettes.rotateColors(0xf8, 0xf8+4);
      palettes.rotateColors(0xf4, 0xf4+4);
      palettes.rotateColors(0xf0, 0xf0+4);
      palettes.rotateColors(0xe8, 0xe8+8);
      palettes.rotateColors(0xe0, 0xe0+8);
      renderer.setPalette(palettes.current());
    }

    //if (frame !== 30)
    worldMap.draw(frameBuffer, worldX, worldY);
  }
  else {
    palettes.draw(frameBuffer);
  }

  renderer.render();

  frame++;
  requestAnimationFrame(runloop);
}

requestAnimationFrame(runloop); // trigger first time


// === Handle Canvas Dragging ===
export function setWorldPosition(x, y) {
  worldX = (x + PIXELS_PER_WORLD) % PIXELS_PER_WORLD;
  worldY = (y + PIXELS_PER_WORLD) % PIXELS_PER_WORLD;
}

export function getWorldPosition() {
  return { x: worldX, y: worldY };
}

// === Handle Canvas Resizing ===
export function onResizeCanvas(width, height) {
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.0, 0.2, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  renderer.resize(width, height);
}

// === Handle Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const xoff = worldX + (e.clientX - rect.left);
  const yoff = worldY +(e.clientY - rect.top);
  const xchunk = Math.floor(xoff / PIXELS_PER_CHUNK);
  const ychunk = Math.floor(yoff / PIXELS_PER_CHUNK);
  const xtile = Math.floor((xoff % PIXELS_PER_CHUNK) / PIXELS_PER_TILE);
  const ytile = Math.floor((yoff % PIXELS_PER_CHUNK) / PIXELS_PER_TILE);

  const showTooltip = (html) => {
      tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
      tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
      tooltip.style.display = "block";
      tooltip.innerHTML = html;
    };

  showTooltip(`x:${xoff}, y:${yoff}<br>` +
    `xchunk:${xchunk}, ychunk:${ychunk}<br>` +
    `xtile:${xtile}, ytile:${ytile}`
  );
});


// === File Handling ===
const fileMap = new Map();

const expectedFiles = [
  "static/u7chunks", "static/u7map", "static/palettes.flx", "static/shapes.vga",
  "static/tfa.dat", "static/shpdims.dat", "static/occlude.dat"
];

// Add U7IFIX00 to U7IFIX8F (12 x 12 = 144 superchunks)
for (let i = 0; i < 144; i++) {
  const hex = i.toString(16).padStart(2, '0');  // "00" .. "8f"
  const name = `STATIC/U7IFIX${hex}`;
  expectedFiles.push(name.toLowerCase());
}

// Add U7IREG00 to U7IREG8F (12 x 12 = 144 superchunks)
for (let i = 0; i < 144; i++) {
  const hex = i.toString(16).padStart(2, '0');  // "00" .. "8f"
  const name = `GAMEDAT/U7IREG${hex}`;
  expectedFiles.push(name.toLowerCase());
}

function findFileIndex(expectedFiles, inputFileName) {
  const target = inputFileName.toLowerCase();
  return expectedFiles.findIndex(expectedPath => {
    const baseName = expectedPath.split(/[/\\]/).pop().toLowerCase();
    return baseName === target;
  });
}

document.getElementById("resetBtn").onclick = async () => {
  await fileStore.clear();
  await updateChecklist();
  location.reload();
};

document.getElementById("dropzone").addEventListener("dragover", e => e.preventDefault());
document.getElementById("dropzone").addEventListener("drop", async (e) => {
  e.preventDefault();
  const fileList = [];
  for (const file of e.dataTransfer.files) {
    console.log(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'zip') {
      const data = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(data);
      for (const name in zip.files) {
        const entry = zip.files[name];
        if (entry.dir) continue;

        let filename = name.split(/[/\\]/).pop().toLowerCase();
        const index = findFileIndex(expectedFiles, filename);
        console.log(name, filename, index);
        if (index >= 0) {
          filename = expectedFiles[index];
          const uint8 = await entry.async("uint8array");
          fileMap.set(filename, uint8);
          fileList.push({filename, uint8});
        }
      }
    }
    else {
      let filename = file.name.toLowerCase();
      const index = findFileIndex(expectedFiles, filename);
      if (index >= 0) {
        filename = expectedFiles[index];
        const data = await file.arrayBuffer();
        const uint8 = new Uint8Array(data);
        fileMap.set(filename, uint8);
        fileList.push({filename, uint8});
      }
    }
  }

  await fileStore.set(fileList);
  await updateChecklist();
  tryInitializeViewer();
});

async function updateChecklist() {
  let ready = true;
  let result = "📦 Required Files:\n";
  for (const name of expectedFiles) {
    const data = await fileStore.get(name);
    if (data) {
      result += `✅ ${name.padEnd(15)} (${data.length} bytes)\n`;
    } else {
      result += `⛔ ${name.padEnd(15)} (missing)\n`;
      ready = false;
    }
  }
  result += `\n🎯 Ready: ${ready ? "YES" : "NO"}`;

  const checklistDiv = document.getElementById("fileChecklist");
  checklistDiv.textContent = result;
}

async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    console.log("everything is ready!");

    // load shapes.vga
    shapesVga.load(fileMap.get("static/shapes.vga"));

    // load palettes
    palettes.load(fileMap.get("static/palettes.flx"))
    palettes.select(0);
    renderer.setPalette(palettes.current());

    // load world map
    worldMap.load(fileMap);
  }
}

async function loadFromIndexedDB() {
  for (const name of expectedFiles) {
    const data = await fileStore.get(name);
    if (data) fileMap.set(name, data);
  }
  await updateChecklist();
  tryInitializeViewer();
}

loadFromIndexedDB();
