# u6_converse_decode — offline CONVERSE.A/.B disassembler

`u6_converse_decode.py` decodes Ultima VI's NPC conversation scripts **statically**,
straight from the user's `CONVERSE.A` / `CONVERSE.B` data files, into a per-NPC
disassembly. It is the offline companion to the live `u6_script_disasm` MCP tool:
where that reads one decompressed script out of DOSBox RAM (`TalkBuf`, see
`u6_conversation.md`), this decodes **all ~200 scripts** off disk, so the
disassembler can be exercised over the whole corpus and the scripts read without a
running game.

It has two modes:

- **`--linear`** runs the live tool's *own* `_disassemble` core
  (`dosbox_u6_server.py`, imported, not copied) over each script — a validation
  harness for `u6_script_disasm`.
- **default (`--trace`)** is an independent **recursive-descent** analyzer that
  cleanly separates code from data and decodes every script to full fidelity. This
  is the part the rest of this doc is about.

Source citations are `seg_XXXX.c:NNN` in the ergonomy-joe `u6-decompiled` tree (the
converse interpreter is `seg_1703.c` "talkdr"). The LZW + lib_32 decode is ported
from the in-repo legacy port (`ultima6/lzw_decoder.js`, `ultima6/library.js`) and
the clone (`ultima6_clone/assets/{lzw,converse}.js`).

