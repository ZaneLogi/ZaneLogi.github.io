// playfield.js — owns the ten Lanes + the Homes; builds them for the current level from
// constants.js, advances the lanes each tick, and is the surface Collision/Play query (§6).
import { Lane } from './lane.js';
import { Homes } from './homes.js';
import { LANES } from './constants.js';

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
    // TODO(impl): background bands, then each lane at its row y, then the homes (§4).
    this.homes.render(renderer);
  }
}
