// game.js — game state, the playState machine, and spawn.
// Ported from the NES per-player playState switch (main.asm:474-488).
// PHASE 1 scope: state substrate + spawn. Movement/rotation/gravity (state 1),
// lock (2), line-clear (3), scoring (5) are stubbed here and land in later phases.

import { SPAWN_X, SPAWN_Y, PIECE } from './constants.js';
import { SPAWN_TABLE, SPAWN_ORIENTATION } from './pieces.js';
import { Playfield } from './playfield.js';

// playState values (main.asm:474-488).
export const PS = {
  UNASSIGN: 0,
  CONTROL: 1,   // shift -> rotate -> drop
  LOCK: 2,
  CHECK_ROWS: 3,
  NOOP4: 4,     // line-clear animation renders here
  UPDATE_LINES: 5,
  BTYPE_GOAL: 6,
  RECEIVE_GARBAGE: 7,
  SPAWN: 8,
  NOOP9: 9,
  GAME_OVER: 10,
  INC: 11,
};

export class Game {
  constructor() {
    this.playfield = new Playfield();
    this.init();
  }

  init() {
    this.playfield.reset();
    this.frameCounter = 0;
    this.fallTimer = 0;
    this.levelNumber = 0;   // = startLevel; menu selection lands in a later phase

    // PHASE-1 stub for piece selection. The faithful roll-twice RNG is phase 4
    // (main.asm:2964). Until then, a deterministic cycle so sequences are testable.
    this._stubSeq = 0;

    // Faithful: the FIRST piece is placed directly by initGameState (main.asm:1190,
    // 1203-1207) and initGameBackground_finish sets playState = 1 (main.asm:1173-1174).
    // It does NOT go through the spawn state — piece 1 has no entry delay.
    this.currentPiece = SPAWN_TABLE[PIECE.T];   // stub first piece
    this.nextPiece = this._chooseNextPiece();
    this.tetriminoX = SPAWN_X;
    this.tetriminoY = SPAWN_Y;
    this.playState = PS.CONTROL;
  }

  // One NES frame. fallTimer is incremented once per frame in the non-player
  // state (main.asm:1448), then the active player's playState runs once.
  tick() {
    this.frameCounter++;
    this.fallTimer++;
    this._runPlayState();
  }

  _runPlayState() {
    switch (this.playState) {
      case PS.CONTROL:         this._playerControls(); break; // phase 2
      case PS.LOCK:            this._lock(); break;           // phase 3
      case PS.CHECK_ROWS:      this._checkRows(); break;      // phase 3
      case PS.UPDATE_LINES:    this._updateLines(); break;    // phase 3
      case PS.SPAWN:           this.spawn(); break;           // phase 1
      // UNASSIGN / NOOP4 / BTYPE_GOAL / RECEIVE_GARBAGE / NOOP9 / GAME_OVER / INC:
      default: break;
    }
  }

  // spawn — playState_spawnNextTetrimino (main.asm:2896). Used for pieces 2+.
  spawn() {
    this.tetriminoY = SPAWN_Y;
    this.fallTimer = 0;
    this.playState = PS.CONTROL;
    this.tetriminoX = SPAWN_X;
    this.currentPiece = SPAWN_ORIENTATION[this.nextPiece]; // main.asm:2930
    this.nextPiece = this._chooseNextPiece();
  }

  // --- Phase-2+ stubs (kept as explicit no-ops so the state machine is whole) ---
  _playerControls() { /* phase 2: shift -> rotate -> drop (main.asm:489-493) */ }
  _lock() { /* phase 3: main.asm:3062 */ }
  _checkRows() { /* phase 3: main.asm:3188 */ }
  _updateLines() { /* phase 3: main.asm:3329 */ }

  // PHASE-1 stub: deterministic 7-piece cycle. Returns a spawn orientation
  // (like chooseNextTetrimino, main.asm:2948). Replaced by roll-twice RNG in phase 4.
  _chooseNextPiece() {
    const order = [PIECE.T, PIECE.J, PIECE.Z, PIECE.O, PIECE.S, PIECE.L, PIECE.I];
    const type = order[this._stubSeq % order.length];
    this._stubSeq++;
    return SPAWN_TABLE[type];
  }

  // PHASE-1 debug helper: force-spawn a given piece type to verify the shape table.
  // Not part of the real game flow (real spawns go through spawn()).
  debugSpawn(type) {
    this.nextPiece = SPAWN_TABLE[type];
    this.spawn();
  }
}
