// input.js — keys → hop intents, edge-triggered (one hop per press, §6).
// The only DOM key reader. beginFrame() latches the edges seen since the last tick.
export class Input {
  constructor() {
    this._queue = [];
    this._frame = [];
    addEventListener('keydown', (e) => {
      if (!e.repeat) this._queue.push(e.code);
      if (HANDLED.has(e.code)) e.preventDefault();
    });
  }

  beginFrame() { this._frame = this._queue; this._queue = []; }

  hop() {
    for (const c of this._frame) {
      if (c === 'ArrowUp') return 'up';
      if (c === 'ArrowDown') return 'down';
      if (c === 'ArrowLeft') return 'left';
      if (c === 'ArrowRight') return 'right';
    }
    return null;
  }

  startPressed() { return this._frame.includes('Space') || this._frame.includes('Enter'); }
}

const HANDLED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
