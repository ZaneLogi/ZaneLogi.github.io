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
                                    up: RELEASED, down: RELEASED, shift: RELEASED });

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
  else if (f < 15)                     controlRunning(ch, c);          // run cycle 4-14
  else if (f >= 87 && f < 100)         controlHanging(ch, c, world);   // hanging from a ledge (87-99)
  else if (f === 109)                  controlCrouched(ch, c);         // crouch
}

// control_standing (seg005.c:343): Shift+forward = careful step (safe_step); forward = run, or a
// step if near a wall (forward_pressed); backward = turn. (Up/Down jumps + crouch are later.)
function controlStanding(ch, c, world) {
  ch.testing = 0;                     // reaching a stand decision ends any prior test-foot lean
  if (c.shift === HELD) {
    if (c.backward === HELD) backPressed(ch, c);
    else if (c.up === HELD) world.jumpUp();                              // shift+up -> up_pressed (seg005.c:378)
    else if (c.x === FWD && c.forward === HELD) safeStep(ch, c, world);  // shift+forward -> safe_step (seg005.c:383)
  } else if (c.forward === HELD) {
    forwardPressed(ch, c, world);     // (source: up+forward -> standing_jump; the horizontal jump is deferred, so this just runs)
  } else if (c.backward === HELD) {
    backPressed(ch, c);
  } else if (c.up === HELD) {
    world.jumpUp();                   // up alone -> up_pressed -> check_jump_up (seg005.c:393): the vertical jump / climb
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

// control_running (seg005.c:588): the two signature behaviours.
function controlRunning(ch, c) {
  if (c.x === NONE && (ch.frame === 7 || ch.frame === 11)) {     // frame-gated STOP (only at 7/11)
    c.backward = RELEASED; c.forward = IGNORE;                   // control_forward = release_arrows() (seg005.c:590)
    startSeq(ch, 'runstop');                                     // seq_13_stop_run — skid to a halt
  } else if (c.x === BACK) {                                     // facing-relative REVERSE
    c.forward = RELEASED; c.backward = IGNORE;                   // control_backward = release_arrows() (seg005.c:593) — IGNORE, else infinite run-turn
    startSeq(ch, 'runturn');                                     // skid + SEQ_FLIP + resume the run cycle
  }
  // else if (c.up === HELD && c.forward === HELD) startSeq(ch, 'runjump');    // TODO (pulls in SET_FALL)
  // else if (c.down === HELD)                     startSeq(ch, 'crouchrun');  // TODO
}

// control_hanging (seg005.c:791): while hanging from a ledge (frames 87-99). Up — once the grab
// timer has counted down (only set by the deferred mid-fall grab, so 0 here) — climbs onto the
// ledge; Shift hangs flat against a wall (or lets go if there's nothing above to climb); anything
// else lets go and drops or falls. (The kid is alive throughout, so source's Char.alive<0 guard is
// implicit.) All three are control-phase, so they only startSeq via the world helpers.
function controlHanging(ch, c, world) {
  if (ch.grab_timer === 0 && c.up === HELD) world.climbUp();       // can_climb_up -> climbup
  else if (c.shift === HELD)                world.hangAgainstWall();// hangstraight / let go
  else                                      world.hangFall();      // release -> hangdrop / hangfall
}

// controlCrouched (seg005.c:313): release Down -> stand up from the crouch (seq_49).
// This is what recovers the prince to standing after a soft landing (the falling entry
// ends here). Forward-held crouch-hop is a later addition.
function controlCrouched(ch, c) {
  if (c.down !== HELD) startSeq(ch, 'standup');       // stand up from crouch (seq_49)
  // else if (c.forward === HELD) startSeq(ch, 'crouchhop');   // TODO
}

// control_jumpup (seg005.c:680): during the start-of-jump-up frames (67-69), forward held would
// convert the jump-up into a standing (horizontal) jump. That horizontal jump is deferred, so this
// is a no-op for now — the jumpup/highjump sequence self-drives the rise. (Port the standing_jump
// conversion when the horizontal jumps land.)
function controlJumpup(ch, c) {}

// --- stubs: same frame-dispatched shape; port each when the player needs it ---
function controlStartrun(ch, c) {}  // seg005.c:673 — up+forward->standingjump; else commit to the run cycle
function controlTurning(ch, c)  {}  // seg005.c — forward held at frame 48 -> turnrun (turn straight into a run)
