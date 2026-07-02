// lunar_lander/boom.js
//
// The crash explosion — the BOOM routine (A34573.1A :3340) + its debris pictures
// (A34599.1C), extracted from demos/explosion.js (the working routine-level
// translation; full decode in docs/research_explosion.md). Pure data + a pure
// segment builder: the SEQUENCE clock (the source's INDEX, 1→127, +1 every other
// frame) is the shared state.sequenceStep (MOTCHK :522-525), and the
// impact point is the ship's screen position at the crash — both supplied by the
// caller (main.js render).
//
// Gameplay difference from the demo shell (labeled): residual lander velocity
// (DELTA :560 → the octagon's crash-drift) is NOT ported — the octagon tumbles
// in place. The fragments' spread dwarfs the drift; revisit with the GAMODE step
// if it reads wrong against MAME.

import { ROM599 } from './discovery_rom_data.js';
import { runList } from './dvg.js';

// Piece index 0..5 = the six fragments, 6 = the cabin octagon; drawn octagon-first
// (BOOM steps X = 12,10,..,0 and piece Y = X/2).
const DRAW_ORDER = [6, 5, 4, 3, 2, 1, 0];

// BOOMC1 (:3478) — the INDEX at which each piece disappears (shared by all four
// patterns); the octagon (piece 6) lasts to $7F = 127 = the sequence end.
const DISAPPEAR = [0x5D, 0x60, 0x64, 0x6D, 0x70, 0x74, 0x7F];
export const BOOM_MAX_INDEX = 0x7F;

// The 8 cabin octagon poses OCT00..07 ($4800.. — A34599.1C:50); the pod tumbles
// by INDEX&7 (:3387), each pose trailed by its baked dark move (OCTX0..7 :626).
const OCTAGON = ['S_4800', 'S_4826', 'S_4844', 'S_486A', 'S_4890', 'S_48AC', 'S_48D2', 'S_48F8'];
const OCT_TRAIL = [[2, 7], [1, 8], [0, 9], [-2, 8], [4, 8], [3, 8], [1, 8], [-1, 8]];

// The four hand-authored patterns (RNDOM 0-3 picks one per crash): delta[piece] =
// per-INDEX velocity from BOOMA{n} (:3445); glyph[piece] = the JSRL'd debris
// picture from BOOMB{n} (A34599.1C:658; $4F1C..$4FBE = PIECE1..PIEC12).
const PATTERNS = [
  { // RNDOM 0 — BOOMA1 / BOOMB1
    delta: [[0, -2], [-1, -1], [-2, 0], [-1, 0], [0, 2], [2, -1], [0, 3]],
    glyph: ['S_4F1C', 'S_4F28', 'S_4F3A', 'S_4F46', 'S_4F52', 'S_4F62'],  // PIECE1..6
  },
  { // RNDOM 1 — BOOMA2 / BOOMB2
    delta: [[2, 1], [0, 1], [-4, 1], [-1, -1], [2, 0], [0, -1], [0, 2]],
    glyph: ['S_4F6E', 'S_4F78', 'S_4F8E', 'S_4FA0', 'S_4FAE', 'S_4FBE'],  // PIEC7..12
  },
  { // RNDOM 2 — BOOMA3 / BOOMB3
    delta: [[-1, 0], [-3, 0], [1, 0], [-1, -1], [0, -1], [3, 0], [0, 3]],
    glyph: ['S_4F3A', 'S_4FBE', 'S_4F8E', 'S_4F62', 'S_4F46', 'S_4FBE'],  // PIECE3,12,9,6,4,12
  },
  { // RNDOM 3 — BOOMA4 / BOOMB4
    delta: [[1, -1], [-5, 0], [1, -1], [3, 1], [-1, -3], [1, 1], [0, 3]],
    glyph: ['S_4F78', 'S_4F28', 'S_4F3A', 'S_4FA0', 'S_4F62', 'S_4F6E'],  // PIEC8,2,3,10,6,7
  },
];

// Segments of pattern p (0-3) at step `index` (1..127), impact-relative DVG units.
// The walk is CUMULATIVE — one moving beam, pieces in draw order, each adding its
// dark delta·INDEX positioning move (a piece past its disappear time adds neither
// move nor glyph, :3348) — exactly the source's single VG-list walk.
export function boomSegs(p, index) {
  const pat = PATTERNS[p] || PATTERNS[0];
  const segs = [];
  const cur = { x: 0, y: 0 };
  const push = (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri });
  for (const y of DRAW_ORDER) {
    if (index > DISAPPEAR[y]) continue;
    cur.x += pat.delta[y][0] * index;
    cur.y += pat.delta[y][1] * index;
    if (y === 6) {                                   // the tumbling cabin octagon
      runList(ROM599, ROM599[OCTAGON[index & 7]], cur, 0, push, false, false);
      cur.x += OCT_TRAIL[index & 7][0];
      cur.y += OCT_TRAIL[index & 7][1];
    } else {                                         // a debris fragment
      runList(ROM599, ROM599[pat.glyph[y]], cur, 0, push, false, false);
    }
  }
  return segs;
}
