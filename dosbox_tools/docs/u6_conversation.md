# U6 conversation subsystem — the TalkBuf VM, reading it, driving it

> **Update 2026-06-28 (live-verified, end to end).** The readable-dialogue decoder
> now models **real control flow**: a deterministic `IF` follows only the live-taken
> branch and skips the not-taken one without following its GOTOs (fixes the
> `IF cond GOTO L ENDIF` desync on linear say-and-leave NPCs); a GOTO back to an
> already-decoded address is a loop back-edge and is not iterated (fixes LB's
> party-heal loop); an all-empty `[either]` is suppressed; and the **NPC name is read
> from the loaded TalkBuf script header** (`OP_ID`→name), not the lagging `U6_NpcName`
> buffer. Added **`u6_continue()`** — pages a conversation to the next decision point
> (keyword / single-key `GET` / `LEAVE`) off the engine's own flags
> (`LineInput`/`PromptCh`/`IsInConversation`), so the fluent loop is
> `talk → conversation → continue → say → continue`. Added **`u6_npc_flags(npc)`** to
> read a `TalkFlags` byte (keyword-gated progression). The whole stack is now
> live-verified across LB / Geoffrey / Maldric / Nystul.

Once `TALK` opens a dialogue (`u6_verb_mechanism.md` §4), everything after is the
**conversation subsystem**: a little bytecode VM (`TalkBuf` + `Talk_PC`) the engine
interprets to print lines, ask keywords, branch on world state, and apply
side-effects (give objects, set flags, heal, …). This doc is how that VM works and
how the `dosbox-u6` MCP **reads** it (`u6_conversation`, `u6_script_disasm`) and
**drives** it (`u6_say`, `u6_key`).

Source citations are `seg_XXXX.c:NNN` in the ergonomy-joe `u6-decompiled` tree (the
converse interpreter is `seg_1703.c` "talkdr"; the console/prompt layer is
`seg_0C9C.c`). The verb that opens a conversation is in `u6_verb_mechanism.md`;
object names in result reports are `u6_object_naming.md`; the agent-facing rule of
engagement for reading scripts is `u6_agent_capabilities.md`.

---

## 1. The VM: TalkBuf + Talk_PC

When a conversation starts, the NPC's whole script is loaded from `converse.a/.b`
into a single reused buffer **`TalkBuf`** (far ptr at `DS:0x4D50`, size `0x2800`),
and the interpreter runs it with **`Talk_PC`** (`DS:0xE7AB`) as the program counter
(`PARSE_U8 == TalkBuf[Talk_PC++]`). It prints text until it hits an **input**
opcode, then blocks on `CON_gets`/`CON_getch`; the typed reply selects a keyword
branch, which runs (printing more text, applying side-effects) until the next input
op or the script returns to the top prompt. `IsInConversation` (`DS:0x098B`) is 1
for the duration.

The MCP never re-implements an effect — it **reads** the buffer to show the agent
what's happening, and **sends keystrokes** to drive the real interpreter. Resolve
the buffer's host address as `MemBase + ((seg<<4)+off)` from the `DS:0x4D50` far
ptr, then read `TalkBuf[Talk_PC]`.

## 2. Script structure

A script is a fixed header followed by a flat run of keyword blocks:

```
OP_ID    0xff <npcId> <name…>          ; name text runs until OP_DESC
OP_DESC  0xf1 <look-string…>           ; "You see …"  (often ends with a * page-pause)
OP_MAIN  0xf2  <greeting…>             ; (OP_PREFIX 0xf3 = a conditional intro variant)
OP_ASKTOP 0xf7                         ; the top "what wouldst thou…" keyword prompt
  OP_KEY 0xef "name"        OP_RES 0xf6 <body…>
  OP_KEY 0xef "wood,expl"   OP_RES 0xf6 <body…>   ; comma = multiple keywords -> one body
  OP_KEY 0xef "*"           OP_RES 0xf6 <body…>   ; '*' = catch-all (default) answer
OP_ENDRES 0xee
```

A response **body** is text + control opcodes: inline ASCII (`<0x80`), `OP_IF`/
`OP_ELSE`/`OP_ENDIF` (`0xa1/a3/a2`) with a factor condition, `OP_GOTO` (`0xb0`,
u32 target — used to **share** a common epilogue across keywords), side-effects
(`OP_SET/CLR`, `OP_GIVEOBJ/TAKEOBJ`, `OP_HEAL/CURE`, …), `OP_LET` (`0xa6`), and
`OP_WAIT` (`0xcb`, a mid-body "press a key"). Input opcodes: `OP_ASKTOP 0xf7`
(typed keyword line), `OP_GETSTR/GETINT/GETDIGIT/GETCHR` (`0xf9/fb/fc/fa`),
`OP_GET 0xf8` (single-key menu), `OP_WAIT 0xcb`.

## 3. parse_factor — the expression model (and the literal-default)

