// playfield.js — owns the ten Lanes + the Homes; builds them for the current level from
// constants.js, advances the lanes each tick, and is the surface Collision/Play query (§6).
import { Lane } from './lane.js';
import { Homes } from './homes.js';
import { LadyFrog } from './ladyfrog.js';
import { Otter } from './otter.js';
import { LANES, ROWS, SCREEN, DEBUG, TIMED } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Playfield {
  constructor() { this.lanes = []; this.homes = new Homes(); }

  build(level) {
    this.lanes = LANES.map((cfg, i) => new Lane(cfg, level, i));   // TODO(step 8): §3.3 level schedule
    this.homes.reset();
    this.homes.level = level;                                      // gates the L2 bay crocodile-head
    const li = this.lanes.findIndex((l) => l.cfg.id === TIMED.LADY_LANE);   // the lady-frog rides River 4
    this.lady = new LadyFrog(this.lanes[li], ROWS.FIRST_LANE_Y + li * SCREEN.CELL);
    const logLanes = {};                                                    // the otter roams River 1/3/4
    for (const id of TIMED.OTTER_LANES) logLanes[id] = this.lanes.find((l) => l.cfg.id === id);
    this.otter = new Otter(logLanes, level);                                // surfaces only from level 3 (§3.4)
  }

  // §7 step 4: advance every lane's movers, walk the home-bay item, ride the lady-frog escort, and
  // swim the otter (after the lanes move, so it chases the current log positions).
  /** @param {number} frame  the global tick counter */
  update(frame = 0) {
    for (const lane of this.lanes) lane.advance();
    this.homes.update(frame);
    this.lady.update(frame);
    this.otter.update();
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
    if (this.otter.active) {             // the roaming otter, in its current log lane (§3.4)
      this.otter.render(renderer, ROWS.FIRST_LANE_Y + this.lanes.indexOf(this.otter.lane) * SCREEN.CELL);
    }
    this.lady.render(renderer);          // the lady-frog on her River 4 log (§3.4)
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
