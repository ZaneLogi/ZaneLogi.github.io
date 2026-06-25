"""Converse-VM decoder test: text + keyword list + response preview + IF-on-flag
(deterministic, both values) + RND (both branches) + unknown op (DECODER_STOP),
against the REAL _ConverseVM with a synthetic TalkBuf and a stub env."""
import sys, types, os
# minimal stubs so the server module imports
dm = types.ModuleType("dosbox_mem")
class _S:
    def __init__(s): s.handle=None; s.membase=None
    def reset(s): pass
dm.Session=_S; dm.register_base_tools=lambda m,S: types.SimpleNamespace()
dm.register_input_tools=lambda m,S: types.SimpleNamespace()
dm.read=lambda h,a,n: b"\x00"*n; dm.iter_regions=lambda h:[]; dm.HINT_NO_MEMBASE="x"
sys.modules["dosbox_mem"]=dm
di=types.ModuleType("dosbox_input"); di.register_input_tools=lambda m,S: types.SimpleNamespace()
sys.modules["dosbox_input"]=di
mm=types.ModuleType("mcp"); ms=types.ModuleType("mcp.server"); mf=types.ModuleType("mcp.server.fastmcp")
class FastMCP:
    def __init__(s,*a,**k): pass
    def tool(s,*a,**k): return lambda f:f
    def run(s): pass
mf.FastMCP=FastMCP
sys.modules["mcp"]=mm; sys.modules["mcp.server"]=ms; sys.modules["mcp.server.fastmcp"]=mf
sys.path.insert(0, os.path.join(os.path.dirname(__file__),".."))
import dosbox_u6_server as u6

def env(flag=1):
    return types.SimpleNamespace(npc=5, varint=lambda i:0, varstr=lambda i:"",
                                 query=lambda kind,**kw: flag if kind=="flag" else 0)

# opcode shortcuts
KEY,RES,ASK,ENDRES=0xef,0xf6,0xf7,0xee
IF,ELSE,ENDIF,EOF=0xa1,0xa3,0xa2,0xa7
BYTE,TST,RND=0xd3,0xab,0xa0
def T(s): return list(s.encode("latin-1"))

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")

# 1) plain text stops at ASKTOP
vm=u6._ConverseVM(bytes(T("Hello there.")+[ASK]), env())
chk("text decode", vm.decode_block(set())=="Hello there.")

# 2) keyword list (comma-separated -> split; '*' -> (anything))
script=bytes([KEY]+T("name")+[RES]+T("r1")+[KEY]+T("job,work")+[RES]+T("r2")+
             [KEY]+T("*")+[RES]+T("r3")+[ENDRES])
vm=u6._ConverseVM(script, env());
chk("keyword list", vm.keyword_list()==["name","job","work","(anything)"])

# 3) find + decode the 'job' response
vm=u6._ConverseVM(script, env())
chk("find_response job", vm.find_response("job") and vm.decode_block(set())=="r2")
# abbreviation: 'wor' matches 'work'
vm=u6._ConverseVM(script, env()); chk("abbrev 'wor'->work", vm.find_response("wor"))

# 4) IF on a flag (deterministic): "A" IF(TST npc,bit) "B" ELSE "C" ENDIF "D"
ifblk=bytes(T("A")+[IF,BYTE,5,BYTE,0,TST,EOF]+T("B")+[ELSE]+T("C")+[ENDIF]+T("D")+[ASK])
chk("IF flag=1 -> ABD", u6._ConverseVM(ifblk, env(flag=1)).decode_block(set())=="ABD")
chk("IF flag=0 -> ACD", u6._ConverseVM(ifblk, env(flag=0)).decode_block(set())=="ACD")

# 5) RND -> both branches annotated
rndblk=bytes([IF,BYTE,1,BYTE,3,RND,EOF]+T("X")+[ELSE]+T("Y")+[ENDIF]+[ASK])
res=u6._ConverseVM(rndblk, env()).decode_block(set())
chk("RND -> [either: X | Y]", "[either:" in res and "X" in res and "Y" in res)

# 6) unknown opcode -> _DecoderStop
try:
    u6._ConverseVM(bytes(T("hi")+[0x88]+T("bye")+[ASK]), env()).decode_block(set())
    chk("unknown op raises", False)
except u6._DecoderStop as st:
    chk("unknown op -> DecoderStop", st.op==0x88)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
