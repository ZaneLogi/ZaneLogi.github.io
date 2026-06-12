// Derived character-stat formulas — the two "max" values U6 computes on demand rather than
// storing them (source computes both in seg_2337.c; they are NOT saved bytes). Pure functions:
// the I-18 status view (ZSTATS) reads the current STR/DEX/INT/HP/MP/Level/Exp straight off the
// objlist actor record and uses these for the cur / MAX display. No state, no component — the
// objlist is the canonical stat store (progress.md §"I-18 scope" → "Data layer").

// MaxHP (C_2337_0529, seg_2337.c:226): 30 hit points per level, floored at 1, capped at 255.
export function maxHP(level) {
  const si = (level | 0) * 30;
  if (si === 0) return 1;            // source's `if(si == 0) si = 1` (level 0 → 1)
  return si > 255 ? 255 : si;        // `if(si > 255) return 255`
}

// MaxMagic (C_2337_0559, seg_2337.c:237): spell points = a body-type-keyed multiple of INT.
// Only the four spellcasting character types get magic; everything else returns 0. Types per
// obj.h: 0x19a (OBJ_19A, the Avatar), 0x17a (OBJ_17A), 0x179 (OBJ_179), 0x182 (OBJ_182) — the
// same four seg_0A33.c:879 gates the magic display on. Source uses a standalone `if(==0x19a)`
// then an `if/else if` chain; the four types are mutually exclusive, so these early returns
// reproduce it exactly.
export function maxMagic(objType, intelligence) {
  const int = intelligence | 0;
  if (objType === 0x19a) return int << 1;                       // 2 × INT
  if (objType === 0x17a) return int;                            // 1 × INT
  if (objType === 0x179 || objType === 0x182) return int >> 1;  // ½ × INT
  return 0;                                                     // non-casters
}
