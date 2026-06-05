// Viewport resource — the visible extent of the map in TILES (cols x rows), kept in
// sync with the canvas drawing buffer by main.js's fit-to-window pass. Lives as an ECS
// resource so sim-layer systems can read the visible extent without touching the DOM
// canvas (e.g. the I-9h NPC-teleport guard reads `nearRadius`).
//
// Render-to-fit (Design 1, dpr=1): the canvas buffer = its CSS layout size, so a tile is
// 16 CSS px and `cols = ceil(canvasWidth / 16)` is a device-independent count. cols/rows
// grow/shrink as the window resizes.

export class Viewport {
  constructor(cols = 64, rows = 40) {
    this.cols = cols;
    this.rows = rows;
  }

  // I-9h off-area-teleport "near" radius: an NPC (or its slot) inside this Chebyshev
  // radius of the avatar must WALK (visible, animated), never teleport — else it would
  // pop on-screen. Must comfortably exceed the visible half-extent plus a scroll-in
  // margin. half-of-max(cols,rows) + 8 reproduces the old hardcoded 40 at the original
  // 64x40 canvas (max=64 -> 32 + 8 = 40) and tracks the live viewport on resize.
  // Over-suppressing (a far-but-not-that-far NPC walks) is harmless; under-suppressing
  // would let a visible NPC pop, so the margin errs generous.
  get nearRadius() {
    return Math.ceil(Math.max(this.cols, this.rows) / 2) + 8;
  }
}
