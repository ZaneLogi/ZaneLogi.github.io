"""Verify _input_state's classification + priority ordering against the real function."""
import sys, types, os
MEM = bytearray(0x50000)
dm = types.ModuleType("dosbox_mem")
class _S:
    def __init__(s): s.handle=None; s.membase=None
    def reset(s): pass
dm.Session=_S
dm.register_base_tools=lambda m,S: types.SimpleNamespace()
dm.register_input_tools=lambda m,S: types.SimpleNamespace()
dm.read=lambda h,a,n: bytes(MEM[a:a+n]); dm.iter_regions=lambda h:[]; dm.HINT_NO_MEMBASE="x"
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
u6.S.handle=1; u6.S.membase=0; u6.S.u6_ds=0

def setflags(conv, amm, sel, mouse):
    MEM[u6.U6_IsInConversation]=conv
    MEM[u6.U6_AllowMouseMov]=amm & 0xff; MEM[u6.U6_AllowMouseMov+1]=(amm>>8)&0xff
    MEM[u6.U6_SelectMode]=sel
    MEM[u6.U6_MouseMode]=mouse & 0xff; MEM[u6.U6_MouseMode+1]=(mouse>>8)&0xff

ok=True
def chk(label, conv,amm,sel,mouse, expect):
    global ok
    setflags(conv,amm,sel,mouse)
    state,_=u6._input_state(0)
    good = state==expect
    ok &= good
    print(f"  [{'OK' if good else 'FAIL'}] {label}: {state} (expect {expect})")

print("input_state classification:")
chk("command ready",        0,1,0,0, "COMMAND_READY")
chk("conversation dominates",1,1,0,0, "CONVERSATION")   # conv wins even if amm==1
chk("selecting (amm 0)",    0,0,1,0, "SELECTING")
chk("select beats command", 0,1,1,0, "SELECTING")       # SelectMode!=0 + amm==1 = panel armed -> must ESC
chk("mouse mode",           0,0,0,1, "MOUSE_MODE")
chk("busy (all idle)",      0,0,0,0, "BUSY")
chk("select beats mouse",   0,0,1,1, "SELECTING")
print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
