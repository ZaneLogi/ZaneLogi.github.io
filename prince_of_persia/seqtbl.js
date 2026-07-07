// seqtbl.js — the PoP animation *data*: a faithful transcription of SDLPoP
// seqtbl.c:243-263 (running / startrun / run cycle / stand), assembled via the
// SeqBuilder DSL (seqbuilder.js) into a flat byte table. This is the file that
// *grows* as new moves are added (standjump / runjump / turn, …) — a new move is
// mostly a new label + its bytes here. Executed by playseq.js. GPLv3 (see NOTICE).
import { SeqBuilder } from './seqbuilder.js';

const SND_SILENT = 0, SND_FOOTSTEP = 1;              // enum seqtbl_sounds (types.h:1124)
const ACT_STAND = 0, ACT_RUN_JUMP = 1, ACT_TURN = 7; // actions_0_stand / _1_run_jump / _7_turn
const ACT_HANG_CLIMB = 2, ACT_IN_MIDAIR = 3;         // actions_2_hang_climb / _3_in_midair
const ACT_IN_FREEFALL = 4, ACT_BUMPED = 5, ACT_HANG_STRAIGHT = 6;  // _4_in_freefall / _5_bumped / _6_hang_straight

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

// --- vertical jump-up + climb (seqtbl.c:526-646): jump straight up (grab a ledge above and
// climb up, or touch the ceiling / open air and drop back). The rise + hang are drawn by the
// per-frame frame_table dy offsets; climbup's SEQ_UP + dy(-63) move him up one whole tile-row. ---
// jumpup (seqtbl.c:629, = seq_14_jump_up_into_ceiling): jump up with a wall/floor above — rise,
// KNOCK_UP (touch the ceiling), then drop via hangdrop -> stand.
_b.label('jumpup').act(ACT_RUN_JUMP).frame(67).frame(68).frame(69).frame(70).frame(71)
  .frame(72).frame(73).frame(74).frame(75).frame(76).frame(77).frame(78)
  .act(ACT_STAND).knockUp().frame(79)
  .jmp('hangdrop');
// highjump (seqtbl.c:637, = seq_28_jump_up_with_nothing_above): jump up with nothing above —
// rise to the apex, hang there a beat (the dy in/out nets 0), then drop via hangdrop -> stand.
_b.label('highjump').act(ACT_RUN_JUMP).frame(67).frame(68).frame(69).frame(70).frame(71)
  .frame(72).frame(73).frame(74).frame(75).frame(76).frame(77).frame(78).frame(79)
  .dy(-4).frame(79).dy(-2).frame(79).frame(79).dy(2).frame(79)
  .dy(4).jmp('hangdrop');
// hangdrop (seqtbl.c:602, = seq_11_release_ledge_and_land): drop from a hang/jump-up and land —
// the shared landing tail for jumpup/highjump (and releasing a ledge). Ends jmp(stand).
_b.label('hangdrop').frame(81).frame(82)
  .act(ACT_BUMPED).frame(83)
  .act(ACT_RUN_JUMP).knockDown().snd(SND_SILENT).frame(84).frame(85)
  .dx(3).jmp('stand');

// The three jump-up-AND-GRAB variants (seqtbl.c:526-552): rise (frames 67-77, action 1), then
// switch to action 2 (hang_climb) and settle onto the ledge (78-80), then jmp(hang). They differ
// only in the dx applied while grabbing — chosen by grab_up_with_floor_behind / _no_floor_behind
// (player.js) from the distance to the ledge edge.
// jumphangMed (seqtbl.c:526, = seq_8_jump_up_and_grab_straight): grab straight up (dx 0).
_b.label('jumphangMed').act(ACT_RUN_JUMP).frame(67).frame(68).frame(69).frame(70).frame(71)
  .frame(72).frame(73).frame(74).frame(75).frame(76).frame(77)
  .act(ACT_HANG_CLIMB).frame(78).frame(79).frame(80)
  .jmp('hang');
// jumphangLong (seqtbl.c:534, = seq_24_jump_up_and_grab_forward): grab a ledge a bit forward (dx +4).
_b.label('jumphangLong').act(ACT_RUN_JUMP).frame(67).frame(68).frame(69).frame(70).frame(71)
  .frame(72).frame(73).frame(74).frame(75).frame(76).frame(77)
  .act(ACT_HANG_CLIMB).dx(1).frame(78).dx(2).frame(79).dx(1).frame(80)
  .jmp('hang');
