// mover.js — a base moving object: position, per-lane step, edge wrap (§6, §3.2).
import { WRAP_L } from './constants.js';

export class Mover {
  constructor(x, w) { this.x = x; this.w = w; }

  // Each frame: (x + dir·V) mod L; leaving one edge re-enters the other (§3.2).
  advance(dx) { this.x = (this.x + dx + WRAP_L) % WRAP_L; }
}
