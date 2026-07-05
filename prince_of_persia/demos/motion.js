// motion.js — move sandbox: pick an action from the header; the play_seq engine
// drives it. Ground moves (stand/crouch/walk/run/turn) pace wall-to-wall in a fixed
// [0,640] view; jumps (standing/running) add the first vertical arcs; the fall pick
// auto-cycles free-fall drops and their landings (soft / medium / hard). The sequences'
// own jmp targets chain the transitions; the sandbox driver only decides *when* to fire
// a wall-turn / jump / landing — the clone's stand-in for control_kid.
//
// Per-frame registration is faithful to load_frame_to_obj (seg008.c:1736-1737):
//   obj_x = (char_dx_forward(frame.dx) << 1) - 116   frame.dx offsets the reg point (facing-relative)
//   obj_y = frame.dy + Char.y                         frame.dy offsets the feet baseline (obj_y is the sprite BOTTOM)
// Both are applied as per-frame DRAW offsets (never accumulated into actorX/Char.x), so the
// fixed-view wall-pacing is unaffected. frame.dy is nonzero only for the dead splat (185=+7),
// which seats the corpse below the feet line exactly as the source does — the source's floor
// tile has depth so that reads as "lying on the ground"; our thin ground line does not, so the
// corpse sinks below the line here (faithful, if odd for this demo — accepted).
import { MaskSheet } from '../masksheet.js';
import { FRAME_TABLE_KID } from '../res/frame_table_kid.js';
import { makeCharacter, startSeq, playSeq, fallAccel, fallSpeed,
         DIR_RIGHT, DIR_LEFT, ACT_IN_FREEFALL } from '../playseq.js';

const cv = document.getElementById('stage');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud');
const $ = (id) => document.getElementById(id);

// Fixed-width HUD fields so the monospace readout doesn't bounce as digit counts
// change (7 -> 11) or dir flips (left -> right). Numbers right-aligned, words left.
const padN = (v, n) => String(v).padStart(n);
const padW = (v, n) => String(v).padEnd(n);

let scale = 3, tickMs = 83, tint = '#111318', bg = '#b7b1a3', paused = false;  // 83ms default = DOS base speed (12 fps); slider adjusts
$('tick').oninput = () => { tickMs = +$('tick').value; $('tickval').textContent = tickMs + 'ms'; };
$('scale').oninput = () => { scale = +$('scale').value; $('scaleval').textContent = scale + '×'; };
$('tint').oninput = () => { tint = $('tint').value; };
$('bg').oninput = () => { bg = $('bg').value; };
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'play' : 'pause'; };

const GROUND_Y = 280;                    // canvas y of the ground line (leaves 20px below so the dead
                                         // splat's frame.dy=7 sink stays visible within the 300px canvas)
const BOUND_L = 0, BOUND_R = 640;        // the actor paces within this on-screen x range
const CENTER_X = (BOUND_L + BOUND_R) / 2;
let sheet = null;
let actorX = CENTER_X;                    // reg point from accumulated seqtbl dx (screen px);
                                          // draw() adds the per-frame frame.dx to get the actual obj_x

const ch = makeCharacter({ x: 0, y: 0, direction: DIR_LEFT });

// The pickable moves. `seq` = the sequence to start; `loco` marks the ones that traverse;
// `kind` picks the per-tick decision the sandbox re-issues (the engine's jmps do the rest).
const MOVES = {
  stand:  { seq: 'stand',     loco: false },
  crouch: { seq: 'stoop',     loco: false },
  walk:   { seq: 'step11',    loco: true,  kind: 'step'  },
  run:    { seq: 'startrun',  loco: true,  kind: 'run'   },
  turn:   { seq: 'turn',      loco: false, kind: 'spin'  },
  sjump:  { seq: 'standjump', loco: true,  kind: 'sjump' },
  rjump:  { seq: 'startrun',  loco: true,  kind: 'rjump' },  // run, with periodic running jumps
  fall:   { seq: null,        loco: false, kind: 'fall'  },  // auto-cycle drops + landings
};
let moveName = 'run', move = MOVES.run;

$('move').onchange = () => selectMove($('move').value);

function selectMove(name) {
  moveName = name; move = MOVES[name];
  actorX = CENTER_X;                     // recenter so locomotion has room both ways
  ch.direction = DIR_LEFT;               // native facing; the walls flip him as needed
  ch.y = 0; ch.fall_x = 0; ch.fall_y = 0;
  jumpTimer = 0;
  if (move.kind === 'fall') { fallStage = 0; startFall(); }
  else startSeq(ch, move.seq);
}

