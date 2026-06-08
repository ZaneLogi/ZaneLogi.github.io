// systems/conversation/opcodes.js
//
// U6 conversation bytecode opcodes, by byte value, named after the source
// (seg_1703.c #defines — preferred over the legacy port's Nuvie names so the
// VM lines up with docs/research_conversation_vm.md + research_i13_conversation_vm.md).
// Bytes < 0x80 are printable ASCII text; >= 0x80 are opcodes.

export const OP = {
  // comparison (parse_factor)
  SUP: 0x81, SUPE: 0x82, INF: 0x83, INFE: 0x84, DIF: 0x85, EQU: 0x86,
  // arithmetic / logic (parse_factor)
  ADD: 0x90, SUB: 0x91, MUL: 0x92, DIV: 0x93, OR: 0x94, AND: 0x95,
  // world-read / action operators (parse_factor)
  CANCARRY: 0x9a, WEIGHT: 0x9b, GETHORSE: 0x9c, HORSED: 0x9d, REST: 0x9e, OWNS: 0x9f,
  RND: 0xa0,
  // control + variables
  IF: 0xa1, ENDIF: 0xa2, ELSE: 0xa3, SET: 0xa4, CLR: 0xa5,
  LET: 0xa6, END_OF_FACTOR: 0xa7, LET_VALUE: 0xa8, TST: 0xab,
  GOTO: 0xb0, CALL: 0xb1, VARINT: 0xb2, VARSTR: 0xb3, B4: 0xb4, PRINTSTR: 0xb5, LEAVE: 0xb6,
  STRSEARCH: 0xb7, ENDSEARCH: 0xb8,
  GIVEOBJ: 0xb9, TAKEOBJ: 0xba, TEST_OBJ: 0xbb, BC: 0xbc, BD: 0xbd,
  SHOW_INVENTORY: 0xbe, SHOW_CONVERSE: 0xbf, SELECT_OBJECT: 0xc0,
  OWNER: 0xc1, OBJTYPE: 0xc2, VALSEARCH: 0xc3, ADDKARMA: 0xc4, SUBKARMA: 0xc5,
  ISINPARTY: 0xc6, WHOSGOT: 0xc7, MOVEOBJ: 0xc8, TRANSFEROBJ: 0xc9, JOIN: 0xca,
  WAIT: 0xcb, LEAVEPARTY: 0xcc, SETMODE: 0xcd,
  DELAY: 0xd0, ADDRESS: 0xd2, BYTE: 0xd3, WORD: 0xd4, D5: 0xd5,
  RESURRECT: 0xd6, ISONSCREEN: 0xd7, D8: 0xd8, HEAL: 0xd9, WOUNDED: 0xda, CURE: 0xdb,
  POISONNED: 0xdc, DD: 0xdd, DF: 0xdf,
  ADDEXP: 0xe0, ADDLVL: 0xe1, ADDSTR: 0xe2, ADDINT: 0xe3, ADDDEX: 0xe4,
  NPC: 0xeb,                       // self-reference marker → resolves to the talk target
  ENDRES: 0xee, KEY: 0xef, F0: 0xf0,
  DESC: 0xf1, MAIN: 0xf2, PREFIX: 0xf3,
  RES: 0xf6, ASKTOP: 0xf7, GET: 0xf8, GETSTR: 0xf9, GETCHR: 0xfa, GETINT: 0xfb, GETDIGIT: 0xfc,
  ID: 0xff,
};

// VarStr/VarInt index for a variable letter or digit: digits 0..9 are the scratch
// slots, letters A..Z map to 10..35 (letter - 0x37). seg_16E1.c / seg_1703.c.
export function varIndex(ch) {
  const c = typeof ch === 'number' ? ch : ch.charCodeAt(0);
  if (c >= 0x30 && c <= 0x39) return c - 0x30;   // '0'..'9' -> 0..9
  return c - 0x37;                                // 'A'..'Z' -> 10..35
}
