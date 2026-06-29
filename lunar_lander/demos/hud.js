// lunar_lander/demos/hud.js — render the $5458 HUD label-row composite
//
// $5458 (034598) is a 75-JSR composite assembling a wide banner near the top
// of the vector field — the HUD label row. Every JSR target is a font glyph;
// in order they spell the status-line headers (SCORE/TIME/FUEL/ALTITUDE/
// HORIZONTAL SPEED/VERTICAL SPEED). Rendered byte-faithfully via dvg.js, with
// all glyph parts resolved from the discovery ROM dump; the JSR sequence is
// also decoded back to text as an annotation.

import { ROM598 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const canvas = document.getElementById('demo');
const ctx = canvas.getContext('2d');
let fit = true;

// Font glyph table ($5000-$57FF) — maps each glyph subroutine address to its
// letter, so the composite's JSR targets can be read back as text.
const FONT = {
  0x55BE: 'A', 0x55CE: 'B', 0x55E8: 'C', 0x55F4: 'D', 0x5604: 'E', 0x5614: 'F',
  0x5622: 'G', 0x5634: 'H', 0x5642: 'I', 0x5650: 'J', 0x565C: 'K', 0x5668: 'L',
  0x5672: 'M', 0x567E: 'N', 0x5688: 'O', 0x5694: 'P', 0x56A2: 'Q', 0x56B4: 'R',
  0x56C4: 'S', 0x56D2: 'T', 0x56DE: 'U', 0x56EA: 'V', 0x56F4: 'W', 0x5702: 'X',
  0x570C: 'Y', 0x571A: 'Z', 0x5726: ' ',
};

// Walk the composite's JSR/JMP targets in order, mapping each to its glyph.
function decodeText() {
  let out = '';
  for (const op of ROM598['S_5458']) {
    if (op.op !== 'JSR' && op.op !== 'JMP') continue;
    const addr = parseInt(op.target.slice(2), 16);
    out += addr in FONT ? FONT[addr] : `{${op.target.slice(2)}}`;
  }
  return out;
}

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

// One-time annotation: the 75 JSR targets decoded back to text.
const text = decodeText();
document.getElementById('decoded').innerHTML =
  `<b>decoded glyph sequence (${text.length} JSRs):</b>\n"${text}"`;

document.getElementById('fit-toggle').addEventListener('change', (e) => {
  fit = e.target.checked;
  render();
});

render();
