// lunar_lander/demos/explosion.js — the crash explosion, a routine-level
// translation of the original BOOM routine (A34573.1A) + its debris pictures
// (A34599.1C). Full decode in lunar_lander/docs/research_explosion.md.
//
// WHAT THE SOURCE ACTUALLY DOES (not the old "draw a random subset of glyphs" guess):
//
//   An explosion = 7 pieces — a tumbling cabin OCTAGON + 6 debris fragments —
//   animated over a step counter INDEX that runs 1 -> 127 (one step every other
//   frame). Each piece i flies straight out from the impact point at its own
//   constant velocity (BOOMA[i]); its on-screen offset is delta_i * INDEX, so the
//   whole field spreads linearly. Pieces wink out at staggered times BOOMC1[i]
//   (the octagon lasts longest, to 127 — "semi-intact cabin while the struts
//   scatter"). The octagon also tumbles: its pose = OCTGN[INDEX & 7].
//
//   The "randomness": RNDOM (0..3, from a free-running counter) selects ONE of
//   FOUR hand-authored patterns — each pattern is a fixed set of 6 fragment
//   glyphs + their 7 velocities. So "random debris" means a random 1-of-4 pattern,
//   NOT a random subset of the 12 glyphs. (A34573.1A:3427 BMVCPI; :3508 RNDOM.)
//
//   POSITIONING IS CUMULATIVE. The CPU builds one VG display list per frame and
//   walks it with a single moving beam (VGVCTR emits a *relative* vector —
//   A34573.1B:177 — with VGBRIT=0 so the positioning moves are dark/invisible).
//   So we reproduce it the same way: one accumulating cursor, drawn-in-order
//   [octagon, frag5..frag0]; each piece adds its dark delta*INDEX move, then its
//   glyph is drawn at the beam (which the glyph advances by its own net delta).
//
//   Residual lander velocity (DELX/DELY, added to the octagon only — A34573.1A:3353)
//   is ZERO here: the demo crashes a lander resting at the centre, per the brief.

import { ROM599 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

// ---- explosion data (from the source) -----------------------------------
// Piece index Y: 0..5 = the six fragments, 6 = the cabin octagon.
// DRAW ORDER is 6,5,4,3,2,1,0 (octagon first) — BOOM steps X = 12,10,..,0 and Y = X/2.
const DRAW_ORDER = [6, 5, 4, 3, 2, 1, 0];

// BOOMC1 (A34573.1A:3478) — INDEX at which each piece disappears; SHARED by all
// patterns. Hex in source: 5D 60 64 6D 70 74 7F. The octagon (Y=6) = 7F = 127 = last.
const DISAPPEAR = [0x5D, 0x60, 0x64, 0x6D, 0x70, 0x74, 0x7F];

// The 8 cabin octagon poses OCT00..OCT07 ($4800.. — A34599.1C:50). The explosion
// cycles them by INDEX&7 so the pod tumbles (A34573.1A:3387 LDA INDEX / AND 7).
const OCTAGON = ['S_4800', 'S_4826', 'S_4844', 'S_486A', 'S_4890', 'S_48AC', 'S_48D2', 'S_48F8'];

// Trailing dark move baked into each OCTXn wrapper (A34599.1C:626 OCTX0..7: the
// VCTR after the JSRL). Drawn first, so it nudges every later fragment by this
// small constant — kept for faithfulness to the cumulative beam walk.
const OCT_TRAIL = [[2, 7], [1, 8], [0, 9], [-2, 8], [4, 8], [3, 8], [1, 8], [-1, 8]];

// The four patterns. delta[Y] = (dx,dy) velocity from BOOMA{n} (A34573.1A:3445);
// glyph[Y] (Y=0..5) = the JSRL'd debris picture from BOOMB{n} (A34599.1C:658).
// $4F1C..$4FBE = PIECE1..PIEC12, the 12 fragment glyphs.
const PATTERNS = [
  { // RNDOM 0 — BOOMA1 / BOOMB1
    delta: [[0, -2], [-1, -1], [-2, 0], [-1, 0], [0, 2], [2, -1], [0, 3]],
    glyph: ['S_4F1C', 'S_4F28', 'S_4F3A', 'S_4F46', 'S_4F52', 'S_4F62'],  // PIECE1..6
  },
  { // RNDOM 1 — BOOMA2 / BOOMB2
    delta: [[2, 1], [0, 1], [-4, 1], [-1, -1], [2, 0], [0, -1], [0, 2]],
    glyph: ['S_4F6E', 'S_4F78', 'S_4F8E', 'S_4FA0', 'S_4FAE', 'S_4FBE'],  // PIEC7..12
  },
  { // RNDOM 2 — BOOMA3 / BOOMB3
    delta: [[-1, 0], [-3, 0], [1, 0], [-1, -1], [0, -1], [3, 0], [0, 3]],
    glyph: ['S_4F3A', 'S_4FBE', 'S_4F8E', 'S_4F62', 'S_4F46', 'S_4FBE'],  // PIECE3,12,9,6,4,12
  },
  { // RNDOM 3 — BOOMA4 / BOOMB4
    delta: [[1, -1], [-5, 0], [1, -1], [3, 1], [-1, -3], [1, 1], [0, 3]],
    glyph: ['S_4F78', 'S_4F28', 'S_4F3A', 'S_4FA0', 'S_4F62', 'S_4F6E'],  // PIEC8,2,3,10,6,7
  },
];

const MAX_INDEX = 0x7F;        // 127 — octagon's disappear time; explosion ends past this
const STAND_POSE = 'S_4B64';   // upright lander (close bank), shown intact before the blast
const GS = 0;                  // render shapes at native (close) size

// Walk the explosion exactly as the DVG would: one accumulating cursor, pieces in
// draw order, each gated by its disappear time. Returns flat segment list in DVG
// units (origin = impact point at (0,0)). `index` is the animation step (1..127).
function explosionSegs(p, index) {
  const segs = [];
  const cur = { x: 0, y: 0 };
  const push = (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty });
  for (const y of DRAW_ORDER) {
    if (index > DISAPPEAR[y]) continue;          // piece gone — no beam move, no draw (:3348)
    cur.x += p.delta[y][0] * index;              // dark VGVCTR positioning move (:3355 MULT by INDEX)
    cur.y += p.delta[y][1] * index;
    if (y === 6) {                               // the cabin octagon — tumbles, then its trailing move
      runList(ROM599, ROM599[OCTAGON[index & 7]], cur, GS, push, false, false);
      cur.x += OCT_TRAIL[index & 7][0];
      cur.y += OCT_TRAIL[index & 7][1];
    } else {                                     // a debris fragment glyph
      runList(ROM599, ROM599[p.glyph[y]], cur, GS, push, false, false);
    }
  }
  return segs;
}

