// modes/round_clear.js — the playfield still runs (no input); the laughing frog (frog_home_1)
// fills the five bays one-by-one, over the level-complete music; leaves when the music ends
// (isPlaying) — or a fixed duration covering the sweep — → Play (next level, bays cleared) (§10).
import { Mode } from '../mode.js';

const SWEEP = 90;   // fixed fallback duration (frames) covering the laugh sweep

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
      this.game.flow.to('play');
    }
  }

  render() {
    this.game.playfield.render(this.game.renderer);
    // TODO(impl): draw frog_home_1 (laugh) across the bays one-by-one as `timer` advances.
    this.game.hud.render(this.game);
  }
}
