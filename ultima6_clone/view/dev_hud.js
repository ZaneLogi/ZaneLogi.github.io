// Dev/cheat HUD installer — extracted from main.js's startRender() (I-7a).
// Owns: the clock text line, the pause/±10m/±1h controls, the I-5f
// schedule-stats line, and the rewind helper. Permanent dev affordance
// per CLAUDE.md §"Modern-browser UX"; hide-vs-toggle revisited when the
// real status panel ports (seg_0A33.c:933-936).
//
// +1h matches source's debug hotkey Alt+215 (C_0A33_1355(60)).

import { TurnClock } from '../ecs/world.js';
import { WorldClock } from '../resources/world_clock.js';
import { WorldSpeed } from '../resources/world_speed.js';

// I-14d WORLD_SPEED slider mapping. The track is log-scaled so the default (×1) sits near
// the middle and both calm and bustling paces are reachable; position 0 is a hard FROZEN
// stop (rate 0). v in 0..100.
const WS_MIN = 0.1, WS_MAX = 8;
function sliderToWS(v) { return v <= 0 ? 0 : WS_MIN * Math.pow(WS_MAX / WS_MIN, (v - 1) / 99); }
function wsLabel(ws) { return ws <= 0 ? 'frozen' : `×${ws < 1 ? ws.toFixed(2) : ws.toFixed(1)}`; }

const pad2 = (n) => String(n).padStart(2, '0');

// Inverse cascade for the −10m/−1h buttons. Forward `advance()` is the
// contract (fires onHour hooks, source-faithful); rewind is a local debug
// aid only — no hooks fire and the hour-fires counter doesn't decrement.
function rewind(c, minutes) {
  let m = c.Time_M - minutes;
  while (m < 0) {
    m += 60;
    c.Time_H--;
    if (c.Time_H < 0) {
      c.Time_H = 23;
      c.Date_D--;
      if (c.Date_D < 1) {
        c.Date_D = 28;
        c.Date_M--;
        if (c.Date_M < 1) { c.Date_M = 12; c.Date_Y--; }
      }
    }
  }
  c.Time_M = m;
  c.recomputeD_2C55();
}

export function installDevHud(world, { hudEl, textEl, controlsEl, npcStatsEl, speedEl, speedLabelEl, npcScheduleStats, npcTickStats }) {
  const pauseBtn = controlsEl.querySelector('[data-act="pause"]');
  hudEl.style.display = 'block';
  const clock = world.getResource(WorldClock);
  const tc = world.getResource(TurnClock);

  // I-14d: WORLD_SPEED master slider — scales NPC movement rate + the decoupled clock.
  const ws = world.getResource(WorldSpeed);
  if (speedEl && ws) {
    const apply = () => {
      ws.value = sliderToWS(+speedEl.value);
      if (speedLabelEl) speedLabelEl.textContent = wsLabel(ws.value);
    };
    apply();                          // sync resource + label to the slider's initial position (×1)
    speedEl.addEventListener('input', apply);
  }
  let hourFires = 0;
  clock.onHour(() => hourFires++);

  world.addRenderSystem(() => {
    textEl.textContent =
      `Year ${clock.Date_Y} · M${pad2(clock.Date_M)} D${pad2(clock.Date_D)}` +
      ` · ${pad2(clock.Time_H)}:${pad2(clock.Time_M)}` +
      ` · ☀ ${clock.D_2C55} · hours fired ${hourFires}`;
    // Visual pause indicator follows suspendCount, not just the manual
    // pause button — so I-7 modal-stack suspends (or any other future
    // suspender) tint the HUD too.
    hudEl.classList.toggle('paused', tc.suspendCount > 0);
  });

  // I-5f (A) + I-9d/h: NPC stats — kept to a few narrow lines (the HUD lives in a
  // screen corner) instead of one wide row. Three lines:
  //   schedule, per hour-tick: NPCs sent to AI_FINDPATH / already on slot / reclaimed,
  //     then the "didn't move" counts (no slot this hour / region not loaded).
  //   tick, live per sim-turn: walking / finding / teleported / snapped / blocked.
  // `#npc-stats` is white-space:pre so the \n breaks render. Both stat objects are
  // mutated in place by their systems, so the lines are live.
  world.addRenderSystem(() => {
    const s = npcScheduleStats, t = npcTickStats;
    const lines = [];
    if (s && s.lastHour !== null) {
      lines.push(`sched @${pad2(s.lastHour)}: findpath ${s.triggered} · atSlot ${s.alreadyAtTarget} · reclaim ${s.reclaimed}`);
      lines.push(`  · idle ${s.noTrigger} · inactive ${s.inactive}`);
    }
    if (t)
      lines.push(`tick: walk ${t.walking} · find ${t.finding} · tp ${t.teleported} · snap ${t.snapped} · blk ${t.blocked}`);
    if (lines.length) npcStatsEl.textContent = lines.join('\n');
  });

  let paused = false;
  controlsEl.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    if (act === 'pause') {
      paused = !paused;
      // .paused class is owned by the render-system above (reads suspendCount);
      // the button only adjusts the count + label.
      if (paused) { tc.suspend(); pauseBtn.textContent = '▶ resume'; }
      else        { tc.resume();  pauseBtn.textContent = '⏸ pause'; }
    } else if (act === 'p10') clock.advance(10);
    else if (act === 'p60') clock.advance(60);
    else if (act === 'm10') rewind(clock, 10);
    else if (act === 'm60') rewind(clock, 60);
  });
}
