// lunar_lander/demos/physics.js — faithful flight physics on a scrolling starfield.
//
// Physics is a routine-level translation of the ORIGINAL source (Rich Moore, 1978);
// see docs/research_physics.md. Constants are the real ones (A34573.1A):
//   GRAVITY = $11 (17); thrust magnitude = TRSTAB[throttle] ($1C max); hover where
//   thrust == gravity, i.e. TRSTAB[8] == 17 (throttle 8/15). Integration (ACCEL):
//   VELY += Ythrust - GRAVITY, VELX += Xthrust, pos += VEL; gravity is Y-only and
//   there is NO global drag (only Training-mode friction). Difficulty differences
//   (GRAVT/friction/1.5x thrust/rotational inertia) are all from the source.
//
// Per the arcade's own camera model, the LANDER STAYS CENTRED and the WORLD SCROLLS
// (SCROLL/SCRADD). Here, with no terrain, the STARFIELD is the motion cue: it scrolls
// opposite the lander's velocity (horizontal drift + vertical climb/descent). The
// starfield itself is a generated, evenly-spread field (the ROM's fixed 61-point
// field is a clustered backdrop — view it in starfield.html); brightness 5-9 matches
// the ROM star magnitudes. The flame is our own design (see CLAUDE.md "Thrust flame").

import { ROM598, ROM599 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const W = 1024, H = 768;
const CX = W / 2, CY = 420;            // lander screen centre (below the HUD)

// ---- source physics constants (decimal; A34573.1A) ----------------------
const TRSTAB = [0, 2, 5, 8, 11, 13, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28];  // THRUST 0-15 -> magnitude
const ABORT_THRUST = 255;              // TRSTAB[16] = $FF (emergency blast)
const GRAVT = { training: 17, cadet: 17, prime: 34, command: 17 };            // GRAVT: 11,11,22,11
const THRUST_MULT = { training: 1, cadet: 1, prime: 1.5, command: 1 };         // Prime: 1.5x thrust (ACCEL)

// Tunable scales mapping source units -> demo feel (ratios stay faithful).
const A_SCALE = 0.0011;                // accel -> velocity per tick
const V_SCALE = 1.0;                   // velocity -> world units (pixels) per tick
const SPD_DISP = 26;                   // |velocity| -> HUD speed number
const ALT_DISP = 0.9;                  // world-Y -> HUD altitude number
const FUEL_RATE = 0.012;               // fuel burned per thrust-magnitude per tick (FUELFAC analog)
const ROT_RATE = 2.6;                  // deg/tick while a rotate key is held (non-inertia)
const ROT_ACCEL = 0.18;               // deg/tick^2 angular accel (Command inertia)
const STEP = 90 / 8;                   // 11.25 deg between stored poses (SHIP 0-31)

// ---- lander poses + flame (as in thrust.html) ---------------------------
const BANKS = {
  in:  ['S_4916','S_495C','S_49AA','S_49F6','S_4A42','S_4A80','S_4AC8','S_4B16','S_4B64'],
  out: ['S_4BE4','S_4C22','S_4C5A','S_4C94','S_4CD6','S_4D02','S_4D42','S_4D7E','S_4DB6'],
};
const FLAME_MIN = 0.3, FLAME_SPAN = 1.2;

function collect(name, xf) {
  const segs = [], cur = { x: 0, y: 0 };
  runList(ROM599, ROM599[name], cur, 0, (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }), xf, false);
  return segs;
}
function nozzleTips(segs, d) {
  const p = { x: -d.y, y: d.x };
  let best = null, bestDepth = -Infinity;
  for (const s of segs) {
    const pp1 = s.fx*p.x + s.fy*p.y, pp2 = s.tx*p.x + s.ty*p.y;
    if (Math.min(pp1, pp2) > 0 || Math.max(pp1, pp2) < 0) continue;
    const depth = (s.fx*d.x + s.fy*d.y + s.tx*d.x + s.ty*d.y) / 2;
    if (depth > bestDepth) { bestDepth = depth; best = { a: { x: s.fx, y: s.fy }, b: { x: s.tx, y: s.ty } }; }
  }
  return best;
}
function buildAttitude(bankName, idx, xf) {
  const tilt = (xf ? -1 : 1) * (8 - idx) * STEP;
  const th = (270 - tilt) * Math.PI / 180;
  const d = { x: Math.cos(th), y: Math.sin(th) };
  const segs = collect(BANKS[bankName][idx], xf);
  const n = nozzleTips(segs, d);
  const noz = n && {
    ax: n.a.x, ay: n.a.y, bx: n.b.x, by: n.b.y,
    cx: (n.a.x + n.b.x) / 2, cy: (n.a.y + n.b.y) / 2,
    mouthW: Math.hypot(n.a.x - n.b.x, n.a.y - n.b.y),
  };
  return { tilt, d, segs, noz };
}
const ATTITUDES = {};
for (const bk of Object.keys(BANKS)) {
  ATTITUDES[bk] = [];
  for (let idx = 0; idx <= 8; idx++)
    ATTITUDES[bk].push({ pos: buildAttitude(bk, idx, false), neg: buildAttitude(bk, idx, true) });
}
function attitudeForTilt(tilt) {
  const idx = 8 - Math.round(Math.min(90, Math.abs(tilt)) / STEP);
  const slot = ATTITUDES.in[idx];
  return tilt < 0 ? slot.neg : slot.pos;
}
function flameSegs(att, level, flick) {     // level 0..1, flick 1.0/1.2/1.4
  if (level <= 0.02 || !att.noz) return [];
  const { d, noz } = att;
  const len = noz.mouthW * (FLAME_MIN + level * FLAME_SPAN) * flick;
  const tx = noz.cx + d.x*len, ty = noz.cy + d.y*len;
  return [{ fx: noz.ax, fy: noz.ay, tx, ty }, { fx: noz.bx, fy: noz.by, tx, ty }];
}

