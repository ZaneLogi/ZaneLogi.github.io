// motion.js — demo: drive the kid through the run cycle with the play_seq engine,
// pacing back and forth within a fixed on-screen x-range [BOUND_L, BOUND_R].
// Each tick advances the sequence (play_seq → a frame + a direction-signed Char.x
// step); we move the actor by that step and turn him around at the boundaries.
import { MaskSheet } from '../masksheet.js';
import { FRAME_TABLE_KID } from '../res/frame_table_kid.js';
import { makeCharacter, startSeq, playSeq, DIR_RIGHT, DIR_LEFT } from '../playseq.js';

const cv = document.getElementById('stage');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud');
const $ = (id) => document.getElementById(id);

// Fixed-width HUD fields so the monospace readout doesn't bounce as digit counts
// change (7 -> 11) or dir flips (left -> right). Numbers right-aligned, words left.
const padN = (v, n) => String(v).padStart(n);
const padW = (v, n) => String(v).padEnd(n);

let scale = 3, tickMs = 70, tint = '#111318', bg = '#b7b1a3', paused = false;
$('tick').oninput = () => { tickMs = +$('tick').value; $('tickval').textContent = tickMs + 'ms'; };
$('scale').oninput = () => { scale = +$('scale').value; $('scaleval').textContent = scale + '×'; };
$('tint').oninput = () => { tint = $('tint').value; };
$('bg').oninput = () => { bg = $('bg').value; };
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'play' : 'pause'; };

const GROUND_Y = 250;                 // canvas y of the ground line
const BOUND_L = 0, BOUND_R = 640;     // the actor stays within this on-screen x range
let sheet = null;
let actorX = 500;                     // the character's registration point (obj_x), in screen px
const ch = makeCharacter({ x: 0, y: 0, direction: DIR_LEFT });   // start running left

const spriteOf = (frame) => {
  const image = FRAME_TABLE_KID[frame][0];
  return image === 255 ? null : sheet.get(401 + image);
};

// One engine tick: advance the sequence, move the actor by the step it produced,
// and turn around at the boundaries.
function tick() {
  const xBefore = ch.x;
  playSeq(ch);
  actorX += (ch.x - xBefore) * 2 * scale;          // actorX = the registration point (obj_x), 2x per Char.x unit
  const sp = spriteOf(ch.frame);
  const w = sp ? sp.w * scale : 0;
  // Turn at the walls. Facing left the reg point is the sprite's LEFT edge (box
  // [actorX, actorX+w]); facing right it's the RIGHT edge (box [actorX-w, actorX]).
  // On a turn, move the reg point across the box (±w) so the box stays put — no jump.
  if (ch.direction < 0) {                           // running left
    if (actorX <= BOUND_L) { actorX = BOUND_L + w; ch.direction = DIR_RIGHT; }
  } else {                                          // running right
    if (actorX >= BOUND_R) { actorX = BOUND_R - w; ch.direction = DIR_LEFT; }
  }
}

function draw() {
  // Fixed view — the camera never moves; the actor runs across a static canvas
  // whose edges (0..BOUND_R) are the pacing boundaries.
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(BOUND_L, GROUND_Y, BOUND_R - BOUND_L, 2);

  const image = FRAME_TABLE_KID[ch.frame][0];
  const sp = spriteOf(ch.frame);
  if (sp) {
    const top = GROUND_Y - (sp.content.maxy + 1) * scale;      // content bottom (feet) on the ground line
    // Faithful flip (PoP draw_mid, seg008.c:1022): mirror about the registration
    // point (actorX), NOT the box or content centre — keeps the gait symmetric.
    if (ch.direction >= 0) {                                   // facing right: reg point = sprite RIGHT edge, hflip
      ctx.save();
      ctx.translate(actorX, top); ctx.scale(-1, 1);
      sp.draw(ctx, 0, 0, { color: tint, scale });
      ctx.restore();
    } else {                                                   // facing left (native): reg point = LEFT edge
      sp.draw(ctx, actorX, top, { color: tint, scale });
    }
  }
  hud.textContent =
    `frame=${padN(ch.frame, 2)}  image=${padN(image, 3)}  res=${padN(image === 255 ? '-' : 401 + image, 3)}  ` +
    `dir=${padW(ch.direction < 0 ? 'left' : 'right', 5)}  actorX=${padN(Math.round(actorX), 3)}  ` +
    `[bounds ${BOUND_L}..${BOUND_R}]` + (sp ? `  sprite=${padN(sp.w, 2)}x${padN(sp.h, 2)}` : '');
}

let last = 0, acc = 0;
function loop(ts) {
  if (!last) last = ts;
  acc += ts - last; last = ts;
  if (!paused) {
    let steps = 0;
    while (acc >= tickMs && steps < 8) { tick(); acc -= tickMs; steps++; }
  } else { acc = 0; }
  if (sheet) draw();
  requestAnimationFrame(loop);
}

MaskSheet.load('../gfx/kid_masks.json').then((s) => {
  sheet = s;
  startSeq(ch, 'startrun');
  requestAnimationFrame(loop);
}).catch((e) => { hud.textContent = 'load error: ' + e.message; });
