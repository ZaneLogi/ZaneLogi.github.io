// lemmings/src/level_easy.js
//
// The playable front-door level for index.html — a hand-authored *synthetic* level
// (like synthetic_level.js) written straight into the terrain buffer (Ch 3) and
// object map (Ch 4), bypassing the not-yet-built asset pipeline (Ch 7–8). Real
// levels arrive later through the Ch 6 importer; this is the placeholder level
// *source*, swapped out behind the same page once that lands.
//
// Design intent (deliberate, not a reproduction): an EASY level completable with NO
// skills — a lemming dropped from the entrance walks the whole way to the exit over
// gentle bumps. Every terrain rise is built from ≤2px stairs, well under the §15.1
// wall threshold (7px turns a walker), so the walker steps over each bump instead of
// turning; there are no hazards. The player is still given a full budget of all eight
// skills to experiment with, though none is needed — a chosen demo affordance.
//
// Layout across the world (base floor top at y=145):
//   entrance (safe ~43px drop) → flat start → bump A (12px) → flat →
//   bump B (24px) → flat → bump C (8px) → flat run-up → exit.

import { Terrain } from './terrain.js';
import { ObjectMap, EFFECT } from './object_map.js';
import { WORLD_W, WORLD_H } from './constants.js';

const FLOOR = 145;   // base ground top (world y); ground runs down to the world bottom

/**
 * Build one gentle, always-walkable hill on top of the base ground: ascend from the
 * floor to `crestY` in 2px stairs (a §15.1 "step up", never a turn or even a hop), a
 * flat crest, then a mirrored descent. Each stair is a solid column down to the world
 * bottom, so its TOP is the walkable surface.
 * @param {Terrain} terrain
 * @param {number} xStart left edge
 * @param {number} crestY the crest's surface y (smaller = taller); (FLOOR − crestY) even
 * @param {number} stepW width of each stair
 * @param {number} plateauW width of the flat crest
 * @returns {number} the x just past the hill's right edge
 */
function hill(terrain, xStart, crestY, stepW, plateauW) {
  const n = (FLOOR - crestY) / 2;           // number of 2px stairs each side
  let x = xStart;
  for (let i = 1; i <= n; i++) { const y = FLOOR - i * 2; terrain.fillRect(x, y, stepW, WORLD_H - y); x += stepW; }
  terrain.fillRect(x, crestY, plateauW, WORLD_H - crestY); x += plateauW;   // flat crest
  for (let i = n - 1; i >= 0; i--) { const y = FLOOR - i * 2; terrain.fillRect(x, y, stepW, WORLD_H - y); x += stepW; }
  return x;
}

/**
 * The easy front-door level (§1.4 — geometry is behaviour; this is authored content).
 * @returns {{terrain: Terrain, objectMap: ObjectMap, entrance: {x:number,y:number},
 *            exit: {x:number,y:number}, params: object}}
 */
export function buildEasyLevel() {
  const terrain = new Terrain();
  const objectMap = new ObjectMap();

  // Continuous base ground across the whole world — no pits or gaps, so a lemming
  // always has ground under its feet (this is what makes the level un-loseable).
  terrain.fillRect(0, FLOOR, WORLD_W, WORLD_H - FLOOR);

  // Three gentle bumps (2px stairs ⇒ smooth walk-over, no turnaround at §15.1's 7px).
  hill(terrain, 300, 133, 12, 30);    // bump A — 12px, crest y133
  hill(terrain, 620, 121, 14, 40);    // bump B — 24px, crest y121 (a longer, gentler ramp)
  hill(terrain, 1180, 137, 12, 24);   // bump C — 8px mound before the exit

  // The exit sits on the flat right-hand ground. Its EXIT trigger must STRADDLE the
  // foot line (y=FLOOR): the foot probe (§4.4) samples the object map at (x, y), so a
  // trigger only *above* the surface is missed. 24×14 rect centred on y=145.
  const exitX = 1470;
  objectMap.paintRect(exitX - 12, FLOOR - 6, 24, 14, EFFECT.EXIT);   // 139..153, straddles 145

  // The entrance is a spawn point (Ch 13/17), not an object-map cell. §13.5 releases a
  // faller at (x+24, y+14): (124, 102) → drops ~43px to y145, well under the 60px splat
  // threshold (§15.3), so every lemming lands and walks.
  const entrance = { x: 100, y: 88 };
  const exit = { x: exitX, y: FLOOR };

  // Level parameters (Ch 5). An easy target (save 10 of 20 = 50%) that the walk-through
  // meets trivially; a generous 5-minute clock; and a full budget of every skill so the
  // player can experiment freely though none is required.
  const params = {
    releaseRate: 50, lemmingsCount: 20, rescueCount: 10, timeLimit: 5,
    climberCount: 10, floaterCount: 10, bomberCount: 10, blockerCount: 10,
    builderCount: 10, basherCount: 10, minerCount: 10, diggerCount: 10,
    screenPosition: 0,
  };

  return { terrain, objectMap, entrance, exit, params };
}
