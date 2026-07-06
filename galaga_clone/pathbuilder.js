// pathbuilder.js — an ASSEMBLER for galaga path bytecode.
//
// galaga's paths are little bytecode programs: bugMotion.js is the per-tick INTERPRETER
// (the Z80 `f_08D3` loop) and paths.js is the byte-stream DATA. This is the assembler for
// that data — readable chained calls that assemble back to the very same bytes.
//
// It covers galaga's TWO path layouts with one class:
//   • Fly-in paths — jump targets are ABSOLUTE Z80 ROM addresses; the F0/F7 sub-paths
//     attach via `.subPath(addr, sub)` → output carries a `.subPaths` map keyed by
//     absolute address (the shape bugMotion's F0/F7 handlers look the target up in).
//   • Region paths (attack / convoy / boss) — one contiguous array + a `z80Base`, where
//     jumps carry absolute addresses the interpreter resolves by offset (addr − base).
//     Author these with `.label()` / `.entry()` and jump BY NAME; build() resolves each
//     label to base+offset → output carries `.z80Base` + `.entries` (named launch points).
//
// A jump target is a NUMBER (a literal absolute address — every fly-in jump, plus a
// region's out-of-region targets, which bugMotion maps to TURN_HOME) or a STRING (an
// in-region label, resolved at build). build() attaches whichever metadata the path
// used, so there are no "modes" — one class emits either layout. Byte-for-byte
// round-trips against paths.js prove each assembly (demos/path_player.js does it live).
//
// Encoding (research_path_data.md §2):
//   SEGMENT (byte0 < 0xEF): 3 bytes — byte0 = (vy<<4)|vx (both unsigned 0-15), byte1 =
//     rotRate (signed 8-bit), byte2 = duration. Direction comes from the angle.
//   TOKEN (byte >= 0xEF): 1 opcode byte + token-specific args. Token semantics live in
//     bugMotion.js's dispatch (case_XXXX).

export const TOK = {
  END: 0xFF, BREAK: 0xFE, JUMP: 0xFD, DIVE: 0xFC, TURN_HOME: 0xFB,
  LOOP_TOP: 0xFA, REENTER_COLUMN: 0xF9, REENTER_TOP: 0xF8, ATTACK_TURN: 0xF7,
  FREE_FLIGHT: 0xF6, SET_STATUS3: 0xF5, CAPTURE_DIVE: 0xF4,
  BREAK_TARGETED: 0xF3, BONUS_SPLIT: 0xF2, DIVE_HOME: 0xF1,
  ATTACK_WAVE: 0xF0, BOMB_MODE: 0xEF,
};

const u8 = (v) => v & 0xFF;

export class PathBuilder {
  // opts: a name string (fly-in) or { name, base } — set `base` for a region path.
  constructor(opts = {}) {
    if (typeof opts === 'string') opts = { name: opts };
    this.name = opts.name || '';
    this.base = opts.base;                 // region: the z80Base; fly-in: undefined
    this.items = [];
    this._subs = {};
  }

  // --- structure ---
  label(name) { this.items.push({ t: 'label', name }); return this; }          // in-region jump target
  entry(name) { this.items.push({ t: 'label', name, entry: true }); return this; } // + a named launch entry
  subPath(addr, sub) { this._subs[addr] = sub; return this; }                    // fly-in F0/F7 target
  raw(...b) { this.items.push({ t: 'bytes', b }); return this; }                 // escape hatch
  seg({ vx, vy, rot = 0, dur }) { this.items.push({ t: 'bytes', b: [((vy & 0x0F) << 4) | (vx & 0x0F), u8(rot), u8(dur)] }); return this; }

  // --- 0-arg tokens ---
  end() { return this.raw(TOK.END); }                                            // 0xFF
  turnHome() { return this.raw(TOK.TURN_HOME); }                                  // 0xFB
  reenterColumn() { return this.raw(TOK.REENTER_COLUMN); }                        // 0xF9 case_0B5F: re-enter — set X to the home column
  reenterTop() { return this.raw(TOK.REENTER_TOP); }                              // 0xF8 case_0B87: re-enter — set Y to the top edge (0x9C)
  setStatus3() { return this.raw(TOK.SET_STATUS3); }                             // 0xF5 set status 3, continue
  captureDive() { return this.raw(TOK.CAPTURE_DIVE); }                           // 0xF4 capture-boss diving
  diveHome() { return this.raw(TOK.DIVE_HOME); }                                 // 0xF1 diving stops, go home

