# Research: U6 conversation VM (talkdr)

**Status:** decoded 2026-05-28. `seg_1703.c` (1206 lines) and
`seg_16E1.c` (88 lines) read end-to-end, plus the
`LoadConversation` data-loader in `seg_2FC1.c:783-834`. Cross-
validated against `../ultima6/doc/u6converse.txt` (Nuvie tech doc),
`../ultima6/doc/investigation.txt` §"seg_1703" + §"seg_16E1", and
the substantial legacy port at `../ultima6/script.js` + opcode
table at `../ultima6/u6opcode.js`.

Citations use relative paths within the u6-decompiled clone (e.g.,
`seg_1703.c:714`) or legacy-port relative paths (`../ultima6/...`).
The u6-decompiled clone's absolute path is per-PC; see
[`../CLAUDE.md`](../CLAUDE.md) §"Source of truth".

## Headline summary

NPC dialogue is implemented as a **stack-based bytecode VM** that
executes per-NPC scripts loaded from two LZW-compressed library
files (`converse.a`, `converse.b`). The VM is single-threaded,
blocking on `CON_getch` during input phases — modeled like a
co-routine in modern terms: parse → print → input → resume.

Four-layer architecture:

| Layer | Function | Role |
|-------|----------|------|
| **Entry** | `TalkDriver(npc1, npc2)` at `seg_1703.c:1016` | Sets up `D_E796[]` (talker + addressee), loads conversation via `LoadConversation`, prints the `you see ...` description, then runs the outer ask/answer loop. |
| **Statement** | `parse_statement(objNum)` at `seg_1703.c:945` | Top-level read-and-dispatch loop. Printable bytes (0x20-0x7A + 0x0A) → `CON_putch`; `OP_KEY` → keyword answer-dispatcher; otherwise delegate to `execute_op`. Terminates on input opcodes or `mustLeave`. |
| **Control** | `execute_op(opcode, objNum)` at `seg_1703.c:714` | Dispatches ~30 control opcodes (IF/ELSE/ENDIF, GOTO, LET, PRINTSTR, GIVEOBJ/TAKEOBJ, SETMODE, JOIN/LEAVEPARTY, ADDKARMA, HEAL/CURE/RESURRECT, SHOW_INVENTORY/SHOW_CONVERSE, DELAY, REST, WAIT, ...). |
| **Expression** | `parse_factor()` at `seg_1703.c:295` | Stack-based RPN evaluator with `lstack[10]` local stack. Reads opcodes until `OP_END_OF_FACTOR` (0xa7) or `OP_LET_VALUE` (0xa8). Handles arithmetic (ADD/SUB/MUL/DIV), comparison (EQ/NE/SUP/SUPE/INF/INFE/DIF), variable lookup (VARINT/VARSTR), and ~25 query opcodes (RND, OWNS, WEIGHT, TST, ISINPARTY, HORSED, WOUNDED, ...). |

State is global: `TalkBuf[]` (10 KB script buffer), `Talk_PC`
(program counter into `TalkBuf`), `VarInt[32]` + `VarStr[32]`
(per-conversation variables, addressed by `letter - 0x37` for
letter vars and 0-9 for numbered), `TalkFlags[256]` (persistent
per-NPC bit flags), `mustLeave` (exit flag set by `OP_LEAVE`),
`IsInConversation` (mode flag).

## Data layer — converse.a / converse.b

The two conversation files are **lib_32** packages: a fixed-size
header of 32-bit absolute offsets, followed by per-entry payloads.

Per `LoadConversation` (`seg_2FC1.c:783-834`) the routing is:

- **NPC < 0x63** → `converse.a`, index = NPC.
- **NPC ≥ 0x63 and < 0xE0** → `converse.b`, index = NPC - 0x63.
- **NPC = 0xE0..0xFF (generic types):**
  - `OBJ_175` (Wisp) → `converse.b` index 0x66.
  - `OBJ_17E` (Guard) → `converse.b` index 0x67.
  - `OBJ_16B` (Gargoyle) → `converse.b` index 0x68.
  - Others → returns 0 (no conversation).
- Each entry begins with a 32-bit *uncompressed size*; if `0`, the
  payload is raw (max 0x2800 = 10240 bytes). Otherwise the entry is
  LZW-compressed and inflated via `decompress(...)` into the
  destination buffer.
- The destination buffer for `TalkDriver` is `TalkBuf` (10 KB malloc
  at `seg_0903.c:539-577`); the destination for the smaller
  name-only lookup at `C_1703_00A0` is the shared `ScratchBuf`.

Per `../ultima6/doc/u6converse.txt:8-25` (Nuvie tech doc): the
combined files cover NPCs 0..98 (`converse.a` has 99 entries,
indexes 0 = empty + 1 = Avatar empty) and NPCs 99..220 + 14
generic / shrine / temporary scripts (`converse.b`, 125 entries).
Combined ≈ 220 distinct scripts.

### Script layout per `u6converse.txt:36-50`

Each uncompressed entry is structured:

```
0xFF NPC_num NPC_name        <-- name section
0xF1 character_description   <-- look section ("You see ...")
0xF2|0xF3 main_script        <-- converse section (rest of script)
```

