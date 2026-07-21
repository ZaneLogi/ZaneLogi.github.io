// game.js — session state (score, lives, level, the frame counter §3.4/§3.5 read) + the
// subsystems + the mode machine (§6). main pumps tick()/render(); Flow decides transitions.
import { Renderer } from './renderer.js';
import { Sprites } from './sprites.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Frog } from './frog.js';
import { Playfield } from './playfield.js';
import { Collision } from './collision.js';
import { Timer } from './timer.js';
import { Score } from './score.js';
import { Hud } from './hud.js';
import { Flow } from './flow.js';
import { SCORE } from './constants.js';

/** @typedef {import('./mode.js').Mode} Mode */

export class Game {
  constructor(canvas) {
    // services
    this.sprites = new Sprites();
    this.renderer = new Renderer(canvas, this.sprites);
    this.input = new Input();
    this.audio = new Audio();
    // session state
    this.score = new Score();
    this.hiScore = 0;
    this.lives = SCORE.START_LIVES;
    this.level = 1;
    this.frame = 0;                 // free-running frame counter (§3.4/§3.5)
    // gameplay subsystems
    this.frog = new Frog();
    this.playfield = new Playfield();
    this.collision = new Collision();
    this.timer = new Timer();
    this.hud = new Hud();
    // mode machine
    this.flow = new Flow(this);
    /** @type {Mode|null} */
    this.mode = null;
    this.flow.start();              // → Attract
  }

  ready() { return this.sprites.ready; }

  /** @param {Mode} mode */
  setMode(mode) {
    if (this.mode) this.mode.exit();
    this.mode = mode;
    this.mode.enter();
  }

  // One fixed-timestep logic tick (§7): input → mode.update → life grant → audio.
  tick() {
    this.frame++;
    this.input.beginFrame();
    if (this.mode) this.mode.update();
    if (this.score.grantedLife) { this.lives++; this.score.grantedLife = false; }
    this.audio.tick();              // §7 step 6
  }

  render() {
    this.renderer.clear();
    if (this.mode) this.mode.render();
  }
}
