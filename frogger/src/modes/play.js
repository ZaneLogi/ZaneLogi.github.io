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

  // The §7 tick order, built up by step. 1 input → 2 frog → 4 objects move.
  // TODO(later): collision (3, before objects move), timer (5), audio (6).
  update() {
    const dir = this.game.input.hop();
    if (dir) this.game.frog.beginHop(dir);
    this.game.frog.update();
    this.game.playfield.update();      // §7 step 4: each lane advances its movers
  }

  render() {
    const r = this.game.renderer;
    this.game.playfield.render(r, this.game.frame);   // frame drives the §3.5 cosmetic animation
    this.game.frog.render(r);
    this.game.hud.render(this.game);
  }

  exit() { this.game.audio.stopMusic(); }
}