// ---- starfield (generated, even spread; scrolls with world position) ----
const STAR_TILE = 1400;                 // virtual tile, wrapped both axes
const stars = [];
(function seedStars() {
  let s = 0x9e37;                       // deterministic LCG (stable field each load)
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 260; i++)
    stars.push({ x: rnd() * STAR_TILE, y: rnd() * STAR_TILE, bri: 5 + Math.floor(rnd() * 5) });
})();
function drawStars(ctx, worldX, worldY) {
  // screen = centre + (starWorld - landerWorld); wrap into the tile; y flips (DVG y-up).
  const ox = ((-worldX % STAR_TILE) + STAR_TILE) % STAR_TILE;
  const oy = ((worldY % STAR_TILE) + STAR_TILE) % STAR_TILE;
  for (const st of stars) {
    let sx = (st.x + ox) % STAR_TILE, sy = (st.y + oy) % STAR_TILE;
    // tile across the screen
    for (let gx = -STAR_TILE; gx < W + STAR_TILE; gx += STAR_TILE) {
      for (let gy = -STAR_TILE; gy < H + STAR_TILE; gy += STAR_TILE) {
        const px = sx + gx, py = sy + gy;
        if (px < -2 || px > W + 2 || py < -2 || py > H + 2) continue;
        ctx.fillStyle = `rgba(120,255,150,${0.25 + st.bri / 18})`;
        ctx.fillRect(px, py, st.bri >= 8 ? 2 : 1, st.bri >= 8 ? 2 : 1);
      }
    }
  }
}

// ---- HUD ($5458 grid + live values, as in screen.html) ------------------
const GLYPH = { SPACE: 'S_5726', COLON: 'S_55B2', ARROW_RIGHT: 'S_5566', ARROW_LEFT: 'S_5576', ARROW_UP: 'S_5586', ARROW_DOWN: 'S_5598' };
const CHAR_GLYPH = { ' ': GLYPH.SPACE, ':': GLYPH.COLON, '0': 'S_5688' };
[0x572A, 0x5732, 0x5742, 0x5750, 0x575E, 0x576C, 0x577A, 0x5784, 0x5794]
  .forEach((a, i) => { CHAR_GLYPH[String(i + 1)] = 'S_' + a.toString(16).toUpperCase(); });
