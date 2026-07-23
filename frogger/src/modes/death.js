// modes/death.js — the 7-frame death explosion at the frog's spot, then decrement a life →
// Play (lives remain) or GameOver (§10, §3.5). The field freezes (a snapshot) while it plays.
import { Mode } from '../mode.js';
import { DEATH } from '../constants.js';

// The explosion sequence (§3.5): death_0..5 → skull, each held DEATH.FRAME_HOLD frames.
const FRAMES = ['death_0', 'death_1', 'death_2', 'death_3', 'death_4', 'death_5', 'skull'];

export class Death extends Mode {
  enter() {
    this.timer = 0;
    this.x = this.game.frog.x;          // the death spot + the frame, frozen while the explosion plays
    this.y = this.game.frog.y;
    this.frame = this.game.frame;
    this.game.audio.request('death');
  }

  update() {
    if (++this.timer < DEATH.FRAME_HOLD * FRAMES.length) return;   // explosion still playing
    if (--this.game.lives > 0) this.game.flow.to('play');
    else this.game.flow.to('gameover');
  }

  // The frozen field snapshot, the explosion frame at the frog's spot, then the HUD.
  render() {
    const r = this.game.renderer;
    this.game.playfield.render(r, this.frame);
    const i = Math.min(FRAMES.length - 1, Math.floor(this.timer / DEATH.FRAME_HOLD));
    r.drawSprite(FRAMES[i], this.x, this.y);
    this.game.hud.render(this.game);
  }
}
