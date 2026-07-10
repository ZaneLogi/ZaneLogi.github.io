// level_viewer.js — browse any Prince of Persia level's collision block map. The built-in default
// is the committed level 1 (res/level1.js); dropping a LEVELS.DAT decodes every level it contains
// ON THE FLY (dat.js + leveldecode.js) and populates the selector. The raw bytes live only in memory
// — nothing is uploaded or persisted, so the file must be re-dropped after a page refresh (a
// deliberate choice: the game data is Ubisoft's IP and never touches the repo or storage).
//
// Rendering is the shared blockmap_render.renderLevel — the same code the static blockmap demo uses;
// it clones + alter_mods the level so potion colours / gate states are runtime-correct.
import { renderLevel } from './blockmap_render.js';
import { decodeLevel, listLevels } from '../leveldecode.js';
import { LEVEL1 } from '../res/level1.js';

const cv = document.getElementById('map');
const info = document.getElementById('info');
const sel = document.getElementById('level');
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');

let datBytes = null;   // raw LEVELS.DAT, in memory only; null until a file is dropped

// (re)render whichever level the selector currently names
function renderSelected() {
  const n = parseInt(sel.value, 10);
  if (datBytes) {
    try { info.textContent = renderLevel(cv, decodeLevel(datBytes, n)); }
    catch (e) { info.textContent = `level ${n}: decode error — ${e.message}`; }
  } else {
    info.textContent = renderLevel(cv, LEVEL1) + '  ·  built-in default — drop LEVELS.DAT for every level';
  }
}

// take a decoded DAT: fill the selector from the levels it contains, render the first one
function loadDat(bytes) {
  const levels = listLevels(bytes);
  if (!levels.length) { info.textContent = 'no levels found — is this a LEVELS.DAT?'; return; }
  datBytes = bytes;
  sel.innerHTML = '';
  for (const n of levels) {
    const o = document.createElement('option');
    o.value = String(n); o.textContent = 'Level ' + n;
    sel.appendChild(o);
  }
  sel.value = String(levels.includes(1) ? 1 : levels[0]);
  renderSelected();
}

async function loadFile(file) {
  try { loadDat(new Uint8Array(await file.arrayBuffer())); }
  catch (e) { info.textContent = 'could not read file — ' + e.message; }
}

// --- wiring ---
sel.addEventListener('change', renderSelected);
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

// drag & drop anywhere on the page; highlight the drop zone while a file is over it
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, (e) => {
  e.preventDefault(); drop.classList.add('over');
}));
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f);
});

renderSelected();   // initial: built-in level 1

// test hook — lets a harness feed DAT bytes without a real drag-drop (the drop/file paths call the
// same loadDat). Harmless in normal use.
window.__lvLoadDat = loadDat;
