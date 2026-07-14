// main.js — boot
//
// Creates the Game, kicks off a requestAnimationFrame loop calling game.tick()
// once per frame (the re-derived NES frame cadence). All subsystems are stubs
// right now, so the loop runs harmlessly and paints a blank field.
// See docs/research_system_interaction_map.md.

import { Game } from './game.js';

const canvas = document.getElementById('screen');
const game = new Game(canvas);
game.boot();

function frame() {
  game.tick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
