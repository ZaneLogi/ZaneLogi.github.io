"""Static-table cache check: lazy populate, reuse (no re-read), invalidate on key change."""
import sys, types, os
MEM = bytearray(0x50000)
dm = types.ModuleType("dosbox_mem")
class _Sess:
    def __init__(self): self.handle=None; self.membase=None
    def reset(self): pass
dm.Session=_Sess
dm.register_base_tools=lambda mcp,S: types.SimpleNamespace()
dm.register_input_tools=lambda mcp,S: types.SimpleNamespace()
def _read(h,a,n): return bytes(MEM[a:a+n])
dm.read=_read; dm.iter_regions=lambda h:[]; dm.HINT_NO_MEMBASE="x"
sys.modules["dosbox_mem"]=dm
di=types.ModuleType("dosbox_input"); di.register_input_tools=lambda mcp,S: types.SimpleNamespace()
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

def w16(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff
for off,addr in ((u6.U6_TerrainType_ptr,0x40000),(u6.U6_TileFlag_ptr,0x41000),
                 (u6.U6_TileFlag2_ptr,0x42000),(u6.U6_BaseTile_ptr,0x43000)):
    w16(off, addr&0xf); w16(off+2, addr>>4)
w16(u6.U6_AreaX,0); w16(u6.U6_AreaY,0)
MEM[u6.U6_ObjPos+3]=5; MEM[u6.U6_ObjPos+4]=(5<<2)&0xff  # avatar ~(5,5)

far_offs={u6.U6_TerrainType_ptr,u6.U6_TileFlag_ptr,u6.U6_TileFlag2_ptr,u6.U6_BaseTile_ptr}
hits={'n':0}
def counting(h,a,n):
    if n==4 and a in far_offs: hits['n']+=1
    return bytes(MEM[a:a+n])
dm.read=counting

ok=True
u6._build_grid(0)
print("after 1st build  -> cache keys:", sorted(u6.S.static_cache), "key:", u6.S.static_key)
ok &= sorted(u6.S.static_cache)==["basetile","terr","tflag1","tflag2"] and u6.S.static_key==0
print("far-ptr reads on 1st build:", hits['n'], "(expect 4)"); ok &= hits['n']==4
hits['n']=0; u6._build_grid(0)
print("far-ptr reads on 2nd build (cached):", hits['n'], "(expect 0)"); ok &= hits['n']==0
hits['n']=0; u6.S.static_key=999  # simulate segment change / re-hook
u6._build_grid(0)
print("far-ptr reads after invalidation:", hits['n'], "(expect 4)"); ok &= hits['n']==4
print("CACHE OK" if ok else "CACHE FAIL")
sys.exit(0 if ok else 1)