// jumpbackhang (seqtbl.c:544, = seq_16_jump_up_and_grab): grab with no floor behind (dx -4 total).
_b.label('jumpbackhang').act(ACT_RUN_JUMP).frame(67).frame(68).frame(69).frame(70).frame(71)
  .frame(72).frame(73).frame(74).frame(75).frame(76)
  .dx(-1).frame(77)
  .act(ACT_HANG_CLIMB).dx(-2).frame(78).dx(-1).frame(79).dx(-1).frame(80)
  .jmp('hang');
// hang (seqtbl.c:554): the hang loop — dangle (frame 91), then the long swing (hang1, 42 frames)
// and, if uninterrupted, drop via hangdrop. Under player control, control_hanging interrupts on
// the FIRST hang frame (Up -> climbup / release -> hangfall|hangdrop), so the swing rarely plays.
_b.label('hang').act(ACT_HANG_CLIMB).frame(91)
  .label('hang1').frame(90).frame(89).frame(88).frame(87).frame(87).frame(87).frame(88)
  .frame(89).frame(90).frame(91).frame(92).frame(93).frame(94).frame(95).frame(96)
  .frame(97).frame(98).frame(99).frame(97).frame(96).frame(95).frame(94).frame(93)
  .frame(92).frame(91).frame(90).frame(89).frame(88).frame(87).frame(88).frame(89)
  .frame(90).frame(91).frame(92).frame(93).frame(94).frame(95).frame(96).frame(95)
  .frame(94).frame(93).frame(92)
  .jmp('hangdrop');
// hangstraight (seqtbl.c:569, = seq_25_hang_against_wall): hang flat against a wall/doortop
// (action 6), then hold frame 91 in a self-loop. control_hanging picks this on Shift-against-wall.
_b.label('hangstraight').act(ACT_HANG_STRAIGHT).frame(92)
  .frame(93).frame(93).frame(92).frame(92)
  .label('hangstraight_loop').frame(91)
  .jmp('hangstraight_loop');
// climbup (seqtbl.c:590, = seq_10_climb_up): pull up onto the ledge. The dx(5) dy(-63) SEQ_UP at
// frame 141 moves the char up exactly one tile-row (curr_row--, feet 118->55), then the tail
// (118/119 stand-up frames) settles him standing on the ledge -> stand.
_b.label('climbup').act(ACT_RUN_JUMP).frame(135)
  .frame(136).frame(137).frame(138).frame(139).frame(140)
  .dx(5).dy(-63).up().frame(141)
  .frame(142).frame(143).frame(144).frame(145).frame(146).frame(147).frame(148)
  .act(ACT_BUMPED).frame(149)                         // to clear flags (seqtbl.c:597)
  .act(ACT_RUN_JUMP).frame(118).frame(119)
  .dx(1).jmp('stand');
// climbfail (seqtbl.c:575, = seq_73_climb_up_to_closed_gate): climb toward a CLOSED gate above and
// drop back down. Reach up (135->138), hold on 138, reverse (138->135) — there is NO dy, so he never
// changes row — then dx(-7) and hand off to hangdrop. can_climb_up (player.js) picks this over
// climbup when the tile above is a closed gate and the char faces left (seg005.c:840). The action
// stays hang_climb (2) through the reach (no act() opcode here), so check_action no-ops until the
// hangdrop tail flips it to bumped/run_jump.
_b.label('climbfail').frame(135)
  .frame(136).frame(137).frame(137)
  .frame(138).frame(138).frame(138).frame(138)
  .frame(137).frame(136).frame(135)
  .dx(-7).jmp('hangdrop');
// hangfall (seqtbl.c:609, = seq_23_release_ledge_and_fall): let go over a pit — a short midair
// drop (action 3) that accelerates, then set_fall + hand off to freefall. control_hanging picks
// this (via hang_fall) when there is no floor to land on below.
_b.label('hangfall').act(ACT_IN_MIDAIR).frame(81)
  .dy(6).frame(81)
  .dy(9).frame(81)
  .dy(12).dx(2).setFall(0, 12).jmp('freefall');

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
