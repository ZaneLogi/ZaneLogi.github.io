// demos/attack_player.js — ATTACK-DIVE test bench (moth & bee).
//
// A deterministic harness over the REAL interpreter. It does NOT re-implement the tokens —
// it builds a minimal game state with ONE diving enemy and calls bugMotion.js's update()
// once per frame (the same function the game's loop calls), reading the enemy's position to
// draw the trail. Pin every input (slot, player X, FA, EF) and the dive is identical every
// run. Controls write into `state`; changing any of them replays from frame 0.
//
// Faithful by construction: a wrong dive here is a wrong dive in the game.

import { state } from '../state.js';
import { update as stepBugs, launchEnemyAttack } from '../tasks/bugMotion.js';
import { getObjectIdForSlot, loadStageParms, ATTACK_PATH_RED, ATTACK_PATH_YELLOW } from '../paths.js';

const PF_W = 224, PF_H = 288, SCALE = 2;
const PLAYER_Y = 265;                                 // fixed ship row (Z80 sprite_Y 297)
const F3_WIN = [14, 193];                             // canvas X where F3 saturates (sprite 0x1E..0xD1)
const MAX_DIVES = 8;                                  // backstop if no exact cycle is found
const ITER_HUES = ['#7cb6ff', '#68d391', '#f6ad55', '#fc8181', '#c792ea', '#4dd0e1'];
const TYPE = {
  moth: { rows: [2, 3], path: ATTACK_PATH_RED,    label: 'butterfly rows 2–3' },
  bee:  { rows: [4, 5], path: ATTACK_PATH_YELLOW, label: 'wasp rows 4–5' },
};

const cv = document.getElementById('pf');
cv.width = PF_W * SCALE; cv.height = PF_H * SCALE;
const ctx = cv.getContext('2d');

// ── scenario state ──────────────────────────────────────────────────────────────
let type = 'moth', row = 2, col = 2, playerX = 112, fa = false, ef = false;
let bug = null, trail = [], iters = 0, frame = 0, done = false, ended = 'flying';
let sigMap = new Map(), diveNum = 1, cycleStart = null, cycleLen = null;
let playing = true, speed = 1, raf = 0, acc = 0, last = 0;
const TICK_MS = 1000 / 60, SPEEDS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];

// Reset the singleton to a clean, deterministic setup and launch one dive.
function loadScenario() {
  state.formation.oscillateX = 0;                     // formation at REST → every slot fixed
  if (Array.isArray(state.formation.pulseOffsets)) state.formation.pulseOffsets.fill(0);
  state.stage = 4;                                    // a combat stage (not challenge; not near stage-12)
  state.player.x = playerX;
  state.contBmbFlag = fa;                             // FA gate: keep diving vs home
  const parms = loadStageParms(4);
  parms[9] = ef ? 1 : 0;                              // EF gate: 0 = re-loop, !=0 = harder stage-12+ pass
  state.newStageParms = parms;
  state.bombDropFlags = 0;                            // no bombs rendered
  state.frameCount = 0;
  for (const e of state.enemies) { e.state = 'pending'; e.pathBase = null; }

  const objectId = getObjectIdForSlot(row, col);
  bug = state.enemies.find((e) => e.objectId === objectId);
  bug.state = 'formation';
  launchEnemyAttack(state, objectId, TYPE[type].path);

  trail = [{ x: bug.x, y: bug.y, iter: 0, tp: false }];
  iters = 0; frame = 0; done = false; ended = 'flying'; acc = 0;
  sigMap = new Map(); diveNum = 1; cycleStart = null; cycleLen = null;
  sigMap.set(diveSig(), 1);                            // dive 1 = the launch (unique, from the slot)
  buildGrid(); buildInfo(); render(); updateReadout();
}

// Signature of the enemy state at a dive boundary. The rest of the dive is a deterministic
// function of this state, so when one repeats, the system has re-entered a prior state and
// will cycle forever — that's how we find the loop's exact period.
function diveSig() {
  return `${bug.pathOffset}|${Math.round(bug.x)}|${Math.round(bug.y)}|${bug.angle}|${bug.vx}|${bug.vy}|${bug.rotRate}|${bug.segTimer}`;
}

// advance the real interpreter by one 60 Hz tick
function stepOne() {
  if (done) return;
  state.frameCount += 1;
  stepBugs(state);
  const prev = trail[trail.length - 1];
  const tp = (prev.y - bug.y > 80) || (Math.abs(bug.x - prev.x) > 60);   // F8/F9 reposition (teleport)
  if (tp) {
    const s = diveSig();
    if (sigMap.has(s)) {                               // this dive-start repeats an earlier one → CYCLE
      cycleStart = sigMap.get(s);
      cycleLen   = (diveNum + 1) - cycleStart;
      trail.push({ x: bug.x, y: bug.y, iter: iters, tp: true });   // draw the closing reposition
      done = true; ended = 'loop';
      return;
    }
    diveNum += 1; iters = diveNum - 1; sigMap.set(s, diveNum);
  }
  trail.push({ x: bug.x, y: bug.y, iter: iters, tp });
  frame += 1;
  if (bug.state === 'formation')          { done = true; ended = 'homing'; }
  else if (bug.state === 'dead' || !bug.alive) { done = true; ended = 'gone'; }
  else if (diveNum >= MAX_DIVES)          { done = true; ended = 'loop'; }   // backstop: no exact cycle found
  else if (frame > 3000)                  { done = true; ended = bug.state === 'flying' ? 'loop' : 'gone'; }
}

