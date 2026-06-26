"""Disassembler test: _disassemble turns a synthetic TalkBuf into an addressed,
assembly-like listing -- structural opcodes (ID/DESC/MAIN/ASKTOP), KEY/RES blocks
(incl. multi-keyword + preserved @markup), SET self with the bare-0x00 literal, GOTO
labels, IF + a factor expression, LET = RND, GIVEOBJ with an obj-id comment, and an
inline '??? 0xNN' for an unknown opcode (flagged, never fatal). Synthetic bytes only --
no game data is committed (BYO-data rule)."""
import sys, types, os
dm = types.ModuleType("dosbox_mem"); dm.read = lambda h, a, n: b"\x00" * n
dm.Session = type("S", (), {"__init__": lambda s: None})
dm.register_base_tools = lambda *a: types.SimpleNamespace()
dm.register_input_tools = lambda *a: types.SimpleNamespace()
dm.iter_regions = lambda h: []; dm.HINT_NO_MEMBASE = "x"; sys.modules["dosbox_mem"] = dm
di = types.ModuleType("dosbox_input"); di.register_input_tools = lambda *a: types.SimpleNamespace()
sys.modules["dosbox_input"] = di
mf = types.ModuleType("mcp.server.fastmcp")
class F:
    def __init__(s, *a, **k): pass
    def tool(s, *a, **k): return lambda f: f
    def run(s): pass
mf.FastMCP = F
sys.modules["mcp"] = types.ModuleType("mcp"); sys.modules["mcp.server"] = types.ModuleType("mcp.server")
sys.modules["mcp.server.fastmcp"] = mf
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dosbox_u6_server as u6

def T(s): return list(s.encode("latin-1"))
ID, DESC, MAIN, ASK, KEY, RES, ENDRES = 0xff, 0xf1, 0xf2, 0xf7, 0xef, 0xf6, 0xee
SET, GOTO, BYTE, EOF, IF, ENDIF, SUP = 0xa4, 0xb0, 0xd3, 0xa7, 0xa1, 0xa2, 0x81
LET, VARINT, LETV, RND, GIVE = 0xa6, 0xb2, 0xa8, 0xa0, 0xb9

script = bytes(
    [ID, 3] + T("Sam") +
    [DESC] + T("a quiet man.") +
    [MAIN] + T("Yes?") +
    [ASK] +
    [KEY] + T("name") + [RES] + T("Sam.") + [SET, BYTE, 0xeb, EOF, 0x00, EOF, GOTO, 0x5b, 0, 0, 0] +
    [KEY] + T("job,work") + [RES] + T("I @help.") +
        [IF, BYTE, 5, BYTE, 0, SUP, EOF] + T("rich") + [ENDIF] +
        [LET, 7, VARINT, LETV, BYTE, 1, BYTE, 0x0a, RND, EOF] +
        [GIVE, BYTE, 0xeb, EOF, BYTE, 0x40, EOF, BYTE, 1, EOF, BYTE, 1, EOF] +
        [0x88] +                                   # unknown opcode -> flagged
        [ENDRES])

out = u6._disassemble(script, len(script))
ok = True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")

print("disassembly of a synthetic script:")
print("\n".join("    " + ln for ln in out.splitlines()))
print("checks:")
chk("ID npc=3",                  "ID npc=3" in out)
chk("description text",          "a quiet man." in out)
chk('KEY "name"',                'KEY "name"' in out)
chk("SET self, 0 (bare-0 literal decoded)", "SET self, 0" in out)
chk("GOTO label",                "GOTO L_005b" in out)
chk("multi-keyword block",       'KEY "job,work"' in out)
chk("@markup preserved in text", "@help" in out)
chk("IF + factor expression",    "IF (5 > 0)" in out)
chk("LET = RND",                 "LET VarInt[7] = Rand(1, 10)" in out)
chk("GIVEOBJ + obj comment",     "GIVEOBJ self, 64, 1, 1" in out and "obj 0x40" in out)
chk("unknown opcode flagged",    "??? 0x88" in out)

# Second script: the operand-bearing ops that used to desync the linear sweep --
# PRINTSTR @addr[index], GET* var input, and a list-element LET. All must now
# decode cleanly (no '??? 0x..').
PRINT, GETDIGIT, ADDR, B4, CALL = 0xb5, 0xfc, 0xd2, 0xb4, 0xb1
s2 = bytes(
    [ID, 9] + T("Q") + [DESC] + T("x") + [MAIN] +
    [PRINT, ADDR, 0x40, 0, 0, 0, BYTE, 1, RND, EOF] +          # PRINTSTR @0x40[Rand]
    [GETDIGIT, 0, VARINT] +                                    # GETDIGIT Var[0]
    [LET, ADDR, 0x50, 0, 0, 0, BYTE, 0, B4, 0xa8, ADDR, 0x60, 0, 0, 0, BYTE, 0, B4, EOF])
o2 = u6._disassemble(s2, len(s2))
chk("PRINTSTR @addr[index]",   "PRINTSTR @0x0040[" in o2)
chk("GETDIGIT var operand",    "GETDIGIT Var[0]" in o2)
chk("list-element LET (a8-chain rendered)", "LET @0x0050[" in o2)
chk("no desync in s2 (full a8-chain consumed, no ???)", "???" not in o2)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
