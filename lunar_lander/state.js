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
//
// WHO WRITES WHAT (shared mutable state needs this — keep it current):
//   • lifecycle transitions (newGame; later land/crash/game-over) → the named
//     functions in THIS file — grep here for the "big" changes.
//   • per-frame motion (SHIP, THRUST, VELX/VELY, posX/posY, FUEL) → the physics
//     stepper ONLY (one hot-path owner).
//   • SCROLL/SCRADD/camera + LUNARNUM → landscape + the zoom transition.
//   • COLFLG → the collision verdict (collision.js).
//   Reads are free anywhere; writes stay with their owner above.

export const state = {
  // --- craft attitude & motion (zero page :174-248) --------------------------
  SHIP:   8,          // ship rotation (float; 0-31 = 11.25°/step, :175; 8 = upright); ATRINIT sets 8 (attract)
  SHPINE: 0,          // rotational-inertia angular velocity, Command mode (:176)
  THRUST: 0,          // rocket thrust ×.05 (:174)
  throttle: 0,        // smoothed throttle 0..1 (physics owns it; drives thrust magnitude + flame)
  VELX:   0, VELY: 0, // velocity X/Y (:247-248), DVG units/tick
  posX:   0, posY: 0, // ship position WITHIN its screen window (XCURADJ/YCURADJ analog, :178),
                      // DVG units, Y-up; the on-screen draw point = this directly (POSTMOD does
                      // XCURADJ>>6, and we hold posX/posY already un-scaled). NOT a world/terrain
                      // position and NOT the scape scroll — the scape offset is SCROLL/SCRADD.

  // --- resources -------------------------------------------------------------
  FUEL:   0,          // remaining fuel; set from PLYMOD/coin at play start (research_physics.md §6)
  SCORE:  0,          // game score (:296); BCD in source, plain int here. Scoring lands with collision (step 6)

  // --- game clock (:271-293) -------------------------------------------------
  // GMTIME = the MM:SS the HUD shows; TIMVAL counts NMIs down to one game-second.
  // Ticked by tickClock() below (the source's NMI handler A34573.1D:360, PLAY only).
  GMTIME_S: 0,        // seconds 0-59 (GMTIME, BCD in source)
  GMTIME_M: 0,        // minutes  (GMTIME+1)
  TIMVAL: 250,        // frame/second counter (:271) — counts SECCNT NMIs to one second

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

// Game-clock constants (A34573.1A :56/:59). One source frame = FRMECNT NMIs; one
// game-second = SECCNT NMIs. Keeping TIMVAL in NMI units (decrement FRMECNT per
// 24 ms tick) makes the second boundary land exactly where the hardware's does.
const SECCNT = 250, FRMECNT = 6;

// Advance the game clock one tick, PLAY only (the source's NMI increment, D:360).
// TIMVAL counts down SECCNT NMIs; on rollover, GMTIME seconds++ (minute carry).
// Minutes cap at 99 to stay in the 2-digit MM field.
export function tickClock() {
  state.TIMVAL -= FRMECNT;
  if (state.TIMVAL > 0) return;
  state.TIMVAL += SECCNT;
  if (++state.GMTIME_S >= 60) { state.GMTIME_S = 0; if (state.GMTIME_M < 99) state.GMTIME_M++; }
}

// LUNARNUM's V-bit ($40) set ⇒ MAJOR (zoom-out); clear ⇒ MINOR (zoom-in).
// (SCAPE `BIT LUNARNUM / BVS MAJOR` :1098.)
export const isMajor = () => (state.LUNARNUM & 0x40) !== 0;

// GAMODE bit $40 set ⇒ PLAY (vs attract/idle). (:196; DOGAME.)
export const isPlaying = () => (state.GAMODE & 0x40) !== 0;

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

// New Game — the IDLE→PLAY lifecycle transition (the PLYINIT analog, :609-673).
// Every "big" state reset lives HERE (one findable place) so external modules don't
// scatter state writes. All seed values are the source's own (research_physics.md §14).
//
// INTXCUR/INTYCUR (:3747-8) store the ADJUSTED-window position ×$40 (×64), so the logical
// seed is (64, 682) DVG **Y-UP**. The source draws the ship at XCURR/YCURR = XCURADJ>>6
// (POSTMOD/ROTATE :1295/:2019) = that same (64, 682) — i.e. the ×$40 form shifted back down,
// so our un-scaled posX/posY ARE the screen point. (64, 682) is upper-LEFT, near the top of the
// 768 field: the ship enters top-left (lying on its side, §14) and drifts in — it is NOT centred
// (SCAPCHG dead-zone window, physics_arcade). The renderer flips Y→canvas at draw (SCREEN_H − y).
// The INVELX/INVELY velocity fixed-point is still finalized at the zoom step.
const INIT_X = 64, INIT_Y = 682;    // INTXCUR/INTYCUR ÷ $40 — source start position, DVG/screen (Y-up)

export function newGame(settings) {
  state.PLYMOD = settings.plymod;
  state.FUEL   = settings.startFuel;
  // INVELX/INVELY (:3749-50, hex) copied into VELX/VELY by PLYINIT (:628-636); REINIT clears
  // the sign bytes → both POSITIVE = rightward / up (SCAPCHG :2683/:2703). Source 16-bit units
  // (screen px = velocity/16384/tick): VELX 12800 ⇒ ~0.78 px/tick rightward drift; VELY 16 is a
  // negligible up-seed (~0.001 px/tick) that gravity (−17/tick) overtakes on the first tick.
  state.VELX = 0x3200;   // INVELX = $3200 = 12800 — initial rightward drift (the ship enters and drifts in)
  state.VELY = 0x10;     // INVELY = $0010 = 16     — ~0 vertical; descent begins immediately
  state.THRUST = 0; state.throttle = 0;   // throttle level 0-15 (dialed by ↑/↓); starts at idle
  state.SHIP = 16;                   // ON ITS SIDE, heading right (PLYINIT :651, decimal 16);
                                     // upright is SHIP 8 — the ship enters sideways and the
                                     // player rotates it upright (MAME-confirmed; §14).
  state.SHPINE = 0;                  // no rotational momentum at start
  state.posX = INIT_X;
  state.posY = INIT_Y;
  state.SCROLL = 0; state.SCRADD = 0;  // scape scroll cleared (REINIT :657)
  state.INDEX = 0; state.COLFLG = 0;
  state.SCORE = 0;                  // fresh score (:351-352)
  state.GMTIME_S = 0; state.GMTIME_M = 0; state.TIMVAL = 250;  // clear mission time (:640)
  state.LUNARNUM = 0x40;            // major / zoom-out (boots high; REINIT :672)
  state.GAMODE = 0x40;             // → PLAY (PLYINIT :646)
}

// Reset to the boot / attract stage (isPlaying() → false; SPACE re-launches). The
// PLAY→IDLE lifecycle transition; the caller (main.js) re-frames the camera to major.
export function toIdle() {
  state.GAMODE = 0;                 // attract / idle
  state.SCROLL = 0; state.SCRADD = 0;
}
