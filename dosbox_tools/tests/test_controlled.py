"""Prove mode-aware nav: _controlled_slot/_controlled_xyz follow Party[Active], and
_actor_cells excludes the CONTROLLED mover (so in solo mode the avatar becomes a
blocking actor and the detached member does not)."""
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
# roster: idx0 slot1 avatar@(5,5); idx1 slot0x1a@(6,6); idx2 slot0x1b Iolo@(8,8)
for k,s in enumerate([1,0x1a,0x1b]): MEM[u6.U6_Party+k]=s
MEM[u6.U6_PartySize]=3
w24(u6.U6_ObjPos+1*3,    pack(5,5,0)); MEM[u6.U6_ObjStatus+1]=0;    MEM[u6.U6_ObjShapeType+1*2]=0x55
w24(u6.U6_ObjPos+0x1a*3, pack(6,6,0)); MEM[u6.U6_ObjStatus+0x1a]=0; MEM[u6.U6_ObjShapeType+0x1a*2]=0x55
w24(u6.U6_ObjPos+0x1b*3, pack(8,8,0)); MEM[u6.U6_ObjStatus+0x1b]=0; MEM[u6.U6_ObjShapeType+0x1b*2]=0x55

ok=True
def chk(label, cond):
    global ok; ok &= cond; print(f"  [{'OK' if cond else 'FAIL'}] {label}")

# --- party mode: Active=0, D_2CC3=-1 ---
MEM[u6.U6_Active]=0; MEM[u6.U6_SoloFlag]=0xff
slot,idx,veh = u6._controlled_slot(0)
cx,cy,cz = u6._controlled_xyz(0)
actors = u6._actor_cells(0, 0, 0, 0, slot)
print("party mode:")
chk("controlled slot == 1 (avatar)", slot==1)
chk("controlled xyz == (5,5,0)", (cx,cy,cz)==(5,5,0))
chk("avatar cell (5,5) NOT blocking (it's the mover)", (5,5) not in actors)
chk("Iolo cell (8,8) IS blocking", (8,8) in actors)

# --- solo mode controlling Iolo: Active=2, D_2CC3=2 ---
MEM[u6.U6_Active]=2; MEM[u6.U6_SoloFlag]=2
slot,idx,veh = u6._controlled_slot(0)
cx,cy,cz = u6._controlled_xyz(0)
actors = u6._actor_cells(0, 0, 0, 0, slot)
print("solo mode (Iolo):")
chk("controlled slot == 0x1b (Iolo)", slot==0x1b)
chk("controlled xyz == (8,8,0)", (cx,cy,cz)==(8,8,0))
chk("Iolo cell (8,8) NOT blocking (it's the mover)", (8,8) not in actors)
chk("avatar cell (5,5) IS blocking now", (5,5) in actors)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