> **BYO-data / legal.** The script itself contains **no** game data. Its decoded
> output is copyrighted Origin content, so it is written **outside the repo**
> (`C:\Z_Temp\tools\dosbox_mcp\npc_scripts_trace\`) and never committed. Same rule
> as `ultima6_clone/CLAUDE.md`.

---

## 1. The CONVERSE files — lib_32 + LZW

`CONVERSE.A` and `CONVERSE.B` are `lib_32` packages (`LoadConversation`,
`seg_2FC1.c:783`):

- A `uint32` **offset table** at byte 0, one entry per item. `item_count =
  firstNonZeroOffset / 4`. A `0` offset = no script for that slot.
- Each item is `[4-byte LE uncompressed-size][payload]`. If `0 < size < 0x2800`
  (the `TalkBuf` allocation) the payload is **LZW** (12-bit, `CLEAR=0x100`); else it
  is stored **raw** (script = bytes after the 4-byte header).
- NPC → file mapping: id `0x00–0x62` → `CONVERSE.A[id]`; `0x63–0xDF` →
  `CONVERSE.B[id-0x63]`; `≥0xE0` (Wisp/Guard/Gargoyle generics) are deferred.

(The block N → name mapping is whatever the script's own header declares; e.g.
`2=Dupre, 3=Shamino, 4=Iolo, 5=Lord British`. The old tech-doc `u6converse.txt`
has Iolo/Shamino swapped — the embedded names win.)

---

## 2. Script structure (the spec)

A decoded script is a single flat byte stream — **code and inline data share the
address space with no boundary marker** (von-Neumann). A region is "data" only
because some instruction references it. The layout:

```
ID <npcId> <name>        ; 0xff + id byte + name text, to DESC
DESC <look-text>         ; 0xf1, the "You see …" line
[PREFIX]                 ; 0xf3, optional
MAIN                     ; 0xf2
<greeting text + IF gates>
ASKTOP                   ; 0xf7  (or GET 0xf8 = a single-key menu)
  KEY "<kw[,kw]>" RES <answer body>   ; 0xef … 0xf6 …  (repeated)
  …
ENDRES                   ; 0xee  (ends the ASK table)
<sub-handlers reached by GOTO> + <inline data tables>
```

**Statements** are interspersed text and control ops. Printable bytes
(`0x0a`, `0x20–0x7a`) print verbatim until the next control byte (`≥0x80`); there
is no "print" op and no string terminator in text — a `0x00` only separates pooled
strings. Control flow:

- **`IF <factor> … [ELSE …] ENDIF`** (`0xa1 … 0xa3 … 0xa2`).
- **`GOTO <u32>`** (`0xb0`) — unconditional jump to an absolute byte offset.
- **`LEAVE`/BYE** (`0xb6`) end the conversation; **`WAIT`** (`0xcb`) page-pauses.
- The **ASK table** is a *keyword dispatch table*: `ASKTOP` prompts, the engine
  scans `KEY` sections and jumps to the matching `RES` body. A body runs until the
  next `KEY`/`ENDRES`; it usually ends by `GOTO`-ing back to the `ASKTOP`. A `GET`
  menu's *unmatched-but-allowed* key (e.g. `y` of `GET "yn"` with only `KEY "n"`)
  falls through **past `ENDRES`** to the default handler — so code after `ENDRES` is
  reachable.

**Factors** are RPN expressions (`parse_factor`, `seg_1703.c:295`) ending at
`END_OF_FACTOR` (`0xa7`); `LET_VALUE` (`0xa8`) separates a `LET`'s parts. Operands:

| Byte | Meaning | Byte | Meaning |
|---|---|---|---|
| `0xd3` | BYTE literal (`0xeb` = `self`) | `0xb2` | VARINT — `VarInt[pop]` |
| `0xd4` | WORD literal (u16) | `0xb3` | VARSTR — `VarStr[pop]` |
| `0xd2` | ADDRESS (u32) → a data offset | `0xb1` | CALL (after ADDRESS = direct ref) |
| `0x81–0x86` | `> >= < <= != ==` | `0x90–0x95` | `+ - * / \|\| &&` |

Queries push a computed value: `Rand 0xa0`, `Flag 0xab`, `Owns 0x9f`,
`HasObj 0xbb`, `WhosGot 0xc7`, `InParty 0xc6`, `Poisoned 0xdc`, `Horsed 0x9d`,
`ObjType 0xc2`, `Owner 0xc1`, `Wounded 0xda`, `OnScreen 0xd7`, `CanCarry 0x9a`,
`Weight 0x9b`, `Join 0xca`, `LeaveParty 0xcc`, `Npc 0xdd`.

**Assignment / side-effects** (each consumes N factors):

| Op | Name | Op | Name |
|---|---|---|---|
| `0xa6` | LET (`<di> <b2/b3> a8 <factor>`, or `d2 <addr> …`) | `0xb5` | PRINTSTR `@addr[index]` (compile-print a string list) |
| `0xa4/0xa5` | SET / CLR flag (npc, bit) | `0xb9/0xba` | GIVEOBJ / TAKEOBJ (npc, obj, qual, qty) |
| `0xc8/0xc9` | MOVEOBJ / TRANSFEROBJ | `0xc4/0xc5` | ADDKARMA / SUBKARMA |
| `0xcd` | SETMODE | `0xd6/0xd9/0xdb` | RESURRECT / HEAL / CURE |
| `0xbe/0xbf` | SHOWINVEN / SHOWPORTRAIT | `0xd8/0xdf` | SETNAME ($Y) |

**Input** (the VM blocks here; `u6_say` resumes it): `ASKTOP 0xf7` (line),
`GET 0xf8` (single key, list till `KEY`), `GETSTR/GETCHR/GETINT/GETDIGIT 0xf9–0xfc`
(read into a var, encoded `<idx> <b2/b3>`).

**Data sections** live inline (usually at the tail) and are reached only by
reference, never fall-through:

- **String pools** — runs of NUL-terminated strings, pointed at by `PRINTSTR` /
  `ADDRESS` offsets (e.g. Gilron's random mutters, Xiao's spell-name table).
- **Word tables** — runs of u16 values (prices, ids), indexed at runtime.
- **STRSEARCH lists** — `STRSEARCH 0xb7 … ENDSEARCH 0xb8` keyword/answer lists.

**Text markup** (printed inline): `@word` highlights the next word (an "ask me about
this" cue), `*` page-pauses, `$G/$P/$N/$T/$Z` substitute gender-title/player/NPC/
time/last-input, `#X` the value of variable X, `<…>` runic/gargish.

---

## 3. The decoder design (trace mode)

The file format gives no code/data boundary, so a *linear* sweep desyncs the moment
it walks operand bytes or an inline table as opcodes. The trace instead does
**reachability** — three passes (`trace_script`):

**Pass 1 — recursive-descent code parse** (`_Tracer`). This is the
`ultima6/script.js` `skipCodeBlock` model rebuilt on the source's full opcode table.
It follows the script *structure* — `IF/ELSE/ENDIF` and `ASKTOP/KEY/RES/ENDRES` —
recursively, so it always knows where a block ends, and it tracks per-block
**fall-through**:

> A block ends when its last construct **cannot fall through**: a `GOTO`/`LEAVE`, or
> an `IF` whose branches *all* jump away. (This generalizes `script.js:1241`'s
> special case.) That precise boundary is what stops the parse *before* an inline
> data table instead of grazing into it.

`GOTO` targets are queued and parsed as separate entries (sub-handlers); each ends
at its own non-falling construct. `ADDRESS`/`PRINTSTR` offsets are recorded as
**data refs**. A **factor-only byte at statement level** (an operator `0x80–0x86` /
`0x90–0x95`, a value/var tag `0xd2–0xd5`/`0xb2–0xb4`, `ENDSEARCH 0xb8`) means the
parse has run into inline data — a *clean* stop, not a desync (`_DATA_BYTES`).

**Pass 2 — string pools.** From each recorded data ref, walk NUL-terminated strings
across the not-yet-code bytes; these render as a labeled `D_xxxx` block with their
referencing PCs.

**Pass 3 — leftover.** Anything still unclassified (word tables, padding, STRSEARCH
data) is dumped verbatim as **hex + ASCII**.

Operand-bearing statements render their contents as **infix** (`IF (VarInt[20] <
40)`, `LET VarInt[0] = (VarInt[0] + 1)`, `PRINTSTR @D_004c[Rand(0, 4)]`,
`TAKEOBJ Npc(0), 88, 0, VarInt[5]   ; obj 0x58`). The renderer sits on top of the
byte-accurate factor walkers (`_walk_factor`/`_walk_let`/`_walk_printstr`), so the
text is cosmetic over an unchanged PC-advance — an expression error can never desync
the trace.

---

## 4. Development notes — bugs the source's token model exposed

The decoder reached full fidelity by fixing four operand-model errors and one
structural one. Recorded because each was a real trap:

1. **`LET` var-index vs type-tag.** The shape is `LET <di> <b2/b3> <a8> <factor>` —
   `di` is the *variable index*, the next byte is the *type tag*. Conflating them
   stranded the `a8` (showed as `??? 0xa7`-class leaks).
2. **`@addr[index]` string ref.** `PRINTSTR`/string-`LET` ADDRESS operands are
   followed by an *index factor* selecting the Nth string (`_follow_addr_string`,
   `seg_1703.c:688`) — not just the 4 address bytes. Shared as `_walk_addr_string`.
3. **List-element `LET`.** `LET @a[idx] a8 @b[idx] a7` has an **a8-separated factor
   chain**; consume factors until the terminator is `a7`, not the first `a8`. (Even
   the live VM's `_let` under-parses this.)
4. **Stray `END_OF_FACTOR`.** A trailing `0xa7` at statement level (e.g. the end of
   a string-`LET` value) is a VM **no-op** (`decode_block`: `op in (0x9e,0xa7,0xcb):
   pass`) — tolerate it, don't flag it.

**The false-clean catch (the important one).** An early version reported "200/200
clean" while silently dumping ~34 KB of real code into the raw section. The tell:
shrine scripts at ~27 % code. Cause: a `GET` menu's unmatched key falls through
**past `ENDRES`** into the default handler (the whole meditation/mantra flow), but
the parser treated `ENDRES` as a hard stop. After fixing it to continue, corpus raw
dropped **36,727 → 2,124** and no script sits below 55 % code. *Lesson: "0 untraced"
is necessary but not sufficient — also verify code is not hiding in raw* (the
`<55 % code` guard, and reading a sample raw region to confirm it's data not code).

---

## 5. Usage & results

```
python u6_converse_decode.py                 # default: --trace all -> per-NPC files
python u6_converse_decode.py --trace 5       # one NPC (id or name) -> stdout + file
python u6_converse_decode.py --linear        # run the live u6_script_disasm core
python u6_converse_decode.py --data DIR --out DIR
```

Each file is `NNN_Name.txt` (`005_Lord_British.txt`); `00_INDEX.txt` lists
`code/str/raw/untraced` per script. Current result over the shipped data:

- **`--trace`: 200/200 scripts fully traced, 0 untraced bytes**, ~2.1 KB total
  genuine leftover data across the corpus.
- **`--linear`: 92/200 scripts** carry cosmetic `??? 0xNN` flags — the live tool's
  forward sweep desyncing on input-prompt / PRINTSTR-list / data-section opcodes.
  These are harmless to the *agent* (it plays via `u6_conversation`/`u6_say`, not the
  disassembler), but they are why the offline trace exists.

This decodes the data segments the tech-doc-built `ultima6/script.js` could not —
`script.js` lacked the source, so its `skipCodeBlock` asserts on the STRSEARCH /
word-table regions this trace classifies cleanly.
