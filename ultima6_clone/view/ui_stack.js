// UI substrate (I-7b) — modal stack + input routing + turn-driver gating.
//
// Shared foundation for every later UI surface (object inspector I-7c, dialog
// window I-11, status panel I-13, save/load, spell select, conversation). A
// modal is a plain object { el, onKey(e), onClose?() }; the stack owns DOM
// append/remove on a root container and a single global keydown listener,
// installed only while the stack is non-empty.
//
// Binding design decisions (docs/progress.md "I-7 scope" / 2026-05-31):
//   * One inspector surface for any entity — substrate is generic.
//   * Modal-stack for nested containers (not inline tree); each open pushes.
//   * TurnClock SUSPENDED for the entire stack lifetime; resumed on last-pop.
//     The TurnClock's suspendCount is already counter-based (ecs/world.js:60)
//     so push 3 → suspend×3, pop 3 → resume×3, net 0 — nested modals work
//     for free.
//
// Esc auto-pops the top modal unless its onKey() calls preventDefault first
// (e.g. an in-modal text field that wants to consume Esc itself).

import { TurnClock } from '../ecs/world.js';

export class UIStack {
  constructor(world, rootEl) {
    this.world = world;
    this.root = rootEl;
    this.stack = [];
    this._keydownHandler = null;
  }

  push(modal) {
    this.stack.push(modal);
    this.root.appendChild(modal.el);
    if (this.stack.length === 1) {
      this.world.getResource(TurnClock).suspend();
      this._keydownHandler = (e) => {
        const top = this.top();
        if (!top) return;
        top.onKey(e);
        if (!e.defaultPrevented && e.key === 'Escape') this.pop();
      };
      document.addEventListener('keydown', this._keydownHandler);
    }
  }

  pop() {
    const modal = this.stack.pop();
    if (!modal) return null;
    if (modal.el.parentNode) modal.el.parentNode.removeChild(modal.el);
    if (modal.onClose) modal.onClose();
    if (this.stack.length === 0) {
      this.world.getResource(TurnClock).resume();
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    return modal;
  }

  top() { return this.stack[this.stack.length - 1] ?? null; }
  isEmpty() { return this.stack.length === 0; }

  // Pop all open modals (used by tests / dev console; not exercised by the
  // inspector flow, where the user unwinds Esc-by-Esc).
  clear() { while (!this.isEmpty()) this.pop(); }
}
