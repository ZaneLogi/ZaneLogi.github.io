// lunar_lander/main.js
//
// Boot + the fixed-timestep game loop (CLAUDE.md "Planned gameplay module
// layout" → main.js). Fixed physics ticks with an accumulator + render
// interpolation — the mario_physics pattern — so visuals stay smooth regardless
// of display refresh. update() advances shared `state` at a constant rate;
// render(alpha) draws it. Subsystems (landscape, lander, input, display_info,
// starfield, state machine) hook into update()/render() as they land.
//
// Per-frame order mirrors the source main loop: motion (ACCEL et al, the stepper)
// → clock → camera framing → DECODE/SCAPLND verdict (collision.js) → outcome or
// zoom (SCAPCHG). The LAND/CRASH mode (GAMODE $80) runs the MOTCHK sequence
// instead: INDEX clock + hard bounce + the BOOM debris / status messages.

import { state, camera, isPlaying, isOutcome, newGame, toIdle, tickClock,
         beginOutcome, finishOutcome, CollisionStatus } from './state.js';
import { SCREEN_W, SCREEN_H, drawShapeScreen, drawSegmentsScreen, drawText } from './render.js';
import { ROM599 } from './discovery_rom_data.js';
import { Landscape } from './landscape.js';
import { Input } from './input.js';
import { Lander } from './lander.js';
import { DisplayInfo } from './display_info.js';
import { Collision } from './collision.js';
import { boomSegs, BOOM_MAX_INDEX } from './boom.js';
import { POS_SCALE } from './physics_arcade.js';

const landscape = new Landscape();
landscape.setMajorCamera(camera);   // boot/IDLE framing = the major (zoom-out) view
const input = new Input();
const lander = new Lander();
const displayInfo = new DisplayInfo();
const collision = new Collision();

// Dev/verification hook: poke at the live modules from the console / preview eval.
window.LL = { state, camera, landscape, collision, lander };

const ctx = document.getElementById('game').getContext('2d');

// Fixed timestep = ONE source frame: FRMECNT(6) NMIs × 4 ms = 24 ms
// (SECCNT=250 NMIs/s ⇒ 6/250 s). Keeping 1 tick == 1 source frame lets the ROM's
// per-frame constants AND its frame counters (FRICTN every 16, INDEX every other,
// the TIME display) port 1:1 with no rate conversion (research_physics.md §1 +
// "Port fidelity"). Render interpolation (alpha) decouples this ~41.7 Hz sim from
// the display refresh.
const TICK = 6 / 250;   // 0.024 s (24 ms)
let acc = 0, last = 0;
let paused = false;     // MAME-style pause toggle (P); freezes update(), render still draws

// --- the LAND/CRASH outcome sequence (MOTCHK :514-529) ------------------------
const BOUNCE_GRAVITY = 65;   // M.HRDG (:579-580) — the heavier gravity pulling the hard-landing bounce back down
let outFrame = 0;         // FRAME-parity clock: INDEX steps every OTHER tick (:522-524)
let bounceDone = false;   // hard bounce settled (MOTCHK's "impact → skip motion" latch)

function idleFraming() {
  landscape.setMajorCamera(camera);            // re-frame major; camera.x reset for a clean attract
  camera.x = 0;
}

function outcomeTick() {
  // Hard-landing bounce: integrate under M.HRDG until the falling craft re-contacts
  // (MOTCHK :514-521 — wait for -VELY, then the collision status stops the motion).
  // Good + crash outcomes skip this — the craft/debris sit still.
  if (state.outcomeStatus === CollisionStatus.HARD_LAND && !bounceDone) {
    state.velY -= BOUNCE_GRAVITY;
    state.posY += state.velY * POS_SCALE * 4;                    // minor ×4 position step
    landscape.frameCamera(state, camera);
    collision.update(state, camera, landscape);                  // the DECODE re-contact probe
    if (state.velY < 0 && state.collisionStatus !== CollisionStatus.SAFE_FLY) {
      bounceDone = true;
      state.velY = 0;                                            // impact → motion stops
      state.collisionStatus = CollisionStatus.SAFE_FLY;
    }
  }
  if ((++outFrame & 1) === 0) {                                  // FRAME even → step the sequence
    state.sequenceStep++;
    if (state.sequenceStep > BOOM_MAX_INDEX) {                   // sequence over (INDEX past 127)
      finishOutcome();                                           // next mission, or idle when dry
      outFrame = 0;
      if (!isPlaying()) idleFraming();
    }
  }
}

