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

import { state, camera, isPlaying, newGame, toIdle } from './state.js';
import { SCREEN_W, SCREEN_H, drawShapeScreen, drawText } from './render.js';
import { ROM599 } from './discovery_rom_data.js';
import { Landscape } from './landscape.js';
import { Input } from './input.js';
import { Lander } from './lander.js';

const landscape = new Landscape();
landscape.setMajorCamera(camera);   // boot/IDLE framing = the major (zoom-out) view
const majorBaseY = camera.y;        // the major vertical baseline; SCRADD offsets it in PLAY
const input = new Input();
const lander = new Lander();

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
  if (input.resetPressed()) {                  // Reset button → back to the start screen
    toIdle();
    landscape.setMajorCamera(camera);          // re-frame major; camera.x reset for a clean attract
    camera.x = 0;
  }
  if (!isPlaying()) {                          // IDLE / attract
    if (input.startPressed()) newGame(input.settings());
    landscape.update(camera, dt);             // attract auto-scroll
    return;
  }
  // PLAY: the stepper advances motion — the ship's within-window position (posX/posY) plus
  // the scape scroll (SCROLL/SCRADD) it hands off at the window edges (§9 dead-zone). The
  // lander draws at posX/posY (it roams the screen); the camera reads only the scroll, so the
  // terrain holds still until an edge is hit. Descent past the bottom lowers SCRADD → ground rises.
  lander.update(state, input.read());
  camera.x = ((state.SCROLL % landscape.loopW) + landscape.loopW) % landscape.loopW;
  camera.y = majorBaseY + state.SCRADD;
}

function render(alpha) {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

  // Terrain (behind everything) — the major (zoom-out) scape, scrolling + wrapping.
  landscape.render(ctx, camera);

  if (isPlaying()) {
    lander.render(ctx, state);                          // the flying craft (centred)
  } else {
    // IDLE / attract: the lander in the sky + the start prompt above the peaks.
    drawShapeScreen(ctx, ROM599, 'S_4B64', { cx: SCREEN_W / 2, cy: SCREEN_H * 0.34, pxScale: 6, width: 1.8 });
    drawText(ctx, 'PRESS SPACE TO START', { cx: SCREEN_W / 2, cy: SCREEN_H * 0.16, pxScale: 3.5, width: 2 });
  }
  void alpha;
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
