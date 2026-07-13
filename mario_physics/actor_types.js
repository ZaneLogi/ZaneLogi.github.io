// ----------------------
// ACTOR_TYPES
// ----------------------
// Type definitions for mobile things — the Type Object pattern. Each entry is
// the blueprint an Actor is built from: its size, its physics constants, and its
// sprite-set. An Actor *is one of* these types; adding a new mobile thing (an
// enemy, a pickup) is a new entry here, not new Actor code.
//
// Physics constants are tuned for 60 FPS; the Actor scales them by (dt * 60) so
// motion is identical at any frame rate.
export const ACTOR_TYPES = {
  mario: {
    size: { w: 24, h: 32 },

    physics: {
      speedWalk: 3.0,   speedRun: 6.0,     // horizontal top speeds
      accelWalk: 0.4,   accelRun: 0.6,     // ground acceleration
      airAccel:  0.2,                       // reduced control while airborne
      decel:     0.8,   skidFriction: 0.2,  // release friction / turn-around brake
      jumpVel:   12,    jumpCut: 3,         // launch impulse / released-early cutoff
      gravity:   0.6,   maxFall: 6.0,       // downward accel / terminal fall speed
    },

    sprites: {
      idle:  { frames: ["mario/mario"] },
      walk:  { frames: ["mario/mario_move0", "mario/mario_move1", "mario/mario_move2"], fps: 10 },
      run:   { frames: ["mario/mario_move0", "mario/mario_move1", "mario/mario_move2"], fps: 10 },
      jump:  { frames: ["mario/mario_jump"] },
      fall:  { frames: ["mario/mario_jump"] },
      skid:  { frames: ["mario/mario_st"] },
      squat: { frames: ["mario/mario"] },
      dead:  { frames: ["mario/mario_death"] },
    },
  },
};