Conditions and side-effect arguments are **factor** expressions: RPN, terminated by
`OP_END_OF_FACTOR 0xa7` (`seg_1703.c:314-322`). Tokens:

- tagged literals `OP_BYTE 0xd3 <b>`, `OP_WORD 0xd4 <w>`, `OP_ADDRESS 0xd2 <u32>`;
  the literal `0xeb` is the **self** NPC sentinel,
- operators `+ - * / || &&` (`0x90-0x95`) and `> >= < <= != ==` (`0x81-0x86`),
- queries `Rand` (`0xa0`), `Flag/TST` (`0xab`), `Owns` (`0x9f`), `InParty` (`0xc6`),
  `Poisoned/Horsed/Wounded/ObjType/…`, and `VarInt[i]`/`VarStr[i]` (`0xb2/0xb3`).

**Crucial:** the engine's operator switch has **no default** — any byte that is not
a tagged literal and not a recognized operator is **pushed as a literal value**
(`default: lstack[sidx]=opcode`). So a bare `0x00` is `0`. A decoder that *stops* on
unrecognized factor bytes is wrong; ours pushes the literal, matching the engine.
(This was the first live `DECODER_STOP` bug — `SET self,0` encodes the bit as a bare
`0x00`.)

## 4. In-band markup (rendered by `CON_putch`)

Text is plain ASCII with a few control chars the console layer interprets
(`seg_0C9C.c`):

- **`@` = highlight** (`:1830`). `@` switches to the highlight colour for the *next
  word* (until a terminator in `" ,.:;!?'-\"\n"`), then restores; the `@` is
  consumed, not drawn. **The highlighted words are the on-screen "ask me about
  this" cues.** `u6_conversation` strips the `@` and returns the words as
  `highlighted`.
- **`*` = page-pause** (`:1830` / screen-full auto-break `:1698`): prints, then
  `CON_getch` waits for a key (`PromptCh=1`). See §6.
- **`$X` / `#X`** = string / integer variable substitution (`VarStr`/`VarInt`),
  expanded by the reader; `<>` runic, `/\` plural, `&` translate are passed through.

## 5. Reading — `u6_conversation`

`u6_conversation` decodes the live `TalkBuf` into readable dialogue (a faithful port
of `seg_1703.c` parse_statement / parse_factor / the `OP_KEY/RES` dispatch). Two
fixed anchors:

1. **Greeting** — walk the intro `OP_ID → DESC → MAIN/PREFIX → greeting`.
2. **Keyword table** — to list askable keywords and to preview a keyword's response,
   the scan is **anchored at the keyword table** (walk the intro to past `OP_ASKTOP`),
   **not** the live `Talk_PC`. This makes the keyword list + any response readable
   from *any* VM state (fresh prompt, mid-response page-pause, parked on another
   keyword). `keyword="gargoyle"` previews that response, decoded ahead of the
   prompt, with `IF` conditions evaluated against **live** memory.

Contract:
- deterministic `IF` → the branch the engine would take; `OP_RND` / an unresolved
  query → **both** branches shown `[either: A | B]`.
- an unknown **statement** opcode (a closed set) → `status=DECODER_STOP`; the agent
  halts and reports (never act on partial dialogue). An unknown **factor** byte is a
  literal (§3), not a stop.
- output includes `highlighted (ask next): …` (§4) — the in-context cues.

Decoder correctness depended on three fixes this effort: the **`0x00` literal**
(§3); **`OP_WAIT 0xcb` / stray `OP_END_OF_FACTOR 0xa7`** treated as 0-operand no-ops
(they're `< 0xf0`, so `decode_block` would otherwise stop — `execute_op` `break`s on
them); and the **table-anchored scan with a robust body-skip** — `_skip_body` reuses
the full `decode_block` parser with GOTO-following **off** (a hand-rolled length
table desynced on `ADDRESS/PRINTSTR/IF/SET` and lost every keyword after the first
complex body — which is why only `name` used to show).

## 6. Driving input — `u6_say` / `u6_key`

`u6_say(text)` answers the current prompt. It peeks the opcode at `Talk_PC`: a
single-key prompt (`GET/GETCHR/GETDIGIT/WAIT`) gets just the first char; a line
prompt (`ASKTOP/GETSTR/GETINT`) gets `text` + Enter.

**The page-pause / first-char-eaten problem.** A long greeting or response contains
a `*` page-pause; while it blocks, `PromptCh` (`DS:0x04D4`) `== 1` and a keystroke
only **advances the page** — so the first char of a reply typed into a paused
conversation is eaten (`"name"` → `"ame"`). The real keyword prompt is `CON_gets`,
which raises **`D_049B` (`DS:0x049B`) `== 1`** while it reads the line
(`seg_0C9C.c:1593/1626`). So before typing, `u6_say` runs **`_advance_conv_input`**:
while a page-pause shows (`PromptCh==1`), send ENTER to advance; stop the instant
`D_049B==1`; **never** send a key once `D_049B==1` (that would submit an empty line /
exit). It returns "(advanced N page-pause(s))". This is deterministic — not a timing
guess. (`u6_key` is the raw escape hatch for menus / single keys.)

| signal | meaning |
|---|---|
| `PromptCh == 1` | a page-pause is blocking — a key just advances it |
| `D_049B == 1` | `CON_gets` is live — the real keyword/line prompt; safe to type |

## 7. Full disassembly — `u6_script_disasm`

`u6_script_disasm` dumps the **whole** TalkBuf as an addressed, assembly-like
listing — every opcode in address order, operands resolved, `GOTO` → `L_xxxx`
labels, `KEY/RES` blocks, `IF`/factor expressions, side-effects (`SET`, `GIVEOBJ`
with an obj-id comment, …), `OP_WAIT`, and an inline **`??? 0xNN`** for any unknown
opcode (flagged, never fatal). It reuses the §3/§5 opcode model but walks
**linearly** (no control-flow following) so it lists the script in address order; a
zero run (≥16 bytes) ends it. `max_bytes` caps the window (default 4096; the buffer
is `0x2800`). A conversation must be open so the script is in `TalkBuf`.

This is the agent's structural/reference view: which keyword gives which object,
which flag gates which branch, a copy-protection answer key. **Reading is allowed;
acting on it is governed by the rule of engagement** (`u6_agent_capabilities.md`):
answer a **manual-lookup / copy-protection** prompt directly, but **solve a game
puzzle by playing** — never lift it from the disassembly — and say which you are
doing. The script is the **"what," never the "how"** (navigation, prerequisite
chains, sequencing, combat are not in any one script).

## 8. Worked example — Lord British's first-meeting copy-protection

A fresh character meeting LB triggers the manual quiz before the briefing + key.
`u6_script_disasm` reproduces it automatically:

```
SET self, 0
IF Flag(self, 7)  GOTO L_071b   ENDIF      ; met-gate: if met -> "Good morning" path
"$P! 'Tis good to see thee again…"          ; first-meeting greeting
LET VarInt[7]=0  VarInt[8]=0  VarInt[9]=0   ; quiz counters
"…But I must make sure 'tis truly thee."*"Only the true Avatar would know what was in the Compendium I sent."*
LET VarInt[7] = Rand(1,10)                   ; roll 3 DISTINCT questions
  …  LET VarInt[8] = Rand(1,10)  IF (VarInt[8]==VarInt[7]) GOTO …   ; re-roll dups
  …  (VarInt[9] too)
  each: LET VarInt[6] = the question#, GOTO L_1548 (dispatcher)
