#!/usr/bin/env python3
"""Offline CONVERSE.A/.B decoder + disassembler-validation harness.

Decodes the U6 lib_32 LZW conversation blocks (logic ported verbatim from
ultima6_clone/assets/lzw.js + assets/converse.js) and runs the dosbox-u6
server's OWN `_disassemble()` over each NPC script. This lets us validate
`u6_script_disasm` against the WHOLE conversation corpus offline -- not just
the single NPC whose script happens to be live in TalkBuf under DOSBox.

  * The disassembler under test is imported, not copied: the same
    `dosbox_u6_server._disassemble` the live MCP tool calls.
  * No game data lives in THIS file; it reads the user's own local U6 files.
    The decoded text it writes is copyrighted Origin content, so the output
    directory defaults to OUTSIDE the repo (C:/Z_Temp/tools/dosbox_mcp/
    npc_scripts) -- never committed (BYO-data rule, ultima6_clone/CLAUDE.md).

Usage:
    python u6_converse_decode.py                 # decode all -> per-NPC files + summary
    python u6_converse_decode.py 5               # decode NPC 5 -> stdout + file
    python u6_converse_decode.py "Lord British"  # resolve by name
    python u6_converse_decode.py --data DIR --out DIR
"""
import os
import re
import sys
import types

# ---------------------------------------------------------------------------
# 1. Stub the DOSBox/MCP deps so `dosbox_u6_server` imports with no live game,
#    then pull in the REAL _disassemble (same pattern as tests/test_disasm.py).
# ---------------------------------------------------------------------------
def _import_disassemble():
    dm = types.ModuleType("dosbox_mem")
    dm.read = lambda h, a, n: b"\x00" * n
    dm.Session = type("S", (), {"__init__": lambda s: None})
    dm.register_base_tools = lambda *a: types.SimpleNamespace()
    dm.register_input_tools = lambda *a: types.SimpleNamespace()
    dm.iter_regions = lambda h: []
    dm.HINT_NO_MEMBASE = "x"
    sys.modules["dosbox_mem"] = dm
    di = types.ModuleType("dosbox_input")
    di.register_input_tools = lambda *a: types.SimpleNamespace()
    sys.modules["dosbox_input"] = di
    mf = types.ModuleType("mcp.server.fastmcp")

    class _FastMCP:
        def __init__(s, *a, **k): pass
        def tool(s, *a, **k): return lambda f: f
        def run(s): pass

    mf.FastMCP = _FastMCP
    sys.modules["mcp"] = types.ModuleType("mcp")
    sys.modules["mcp.server"] = types.ModuleType("mcp.server")
    sys.modules["mcp.server.fastmcp"] = mf
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import dosbox_u6_server as u6
    return u6._disassemble


# ---------------------------------------------------------------------------
# 2. LZW + lib_32 decode -- ported verbatim from ultima6_clone/assets/lzw.js
#    and assets/converse.js (the committed, tested clone path).
# ---------------------------------------------------------------------------
def lzw_decode(data, bit_count=8):
    data = bytes(data) + b"\x00\x00\x00"   # pad: JS reads up to 3 bytes (undefined->0)
    CLEAR = 1 << bit_count
    END = CLEAR + 1
    MAX_BITS = 12
    MAX_DICT = 1 << MAX_BITS

    dict_ = [None] * MAX_DICT
    for i in range(CLEAR):
        dict_[i] = (-1, i)                 # (prefix, char)

    bitpos = 0

    def get_code(bits):
        nonlocal bitpos
        bp = bitpos // 8
        shift = bitpos % 8
        value = data[bp] | (data[bp + 1] << 8) | (data[bp + 2] << 16)
        code = (value >> shift) & ((1 << bits) - 1)
        bitpos += bits
        return code

    def get_string(code):
        chars = []
        while code >= 0 and dict_[code] is not None:
            prefix, ch = dict_[code]
            chars.append(ch)
            code = prefix
        chars.reverse()
        return chars

    code_size = bit_count + 1
    out = bytearray()

    prev = get_code(code_size)
    if prev != CLEAR:
        raise ValueError("Invalid LZW stream: missing CLEAR_CODE")
    code_size = bit_count + 1
    next_code = END + 1
    prev = get_code(code_size)
    out.extend(get_string(prev))

    while True:
        curr = get_code(code_size)
        if curr == END:
            break
        if curr == CLEAR:
            dict_ = [None] * MAX_DICT
            for i in range(CLEAR):
                dict_[i] = (-1, i)
            code_size = bit_count + 1
            next_code = END + 1
            prev = get_code(code_size)
            out.extend(get_string(prev))
            continue
        if dict_[curr] is not None:
            chars = get_string(curr)
        else:
            pchars = get_string(prev)
            chars = pchars + [pchars[0]]
        out.extend(chars)
        if next_code < MAX_DICT:
            dict_[next_code] = (prev, chars[0])
            next_code += 1
            if next_code == (1 << code_size) and code_size < MAX_BITS:
                code_size += 1
        prev = curr

    return bytes(out)


