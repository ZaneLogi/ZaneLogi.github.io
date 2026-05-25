// asteroids_clone/demos/vector_rom.js — vector-ROM-shape verification demo
//
// One ship at a time, rendered at cabinet-faithful scale.
// Canvas is 800x600 = 4:3, the actual Asteroids cabinet aspect ratio.
// DVG coord space is 1024x768 visible (per R-B §3). Mapping is 1:1-ish
// (1 DVG unit ≈ 0.78 canvas pixels). This is the same coordinate scale
// the 1979 cabinet rendered at.
//
// At gs=0, ShipDir0 renders as a closed east-pointing arrow ~96 DVG
// units across — the actual gameplay ship size. VEC tip-lines and SVEC
// back-edge detail are visually proportional thanks to the additive
// scale model (see research_dvg.md §4 + §6). Increasing gs grows BOTH
// VEC and SVEC magnitudes together; saturation kicks in for SVECs once
// (scaleMode + 2 + gs) > 9 (e.g. scaleMode=3 SVECs vanish at gs > 4).
//
// Prev/Next buttons step through all 17 ShipDirN variants and the
// other shapes (Rock, Shrapnel, UFO, etc.).

import { VROM } from '../vector_rom_data.js';
import { runList } from '../dvg.js';

const canvas = document.getElementById('demo');
const ctx = canvas.getContext('2d');

// Cabinet visible area is 1024×768 (R-B §3). Map 1:1-ish to canvas.
const DVG_W = 1024;
const DVG_H = 768;

function toCanvasX(dvgX) { return dvgX * canvas.width  / DVG_W; }
function toCanvasY(dvgY) { return canvas.height - dvgY * canvas.height / DVG_H; }
function fromCanvasX(px)  { return px * DVG_W / canvas.width;  }
function fromCanvasY(px)  { return (canvas.height - px) * DVG_H / canvas.height; }

function drawSegment(fromX, fromY, toX, toY, bri) {
  ctx.beginPath();
  ctx.moveTo(toCanvasX(fromX), toCanvasY(fromY));
  ctx.lineTo(toCanvasX(toX),   toCanvasY(toY));
  ctx.strokeStyle = `rgba(0,255,0,${bri / 15})`;
  ctx.lineWidth = 1.5;
  // Round caps so zero-length SVEC "dots" (used by shrapnel patterns —
  // a bri>0 SVEC with raw=(0,0) puts a single illuminated point at the
  // current cursor) render as visible points instead of vanishing.
  ctx.lineCap = 'round';
  ctx.stroke();
}

function clear() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawAnchorMarker(canvasX, canvasY) {
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(canvasX, canvasY, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawScaleNote(globalScale) {
  ctx.fillStyle = '#888';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `gs=${globalScale} — data byte-faithful to ROM. Additive scale model ` +
    `(research_dvg.md §4 + §6): VEC total = local+gs; SVEC total = ` +
    `(scaleMode+2)+gs. Saturation when total>9 (segment vanishes).`,
    12, canvas.height - 12,
  );
}

function drawHeader(name, globalScale) {
  let subtitle;
  if (name.startsWith('ShipDir')) {
    const n = Number(name.slice('ShipDir'.length));
    const angleStr = (n * 360 / 256).toFixed(3).replace(/\.?0+$/, '');
    subtitle = `direction ${n} — ${angleStr}°`;
  } else {
    subtitle = 'non-ship shape';
  }
  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${name} — ${subtitle}`, 12, 22);
  ctx.fillStyle = '#777';
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillText(`globalScale = ${globalScale} · canvas ${canvas.width}×${canvas.height} = DVG ${DVG_W}×${DVG_H} (cabinet ratio)`, 12, 40);
}

function drawShipCentered(name, globalScale, { withThrust = false, burstMode = false } = {}) {
  // Anchor near the center, slightly upper-left so the shape (which extends
  // right + down from its anchor) ends up visually centered.
  const anchorCanvasX = canvas.width * 0.35;
  const anchorCanvasY = canvas.height * 0.45;
  drawAnchorMarker(anchorCanvasX, anchorCanvasY);

  const anchorX = fromCanvasX(anchorCanvasX);
  const anchorY = fromCanvasY(anchorCanvasY);

  // Burst mode for ShipExplosion: the ROM stores 6 SVECs at $50E0-$50EA
  // paired with a 6-entry velocity table at $50EC-$50F6. The cabinet uses
  // these as data, not as a subroutine — each frame, the animator emits
  // (LABS-fragment-pos + i-th SVEC) for each of 6 independently-tracked
  // fragments. Burst mode here approximates the frame-0 appearance: all
  // 6 SVECs drawn as standalone fragments radiating from the same anchor.
  if (burstMode && name === 'ShipExplosion') {
    for (const svec of VROM[name]) {
      const cursor = { x: anchorX, y: anchorY };
      runList(VROM, [svec], cursor, globalScale, drawSegment);
    }
    return;
  }

  const cursor = { x: anchorX, y: anchorY };
  runList(VROM, VROM[name], cursor, globalScale, drawSegment);

  if (withThrust && name.startsWith('ShipDir')) {
    const n = Number(name.slice('ShipDir'.length));
    const thrust = VROM['ThrustDir' + n];
    if (thrust) runList(VROM, thrust, cursor, globalScale, drawSegment);
  }
}

// ---------- State + render ----------

// All shapes, in source order. ShipDirN gets stepped through with its thrust
// togglable; other shapes (Rocks, Shrapnel, UFO, LivesIcon, ShipExplosion)
// are standalone. ThrustDirN is reachable via the thrust toggle when on the
// matching ship, so we skip it in the prev/next list to avoid duplication.
const ALL_NAMES = Object.keys(VROM).filter(n => !n.startsWith('ThrustDir'));
let currentIndex = 0;
let currentGs = 0;        // start at gameplay-like scale
let withThrust = false;
let burstMode = false;

function render() {
  clear();
  const name = ALL_NAMES[currentIndex];
  drawHeader(name, currentGs);
  drawShipCentered(name, currentGs, { withThrust, burstMode });
  drawScaleNote(currentGs);
  // Sync UI
  document.getElementById('ship-name').textContent =
    `${currentIndex + 1} / ${ALL_NAMES.length} — ${name}`;
  document.getElementById('gs-value').textContent = currentGs;
  document.getElementById('gs-slider').value = String(currentGs);
}

document.getElementById('prev-btn').addEventListener('click', () => {
  currentIndex = (currentIndex - 1 + ALL_NAMES.length) % ALL_NAMES.length;
  render();
});
document.getElementById('next-btn').addEventListener('click', () => {
  currentIndex = (currentIndex + 1) % ALL_NAMES.length;
  render();
});
document.getElementById('gs-slider').addEventListener('input', (e) => {
  currentGs = Number(e.target.value);
  render();
});
document.getElementById('thrust-toggle').addEventListener('change', (e) => {
  withThrust = e.target.checked;
  render();
});
document.getElementById('burst-toggle').addEventListener('change', (e) => {
  burstMode = e.target.checked;
  render();
});

render();
