---
name: decode_npc
description: >-
  Decode an ultima6_clone NPC conversation script into a research_npc_scripts.md
  catalog entry — without re-deriving the VM disassembly each session. Invoke as
  `/decode_npc <npcId | name>`. Reads the live converse.a/.b from the running
  browser (preview-eval), disassembles the bytecode with a desync-proof walker,
  then writes a full catalog entry + a same-pass quest_log update. Use when Zane
  asks to "check" / "decode" an NPC.
scope: ultima6_clone (quest-trace branch) — needs the running preview with converse.a/.b dropped
---

# /decode_npc — decode an NPC conversation script

A committed project dev-skill (see `ultima6_clone/CLAUDE.md` §"Project dev-skills").
When Zane types `/decode_npc <npcId>` (or a name, e.g. `/decode_npc Captain Fox`),
**read and follow this file.**

**Binding conventions** (local memories):
- **A "check" = a full catalog entry** (`feedback_npc_script_check_decodes`): decode the
  ONE named NPC and write its section + index row, even if the question was narrow.
- **One NPC at a time. NO catalog-wide content scans** — Zane chases the quest chain
  himself; don't spoil it by bulk-decoding.
- **Quest docs carry QUEST content only** (`feedback_quest_docs_no_engine`): in
  `quest_log.md` / `research_npc_scripts.md`, no clone/engine framing ("not ported",
  "live scan", `seg_*.c`, `I-N`, "Clone note"). Object numbers, coords, leads, dialogue —
  yes; engine status — no.

## 0. Prereqs

- The `u6` preview must be running with the user's U6 data dropped (needs **`converse.a`
  + `converse.b`** in IndexedDB). `preview_list` → grab the `u6` serverId; if none,
  `preview_start("u6")` (the preview MCP session is the browser the user dropped data into).
- Every eval below runs via `preview_eval` against that serverId.

## 1. Resolve the target → npcId

If given a number, use it. If given a name, resolve it (reads each script's leading
name; npcId == objlist slot here). Substitute `__NAME__`:

```js
(async () => {
  const { U6DB } = await import('/u6db.js');
  const { ConversationScripts } = await import('/assets/converse.js');
  const s = new ConversationScripts({ a: await U6DB.get('converse.a'), b: await U6DB.get('converse.b') });
  const OP_DESC = 0xf1, OP_ID = 0xff, q = '__NAME__'.toLowerCase();
  const hits = [];
  for (let id = 0; id <= 0xdf; id++) {
    let d; try { d = s.get(id); } catch (e) { continue; }
    if (!d || d.length < 3) continue;
    let pc = 0; if (d[pc] === OP_ID) pc++; pc++;            // skip OP_ID + the npcId byte
    let n = ''; while (pc < d.length && d[pc] !== OP_DESC) n += String.fromCharCode(d[pc++]);
    if (n.toLowerCase().includes(q)) hits.push({ id, name: n });
  }
  return hits;
})()
```

## 2. Disassemble the script (the core)

Dump the bytecode. The walker special-cases the multi-byte operand opcodes
(`BYTE`/`WORD`/`ADDRESS`/`GOTO`) so it never desyncs; every byte `< 0x80` is text, every
other `>= 0x80` is a single-byte opcode. Substitute `__ID__`:

```js
(async () => {
  const { U6DB } = await import('/u6db.js');
  const { ConversationScripts } = await import('/assets/converse.js');
  const { OP } = await import('/systems/conversation/opcodes.js');
  const s = new ConversationScripts({ a: await U6DB.get('converse.a'), b: await U6DB.get('converse.b') });
  const d = s.get(__ID__); if (!d) return { error: 'no script for __ID__' };
  const NAME = {}; for (const k of Object.keys(OP)) NAME[OP[k]] = k;
  let pc = 0, text = '', out = [];
  const flush = () => { if (text) { out.push(JSON.stringify(text)); text = ''; } };
  const u32 = () => { const v = (d[pc] | d[pc+1]<<8 | d[pc+2]<<16 | d[pc+3]<<24) >>> 0; pc += 4; return v; };
  while (pc < d.length) {
    const c = d[pc++];
    if (c < 0x80) { text += (c === 0x0a ? '\\n' : String.fromCharCode(c)); continue; }
    flush();
    if (c === OP.BYTE) out.push('BYTE(' + d[pc++] + ')');
    else if (c === OP.WORD) { const v = d[pc] | d[pc+1]<<8; pc += 2; out.push('WORD(' + v + ')'); }
    else if (c === OP.ADDRESS) out.push('ADDR(' + u32() + ')');
    else if (c === OP.GOTO) out.push('GOTO(' + u32() + ')');
    else out.push('<' + (NAME[c] || ('op' + c.toString(16))) + '>');
  }
  flush();
  return { len: d.length, dump: out.join(' ') };
})()
```