`0xFF` (OP__FF), `0xF1` (OP_DESC), `0xF2` (OP_MAIN) are the section
markers. `0xF3` (OP_PREFIX in the legacy port) sometimes substitutes
for `0xF2` — purpose still unknown per the tech doc. `TalkDriver`
reads through both markers in sequence (`seg_1703.c:1085-1101`):

```c
si = 2;  // skip 0xFF + NPC_num
while((opcode = TalkBuf[si++]) != OP_DESC) ...  // read $N name
...
while(PARSE_U8 != OP_DESC);   // skip description on first read
D_E79D = Talk_PC;             // save "you see" start
parse_statement(...);          // run "you see" body
...
while(PARSE_U8 != OP_MAIN);   // skip past 0xF2/0xF3 marker
```

`D_E79D` is the *cached* offset of the look section so the player
can re-trigger it later by typing `look` (handled at the outer
loop, `seg_1703.c:1186-1190`).

## Bytecode mechanics

### Stream + program counter

The script is a flat byte stream `TalkBuf[]`. `Talk_PC` is a global
`int` offset. The macros at `seg_1703.c:290-293` define the
stream-read primitives:

```c
#define PARSE_U8  (TalkBuf[Talk_PC++])
#define READ_U16  (*(unsigned far *)(TalkBuf + Talk_PC))
#define READ_S16  (*(int      far *)(TalkBuf + Talk_PC))
#define READ_U32  (*(unsigned long far *)(TalkBuf + Talk_PC))
```

Address operands (`OP_GOTO`, `OP__B4`, `OP_PRINTSTR` constant
strings) are 32-bit absolute offsets relative to the start of the
script. Source applies the macro `MK_0000(addr) = addr - D_E7A1`
(`seg_1703.c:288`); `D_E7A1` is always 0 in shipped scripts, so the
macro is effectively a no-op identity but is left as a safety
wrapper.

### Three data-size opcodes

`parse_factor` and most arg-taking opcodes accept literals via
prefix:

| Opcode | Width | Source name | Legacy name |
|--------|-------|-------------|-------------|
| `0xD2` | 4 bytes | `OP_ADDRESS` | `NUM32` |
| `0xD3` | 1 byte  | `OP_BYTE`    | `NUM8` |
| `0xD4` | 2 bytes | `OP_WORD`    | `NUM16` |

A bare byte 0x80-0xFF in an expression context is treated as an
opcode (the `switch(lstack[sidx])` dispatch in `parse_factor`); a
bare byte that doesn't match any opcode case is left on the stack
as its raw value (the legacy port's `evaluate()` does the same in
its `default` branch, `script.js:583-588`).

### RPN expression evaluator (`parse_factor`)

`lstack[10]` is a *long* stack (so 32-bit address values fit).
`sidx` is the depth. Reading proceeds opcode-by-opcode:

- Pure literals (`OP_BYTE` / `OP_WORD` / `OP_ADDRESS`) push directly,
  consuming the trailing 1/2/4 bytes.
- All other opcodes are looked up in a second switch (`seg_1703.c:326-677`):
  - **Arithmetic** (`OP_ADD/SUB/MUL/DIV`): pop 2, push 1. Note
    asymmetry: `OP_SUB` computes `lstack[sidx-2] - lstack[sidx-1]`
    (preserves source order — second-to-top minus top).
  - **Logical** (`OP_AND/OR`): coerce to boolean (push 1 or 0).
    Caveat: source uses *boolean* semantics (`if(a && b) 1 else 0`)
    while the legacy port's `evaluate()` does `arg1 | arg2 ? 1 : 0`
    — equivalent for boolean operands, divergent for non-boolean.
  - **Comparison** (`OP_SUP/SUPE/INF/INFE/EQU/DIF`): casts both
    operands to `unsigned long` then compares; for `OP_EQU`, if the
    `bp_58` flag was set (because a `VarStr` was just pushed),
    string-compare via `stricmp` instead.
  - **Variable lookup**:
    - `OP_VARINT` (0xB2) — pop index, push `VarInt[idx]`.
    - `OP_VARSTR` (0xB3) — pop index, push pointer to `VarStr[idx]`
      and set `bp_58 = 1` so the next `OP_EQU` does string-compare.
  - **Stack-array indexed lookup** (`OP__B4` = 0xB4) — pops two:
    *integer-variable* and *array-index*; seeks into the script
    treating the indirect address as `(idx<<1) + integer_var`; reads
    a signed-16 word; restores `Talk_PC`. Used for table lookups
    embedded in the script.
  - **Domain queries** — ~25 opcodes that read NPC / party / object
    state (`OP_TST`, `OP_OWNS`, `OP_ISINPARTY`, `OP_HORSED`,
    `OP_WOUNDED`, `OP_POISONNED`, `OP_OBJTYPE`, `OP_CANCARRY`,
    `OP_WEIGHT`, `OP_JOIN`, `OP_LEAVEPARTY`, `OP_ADDEXP`,
    `OP_ADDLVL`, `OP_ADDSTR`, `OP_ADDINT`, `OP_ADDDEX`,
    `OP__DD` party-member-by-index, `OP_ISONSCREEN`, `OP_WHOSGOT`,
    `OP_OBJTYPE`, `OP_SELECT_OBJECT`, `OP_OWNER`, `OP__BC`/`OP__BD`
    constant-100, `OP_STRSEARCH` linear search across packed
    `,`-terminated keyword lists, `OP_VALSEARCH` linear search
    across a 16-bit value array).