def _is_valid_compressed(data):
    if len(data) < 6:
        return False
    if data[3] != 0:
        return False
    uncompressed = data[0] | (data[1] << 8) | (data[2] << 16)
    if uncompressed <= len(data) - 4:
        return False
    return (data[4] | ((data[5] & 1) << 8)) == 0x100


def decompress_compressed_file(data):
    if not _is_valid_compressed(data):
        raise ValueError("Invalid compressed file")
    return lzw_decode(data[4:], 8)


class ConverseLib:
    """One lib_32 file: a uint32 offset table at byte 0 (count = first nonzero
    offset / 4), then per-NPC blocks. 0 offset = no script."""
    def __init__(self, raw):
        self.b = bytes(raw) if raw else b""
        self.count = 0
        if len(self.b) >= 4:
            for i in range(0, len(self.b) - 3, 4):
                o = int.from_bytes(self.b[i:i + 4], "little")
                if o != 0:
                    self.count = o // 4
                    break

    def block(self, index):
        if not self.b or index < 0 or index >= self.count:
            return None
        off = int.from_bytes(self.b[index * 4:index * 4 + 4], "little")
        if off == 0:
            return None
        end = len(self.b)
        for i in range(index + 1, self.count):
            o = int.from_bytes(self.b[i * 4:i * 4 + 4], "little")
            if o != 0:
                end = o
                break
        return self.b[off:end]

    def decode(self, index):
        blk = self.block(index)
        if not blk or len(blk) < 4:
            return None
        size = int.from_bytes(blk[0:4], "little")
        try:
            if 0 < size < 0x2800:                    # inflated size plausible -> LZW
                return decompress_compressed_file(blk)
            return blk[4:]                            # stored raw (header >= 0x2800 or 0)
        except Exception:
            return None


class ConversationScripts:
    """npcId 0..0x62 -> converse.a[id]; 0x63..0xDF -> converse.b[id-0x63]
    (LoadConversation, seg_2FC1.c:783). >= 0xE0 (Wisp/Guard/Gargoyle) is generic."""
    def __init__(self, a=None, b=None):
        self.a = ConverseLib(a)
        self.b = ConverseLib(b)

    def get(self, npc_id):
        if 0 <= npc_id <= 0x62:
            return self.a.decode(npc_id)
        if 0x63 <= npc_id <= 0xdf:
            return self.b.decode(npc_id - 0x63)
        return None


# ---------------------------------------------------------------------------
# 3. Helpers: read the NPC name from the script head; build a safe filename.
# ---------------------------------------------------------------------------
OP_ID, OP_DESC = 0xff, 0xf1


def script_name(d):
    """(npcByte, name) from the OP_ID header: <ID> <npcId> <name...> <DESC>."""
    pc = 0
    if d and d[0] == OP_ID:
        pc += 1
    npc_byte = d[pc] if pc < len(d) else 0
    pc += 1
    out = []
    while pc < len(d) and d[pc] != OP_DESC:
        c = d[pc]
        if c == 0x0a:
            out.append(" ")
        elif 0x20 <= c < 0x7b:
            out.append(chr(c))
        pc += 1
    return npc_byte, "".join(out).strip()


def safe_filename(npc_id, name):
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
    return f"{npc_id:03d}_{cleaned or 'unnamed'}.txt"


def which_file(npc_id):
    return "converse.a" if npc_id <= 0x62 else "converse.b"


# ---------------------------------------------------------------------------
# 3b. Reachability ("--trace") disassembler. Independent offline analyzer that
# does what the live linear tool can't: a recursive-descent code trace (so it
# never desyncs on operand bytes) + reference-driven code/data classification
# (so PRINTSTR/ADDRESS string-pools land in a DATA section, with leftover bytes
# hex-dumped). Operand sizing mirrors _ConverseVM exactly (the gameplay decoder).
# ---------------------------------------------------------------------------
_SIDE_EFFECT = {0xa4: 2, 0xa5: 2, 0xb9: 4, 0xba: 4, 0xc8: 2, 0xc9: 4, 0xc4: 1,
                0xc5: 1, 0xcd: 2, 0xd6: 1, 0xd9: 1, 0xdb: 1, 0x9c: 1, 0xd0: 1,
                0xbe: 1, 0xbf: 1, 0xd8: 1, 0xdf: 1}
_STMT_NAME = {0xa4: "SET", 0xa5: "CLR", 0xb9: "GIVEOBJ", 0xba: "TAKEOBJ",
              0xc8: "MOVEOBJ", 0xc9: "TRANSFEROBJ", 0xc4: "ADDKARMA",
              0xc5: "SUBKARMA", 0xcd: "SETMODE", 0xd6: "RESURRECT", 0xd9: "HEAL",
              0xdb: "CURE", 0x9c: "GETHORSE", 0xd0: "DELAY", 0xbe: "SHOWINVEN",
              0xbf: "SHOWPORTRAIT", 0xd8: "SETNAME", 0xdf: "SETNAME2"}
