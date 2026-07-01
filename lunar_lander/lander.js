// lunar_lander/lander.js
//
// The CRAFT (CLAUDE.md "Planned gameplay module layout"): it owns the lander's
// identity — the active physics MODEL (swappable stepper) + its VISUALS (pose,
// flame). Motion math lives in the stepper (physics_arcade.js); lander delegates.
// It never reads the DOM — it consumes the `input` intent produced by input.js.
//
// The POSE fold + FLAME are extracted from demos/thrust.js (the logic, not the
// viewer shell). Bank by zoom: MAJOR (zoom-out) → the little `out` bank, MINOR
// (zoom-in) → the big `in` bank (SHIPS/LTLMOD). So PLAY (boots major) shows the
// little lander; IDLE keeps the big attract pose (drawn by main.js).
//
// DEFERRED: the throttle flame here is OUR construction (no ROM flame glyph — see
// CLAUDE.md "Thrust flame"); the full 360° fold (yFlip / upside-down) is clamped
// to the gameplay half-circle for now (physics clamps SHIP to [0,16], upright #8).

import { SCREEN_H, drawSegmentsScreen } from './render.js';
import { ROM599 } from './discovery_rom_data.js';
import { runList } from './dvg.js';
import { ArcadePhysics } from './physics_arcade.js';
import { isMajor } from './state.js';

// 9 poses per bank, on-side (index 0) → upright/stand (index 8). in = near/big
// (minor/zoom-in), out = far/little (major/zoom-out). (thrust.js; CLAUDE.md rotation.)
const BANKS = {
  in:  ['S_4916', 'S_495C', 'S_49AA', 'S_49F6', 'S_4A42', 'S_4A80', 'S_4AC8', 'S_4B16', 'S_4B64'],
  out: ['S_4BE4', 'S_4C22', 'S_4C5A', 'S_4C94', 'S_4CD6', 'S_4D02', 'S_4D42', 'S_4D7E', 'S_4DB6'],
};
const STEP_DEG = 90 / 8;              // 11.25° between poses; SHIP 8 = upright
const FLAME_MIN = 0.3, FLAME_SPAN = 1.2;   // plume length as a multiple of the nozzle-mouth width
// The craft is drawn at its screen point = POSTMOD(XCURADJ/YCURADJ) = (posX, SCREEN_H−posY):
// the source doesn't pin the ship to centre — it moves within the SCAPCHG dead-zone window and
// the scape scrolls at the edges (§9). So the on-screen position comes from state, per frame.
// Pixel scale per bank, in the 1024×768 field. out (major/zoom-out) = NATIVE 1.0 to
// match the MAME-calibrated far lander in screen.js (drawLander 'S_4DB6', scale 1);
// in (minor/zoom-in) is a placeholder until the zoom step magnifies the near view.
const PXU = { in: 4.0, out: 1.0 };

function collect(name, xf, yf) {
  const segs = [], cur = { x: 0, y: 0 };
  runList(ROM599, ROM599[name], cur, 0, (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }), xf, yf);
  return segs;
}

// The nozzle exit edge: the pose segment crossing the engine centreline that sits
// deepest along it (the flared bell mouth; the legs splay off-axis). thrust.js §.
function nozzleTips(segs, d) {
  const p = { x: -d.y, y: d.x };
  let best = null, bestDepth = -Infinity;
  for (const s of segs) {
    const pp1 = s.fx * p.x + s.fy * p.y, pp2 = s.tx * p.x + s.ty * p.y;
    if (Math.min(pp1, pp2) > 0 || Math.max(pp1, pp2) < 0) continue;
    const depth = (s.fx * d.x + s.fy * d.y + s.tx * d.x + s.ty * d.y) / 2;
    if (depth > bestDepth) { bestDepth = depth; best = { a: { x: s.fx, y: s.fy }, b: { x: s.tx, y: s.ty } }; }
  }
  return best;
}