The evaluator terminates when it sees `OP_END_OF_FACTOR` (0xa7) or
`OP_LET_VALUE` (0xa8). Returns `lstack[0]`. Stack depth > 1 at exit
triggers `"Error occured.\n"`.

### Mid-loop NPC-self substitution

Every NPC argument passes through `mk_npcnum(opcode)` at
`seg_1703.c:147`:

```c
if(opcode == OP_NPC /*0xEB*/) return D_E796[0];  /* currently-talking NPC */
return opcode;
```

So a script can refer to its own NPC number with the constant
`0xEB` regardless of who's running it. The legacy port mirrors this
inline as `(npc != 0xeb ? npc : info.npcId)` at every NPC-taking
opcode in both `run()` and `evaluate()` (`script.js:205, 212, 251,
264, 282, 289, 295, 301, 307, 434, 446, 453, 460, 473, 495, 533,
542, 551, 559, 567, 577`). Functionally equivalent.

## Statement parser (`parse_statement`)

Top-level read loop. Reads one byte per iteration and dispatches:

- **0x20-0x7A** (printable ASCII + 0x0A newline) → `CON_putch(opcode)`.
- **0xEF (`OP_KEY`)** → `C_1703_1D01(objNum)` keyword dispatch (see below).
- **0x80-0xFE** → `execute_op(opcode, objNum)`.

Terminates when seeing any of:

| Terminator | Opcode | Semantic |
|------------|--------|----------|
| `OP_ASKTOP` | 0xF7 | Outer "you say:" prompt — return to ask loop |
| `OP_GET`    | 0xF8 | Single-char picker prompt |
| `OP_GETSTR` | 0xF9 | String input |
| `OP_ENDRES` | 0xEE | End of current answer body |
| `OP__F0`    | 0xF0 | Sentinel (also any opcode ≥ 0xF0 that isn't otherwise matched, but ≥OP__F0 falls through the `<` check) |
| `0x00`      | NUL  | Padding / end-of-data |

On exit it backs up `Talk_PC --` so the caller re-reads the
terminator. The `mustLeave` flag (set by `OP_LEAVE` = 0xB6) also
terminates the loop early.

### Keyword dispatcher — `C_1703_1D01` (`seg_1703.c:980-1014`)

Triggered when `parse_statement` sees `OP_KEY`. Reads keyword list
from the script (comma-separated, terminated by `OP_RES` = 0xF6),
then case-insensitively compares each keyword against `D_E732`
(user's input). Match → execute the body up to `OP_RES` is
consumed, then call `parse_statement` recursively to run the
answer. Non-match → skip the answer body (respecting `OP_GOTO`'s
4-byte address, `OP_BYTE`'s 1-byte arg, `OP_WORD`'s 2-byte arg).
The wildcard `*` keyword always matches (default-answer).

## Control opcode dispatcher (`execute_op`)

The full ~30 opcodes handled in `execute_op`'s switch, grouped:

### Flow control
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| `OP_IF`     | 0xA1 | `IF`     | Evaluate `parse_factor` → 0 → skip body until `OP_ELSE` or `OP_ENDIF`; non-zero → fall through |
| `OP_ELSE`   | 0xA3 | `ELSE`   | Skip body until `OP_ENDIF` (entered only after the IF-true branch finishes) |
| `OP_ENDIF`  | 0xA2 | `ENDIF`  | No-op (just marks end) |
| `OP_GOTO`   | 0xB0 | `JUMP`   | Read 4-byte absolute offset, set `Talk_PC` to it |
| `OP_LEAVE`  | 0xB6 | `BYE`    | Set `mustLeave = 1`, propagates up to outer loop |
| `OP_WAIT`   | 0xCB | `PAUSE`  | Print `↓` arrow, block on `CON_getch` |

### Output
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| (any printable byte 0x20-0x7A) | — | (inline) | `CON_putch` directly from `parse_statement` |
| `OP_PRINTSTR` | 0xB5 | (inline) | If next byte is `OP_ADDRESS` → seek to absolute offset, print until null; if `OP__D5` (0xD5) → print VarStr[idx] |

### Variable assignment
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| `OP_LET`       | 0xA6 | `DECL`   | Read index byte + type byte; if type is `OP_VARINT` (0xB2) → assign `parse_factor()` to `VarInt[idx]`; if `OP_VARSTR` (0xB3) → string assign (copy from constant address or from another VarStr); if type is `OP_ADDRESS` → write to absolute address in script (rare; used for script-table updates) |
| `OP_LET_VALUE` | 0xA8 | `ASSIGN` | Sub-opcode required after `OP_LET`; terminates `parse_factor`'s read loop when reached |
| `OP_END_OF_FACTOR` | 0xA7 | `EVAL` | Terminates `parse_factor` (no other side-effect) |

### Object mutation
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| `OP_GIVEOBJ`     | 0xB9 | `NEW`    | npc, obj, qual, quan → `GiveObj(...)` (insert into NPC's inventory; up to 144 per slot per tech doc) |
| `OP_TAKEOBJ`     | 0xBA | `DELETE` | npc, obj, qual, quan → `TakeObj(...)` |
| `OP_MOVEOBJ`     | 0xC8 | `MOVEOBJ` | npc, obj → `InsertObj(obj, npc, INVEN)` |
| `OP_TRANSFEROBJ` | 0xC9 | `GIVE`    | obj, qual, fromNpc, toNpc → find in `from`'s inventory + insert into `to`'s |

### Flags + persistent state
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| `OP_SET`       | 0xA4 | `SETF`     | npc, bit → `TalkFlags[npc] |= (1 << bit)` |
| `OP_CLR`       | 0xA5 | `CLEARF`   | npc, bit → `TalkFlags[npc] &= ~(1 << bit)` |
| `OP_ADDKARMA`  | 0xC4 | `ADDKARMA` | val → `KARMA += val` (cap 99) |
| `OP_SUBKARMA`  | 0xC5 | `SUBKARMA` | val → `KARMA -= val` (floor 0) |

### NPC state
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| `OP_SETMODE`     | 0xCD | `WORKTYPE`     | npc, mode → `NPCMode[npc] = mode`; AI_SLEEP sets asleep flag + unconscious type; non-AI_PLAY converts musician (`OBJ_188`) to bard (`OBJ_182`) |
| `OP_RESURRECT`   | 0xD6 | `RESURRECT`    | Find dead-body object in NPC's Link[] chain, call `C_1944_1A42` (resurrect spell) |
| `OP_HEAL`        | 0xD9 | `HEAL`         | npc → `HitPoints[npc] = MaxHP(npc)` |
| `OP_CURE`        | 0xDB | `CURE`         | npc → `ClrPoisoned(npc)` |
| `OP_REST`        | 0x9E | `REST`         | Heal all on-screen party members + advance time until 5:00 AM (long rest) |
| `OP__D8`         | 0xD8 | `SETNAME`      | npc → `VarStr['Y'-0x37] = name_of(npc)` |
| `OP__DF`         | 0xDF | `DF` (TODO)    | Same as `OP__D8` but special-cases npc=1 (Avatar) → `"you"` |
| `OP_GETHORSE`    | 0x9C | `GETHORSE`     | npc → spawn a horse `OBJ_1AF` at the map cursor with the NPC's direction |

### UI
| Source | Hex | Legacy | Behavior |
|--------|-----|--------|----------|
| `OP_SHOW_INVENTORY` | 0xBE | `SHOWINVENTORY` | val → set status display to inventory panel; if val=1, show Active member's; if NPC is party-controlled, find party slot; else show NPC's |
| `OP_SHOW_CONVERSE`  | 0xBF | `PORTRAIT`      | npc → display NPC portrait (`C_27A1_02D9`) |
| `OP_DELAY`          | 0xD0 | (TODO)          | val → loop `OtherAnimations()` `val × 20` times — animation idle |

### Default
Unknown opcode → `CON_printf("Unknown command.\n")` and returns
`-1`. The dispatch table is sparse but all listed opcodes have
defined behavior.

## Outer ask/answer loop (`TalkDriver`)

After the description has been printed and `OP_MAIN` (0xF2)
consumed, `TalkDriver` enters its main loop (`seg_1703.c:1111-1194`):

```c
while(!mustLeave) {
    D_E7A7 = Talk_PC;
    opcode = PARSE_U8;
    /* dispatch on the terminator parse_statement returned with */
    switch(opcode) {
        case OP_ASKTOP /*0xF7*/:  CON_printf("\nyou say:");
                                  CON_gets(D_E732, 50); D_E79C = 0; break;
        case OP_GETSTR /*0xF9*/:  CON_gets(D_E732, 50);
                                  /* parse next byte as var-index, expect OP_VARSTR */
                                  /* strcpy(VarStr[idx], D_E732) */ break;
        case OP_GETINT /*0xFB*/:  CON_gets(D_E732, 50);
                                  /* parse as integer; expect OP_VARINT */
                                  break;
        case OP_GETDIGIT /*0xFC*/: do { ch = CON_getch(); } while (!digit);
                                   /* expect OP_VARINT */; break;
        case OP_GETCHR /*0xFA*/:  D_E732[0] = CON_getch(); break;
        case OP_WAIT /*0xCB*/:    CON_getch(); break;
        case OP_GET /*0xF8*/:     /* read allowed-char list until OP_KEY, then accept matching keystroke */ break;
        case OP_KEY /*0xEF*/:     "Command for input key expected." — error, break out; break;
        case OP__FF /*0xFF*/:     break out; break;
        case OP_ENDRES /*0xEE*/:  /* no-op */ break;
        default:                  "Logical error occured." — break out;
    }
    VarStr['Z'-0x37] = D_E732;  /* $Z = last input */
    /* If input == "look", re-run the cached look section */
    if (stricmp(D_E732, "look") == 0) {
        CON_printf("You see ");
        Talk_PC = D_E79D;   parse_statement(...);
        Talk_PC = D_E7A7;   /* restore */
    } else {
        parse_statement(...);  /* continue from D_E7A7 (the start of this turn) */
    }
}
```

`D_E732` holds the last user input (up to 50 chars). `D_E79C` is a
sub-state flag that gets reset on every input. `D_E7A7` caches the
`Talk_PC` at turn start so the parser knows where to resume after a
side trip (e.g., the `look` re-run).

The teardown at the bottom (`seg_1703.c:1195-1206`) resets state:
`mustLeave = 0`, `IsInConversation = 0`, restores `StatusDisplay`
and `D_04B3` (active party member slot), increments `StatusDirty`
so the next composite refresh re-draws the status panel.

## Variables and substitution

`TALK_initTalk` at `seg_16E1.c:11-51` populates the per-conversation
variables at conversation start:

### Strings — `VarStr[32]`, indexed by `letter - 0x37`

| Slot | Letter | Meaning | Initial value |
|------|--------|---------|---------------|
| 0x10 | `$G` | Gender title | `D_2CCA ? "milady" : "milord"` |
| 0x17 | `$N` | NPC name | (later filled from script `0xFF NPC NAME` section) |
| 0x19 | `$P` | Player name | `Names[partyId]` |
| 0x1D | `$T` | Time of day | `"morning"` / `"afternoon"` / `"evening"` |
| 0x22 | `$Y` | Set-able / other-NPC name | (script-set via `OP__D8` / `OP__DF`) |
| 0x23 | `$Z` | Previous player input | (filled per turn in `TalkDriver` loop) |

Slots 0-9 are `VarStr[0..9]` — accessed as `$0..$9`; reset to
`D_E7AD[0..9]` (per-NPC initial values?) at conversation start.

### Integers — `VarInt[32]`, same letter-indexing

| Slot | Letter | Meaning | Initial value (per `TALK_initTalk`) |
|------|--------|---------|--------------------------------------|
| 0x0A | `#A` | Agility (Dex) | `GetDex(Party[partyId])` |
| 0x0D | `#D` | Date - day | `Date_D` |
| 0x0E | `#E` | Experience | `ExpPoints[Party[partyId]]` |
| 0x10 | `#G` | Gender (0/1) | `D_2CCA != 0` |
| 0x11 | `#H` | Time of day - hour | `Time_H` |
| 0x12 | `#I` | Intelligence | `GetInt(Party[partyId])` |
| 0x14 | `#K` | Karma | `KARMA` |
| 0x15 | `#L` | Language | `D_2CA8` |
| 0x16 | `#M` | Date - month | `Date_M` |
| 0x18 | `#O` | Party-size minus 1 | `PartySize - 1` |
| 0x19 | `#P` | Hit points | `HitPoints[Party[partyId]]` |
| 0x1B | `#S` | Strength | `GetStr(Party[partyId])` |
| 0x1D | `#W` | NPC's worktype | `NPCMode[objNum]` |
| 0x21 | `#Y` | Date - year | `Date_Y` |

Plus `#N` = on-screen-party-count (set by `C_1703_028B` at
`seg_1703.c:209-218`, called once after `LoadConversation`).

Slots 0-9 are `VarInt[0..9]` — accessed as `#0..#9`; zero-init.

### Substitution in printable text

The legacy port's `run()` handles `$G/$N/$P/$T/$Y` substitution via
regex (`script.js:108-119`) plus `#N` for any integer N via
`text.replace(/#(\d+)/g, ...)`. Source does this *outside* the VM
(in the text-output channel — `CON_putch` / `CON_printf` ultimately
hit the screen with substitution applied; the exact substitution
implementation is in the `CON_*` console layer, not visible inside
`seg_1703.c`).

Other documented substitutions per `u6converse.txt:113-124` (not
all wired to `TALK_initTalk` — some are script-driven):

- `@` (preceding word printed highlighted)
- `*` (pause-and-wait, equivalent to `OP_WAIT`)
- `\n` newline
- `$X` value of string variable X (uppercase letter or 0-9)
- `#X` value of integer variable X (uppercase letter or 0-9)
- `<...>` Runic; `<...>` lowercase = Gargish
- `/...\...` plural-word inflection toggle
- `&...&` translation block

## Persistent state — `TalkFlags[256]`

The only conversation state that **survives across conversations**
is `TalkFlags[npc]` (one byte per NPC). Set via `OP_SET` (0xA4) /
`OP_CLR` (0xA5); read via `OP_TST` (0xAB) in `parse_factor`.

Used for: "have you given this NPC X yet", "has Lord British made
you a knight", "are you cured of the Plague", etc. Each NPC's flag
byte gives 8 bits of dialogue progression.

Stored on disk as part of the savegame; the legacy port's
`obj_manager.js:297` reads `talkFlags` per actor.

## Special NPC constants

| Value | Meaning |
|-------|---------|
| `0xEB` (`OP_NPC`) | The currently-talking NPC (`D_E796[0]`). Used as a constant in scripts so reused scripts work. |
| `0x66` | Wisp generic conversation (in `converse.b`, see `LoadConversation`). |
| `0x67` | Guard generic conversation. |
| `0x68` | Gargoyle generic conversation. |
| `0x00` | Empty entry (e.g., Avatar's NPC 1 — Avatar doesn't talk). |

The `mk_npcnum` filter on every NPC argument means scripts can
freely use `0xEB` whenever they want to mean "myself."

## Conversation-init pre-conditions (`TalkDriver` early-exit)

Before loading the script, `TalkDriver` short-circuits in several
cases (`seg_1703.c:1022-1078`):

- Player NPC not on-screen → `"Not on screen."`.
- Wrong party-mode (must be solo or default) → `"Not in solo mode."`.
- NPC is dead + not in seance → `"You hear a deep moan."` (if 0xE0+).
- NPC asleep / paralyzed / vigilante / fear / retreat / arrest /
  evil / chaotic → `"No response"`.
- `IsArmageddon` → `"No response"`.
- Talking to self → `"Talking to yourself?"`.
- `LoadConversation` returns 0 (no script for this NPC) →
  `"Funny, no response."`.

These conditions are the entry-time gate; once inside the loop,
the only exits are `OP_LEAVE`, `OP__FF`, logical errors, or `OP_KEY`
without a preceding `OP_ASKTOP` (logic error).

## Legacy port reference — `../ultima6/script.js`

The legacy port has **~1300 lines** of conversation VM code (more
than I expected). Architecture mirrors source's structure:

| Source | Legacy port | Notes |
|--------|-------------|-------|
| `TALK_initTalk` (`seg_16E1.c:11`) | `TALK_initTalk` (`script.js:39-66`) | Same letter-indexed slot population. Missing `$L` language slot. |
| `parse_statement` (`seg_1703.c:945`) | `ScriptInterpreter.run` (`script.js:89-318`) | Loop reads opcodes; returns one of `{END, INPUT, PAUSE, INPUTNUM}` after each printable block or input opcode, so the caller can pump the next input. Modern *coroutine* equivalent of source's blocking `CON_getch`. |
| `execute_op` (`seg_1703.c:714`) | (inline in `run()`) | Same opcode set, mostly faithful, with some stubs (see open questions). |
| `parse_factor` (`seg_1703.c:295`) | `ScriptInterpreter.evaluate` (`script.js:333-592`) | Same RPN stack; same arithmetic / comparison / variable / query opcodes. |
| (none — source uses CON_putch directly) | `getString` (`script.js:320-331`) | Reads printable bytes until non-printable; handles `*` as pause terminator. |
| `LoadConversation` (`seg_2FC1.c:783`) | `Library.getItem` + `decompressCompressedFile` (`map_viewer.js:982` + `lzw_decoder.js`) | Library reads the offset header, LZW-inflates the entry. Generic-NPC routing (Wisp/Guard/Gargoyle at b-indexes 0x66/0x67/0x68) NOT yet wired — only `converse.a` is loaded in the existing demo. |
| (none — source has `formatScript` only via debug build) | `ScriptInterpreter.formatScript` + `collectFormat` + `collectEval` (`script.js:594-1091`) | A **disassembler** that emits human-readable text. Used by the Decoded button to dump per-NPC scripts to `.txt` files. Useful debugging tool for the rebuild. |
| (none) | `skipCodeBlock`, `skipEvalBlock`, `skipText` (`script.js:1160-1307`) | Branch-skip helpers used by IF/ELSE/KEYWORDS dispatch. Equivalent to source's inline skip loops in `execute_op` cases. |

### Integration pattern in the legacy port

From `map_viewer.js:707-726`:

```js
dialog = new ScriptInterpreter(script, 0, scriptIndex);
const output = [];
dialogStatus = dialog.run("", output);
if (output.length > 0) {
  displayArea.innerHTML = output.join('') + "<br>";
}
```

The next input event then re-calls `dialog.run(userInput, output)`.
This decouples the VM from any blocking-I/O assumption — the
**continuation-passing** model is what an event-driven JS port
naturally wants. (Source uses blocking `CON_getch`; the legacy
port replaces it with a return-status pump.) The rebuild should
follow this pattern.

### Opcode-name divergence (source → legacy)

A handful of opcodes carry different mnemonics in the two
codebases. Same byte values, same behavior, different labels:

| Source name | Legacy name | Hex |
|-------------|-------------|-----|
| `OP_END_OF_FACTOR` | `EVAL` | 0xA7 |
| `OP_LET` | `DECL` | 0xA6 |
| `OP_LET_VALUE` | `ASSIGN` | 0xA8 |
| `OP_TST` | `FLAG` | 0xAB |
| `OP_GOTO` | `JUMP` | 0xB0 |
| `OP_VARINT` | `VAR` | 0xB2 |
| `OP_VARSTR` | `SVAR` | 0xB3 |
| `OP__B4` | `DATA` | 0xB4 |
| `OP_PRINTSTR` | (none) | 0xB5 |
| `OP_LEAVE` | `BYE` | 0xB6 |
| `OP_STRSEARCH` | `STRSEARCH` | 0xB7 |
| `OP_ENDSEARCH` | `ENDSEARCH` | 0xB8 |
| `OP_GIVEOBJ` | `NEW` | 0xB9 |
| `OP_TAKEOBJ` | `DELETE` | 0xBA |
| `OP_TEST_OBJ` | `OBJCOUNT` | 0xBB |
| `OP_SHOW_INVENTORY` | `SHOWINVENTORY` | 0xBE |
| `OP_SHOW_CONVERSE` | `PORTRAIT` | 0xBF |
| `OP_ISINPARTY` | `INPARTY` | 0xC6 |
| `OP_WHOSGOT` | `OBJINPARTY` | 0xC7 |
| `OP_MOVEOBJ` | `MOVEOBJ` | 0xC8 |
| `OP_TRANSFEROBJ` | `GIVE` | 0xC9 |
| `OP_WAIT` | `PAUSE` | 0xCB |
| `OP_LEAVEPARTY` | `LEAVE` | 0xCC |
| `OP_SETMODE` | `WORKTYPE` | 0xCD |
| `OP_ADDRESS` | `NUM32` | 0xD2 |
| `OP_BYTE` | `NUM8` | 0xD3 |
| `OP_WORD` | `NUM16` | 0xD4 |
| `OP_POISONNED` | `POISONED` | 0xDC |
| `OP__DD` | `NPC` | 0xDD |
| `OP__D8` | `SETNAME` | 0xD8 |
| `OP_ENDRES` | `ENDANSWER` | 0xEE |
| `OP_KEY` | `KEYWORDS` | 0xEF |
| `OP_DESC` | `LOOK` | 0xF1 |
| `OP_MAIN` | `CONVERSE` | 0xF2 |
| (OP for 0xF3 — `OP_PREFIX` in legacy) | `PREFIX` | 0xF3 |
| `OP_RES` | `ANSWER` | 0xF6 |
| `OP_ASKTOP` | `ASK` | 0xF7 |
| `OP_GET` | `ASKC` | 0xF8 |
| `OP__FF` | `ID` | 0xFF |

For the rebuild, **prefer the legacy port's semantic names** (`JUMP`,
`SETF`, `BYE`, `ASK`, `KEYWORDS`, `ANSWER`) over source's
`OP_GOTO`/`OP_SET`/`OP_LEAVE`/`OP_ASKTOP`/`OP_KEY`/`OP_RES` — they
read more naturally in JS and the legacy team already converged on
them. Cite source hex in code comments; use semantic names in
identifiers.

## Implications for the rebuild

### VM core fits a coroutine

The legacy port's "return state + caller resumes" pattern is the
right base. In the rebuild it becomes either:

- A generator function (`function*`) that `yield`s with state at
  each input/print boundary, or
- A plain class with `run()` returning a status enum, as the legacy
  port already does.

Both work. The generator form is slightly nicer for nested calls
(answers that re-invoke parse_statement), but plain enum is
simpler. The rebuild should pick one — recommendation: start with
the enum (legacy port's shape) since it's already proven.

### Separation of concerns

The source VM mixes three responsibilities in one file:

1. **VM core**: opcode dispatch, expression evaluation, control
   flow, variable scope.
2. **World queries / mutations**: `JoinParty`, `LeaveParty`,
   `GiveObj`, `TakeObj`, `MoveObj`, `SetMode`, `Heal`, `Cure`,
   `ADDKARMA`, `TalkFlags[]`.
3. **I/O**: `CON_printf`, `CON_getch`, `CON_putch`, `CON_gets`.

In the rebuild, split:

- `ConversationVM` — pure VM, no world / no I/O. Operates on a
  passed-in `ConversationContext { vars, talkFlags, npcId, world }`.
- World mutations go through `world.*` calls — `world.joinParty(id)`,
  `world.give(npc, obj, qual, qty)`, etc. — that can be ECS-system
  invocations.
- I/O is the caller's job. VM produces an `OutputBuffer` (array
  of strings + control tokens like `{type: "input"}` /
  `{type: "pause"}`); the UI layer reads it and pumps next input.

This split is what the legacy port already does (mostly — it has
some direct `ObjManager.X` calls inside `evaluate()` that should
move out for cleanness).

### ECS mapping

Conversation state is a natural ECS fit:

- **`TalkFlags` component** — one byte (or 32-bit field) per NPC
  entity. Persistent. Serialized as part of the entity's save state.
- **`DialogueSession` resource** (singleton or one-active) — owns
  `VarInt[32]`, `VarStr[32]`, `Talk_PC`, `npcId`, `partyId`,
  current bytecode buffer reference.
- **`ConversationScript` resource** — `Map<npcId, Uint8Array>`
  loaded from `converse.a` + `converse.b` once at world load. Lazy
  per-NPC fetch is fine; whole-file decompress is also fine
  (~220 entries × max 10KB = small).
- **`DialogueSystem`** — runs per frame when `DialogueSession`
  exists; consumes pending input, advances VM, queues output to a
  UI buffer. Yields when input is needed.

### Async-input model

The legacy port returns from `run()` whenever it needs input. The
rebuild should follow but adapt for modern UX:

- `run()` returns when input is needed → set focus on input field,
  show prompt.
- On submit, call `run(input)` again.
- Optionally: typing in the field while paused shouldn't lose focus
  (modern UX). The `WAIT` (pause-and-press-key) opcode can be
  replaced with a click-to-continue button (still source-faithful
  in mechanic: "stop, wait for acknowledgment").

### Scope vs. polish

The minimum-viable conversation set needed for "talk to NPCs"
gameplay milestone:

1. **Load script for any NPC** — `converse.a` + `converse.b` LZW
   inflate.
2. **Look section** — print description (the `OP_DESC` body).
3. **Ask loop** — `OP_ASKTOP` + `OP_KEY` keyword matching +
   answer execution.
4. **Basic opcodes**: PRINTSTR, IF/ELSE/ENDIF, GOTO, SETF/CLEARF,
   TST, LET, JOIN/LEAVEPARTY, BYE.
5. **Variable substitution** in text: `$G/$N/$P/$T/$Y/$Z` + `#N`.

Deferrable (not needed for a first walking-tour gameplay):
RESURRECT, HEAL, CURE, REST, ADDEXP/LVL/STR/INT/DEX (combat
prerequisites), SHOW_INVENTORY / SHOW_CONVERSE (UI integration),
GETHORSE, DELAY (animation timing).

Drop-or-defer (need re-eval): `OP__BC` / `OP__BD` (constant 100,
purpose unclear); the legacy port has known unhandled opcodes
(0x9C, 0xDF, FUNC 0xD1) — verify against actual U6 scripts before
labeling as drop.

## Open questions

1. **`OP_FUNC` (0xD1)** — Not handled in source's `execute_op`
   (no case for it). The legacy port commented it out with notes
   about Savage Empire / Martian Dreams usage. Need to verify
   whether U6 specifically uses `0xD1` anywhere; if not, drop. If
   yes, decode case-by-case. Per `script.js:1113-1153` (commented
   block): SE/MD have NPC-specific FUNC handlers; U6 may not need
   any.
2. **`OP_PREFIX` (0xF3 in legacy, no source name)** — used as a
   section marker alternative to `OP_MAIN` (0xF2). `u6converse.txt`
   §"f2 or f3" says "unknown what the difference is." Likely needs
   per-NPC byte scan to find which NPCs use which; may be tied to a
   shrine / shrine-prompt vs main-conversation distinction.
3. **`OP_AND` / `OP_OR` semantics** — source uses *boolean*
   coercion (`if(a && b) 1 else 0`); legacy port's `evaluate()` uses
   *bitwise* (`arg1 | arg2 ? 1 : 0`). Equivalent when operands are
   0/1, divergent otherwise. Need to scan scripts for non-boolean
   operands — if any, port the source semantics.
4. **Legacy port stubs / fakes** to verify against source:
   - `OBJINPARTY` (0xC7) stubbed to push 0 (`script.js:466-470`).
     Source's `OP_WHOSGOT` calls `C_1703_04C6` (real impl). Port
     the real one.
   - `OWNS` (0x9F) stubbed to push 0 (`script.js:530-538`). Source's
     `OP_OWNS` calls `C_1944_0A43` (real impl). Port the real one.
   - `WEIGHT` (0x9B) uses `typeWeight = 10` fake (`script.js:441`).
     Source reads from `TypeWeight[]` table (real values). Port.
   - `JOIN` / `LEAVE` party-size cap is `16` in the legacy port
     (`script.js:483, 499`); source caps at `8` (per `JoinParty` in
     `seg_1703.c:226`). The 8 is correct per U6's design — fix.
   - `LEAVEPARTY` doesn't move NPC's inventory to ground in the
     legacy port; source's `LeaveParty` at `seg_1703.c:266-271` does
     (drops everything on the cell). Port.
5. **`OP__BC` / `OP__BD`** — both push constant 100. Source comment
   says "constant 100?" with question mark. Need to grep U6 scripts
   for actual usage to confirm semantics (and whether they're
   different in some subtle way).
6. **String comparison in `OP_EQU`** — relies on `bp_58` flag set by
   the most recent `OP_VARSTR` push. Legacy port's `evaluate()`
   doesn't have an equivalent flag; only handles numeric `==`. Need
   string-compare path for any script that does `if $Z == "yes"`.
   Verify whether any actual scripts use string equality (vs.
   keyword-block dispatch via `OP_KEY` / `OP_GET`).
7. **`D_E7A1` non-zero** — source's `MK_0000(addr) = addr - D_E7A1`
   is identity in shipped U6 because `D_E7A1 = 0` always. Confirm
   no surprises; could remove the macro in the rebuild.
8. **Pause/resume during NPC scheduling** — `OP_REST` advances time
   to 5 AM via `C_0A33_1355(60)` in a loop. During the rebuild, this
   could be hundreds of `WorldClockSystem` ticks; need to decide
   whether to suspend rendering during the loop (source does,
   because the loop blocks) or animate hours-flying-by (modern UX).

## Cross-references

- [`research_engine_overview.md`](research_engine_overview.md) §"Open
  questions" item 7 (conversation VM) — now RESOLVED end-to-end.
- [`research_game_loop.md`](research_game_loop.md) §"Phase 3 — action
  dispatch" — `CMD_83` (talk) calls `TALK_talkTo(Active, Selection.obj, 1)`;
  that's the entry path from the game loop into this VM.
- [`research_world_data.md`](research_world_data.md) §"Link[] /
  containment" — `OP_RESURRECT` walks `Link[npc]` to find the dead-body
  child object; `OP_GIVEOBJ` / `OP_TAKEOBJ` mutate it.
- [`../CLAUDE.md`](../CLAUDE.md) §"Modern-browser UX as architectural
  anchor" — the input-pump coroutine pattern is an instance of this
  principle (source's blocking `CON_getch` is substrate residue, not
  spec).
- Tech docs: `../ultima6/doc/u6converse.txt` (Nuvie reverse-eng notes,
  ~300 lines, mostly correct on the bytecode shape; some opcode
  semantics marked uncertain that u6-decompiled now confirms).
  `../ultima6/doc/U6_Conversation_Syntax.pdf` (Origin/community docs,
  not yet read deeply).
- Legacy port: `../ultima6/script.js` (~1300 lines, substantial VM
  port; usable as the starting point for the rebuild's
  `ConversationVM` with the verification list from §"Open
  questions" applied first).
- `../ultima6/u6opcode.js` — opcode constants table (60+ entries).
- `../ultima6/map_viewer.js:707-726, 982` — integration call site +
  `converse.a` Library load.
