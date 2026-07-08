// demos/boss_player.js — BOSS sortie + capture-dive test bench.
//
// The 4th attack-path bench, sibling to attack_player (moth/bee). Same faithful-
// by-construction contract: it DRIVES the real interpreter (bugMotion.js's
// update()), it does NOT re-implement the tokens. Pin every input and the dive is
// identical every run; changing any control replays from frame 0.
//
// The boss is the odd one out — it owns a path REGION (ATTACK_PATH_BOSS, z80 0x40C)
// with several entries, and its capture dive FORKS at the tractor-beam stall. This
// bench maps the source's own structure onto the UI:
//
//   • the 2-row slot grid IS the path selector (formation semantics, verified):
//       - TOP row  = captured-ship slots (objectId 0x00/0x04/0x06/0x02 = boss&7,
//                    gg1-2_fx.s:546/1223/1477) → the ROGUE path db_fltv_rogefgter.
//       - BOTTOM row = the 4 bosses (0x30/0x34/0x36/0x32, "bosses start at $30",
//                    gg1-2_fx.s:1042) → a BOSS dive.
//   • on the boss row, an escort/capture sub-toggle picks the mission
//     (case_bmbr_boss select, gg1-2_fx.s:1011) — the same 4 bosses launch either.
//   • the capture dive's `captured?` toggle forks at the stall exactly as f_2222
//     does (l_2305 connect → carry-home vs l_22E3 no-connect → retreat, gg1-3.s:595).
//
// Faithful by construction: a wrong dive here is a wrong dive in the game.

import { state } from '../state.js';
import { update as stepBugs, launchEnemyAttack } from '../tasks/bugMotion.js';
import {
  getObjectIdForSlot, loadStageParms,
  ATTACK_PATH_BOSS, BOSS_CARRYHOME_PATH, CAPTURE_ENTRY_OFFSET,
} from '../paths.js';

const PF_W = 224, PF_H = 288, SCALE = 2;
const PLAYER_Y = 265;                                 // fixed ship row (Z80 sprite_Y 297)
const MAX_DIVES = 8;                                  // backstop if no exact cycle is found
const ITER_HUES = ['#7cb6ff', '#68d391', '#f6ad55', '#fc8181', '#c792ea', '#4dd0e1'];

// Path region entries (paths.js — ATTACK_PATH_BOSS, contiguous ROM 0x40C-0x46A).
const ESCORT_ENTRY = ATTACK_PATH_BOSS.entryOffset ?? 5;   // db_flv_0411 (z80 0x411)
const ROGUE_ENTRY  = 56;                                  // db_fltv_rogefgter (z80 0x444)
// CAPTURE_ENTRY_OFFSET (=72) = db_0454 (z80 0x454).

// Boss formation rows: row 1 (y=44) holds the 4 bosses; row 0 (y=28) is the
// captured-ship parking above them. Cols 3-6 only (CLAUDE.md: boss rows fill 3-6).
const BOSS_ROW = 1, SLAVE_ROW = 0, COLS = [3, 4, 5, 6];

// Escort wingmen per boss = first 2 of the boss's column-window butterflies
// (BOSS_ESCORTS, launchAttackWave.js:359 — d_1D2C_wingmen, gg1-2_fx.s:1332). The
// squad inherits the BOSS's negate flag so it sweeps together (j_1CAE / l_1D16).
const ESCORTS = { 0x30: [0x48, 0x50], 0x34: [0x50, 0x58], 0x36: [0x58, 0x5A], 0x32: [0x5A, 0x52] };

const cv = document.getElementById('pf');
cv.width = PF_W * SCALE; cv.height = PF_H * SCALE;
const ctx = cv.getContext('2d');

// ── scenario state ──────────────────────────────────────────────────────────────
let slotRow = BOSS_ROW, slotCol = 3;                  // grid selection → object + family
let mission = 'escort';                               // boss-row sub-toggle: 'escort' | 'capture'
let captured = false, wingmen = false;                // capture fork / escort squad toggle
let playerX = 112, fa = false, ef = false;            // capture F4 aim / escort gates

