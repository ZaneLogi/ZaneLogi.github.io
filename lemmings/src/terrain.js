// lemmings/src/terrain.js
//
// The terrain bitmap IS the collision geometry (design_spec Ch 3). One boolean
// per pixel over the full world; "is there ground at (x, y)?" is a pixel read.
// Plain data — no canvas — so the simulation stays headless (§1.6). The renderer
// derives what it draws from this buffer after the fact (§3.7).

import { WORLD_W, WORLD_H } from './constants.js';

export class Terrain {
  constructor() {
    this.width = WORLD_W;
    this.height = WORLD_H;
    // 0 = empty, 1 = solid. Solidity is a separate fact from colour (§3.1).
    this.solid = new Uint8Array(WORLD_W * WORLD_H);
  }

  // §3.2 — the solidity query. Total over all integers; out of bounds is EMPTY
  // (not blocked), which is what makes the right-edge cliff work (§2.3).
  hasTerrain(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    return this.solid[y * WORLD_W + x] !== 0;
  }

  // §3.3 — clamped query: probe at max(y, minY). Used where a probe may reach
  // above the top of the world; not interchangeable with hasTerrain.
  hasTerrainClamped(x, y, minY) {
    return this.hasTerrain(x, y < minY ? minY : y);
  }

  // §3.4 — remove one pixel, unconditional; out-of-bounds writes discarded.
  removeTerrain(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
    this.solid[y * WORLD_W + x] = 0;
  }

  // Make one pixel solid — the builder's brick (§16.5) and initial construction.
  // Terrain is only ever added here or by a brick; never restored (§3.4).
  setSolid(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
    this.solid[y * WORLD_W + x] = 1;
  }

  // Construction convenience: fill a solid rectangle, clipped to the world.
  // Used to assemble synthetic terrain (the real path assembles from piece
  // masks, Ch 8 — but the buffer is a one-way funnel: it does not care how it
  // was filled, §3.6).
  fillRect(x, y, w, h) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(WORLD_W, x + w), y1 = Math.min(WORLD_H, y + h);
    for (let py = y0; py < y1; py++) {
      const row = py * WORLD_W;
      for (let px = x0; px < x1; px++) this.solid[row + px] = 1;
    }
  }
}
