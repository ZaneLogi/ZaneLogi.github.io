import { fileStore } from './filestore.js';
import { FlexFile } from './flexfile.js';
import { WebGLIndexedRenderer } from './webgl_indexed_renderer.js';
import {
  palettes, shapesVga, worldMap, timeQueue, textFile, fonts,
  ShapeID,
  PIXELS_PER_CHUNK,
  CHUNKS_PER_WORLD
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
let worldX = 2640, worldY = 4613;
import {
  PIXELS_PER_TILE, PIXELS_PER_WORLD // 24576
} from "./globals.js";

let clickX = 0, clickY = 0;
let clickedObjName = null;
let clickedFrameOff;

function runloop(timestamp) {
  displayFrameRate(timestamp);

  // render something here
  const frameBuffer = renderer.getBuffer();

  if (worldMap.ready) {
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

    // only 8 fonts available
    /*for (let i = 0, y = 32; i < 8; i++, y += 32) {
      const font = fonts.fonts[i];
      font.draw(frameBuffer, 0, y, "Hello World");
    }*/
    if (clickedObjName && clickedFrameOff > 0) {
      const font = fonts.fonts[0];
      font.draw(frameBuffer, clickX, clickY, clickedObjName);
      clickedFrameOff--;
    }
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

export function centerWorldPosition(x, y) {
  const {width, height} = canvas;
  x -= Math.floor(width/2);
  y -= Math.floor(height/2);
  worldX = (x + PIXELS_PER_WORLD) % PIXELS_PER_WORLD;
  worldY = (y + PIXELS_PER_WORLD) % PIXELS_PER_WORLD;
}

export function centerNpc(npcIndex) {
  const npcCount = worldMap.npcObjs?.length ?? -1
  if (npcCount < 0 || npcIndex < 0 || npcIndex >= npcCount)
    return false;
  const npcObj = worldMap.npcObjs[npcIndex];
  if (typeof npcObj === "string")
    return false;

  centerWorldPosition(npcObj.area.left, npcObj.area.top);
  return true;
}

// === Handle Canvas Resizing ===
export function onResizeCanvas(width, height) {
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.0, 0.2, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  renderer.resize(width, height);
}

// === Find the clicked object ===
canvas.addEventListener('click', function(event) {
  if (!worldMap.ready)
    return;
  // Get the mouse position relative to the canvas
  const rect = canvas.getBoundingClientRect();
  const hitX = event.clientX - rect.left;
  const hitY = event.clientY - rect.top;

  console.log(`Canvas clicked at: (${hitX}, ${hitY})`);
  const obj = worldMap.findObject(worldX, worldY, hitX, hitY);
  if (obj != null) {
    console.log(obj);
    const name = textFile.getObjName(obj.shapeId.type, obj.shapeId.frame);
    clickedObjName = name;
    clickX = hitX;
    clickY = hitY;
    clickedFrameOff = 2 * 60;
  }
  else {
    clickedObjName = null;
    clickedFrameOff = 0;
  }
});

// right-click
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  if (!worldMap.ready)
    return;

  // Get the mouse position relative to the canvas
  const rect = canvas.getBoundingClientRect();
  const hitX = e.clientX - rect.left;
  const hitY = e.clientY - rect.top;

  console.log(`Canvas clicked at: (${hitX}, ${hitY})`);
  const obj = worldMap.findObject(worldX, worldY, hitX, hitY);
  if (obj != null) {
    const mapChunk = worldMap.getMapChunk(obj.xchunk, obj.ychunk);
    mapChunk.removeObj(obj);
  }
});

// === Handle Tooltip ===
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const xoff = (worldX + (e.clientX - rect.left)) % PIXELS_PER_WORLD;
  const yoff = (worldY + (e.clientY - rect.top)) % PIXELS_PER_WORLD;
  const xchunk = Math.floor(xoff / PIXELS_PER_CHUNK) % CHUNKS_PER_WORLD;
  const ychunk = Math.floor(yoff / PIXELS_PER_CHUNK) % CHUNKS_PER_WORLD;
  const xtile = Math.floor((xoff % PIXELS_PER_CHUNK) / PIXELS_PER_TILE);
  const ytile = Math.floor((yoff % PIXELS_PER_CHUNK) / PIXELS_PER_TILE);

  const showTooltip = (html) => {
      tooltip.style.left = (e.clientX + window.scrollX + 10) + "px";
      tooltip.style.top = (e.clientY + window.scrollY + 10) + "px";
      tooltip.style.display = "block";
      tooltip.innerHTML = html;
    };

  showTooltip(`x:${xoff}, y:${yoff} (${xoff-worldX},${yoff-worldY})<br>` +
    `xchunk:${xchunk}, ychunk:${ychunk}<br>` +
    `xtile:${xtile}, ytile:${ytile}`
  );
});