function landerSegs() {                          // the intact lander (octagon + legs), centred
  const segs = [], cur = { x: 0, y: 0 };
  runList(ROM599, ROM599[STAND_POSE], cur, GS,
          (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }), false, false);
  return segs;
}

// ---- fit-to-canvas --------------------------------------------------------
// The debris flies far (a fragment can reach ~450 units before vanishing) while a
// glyph is only ~10 units — the real arcade look is a wide, sparse scatter of tiny
// pieces. Measure the worst-case extent across all 4 patterns once, so the default
// zoom keeps the whole burst on-screen; the zoom slider scales around it.
function fitScale(w, h) {
  let mx = 1, my = 1;
  for (const p of PATTERNS)
    for (let i = 1; i <= MAX_INDEX; i++)
      for (const s of explosionSegs(p, i)) {
        mx = Math.max(mx, Math.abs(s.fx), Math.abs(s.tx));
        my = Math.max(my, Math.abs(s.fy), Math.abs(s.ty));
      }
  return Math.min(0.46 * w / mx, 0.46 * h / my);
}

// ---- wiring ---------------------------------------------------------------
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const W = cv.width, H = cv.height, CX = W / 2, CY = H / 2;
const FIT = fitScale(W, H);

const patSel = document.getElementById('pattern');
const zoomEl = document.getElementById('zoom');
const speedEl = document.getElementById('speed');
const pauseBtn = document.getElementById('pause');
const scrubEl = document.getElementById('scrub');
const readout = document.getElementById('readout');

// timing (frames @ 60fps): hold the intact lander, run the blast, brief blank, loop.
const INTACT_FRAMES = 70;      // ~1.2 s
const END_FRAMES = 40;         // ~0.7 s blank after the last piece
const STEP_EVERY = 2;          // source advances INDEX every other frame

let pattern = pickPattern();   // 0..3 (or forced via the dropdown)
let phase = 'intact';          // 'intact' | 'boom' | 'end'
let phaseFrame = 0;
let index = 0;                 // explosion step
let paused = false;

function pickPattern() {
  const v = patSel ? patSel.value : 'random';
  return v === 'random' ? Math.floor(Math.random() * 4) : (Number(v) | 0);
}

function draw(segs, color) {
  ctx.clearRect(0, 0, W, H);
  const scale = FIT * Number(zoomEl.value);
  ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 6;            // phosphor bloom so tiny fragments read
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(CX + s.fx * scale, CY - s.fy * scale);     // DVG +y up -> canvas
    ctx.lineTo(CX + s.tx * scale, CY - s.ty * scale);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,110,110,0.7)';                // impact origin (0,0)
  ctx.beginPath(); ctx.arc(CX, CY, 2, 0, Math.PI * 2); ctx.fill();
}

const GREEN = 'rgba(120,255,150,0.92)';

function render() {
  let segs, label;
  if (phase === 'intact') {
    segs = landerSegs();
    label = `intact lander @ centre  ·  next: pattern ${pattern + 1}`;
  } else {
    segs = explosionSegs(PATTERNS[pattern], Math.max(1, index));
    const alive = DRAW_ORDER.filter(y => index <= DISAPPEAR[y]).length;
    label = `BOOM  ·  pattern ${pattern + 1}/4  ·  INDEX ${String(index).padStart(3)}/127  ·  pieces ${alive}/7`;
  }
  draw(segs, GREEN);
  readout.textContent = label;
  if (scrubEl && !scrubEl.matches(':active')) scrubEl.value = index;
}

function advance() {
  if (phase === 'intact') {
    if (++phaseFrame >= INTACT_FRAMES) { phase = 'boom'; phaseFrame = 0; index = 1; }
  } else if (phase === 'boom') {
    if (++phaseFrame >= STEP_EVERY * (2 - Number(speedEl.value))) {  // speed 1 = faithful (every 2 frames)
      phaseFrame = 0;
      index += 1;
      if (index > MAX_INDEX) { phase = 'end'; phaseFrame = 0; }
    }
  } else { // end
    if (++phaseFrame >= END_FRAMES) { phase = 'intact'; phaseFrame = 0; index = 0; pattern = pickPattern(); }
  }
}

function frame() {
  if (!paused) advance();
  render();
  requestAnimationFrame(frame);
}

// controls
patSel.addEventListener('change', () => { pattern = pickPattern(); phase = 'intact'; phaseFrame = 0; index = 0; });
pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶ play' : '⏸ pause'; });
scrubEl.addEventListener('input', () => {                 // scrub jumps into a paused BOOM frame
  paused = true; pauseBtn.textContent = '▶ play';
  phase = 'boom'; index = Number(scrubEl.value);
});
requestAnimationFrame(frame);
