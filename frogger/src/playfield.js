// playfield.js — owns the ten Lanes + the Homes; builds them for the current level from
// constants.js, advances the lanes each tick, and is the surface Collision/Play query (§6).
import { Lane } from './lane.js';
import { Homes } from './homes.js';
import { LANES, ROWS, SCREEN, DEBUG } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Playfield {
  constructor() { this.lanes = []; this.homes = new Homes(); }

  build(level) {
    this.lanes = LANES.map((cfg) => new Lane(cfg, level));   // TODO(impl): apply the §3.3 schedule
    this.homes.reset();
  }

  update() { for (const lane of this.lanes) lane.advance(); }   // TODO(impl): + §3.4 timed events

  /** @param {Renderer} renderer */
  render(renderer) {
    // Static 16 px safe strips (§3.1): the median and the start row tile bg_block (16×16).
    // River/road bands stay the cleared black (water / asphalt).
    for (let x = 0; x < SCREEN.WIDTH; x += SCREEN.CELL) {
      renderer.drawSprite('bg_block', x, ROWS.MEDIAN_Y);
      renderer.drawSprite('bg_block', x, ROWS.START_Y);
    }
    if (DEBUG.ROW_GRID) this._grid(renderer);
    // TODO(step 2): draw each lane's movers at its row y, between the strips and the homes.
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
