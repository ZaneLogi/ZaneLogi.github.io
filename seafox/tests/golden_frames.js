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
    hash: '0x10cccdf8', lit: 1469,
    bands: [0, 28, 286, 0, 109, 4, 12, 4, 105, 0, 0, 921],
    hist: { 1: 321, 2: 265, 3: 402, 4: 29, 5: 452 },
  },
  300: {
    hash: '0x28eb56bb', lit: 1917,
    bands: [96, 279, 400, 0, 177, 2, 35, 14, 11, 128, 3, 772],
    hist: { 1: 456, 2: 208, 3: 627, 4: 85, 5: 541 },
  },
  1200: {
    hash: '0xf18e583a', lit: 2580,
    bands: [300, 357, 508, 6, 246, 71, 104, 194, 2, 4, 16, 772],
    hist: { 1: 531, 2: 210, 3: 829, 4: 239, 5: 771 },
  },
  3000: {
    hash: '0x80e0ac0f', lit: 2362,
    bands: [177, 252, 518, 97, 148, 115, 165, 11, 107, 0, 0, 772],
    hist: { 1: 394, 2: 241, 3: 739, 4: 281, 5: 707 },
  },
  // Regenerated once, deliberately: the payload's own response now removes it
  // when the player collects it or the CLAM eats it ($75CB), instead of only
  // clearing the convoy flag. Ticks 1-3000 are unchanged, because nothing
  // differs until a clam takes a cargo; from that event on, one fewer entity
  // means the array compacts differently (swap-with-last, § 4.6) and the
  // deterministic demo diverges. The change was verified against the ROM and by
  // mutation before this line was touched.
  6000: {
    hash: '0x4f540589', lit: 1859,
    bands: [1, 268, 522, 0, 0, 28, 181, 87, 0, 0, 0, 772],
    hist: { 1: 457, 2: 188, 3: 601, 4: 79, 5: 534 },
  },
};
