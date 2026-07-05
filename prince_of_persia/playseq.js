// playseq.js — the PoP animation *interpreter* (logic): a faithful JS port of
// SDLPoP's play_seq (seg006.c:570), plus the small Character API it drives.
// play_seq() executes a sequence's opcodes — advancing Char.x/y, action,
// direction, curr_seq — until it hits a frame byte, which it stores in Char.frame
// and returns. That single frame emit == one animation tick.
//
// The opcode set + the assembler live in seqbuilder.js; the run/stand byte table
// in seqtbl.js. This file just runs the bytes. GPLv3 (see NOTICE).
import { SEQ } from './seqbuilder.js';
import { SEQTBL, SEQ_OFFSETS } from './seqtbl.js';

export { SEQ_OFFSETS };                         // re-export (name -> byte offset, like seqtbl_offsets)

export const DIR_RIGHT = 0, DIR_LEFT = -1;      // dir_0_right / dir_FF_left

// Character actions (types.h enum). We only need the ones the fall touches; the
// freefall action gates gravity (fallAccel/fallSpeed run only in it), and bumped +
// freefall are the two "not controllable" actions (control() gate, seg005.c:264).
export const ACT_IN_MIDAIR = 3, ACT_IN_FREEFALL = 4, ACT_BUMPED = 5;   // actions_3_in_midair / _4_in_freefall / _5_bumped

// Gravity constants (types.h:1435-1436).
const FALLING_SPEED_ACCEL = 3, FALLING_SPEED_MAX = 33;

const s8 = (b) => (b < 0x80 ? b : b - 0x100);   // signed 8-bit

// char_dx_forward (seg006.c:553): apply a delta in the character's facing direction.
export function charDxForward(ch, delta) {
  return ch.x + (ch.direction < DIR_RIGHT ? -delta : delta);
}

export function makeCharacter(opts = {}) {
  return {
    charid: 0, frame: 0, action: 0, curr_seq: 0, curr_row: 0,
    x: opts.x ?? 0, y: opts.y ?? 0, direction: opts.direction ?? DIR_RIGHT,
    fall_x: 0, fall_y: 0, repeat: 0,   // Char.repeat — gates the ledge test-foot (safe_step, seg005.c:609)
    testing: 0,                        // clone-only: true during `testfoot` (the peer-over lean must not fall/bump)
  };
}

export function startSeq(ch, name) {
  const off = SEQ_OFFSETS[name];
  if (off === undefined) throw new Error(`startSeq: unknown sequence "${name}"`);
  ch.curr_seq = off;
}

// One animation tick — faithful port of play_seq (seg006.c:570). Runs opcodes
// until a frame byte, which becomes Char.frame. Opcodes for subsystems we don't
// model (sound, chompers, level, items, knockback) consume their operands but
// are otherwise no-ops.
export function playSeq(ch) {
  for (let guard = 0; ; ++guard) {
    if (guard > 10000) throw new Error('playSeq: runaway (no frame emitted)');
    const cmd = SEQTBL[ch.curr_seq++];
    switch (cmd) {
      case SEQ.DX: ch.x = charDxForward(ch, s8(SEQTBL[ch.curr_seq++])); break;
      case SEQ.DY: ch.y += s8(SEQTBL[ch.curr_seq++]); break;
      case SEQ.FLIP: ch.direction = ~ch.direction; break;
      case SEQ.JMP_IF_FEATHER: ch.curr_seq += 2; break;          // no feather-fall -> skip target
      case SEQ.JMP: ch.curr_seq = SEQTBL[ch.curr_seq] | (SEQTBL[ch.curr_seq + 1] << 8); break;
      case SEQ.ACTION: ch.action = SEQTBL[ch.curr_seq++]; break;
      case SEQ.SET_FALL: ch.fall_x = s8(SEQTBL[ch.curr_seq++]); ch.fall_y = s8(SEQTBL[ch.curr_seq++]); break;
      case SEQ.SOUND: ch.curr_seq++; break;                      // audio not modeled
      case SEQ.UP: ch.curr_row--; break;
      case SEQ.DOWN: ch.curr_row++; break;
      case SEQ.GET_ITEM: ch.curr_seq++; break;
      case SEQ.KNOCK_UP: case SEQ.KNOCK_DOWN: case SEQ.DIE: case SEQ.END_LEVEL: break;
      default: ch.frame = cmd; return;                           // a frame number -> emit + stop
    }
  }
}

// Gravity, applied AFTER playSeq each tick (see the play_kid_frame order,
// seg000.c:1205-1207): playSeq -> fallAccel -> fallSpeed. Both are no-ops unless
// the character is in freefall, so ground moves and jump arcs are unaffected
// (a jump's vertical comes from its own dy opcodes inside playSeq, not from here).

// fall_accel (seg006.c:0577) — accelerate the fall while in freefall.
export function fallAccel(ch) {
  if (ch.action === ACT_IN_FREEFALL) {
    ch.fall_y += FALLING_SPEED_ACCEL;
    if (ch.fall_y > FALLING_SPEED_MAX) ch.fall_y = FALLING_SPEED_MAX;
  }
}

// fall_speed (seg006.c:05AE) — apply the fall velocity to position. y always moves
// by fall_y (0 when not falling); in freefall the actor also drifts by fall_x.
export function fallSpeed(ch) {
  ch.y += ch.fall_y;
  if (ch.action === ACT_IN_FREEFALL) ch.x = charDxForward(ch, ch.fall_x);
}
