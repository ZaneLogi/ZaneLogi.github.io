// modes/round_clear.js — the playfield still runs (no input); the laughing frog (frog_home_1)
// fills the five bays one-by-one, over the level-complete music; leaves when the music ends
// (isPlaying) — or a fixed duration covering the sweep — → Play (next level, bays cleared) (§10).
import { Mode } from '../mode.js';
import { HOMES, ROWS } from '../constants.js';

const SWEEP = 90;          // total frames the round-clear screen holds
const LAUGH_PER_BAY = 15;  // a bay flips smile → laugh every this many frames (5 bays sweep in 75)

const CONTENT_Y = ROWS.ANCHOR_Y[ROWS.MAX_ROW];   // where the home frogs sit (y 32)

export class RoundClear extends Mode {
  enter() {
    this.timer = 0;
    this.game.score.allHomes();
    this.game.audio.request('level_complete');
  }

  update() {
    this.timer++;
    this.game.playfield.update(this.game.frame, this.game.frog.hasLady);   // movers keep running; input is not read
    if (this.timer >= SWEEP && !this.game.audio.isPlaying('level_complete')) {
      this.game.level++;
      this.game.playfield.homes.reset();   // next level → clear the (all-filled) home bays
      this.game.flow.to('play');
    }
  }

  // The field keeps running; the five filled bays flip smile → laugh (frog_home_1) left-to-right,
  // one every LAUGH_PER_BAY frames (§10).
  render() {
    const r = this.game.renderer;
    this.game.playfield.render(r, this.game.frame);
    const laughing = Math.min(HOMES.COUNT, Math.floor(this.timer / LAUGH_PER_BAY));
    for (let bay = 0; bay < laughing; bay++) {
      r.drawSprite('frog_home_1', HOMES.BAY_CENTERS[bay] - 8, CONTENT_Y);
    }
    this.game.hud.render(this.game);
  }
}