const spriteOf = (frame) => {
  const image = FRAME_TABLE_KID[frame][0];
  return image === 255 ? null : sheet.get(401 + image);
};

// Frame-range predicates (faithful frame numbers) — gate the wall-turns / re-fires.
const inRunCycle = (f) => f >= 7 && f <= 14;   // the repeating run loop (not startrun/runturn)
const isStand    = (f) => f === 15;            // settled to stand (step/turn/jump end in jmp(stand))

// Per-move forward reach (seqtbl dx sum), used to keep the actor from lunging into a wall.
const RUNTURN_SKID = 23, STEP_ADVANCE = 11, STANDJUMP_ADVANCE = 39, RUNJUMP_ADVANCE = 67;

// Is the actor's leading (registration) edge within `room` screen-px of the wall it faces?
const facingWallWithin = (room) =>
  ch.direction >= DIR_RIGHT ? actorX >= BOUND_R - room : actorX <= BOUND_L + room;
const reachPx = (units) => units * 2 * scale;   // seqtbl dx units -> screen px (obj_x is <<1, then *scale)

// --- running-jump pacing: fire a runjump periodically while there's room ahead ---
let jumpTimer = 0;
const RJUMP_PERIOD = 14;                        // ticks between running jumps

// --- fall auto-cycle state ---
// Each stage drops from a calibrated height so the impact speed lands in one regime:
// soft (fall_y 21) / medium (27) / hard (33). Drops are Char.y units (cum(n)=3n(n+1)/2).
const FALL_STAGES = ['soft', 'medium', 'hard'];
const FALL_DROP = { soft: 84, medium: 135, hard: 198 };
const SOFT_CROUCH_HOLD = 12, HARD_DEAD_HOLD = 20;   // ticks to hold the terminal pose before the next drop
let fallStage = 0, fallPhase = 'fall', fallLand = '', fallTimer = 0;

function startFall() {
  const stage = FALL_STAGES[fallStage];
  ch.y = -FALL_DROP[stage];              // start above the ground line (negative = higher; may be off-screen)
  ch.fall_y = 0; ch.fall_x = 0;
  actorX = CENTER_X; ch.direction = DIR_LEFT;
  fallPhase = 'fall'; fallLand = ''; fallTimer = 0;
  startSeq(ch, 'freefall');
}
function nextFall() { fallStage = (fallStage + 1) % FALL_STAGES.length; startFall(); }

// One engine tick: advance the sequence + gravity (uniform play_kid_frame order,
// seg000.c:1205-1207), move the actor horizontally by the step it produced, then fire
// the move's decision.
function tick() {
  const xBefore = ch.x;
  playSeq(ch);
  fallAccel(ch);
  fallSpeed(ch);
  actorX += (ch.x - xBefore) * 2 * scale;        // horizontal reg point (Char.x delta; obj_x <<1, then *scale)

  switch (move.kind) {
    case 'run':   decideRun();   break;
    case 'step':  decideStep();  break;
    case 'spin':  decideSpin();  break;
    case 'sjump': decideSjump(); break;
    case 'rjump': decideRjump(); break;
    case 'fall':  decideFall();  break;
  }
}

// run: reverse with the faithful runturn skid. Fire only in the run cycle so runturn's own
// jmp(runcyc7) can't re-fire itself.
function decideRun() {
  if (inRunCycle(ch.frame) && facingWallWithin(reachPx(RUNTURN_SKID))) startSeq(ch, 'runturn');
}
// walk: each careful step ends jmp(stand); on settle step again, or turn if the next step
// would cross the wall.
function decideStep() {
  if (isStand(ch.frame)) startSeq(ch, facingWallWithin(reachPx(STEP_ADVANCE)) ? 'turn' : 'step11');
}
function decideSpin() { if (isStand(ch.frame)) startSeq(ch, 'turn'); }  // oscillate the about-face in place

