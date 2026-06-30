// lunar_lander/demos/thrust.js — lander rotation (gameplay-limited) + thrust flame.
//
// Two things this demo shows that rotation.html does not:
//
// 1. GAMEPLAY ROTATION RANGE. The craft can only tilt within one half-circle:
//    head pointing left -> up -> right, i.e. the engine always has a downward
//    component. It can never point its head below horizontal. In engine-heading
//    terms (the direction the thrust points, standard math angle, +y up):
//        head-left/engine-right = 0deg, standing/engine-down = 270deg,
//        head-right/engine-left = 180deg   ->   valid arc 0 -> 270 -> 180.
//    Parametrised here as tilt in [-90, +90] (0 = upright), engine = 270 - tilt.
//    This maps to the 9 stored poses (on-side..upright, stand = $4B64/$4DB6) plus
//    their X-mirror — 17 attitudes, ~11.25deg apart, no upside-down, no yFlip.
//
// 2. THE THRUST FLAME. There is NO flame glyph in any of the three vector ROMs
//    (the gallery survey turned up none) — the flame is drawn programmatically by
//    CPU code. We build our OWN version here, modelled on (a) Asteroids' thrust
//    flame — a tiny shape emitted on the SAME cursor right after the ship so it
//    anchors to the tail — and (b) Seb Lee-Delisle's Moon Lander: a V off the nozzle
//    whose length = base + throttle*gain, scaled by a counter flicker, throttle smoothed.
//
//    The ORIGINAL Lunar Lander source was later located (FLAME in
//    historicalsource/lunar-lander, A34573.1A). We deliberately keep OUR version: the
//    original flame WIDENS with thrust (fixed length); ours LENGTHENS (fixed nozzle
//    width). Full comparison in lunar_lander/CLAUDE.md "Thrust flame".

import { ROM599 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

// ---- poses ---------------------------------------------------------------
// 9 poses per bank, ordered on-side (index 0) -> upright/stand (index 8).
const BANKS = {
  in:  ['S_4916','S_495C','S_49AA','S_49F6','S_4A42','S_4A80','S_4AC8','S_4B16','S_4B64'],
  out: ['S_4BE4','S_4C22','S_4C5A','S_4C94','S_4CD6','S_4D02','S_4D42','S_4D7E','S_4DB6'],
};
const STEP = 90 / 8;          // 11.25deg between adjacent stored poses
let bank = 'in';             // close (bigger) bank reads best for the flame

// ---- flame tuning (DVG units) -------------------------------------------
const FLAME_MIN  = 0.3;       // plume length at min throttle, as a multiple of the nozzle-mouth width
const FLAME_SPAN = 1.2;       // extra plume length at full throttle, same units
// (length scales with the nozzle mouth, so it stays proportional across BOTH size banks;
//  the plume's width is the real nozzle mouth — see nozzleTips)

function collect(name, gs, xf, yf) {
  const segs = [], cur = { x: 0, y: 0 };
  runList(ROM599, ROM599[name], cur, gs,
          (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }), xf, yf);
  return segs;
}

// Find the engine nozzle's exit edge: the pose segment that crosses the engine
// centreline (the axis through the origin in the engine direction) and sits deepest
// along it. That's the flared bell mouth — the legs reach deeper but splay off-axis,
// so they don't cross the centreline. Its two endpoints are the nozzle tips.
function nozzleTips(poseSegs, d) {
  const p = { x: -d.y, y: d.x };                    // across engine
  let best = null, bestDepth = -Infinity;
  for (const s of poseSegs) {
    const pp1 = s.fx*p.x + s.fy*p.y, pp2 = s.tx*p.x + s.ty*p.y;
    if (Math.min(pp1, pp2) > 0 || Math.max(pp1, pp2) < 0) continue;   // must straddle centreline
    const depth = (s.fx*d.x + s.fy*d.y + s.tx*d.x + s.ty*d.y) / 2;
    if (depth > bestDepth) {
      bestDepth = depth;
      best = { a: { x: s.fx, y: s.fy }, b: { x: s.tx, y: s.ty } };
    }
  }
  return best;
}

// ---- precomputed attitudes ----------------------------------------------
// The continuous tilt slider SNAPS to one of these. Everything about an attitude is
// static — its decoded segments, engine direction, and nozzle mouth — so build it once
// here and let the frame loop add only the throttle-driven plume. Deriving the flame
// from the attitude's canonical direction also keeps the plume aligned with the snapped
// pose (instead of drifting toward an in-between slider value).
// gs is fixed at 0 here; a gameplay port that zooms via DVG globalScale should decode at
// the live gs (or scale these uniformly) so pose + nozzle + flame stay locked together.
function buildAttitude(bankName, idx, xf) {
  const tilt = (xf ? -1 : 1) * (8 - idx) * STEP;        // this attitude's canonical tilt
  const heading = (270 - tilt + 360) % 360;
  const th = (270 - tilt) * Math.PI / 180;
  const d = { x: Math.cos(th), y: Math.sin(th) };
  const segs = collect(BANKS[bankName][idx], 0, xf, false);
  const n = nozzleTips(segs, d);
  const noz = n && {
    ax: n.a.x, ay: n.a.y, bx: n.b.x, by: n.b.y,
    cx: (n.a.x + n.b.x) / 2, cy: (n.a.y + n.b.y) / 2,  // mouth centre
    mouthW: Math.hypot(n.a.x - n.b.x, n.a.y - n.b.y),  // mouth width (drives plume length)
  };
  return { name: BANKS[bankName][idx], xf, tilt, heading, d, segs, noz };
}

