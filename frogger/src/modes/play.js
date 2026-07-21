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

  // The §7 tick order, built up by step. Step 1: input → the frog's hop, then advance it.
  // TODO(later): collision (3), objects move (4), timer (5), audio (6).
  update() {
    const dir = this.game.input.hop();
    if (dir) this.game.frog.beginHop(dir);
    this.game.frog.update();
  }

  render() {
    const r = this.game.renderer;
    this.game.playfield.render(r);
    this.game.frog.render(r);
    this.game.hud.render(this.game);
  }

  exit() { this.game.audio.stopMusic(); }
}