const DIGIT_W = 12;
function drawText(ctx, str, px, py, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  let penX = 0;
  for (const ch of str) {
    const key = CHAR_GLYPH[ch] || GLYPH.SPACE; const cur = { x: 0, y: 0 }; const segs = [];
    runList(ROM598, [{ op: 'LABS', x: 0, y: 0, globalScale: 0 }, { op: 'JSR', target: key }], cur, 0,
            (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
    for (const s of segs) {
      const x0 = px + (penX + s.fx), y0 = py - s.fy;
      if (s.fx === s.tx && s.fy === s.ty) { ctx.beginPath(); ctx.arc(x0, y0, 1, 0, 7); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(px + (penX + s.tx), py - s.ty); ctx.stroke(); }
    }
    penX += cur.x || DIGIT_W;
  }
}
function drawTextRight(ctx, str, rightX, py, color) { drawText(ctx, str, rightX - str.length * DIGIT_W, py, color); }
function drawArrow(ctx, key, px, digitPy, color) {
  const c = { x: 0, y: 0 }; const segs = []; let mn = 1e9, mx = -1e9;
  runList(ROM598, [{ op: 'LABS', x: 0, y: 0, globalScale: 0 }, { op: 'JSR', target: key }], c, 0,
          (fx, fy, tx, ty) => { segs.push({ fx, fy, tx, ty }); mn = Math.min(mn, fy, ty); mx = Math.max(mx, fy, ty); });
  const py = digitPy - 6 + (mn + mx) / 2;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs) { ctx.beginPath(); ctx.moveTo(px + s.fx, py - s.fy); ctx.lineTo(px + s.tx, py - s.ty); ctx.stroke(); }
}
function drawHUD(ctx) {
  const segs = []; const cur = { x: 0, y: 0 };
  runList(ROM598, ROM598['S_5458'], cur, 0, (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }));
  ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (const s of segs) {
    ctx.beginPath(); ctx.moveTo(s.fx, H - s.fy); ctx.lineTo(s.tx, H - s.ty);
    ctx.strokeStyle = `rgba(0,255,0,${Math.max(0.4, s.bri / 15)})`; ctx.stroke();
  }
  const v = 'rgba(0,255,0,0.95)', LEFT_X = 204, RIGHT_X = 878;
  const pad4 = n => String(Math.max(0, Math.round(n))).padStart(4, '0').slice(-4);
  const t = Math.floor(state.time);
  drawText(ctx, '0000', LEFT_X, 20, v);                                   // SCORE (no terrain → 0)
  drawText(ctx, `${String((t / 60 | 0) % 100).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, LEFT_X, 48, v); // TIME
  drawText(ctx, pad4(state.fuel), LEFT_X, 76, v);                         // FUEL
  drawTextRight(ctx, pad4(Math.max(0, state.altitude)), RIGHT_X, 20, v);  // ALTITUDE
  drawTextRight(ctx, String(Math.round(Math.abs(state.vel.x) * SPD_DISP)), RIGHT_X, 48, v);  // H SPEED
  drawTextRight(ctx, String(Math.round(Math.abs(state.vel.y) * SPD_DISP)), RIGHT_X, 76, v);  // V SPEED
  drawArrow(ctx, state.vel.x >= 0 ? GLYPH.ARROW_RIGHT : GLYPH.ARROW_LEFT, RIGHT_X, 48, v);   // H dir
  drawArrow(ctx, state.vel.y >= 0 ? GLYPH.ARROW_UP : GLYPH.ARROW_DOWN, RIGHT_X, 76, v);      // V dir
}

// ---- lander draw (centred), reusing the precomputed pose segments -------
function drawLander(ctx, att, flame, red) {
  const X = x => CX + x, Y = y => CY - y;
  ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of att.segs) {
    if (s.bri <= 0) continue;
    ctx.beginPath(); ctx.moveTo(X(s.fx), Y(s.fy)); ctx.lineTo(X(s.tx), Y(s.ty));
    ctx.strokeStyle = `rgba(120,255,150,${Math.max(0.4, s.bri / 15)})`; ctx.stroke();
  }
  for (const s of flame) {
    ctx.beginPath(); ctx.moveTo(X(s.fx), Y(s.fy)); ctx.lineTo(X(s.tx), Y(s.ty));
    ctx.strokeStyle = red ? 'rgba(255,90,45,0.95)' : 'rgba(170,255,190,0.95)'; ctx.stroke();
  }
}

// ---- state + input ------------------------------------------------------
// DEMO SIMPLIFICATION: starting fuel tied to the difficulty dropdown for convenience.
// In the real game fuel-per-coin is an INDEPENDENT operator DIP (research_physics.md §7.2),
// unrelated to game type — to be done faithfully in the actual gameplay port, not here.
const FUEL0 = { training: 450, cadet: 600, prime: 750, command: 900 };
const state = { tilt: 0, tiltVel: 0, throttle: 0, thrustLevel: 0, aborting: false,
                vel: { x: 0, y: 0 }, pos: { x: 0, y: 0 },
                fuel: 600, altitude: 4000, time: 0, counter: 0 };
let difficulty = 'cadet';
const keys = {};
addEventListener('keydown', e => { keys[e.key] = true; if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.key] = false; });

function reset() {
  state.tilt = 0; state.tiltVel = 0; state.throttle = 0;
  state.vel.x = 0; state.vel.y = 0; state.pos.x = 0; state.pos.y = 0;
  state.fuel = FUEL0[difficulty]; state.altitude = 4000; state.time = 0;
}

// ---- physics tick (faithful to ACCEL) ----------------------------------
function tick(dt) {
  state.counter++;
  // rotation: keys -> tilt (Command mode = angular inertia)
  const left = keys['ArrowLeft'] || keys['a'], right = keys['ArrowRight'] || keys['d'];
  if (difficulty === 'command') {
    if (left) state.tiltVel -= ROT_ACCEL; if (right) state.tiltVel += ROT_ACCEL;
    state.tiltVel = Math.max(-4, Math.min(4, state.tiltVel));
    state.tilt += state.tiltVel * dt;
    if (state.tilt <= -90) { state.tilt = -90; state.tiltVel = 0; }
    if (state.tilt >= 90)  { state.tilt = 90;  state.tiltVel = 0; }
  } else {
    if (left)  state.tilt = Math.max(-90, state.tilt - ROT_RATE * dt);
    if (right) state.tilt = Math.min(90,  state.tilt + ROT_RATE * dt);
  }
  // throttle: Up/W ramps up, Down/S ramps down, and HOLDS (analog pot) so you can
  // dial in throttle 8 = hover; Space = abort (full emergency blast).
  if (keys['ArrowUp'] || keys['w']) state.throttle = Math.min(15, state.throttle + 0.4 * dt);
  if (keys['ArrowDown'] || keys['s']) state.throttle = Math.max(0, state.throttle - 0.4 * dt);
  const abort = keys[' '] && state.fuel > 0;
  const i0 = Math.floor(state.throttle), frac = state.throttle - i0;
  let mag = abort ? ABORT_THRUST : TRSTAB[i0] + (TRSTAB[Math.min(15, i0 + 1)] - TRSTAB[i0]) * frac;
  mag *= THRUST_MULT[difficulty];
  if (state.fuel <= 0) mag = 0;
  state.aborting = abort;
  state.thrustLevel = state.fuel <= 0 ? 0 : (abort ? 1 : state.throttle / 15);
  // thrust pushes along the lander's "up" axis (opposite the exhaust): dir = 90 - tilt
  const thr = (90 - state.tilt) * Math.PI / 180;
  const ax = mag * Math.cos(thr);
  const ay = mag * Math.sin(thr) - GRAVT[difficulty];        // gravity Y-only, subtracted
  state.vel.x += ax * A_SCALE * dt;
  state.vel.y += ay * A_SCALE * dt;
  if (difficulty === 'training' && state.counter % 16 === 0) {  // Training friction (vel -= vel/32)
    state.vel.x -= state.vel.x / 32; state.vel.y -= state.vel.y / 32;
  }
  state.pos.x += state.vel.x * V_SCALE * dt;
  state.pos.y += state.vel.y * V_SCALE * dt;
  if (mag > 0) state.fuel = Math.max(0, state.fuel - (mag * FUEL_RATE) * dt);
  state.altitude = 4000 + state.pos.y * ALT_DISP;
  state.time += dt / 60;
}

// ---- render loop --------------------------------------------------------
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const diffSel = document.getElementById('difficulty');
const redEl = document.getElementById('red');
const readout = document.getElementById('readout');
document.getElementById('reset').addEventListener('click', reset);
diffSel.addEventListener('change', () => { difficulty = diffSel.value; reset(); });

function syncBackingStore() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor((canvas.clientWidth || W) * dpr));
  canvas.height = Math.max(1, Math.floor((canvas.clientHeight || H) * dpr));
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
window.addEventListener('resize', syncBackingStore);
syncBackingStore();
reset();

let lastT = null;
function frame(t) {
  if (lastT == null) lastT = t;
  let elapsed = Math.min(100, t - lastT); lastT = t;
  // fixed ~24ms physics ticks (source frame), with a dt in "frames"
  while (elapsed > 0) { const step = Math.min(24, elapsed); tick(step / 24); elapsed -= step; }

  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  drawStars(ctx, state.pos.x, state.pos.y);
  drawHUD(ctx);
  const att = attitudeForTilt(state.tilt);
  const flick = 1 + ((state.counter >> 1) % 3) * 0.2;
  drawLander(ctx, att, flameSegs(att, state.thrustLevel, flick), redEl.checked);

  readout.textContent =
    `tilt ${state.tilt >= 0 ? '+' : ''}${state.tilt.toFixed(1)}°  ·  ` +
    `throttle ${state.aborting ? 'ABORT' : state.throttle.toFixed(1) + '/15'}  ·  ` +
    `vel (${(state.vel.x * SPD_DISP).toFixed(0)}, ${(state.vel.y * SPD_DISP).toFixed(0)})  ·  ` +
    `alt ${Math.max(0, Math.round(state.altitude))}  ·  fuel ${Math.round(state.fuel)}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
