// pathrunner.js — the INTERPRETER for galaga path bytecode.
//
// A faithful one-bug port of bugMotion.js's per-tick motion loop (the Z80 `f_08D3`
// loop; research_path_data.md §4) — the same integration SVG/gen_path_svg.py's
// simulate() uses. Given an assembled path byte-stream and a launch start, step()
// advances ONE enemy by one 60 Hz frame and records a canvas-space position trail.
// Pure motion: no rendering, no DOM.
//
// SCOPE: this models segments + END (0xFF) — enough for the raw-END fly-off paths the
// player demo shows (e.g. 01E8). It does NOT dispatch the ≥0xEF control tokens
// (TURN_HOME, JUMP, …); a token-bearing path would need bugMotion.js's full jump-table
// (research_path_data.md §2.2). The byte-level round-trip (pathbuilder.js) is what
// proves those tokens' encoding; this runner is the motion half for the simple case.

const rawXToCanvasX = (rawX) => rawX * 2 - 9;                          // paths.js §5.1
const rawYToCanvasY = (rawY) => ((~(rawY + 0x4F)) & 0xFF) * 2 + 1 - 32; // §5.2 (Y inverted)
const s8 = (b) => (b > 127 ? b - 256 : b);

export class PathRunner {
  // bytes  — an assembled path byte-stream (from pathbuilder.js / paths.js)
  // start  — a launch entry { y, x, rotHi } (a paths.js VARIANTS row)
  // negate — mirror rotation (bit 7 of 0x13): the paired member's wishbone (§4.4)
  constructor(bytes, start, negate) {
    this.bytes = bytes; this.negate = negate;
    this.x = rawXToCanvasX(start.x); this.y = rawYToCanvasY(start.y);
    this.angle = start.rotHi << 8;                 // 10-bit; low byte inits 0
    this.vx = this.vy = this.rot = 0;
    this.segTimer = 0; this.off = 0; this.segIdx = -1; this.frame = 0; this.done = false;
    this.trail = [{ x: this.x, y: this.y, seg: 0 }];
  }
  step() {
    if (this.done) return;
    // steps 1-2: segment timer / load next 3-byte segment (bugMotion loadSegment)
    if (this.segTimer > 0) this.segTimer--;
    if (this.segTimer === 0) {
      if (this.off >= this.bytes.length || this.bytes[this.off] === 0xFF) { this.done = true; return; }
      const b0 = this.bytes[this.off], b1 = this.bytes[this.off + 1], b2 = this.bytes[this.off + 2];
      this.vx = b0 & 0x0F; this.vy = (b0 >> 4) & 0x0F;
      this.rot = this.negate ? -s8(b1) : s8(b1);   // bit-7 negate-rotation → member 1 mirror
      this.segTimer = b2; this.off += 3; this.segIdx++;
    }
    // step 3: angle += rotRate (10-bit wrap)
    this.angle = (this.angle + this.rot + 1024) & 0x3FF;
    // step 5: both axes move; magnitude alternates vx/vy by frame parity
    const A = (this.frame & 1) ? this.vx : this.vy;
    const ang = this.angle * (2 * Math.PI / 1024);
    this.x += A * Math.cos(ang);
    this.y -= A * Math.sin(ang);                    // canvas-Y inverted vs Z80 internal Y
    this.frame++;
    this.trail.push({ x: this.x, y: this.y, seg: this.segIdx });
    // 01E8's 255-frame tail flies off-screen (raw-END test path, not an FB turn-home)
    if (this.x < -15 || this.x > 226 || this.y > 292) this.done = true;
  }
}
