// otter.js — the roaming river otter (§3.4): it traverses a log lane, submerging under each log.
//   idle     — count down T_OTTER, then advance to the next log lane (River 1 → 3 → 4) and enter at
//              the lane's left edge.
//   swimming — swim left → right across the whole lane at OTTER_V (faster than the logs, so it
//              overtakes them). It is SURFACED (visible) over open water and SUBMERGED (hidden) while a
//              log is over it — diving under each log and re-surfacing in the next gap. It leaves once
//              it swims off the right edge; the timer then brings it up in the next lane.
// Lethal ONLY while surfaced (`hits`, span overlap): a frog riding a log's near edge beside a surfaced
// otter is snatched; while submerged (under a log) the otter is harmless and hidden. It can't be
// ridden. From level 3 (§3.3). `otter_0` swimming; the reared `otter_1` is the catch pose (death
// presentation, step 7). All log lanes drift right.
import { SCREEN, TIMED, WRAP_L, speedFactor } from './constants.js';

/** @typedef {import('./lane.js').Lane} Lane */
/** @typedef {import('./renderer.js').Renderer} Renderer */

const W = SCREEN.CELL;   // the otter sprite is 16 px

export class Otter {
  /**
   * @param {Object<string, Lane>} logLanes  the River 1 / 3 / 4 lanes it roams, by id
   * @param {number} level  the otter only appears from OTTER_MIN_LEVEL (§3.3)
   */
  constructor(logLanes, level = 1) {
    this.logLanes = logLanes;
    this.level = level;
    this.v = TIMED.OTTER_V * speedFactor(level);   // §3.3: ramps with the board, so it keeps overtaking the logs
    this.state = 'idle';        // 'idle' | 'swimming'
    this.timer = TIMED.T_OTTER; // idle countdown before it enters the next lane
    this.laneIdx = -1;          // index into OTTER_LANES; advances each visit
    this.lane = null;
    this.x = 0;
    this.active = false;        // present in the lane (mid-traversal) — surfaced OR submerged
    this.surfaced = false;      // visible + lethal only while surfaced (over open water)
  }

  reset() {
    this.state = 'idle'; this.timer = TIMED.T_OTTER;
    this.laneIdx = -1; this.lane = null; this.active = false; this.surfaced = false;
  }

  update() {
    if (this.level < TIMED.OTTER_MIN_LEVEL) return;   // the otter is a level-3+ hazard (§3.3)
    if (this.state === 'idle') { if (--this.timer <= 0) this._enter(); }
    else this._swim();
  }

  // Advance to the next log lane and enter at its left edge; the traversal begins (surfaced unless a
  // log already covers the entry point).
  _enter() {
    this.laneIdx = (this.laneIdx + 1) % TIMED.OTTER_LANES.length;
    this.lane = this.logLanes[TIMED.OTTER_LANES[this.laneIdx]];
    this.x = 0;
    this.state = 'swimming';
    this.active = true;
    this.surfaced = !this._underLog();
  }

  // Swim rightward across the lane; surface over open water, submerge while a log is over the otter.
  // Once fully past the right edge the otter is gone → idle until the timer brings it up next lane.
  _swim() {
    this.x += this.v;
    if (this.x >= SCREEN.WIDTH) {
      this.active = false; this.surfaced = false; this.state = 'idle'; this.timer = TIMED.T_OTTER;
      return;
    }
    this.surfaced = !this._underLog();
  }

  // Is a log (its on-screen span or its seam wrap copy) currently over the otter? Any overlap counts,
  // so the otter is drawn only in clear water, never on top of a log.
  _underLog() {
    const x0 = this.x, x1 = this.x + W;
    for (const m of this.lane.movers) {
      if (x0 < m.x + m.w && x1 > m.x) return true;
      const wx = m.x - WRAP_L;                          // the log's seam wrap copy (matches Lane.render)
      if (x0 < wx + m.w && x1 > wx) return true;
    }
    return false;
  }

  /** @param {Renderer} renderer @param {number} y  the otter's lane row */
  render(renderer, y) {
    if (!this.active || !this.surfaced) return;         // hidden while submerged under a log
    renderer.drawSprite('otter_0', this.x, y);          // swimming; otter_1 = death pose (step 7)
  }

  // Does the frog span [x0, x1) overlap the otter — lethal ONLY while surfaced (harmless under a log)?
  hits(x0, x1) {
    if (!this.active || !this.surfaced) return false;
    return x0 < this.x + W && x1 > this.x;
  }
}