// standing jump: on settle, turn at the wall (so the next leap has room) else jump again.
function decideSjump() {
  if (isStand(ch.frame)) startSeq(ch, facingWallWithin(reachPx(STANDJUMP_ADVANCE)) ? 'turn' : 'standjump');
}
// running jump: run (runturn at walls) with a periodic runjump when there's room ahead.
function decideRjump() {
  jumpTimer++;
  if (!inRunCycle(ch.frame)) return;
  if (facingWallWithin(reachPx(RUNTURN_SKID))) { startSeq(ch, 'runturn'); jumpTimer = 0; }
  else if (jumpTimer >= RJUMP_PERIOD && !facingWallWithin(reachPx(RUNJUMP_ADVANCE))) {
    startSeq(ch, 'runjump'); jumpTimer = 0;      // ends jmp(runcyc1) -> resumes the run cycle
  }
}
// fall: freefall -> landing (soft/medium/hard by impact speed, seg005.c:174) -> settle -> next drop.
function decideFall() {
  if (fallPhase === 'fall') {
    if (ch.action === ACT_IN_FREEFALL && ch.y >= 0) {   // feet reached the ground line
      ch.y = 0;                                          // clamp (land, seg005.c:124)
      const fy = ch.fall_y;
      fallLand = fy < 22 ? 'soft' : (fy < 33 ? 'medium' : 'hard');
      startSeq(ch, fallLand === 'soft' ? 'softland' : fallLand === 'medium' ? 'medland' : 'hardland');
      ch.fall_y = 0;                                     // seg005.c:216
      fallPhase = 'land'; fallTimer = 0;
    }
  } else if (fallPhase === 'land') {
    fallTimer++;
    if (fallLand === 'soft') {                           // softland holds the crouch -> stand up
      if (fallTimer >= SOFT_CROUCH_HOLD) { startSeq(ch, 'standup'); fallPhase = 'recover'; }
    } else if (fallLand === 'medium') {                  // medland stands up on its own
      if (isStand(ch.frame)) nextFall();
    } else {                                             // hardland holds the dead splat
      if (fallTimer >= HARD_DEAD_HOLD) nextFall();
    }
  } else if (fallPhase === 'recover') {                  // soft-land standup finishing
    if (isStand(ch.frame)) nextFall();
  }
}

// Fall-phase label for the HUD (what you're watching right now).
function fallPhaseLabel() {
  if (moveName !== 'fall') return '-';
  if (fallPhase === 'fall') return 'freefall';
  if (fallPhase === 'recover') return 'standup';
  return fallLand + '-land';
}

function draw() {
  // Fixed view — the camera never moves; the actor moves across a static canvas
  // whose edges (0..BOUND_R) are the pacing boundaries.
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(BOUND_L, GROUND_Y, BOUND_R - BOUND_L, 2);

  const [image, , frameDx, frameDy] = FRAME_TABLE_KID[ch.frame];
  const sp = spriteOf(ch.frame);
  if (sp) {
    // Per-frame draw offsets (seg008.c:1736-1737): frame.dx shifts the reg point in the facing
    // direction (char_dx_forward); frame.dy shifts the feet baseline down (obj_y is the sprite
    // bottom). Applied fresh each frame, so actorX / wall-pacing are untouched. frame.dy is
    // nonzero only for the dead splat (185=+7): it seats the corpse below the feet line as the
    // source does — faithful, though our thin ground line lets it sink below (see file header).
    const regX = actorX + (ch.direction < DIR_RIGHT ? -frameDx : frameDx) * 2 * scale;
    const feetY = GROUND_Y + (ch.y + frameDy) * scale;
    const top = feetY - (sp.content.maxy + 1) * scale;   // content bottom (feet) on the offset baseline
    // Faithful flip (PoP draw_mid, seg008.c:1022): mirror about the registration point.
    if (ch.direction >= DIR_RIGHT) {                     // facing right: reg point = sprite RIGHT edge, hflip
      ctx.save();
      ctx.translate(regX, top); ctx.scale(-1, 1);
      sp.draw(ctx, 0, 0, { color: tint, scale });
      ctx.restore();
    } else {                                             // facing left (native): reg point = LEFT edge
      sp.draw(ctx, regX, top, { color: tint, scale });
    }
  }
  hud.textContent =
    `move=${padW(moveName, 6)}  frame=${padN(ch.frame, 3)}  image=${padN(image, 3)}  ` +
    `dir=${padW(ch.direction < 0 ? 'left' : 'right', 5)}  act=${padN(ch.action, 1)}  ` +
    `y=${padN(Math.round(ch.y), 4)}  fall_y=${padN(ch.fall_y, 2)}  actorX=${padN(Math.round(actorX), 3)}  ` +
    `phase=${padW(fallPhaseLabel(), 8)}`;
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