let actors = [];                                      // [{ e, trail }] — actors[0] = primary
let iters = 0, frame = 0, done = false, ended = 'flying';
let sigMap = new Map(), diveNum = 1, cycleStart = null, cycleLen = null;
let stallHandled = false, stallPos = null;            // capture-dive beam/fork point
let playing = true, speed = 1, raf = 0, acc = 0, last = 0;
const TICK_MS = 1000 / 60, SPEEDS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];

const category = () => (slotRow === SLAVE_ROW ? 'rogue' : mission);
const isCapture = () => category() === 'capture';
const isEscort  = () => category() === 'escort';
const isRogue   = () => category() === 'rogue';
const primary   = () => actors[0]?.e ?? null;

// Reset the singletons to a clean, deterministic setup and launch the sortie.
function loadScenario() {
  state.formation.oscillateX = 0;                     // formation at REST → every slot fixed
  if (Array.isArray(state.formation.pulseOffsets)) state.formation.pulseOffsets.fill(0);
  state.stage = 4;                                    // a combat stage (not challenge)
  state.player.x = playerX;
  // FA (contBmbFlag) + EF (newStageParms[9]) only steer the escort loop; the
  // capture/rogue paths run with them off so the capture retreat homes cleanly.
  state.contBmbFlag = isEscort() ? fa : false;
  const parms = loadStageParms(4);
  parms[9] = (isEscort() && ef) ? 1 : 0;
  state.newStageParms = parms;
  state.bombDropFlags = 0;                            // no bombs rendered
  state.frameCount = 0;
  // transient=false clears any stale marker from a prior rogue launch (see below).
  for (const e of state.enemies) { e.state = 'pending'; e.pathBase = null; e.transient = false; }

  const bossId = getObjectIdForSlot(slotRow, slotCol);
  const negate = (bossId & 0x02) !== 0;               // formation half → mirror
  actors = [];

  // Launch the primary object on its family's entry.
  const p = state.enemies.find((e) => e.objectId === bossId);
  if (p) {
    p.state = 'formation';
    if (isRogue()) {
      launchEnemyAttack(state, bossId, ATTACK_PATH_BOSS, undefined, ROGUE_ENTRY);
      // db_fltv_rogefgter ends in FF with no FB — the rogue has no formation home,
      // so it despawns (Z80 case_0E49 → inactive), not homes. The FF handler's
      // "gone" branch is gated on this marker (bugMotion.js:237). Without it the
      // clone's defensive combat-bug fallback would wrongly home the fly-through.
      p.transient = true;
    } else if (isCapture()) launchEnemyAttack(state, bossId, ATTACK_PATH_BOSS, undefined, CAPTURE_ENTRY_OFFSET);
    else                    launchEnemyAttack(state, bossId, ATTACK_PATH_BOSS, undefined, ESCORT_ENTRY);
    actors.push({ e: p, trail: [{ x: p.x, y: p.y, iter: 0, tp: false }] });
  }

  // Escort wingmen (optional): 1-2 window butterflies flying the SAME escort path
  // from their OWN start columns, carrying the BOSS's negate. The real "sweep
  // together" spread — same shape, offset by each wingman's slot.
  if (isEscort() && wingmen) {
    for (const wid of ESCORTS[bossId] ?? []) {
      const w = state.enemies.find((e) => e.objectId === wid);
      if (!w) continue;
      w.state = 'formation';
      const ok = launchEnemyAttack(state, wid, ATTACK_PATH_BOSS, negate, ESCORT_ENTRY);
      if (ok) actors.push({ e: w, trail: [{ x: w.x, y: w.y, iter: 0, tp: false }], wing: true });
    }
  }

  iters = 0; frame = 0; done = false; ended = 'flying'; acc = 0;
  sigMap = new Map(); diveNum = 1; cycleStart = null; cycleLen = null;
  stallHandled = false; stallPos = null;
  sigMap.set(diveSig(), 1);                            // dive 1 = the launch (unique)
  buildGrid(); syncControls(); buildInfo(); render(); updateReadout();
}

