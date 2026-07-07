// pathrunner.js — the INTERPRETER for galaga path bytecode.
//
// A faithful one-bug port of bugMotion.js's per-tick motion loop (the Z80 `f_08D3`
// loop; research_path_data.md §4) — the same integration SVG/gen_path_svg.py's
// simulate() uses. Given an assembled path byte-stream and a launch start, step()
// advances ONE enemy by one 60 Hz frame and records a canvas-space position trail.
// Pure motion: no rendering, no DOM.
//
// SCOPE: by default this models segments + END (0xFF) — enough for the raw-END fly-off/
// through paths (01E8's fly-in, and the token-free bonus-stage fly-throughs, PATH_INDEX
// 6-23). Pass `{ tokens: true }` to enable an OPT-IN subset of bugMotion.js's ≥0xEF control
// tokens — the combat fly-in set (PATH_INDEX 0-5): FB TURN_HOME, F7 ATTACK_TURN (transient),
// F0 ATTACK_WAVE (stage 8+), FE player-region hold, FF despawn. `mode` picks which of F7/F0
// is taken (they are mutually exclusive — F7 precedes F0 in every fly-in path, so a taken
// F7 preempts F0). FB is treated as a STOP that flags `ended='homing'` (the demo shows a
// badge rather than simulating bugMotion.js's guided approach to the formation slot).
// research_path_data.md §2.2. The byte-level round-trip (pathbuilder.js) proves the encoding.

const rawXToCanvasX = (rawX) => rawX * 2 - 9;                          // paths.js §5.1
const rawYToCanvasY = (rawY) => ((~(rawY + 0x4F)) & 0xFF) * 2 + 1 - 32; // §5.2 (Y inverted)
const s8 = (b) => (b > 127 ? b - 256 : b);

