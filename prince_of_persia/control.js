// control.js — the input->transition layer (a port of SDLPoP control_kid, seg005.c).
// KEY: this is NOT a new state machine. The states + their intrinsic transitions already
// live in seqtbl.js / playseq.js (a sequence, and its jmps, ARE a state). This layer only
// reads input at decision-point frames and picks which sequence to START next — exactly
// what control_kid does. GPLv3 (see NOTICE).
//
// The wall/edge checks (forward_pressed, safe_step) need to consult the world, so controlKid takes
// a `world` object providing world.edgeDistance() -> { edgeType, distance } (a port of
// get_edge_distance, seg004.c:378 — the tile ahead + sub-tile distance to it). player.js binds it.
import { startSeq, ACT_BUMPED, ACT_IN_FREEFALL } from './playseq.js';
import { EDGE_WALL } from './collision.js';

export const HELD = -1, RELEASED = 0, IGNORE = 1;   // CONTROL_HELD / _RELEASED / _IGNORE (types.h:1405)
export const FWD = 1, NONE = 0, BACK = -1;          // control_x, facing-relative (symbolic; sign vs source irrelevant — compared by name)

// A per-tick input snapshot, made FACING-RELATIVE upstream: the read layer converts the
// absolute L/R arrows + ch.direction into x = FWD/NONE/BACK, so the handlers never see
// left/right — only forward/backward. That is what makes "left arrow while running right"
// read as BACK (and drive a runturn) with no special-casing here.
export const makeControl = () => ({ x: NONE, forward: RELEASED, backward: RELEASED,
                                    up: RELEASED, down: RELEASED, shift: RELEASED, shift2: RELEASED });

// control_kid dispatch (seg005.c:262-288): the CURRENT FRAME selects the handler.
export function controlKid(ch, c, world) {
  // control() gate (seg005.c:264): while BUMPED or IN FREEFALL the char is NOT
  // controllable — the source does release_arrows() and dispatches nothing. This is
  // what lets the medium/hard-land crouch (which runs at action 5, bumped) play its OWN
  // dy-compensated recovery instead of being hijacked into stand-up. Only the SOFT-land
  // crouch is controllable, because softland deliberately switches to action 1 at its
  // crouch (seq_37 `softland_crouch`), so it falls through this gate. Without it, medland's
  // frame-109 crouch triggered controlCrouched -> `standup` (no dy), leaving the prince
  // standing ~2 internal-y units above the floor (a visible gap after a medium land).
  if (ch.action === ACT_BUMPED || ch.action === ACT_IN_FREEFALL) {
    c.forward = c.backward = c.up = c.down = RELEASED;   // release_arrows (seg006.c:1529): clear the latch
    return;
  }
  const f = ch.frame;
  if (f === 15 || (f >= 50 && f < 53)) controlStanding(ch, c, world);  // stand / end-of-turn
  else if (f === 48)                   controlTurning(ch, c);          // mid-turn (frame 48)
  else if (f < 4)                      controlStartrun(ch, c);         // startrun accel 1-3
  else if (f >= 67 && f < 70)          controlJumpup(ch, c);           // start jump up (frames 67-69)
  else if (f < 15)                     controlRunning(ch, c, world);   // run cycle 4-14
  else if (f >= 87 && f < 100)         controlHanging(ch, c, world);   // hanging from a ledge (87-99)
  else if (f === 109)                  controlCrouched(ch, c, world);  // crouch
}

