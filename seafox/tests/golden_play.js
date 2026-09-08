// seafox/tests/golden_play.js
//
// GENERATED FILE -- do not edit by hand.
// Regenerate:  open tests/test_golden.html, read WHY the page is red, then run
//              seafoxRegeneratePlay() in the console and paste the result over
//              everything below this header.
//
// design_spec § 20.5 extended -- Oracle 4 over a SCRIPTED-INPUT run.
//
// WHY THIS EXISTS ALONGSIDE golden_frames.js
//
// Those goldens capture the title-screen demo, which never starts a round. So
// they never see the launch sequence, the fuel burn, a loss, the outro, the
// drain, the fresh-submarine refill or the fly-in -- and every bug the
// Chapter 9-20 audit turned up lived in exactly that code. The demo goldens
// stayed green through all of them.
//
// Determinism does not end at the first input; it ends at an input that cannot
// be reproduced. A fixed script is as reproducible as no input at all, so this
// run reaches 15 played rounds across 4 complete games.
//
// The same rule as the other file: **a failure here is a QUESTION, not a
// verdict.** Ask what changed and whether it was meant. Regenerating to turn a
// red page green promotes a bug to the reference, and from then on the oracle
// defends it.
//
// FORMAT
//   GOLDEN_PLAY   per captured tick: the frame's FNV-1a hash and lit count, plus
//                 the session state at that moment. The state fields are not
//                 decoration -- they are what makes a failure legible, and they
//                 are checked alongside the hash.
//   PLAY_TIMELINE every phase transition and the tick it happened on. This is
//                 the most diagnostic thing on the page: a shifted transition
//                 names the tick a round started, ended or drained differently,
//                 which a changed hash alone never would.
//
// REGENERATED TWICE, and each time the SHAPE of the change was the argument.
//
// 1. The list clear now sweeps in-flight roster records free ($69AF, the tail of
//    sub_6925), so a merchant that was on screen when the submarine died can
//    spawn again instead of being stranded. Exactly one captured tick moved --
//    1000, in the DRAIN phase, where the sweep fires -- with every state field
//    identical and `live` 2 -> 3: one merchant that had been lost to the
//    mission. The timeline did not shift, and golden_frames.js did not move at
//    all, which is right, because the title demo never ends a round and so
//    never reaches the sweep.
//
// 2. A fired exit guard now ends the TICK, not merely the round: $6CE3 / $6CF7
//    / $6CFF each `JMP loc_6D1A`, out of the play loop and past the input poll,
//    the five spawners and the frame that sit below `loc_6D02`. The port had
//    been polling after the guards, which handed the outro's exit velocity
//    straight back to whatever the player was holding -- a held `h` drove the
//    submarine LEFT for the whole drain, and `j` parked it mid-screen -- because
//    no later transition polls again to correct it (§ 10.6).
//
//    The shape is what argues for it. Ticks 1, 100 and 400, everything before
//    the first round ends, are unchanged BIT FOR BIT, and the timeline is
//    identical through the first `435:drain`. Only then does it move: the second
//    round's drain goes 873 -> 874 and later rounds drift further, because a
//    round's last tick no longer consumes the spawners' generator draws (§ 5.6)
//    and no longer advances a frame. golden_frames.js again did not move at all
//    -- the title demo has no exit guards to fire.

export const GOLDEN_PLAY_TICKS = [1, 100, 400, 1000, 2000, 2500, 3000, 4500, 6000, 7500, 9000];

export const GOLDEN_PLAY = {
  1: {
    hash: '0xe299a880', lit: 1172,
    phase: 'title', mission: 0, subs: 3,
    fuel: 1200, torp: 30, live: 3,
  },
  100: {
    hash: '0x9950ff1f', lit: 1336,
    phase: 'setupLaunch', mission: 1, subs: 3,
    fuel: 1200, torp: 30, live: 0,
  },
  400: {
    hash: '0x4460edc9', lit: 1786,
    phase: 'play', mission: 1, subs: 2,
    fuel: 1050, torp: 28, live: 5,
  },
  1000: {
    hash: '0x914fc2fd', lit: 1638,
    phase: 'drain', mission: 1, subs: 1,
    fuel: 1120, torp: 29, live: 3,
  },
  2000: {
    hash: '0x5e7fd140', lit: 1689,
    phase: 'play', mission: 1, subs: 2,
    fuel: 1150, torp: 29, live: 5,
  },
  2500: {
    hash: '0xe10e5105', lit: 1640,
    phase: 'drain', mission: 1, subs: 2,
    fuel: 950, torp: 27, live: 3,
  },
  3000: {
    hash: '0x3172a5c9', lit: 1510,
    phase: 'drain', mission: 1, subs: 1,
    fuel: 1120, torp: 29, live: 2,
  },
  4500: {
    hash: '0x326cd4ce', lit: 1785,
    phase: 'play', mission: 1, subs: 1,
    fuel: 1090, torp: 29, live: 5,
  },
  6000: {
    hash: '0xc1f23ab3', lit: 1384,
    phase: 'play', mission: 1, subs: 1,
    fuel: 1180, torp: 29, live: 3,
  },
  7500: {
    hash: '0x4b7252ed', lit: 1646,
    phase: 'drain', mission: 1, subs: 2,
    fuel: 1080, torp: 28, live: 3,
  },
  9000: {
    hash: '0x036ff591', lit: 1682,
    phase: 'play', mission: 1, subs: 2,
    fuel: 1130, torp: 28, live: 5,
  },
};

