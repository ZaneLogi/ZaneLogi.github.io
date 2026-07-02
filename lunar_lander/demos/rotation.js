// lunar_lander/demos/rotation.js — full 360° lander rotation, both size banks.
//
// The lander is stored as 9 poses spanning ~one 90° quadrant; the full circle
// is rebuilt by X/Y mirroring (dvg.js xFlip/yFlip), the same reflection scheme
// Asteroids uses for its ship ($750B). Two banks exist at two native sizes:
//   zoom-out (far)  — $4DF4 dispatch — ~15 units
//   zoom-in  (close)— $4BA2 dispatch — ~29 units
// Bank-2 (zoom-out) only exists in the exploratory discovery_rom_data.js, so we
// source both banks from there for consistency with gallery.html.
//
// The direction->pose+flip fold itself lives in the program source (now in hand:
// MODULE/FRCMLT in A34573.1A, driven by SHIP 0-31); frames here are still ordered by
// each rendered shape's *actual* orientation, for a smooth sweep without re-deriving it.

import { ROM599 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const BANKS = {
  out: { poses: ['S_4BE4','S_4C22','S_4C5A','S_4C94','S_4CD6','S_4D02','S_4D42','S_4D7E','S_4DB6'] },
  in:  { poses: ['S_4916','S_495C','S_49AA','S_49F6','S_4A42','S_4A80','S_4AC8','S_4B16','S_4B64'] },
};

const FLIPS = [[false,false],[true,false],[true,true],[false,true]];

function collect(name, gs, xf, yf) {
  const segs = [], cur = { x: 0, y: 0 };
  runList(ROM599, ROM599[name], cur, gs,
          (fx,fy,tx,ty,bri) => segs.push({ fx,fy,tx,ty,bri }), xf, yf);
  return segs;
}

// Centroid offset ~ the legs/"down" side; used only to order frames by heading.
function headingOf(segs) {
  let sx=0, sy=0, n=0;
  for (const s of segs) { sx += s.fx+s.tx; sy += s.fy+s.ty; n += 2; }
  return (Math.atan2(sy/n, sx/n) * 180/Math.PI + 360) % 360;
}

// 9 poses × 4 flips, sorted by actual heading, axis near-duplicates removed.
function buildFrames(bank) {
  const cand = [];
  for (const name of bank.poses)
    for (const [xf,yf] of FLIPS)
      cand.push({ name, xf, yf, deg: headingOf(collect(name,0,xf,yf)) });
  cand.sort((a,b) => a.deg - b.deg);
  const out = []; let last = -99;
  for (const c of cand) { if (out.length && c.deg-last < 3.5) continue; out.push(c); last = c.deg; }
  return out;
}

function pickFrame(frames, deg) {
  let best = frames[0], bd = 1e9;
  for (const f of frames) {
    const d = Math.abs(((f.deg - deg + 540) % 360) - 180);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// Draw segs with (cx,cy) mapped to the canvas centre; pxu = pixels per DVG unit
// (shared across the pair so the banks' true size ratio shows). DVG +y is up →
// flip for canvas. anchor==='origin' pins the DVG origin (0,0) — the lander's
// fixed pivot (~cabin-octagon centre), so rotation doesn't wobble; otherwise it
// centres on the per-frame bounding box (used by the size row, no rotation there).
function draw(ctx, segs, w, h, pxu, anchor) {
  ctx.clearRect(0,0,w,h);
  let cx = 0, cy = 0;
  if (anchor !== 'origin') {
    let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
    for (const s of segs) {
      mnx=Math.min(mnx,s.fx,s.tx); mxx=Math.max(mxx,s.fx,s.tx);
      mny=Math.min(mny,s.fy,s.ty); mxy=Math.max(mxy,s.fy,s.ty);
    }
    cx=(mnx+mxx)/2; cy=(mny+mxy)/2;
  }
  ctx.lineWidth=1.4; ctx.lineCap='round'; ctx.lineJoin='round';
  for (const s of segs) {
    if (s.bri <= 0) continue;
    ctx.beginPath();
    ctx.moveTo(w/2+(s.fx-cx)*pxu, h/2-(s.fy-cy)*pxu);
    ctx.lineTo(w/2+(s.tx-cx)*pxu, h/2-(s.ty-cy)*pxu);
    ctx.strokeStyle = `rgba(120,255,150,${Math.max(0.4, s.bri/15)})`;
    ctx.stroke();
  }
  if (anchor === 'origin') {                         // mark the fixed pivot (0,0)
    ctx.fillStyle = 'rgba(255,110,110,0.85)';
    ctx.beginPath(); ctx.arc(w/2, h/2, 2.2, 0, Math.PI*2); ctx.fill();
  }
}

const flag = f => ((f.xf?'X':'') + (f.yf?'Y':'')) || '–';

// ---- rotating pair --------------------------------------------------------
const PXU = 4.0;                                   // shared scale; fits zoom-in's ~24u origin radius in the 220px canvas
const cvOut = document.getElementById('cv-out');
const cvIn  = document.getElementById('cv-in');
const ctxOut = cvOut.getContext('2d'), ctxIn = cvIn.getContext('2d');
const framesOut = buildFrames(BANKS.out), framesIn = buildFrames(BANKS.in);

let heading = 0, playing = true, lastT = null;
const slider  = document.getElementById('slider');
const readout = document.getElementById('readout');
const playBtn = document.getElementById('play');

function render() {
  const fo = pickFrame(framesOut, heading), fi = pickFrame(framesIn, heading);
  draw(ctxOut, collect(fo.name,0,fo.xf,fo.yf), cvOut.width, cvOut.height, PXU, 'origin');
  draw(ctxIn,  collect(fi.name,0,fi.xf,fi.yf), cvIn.width,  cvIn.height,  PXU, 'origin');
  readout.textContent =
    `heading ${String(Math.round(heading)).padStart(3)}°   ·   ` +
    `out ${fo.name.replace('S_','$')} ${flag(fo)}   ·   in ${fi.name.replace('S_','$')} ${flag(fi)}`;
}

function tick(t) {
  if (lastT == null) lastT = t;
  const dt = (t - lastT) / 1000; lastT = t;
  if (playing) {
    heading = (heading + dt*55) % 360;             // ~55°/sec
    slider.value = Math.round(heading);
    render();
  }
  requestAnimationFrame(tick);
}

playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
  lastT = null;
});
slider.addEventListener('input', () => {
  playing = false; playBtn.textContent = '▶ Play';
  heading = Number(slider.value); render();
});

render();
requestAnimationFrame(tick);

// ---- globalScale size row -------------------------------------------------
const SIZE_POSE = 'S_4B64';                          // upright zoom-in pose
const SIZE_PXU = 0.22;                               // fixed, so doubling shows
const row = document.getElementById('size-row');
for (let gs = 0; gs <= 5; gs++) {
  const cell = document.createElement('div'); cell.className = 'cell';
  const cv = document.createElement('canvas'); cv.width = 190; cv.height = 200;
  draw(cv.getContext('2d'), collect(SIZE_POSE, gs, false, false), cv.width, cv.height, SIZE_PXU);
  const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = `gs ${gs}`;
  cell.append(cv, cap); row.append(cell);
}
