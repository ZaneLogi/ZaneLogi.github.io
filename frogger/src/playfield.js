// playfield.js — owns the ten Lanes + the Homes; builds them for the current level from
// constants.js, advances the lanes each tick, and is the surface Collision/Play query (§6).
import { Lane } from './lane.js';
import { Homes } from './homes.js';
import { LANES, ROWS, SCREEN, DEBUG } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Playfield {
  constructor() { this.lanes = []; this.homes = new Homes(); }

  build(level) {
    this.lanes = LANES.map((cfg, i) => new Lane(cfg, level, i));   // TODO(step 8): §3.3 level schedule
    this.homes.reset();
  }

  // §7 step 4: advance every lane's movers, and walk the home-bay item on its timer (§3.4).
  /** @param {number} frame  the global tick counter */
  update(frame = 0) {
    for (const lane of this.lanes) lane.advance();
    this.homes.update(frame);
  }

  /** @param {Renderer} renderer @param {number} frame  the global tick counter (§3.5 animation) */
  render(renderer, frame = 0) {
    // Static 16 px safe strips (§3.1): the median and the start row tile bg_block (16×16).
    // River/road bands stay the cleared black (water / asphalt).
    for (let x = 0; x < SCREEN.WIDTH; x += SCREEN.CELL) {
      renderer.drawSprite('bg_block', x, ROWS.MEDIAN_Y);
      renderer.drawSprite('bg_block', x, ROWS.START_Y);
    }
    if (DEBUG.ROW_GRID) this._grid(renderer);
    // Each lane's movers at its row y (river 48… · median 128 · road 144…, §4 band layout).
    this.lanes.forEach((lane, i) => lane.render(renderer, ROWS.FIRST_LANE_Y + i * SCREEN.CELL, frame));
    this.homes.render(renderer);
  }

  // Dev aid (§ DEBUG): a faint line at every lane boundary (a uniform 16 px grid) so the rows
  // read before the movers fill them.
  _grid(renderer) {
    for (let y = ROWS.FIRST_LANE_Y; y <= ROWS.START_Y + SCREEN.CELL; y += SCREEN.CELL) {
      renderer.fillRect(0, y, SCREEN.WIDTH, 1, 'rgba(255,255,255,0.12)');
    }
  }
}