  // --- 1-byte-arg tokens ---
  dive(originY) { return this.raw(TOK.DIVE, u8(originY)); }                       // 0xFC case_0B4E: start dive — set origin/reference Y (0x06) + the bee/boss dive flag
  freeFlight(angle) { return this.raw(TOK.FREE_FLIGHT, u8(angle)); }             // 0xF6 case_0BA8: enter free-flight — set heading = angle<<2 (10-bit) + arm bomb-drop

  // --- table tokens ---
  // 0xFE BREAK formation: opcode + an 8-byte inline targeting table (advances HL by 9).
  breakFormation(table) {
    if (table.length !== 8) throw new Error(`breakFormation needs 8 table bytes, got ${table.length}`);
    return this.raw(TOK.BREAK, ...table);
  }
  // 0xF3 BREAK_TARGETED (case_0A01, gg1-5.s:1661): opcode + an 8-byte deltaX→duration
  // SELECTION TABLE. The handler reads the ship's horizontal delta, indexes the table,
  // and uses the picked byte as the segment duration — it is NOT a jump and carries no
  // address. advances HL by 9.
  breakTargeted(table) {
    if (table.length !== 8) throw new Error(`breakTargeted needs an 8-byte table, got ${table.length}`);
    return this.raw(TOK.BREAK_TARGETED, ...table);
  }

  // --- address tokens: target is a NUMBER (literal absolute addr) or a STRING (label) ---
  jump(t) { return this._j(TOK.JUMP, t); }                                        // 0xFD
  loopTop(t) { return this._j(TOK.LOOP_TOP, t); }                                 // 0xFA case_0BD1: conditional jump — jump to t UNLESS continuous-bombing (cont_bmb && !f_2000)
  bonusSplit(t) { return this._j(TOK.BONUS_SPLIT, t); }                           // 0xF2 spawn split-off bee
  bombMode(t) { return this._j(TOK.BOMB_MODE, t); }                               // 0xEF stage-8+ gated jump
  attackWave(t) { return this._j(TOK.ATTACK_WAVE, t); }                           // 0xF0 stage-8+ gate
  attackTurn(t) { return this._j(TOK.ATTACK_TURN, t); }                           // 0xF7 transient gate
  _j(op, target) { this.items.push({ t: 'jump', op, target }); return this; }

  build() {
    // pass 1 — assign each label its byte offset; collect named entry points
    const labels = {}, entries = {};
    let off = 0;
    for (const it of this.items) {
      if (it.t === 'label') { labels[it.name] = off; if (it.entry) entries[it.name] = off; }
      else if (it.t === 'bytes') off += it.b.length;
      else off += 3 + (it.extra ? it.extra.length : 0);      // a jump (opcode + addr [+ LUT])
    }
    // pass 2 — emit; resolve jumps (string label → base+offset, number → literal absolute addr)
    const resolve = (target) => {
      if (typeof target !== 'string') return target;
      if (labels[target] === undefined) throw new Error(`jump to unknown label "${target}"`);
      if (this.base === undefined) throw new Error(`label "${target}" used without a base`);
      return this.base + labels[target];                     // ← the resolution fly-in jumps don't need
    };
    const bytes = [];
    for (const it of this.items) {
      if (it.t === 'label') continue;
      if (it.t === 'bytes') { for (const b of it.b) bytes.push(u8(b)); continue; }
      const a = resolve(it.target);
      bytes.push(u8(it.op), a & 0xFF, (a >> 8) & 0xFF, ...(it.extra || []).map(u8));
    }
    // attach whichever metadata this path used (no metadata for a plain fly-in path)
    const out = Uint8Array.from(bytes);
    const subKeys = Object.keys(this._subs);
    if (subKeys.length) { out.subPaths = {}; for (const k of subKeys) out.subPaths[k] = this._subs[k].build(); }
    if (this.base !== undefined) out.z80Base = this.base;
    if (Object.keys(entries).length) out.entries = entries;
    return out;
  }
}
