// lemmings/src/synthetic_level.js
//
// A hand-authored *synthetic* level — the terrain buffer (Ch 3) and object map
// (Ch 4) written directly, bypassing the original asset pipeline (Ch 7–8). It is
// not a reproduction of any original level; it is a valid simulation input built
// to exercise the physics (walk / fall / dig / bash / build) and to view the two
// substrate buffers. Real levels arrive later through the Ch 6 importer.
//
// Layout across the 1584-wide world (floor top at y=150):
//   entrance → flat start → water pit → steps → bash wall → steel block →
//   one-way wall → fire patch → exit pedestal.

import { Terrain } from './terrain.js';
import { ObjectMap, EFFECT } from './object_map.js';
import { WORLD_W, WORLD_H } from './constants.js';

export function buildSyntheticLevel() {
  const terrain = new Terrain();
  const objectMap = new ObjectMap();

  const FLOOR = 150;                 // top of the ground
  const D = WORLD_H - FLOOR;         // floor thickness to the world bottom

  // --- ground, with a pit gap at 340..430 ---
  terrain.fillRect(0, FLOOR, 340, D);            // start ground
  terrain.fillRect(430, FLOOR, WORLD_W - 430, D); // ground from the pit onward
  terrain.fillRect(340, 157, 90, 3);              // thin basin floor under the pit

  // water in the pit (a lemming that walks in drowns)
  objectMap.paintRect(346, FLOOR, 78, D, EFFECT.WATER);

  // --- ascending steps (walkable) at ~520 ---
  terrain.fillRect(520, 144, 60, FLOOR - 144);
  terrain.fillRect(556, 138, 44, FLOOR - 138);
  terrain.fillRect(588, 132, 30, FLOOR - 132);

  // --- a tall wall to bash / climb at ~700 ---
  terrain.fillRect(700, 100, 14, FLOOR - 100);

  // --- an indestructible steel block at ~870 ---
  terrain.fillRect(870, 132, 44, FLOOR - 132);
  objectMap.paintRect(870, 132, 44, FLOOR - 132, EFFECT.STEEL);

  // --- a one-way wall (tunnel rightward only) at ~1050 ---
  terrain.fillRect(1050, 112, 12, FLOOR - 112);
  objectMap.paintRect(1050, 112, 12, FLOOR - 112, EFFECT.ONE_WAY_RIGHT);

  // --- a fire hazard on the floor at ~1200 (trigger only, no terrain) ---
  objectMap.paintRect(1200, 142, 56, 8, EFFECT.FIRE);

  // --- the exit: a pedestal with an EXIT trigger on top at ~1440 ---
  terrain.fillRect(1440, 136, 64, WORLD_H - 136);
  objectMap.paintRect(1454, 124, 44, 14, EFFECT.EXIT);

  // Entrances are not in the object map — they are spawn points (Ch 13/17).
  const entrance = { x: 48, y: 24 };
  const exit = { x: 1476, y: 138 };

  // Level parameters (Ch 5) — placeholder demo values.
  const params = {
    releaseRate: 50, lemmingsCount: 20, rescueCount: 10, timeLimit: 5,
    climberCount: 5, floaterCount: 5, bomberCount: 5, blockerCount: 5,
    builderCount: 10, basherCount: 10, minerCount: 10, diggerCount: 10,
    screenPosition: 0,
  };

  return { terrain, objectMap, entrance, exit, params };
}
