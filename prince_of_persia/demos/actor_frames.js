// actor_frames.js — demo: contact-sheet of every KID.DAT silhouette frame.
// A dev inspector for the extracted actor sprites (tools/extract_kid.py).
import { MaskSheet } from '../masksheet.js';

const stage = document.getElementById('stage');
const $tint = document.getElementById('tint'), $bg = document.getElementById('bg');
const $scale = document.getElementById('scale'), $scaleval = document.getElementById('scaleval');
let SHEET = null;

function render() {
  if (!SHEET) return;
  const color = $tint.value, scale = +$scale.value;
  document.documentElement.style.setProperty('--bg', $bg.value);
  $scaleval.textContent = scale + '×';
  stage.innerHTML = '';
  for (const sp of SHEET.all) {
    const cell = document.createElement('div'); cell.className = 'cell';
    const cv = document.createElement('canvas');
    cv.width = sp.w * scale; cv.height = sp.h * scale;
    sp.draw(cv.getContext('2d'), 0, 0, { color, scale });   // module's draw API
    const cap = document.createElement('div'); cap.className = 'cap';
    cap.textContent = sp.id + ' · ' + sp.w + '×' + sp.h;
    cell.append(cv, cap); stage.append(cell);
  }
}

[$tint, $bg, $scale].forEach(el => el.addEventListener('input', render));

MaskSheet.load('../gfx/kid_masks.json').then(sheet => {
  SHEET = sheet;
  document.getElementById('sub').textContent =
    `— ${sheet.source} · ${sheet.count} silhouette frames`;
  render();
}).catch(err => { document.getElementById('sub').textContent = '— load error: ' + err.message; });
