"""u6.converse -- the dialogue subsystem: the TalkBuf bytecode VM + its faithful
decoder (u6_conversation), the offline disassembler (u6_script_disasm), highlight
extraction and the converse-local opcode tables. Self-contained; registers its
two tools on the shared mcp.
"""

import re
import types

from u6.constants import *  # noqa: F401,F403
from u6.ctx import *        # noqa: F401,F403  -- mcp, S, _ds, _session_base, _rd*, inp, dm, ...
from u6.decode import *     # noqa: F401,F403  -- _tile_name / object names


class _DecoderStop(Exception):
    def __init__(self, op, pc):
        super().__init__(f"unhandled converse opcode 0x{op:02x} at TalkBuf+{pc}")
        self.op, self.pc = op, pc


# Statement-level side-effect ops -> how many parse_factor operand expressions to
# consume (we don't execute the effect, just skip its operands). seg_1703.c:808+.
_CV_SIDE_EFFECT = {
    0xa4: 2, 0xa5: 2,            # SET / CLR (npc, bit)
    0xb9: 4, 0xba: 4,            # GIVEOBJ / TAKEOBJ (npc, obj, qual, qty)
    0xc8: 2, 0xc9: 4,            # MOVEOBJ / TRANSFEROBJ
    0xc4: 1, 0xc5: 1,            # ADDKARMA / SUBKARMA
    0xcd: 2,                     # SETMODE
    0xd6: 1, 0xd9: 1, 0xdb: 1,   # RESURRECT / HEAL / CURE
    0x9c: 1, 0xd0: 1,            # GETHORSE / DELAY
    0xbe: 1, 0xbf: 1,            # SHOW_INVENTORY / SHOW_CONVERSE
    0xd8: 1, 0xdf: 1,            # D8 / DF ($Y := npc name)
}


def _cv_str_match(keyword, inp, n):
    """str_i_compare (seg_1703.c:130): any space-separated word of `inp` has
    `keyword` (first n chars, '?' = wildcard) as a case-insensitive prefix."""
    for word in str(inp).split(" "):
        if not word:
            continue
        ok = True
        for i in range(n):
            k = keyword[i] if i < len(keyword) else ""
            if k == "?":
                continue
            if i >= len(word) or word[i].lower() != k.lower():
                ok = False
                break
        if ok:
            return True
    return False


