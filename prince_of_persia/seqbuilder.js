// seqbuilder.js — the PoP sequence *assembler* (logic): the opcode set + a tiny
// builder that mirrors SDLPoP seqtbl.c's LABEL/act/dx/jmp macros. PoP-agnostic —
// it knows the instruction *encoding*, not any particular sequence. The actual
// run/stand table is assembled from these in seqtbl.js (the data); the resulting
// bytes are executed by playseq.js (the interpreter). GPLv3 (see NOTICE).

// opcodes — types.h `enum seqtbl_instructions`
export const SEQ = {
  DX: 0xFB, DY: 0xFA, FLIP: 0xFE, JMP_IF_FEATHER: 0xF7, JMP: 0xFF,
  UP: 0xFD, DOWN: 0xFC, ACTION: 0xF9, SET_FALL: 0xF8,
  KNOCK_UP: 0xF5, KNOCK_DOWN: 0xF4, SOUND: 0xF2, END_LEVEL: 0xF1,
  GET_ITEM: 0xF3, DIE: 0xF6,
};

// --- tiny assembler mirroring seqtbl.c's LABEL/act/dx/jmp macros ---
// Chain calls to lay down opcodes/frames/labels, then build() to resolve label
// offsets and patch jmp targets into a flat byte stream.
export class SeqBuilder {
  constructor() { this.toks = []; }
  label(n) { this.toks.push({ t: 'label', n }); return this; }
  _b(...vs) { for (const v of vs) this.toks.push({ t: 'byte', v: v & 0xFF }); return this; }
  frame(f) { return this._b(f); }
  act(a) { return this._b(SEQ.ACTION, a); }
  dx(n) { return this._b(SEQ.DX, n & 0xFF); }
  dy(n) { return this._b(SEQ.DY, n & 0xFF); }
  flip() { return this._b(SEQ.FLIP); }
  up() { return this._b(SEQ.UP); }                  // SEQ_UP — curr_row-- (climb up a row)
  down() { return this._b(SEQ.DOWN); }              // SEQ_DOWN — curr_row++ (climb down a row)
  knockUp() { return this._b(SEQ.KNOCK_UP); }       // SEQ_KNOCK_UP (jump into ceiling)
  knockDown() { return this._b(SEQ.KNOCK_DOWN); }   // SEQ_KNOCK_DOWN (landings)
  die() { return this._b(SEQ.DIE); }                // SEQ_DIE (hard land)
  snd(s) { return this._b(SEQ.SOUND, s); }
  setFall(x, y) { return this._b(SEQ.SET_FALL, x & 0xFF, y & 0xFF); }
  jmp(n) { this.toks.push({ t: 'jmp', n }); return this; }
  build() {
    let off = 0; const labels = {};              // pass 1: resolve label offsets
    for (const tk of this.toks) {
      if (tk.t === 'label') labels[tk.n] = off;
      else off += (tk.t === 'jmp') ? 3 : 1;
    }
    const bytes = [];                            // pass 2: emit, patch jmp targets
    for (const tk of this.toks) {
      if (tk.t === 'byte') bytes.push(tk.v);
      else if (tk.t === 'jmp') {
        const d = labels[tk.n];
        if (d === undefined) throw new Error(`jmp to unknown label "${tk.n}"`);
        bytes.push(SEQ.JMP, d & 0xFF, (d >> 8) & 0xFF);
      }
    }
    return { bytes: Uint8Array.from(bytes), labels };
  }
}