_MARK0 = {0xf1: "DESC", 0xf2: "MAIN", 0xf3: "PREFIX", 0xf7: "ASKTOP", 0xf6: "RES",
          0xa2: "ENDIF", 0xa3: "ELSE", 0xb6: "LEAVE", 0xcb: "WAIT", 0x9e: "REST",
          # a stray END_OF_FACTOR at statement level is a VM no-op (decode_block
          # seg_1703.c: `op in (0x9e, 0xa7, 0xcb): pass`) -- e.g. the trailing a7
          # of a string-LET value factor. Tolerate it exactly as the engine does.
          0xa7: "(eof)"}
# byte classifications
_K_UNK, _K_CODE, _K_STR, _K_RAW = 0, 1, 2, 3
# Factor-ONLY bytes -- comparison/math operators, value/var tags, LET_VALUE,
# ENDSEARCH. None can begin a statement; inside an expression they're consumed by
# _walk_factor. So one appearing at STATEMENT level means the trace has run off
# code into an inline data table (a word table / STRSEARCH list) -- a clean data
# boundary to stop at, NOT a desync to flag. (NOT 0xa7: a stray END_OF_FACTOR is a
# real in-code no-op -- the trailing terminator of a string-LET value.)
_DATA_BYTES = (frozenset(range(0x80, 0x87)) | frozenset(range(0x90, 0x96)) |
               frozenset({0xa8, 0xb2, 0xb3, 0xb4, 0xb8, 0xd2, 0xd3, 0xd4, 0xd5}))


def _u32at(d, p):
    return int.from_bytes(d[p:p + 4], "little") if p + 4 <= len(d) else 0


# parse_factor operators (seg_1703.c:295), for the infix expression rendering.
_BINOP = {0x90: "+", 0x91: "-", 0x92: "*", 0x93: "/", 0x94: "||", 0x95: "&&",
          0x81: ">", 0x82: ">=", 0x83: "<", 0x84: "<=", 0x85: "!=", 0x86: "=="}
_QUERY = {0xa0: ("Rand", 2), 0xab: ("Flag", 2), 0x9f: ("Owns", 3), 0xbb: ("HasObj", 2),
          0xc7: ("WhosGot", 2), 0xc6: ("InParty", 1), 0xdc: ("Poisoned", 1),
          0x9d: ("Horsed", 1), 0xc2: ("ObjType", 1), 0xc1: ("Owner", 1),
          0xda: ("Wounded", 1), 0xd7: ("OnScreen", 1), 0x9a: ("CanCarry", 1),
          0x9b: ("Weight", 1), 0xca: ("Join", 1), 0xcc: ("LeaveParty", 1),
          0xdd: ("Npc", 1)}


def _walk_factor(d, pc):
    """Consume a parse_factor RPN expr (seg_1703.c:295) and rebuild it as INFIX.
    Returns (pc, addr_refs, expr_text, terminator). Byte advance matches
    _ConverseVM.evaluate exactly; ADDRESS(0xd2) targets are recorded as data refs."""
    n = len(d); refs = []; st = []
    pop = lambda: st.pop() if st else "?"
    term = None; guard = 0
    while pc < n and guard < 512:
        guard += 1
        op = d[pc]; pc += 1
        if op in (0xa7, 0xa8):                      # END_OF_FACTOR / LET_VALUE
            term = op; break
        if op == 0xd2:                              # ADDRESS
            t = _u32at(d, pc); refs.append(t); pc += 4
            st.append(f"@D_{t:04x}")
        elif op == 0xd3:                            # BYTE
            b = d[pc] if pc < n else 0; pc += 1
            st.append("self" if b == 0xeb else str(b))
        elif op == 0xd4:                            # WORD
            st.append(str(int.from_bytes(d[pc:pc + 2], "little"))); pc += 2
        elif op == 0xb2:                            # VARINT (pops its index)
            st.append(f"VarInt[{pop()}]")
        elif op == 0xb3:                            # VARSTR
            st.append(f"VarStr[{pop()}]")
        elif op in _BINOP:
            b = pop(); a = pop(); st.append(f"({a} {_BINOP[op]} {b})")
        elif op in _QUERY:
            name, ac = _QUERY[op]
            args = [pop() for _ in range(ac)][::-1]
            st.append(f"{name}({', '.join(args)})")
        else:                                       # bare literal (seg_1703.c:319)
            st.append("self" if op == 0xeb else str(op))
    return pc, refs, (st[-1] if st else "0"), term


