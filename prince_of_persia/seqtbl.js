// seqtbl.js — the PoP animation *data*: a faithful transcription of SDLPoP
// seqtbl.c:243-263 (running / startrun / run cycle / stand), assembled via the
// SeqBuilder DSL (seqbuilder.js) into a flat byte table. This is the file that
// *grows* as new moves are added (standjump / runjump / turn, …) — a new move is
// mostly a new label + its bytes here. Executed by playseq.js. GPLv3 (see NOTICE).
import { SeqBuilder } from './seqbuilder.js';

const SND_FOOTSTEP = 1;                       // enum seqtbl_sounds
const ACT_STAND = 0, ACT_RUN_JUMP = 1;        // actions_0_stand / actions_1_run_jump

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
const built = _b.build();

export const SEQTBL = built.bytes;              // the assembled byte stream
export const SEQ_OFFSETS = built.labels;        // name -> byte offset (like seqtbl_offsets)