const ATTITUDES = {};                                   // bank -> [{pos, neg}] by pose index
for (const bk of Object.keys(BANKS)) {
  ATTITUDES[bk] = [];
  for (let idx = 0; idx <= 8; idx++)
    ATTITUDES[bk].push({ pos: buildAttitude(bk, idx, false),   // no flip -> head leans right (+tilt)
                         neg: buildAttitude(bk, idx, true) });  // x-flip  -> head leans left  (-tilt)
}

function attitudeForTilt(tilt) {                        // snap slider value -> precomputed attitude
  const idx = 8 - Math.round(Math.min(90, Math.abs(tilt)) / STEP);   // 8 upright ... 0 on-side
  const slot = ATTITUDES[bank][idx];
  return tilt < 0 ? slot.neg : slot.pos;
}

// The flame: two lines starting at the nozzle's left/right tips and converging to a
// point `len` further along the engine direction. `len` tracks throttle * flicker and
// scales with the nozzle mouth. Synthesised segments (not DVG ops — no ROM data here).
function flameSegs(att, throttle, flick) {
  if (throttle <= 0.002 || !att.noz) return [];
  const { d, noz } = att;
  const len = noz.mouthW * (FLAME_MIN + throttle * FLAME_SPAN) * flick;
  const tx = noz.cx + d.x*len, ty = noz.cy + d.y*len;
  return [
    { fx: noz.ax, fy: noz.ay, tx, ty, bri: 15 },      // left tip  -> plume tip
    { fx: noz.bx, fy: noz.by, tx, ty, bri: 15 },      // right tip -> plume tip
  ];
}

function draw(ctx, poseSegs, flame, w, h, pxu, ox, oy, red) {
  ctx.clearRect(0, 0, w, h);
  const X = x => ox + x*pxu, Y = y => oy - y*pxu;     // DVG +y up -> canvas
  ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of poseSegs) {
    if (s.bri <= 0) continue;
    ctx.beginPath(); ctx.moveTo(X(s.fx), Y(s.fy)); ctx.lineTo(X(s.tx), Y(s.ty));
    ctx.strokeStyle = `rgba(120,255,150,${Math.max(0.4, s.bri/15)})`;
    ctx.stroke();
  }
  for (const s of flame) {
    ctx.beginPath(); ctx.moveTo(X(s.fx), Y(s.fy)); ctx.lineTo(X(s.tx), Y(s.ty));
    const a = Math.max(0.45, s.bri/15);
    ctx.strokeStyle = red ? `rgba(255,90,45,${a})` : `rgba(170,255,190,${a})`;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,110,110,0.85)';          // pivot = DVG origin (0,0)
  ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, Math.PI*2); ctx.fill();
}

// ---- wiring --------------------------------------------------------------
const PXU = 5.5;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const tiltEl = document.getElementById('tilt');
const thrEl  = document.getElementById('throttle');
const redEl  = document.getElementById('red');
const bankEl = document.getElementById('bank');
const readout = document.getElementById('readout');

let tilt = 0, throttleTarget = 0.6, throttle = 0, counter = 0;

tiltEl.addEventListener('input', () => { tilt = Number(tiltEl.value); });
thrEl.addEventListener('input',  () => { throttleTarget = Number(thrEl.value)/100; });
bankEl.addEventListener('change', () => { bank = bankEl.value; });

// keyboard: arrows / A,D tilt; hold Up / W for full throttle
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a') { tilt = Math.max(-90, tilt - STEP); tiltEl.value = tilt; }
  if (e.key === 'ArrowRight' || e.key === 'd') { tilt = Math.min( 90, tilt + STEP); tiltEl.value = tilt; }
  if (e.key === 'ArrowUp'    || e.key === 'w') { throttleTarget = 1; thrEl.value = 100; }
});
addEventListener('keyup', e => {
  if (e.key === 'ArrowUp' || e.key === 'w') { throttleTarget = 0; thrEl.value = 0; }
});

function frame() {
  throttle += (throttleTarget - throttle) * 0.2;     // Seb-style smoothing
  if (Math.abs(throttle - throttleTarget) < 0.003) throttle = throttleTarget;
  counter++;
  const flick = 1 + ((counter >> 1) % 3) * 0.2;      // 1.0 / 1.2 / 1.4, every 2 frames
  const att = attitudeForTilt(tilt);
  const fl = flameSegs(att, throttle, flick);
  draw(ctx, att.segs, fl, cv.width, cv.height, PXU, cv.width/2, cv.height*0.42, redEl.checked);

  const lean = att.tilt === 0 ? 'upright' : `${Math.abs(att.tilt).toFixed(2)}° ${att.tilt < 0 ? 'left' : 'right'}`;
  readout.textContent =
    `pose tilt ${att.tilt >= 0 ? '+' : ''}${att.tilt.toFixed(2)}° (${lean})   ` +
    `·   engine heading ${String(Math.round(att.heading)).padStart(3)}°   ` +
    `·   pose ${att.name.replace('S_', '$')}${att.xf ? ' X' : ''}   ` +
    `·   throttle ${Math.round(throttle*100)}%`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
