// modes/play.js — the live playfield + HUD (§10). [scaffold: builds + renders; the tick order
// is stubbed for the impl steps]
import { Mode } from '../mode.js';

export class Play extends Mode {
  enter() {
    this.game.frog.reset();
    this.game.playfield.build(this.game.level);
    this.game.timer.reset();
    this.game.audio.playMusic();
  }

  // TODO(impl): the §7 tick order — input → frog → collision → objects move → timer.
  update() {
    this.game.playfield.update();
    if (this.game.timer.tick()) { /* TODO(impl): time-out → this.game.flow.to('death') */ }
  }

  render() {
    const r = this.game.renderer;
    this.game.playfield.render(r);
    this.game.frog.render(r);
    this.game.hud.render(this.game);
  }

  exit() { this.game.audio.stopMusic(); }
}
