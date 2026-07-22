// modes/attract.js — title + high score; Start → a fresh Play (§10). No self-playing demo.
import { Mode } from '../mode.js';
import { DEV } from '../constants.js';

export class Attract extends Mode {
  enter() { this.game.audio.stopMusic(); }

  update() {
    if (this.game.input.startPressed()) {
      this.game.score.reset();
      this.game.lives = 3;
      this.game.level = DEV.START_LEVEL;   // 1, or the ?level= dev override (§ DEV)
      this.game.flow.to('play');
    }
  }

  render() {
    const r = this.game.renderer;
    r.drawText('FROGGER', 87, 92, '#1DC300');
    r.drawText('HI-SCORE', 84, 128, '#E00000');
    r.drawText(String(this.game.hiScore).padStart(5, '0'), 94, 140, '#fff');
    r.drawText('PRESS SPACE', 73, 188, '#E0E000');
  }
}
