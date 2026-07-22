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

  // The §7 tick order, built up by step. 1 input → 2 frog → 3 collision → 4 objects move.
  // TODO(later): timer (5), audio (6 — Game.tick advances active sounds).
  update() {
    const g = this.game;
    const dir = g.input.hop();
    if (dir) g.frog.beginHop(dir);             // §7 step 1: input → pending hop
    g.frog.update();                            // §7 step 2: advance the hop, or carry a rider
    if (!g.frog.hopping) {                       // §7 step 3: collision, only while landed…
      const outcome = g.collision.resolve(g.frog, g.playfield);   // …against last frame's positions
      if (outcome === 'drown' || outcome === 'squash') { g.flow.to('death'); return; }
    }
    g.playfield.update();                        // §7 step 4: each lane advances its movers
  }

  render() {
    const r = this.game.renderer;
    this.game.playfield.render(r, this.game.frame);   // frame drives the §3.5 cosmetic animation
    this.game.frog.render(r);
    this.game.hud.render(this.game);
  }

  exit() { this.game.audio.stopMusic(); }
}
