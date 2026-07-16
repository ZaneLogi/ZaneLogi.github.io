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
      // Horizontal — SMB's. Top speed is a hard *clamp*, not an equilibrium:
      // one linear adder pushes toward the held direction and the clamp stops it.
      // Two *independent* indices choose the clamp and the rate (X_Physics), and
      // a single routine applies the rate for accel AND decel (ImposeFriction).
      //
      // The ROM's bytes, converted: a speed byte is 1/16 px/frame; a rate byte is
      // 1/256 of a speed unit per frame. Both then ×2 for our 32 px tile against
      // SMB's 16 px brick. Derivations live in docs/research_smb_physics.md.
      maxWalkSpeed:   3.0,          // MaxRightXSpdData[1] $18=24 → 1.5 px/f
      maxRunSpeed:    5.0,          // MaxRightXSpdData[0] $28=40 → 2.5 px/f
      walkAccel:      0.07421875,   // FrictionData[1] $98=152
      runAccel:       0.111328125,  // FrictionData[0] $e4=228
      overWalkDecel:  0.1015625,    // FrictionData[2] $d0=208
      skidFactor:     2,            // facing ≠ movingDir doubles the adder
      runTimerFrames: 10,           // $0a — run physics linger after the key drops

      // Thresholds, same speed-byte conversion (1/16 px/f, ×2).
      airRunThreshold:       3.125, // $19=25 — airborne keeps run physics above this
      overWalkThreshold:     4.125, // $21=33 — above this, the faster bleed-down
      runningSpeedThreshold: 3.5,   // $1c=28 — gates runningSpeed
      skidStopThreshold:     1.375, // $0b=11 — a skid below this snaps to a stop

      runAnimSpeed: 4.9,    // |vx| above this (while the run key is held) → run anim

      // Jump — SMB's: an *impulse*, not a thrust. The launch velocity is set once
      // and gravity does everything after. Holding the button does not push — it
      // selects a *weaker gravity* while rising. Release, or crest into a fall,
      // and the strong one swaps in permanently (re-pressing mid-air buys nothing).
      //
      // Five bands, indexed by |vx| at the moment of the press. SMB indexes on
      // Player_XSpeedAbsolute — a two's-complement absolute value — which is what
      // makes the run-jump boost symmetric by speed rather than by facing.
      // Bands 0 and 1 are identical in the ROM; five entries, three behaviours.
      //
      // Vertical scales differently from horizontal: a speed byte here is a whole
      // px/frame (not 1/16), a gravity byte is 1/256 px/frame². Both then ×2.
      jumpSpeedBands: [1.125, 2.0, 3.125, 3.5],                // $09 $10 $19 $1c
      launchSpeeds:   [-8, -8, -8, -10, -10],                  // PlayerYSpdData $fc/$fb
      jumpGravities:  [0.25, 0.25, 0.234375, 0.3125, 0.3125],  // JumpMForceData — button held
      fallGravities:  [0.875, 0.875, 0.75, 1.125, 1.125],      // FallMForceData — released
      jumpGraceRise:  2,        // DiffToHaltJump $01 — protects the launch tick
      spawnFallGravity: 0.3125, // Entrance_GameTimerSetup seeds VerticalForceDown = $28,
                                // so a fall you never jumped into is gentler than any jump.

      maxFall: 8, // $04 = 4 px/f. There is deliberately no *upward* clamp: the
                  // rise-limiting half of ImposeGravity is skipped for the player
                  // (it enters with A=0), which is what lets the −10 launch stand.
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
