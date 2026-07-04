// seqtbl.js — the PoP animation *data*: a faithful transcription of SDLPoP
// seqtbl.c:243-263 (running / startrun / run cycle / stand), assembled via the
// SeqBuilder DSL (seqbuilder.js) into a flat byte table. This is the file that
// *grows* as new moves are added (standjump / runjump / turn, …) — a new move is
// mostly a new label + its bytes here. Executed by playseq.js. GPLv3 (see NOTICE).
import { SeqBuilder } from './seqbuilder.js';

const SND_FOOTSTEP = 1;                              // enum seqtbl_sounds
const ACT_STAND = 0, ACT_RUN_JUMP = 1, ACT_TURN = 7; // actions_0_stand / _1_run_jump / _7_turn

// Faithful transcription of seqtbl.c:243-263 (running / startrun / run cycle / stand).
const _b = new SeqBuilder();
_b.label('running').act(ACT_RUN_JUMP).jmp('runcyc1');
_b.label('startrun').act(ACT_RUN_JUMP).frame(1).frame(2).frame(3).frame(4)
  .dx(8).frame(5).dx(3).frame(6)
  .dx(3).label('runcyc1').frame(7)
  .dx(5).frame(8).dx(1).snd(SND_FOOTSTEP).frame(9).dx(2).frame(10)
  .dx(4).frame(11).dx(5).frame(12)
  .dx(2).label('runcyc7').snd(SND_FOOTSTEP).frame(13).dx(3).frame(14).dx(4).jmp('runcyc1');
_b.label('stand').act(ACT_STAND).frame(15).jmp('stand');

// --- v1 sandbox moves: crouch (stoop), walk (step11), turn, runturn ---
// stoop (seqtbl.c:865): duck down, then hold the crouch frame in a self-loop.
_b.label('stoop').act(ACT_RUN_JUMP).dx(1).frame(107).dx(2).frame(108)
  .label('stoop_crouch').frame(109).jmp('stoop_crouch');
// step11 — the "normal" careful step (seqtbl.c:773): one measured step -> jmp(stand).
_b.label('step11').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125)
  .dx(3).frame(126).dx(-1).frame(127)
  .frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
// turn — standing about-face (seqtbl.c:440): SEQ_FLIP up front, then settle to stand.
_b.label('turn').act(ACT_TURN).flip().dx(6).frame(45)
  .dx(1).frame(46).dx(2).frame(47).dx(-1).frame(48).dx(1).frame(49)
  .dx(-2).frame(50).frame(51).frame(52).jmp('stand');
// runturn — running about-face (seqtbl.c:454): skid forward on momentum, then the
// SEQ_FLIP lands and jmp(runcyc7) resumes the run cycle facing the other way.
_b.label('runturn').act(ACT_RUN_JUMP).dx(1).frame(53)
  .dx(1).snd(SND_FOOTSTEP).frame(54).dx(8).frame(55).snd(SND_FOOTSTEP).frame(56)
  .dx(7).frame(57).dx(3).frame(58).dx(1).frame(59).frame(60)
  .dx(2).frame(61).dx(-1).frame(62).frame(63).frame(64).dx(-1).frame(65)
  .dx(-14).flip().jmp('runcyc7');

const built = _b.build();

export const SEQTBL = built.bytes;              // the assembled byte stream
export const SEQ_OFFSETS = built.labels;        // name -> byte offset (like seqtbl_offsets)
