// flow.js — the mode graph as data; transitions decided centrally, so modes never import one
// another (§6, §10). Owns the single instance of each mode; modes ask via game.flow.to(...).
import { Attract } from './modes/attract.js';
import { Play } from './modes/play.js';
import { Death } from './modes/death.js';
import { RoundClear } from './modes/round_clear.js';
import { GameOver } from './modes/game_over.js';

/** @typedef {import('./game.js').Game} Game */
/** @typedef {'attract' | 'play' | 'death' | 'roundclear' | 'gameover'} ModeName */

export class Flow {
  /** @param {Game} game */
  constructor(game) {
    this.game = game;
    this.modes = {
      attract: new Attract(game),
      play: new Play(game),
      death: new Death(game),
      roundclear: new RoundClear(game),
      gameover: new GameOver(game),
    };
  }

  start() { this.to('attract'); }
  /** @param {ModeName} name */
  to(name) { this.game.setMode(this.modes[name]); }
}
