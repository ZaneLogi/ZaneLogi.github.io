// resources/spells.js — I-spellbook ROM data.
//
// The U6 spell tables extracted **verbatim** from `seg_1944.c` (+ `spells.h`), like the
// moongate red-gate ROM table. Pure data + tiny pure accessors; nothing here reads the
// user's dropped files, the world, or the DOM — so it's unit-testable in isolation.
//
//   SpellName[]        seg_1944.c:143  — 16 slots/circle (10 named + 6 empty "")
//   Reagents_needed[]  seg_1944.c:255  — per-spell reagent bitmask, same 16/circle layout
//   Reagents_name[]    seg_1944.c:242  — the 8 reagent display names (bit-index order)
//   ReagType[]         seg_1944.c:253  — reagent bit -> object number
//   MK_CIRCLE(n)       spells.h:112    — n/0x10 + 1
//   REAGENT_xx bits    spells.h:9-16

// --- reagents -------------------------------------------------------------------------
// Bit values (spells.h:9-16). Index 0..7 = MR,NS,BP,BM,SS,GA,GS,SA (the Reagents_name order).
export const REAGENT = { MR: 0x01, NS: 0x02, BP: 0x04, BM: 0x08, SS: 0x10, GA: 0x20, GS: 0x40, SA: 0x80 };
const { MR, NS, BP, BM, SS, GA, GS, SA } = REAGENT;

// Bit-index order (matches Reagents_name[] / ReagType[]).
export const REAGENT_ABBR = ['MR', 'NS', 'BP', 'BM', 'SS', 'GA', 'GS', 'SA'];
export const REAGENT_NAME = [
  'mandrake root', 'nightshade', 'black pearl', 'blood moss',
  'spider silk', 'garlic', 'ginseng', 'sulfurous ash',
];
// ReagType[] (seg_1944.c:253) — reagent bit-index -> object number, for the carried-reagent tint.
export const REAGENT_OBJ = [0x045, 0x046, 0x041, 0x042, 0x047, 0x043, 0x044, 0x048];

// Display order = descending bit value (SA…MR) — the order U6's book/help prints reagents
// (e.g. Create Food shows "GS GA MR", Telekinesis "BM BP MR"). Bit indices high→low.
const DISPLAY_BIT_ORDER = [7, 6, 5, 4, 3, 2, 1, 0];

// --- SpellName[] (seg_1944.c:143) — verbatim, 16 slots per circle (10 named + 6 "") ----
export const SPELL_NAME = [
  // 1st circle (0x00-0x0F)
  'Create Food', 'Detect Magic', 'Detect Trap', 'Dispel Magic', 'Douse', 'Harm', 'Heal', 'Help', 'Ignite', 'Light',
  '', '', '', '', '', '',
  // 2nd circle (0x10-0x1F)
  'Infravision', 'Magic Arrow', 'Poison', 'Reappear', 'Sleep', 'Telekinesis', 'Trap', 'Unlock Magic', 'Untrap', 'Vanish',
  '', '', '', '', '', '',
  // 3rd circle (0x20-0x2F)
  'Curse', 'Dispel Field', 'Fireball', 'Great Light', 'Lock', 'Mass Awaken', 'Mass Sleep', 'Peer', 'Protection', 'Repel Undead',
  '', '', '', '', '', '',
  // 4th circle (0x30-0x3F)
  'Animate', 'Conjure', 'Disable', 'Fire Field', 'Great Heal', 'Locate', 'Mass Dispel', 'Poison Field', 'Sleep Field', 'Wind Change',
  '', '', '', '', '', '',
  // 5th circle (0x40-0x4F)
  'Energy Field', 'Explosion', 'Insect Swarm', 'Invisibility', 'Lightning', 'Paralyze', 'Pickpocket', 'Reveal', 'Seance', 'X-ray',
  '', '', '', '', '', '',
  // 6th circle (0x50-0x5F)
  'Charm', 'Clone', 'Confuse', 'Flame Wind', 'Hail Storm', 'Mass Protect', 'Negate Magic', 'Poison Wind', 'Replicate', 'Web',
  '', '', '', '', '', '',
  // 7th circle (0x60-0x6F)
  'Chain Bolt', 'Enchant', 'Energy Wind', 'Fear', 'Gate Travel', 'Kill', 'Mass Curse', 'Mass Invis', 'Wing Strike', 'Wizard Eye',
  '', '', '', '', '', '',
  // 8th circle (0x70-0x7F)
  'Armageddon', 'Death Wind', 'Eclipse', 'Mass Charm', 'Mass Kill', 'Resurrect', 'Slime', 'Summon', 'Time Stop', 'Tremor',
  '', '', '', '', '', '',
];

