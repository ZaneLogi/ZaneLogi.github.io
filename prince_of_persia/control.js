// control.js — the input->transition layer (a port of SDLPoP control_kid, seg005.c).
// KEY: this is NOT a new state machine. The states + their intrinsic transitions already
// live in seqtbl.js / playseq.js (a sequence, and its jmps, ARE a state). This layer only
// reads input at decision-point frames and picks which sequence to START next — exactly
// what control_kid does. GPLv3 (see NOTICE).
//
// The wall check (forward_pressed) needs to consult the world, so controlKid takes a
// `world` object providing world.blockedForward() -> bool (is a wall right at the reg point
// in the facing direction — a simplified get_edge_distance, seg004.c:378). player.js binds it.
import { startSeq, ACT_BUMPED, ACT_IN_FREEFALL } from './playseq.js';

export const HELD = 1, RELEASED = 0, IGNORE = -1;   // CONTROL_HELD / _RELEASED / _IGNORE
export const FWD = 1, NONE = 0, BACK = -1;          // control_x, facing-relative

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
  if (ch.action === ACT_BUMPED || ch.action === ACT_IN_FREEFALL) return;
  const f = ch.frame;
  if (f === 15 || (f >= 50 && f < 53)) controlStanding(ch, c, world);  // stand / end-of-turn
  else if (f === 48)                   controlTurning(ch, c);          // mid-turn (frame 48)
  else if (f < 4)                      controlStartrun(ch, c);         // startrun accel 1-3
  else if (f < 15)                     controlRunning(ch, c);          // run cycle 4-14
  else if (f === 109)                  controlCrouched(ch, c);         // crouch
}

// control_standing (seg005.c:343): Shift+forward = careful step; forward = run (or blocked
// at a wall); backward = turn. (Up/Down jumps + crouch are later additions.)
function controlStanding(ch, c, world) {
  if (c.shift === HELD) {
    if (c.backward === HELD) backPressed(ch);
    else if (c.x === FWD && c.forward === HELD) {                      // shift+forward -> careful step
      if (!wallClose(world)) safeStep(ch);                            //   ...unless blocked by a wall
    }
  } else if (c.forward === HELD) {
    forwardPressed(ch, c, world);
  } else if (c.backward === HELD) {
    backPressed(ch);
  }
}

// Blocked from advancing = a wall is right at the reg point in the facing direction
// (world.blockedForward, player.js). The char can still walk the gap up to a wall a tile
// away; only STARTING a move when already against the wall is gated — which prevents an
// oscillation and lets him approach walls (incl. across a room edge, e.g. room 1 col 0 left).
const wallClose = (world) => world.blockedForward();

// forward_pressed (seg005.c:566): if a wall is right ahead, don't run into it — stay stand
// (blocked). Source inches to the exact wall edge via a step-to-edge sequence (safe_step
// 29..42); the clone just stops, and blockAtWall snaps a run to the wall face.
function forwardPressed(ch, c, world) {
  if (wallClose(world)) return;                          // blocked -> stay stand
  startSeq(ch, 'startrun');                              // seq_1_start_run
}

// back_pressed (seg005.c): turn to face the other way (the standing about-face).
function backPressed(ch) { startSeq(ch, 'turn'); }        // seq_5_turn

// safe_step (seg005.c:604): a careful, measured step. The source picks an exact
// step-to-edge sequence (29..42) by sub-tile distance; the clone approximates with the
// generic careful step (step11) — the wall-eject keeps him out of a wall regardless.
function safeStep(ch) { startSeq(ch, 'step11'); }

// control_running (seg005.c:588): the two signature behaviours.
function controlRunning(ch, c) {
  if (c.x === NONE && (ch.frame === 7 || ch.frame === 11))       // frame-gated STOP (only at 7/11)
    startSeq(ch, 'runstop');                                     // seq_13_stop_run — skid to a halt
  else if (c.x === BACK)                                         // facing-relative REVERSE
    startSeq(ch, 'runturn');                                     // skid + SEQ_FLIP + resume the run cycle
  // else if (c.up === HELD && c.forward === HELD) startSeq(ch, 'runjump');    // TODO (pulls in SET_FALL)
  // else if (c.down === HELD)                     startSeq(ch, 'crouchrun');  // TODO
}

// controlCrouched (seg005.c:313): release Down -> stand up from the crouch (seq_49).
// This is what recovers the prince to standing after a soft landing (the falling entry
// ends here). Forward-held crouch-hop is a later addition.
function controlCrouched(ch, c) {
  if (c.down !== HELD) startSeq(ch, 'standup');       // stand up from crouch (seq_49)
  // else if (c.forward === HELD) startSeq(ch, 'crouchhop');   // TODO
}

// --- stubs: same frame-dispatched shape; port each when the player needs it ---
function controlStartrun(ch, c) {}  // seg005.c:673 — up+forward->standingjump; else commit to the run cycle
function controlTurning(ch, c)  {}  // seg005.c — forward held at frame 48 -> turnrun (turn straight into a run)
