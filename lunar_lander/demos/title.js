// lunar_lander/demos/title.js — render the $5458 mega-composite standalone
//
// $5458 (034598) is a 75-JSR composite assembling a wide banner near the top
// of the vector field — the HUD / status line. Rendered byte-faithfully via
// dvg.js, with all its glyph parts resolved from the discovery ROM dump.

import { ROM598 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const canvas = document.getElementById('demo');
const ctx = canvas.getContext('2d');
let fit = true;

function collect() {
  const segs = [];
  const cur = { x: 0, y: 0 };
  runList(ROM598, ROM598['S_5458'], cur, 0, (fx, fy, tx, ty, bri) =>
    segs.push({ fx, fy, tx, ty, bri }));
  return segs;
}

function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const segs = collect();
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  for (const s of segs) {
    mnX = Math.min(mnX, s.fx, s.tx); mxX = Math.max(mxX, s.fx, s.tx);
    mnY = Math.min(mnY, s.fy, s.ty); mxY = Math.max(mxY, s.fy, s.ty);
  }

  const M = 16;
  let scale, ox, oy, flipBase;
  if (fit) {
    const w = (mxX - mnX) || 1, h = (mxY - mnY) || 1;
    scale = Math.min((canvas.width - 2 * M) / w, (canvas.height - 2 * M) / h);
    ox = M - mnX * scale;
    flipBase = mxY; oy = M;            // canvasY = (mxY - y)*scale + M
  } else {
    scale = canvas.width / 1024;        // native: full 1024-wide field, top strip
    ox = 0; flipBase = 768; oy = 0;     // canvasY = (768 - y)*scale
  }
  const X = x => x * scale + ox;
  const Y = y => (flipBase - y) * scale + oy;

  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(X(s.fx), Y(s.fy));
    ctx.lineTo(X(s.tx), Y(s.ty));
    ctx.strokeStyle = `rgba(0,255,0,${Math.max(0.4, s.bri / 15)})`;
    ctx.stroke();
  }

  document.getElementById('info').textContent =
    `${segs.length} segments · bbox x[${mnX}..${mxX}] y[${mnY}..${mxY}] · ${fit ? 'fit to canvas' : 'native top-strip'}`;
}

document.getElementById('fit-toggle').addEventListener('change', (e) => {
  fit = e.target.checked;
  render();
});

render();