def _walk_addr_string(d, pc):
    """OP_ADDRESS string ref (seg_1703.c:688): u32 target, then CALL(0xb1) for a
    direct ref OR an index factor selecting the Nth string. Returns
    (pc, refs, text). Mirrors _ConverseVM._follow_addr_string."""
    n = len(d)
    target = _u32at(d, pc); pc += 4
    if pc < n and d[pc] == 0xb1:                    # CALL -> direct ref
        return pc + 1, [target], f"@D_{target:04x}"
    pc, refs, idx, _ = _walk_factor(d, pc)          # index factor selects Nth string
    return pc, [target] + refs, f"@D_{target:04x}[{idx}]"


def _walk_let(d, pc):
    """OP_LET (seg_1703.c:746): `LET <di> <kind> <LET_VALUE> ...`. Returns
    (pc, refs, text). Mirrors _ConverseVM._let."""
    n = len(d); refs = []
    di = d[pc] if pc < n else 0; pc += 1
    if di == 0xd2:                                  # ADDRESS dest (var cell / list elem)
        dest = _u32at(d, pc); pc += 4
        if pc < n and d[pc] == 0xa8: pc += 1        # optional leading LET_VALUE
        pc, r, expr, term = _walk_factor(d, pc); refs += r
        parts = [expr]                               # a8-separated chain (list-element LET)
        guard = 0
        while term == 0xa8 and pc < n and guard < 8:
            guard += 1
            pc, r, expr, term = _walk_factor(d, pc); refs += r
            parts.append(expr)
        if len(parts) == 2:                          # @addr[index] = value
            return pc, refs, f"@D_{dest:04x}[{parts[0]}] = {parts[1]}"
        return pc, refs, f"@D_{dest:04x} = " + " | ".join(parts)
    kind = d[pc] if pc < n else 0; pc += 1          # VARINT(0xb2)/VARSTR(0xb3)
    if pc < n and d[pc] == 0xa8: pc += 1            # LET_VALUE
    if kind == 0xb2:                                # int assignment -> factor
        pc, r, expr, _ = _walk_factor(d, pc); refs += r
        return pc, refs, f"VarInt[{di}] = {expr}"
    tag = d[pc] if pc < n else 0; pc += 1           # string assignment
    if tag == 0xd2:                                 # = @addr[index] (string list ref)
        pc, r, txt = _walk_addr_string(d, pc); refs += r
        return pc, refs, f"VarStr[{di}] = {txt}"
    if pc < n and d[pc] == 0xb3: pc += 1            # = VarStr[?]
    return pc, refs, f"VarStr[{di}] = VarStr[?]"


def _walk_printstr(d, pc):
    """OP_PRINTSTR (seg_1703.c:729). Returns (pc, refs, text)."""
    n = len(d)
    tag = d[pc] if pc < n else 0; pc += 1
    if tag == 0xd2:                                 # ADDRESS -> string-list
        return _walk_addr_string(d, pc)
    if tag != 0xd5:                                 # VarStr form: di + checked byte
        di = d[pc] if pc < n else 0; pc += 2
        return pc, [], f"VarStr[{di}]"
    return pc, [], ""


def _decode_one(d, pc):
    """Decode ONE instruction at pc. Returns (mnemonic, next_pc, goto_targets,
    data_refs). next_pc<=pc signals no progress (caller stops)."""
    n = len(d); op = d[pc]
    if op < 0x80:                                   # inline ASCII text run
        s = bytearray()
        while pc < n and d[pc] and d[pc] < 0x80:
            s.append(d[pc]); pc += 1
        if pc < n and d[pc] == 0: pc += 1
        return ('"' + s.decode("latin-1", "replace").replace("\n", "\\n") + '"', pc, [], [])
    pc += 1
    if op == 0xff:                                  # ID + npcId
        npc = d[pc] if pc < n else 0; pc += 1
        return (f"ID npc={npc}", pc, [], [])
    if op == 0xef:                                  # KEY <kw,...> (until RES)
        kw = bytearray()
        while pc < n and d[pc] != 0xf6:
            kw.append(d[pc]); pc += 1
        return ('KEY "' + kw.decode("latin-1", "replace") + '"', pc, [], [])
    if op == 0xb0:                                  # GOTO u32
        t = _u32at(d, pc); pc += 4
        return (f"GOTO L_{t:04x}", pc, [t], [])
    if op == 0xa1:                                  # IF <factor>
        pc, r, expr, _ = _walk_factor(d, pc)
        return (f"IF {expr}", pc, [], r)
    if op == 0xa6:                                  # LET
        pc, r, txt = _walk_let(d, pc)
        return (f"LET {txt}", pc, [], r)
    if op == 0xb5:                                  # PRINTSTR
        pc, r, txt = _walk_printstr(d, pc)
        return ((f"PRINTSTR {txt}".rstrip()), pc, [], r)
    if op in _SIDE_EFFECT:                          # SET/GIVEOBJ/HEAL/... <factors>
        refs = []; args = []
        for _ in range(_SIDE_EFFECT[op]):
            pc, r, expr, _ = _walk_factor(d, pc); refs += r; args.append(expr)
        name = _STMT_NAME.get(op, f"OP_{op:02x}")
        cmt = ""                                     # GIVEOBJ/TAKEOBJ: annotate the obj id
        if op in (0xb9, 0xba) and len(args) > 1 and args[1].lstrip("-").isdigit():
            cmt = f"   ; obj 0x{int(args[1]) & 0xffff:02x}"
        return (f"{name} " + ", ".join(args) + cmt, pc, [], refs)
    if op == 0xf8:                                  # GET: permitted-keys until KEY(ef)
        s = bytearray()
        while pc < n and d[pc] != 0xef and d[pc] < 0x80:
            s.append(d[pc]); pc += 1
        return ('GET "' + s.decode("latin-1", "replace") + '"', pc, [], [])
    if op in (0xf9, 0xfa, 0xfb, 0xfc):              # GET* var input: <idx><b2/b3>
        idx = d[pc] if pc < n else 0; pc += 1
        if pc < n and d[pc] in (0xb2, 0xb3): pc += 1
        nm = {0xf9: "GETSTR", 0xfa: "GETCHR", 0xfb: "GETINT", 0xfc: "GETDIGIT"}[op]
        return (f"{nm} Var[{idx}]", pc, [], [])
    if op == 0xee:                                  # ENDRES (fall-through terminator)
        return ("ENDRES", pc, [], [])
    if op in _MARK0:                                # 0-operand markers
        return (_MARK0[op], pc, [], [])
    return (f"??? 0x{op:02x}", pc, [], [])          # truly unhandled -> reported


