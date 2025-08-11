import { fileStore } from './filestore.js';

const JSZip = window.JSZip;
if (!JSZip) throw new Error("JSZip not loaded");





// === File Handling ===
const fileMap = new Map();

const expectedFiles = [
  "static/u7chunks", "static/u7map"
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

async function tryInitializeViewer() {
  if (expectedFiles.every(f => fileMap.has(f))) {
    console.log("everything is ready!");

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