// === File Handling ===
const fileMap = new Map();

const expectedFiles = [
  "static/u7chunks", "static/u7map", "static/palettes.flx", "static/shapes.vga",
  "static/tfa.dat", "static/shpdims.dat", "static/occlude.dat",
  "static/text.flx", "static/fonts.vga",
  "gamedat/u7ibuf.dat", "gamedat/u7nbuf.dat"
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

const getFixedString = (() => {
  const decoder = new TextDecoder("ascii");
  function decodeFixedString(data, offset, length) {
    const chunk = data.subarray(offset, offset + length);
    const firstZero = chunk.indexOf(0);
    const nameBytes = firstZero === -1 ? chunk : chunk.subarray(0, firstZero);
    const name = decoder.decode(nameBytes);
    return name;
  }
  return decodeFixedString;
})();

async function userDownload(fileList, zipName = "archive.zip") {
  const zip = new JSZip();

  for (const file of fileList) {
    if (file.folder) {
      zip.folder(file.folder).file(file.name, file.data);
    } else {
      zip.file(file.name, file.data);
    }
  }

  // Generate zip as Blob
  const content = await zip.generateAsync({ type: "blob" });

  // Trigger download
  const url = URL.createObjectURL(content);

  // Create a temporary <a> element
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a); // Required for Firefox
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function extractInitGameDat(file) {
  const fileList = [];

  const flexFile = new FlexFile();
  flexFile.open(await file.arrayBuffer());
  const count = flexFile.objCount;
  for (let i = 0; i < count; i++) {
    const data = flexFile.objData(i);
    const size = flexFile.objSize(i);
    if (data && size > 0) {
      const name = getFixedString(data, 0, 13);
      fileList.push({name:name, data:data.subarray(13, size)});
    }
  }

  userDownload(fileList, "initgame.zip");
}

async function extractNpcDat(file) {
  // this is used for the creation of the faked U7NBUF.DAT and U7IBUF.DAT frin NPC.DAT in INITGAME.DAT
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  let offset = 0;
  const npc1count = view.getUint16(offset, true);
  const npc2count = view.getUint16(offset+2, true);
  console.log(`count1: ${npc1count}, count2: ${npc2count}`);
  offset = 4;

  let i = 0;
  const nbuf = new Uint8Array(npc1count * 105);

  const ibuf = new Array(16).fill(0);

  while (i < npc1count && offset < buffer.byteLength) {
    const npcHeader = new Uint8Array(buffer, offset, 12);
    offset += 12;
    const npcInfo = new Uint8Array(buffer, offset, 105);
    offset += 105;

    nbuf.set(npcInfo, i * 105); // set npc info to nbuf
    const ibufOffset = npcInfo[2] | npcInfo[3] << 8;

    const x = npcHeader[0]; // x offset in the superchunk
    const y = npcHeader[1]; // y offset in the superchunk
    const shapeId = new ShapeID(npcHeader[2] | npcHeader[3] << 8);
    const type = npcHeader[4] | npcHeader[5] << 8;
    const region = npcHeader[6];
    const id = npcHeader[8];
    const inside = (npcHeader[9] & 0x0f);
    const lift = (npcHeader[9] >> 4) & 0x0f;
    const data2 = npcHeader[10] | npcHeader[11] << 8;

    const diff = ibufOffset + 16 - ibuf.length;
    if (diff > 0) {
      ibuf.concat(new Array(diff).fill(0));
    }
    ibuf[ibufOffset] = 0; // ignore
    ibuf[ibufOffset+1] = 0; // ignore
    ibuf[ibufOffset+2] = x;
    ibuf[ibufOffset+3] = y;
    ibuf[ibufOffset+4] = npcHeader[2];
    ibuf[ibufOffset+5] = npcHeader[3];
    ibuf[ibufOffset+6] = (ibufOffset+8) & 0xff;
    ibuf[ibufOffset+7] = ((ibufOffset+8) >> 8) & 0xff;
    ibuf[ibufOffset+8] = 0; // ignore
    ibuf[ibufOffset+9] = 0; // ignore
    ibuf[ibufOffset+10] = npcHeader[6]; // region
    ibuf[ibufOffset+11] = npcHeader[7];
    ibuf[ibufOffset+12] = npcHeader[8]; // id
    ibuf[ibufOffset+13] = npcHeader[9]; // lift
    ibuf[ibufOffset+14] = npcHeader[10]; // data2
    ibuf[ibufOffset+15] = npcHeader[11];

    const sx = region % 12;
    const sy = Math.floor(region / 12);
    const xchunk = sx * 16 + (x >> 4);
    const ychunk = sy * 16 + (y >> 4);
    const xtile = (x & 0x0f);
    const ytile = (y & 0x0f);

    const name = getFixedString(npcInfo, 105-16, 16);

    console.log(`npc${id}: chunk(${xchunk},${ychunk}), tile(${xtile},${ytile},${lift}), Name"${name}"`);
    console.log(`ibuf offset 0x${ibufOffset.toString(16).padStart(4, '0')}`);
    console.log(`item offset 0x${type.toString(16).padStart(4, '0')}`);

    if (i !== id)
      console.log(`!!! Invalid id, expected ${i}, obtained ${id}`);
    if (type === 0)
      console.log("!!! No items");
    if (ibufOffset === 0)
      console.log("!!! No IBUF OFFSET");

    if (type !== 0 && i === id) { // no items or invalid id (for example, 139, 148)
      while (offset < buffer.byteLength) {
        const len = view.getUint8(offset++);
        if (len === 0)
          break; // end of the item list
        if (len === 1)
          continue; // end of the item list in a container
        if (len != 6 && len != 12 && len != 18)
          throw new Error(`invalid: offset ${offset-1}, obtained ${len}`);
        offset += len;
      }
    }

    console.log(`current offset: 0x${offset.toString(16).padStart(4, '0')}`);
    i++;
  }

  const fileList = [
    {name:"U7NBUF.DAT", folder:"GAMEDAT", data:nbuf},
    {name:"U7IBUF.DAT", folder:"GAMEDAT", data:new Uint8Array(ibuf)},
  ]

  userDownload(fileList);
}

document.getElementById("dropzone").addEventListener("dragover", e => e.preventDefault());
document.getElementById("dropzone").addEventListener("drop", async (e) => {
  e.preventDefault();
  const fileList = [];
  for (const file of e.dataTransfer.files) {
    console.log(file.name);
    const ext = file.name.split('.').pop().toLowerCase();

    // extract NPC.DAT
    if (file.name.toLowerCase() === "initgame.dat") {
      extractInitGameDat(file);
      continue;
    }

    // parse npc.dat
    if (file.name.toLowerCase() === "npc.dat") {
      extractNpcDat(file);
      continue;
    }

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

    // load text & fonts
    textFile.load(fileMap.get("static/text.flx"));
    fonts.load(fileMap.get("static/fonts.vga"));

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