## 3. Read the dump (script layout)

- **Header:** `<ID> "<idByte><name>" <DESC> "<look>" … <MAIN>`. The first char after `<ID>`
  is the npcId byte (e.g. `o` = 111) — the name is the rest up to `<DESC>`; the `<DESC>`
  string is the "You see …" look. ~33/200 scripts have `<PREFIX>` right before `<MAIN>`.
- **Greeting:** the text between `<MAIN>` and the first `<KEY>`/`<ASKTOP>`, often wrapped in
  an opening `<IF> … <ENDIF>` (a met-flag or busy gate).
- **Topics:** each block is `<KEY> "kw1,kw2,*" <RES> …response… GOTO(<askloop>)`. Keywords
  are comma-separated and matched by **prefix** (any player input word starting with the kw);
  `*` = catch-all. The response ends at the next `<KEY>` / `<ENDRES>` / structural op.
- **`GOTO(n)`** targets are **absolute byte offsets**; bodies for join/leave/buy/quiz loops
  live further down at those offsets — read them there to follow the branch.

## 4. Opcode cheat-sheet (what carries meaning)

Operands are "factors" = an RPN expression ending at `<END_OF_FACTOR>` (0xa7); constants
show as `BYTE(n)`/`WORD(n)`; `<NPC>` (0xeb, often shown as `BYTE(235)`) = **self** (the talk
target). Full table: `systems/conversation/opcodes.js`; semantics: `conversation_vm.js`.

- **Flags:** `<SET>`/`<CLR>` npc,bit — `SET self bit 0` = "name now known". `<TST>` npc,bit =
  read a flag (in `<IF>` conditions).
- **Items:** `<GIVEOBJ>`/`<TAKEOBJ>` npc,obj,qual,qty · `<TRANSFEROBJ>` obj,qual,from,to ·
  `<TEST_OBJ>` npc,obj (has it?) · `<WHOSGOT>` obj,qual (`WORD(32769)` = -32767 = nobody).
- **Party / karma:** `<JOIN>`/`<LEAVEPARTY>` self (codes 1 at-sea / 2 full / 3 decline) ·
  `<ADDKARMA>`/`<SUBKARMA>` n.
- **Control / IO:** `<IF> … <ELSE> … <ENDIF>` · `<LEAVE>` = end convo · `<WAIT>` = pause ·
  `<ASKTOP>` = read a line · `<GET> "yn" … <KEY>` = a y/n choice · `<GETSTR/GETINT/GETDIGIT/
  GETCHR>` = typed input.
- **Seed vars** (host `TALK_initTalk`): `$G` milord/milady · `$P` avatar name · `$N` this
  NPC's name · `$T` time-of-day · `$Z` last input · `#K` karma · **`#W` = this NPC's npcMode**
  (the common busy gate is `IF #W == 153` → "can't talk, I'm fighting") · `#P/#S/#D/#I` =
  avatar HP/STR/DEX/INT.
- **Text markup:** `@word` = askable keyword · `<…>` = gargoyle/runic · `*` = pause · `&` =
  translate marker (`/\` = plural).

## 5. Write the catalog entry (+ quest_log, same pass)

In `docs/research_npc_scripts.md`:
- Add a **sorted-by-npcId** row to the index table **and** an `<a id="npc-N"></a>` anchor line
  directly above the new section (sections sit in catalog/ask order at the end of the file).
- Section: `## <Name> — npcId N (\`converse.a|.b\`), <len> bytes — <one-line role>`, then
  **You see** "<look>" + position/town, the **topics** (keyword → what it says/does), an
  **Actions** line (the SET/CLR/GIVE/TAKE/JOIN/karma/LEAVE the script performs), and a
  **Quest payload** line (★ if it advances a thread; "✗ none" for flavor).

Then update `docs/quest_log.md` in the **same pass** — threads / leads table / key-items /
the "NPCs visited" count — for anything the decode surfaced. Quest content only.

## Notes / gotchas

- npcId ranges: `converse.a` = 0..0x62, `converse.b` = 0x63..0xDF; `>= 0xe0` are generic
  (Wisp/Guard/Gargoyle) and deferred.
- The dump is the source of truth; for tangled branch logic you *can* drive the real VM
  (`new ConversationVM(bytes)` from `conversation_vm.js`), but the static dump is enough for
  a catalog entry.
- This reads the user's own data from IndexedDB via preview-eval — nothing game-data is
  committed (BYO-data legal rule).
