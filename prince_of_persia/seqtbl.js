// seqtbl.js — the PoP animation *data*: a faithful transcription of SDLPoP
// seqtbl.c:243-263 (running / startrun / run cycle / stand), assembled via the
// SeqBuilder DSL (seqbuilder.js) into a flat byte table. This is the file that
// *grows* as new moves are added (standjump / runjump / turn, …) — a new move is
// mostly a new label + its bytes here. Executed by playseq.js. GPLv3 (see NOTICE).
import { SeqBuilder } from './seqbuilder.js';

const SND_FOOTSTEP = 1;                              // enum seqtbl_sounds
const ACT_STAND = 0, ACT_RUN_JUMP = 1, ACT_TURN = 7; // actions_0_stand / _1_run_jump / _7_turn
const ACT_IN_FREEFALL = 4, ACT_BUMPED = 5;           // actions_4_in_freefall / _5_bumped

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

// --- ground moves: crouch (stoop), walk (step11), standing turn, running turn (runturn) ---
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

// --- jumps + fall: standjump, runjump, freefall + soft/med/hard landings ---
// standjump (seqtbl.c:381): standing jump — a self-contained rotoscoped arc (the dy at
// sjland lifts then drops the actor, net ~0), ends jmp(stand). No gravity involved.
_b.label('standjump').act(ACT_RUN_JUMP).frame(16).frame(17)
  .dx(2).frame(18).dx(2).frame(19).dx(2).frame(20).dx(2).frame(21).dx(2).frame(22)
  .dx(7).frame(23).dx(9).frame(24)
  .dx(5).dy(-6).label('sjland').frame(25)
  .dx(1).dy(6).frame(26)
  .dx(4).knockDown().snd(SND_FOOTSTEP).frame(27)
  .dx(-3).frame(28).dx(5).frame(29)
  .snd(SND_FOOTSTEP).frame(30).frame(31).frame(32).frame(33)
  .dx(1).jmp('stand');
// runjump (seqtbl.c:402): running jump — run-up (34-39) then the leap arc (40-44 dy),
// ends jmp(runcyc1) to resume the run cycle. Also self-contained (net dy ~0).
_b.label('runjump').act(ACT_RUN_JUMP).snd(SND_FOOTSTEP).frame(34)
  .dx(5).frame(35).dx(6).frame(36).dx(3).frame(37)
  .dx(5).snd(SND_FOOTSTEP).frame(38).dx(7).frame(39)
  .dx(12).dy(-3).frame(40).dx(8).dy(-9).frame(41).dx(8).dy(-2).frame(42)
  .dx(4).dy(11).frame(43).dx(4).dy(3).label('rjlandrun').frame(44)
  .dx(5).knockDown().snd(SND_FOOTSTEP).jmp('runcyc1');
// freefall (seqtbl.c:615): act(4) turns on gravity (fallAccel/fallSpeed run only in this
// action); the loop just holds the falling frame while fall_y accelerates outside play_seq.
_b.label('freefall').act(ACT_IN_FREEFALL).label('freefall_loop').frame(106).jmp('freefall_loop');
// softland (seqtbl.c:916): soft land (fall_y<22) — touch down (107/108) then hold the
// crouch (109) in a self-loop; the driver fires standup to recover.
_b.label('softland').act(ACT_BUMPED).knockDown().dx(1).frame(107)
  .dx(2).frame(108)
  .act(ACT_RUN_JUMP).label('softland_crouch').frame(109).jmp('softland_crouch');
// medland (seqtbl.c:934): medium land (22<=fall_y<33, lose 1 HP) — long crouch (29 frames)
// then stand up on its own -> jmp(stand).
_b.label('medland').act(ACT_BUMPED).knockDown().dy(-2).dx(1).dx(2).frame(108);
for (let i = 0; i < 29; i++) _b.frame(109);          // frame_109_crouch ×29 (seqtbl.c:936-943)
_b.dx(1).frame(110).frame(110).frame(110).frame(111)
  .dx(2).frame(112).frame(113)
  .dx(1).dy(1).frame(114).dy(1).frame(115).frame(116)
  .dx(-4).frame(117).frame(118).frame(119).jmp('stand');
// hardland (seqtbl.c:955): hard land (fall_y>=33) — SEQ_DIE, hold the dead frame (185).
_b.label('hardland').act(ACT_BUMPED).knockDown().dy(-2).dx(3).frame(185)
  .die().label('hardland_dead').frame(185).jmp('hardland_dead');
// standup (seqtbl.c:871): stand up from crouch (seq_49) — used to recover after a soft land.
_b.label('standup').act(ACT_BUMPED).dx(1).frame(110).frame(111)
  .dx(2).frame(112).frame(113)
  .dx(1).frame(114).frame(115).frame(116)
  .dx(-4).frame(117).frame(118).frame(119).jmp('stand');

const built = _b.build();

export const SEQTBL = built.bytes;              // the assembled byte stream
export const SEQ_OFFSETS = built.labels;        // name -> byte offset (like seqtbl_offsets)