class _Tracer:
    """Recursive-descent code parse (the script.js `skipCodeBlock` model, using
    the source's full opcode operand table). It follows the script's structure --
    `IF/ELSE/ENDIF` and `ASKTOP/KEY/RES/ENDRES` -- recursively, tracking per-block
    FALL-THROUGH: a block ends when its last construct cannot fall through (a
    GOTO/BYE, or an IF whose branches ALL jump away -- script.js:1241 generalised).
    That precise boundary stops the trace before inline data tables instead of a
    flat sweep grazing into them. GOTO targets are parsed as separate entries."""

    def __init__(self, d):
        self.d = d; self.n = len(d)
        self.kind = bytearray(self.n)
        self.instns = {}; self.drefs = {}; self.goto = set()
        self.untraced = []; self.pending = []

    def _emit(self, start, npc, mnem, g, dr):
        for i in range(start, min(npc, self.n)):
            if self.kind[i] == _K_UNK:
                self.kind[i] = _K_CODE
        self.instns[start] = mnem
        for t in g:
            self.goto.add(t)
            if 0 <= t < self.n:
                self.pending.append(t)
        for t in dr:
            if 0 <= t < self.n:
                self.drefs.setdefault(t, set()).add(start)

    def _marker(self, pc, name):                        # 0-operand structural op
        if pc < self.n and self.kind[pc] == _K_UNK:
            self.kind[pc] = _K_CODE
        self.instns[pc] = name

    def parse(self):
        self.pending = [0]
        seen = set()
        while self.pending:
            pc = self.pending.pop()
            if not (0 <= pc < self.n) or pc in seen or self.kind[pc] != _K_UNK:
                continue
            seen.add(pc)
            self._stmts(pc, frozenset(), 0)

    def _stmts(self, pc, stops, depth):
        """Decode a straight-line run until a stop op (peeked), ENDRES, a merge,
        or a non-falling construct. Returns (pc, falls_through)."""
        d, n = self.d, self.n
        falls = True
        while pc < n and depth < 250:
            op = d[pc]
            if op in stops or op == 0 or op == 0xee or self.kind[pc] == _K_CODE:
                return pc, falls                        # sibling / ENDRES / merge -> caller
            if op in _DATA_BYTES:                        # factor-only byte at stmt level =
                return pc, falls                          # inline data reached -> clean stop
            start = pc
            mnem, npc, g, dr = _decode_one(d, pc)
            if mnem.startswith("??? "):
                self.untraced.append((start, op))
                self._emit(start, start + 1, mnem, [], [])
                return start + 1, falls
            self._emit(start, npc, mnem, g, dr)
            if op == 0xa1:                              # IF -> parse branches
                pc, falls = self._if(npc, stops, depth + 1)
                if not falls:                           # all branches jumped away
                    return pc, False
                continue
            if op in (0xf7, 0xf8):                      # ASKTOP / GET -> keyword table.
                pc = self._ask(npc, depth + 1)           # Code after ENDRES IS reachable
                falls = True                             # (a GET's unmatched key / the
                continue                                 # default handler falls through).
            if op in (0xb0, 0xb6):                      # GOTO / LEAVE(BYE): unconditional
                return npc, False
            falls = True
            pc = npc
        return pc, falls

    def _if(self, pc, stops, depth):
        d, n = self.d, self.n
        pc, t_falls = self._stmts(pc, stops | frozenset({0xa3, 0xa2}), depth)
        has_else = False; f_falls = True                # no ELSE -> false path falls through
        if pc < n and d[pc] == 0xa3:                    # ELSE
            self._marker(pc, "ELSE"); pc += 1; has_else = True
            pc, f_falls = self._stmts(pc, stops | frozenset({0xa2}), depth)
        if pc < n and d[pc] == 0xa2:                    # ENDIF
            self._marker(pc, "ENDIF"); pc += 1
        falls = (not has_else) or t_falls or f_falls
        return pc, falls

    def _ask(self, pc, depth):
        """Parse an ASKTOP/GET keyword table: (KEY <kw> RES <body>)* ENDRES."""
        d, n = self.d, self.n
        guard = 0
        while pc < n and guard < 4096:
            guard += 1
            op = d[pc]
            if op == 0xee:                              # ENDRES -> table end
                self._marker(pc, "ENDRES"); return pc + 1
            if op == 0:
                return pc
            if op == 0xef:                              # KEY <kw> RES <body>
                start = pc; mnem, npc, g, dr = _decode_one(d, pc)
                self._emit(start, npc, mnem, g, dr); pc = npc
                if pc < n and d[pc] == 0xf6:
                    self._marker(pc, "RES"); pc += 1
                pc, _ = self._stmts(pc, frozenset({0xef, 0xee}), depth + 1)
                continue
            # content before the first KEY (GET answer-list text / a greeting IF gate)
            start = pc; mnem, npc, g, dr = _decode_one(d, pc)
            if mnem.startswith("??? "):
                self.untraced.append((start, op))
                self._emit(start, start + 1, mnem, [], [])
                return start + 1
            self._emit(start, npc, mnem, g, dr)
            if op == 0xa1:
                pc, _ = self._if(npc, frozenset({0xef, 0xee}), depth + 1); continue
            if op in (0xb0, 0xb6):
                return npc
            pc = npc
        return pc


