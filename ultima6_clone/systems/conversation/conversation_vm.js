// systems/conversation/conversation_vm.js
//
// I-13 — the conversation bytecode VM, as a STANDALONE effect interpreter.
// Design: docs/research_i13_conversation_vm.md. Source: seg_1703.c (talkdr) —
// TalkDriver (open flow + ask/answer loop) + parse_statement (statement reader)
// + C_1703_1D01 (keyword dispatch) + parse_factor (RPN evaluator). Legacy
// cross-check: ../ultima6/script.js.
//
// The VM owns ONLY its own scratch state (VarInt/VarStr, pc, last input). It has
// zero world / I-O imports. `run()` is a generator that YIELDS typed effects; the
// driver resumes it with `.next(value)` — a value for reads (query / input /
// read-and-write), nothing for writes/output. The generator's own call stack
// gives free suspend/resume, including mid-expression (the operand stack in
// evaluate() survives a query yield). Effect taxonomy: research_i13_conversation_vm.md.

import { OP, varIndex } from './opcodes.js';

// str_i_compare (seg_1703.c:130) — does any space-separated word of the player's
// input have `keyword` (len chars) as a case-insensitive prefix? '?' in the
// keyword is a single-char wildcard. This is the source-faithful matcher (the
// legacy port's substring includes() was too loose).
export function strICompare(keyword, input, len) {
  const klen = len ?? keyword.length;
  for (const word of String(input).split(' ')) {
    if (!word) continue;
    let i = 0;
    for (; i < klen; i++) {
      const k = keyword[i];
      if (k === '?') continue;
      const w = word[i];
      if (w === undefined) break;
      if (w.toLowerCase() !== (k === undefined ? '' : k.toLowerCase())) break;
    }
    if (i === klen) return true;
  }
  return false;
}

