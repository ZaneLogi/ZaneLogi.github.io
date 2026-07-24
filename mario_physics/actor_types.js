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
import { buildPlayerFrames } from './sprite_frames.js';
import { PLAYER_COLORS } from './assets/dat_tiles.js';

// Mario's frames, composed from the ROM's CHR at load. PLAYER_COLORS[0] is his
// palette; [1] is Luigi and [2] fiery, both unused so far.
//
// A frame is 16x32 NES px — the CHR's own size, not a choice. The world is 32 px a
// tile, so Mario is half a tile wide and reads small against the blocks. That is
// deliberate: he moves at exactly SMB's speed through a larger world. See CLAUDE.md
// "Movement model".
const MARIO = buildPlayerFrames(PLAYER_COLORS[0]);

export const ACTOR_TYPES = {
  mario: {
    // The sprite block, 16x32 — the CHR's, not a choice. `size` is the drawn extent;
    // `probes` below is the collision geometry, and they are different things.
    size: { w: 16, h: 32 },

    // Where this actor touches the world. SMB has no hitbox: it point-samples the
    // block buffer at fixed offsets from the sprite block's origin, read from
    // BlockBuffer_X_Adder / _Y_Adder (small Mario is base $0e). These are ACTOR
    // space — they do not scale with the tile. See docs/research_smb_collision.md.
    //
    //   feet: TWO probes, and that is ledge forgiveness — supported if EITHER
    //         finds solid, which a bounding box cannot express.
    //   head: ONE, at centre. Not two corners.
    //   sides: x is fixed, inset 2 px from the block edge. Small Mario's upper and
    //         lower side probes collapse to the same y because he is 16 px tall;
    //         big Mario's would be ys: [8, 24].
    //
    // Effective extent: x 2..13 (12 wide), y 18..32 — which is his ink, so the
    // collision matches what you see rather than a box inherited from a trimmed BMP.
    // head/feet are horizontal rows (one y, many xs); left/right are vertical
    // columns (one x, many ys).
    probes: {
      head:  { xs: [8], y: 18 },
      feet:  { xs: [3, 12], y: 32 },
      left:  { x: 2,  ys: [24] },
      right: { x: 13, ys: [24] },
    },

    // Behaviour, in three layers: `control` perceives and produces intent; `move`
    // turns intent + contacts into velocity; `animate` reads the result and names
    // a look. Adding a kind of actor is naming a trio here, not writing engine code.
    control: keyboard,
    move: marioMovement,
    animate: marioAnimation,

    // Coins and other pickup triggers are the player's: this marks Mario as a
    // collector, so an enemy overlapping a coin does not pocket it (a trigger's
    // onOverlap reads it). SMB: coin collection lives in the player's routine.
    collectsPickups: true,

    physics: {
      // Horizontal — SMB's. Top speed is a hard *clamp*, not an equilibrium:
      // one linear adder pushes toward the held direction and the clamp stops it.
      // Two *independent* indices choose the clamp and the rate (X_Physics), and
      // a single routine applies the rate for accel AND decel (ImposeFriction).
      //
      // The ROM's bytes, converted: a speed byte is 1/16 px/frame; a rate byte is
      // 1/256 of a speed unit per frame. NO further scaling — these are SMB's own
      // numbers, so each value below equals the byte its comment cites.
      // Derivations live in docs/research_smb_physics.md.
      maxWalkSpeed:   1.5,           // MaxRightXSpdData[1] $18=24 → 24/16
      maxRunSpeed:    2.5,           // MaxRightXSpdData[0] $28=40 → 40/16
      walkAccel:      0.037109375,   // FrictionData[1] $98=152 → 152/256/16
      runAccel:       0.0556640625,  // FrictionData[0] $e4=228 → 228/256/16
      overWalkDecel:  0.05078125,    // FrictionData[2] $d0=208 → 208/256/16
      skidFactor:     2,             // dimensionless — facing ≠ movingDir doubles the adder
      runTimerFrames: 10,            // $0a — TICKS, not a distance; run physics linger

      // Thresholds, same speed-byte conversion (1/16 px/f).
      airRunThreshold:       1.5625, // $19=25 — airborne keeps run physics above this
      overWalkThreshold:     2.0625, // $21=33 — above this, the faster bleed-down
      runningSpeedThreshold: 1.75,   // $1c=28 — gates runningSpeed
      skidStopThreshold:     0.6875, // $0b=11 — a skid below this snaps to a stop

      runAnimSpeed: 2.45,   // |vx| above this (while the run key is held) → run anim.
                            // Ours, not SMB's — SMB times the walk cycle differently.
      skidAnimSpeed: 0.5625, // $09=9 → 9/16. ProcOnGroundActs will not show the skid
                             // frame below this, however the physics reads the skid.
                             // Distinct from skidStopThreshold ($0b) above, which is
                             // where ProcSkid snaps a slow skid to a dead stop.

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
      // px/frame (not 1/16), a gravity byte is 1/256 px/frame².
      jumpSpeedBands: [0.5625, 1.0, 1.5625, 1.75],                    // $09 $10 $19 $1c ÷16
      launchSpeeds:   [-4, -4, -4, -5, -5],                           // PlayerYSpdData $fc=-4 / $fb=-5
      jumpGravities:  [0.125, 0.125, 0.1171875, 0.15625, 0.15625],    // JumpMForceData — button held
      fallGravities:  [0.4375, 0.4375, 0.375, 0.5625, 0.5625],        // FallMForceData — released
      jumpGraceRise:  1,         // DiffToHaltJump $01 — px; protects the launch tick
      spawnFallGravity: 0.15625, // Entrance_GameTimerSetup seeds VerticalForceDown = $28,
                                 // so a fall you never jumped into is gentler than any jump.

      maxFall: 4, // $04 = 4 px/f, verbatim. There is deliberately no *upward* clamp:
                  // the rise-limiting half of ImposeGravity is skipped for the player
                  // (it enters with A=0), which is what lets the −5 launch stand.
    },

    // Our states onto SMB's frames. `run` reuses the walk cycle because SMB has no
    // separate run art — it only times the cycle faster.
    //
    // `fall` is NOT a frame: ActionFalling loads the WALK offset and reaches
    // GetCurrentAnimOffset, which reads PlayerAnimCtrl without advancing it. So a
    // walked-off-a-ledge fall is the walk cycle stopped mid-stride — hence the same
    // three frames as `walk`, with `freeze` holding whichever one was showing. A
    // *jump* never reaches here (Player_State stays $01 for the whole arc), so the
    // jump frame covers rise and descent alike.
    sprites: {
      idle:  { frames: [MARIO["small player standing"]] },
      walk:  { frames: [MARIO["small walking frame 1"], MARIO["small walking frame 2"], MARIO["small walking frame 3"]], fps: 10 },
      run:   { frames: [MARIO["small walking frame 1"], MARIO["small walking frame 2"], MARIO["small walking frame 3"]], fps: 10 },
      jump:  { frames: [MARIO["small jumping"]] },
      fall:  { frames: [MARIO["small walking frame 1"], MARIO["small walking frame 2"], MARIO["small walking frame 3"]], freeze: true },
      skid:  { frames: [MARIO["small skidding"]] },
      squat: { frames: [MARIO["small player standing"]] },
      dead:  { frames: [MARIO["small killed"]] },
    },
  },

  // A Goomba: walks forward, turns around on hitting something, falls off
  // ledges. Entirely a table entry — the trio it names already existed, and no
  // engine code knows a Goomba exists.
  //
  // Still legacy BMP art at 2x (32x32) and still on box-derived probes: it names no
  // `probes`, so resolveCollision falls back to its `size` corners, which reproduce
  // the old box model exactly. When enemies are ported it wants EnemyGraphicsTable's
  // 2x3 block and SMB's enemy probe — a SINGLE bottom-middle point (adder $15, at
  // (8,24)), where the player gets two feet. That one probe is why SMB's enemies tip
  // over the moment their midpoint clears a ledge, and adopting it is a real
  // behaviour change, not a port detail. See docs/research_smb_collision.md.
  goomba: {
    size: { w: 32, h: 32 },

    control: reactiveWalker,
    move: constantWalk,
    animate: alwaysWalk,

    physics: {
      speed: 0.42,   // constant, not a top speed — there is no accel to reach it
      gravity: 0.24, // shared with Mario: gravity is the world's, not his
      maxFall: 4,
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