// control_standing (seg005.c:343): Shift+forward = careful step (safe_step); forward = run, or a step
// if near a wall (forward_pressed); forward+up = standing jump; backward = turn; up = jump-up / grab a
// ledge above. (Down/crouch is still later.)
function controlStanding(ch, c, world) {
  ch.testing = 0;                     // reaching a stand decision ends any prior test-foot lean
  // seg005.c:344 — Shift (both the raw shift and the latched shift2) over a sword/potion picks it up
  // (crouches on the first press, grabs on the second). check_get_item returns false when not near an
  // item, so this falls through to the normal Shift handling below (careful step, etc.) — no conflict.
  if (c.shift === HELD && c.shift2 === HELD && world.getItem()) return;
  if (c.shift === HELD) {
    if (c.backward === HELD) backPressed(ch, c);
    else if (c.up === HELD) world.jumpUp();                              // shift+up -> up_pressed (seg005.c:378)
    else if (c.down === HELD) world.downPressed();                       // shift+down -> down_pressed (seg005.c:380)
    else if (c.x === FWD && c.forward === HELD) safeStep(ch, c, world);  // shift+forward -> safe_step (seg005.c:383)
  } else if (c.forward === HELD) {
    if (c.up === HELD) standingJump(ch, c);   // up+forward from stand -> standing (horizontal) jump (seg005.c:386)
    else forwardPressed(ch, c, world);
  } else if (c.backward === HELD) {
    backPressed(ch, c);
  } else if (c.up === HELD) {
    if (c.forward === HELD) standingJump(ch, c);   // symmetric (seg005.c:394); c.forward isn't HELD in this branch, so effectively up-only
    else world.jumpUp();              // up alone -> up_pressed -> check_jump_up (seg005.c:393): the vertical jump / climb
  } else if (c.down === HELD) {
    world.downPressed();              // down alone -> down_pressed (seg005.c:399): climb down / crouch
  } else if (c.x === FWD) {
    // seg005.c:401 fall-through: the forward key is still physically HELD but the latch is IGNORE (a
    // prior safe_step disabled auto-repeat). Re-enter forward_pressed; its HELD-gate does nothing near
    // a wall -> the hold SETTLES. This is the half of the latch the clone was missing.
    forwardPressed(ch, c, world);
  }
}

// forward_pressed (seg005.c:566): if a WALL is within `distance < 8`, step to it instead of running
// (the source's exact rule); otherwise start a run. `world.edgeDistance()` = get_edge_distance
// (player.js). This is the run-gate that used to be `blockedForward` — now the near-wall case
// safe_steps flush to the wall (no bump, no parking back) instead of just standing.
function forwardPressed(ch, c, world) {
  const { edgeType, distance } = world.edgeDistance();
  if (edgeType === EDGE_WALL && distance < 8) {
    // near a wall: step instead of run — but ONLY on a fresh press (seg005.c:579). A latched (IGNORE)
    // hold reaching here via the control_x fall-through does nothing => the prince SETTLES at the gap.
    if (c.forward === HELD) safeStep(ch, c, world);
  } else {
    startSeq(ch, 'startrun');                                        // seq_1_start_run
  }
}

// back_pressed (seg005.c:549): turn to face the other way. FIRST does `control_backward =
// release_arrows()` — release_arrows() zeroes forward/up/down to RELEASED and returns 1, which lands in
// control_backward as IGNORE, so the turn is a ONE-SHOT (read_user_control holds it IGNORE until the
// key is released, then re-arms). WITHOUT this the latched HELD backward re-fires the turn every tick
// and the prince spins forever with no key pressed (regression fixed 2026-07-08).
function backPressed(ch, c) {
  c.forward = RELEASED;
  c.backward = IGNORE;                                    // control_backward = release_arrows()
  startSeq(ch, 'turn');                                   // seq_5_turn
}

// standing_jump (seg005.c:687): the standing (horizontal) jump — a forward leap from a standstill.
// Disables auto-repeat (control_forward = IGNORE) and plays seq_3_standing_jump. (The source also
// IGNOREs control_up, which the clone doesn't persist — the frame dispatch already gates a re-jump.)
function standingJump(ch, c) {
  c.forward = IGNORE;                                     // control_up = control_forward = CONTROL_IGNORE
  startSeq(ch, 'standjump');                              // seq_3_standing_jump
}

// safe_step (seg005.c:604): a careful, measured step that lands EXACTLY at the edge ahead. FIRST it
// disables auto-repeat by latching control_forward = IGNORE (seg005.c:606) — this is what makes a HELD
// forward do ONE step and then settle (read_user_control keeps it IGNORE until the key is released).
// Then pick step<distance> (step1..step14, seq_29..42) from get_edge_distance so the step's dx sum
// equals the sub-tile gap — flush to a wall face, or right at a ledge's drop; each sets Char.repeat=1.
// At distance 0 on a LEDGE (edge != WALL) with repeat set, play `testfoot` (peer over + bounce back,
// seq_44) then clear repeat. Otherwise — distance 0 at a WALL, or a ledge after the peer (repeat spent)
// — play seq_39_safe_step_11 = a FULL step (step11): INTO the wall (-> checkBumped -> seq_47 recoil ->
// the tap oscillation) or OFF the ledge (an "unsafe step" -> fall). Faithful both cases (seg005.c:615).
function safeStep(ch, c, world) {
  c.forward = IGNORE;                                 // seg005.c:606 — disable automatic repeat
  const { edgeType, distance } = world.edgeDistance();
  if (distance > 0 && distance <= 14) { startSeq(ch, 'step' + distance); ch.repeat = 1; }
  else if (edgeType !== EDGE_WALL && ch.repeat) { ch.repeat = 0; ch.testing = 1; startSeq(ch, 'testfoot'); }
  else startSeq(ch, 'step11');                        // seq_39_safe_step_11: step into the wall / off the ledge
}

