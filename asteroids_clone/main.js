// asteroids_clone/main.js
//
// One ship at a time, rendered at cabinet-faithful scale.
// Canvas is 800x600 = 4:3, the actual Asteroids cabinet aspect ratio.
// DVG coord space is 1024x768 visible (per R-B §3). Mapping is 1:1-ish
// (1 DVG unit ≈ 0.78 canvas pixels). This is the same coordinate scale
// the 1979 cabinet rendered at.
//
// At gs=0, ShipDir0 renders ~96 DVG units = ~75 canvas pixels — the
// actual gameplay ship size. Crank gs up to see SVEC back-edge details
// emerge (they're invisible at gameplay scale).
//
// Prev/Next buttons step through all 17 ShipDirN variants.

import { VROM } from './vector_rom_data.js';
import { runList } from './dvg.js';

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
    `gs=${globalScale} — data is byte-faithful to the ROM. ` +
    `Axis-aligned ships (ShipDir0/16/64) and ThrustDir0/64 use SVECs ` +
    `that vanish at low gs — matches the cabinet's actual rendering.`,
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

function drawShipCentered(name, globalScale, { withThrust = false } = {}) {
  // Anchor near the center, slightly upper-left so the shape (which extends
  // right + down from its anchor) ends up visually centered.
  const anchorCanvasX = canvas.width * 0.35;
  const anchorCanvasY = canvas.height * 0.45;
  drawAnchorMarker(anchorCanvasX, anchorCanvasY);

  const cursor = { x: fromCanvasX(anchorCanvasX), y: fromCanvasY(anchorCanvasY) };
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

function render() {
  clear();
  const name = ALL_NAMES[currentIndex];
  drawHeader(name, currentGs);
  drawShipCentered(name, currentGs, { withThrust });
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

render();
