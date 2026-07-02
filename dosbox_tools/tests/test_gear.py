"""Sub-step 1 (gear perception): _equip_slot oracle + u6_object enrichment +
u6_roster_status + u6_objects_near, against the REAL functions with stub memory."""
import sys, types, os
MEM = bytearray(0x60000)
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

ok=True
def chk(label, cond):
    global ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {label}")

# ---- 1. _equip_slot oracle (pure, source-order; 0x219 must be NECK not CHST) ----
W={0x300}
cases=[(0x21A,7),(0x21B,7),(0x258,9),(0x37D,9),(0x219,1),(0x250,1),(0x101,1),
       (0x200,0),(0x207,0),(0x210,4),(0x257,4),(0x228,8),(0x22B,8),(0x208,5),
       (0x222,5),(0x300,2),(0x500,-1),(0x000,-1)]
print("_equip_slot (STAT_GetEquipSlot port):")
for tile,exp in cases:
    chk(f"tile 0x{tile:x} -> {exp}", u6._equip_slot(tile, W)==exp)

# ---- 2. stub a small world for the tools ----
def w16(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff
def w24(a,v): MEM[a]=v&0xff; MEM[a+1]=(v>>8)&0xff; MEM[a+2]=(v>>16)&0xff
def pack(x,y,z): return x|(y<<10)|(z<<20)
def set_far(off,addr): w16(off,addr&0xf); w16(off+2,addr>>4)
def name(idx,s):
    b=s.encode("latin-1")[:13]
    for i in range(14): MEM[u6.U6_Names+idx*14+i]=b[i] if i<len(b) else 0

BASE,TW,LVL = 0x50000,0x52000,0x54000
set_far(u6.U6_BaseTile_ptr, BASE)
set_far(u6.U6_TypeWeight_ptr, TW)
set_far(u6.U6_Level_ptr, LVL)
# D_07DD: 33 ints directly in DGROUP at 0x07DD; include the sword tile 0x300
for i in range(33): w16(u6.U6_EquipWeaponTbl+i*2, 0)
w16(u6.U6_EquipWeaponTbl+0*2, 0x300)
# BaseTile[type] (int16): sword 0x050->0x300(RHND), helm 0x060->0x200(HEAD), food 0x070->0x010
w16(BASE+0x050*2, 0x300); w16(BASE+0x060*2, 0x200); w16(BASE+0x070*2, 0x010)
# TypeWeight[type] (byte): sword 30, helm 20, food 2
MEM[TW+0x050]=30; MEM[TW+0x060]=20; MEM[TW+0x070]=2
# Level[slot] (byte via far ptr)
MEM[LVL+1]=3; MEM[LVL+2]=5
# stats (direct byte arrays)
MEM[u6.U6_STREN+1]=20; MEM[u6.U6_DEXTE+1]=18; MEM[u6.U6_INTEL+1]=12
MEM[u6.U6_STREN+2]=15; MEM[u6.U6_DEXTE+2]=16; MEM[u6.U6_INTEL+2]=20
# party
MEM[u6.U6_Active]=0; MEM[u6.U6_PartySize]=2; MEM[u6.U6_SoloFlag]=0xff
MEM[u6.U6_Party+0]=1; MEM[u6.U6_Party+1]=2
name(0,"Avatar"); name(1,"Iolo")
# party members on the map
w24(u6.U6_ObjPos+1*3, pack(10,10,0)); MEM[u6.U6_ObjStatus+1]=0
w24(u6.U6_ObjPos+2*3, pack(12,12,0)); MEM[u6.U6_ObjStatus+2]=0
# items held by avatar (slot1): EQUIP sword @0x100, INVEN food x5 @0x101
def put(slot, typ, frame, status, assoc=None, x=None,y=None, quan=1):
    w16(u6.U6_ObjShapeType+slot*2, (typ&0x3ff)|(frame<<10))
    MEM[u6.U6_ObjStatus+slot]=status
    MEM[u6.U6_Amount+slot*2]=quan
    if assoc is not None: w16(u6.U6_ObjPos+slot*3, assoc)        # INVEN/EQUIP: assoc holder
    else: w24(u6.U6_ObjPos+slot*3, pack(x,y,0))                  # LOCXYZ
put(0x100, 0x050, 0, 0x18, assoc=1)            # sword, EQUIP -> readied[1]=30
put(0x101, 0x070, 0, 0x10, assoc=1, quan=5)    # food x5, INVEN -> carried[1]=10
put(0x102, 0x060, 0, 0x00, x=11, y=10)         # helm on map @(11,10), near avatar

# ---- 3. u6_object enrichment ----
print("u6_object gear metadata:")
o_sword=u6.u6_object(0x100); o_helm=u6.u6_object(0x102)
chk("sword: weight=30 ready->RHND", "weight=30" in o_sword and "ready->RHND" in o_sword)
chk("helm:  weight=20 ready->HEAD", "weight=20" in o_helm and "ready->HEAD" in o_helm)

# ---- 4. u6_roster_status ----
print("u6_roster_status:")
rs=u6.u6_roster_status()
chk("avatar STR20 line", "Avatar" in rs and " 20 " in rs and " 18 " in rs and " 12 " in rs)
chk("avatar carry 10/400", "10/400" in rs)
chk("avatar ready 30/200", "30/200" in rs)
chk("iolo  carry 0/300",  "0/300" in rs)
chk("iolo  ready 0/150",  "0/150" in rs)

# ---- 5. u6_objects_near ----
print("u6_objects_near:")
on=u6.u6_objects_near(radius=4)
chk("helm 0x102 listed as HEAD", "0x102" in on and "HEAD" in on)

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