L_1548: IF VarInt[6]==1 GOTO L_15ca … ==10 GOTO L_1b81   ; jump table to 10 questions
L_15ca: "What doth trolls lack?"  ASKTOP  KEY "end" -> "Thou art correct."  GOTO <roller>
        KEY "*" -> "Nay, 'tis not the correct answer. Consult thy Compendium." (re-ask)
… 3 correct →
"Ah, 'tis thee indeed, $P. Take this key.…unlock the gatehouse…"
GIVEOBJ 1, 64, 1, 1   ; obj 0x40  (the gatehouse key)
SET self, 7           ; set the met-gate (no quiz next time)
"Now let me tell thee what hath transpired…"   ; the briefing
```

Driving it: poll `D_049B` (§6) to know when each question's answer prompt is live,
read `VarInt[6]` (`DS:0xB6E1 + 6*2`) to learn **which** question rolled, decode that
block's `KEY` answer (manual-lookup → may type it directly), `u6_say` it; 3 correct →
the `GIVEOBJ` fires and the key lands in inventory.

## 9. Offsets (DS-relative; re-derive before relying)

| Datum | Where | Note |
|---|---|---|
| TalkBuf far ptr | `0x4D50` (off:2, seg:2) | `tb_lin = (seg<<4)+off`; size `0x2800` |
| Talk_PC | `0xE7AB` | VM program counter into TalkBuf |
| IsInConversation | `0x098B` | 1 while a conversation is active |
| Interlocutor (npc#) | `0xE796` | the NPC being talked to (`OP_NPC`/self) |
| TalkInput line | `0xE732` | the typed reply buffer |
| `D_049B` line-input | `0x049B` | ==1 while `CON_gets` reads the keyword line |
| `PromptCh` | `0x04D4` | ==1 during a page-pause; ==5 normal |
| VarInt / VarStr | `0xB6E1` (int[36]) / `0xB72D` (near ptr[36]) | converse variables |
| TalkFlags | `0xB2EB` (byte per NPC) | `OP_TST/SET/CLR` bits (bit 0 name-known, etc.) |
| Keyword dispatch | `OP_KEY 0xef … OP_RES 0xf6 … OP_ENDRES 0xee` | comma-separated keywords; `*` catch-all |
