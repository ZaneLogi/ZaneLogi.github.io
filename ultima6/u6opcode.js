// U6 Script Opcode Constants

// the text pattern is used in the script as below

// @ : following word is highlighted
// * : stop and wait for ENTER/SPACE/ESC key (similiar to `wait' command)

// $G : gender title ("milord", "milady")
// $P : player name
// $N : NPC name
// $T : time of day ("morning", "afternoon", "evening")
// $Y : set-able name, of any NPC
// $Z : previous input
// $X : the value of string variable X
// #X : the value of variable X
// <> : upper-case text between greater-than & less-than brackets is printed as
//      Runic; lower-case text is printed as Gargish
// /\ : !?? related to plural word inflections, text after \ is printed if some
//      variable is not 1, text after / is printed if some variable is 1 ??
// && : ! a block of text before the first ampersand may be "translated" - replaced
//      by a block of text before the second ampersand

export const U6OP = {
  GT: 0x81,        // >
  GE: 0x82,        // >=
  LT: 0x83,        // <
  LE: 0x84,        // <=
  NE: 0x85,        // !=
  EQ: 0x86,        // ==

  ADD: 0x90,       // +
  SUB: 0x91,       // -
  MUL: 0x92,       // *
  DIV: 0x93,       // /
  LOR: 0x94,       // |
  LAND: 0x95,      // &

  CANCARRY: 0x9a,
  WEIGHT: 0x9b,
  HORSED: 0x9d,
  HASOBJ: 0x9f,

  RAND: 0xa0,      // generate a random number (min, max)
  IF: 0xa1,
  ENDIF: 0xa2,
  ELSE: 0xa3,
  SETF: 0xa4,      // set flag
  CLEARF: 0xa5,    // clear flag
  DECL: 0xa6,      // declare variable
  EVAL: 0xa7,      // evaluate
  ASSIGN: 0xa8,    // assign value to the declared variable

  FLAG: 0xab,      // get npc flags

  JUMP: 0xb0,      // jump to the address

  VAR: 0xb2,       // integer data
  SVAR: 0xb3,      // string data
  DATA: 0xb4,      // list data

  BYE: 0xb6,

  NEW: 0xb9,       // create a new object for npc
  DELETE: 0xba,    // delete an object from npc
  OBJCOUNT: 0xbb,

  PORTRAIT: 0xbf,

  ADDKARMA: 0xc4,
  SUBKARMA: 0xc5,

  INPARTY: 0xc6,
  OBJINPARTY: 0xc7,

  GIVE: 0xc9,
  JOIN: 0xca,      // return 3: ALREADY IN PARTY, 2: PARTY TOO LARGE, 1: NOT ON LAND (vehicle), 0: SUCCESS
  PAUSE: 0xcb,     // pause the script and wait to hit any key
  LEAVE: 0xcc,     // return 2: NOT IN PARTY, 1: NOT ON LAND, 0: SUCCESS
  WORKTYPE: 0xcd,

  FUNC: 0xd1,      // execute the specific functions which are hard-coded.
  NUM32: 0xd2,
  NUM8: 0xd3,
  NUM16: 0xd4,

  RESURRECT: 0xd6,
  NPCNEARBY: 0xd7,
  SETNAME: 0xd8,   // set NPC name for $Y in the text
  HEAL: 0xd9,
  WOUNDED: 0xda,
  CURE: 0xdb,
  POISONED: 0xdc,
  NPC: 0xdd,       // return NPC id based on the index

  DF: 0xdf,        // unknown code in 018_Blood (MD), something like U6OP_SETNAME

  EXP: 0xe0,
  LVL: 0xe1,
  STR: 0xe2,
  INT: 0xe3,
  DEX: 0xe4,

  ENDANSWER: 0xee,
  KEYWORDS: 0xef,

  LOOK: 0xf1,
  CONVERSE: 0xf2,
  PREFIX: 0xf3,

  ANSWER: 0xf6,
  ASK: 0xf7,
  ASKC: 0xf8,

  INPUT: 0xfb,
  INPUTNUM: 0xfc,

  ID: 0xff,
};
