// motion.js — move sandbox: pick an action from the header; the play_seq engine
// drives it. Locomotion (walk/run) paces wall-to-wall in a fixed [0,640] view; the
// sequences' own jmp targets chain the transitions (startrun->runcyc, runturn->runcyc7,
// step/turn->stand). The sandbox driver only decides *when* to fire a wall-turn — the
// clone's stand-in for control_kid's decisions.
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

const GROUND_Y = 250;                    // canvas y of the ground line
const BOUND_L = 0, BOUND_R = 640;        // the actor paces within this on-screen x range
let sheet = null;
let actorX = (BOUND_L + BOUND_R) / 2;    // the character's registration point (obj_x), screen px

const ch = makeCharacter({ x: 0, y: 0, direction: DIR_LEFT });

// The pickable moves. `seq` = the sequence to start; `loco` marks the ones that
// traverse (need wall-pacing); `kind` picks the per-tick transition the sandbox
// re-issues at the wall / on settle (the engine's own jmps do the rest).
const MOVES = {
  stand:  { seq: 'stand',    loco: false },
  crouch: { seq: 'stoop',    loco: false },
  walk:   { seq: 'step11',   loco: true,  kind: 'step' },
  run:    { seq: 'startrun', loco: true,  kind: 'run'  },
  turn:   { seq: 'turn',     loco: false, kind: 'spin' },
};
let moveName = 'run', move = MOVES.run;

$('move').onchange = () => selectMove($('move').value);

function selectMove(name) {
  moveName = name; move = MOVES[name];
  actorX = (BOUND_L + BOUND_R) / 2;      // recenter so locomotion has room both ways
  ch.direction = DIR_LEFT;               // native facing; the walls flip him as needed
  startSeq(ch, move.seq);
}

const spriteOf = (frame) => {
  const image = FRAME_TABLE_KID[frame][0];
  return image === 255 ? null : sheet.get(401 + image);
};

// Frame-range predicates (faithful frame numbers) — gate the wall-turns.
const inRunCycle = (f) => f >= 7 && f <= 14;   // the repeating run loop (not startrun/runturn)
const isStand    = (f) => f === 15;            // settled to stand (step/turn end in jmp(stand))

// runturn skids forward 1+1+8+7+3+1+2 = 23 units before it reverses; step11 covers 11.
const RUNTURN_SKID = 23, STEP_ADVANCE = 11;

// Is the actor's leading (registration) edge within `room` screen-px of the wall it faces?
const facingWallWithin = (room) =>
  ch.direction >= DIR_RIGHT ? actorX >= BOUND_R - room : actorX <= BOUND_L + room;

// One engine tick: advance the sequence, move the actor by the step it produced, then
// fire the move's wall / settle transition.
function tick() {
  const xBefore = ch.x;
  playSeq(ch);
  actorX += (ch.x - xBefore) * 2 * scale;        // reg point = obj_x, 2x per Char.x unit

  if (move.kind === 'run') {
    // Reverse with the faithful skid. Fire only while in the run cycle: runturn's own
    // jmp(runcyc7) resumes the loop flipped, so it can't re-fire itself.
    if (inRunCycle(ch.frame) && facingWallWithin(RUNTURN_SKID * 2 * scale))
      startSeq(ch, 'runturn');
  } else if (move.kind === 'step') {
    // Each careful step ends jmp(stand); on settle, step again — or turn first if the
    // next step would cross the wall.
    if (isStand(ch.frame))
      startSeq(ch, facingWallWithin(STEP_ADVANCE * 2 * scale) ? 'turn' : 'step11');
  } else if (move.kind === 'spin') {
    if (isStand(ch.frame)) startSeq(ch, 'turn');  // re-issue -> oscillate the about-face in place
  }
}

function draw() {
  // Fixed view — the camera never moves; the actor moves across a static canvas
  // whose edges (0..BOUND_R) are the pacing boundaries.
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(BOUND_L, GROUND_Y, BOUND_R - BOUND_L, 2);

  const image = FRAME_TABLE_KID[ch.frame][0];
  const sp = spriteOf(ch.frame);
  if (sp) {
    // NOT YET IMPLEMENTED: per-frame frame_table_kid[frame] dx/dy draw offsets (the obj_x
    // formula, seg008.c:1736). We position from accumulated seqtbl dx only — exact for the
    // run cycle (frame-table dx=dy=0), a minor nudge off on turn/step, and *required* for
    // jumps (large dy moves the reg point per frame). See CLAUDE.md "Sprite registration".
    const top = GROUND_Y - (sp.content.maxy + 1) * scale;    // content bottom (feet) on the ground line
    // Faithful flip (PoP draw_mid, seg008.c:1022): mirror about the registration point.
    if (ch.direction >= DIR_RIGHT) {                         // facing right: reg point = sprite RIGHT edge, hflip
      ctx.save();
      ctx.translate(actorX, top); ctx.scale(-1, 1);
      sp.draw(ctx, 0, 0, { color: tint, scale });
      ctx.restore();
    } else {                                                 // facing left (native): reg point = LEFT edge
      sp.draw(ctx, actorX, top, { color: tint, scale });
    }
  }
  hud.textContent =
    `move=${padW(moveName, 6)}  frame=${padN(ch.frame, 3)}  image=${padN(image, 3)}  ` +
    `res=${padN(image === 255 ? '-' : 401 + image, 3)}  dir=${padW(ch.direction < 0 ? 'left' : 'right', 5)}  ` +
    `actorX=${padN(Math.round(actorX), 3)}` + (sp ? `  sprite=${padN(sp.w, 2)}x${padN(sp.h, 2)}` : '');
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
  selectMove($('move').value);
  requestAnimationFrame(loop);
}).catch((e) => { hud.textContent = 'load error: ' + e.message; });