// Precompute each attitude once (segments + engine direction + nozzle mouth are
// static per pose). xf = X-mirror (left/right), yf = Y-mirror (upside-down half).
// d = the exhaust direction; the flame is emitted along it. Canonical tilt: upper
// half (yf=false) = ±(8−idx)·11.25° from upright; lower half (yf=true) = the mirror
// past on-side toward straight-down (±(180 − (8−idx)·11.25°)).
function buildAttitude(bank, idx, xf, yf) {
  const s = xf ? -1 : 1;
  const base = (8 - idx) * STEP_DEG;
  const tilt = s * (yf ? 180 - base : base);
  const th = (270 - tilt) * Math.PI / 180;
  const d = { x: Math.cos(th), y: Math.sin(th) };
  const segs = collect(BANKS[bank][idx], xf, yf);
  const n = nozzleTips(segs, d);
  const noz = n && {
    ax: n.a.x, ay: n.a.y, bx: n.b.x, by: n.b.y,
    cx: (n.a.x + n.b.x) / 2, cy: (n.a.y + n.b.y) / 2,
    mouthW: Math.hypot(n.a.x - n.b.x, n.a.y - n.b.y),
  };
  return { segs, d, noz };
}

// ATTITUDES[bank][idx][xf?1:0][yf?1:0]
const ATTITUDES = {};
for (const bk of Object.keys(BANKS)) {
  ATTITUDES[bk] = [];
  for (let idx = 0; idx <= 8; idx++)
    ATTITUDES[bk].push([
      [buildAttitude(bk, idx, false, false), buildAttitude(bk, idx, false, true)],
      [buildAttitude(bk, idx, true,  false), buildAttitude(bk, idx, true,  true)],
    ]);
}

// SHIP (0-31, 8 = upright) → the precomputed attitude, full 360°. tilt = (SHIP−8)·
// 11.25° normalized to (−180,180]; |tilt|>90 is the upside-down half (yFlip). idx
// counts down from upright (pose 8) to on-side (pose 0); xFlip = leaning left.
function attitudeForShip(bank, ship) {
  let tilt = (ship - 8) * STEP_DEG;
  tilt = ((tilt + 180) % 360 + 360) % 360 - 180;   // → (−180, 180]
  const xf = tilt < 0;
  const yf = Math.abs(tilt) > 90;
  const mag = yf ? 180 - Math.abs(tilt) : Math.abs(tilt);
  const idx = 8 - Math.round(mag / STEP_DEG);
  return ATTITUDES[bank][idx][xf ? 1 : 0][yf ? 1 : 0];
}

// Two lines from the nozzle tips converging to a point `len` along the exhaust
// direction; `len` tracks throttle × flicker, scaled by the nozzle mouth.
function flameSegs(att, throttle, flick) {
  if (throttle <= 0.02 || !att.noz) return [];
  const { d, noz } = att;
  const len = noz.mouthW * (FLAME_MIN + throttle * FLAME_SPAN) * flick;
  const tx = noz.cx + d.x * len, ty = noz.cy + d.y * len;
  return [
    { fx: noz.ax, fy: noz.ay, tx, ty, bri: 15 },
    { fx: noz.bx, fy: noz.by, tx, ty, bri: 15 },
  ];
}

export class Lander {
  constructor() {
    this.physics = new ArcadePhysics();   // active flight model (arcade; Seb-style swappable later)
    this.flick = 0;
  }

  // Delegate motion to the active stepper (the sole motion-write owner).
  update(state, input) {
    this.physics.step(state, input);
  }

  // Draw the craft, centred on screen (the world scrolls under it — §9). Pose from
  // SHIP, bank from zoom, flame from the smoothed throttle.
  render(ctx, state) {
    const bank = isMajor() ? 'out' : 'in';                 // major/zoom-out → little; minor → big
    const att = attitudeForShip(bank, state.SHIP);
    const pxu = PXU[bank];
    this.flick++;
    const flick = 1 + ((this.flick >> 1) % 3) * 0.2;       // 1.0 / 1.2 / 1.4 every 2 frames
    const flame = flameSegs(att, state.throttle, flick);
    const cx = state.posX, cy = SCREEN_H - state.posY;     // DVG (posX,posY) Y-up → canvas Y-down
    drawSegmentsScreen(ctx, flame, { cx, cy, pxScale: pxu, color: 'rgba(170,255,190,0.95)', width: 1.8 });
    drawSegmentsScreen(ctx, att.segs, { cx, cy, pxScale: pxu, width: 1.7 });
  }
}
