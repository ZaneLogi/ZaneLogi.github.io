// modes/game_over.js — GAME OVER over the field, then → Attract (§10). Captures the hi-score.
import { Mode } from '../mode.js';

const HOLD = 180;

export class GameOver extends Mode {
  enter() {
    this.timer = 0;
    this.game.audio.request('game_over');
    if (this.game.score.value > this.game.hiScore) this.game.hiScore = this.game.score.value;
  }

  update() {
    if (++this.timer >= HOLD && !this.game.audio.isPlaying('game_over')) this.game.flow.to('attract');
  }

  render() { this.game.renderer.drawText('GAME OVER', 77, 120, '#E00000'); }
}
