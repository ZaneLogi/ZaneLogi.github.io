"""Stub-driven smoke test for dosbox_u6_server.u6_party (mode + controlled member)."""
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

def w24(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff; MEM[a+2]=(v>>16)&0xff
def pack(x,y,z): return x|(y<<10)|(z<<20)
def name(k,s):
    b=s.encode("latin-1")[:13]
    for i in range(14): MEM[u6.U6_Names+k*14+i]= b[i] if i<len(b) else 0

# roster: idx0 slot1 Avatar(10,20), idx1 slot0x1a Sherry(11,20), idx2 slot0x1b Iolo(12,20)
PARTY=[1,0x1a,0x1b]
for k,s in enumerate(PARTY): MEM[u6.U6_Party+k]=s
MEM[u6.U6_PartySize]=3
for k,nm in enumerate(["Avatar","Sherry","Iolo"]): name(k,nm)
w24(u6.U6_ObjPos+1*3,    pack(10,20,0))
w24(u6.U6_ObjPos+0x1a*3, pack(11,20,0))
w24(u6.U6_ObjPos+0x1b*3, pack(12,20,0))
MEM[u6.U6_Party+3]=0x2a  # vehicle slot at index==PartySize

def run(label, solo, active):
    MEM[u6.U6_SoloFlag]=solo & 0xff
    MEM[u6.U6_Active]=active
    print(f"=== {label} (D_2CC3={solo}, Active={active}) ===")
    print(u6.u6_party())
    print()

run("party mode", -1, 0)      # expect PARTY, controlled idx0 slot0x1 'Avatar', * on idx0
run("solo mode (Iolo)", 2, 2) # expect SOLO,  controlled idx2 slot0x1b 'Iolo', * on idx2
run("aboard vehicle", -1, 3)  # Active==PartySize -> vehicle slot 0x2a
