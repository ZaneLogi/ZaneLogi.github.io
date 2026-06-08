# Research / design: I-13 conversation VM (standalone effect interpreter)

Pre-implementation design for I-13 — how the conversation bytecode VM is
structured in the rebuild. The **source decode** lives in
[research_conversation_vm.md](research_conversation_vm.md) (the bytecode
mechanics, opcode catalog, `TalkDriver` flow). The **Chinese conceptual
explainer** is [U6_對話系統.md](U6_對話系統.md). This doc is the
*architecture decision* for the port and the I-13 sub-step plan; it does
not restate the bytecode mechanics.

## The decision (settled 2026-06-07)

The VM is a **standalone effect interpreter**. It walks the bytecode and
owns only its own scratch state (`VarInt`/`VarStr`, program counter,
keyword input). Whenever the script needs the game world — print a line,
ask the player, read a flag, give an object, show a portrait — the VM
**suspends and yields a typed effect** `{type, ...params}` to a host. The
host performs it and resumes the VM, passing back a value when the effect
is a read. The VM has **zero ECS / world / I/O imports**.

This supersedes the earlier "start with a status-enum class" sketch in
[research_conversation_vm.md §"Implications for the rebuild"](research_conversation_vm.md).
We chose the *effect-emit* model (was "Option 1") over a *world.\* callback
interface* (was "Option 2") because it makes the VM unit-testable with no
host at all (feed bytes → assert the emitted effect stream), keeps deferred
subsystems as host-side stubs rather than VM gaps, and maps a conversation's
intents onto the same ECS primitives the player's own actions use.

## Three parties

1. **`ConversationVM`** (pure) — bytecode in, effect stream out. Owns
   `VarInt[36]` / `VarStr[36]`, `Talk_PC`, `npcId`, the last input, and an
   injected `rng()`. No imports from `ecs/`, `resources/`, `view/`.
2. **Host / effect-applier** (a `ConversationSystem` + the dialog view) —
   translates each effect into existing ECS operations and UI, and answers
   reads. This is where conversation meets the world.
3. **Driver loop** — pumps the generator:
   ```js
   let r = vm.next();                       // start
   while (!r.done) {
     const answer = await host.handle(r.value);   // undefined for emit-only effects
     r = vm.next(answer);
   }
   ```
   `await` because input effects wait on the dialog `<input>`; sinks/queries
   resolve synchronously.

## Wire protocol — one shape, generator-based

`run()` is a generator (`function*`); `evaluate()` (the RPN expression
evaluator, source's `parse_factor`) is also a generator, invoked with
`yield*` so a query mid-expression suspends with the operand stack intact.
Pure helpers (`getString`, `skipCodeBlock`, keyword match, `$`/`#`
expansion) stay normal functions.

Every host interaction is a single yield: `yield {type, ...params}`. The
six buckets below are a **host-dispatch + documentation** classification,
not six protocols — from the VM's side there are only two cases: *ignore
the resume value* (output, sink) or *use the resume value* (input, query,
read-and-write). The generator holding its own call stack is what gives us
free suspend/resume — including mid-expression — and deletes the legacy
port's hand-rolled resume hack (the `checkInputNumber` flag + `current--`
rewind at `../ultima6/script.js:150`).

Text output is itself an effect (`{type:'say', text}`), carrying
**already-substituted, render-ready** text (see §Variables).

## Complete effect taxonomy

Every host-touching opcode in `seg_1703.c`, by bucket. (Legacy names per
`../ultima6/u6opcode.js`.) Opcodes not listed are VM-internal.

