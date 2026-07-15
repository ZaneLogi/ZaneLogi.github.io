import { Actor } from './actor.js';
import { Animator } from './animator.js';
import { ACTOR_TYPES } from './actor_types.js';
import { LevelMap } from './level_map.js';
import { World } from './world.js';
import { Camera } from './camera.js';
import { res_loader } from '../mario/resource.js';

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ----------------------
// Basic constants
// ----------------------
const TILE_SIZE = 32;

// ----------------------
// Level tiles: 0 empty · 1 ground · 2 platform · 3 ? block · 4 brick
// ----------------------
const level = [
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,2,2,0,2,2,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,4,3,3,3,4,0,4,4,4,4,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];

const levelMap = new LevelMap(level, TILE_SIZE);
const world = new World(levelMap);
const camera = new Camera(canvas.width, canvas.height);

// ----------------------
// Player object
// ----------------------
const player = new Actor(ACTOR_TYPES.mario, 64, 0);
const playerAnimator = new Animator(ACTOR_TYPES.mario.sprites);

world.addActor(player, playerAnimator);

// A Goomba, dropped in above the blocks. It gets no input — its type names a
// computed controller — so it walks left on its own and cascades down the
// stepped platforms: it catches the brick row on the way in, then steps off each
// ledge in turn (rows 11 → 12 → 13) down to the floor, and turns at the wall.
// Nothing tells it about a ledge: it simply stops being supported, which is
// gravity's job. Note it drifts left *while* falling — horizontal speed is
// unaffected by being airborne, so each fall is a little arc.
const goomba = new Actor(ACTOR_TYPES.goomba, 400, 0);
goomba.facing = -1; // start it walking left, into the steps
world.addActor(goomba, new Animator(ACTOR_TYPES.goomba.sprites));

// ----------------------
// Input handling
// ----------------------
let keys = {};
document.addEventListener("keydown", e => keys[e.code] = true);
document.addEventListener("keyup", e => keys[e.code] = false);

// ----------------------
// Game update
// ----------------------
let lastTime = 0;
let accumulator = 0;
let paused = false;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    paused = true;
  } else {
    paused = false;
    lastTime = performance.now(); // reset timing so dt doesn't explode
    requestAnimationFrame(runloop);
  }
});

// Fixed physics step (in seconds)
const FIXED_DT = 1 / 60; // 60 updates per second

function runloop() {
  if (paused) return; // stop updating when tab is hidden

  const now = performance.now()

  // Convert ms → seconds
  let frameTime = (now - lastTime) / 1000;
  if (frameTime > 0.25) frameTime = 0.25; // avoid spiral of death
  lastTime = now;

  accumulator += frameTime;

  // Run physics multiple times if needed
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);  // update physics with fixed dt
    accumulator -= FIXED_DT;
  }

  // interpolation factor (0..1)
  const alpha = accumulator / FIXED_DT;

  draw(alpha); // pass alpha to renderer

  requestAnimationFrame(runloop);
}

function update(dt) {
  // The player's intent source: written onto the actor, so only actors whose
  // type names the `keyboard` controller ever see it.
  player.input = {
    run: keys["ShiftLeft"] || keys["KeyZ"], // hold Shift or Z to run
    left: keys["ArrowLeft"],
    right: keys["ArrowRight"],
    jump: keys["Space"]
  };

  world.update(dt);
  camera.follow(player, levelMap);
}

function draw(alpha) {
  world.draw(ctx, camera);
}

res_loader.start(
  () => { lastTime = performance.now(); runloop();},
  "../mario/");