// ── rendering ─────────────────────────────────────────────────────────────────
function render() {
  ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, cv.width, cv.height);
  // formation rows (faint), highlight the two rows of the current type
  const litRows = TYPE[type].rows;
  ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    const gy = (28 + r * 16) * SCALE;
    ctx.strokeStyle = litRows.includes(r) ? 'rgba(150,170,200,0.35)' : 'rgba(120,120,120,0.18)';
    ctx.beginPath(); ctx.moveTo(40 * SCALE, gy); ctx.lineTo(184 * SCALE, gy); ctx.stroke();
  }
  ctx.strokeStyle = '#444'; ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);

  // moth: player ship + F3 window ticks
  if (type === 'moth') {
    for (const wx of F3_WIN) {
      ctx.strokeStyle = 'rgba(120,140,120,0.35)'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(wx * SCALE, 240 * SCALE); ctx.lineTo(wx * SCALE, PF_H * SCALE); ctx.stroke();
      ctx.setLineDash([]);
    }
    drawShip(playerX, PLAYER_Y);
  }

  drawTrail();

  // dive head
  if (bug) {
    const ang = bug.angle * (2 * Math.PI / 1024);
    ctx.save(); ctx.translate(bug.x * SCALE, bug.y * SCALE); ctx.rotate(-ang);
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath();
    ctx.fillStyle = '#eaeaea'; ctx.strokeStyle = '#eaeaea'; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawTrail() {
  const cs = cycleStart != null ? cycleStart - 1 : null;   // 0-based dive index the cycle begins at
  ctx.lineJoin = ctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    if (b.tp) {                                        // reposition: dashed faint connector (teleport, not flight)
      ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(150,150,150,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x * SCALE, a.y * SCALE); ctx.lineTo(b.x * SCALE, b.y * SCALE); ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (cs != null && b.iter < cs) {                   // one-time launch transient → muted grey
      ctx.globalAlpha = 0.38; ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.4;
    } else {                                           // cycle dive (or, pre-detection, any dive) → coloured
      const ci = cs != null ? b.iter - cs : b.iter;
      ctx.strokeStyle = ITER_HUES[ci % ITER_HUES.length];
      ctx.globalAlpha = done ? 0.92 : (b.iter === iters ? 1 : 0.4);
      ctx.lineWidth = (!done && b.iter === iters) ? 2.4 : 1.9;
    }
    ctx.beginPath(); ctx.moveTo(a.x * SCALE, a.y * SCALE); ctx.lineTo(b.x * SCALE, b.y * SCALE); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawShip(x, y) {
  ctx.save(); ctx.translate(x * SCALE, y * SCALE);
  ctx.fillStyle = '#68d391'; ctx.strokeStyle = '#68d391'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-5, 5); ctx.lineTo(5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ── driver loop ─────────────────────────────────────────────────────────────────
function tick(now) {
  raf = 0;
  if (last === 0) last = now;
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  if (playing && !done) {
    acc += dt * speed;
    let stepped = false;
    while (acc >= TICK_MS && !done) { stepOne(); acc -= TICK_MS; stepped = true; }
    if (stepped) { render(); updateReadout(); buildInfo(); }
  } else { acc = 0; }
  loop();
}
function loop() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }

// ── panel ─────────────────────────────────────────────────────────────────────
const BADGE = {
  flying:  ['flying', 'flying'],
  homing:  ['homing', '▣ homed into formation slot (FA false)'],
  gone:    ['gone',   '✕ left screen'],
};
// The 'loop' badge is built dynamically from the detected cycle.
function loopBadgeText() {
  if (cycleLen == null) return `↻ loops — showing ${diveNum} dives (no exact cycle in ${MAX_DIVES})`;
  const span = cycleLen === 1 ? `dive ${cycleStart} repeats` : `dives ${cycleStart}–${cycleStart + cycleLen - 1} repeat`;
  return `↻ cycle length ${cycleLen} — ${span} forever` + (cycleStart > 1 ? ` (dive 1 = one-time launch)` : '');
}
function buildInfo() {
  const negate = (getObjectIdForSlot(row, col) & 0x02) !== 0;
  document.getElementById('info').innerHTML =
    `<span class="k">type</span><span class="v">${type} · ${TYPE[type].label}</span>` +
    `<span class="k">slot</span><span class="v">row ${row}, col ${col} · id 0x${getObjectIdForSlot(row, col).toString(16).toUpperCase()}</span>` +
    `<span class="k">side</span><span class="v">${negate ? 'righty (negate)' : 'lefty (no negate)'}</span>` +
    `<span class="k">start</span><span class="v">(${trail[0] ? trail[0].x.toFixed(0) : '?'}, ${trail[0] ? trail[0].y.toFixed(0) : '?'})</span>` +
    (type === 'moth' ? `<span class="k">player X</span><span class="v">${playerX}</span>` : '') +
    `<span class="k">FA / EF</span><span class="v">${fa ? 'loop' : 'home'} / ${ef ? 'stage 12+' : 'off'}</span>`;
  let cls, txt;
  if (!done)                  { [cls, txt] = BADGE.flying; }
  else if (ended === 'loop')  { cls = 'loop'; txt = loopBadgeText(); }
  else                        { [cls, txt] = BADGE[ended]; }
  const b = document.getElementById('badge'); b.className = 'badge ' + cls; b.textContent = txt;
  document.getElementById('gate-note').textContent =
    !fa ? 'FA false → one dive, then FB homes into the slot. (EF is never reached.)'
        : ef ? 'FA true + EF (stage 12+) → jumps to the harder continuous-bomb pass' + (type === 'moth' ? ' (2nd F3 aim).' : '.')
             : 'FA true → re-dives the same pass forever (until killed). EF off, so no escalation.';
}
function updateReadout() {
  document.getElementById('readout').textContent = done
    ? `done · ${frame}f · ${diveNum} dive${diveNum === 1 ? '' : 's'}` +
      (ended === 'loop' && cycleLen != null ? ` · cycle ${cycleLen}` : ` · ${ended}`)
    : `f${frame} · ${bug.state} · dive ${diveNum} · (${bug.x.toFixed(0)},${bug.y.toFixed(0)})`;
}

// ── formation slot grid (start picker) ────────────────────────────────────────
function buildGrid() {
  const g = document.getElementById('grid'); g.innerHTML = '';
  document.getElementById('slot-type').textContent = `(${TYPE[type].label})`;
  for (const r of TYPE[type].rows) {
    for (let c = 0; c < 10; c++) {
      const negate = (getObjectIdForSlot(r, c) & 0x02) !== 0;
      const cell = document.createElement('div');
      cell.className = 'cell ' + (negate ? 'right' : 'left') + (r === row && c === col ? ' sel' : '');
      cell.textContent = c;
      cell.onclick = () => { row = r; col = c; loadScenario(); };
      g.appendChild(cell);
    }
  }
}

// ── controls ──────────────────────────────────────────────────────────────────
const playBtn = document.getElementById('play');
playBtn.onclick = () => { playing = !playing; if (playing && done) return; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; if (playing) { last = 0; loop(); } };
document.getElementById('restart').onclick = () => { loadScenario(); playing = true; playBtn.textContent = '⏸ Pause'; last = 0; loop(); };
document.getElementById('speed').oninput = (e) => { speed = SPEEDS[+e.target.value]; document.getElementById('speedval').textContent = speed + '×'; };
document.getElementById('player').oninput = (e) => { playerX = +e.target.value; document.getElementById('playerval').textContent = playerX; };
document.getElementById('player').onchange = () => { loadScenario(); playing = true; playBtn.textContent = '⏸ Pause'; };
document.getElementById('fa').onchange = (e) => { fa = e.target.checked; loadScenario(); };
document.getElementById('ef').onchange = (e) => { ef = e.target.checked; loadScenario(); };
document.querySelectorAll('#type input').forEach((inp) => {
  inp.onchange = () => {
    type = inp.value;
    document.querySelectorAll('#type label').forEach((l) => l.classList.toggle('on', l.dataset.type === type));
    document.getElementById('playerCtl').classList.toggle('off', type !== 'moth');
    row = TYPE[type].rows[0]; col = 2;                 // reset to a default slot for the new type
    loadScenario();
  };
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; loop(); } });

loadScenario();
loop();

// dev hook — drive from console.
window.AP = {
  get bug() { return bug; }, get trail() { return trail; },
  set(cfg) { Object.assign({ type, row, col, playerX, fa, ef }, cfg);
             if (cfg.type !== undefined) type = cfg.type;
             if (cfg.row !== undefined) row = cfg.row; if (cfg.col !== undefined) col = cfg.col;
             if (cfg.playerX !== undefined) playerX = cfg.playerX;
             if (cfg.fa !== undefined) fa = cfg.fa; if (cfg.ef !== undefined) ef = cfg.ef;
             loadScenario(); },
  run(n) { playing = false; for (let i = 0; i < n && !done; i++) stepOne(); render(); updateReadout(); buildInfo();
           return { frame, state: bug.state, iters, ended: done ? ended : null, pos: [+bug.x.toFixed(0), +bug.y.toFixed(0)] }; },
};
