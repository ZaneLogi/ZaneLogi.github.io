import { fileStore } from './filestore.js';
import { ShapeFile } from './shapefile.js';
import { FlexFile } from './flexfile.js';
import { WebGLIndexedRenderer } from './webgl_indexed_renderer.js';
import { U7Palettes } from './u7palettes.js';
import { U7Chunks } from './u7chunks.js';

const JSZip = window.JSZip;
if (!JSZip) throw new Error("JSZip not loaded");

// === Global WebGL Setup ===
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
if (!gl) alert("WebGL2 not supported");

console.log(`GL max texture size: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);

const palettes = new U7Palettes();
let chunks = null;
const shapeFile = new ShapeFile();

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

function runloop(timestamp) {
  displayFrameRate(timestamp);

  requestAnimationFrame(runloop);

  // render something here
  const {width, height} = canvas;
  const palW = Math.min(width, 256);
  const palH = Math.min(height, 256);
  const frameBuffer = renderer.getBuffer().p;
  if (frame === 10) {
    for (let y = 0; y < palH; y++) {
      for (let x = 0; x < palW; x++) {
        frameBuffer[y * width + x] = Math.floor(x/16) + Math.floor(y/16)*16;
      }
    }
  }

  if (shapeFile.shapes) {
    //const shapeFrames = shapeFile.shapes[0].frames;
    //for (let i = 0; i < shapeFrames.length; i++) {
    //  shapeFrames[i].draw(renderer.getBuffer(), i * 8+7, 256 + 7);
    //}

    if (frame === 30) {
      const {width, height} = renderer.getBuffer();
      const shape150 = shapeFile.shapes[150];
      const frames150 = shape150.frames;
      const frame0 = frames150[0];
      const x = Math.floor(frame0.width/2);
      const y = 262 + frame0.height;

      const halfW = Math.floor(frame0.width/2);
      const halfH = Math.floor(frame0.height/2);

      frame0.draw(renderer.getBuffer(), 300, 300, null, false);
      frame0.draw(renderer.getBuffer(), width, halfH, null, true);
      frame0.draw(renderer.getBuffer(), halfW, height, null, true);
      frame0.draw(renderer.getBuffer(), width, height, null, true);
    }
  }

  renderer.render();

  frame++;
}

requestAnimationFrame(runloop); // trigger first time

// === Handle Canvas Resizing ===
function resizeCanvas() {
  //const dpr = window.devicePixelRatio || 1;
  const dpr = 1;

  const displayWidth  = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);

  console.log(`Resize canvas to ${displayWidth}x${displayHeight} (DPR: ${dpr})`);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.2, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    renderer.resize(displayWidth, displayHeight);
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // trigger first time

// === File Handling ===
const fileMap = new Map();

const expectedFiles = [
  "static/u7chunks", "static/u7map", "static/palettes.flx", "static/shapes.vga",
];

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



function parseShapeFile(uint8) {
  shapeFile.load(uint8);
  console.log(`${shapeFile}:shape0 ${shapeFile.shapes[0]}`);
  const a = shapeFile.collectSize();
}

function loadChunkFile(uint8) {
  chunks = new U7Chunks(uint8);
  console.log(`chunk count: ${chunks.chunkCount}`);

  const chunk0 = chunks.getChunk(0);
  console.log(chunk0);
  const chunk1 = chunks.getChunk(1);
  console.log(chunk1);

  const tile0 = chunk0.get(0,0);
  console.log(tile0.toString());

  console.log(`${chunk1.get(0,0)}, ${chunk1.get(1,0)}`);
}

function loadPalettes(uint8) {
  palettes.load(uint8)
  palettes.select(0);
  renderer.setPalette(palettes.current());
}

async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    console.log("everything is ready!");

    loadPalettes(fileMap.get("static/palettes.flx"));
    parseShapeFile(fileMap.get("static/shapes.vga"));
    loadChunkFile(fileMap.get("static/u7chunks"));
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
