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
    hash: '0x4704addc', lit: 1638,
    phase: 'drain', mission: 1, subs: 1,
    fuel: 1120, torp: 29, live: 3,
  },
  2000: {
    hash: '0xcd30b228', lit: 1689,
    phase: 'play', mission: 1, subs: 2,
    fuel: 1150, torp: 29, live: 5,
  },
  2500: {
    hash: '0xaada679f', lit: 1737,
    phase: 'drain', mission: 1, subs: 2,
    fuel: 950, torp: 27, live: 4,
  },
  3000: {
    hash: '0xc71b6cc4', lit: 1513,
    phase: 'drain', mission: 1, subs: 1,
    fuel: 1120, torp: 29, live: 2,
  },
  4500: {
    hash: '0xc928e60c', lit: 1227,
    phase: 'setupIcons', mission: 1, subs: 2,
    fuel: 880, torp: 24, live: 0,
  },
  6000: {
    hash: '0x117e6943', lit: 1432,
    phase: 'play', mission: 1, subs: 1,
    fuel: 1190, torp: 30, live: 2,
  },
  7500: {
    hash: '0x1a4c10a9', lit: 2155,
    phase: 'drain', mission: 1, subs: 0,
    fuel: 830, torp: 24, live: 5,
  },
  9000: {
    hash: '0xd901be55', lit: 1843,
    phase: 'play', mission: 1, subs: 0,
    fuel: 1100, torp: 27, live: 6,
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
  { tick: 873, phase: 'drain' },
  { tick: 1094, phase: 'setupIcons' },
  { tick: 1127, phase: 'setupLaunch' },
  { tick: 1160, phase: 'play' },
  { tick: 1610, phase: 'drain' },
  { tick: 1831, phase: 'title' },
  { tick: 1832, phase: 'setupIcons' },
  { tick: 1865, phase: 'setupLaunch' },
  { tick: 1898, phase: 'play' },
  { tick: 2356, phase: 'drain' },
  { tick: 2577, phase: 'setupIcons' },
  { tick: 2610, phase: 'setupLaunch' },
  { tick: 2643, phase: 'play' },
  { tick: 2796, phase: 'drain' },
  { tick: 3017, phase: 'setupIcons' },
  { tick: 3050, phase: 'setupLaunch' },
  { tick: 3083, phase: 'play' },
  { tick: 3379, phase: 'drain' },
  { tick: 3600, phase: 'title' },
  { tick: 3601, phase: 'setupIcons' },
  { tick: 3634, phase: 'setupLaunch' },
  { tick: 3667, phase: 'play' },
  { tick: 4251, phase: 'drain' },
  { tick: 4472, phase: 'setupIcons' },
  { tick: 4505, phase: 'setupLaunch' },
  { tick: 4538, phase: 'play' },
  { tick: 4748, phase: 'drain' },
  { tick: 4969, phase: 'setupIcons' },
  { tick: 5002, phase: 'setupLaunch' },
  { tick: 5035, phase: 'play' },
  { tick: 5151, phase: 'drain' },
  { tick: 5372, phase: 'title' },
  { tick: 5373, phase: 'setupIcons' },
  { tick: 5406, phase: 'setupLaunch' },
  { tick: 5439, phase: 'play' },
  { tick: 5693, phase: 'drain' },
  { tick: 5914, phase: 'setupIcons' },
  { tick: 5947, phase: 'setupLaunch' },
  { tick: 5980, phase: 'play' },
  { tick: 6394, phase: 'drain' },
  { tick: 6615, phase: 'setupIcons' },
  { tick: 6648, phase: 'setupLaunch' },
  { tick: 6681, phase: 'play' },
  { tick: 7361, phase: 'drain' },
  { tick: 7582, phase: 'title' },
  { tick: 7583, phase: 'setupIcons' },
  { tick: 7616, phase: 'setupLaunch' },
  { tick: 7649, phase: 'play' },
  { tick: 7811, phase: 'drain' },
  { tick: 8032, phase: 'setupIcons' },
  { tick: 8065, phase: 'setupLaunch' },
  { tick: 8098, phase: 'play' },
  { tick: 8529, phase: 'drain' },
  { tick: 8750, phase: 'setupIcons' },
  { tick: 8783, phase: 'setupLaunch' },
  { tick: 8816, phase: 'play' },
];