export class ConversationVM {
  // bytes  — the decompressed script (Uint8Array).
  // vars   — host-seeded initial variables { '$P':'Avatar', '#K':42, ... } (the
  //          relocated seg_16E1.c TALK_initTalk table); $-keys -> VarStr, #-keys -> VarInt.
  // rng    — injected (lo,hi)->int so randomness stays deterministic in tests.
  constructor(bytes, { vars = null, rng = null } = {}) {
    this.data = bytes;
    this.pc = 0;
    this.end = bytes ? bytes.length : 0;
    this.VarInt = new Array(36).fill(0);     // 0..9 scratch, 10..35 = 'A'..'Z'
    this.VarStr = new Array(36).fill('');
    this.npcId = 0;
    this.npcName = '';
    this.lastInput = '';                      // $Z
    this.descPc = 0;                          // look-replay anchor (after OP_DESC)
    this.inResponse = false;                  // D_E79C — inside a matched answer
    this.done = false;
    this.rng = rng || ((lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)));
    if (vars) this.seed(vars);
  }

  seed(vars) {
    for (const key of Object.keys(vars)) {
      const idx = varIndex(key[1]);            // key is '$X' / '#N'
      if (key[0] === '$') this.VarStr[idx] = String(vars[key]);
      else if (key[0] === '#') this.VarInt[idx] = vars[key] | 0;
    }
  }

  // --- byte readers (little-endian, like the source macros) ---
  _u8() { return this.data[this.pc++]; }
  _u16() { const v = this.data[this.pc] | (this.data[this.pc + 1] << 8); this.pc += 2; return v; }
  _s16() { const v = this._u16(); return v >= 0x8000 ? v - 0x10000 : v; }
  _u32() { const d = this.data, p = this.pc; this.pc += 4; return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0; }

  // mk_npcnum (seg_1703.c:147): OP_NPC (0xeb) is the self-reference marker → the talk target.
  _npc(n) { return n === OP.NPC ? this.npcId : n; }

  // ============================================================ run() ========
  // Top-level conversation flow = TalkDriver (seg_1703.c:1080-1206), minus the
  // host-side pre-flight gates / portrait (those live in the host). Script layout:
  // OP_ID npcId <name> OP_DESC <desc> OP_MAIN <greeting> <ask/answer loop>.
  *run() {
    const d = this.data;
    if (!d || d.length < 3) { this.done = true; return; }

    // --- ID segment: 0xff, npcId, name bytes up to OP_DESC → $N (seg_1703.c:1081-1087)
    this.pc = 0;
    if (d[this.pc] === OP.ID) this.pc++;       // skip OP_ID
    this.npcId = this._u8();
    let name = '';
    while (this.pc < this.end && d[this.pc] !== OP.DESC) name += String.fromCharCode(this._u8());
    this.npcName = name;
    this.VarStr[varIndex('N')] = name;         // $N (overrides the seed placeholder)

    // --- DESC segment: "You see " + description (seg_1703.c:1095-1098) ---
    while (this.pc < this.end && this._u8() !== OP.DESC);   // advance past OP_DESC
    this.descPc = this.pc;                                  // look-replay anchor
    yield { type: 'say', text: 'You see ' };
    yield* this.statement();

    // --- MAIN: skip to body, then the optional greeting (seg_1703.c:1101-1109).
    //     OP_PREFIX (0xf3) is an alternative body marker some NPCs use (u6converse.txt
    //     "f2 or f3"); accept either as the start of the main body. ---
    while (this.pc < this.end) { const c = this._u8(); if (c === OP.MAIN || c === OP.PREFIX) break; }
    if (d[this.pc] !== OP.ASKTOP) {
      yield* this.statement();                 // the NPC's opening line
    }

    // --- ask / answer loop (seg_1703.c:1111-1194) ---
    while (!this.done && this.pc < this.end) {
      const savedPc = this.pc;
      const op = this._u8();
      if (op === OP.ASKTOP) {
        this.lastInput = String(yield { type: 'ask' });
        this.inResponse = false;
      } else if (op === OP.GETSTR) {
        const s = String(yield { type: 'getString' });
        const idx = this._u8();
        if (this._u8() !== OP.VARSTR) break;
        this.VarStr[idx] = s;
        this.lastInput = s;
        this.inResponse = false;
      } else if (op === OP.GETINT) {
        const s = String(yield { type: 'getInt' });
        const idx = this._u8();
        if (this._u8() !== OP.VARINT) break;
        const n = parseInt(s, 10);
        this.VarInt[idx] = Number.isFinite(n) ? n : 0;
        this.lastInput = s;
        this.inResponse = false;
      } else if (op === OP.GETDIGIT) {
        const s = String(yield { type: 'getDigit' });
        const idx = this._u8();
        if (this._u8() !== OP.VARINT) break;
        const n = parseInt(s, 10);
        this.VarInt[idx] = Number.isFinite(n) ? n : 0;
        this.lastInput = s;
        this.inResponse = false;
      } else if (op === OP.GETCHR) {
        this.lastInput = String(yield { type: 'getChar' });
        this.inResponse = false;
      } else if (op === OP.GET) {
        // OP_GET c0..cn OP_KEY — only the listed keys are accepted (e.g. Y/N).
        let allowed = '';
        let c;
        while ((c = this._u8()) !== OP.KEY) allowed += String.fromCharCode(c);
        this.pc--;                              // back up the OP_KEY (seg_1703.c:1160)
        this.lastInput = String(yield { type: 'getChoice', allowed });
        this.inResponse = false;
      } else if (op === OP.WAIT) {
        yield { type: 'pause' };
        continue;                               // WAIT does not feed the dispatch
      } else if (op === OP.ENDRES) {
        continue;                               // stray ENDRES — skip
      } else if (op === OP.ID || op >= 0xf0 || op === 0) {
        break;                                  // end / FF / unexpected structural op
      } else {
        // An exec/text op at the loop top (e.g. the body continues) — back up and run it.
        this.pc = savedPc;
        yield* this.statement();
        continue;
      }
      // $Z = last input; "look" replays the description (seg_1703.c:1184-1193).
      this.VarStr[varIndex('Z')] = this.lastInput;
      if (this.lastInput.toLowerCase() === 'look') {
        yield { type: 'say', text: 'You see ' };
        const back = this.pc;
        this.pc = this.descPc;
        yield* this.statement();
        this.pc = back;
      } else {
        yield* this.statement();
      }
    }
    this.done = true;
  }

  // ===================================================== statement() =========
  // parse_statement (seg_1703.c:945) — emit text, dispatch keywords, run exec
  // opcodes until a terminator (0 / ENDRES / any op >= 0xf0). Backs up the
  // terminator for the caller.
  *statement() {
    const d = this.data;
    let text = '';
    const flush = function* () { if (text) { yield { type: 'say', text: this.expand(text) }; text = ''; } }.bind(this);
    while (this.pc < this.end && !this.done) {
      const op = d[this.pc];
      if (op === 0 || op === OP.ENDRES || op >= 0xf0) break;
      this.pc++;
      if (op < 0x80) {
        // printable text (including '\n'); inline '*' = pause (split + emit pause).
        if (op === 0x2a /* '*' */) { yield* flush(); yield { type: 'pause' }; }
        else text += String.fromCharCode(op);
      } else if (op === OP.KEY) {
        yield* flush();
        if (!this.inResponse) yield* this.keyword();
        else { while (this.pc < this.end && this._u8() !== OP.ENDRES); }   // nested KEY → skip to ENDRES
      } else {
        yield* flush();
        yield* this.execOp(op);
        if (this.done) break;
      }
    }
    yield* flush();
    // The loop PEEKS the terminator (0 / ENDRES / op >= 0xf0) and breaks without
    // consuming it, so pc already points AT the terminator for the caller — no
    // back-up needed (unlike source, whose PARSE_U8 loop consumes it then pc--).
  }

  // ===================================================== keyword() ===========
  // C_1703_1D01 (seg_1703.c:980) — match the player's last input against this
  // keyword block's comma-separated keywords (or '*' catch-all); on a hit, run the
  // response; else skip to the next KEY/ENDRES/FF.
  *keyword() {
    let input = this.lastInput;
    if (!input) input = 'bye';                  // empty input → "bye"
    let more = true;
    while (more) {
      more = false;
      let kw = '';
      let c;
      while ((c = this._u8()) !== 0x2c /* ',' */ && c !== OP.RES) kw += String.fromCharCode(c);
      if (c === 0x2c) more = true; else this.pc--;   // ',' → another keyword; else back up RES
      if (strICompare(kw, input, kw.length) || kw[0] === '*') {
        while (this._u8() !== OP.RES);          // skip remaining keywords up to RES
        this.inResponse = true;
        yield* this.statement();
        return;
      }
    }
    // no match → skip this response to the next KEY / ENDRES / FF (seg_1703.c:1003)
    let si;
    do {
      si = this._u8();
      if (si === OP.GOTO) this.pc += 4;
      else if (si === OP.BYTE) this.pc += 1;
      else if (si === OP.WORD) this.pc += 2;
    } while (si !== OP.KEY && si !== OP.ENDRES && si !== OP.ID && this.pc < this.end);
    if (si === OP.KEY || si === OP.ID) this.pc--;
  }

  // ===================================================== execOp() ============
  // execute_op (seg_1703.c:714) — statement-level control + world-write opcodes.
  // World writes become yielded sink effects; control flow stays internal.
  *execOp(op) {
    switch (op) {
      case OP.ENDIF: case OP.END_OF_FACTOR: break;
      case OP.LEAVE: this.done = true; break;

      case OP.GOTO: { const t = this._u32(); this.pc = t; break; }

      case OP.IF: {
        const cond = yield* this.evaluate();
        if (!cond) this._skipIfBlock(true);     // skip to ELSE or ENDIF
        break;
      }
      case OP.ELSE: this._skipIfBlock(false); break;   // (reached only on the true branch) skip to ENDIF

      case OP.LET: yield* this._let(); break;
      case OP.PRINTSTR: yield* this._printStr(); break;

      case OP.SET: case OP.CLR: {
        const npc = this._npc(yield* this.evaluate());
        const bit = yield* this.evaluate();
        yield { type: op === OP.SET ? 'setFlag' : 'clrFlag', npc, bit };
        break;
      }
      case OP.GIVEOBJ: case OP.TAKEOBJ: {
        const npc = this._npc(yield* this.evaluate());
        const obj = yield* this.evaluate();
        const qual = yield* this.evaluate();
        const qty = yield* this.evaluate();
        yield { type: op === OP.GIVEOBJ ? 'give' : 'take', npc, obj, qual, qty };
        break;
      }
      case OP.MOVEOBJ: {
        const npc = this._npc(yield* this.evaluate());
        const obj = yield* this.evaluate();
        yield { type: 'moveObj', npc, obj };
        break;
      }
      case OP.TRANSFEROBJ: {
        const obj = yield* this.evaluate();
        const qual = yield* this.evaluate();
        const from = this._npc(yield* this.evaluate());
        const to = this._npc(yield* this.evaluate());
        yield { type: 'transferObj', from, to, obj, qual };
        break;
      }
      case OP.ADDKARMA: { const n = yield* this.evaluate(); yield { type: 'addKarma', n }; break; }
      case OP.SUBKARMA: { const n = yield* this.evaluate(); yield { type: 'subKarma', n }; break; }
      case OP.SETMODE: {
        const npc = this._npc(yield* this.evaluate());
        const mode = yield* this.evaluate();
        yield { type: 'setMode', npc, mode };
        break;
      }
      case OP.RESURRECT: { const npc = this._npc(yield* this.evaluate()); yield { type: 'resurrect', npc }; break; }
      case OP.HEAL: { const npc = this._npc(yield* this.evaluate()); yield { type: 'heal', npc }; break; }
      case OP.CURE: { const npc = this._npc(yield* this.evaluate()); yield { type: 'cure', npc }; break; }
      case OP.GETHORSE: { const npc = this._npc(yield* this.evaluate()); yield { type: 'spawnHorse', npc }; break; }
      case OP.REST: yield { type: 'rest' }; break;
      case OP.DELAY: { const n = yield* this.evaluate(); yield { type: 'delay', frames: n * 20 }; break; }
      case OP.WAIT: yield { type: 'pause' }; break;
      case OP.SHOW_CONVERSE: { const npc = this._npc(yield* this.evaluate()); yield { type: 'portrait', npc }; break; }
      case OP.SHOW_INVENTORY: { const who = yield* this.evaluate(); yield { type: 'showInventory', who }; break; }

      // $Y := name of NPC (seg_1703.c:887 OP__D8 / :891 OP__DF "you")
      case OP.D8: { const npc = this._npc(yield* this.evaluate()); this.VarStr[varIndex('Y')] = String(yield { type: 'npcName', npc }); break; }
      case OP.DF: {
        const npc = this._npc(yield* this.evaluate());
        this.VarStr[varIndex('Y')] = npc === 1 ? 'you' : String(yield { type: 'npcName', npc });
        break;
      }

      default:
        // Unknown / not-yet-handled control op — emit a diagnostic effect, don't crash.
        yield { type: 'unknownOp', op };
    }
  }

  // OP_LET (seg_1703.c:745) — assign to a VarInt / VarStr. (OP_ADDRESS indirection
  // — writing into the script's own data array — is rare; handled minimally.)
  *_let() {
    let di = this._u8();
    let kind;
    if (di === OP.ADDRESS) { this.pc += 4; kind = 'addr'; }   // *(int*)addr = factor (rare; skip target)
    else kind = this._u8();
    if (this._u8() !== OP.LET_VALUE) return;
    if (kind === 'addr') { yield* this.evaluate(); return; }  // discard target write (script-data poke)
    if (kind === OP.VARINT) { this.VarInt[di] = yield* this.evaluate(); }
    else {
      // String assignment: either a constant string [ADDRESS] or another VarStr.
      const tag = this._u8();
      if (tag === OP.ADDRESS) {
        const ret = yield* this._followAddress(true);
        let s = '', c;
        while ((c = this._u8())) s += String.fromCharCode(c);
        this.VarStr[di] = s;
        this.pc = ret;
      } else {
        const src = tag;
        if (this._u8() !== OP.VARSTR) return;
        this.VarStr[di] = this.VarStr[src];
      }
    }
  }

  // OP_PRINTSTR (seg_1703.c:729) — print a constant string [ADDRESS] or a VarStr.
  *_printStr() {
    const tag = this._u8();
    if (tag === OP.ADDRESS) {
      const ret = yield* this._followAddress(true);
      let s = '', c;
      while ((c = this._u8())) s += String.fromCharCode(c);
      this.pc = ret;
      yield { type: 'say', text: this.expand(s) };
    } else if (tag !== OP.D5) {
      const di = this._u8();
      if (this._u8() !== OP.VARSTR) return;
      yield { type: 'say', text: this.expand(this.VarStr[di]) };
    }
  }

  // C_1703_1494 (seg_1703.c:688) — resolve a table ADDRESS into a cursor on the
  // selected entry; returns the resume pc. After the u32 table offset the bytecode is
  // either `OP_CALL` (plain pointer → entry #0, no index) or an INDEX FACTOR followed
  // by OP_END_OF_FACTOR (evaluate it → si, then pick entry si). stringMode (PRINTSTR /
  // LET-string, the read callers) skips `si` NUL-terminated strings; value mode (the
  // LET-into-script-data lvalue path) advances `si` 16-bit slots. A generator because
  // the index factor can yield query effects. research_conversation_vm.md §"Indexed
  // string / value tables".
  *_followAddress(stringMode) {
    const target = this._u32();
    if (this.data[this.pc] === OP.CALL) {        // plain pointer, no index
      this.pc++;                                 // consume the CALL marker
      const ret = this.pc;
      this.pc = target;
      return ret;
    }
    const si = yield* this.evaluate();           // index expression (consumes through OP_END_OF_FACTOR)
    const ret = this.pc;                         // resume right after the factor
    this.pc = target;                            // relocate the pc INTO the table
    if (stringMode) { let n = si; while (n > 0 && this.pc < this.end) if (this._u8() === 0) n--; }
    else { this.pc += si << 1; }
    return ret;
  }

  // Skip an IF-true block to OP_ELSE/OP_ENDIF (or just to ENDIF for the ELSE op),
  // stepping over GOTO(+4)/BYTE(+1)/WORD(+2) operands so operand bytes that happen to
  // equal a marker aren't mistaken for one (seg_1703.c:783-803; research_conversation_vm.md
  // §"Branch skipping"). LIMITATION (faithful to source): FLAT scan, no depth counter, so a
  // general nested IF/ELSE in the skipped branch would stop at the inner ELSE/ENDIF. Verified
  // across all 200 shipped scripts: 199 are flat; the one nested case (NPC 164) survives
  // because its inner IF has no ELSE and its ENDIF is adjacent to the outer ENDIF (flat lands
  // one no-op ENDIF short — harmless). Only a hypothetical non-adjacent / ELSE-bearing nested
  // block would break; a depth-counting scan would lift this.
  _skipIfBlock(stopAtElse) {
    while (this.pc < this.end) {
      const op = this._u8();
      if (op === OP.ENDIF) break;
      if (stopAtElse && op === OP.ELSE) break;
      if (op === OP.GOTO) this.pc += 4;
      else if (op === OP.BYTE) this.pc += 1;
      else if (op === OP.WORD) this.pc += 2;
    }
  }

  // ===================================================== evaluate() ==========
  // parse_factor (seg_1703.c:295) — RPN over a local stack; reads literals/vars,
  // applies operators, yields query/read-and-write effects for world access.
  // Returns the result (number, or a string for VarStr comparisons). Ends at
  // OP_END_OF_FACTOR (0xa7) or OP_LET_VALUE (0xa8).
  *evaluate() {
    const stack = [];
    let strFlag = false;                         // bp_58 — a VarStr was pushed (string compare)
    while (this.pc < this.end) {
      const op = this._u8();
      if (op === OP.END_OF_FACTOR || op === OP.LET_VALUE) break;
      switch (op) {
        case OP.ADDRESS: stack.push(this._u32()); break;
        case OP.BYTE: stack.push(this._u8()); break;
        case OP.WORD: stack.push(this._u16()); break;

        case OP.VARINT: { const i = stack.pop(); stack.push(this.VarInt[i] >>> 0); break; }
        case OP.VARSTR: { const i = stack.pop(); stack.push(this.VarStr[i]); strFlag = true; break; }
        case OP.B4: { const ai = stack.pop(), iv = stack.pop(); const off = (ai << 1) + iv; stack.push((this.data[off] | (this.data[off + 1] << 8)) | 0); break; }
        case OP.BC: case OP.BD: { stack.pop(); stack.pop(); stack.push(100); break; }

        case OP.ADD: { const b = stack.pop(), a = stack.pop(); stack.push(a + b); break; }
        case OP.SUB: { const b = stack.pop(), a = stack.pop(); stack.push(a - b); break; }
        case OP.MUL: { const b = stack.pop(), a = stack.pop(); stack.push(a * b); break; }
        case OP.DIV: { const b = stack.pop(), a = stack.pop(); stack.push(b ? Math.trunc(a / b) : 0); break; }
        case OP.OR: { const b = stack.pop(), a = stack.pop(); stack.push((a || b) ? 1 : 0); break; }   // boolean (source)
        case OP.AND: { const b = stack.pop(), a = stack.pop(); stack.push((a && b) ? 1 : 0); break; }

        case OP.EQU: {
          const b = stack.pop(), a = stack.pop();
          if (strFlag) stack.push(String(a).toLowerCase() === String(b).toLowerCase() ? 1 : 0);
          else stack.push(a === b ? 1 : 0);
          strFlag = false;
          break;
        }
        case OP.DIF: { const b = stack.pop(), a = stack.pop(); stack.push(a !== b ? 1 : 0); break; }
        case OP.SUP: { const b = stack.pop(), a = stack.pop(); stack.push(a > b ? 1 : 0); break; }
        case OP.SUPE: { const b = stack.pop(), a = stack.pop(); stack.push(a >= b ? 1 : 0); break; }
        case OP.INF: { const b = stack.pop(), a = stack.pop(); stack.push(a < b ? 1 : 0); break; }
        case OP.INFE: { const b = stack.pop(), a = stack.pop(); stack.push(a <= b ? 1 : 0); break; }

        case OP.RND: { const b = stack.pop(), a = stack.pop(); stack.push(this.rng(a, b)); break; }

        // --- query effects (read world state, resume with value) ---
        case OP.TST: { const bit = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'flag', npc, bit }); break; }
        case OP.WOUNDED: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'wounded', npc }); break; }
        case OP.POISONNED: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'poisoned', npc }); break; }
        case OP.ISINPARTY: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'inParty', npc }); break; }
        case OP.ISONSCREEN: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'onScreen', npc }); break; }
        case OP.HORSED: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'isHorse', npc }); break; }
        case OP.OBJTYPE: { const obj = stack.pop(); stack.push(yield { type: 'objType', obj }); break; }
        case OP.OWNER: { const obj = stack.pop(); stack.push(yield { type: 'owner', obj }); break; }
        case OP.OWNS: { const qual = stack.pop(), obj = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'owns', npc, obj, qual }); break; }
        case OP.TEST_OBJ: { const obj = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'hasObj', npc, obj }); break; }
        case OP.WHOSGOT: { const qual = stack.pop(), obj = stack.pop(); stack.push(yield { type: 'whosGot', obj, qual }); break; }
        case OP.WEIGHT: { const obj = stack.pop(), qty = stack.pop(); stack.push(yield { type: 'weight', obj, qty }); break; }
        case OP.CANCARRY: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'canCarry', npc }); break; }
        case OP.DD: { const onscreenOnly = stack.pop(), index = stack.pop(); stack.push(yield { type: 'partyMember', index, onscreenOnly }); break; }

        // --- read-and-write effects (mutate + resume with returned value) ---
        case OP.JOIN: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'join', npc }); break; }
        case OP.LEAVEPARTY: { const npc = this._npc(stack.pop()); stack.push(yield { type: 'leave', npc }); break; }
        case OP.ADDEXP: { const n = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'addExp', npc, n }); break; }
        case OP.ADDLVL: { const n = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'addLvl', npc, n }); break; }
        case OP.ADDSTR: { const n = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'addStr', npc, n }); break; }
        case OP.ADDINT: { const n = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'addInt', npc, n }); break; }
        case OP.ADDDEX: { const n = stack.pop(), npc = this._npc(stack.pop()); stack.push(yield { type: 'addDex', npc, n }); break; }
        case OP.SELECT_OBJECT: { stack.push(yield { type: 'selectObject' }); break; }

        default:
          // literal operand (an opcode byte used as a constant) — push raw, like source.
          stack.push(op);
      }
    }
    return stack.length ? stack[0] : 0;
  }

  // ===================================================== expand() ============
  // $/# variable substitution (VM-owned, since VarStr/VarInt are VM state). Markup
  // (@highlight, <>runic, /\ plural, && translate) is passed through for the
  // renderer. research_i13_conversation_vm.md §Variables.
  expand(text) {
    if (!text) return text;
    // $<letter> / $<digit> — string variable. Longest single token after '$'.
    let out = text.replace(/\$([A-Za-z0-9])/g, (m, ch) => {
      const v = this.VarStr[varIndex(ch)];
      return v !== undefined && v !== '' ? v : m;
    });
    // #<digits> — integer variable (decimal index for scratch #0..#9; letters via #<L>).
    out = out.replace(/#([A-Za-z0-9])/g, (m, ch) => {
      const v = this.VarInt[varIndex(ch)];
      return v !== undefined ? String(v) : m;
    });
    return out;
  }
}
