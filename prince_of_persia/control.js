// control.js — the input->transition layer (a port of SDLPoP control_kid, seg005.c).
// KEY: this is NOT a new state machine. The states + their intrinsic transitions already
// live in seqtbl.js / playseq.js (a sequence, and its jmps, ARE a state). This layer only
// reads input at decision-point frames and picks which sequence to START next — exactly
// what control_kid does. SKELETON: not wired to an input source yet (that lands with
// index.html); most handlers are stubbed with their seg005.c citations. GPLv3 (see NOTICE).
import { startSeq } from './playseq.js';

export const HELD = 1, RELEASED = 0, IGNORE = -1;   // CONTROL_HELD / _RELEASED / _IGNORE
export const FWD = 1, NONE = 0, BACK = -1;          // control_x, facing-relative

// A per-tick input snapshot, made FACING-RELATIVE upstream: the read layer converts the
// absolute L/R arrows + ch.direction into x = FWD/NONE/BACK, so the handlers never see
// left/right — only forward/backward. That is what makes "left arrow while running right"
// read as BACK (and drive a runturn) with no special-casing here.
export const makeControl = () => ({ x: NONE, forward: RELEASED, backward: RELEASED,
                                    up: RELEASED, down: RELEASED, shift: RELEASED });

// control_kid dispatch (seg005.c:262-288): the CURRENT FRAME selects the handler.
export function controlKid(ch, c) {
  const f = ch.frame;
  if (f === 15 || (f >= 50 && f < 53)) controlStanding(ch, c);   // stand / end-of-turn
  else if (f === 48)                   controlTurning(ch, c);    // mid-turn (frame 48)
  else if (f < 4)                      controlStartrun(ch, c);   // startrun accel 1-3
  else if (f < 15)                     controlRunning(ch, c);    // run cycle 4-14
  else if (f === 109)                  controlCrouched(ch, c);   // crouch
}

// seg005.c:588 — the two behaviours we derived from the source last:
function controlRunning(ch, c) {
  if (c.x === NONE && (ch.frame === 7 || ch.frame === 11))       // frame-gated STOP (only at 7/11)
    startSeq(ch, 'runstop');                                     // TODO: transcribe runstop into seqtbl.js
  else if (c.x === BACK)                                         // facing-relative REVERSE
    startSeq(ch, 'runturn');                                     // skid + SEQ_FLIP + resume the run cycle
  // else if (c.up === HELD && c.forward === HELD) startSeq(ch, 'runjump');    // TODO (pulls in SET_FALL)
  // else if (c.down === HELD)                     startSeq(ch, 'crouchrun');  // TODO
}

// --- stubs: same frame-dispatched shape; port each when index.html needs it ---
function controlStanding(ch, c) {}  // seg005.c:343 — forward->startrun|safe_step, back->turn, up->jump, down->crouch
function controlStartrun(ch, c) {}  // seg005.c:673 — up+forward->standingjump; else commit to the run cycle
function controlTurning(ch, c)  {}  // seg005.c — forward held at frame 48 -> turnrun (turn straight into a run)
function controlCrouched(ch, c) {}  // seg005.c:313 — release down -> standup; forward -> crouch-hop
