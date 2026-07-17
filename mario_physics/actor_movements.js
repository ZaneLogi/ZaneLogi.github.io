// ----------------------
// Movements
// ----------------------
// The lower half of an actor's behaviour: intent + contacts -> velocity.
//
// A movement function is world-agnostic — it sees the intent its controller
// produced and last tick's `contacts`, never the map and never another actor.
// That is what keeps an actor drivable from synthetic contacts with no world at
// all, which is how test/fingerprint.js measures them.
//
// An ACTOR_TYPES entry names one of these as its `move`. The constants it reads
// come from that same entry, so two types can share a movement function and
// differ only in numbers.

/**
 * Constant-velocity walking, and nothing else. No accel, no friction, no jump —
 * a Goomba is not a slower Mario, it moves at exactly one speed or not at all.
 * That is the point of movement riding on the type: sharing Mario's model here
 * and tuning the constants could not produce this.
 *
 * @param {Actor}  a
 * @param {object} intent  { left, right } from the type's controller
 * @param {number} dt      fixed timestep, in seconds
 */
export function constantWalk(a, intent, dt) {
  const step = dt * 60;

  if (intent.right) { a.vx = a.speed; a.facing = 1; }
  else if (intent.left) { a.vx = -a.speed; a.facing = -1; }
  else a.vx = 0;

  // Gravity on the same terms as everything else: skipped while resting, so a
  // walker that steps off a ledge falls, and one on the floor stays put.
  if (!a.contacts.ground) {
    a.vy += a.gravity * step;
    if (a.vy > a.maxFall) a.vy = a.maxFall;
  }
}

/**
 * Mario's model, ported from Super Mario Bros.' 6502 source. Horizontal is a
 * linear adder toward the held direction stopped by a hard clamp (top speed is the
 * clamp, not an equilibrium); the jump is an impulse whose height comes from
 * *selecting* a gravity while rising, not from continued thrust. The step numbers
 * below follow the source's per-frame order — see docs/research_smb_physics.md.
 *
 * @param {Actor}  a       the actor to move
 * @param {object} intent  { left, right, run, jump } from the type's controller
 * @param {number} dt      fixed timestep, in seconds
 */
