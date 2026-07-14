// game.js — game state, the playState machine, and spawn.
// Ported from the NES per-player playState switch (main.asm:474-488).
// PHASE 1 scope: state substrate + spawn. Movement/rotation/gravity (state 1),
// lock (2), line-clear (3), scoring (5) are stubbed here and land in later phases.

import {
  SPAWN_X, SPAWN_Y, PIECE, BTN, ORI,
  DAS_DELAY, DAS_RESET, INITIAL_AUTOREPEAT_Y, framesPerDrop,
  COLS, ROWS, TILE_EMPTY, TILE_CURTAIN, POINTS, LEFT_COLUMNS, RIGHT_COLUMNS,
} from './constants.js';
import { SPAWN_TABLE, SPAWN_ORIENTATION, ROTATION, ORIENTATIONS } from './pieces.js';
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

    // PHASE-1 stub for piece selection. The roll-twice RNG is phase 4
    // (main.asm:2964). Until then, a deterministic cycle so sequences are testable.
    this._stubSeq = 0;

    // The FIRST piece is placed directly by initGameState (main.asm:1190,
    // 1203-1207) and initGameBackground_finish sets playState = 1 (main.asm:1173-1174).
    // It does NOT go through the spawn state — piece 1 has no entry delay.
    this.currentPiece = SPAWN_TABLE[PIECE.T];   // stub first piece
    this.nextPiece = this._chooseNextPiece();
    this.tetriminoX = SPAWN_X;
    this.tetriminoY = SPAWN_Y;
    this.playState = PS.CONTROL;

    // Input latch — set each tick from the polled controller.
    this.heldButtons = 0;
    this.newlyPressedButtons = 0;
    // DAS + soft-drop counters. autorepeatX (DAS charge) carries across pieces
    // (never reset on spawn); autorepeatY is seeded 0xA0 = the game-start
    // soft-drop lockout (main.asm:1240) and IS reset to 0 on each spawn.
    this.autorepeatX = 0;
    this.autorepeatY = INITIAL_AUTOREPEAT_Y;
    this.holdDownPoints = 0;

    // Scoring + line-clear state. score/lines are plain integers (the NES keeps
    // BCD for its decimal display — a view-space storage detail; the level-up
    // >>4 quirk is replicated in _checkLevelUp).
    this.score = 0;
    this.lines = 0;
    this.completedLines = 0;  // rows cleared by the current piece (0..4)
    this.completedRows = [];  // their indices, for the wipe + collapse
    this.lineIndex = 0;       // checkForCompletedRows cursor (0..3)
    this.rowY = 0;            // line-clear wipe step (0..5)
    this.curtainRow = 0;      // game-over curtain cursor
  }

  // One NES frame. fallTimer is incremented once per frame in the non-player
  // state (main.asm:1448), then the active player's playState runs once.
  tick(heldButtons, newlyPressedButtons) {
    this.heldButtons = heldButtons;
    this.newlyPressedButtons = newlyPressedButtons;
    this.frameCounter++;
    this.fallTimer++;
    this._runPlayState();
  }

  _runPlayState() {
    switch (this.playState) {
      case PS.CONTROL:         this._playerControls(); break;     // phase 2
      case PS.LOCK:            this._lock(); break;               // phase 3
      case PS.CHECK_ROWS:      this._checkRows(); break;          // phase 3
      case PS.NOOP4:           this._lineClearAnimation(); break; // phase 3 — clear wipe
      case PS.UPDATE_LINES:    this._updateLines(); break;        // phase 3
      case PS.BTYPE_GOAL:      this.playState++; break;           // Type A: no goal → advance
      case PS.RECEIVE_GARBAGE: this.playState++; break;           // 1P: no garbage → advance
      case PS.SPAWN:           this.spawn(); break;               // phase 1
      case PS.GAME_OVER:       this._gameOverCurtain(); break;    // phase 3
      // UNASSIGN / NOOP9 / INC:
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
    this.autorepeatY = 0; // main.asm:2945 — soft-drop resets each spawn; DAS (autorepeatX) does NOT
  }

  // playState 1 — main.asm:489-493. Order is load-bearing: shift, then rotate,
  // then drop, all within one frame.
  _playerControls() {
    this._shiftTetrimino();
    this._rotateTetrimino();
    this._dropTetrimino();
  }

  // shift_tetrimino — main.asm:1616. Horizontal move + DAS auto-repeat.
  _shiftTetrimino() {
    const savedX = this.tetriminoX;
    if (this.heldButtons & BTN.DOWN) return;            // holding Down suppresses shift
    if (this.newlyPressedButtons & BTN.LEFT_RIGHT) {
      this.autorepeatX = 0;                             // fresh L/R press → shift immediately
    } else if (this.heldButtons & BTN.LEFT_RIGHT) {
      this.autorepeatX++;                               // held → charge DAS
      if (this.autorepeatX < DAS_RESET) return;         // not yet fully charged (16)
      this.autorepeatX = DAS_DELAY;                     // recharge to 10 → repeat every 6
    } else {
      return;                                           // no L/R held
    }
    // apply the shift — Right takes priority, matching the source order
    if (this.heldButtons & BTN.RIGHT) {
      this.tetriminoX++;
      if (!this._valid()) { this.tetriminoX = savedX; this.autorepeatX = DAS_RESET; } // wall charge
      // else: shift SFX (audio deferred)
    } else if (this.heldButtons & BTN.LEFT) {
      this.tetriminoX--;
      if (!this._valid()) { this.tetriminoX = savedX; this.autorepeatX = DAS_RESET; }
    }
  }

  // rotate_tetrimino — main.asm:1465. A = CW, B = CCW; no kicks; revert if invalid.
  _rotateTetrimino() {
    const saved = this.currentPiece;
    const [ccw, cw] = ROTATION[this.currentPiece];      // [B target, A target]
    if (this.newlyPressedButtons & BTN.A) {
      this.currentPiece = cw;
      if (!this._valid()) this.currentPiece = saved;    // else: rotate SFX
    } else if (this.newlyPressedButtons & BTN.B) {
      this.currentPiece = ccw;
      if (!this._valid()) this.currentPiece = saved;
    }
  }

  // drop_tetrimino — main.asm:1530. Soft drop + gravity + lock-on-landing.
  _dropTetrimino() {
    // Game-start lockout: autorepeatY seeded 0xA0 (bit7 set). It counts up for
    // ~96 frames unless Down is tapped, suppressing soft drop AND gravity.
    if (this.autorepeatY & 0x80) {
      if (this.newlyPressedButtons & BTN.DOWN) {
        this.autorepeatY = 0;                           // Down tapped → clear lockout
      } else {
        this.autorepeatY = (this.autorepeatY + 1) & 0xFF;
        return;
      }
    }
    if (this.autorepeatY !== 0) {
      // already soft-dropping
      if ((this.heldButtons & BTN.DPAD) === BTN.DOWN) {
        this.autorepeatY++;
        if (this.autorepeatY >= 3) {                    // every 3rd frame → step + score
          this.autorepeatY = 1;
          this.holdDownPoints++;
          this._dropOneRow();
          return;
        }
        // else fall through to gravity
      } else {
        this.autorepeatY = 0;                           // Down released → stop soft drop
        this.holdDownPoints = 0;
      }
    } else {
      // not soft-dropping — engage on a solo fresh Down (not while holding L/R)
      if (!(this.heldButtons & BTN.LEFT_RIGHT) &&
          (this.newlyPressedButtons & BTN.DPAD) === BTN.DOWN) {
        this.autorepeatY = 1;
      }
    }
    // gravity — main.asm:1584 (@lookupDropSpeed)
    if (this.fallTimer >= framesPerDrop(this.levelNumber)) {
      this._dropOneRow();
    }
  }

  // @drop — main.asm:1570. Move down one row; lock into place if blocked.
  _dropOneRow() {
    this.fallTimer = 0;
    const savedY = this.tetriminoY;
    this.tetriminoY++;
    if (this._valid()) return;                          // dropped OK
    this.tetriminoY = savedY;                           // blocked → lock
    this.playState = PS.LOCK;
    this._updatePlayfield();
  }

  _valid() {
    return this.playfield.isPositionValid(this.currentPiece, this.tetriminoX, this.tetriminoY);
  }

  // updatePlayfield — main.asm:3532. Rewinds the VRAM copy cursor that drives the
  // entry delay (ARE). Phase 5 (needs emulator calibration); no-op for now.
  _updatePlayfield() { /* phase 5 */ }

  // playState 2 — playState_lockTetrimino (main.asm:3062). Freeze the piece into
  // the playfield array, or top out.
  _lock() {
    if (!this._valid()) {              // resting position overlaps → top-out
      this.playState = PS.GAME_OVER;
      this.curtainRow = -16;           // 0xF0 as signed: ~64-frame pause before the fill
      return;                          // (lock / game-over SFX deferred)
    }
    // (vramRow >= 32 gate skipped — that ARE mechanism is phase 5)
    const ori = ORIENTATIONS[this.currentPiece];
    for (const [dy, dx] of ori.cells) {
      const row = this.tetriminoY + dy;
      if (row >= 0) this.playfield.set(this.tetriminoX + dx, row, ori.tile); // skip vanish zone
    }
    this.lineIndex = 0;
    this._updatePlayfield();           // phase 5 no-op
    this.playState++;                  // → 3 (CHECK_ROWS)
  }

  // playState 3 — playState_checkForCompletedRows (main.asm:3188). One candidate
  // row per frame; a full row is marked (collapse deferred to the wipe animation).
  _checkRows() {
    // (vramRow >= 32 gate skipped — phase 5)
    const rowBase = Math.max(0, this.tetriminoY - 2) + this.lineIndex;
    if (rowBase < ROWS && this._isRowFull(rowBase)) {
      this.completedRows.push(rowBase);
      this.completedLines++;
      this.currentPiece = ORI.hidden;  // hide the active piece during the clear
    }
    this.lineIndex++;
    if (this.lineIndex < 4) return;    // more candidate rows next frame
    this.rowY = 0;
    this.playState++;                  // → 4 (wipe animation)
    if (this.completedLines === 0) this.playState++; // nothing to clear → skip to 5
  }

  // playState 4 — the line-clear wipe (updateLineClearingAnimation, main.asm:2757).
  // Blank the completed rows center-out over 20 frames, THEN collapse. The deferred
  // collapse is a view-space re-derivation: the source collapses in state 3 and
  // wipes VRAM, but we render the playfield array directly.
  _lineClearAnimation() {
    if ((this.frameCounter & 3) !== 0) return;   // one step every 4 frames
    const left = LEFT_COLUMNS[this.rowY];
    const right = RIGHT_COLUMNS[this.rowY];
    for (const row of this.completedRows) {
      this.playfield.set(left, row, TILE_EMPTY);
      this.playfield.set(right, row, TILE_EMPTY);
    }
    this.rowY++;
    if (this.rowY >= 5) {              // fully wiped → collapse + advance
      this._collapseCompletedRows();
      this.playState++;               // → 5 (UPDATE_LINES)
    }
  }

  // Remove the completed rows; shift everything above down (main.asm:3228-3244,
  // run here after the wipe rather than during the scan).
  _collapseCompletedRows() {
    const cleared = new Set(this.completedRows);
    const cells = this.playfield.cells;
    const next = new Uint8Array(COLS * ROWS).fill(TILE_EMPTY);
    let dst = ROWS - 1;
    for (let src = ROWS - 1; src >= 0; src--) {
      if (cleared.has(src)) continue;             // drop the completed rows
      for (let x = 0; x < COLS; x++) next[dst * COLS + x] = cells[src * COLS + x];
      dst--;
    }
    cells.set(next);
  }

  // playState 5 — playState_updateLinesAndStatistics (main.asm:3329), Type A.
  _updateLines() {
    const cleared = this.completedLines;
    if (cleared > 0) this._checkLevelUp(cleared);   // lines++ / level-up per line
    // addHoldDownPoints (main.asm:3431): soft-drop score = holdDownPoints - 1 (if >= 2)
    if (this.holdDownPoints >= 2) this.score += this.holdDownPoints - 1;
    this.holdDownPoints = 0;
    // addLineClearPoints (main.asm:3460): line points x (levelNumber + 1), capped
    this.score += POINTS[cleared] * (this.levelNumber + 1);
    if (this.score > 999999) this.score = 999999;
    this.completedLines = 0;
    this.completedRows = [];
    this.playState++;                 // → 6
  }

  // Level-up (Type A, main.asm:3378). Increment lines one at a time; on each
  // multiple of 10, level up if levelNumber < (BCD(lines) >> 4). That >>4-on-BCD
  // is the source's implicit start-level threshold quirk, replicated here.
  _checkLevelUp(cleared) {
    for (let i = 0; i < cleared; i++) {
      this.lines++;
      if (this.lines % 10 === 0 && this.levelNumber < (this._bcdPack(this.lines) >> 4)) {
        this.levelNumber++;
      }
    }
  }

  // Pack a decimal number into BCD (each digit in its own nibble), as the NES
  // stores `lines`. Used only to reproduce the level-up threshold.
  _bcdPack(n) {
    let bcd = 0, shift = 0;
    while (n > 0) { bcd |= (n % 10) << shift; shift += 4; n = Math.floor(n / 10); }
    return bcd;
  }

  _isRowFull(row) {
    for (let x = 0; x < COLS; x++) if (this.playfield.get(x, row) === TILE_EMPTY) return false;
    return true;
  }

  // playState 10 — playState_updateGameOverCurtain (main.asm:3130). Fill the board
  // top-down with the curtain tile, one row every 4 frames, then restart on Start.
  _gameOverCurtain() {
    if (this.curtainRow >= ROWS) {                  // filled → wait for Start
      if (this.newlyPressedButtons & BTN.START) this.init();
      return;
    }
    if ((this.frameCounter & 3) !== 0) return;      // every 4 frames
    if (this.curtainRow >= 0) {                     // negative values are the initial pause
      for (let x = 0; x < COLS; x++) this.playfield.set(x, this.curtainRow, TILE_CURTAIN);
    }
    this.curtainRow++;
  }

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