class _ConverseVM:
    """Read-only decoder over a TalkBuf byte image. `env` supplies live state:
    env.npc (interlocutor, for OP_NPC self), env.varint(i)/env.varstr(i), and
    env.query(kind, **kw) for world reads (flag/owns/inParty/poisoned/objType/...)."""
    END_OF_FACTOR, LET_VALUE = 0xa7, 0xa8
    IF, ENDIF, ELSE = 0xa1, 0xa2, 0xa3
    GOTO, CALL, VARINT, VARSTR, B4, PRINTSTR, LEAVE = 0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6
    LET, ADDRESS, BYTE, WORD, D5, RND = 0xa6, 0xd2, 0xd3, 0xd4, 0xd5, 0xa0
    KEY, RES, ENDRES, NPC = 0xef, 0xf6, 0xee, 0xeb

    def __init__(self, data, env):
        self.d = data
        self.n = len(data)
        self.env = env
        self.pc = 0
        self.budget = 20000          # byte-read guard against runaway GOTO loops

    # --- byte readers ---
    def _u8(self):
        self.budget -= 1
        if self.budget < 0:
            raise _DecoderStop(0xff, self.pc)
        v = self.d[self.pc] if 0 <= self.pc < self.n else 0
        self.pc += 1
        return v

    def _u16(self):
        v = self._u8(); return v | (self._u8() << 8)

    def _u32(self):
        v = self._u16(); return v | (self._u16() << 16)

    def _npc(self, x):
        return self.env.npc if x == self.NPC else x

    # --- parse_factor (seg_1703.c:295): RPN; returns (value, nondeterministic) ---
    def evaluate(self):
        st, nd = [], False
        pop = lambda: st.pop() if st else 0
        while self.pc < self.n:
            op = self._u8()
            if op in (self.END_OF_FACTOR, self.LET_VALUE):
                break
            if op == self.ADDRESS:   st.append(self._u32())
            elif op == self.BYTE:    st.append(self._u8())
            elif op == self.WORD:    st.append(self._u16())
            elif op == self.VARINT:  st.append(self.env.varint(pop()))
            elif op == self.VARSTR:  st.append(self.env.varstr(pop()))
            elif op == 0x90: b, a = pop(), pop(); st.append(a + b)
            elif op == 0x91: b, a = pop(), pop(); st.append(a - b)
            elif op == 0x92: b, a = pop(), pop(); st.append(a * b)
            elif op == 0x93: b, a = pop(), pop(); st.append(a // b if b else 0)
            elif op == 0x94: b, a = pop(), pop(); st.append(1 if (a or b) else 0)
            elif op == 0x95: b, a = pop(), pop(); st.append(1 if (a and b) else 0)
            elif op == 0x86: b, a = pop(), pop(); st.append(1 if str(a).lower() == str(b).lower() else 0)
            elif op == 0x85: b, a = pop(), pop(); st.append(1 if a != b else 0)
            elif op == 0x81: b, a = pop(), pop(); st.append(1 if a > b else 0)
            elif op == 0x82: b, a = pop(), pop(); st.append(1 if a >= b else 0)
            elif op == 0x83: b, a = pop(), pop(); st.append(1 if a < b else 0)
            elif op == 0x84: b, a = pop(), pop(); st.append(1 if a <= b else 0)
            elif op == self.RND:
                pop(); pop(); st.append(0); nd = True          # can't predict -> nondeterministic
            elif op == 0xab:  # TST (npc, bit) -> flag
                bit = pop(); npc = self._npc(pop()); st.append(self.env.query("flag", npc=npc, bit=bit))
            elif op == 0x9f:  # OWNS (npc, obj, qual)
                q = pop(); o = pop(); npc = self._npc(pop()); st.append(self.env.query("owns", npc=npc, obj=o, qual=q))
            elif op == 0xbb:  # TEST_OBJ (npc, obj)
                o = pop(); npc = self._npc(pop()); st.append(self.env.query("owns", npc=npc, obj=o, qual=0))
            elif op == 0xc7:  # WHOSGOT (obj, qual)
                q = pop(); o = pop(); st.append(self.env.query("whosgot", obj=o, qual=q))
            elif op == 0xc6:  # ISINPARTY (npc)
                st.append(self.env.query("inparty", npc=self._npc(pop())))
            elif op == 0xdc:  # POISONNED (npc)
                st.append(self.env.query("poisoned", npc=self._npc(pop())))
            elif op == 0x9d:  # HORSED (npc)
                st.append(self.env.query("ishorse", npc=self._npc(pop())))
            elif op == 0xc2:  # OBJTYPE (obj slot)
                st.append(self.env.query("objtype", obj=pop()))
            elif op == 0xc1:  # OWNER (obj slot) -> holder
                st.append(self.env.query("owner", obj=pop()))
            elif op in (0xda, 0x9a, 0x9b, 0xd7, 0xdd, 0xc0):
                # WOUNDED/CANCARRY/WEIGHT/ISONSCREEN/partyMember/SELECT_OBJECT:
                # known but not resolved here -> treat the result as unknown so any
                # gating IF shows BOTH branches (never a wrong single read).
                for _ in range(1 if op in (0xda, 0x9a, 0xd7, 0xc0) else 2):
                    pop()
                st.append(0); nd = True
            else:
                # parse_factor default (seg_1703.c:314-322): a byte that is neither a
                # tagged literal (ADDRESS/BYTE/WORD) nor a recognized operator is
                # pushed as a LITERAL value (the engine's `default: lstack[sidx]=opcode`
                # then `sidx++`; its operator switch has NO default, so it never stops
                # here). e.g. a bare 0x00 -> push 0 (SET self 0 reveals the NPC name).
                st.append(op)
        return (st[0] if st else 0), nd

    def _skip_factor(self):
        self.evaluate()

    # --- follow an OP_ADDRESS table ref to its string (seg_1703.c:688) ---
    def _follow_addr_string(self):
        target = self._u32()
        if self.pc < self.n and self.d[self.pc] == self.CALL:
            self.pc += 1
            ret = self.pc
        else:
            idx, _nd = self.evaluate()
            ret = self.pc
            self.pc = target
            n = idx
            while n > 0 and self.pc < self.n:      # skip `idx` NUL-terminated strings
                if self._u8() == 0:
                    n -= 1
            target = self.pc
        self.pc = target
        s = bytearray()
        while self.pc < self.n:
            c = self._u8()
            if c == 0:
                break
            s.append(c)
        self.pc = ret
        return s.decode("latin-1", "replace")

    # --- OP_PRINTSTR (seg_1703.c:729) ---
    def _printstr(self):
        tag = self._u8()
        if tag == self.ADDRESS:
            return self._follow_addr_string()
        if tag != self.D5:
            di = self._u8()
            if self._u8() != self.VARSTR:
                return ""
            return self.env.varstr(di)
        return ""

    # --- parse_statement (seg_1703.c:945): decode a block of text + control,
    # stopping (peek, not consume) at any op in `stops` or a structural terminator.
    def decode_block(self, stops, depth=0, follow_goto=True):
        if depth > 40:
            raise _DecoderStop(self.IF, self.pc)
        out = []
        while self.pc < self.n:
            op = self.d[self.pc]
            if op == 0 or op == self.ENDRES or op == self.KEY or op >= 0xf0 or op in stops:
                break
            self.pc += 1
            if op < 0x80:                                  # raw inline ASCII text
                out.append(chr(op))
            elif op == self.PRINTSTR:
                out.append(self._printstr())
            elif op == self.LEAVE:
                break
            elif op == self.GOTO:
                tgt = self._u32()
                if follow_goto:                            # follow for real response text;
                    self.pc = tgt                          # don't follow when scanning the
                                                           # keyword table (stay linear)
            elif op == self.IF:
                _val, nd = self.evaluate()
                ta = self.decode_block({self.ELSE, self.ENDIF}, depth + 1, follow_goto)
                tb = ""
                if self.pc < self.n and self.d[self.pc] == self.ELSE:
                    self.pc += 1
                    tb = self.decode_block({self.ENDIF}, depth + 1, follow_goto)
                if self.pc < self.n and self.d[self.pc] == self.ENDIF:
                    self.pc += 1
                if nd:
                    out.append(f"[either: «{ta.strip()}»" + (f" | «{tb.strip()}»]" if tb.strip() else "]"))
                else:
                    out.append(ta if _val else tb)
            elif op in (self.ENDIF, self.ELSE):
                pass                                        # stray (outside an IF) -> no-op
            elif op == self.LET:
                self._let()
            elif op in _CV_SIDE_EFFECT:
                for _ in range(_CV_SIDE_EFFECT[op]):
                    self._skip_factor()
            elif op in (0x9e, 0xa7, 0xcb):                  # 0-operand no-op statements
                pass                                        # REST / stray END_OF_FACTOR /
                                                            # WAIT (a key-pause; execute_op
                                                            # seg_1703.c: break, no text)
            else:
                raise _DecoderStop(op, self.pc - 1)
        return "".join(out)

    def _let(self):
        di = self._u8()
        if di == self.ADDRESS:                              # var-cell / list-element dest
            self.pc += 4
            if self.pc < self.n and self.d[self.pc] == self.LET_VALUE:
                self.pc += 1                                # optional leading LET_VALUE
            self._skip_factor()                             # value factor(s): an a8-separated
            guard = 0                                       # chain -- list-element LET is
            while (0 < self.pc <= self.n and guard < 8      # `@a[idx] a8 @b[idx] a7`; the old
                   and self.d[self.pc - 1] == self.LET_VALUE):  # 1-factor read DECODER_STOPped
                guard += 1
                self._skip_factor()
            return
        kind = self._u8()
        if self._u8() != self.LET_VALUE:
            return
        if kind == self.VARINT:
            self._skip_factor()
        else:                                               # string assignment
            tag = self._u8()
            if tag == self.ADDRESS:
                self._follow_addr_string()
            elif self.pc < self.n and self.d[self.pc] == self.VARSTR:
                self.pc += 1

    # --- keyword headers at an ASK: OP_KEY <kw[,kw...]> OP_RES <body> ... (C_1703_1D01) ---
    def keyword_list(self):
        kws, guard = [], 0
        while self.pc < self.n and guard < 64:
            guard += 1
            op = self._u8()
            if op != self.KEY:
                self.pc -= 1
                if op == self.ENDRES or op >= 0xf0 or op == 0:
                    break
                # not a keyword section here -> stop scanning
                break
            # read comma-separated keyword(s) until OP_RES
            while True:
                kw = bytearray()
                c = self._u8()
                while c not in (0x2c, self.RES) and self.pc <= self.n:
                    kw.append(c)
                    c = self._u8()
                k = kw.decode("latin-1", "replace")
                kws.append("(anything)" if k == "*" else k)
                if c != 0x2c:
                    break
            # skip the response body to the next KEY/ENDRES/structural
            self._skip_body()
        return kws

    def _skip_body(self):
        """Skip a keyword's response body to the next KEY/ENDRES/structural, WITHOUT
        following GOTOs (stay linear within the keyword table). Uses the full
        decode_block parser so every opcode's operands are consumed correctly -- a
        hand-rolled length table (the old version) desynced on ADDRESS/PRINTSTR/IF/
        side-effect factors and lost the keywords after the first complex body."""
        self.decode_block(set(), follow_goto=False)

    def find_response(self, input_word):
        """Scan OP_KEY sections from self.pc; return True (pc at the matching OP_RES
        body) if a keyword matches `input_word` (or '*'), else False."""
        inp = input_word or "bye"
        guard = 0
        while self.pc < self.n and guard < 64:
            guard += 1
            if self._u8() != self.KEY:
                self.pc -= 1
                return False
            matched = False
            while True:
                kw = bytearray()
                c = self._u8()
                while c not in (0x2c, self.RES):
                    kw.append(c)
                    c = self._u8()
                k = kw.decode("latin-1", "replace")
                if k and (k[0] == "*" or _cv_str_match(k, inp, len(k))):
                    matched = True
                if c != 0x2c:
                    break
            if matched:
                if self.d[self.pc - 1] != self.RES:        # consume up to RES
                    while self._u8() != self.RES:
                        pass
                return True
            self._skip_body()
        return False


def _make_converse_env(base_addr, npc_id):
    """Live `env` for _ConverseVM: reads VarInt/VarStr/TalkFlags + party/inventory/
    status from DOSBox memory to evaluate conditions and variable strings."""
    cache = {}

    def _objarr():
        if "obj" not in cache:
            cache["obj"] = (dm.read(S.handle, base_addr + U6_ObjStatus, U6_MAX_SLOTS),
                            dm.read(S.handle, base_addr + U6_ObjPos, U6_MAX_SLOTS * 3),
                            dm.read(S.handle, base_addr + U6_ObjShapeType, U6_MAX_SLOTS * 2))
        return cache["obj"]

    def varint(i):
        if not 0 <= i < 36:
            return 0
        return int.from_bytes(dm.read(S.handle, base_addr + U6_VarInt + i * 2, 2), "little", signed=True)

    def varstr(i):
        if not 0 <= i < 36:
            return ""
        off = int.from_bytes(dm.read(S.handle, base_addr + U6_VarStr + i * 2, 2), "little")
        if off == 0:
            return ""
        raw = dm.read(S.handle, base_addr + off, 64)
        return raw.split(b"\x00", 1)[0].decode("latin-1", "replace")

    def _owns(npc, obj, qual):
        status, pos, shape = _objarr()
        for i in range(1, U6_MAX_SLOTS):
            if (status[i] & 0x18) not in (0x10, 0x18):        # INVEN / EQUIP
                continue
            if (pos[i * 3] | (pos[i * 3 + 1] << 8)) != npc:   # assoc holder
                continue
            if ((shape[i * 2] | (shape[i * 2 + 1] << 8)) & 0x3ff) == obj:
                return 1
        return 0

    def query(kind, **kw):
        try:
            if kind == "flag":
                b = dm.read(S.handle, base_addr + U6_TalkFlags + kw["npc"], 1)[0]
                return (b >> kw["bit"]) & 1
            if kind == "owns":
                return _owns(kw["npc"], kw["obj"], kw.get("qual", 0))
            if kind == "whosgot":
                psize = dm.read(S.handle, base_addr + U6_PartySize, 1)[0]
                party = dm.read(S.handle, base_addr + U6_Party, max(psize, 0) + 1)
                for k in range(min(psize, 16)):
                    if _owns(party[k], kw["obj"], kw.get("qual", 0)):
                        return party[k]
                return 0x8001
            if kind == "inparty":
                psize = dm.read(S.handle, base_addr + U6_PartySize, 1)[0]
                party = dm.read(S.handle, base_addr + U6_Party, max(psize, 0) + 1)
                return 1 if kw["npc"] in party[:max(psize, 0)] else 0
            if kind == "poisoned":
                return 1 if (dm.read(S.handle, base_addr + U6_NPCStatus + kw["npc"], 1)[0] & POISONED_BIT) else 0
            if kind == "ishorse":
                _s, _p, shape = _objarr()
                n = kw["npc"]
                return 1 if ((shape[n * 2] | (shape[n * 2 + 1] << 8)) & 0x3ff) == OBJ_HORSE else 0
            if kind == "objtype":
                _s, _p, shape = _objarr()
                o = kw["obj"]
                return (shape[o * 2] | (shape[o * 2 + 1] << 8)) & 0x3ff
            if kind == "owner":
                _s, pos, _sh = _objarr()
                o = kw["obj"]
                return pos[o * 3] | (pos[o * 3 + 1] << 8)
        except (OSError, IndexError):
            return 0
        return 0

    return types.SimpleNamespace(npc=npc_id, varint=varint, varstr=varstr, query=query)


def _expand_vars(text, env):
    """Substitute $X (string) / #X (int) converse vars; pass markup through."""
    import re
    text = re.sub(r"\$([A-Za-z0-9])", lambda m: env.varstr(_cv_var_index(m.group(1))) or m.group(0), text)
    text = re.sub(r"#([A-Za-z0-9])", lambda m: str(env.varint(_cv_var_index(m.group(1)))), text)
    return text


def _cv_var_index(ch):
    c = ord(ch)
    return c - 0x30 if 0x30 <= c <= 0x39 else c - 0x37   # '0'-'9'->0-9, 'A'-'Z'->10-35


# U6 marks a highlighted conversation keyword inline as '@word': CON_putch
# (seg_0C9C.c:1880-1888) switches to the highlight colour at '@' and restores it at
# the next word-terminator, CONSUMING the '@'. Those highlighted words are exactly
# the on-screen cues for what to ask next, so we strip the '@' from the prose and
# return the words. Terminator set is the engine's own strchr(" ,.:;!?'-\"\n").
_HL_TERMINATORS = set(" ,.:;!?'-\"\n")


def _extract_highlights(text):
    """Strip U6 '@' highlight markers; return (clean_prose, [highlighted words]).
    A highlighted word runs from just after '@' to the next terminator; an '@' right
    before a terminator highlights nothing (just drops the '@'). Words are de-duped
    case-insensitively, first-seen order (a cue list, not every occurrence)."""
    out, words, seen, i, n = [], [], set(), 0, len(text)
    while i < n:
        if text[i] == "@":
            i += 1
            w = []
            while i < n and text[i] not in _HL_TERMINATORS:
                w.append(text[i]); i += 1
            out.extend(w)                       # keep the word in prose, sans '@'
            word = "".join(w)
            if word and word.lower() not in seen:
                seen.add(word.lower()); words.append(word)
        else:
            out.append(text[i]); i += 1
    return "".join(out), words


def _decode_conversation(base_addr, keyword):
    """Read live talk state + TalkBuf and decode the greeting (or the response to
    `keyword`) + the askable keyword list. Returns a dict (or {'status':...})."""
    active = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
    interloc = int.from_bytes(dm.read(S.handle, base_addr + U6_TalkInterloc, 2), "little")
    pc = int.from_bytes(dm.read(S.handle, base_addr + U6_Talk_PC, 2), "little")
    inp = dm.read(S.handle, base_addr + U6_TalkInput, 0x32).split(b"\x00", 1)[0].decode("latin-1", "replace")
    name_raw = dm.read(S.handle, base_addr + U6_NpcName, 50)
    fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
    name_b = bytearray()
    for b in name_raw:
        if b == 0 or (b & 0x80):
            break
        name_b.append(b)
    name = name_b.decode("latin-1", "replace")
    tb_lin = (((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8)))
    data = dm.read(S.handle, S.membase + tb_lin, U6_TalkBuf_SIZE)
    env = _make_converse_env(base_addr, interloc)
    res = {"active": active, "npc": name, "npc_num": interloc, "pc": pc, "last_input": inp}

    op_at = data[pc] if 0 <= pc < len(data) else 0
    res["prompt"] = _TALK_INPUT_OPS.get(op_at, f"op_0x{op_at:02x}")

    vm = _ConverseVM(data, env)
    try:
        # Walk the FIXED intro (OP_ID -> DESC -> MAIN/PREFIX -> greeting) to the
        # keyword table. This anchor is independent of the live Talk_PC, so the
        # askable keywords AND any keyword's response are readable from ANY VM state
        # -- the fresh prompt, a mid-response page-pause, or parked on another
        # keyword -- which is what lets the agent collect the story by asking topics.
        vm.pc = 0
        if vm.pc < vm.n and data[vm.pc] == 0xff:      # OP_ID
            vm.pc += 1
        vm._u8()                                       # npcId
        while vm.pc < vm.n and data[vm.pc] != 0xf1:    # to OP_DESC
            vm.pc += 1
        while vm.pc < vm.n and vm._u8() != 0xf1:       # past OP_DESC
            pass
        desc = vm.decode_block({})                     # "You see ..." description
        while vm.pc < vm.n:                            # past OP_MAIN / OP_PREFIX run
            c = vm._u8()
            if c in (0xf2, 0xf3):
                while vm.pc < vm.n and data[vm.pc] in (0xf2, 0xf3):
                    vm.pc += 1
                break
        greet = vm.decode_block({}) if (vm.pc < vm.n and data[vm.pc] != 0xf7) else ""
        if vm.pc < vm.n and data[vm.pc] == 0xf7:       # skip OP_ASKTOP -> first OP_KEY
            vm.pc += 1
        kw_anchor = vm.pc                              # start of the keyword table

        if keyword:                                    # preview the response to `keyword`
            vm.pc = kw_anchor
            if vm.find_response(keyword):
                res["said"] = _expand_vars(vm.decode_block({}).strip(), env)
            else:
                res["said"] = f"(no keyword section matches {keyword!r})"
        else:
            res["said"] = _expand_vars((("You see " + desc).strip() + "\n" + greet.strip()).strip(), env)
        # keyword list: scan ALL OP_KEY sections from the table anchor (NOT live pc)
        kvm = _ConverseVM(data, env); kvm.pc = kw_anchor
        res["keywords"] = kvm.keyword_list()
        if "said" in res:                              # strip '@' markup, collect the cues
            res["said"], res["highlighted"] = _extract_highlights(res["said"])
        res["status"] = "OK"
    except _DecoderStop as st:
        res["status"] = "DECODER_STOP"
        res["stop"] = str(st)
        lo = max(0, st.pc - 4)
        res["hex"] = " ".join(f"{b:02x}" for b in data[lo:st.pc + 12])
    return res


# ----------------------------------------------------------------------------
# Full script disassembler -- decode an NPC's WHOLE TalkBuf into an addressed,
# assembly-like listing (every opcode in address order, operands resolved, GOTO
# labels, keyword blocks, IF/factor expressions, side-effects, '??? 0xNN' for an
# unknown opcode). The agent's structural/reference view of a script: the "what"
# (which keyword gives what, which flag gates what, a copy-protection answer
# key). The agent owns the "how" -- see the rule of engagement in u6_ai_agent.md:
# a manual-lookup/copy-protection answer may be read here directly, but a game
# PUZZLE must be solved by playing, not lifted from the disassembly. Unlike
# decode_block this walks LINEARLY (no control-flow following). seg_1703.c.
# ----------------------------------------------------------------------------
_DIS_BINOP = {0x90: "+", 0x91: "-", 0x92: "*", 0x93: "/", 0x94: "||", 0x95: "&&",
              0x81: ">", 0x82: ">=", 0x83: "<", 0x84: "<=", 0x85: "!=", 0x86: "=="}
_DIS_QUERY = {                                  # parse_factor query op -> (name, argc)
    0xa0: ("Rand", 2), 0xab: ("Flag", 2), 0x9f: ("Owns", 3), 0xbb: ("HasObj", 2),
    0xc7: ("WhosGot", 2), 0xc6: ("InParty", 1), 0xdc: ("Poisoned", 1),
    0x9d: ("Horsed", 1), 0xc2: ("ObjType", 1), 0xc1: ("Owner", 1), 0xda: ("Wounded", 1),
    0xd7: ("OnScreen", 1), 0x9a: ("CanCarry", 1), 0xca: ("Join", 1), 0xcc: ("LeaveParty", 1),
}
_DIS_STMT = {                                   # side-effect opcode -> mnemonic
    0xa4: "SET", 0xa5: "CLR", 0xb9: "GIVEOBJ", 0xba: "TAKEOBJ", 0xc8: "MOVEOBJ",
    0xc9: "TRANSFEROBJ", 0xc4: "ADDKARMA", 0xc5: "SUBKARMA", 0xcd: "SETMODE",
    0xd6: "RESURRECT", 0xd9: "HEAL", 0xdb: "CURE", 0x9c: "GETHORSE", 0xd0: "DELAY",
    0xbe: "SHOWINVEN", 0xbf: "SHOWPORTRAIT", 0xd8: "SETNAME", 0xdf: "SETNAME2",
}
_DIS_MARK = {                                   # 0-operand structural / control markers
    0xf1: "DESC", 0xf2: "MAIN", 0xf3: "PREFIX", 0xf7: "ASKTOP", 0xee: "ENDRES",
    0xf6: "RES", 0xa2: "ENDIF", 0xa3: "ELSE", 0xb6: "LEAVE", 0xcb: "WAIT", 0x9e: "REST",
    0xf8: "GET",                                 # GET's permitted-keys string renders as text
    0xa7: "(eof)",                               # stray END_OF_FACTOR -> VM no-op (decode_block)
    # NOTE: GETSTR/GETCHR/GETINT/GETDIGIT (0xf9-0xfc) are NOT here -- they carry a
    # <idx><b2/b3> var operand and are handled explicitly in _disassemble.
}


def _disasm_factor(d, pc):
    """Decode a parse_factor RPN expression to a readable infix string. Returns
    (expr, pc_after). Mirrors _ConverseVM.evaluate but builds text; an
    unrecognized byte is a literal (the engine's default -- seg_1703.c:319)."""
    n = len(d); st = []
    pop = lambda: st.pop() if st else "?"
    guard = 0
    while pc < n and guard < 256:
        guard += 1
        op = d[pc]; pc += 1
        if op in (0xa7, 0xa8):                  # END_OF_FACTOR / LET_VALUE
            break
        if op == 0xd2:                          # ADDRESS
            st.append(f"@0x{int.from_bytes(d[pc:pc+4],'little'):04x}"); pc += 4
        elif op == 0xd3:                        # BYTE
            b = d[pc] if pc < n else 0; pc += 1; st.append("self" if b == 0xeb else str(b))
        elif op == 0xd4:                        # WORD
            st.append(str(int.from_bytes(d[pc:pc+2], 'little'))); pc += 2
        elif op == 0xb2:                        # VARINT
            st.append(f"VarInt[{pop()}]")
        elif op == 0xb3:                        # VARSTR
            st.append(f"VarStr[{pop()}]")
        elif op in _DIS_BINOP:
            b = pop(); a = pop(); st.append(f"({a} {_DIS_BINOP[op]} {b})")
        elif op in _DIS_QUERY:
            name, ac = _DIS_QUERY[op]
            args = [pop() for _ in range(ac)][::-1]
            st.append(f"{name}({', '.join(args)})")
        else:
            st.append(str(op))                  # bare literal
    return (st[-1] if st else "0"), pc


def _disasm_let(d, pc):
    """OP_LET -> 'LET <dest> = <expr>' (seg_1703.c:746)."""
    n = len(d)
    di = d[pc] if pc < n else 0; pc += 1
    if di == 0xd2:                              # ADDRESS dest (var cell / list element)
        a = int.from_bytes(d[pc:pc+4], "little"); pc += 4
        if pc < n and d[pc] == 0xa8: pc += 1
        expr, pc = _disasm_factor(d, pc)         # value factor(s): an a8-separated chain
        parts, guard = [expr], 0                 # (list-element LET: <idx> a8 <val> a7)
        while 0 < pc <= n and d[pc - 1] == 0xa8 and guard < 8:
            guard += 1
            e2, pc = _disasm_factor(d, pc); parts.append(e2)
        rhs = f"[{parts[0]}] = {parts[1]}" if len(parts) == 2 else "= " + " | ".join(parts)
        return f"LET @0x{a:04x}{rhs}", pc
    kind = d[pc] if pc < n else 0; pc += 1       # VARINT (0xb2) / VARSTR (0xb3)
    if pc < n and d[pc] == 0xa8: pc += 1         # LET_VALUE
    if kind == 0xb2:
        expr, pc = _disasm_factor(d, pc)
        return f"LET VarInt[{di}] = {expr}", pc
    tag = d[pc] if pc < n else 0; pc += 1        # string assignment
    if tag == 0xd2:                              # = @addr[index] (string-list ref)
        a = int.from_bytes(d[pc:pc+4], "little"); pc += 4
        if pc < n and d[pc] == 0xb1:             # CALL -> direct ref
            return f"LET VarStr[{di}] = @0x{a:04x}", pc + 1
        idx, pc = _disasm_factor(d, pc)          # index factor selects the Nth string
        return f"LET VarStr[{di}] = @0x{a:04x}[{idx}]", pc
    if pc < n and d[pc] == 0xb3: pc += 1
    return f"LET VarStr[{di}] = VarStr[?]", pc


def _disasm_printstr(d, pc):
    """OP_PRINTSTR -> 'PRINTSTR @addr[index]' / VarStr (seg_1703.c:729)."""
    n = len(d)
    tag = d[pc] if pc < n else 0; pc += 1
    if tag == 0xd2:                              # ADDRESS -> string-list
        a = int.from_bytes(d[pc:pc+4], "little"); pc += 4
        if pc < n and d[pc] == 0xb1:             # CALL -> direct ref
            return f"PRINTSTR @0x{a:04x}", pc + 1
        idx, pc = _disasm_factor(d, pc)          # index factor selects the Nth string
        return f"PRINTSTR @0x{a:04x}[{idx}]", pc
    if tag != 0xd5:                              # VarStr form: di + checked byte
        di = d[pc] if pc < n else 0; pc += 2
        return f"PRINTSTR VarStr[{di}]", pc
    return "PRINTSTR", pc


def _disassemble(d, n):
    """Linear disassembly of the first `n` bytes of a TalkBuf image. Text runs
    render as quoted strings; GOTO targets become L_xxxx labels; an unknown
    opcode is flagged '??? 0xNN' (not fatal). Stops at >=16 zero bytes (end)."""
    lines, labels, pc = [], set(), 0
    while pc < n:
        if pc + 16 <= n and not any(d[pc:pc + 16]):     # zero padding -> end of script
            break
        addr = pc
        op = d[pc]
        if op < 0x80:                                   # inline ASCII text run
            s = bytearray()
            while pc < n and d[pc] and d[pc] < 0x80:
                s.append(d[pc]); pc += 1
            if pc < n and d[pc] == 0:                    # NUL between strings
                pc += 1
            lines.append((addr, '"' + s.decode("latin-1", "replace").replace("\n", "\\n") + '"'))
            continue
        pc += 1
        if op == 0xff:                                  # OP_ID + npcId
            npc = d[pc] if pc < n else 0; pc += 1
            lines.append((addr, f"ID npc={npc}"))
        elif op in _DIS_MARK:
            lines.append((addr, _DIS_MARK[op]))
        elif op == 0xef:                                # KEY <kw,...>  (until RES)
            kw = bytearray()
            while pc < n and d[pc] != 0xf6:
                kw.append(d[pc]); pc += 1
            lines.append((addr, 'KEY "' + kw.decode("latin-1", "replace") + '"'))
        elif op == 0xb0:                                # GOTO u32
            tgt = int.from_bytes(d[pc:pc + 4], "little"); pc += 4
            labels.add(tgt); lines.append((addr, f"GOTO L_{tgt:04x}"))
        elif op == 0xa1:                                # IF <factor>
            expr, pc = _disasm_factor(d, pc); lines.append((addr, f"IF {expr}"))
        elif op == 0xa6:                                # LET
            text, pc = _disasm_let(d, pc); lines.append((addr, text))
        elif op in _CV_SIDE_EFFECT:                     # SET/GIVEOBJ/HEAL/... <factors>
            args = []
            for _ in range(_CV_SIDE_EFFECT[op]):
                e, pc = _disasm_factor(d, pc); args.append(e)
            mn = _DIS_STMT.get(op, f"OP_{op:02x}")
            cmt = f"   ; obj 0x{int(args[1]):02x}" if op in (0xb9, 0xba) and args[1].isdigit() else ""
            lines.append((addr, f"{mn} {', '.join(args)}{cmt}"))
        elif op == 0xb5:                                # PRINTSTR @addr[index] / VarStr
            text, pc = _disasm_printstr(d, pc)
            lines.append((addr, text))
        elif op in (0xf9, 0xfa, 0xfb, 0xfc):            # GET* var input: <idx><b2/b3>
            idx = d[pc] if pc < n else 0; pc += 1
            if pc < n and d[pc] in (0xb2, 0xb3): pc += 1
            nm = {0xf9: "GETSTR", 0xfa: "GETCHR", 0xfb: "GETINT", 0xfc: "GETDIGIT"}[op]
            lines.append((addr, f"{nm} Var[{idx}]"))
        else:
            lines.append((addr, f"??? 0x{op:02x}"))
    out, starts = [], {a for a, _ in lines}
    for addr, text in lines:
        if addr in labels:
            out.append(f"L_{addr:04x}:")
        out.append(f"  0x{addr:04x}: {text}")
    for t in sorted(labels - starts):                   # jump into a mid-instruction byte
        out.append(f"; note: L_{t:04x} targets mid-instruction byte 0x{t:04x}")
    return "\n".join(out)


@mcp.tool()
def u6_script_disasm(segment: int = -1, max_bytes: int = 4096) -> str:
    """Ultima VI: disassemble the CURRENTLY-LOADED NPC conversation script (the live
    TalkBuf) into an addressed, assembly-like listing -- every opcode with operands,
    GOTO labels, keyword (KEY/RES) blocks, IF/factor expressions, side-effects
    (SET/GIVEOBJ/HEAL/...), and an inline '??? 0xNN' for any unknown opcode. The
    agent's full structural view of a script: which keyword gives which object, which
    flag gates which branch, a copy-protection answer key, etc. A conversation must be
    OPEN (talk to the NPC first) so its script is in TalkBuf. RULE OF ENGAGEMENT:
    reading the script is allowed, but you may answer a manual-lookup / copy-protection
    prompt directly ONLY; a game PUZZLE must be solved by playing, never lifted from
    here -- and say which you are doing. DS from u6_hook unless overridden with
    segment=. max_bytes caps the window (default 4096; the buffer is 0x2800)."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        active = dm.read(S.handle, base_addr + U6_IsInConversation, 1)[0]
        fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
        tb_lin = (((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8)))
        n = max(1, min(int(max_bytes), U6_TalkBuf_SIZE))
        data = dm.read(S.handle, S.membase + tb_lin, n)
    except OSError as ex:
        return f"Read failed reading TalkBuf (DS=0x{ds:04x}): {ex}"
    head = ("" if active else "(no conversation open -- TalkBuf may be stale; "
            "talk to an NPC first)\n")
    return head + _disassemble(data, len(data))


@mcp.tool()
def u6_conversation(keyword: str = "", raw: int = 0, segment: int = -1) -> str:
    """Ultima VI: read the live conversation as READABLE dialogue. With no args it
    returns the NPC, the greeting (decoded from TalkBuf), the prompt type, the
    askable keywords, and the HIGHLIGHTED words -- the '@'-marked cues U6 draws in a
    bright colour, i.e. exactly what an on-screen player would see as "ask me about
    this" (the prose is returned clean, with the '@' stripped). Pass
    keyword="gargoyle" to preview that keyword's response (decoded ahead of the
    prompt -- so the agent reads it before committing with u6_say). Conditions
    (flags/inventory/party/status) are evaluated against live
    memory; random-flavor branches show as [either: A | B]; an UNKNOWN opcode
    returns status=DECODER_STOP -- the agent MUST halt and report it (don't guess).

    `raw=1` appends the old hex window of TalkBuf from Talk_PC (for debugging). DS
    from u6_hook unless overridden with segment=."""
    if S.membase is None:
        return dm.HINT_NO_MEMBASE
    ds, err = _ds(segment)
    if err:
        return err
    base_addr = S.membase + (ds << 4)
    try:
        r = _decode_conversation(base_addr, keyword.strip())
    except OSError as ex:
        return f"Read failed reading talk-engine state (DS=0x{ds:04x}): {ex}"

    if not r["active"]:
        head = "IsInConversation = 0 (idle -- no conversation open)"
    else:
        head = f"NPC = {r['npc']!r} (#{r['npc_num']})   prompt = {r['prompt']}"
    out = [head]
    if r.get("status") == "DECODER_STOP":
        out += [f"** DECODER_STOP: {r['stop']} **",
                f"  hex: {r.get('hex','')}",
                "  -> HALT and report: the converse decoder hit an opcode it can't "
                "handle; do not act on partial dialogue."]
        return "\n".join(out)
    if "said" in r:
        out.append(f"said: {r['said']}")
    if r.get("highlighted"):
        out.append("highlighted (ask next): " + ", ".join(r["highlighted"]))
    if r.get("keywords"):
        out.append("keywords: " + ", ".join(r["keywords"]))
    if r.get("last_input"):
        out.append(f"(last input: {r['last_input']!r})")

    if raw:
        pc = r["pc"]
        n = min(64, U6_TalkBuf_SIZE - pc) if 0 <= pc < U6_TalkBuf_SIZE else 0
        if n > 0:
            try:
                fp = dm.read(S.handle, base_addr + U6_TalkBuf_ptr, 4)
                tb_lin = (((fp[2] | (fp[3] << 8)) << 4) + (fp[0] | (fp[1] << 8)))
                window = dm.read(S.handle, S.membase + tb_lin + pc, n)
                out.append(f"raw TalkBuf[Talk_PC..+{n}]: " + " ".join(f"{b:02x}" for b in window))
            except OSError:
                pass
    return "\n".join(out)


__all__ = [
    "_DecoderStop",
    "_CV_SIDE_EFFECT",
    "_cv_str_match",
    "_ConverseVM",
    "_make_converse_env",
    "_expand_vars",
    "_cv_var_index",
    "_HL_TERMINATORS",
    "_extract_highlights",
    "_decode_conversation",
    "_DIS_BINOP",
    "_DIS_QUERY",
    "_DIS_STMT",
    "_DIS_MARK",
    "_disasm_factor",
    "_disasm_let",
    "_disasm_printstr",
    "_disassemble",
    "u6_script_disasm",
    "u6_conversation",
]
