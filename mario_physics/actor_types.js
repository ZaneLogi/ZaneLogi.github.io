// ----------------------
// ACTOR_TYPES
// ----------------------
// Type definitions for mobile things — the Type Object pattern. Each entry is
// the blueprint an Actor is built from: its size, its physics constants, and its
// sprite-set. An Actor *is one of* these types; adding a new mobile thing (an
// enemy, a pickup) is a new entry here, not new Actor code.
//
// Physics constants are tuned for 60 FPS; the Actor scales them by (dt * 60) so
// motion is identical at any frame rate. Values are px per 1/60 s tick, and an
// on-screen tile is 32 px (this project's TILE_SIZE). The design these encode —
// and its lineage — is described under "Movement model" in CLAUDE.md.
import { keyboard, reactiveWalker } from './actor_controllers.js';
import { marioMovement, constantWalk } from './actor_movements.js';
import { marioAnimation, alwaysWalk } from './actor_animations.js';

export const ACTOR_TYPES = {
  mario: {
    size: { w: 24, h: 32 },

    // Behaviour, in three layers: `control` perceives and produces intent; `move`
    // turns intent + contacts into velocity; `animate` reads the result and names
    // a look. Adding a kind of actor is naming a trio here, not writing engine code.
    control: keyboard,
    move: marioMovement,
    animate: marioAnimation,

    physics: {
      // Horizontal. Top speed is an *emergent* equilibrium of per-tick accel vs.
      // multiplicative friction, not a linear ramp to a cap. The same model runs
      // on the ground and in the air (full air control). Walking settles ≈4.77;
      // sprinting overshoots and pins at the maxSpeed clamp.
      runAccel:     0.098,  // velocity added per tick while a direction is held
      friction:     0.98,   // multiplicative damping applied every tick
      decelMoving:  0.0007, // linear decel while a direction is held
      decelIdle:    0.035,  // linear decel while no direction is held (glide stop)
      maxSpeed:     5.4,    // horizontal clamp
      runAnimSpeed: 4.9,    // |vx| above this (while the run key is held) → run anim

      // Jump. Not an impulse: each held tick adds a *decaying* upward thrust
      // (jumpUnit / jumpLev^jumpMod), so holding longer jumps higher with
      // diminishing returns. Faster running lowers the exponent, raising the jump.
      jumpUnit:     4,      // numerator of the per-tick thrust
      jumpMod:      1.056,  // exponent; scaled down by horizontal speed
      jumpModSpeed: 0.0014, // how much |vx| lowers the exponent (raises the jump)
      maxRise:     -14,     // upward-speed clamp (peak rise velocity)

      // Gravity.
      gravity:      0.48,   // downward accel per tick
      maxFall:      8,      // terminal fall speed
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

  // A Goomba: walks forward, turns around on hitting something, falls off
  // ledges. Entirely a table entry — the trio it names already existed, and no
  // engine code knows a Goomba exists. Sprite is a full tile (32x32), so the
  // hitbox matches it, as Mario's does his.
  goomba: {
    size: { w: 32, h: 32 },

    control: reactiveWalker,
    move: constantWalk,
    animate: alwaysWalk,

    physics: {
      speed: 0.84,   // constant, not a top speed — there is no accel to reach it
      gravity: 0.48, // shared with Mario: gravity is the world's, not his
      maxFall: 8,
    },

    // The two walk frames are exact horizontal mirrors of each other, which is
    // how the original reads as alternating feet. fps is ours, not derived —
    // see the movement model note in CLAUDE.md.
    sprites: {
      walk: { frames: ["goomba/goombas_0", "goomba/goombas_1"], fps: 6 },
      dead: { frames: ["goomba/goombas_ded"] },
    },
  },
};