export class PathRunner {
  // bytes  — an assembled path byte-stream (from pathbuilder.js / paths.js)
  // start  — a launch entry { y, x, rotHi } (a paths.js VARIANTS row)
  // negate — mirror rotation (bit 7 of 0x13): the paired member's wishbone (§4.4)
  // opts   — { tokens?, mode?, subPaths?, playerX? } — see SCOPE above:
  //   tokens   enable ≥0xEF token dispatch (default off → segments + END only)
  //   mode     'formation' | 'stage8' | 'transient' — which of F0/F7 is taken
  //   subPaths Z80-addr → sub-path map (from the fly-in path) for F0/F7 jumps
  //   playerX  canvas X of the stand-in player for FE (default 112 = centre)
  constructor(bytes, start, negate, opts = {}) {
    this.bytes = bytes; this.negate = negate;
    this.tokens   = !!opts.tokens;
    this.mode     = opts.mode || 'formation';
    this.subPaths = opts.subPaths || bytes.subPaths || null;
    this.playerX  = opts.playerX ?? 112;
    this.ended    = null;                          // null | 'homing' | 'despawned' | 'ended' | 'offscreen'
    this.x = rawXToCanvasX(start.x); this.y = rawYToCanvasY(start.y);
    this.angle = start.rotHi << 8;                 // 10-bit; low byte inits 0
    this.vx = this.vy = this.rot = 0;
    this.segTimer = 0; this.off = 0; this.segIdx = -1; this.frame = 0; this.done = false;
    this.loadedAt = -1;                             // offset the current segment/hold loaded from
    this.trail = [{ x: this.x, y: this.y, seg: 0 }];
    this.enteredScreen = this._onScreen();          // false if it launches off-screen
  }
  // Off-screen test — the SAME margins bugMotion.js:911 despawns challenge/fly-through
  // bugs at (canvas y>304, x<-24, x>248), so the demo trims a fly-off trail at exactly
  // the point the game would. (The game keeps these generous so a path that dips near an
  // edge mid-pattern isn't clipped; verified none of the bonus paths reach even y=264.)
  _onScreen() { return this.x >= -24 && this.x <= 248 && this.y <= 304; }
  step() {
    if (this.done) return;
    // steps 1-2: segment timer / load next segment (or dispatch a token)
    if (this.segTimer > 0) this.segTimer--;
    if (this.segTimer === 0) {
      if (!this._load()) return;                    // path terminated this frame (done set)
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
    // Off-screen despawn (01E8's 255-frame tail, the bonus fly-throughs, and the transient
    // F7 swoop-tail all exit this way — none is an FB turn-home). Only despawn once the bug
    // has actually BEEN on-screen, so a member that launches outside the margins flies IN
    // rather than dying at spawn (under the game-matched margins every real launch is already
    // in-bounds, so the guard never fires for those — but it keeps the runner correct here).
    if (this._onScreen()) this.enteredScreen = true;
    else if (this.enteredScreen) { this.done = true; this.ended = this.ended || (this.mode === 'transient' ? 'despawned' : 'offscreen'); }
  }

  // Load the next segment, dispatching ≥0xEF tokens when `this.tokens` is on. Returns false
  // (and sets this.done) if the path terminated this frame. Mirrors bugMotion.js's loadSegment
  // + the F0/F7/FB/FE/FF handlers, minus the guided-homing flight (FB is a stop here).
  _load() {
    while (true) {
      if (this.off >= this.bytes.length) { this.done = true; return false; }
      const b0 = this.bytes[this.off];

      if (this.tokens && b0 >= 0xEF) {              // ≥0xEF at a boundary is a control token
        if (b0 === 0xFF) {                          // END / despawn (case_0E49)
          this.done = true; this.ended = this.ended || (this.mode === 'transient' ? 'despawned' : 'ended'); return false;
        }
        if (b0 === 0xFB) {                          // TURN_HOME (case_0AA0) → stop sign
          this.done = true; this.ended = 'homing'; return false;
        }
        if (b0 === 0xF7) {                          // ATTACK_TURN — transient-only jump (case_0B98)
          if (this.mode === 'transient') { this._jump(); continue; }
          this.off += 3; continue;                  // formation bug: skip token + 2-byte addr
        }
        if (b0 === 0xF0) {                          // ATTACK_WAVE — stage-8+ jump (case_0955)
          if (this.mode === 'stage8') { this._jump(); continue; }
          this.off += 3; continue;                  // stages 1-7: skip token + 2-byte addr
        }
        if (b0 === 0xFE) {                          // player-region turn-hold (case_0B16)
          const shipX = (Math.round(this.playerX) + 9) & 0xFF;
          let t = ((this.negate ? shipX : (0xF2 - shipX)) + 0x0E) & 0xFF;
          let i = Math.floor(t / 0x1E); i = i < 1 ? 1 : (i > 8 ? 8 : i);
          this.loadedAt = this.off;
          this.segTimer = this.bytes[this.off + i];  // LUT[idx-1] → hold duration
          this.off += 9;                             // token + 8-byte LUT
          return true;                               // keep current vx/vy/rot (hold turn)
        }
        this.done = true; return false;              // unknown token (defensive; unreachable for 0-5)
      }

      if (b0 === 0xFF) { this.done = true; return false; }   // tokens off: END only (01E8 / bonus)
      const b1 = this.bytes[this.off + 1], b2 = this.bytes[this.off + 2];
      this.vx = b0 & 0x0F; this.vy = (b0 >> 4) & 0x0F;
      this.rot = this.negate ? -s8(b1) : s8(b1);     // bit-7 negate-rotation → member 1 mirror
      this.loadedAt = this.off;
      this.segTimer = b2; this.off += 3; this.segIdx++;
      return true;
    }
  }

  // F0/F7: replace the current path with the sub-path at the embedded 2-byte Z80 address,
  // looked up in the fly-in path's subPaths map (paths.js). segIdx is NOT reset, so trail
  // colours stay distinct across the jump (the loader increments it per sub-path segment).
  _jump() {
    const target = (this.bytes[this.off + 2] << 8) | this.bytes[this.off + 1];
    const sub = this.subPaths && this.subPaths[target];
    if (!sub) { this.done = true; this.ended = 'homing'; return; }  // defensive: bugMotion homes
    this.bytes = sub; this.off = 0;
  }
}