function update(dt) {
  state.frame++;                               // FRAME — free-running per-tick counter (source INC FRAME :443)
  if (input.resetPressed()) {                  // Reset button → back to the start screen
    toIdle();
    idleFraming();
  }
  if (isOutcome()) {                           // LAND/CRASH mode — the sequence owns the tick
    outcomeTick();
    return;
  }
  if (!isPlaying()) {                          // IDLE / attract
    if (input.startPressed()) newGame(input.settings());
    landscape.update(camera, dt);             // attract auto-scroll
    return;
  }
  // PLAY: the stepper advances motion — the ship's within-window position (posX/posY) plus the
  // scape scroll (SCROLL/SCRADD) it hands off at the window edges (§9 dead-zone). Then landscape
  // frames the camera, collision measures the corner clearances and runs the SCAPLND verdict
  // (the source order ACCEL → DECODE :484 → SCAPCHG :485); a verdict enters the outcome mode,
  // otherwise the zoom transition runs on the measured SCPDST (§9.1).
  lander.update(state, input.read());
  tickClock();                                // advance the game clock (PLAY only; source NMI :360)
  if (state.fuelLostTimer > 0) state.fuelLostTimer--;   // MSCNT1 countdown for the fuel-lost message (STATUS :1607)
  landscape.frameCamera(state, camera);
  collision.update(state, camera, landscape); // clearances + the verdict (research_physics.md §11)
  if (state.collisionStatus !== CollisionStatus.SAFE_FLY) {  // touched down or crashed (PLYCHK BMI :531-532)
    beginOutcome(state.collisionStatus);
    outFrame = 0; bounceDone = false;
    return;
  }
  landscape.updateZoom(state, camera, collision.clearance);  // may flip the scape + re-frame
}

function render(alpha) {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

  // Terrain (behind everything) — the major (zoom-out) scape, scrolling + wrapping.
  landscape.render(ctx, camera);

  if (isOutcome()) {
    // LAND/CRASH: the settled/bouncing craft — or the BOOM debris field on a crash —
    // plus the HUD (ALTITD reads 0, :562-563) and the outcome status messages.
    if (state.outcomeStatus === CollisionStatus.CRASH) {
      drawSegmentsScreen(ctx, boomSegs(state.explosionPattern, Math.max(1, state.sequenceStep)),
                         { cx: state.posX, cy: SCREEN_H - state.posY, pxScale: 1, width: 1.7 });
    } else {
      lander.render(ctx, state);
    }
    displayInfo.render(ctx, state, 0);
    displayInfo.renderOutcome(ctx, state);
  } else if (isPlaying()) {
    lander.render(ctx, state);                          // the flying craft
    displayInfo.render(ctx, state, collision.clearance);   // HUD: labels + values + arrows
  } else {
    // IDLE / attract: the lander in the sky + the start prompt above the peaks.
    drawShapeScreen(ctx, ROM599, 'S_4B64', { cx: SCREEN_W / 2, cy: SCREEN_H * 0.34, pxScale: 6, width: 1.8 });
    drawText(ctx, 'PRESS SPACE TO START', { cx: SCREEN_W / 2, cy: SCREEN_H * 0.16, pxScale: 3.5, width: 2 });
  }
  if (paused) drawText(ctx, 'PAUSED', { cx: SCREEN_W / 2, cy: SCREEN_H / 2, pxScale: 6, width: 2.5 });
  void alpha;
}

function frame(ts) {
  if (!last) last = ts;
  let elapsed = (ts - last) / 1000; last = ts;
  if (elapsed > 0.25) elapsed = 0.25;         // clamp after a tab-hide stall
  if (input.pausePressed()) paused = !paused; // MAME-style: P freezes the sim, P again resumes
  if (paused) {
    acc = 0;                                   // freeze: no ticks, no time carried over resume
  } else {
    acc += elapsed;
    while (acc >= TICK) { update(TICK); acc -= TICK; }
  }
  render(acc / TICK);                           // render always (frozen frame + PAUSED overlay)
  requestAnimationFrame(frame);
}
render(0);                  // paint the initial IDLE screen immediately, so it shows even
                           // before the first animation frame (rAF is paused in hidden tabs)
requestAnimationFrame(frame);
