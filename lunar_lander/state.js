// lunar_lander/state.js
//
// Shared mutable game state — the software analog of the source's ZERO PAGE
// (A34573.1A :173-260). One place for the cross-cutting values every module
// reads/writes (SHIP, VELX/Y, FUEL, SCROLL, LUNARNUM, GAMODE, …), the same role
// the 6502's zero page plays. This is the first of the two "seams" the port is
// built on (CLAUDE.md "Planned gameplay module layout": a shared state for the
// zero-page values; the render layer is the other seam — render.js).
//
// Values are the source's own BOOT defaults — no invented numbers (CLAUDE.md
// "no fakes; port the real data flow"). Fields grow as modules need them; this
// is the step-0 core set.

export const state = {
  // --- craft attitude & motion (zero page :174-248) --------------------------
  SHIP:   8,          // ship rotation 0-31 = 11.25°/step (:175); ATRINIT sets 8 = upright (:589)
  THRUST: 0,          // rocket thrust ×.05 (:174)
  VELX:   0, VELY: 0, // velocity X/Y (:247-248), DVG units/tick
  posX:   0, posY: 0, // ship world position (XCURR/YCURR :181-182), DVG units

  // --- resources -------------------------------------------------------------
  FUEL:   0,          // remaining fuel; set from PLYMOD/coin at play start (research_physics.md §6)

  // --- scape scroll & zoom (:232-236) ---------------------------------------
  SCROLL: 0,          // horizontal scroll factor (:234), DVG units
  SCRADD: 0,          // vertical scroll factor (:235)
  LUNARNUM: 0x40,     // lunarscape number; V-bit (bit 6) = zoom state.
                      //   boot = $40 ⇒ MAJOR / zoom-out (ATRINIT path :671-672)

  // --- game / difficulty / sequence -----------------------------------------
  GAMODE: 0,          // 0=attract,10=free-play,20=RTP,40=play,80=land (:196)
  PLYMOD: 0,          // difficulty 0=easy(training) … 3=hard(command) (:201)
  INDEX:  0,          // explosion / abort sequence counter (:237)
  COLFLG: 0,          // collision flag: $80 good land / $C0 hard / $8F crash (:243)
};

// LUNARNUM's V-bit ($40) set ⇒ MAJOR (zoom-out); clear ⇒ MINOR (zoom-in).
// (SCAPE `BIT LUNARNUM / BVS MAJOR` :1098.)
export const isMajor = () => (state.LUNARNUM & 0x40) !== 0;

// The camera. Atari model: the lander stays CENTRED and the WORLD SCROLLS
// (physics.js header; SCROLL/SCRADD). These are the shared camera *values*; the
// DVG→screen transform math lives in render.js (the render seam).
//   scale = DVG units → screen px. Major/zoom-out ≈ 0.25 (fits the 4096-wide
//   loop into the 1024 screen); minor/zoom-in ≈ 1 (close-up). See
//   research_vector_usage.md §3.1 and the landscape.js ¼ derivation.
export const camera = {
  x: 0,               // world DVG X shown at the screen's left edge
  y: 0,               // world DVG Y shown at the screen's bottom edge
  scale: 0.25,        // major/zoom-out default
};
