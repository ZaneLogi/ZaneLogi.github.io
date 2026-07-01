// lunar_lander/physics_arcade.js
//
// The faithful ARCADE flight stepper — one of the pluggable physics models behind
// the stepper contract (CLAUDE.md "Flight-model architecture"). `step(state, input)`
// is the SOLE owner of per-frame motion writes (SHIP, SHPINE, VELX/VELY, throttle,
// FUEL, SCROLL/SCRADD) — the mutation discipline in state.js. Routine-level
// translation of the source (A34573.1A; research_physics.md): ROTSHP, THRLVL/FRCMLT
// thrust, ACCEL integration, FRICTN, BURN, and the PLYMOD profiles (§7). FLOAT math
// with the REAL constants (target b) — ratios faithful, not bit-exact.
//
// Headline motion model (§9): the ship moves within a screen dead-zone window (velocity →
// posX/posY at the faithful 1/16384 scale); at the window edge the excess scrolls the scape
// (SCROLL/SCRADD). Both scapes handled — MINOR adds the ×4 position step + the vertical dead-zone;
// the major↔minor zoom TRANSITION itself lives in landscape.updateZoom (§9.1). DEFERRED: the
// faithful DECODE collision + landing verdict (step 6 — the zoom TRIGGER currently uses the
// altitude proxy, landscape.altitudeAt); over-rotation — SHIP clamped to [0,16] only in Training
// (source ROT.NI :868), others wrap the full circle.
//
// SHIP convention matches the SOURCE: 8 = upright (thrust straight up), 0/16 = on its
// side, 24 = upside-down — proven by FRCMLT :1758, abort-to-vertical :994, and the
// Training clamp ROT.NI → SHIP∈[0,16] (research_physics.md §11 SHIP-convention note).
// So source constants compared against SHIP (e.g. the landing gate {7,8,9}) port
// verbatim — no offset.

import { GEOM, isMajor } from './state.js';

// Source constants (A34573.1A). TRSTAB = thrust magnitude per level 0-15 (hover at 8).
const TRSTAB = [0, 2, 5, 8, 11, 13, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28];
const FUELFAC = 0xDA;                // 218 — fuel use factor (:48)
const FLFAC2  = 0x90;                // 144 — fuel factor for Prime (game #2) (:49)
const STEP = (Math.PI * 2) / 32;     // SHIP → radians (11.25°/step); SHIP 8 = upright

// Velocity → position scale — FAITHFUL to the source's fixed-point (no fudge factor).
// VELX/VELY are the source's 16-bit velocity (:247); ACCEL subtracts GRAVITY (17) and adds the
// thrust component per frame IN THESE UNITS. Position: the source adds the velocity HIGH byte
// (VELY>>8) to YCURADJ (= screen<<6), and the on-screen point is YCURADJ>>6 (POSTMOD/ROTATE),
// so the net screen move is velocity>>14 = velocity/16384 per frame (ACCEL :1948-1969). Gravity
// accel is thus 17/16384 ≈ 0.001 px/frame² — a very gentle lunar descent. In the MINOR (zoom-in)
// view the source multiplies velocity ×4 for the position step (ACCEL :1953-8) — the ship travels
// 4× as many screen px for the same world motion; the edge overflow then scrolls ¼ as much world
// per screen px, so the WORLD scroll rate is identical in both scapes (they're duals).
const POS_SCALE = 1 / 16384;         // 16-bit velocity → screen px per tick (source >>8 then >>6)

// SCAPCHG dead-zone (§9): the ship drifts within a screen window; excess scrolls the scape.
// WORLD_PER_SCREEN (world units per screen px of overflow) = 1/camera.scale → 4 major / 1 minor.
// The window bounds (logical/posX units) are shared in state.GEOM. Vertical window is MINOR-only
// (the far view shows the whole terrain; major vertical is free + the off-top reset in landscape).
const WIN_XMIN = GEOM.WIN_XMIN, WIN_XMAX = GEOM.WIN_XMAX;
const WIN_YMIN = GEOM.WIN_YMIN, WIN_YMAX = GEOM.WIN_YMAX;
const ROT_RATE = 0.30;               // SHIP units/tick, direct rotation (smooth; float SHIP)
const ROT_ACCEL = 0.030;             // Command angular accel per tick (SHPINE)
const ROT_VMAX  = 0.60;              // Command max angular velocity
const ROT_GAS_FUEL = 0.06;           // fuel/frame while rotating — ROT.GAS subtracts BCD 06 from the
                                     // fractional byte per rotation (:882); = 6 hundredths of a unit
