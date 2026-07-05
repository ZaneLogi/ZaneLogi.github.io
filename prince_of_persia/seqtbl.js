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
// step1..step14 — safe_step-to-edge (seqtbl.c:737-863): "step forward N pixels". safe_step
// (control.js) picks step<distance> from get_edge_distance so the careful step lands the char
// EXACTLY at the wall face / tile edge ahead (flush, no bump; stops right at a ledge). Each
// sequence's dx opcodes sum to N. step9 shares step10's tail via the step10a label; step11 is the
// "normal" step. All use frames 121-132 (the stepping cycle).
_b.label('step14').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125).dx(3).frame(126)
  .dx(-1).dx(3).frame(127).frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
_b.label('step13').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125).dx(3).frame(126)
  .dx(-1).dx(2).frame(127).frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
_b.label('step12').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125).dx(3).frame(126)
  .dx(-1).dx(1).frame(127).frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
_b.label('step11').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125).dx(3).frame(126)
  .dx(-1).frame(127).frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
_b.label('step10').act(ACT_RUN_JUMP).frame(121)
  .dx(1).label('step10a').frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125).dx(3).frame(126)
  .dx(-2).frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
_b.label('step9').act(ACT_RUN_JUMP).frame(121).jmp('step10a');    // 121 then step10's tail (sum = 10-1 = 9)
_b.label('step8').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(4).frame(125)
  .dx(-1).frame(127).frame(128).frame(129).frame(130).frame(131).frame(132).jmp('stand');
_b.label('step7').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(3).frame(124).dx(2).frame(129)
  .frame(130).frame(131).frame(132).jmp('stand');
_b.label('step6').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(2).frame(124).dx(2).frame(129)
  .frame(130).frame(131).frame(132).jmp('stand');
_b.label('step5').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(2).frame(124).dx(1).frame(129)
  .frame(130).frame(131).frame(132).jmp('stand');
_b.label('step4').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(2).frame(131).frame(132).jmp('stand');
_b.label('step3').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(123).dx(1).frame(131).frame(132).jmp('stand');
_b.label('step2').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(122).dx(1).frame(132).jmp('stand');
_b.label('step1').act(ACT_RUN_JUMP).frame(121)
  .dx(1).frame(132).jmp('stand');
// testfoot (seqtbl.c:720, = seq_44_step_on_edge): "peer over the edge" — step forward, test the
// ground with a foot (frame 86), then BOUNCE BACK (net dx 0) and stand. safe_step plays this at a
// ledge brink (distance 0, not a wall, first time via the Char.repeat gate), so a careful step
// toward a drop tests + retreats instead of walking off. No act() — it inherits stand (action 0).
_b.label('testfoot').frame(121)
  .dx(1).frame(122).frame(123).dx(2).frame(124).dx(4).frame(125).dx(3).frame(126)
  .dx(-4).frame(86)
  .snd(SND_FOOTSTEP).knockDown().dx(-4).frame(116)
  .dx(-2).frame(117).frame(118).frame(119).jmp('stand');
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
// runstop — skid to a halt (seq_13_stop_run, seqtbl.c:619): decelerate on momentum
// (runturn frames 53-56) then settle to stand (turn frames 49-52). No SEQ_FLIP — he
// stops facing the SAME way (unlike runturn). control_running fires this on release.
_b.label('runstop').act(ACT_RUN_JUMP).frame(53)
  .dx(2).snd(SND_FOOTSTEP).frame(54).dx(7).frame(55).snd(SND_FOOTSTEP).frame(56)
  .dx(2).frame(49).dx(-2).frame(50).frame(51).frame(52).jmp('stand');

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

// --- wall-bump recoils (§5b): the three bump sequences the bumped/bumped_floor/bumped_fall
// dispatch (player.js, ported seg004.c:266/311/298) picks by the character's state. ---
// bump (seq_47_bump, seqtbl.c:691): the common grounded recoil — skid back off the wall (dx -4)
// and settle with the turn-tail frames 50-52, then stand. control() is gated during act 5 so the
// recoil isn't interrupted (control.js).
_b.label('bump').act(ACT_BUMPED).dx(-4).frame(50)
  .frame(51).frame(52).jmp('stand');
// bumpfall (seq_45_bumpfall, seqtbl.c:696): bumped a wall with no floor below -> tip into a fall
// (the start-fall frames 102-105) and hand off to freefall. The source's jmp_if_feather(bumpfloat)
// branch is DROPPED — the clone has no feather-fall (playSeq skips JMP_IF_FEATHER anyway).
_b.label('bumpfall').act(ACT_BUMPED).dx(1).dy(3).frame(102)
  .dx(2).dy(6).frame(103)
  .dx(-1).dy(9).frame(104)
  .dy(12).frame(105)
  .dx(-2).setFall(0, 15).jmp('freefall');
// hardbump (seq_46_hardbump, seqtbl.c:712): the hard recoil after a run-jump/fall onset — a small
// lift, knock-down, then the land frames into a crouch -> standup. Only reached from jump/fall-onset
// frames {24,25,40-42,102-106}; dormant until jumps are wired (verify then).
_b.label('hardbump').act(ACT_BUMPED).dx(-1).dy(-4).frame(102)
  .dx(-1).dy(3).dx(-3).dy(1).knockDown()
  .dx(1).snd(SND_FOOTSTEP).frame(107)
  .dx(2).frame(108)
  .snd(SND_FOOTSTEP).frame(109)
  .jmp('standup');

const built = _b.build();

export const SEQTBL = built.bytes;              // the assembled byte stream
export const SEQ_OFFSETS = built.labels;        // name -> byte offset (like seqtbl_offsets)