// control_running (seg005.c:588): stop / run-turn / run-jump (crouch-while-running still out of scope).
function controlRunning(ch, c, world) {
  if (c.x === NONE && (ch.frame === 7 || ch.frame === 11)) {     // frame-gated STOP (only at 7/11)
    c.backward = RELEASED; c.forward = IGNORE;                   // control_forward = release_arrows() (seg005.c:590)
    startSeq(ch, 'runstop');                                     // seq_13_stop_run — skid to a halt
  } else if (c.x === BACK) {                                     // facing-relative REVERSE
    c.forward = RELEASED; c.backward = IGNORE;                   // control_backward = release_arrows() (seg005.c:593) — IGNORE, else infinite run-turn
    startSeq(ch, 'runturn');                                     // skid + SEQ_FLIP + resume the run cycle
  } else if (c.up === HELD) {                                    // Up during a run -> the running jump
    world.runJump();                                             // run_jump (seg005.c:595) — gated to frame >= 7 internally
  }
  // else if (c.down === HELD)                     startSeq(ch, 'crouchrun');  // TODO (crouch while running)
}

// control_hanging (seg005.c:791): while hanging from a ledge (frames 87-99). Up — once the grab
// timer has counted down (check_grab sets it to 12 on a mid-fall grab; a jump-up grab leaves it 0)
// — climbs onto the ledge; Shift hangs flat against a wall (or lets go if there's nothing above to
// climb); anything else lets go and drops or falls. So after a mid-fall grab you hold Shift to keep
// hanging through the 12-tick countdown, then Up to climb. (The kid is alive throughout, so source's
// Char.alive<0 guard is implicit.) All three are control-phase, so they only startSeq via the world helpers.
function controlHanging(ch, c, world) {
  if (ch.grab_timer === 0 && c.up === HELD) world.climbUp();       // can_climb_up -> climbup
  else if (c.shift === HELD)                world.hangAgainstWall();// hangstraight / let go
  else                                      world.hangFall();      // release -> hangdrop / hangfall
}

// controlCrouched (seg005.c:313): release Down -> stand up from the crouch (seq_49). Hold Down and
// press forward -> crouch-hop (seq_79, the "crawl") — shuffle forward while low (creep under a low
// gate). This is also what recovers the prince to standing after a soft landing (the falling entry
// ends here). (The level-1 crouch-start music special event, seg005.c:314, is not modeled.)
function controlCrouched(ch, c, world) {
  if (c.shift2 === HELD && world.getItem()) return;   // shift over an item while crouched -> pick it up (seg005.c:330)
  if (c.down !== HELD) { startSeq(ch, 'standup'); }   // Down released -> stand up from crouch (seq_49)
  else if (c.forward === HELD) {                       // Down held + a fresh forward -> crouch-hop (seg005.c:334)
    c.forward = IGNORE;                                // disable automatic repeat: one hop per press
    startSeq(ch, 'crouchhop');                         // seq_79_crouch_hop
  }
}

// control_jumpup (seg005.c:680): during the start-of-jump-up frames (67-69), a held forward converts the
// vertical jump-up into a standing (horizontal) jump — a forward leap instead of a straight-up hop when
// you hold the direction as the jump begins.
function controlJumpup(ch, c) {
  if (c.x === FWD || c.forward === HELD) standingJump(ch, c);
}

// control_startrun (seg005.c:673): during the run-accel frames (1-3), up+forward converts the launch
// into a standing jump; otherwise the startrun sequence commits to the run cycle on its own.
function controlStartrun(ch, c) {
  if (c.up === HELD && c.x === FWD) standingJump(ch, c);
}
// control_turning (seg005.c:504): at turn frame 48, if the forward key is RAW-held (control_x == FWD)
// and neither Shift nor Up is held, turn STRAIGHT INTO A RUN (seq_43_start_run_after_turn) — the smooth
// turn-into-run — instead of finishing the turn to a stand and plain-running at frame 50. Decided from
// the RAW key (control_x), not the latched control_forward, so a release before frame 48 (control_x !=
// FWD) leaves the turn to settle into a stand. (control_y >= RELEASED = "up not held"; down is allowed.)
function controlTurning(ch, c) {
  if (c.shift !== HELD && c.up !== HELD && c.x === FWD) startSeq(ch, 'startrunafterturn');  // seq_43
}
