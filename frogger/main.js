// main.js — the pump: a fixed-timestep logic loop + an rAF render, booting into Attract (§6, §7).
import { Game } from './src/game.js';
import { TICK } from './src/constants.js';

const canvas = document.getElementById('screen');
const game = new Game(canvas);
window.game = game;               // debug hook — inspect/poke state from the console
const STEP = 1000 / TICK.HZ;

game.ready().then(() => {
  game.render();                         // paint one frame at load (§ preview: render at boot)
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 250);    // clamp so a stall can't spiral the accumulator
    last = now;
    while (acc >= STEP) { game.tick(); acc -= STEP; }
    game.render();
    requestAnimationFrame(frame);        // unkillable loop
  }
  requestAnimationFrame(frame);
});