def trace_script(d):
    """Recursive-descent reachability disassembly + reference-driven code/data
    split. Returns a dict with byte-kind map, decoded instructions, data refs,
    goto targets, and untraced sites."""
    n = len(d)
    tr = _Tracer(d)
    tr.parse()
    kind = tr.kind
    instns = tr.instns
    drefs = tr.drefs
    goto = tr.goto
    untraced = tr.untraced
    # --- pass 2: data string-pools from each reference target ---
    for t in sorted(drefs):
        if t >= n or kind[t] != _K_UNK:
            continue                                # ref into code/oob or already pooled
        p = t
        while p < n and kind[p] == _K_UNK and d[p] != 0:   # stop at padding NUL / code
            st = p; s = bytearray()
            while p < n and kind[p] == _K_UNK and d[p] != 0:
                s.append(d[p]); p += 1
            if p < n and d[p] == 0:                 # consume terminator into the pool
                p += 1
            for b in range(st, p):
                kind[b] = _K_STR
    # --- pass 3: everything left over is raw data ---
    for b in range(n):
        if kind[b] == _K_UNK:
            kind[b] = _K_RAW
    return {"d": d, "n": n, "kind": kind, "instns": instns, "drefs": drefs,
            "goto": goto, "untraced": untraced}


def render_trace(d, npc_id, info_hdr, tr):
    n = tr["n"]; kind = tr["kind"]; instns = tr["instns"]
    drefs = tr["drefs"]; goto = tr["goto"]
    n_code = kind.count(_K_CODE); n_str = kind.count(_K_STR); n_raw = kind.count(_K_RAW)
    out = [HEADER,
           f"; NPC {npc_id}  (id byte {info_hdr['npc_byte']})  -- {info_hdr['name'] or '(unnamed)'}",
           f"; source: {info_hdr['file']}   decoded length: {n} bytes",
           f"; trace: code={n_code} ({100*n_code//max(n,1)}%)  data-str={n_str}  "
           f"raw={n_raw}  untraced={len(tr['untraced'])}"]
    if tr["untraced"]:
        out.append("; !! UNTRACED reachable bytes: " +
                    ", ".join(f"0x{a:04x}=0x{b:02x}" for a, b in tr["untraced"][:12]))
    out.append(";\n; ===== CODE =====")
    for addr in sorted(instns):
        if addr in goto:
            out.append(f"L_{addr:04x}:")
        out.append(f"  0x{addr:04x}: {instns[addr]}")
    out.append("; ===== DATA =====")
    p = 0
    while p < n:
        k = kind[p]
        if k == _K_STR:
            while p < n and kind[p] == _K_STR:
                st = p; s = bytearray()
                while p < n and kind[p] == _K_STR and d[p] != 0:
                    s.append(d[p]); p += 1
                if p < n and kind[p] == _K_STR and d[p] == 0:
                    p += 1
                if st in drefs:
                    out.append(f"  D_{st:04x}:  (ref " +
                               ", ".join(f"0x{x:04x}" for x in sorted(drefs[st])) + ")")
                out.append(f'    0x{st:04x}: "' + s.decode("latin-1", "replace") + '"')
        elif k == _K_RAW:
            st = p
            while p < n and kind[p] == _K_RAW:
                p += 1
            out.append(f"; raw @0x{st:04x} ({p - st} bytes):")
            o = st
            while o < p:
                row = d[o:min(o + 16, p)]
                hexs = " ".join(f"{x:02x}" for x in row)
                asc = "".join(chr(x) if 0x20 <= x < 0x7f else "." for x in row)
                out.append(f"    0x{o:04x}: {hexs:<47} |{asc}|")
                o += 16
        else:
            p += 1
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# 4. Driver.
# ---------------------------------------------------------------------------
HEADER = (
    "; ============================================================\n"
    "; DECODED U6 GAME DATA -- kept OUTSIDE the repo, do NOT commit (BYO-data rule).\n"
    "; Disassembler under test: dosbox_u6_server._disassemble\n"
    ";   (the exact core the live u6_script_disasm MCP tool runs).\n"
    "; Decode path ported from ultima6_clone/assets/{lzw,converse}.js.\n"
    "; ============================================================\n"
)