export const PLAY_TIMELINE = [
  { tick: 60, phase: 'setupIcons' },
  { tick: 93, phase: 'setupLaunch' },
  { tick: 126, phase: 'play' },
  { tick: 435, phase: 'drain' },
  { tick: 656, phase: 'setupIcons' },
  { tick: 689, phase: 'setupLaunch' },
  { tick: 722, phase: 'play' },
  { tick: 874, phase: 'drain' },
  { tick: 1095, phase: 'setupIcons' },
  { tick: 1128, phase: 'setupLaunch' },
  { tick: 1161, phase: 'play' },
  { tick: 1611, phase: 'drain' },
  { tick: 1832, phase: 'title' },
  { tick: 1833, phase: 'setupIcons' },
  { tick: 1866, phase: 'setupLaunch' },
  { tick: 1899, phase: 'play' },
  { tick: 2359, phase: 'drain' },
  { tick: 2580, phase: 'setupIcons' },
  { tick: 2613, phase: 'setupLaunch' },
  { tick: 2646, phase: 'play' },
  { tick: 2800, phase: 'drain' },
  { tick: 3021, phase: 'setupIcons' },
  { tick: 3054, phase: 'setupLaunch' },
  { tick: 3087, phase: 'play' },
  { tick: 3557, phase: 'drain' },
  { tick: 3778, phase: 'title' },
  { tick: 3779, phase: 'setupIcons' },
  { tick: 3812, phase: 'setupLaunch' },
  { tick: 3845, phase: 'play' },
  { tick: 3998, phase: 'drain' },
  { tick: 4219, phase: 'setupIcons' },
  { tick: 4252, phase: 'setupLaunch' },
  { tick: 4285, phase: 'play' },
  { tick: 4704, phase: 'drain' },
  { tick: 4925, phase: 'setupIcons' },
  { tick: 4958, phase: 'setupLaunch' },
  { tick: 4991, phase: 'play' },
  { tick: 5147, phase: 'drain' },
  { tick: 5368, phase: 'title' },
  { tick: 5369, phase: 'setupIcons' },
  { tick: 5402, phase: 'setupLaunch' },
  { tick: 5435, phase: 'play' },
  { tick: 5662, phase: 'drain' },
  { tick: 5883, phase: 'setupIcons' },
  { tick: 5916, phase: 'setupLaunch' },
  { tick: 5949, phase: 'play' },
  { tick: 6417, phase: 'drain' },
  { tick: 6638, phase: 'setupIcons' },
  { tick: 6671, phase: 'setupLaunch' },
  { tick: 6704, phase: 'play' },
  { tick: 6856, phase: 'drain' },
  { tick: 7077, phase: 'title' },
  { tick: 7078, phase: 'setupIcons' },
  { tick: 7111, phase: 'setupLaunch' },
  { tick: 7144, phase: 'play' },
  { tick: 7366, phase: 'drain' },
  { tick: 7587, phase: 'setupIcons' },
  { tick: 7620, phase: 'setupLaunch' },
  { tick: 7653, phase: 'play' },
  { tick: 8031, phase: 'drain' },
  { tick: 8252, phase: 'setupIcons' },
  { tick: 8285, phase: 'setupLaunch' },
  { tick: 8318, phase: 'play' },
  { tick: 8576, phase: 'drain' },
  { tick: 8797, phase: 'title' },
  { tick: 8798, phase: 'setupIcons' },
  { tick: 8831, phase: 'setupLaunch' },
  { tick: 8864, phase: 'play' },
];