const THRUST_RAMP_TICKS = 2;         // ticks per THRUST level step while ↑ is held/released (provisional feel)

// PLYMOD 0-3 profiles (research_physics.md §7.1). GRAVT = [17,17,34,17]; Prime doubles
// gravity + 1.5× thrust + lower burn; Training has friction; Command has rotational inertia.
const PROFILES = [
  { name: 'Training', gravity: 17, thrustMult: 1,   friction: true,  inertia: false, clamp: true,  burnFactor: FUELFAC },
  { name: 'Cadet',    gravity: 17, thrustMult: 1,   friction: false, inertia: false, clamp: false, burnFactor: FUELFAC },
  { name: 'Prime',    gravity: 34, thrustMult: 1.5, friction: false, inertia: false, clamp: false, burnFactor: FLFAC2  },
  { name: 'Command',  gravity: 17, thrustMult: 1,   friction: false, inertia: true,  clamp: false, burnFactor: FUELFAC },
];

export class ArcadePhysics {
  constructor() { this.frame = 0; this.thrTimer = 0; }

  // Advance one 24 ms tick (= one source frame; no dt scaling — 1 tick == 1 frame).
  step(state, input) {
    const prof = PROFILES[state.PLYMOD] || PROFILES[0];
    this.frame++;

    // ROTSHP: Command carries rotational inertia (SHPINE momentum — keeps turning after
    // release, §8); other modes rotate directly. SHIP is FLOAT (finer thrust angle; the
    // pose fold snaps to the 9 stored poses).
    if (prof.inertia) {
      state.SHPINE += input.rotate * ROT_ACCEL;
      state.SHPINE = Math.max(-ROT_VMAX, Math.min(ROT_VMAX, state.SHPINE));
      state.SHIP += state.SHPINE;
    } else {
      state.SHPINE = 0;
      state.SHIP += input.rotate * ROT_RATE;
    }
    // Training only: clamp to the gameplay half-circle [0,16] (the safe hemisphere
    // centred on upright #8, ROT.NI :868). Cadet/Prime/Command skip the clamp and may
    // over-rotate → wrap the full circle 0-31 (:870); the pose fold renders the
    // upside-down half via yFlip.
    if (prof.clamp) {
      if (state.SHIP <= 0)  { state.SHIP = 0;  state.SHPINE = 0; }
      if (state.SHIP >= 16) { state.SHIP = 16; state.SHPINE = 0; }
    } else {
      state.SHIP = ((state.SHIP % 32) + 32) % 32;
    }

    // THRLVL: the real cabinet's throttle is an analog pot — no software ramp at all, THRLVL
    // just reads its position into THRUST 0-15 each frame (:897). A digital key has no position
    // to read, so we fake the pot with a SPRING-LOADED ramp instead (deviation, by choice): while
    // ↑ is held, THRUST steps up one level every THRUST_RAMP_TICKS ticks; released, it steps back
    // DOWN the same way, from wherever it currently sits (mid-ramp or not) — so letting go early
    // doesn't jump straight to 0. TRSTAB[level] is the thrust magnitude (hover at level 8 = 17 =
    // gravity; full 15 = 28). Out of fuel → no force AND no flame (the level is kept, but nothing
    // fires); state.throttle is the ACTUAL output (0..1) that drives the flame, so it goes to 0
    // when the tank is empty.
    if (++this.thrTimer >= THRUST_RAMP_TICKS) {
      this.thrTimer = 0;
      if (input.thrHeld) { if (state.THRUST < 15) state.THRUST++; }
      else                { if (state.THRUST > 0)  state.THRUST--; }
    }
    const outOfFuel = state.FUEL <= 0;
    const mag = outOfFuel ? 0 : TRSTAB[state.THRUST] * prof.thrustMult;
    state.throttle = outOfFuel ? 0 : state.THRUST / 15;   // ACTUAL output → drives the flame; 0 (no flame) when empty

    // FRCMLT: decompose thrust along the ship's up-axis (SHIP 8 = up → +Y).
    const tilt = (state.SHIP - 8) * STEP;
    const xThrust = Math.sin(tilt) * mag;
    const yThrust = Math.cos(tilt) * mag;

    // ACCEL: per-profile gravity (Y-only), inertial coasting, NO global drag. Source units —
    // thrust (0-28 from TRSTAB, hover at level 8 = 17) vs gravity (17), summed into the 16-bit
    // velocity each frame (:1985-2010). No A_SCALE: the ratio thrust:gravity is already faithful.
    state.VELX += xThrust;
    state.VELY += yThrust - prof.gravity;

    // FRICTN (Training only): every 16 frames, velocity drag VEL −= VEL/32 (:414-418).
    if (prof.friction && this.frame % 16 === 0) {
      state.VELX -= state.VELX / 32;
      state.VELY -= state.VELY / 32;
    }

    // BURN (:1794) — the FAITHFUL rate: fuel used/frame = MULTPA(burnFac, TRSTAB[THRUST]) =
    // floor(burnFac · TRSTAB[THRUST] / 256), a value in HUNDREDTHS of a unit (it's subtracted
    // from FUEL's fractional low byte), so ÷100 → whole units. burnFac = 218 (FUELFAC) normally,
    // 144 (FLFAC2) for Prime — Prime burns less per thrust-unit but thrusts 1.5× (ACCEL). Uses
    // the RAW TRSTAB value (NOT ×thrustMult). Full throttle = floor(218·28/256)/100 = 0.23/frame
    // (~9.6/s); hover (lvl 8) = 0.14/frame (~5.8/s). Plus ROT.GAS while rotating.
    if (!outOfFuel) {
      state.FUEL -= Math.floor(prof.burnFactor * TRSTAB[state.THRUST] / 256) / 100;
      if (input.rotate) state.FUEL -= ROT_GAS_FUEL;   // ROT.GAS (:882); float-rotation → ~per-frame (deviation)
      if (state.FUEL < 0) state.FUEL = 0;
    }

    // Motion → the ship's on-screen position (the XCURADJ/YCURADJ analog; the lander renders at
    // posX/posY directly, POSTMOD: screen = XCURADJ>>6). MINOR travels ×4 on screen (ACCEL :1953);
    // the edge overflow then scrolls WORLD_PER_SCREEN = 1/scale (4 major / 1 minor) world units.
    const major = isMajor();
    const worldPerScreen = major ? 4 : 1;
    const posMul = major ? 1 : 4;                                     // ×4 minor position step
    const dx = state.VELX * POS_SCALE * posMul, dy = state.VELY * POS_SCALE * posMul;   // screen px this tick
    // HORIZONTAL dead-zone: the ship drifts across the screen and the terrain holds still until it
    // hits an edge, where the excess scrolls the scape (§9; ACCEL adds to XCURADJ unless scrolling).
    let nx = state.posX + dx;
    if      (dx > 0 && nx > WIN_XMAX) { state.SCROLL += (nx - WIN_XMAX) * worldPerScreen; nx = WIN_XMAX; }  // right edge → scroll
    else if (dx < 0 && nx < WIN_XMIN) { state.SCROLL += (nx - WIN_XMIN) * worldPerScreen; nx = WIN_XMIN; }  // left  edge → scroll
    state.posX = nx;
    // VERTICAL: MINOR gets the faithful dead-zone (§9) — the ship stays in [WIN_YMIN, WIN_YMAX] and
    // the excess scrolls SCRADD, so the ground rises as it descends / recedes as it climbs. MAJOR
    // (far view, whole terrain on screen) keeps free vertical movement; its ascent past the ceiling
    // is the off-top reset handled in landscape.updateZoom (descent triggers the zoom-in first).
    let ny = state.posY + dy;
    if (major) {
      state.posY = Math.max(28, ny);                                 // free (bottom-guarded; top = off-top reset)
    } else {
      if      (dy < 0 && ny < WIN_YMIN) { state.SCRADD += (ny - WIN_YMIN) * worldPerScreen; ny = WIN_YMIN; }  // descend → ground rises
      else if (dy > 0 && ny > WIN_YMAX) { state.SCRADD += (ny - WIN_YMAX) * worldPerScreen; ny = WIN_YMAX; }  // climb → ground recedes
      state.posY = ny;
    }
  }
}