_UNKNOWN_RE = re.compile(r"\?\?\? 0x([0-9a-fA-F]{2})")


def disasm_for(scripts, disassemble, npc_id):
    d = scripts.get(npc_id)
    if d is None or len(d) < 3:
        return None
    npc_byte, name = script_name(d)
    text = disassemble(d, len(d))
    unknown = _UNKNOWN_RE.findall(text)
    return {
        "npc_id": npc_id, "npc_byte": npc_byte, "name": name,
        "length": len(d), "file": which_file(npc_id),
        "text": text, "unknown": [int(x, 16) for x in unknown],
    }


def render_file(info):
    head = (
        f"{HEADER}"
        f"; NPC {info['npc_id']}  (id byte {info['npc_byte']})  -- {info['name'] or '(unnamed)'}\n"
        f"; source: {info['file']}   decoded length: {info['length']} bytes\n"
    )
    if info["unknown"]:
        uniq = sorted(set(info["unknown"]))
        head += ("; !! UNRESOLVED OPCODES: " +
                 ", ".join(f"0x{u:02x}" for u in uniq) +
                 f"  ({len(info['unknown'])} site(s)) -- linear-sweep desync or genuinely unhandled\n")
    return head + ";\n" + info["text"] + "\n"


def main(argv):
    data_dir = "C:/Z_Temp/ULTIMA6"
    out_dir = None
    target = None
    trace = True                                         # default: full-fidelity trace

    args = list(argv)
    i = 0
    while i < len(args):
        if args[i] == "--data":
            data_dir = args[i + 1]; i += 2
        elif args[i] == "--out":
            out_dir = args[i + 1]; i += 2
        elif args[i] == "--trace":
            trace = True; i += 1
        elif args[i] == "--linear":                      # run the live u6_script_disasm core
            trace = False; i += 1
        else:
            target = args[i]; i += 1

    if out_dir is None:                                  # both outside the repo (BYO-data)
        out_dir = ("C:/Z_Temp/tools/dosbox_mcp/npc_scripts_trace" if trace
                   else "C:/Z_Temp/tools/dosbox_mcp/npc_scripts")

    a_path = os.path.join(data_dir, "CONVERSE.A")
    b_path = os.path.join(data_dir, "CONVERSE.B")
    if not os.path.exists(a_path):
        # case-insensitive fallback
        for fn in os.listdir(data_dir):
            if fn.lower() == "converse.a":
                a_path = os.path.join(data_dir, fn)
            elif fn.lower() == "converse.b":
                b_path = os.path.join(data_dir, fn)
    with open(a_path, "rb") as f:
        a = f.read()
    b = b""
    if os.path.exists(b_path):
        with open(b_path, "rb") as f:
            b = f.read()

    disassemble = _import_disassemble()
    scripts = ConversationScripts(a, b)
    os.makedirs(out_dir, exist_ok=True)

    # Resolve a single named/numbered target.
    if target is not None and target not in ("--all",):
        npc_id = None
        if target.isdigit():
            npc_id = int(target)
        elif target.lower().startswith("0x"):
            npc_id = int(target, 16)
        else:
            q = target.lower()
            for cand in range(0xe0):
                info = disasm_for(scripts, disassemble, cand)
                if info and q in info["name"].lower():
                    npc_id = cand
                    break
            if npc_id is None:
                print(f"no NPC name matches {target!r}")
                return 1
        d = scripts.get(npc_id)
        if d is None or len(d) < 3:
            print(f"no script for NPC {npc_id}")
            return 1
        npc_byte, name = script_name(d)
        if trace:
            hdr = {"npc_byte": npc_byte, "name": name, "file": which_file(npc_id)}
            text = render_trace(d, npc_id, hdr, trace_script(d))
        else:
            text = render_file(disasm_for(scripts, disassemble, npc_id))
        path = os.path.join(out_dir, safe_filename(npc_id, name))
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        print(text)
        print(f"\n-> wrote {path}")
        return 0

    if trace:
        return _sweep_trace(scripts, out_dir, a_path, b_path, b)
    return _sweep_linear(scripts, disassemble, out_dir, a_path, b_path, b)