// --- Reagents_needed[] (seg_1944.c:255) — verbatim, same 16/circle layout -------------
export const REAGENTS_NEEDED = [
  // 1st circle
  GS | GA | MR, SA | NS, SA | NS, GS | GA, GA | BP, SS | NS, GS | SS, 0, SA | BP, SA,
  0, 0, 0, 0, 0, 0,
  // 2nd circle
  SA | NS, SA | BP, BM | BP | NS, SS | BM | BP, SS | BP | NS, BM | BP | MR, SS | NS, SA | BM, SA | BM, GA | BM | BP,
  0, 0, 0, 0, 0, 0,
  // 3rd circle
  SA | GA | NS, SA | BP, SA | BP, SA | MR, SA | GA | BM, GS | GA, GS | SS | NS, NS | MR, SA | GS | GA, SA | GA,
  0, 0, 0, 0, 0, 0,
  // 4th circle
  SA | BM | MR, SS | MR, SS | NS | MR, SA | SS | BP, GS | SS | MR, NS, SS | BP | NS, GS | SS | BP, GS | GA, SA | BM,
  0, 0, 0, 0, 0, 0,
  // 5th circle
  SS | BP | MR, SA | BM | BP | MR, SA | SS | BM, BM | NS, SA | BP | MR, SA | SS | BP | NS, SS | BM | NS, SS | NS | MR, SA | SS | BM | NS | MR, SA | MR,
  0, 0, 0, 0, 0, 0,
  // 6th circle
  SS | BP | NS, SA | GS | SS | BM | NS | MR, NS | MR, SA | BM | MR, BM | BP | MR, SA | GS | GA | MR, SA | GA | MR, SA | BM | NS, SA | GS | SS | BM | NS, SS,
  0, 0, 0, 0, 0, 0,
  // 7th circle
  SA | BM | BP | MR, SA | SS | MR, SA | BM | NS | MR, GA | NS | MR, SA | BP | MR, SA | BP | NS, SA | GA | NS | MR, BM | BP | NS | MR, SA | SS | BM | MR, SA | SS | BM | BP | NS | MR,
  0, 0, 0, 0, 0, 0,
  // 8th circle
  0, SA | BM | NS | MR, SA | GA | BM | NS | MR, SS | BP | NS | MR, SA | BP | NS | MR, SA | GS | GA | SS | BM | MR, BM | NS | MR, GA | SS | BM | MR, GA | BM | MR, SA | BM | MR,
  0, 0, 0, 0, 0, 0,
];

// --- accessors (pure) -----------------------------------------------------------------

// MK_CIRCLE (spells.h:112): circle 1..8 from a spell number.
export const circleOf = (n) => Math.floor(n / 0x10) + 1;

// Roman-ish circle label for the book headers.
const CIRCLE_LABEL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
export const circleLabel = (circle) => `${CIRCLE_LABEL[circle - 1] ?? circle} Circle`;

// The reagent bitmask for a spell number (0 if unknown / empty slot).
export const reagentsFor = (n) => REAGENTS_NEEDED[n] | 0;

// The set reagents of a mask, in DISPLAY order (SA…MR), as { abbr, name, bit, idx }.
export function reagentParts(mask) {
  const out = [];
  for (const idx of DISPLAY_BIT_ORDER) {
    const bit = 1 << idx;
    if (mask & bit) out.push({ abbr: REAGENT_ABBR[idx], name: REAGENT_NAME[idx], bit, idx });
  }
  return out;
}

// The 7 spells I-spellbook actually implements; every other named spell fizzles. This is
// the canonical set the cast registry registers against (sub-steps b/c) AND the book's ★.
export const Create_Food = 0x00, Heal = 0x06, Telekinesis = 0x15, Unlock_Magic = 0x17,
  Mass_Awaken = 0x25, Locate = 0x35, Gate_Travel = 0x64;
export const IMPLEMENTED = new Set([Create_Food, Heal, Telekinesis, Unlock_Magic, Mass_Awaken, Locate, Gate_Travel]);

// One-line descriptions for the book footer (clone-authored UX text, not source data).
export const SPELL_DESC = {
  [Create_Food]: 'Conjures food into your pack.',
  [Heal]: 'Restores a party member’s health.',
  [Telekinesis]: 'Moves a distant object — a lever, crank, or loose item — from afar.',
  [Unlock_Magic]: 'Dispels the magical lock on a door or chest.',
  [Mass_Awaken]: 'Wakes nearby sleepers.',
  [Locate]: 'Reads your sextant position.',
  [Gate_Travel]: 'Steps you to a moon-phase’s buried moonstone.',
};

// Named spells grouped by circle, for the book UI: [{ circle, label, entries:[{num,name,mask,implemented}] }].
export function namedSpellsByCircle() {
  const circles = [];
  for (let n = 0; n < SPELL_NAME.length; n++) {
    const name = SPELL_NAME[n];
    if (!name) continue;
    const circle = circleOf(n);
    let bucket = circles[circle - 1];
    if (!bucket) bucket = circles[circle - 1] = { circle, label: circleLabel(circle), entries: [] };
    bucket.entries.push({ num: n, name, mask: reagentsFor(n), implemented: IMPLEMENTED.has(n) });
  }
  return circles.filter(Boolean);
}

// The carried-reagent have-mask from any iterable of carried object numbers (recurse bags
// at the call site). Pure: maps obj number -> reagent bit via ReagType. Used for the tint.
export function reagentMaskFromCarried(objNumbers) {
  const set = objNumbers instanceof Set ? objNumbers : new Set(objNumbers);
  let mask = 0;
  for (let idx = 0; idx < 8; idx++) if (set.has(REAGENT_OBJ[idx])) mask |= (1 << idx);
  return mask;
}
