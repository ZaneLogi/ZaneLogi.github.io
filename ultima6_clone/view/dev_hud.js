// Dev/cheat HUD installer — extracted from main.js's startRender() (I-7a).
// Owns: the clock text line, the pause/±10m/±1h controls, the I-5f
// schedule-stats line, and the rewind helper. Permanent dev affordance
// per CLAUDE.md §"Modern-browser UX"; hide-vs-toggle revisited when the
// real status panel ports (seg_0A33.c:933-936).
//
// +1h matches source's debug hotkey Alt+215 (C_0A33_1355(60)).

import { TurnClock } from '../ecs/world.js';
import { WorldClock } from '../resources/world_clock.js';

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

export function installDevHud(world, { hudEl, textEl, controlsEl, npcStatsEl, npcScheduleStats }) {
  const pauseBtn = controlsEl.querySelector('[data-act="pause"]');
  hudEl.style.display = 'block';
  const clock = world.getResource(WorldClock);
  const tc = world.getResource(TurnClock);
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

  // I-5f (A): schedule-stats line. Reads npcScheduleStats live each frame;
  // stats are mutated in place by I-5e on every hour-tick, so the line
  // shows the most recent tick's counts.
  world.addRenderSystem(() => {
    const s = npcScheduleStats;
    if (!s || s.lastHour === null) return;     // pre-first-tick: leave placeholder text
    npcStatsEl.textContent =
      `schedule @ hour ${pad2(s.lastHour)}: ` +
      `snap ${s.snapped} / block ${s.blocked} / idle ${s.noTrigger} / inactive ${s.inactive}`;
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
