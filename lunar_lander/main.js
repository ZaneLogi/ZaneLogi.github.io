// lunar_lander/main.js
//
// Boot + the fixed-timestep game loop (CLAUDE.md "Planned gameplay module
// layout" → main.js). Fixed physics ticks with an accumulator + render
// interpolation — the mario_physics pattern — so visuals stay smooth regardless
// of display refresh. update() advances shared `state` at a constant rate;
// render(alpha) draws it. Subsystems (landscape, lander, input, display_info,
// starfield, state machine) hook into update()/render() as they land.
//
// STEP 0: loop + render seam only. The render draws one shape (the upright
// lander pose) through the render layer to prove main → render.js → dvg.js →
// *_rom_data.js is wired end-to-end. Later steps replace this test draw.

import { state, camera } from './state.js';
import { SCREEN_W, SCREEN_H, drawShapeScreen, drawText } from './render.js';
import { ROM599 } from './discovery_rom_data.js';

const ctx = document.getElementById('game').getContext('2d');

// Fixed timestep = ONE source frame: FRMECNT(6) NMIs × 4 ms = 24 ms
// (SECCNT=250 NMIs/s ⇒ 6/250 s). Keeping 1 tick == 1 source frame lets the ROM's
// per-frame constants AND its frame counters (FRICTN every 16, INDEX every other,
// the TIME display) port 1:1 with no rate conversion (research_physics.md §1 +
// "Port fidelity"). Render interpolation (alpha) decouples this ~41.7 Hz sim from
// the display refresh.
const TICK = 6 / 250;   // 0.024 s (24 ms)
let acc = 0, last = 0;

function update(dt) {
  // step 0: no subsystems yet. lander / landscape / input / state hook in here.
  void dt;
}

function render(alpha) {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

  // IDLE / attract screen (GAMODE 0). Step 1 draws the terrain here; step 2 wires
  // SPACE → GAMODE=$40 (PLAY), which starts the sim and hides the prompt. For now
  // GAMODE stays 0, so this is exactly what the start screen looks like.
  drawShapeScreen(ctx, ROM599, 'S_4B64', { cx: SCREEN_W / 2, cy: SCREEN_H * 0.44, pxScale: 7, width: 1.8 });
  if ((state.GAMODE & 0x40) === 0) {                    // not PLAYING → show the start prompt
    drawText(ctx, 'PRESS SPACE TO START', { cx: SCREEN_W / 2, cy: SCREEN_H * 0.72, pxScale: 4, width: 2 });
  }
  void alpha; void camera;
}

function frame(ts) {
  if (!last) last = ts;
  let elapsed = (ts - last) / 1000; last = ts;
  if (elapsed > 0.25) elapsed = 0.25;         // clamp after a tab-hide stall
  acc += elapsed;
  while (acc >= TICK) { update(TICK); acc -= TICK; }
  render(acc / TICK);
  requestAnimationFrame(frame);
}
render(0);                  // paint the initial IDLE screen immediately, so it shows even
                           // before the first animation frame (rAF is paused in hidden tabs)
requestAnimationFrame(frame);