def _sweep_linear(scripts, disassemble, out_dir, a_path, b_path, b):
    rows, flagged, all_unknown = [], [], {}
    for npc_id in range(0xe0):
        info = disasm_for(scripts, disassemble, npc_id)
        if not info:
            continue
        path = os.path.join(out_dir, safe_filename(info["npc_id"], info["name"]))
        with open(path, "w", encoding="utf-8") as f:
            f.write(render_file(info))
        rows.append(info)
        if info["unknown"]:
            flagged.append(info)
            for u in info["unknown"]:
                all_unknown[u] = all_unknown.get(u, 0) + 1

    idx = [HEADER, f"; {len(rows)} scripts decoded from {os.path.basename(a_path)} + "
           f"{os.path.basename(b_path) if b else '(no .B)'}\n;\n",
           f"; {'id':>3}  {'file':<11} {'bytes':>6}  {'?ops':>4}  name\n"]
    for info in rows:
        idx.append(f"; {info['npc_id']:>3}  {info['file']:<11} {info['length']:>6}  "
                   f"{len(info['unknown']):>4}  {info['name']}\n")
    with open(os.path.join(out_dir, "00_INDEX.txt"), "w", encoding="utf-8") as f:
        f.write("".join(idx))

    print(f"decoded + disassembled {len(rows)} NPC scripts (linear) -> {out_dir}")
    if not flagged:
        print("CLEAN: every script disassembled with NO unresolved/desynced opcodes.")
    else:
        print(f"\n{len(flagged)} script(s) with unresolved opcodes "
              f"(distinct: {', '.join(f'0x{u:02x}({c})' for u, c in sorted(all_unknown.items()))}):")
        for info in flagged:
            uniq = ", ".join(f"0x{u:02x}" for u in sorted(set(info["unknown"])))
            print(f"  NPC {info['npc_id']:>3} {info['name']:<22} {info['file']:<11} "
                  f"{info['length']:>5}B  -> {uniq}  ({len(info['unknown'])} site(s))")
    return 0


def _sweep_trace(scripts, out_dir, a_path, b_path, b):
    rows, dirty = [], []
    for npc_id in range(0xe0):
        d = scripts.get(npc_id)
        if d is None or len(d) < 3:
            continue
        npc_byte, name = script_name(d)
        hdr = {"npc_byte": npc_byte, "name": name, "file": which_file(npc_id)}
        tr = trace_script(d)
        text = render_trace(d, npc_id, hdr, tr)
        path = os.path.join(out_dir, safe_filename(npc_id, name))
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        k = tr["kind"]; n = len(d)
        row = {"npc_id": npc_id, "name": name, "file": which_file(npc_id), "length": n,
               "untraced": len(tr["untraced"]), "code": k.count(_K_CODE),
               "str": k.count(_K_STR), "raw": k.count(_K_RAW)}
        rows.append(row)
        if row["untraced"]:
            dirty.append(row)

    idx = [HEADER, f"; {len(rows)} scripts reachability-traced from "
           f"{os.path.basename(a_path)} + {os.path.basename(b_path) if b else '(no .B)'}\n;\n",
           f"; {'id':>3}  {'file':<11} {'bytes':>6}  {'code':>6} {'str':>6} {'raw':>6}  {'untr':>4}  name\n"]
    for r in rows:
        idx.append(f"; {r['npc_id']:>3}  {r['file']:<11} {r['length']:>6}  "
                   f"{r['code']:>6} {r['str']:>6} {r['raw']:>6}  {r['untraced']:>4}  {r['name']}\n")
    with open(os.path.join(out_dir, "00_INDEX.txt"), "w", encoding="utf-8") as f:
        f.write("".join(idx))

    clean = sum(1 for r in rows if not r["untraced"])
    tot_raw = sum(r["raw"] for r in rows)
    print(f"reachability-traced {len(rows)} NPC scripts -> {out_dir}")
    print(f"fully traced (untraced==0): {clean}/{len(rows)}   "
          f"total raw/leftover bytes across corpus: {tot_raw}")
    if dirty:
        print(f"\n{len(dirty)} script(s) with UNTRACED reachable bytes:")
        for r in sorted(dirty, key=lambda r: -r["untraced"]):
            print(f"  NPC {r['npc_id']:>3} {r['name']:<22} {r['file']:<11} "
                  f"{r['length']:>5}B  untraced={r['untraced']}  raw={r['raw']}")
    else:
        print("ELEGANT: every script fully reachability-traced, 0 untraced bytes.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
