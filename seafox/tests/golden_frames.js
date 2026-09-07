// seafox/tests/golden_frames.js
//
// GENERATED FILE -- do not edit by hand.
// Regenerate:  open tests/test_golden.html, read WHY the page is red, then run
//              seafoxRegenerateGoldens() in the console and paste the result
//              over the data block below.
//
// design_spec § 20.5, Oracle 4. A digest of the renderer's `color` buffer at
// fixed tick counts of a cold-booted title-screen demo.
//
// WHAT THIS IS, AND WHAT IT IS NOT
//
// § 20.1 says an oracle "checks the implementation against something that is not
// a reading". Oracles 1-3 do exactly that: the generator's algebra, the spawn
// cadence and the demo trajectory are all derived from the disassembly, so they
// check this port against the original. **These digests are not.** They were
// captured from this port, so they check it against its own past -- a
// regression net, not an external reference. Nothing here can tell you the
// renderer is right; it tells you, immediately and precisely, that it CHANGED.
//
// That is worth having on its own terms. The horizontal torpedo's drift bug
// (docs/porting_decisions.md) moved every demo-fired shot, and the first thing
// to notice was a test two chapters away failing for a reason it could not name.
// A changed hash here would have said "tick 1200 differs" the moment it happened.
//
// **So a failure here is a QUESTION, not a verdict.** Ask what changed and
// whether the change was intended; if it was, regenerate. Never regenerate to
// make a red page go green without answering that first -- doing so silently
// promotes a bug to the reference.
//
// The externally-anchored half of Oracle 4 -- the palette, the waterline row,
// the HUD row, the strip positions -- lives in test_golden.js and checks the
// spec rather than the past.
//
// FORMAT
//   hash   FNV-1a 32-bit over the whole 280 x 192 buffer. This is the byte-for-
//          byte comparison § 20.5 asks for; the fields below exist only so a
//          failure says WHERE.
//   lit    non-background bytes.
//   bands  lit bytes per horizontal band of 16 rows, top to bottom -- localises
//          a difference vertically.
//   hist   lit bytes per palette index.

// REGENERATED TWICE, both times deliberately and both times with the reason
// established BEFORE the numbers were touched:
//
//   1. The payload's own response now removes it when the player collects it or
//      the clam eats it ($75CB), instead of only clearing the convoy flag.
//   2. Ships no longer sink ships ($7572): merchants spawn three-deep at X 0-1
//      and were destroying each other on arrival, retiring roster records that
//      never recycle until the sea emptied.
//   3. Wrecks are collidable again ($18EC has no flag test; only the dispatch
//      skips, and only the side it is dispatching). A dying entity keeps a
//      re-anchored, usually larger footprint, so this changes what meets what.
//
// Both were verified against the ROM and by mutation first. The early ticks
// barely move -- nothing differs until the first merchant pile-up or clam --
// and from that event on one different entity re-orders the array
// (swap-with-last, § 4.6) and the deterministic demo diverges for good.

export const GOLDEN_TICKS = [1, 2, 60, 300, 1200, 3000, 6000];

export const GOLDEN = {
  1: {
    hash: '0xe299a880', lit: 1172,
    bands: [0, 0, 280, 0, 0, 0, 0, 0, 0, 14, 104, 774],
    hist: { 1: 281, 2: 165, 3: 300, 4: 12, 5: 414 },
  },
  2: {
    hash: '0x9929e4f3', lit: 1179,
    bands: [0, 0, 280, 0, 0, 0, 0, 0, 0, 14, 104, 781],
    hist: { 1: 281, 2: 169, 3: 300, 4: 12, 5: 417 },
  },
  60: {
    hash: '0x2066e7ef', lit: 1469,
    bands: [0, 28, 286, 0, 109, 4, 12, 4, 105, 0, 0, 921],
    hist: { 1: 321, 2: 264, 3: 402, 4: 29, 5: 453 },
  },
  300: {
    hash: '0x17646821', lit: 1904,
    bands: [96, 270, 286, 0, 275, 0, 76, 4, 3, 122, 0, 772],
    hist: { 1: 372, 2: 198, 3: 714, 4: 96, 5: 524 },
  },
  1200: {
    hash: '0x7ad3ea3b', lit: 2327,
    bands: [300, 360, 514, 16, 8, 28, 135, 104, 42, 0, 48, 772],
    hist: { 1: 531, 2: 211, 3: 735, 4: 180, 5: 670 },
  },
  3000: {
    hash: '0xa26c3e80', lit: 2007,
    bands: [194, 303, 281, 0, 196, 79, 72, 6, 104, 0, 0, 772],
    hist: { 1: 288, 2: 169, 3: 870, 4: 143, 5: 537 },
  },
  6000: {
    hash: '0x418d7b6e', lit: 2362,
    bands: [195, 349, 601, 8, 219, 99, 32, 87, 0, 0, 0, 772],
    hist: { 1: 543, 2: 262, 3: 731, 4: 129, 5: 697 },
  },
};