export function marioMovement(a, intent, dt) {
  const grounded = a.contacts.ground;
  const step = dt * 60;

  // --- HORIZONTAL MOVEMENT ---
  // SMB's model, kept in the source's own order — because the order is load-
  // bearing. Several reads below are one tick stale by construction, and SMB's
  // routine names actively lie about which layer they belong to:
  //
  //   0. the frame timers tick     (DecTimers, in NMI, before any game logic)
  //   1. CheckForJumping / InitJS  the launch — chosen from LAST tick's |vx|
  //   2. X_Physics                 picks the clamp and the rate, from LAST tick
  //   3. GetPlayerAnimSpeed        writes runningSpeed; a slow skid dead-stops
  //   4. PlayerFacingDir           follows the held direction
  //   5. ImposeFriction            applies the rate toward the (masked) direction
  //   6. Player_MovingDir          tracks the sign of vx
  //   7. JumpSwimSub / FallingSub  chooses which gravity is live
  //   8. ImposeGravity             applies it
  //
  // Steps 3, 4 and 5 are dispatched by state (JumpEngine): OnGroundStateSub runs
  // all three, while the airborne paths (JumpSwimSub / FallingSub) reach only
  // step 5, and only when a direction is actually held. So in the air the anim-
  // speed routine never fires and an un-held Mario does not decelerate at all.
  //
  // Integration is not here — the resolver owns it. SMB integrates inside movement
  // (MovePlayerHorizontally / MovePlayerVertically); either way the sequence is
  // velocity → integrate → resolve. Gravity being skipped while grounded is what
  // makes the launch tick move the *full* launch velocity, exactly as SMB's first
  // ImposeGravity does — its `y += vy` runs before that frame's `vy += g`.

  // 0. RunningTimer is a frame timer: SMB decrements it before any game logic.
  if (a.runTimer > 0) a.runTimer = Math.max(0, a.runTimer - step);

  // SMB reads the raw controller bits for the index derivation and for facing.
  // Only ImposeFriction masks them (step 5) — a wall changes what Mario *does*
  // without changing which way he is *trying* to go.
  const inputDir = intent.right ? 1 : intent.left ? -1 : 0;

  // 1. JUMP START — a fresh press (down now, up last tick) while grounded. SMB
  //    runs this *before* the horizontal update, so the band is picked from last
  //    tick's speed; reading it after would quietly use a fresher value.
  // Player_State: on the ground is $00, so a landing clears it. This must precede
  // the launch below, which is the thing that sets it.
  if (grounded) a.airborneByJump = false;

  if (intent.jump && !a.prevJump && grounded) {
    const speed = Math.abs(a.vx);
    let band = 0;
    while (band < a.jumpSpeedBands.length && speed >= a.jumpSpeedBands[band]) band++;
    a.vy = a.launchSpeeds[band];        // the impulse — the whole jump, right here
    a.jumpGravity = a.jumpGravities[band];
    a.fallGravity = a.fallGravities[band];
    a.gravityLive = a.jumpGravity;      // weak, until released or cresting
    a.jumpOriginY = a.y;
    a.airborneByJump = true;            // Player_State $01 — holds for the whole arc
  }

  // 2. X_Physics — two *independent* indices: one for the clamp, one for the
  //    rate. `movingDir` and `runningSpeed` are both last tick's values, because
  //    SMB runs PlayerPhysicsSub before GetPlayerAnimSpeed (which writes
  //    runningSpeed) and before the movingDir update at the tail of
  //    PlayerCtrlRoutine. The staleness is the source's, and kept on purpose.
  let clamp = a.maxRunSpeed;
  let rate = a.runAccel;
  let walk = false;
  if (!grounded) {
    walk = Math.abs(a.vx) < a.airRunThreshold; // run physics persist in the air
  } else if (inputDir !== 0 && inputDir === a.movingDir) {
    if (intent.run) a.runTimer = a.runTimerFrames; // SetRTmr
    else if (a.runTimer <= 0) walk = true;        // grace expired → walk physics
  } else {
    walk = true; // no input, or pressing against the way we are already moving
  }
  if (walk) {
    clamp = a.maxWalkSpeed;
    rate = a.walkAccel;
    // Above walk speed, the walk rate is swapped for a faster bleed-down.
    if (a.runningSpeed !== 0 || Math.abs(a.vx) >= a.overWalkThreshold) rate = a.overWalkDecel;
  }
  // Skid — facing against the way we are moving doubles the rate. Both reads are
  // last tick's, as above.
  const skidding = a.facing !== a.movingDir;
  if (skidding) rate *= a.skidFactor;

  // 3. GetPlayerAnimSpeed's physics half — GROUND ONLY. The SMB name lies twice:
  //    it writes runningSpeed, rewrites movingDir and nullifies a slow skid (none
  //    of which is presentation), and it is called from OnGroundStateSub, so the
  //    airborne paths never reach it. Only its animation-timer write is really
  //    presentation, and that is the half that does NOT live here.
  const speedAbs = Math.abs(a.vx);
  if (grounded) {
    if (speedAbs >= a.runningSpeedThreshold) {
      a.runningSpeed = speedAbs;
    } else if (intent.left || intent.right || intent.run) {
      if (inputDir !== 0 && inputDir === a.movingDir) {
        a.runningSpeed = 0;
      } else if (speedAbs < a.skidStopThreshold) {
        // ProcSkid — a skid this slow snaps to a dead stop and re-aims movingDir
        // at facing. The zeroed speed is precisely what protects that write from
        // step 6, which holds while vx is 0.
        a.movingDir = a.facing;
        a.vx = 0;
      }
    }
  }

  // 4. Facing follows the held direction — but only on the ground. SMB sets
  //    PlayerFacingDir in OnGroundStateSub; the airborne path (LRAir) never
  //    touches it, so facing freezes for the whole jump.
  if (grounded && inputDir !== 0) a.facing = inputDir;

  // 5. ImposeFriction — one linear adder toward the held direction, then a hard
  //    clamp. With no direction held, the same routine takes its sign from the
  //    current speed and bleeds toward zero at that same rate.
  //    Grounded it always runs (GndMove falls into it either way); airborne only
  //    if a direction is held (LRAir gates on the controller bits). So letting go
  //    mid-jump *preserves* horizontal speed rather than bleeding it.
  //    The mask is SMB's `and Player_CollisionBits`: a blocked direction never
  //    reaches the physics at all, so Mario does not accelerate into a wall and
  //    get cancelled — as far as this code is concerned, he is not pressing.
  if (grounded || inputDir !== 0) {
    const pushRight = intent.right && !a.contacts.right;
    const pushLeft = intent.left && !a.contacts.left;
    if (pushRight) {
      a.vx += rate * step;
      if (a.vx > clamp) a.vx = clamp;
    } else if (pushLeft) {
      a.vx -= rate * step;
      if (a.vx < -clamp) a.vx = -clamp;
    } else if (a.vx > 0) {
      // Bleeding down, SMB clamps against the *opposite* max — which never bites
      // while the sign holds. So releasing everything at run speed coasts down;
      // only holding a direction re-clamps (above), which snaps 5.0 → 3.0.
      a.vx = Math.max(0, a.vx - rate * step);
    } else if (a.vx < 0) {
      a.vx = Math.min(0, a.vx + rate * step);
    }
    // The stops at zero are ours, not SMB's: its 8-bit speed steps by whole units,
    // lands exactly on 0, and a `beq` parks it there. Float subtraction would sail
    // past and oscillate. Same outcome, different arithmetic.
  }

  // 6. movingDir tracks the sign of vx — and *holds* while vx is exactly 0, which
  //    is what lets ProcSkid's write in step 3 survive.
  if (a.vx > 0) a.movingDir = 1;
  else if (a.vx < 0) a.movingDir = -1;

  // Presentation flags — read only by marioAnimation, never by physics.
  //
  // SMB asks the skid question TWICE, with different answers, and the port needs
  // both. The *physics* skid (`skidding` above, X_Physics) is bare
  // facing ≠ movingDir with no speed gate — that one doubles the adder. The *sprite*
  // gets three more conditions from ProcOnGroundActs:
  //
  //   lda Player_X_Speed / ora Left_Right_Buttons / beq NonAnimatedActs  -> standing
  //   lda Player_XSpeedAbsolute / cmp #$09 / bcc ActionWalkRun           -> walk, too slow
  //   lda Player_MovingDir / and PlayerFacingDir / bne ActionWalkRun     -> same way, no skid
  //
  // Without the first, the flag LATCHES: coast to a dead stop after tapping the
  // opposite way and facing ≠ movingDir can never reconverge — facing only moves on
  // held input, movingDir only while vx ≠ 0 — so Mario stands still skidding forever.
  // (ProcSkid would re-aim movingDir, but it needs a button held, so releasing early
  // skips it.) The second is the $09 gate; it costs about a tick.
  a.isRunning = !!intent.run;
  a.isSkidding = grounded && skidding
    && (a.vx !== 0 || inputDir !== 0)
    && Math.abs(a.vx) >= a.skidAnimSpeed;

  // 7. Which gravity is live (JumpSwimSub for a jump, FallingSub for a plain
  //    fall). This is the whole variable-height mechanism: holding the button
  //    does not lift, it keeps the *weak* gravity while rising. Letting go swaps
  //    in the strong one — and SMB never swaps back, because VerticalForce is
  //    only re-seeded at the next launch. Re-pressing mid-air buys nothing.
  if (a.vy >= 0) {
    a.gravityLive = a.fallGravity;  // cresting into a fall, or never jumped
  } else if (!(intent.jump && a.prevJump)) {
    // Not held *continuously* (SMB ANDs this frame's button with last frame's).
    // The grace exists for the launch tick specifically: on a fresh press the
    // previous-frame bit is necessarily clear, so without it every jump would
    // dump to fall gravity the instant it started. Once he has risen off the
    // origin, the same test becomes the real early-release.
    if (a.jumpOriginY - a.y >= a.jumpGraceRise) a.gravityLive = a.fallGravity;
  }

  // 8. ImposeGravity — skipped while grounded, which is what leaves vy at the
  //    full launch velocity on the tick it is set. Clamped falling only: the
  //    rise-limiting half of the routine is skipped for the player.
  if (!grounded) {
    a.vy += a.gravityLive * step;
    if (a.vy > a.maxFall) a.vy = a.maxFall;
  }

  a.prevJump = intent.jump;
}