// Signature of the PRIMARY's state at a dive boundary — when one repeats the
// system has re-entered a prior state and cycles forever (escort loop period).
function diveSig() {
  const p = primary();
  if (!p) return 'none';
  return `${p.pathOffset}|${Math.round(p.x)}|${Math.round(p.y)}|${p.angle}|${p.vx}|${p.vy}|${p.rotRate}|${p.segTimer}`;
}

// advance the real interpreter by one 60 Hz tick
function stepOne() {
  if (done || !actors.length) return;
  state.frameCount += 1;
  stepBugs(state);
  const p = primary();

  // ── Capture-dive stall FORK (f_2222 l_22E3/l_2305, gg1-3.s:595) ─────────────
  // The `00 FC FF` stall (vx=0) is the halt cue f_21CB waits on to open the beam.
  // With no beam task stepped here, the boss reaches it on its own; we branch at
  // that instant exactly as the source does when the beam stops:
  //   captured → load db_flv_cboss into the slot (l_2305) → carry home
  //   not      → force the segment to expire (l_22E3 b0D=1) → db_0454 retreat
  if (isCapture() && !stallHandled && p.state === 'flying' && p.vx === 0 && p.vy === 0) {
    stallHandled = true;
    stallPos = { x: p.x, y: p.y };
    if (captured) { p.pathBase = BOSS_CARRYHOME_PATH; p.pathOffset = 0; p.segTimer = 0; }
    else          { p.segTimer = 1; }
  }

  // ── PRIMARY trail + cycle/teleport detection ───────────────────────────────
  const pt = actors[0].trail;
  const prev = pt[pt.length - 1];
  const tp = (prev.y - p.y > 80) || (Math.abs(p.x - prev.x) > 60);   // F8/F9/F1 reposition
  if (tp) {
    const s = diveSig();
    if (sigMap.has(s)) {                               // this dive-start repeats → CYCLE
      cycleStart = sigMap.get(s);
      cycleLen   = (diveNum + 1) - cycleStart;
      pt.push({ x: p.x, y: p.y, iter: iters, tp: true });
      pushWings(true);
      done = true; ended = 'loop';
      return;
    }
    diveNum += 1; iters = diveNum - 1; sigMap.set(s, diveNum);
  }
  pt.push({ x: p.x, y: p.y, iter: iters, tp });
  pushWings(false);

  frame += 1;
  if (p.state === 'formation')                 { done = true; ended = 'homing'; }
  else if (p.state === 'dead' || !p.alive)     { done = true; ended = 'gone'; }
  else if (diveNum >= MAX_DIVES)               { done = true; ended = 'loop'; }
  else if (frame > 3000)                       { done = true; ended = p.state === 'flying' ? 'loop' : 'gone'; }
}

// Wingmen just accumulate trails (no cycle logic — the primary drives everything).
function pushWings() {
  for (let i = 1; i < actors.length; i++) {
    const a = actors[i], prev = a.trail[a.trail.length - 1];
    const tp = (prev.y - a.e.y > 80) || (Math.abs(a.e.x - prev.x) > 60);
    a.trail.push({ x: a.e.x, y: a.e.y, tp });
  }
}

