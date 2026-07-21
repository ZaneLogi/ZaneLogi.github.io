// modes/death.js — the 7-frame death explosion at the frog's spot; then decrement a life →
// Play (lives remain) or GameOver (§10, §3.5). [scaffold: timing only]
import { Mode } from '../mode.js';
import { DEATH } from '../constants.js';

export class Death extends Mode {
  enter() { this.timer = 0; this.game.audio.request('death'); }

  update() {
    if (++this.timer < DEATH.FRAME_HOLD * 7) return;   // explosion still playing
    if (--this.game.lives > 0) this.game.flow.to('play');
    else this.game.flow.to('gameover');
  }

  // TODO(impl): death_0..5 → skull at the frog's spot.
  render() { this.game.hud.render(this.game); }
}