### VM-internal (no host, no effect)
`>` `>=` `<` `<=` `!=` `==` (0x81–0x86), `+ - * / | &` (0x90–0x95),
`IF`/`ENDIF`/`ELSE` (0xa1–a3), `LET`/`END_OF_FACTOR`/`LET_VALUE`
(0xa6–a8), `GOTO`/`CALL` (0xb0–b1), `VARINT`/`VARSTR`/`__B4` (0xb2–b4),
`__BC`/`__BD` const-100 (0xbc–bd), `STRSEARCH`/`ENDSEARCH`/`VALSEARCH`
(0xb7/b8/c3 — operate on VM vars + the script's own data tables),
`ADDRESS`/`BYTE`/`WORD`/`__D5` literals (0xd2–d5), `NPC` self-ref (0xeb),
and the structural markers `ENDRES`/`KEY`/`__F0`/`DESC`/`MAIN`/`PREFIX`/
`RES`/`ID` (0xee–ff). `LEAVE`/`BYE` (0xb6) ends the generator.
**`RND` (0xa0)** is VM-internal via an **injected `rng()` capability**
(seeded at construction) — kept off the effect stream so it stays quiet
and deterministic in tests.

### Output — emit, continue (resume value ignored)
| Source (byte) | Effect |
|---|---|
| text run `<0x80`, `PRINTSTR` (0xb5) | `{say, text}` (post-expansion) |
| `SHOW_CONVERSE` (0xbf) | `{portrait, npc}` → I-12 renderer |
| `SHOW_INVENTORY` (0xbe) | `{showInventory, who}` (may suspend if trade UI blocks — host's call) |
| `DELAY` (0xd0) | `{delay, frames}` (host animates N×20 frames) |

### Input — suspend, resume with player value
| Source (byte) | Effect → resume |
|---|---|
| `ASKTOP` (0xf7) | `{ask}` → keyword line |
| `GET` (0xf8) | `{getChoice, allowed}` → one constrained key (e.g. Y/N) |
| `GETSTR` (0xf9) | `{getString}` → string |
| `GETCHR` (0xfa) | `{getChar}` → char |
| `GETINT` (0xfb) | `{getInt}` → integer |
| `GETDIGIT` (0xfc) | `{getDigit}` → single digit |
| `WAIT` (0xcb) + inline `*` | `{pause}` → acknowledgment (keypress/click) |

### Query — suspend, resume with world value (host reads, no mutation)
| Source (byte) | Effect → resume |
|---|---|
| `TST` (0xab) | `{query:'flag', npc, bit}` → 0/1 |
| `CANCARRY` (0x9a) | `{query:'canCarry', npc}` → free capacity |
| `WEIGHT` (0x9b) | `{query:'weight', objType, qty}` → weight |
| `HORSED` (0x9d) | `{query:'isHorse', npc}` → 0/1 |
| `OWNS` (0x9f) | `{query:'owns', npc, objType, qual}` → 0/1 |
| `TEST_OBJ` (0xbb) | `{query:'hasObj', npc, objType}` → count/bool |
| `OWNER` (0xc1) | `{query:'owner', obj}` → npc |
| `OBJTYPE` (0xc2) | `{query:'objType', obj}` → type |
| `ISINPARTY` (0xc6) | `{query:'inParty', npc}` → 0/1 |
| `WHOSGOT` (0xc7) | `{query:'whosGot', objType, qual}` → npc / 0x8001 |
| `ISONSCREEN` (0xd7) | `{query:'onScreen', npc}` → 0/1 |
| `WOUNDED` (0xda) | `{query:'wounded', npc}` → 0/1 |
| `POISONNED` (0xdc) | `{query:'poisoned', npc}` → 0/1 |
| `__DD` (0xdd) | `{query:'partyMember', index, onscreenOnly}` → npc |
| `__D8`/`__DF` (0xd8/df) | `{query:'npcName', npc}` → name; VM stores into `$Y` |

### Sink — emit world write, continue (resume value ignored)
| Source (byte) | Effect |
|---|---|
| `SET`/`CLR` (0xa4/a5) | `{setFlag/clrFlag, npc, bit}` |
| `GIVEOBJ`/`TAKEOBJ` (0xb9/ba) | `{give/take, npc, obj, qual, qty}` |
| `MOVEOBJ` (0xc8) | `{moveObj, npc, obj}` |
| `TRANSFEROBJ` (0xc9) | `{transferObj, fromNpc, obj, qual, toNpc}` |
| `ADDKARMA`/`SUBKARMA` (0xc4/c5) | `{addKarma/subKarma, n}` |
| `SETMODE` (0xcd) | `{setMode, npc, mode}` |
| `RESURRECT` (0xd6) | `{resurrect, npc}` |
| `HEAL` (0xd9) | `{heal, npc}` |
| `CURE` (0xdb) | `{cure, npc}` |
| `GETHORSE` (0x9c) | `{spawnHorse, npc}` → host spawns `OBJ_1AF` adjacent to avatar |
| `REST` (0x9e) | `{rest}` → advance clock to 05:00 + heal party |

### Read-and-write — emit, resume with returned value
| Source (byte) | Effect → resume |
|---|---|
| `JOIN` (0xca) | `{join, npc}` → status 0/1/2 |
| `LEAVEPARTY` (0xcc) | `{leave, npc}` → status 0/1/2 |
| `ADDEXP/ADDLVL/ADDSTR/ADDINT/ADDDEX` (0xe0–e4) | `{addExp/…, npc, n}` → new value |
| `SELECT_OBJECT` (0xc0) | `{selectObject}` → picked obj (interactive read) |

`0xd1 FUNC` (legacy-only) is **not used by U6** — drop (verify per
[research_conversation_vm.md §"Open questions"](research_conversation_vm.md) #1).
`0xf3 PREFIX` is a structural marker (open-question #2); treat as `MAIN`
until its distinction is decoded.

## Variables — VM-owned expansion, host-seeded init

`$`/`#` substitution happens **inside the VM**, because `VarStr`/`VarInt`
are the VM's own state: seeded once, then mutated mid-script (`$Z`=last
input, `$Y`=`SETNAME`, `$0–$9`/`#0–#9`=`LET`/`GETSTR`/`GETINT`). The host
can't expand correctly because it doesn't track those changes. So the
`{say}` effect carries final text; the host never sees `$N`.

Game-derived initial values enter through exactly two channels, both
already in the protocol:

- **Seed at construction** — the host gathers the `seg_16E1.c`
  `TALK_initTalk` table (player name `$P`, `$N`, `$G`, `$T`; `#A #D #E #H
  #I #K #L #M #O #P #S #W #Y`; full set in
  [U6_對話系統.md §8](U6_對話系統.md)) and passes it as the VM's initial
  `VarStr`/`VarInt`. `TALK_initTalk` thus moves *out* of the VM to the
  host.
- **`{query:'npcName'}`** at runtime for `$Y` (`SETNAME`).

`$0–$9`/`#0–#9` reset to empty/0 at construction.

**Keep markup separate from variables.** `@word` (highlight), `<>` (runic/
gargish), `/\` (plural), `&&` (translate) are rendering/control, not vars:
- inline `*` → the VM splits the text and emits `{say}` then `{pause}`.
- `@`/`<>` → pass through in the `say` text (or as spans); the dialog
  renderer styles them. The VM does not know colors/fonts.
- `/\`, `&&` → affect word choice; deferred to a later sub-step.

(Implementation-time check: confirm `$N` appears as literal ASCII in the
text stream that the console layer rewrites — the legacy port's assumption
— vs. encoded as `OP_VARSTR`. Changes *how the VM detects* a var, not
*where* expansion lives.)

## Gates and loading are host pre-flight, not VM

The `TalkDriver` early-exit gates ("Not on screen", "No response",
séance/dead, "Talking to yourself?", Armageddon, "Funny, no response") all
read world state and run **before** the VM exists. They're host
responsibility: the host decides whether to start a conversation at all.
Likewise `LoadConversation` (pick `converse.a` for id ≤ 0x62 / `converse.b`
for 0x63–0xDF, LZW-inflate) is host-side and produces the bytes handed to
the VM constructor. The dead/séance polarity is subtle — see the corrected
[U6_對話系統.md §2 callout](U6_對話系統.md).

## Host as a thin translation layer; stub-when-deferred

Each effect maps to a few lines calling systems that already exist (or
will): `give/take/moveObj/spawnHorse` → `world_loader` add/delete/find +
inventory (I-10 primitives); `setFlag`/`heal`/`karma` → component writes;
`portrait` → I-12 dialog renderer; `setMode`/`join`/`leave` → AI-mode
component + Party resource; `rest`/`delay` → clock.

When a target system isn't built yet, the host handler is a **logged
no-op + a MessageLog line**, not a VM gap. The VM emits the complete,
correct effect; the handler is fleshed out when the system lands — zero
VM edits. So `GETHORSE` for I-13 can legitimately *spawn the horse entity*
(world_loader supports it) while the ride/mount mechanic stays unbuilt —
a faithful, non-blocking partial.

## Legacy reuse plan (`../ultima6/script.js`)

Reuse the VM **skeleton** — it's the same opcode model and its `evaluate`
operand order, `0xeb` self-ref, flag/attribute ops, and the lib32+LZW
loader are faithful. Convert `run()`/`evaluate()` to generators emitting
effects, and apply the fix-list:

- **Keyword matcher** (highest-value fix): legacy `containsKeyword` uses
  `includes()` (substring). Source `str_i_compare` is **per-word prefix**
  with a `?` single-char wildcard and a `*` catch-all keyword. Port the
  source semantics.
- **Stubs to make real**: `OWNS`, `WHOSGOT`(`OBJINPARTY`), `WEIGHT`
  (`TypeWeight`); party cap **8 not 16**; `LEAVE` must drop the NPC's
  inventory to the ground (per `seg_1703.c:266`). (Full list:
  [research_conversation_vm.md §"Open questions"](research_conversation_vm.md) #4.)
- **Missing input modes**: `GETSTR`/`GETCHR` not in legacy `run()`.
- **Missing exec opcodes**: `PRINTSTR`, give/take/move/transfer, `ADD/
  SUBKARMA`, `REST`, `RESURRECT`, `DELAY`.
- **`AND`/`OR`** — source is boolean-coercion, legacy is bitwise
  (open-question #3); use source semantics.

## ECS placement

- `systems/conversation/conversation_vm.js` — the pure generator VM.
- `systems/conversation/conversation_system.js` — host/effect-applier +
  the pre-flight gates; wires effects to ECS ops and the dialog view.
- `resources/` — a `DialogueSession` (active VM + seeded vars) and a
  `ConversationScripts` lazy `Map<npcId, Uint8Array>` (mirrors the I-12
  lazy-portrait pattern). `TalkFlags` is per-NPC component/persistent
  state (already in the save set per `research_save_load.md`).
- View — the I-12 dialog window becomes live: `{say}`→scrolling text,
  `{ask}`/`{get*}`→the input line, `{portrait}`→the I-12 portrait,
  chips/“you say:” wired to real keyword dispatch.

## I-13 sub-step plan (save-point commits, squash at end)

Each bullet ≈ one save-point commit; browser-verify before the next
(per repo `CLAUDE.md` "Sub-step plan + save-point commits + final squash").

1. **I-13a — VM skeleton as generator.** Port `run`/`evaluate`/`getString`/
   `skipCodeBlock` into `conversation_vm.js`; yield `{say}`/`{ask}`/
   `{pause}` + VM-internal ops only; no world effects yet. Unit-test
   against a hand-built script (assert effect stream).
2. **I-13b — keyword dispatch done right.** Source-faithful matcher
   (per-word prefix + `?` + `*` catch-all), `KEY`/`RES`/`ENDRES`, nested
   answers, `look` replay.
3. **I-13c — `$`/`#` expansion + host-seeded init.** Relocated
   `TALK_initTalk`; `$Z`/`$Y` runtime mutation; markup pass-through.
4. **I-13d — host + gates + loader.** `conversation_system.js`,
   `LoadConversation` (.a/.b + LZW), pre-flight gates, wire to dialog view.
5. **I-13e — query effects.** All read opcodes → host reads (flags,
   party, attrs, on-screen). Replace legacy stubs with real impls.
6. **I-13f — sink + read-write effects.** give/take/karma/flag/heal/cure/
   setmode/join/leave/attr-trainers/`spawnHorse`; stub-when-deferred where
   the target system is absent.
7. **I-13g — input modes + `PRINTSTR`/`REST`/`DELAY`/`SELECT_OBJECT`**;
   remaining polish. Then squash to `impl I-13`.

## Cross-references

- [research_conversation_vm.md](research_conversation_vm.md) — source
  decode (bytecode mechanics, opcode catalog, `TalkDriver` flow, the
  verification open-questions this plan inherits).
- [U6_對話系統.md](U6_對話系統.md) — Chinese conceptual explainer
  (corrected against source 2026-06-07); holds the full built-in variable
  table and the dead/séance gate callout.
- [research_portraits.md](research_portraits.md) — I-12 portrait pipeline
  the `{portrait}` effect drives.
- [architecture_ecs.md](architecture_ecs.md) — the runtime ground the host
  applies effects onto.
- [../CLAUDE.md](../CLAUDE.md) §"Modern-browser UX as architectural anchor"
  — the suspend/resume pump is an instance (blocking `CON_getch` is
  substrate residue, not spec).
- Legacy: `../ultima6/script.js` (VM skeleton to lift),
  `../ultima6/u6opcode.js` (opcode constants),
  `../ultima6/map_viewer.js:625-726` (integration call site).