// ── rendering ─────────────────────────────────────────────────────────────────
function render() {
  ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, cv.width, cv.height);

  // formation rows (faint); light the boss row + the captured-ship parking row.
  ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    const gy = (28 + r * 16) * SCALE;
    let stroke = 'rgba(120,120,120,0.16)';
    if (r === BOSS_ROW)  stroke = 'rgba(150,170,200,0.4)';    // bosses (divers)
    if (r === SLAVE_ROW) stroke = 'rgba(200,150,150,0.3)';    // captured-ship parking
    ctx.strokeStyle = stroke;
    ctx.beginPath(); ctx.moveTo(40 * SCALE, gy); ctx.lineTo(184 * SCALE, gy); ctx.stroke();
  }
  // mark the four boss / parking columns
  for (const c of COLS) {
    const gx = colX(c) * SCALE;
    for (const [r, col] of [[BOSS_ROW, '#7f93b4'], [SLAVE_ROW, '#b48787']]) {
      ctx.fillStyle = col;
      ctx.globalAlpha = (r === slotRow && c === slotCol) ? 0.95 : 0.35;
      const gy = (28 + r * 16) * SCALE;
      ctx.beginPath(); ctx.arc(gx, gy, 2.6, 0, 2 * Math.PI); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#444'; ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);

  // capture: player ship (the F4 aim target)
  if (isCapture()) drawShip(playerX, PLAYER_Y);

  // captured = yes: highlight the parking slot the captured ship would settle into
  if (isCapture() && captured) {
    const gx = colX(slotCol) * SCALE, gy = (28 + SLAVE_ROW * 16) * SCALE;
    ctx.strokeStyle = 'rgba(246,173,85,0.8)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
    ctx.strokeRect(gx - 10, gy - 8, 20, 16); ctx.setLineDash([]);
  }

  drawTrails();

  // stall marker (beam / capture happens here)
  if (stallPos) {
    const sx = stallPos.x * SCALE, sy = stallPos.y * SCALE;
    ctx.strokeStyle = 'rgba(246,204,95,0.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(246,204,95,0.9)'; ctx.font = '10px ui-monospace,monospace';
    ctx.fillText(captured ? 'capture' : 'beam', sx + 11, sy + 3);
  }

  // dive heads
  for (let i = 0; i < actors.length; i++) drawHead(actors[i].e, i === 0);
}

const colX = (c) => 40 + (c) * 16;                    // canvas X of formation column c

function drawTrails() {
  ctx.lineJoin = ctx.lineCap = 'round';
  // wingmen first (dim), so the primary reads on top
  for (let i = 1; i < actors.length; i++) {
    const tr = actors[i].trail;
    for (let j = 1; j < tr.length; j++) {
      const a = tr[j - 1], b = tr[j];
      if (b.tp) continue;                              // skip reposition connectors for wings
      ctx.strokeStyle = 'rgba(150,160,180,0.5)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(a.x * SCALE, a.y * SCALE); ctx.lineTo(b.x * SCALE, b.y * SCALE); ctx.stroke();
    }
  }
  // primary
  const cs = cycleStart != null ? cycleStart - 1 : null;
  const tr = actors[0].trail;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (b.tp) {                                        // reposition: dashed faint connector
      ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(150,150,150,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x * SCALE, a.y * SCALE); ctx.lineTo(b.x * SCALE, b.y * SCALE); ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (cs != null && b.iter < cs) {                   // one-time launch transient → muted grey
      ctx.globalAlpha = 0.38; ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.4;
    } else {
      const ci = cs != null ? b.iter - cs : b.iter;
      ctx.strokeStyle = ITER_HUES[ci % ITER_HUES.length];
      ctx.globalAlpha = done ? 0.92 : (b.iter === iters ? 1 : 0.4);
      ctx.lineWidth = (!done && b.iter === iters) ? 2.4 : 1.9;
    }
    ctx.beginPath(); ctx.moveTo(a.x * SCALE, a.y * SCALE); ctx.lineTo(b.x * SCALE, b.y * SCALE); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawHead(e, isPrimary) {
  const ang = e.angle * (2 * Math.PI / 1024);
  ctx.save(); ctx.translate(e.x * SCALE, e.y * SCALE); ctx.rotate(-ang);
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath();
  const c = isPrimary ? '#eaeaea' : 'rgba(180,190,205,0.7)';
  ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke();
  ctx.restore();
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
function loopBadgeText() {
  if (cycleLen == null) return `↻ loops — showing ${diveNum} dives (no exact cycle in ${MAX_DIVES})`;
  const span = cycleLen === 1 ? `dive ${cycleStart} repeats` : `dives ${cycleStart}–${cycleStart + cycleLen - 1} repeat`;
  return `↻ cycle length ${cycleLen} — ${span} forever` + (cycleStart > 1 ? ` (dive 1 = one-time launch)` : '');
}
function badge() {                                     // [class, text]
  if (!done) return ['flying', 'flying'];
  if (ended === 'loop') return ['loop', loopBadgeText()];
  if (isRogue())  return ['gone', '✕ flew the player-region pass → despawned (FF, no home)'];
  if (isCapture()) {
    if (ended === 'homing') return captured
      ? ['homing', '▣ captured → carried home on db_flv_cboss (l_2305)']
      : ['homing', '▣ beam missed → retreated home (l_22E3)'];
    return ['gone', '✕ left screen'];
  }
  // escort
  if (ended === 'homing') return ['homing', '▣ homed into formation slot (FA false)'];
  return ['gone', '✕ left screen'];
}
function buildInfo() {
  const bossId = getObjectIdForSlot(slotRow, slotCol);
  const negate = (bossId & 0x02) !== 0;
  const entry = isRogue() ? `${ROGUE_ENTRY} · db_fltv_rogefgter`
              : isCapture() ? `${CAPTURE_ENTRY_OFFSET} · db_0454`
              : `${ESCORT_ENTRY} · db_flv_0411`;
  document.getElementById('info').innerHTML =
    `<span class="k">path</span><span class="v">${category()} · offset ${entry}</span>` +
    `<span class="k">slot</span><span class="v">row ${slotRow} (${slotRow === BOSS_ROW ? 'boss' : 'captured'}), col ${slotCol} · id 0x${bossId.toString(16).toUpperCase()}</span>` +
    `<span class="k">side</span><span class="v">${negate ? 'righty (negate)' : 'lefty (no negate)'}</span>` +
    (isCapture() ? `<span class="k">player X</span><span class="v">${playerX}</span>` : '') +
    (isEscort() ? `<span class="k">FA / EF</span><span class="v">${fa ? 'loop' : 'home'} / ${ef ? 'stage 12+' : 'off'}</span>` : '') +
    (isEscort() && wingmen ? `<span class="k">wingmen</span><span class="v">${actors.length - 1} drawn</span>` : '');
  const [cls, txt] = badge();
  const b = document.getElementById('badge'); b.className = 'badge ' + cls; b.textContent = txt;
  document.getElementById('gate-note').textContent = gateNote();
}
function gateNote() {
  if (isRogue()) return 'Rogue: a captured ship gone rogue (no boss available) flies db_fltv_rogefgter — a plain descent that ends in FF (despawn), never homes. Launched from the captured-ship row.';
  if (isCapture()) return captured
    ? 'Capture + captured: at the stall the boss connects — l_2305 swaps its path to db_flv_cboss and it carries the ship home (FB → slot). The beam/pull itself is a separate subsystem, shown here as the stall marker.'
    : 'Capture, not captured: the boss dives, F4 aims at the ship, it halts at the beam stall, the beam misses — l_22E3 expires the segment and it retreats home via 23 00 30 / F8 / F9 / FA.';
  return !fa ? 'Escort, FA false → one sweep, then FB homes into the slot. Wingmen (if drawn) share the boss path + negate.'
       : ef ? 'Escort, FA true + EF → the harder stage-12+ continuous pass (F6 bombing loop).'
            : 'Escort, FA true → re-dives the same sweep forever (until killed). EF off, no escalation.';
}
function updateReadout() {
  const p = primary();
  document.getElementById('readout').textContent = !p ? '—' : done
    ? `done · ${frame}f · ${diveNum} dive${diveNum === 1 ? '' : 's'}` +
      (ended === 'loop' && cycleLen != null ? ` · cycle ${cycleLen}` : ` · ${ended}`)
    : `f${frame} · ${p.state} · dive ${diveNum} · (${p.x.toFixed(0)},${p.y.toFixed(0)})`;
}

// ── 2-row slot grid (path selector) ────────────────────────────────────────────
function buildGrid() {
  const g = document.getElementById('grid'); g.innerHTML = '';
  for (const r of [SLAVE_ROW, BOSS_ROW]) {             // captured row on top, boss row below
    for (const c of COLS) {
      const id = getObjectIdForSlot(r, c);
      const negate = (id & 0x02) !== 0;
      const cell = document.createElement('div');
      cell.className = 'cell ' + (negate ? 'right' : 'left') + (r === slotRow && c === slotCol ? ' sel' : '');
      cell.textContent = c;
      cell.title = `row ${r} col ${c} · id 0x${id.toString(16).toUpperCase()} · ${r === BOSS_ROW ? 'boss' : 'captured ship'}`;
      cell.onclick = () => { slotRow = r; slotCol = c; loadScenario(); playing = true; playBtn.textContent = '⏸ Pause'; last = 0; loop(); };
      g.appendChild(cell);
    }
  }
}

// Gray out controls that don't apply to the current path family.
function syncControls() {
  document.getElementById('missionCtl').classList.toggle('off', slotRow !== BOSS_ROW);
  document.getElementById('capturedCtl').classList.toggle('off', !isCapture());
  document.getElementById('wingmenCtl').classList.toggle('off', !isEscort());
  document.getElementById('playerCtl').classList.toggle('off', !isCapture());
  document.getElementById('gateCtl').classList.toggle('off', !isEscort());
  document.querySelectorAll('#mission label').forEach((l) => l.classList.toggle('on', l.dataset.mission === mission));
}

// ── controls ──────────────────────────────────────────────────────────────────
const playBtn = document.getElementById('play');
const relaunch = () => { loadScenario(); playing = true; playBtn.textContent = '⏸ Pause'; last = 0; loop(); };
playBtn.onclick = () => { playing = !playing; if (playing && done) return; playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; if (playing) { last = 0; loop(); } };
document.getElementById('restart').onclick = relaunch;
document.getElementById('speed').oninput = (e) => { speed = SPEEDS[+e.target.value]; document.getElementById('speedval').textContent = speed + '×'; };
document.getElementById('player').oninput = (e) => { playerX = +e.target.value; document.getElementById('playerval').textContent = playerX; };
document.getElementById('player').onchange = relaunch;
document.getElementById('captured').onchange = (e) => { captured = e.target.checked; relaunch(); };
document.getElementById('wingmen').onchange = (e) => { wingmen = e.target.checked; relaunch(); };
document.getElementById('fa').onchange = (e) => { fa = e.target.checked; relaunch(); };
document.getElementById('ef').onchange = (e) => { ef = e.target.checked; relaunch(); };
document.querySelectorAll('#mission input').forEach((inp) => {
  inp.onchange = () => { mission = inp.value; relaunch(); };
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; loop(); } });

loadScenario();
loop();

// dev hook — drive from console.
window.BP = {
  get actors() { return actors; }, get primary() { return primary(); },
  set(cfg) { if (cfg.slotRow !== undefined) slotRow = cfg.slotRow; if (cfg.slotCol !== undefined) slotCol = cfg.slotCol;
             if (cfg.mission !== undefined) mission = cfg.mission;
             if (cfg.captured !== undefined) captured = cfg.captured; if (cfg.wingmen !== undefined) wingmen = cfg.wingmen;
             if (cfg.playerX !== undefined) playerX = cfg.playerX;
             if (cfg.fa !== undefined) fa = cfg.fa; if (cfg.ef !== undefined) ef = cfg.ef;
             loadScenario(); },
  run(n) { playing = false; for (let i = 0; i < n && !done; i++) stepOne(); render(); updateReadout(); buildInfo();
           const p = primary();
           return { frame, state: p?.state, iters, ended: done ? ended : null, stall: !!stallPos,
                    pos: p ? [+p.x.toFixed(0), +p.y.toFixed(0)] : null }; },
};
